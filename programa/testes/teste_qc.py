"""Testa o QC contra defeitos que sabemos existir — cada um injetado de propósito."""
import subprocess, sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor import qc

FS = 48000
ok = falha = 0
def t(nome, cond, extra=''):
    global ok, falha
    print(('  OK  ' if cond else 'FALHA ') + f'{nome:44s} {extra}')
    ok += cond; falha += not cond

def musica(seg=20, bpm=122, seed=3):
    """Sinal com estrutura: acordes, baixo, bombo. Serve de referência boa."""
    rng = np.random.RandomState(seed)
    n = int(seg*FS); t_ = np.arange(n)/FS
    x = np.zeros(n)
    raiz = 220*2**(rng.randint(-4,4)/12)
    for k,iv in enumerate([0,3,7,10]):
        f = raiz*2**(iv/12)
        x += np.sin(2*np.pi*f*t_ + rng.rand())*0.16/(k+1)
        x += np.sin(2*np.pi*f*2*t_)*0.06/(k+1)
    x += np.sin(2*np.pi*(raiz/4)*t_)*0.3
    per = int(60/bpm*FS)
    for i in range(0, n-per, per):
        d = np.arange(min(per,n-i))/FS
        x[i:i+len(d)] += np.sin(2*np.pi*(110*np.exp(-d*30)+45)*d)*np.exp(-d*14)*0.5
    x /= np.abs(x).max()*1.25
    return np.column_stack([x, np.roll(x, 90)*0.97])

print('== referência boa ==')
bom = musica()
r = qc.analisar(x=bom, fs=FS)
t('sem problemas apontados', len(r.problemas)==0, str(r.problemas))
t('pontuação alta', r.pontuacao['total']>=70, f"total {r.pontuacao['total']} {r.pontuacao}")
t('LUFS num intervalo plausível', -30<r.lufs_i<-5, f'{r.lufs_i} LUFS')
t('BPM próximo de 122', abs(r.bpm_estimado-122)<8, f"{r.bpm_estimado} BPM · estab {r.bpm_estabilidade}")

print('\n== defeitos injetados ==')
mau = bom*3.5
r2 = qc.analisar(x=np.clip(mau,-1,1), fs=FS)
t('deteta clipping', any('clipad' in p for p in r2.problemas), f'{r2.amostras_clipadas} amostras')
t('penaliza na pontuação', r2.pontuacao['total'] < r.pontuacao['total'], f"{r2.pontuacao['total']} vs {r.pontuacao['total']}")

sil = bom.copy(); sil[:int(6*FS)] = 0
r3 = qc.analisar(x=sil, fs=FS)
t('deteta silêncio no início', any('início' in p for p in r3.problemas), f'{r3.silencio_inicio_s}s')

dc = bom + 0.06
r4 = qc.analisar(x=dc, fs=FS)
t('deteta offset DC', any('DC' in p for p in r4.problemas), f'{r4.offset_dc}')

inv = np.column_stack([bom[:,0], -bom[:,0]])
r5 = qc.analisar(x=inv, fs=FS)
t('deteta fase invertida', any('correlação' in p for p in r5.problemas), f'corr {r5.correlacao}')

des = np.column_stack([bom[:,0], bom[:,1]*0.25])
r6 = qc.analisar(x=des, fs=FS)
t('deteta canais desequilibrados', any('desequilibrad' in p for p in r6.problemas), f'{r6.equilibrio_db} dB')

hiss = bom + np.column_stack([np.random.randn(len(bom))*0.05]*2)
b,a = __import__('scipy.signal',fromlist=['x']).butter(4, 11000/(FS/2), 'high')
from scipy import signal as sg
hf = bom + sg.lfilter(b,a,np.random.randn(len(bom),2),axis=0)*0.35
r7 = qc.analisar(x=hf, fs=FS)
t('deteta excesso de agudos', any('10 kHz' in p for p in r7.problemas), f'{r7.energia_agudos_pct}%')

nan = bom.copy(); nan[1000:1010] = np.nan
r8 = qc.analisar(x=nan, fs=FS)
t('deteta NaN', r8.tem_nan)

esm = np.tanh(bom*14)*0.9
r9 = qc.analisar(x=esm, fs=FS)
t('deteta dinâmica esmagada', r9.crista_db < r.crista_db, f'{r9.crista_db} vs {r.crista_db} dB')

print('\n== true peak vs pico de amostra ==')
imp = np.zeros((FS,2)); imp[::97,0]=0.98; imp[::97,1]=0.98
r10 = qc.analisar(x=imp, fs=FS)
t('true peak acima do pico de amostra', r10.true_peak_db > r10.pico_amostra_db,
  f'TP {r10.true_peak_db} vs pico {r10.pico_amostra_db} dB')

print(f'\n{ok} passaram, {falha} falharam')
