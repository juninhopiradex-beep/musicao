#!/usr/bin/env python3
"""Capturas de ecrã da demonstração, para o README."""
import os, sys
from playwright.sync_api import sync_playwright
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
os.makedirs('docs/img', exist_ok=True)
URL = 'file://' + os.path.join(RAIZ, 'dist/musicao/exemplo.html')

def aba(pg, nome):
    pg.click('#cleanerHost .tabs button[data-tab="%s"]' % nome)
    pg.wait_for_timeout(250)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=2)
    pg.goto(URL); pg.wait_for_timeout(700)
    pg.evaluate('carregarExemplo(25)'); pg.wait_for_timeout(1200)
    pg.click('#bfac-rows tr.f'); pg.wait_for_timeout(300)
    pg.screenshot(path='docs/img/musicao-ficheiros.png')
    print('ficheiros')

    aba(pg, 'meas')
    pg.click('#bfac-measSpec'); pg.wait_for_timeout(100)   # sem espectro, mais rápido
    pg.click('#bfac-btnMeas')
    pg.wait_for_selector('#bfac-measOut:not(.hidden)', timeout=90000); pg.wait_for_timeout(900)
    pg.screenshot(path='docs/img/musicao-medicao.png')
    pg.evaluate("document.querySelector('#bfac-measWave').scrollIntoView({block:'start'})")
    pg.wait_for_timeout(400)
    pg.screenshot(path='docs/img/musicao-graficos.png')
    print('medicao')

    aba(pg, 'wm')
    pg.fill('#bfac-wmKey', 'BeatFreak Studio')
    pg.fill('#bfac-wmTrack', 'Gostos Antecipados — master v3')
    pg.fill('#bfac-wmBatch', 'Editora Kalunga\nRádio Escola\nDJ Maninho')
    pg.click('#bfac-btnWmBatch')
    pg.wait_for_function("document.querySelectorAll('#bfac-wmOut a').length>=3", timeout=180000)
    pg.wait_for_timeout(500)
    pg.screenshot(path='docs/img/musicao-marca.png')
    print('marca')

    aba(pg, 'cmp')
    pg.select_option('#bfac-cmpA', '0'); pg.select_option('#bfac-cmpB', '1')
    pg.click('#bfac-btnCmp')
    pg.wait_for_selector('#bfac-cmpOut:not(.hidden)', timeout=120000); pg.wait_for_timeout(600)
    pg.screenshot(path='docs/img/musicao-comparar.png')
    print('comparar')

    aba(pg, 'tags')
    pg.click('#bfac-btnTagRead'); pg.wait_for_timeout(400)
    pg.screenshot(path='docs/img/musicao-etiquetas.png')
    print('etiquetas')
    b.close()
