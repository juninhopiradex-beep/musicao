"""
VMUSICAO · Provedores e seleção
===============================

Duas coisas:

1. `Provedor` — a interface que qualquer motor de geração tem de cumprir.
   A aplicação nunca fala a sintaxe de um motor concreto; fala esta.

2. `melhores_de` — gera N candidatos, mede-os com o QC, ordena, devolve os
   dois melhores. É a peça que mais melhora a qualidade percebida sem trocar
   de modelo: não é gerar melhor, é escolher melhor.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
import time
from dataclasses import dataclass, field, asdict

from . import qc
from .blueprint import Blueprint, para_acestep, para_generico


# ─────────────────────────────────────────────────────────────
# Resultado universal
# ─────────────────────────────────────────────────────────────

@dataclass
class Resultado:
    caminho: str
    motor: str
    modelo: str
    seed: int | None = None
    segundos_gpu: float = 0.0
    relatorio: dict = field(default_factory=dict)
    pontuacao: int = 0
    passou_barreira: bool | None = None
    erro: str | None = None

    def json(self):
        return json.dumps(asdict(self), ensure_ascii=False, indent=1)


# ─────────────────────────────────────────────────────────────
# Interface
# ─────────────────────────────────────────────────────────────

class Provedor:
    """
    Contrato mínimo. Um motor novo só tem de implementar `gerar` e
    declarar o que sabe fazer em `capacidades`.
    """
    nome = 'abstracto'
    modelo = ''

    def capacidades(self) -> dict:
        return {
            'texto_para_musica': False, 'letra': False, 'vozes': False,
            'instrumental': False, 'audio_referencia': False, 'cover': False,
            'continuacao': False, 'repaint': False, 'stems_nativos': False,
            'controlo_bpm': False, 'controlo_tom': False, 'duracao_max_s': None,
            'licenca': None, 'comercial': None, 'licenca_verificada': False,
        }

    def gerar(self, b: Blueprint, saida: str) -> Resultado:
        raise NotImplementedError

    def suporta(self, b: Blueprint) -> tuple[bool, str]:
        c = self.capacidades()
        if b.voz != 'instrumental' and not c['vozes']:
            return False, f'{self.nome} não gera vozes'
        if c['duracao_max_s'] and b.duracao_s > c['duracao_max_s']:
            return False, f'{self.nome} vai até {c["duracao_max_s"]}s, pediste {b.duracao_s}s'
        if c['comercial'] is False:
            return False, f'{self.nome} não permite uso comercial'
        return True, ''


# ─────────────────────────────────────────────────────────────
# ACE-Step
# ─────────────────────────────────────────────────────────────

class AceStep(Provedor):
    """
    Motor local. Chama o CLI do ACE-Step instalado na máquina.

    NÃO TESTADO CONTRA O MOTOR REAL: foi escrito a partir da documentação
    pública, não com uma GPU à frente. Espera-se afinação na primeira
    utilização — sobretudo nos nomes dos parâmetros do CLI.

    Licença: o repositório e o espaço no HuggingFace indicam MIT, e os
    cartões dos modelos afirmam que o áudio gerado pode ser usado
    comercialmente. `licenca_verificada` fica a False até alguém confirmar
    na página oficial. Não faturar antes disso.
    """
    nome = 'acestep'

    VARIANTES = {
        'rapido':  ('acestep-v15-xl-turbo', 8),
        'padrao':  ('acestep-v15-xl-base', 30),
        'estudio': ('acestep-v15-xl-sft', 60),
    }

    def __init__(self, qualidade='padrao', binario='acestep', checkpoints=None):
        self.qualidade = qualidade
        self.modelo, self.passos = self.VARIANTES[qualidade]
        self.binario = binario
        self.checkpoints = checkpoints or os.environ.get('ACESTEP_CHECKPOINTS', './checkpoints')

    def capacidades(self):
        c = super().capacidades()
        c.update({
            'texto_para_musica': True, 'letra': True, 'vozes': True,
            'instrumental': True, 'audio_referencia': True, 'cover': True,
            'continuacao': True, 'repaint': True, 'stems_nativos': True,
            'controlo_bpm': True, 'controlo_tom': True, 'duracao_max_s': 600,
            'licenca': 'MIT (a confirmar)', 'comercial': True,
            'licenca_verificada': False,
        })
        return c

    def gerar(self, b: Blueprint, saida: str) -> Resultado:
        p = para_acestep(b)
        cmd = [
            self.binario,
            '--config-path', os.path.join(self.checkpoints, self.modelo),
            '--prompt', p['prompt'],
            '--audio-duration', str(p['audio_duration']),
            '--infer-step', str(self.passos),
            '--output', saida,
        ]
        if p['lyrics']:
            cmd += ['--lyrics', p['lyrics']]
        if p['vocal_language']:
            cmd += ['--vocal-language', p['vocal_language']]
        if p['negative_prompt']:
            cmd += ['--negative-prompt', p['negative_prompt']]
        if b.seed is not None:
            cmd += ['--manual-seeds', str(b.seed)]

        t0 = time.time()
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=900)
            if r.returncode != 0 or not os.path.exists(saida):
                return Resultado(saida, self.nome, self.modelo, b.seed,
                                 round(time.time() - t0, 2),
                                 erro=(r.stderr or b'').decode()[-400:] or 'sem ficheiro à saída')
        except FileNotFoundError:
            return Resultado(saida, self.nome, self.modelo, b.seed, 0.0,
                             erro=f'binário "{self.binario}" não encontrado — o ACE-Step está instalado?')
        except subprocess.TimeoutExpired:
            return Resultado(saida, self.nome, self.modelo, b.seed, 900.0, erro='tempo esgotado')

        return Resultado(saida, self.nome, self.modelo, b.seed, round(time.time() - t0, 2))


class Simulado(Provedor):
    """
    Motor falso, para desenvolver e testar toda a cadeia sem GPU.
    Produz áudio com defeitos controlados, para exercitar o QC e o ranking.
    """
    nome = 'simulado'
    modelo = 'sintetico'

    def capacidades(self):
        c = super().capacidades()
        c.update({'texto_para_musica': True, 'vozes': True, 'instrumental': True,
                  'controlo_bpm': True, 'duracao_max_s': 600,
                  'licenca': 'n/a', 'comercial': True, 'licenca_verificada': True})
        return c

    def gerar(self, b: Blueprint, saida: str) -> Resultado:
        import wave
        import numpy as np
        fs = 48000
        rng = np.random.RandomState(b.seed if b.seed is not None else 0)
        n = int(min(b.duracao_s, 30) * fs)
        t = np.arange(n) / fs
        raiz = 220 * 2 ** (rng.randint(-5, 5) / 12)
        x = np.zeros(n)
        for k, iv in enumerate([0, 3, 7, 10]):
            x += np.sin(2 * np.pi * raiz * 2 ** (iv / 12) * t + rng.rand()) * 0.16 / (k + 1)
        x += np.sin(2 * np.pi * (raiz / 4) * t) * 0.3
        per = int(60 / b.bpm * fs)
        for i in range(0, n - per, per):
            d = np.arange(min(per, n - i)) / fs
            x[i:i + len(d)] += np.sin(2 * np.pi * (110 * np.exp(-d * 30) + 45) * d) * np.exp(-d * 14) * 0.5
        x /= np.abs(x).max() * 1.25
        y = np.column_stack([x, np.roll(x, 90) * 0.97])

        # defeitos ocasionais, para o QC ter o que apanhar
        modo = (b.seed or 0) % 4
        if modo == 1:
            y = np.clip(y * 3.2, -1, 1)
        elif modo == 2:
            y[:int(5 * fs)] = 0
        elif modo == 3:
            y = y + 0.05

        with wave.open(saida, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(fs)
            w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
        return Resultado(saida, self.nome, self.modelo, b.seed, 0.4)


# ─────────────────────────────────────────────────────────────
# Best-of-N
# ─────────────────────────────────────────────────────────────

def melhores_de(provedor: Provedor, b: Blueprint, n=4, devolver=2,
                pasta=None, minimo=45, ao_progresso=None):
    """
    Gera n candidatos, mede-os, e devolve os `devolver` melhores.

    O `minimo` é a barreira de qualidade: candidatos abaixo disso não são
    mostrados ao utilizador se houver alternativa. Se TODOS ficarem abaixo,
    devolve-se na mesma o melhor — mas com o aviso no relatório, porque
    esconder tudo e não mostrar nada é pior.
    """
    pode, porque = provedor.suporta(b)
    if not pode:
        raise ValueError(porque)

    pasta = pasta or tempfile.mkdtemp(prefix='vmusicao_')
    os.makedirs(pasta, exist_ok=True)
    base = b.seed if b.seed is not None else int(hashlib.sha256(
        b.json().encode()).hexdigest()[:8], 16) % 100000

    candidatos = []
    for i in range(n):
        cb = Blueprint(**{**asdict(b), 'seed': base + i})
        destino = os.path.join(pasta, f'cand_{i:02d}.wav')
        if ao_progresso:
            ao_progresso(i, n)
        r = provedor.gerar(cb, destino)
        if r.erro:
            candidatos.append(r)
            continue
        try:
            rel = qc.analisar(r.caminho)
            r.relatorio = rel.dicionario()
            r.pontuacao = rel.pontuacao['total']
        except Exception as e:
            r.erro = f'análise falhou: {e}'
        candidatos.append(r)

    validos = [c for c in candidatos if not c.erro]
    validos.sort(key=lambda c: -c.pontuacao)
    acima = [c for c in validos if c.pontuacao >= minimo]

    # Preferem-se os que passaram a barreira, mas completa-se sempre até
    # `devolver`. Mostrar uma única versão quando o utilizador espera duas
    # é pior do que mostrar a segunda com a nota de que ficou abaixo.
    escolhidos = list(acima[:devolver])
    if len(escolhidos) < devolver:
        for c in validos:
            if c not in escolhidos:
                escolhidos.append(c)
            if len(escolhidos) == devolver:
                break
    for c in escolhidos:
        c.passou_barreira = c.pontuacao >= minimo

    return {
        'escolhidos': escolhidos,
        'todos': candidatos,
        'gerados': len(candidatos),
        'validos': len(validos),
        'acima_do_minimo': len(acima),
        'abaixo_do_minimo': len(validos) - len(acima),
        'segundos_gpu': round(sum(c.segundos_gpu for c in candidatos), 2),
        'aviso': (None if len(acima) >= devolver else
                  'nenhum candidato passou a barreira de qualidade' if not acima else
                  f'só {len(acima)} de {len(validos)} passaram a barreira'),
    }
