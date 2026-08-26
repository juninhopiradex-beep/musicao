#!/usr/bin/env python3
"""
MUSIC AO · Descobrir streams
============================

O myTuner serve para saber QUE estações existem. Não serve como fonte:
os termos proíbem acesso automatizado e o player usa proxy com tokens que
expiram — ligar o monitor a isso parte um dia sem aviso.

Esta ferramenta parte de um endereço candidato (o site da estação, ou um URL
que já tenhas) e procura o stream verdadeiro: testa os caminhos habituais de
Icecast e Shoutcast, confirma com ffprobe que é mesmo áudio, e mede se aguenta
uns segundos sem cair.

Correr:
    python3 descobrir.py estacoes.json            # testa as que já têm url
    python3 descobrir.py estacoes.json --procurar # tenta descobrir as que faltam
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from urllib.parse import urljoin, urlparse

# Caminhos que a esmagadora maioria dos servidores de rádio usa.
CAMINHOS = [
    "/stream", "/;", "/live", "/;stream.mp3", "/stream.mp3", "/listen",
    "/radio.mp3", "/;stream/1", "/1", "/live.mp3", "/audio.mp3",
    "/stream?type=http", "/index.html?sHttpsPort=", "/hls/live.m3u8",
    "/playlist.m3u", "/listen.pls", "/stream/1/",
]

# Plataformas comuns em rádios africanas e portuguesas.
PISTAS = """
Onde procurar o URL verdadeiro:
  · Página da estação → botão "Ouvir online" → ver o código-fonte (Ctrl+U)
    e procurar por .mp3, .aac, /stream, icecast, shoutcast
  · Muitas usam Zeno.fm      → https://stream.zeno.fm/<id>
  · Outras usam RadioJar     → https://stream.radiojar.com/<id>
  · Outras usam Radios.pt / StreamingCast / Caster.fm
  · No telemóvel: abrir a app da rádio e ver o tráfego, ou pedir ao técnico
    da estação — muitos dão o URL sem problema, é emissão pública
"""


def _opcoes_rede(url: str) -> list[str]:
    """
    -user_agent e -timeout só existem para protocolos de rede. Passá-los a
    um ficheiro local faz o ffmpeg recusar-se a abrir — e a mensagem de erro
    não diz porquê. Por isso separam-se aqui.
    """
    if url.startswith(("http://", "https://", "rtmp://", "rtsp://")):
        return ["-user_agent", "MusicAO-Monitor/1.0", "-timeout", "8000000"]
    return []


def testar(url: str, segundos: int = 8) -> dict:
    """Confirma que o URL é áudio e que se mantém ligado."""
    r = {"url": url, "ok": False, "erro": None}
    rede = _opcoes_rede(url)

    # 1. é áudio?
    try:
        info = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams",
             *rede, url],
            capture_output=True, timeout=25, text=True,
        )
        dados = json.loads(info.stdout or "{}")
        audio = [s for s in dados.get("streams", []) if s.get("codec_type") == "audio"]
        if not audio:
            r["erro"] = "não tem faixa de áudio"
            return r
        a = audio[0]
        r["codec"] = a.get("codec_name")
        r["taxa"] = a.get("sample_rate")
        r["canais"] = a.get("channels")
        r["bitrate"] = a.get("bit_rate")
    except subprocess.TimeoutExpired:
        r["erro"] = "sem resposta (25s)"
        return r
    except Exception as e:
        r["erro"] = str(e)[:80]
        return r

    # 2. aguenta ligado e entrega amostras a ritmo?
    t0 = time.time()
    try:
        p = subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", *rede,
             "-t", str(segundos), "-i", url, "-ac", "1", "-ar", "8000", "-f", "f32le", "-"],
            capture_output=True, timeout=segundos + 20,
        )
        amostras = len(p.stdout) // 4
        esperado = 8000 * segundos
        r["recebido_s"] = round(amostras / 8000, 1)
        r["completo"] = amostras >= esperado * 0.8
        r["latencia_s"] = round(time.time() - t0, 1)
        if not r["completo"]:
            r["erro"] = f"só entregou {r['recebido_s']}s de {segundos}s"
            return r
        # silêncio total costuma ser stream morto
        import numpy as np
        x = np.frombuffer(p.stdout, dtype=np.float32)
        r["nivel_db"] = round(20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9), 1)
        if r["nivel_db"] < -60:
            r["erro"] = "stream mudo"
            return r
    except Exception as e:
        r["erro"] = str(e)[:80]
        return r

    r["ok"] = True
    return r


def procurar(base: str) -> list[dict]:
    """Testa os caminhos habituais a partir de um endereço base."""
    achados = []
    p = urlparse(base)
    raiz = f"{p.scheme}://{p.netloc}"
    candidatos = [base] + [urljoin(raiz, c) for c in CAMINHOS]
    vistos = set()
    for url in candidatos:
        if url in vistos:
            continue
        vistos.add(url)
        print(f"   a testar {url[:78]}", flush=True)
        r = testar(url, segundos=5)
        if r["ok"]:
            print(f"   ✓ funciona · {r.get('codec')} {r.get('taxa')}Hz {r.get('nivel_db')}dB")
            achados.append(r)
            break
    return achados


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    caminho = sys.argv[1]
    modo_procura = "--procurar" in sys.argv

    with open(caminho, encoding="utf-8") as f:
        cfg = json.load(f)

    bons = maus = sem = 0
    for e in cfg["estacoes"]:
        nome = e["nome"]
        url = e.get("url")

        if not url:
            if modo_procura and e.get("site"):
                print(f"\n{nome}  (a procurar a partir de {e['site']})")
                achados = procurar(e["site"])
                if achados:
                    e["url"] = achados[0]["url"]
                    e["verificado"] = achados[0]
                    bons += 1
                    continue
            print(f"\n{nome}  — sem URL")
            sem += 1
            continue

        print(f"\n{nome}")
        r = testar(url)
        e["verificado"] = r
        if r["ok"]:
            print(f"   ✓ {r['codec']} · {r['taxa']} Hz · {r['canais']}ch · "
                  f"nível {r['nivel_db']} dB · latência {r['latencia_s']}s")
            e["ativa"] = True
            bons += 1
        else:
            print(f"   ✗ {r['erro']}")
            e["ativa"] = False
            maus += 1

    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

    print(f"\n{'='*58}")
    print(f"{bons} a funcionar · {maus} com problema · {sem} por preencher")
    if sem:
        print(PISTAS)


if __name__ == "__main__":
    main()
