#!/usr/bin/env python3
"""Gera o módulo embebível: JS e CSS com selectores e ids isolados."""
import re, os, sys, datetime
sys.path.insert(0, os.path.dirname(__file__))
from bundle import bundle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSE = 'bfac'
PREFIXO = 'bfac-'


def _blocos(css):
    """Divide o CSS em (selector, corpo) no nível de topo."""
    i, n, out = 0, len(css), []
    while i < n:
        j = css.find('{', i)
        if j < 0:
            break
        sel = css[i:j].strip()
        depth, k = 1, j + 1
        while k < n and depth:
            if css[k] == '{': depth += 1
            elif css[k] == '}': depth -= 1
            k += 1
        out.append((sel, css[j + 1:k - 1]))
        i = k
    return out


def _selector(sel):
    partes = []
    for p in sel.split(','):
        p = p.strip()
        if not p:
            continue
        if p in (':root', 'html', 'body', 'html body'):
            partes.append('.' + CLASSE)
        elif p == '*':
            partes.append('.' + CLASSE + ',.' + CLASSE + ' *')
        elif p.startswith('.' + CLASSE):
            partes.append(p)
        else:
            partes.append('.' + CLASSE + ' ' + p)
    return ','.join(partes)


def escopar(css):
    saida = []
    for sel, corpo in _blocos(css):
        if sel.startswith('@media') or sel.startswith('@supports'):
            saida.append(sel + '{' + escopar(corpo) + '}')
        elif sel.startswith('@'):
            saida.append(sel + '{' + corpo + '}')
        else:
            saida.append(_selector(sel) + '{' + corpo + '}')
    return '\n'.join(saida)


def vista(html):
    corpo = html[html.index('<body>') + 6:html.index('</body>')]
    corpo = corpo.replace('<!--JS-->', '').strip()
    corpo = re.sub(r'id="([^"]+)"', lambda m: 'id="' + PREFIXO + m.group(1) + '"', corpo)
    return corpo


def main():
    os.chdir(ROOT)
    html = open('src/index.html', encoding='utf-8').read()
    css = open('src/css/app.css', encoding='utf-8').read()
    js = bundle()

    view = vista(html).replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')
    stamp = datetime.date.today().isoformat()

    saida = (
        '/* Beatfreak Audio Cleaner ' + stamp + ' — módulo embebível.\n'
        '   Uso:  BeatfreakCleaner.mount(document.getElementById("host"));\n'
        '   Requer beatfreak-cleaner.css. Nada sai do browser. */\n'
        '(function(){\n'
        "'use strict';\n"
        'var BFAC_EMBED=true;\n'
        + js + '\n'
        'const BFAC_VIEW=`' + view + '`;\n'
        'let BFAC_MOUNTED=false;\n'
        'window.BeatfreakCleaner={\n'
        "  versao:'1.0', data:'" + stamp + "',\n"
        '  mount(el,opts){\n'
        '    opts=opts||{};\n'
        "    if(!el) throw new Error('BeatfreakCleaner.mount: falta o elemento contentor.');\n"
        "    el.classList.add('" + CLASSE + "');\n"
        '    el.innerHTML=BFAC_VIEW;\n'
        "    BFAC_PREFIX='" + PREFIXO + "'; BFAC_ROOT=el;\n"
        '    if(opts.paleta) for(const k in opts.paleta) el.style.setProperty("--"+k,opts.paleta[k]);\n'
        '    if(opts.esconder) for(const t of opts.esconder){\n'
        "      const b=el.querySelector('.tabs button[data-tab=\"'+t+'\"]'); if(b) b.remove();\n"
        "      const p=el.querySelector('#" + PREFIXO + "p-'+t); if(p) p.remove();\n"
        '    }\n'
        '    if(opts.cabecalho!==true){ const h=el.querySelector("header"); if(h) h.remove(); }\n'
        '    bfacInit();\n'
        '    BFAC_MOUNTED=true;\n'
        '    return el;\n'
        '  },\n'
        '  montado(){ return BFAC_MOUNTED; },\n'
        '  validar:validarEntrega, REGRAS_MUSICAO,\n'
        '  analisar:analyze, medir:measure, lerWav:pcmFromWav, escreverWav:wavFromPcm,\n'
        '  marcar:wmEmbed, lerMarca:wmDetect, removerMarca:wmRemove, carga:wmPack,\n'
        '  etiquetar:writeTags, entregas:regAll, sha256:sha256,\n'
        '  adicionar(lista){ addFiles(lista); }, ficheiros(){ return FILES; },\n'
        '  analisar_tudo:scanAll, limpar_tudo:cleanAll\n'
        '};\n'
        '})();\n'
    )

    os.makedirs('dist/musicao', exist_ok=True)
    open('dist/musicao/beatfreak-cleaner.js', 'w', encoding='utf-8').write(saida)
    open('dist/musicao/beatfreak-cleaner.css', 'w', encoding='utf-8').write(
        '/* Beatfreak Audio Cleaner — estilos isolados em .' + CLASSE + ' */\n' + escopar(css))
    import shutil
    shutil.copy2('src/exemplo-musicao.html', 'dist/musicao/exemplo.html')
    print('dist/musicao/beatfreak-cleaner.js   %.1f kB' % (len(saida.encode()) / 1024))
    print('dist/musicao/beatfreak-cleaner.css  %.1f kB' % (os.path.getsize('dist/musicao/beatfreak-cleaner.css') / 1024))


if __name__ == '__main__':
    main()
