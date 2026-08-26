#!/usr/bin/env python3
"""
MUSIC AO · Radio Browser
========================

O Radio Browser é uma base de dados comunitária, aberta e gratuita, de rádios
de todo o mundo — **com os endereços dos streams**. É software livre, feito
precisamente para isto, e não tem termos a proibir uso automatizado.

Resolve de uma vez o que estamos a fazer site a site. Não vai ter tudo (as
rádios angolanas mais pequenas podem faltar), mas o que tiver vem verificado
pela comunidade, com codec, bitrate e histórico de disponibilidade.

Uso
---
    python3 radiobrowser.py                    # lista as rádios de Angola
    python3 radiobrowser.py --juntar estacoes.json   # preenche os URLs em falta

Regras de boa educação da API (respeitadas aqui):
· identificar-se no User-Agent
· descobrir o servidor por DNS em vez de fixar um
· não martelar: uma consulta chega
"""

from __future__ import annotations

import json
import random
import socket
import sys
import unicodedata
import urllib.error
import urllib.request

AGENTE = "MusicAO-Monitor/1.0 (monitorizacao de radio angolana)"


def servidores() -> list[str]:
    """Descobre os servidores da API. Se o DNS falhar, usa o ponto de entrada geral."""
    try:
        _, _, ips = socket.gethostbyname_ex("all.api.radio-browser.info")
        nomes = []
        for ip in ips:
            try:
                nomes.append(socket.gethostbyaddr(ip)[0])
            except OSError:
                pass
        if nomes:
            random.shuffle(nomes)
            return nomes
    except OSError:
        pass
    return ["all.api.radio-browser.info"]


def consultar(caminho: str, timeout=20):
    ultimo = None
    for host in servidores()[:3]:
        url = f"https://{host}/json/{caminho}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as e:
            ultimo = e
    raise RuntimeError(f"não foi possível contactar o Radio Browser: {ultimo}")


def angola():
    """Todas as estações registadas com país Angola."""
    est = consultar("stations/bycountrycodeexact/AO")
    est.sort(key=lambda s: (-(s.get("votes") or 0), s.get("name", "")))
    return est


def _chave(nome: str) -> str:
    n = unicodedata.normalize("NFD", (nome or "").lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    for lixo in ("radio", "rádio", "fm", "-", "·", "(", ")", "."):
        n = n.replace(lixo, " ")
    return " ".join(n.split())


def juntar(caminho_json: str):
    """Preenche os URLs em falta no estacoes.json com o que o Radio Browser souber."""
    with open(caminho_json, encoding="utf-8") as f:
        cfg = json.load(f)

    est = angola()
    print(f"Radio Browser: {len(est)} estações registadas em Angola\n")

    porchave = {}
    for s in est:
        porchave.setdefault(_chave(s["name"]), s)

    preenchidas = novas = 0
    usados = set()   # UUIDs já atribuídos, para não voltarem a entrar como novos
    for e in cfg["estacoes"]:
        if e.get("url"):
            continue
        k = _chave(e["nome"])
        alvo = porchave.get(k)
        if not alvo:                      # tentativa por palavras em comum
            palavras = [p for p in k.split() if len(p) > 3]
            for ck, cs in porchave.items():
                if palavras and all(p in ck for p in palavras[:2]):
                    alvo = cs
                    break
        if alvo:
            e["url"] = alvo.get("url_resolved") or alvo.get("url")
            e["fonte_url"] = "radio-browser"
            e["codec"] = alvo.get("codec")
            e["bitrate"] = alvo.get("bitrate")
            e["radiobrowser_uuid"] = alvo.get("stationuuid")
            usados.add(alvo.get("stationuuid"))
            preenchidas += 1
            print(f"  ✓ {e['nome']:34s} -> {str(e['url'])[:64]}")

    conhecidas = {_chave(e["nome"]) for e in cfg["estacoes"]}
    ja_atribuidos = usados | {e.get("radiobrowser_uuid") for e in cfg["estacoes"]}
    for s in est:
        # o emparelhamento aproximado pode ter usado esta estação com outro nome
        if s.get("stationuuid") in ja_atribuidos:
            continue
        if _chave(s["name"]) in conhecidas:
            continue
        cfg["estacoes"].append({
            "nome": s["name"].strip(),
            "regiao": s.get("state") or "—",
            "url": s.get("url_resolved") or s.get("url"),
            "fonte_url": "radio-browser",
            "codec": s.get("codec"), "bitrate": s.get("bitrate"),
            "radiobrowser_uuid": s.get("stationuuid"),
            "etiquetas": s.get("tags"),
            "ativa": False, "prioridade": False,
        })
        novas += 1

    with open(caminho_json, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)

    total = len(cfg["estacoes"])
    com = sum(1 for e in cfg["estacoes"] if e.get("url"))
    print(f"\n{preenchidas} preenchidas · {novas} novas · {com}/{total} com endereço")
    print("\nConfirma sempre antes de confiar:  python3 descobrir.py estacoes.json")
    print("A base é comunitária — há endereços desatualizados.")


def main():
    if "--juntar" in sys.argv:
        juntar(sys.argv[sys.argv.index("--juntar") + 1])
        return
    est = angola()
    print(f"{len(est)} estações de Angola no Radio Browser\n")
    for s in est:
        etq = (s.get("tags") or "")[:34]
        print(f"  {s['name'][:34]:34s} {str(s.get('codec')):5s} "
              f"{str(s.get('bitrate') or '?'):>4s}k  votos {s.get('votes', 0):>4}  {etq}")
        print(f"       {(s.get('url_resolved') or s.get('url') or '')[:96]}")


if __name__ == "__main__":
    main()
