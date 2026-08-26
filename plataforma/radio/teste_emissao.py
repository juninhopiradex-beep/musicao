"""Monta uma hora de rádio falsa e vê se o monitor a lê corretamente."""
import subprocess, os
from datetime import datetime, timezone
import numpy as np
import fingerprint as fp, gerar_teste as g, monitor as mo

TAXA = g.TAXA

def seg(caminho, ini, dur, filtro='processamento', bitrate='64k', vel=1.0):
    g.emitir(caminho, '_s.mp3', filtro=filtro, bitrate=bitrate, velocidade=vel)
    x = fp.descodificar('_s.mp3')
    a=int(ini*fp.TAXA); return x[a:a+int(dur*fp.TAXA)]

def fala(dur):
    subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i',
        f'anoisesrc=c=pink:r={fp.TAXA}:d={dur},highpass=f=300,lowpass=f=3400,tremolo=f=4:d=0.9',
        '-ac','1','-ar',str(fp.TAXA),'-f','wav','_f.wav'],check=True,capture_output=True)
    return fp.descodificar('_f.wav')*0.5

def jingle(dur=6):
    subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i',
        f'sine=f=660:d={dur},tremolo=f=3:d=0.7','-ac','1','-ar',str(fp.TAXA),'-f','wav','_j.wav'],
        check=True,capture_output=True)
    return fp.descodificar('_j.wav')*0.6

# alinhamento: cada bloco começa em múltiplo de 5s para o passo bater certo
guiao = [
    ('jingle',      jingle(10)),
    ('Faixa 1',     seg('ref1.wav', 5, 60)),
    ('locutor',     fala(15)),
    ('Faixa 3',     seg('ref3.wav', 10, 55, vel=1.01)),
    ('INTRUSA',     seg('intrusa.wav', 5, 45)),
    ('locutor',     fala(10)),
    ('Faixa 5',     seg('ref5.wav', 20, 50, filtro='eq_agressiva', bitrate='48k')),
    ('Faixa 2',     seg('ref2.wav', 0, 25)),          # curta de propósito
]
emissao = np.concatenate([b for _, b in guiao])
print('emissão simulada:', round(len(emissao)/fp.TAXA), 'segundos\n')

esperado = []
t = 0
for nome, b in guiao:
    d = len(b)/fp.TAXA
    print(f'  {t:6.0f}s  {nome:12s} {d:5.0f}s')
    if nome.startswith('Faixa'): esperado.append((nome, t, d))
    t += d

# gravar e correr o monitor
import wave
with wave.open('emissao.wav','wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(fp.TAXA)
    w.writeframes((np.clip(emissao,-1,1)*32767).astype('<i2').tobytes())

cat = fp.Catalogo('catalogo.db')
detectadas = []
mon = mo.Monitor(cat, 'Rádio Teste',
    ao_confirmar=lambda p: None,
    ao_terminar=lambda p: detectadas.append(p))
t0 = datetime(2026,8,25,19,0,0,tzinfo=timezone.utc)
mo.escutar_ficheiro('emissao.wav', mon.processar, inicio=t0)
mon.terminar()

print('\n--- o que o monitor registou ---')
for p in detectadas:
    ini = (p.inicio - t0).total_seconds()
    print(f'  {ini:6.0f}s  {p.titulo:10s} {p.duracao_s:5.0f}s  ·  {p.janelas} janelas · conf {p.confianca_max}')

print('\n--- avaliação ---')
ok = falha = 0
for nome, ini, dur in esperado:
    achou = [p for p in detectadas if p.titulo == nome]
    if not achou:
        marca = 'FALHA' if dur >= mo.MIN_DURACAO_S else '  ok '
        nota = 'não detetada' + ('' if dur >= mo.MIN_DURACAO_S else ' (curta, é esperado)')
        print(f'{marca} {nome:10s} {nota}')
        if dur >= mo.MIN_DURACAO_S: falha += 1
        else: ok += 1
        continue
    p = achou[0]
    erro = abs((p.inicio - t0).total_seconds() - ini)
    bom = erro <= 10 and abs(p.duracao_s - dur) <= 20
    print(('  OK  ' if bom else 'FALHA ') + f'{nome:10s} início erra {erro:.0f}s · duração {p.duracao_s:.0f}s vs {dur:.0f}s real')
    ok += bom; falha += (not bom)

intrusas = [p for p in detectadas if p.titulo not in [n for n,_,_ in esperado]]
if intrusas:
    print('FALHA  falso positivo:', [p.titulo for p in intrusas]); falha += 1
else:
    print('  OK   nenhum falso positivo (a intrusa e os 25s de locutor não geraram passagem)')
    ok += 1
print(f'\n{ok} passaram, {falha} falharam')
