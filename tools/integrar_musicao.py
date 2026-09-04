#!/usr/bin/env python3
"""Instala o Beatfreak Audio Cleaner numa cópia da Music AO.

   python3 tools/integrar_musicao.py /caminho/musicao-app [--simular]

Faz cópia de segurança de cada ficheiro que altera e recusa-se a avançar se
não reconhecer os pontos de inserção.
"""
import os, re, shutil, sys, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VIEW = '''
/* ============================================================
   BEATFREAK AUDIO CLEANER  (visível apenas para administração)
   Módulo isolado: todo o CSS vive dentro de .bfac e os ids levam
   o prefixo bfac-, por isso não colide com nada da Music AO.
   ============================================================ */
function viewCleaner(){
  setTimeout(()=>{
    const host=document.getElementById('cleanerHost');
    if(host && window.BeatfreakCleaner && !BeatfreakCleaner.montado())
      BeatfreakCleaner.mount(host,{esconder:['wm','reg']});
  },0);
  return `<section class="page">
    <h1 class="page-title">Beatfreak Audio Cleaner</h1>
    <p class="page-sub">Limpeza de metadados, etiquetas, medição de loudness e controlo de entrega. Os ficheiros não saem deste computador.</p>
    <div id="cleanerHost"></div>
  </section>`;
}

'''

NAV = ('      <a href="#/cleaner" data-route="cleaner" data-role="admin">'
       '<span class="nav-ico">\u25c6</span> Audio Cleaner</a>\n')


class Erro(Exception):
    pass


def backup(caminho, simular):
    b = caminho + '.antes-do-cleaner'
    if not simular and not os.path.exists(b):
        shutil.copy2(caminho, b)
    return b


def edita(caminho, mudancas, simular):
    """mudancas: lista de (descrição, procurar, substituir, já_lá_está)"""
    txt = open(caminho, encoding='utf-8').read()
    feitas = []
    for desc, proc, subst, marca in mudancas:
        if marca in txt:
            print('   já estava:', desc)
            continue
        if isinstance(proc, str):
            if proc not in txt:
                raise Erro('não encontrei o ponto de inserção para "%s" em %s' % (desc, caminho))
            txt = txt.replace(proc, subst, 1)
        else:
            m = proc.search(txt)
            if not m:
                raise Erro('não encontrei o ponto de inserção para "%s" em %s' % (desc, caminho))
            txt = txt[:m.end()] + subst + txt[m.end():]
        feitas.append(desc)
    if feitas:
        backup(caminho, simular)
        if not simular:
            open(caminho, 'w', encoding='utf-8').write(txt)
        for f in feitas:
            print('   ' + ('(simulado) ' if simular else '') + f)
    return feitas


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    alvo = os.path.abspath(sys.argv[1])
    simular = '--simular' in sys.argv

    idx = os.path.join(alvo, 'index.html')
    app = os.path.join(alvo, 'js', 'app.js')
    for f in (idx, app):
        if not os.path.exists(f):
            raise Erro('não encontrei %s — o caminho aponta mesmo para a musicao-app?' % f)

    js = os.path.join(RAIZ, 'dist', 'musicao', 'beatfreak-cleaner.js')
    css = os.path.join(RAIZ, 'dist', 'musicao', 'beatfreak-cleaner.css')
    if not os.path.exists(js):
        raise Erro('falta dist/musicao/ — corre primeiro: python3 tools/embed.py')

    print('Music AO em', alvo)
    print(' ficheiros:')
    for src, dst in ((js, os.path.join(alvo, 'js', 'beatfreak-cleaner.js')),
                     (css, os.path.join(alvo, 'css', 'beatfreak-cleaner.css'))):
        print('   ' + ('(simulado) ' if simular else '') + 'copiar ' + os.path.basename(src))
        if not simular:
            shutil.copy2(src, dst)

    print(' index.html:')
    edita(idx, [
        ('link do CSS',
         '<link rel="stylesheet" href="css/style.css">',
         '<link rel="stylesheet" href="css/style.css">\n'
         '<link rel="stylesheet" href="css/beatfreak-cleaner.css">',
         'beatfreak-cleaner.css'),
        ('item de menu',
         re.compile(r'^.*data-route="admin".*\n', re.M),
         NAV,
         'data-route="cleaner"'),
        ('script do módulo',
         re.compile(r'^.*<script src="js/app\.js".*\n', re.M).pattern and
         re.compile(r'(?=^.*<script src="js/app\.js")', re.M),
         '<script src="js/beatfreak-cleaner.js"></script>\n',
         'beatfreak-cleaner.js'),
    ], simular)

    print(' js/app.js:')
    txt = open(app, encoding='utf-8').read()
    m = re.search(r'^\s*const routes\s*=\s*\{', txt, re.M)
    if not m:
        raise Erro('não encontrei "const routes = {" em js/app.js')
    edita(app, [
        ('função viewCleaner',
         txt[m.start():m.end()],
         VIEW + txt[m.start():m.end()],
         'function viewCleaner'),
        ('rota cleaner',
         re.compile(r'^\s*const routes\s*=\s*\{', re.M),
         '\n  cleaner: viewCleaner,',
         'cleaner: viewCleaner'),
    ], simular)

    print('\n' + ('Simulação terminada, nada foi alterado.' if simular else
                  'Feito. Abre a Music AO, muda o perfil para Admin e vai a #/cleaner.'))
    print('A marca de água fica escondida por omissão — lê docs/INTEGRACAO-MUSICAO.md '
          'antes de a activares em produção.')


if __name__ == '__main__':
    try:
        main()
    except Erro as e:
        print('ERRO:', e)
        sys.exit(2)
