"""
MUSIC AO · Impressão digital de áudio
=====================================

Identifica que música está a tocar numa emissão de rádio, mesmo com o sinal
degradado: compressão da emissora, ruído, equalização, locutor por cima.

Como funciona
-------------
1. O áudio vira espetrograma (tempo × frequência).
2. Encontram-se os picos — os pontos onde há mais energia. Estes sobrevivem
   à compressão e ao ruído, porque são o que define o som.
3. Cada pico junta-se a outros picos à frente, formando pares.
   Cada par vira um número: (frequência A, frequência B, tempo entre eles).
4. Esse número é a impressão digital. Uma faixa de 3 minutos dá ~30 mil.

Para identificar, faz-se o mesmo a 10 segundos de rádio e vê-se que faixa
partilha muitos pares **com o mesmo desfasamento no tempo**. É esse alinhamento
que separa uma identificação verdadeira de coincidência.

Nunca se guarda áudio. Só números.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import struct
import subprocess
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy import ndimage

# ─────────────────────────────────────────────────────────────
# Parâmetros
# ─────────────────────────────────────────────────────────────

TAXA = 8000          # Hz. Chega para identificar; 8x mais barato que 44,1 kHz.
JANELA = 1024        # amostras por janela FFT (128 ms)
SALTO = 256          # avanço entre janelas (32 ms)

# Vizinhança para considerar um ponto "pico".
VIZ_TEMPO = 9
VIZ_FREQ = 9

# Proeminência: quanto o pico tem de sobressair do fundo local, em dB.
# É esta medida — e não a amplitude absoluta — que resiste ao compressor
# de dinâmica das emissoras, que achata os níveis mas mantém a forma.
FUNDO_TEMPO = 61         # janela do fundo local, em frames
FUNDO_FREQ = 41          # janela do fundo local, em bins
PROEMINENCIA_MIN = 4.0   # dB acima do fundo

# Densidade alvo, por banda de frequência. Distribuir os picos pelas bandas
# impede que uma emissão com graves reforçados gaste todos os picos em baixo.
BANDAS = [1, 12, 26, 52, 104, 200, 513]
PICOS_POR_SEGUNDO = 32

# Zona de emparelhamento: cada pico liga-se aos que vêm a seguir.
LEQUE = 12               # quantos pares por pico
DT_MIN, DT_MAX = 1, 90   # distância no tempo, em janelas (32 ms a 2,9 s)

# Decisão
#
# Não se usa "que fração dos pares bateu" — música é repetitiva, o mesmo
# padrão aparece em vários pontos da faixa e isso inflaciona o denominador.
# O que separa verdade de coincidência é o DESTAQUE: o pico do histograma
# de desfasamentos tem de estar muito acima de tudo o resto.
MIN_PARES = 12       # abaixo disto nunca é identificação
NITIDEZ_MIN = 32     # ver abaixo — o critério principal
TOLERANCIA = 1       # janelas de folga no alinhamento
#
# NITIDEZ = pico ÷ (média dos pares por desfasamento).
# Se a obra está mesmo a tocar, quase tudo cai num só desfasamento e a nitidez
# dispara. Se são colisões ao acaso, os pares espalham-se e a nitidez fica baixa.
# Medido: emissão verdadeira 56–86, faixa parecida mas errada 27.
#
# A margem é estreita para decidir com uma só janela. Por isso o monitor
# (monitor.py) só confirma uma passagem quando várias janelas seguidas
# concordam na mesma obra COM a posição a avançar. É essa segunda camada
# que torna o falso positivo praticamente impossível.


# ─────────────────────────────────────────────────────────────
# Descodificação
# ─────────────────────────────────────────────────────────────

def descodificar(caminho: str, segundos: float | None = None) -> np.ndarray:
    """Lê qualquer formato via ffmpeg e devolve mono float32 a 8 kHz."""
    cmd = ["ffmpeg", "-nostdin", "-v", "error"]
    if segundos:
        cmd += ["-t", str(segundos)]
    cmd += ["-i", caminho, "-ac", "1", "-ar", str(TAXA), "-f", "f32le", "-"]
    saida = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(saida, dtype=np.float32)


# ─────────────────────────────────────────────────────────────
# Espetrograma e picos
# ─────────────────────────────────────────────────────────────

def espetrograma(x: np.ndarray) -> np.ndarray:
    """Magnitude em dB. Eixos: [frequência, tempo]."""
    if len(x) < JANELA:
        x = np.pad(x, (0, JANELA - len(x)))
    n = 1 + (len(x) - JANELA) // SALTO
    janelas = np.lib.stride_tricks.as_strided(
        x, shape=(n, JANELA), strides=(x.strides[0] * SALTO, x.strides[0])
    )
    esp = np.abs(np.fft.rfft(janelas * np.hanning(JANELA), axis=1)).T
    return 20 * np.log10(esp + 1e-10)


def picos(S: np.ndarray) -> list[tuple[int, int]]:
    """
    Máximos locais do espetrograma. Devolve [(tempo, frequência), ...].

    Dois cuidados que fazem toda a diferença com sinal de rádio:

    1. Selecionar por PROEMINÊNCIA sobre o fundo local, não por amplitude.
       O compressor da emissora achata os níveis; um pico que sobressai
       continua a sobressair, mesmo que fique mais baixo em absoluto.

    2. Distribuir por BANDAS de frequência. Uma emissão com graves
       reforçados gastaria todos os picos na parte de baixo do espetro,
       e a impressão deixava de bater com a do original.
    """
    fundo = ndimage.uniform_filter(S, size=(FUNDO_FREQ, FUNDO_TEMPO))
    prom = S - fundo

    maxlocal = ndimage.maximum_filter(S, size=(VIZ_FREQ, VIZ_TEMPO))
    ehpico = (S == maxlocal) & (prom > PROEMINENCIA_MIN) & (S > S.max() - 80)

    duracao = S.shape[1] * SALTO / TAXA
    quota = max(12, int(duracao * PICOS_POR_SEGUNDO / (len(BANDAS) - 1)))

    tt, ff = [], []
    for i in range(len(BANDAS) - 1):
        lo, hi = BANDAS[i], BANDAS[i + 1]
        f, t = np.nonzero(ehpico[lo:hi])
        if len(f) == 0:
            continue
        f = f + lo
        if len(f) > quota:
            forca = prom[f, t]
            melhores = np.argpartition(forca, -quota)[-quota:]
            f, t = f[melhores], t[melhores]
        tt.append(t)
        ff.append(f)

    if not tt:
        return []
    t = np.concatenate(tt)
    f = np.concatenate(ff)
    ordem = np.argsort(t, kind="stable")
    return list(zip(t[ordem].tolist(), f[ordem].tolist()))


# ─────────────────────────────────────────────────────────────
# Pares → impressões digitais
# ─────────────────────────────────────────────────────────────

def impressoes(pontos: list[tuple[int, int]], variantes: bool = False):
    """
    Cada pico âncora liga-se aos seguintes. Devolve [(hash, tempo_ancora), ...].

    O hash junta as duas frequências e a distância temporal. Não depende do
    momento absoluto — por isso reconhece a faixa a partir de qualquer ponto.

    `variantes=True` emite também dt±1. Medimos que num sinal que passou pela
    cadeia de uma emissora os picos oscilam cerca de uma janela no tempo
    (32 ms), embora fiquem estáveis em frequência. Sem esta folga o par certo
    gerava um número diferente e perdia-se. Usa-se só na consulta: a base de
    dados guarda o valor exato e não cresce.
    """
    saida = []
    n = len(pontos)
    for i in range(n):
        t1, f1 = pontos[i]
        ligados = 0
        for j in range(i + 1, n):
            t2, f2 = pontos[j]
            dt = t2 - t1
            if dt < DT_MIN:
                continue
            if dt > DT_MAX:
                break
            base = ((f1 & 0x3FF) << 22) | ((f2 & 0x3FF) << 12)
            if variantes:
                for d in (dt - 1, dt, dt + 1):
                    if DT_MIN <= d <= DT_MAX:
                        saida.append((base | (d & 0xFFF), t1))
            else:
                saida.append((base | (dt & 0xFFF), t1))
            ligados += 1
            if ligados >= LEQUE:
                break
    return saida


def impressoes_de_ficheiro(caminho: str, segundos: float | None = None, variantes=False):
    return impressoes(picos(espetrograma(descodificar(caminho, segundos))), variantes)


def impressoes_de_amostras(x: np.ndarray, variantes: bool = False):
    return impressoes(picos(espetrograma(x)), variantes)


# ─────────────────────────────────────────────────────────────
# Base de dados
# ─────────────────────────────────────────────────────────────

ESQUEMA = """
CREATE TABLE IF NOT EXISTS obras (
  id        INTEGER PRIMARY KEY,
  titulo    TEXT NOT NULL,
  artista   TEXT NOT NULL,
  duracao   REAL,
  sha256    TEXT,
  n_marcas  INTEGER,
  criada    TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS marcas (
  h       INTEGER NOT NULL,
  obra_id INTEGER NOT NULL,
  t       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_marcas_h ON marcas(h);

CREATE TABLE IF NOT EXISTS deteccoes (
  id        INTEGER PRIMARY KEY,
  obra_id   INTEGER NOT NULL,
  estacao   TEXT NOT NULL,
  instante  TEXT NOT NULL,
  confianca REAL,
  pares     INTEGER,
  offset_s  REAL
);
CREATE INDEX IF NOT EXISTS idx_det ON deteccoes(estacao, instante);
"""


class Catalogo:
    """Guarda as impressões das obras e responde a consultas."""

    def __init__(self, caminho="catalogo.db"):
        self.db = sqlite3.connect(caminho)
        self.db.executescript(ESQUEMA)
        self.db.execute("PRAGMA journal_mode=WAL")

    # ── registo ──────────────────────────────────────────────
    # Algumas emissoras aceleram ou abrandam a música (para caber na grelha,
    # ou por hábito de formato). Uma variação de 1% desloca as frequências o
    # suficiente para a impressão deixar de bater — medimos 1,8% de pares em
    # comum a +1%. A solução é indexar a mesma obra a várias velocidades.
    # Custa espaço no índice, não custa tempo na consulta.
    VELOCIDADES = (0.98, 0.99, 1.0, 1.01, 1.02)

    def registar(self, caminho_audio: str, titulo: str, artista: str,
                 velocidades=None) -> int:
        x = descodificar(caminho_audio)
        marcas = impressoes_de_amostras(x)
        for v in (velocidades if velocidades is not None else self.VELOCIDADES):
            if abs(v - 1.0) < 1e-9:
                continue
            marcas += self._marcas_a_velocidade(x, v)
        sha = hashlib.sha256(Path(caminho_audio).read_bytes()).hexdigest()

        cur = self.db.execute(
            "INSERT INTO obras (titulo, artista, duracao, sha256, n_marcas) VALUES (?,?,?,?,?)",
            (titulo, artista, len(x) / TAXA, sha, len(marcas)),
        )
        obra_id = cur.lastrowid
        self.db.executemany(
            "INSERT INTO marcas (h, obra_id, t) VALUES (?,?,?)",
            ((h, obra_id, t) for h, t in marcas),
        )
        self.db.commit()
        return obra_id

    @staticmethod
    def _marcas_a_velocidade(x: np.ndarray, v: float):
        """
        Reamostra o sinal e volta a marcar. Reamostrar por v é o mesmo que
        tocar a v vezes a velocidade: as frequências sobem e o tempo encolhe.
        Os tempos são reconvertidos para a escala original, para que o
        desfasamento devolvido continue a apontar o segundo certo da faixa.
        """
        n = int(len(x) / v)
        idx = np.arange(n) * v
        base = idx.astype(np.int64)
        base = np.clip(base, 0, len(x) - 2)
        frac = (idx - base).astype(np.float32)
        y = (x[base] * (1 - frac) + x[base + 1] * frac).astype(np.float32)
        return [(h, int(round(t * v))) for h, t in impressoes_de_amostras(y)]

    # ── identificação ────────────────────────────────────────
    def identificar(self, x: np.ndarray):
        """
        Devolve o melhor candidato ou None.

        Para cada obra constrói-se o histograma dos desfasamentos. Se a obra
        está mesmo a tocar, quase todos os pares caem no mesmo desfasamento e
        o histograma tem um pico agudo. Se é coincidência, os pares espalham-se.
        A decisão compara o pico com o melhor concorrente — dentro da mesma
        obra e nas outras.
        """
        consulta = impressoes_de_amostras(x, variantes=True)
        if not consulta:
            return None

        porhash = defaultdict(list)
        for h, t in consulta:
            porhash[h].append(t)

        lista = list(porhash.keys())
        hist = defaultdict(lambda: defaultdict(int))   # obra -> desfasamento -> pares

        for i in range(0, len(lista), 900):
            bloco = lista[i:i + 900]
            marcas = ",".join("?" * len(bloco))
            for h, obra_id, t_db in self.db.execute(
                f"SELECT h, obra_id, t FROM marcas WHERE h IN ({marcas})", bloco
            ):
                col = hist[obra_id]
                for t_q in porhash[h]:
                    col[t_db - t_q] += 1

        if not hist:
            return None

        # Somar desfasamentos vizinhos: uma rádio que acelera 1% desloca o
        # alinhamento aos poucos e o pico ficaria repartido entre bins.
        candidatos = []
        for obra_id, col in hist.items():
            suave = {}
            for d in col:
                suave[d] = sum(col.get(d + k, 0) for k in range(-TOLERANCIA, TOLERANCIA + 1))
            melhor_d = max(suave, key=suave.get)
            pico = suave[melhor_d]
            total = sum(col.values())
            esperado = total / max(1, len(col))
            nitidez = pico / max(esperado, 1e-9)
            candidatos.append((nitidez, pico, obra_id, melhor_d))

        candidatos.sort(reverse=True)
        nitidez, pico, obra_id, desf = candidatos[0]
        rival_nitidez = candidatos[1][0] if len(candidatos) > 1 else 0.0

        if pico < MIN_PARES or nitidez < NITIDEZ_MIN:
            return None

        titulo, artista = self.db.execute(
            "SELECT titulo, artista FROM obras WHERE id=?", (obra_id,)
        ).fetchone()

        return {
            "obra_id": obra_id,
            "titulo": titulo,
            "artista": artista,
            "pares": pico,
            "nitidez": round(nitidez, 1),
            "margem": round(nitidez / max(rival_nitidez, 1e-9), 1),
            # onde dentro da faixa estava a emissão, em segundos
            "posicao_s": round(desf * SALTO / TAXA, 1),
            "confianca": round(min(1.0, nitidez / 90) * min(1.0, pico / 120), 3),
        }

    def identificar_ficheiro(self, caminho: str, segundos: float | None = None):
        return self.identificar(descodificar(caminho, segundos))

    # ── deteções ─────────────────────────────────────────────
    def registar_deteccao(self, obra_id, estacao, instante, confianca, pares, offset_s):
        self.db.execute(
            "INSERT INTO deteccoes (obra_id, estacao, instante, confianca, pares, offset_s)"
            " VALUES (?,?,?,?,?,?)",
            (obra_id, estacao, instante, confianca, pares, offset_s),
        )
        self.db.commit()

    def estatisticas(self):
        o = self.db.execute("SELECT COUNT(*), SUM(n_marcas) FROM obras").fetchone()
        d = self.db.execute("SELECT COUNT(*) FROM deteccoes").fetchone()[0]
        return {"obras": o[0] or 0, "marcas": o[1] or 0, "deteccoes": d}
