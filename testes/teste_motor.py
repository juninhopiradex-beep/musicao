"""Testa o blueprint, o compilador de prompt e o best-of-N."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from motor.blueprint import Blueprint, compilar, para_acestep, GENEROS
from motor.provider import Simulado, AceStep, melhores_de

ok=falha=0
def t(n,c,e=''):
    global ok,falha
    print(('  OK  ' if c else 'FALHA ')+f'{n:46s} {e}'); ok+=c; falha+=not c

print('== blueprint ==')
b = Blueprint(genero='kizomba')
t('BPM por omissão vem do género', b.bpm==90, f'{b.bpm} BPM')
t('escala por omissão', b.escala=='menor')
t('instrumentos por omissão', len(b.instrumentos)>0, str(b.instrumentos))
try:
    Blueprint(genero='reggaeton'); _bad=True
except ValueError: _bad=False
t('género desconhecido dá erro', not _bad)

print('\n== compilador de prompt ==')
c1 = compilar('Kizomba romântica, 88 BPM, voz masculina, em Si menor, sem guitarra elétrica')
t('apanha o género', c1.genero=='kizomba')
t('apanha o BPM', c1.bpm==88, f'{c1.bpm}')
t('apanha a voz', c1.voz=='masculina')
t('apanha o tom', c1.tonica=='B' and c1.escala=='menor', f'{c1.tonica} {c1.escala}')
t('apanha o ambiente', 'romantic' in c1.ambiente, str(c1.ambiente))
t('apanha a exclusão', any('guitarra' in e for e in c1.excluir), str(c1.excluir))

c2 = compilar('afro house instrumental de 3 minutos')
t('afro house + instrumental', c2.genero=='afrohouse' and c2.voz=='instrumental')
t('duração em minutos', c2.duracao_s==180, f'{c2.duracao_s}s')
t('BPM do género quando não dito', 118<=c2.bpm<=124, f'{c2.bpm}')

c3 = compilar('kuduro energético')
t('kuduro rápido por omissão', c3.bpm>=135, f'{c3.bpm} BPM')

print('\n== validação ==')
t('avisa BPM fora do género', any('longe' in a for a in Blueprint(genero='kizomba',bpm=170).validar()))
t('avisa letra em instrumental', any('instrumental' in a for a in
   Blueprint(voz='instrumental',letra='[Verse]\nolá').validar()))
t('avisa falta de letra', any('sem letra' in a for a in Blueprint(voz='masculina').validar()))
t('blueprint bom não avisa nada', Blueprint(voz='instrumental').validar()==[])

print('\n== adaptador ACE-Step ==')
p = para_acestep(compilar('semba festivo com dikanza, voz masculina'))
t('prompt tem género em inglês', 'semba' in p['prompt'])
t('prompt tem BPM', 'BPM' in p['prompt'], p['prompt'][:70]+'…')
t('letra esqueleto quando não há', '[chorus]' in p['lyrics'].lower())
t('idioma da voz definido', p['vocal_language']=='pt')
pi = para_acestep(compilar('afro house instrumental'))
t('instrumental sem idioma', pi['vocal_language'] is None)

print('\n== capacidades e recusa ==')
a = AceStep('estudio')
t('ACE-Step declara vozes', a.capacidades()['vozes'])
t('licença NÃO marcada como verificada', a.capacidades()['licenca_verificada'] is False)
pode,_ = a.suporta(Blueprint(duracao_s=900))
t('recusa duração acima do limite', not pode)

class SemVoz(Simulado):
    nome='sem_voz'
    def capacidades(self):
        c=super().capacidades(); c['vozes']=False; return c
pode,porque = SemVoz().suporta(Blueprint(voz='masculina'))
t('recusa vozes se o motor não as tem', not pode, porque)

print('\n== best-of-N ==')
r = melhores_de(Simulado(), Blueprint(genero='afrohouse', voz='instrumental', duracao_s=25),
                n=6, devolver=2, pasta='/tmp/vm_bon')
t('gerou 6 candidatos', r['gerados']==6)
t('devolveu 2', len(r['escolhidos'])==2)
pts=[c.pontuacao for c in r['todos']]
t('ordenou por pontuação', r['escolhidos'][0].pontuacao>=r['escolhidos'][1].pontuacao,
  f"escolhidos {[c.pontuacao for c in r['escolhidos']]} de {sorted(pts,reverse=True)}")
t('o melhor de todos foi escolhido', r['escolhidos'][0].pontuacao==max(pts))
t('cada escolhido diz se passou a barreira',
  all(c.passou_barreira is not None for c in r['escolhidos']),
  str([(c.pontuacao,c.passou_barreira) for c in r['escolhidos']]))
t('conta os que passaram a barreira', r['acima_do_minimo']+r['abaixo_do_minimo']==r['validos'],
  f"{r['acima_do_minimo']} acima, {r['abaixo_do_minimo']} abaixo")
t('relatório anexado a cada um', all(c.relatorio for c in r['escolhidos']))
t('soma o tempo de GPU', r['segundos_gpu']>0, f"{r['segundos_gpu']}s")

r2 = melhores_de(Simulado(), Blueprint(voz='instrumental', duracao_s=25),
                 n=3, minimo=999, pasta='/tmp/vm_bon2')
t('barreira impossível devolve o melhor com aviso',
  len(r2['escolhidos'])>0 and r2['aviso'] is not None, r2['aviso'])

print(f'\n{ok} passaram, {falha} falharam')
