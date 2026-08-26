#!/usr/bin/env python3
"""
VMUSICAO · Servidor
===================

Aplicação completa que corre na tua máquina. Botão Gerar a sério.

    python3 servidor.py                 # motor simulado, funciona já
    python3 servidor.py --motor acestep # motor real, precisa de GPU

Depois abre  http://localhost:7800

Só usa a biblioteca padrão do Python, mais numpy/scipy/ffmpeg (que já tens
para o controlo de qualidade). Sem Node, sem build, sem framework.

Arquitetura
-----------
    browser  →  POST /api/gerar     → devolve id do trabalho
             →  GET  /api/estado/id → percentagem e fase
             →  GET  /audio/<f>     → o ficheiro para ouvir

A geração corre numa thread à parte. Um pedido HTTP nunca espera pela GPU —
é a regra que o documento repete, e é o que impede a aplicação de bloquear.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import queue
import shutil
import sys
import threading
import time
import traceback
import uuid
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

from motor import qc
from motor.blueprint import Blueprint, compilar, para_acestep, GENEROS
from motor.provider import AceStep, Simulado, melhores_de

SAIDA = AQUI / 'geracoes'
SAIDA.mkdir(exist_ok=True)


# ─────────────────────────────────────────────────────────────
# Trabalhos
# ─────────────────────────────────────────────────────────────

FASES = ['na fila', 'a preparar', 'a gerar', 'a analisar', 'a ordenar', 'pronto']

class Trabalhos:
    def __init__(self):
        self._d = {}
        self._lock = threading.Lock()

    def novo(self, pedido):
        tid = uuid.uuid4().hex[:12]
        with self._lock:
            self._d[tid] = {'id': tid, 'estado': 'na fila', 'fase': 0, 'pct': 0,
                            'pedido': pedido, 'criado': time.time(),
                            'resultado': None, 'erro': None}
        return tid

    def marcar(self, tid, **kw):
        with self._lock:
            if tid in self._d:
                self._d[tid].update(kw)

    def ver(self, tid):
        with self._lock:
            return dict(self._d.get(tid) or {})

    def lista(self, n=20):
        with self._lock:
            v = sorted(self._d.values(), key=lambda t: -t['criado'])[:n]
        return [{k: t[k] for k in ('id', 'estado', 'pct', 'criado')} | 
                {'titulo': t['pedido'].get('titulo') or t['pedido'].get('texto', '')[:40]}
                for t in v]


TRABALHOS = Trabalhos()
FILA: queue.Queue = queue.Queue()
PROVEDOR = None


def operario():
    """Consome a fila. Uma geração de cada vez — a GPU não se divide."""
    while True:
        tid = FILA.get()
        try:
            executar(tid)
        except Exception as e:
            traceback.print_exc()
            TRABALHOS.marcar(tid, estado='erro', erro=str(e)[:300], pct=100)
        finally:
            FILA.task_done()


def executar(tid):
    t = TRABALHOS.ver(tid)
    p = t['pedido']

    TRABALHOS.marcar(tid, estado='a preparar', fase=1, pct=5)
    b = compilar(p.get('texto', ''), **{k: v for k, v in {
        'titulo': p.get('titulo') or '',
        'letra': p.get('letra') or '',
        'duracao_s': int(p.get('duracao_s') or 120),
        'estrutura': p.get('estrutura') or 'classica',
    }.items() if v not in (None, '')})

    avisos = b.validar()
    n = max(1, min(8, int(p.get('candidatos') or 4)))

    pode, porque = PROVEDOR.suporta(b)
    if not pode:
        TRABALHOS.marcar(tid, estado='erro', erro=porque, pct=100)
        return

    pasta = SAIDA / tid
    pasta.mkdir(exist_ok=True)

    def progresso(i, total):
        TRABALHOS.marcar(tid, estado='a gerar', fase=2,
                         pct=10 + int(70 * i / total),
                         detalhe=f'candidato {i+1} de {total}')

    r = melhores_de(PROVEDOR, b, n=n, devolver=2, pasta=str(pasta),
                    ao_progresso=progresso)

    TRABALHOS.marcar(tid, estado='a ordenar', fase=4, pct=92)

    cands = []
    for i, c in enumerate(sorted(r['todos'], key=lambda c: -c.pontuacao)):
        esc = c in r['escolhidos']
        cands.append({
            'seed': c.seed, 'pontuacao': c.pontuacao, 'escolhido': esc,
            'passou': bool(c.passou_barreira) if c.passou_barreira is not None else None,
            'audio': f'/audio/{tid}/{Path(c.caminho).name}' if not c.erro else None,
            'eixos': (c.relatorio or {}).get('pontuacao', {}),
            'problemas': (c.relatorio or {}).get('problemas', []),
            'medidas': {k: (c.relatorio or {}).get(k) for k in
                        ('lufs_i', 'true_peak_db', 'lra_lu', 'correlacao',
                         'crista_db', 'bpm_estimado', 'duracao_s')},
            'segundos': c.segundos_gpu, 'erro': c.erro,
        })

    TRABALHOS.marcar(tid, estado='pronto', fase=5, pct=100, resultado={
        'blueprint': asdict(b),
        'prompt': para_acestep(b)['prompt'],
        'letra': para_acestep(b)['lyrics'],
        'avisos': avisos,
        'resumo': {k: v for k, v in r.items() if k not in ('escolhidos', 'todos')},
        'candidatos': cands,
        'motor': {'nome': PROVEDOR.nome, 'modelo': PROVEDOR.modelo,
                  **{k: PROVEDOR.capacidades()[k] for k in
                     ('licenca', 'comercial', 'licenca_verificada')}},
    })


# ─────────────────────────────────────────────────────────────
# HTTP
# ─────────────────────────────────────────────────────────────

class Servico(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a):
        pass

    def _cors(self):
        """
        Permite que o site (musicao no GitHub Pages) fale com este servidor.
        Os browsers deixam uma página HTTPS chamar localhost — é a exceção
        que torna isto possível sem certificados nem túneis.
        """
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Max-Age', '86400')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header('Content-Length', '0')
        self.end_headers()

    def _resposta(self, corpo, tipo='application/json', codigo=200, extra=None):
        if isinstance(corpo, (dict, list)):
            corpo = json.dumps(corpo, ensure_ascii=False).encode()
        elif isinstance(corpo, str):
            corpo = corpo.encode()
        self.send_response(codigo)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(corpo)))
        self.send_header('Cache-Control', 'no-store')
        self._cors()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        caminho = unquote(urlparse(self.path).path)

        if caminho in ('/', '/index.html'):
            return self._resposta((AQUI / 'ui.html').read_text(encoding='utf-8'),
                                  'text/html; charset=utf-8')

        if caminho == '/api/generos':
            return self._resposta({
                'generos': [{'id': k, 'bpm': v['bpm'], 'escala': v['escala']}
                            for k, v in GENEROS.items()],
                'motor': {'nome': PROVEDOR.nome, 'modelo': PROVEDOR.modelo,
                          **PROVEDOR.capacidades()},
            })

        if caminho == '/api/trabalhos':
            return self._resposta(TRABALHOS.lista())

        if caminho.startswith('/api/estado/'):
            t = TRABALHOS.ver(caminho.rsplit('/', 1)[-1])
            if not t:
                return self._resposta({'erro': 'não existe'}, codigo=404)
            t.pop('pedido', None)
            return self._resposta(t)

        if caminho.startswith('/audio/'):
            partes = caminho.split('/')[2:]
            # nada de subir na árvore de pastas
            if len(partes) != 2 or any(p in ('', '.', '..') or '/' in p for p in partes):
                return self._resposta({'erro': 'caminho inválido'}, codigo=400)
            f = (SAIDA / partes[0] / partes[1]).resolve()
            if not str(f).startswith(str(SAIDA.resolve())) or not f.exists():
                return self._resposta({'erro': 'não existe'}, codigo=404)
            dados = f.read_bytes()
            tipo = mimetypes.guess_type(str(f))[0] or 'audio/wav'
            self.send_response(200)
            self.send_header('Content-Type', tipo)
            self.send_header('Content-Length', str(len(dados)))
            self.send_header('Accept-Ranges', 'none')
            self._cors()
            self.end_headers()
            return self.wfile.write(dados)

        return self._resposta({'erro': 'não existe'}, codigo=404)

    def do_POST(self):
        caminho = urlparse(self.path).path
        n = int(self.headers.get('Content-Length') or 0)
        if n > 200_000:
            return self._resposta({'erro': 'pedido grande demais'}, codigo=413)
        try:
            corpo = json.loads(self.rfile.read(n) or b'{}')
        except json.JSONDecodeError:
            return self._resposta({'erro': 'JSON inválido'}, codigo=400)

        if caminho == '/api/gerar':
            if not (corpo.get('texto') or '').strip():
                return self._resposta({'erro': 'descreve a música'}, codigo=400)
            tid = TRABALHOS.novo(corpo)
            FILA.put(tid)
            return self._resposta({'id': tid, 'na_fila': FILA.qsize()})

        return self._resposta({'erro': 'não existe'}, codigo=404)


def main():
    global PROVEDOR
    ap = argparse.ArgumentParser()
    ap.add_argument('--motor', default='simulado', choices=['simulado', 'acestep'])
    ap.add_argument('--qualidade', default='padrao', choices=['rapido', 'padrao', 'estudio'])
    ap.add_argument('--porta', type=int, default=7800)
    ap.add_argument('--limpar', action='store_true', help='apaga as gerações antigas')
    a = ap.parse_args()

    if a.limpar and SAIDA.exists():
        shutil.rmtree(SAIDA); SAIDA.mkdir()

    PROVEDOR = AceStep(a.qualidade) if a.motor == 'acestep' else Simulado()

    threading.Thread(target=operario, daemon=True).start()

    print(f'\n  VMUSICAO')
    print(f'  motor .... {PROVEDOR.nome} · {PROVEDOR.modelo or "—"}')
    if a.motor == 'simulado':
        print(f'  aviso .... motor SIMULADO — produz áudio sintético, não música.')
        print(f'             serve para veres a cadeia toda a funcionar sem GPU.')
    else:
        c = PROVEDOR.capacidades()
        print(f'  licença .. {c["licenca"]} · verificada: {c["licenca_verificada"]}')
        if not c['licenca_verificada']:
            print(f'             confirma na página oficial antes de faturar.')
    print(f'\n  →  http://localhost:{a.porta}')
    print(f'  →  ou usa o site: juninhopiradex-beep.github.io/musicao/#/criar')
    print(f'     (o botão Gerar liga-se sozinho a este servidor)\n')

    ThreadingHTTPServer(('127.0.0.1', a.porta), Servico).serve_forever()


if __name__ == '__main__':
    main()
