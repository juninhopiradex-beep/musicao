"""
VMUSICAO · Controlo de qualidade
================================

Mede um ficheiro gerado e diz se presta. É a peça que o documento identifica
como a origem de grande parte da qualidade percebida — não é o modelo, é
escolher bem entre o que ele produz.

Não precisa de GPU. Corre em CPU, em milissegundos.

Mede:
  · silêncio, clipping, NaN, offset DC
  · LUFS integrado (ITU-R BS.1770-4) e true peak
  · gama dinâmica, factor de crista
  · correlação de fase e equilíbrio estéreo
  · anomalias espectrais e energia excessiva nos agudos
  · estabilidade do andamento
"""

from __future__ import annotations

import subprocess
from dataclasses import dataclass, asdict, field

import numpy as np
from scipy import signal


# ─────────────────────────────────────────────────────────────
# Leitura
# ─────────────────────────────────────────────────────────────

def ler(caminho: str, taxa=48000) -> tuple[np.ndarray, int]:
    """Devolve (amostras [n, canais], taxa). Estéreo preservado."""
    p = subprocess.run(
        ['ffmpeg', '-nostdin', '-v', 'error', '-i', caminho,
         '-ac', '2', '-ar', str(taxa), '-f', 'f32le', '-'],
        capture_output=True, check=True)
    x = np.frombuffer(p.stdout, dtype=np.float32)
    return x.reshape(-1, 2), taxa


# ─────────────────────────────────────────────────────────────
# Sonoridade — BS.1770-4
# ─────────────────────────────────────────────────────────────

def _filtros_k(fs):
    """Pré-filtro de cabeça + filtro RLB, como a norma manda."""
    # Estágio 1: shelf de agudos
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = np.tan(np.pi * f0 / fs)
    Vh = 10 ** (G / 20.0); Vb = Vh ** 0.4996667741545416
    a0 = 1.0 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2.0 * (K * K - Vh) / a0,
          (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1.0, 2.0 * (K * K - 1.0) / a0, (1.0 - K / Q + K * K) / a0]
    # Estágio 2: passa-alto RLB
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = np.tan(np.pi * f0 / fs)
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, 2.0 * (K * K - 1.0) / (1.0 + K / Q + K * K),
          (1.0 - K / Q + K * K) / (1.0 + K / Q + K * K)]
    return (b1, a1), (b2, a2)


def lufs_integrado(x: np.ndarray, fs: int) -> float:
    """LUFS-I com as duas portas da norma (absoluta a −70, relativa a −10)."""
    (b1, a1), (b2, a2) = _filtros_k(fs)
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)

    bloco = int(0.400 * fs)
    passo = int(0.100 * fs)          # 75% de sobreposição
    if len(y) < bloco:
        return -70.0
    n = 1 + (len(y) - bloco) // passo
    pot = np.empty(n)
    for i in range(n):
        seg = y[i * passo:i * passo + bloco]
        pot[i] = np.mean(seg ** 2, axis=0).sum()

    with np.errstate(divide='ignore'):
        z = -0.691 + 10 * np.log10(pot + 1e-12)

    absolutos = pot[z > -70.0]
    if not len(absolutos):
        return -70.0
    limiar = -0.691 + 10 * np.log10(absolutos.mean() + 1e-12) - 10.0
    finais = pot[z > limiar]
    if not len(finais):
        return -70.0
    return float(-0.691 + 10 * np.log10(finais.mean() + 1e-12))


def true_peak_db(x: np.ndarray, fs: int) -> float:
    """
    Pico verdadeiro por sobreamostragem 4×. O pico de amostra engana:
    entre duas amostras o sinal reconstruído pode ultrapassar 0 dBFS.
    """
    up = signal.resample_poly(x, 4, 1, axis=0)
    pico = float(np.max(np.abs(up))) if len(up) else 0.0
    return 20 * np.log10(pico + 1e-12)


# ─────────────────────────────────────────────────────────────
# Relatório
# ─────────────────────────────────────────────────────────────

@dataclass
class Relatorio:
    duracao_s: float = 0.0
    lufs_i: float = 0.0
    true_peak_db: float = 0.0
    pico_amostra_db: float = 0.0
    lra_lu: float = 0.0
    crista_db: float = 0.0
    correlacao: float = 0.0
    equilibrio_db: float = 0.0
    offset_dc: float = 0.0
    amostras_clipadas: int = 0
    silencio_inicio_s: float = 0.0
    silencio_fim_s: float = 0.0
    silencio_total_pct: float = 0.0
    tem_nan: bool = False
    energia_agudos_pct: float = 0.0
    bpm_estimado: float = 0.0
    bpm_estabilidade: float = 0.0
    problemas: list = field(default_factory=list)
    pontuacao: dict = field(default_factory=dict)

    def dicionario(self):
        """
        Converte para tipos nativos do Python. O numpy devolve float32 e
        int64, que o módulo json não sabe serializar — e o erro só aparece
        no fim, quando se tenta guardar. Melhor limpar aqui, na origem.
        """
        def limpar(v):
            if isinstance(v, (np.floating,)):
                return float(v)
            if isinstance(v, (np.integer,)):
                return int(v)
            if isinstance(v, (np.bool_,)):
                return bool(v)
            if isinstance(v, dict):
                return {k: limpar(x) for k, x in v.items()}
            if isinstance(v, (list, tuple)):
                return [limpar(x) for x in v]
            return v
        return limpar(asdict(self))

    def json(self):
        import json
        return json.dumps(self.dicionario(), ensure_ascii=False, indent=1)


def analisar(caminho: str = None, x: np.ndarray = None, fs: int = 48000) -> Relatorio:
    if x is None:
        x, fs = ler(caminho)
    if x.ndim == 1:
        x = np.column_stack([x, x])

    r = Relatorio()
    r.duracao_s = round(len(x) / fs, 2)

    # NaN / infinitos: se existirem, nada mais faz sentido
    if not np.all(np.isfinite(x)):
        r.tem_nan = True
        r.problemas.append('ficheiro contém NaN ou infinitos — inutilizável')
        x = np.nan_to_num(x)

    mono = x.mean(axis=1)

    # sonoridade
    r.lufs_i = round(lufs_integrado(x, fs), 2)
    r.true_peak_db = round(true_peak_db(x, fs), 2)
    r.pico_amostra_db = round(20 * np.log10(np.max(np.abs(x)) + 1e-12), 2)

    # clipping
    r.amostras_clipadas = int(np.sum(np.abs(x) >= 0.999))

    # offset DC
    r.offset_dc = round(float(np.mean(mono)), 5)

    # gama dinâmica (LRA aproximada) e factor de crista
    bloco = int(3.0 * fs)
    if len(mono) > bloco:
        blocos = [mono[i:i + bloco] for i in range(0, len(mono) - bloco, bloco // 2)]
        nivel = np.array([20 * np.log10(np.sqrt(np.mean(b ** 2)) + 1e-12) for b in blocos])
        nivel = nivel[nivel > nivel.max() - 40]
        if len(nivel) > 2:
            r.lra_lu = round(float(np.percentile(nivel, 95) - np.percentile(nivel, 10)), 2)
    rms = np.sqrt(np.mean(mono ** 2))
    r.crista_db = round(float(20 * np.log10((np.max(np.abs(mono)) + 1e-12) / (rms + 1e-12))), 2)

    # estéreo
    e, d = x[:, 0], x[:, 1]
    if np.std(e) > 1e-9 and np.std(d) > 1e-9:
        r.correlacao = round(float(np.corrcoef(e, d)[0, 1]), 3)
    else:
        r.correlacao = 1.0
    re_, rd = np.sqrt(np.mean(e ** 2)), np.sqrt(np.mean(d ** 2))
    r.equilibrio_db = round(float(20 * np.log10((re_ + 1e-12) / (rd + 1e-12))), 2)

    # silêncio
    env = np.abs(signal.lfilter([1], [1, -0.995], np.abs(mono)))
    mudo = env < (np.max(env) * 0.001 + 1e-9)
    r.silencio_total_pct = round(float(mudo.mean() * 100), 1)
    i = int(np.argmax(~mudo)) if (~mudo).any() else len(mudo)
    j = int(np.argmax(~mudo[::-1])) if (~mudo).any() else len(mudo)
    r.silencio_inicio_s = round(i / fs, 2)
    r.silencio_fim_s = round(j / fs, 2)

    # espectro
    f, P = signal.welch(mono, fs, nperseg=min(8192, len(mono)))
    total = P.sum() + 1e-20
    r.energia_agudos_pct = round(float(P[f > 10000].sum() / total * 100), 2)

    # andamento
    r.bpm_estimado, r.bpm_estabilidade = _andamento(mono, fs)

    _diagnosticar(r)
    r.pontuacao = _pontuar(r)
    return r


def _andamento(mono, fs):
    """BPM por autocorrelação da envolvente de energia."""
    salto = 512
    n = len(mono) // salto
    if n < 40:
        return 0.0, 0.0
    env = np.array([np.sqrt(np.mean(mono[i * salto:(i + 1) * salto] ** 2)) for i in range(n)])
    env = np.diff(env, prepend=env[0]).clip(min=0)
    env -= env.mean()
    ac = np.correlate(env, env, 'full')[len(env) - 1:]
    fps = fs / salto
    lo, hi = int(fps * 60 / 200), int(fps * 60 / 60)
    hi = min(hi, len(ac) - 1)
    if hi <= lo:
        return 0.0, 0.0
    k = lo + int(np.argmax(ac[lo:hi]))
    bpm = 60 * fps / k
    while bpm < 70:
        bpm *= 2
    while bpm > 180:
        bpm /= 2
    # estabilidade: o andamento é o mesmo na 1.ª e na 2.ª metade?
    meio = len(env) // 2
    def pico(seg):
        a = np.correlate(seg, seg, 'full')[len(seg) - 1:]
        h = min(hi, len(a) - 1)
        return lo + int(np.argmax(a[lo:h])) if h > lo else 0
    k1, k2 = pico(env[:meio]), pico(env[meio:])
    est = 1.0 - min(1.0, abs(k1 - k2) / max(k1, k2, 1))
    return round(float(bpm), 1), round(float(est), 3)


def _diagnosticar(r: Relatorio):
    if r.amostras_clipadas > 50:
        r.problemas.append(f'{r.amostras_clipadas} amostras clipadas')
    if r.true_peak_db > -0.1:
        r.problemas.append(f'true peak a {r.true_peak_db} dBTP — vai distorcer ao codificar')
    if r.silencio_total_pct > 25:
        r.problemas.append(f'{r.silencio_total_pct}% do ficheiro é silêncio')
    if r.silencio_inicio_s > 3:
        r.problemas.append(f'{r.silencio_inicio_s}s de silêncio no início')
    if abs(r.offset_dc) > 0.01:
        r.problemas.append(f'offset DC de {r.offset_dc}')
    if r.correlacao < -0.2:
        r.problemas.append(f'correlação {r.correlacao} — colapsa em mono')
    if abs(r.equilibrio_db) > 3:
        r.problemas.append(f'canais desequilibrados em {r.equilibrio_db} dB')
    if r.energia_agudos_pct > 22:
        r.problemas.append('energia excessiva acima de 10 kHz — sinal de artefacto')
    if r.crista_db < 5:
        r.problemas.append(f'factor de crista {r.crista_db} dB — esmagado')
    if r.bpm_estabilidade and r.bpm_estabilidade < 0.7:
        r.problemas.append('andamento instável ao longo da faixa')
    if r.duracao_s < 10:
        r.problemas.append('demasiado curto')


def _pontuar(r: Relatorio) -> dict:
    """0 a 100 por eixo. Serve para ordenar candidatos, não para julgar arte."""
    def clamp(v): return max(0.0, min(100.0, v))

    tecnica = 100.0
    tecnica -= min(40, r.amostras_clipadas / 20)
    tecnica -= 25 if r.true_peak_db > -0.1 else 0
    tecnica -= min(20, abs(r.offset_dc) * 800)
    tecnica -= 40 if r.tem_nan else 0

    dinamica = clamp(50 + (r.crista_db - 8) * 6)
    if r.lra_lu:
        dinamica = clamp(dinamica * 0.6 + clamp(r.lra_lu * 11) * 0.4)

    estereo = clamp(60 + r.correlacao * 25 - abs(r.equilibrio_db) * 8)

    espectro = clamp(100 - max(0, r.energia_agudos_pct - 12) * 5)

    estrutura = 100.0
    estrutura -= min(45, max(0, r.silencio_total_pct - 8) * 2.2)
    estrutura -= min(25, max(0, r.silencio_inicio_s - 1) * 8)
    estrutura *= (0.55 + 0.45 * (r.bpm_estabilidade or 0.7))

    total = (tecnica * .30 + dinamica * .20 + estereo * .15 +
             espectro * .15 + estrutura * .20)
    return {
        'tecnica': round(clamp(tecnica)),
        'dinamica': round(dinamica),
        'estereo': round(estereo),
        'espectro': round(espectro),
        'estrutura': round(clamp(estrutura)),
        'total': round(clamp(total)),
    }
