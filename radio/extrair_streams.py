#!/usr/bin/env python3
"""
MUSIC AO · Extrair streams de uma página
========================================

Algumas rádios põem o URL do stream à vista no rodapé (a MFM põe). Outras
escondem-no dentro do JavaScript do leitor — o site da RNA é assim, e é o
caso mais comum em WordPress com plugins de rádio.

Esta ferramenta lê o HTML guardado da página e procura o endereço em todos
os sítios onde costuma estar: atributos `src`, `data-*`, blocos JSON de
configuração, listas de reprodução e chamadas de JavaScript.

Como guardar a página
---------------------
No browser, na página da rádio:  Ctrl+S  →  "Página completa"
Ou, mais rápido e mais fiável:

    F12 (DevTools) → separador Network → filtro "Media"
    → carregar no play da rádio
    → o pedido que aparece É o stream. Botão direito → Copy → Copy link address

Trinta segundos por estação, e apanha até os que carregam por JavaScript.

Uso
---
    python3 extrair_streams.py pagina.html
    python3 extrair_streams.py pasta_com_paginas/ --json saida.json
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urljoin

# Extensões e caminhos que denunciam um stream de áudio.
PISTAS = re.compile(
    r"""(?xi)
    (?:https?:)?//[^\s"'<>\\]{4,240}?
    (?:
        \.mp3(?:\?[^\s"'<>]*)?          |
        \.aac(?:\?[^\s"'<>]*)?          |
        \.m3u8(?:\?[^\s"'<>]*)?         |
        \.pls(?:\?[^\s"'<>]*)?          |
        \.ogg(?:\?[^\s"'<>]*)?          |
        /stream(?:[/?][^\s"'<>]*)?      |
        /listen(?:[/?][^\s"'<>]*)?      |
        /live(?:[/?][^\s"'<>]*)?        |
        /proxy/[^\s"'<>]+               |
        :\d{4,5}/[^\s"'<>]*
    )
    """
)

# Coisas que parecem stream mas não são.
RUIDO = re.compile(
    r"(?i)\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?|ttf|ico|mp4|webm)"
    r"|google|facebook|twitter|instagram|youtube|gstatic|gravatar"
    r"|jquery|bootstrap|fontawesome|wp-content/(?:themes|plugins)/[^\s]*\.(?:js|css)"
)

# Plataformas conhecidas — se aparecer uma destas, é quase de certeza o stream.
PLATAFORMAS = {
    "centova": "Centova Cast", "shoutcast": "Shoutcast", "icecast": "Icecast",
    "zeno.fm": "Zeno.fm", "radiojar": "RadioJar", "streamguys": "StreamGuys",
    "caster.fm": "Caster.fm", "radioca.st": "Radioca.st", "mediacp": "MediaCP",
    "instainternet": "InstaInternet", "radios.pt": "Radios.pt",
    "listen2myradio": "Listen2MyRadio", "azuracast": "AzuraCast",
}


def _limpar(u: str, base: str = "") -> str | None:
    u = unquote(u.strip().strip("\\").strip("'\"").replace("\\/", "/"))
    if u.startswith("//"):
        u = "https:" + u
    if u.startswith("/") and base:
        u = urljoin(base, u)
    if not u.startswith(("http://", "https://")):
        return None
    return u


def extrair(html: str, base: str = "") -> list[dict]:
    achados: dict[str, dict] = {}

    def juntar(u, onde):
        u = _limpar(u, base)
        if not u or RUIDO.search(u):
            return
        plat = next((v for k, v in PLATAFORMAS.items() if k in u.lower()), None)
        pontos = 0
        if plat:
            pontos += 5
        if re.search(r"\.(mp3|aac|m3u8)", u, re.I):
            pontos += 3
        if re.search(r"/(stream|listen|live|proxy)", u, re.I):
            pontos += 2
        if re.search(r":\d{4,5}/", u):
            pontos += 2
        if onde in ("audio-src", "data-url", "config-json"):
            pontos += 3
        if u in achados:
            achados[u]["onde"].add(onde)
            achados[u]["pontos"] = max(achados[u]["pontos"], pontos)
        else:
            achados[u] = {"url": u, "plataforma": plat, "pontos": pontos, "onde": {onde}}

    # 1. <audio src> e <source src>
    for m in re.finditer(r"<(?:audio|source)[^>]*\ssrc=[\"']([^\"']+)", html, re.I):
        juntar(m.group(1), "audio-src")

    # 2. atributos data-* que cheiram a stream
    for m in re.finditer(
        r"data-(?:stream|url|src|mp3|audio|source|radio|link|file)[a-z-]*=[\"']([^\"']+)",
        html, re.I,
    ):
        juntar(m.group(1), "data-url")

    # 3. blocos JSON de configuração dos plugins de rádio
    for m in re.finditer(
        r"[\"'](?:stream_?url|streamUrl|src|url|file|mp3|source|audio)[\"']\s*:\s*[\"']([^\"']+)",
        html, re.I,
    ):
        juntar(m.group(1), "config-json")

    # 4. varredura geral do documento
    for m in PISTAS.finditer(html):
        juntar(m.group(0), "varredura")

    # A varredura geral pode casar com um prefixo do mesmo endereço
    # (".../stream" e ".../stream.mp3"). Fica só o mais completo.
    urls = list(achados)
    for u in urls:
        if any(o != u and o.startswith(u) for o in urls):
            achados.pop(u, None)

    lista = sorted(achados.values(), key=lambda a: -a["pontos"])
    for a in lista:
        a["onde"] = sorted(a["onde"])
    return lista


def _base_de(html: str) -> str:
    m = re.search(r"<link[^>]+rel=[\"']canonical[\"'][^>]+href=[\"']([^\"']+)", html, re.I)
    if m:
        return m.group(1)
    m = re.search(r"<base[^>]+href=[\"']([^\"']+)", html, re.I)
    return m.group(1) if m else ""


def processar(caminho: Path):
    html = caminho.read_text(encoding="utf-8", errors="replace")
    achados = extrair(html, _base_de(html))
    print(f"\n\033[1m{caminho.name}\033[0m")
    if not achados:
        print("   nada encontrado — usa o método do DevTools (ver topo do ficheiro)")
        return []
    for a in achados[:8]:
        marca = "★" if a["pontos"] >= 7 else " "
        plat = f"  [{a['plataforma']}]" if a["plataforma"] else ""
        print(f"  {marca} {a['url'][:100]}{plat}")
        print(f"      confiança {a['pontos']} · visto em {', '.join(a['onde'])}")
    return achados


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    alvo = Path(sys.argv[1])
    ficheiros = sorted(alvo.glob("*.htm*")) if alvo.is_dir() else [alvo]

    tudo = {}
    for f in ficheiros:
        tudo[f.stem] = processar(f)

    if "--json" in sys.argv:
        saida = Path(sys.argv[sys.argv.index("--json") + 1])
        saida.write_text(json.dumps(tudo, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\nguardado em {saida}")

    print("\nDepois de escolheres, confirma que funciona mesmo:")
    print("   python3 descobrir.py estacoes.json")


if __name__ == "__main__":
    main()
