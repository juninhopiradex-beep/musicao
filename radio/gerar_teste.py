"""
Gera faixas sintéticas com estrutura musical e simula a passagem por uma
emissora: compressão com perdas, equalização, compressor de dinâmica,
ruído, locutor por cima, e a mudança de velocidade que algumas rádios fazem.

O objetivo é testar o motor contra sinal degradado, não contra ficheiros limpos.
"""
import subprocess
import numpy as np

TAXA = 44100


def _adsr(n, ataque=0.01, decaimento=0.3):
    env = np.ones(n)
    a = int(ataque * TAXA)
    d = int(decaimento * TAXA)
    if a: env[:a] = np.linspace(0, 1, a)
    if d: env[-d:] = np.linspace(1, 0, d)
    return env


def _nota(freq, dur, harmonicos=6, brilho=0.6):
    n = int(dur * TAXA)
    t = np.arange(n) / TAXA
    x = np.zeros(n)
    for h in range(1, harmonicos + 1):
        x += (brilho ** h) * np.sin(2 * np.pi * freq * h * t + np.random.rand())
    return x * _adsr(n, 0.008, min(0.35, dur * 0.6))


def _bombo(dur=0.18):
    n = int(dur * TAXA)
    t = np.arange(n) / TAXA
    f = 110 * np.exp(-t * 34) + 42
    return np.sin(2 * np.pi * np.cumsum(f) / TAXA) * np.exp(-t * 16)


def _tarola(dur=0.14):
    n = int(dur * TAXA)
    t = np.arange(n) / TAXA
    ruido = np.random.randn(n) * np.exp(-t * 26)
    tom = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    return ruido * 0.7 + tom * 0.3


def _chimbal(dur=0.06):
    n = int(dur * TAXA)
    t = np.arange(n) / TAXA
    return np.random.randn(n) * np.exp(-t * 90) * 0.4


def faixa(semente: int, segundos=95, bpm=104):
    """Uma faixa com acordes, baixo e percussão. Cada semente dá outra música."""
    rng = np.random.RandomState(semente)
    n = int(segundos * TAXA)
    saida = np.zeros(n)

    escala = [0, 2, 3, 5, 7, 8, 10]
    tonica = 48 + rng.randint(0, 12)
    progressao = [rng.choice(escala) for _ in range(4)]
    compasso = 60.0 / bpm * 4
    passo = int(compasso * TAXA)

    pos = 0
    c = 0
    while pos + passo < n:
        grau = progressao[c % len(progressao)]
        raiz = 440 * 2 ** ((tonica + grau - 69) / 12)

        # acorde
        for iv in (0, 3 if c % 2 else 4, 7):
            f = raiz * 2 ** (iv / 12)
            bloco = _nota(f, compasso * 0.95, harmonicos=5, brilho=0.55) * 0.22
            saida[pos:pos + len(bloco)] += bloco[:max(0, n - pos)]

        # baixo
        for b in range(4):
            off = pos + int(b * passo / 4)
            bl = _nota(raiz / 4, compasso / 4 * 0.8, harmonicos=3, brilho=0.7) * 0.3
            saida[off:off + len(bl)] += bl[:max(0, n - off)]

        # melodia
        for m in range(8):
            if rng.rand() < 0.55:
                off = pos + int(m * passo / 8)
                nota = escala[rng.randint(len(escala))]
                f = raiz * 2 ** ((nota + 12) / 12)
                ml = _nota(f, compasso / 8 * 0.9, harmonicos=7, brilho=0.5) * 0.18
                saida[off:off + len(ml)] += ml[:max(0, n - off)]

        # percussão
        for k in range(4):
            off = pos + int(k * passo / 4)
            d = _bombo()
            saida[off:off + len(d)] += d[:max(0, n - off)] * 0.5
            if k % 2 == 1:
                s = _tarola()
                saida[off:off + len(s)] += s[:max(0, n - off)] * 0.35
        for k in range(8):
            off = pos + int(k * passo / 8)
            h = _chimbal()
            saida[off:off + len(h)] += h[:max(0, n - off)] * 0.3

        pos += passo
        c += 1

    return (saida / (np.abs(saida).max() + 1e-9) * 0.85).astype(np.float32)


def gravar_wav(x, caminho):
    import wave
    with wave.open(caminho, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


# ─────────────────────────────────────────────────────────────
# Simulação da cadeia de uma emissora
# ─────────────────────────────────────────────────────────────

FILTROS = {
    # o que quase toda a rádio faz: corta graves e agudos, comprime a dinâmica
    "processamento": "highpass=f=90,lowpass=f=11000,acompressor=threshold=0.08:ratio=6:attack=6:release=180",
    # rádio com equalização agressiva
    "eq_agressiva": "highpass=f=140,lowpass=f=9000,equalizer=f=250:width_type=o:width=1:g=-7,"
                    "equalizer=f=3500:width_type=o:width=1:g=6,acompressor=threshold=0.05:ratio=9",
    # emissão com pouca largura de banda
    "banda_estreita": "highpass=f=200,lowpass=f=6500,acompressor=threshold=0.1:ratio=4",
}


def emitir(entrada, saida, filtro="processamento", bitrate="64k", ruido_db=None,
           velocidade=1.0, ganho_db=0.0):
    """Passa um ficheiro pela cadeia de uma emissora e grava o resultado."""
    cadeia = [FILTROS[filtro]]
    if velocidade != 1.0:
        cadeia.append(f"asetrate={int(TAXA*velocidade)},aresample={TAXA}")
    if ganho_db:
        cadeia.append(f"volume={ganho_db}dB")

    cmd = ["ffmpeg", "-y", "-v", "error"]
    if ruido_db is not None:
        # mistura ruído rosa ao sinal, ao nível pedido
        cmd += ["-i", entrada,
                "-f", "lavfi", "-i", f"anoisesrc=c=pink:r={TAXA}:a={10**(ruido_db/20):.5f}",
                "-filter_complex",
                f"[0:a]{','.join(cadeia)}[s];[s][1:a]amix=inputs=2:duration=first:weights=1 1[o]",
                "-map", "[o]"]
    else:
        cmd += ["-i", entrada, "-af", ",".join(cadeia)]
    cmd += ["-c:a", "libmp3lame", "-b:a", bitrate, "-ar", str(TAXA), "-ac", "1", saida]
    subprocess.run(cmd, check=True, capture_output=True)


def com_locutor(entrada, saida, inicio=3.0, dur=5.0, nivel=0.55):
    """
    Sobrepõe uma voz sintética à música, como um locutor a falar por cima.
    A voz é ruído filtrado na banda da fala, modulado — imita a envolvente
    de alguém a falar sem precisar de síntese de fala.
    """
    voz = (f"anoisesrc=c=pink:r={TAXA}:d={dur},"
           "highpass=f=300,lowpass=f=3400,"
           "tremolo=f=4.5:d=0.9,vibrato=f=6:d=0.4,"
           f"adelay={int(inicio*1000)}|{int(inicio*1000)},"
           f"volume={nivel}")
    subprocess.run([
        "ffmpeg", "-y", "-v", "error",
        "-i", entrada,
        "-f", "lavfi", "-i", voz,
        "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:normalize=0[o]",
        "-map", "[o]", "-c:a", "libmp3lame", "-b:a", "96k", "-ac", "1", saida
    ], check=True, capture_output=True)
