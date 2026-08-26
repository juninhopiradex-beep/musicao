"""
Monta emissões para várias estações, corre o monitor a sério sobre elas,
e exporta as deteções verdadeiras. Nada aqui é inventado: as passagens
saem do motor de impressão digital a analisar áudio.
"""
import json, subprocess, random
from datetime import datetime, timezone, timedelta
import numpy as np
import fingerprint as fp, gerar_teste as g, monitor as mo

random.seed(11)
cat = fp.Catalogo('catalogo.db')

OBRAS = {1:'Gostos Antecipados', 2:'Noite de Semba', 3:'Kuduro na Veia',
         4:'Luanda Amanhece', 5:'Ngola'}
for oid, titulo in OBRAS.items():
    cat.db.execute("UPDATE obras SET titulo=? WHERE id=?", (titulo, oid))
cat.db.commit()

ESTACOES = [
  ('LAC - Luanda Antena Comercial', 'Luanda',   'processamento',  '64k', 1.00),
  ('RNA - Rádio Luanda',            'Luanda',   'eq_agressiva',   '48k', 1.01),
  ('Rádio Mais Benguela',           'Benguela', 'processamento',  '64k', 0.99),
  ('Rádio Mais Huambo',             'Huambo',   'banda_estreita', '32k', 1.00),
  ('Rádio Ecclésia Malanje',        'Malanje',  'processamento',  '64k', 1.00),
]

def fala(dur):
    subprocess.run(['ffmpeg','-y','-v','error','-f','lavfi','-i',
      f'anoisesrc=c=pink:r={fp.TAXA}:d={dur},highpass=f=300,lowpass=f=3400,tremolo=f=4:d=0.9',
      '-ac','1','-ar',str(fp.TAXA),'-f','wav','_f.wav'],check=True,capture_output=True)
    return fp.descodificar('_f.wav')*0.5

# pré-processar cada faixa para cada perfil de emissora, uma vez
cache = {}
def trecho(oid, ini, dur, perfil, br, vel):
    k=(oid,perfil,br,vel)
    if k not in cache:
        g.emitir(f'ref{oid}.wav', f'_c{oid}.mp3', filtro=perfil, bitrate=br, velocidade=vel)
        cache[k]=fp.descodificar(f'_c{oid}.mp3')
    x=cache[k]; a=int(ini*fp.TAXA)
    return x[a:a+int(dur*fp.TAXA)]

todas=[]
base = datetime(2026,8,18,6,0,0,tzinfo=timezone.utc)

for si,(nome, regiao, perfil, br, vel) in enumerate(ESTACOES):
    for dia in range(7):
        for bloco in range(2):                    # dois blocos por dia
            alinhamento = base + timedelta(days=dia, hours=8+bloco*6, minutes=si*7)
            guiao=[]
            # cada bloco: 3 a 4 músicas com locutor entre elas
            escolhas = random.sample(list(OBRAS), k=random.choice([3,4]))
            for oid in escolhas:
                guiao.append(trecho(oid, random.choice([0,10,20]), random.choice([45,55,65]), perfil, br, vel))
                guiao.append(fala(random.choice([10,15])))
            emissao = np.concatenate(guiao)
            import wave
            with wave.open('_e.wav','wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(fp.TAXA)
                w.writeframes((np.clip(emissao,-1,1)*32767).astype('<i2').tobytes())

            achadas=[]
            m = mo.Monitor(cat, nome, ao_terminar=lambda p: achadas.append(p))
            mo.escutar_ficheiro('_e.wav', m.processar, inicio=alinhamento)
            m.terminar()
            for p in achadas:
                todas.append({
                  'estacao': nome, 'regiao': regiao,
                  'obra_id': p.obra_id, 'titulo': p.titulo, 'artista': p.artista,
                  'inicio': p.inicio.isoformat(), 'duracao_s': round(p.duracao_s),
                  'janelas': p.janelas, 'confianca': round(p.confianca_max,3),
                })
    print(f'  {nome:32s} {len([d for d in todas if d["estacao"]==nome]):3d} passagens')

json.dump({'gerado': datetime.now(timezone.utc).isoformat(),
           'periodo': [base.isoformat(), (base+timedelta(days=7)).isoformat()],
           'passagens': todas},
          open('deteccoes.json','w',encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'\nTOTAL: {len(todas)} passagens reais detetadas pelo motor')
from collections import Counter
for t,n in Counter(d['titulo'] for d in todas).most_common():
    print(f'   {t:24s} {n:3d}')
