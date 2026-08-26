#!/usr/bin/env python3
"""
MUSIC AO · Primeiro teste
=========================

Antes de montar 67 estações, prova que a cadeia inteira funciona com UMA.

O que faz:
  1. Indexa as tuas faixas
  2. Liga-se a uma estação e escuta durante N minutos
  3. Diz o que detetou, com hora e duração
  4. Se a estação publicar o que está a tocar, compara as duas coisas
     — é assim que se descobre se o motor está bem calibrado

Corre isto numa tarde antes de investir no resto. Se falhar, falha barato.

    python3 primeiro_teste.py --faixas ./minhas_musicas \\
        --estacao "Rádio MFM 91.7" \\
        --url https://centova87.instainternet.com/proxy/radiomfm?mp=/live \\
        --metadata https://centova87.instainternet.com/rpc/radiomfm/streaminfo.get \\
        --minutos 30

Ou, para escutar um ficheiro já gravado em vez do stream ao vivo:

    python3 primeiro_teste.py --faixas ./minhas_musicas --ficheiro gravacao.mp3
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import fingerprint as fp
import monitor as mo

try:
    import metadados as md
except ImportError:
    md = None

AUDIO = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".wma", ".opus"}


def indexar(pasta: Path, cat: fp.Catalogo, artista: str):
    ficheiros = sorted(f for f in pasta.rglob("*") if f.suffix.lower() in AUDIO)
    if not ficheiros:
        print(f"Nenhum ficheiro de áudio em {pasta}")
        sys.exit(1)

    ja = {t for (t,) in cat.db.execute("SELECT titulo FROM obras")}
    print(f"\n── A indexar {len(ficheiros)} ficheiros ──")
    novas = 0
    for f in ficheiros:
        titulo = f.stem
        if titulo in ja:
            print(f"   · {titulo[:52]:52s} (já estava)")
            continue
        t0 = time.time()
        try:
            cat.registar(str(f), titulo, artista)
            novas += 1
            print(f"   ✓ {titulo[:52]:52s} {time.time()-t0:5.1f}s")
        except Exception as e:
            print(f"   ✗ {titulo[:52]:52s} {e}")
    est = cat.estatisticas()
    print(f"\n   {est['obras']} obras · {est['marcas']:,} marcas".replace(",", "."))
    return novas


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--faixas", required=True, help="pasta com as tuas músicas")
    p.add_argument("--artista", default="", help="nome do artista")
    p.add_argument("--estacao", default="Teste")
    p.add_argument("--url", help="endereço do stream")
    p.add_argument("--ficheiro", help="em vez do stream, escutar um ficheiro gravado")
    p.add_argument("--metadata", help="endereço do 'a tocar agora' da estação")
    p.add_argument("--minutos", type=float, default=30)
    p.add_argument("--db", default="catalogo.db")
    a = p.parse_args()

    if not a.url and not a.ficheiro:
        print("Falta --url ou --ficheiro")
        sys.exit(1)

    cat = fp.Catalogo(a.db)
    indexar(Path(a.faixas), cat, a.artista or "—")

    # ── escutar ──────────────────────────────────────────────
    print(f"\n── A escutar {a.estacao} durante {a.minutos:.0f} minutos ──")
    print("   (Ctrl+C para parar mais cedo)\n")

    deteccoes, janelas, comMatch = [], [0], [0]
    reg = md.Registo(a.estacao, a.metadata) if (a.metadata and md) else None

    def confirmou(pa):
        print(f"   [{pa.inicio.strftime('%H:%M:%S')}] ▶ {pa.titulo}")

    def terminou(pa):
        deteccoes.append(pa)
        print(f"   [{pa.ultima.strftime('%H:%M:%S')}] ■ {pa.titulo} "
              f"({pa.duracao_s:.0f}s, confiança {pa.confianca_max:.2f})")

    m = mo.Monitor(cat, a.estacao, ao_confirmar=confirmou, ao_terminar=terminou)
    parar = threading.Event()
    fim = time.time() + a.minutos * 60

    def passo(x, instante):
        janelas[0] += 1
        r = m.processar(x, instante)
        if r:
            comMatch[0] += 1
        if reg:
            reg.sondar(r["titulo"] if r else None)
        if time.time() > fim:
            parar.set()
        if janelas[0] % 12 == 0:
            print(f"   … {janelas[0]} janelas, {comMatch[0]} com correspondência, "
                  f"{len(deteccoes)} passagens", flush=True)

    try:
        if a.ficheiro:
            mo.escutar_ficheiro(a.ficheiro, passo)
        else:
            mo.escutar(a.url, passo, parar)
    except KeyboardInterrupt:
        print("\n   interrompido")
    m.terminar()

    # ── relatório ────────────────────────────────────────────
    print("\n" + "=" * 60)
    print(f"RESULTADO · {a.estacao}")
    print("=" * 60)
    print(f"  janelas analisadas ..... {janelas[0]}")
    print(f"  com correspondência .... {comMatch[0]}")
    print(f"  passagens registadas ... {len(deteccoes)}")

    if deteccoes:
        print("\n  O que passou:")
        for d in deteccoes:
            print(f"    {d.inicio.strftime('%H:%M')}  {d.titulo[:40]:40s} "
                  f"{d.duracao_s:4.0f}s  conf {d.confianca_max:.2f}")
    else:
        print("\n  Nada detetado. Antes de concluir que o motor falhou, verifica:")
        print("    · as tuas músicas passaram mesmo nesta janela de tempo?")
        print("    · a estação é de música ou de palavra?")
        print("    · o stream esteve ligado? (ver 'janelas analisadas' acima)")
        print("    · o catálogo tem as versões que a rádio toca, ou outras?")

    if reg:
        rel = reg.relatorio()
        print("\n  Cruzamento com o que a estação declarou:")
        print(f"    sondagens .......... {rel['sondagens']}")
        print(f"    com metadados ...... {rel['com_metadados']}")
        if rel["taxa_acordo"] is not None:
            print(f"    concordam .......... {rel['concordam']}/{rel['comparaveis']} "
                  f"({rel['taxa_acordo']*100:.0f}%)")
        if rel["ouvintes_medio"] is not None:
            print(f"    ouvintes online .... {rel['ouvintes_medio']} em média "
                  f"(só internet, não conta FM)")
        reg.guardar("cruzamento.json")
        print("\n    Detalhe em cruzamento.json — é aí que se vê onde o motor erra.")
        print("    Discordâncias a mais: subir NITIDEZ_MIN em fingerprint.py")
        print("    Passagens a menos:    descer NITIDEZ_MIN")

    saida = {
        "estacao": a.estacao,
        "quando": datetime.now(timezone.utc).isoformat(),
        "janelas": janelas[0],
        "passagens": [{
            "titulo": d.titulo, "inicio": d.inicio.isoformat(),
            "duracao_s": round(d.duracao_s), "confianca": d.confianca_max,
        } for d in deteccoes],
    }
    Path("primeiro_teste.json").write_text(
        json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    print("\n  Guardado em primeiro_teste.json")


if __name__ == "__main__":
    main()
