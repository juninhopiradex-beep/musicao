"""
MUSIC AO · Monitor de emissões
==============================

Liga-se ao stream de uma rádio, escuta em janelas, e regista que músicas
do catálogo passaram — a que horas, e durante quanto tempo.

Duas camadas de decisão
-----------------------
1. Por janela: a impressão digital devolve um candidato (fingerprint.py).
2. **Confirmação temporal**: só se aceita uma passagem quando várias janelas
   seguidas apontam a mesma obra COM a posição a avançar no tempo certo.

A segunda camada é a que torna o falso positivo improvável. Uma coincidência
acerta numa janela; não acerta em três seguidas com a posição a avançar
exatamente 5 segundos de cada vez.

Nunca se guarda áudio. Os bytes são descodificados, viram números, e são
descartados.
"""

from __future__ import annotations

import json
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import numpy as np

import fingerprint as fp

# ─────────────────────────────────────────────────────────────
# Parâmetros de escuta
# ─────────────────────────────────────────────────────────────

JANELA_S = 10.0        # duração de cada análise
PASSO_S = 5.0          # de quanto em quanto tempo se analisa
CONFIRMACOES = 3       # janelas seguidas necessárias para aceitar
DERIVA_MAX_S = 2.5     # folga na posição esperada entre janelas
FALHAS_ATE_FECHAR = 3  # janelas sem a obra antes de dar a passagem por terminada
MIN_DURACAO_S = 20.0   # passagens mais curtas do que isto não se registam


@dataclass
class Passagem:
    """Uma música a tocar agora, ainda por confirmar ou já confirmada."""
    obra_id: int
    titulo: str
    artista: str
    inicio: datetime
    posicao_inicial: float
    ultima: datetime
    ultima_posicao: float
    janelas: int = 1
    falhas: int = 0
    confianca_max: float = 0.0
    confirmada: bool = False
    amostras: list = field(default_factory=list)

    @property
    def duracao_s(self):
        return (self.ultima - self.inicio).total_seconds() + JANELA_S


class Monitor:
    def __init__(self, catalogo: fp.Catalogo, estacao: str, ao_confirmar=None, ao_terminar=None):
        self.cat = catalogo
        self.estacao = estacao
        self.atual: Passagem | None = None
        self.ao_confirmar = ao_confirmar or (lambda p: None)
        self.ao_terminar = ao_terminar or (lambda p: None)
        self.janelas_vistas = 0
        self.passagens = []

    # ── lógica de confirmação ────────────────────────────────
    def processar(self, x: np.ndarray, instante: datetime | None = None):
        instante = instante or datetime.now(timezone.utc)
        self.janelas_vistas += 1
        r = self.cat.identificar(x)

        if r is None:
            self._sem_correspondencia()
            return None

        p = self.atual
        if p and p.obra_id == r["obra_id"]:
            # a posição tem de ter avançado o tempo que passou entre janelas
            decorrido = (instante - p.ultima).total_seconds()
            avanco = r["posicao_s"] - p.ultima_posicao
            if abs(avanco - decorrido) <= DERIVA_MAX_S:
                p.ultima = instante
                p.ultima_posicao = r["posicao_s"]
                p.janelas += 1
                p.falhas = 0
                p.confianca_max = max(p.confianca_max, r["confianca"])
                p.amostras.append(r["nitidez"])
                if not p.confirmada and p.janelas >= CONFIRMACOES:
                    p.confirmada = True
                    self.ao_confirmar(p)
                return r
            # mesma obra mas posição incoerente: provável coincidência
            self._sem_correspondencia()
            return None

        # obra diferente da que estava a tocar
        if p:
            self._fechar(p)
        self.atual = Passagem(
            obra_id=r["obra_id"], titulo=r["titulo"], artista=r["artista"],
            inicio=instante, posicao_inicial=r["posicao_s"],
            ultima=instante, ultima_posicao=r["posicao_s"],
            confianca_max=r["confianca"], amostras=[r["nitidez"]],
        )
        return r

    def _sem_correspondencia(self):
        p = self.atual
        if not p:
            return
        p.falhas += 1
        if p.falhas >= FALHAS_ATE_FECHAR:
            self._fechar(p)
            self.atual = None

    def _fechar(self, p: Passagem):
        if not p.confirmada or p.duracao_s < MIN_DURACAO_S:
            return
        self.passagens.append(p)
        self.cat.registar_deteccao(
            p.obra_id, self.estacao, p.inicio.isoformat(),
            p.confianca_max, len(p.amostras), p.posicao_inicial,
        )
        self.ao_terminar(p)

    def terminar(self):
        if self.atual:
            self._fechar(self.atual)
            self.atual = None


# ─────────────────────────────────────────────────────────────
# Ligação a um stream
# ─────────────────────────────────────────────────────────────

def escutar(url: str, callback, parar: threading.Event | None = None,
            janela_s=JANELA_S, passo_s=PASSO_S, timeout_s=15):
    """
    Liga ao stream e chama `callback(amostras, instante)` a cada passo.

    O ffmpeg faz a ligação e a descodificação. Se o stream cair, esta função
    devolve o controlo — quem chama decide se volta a tentar.
    """
    cmd = [
        "ffmpeg", "-nostdin", "-v", "error",
        "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
        "-rw_timeout", str(timeout_s * 1_000_000),
        "-user_agent", "MusicAO-Monitor/1.0",
        "-i", url,
        "-ac", "1", "-ar", str(fp.TAXA), "-f", "f32le", "-",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    n_janela = int(janela_s * fp.TAXA)
    n_passo = int(passo_s * fp.TAXA)
    tampao = np.zeros(0, dtype=np.float32)

    try:
        while True:
            if parar is not None and parar.is_set():
                break
            bruto = proc.stdout.read(n_passo * 4)
            if not bruto:
                break
            tampao = np.concatenate([tampao, np.frombuffer(bruto, dtype=np.float32)])
            if len(tampao) >= n_janela:
                callback(tampao[-n_janela:].copy(), datetime.now(timezone.utc))
                tampao = tampao[-(n_janela - n_passo):]
    finally:
        proc.kill()
        proc.wait()


def escutar_ficheiro(caminho: str, callback, janela_s=JANELA_S, passo_s=PASSO_S,
                     inicio: datetime | None = None):
    """Igual, mas a partir de um ficheiro. Serve para testar sem rede."""
    x = fp.descodificar(caminho)
    n_janela = int(janela_s * fp.TAXA)
    n_passo = int(passo_s * fp.TAXA)
    t0 = inicio or datetime.now(timezone.utc)
    i = 0
    while i + n_janela <= len(x):
        instante = t0.fromtimestamp(t0.timestamp() + i / fp.TAXA, tz=timezone.utc)
        callback(x[i:i + n_janela], instante)
        i += n_passo


# ─────────────────────────────────────────────────────────────
# Várias estações ao mesmo tempo
# ─────────────────────────────────────────────────────────────

def vigiar(estacoes: dict, caminho_db="catalogo.db", verboso=True):
    """
    `estacoes` é {nome: url}. Cada uma corre na sua thread, com a sua ligação
    ffmpeg e a sua ligação à base de dados (o SQLite não gosta de partilhar
    ligações entre threads).
    """
    parar = threading.Event()

    def _linha(estacao, texto):
        if verboso:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] {estacao:24s} {texto}", flush=True)

    def _uma(nome, url):
        cat = fp.Catalogo(caminho_db)
        mon = Monitor(
            cat, nome,
            ao_confirmar=lambda p: _linha(nome, f"▶ {p.titulo} — {p.artista}"),
            ao_terminar=lambda p: _linha(nome, f"■ {p.titulo} ({p.duracao_s:.0f}s)"),
        )
        while not parar.is_set():
            try:
                _linha(nome, "a ligar…")
                escutar(url, mon.processar, parar)
            except Exception as e:
                _linha(nome, f"erro: {e}")
            if not parar.is_set():
                _linha(nome, "ligação caiu, nova tentativa em 20s")
                parar.wait(20)
        mon.terminar()

    threads = []
    for nome, url in estacoes.items():
        t = threading.Thread(target=_uma, args=(nome, url), daemon=True)
        t.start()
        threads.append(t)

    def _adeus(*_):
        print("\na terminar…", flush=True)
        parar.set()

    signal.signal(signal.SIGINT, _adeus)
    try:
        while not parar.is_set():
            time.sleep(1)
    except KeyboardInterrupt:
        _adeus()
    for t in threads:
        t.join(timeout=10)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("uso: python3 monitor.py estacoes.json")
        sys.exit(1)
    with open(sys.argv[1]) as f:
        cfg = json.load(f)
    vigiar({e["nome"]: e["url"] for e in cfg["estacoes"] if e.get("ativa", True)})
