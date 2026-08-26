"""
MUSIC AO · Metadados das estações
=================================

Muitas rádios publicam o que está a tocar, num endereço aberto. Serve para
três coisas, por ordem de importância:

1. **Afinar o motor.** Durante o desenvolvimento, o que a estação diz é a
   verdade de referência. Compara-se com o que a impressão digital detetou e
   ajusta-se o limiar com base em erros reais, não em palpites.

2. **Preencher buracos.** Quando o reconhecimento falha (obra fora do
   catálogo, sinal mau), os metadados ainda dizem alguma coisa.

3. **Ouvintes online.** O Centova devolve quantas pessoas estão ligadas.

O que isto NÃO é
----------------
Não substitui a impressão digital, por três razões:

· É a estação a declarar-se a si própria. Numa cobrança de direitos, a
  parte interessada não pode ser a única fonte da prova.
· Falha muito: jingles e publicidade aparecem como música, o campo fica
  em branco durante blocos falados, e há estações que só põem o nome da
  rádio o tempo todo.
· Os ouvintes contados são só os de internet. Numa rádio angolana isso é
  uma fração pequena da audiência real, que está em FM. Nunca apresentar
  este número como "quantas pessoas ouviram a música".

Formatos suportados
-------------------
Centova Cast  ·  /rpc/<conta>/streaminfo.get
Icecast       ·  /status-json.xsl
Shoutcast v2  ·  /stats?json=1
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone

AGENTE = "MusicAO-Monitor/1.0"


@dataclass
class Agora:
    estacao: str
    artista: str | None
    titulo: str | None
    bruto: str
    ouvintes: int | None
    bitrate: int | None
    instante: datetime

    @property
    def parece_musica(self):
        """
        Filtra o que claramente não é uma faixa.

        Atenção ao caso traiçoeiro: "Rádio MFM 91.7 - Ao Vivo" tem hífen, por
        isso é lido como artista + título e passaria como música se olhássemos
        só ao formato. Verifica-se o conteúdo, não a forma.
        """
        if not self.bruto:
            return False

        def limpo(x):
            import unicodedata
            x = unicodedata.normalize("NFD", (x or "").lower())
            x = "".join(c for c in x if unicodedata.category(c) != "Mn")
            return re.sub(r"[^a-z0-9 ]+", " ", x).strip()

        b = limpo(self.bruto)
        if len(b) < 4:
            return False

        LIXO = ("ao vivo", "em direto", "live", "on air", "publicidade",
                "jingle", "spot", "intervalo", "unknown", "n a", "sem titulo",
                "no title", "advertisement", "comercial", "streaming")
        # o rótulo aparece sozinho, ou como a parte do "título"
        for termo in LIXO:
            if b == termo or b.endswith(" " + termo) or b.startswith(termo + " "):
                return False
            if limpo(self.titulo) == termo:
                return False

        # o nome da estação a fazer de faixa
        if self.estacao:
            e = limpo(self.estacao)
            palavras = [p for p in e.split() if len(p) > 3]
            if palavras and all(p in b for p in palavras):
                return False

        return True

def _obter(url: str, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": AGENTE})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _partir(song: str):
    """'Artista - Título' → ('Artista', 'Título'). Aceita vários separadores."""
    if not song:
        return None, None
    for sep in (" - ", " – ", " — ", " -- "):
        if sep in song:
            a, t = song.split(sep, 1)
            return a.strip() or None, t.strip() or None
    return None, song.strip() or None


def ler(url: str, estacao: str = "") -> Agora | None:
    """Lê o endereço de metadados e devolve o que está a tocar."""
    agora = datetime.now(timezone.utc)
    try:
        d = _obter(url)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError):
        return None

    # ── Centova Cast ──
    if isinstance(d, dict) and isinstance(d.get("data"), list) and d["data"]:
        x = d["data"][0]
        tr = x.get("track") or {}
        song = x.get("song") or ""
        artista = tr.get("artist") or None
        titulo = tr.get("title") or None
        if not artista and not titulo:
            artista, titulo = _partir(song)
        return Agora(estacao, artista, titulo, song or "",
                     x.get("listeners"), x.get("bitrate"), agora)

    # ── Icecast ──
    if isinstance(d, dict) and "icestats" in d:
        fontes = d["icestats"].get("source")
        if isinstance(fontes, dict):
            fontes = [fontes]
        if fontes:
            x = fontes[0]
            song = x.get("title") or x.get("yp_currently_playing") or ""
            artista = x.get("artist") or None
            titulo = x.get("track") or None
            if not artista and not titulo:
                artista, titulo = _partir(song)
            return Agora(estacao, artista, titulo, song,
                         x.get("listeners"), x.get("bitrate"), agora)

    # ── Shoutcast v2 ──
    if isinstance(d, dict) and ("songtitle" in d or "currentsong" in d):
        song = d.get("songtitle") or d.get("currentsong") or ""
        a, t = _partir(song)
        return Agora(estacao, a, t, song,
                     d.get("currentlisteners"), d.get("bitrate"), agora)

    return None


def descobrir_metadata(url_stream: str) -> str | None:
    """
    Adivinha o endereço de metadados a partir do URL do stream.
    Funciona para os padrões mais comuns; devolve None se não reconhecer.
    """
    m = re.match(r"(https?://[^/]+)/proxy/([^/?]+)", url_stream)
    if m:                                    # Centova Cast
        return f"{m.group(1)}/rpc/{m.group(2)}/streaminfo.get"
    m = re.match(r"(https?://[^/]+)/", url_stream + "/")
    if m:                                    # Icecast, tentativa
        return f"{m.group(1)}/status-json.xsl"
    return None


# ─────────────────────────────────────────────────────────────
# Comparação com o que o motor detetou
# ─────────────────────────────────────────────────────────────

def _normalizar(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def confere(titulo_detetado: str, agora: Agora) -> bool:
    """A estação e o motor estão a dizer a mesma coisa?"""
    if not agora or not agora.parece_musica:
        return False
    alvo = _normalizar(titulo_detetado)
    campo = _normalizar((agora.titulo or "") + " " + (agora.bruto or ""))
    if not alvo:
        return False
    return alvo in campo or campo.startswith(alvo)


class Registo:
    """
    Acompanha uma estação e cruza o que ela declara com o que o motor deteta.
    No fim diz onde discordam — é aí que se afina o limiar.
    """

    def __init__(self, estacao: str, url_metadata: str):
        self.estacao = estacao
        self.url = url_metadata
        self.linhas = []
        self.ultimo_bruto = None

    def sondar(self, detetado: str | None = None):
        a = ler(self.url, self.estacao)
        if a is None:
            return None
        mudou = a.bruto != self.ultimo_bruto
        self.ultimo_bruto = a.bruto
        self.linhas.append({
            "instante": a.instante.isoformat(),
            "estacao_diz": a.bruto,
            "artista": a.artista,
            "titulo": a.titulo,
            "ouvintes": a.ouvintes,
            "motor_detetou": detetado,
            "concordam": confere(detetado, a) if detetado else None,
            "mudou": mudou,
        })
        return a

    def relatorio(self):
        comp = [l for l in self.linhas if l["concordam"] is not None]
        acordo = sum(1 for l in comp if l["concordam"])
        musicas = [l for l in self.linhas if l["estacao_diz"]]
        return {
            "estacao": self.estacao,
            "sondagens": len(self.linhas),
            "com_metadados": len(musicas),
            "comparaveis": len(comp),
            "concordam": acordo,
            "taxa_acordo": round(acordo / len(comp), 3) if comp else None,
            "ouvintes_medio": (
                round(sum(l["ouvintes"] for l in self.linhas if l["ouvintes"] is not None)
                      / max(1, sum(1 for l in self.linhas if l["ouvintes"] is not None)))
                if any(l["ouvintes"] is not None for l in self.linhas) else None
            ),
        }

    def guardar(self, caminho):
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump({"relatorio": self.relatorio(), "linhas": self.linhas},
                      f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("uso: python3 metadados.py <url_metadata> [segundos]")
        sys.exit(1)
    url = sys.argv[1]
    dur = int(sys.argv[2]) if len(sys.argv) > 2 else 120
    r = Registo("teste", url)
    print(f"a sondar {url} durante {dur}s (15 em 15)…\n")
    fim = time.time() + dur
    while time.time() < fim:
        a = r.sondar()
        if a:
            marca = "♫" if a.parece_musica else "·"
            print(f"[{a.instante.strftime('%H:%M:%S')}] {marca} {a.bruto[:60]:60s} "
                  f"{a.ouvintes if a.ouvintes is not None else '?'} ouvintes")
        else:
            print("   sem resposta")
        time.sleep(15)
    print("\n", json.dumps(r.relatorio(), ensure_ascii=False, indent=1))
