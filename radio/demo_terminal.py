import time
from datetime import datetime, timezone
import fingerprint as fp, monitor as mo

cat = fp.Catalogo('catalogo.db')
EST = 'LAC - Luanda Antena Comercial'
print(f"\033[1;33mMusic AO · Monitor de Rádio\033[0m")
print(f"catálogo: {cat.estatisticas()['obras']} obras · {cat.estatisticas()['marcas']:,} marcas".replace(',','.'))
print(f"a vigiar: {EST}\n")

def confirmou(p):
    print(f"\033[90m[{p.inicio.strftime('%H:%M:%S')}]\033[0m \033[32m▶\033[0m  {p.titulo} — {p.artista}")
def terminou(p):
    print(f"\033[90m[{p.ultima.strftime('%H:%M:%S')}]\033[0m \033[31m■\033[0m  {p.titulo}  "
          f"\033[90m{p.duracao_s:.0f}s · {p.janelas} janelas · confiança {p.confianca_max:.2f}\033[0m")

m = mo.Monitor(cat, EST, ao_confirmar=confirmou, ao_terminar=terminou)
t0 = datetime(2026,8,25,19,0,0,tzinfo=timezone.utc)
n=[0]
def passo(x, instante):
    n[0]+=1
    r = m.processar(x, instante)
    if r is None:
        print(f"\033[90m[{instante.strftime('%H:%M:%S')}]  ·  sem correspondência\033[0m")
    time.sleep(0.05)
mo.escutar_ficheiro('emissao.wav', passo, inicio=t0)
m.terminar()
print(f"\n\033[90m{n[0]} janelas analisadas · {len(m.passagens)} passagens registadas\033[0m")
