"""Testa o motor contra sinal degradado como sai de uma emissora real."""
import os, subprocess, time
import numpy as np
import fingerprint as fp, gerar_teste as g

c = fp.Catalogo('catalogo.db')
ok = falha = 0
erros = []

def prova(nome, ficheiro, esperado, inicio=0.0, dur=10.0):
    global ok, falha
    x = fp.descodificar(ficheiro)
    a = int(inicio*fp.TAXA); b = a + int(dur*fp.TAXA)
    r = c.identificar(x[a:b])
    if esperado is None:
        bom = r is None
        obtido = 'nada' if r is None else f"{r['titulo']} ({r['pares']}p)"
    else:
        bom = r is not None and r['titulo'] == esperado
        obtido = 'NAO IDENTIFICOU' if r is None else f"{r['titulo']} · {r['pares']}p · nitidez {r['nitidez']} · conf {r['confianca']}"
    print(('  OK  ' if bom else 'FALHA ') + f"{nome:44s} -> {obtido}")
    if bom: ok += 1
    else: falha += 1; erros.append(nome)

print('\n== 1. Referência limpa (controlo) ==')
for i in [1,3,5]:
    prova(f'ref{i} limpa, 10s do meio', f'ref{i}.wav', f'Faixa {i}', inicio=40)

print('\n== 2. Cadeia de emissora ==')
casos = [
  ('processamento normal, MP3 64k', dict(filtro='processamento', bitrate='64k')),
  ('EQ agressiva, MP3 48k',         dict(filtro='eq_agressiva', bitrate='48k')),
  ('banda estreita, MP3 32k',       dict(filtro='banda_estreita', bitrate='32k')),
]
for nome, kw in casos:
    g.emitir('ref2.wav', 'emit.mp3', **kw)
    prova(nome, 'emit.mp3', 'Faixa 2', inicio=30)

print('\n== 3. Ruído ==')
for db in [-26, -20, -14]:
    g.emitir('ref4.wav', 'emit.mp3', filtro='processamento', bitrate='64k', ruido_db=db)
    prova(f'ruído rosa a {db} dB', 'emit.mp3', 'Faixa 4', inicio=25)

print('\n== 4. Velocidade alterada (a rádio acelera para caber) ==')
for v in [0.99, 1.01, 1.02]:
    g.emitir('ref3.wav', 'emit.mp3', filtro='processamento', bitrate='64k', velocidade=v)
    prova(f'velocidade x{v}', 'emit.mp3', 'Faixa 3', inicio=30)

print('\n== 5. Locutor por cima ==')
g.com_locutor('ref5.wav', 'emit.mp3', inicio=2, dur=6)
prova('voz sobreposta 6s', 'emit.mp3', 'Faixa 5', inicio=0, dur=10)

print('\n== 6. Excertos curtos ==')
g.emitir('ref1.wav', 'emit.mp3', filtro='processamento', bitrate='64k')
for d in [3, 5, 7, 10]:
    prova(f'apenas {d} segundos', 'emit.mp3', 'Faixa 1', inicio=50, dur=d)

print('\n== 7. Falsos positivos (o mais importante) ==')
g.emitir('intrusa.wav', 'emit.mp3', filtro='processamento', bitrate='64k')
prova('faixa fora do catálogo', 'emit.mp3', None, inicio=20)
subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','anoisesrc=c=pink:d=12:r=44100',
                '-c:a','libmp3lame','-b:a','64k','ruido.mp3'], check=True)
prova('ruído puro', 'ruido.mp3', None, inicio=0)
subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','sine=f=440:d=12',
                '-c:a','libmp3lame','-b:a','64k','tom.mp3'], check=True)
prova('tom puro contínuo', 'tom.mp3', None, inicio=0)
subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i','anullsrc=r=44100:d=12',
                '-c:a','libmp3lame','-b:a','64k','silencio.mp3'], check=True)
prova('silêncio', 'silencio.mp3', None, inicio=0)

print('\n== 8. Velocidade de identificação ==')
x = fp.descodificar('emit.mp3')[:10*fp.TAXA]
t0=time.time()
for _ in range(10): c.identificar(x)
print(f'  {(time.time()-t0)/10*1000:.0f} ms por consulta de 10s (catálogo de 5 obras)')

print(f'\n{"="*62}\nRESULTADO: {ok} passaram, {falha} falharam')
if erros: print('falhas:', ', '.join(erros))
