#!/usr/bin/env python3
"""Gera dist/index.html: um ficheiro único, sem dependências, pronto para o GitHub Pages."""
import os, sys, datetime
sys.path.insert(0, os.path.dirname(__file__))
from bundle import bundle

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

html = open('src/index.html', encoding='utf-8').read()
css  = open('src/css/app.css', encoding='utf-8').read()
js   = bundle()

stamp = datetime.date.today().isoformat()
html = html.replace('<!--CSS-->', '<style>\n' + css + '\n</style>')
html = html.replace('<!--JS-->', '<script>\n' + js + '\n</script>')
html = html.replace('v1.0 · offline', 'v1.0 · ' + stamp + ' · offline')

os.makedirs('dist', exist_ok=True)
open('dist/index.html', 'w', encoding='utf-8').write(html)
size = len(html.encode()) / 1024
print('dist/index.html  %.1f kB  (%d linhas)' % (size, html.count('\n') + 1))
