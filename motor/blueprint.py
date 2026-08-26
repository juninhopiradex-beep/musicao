"""
VMUSICAO · Blueprint musical
============================

O objeto universal que descreve uma música ANTES de existir áudio.

Porque existe: se o resto da aplicação falar diretamente a sintaxe de um
modelo, ficas preso a esse modelo. O blueprint é a linguagem interna; cada
motor tem o seu adaptador que a traduz. Trocar de motor passa a ser escrever
um adaptador, não reescrever a aplicação.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field, asdict


# Andamentos reais dos géneros angolanos. Não são palpites — são as gamas
# a que estes géneros efetivamente se tocam.
GENEROS = {
    'kizomba':    {'bpm': (85, 95),   'escala': 'menor',
                   'timbres': ['smooth bass', 'sensual guitar', 'soft percussion'],
                   'en': 'kizomba, romantic, African rhythm, intimate'},
    'tarraxinha': {'bpm': (85, 92),   'escala': 'menor',
                   'timbres': ['heavy sub bass', 'sparse percussion'],
                   'en': 'tarraxinha, slow sensual, deep sub bass'},
    'semba':      {'bpm': (100, 120), 'escala': 'maior',
                   'timbres': ['live guitar', 'dikanza', 'acoustic drums'],
                   'en': 'semba, traditional Angolan, festive, live instruments'},
    'afrohouse':  {'bpm': (118, 124), 'escala': 'menor',
                   'timbres': ['organic percussion', 'deep sub bass', 'atmospheric pads'],
                   'en': 'afro house, organic percussion, hypnotic groove'},
    'kuduro':     {'bpm': (135, 145), 'escala': 'menor',
                   'timbres': ['hard percussion', 'synth stabs'],
                   'en': 'kuduro, energetic, shouted vocals, street energy'},
    'afrobeats':  {'bpm': (100, 112), 'escala': 'maior',
                   'timbres': ['log drums', 'bright synths'],
                   'en': 'afrobeats, laid-back groove, melodic'},
    'zouk':       {'bpm': (90, 100),  'escala': 'menor',
                   'timbres': ['smooth keys', 'melodic bass'],
                   'en': 'zouk, caribbean, romantic'},
    'afrosoul':   {'bpm': (80, 95),   'escala': 'menor',
                   'timbres': ['piano', 'strings', 'gospel choir'],
                   'en': 'afro soul, emotional, cinematic build'},
}

ESTRUTURAS = {
    'classica': ['intro', 'verso', 'pre', 'refrao', 'verso', 'pre', 'refrao', 'ponte', 'refrao', 'outro'],
    'viral':    ['refrao', 'verso', 'refrao', 'verso', 'refrao', 'ponte', 'refrao', 'outro'],
    'curta':    ['intro', 'verso', 'refrao', 'verso', 'refrao', 'outro'],
    'pista':    ['intro', 'verso', 'build', 'drop', 'verso', 'build', 'drop', 'breakdown', 'drop', 'outro'],
}

SECOES_EN = {
    'intro': 'intro', 'verso': 'verse', 'pre': 'pre-chorus', 'refrao': 'chorus',
    'ponte': 'bridge', 'outro': 'outro', 'build': 'build', 'drop': 'drop',
    'breakdown': 'breakdown',
}

VOZES = {
    'masculina': 'emotional male vocal',
    'feminina': 'emotional female vocal',
    'dueto': 'male and female duet',
    'coro': 'group choir vocals',
    'instrumental': 'instrumental, no vocals',
}


@dataclass
class Blueprint:
    titulo: str = ''
    genero: str = 'kizomba'
    duracao_s: int = 180
    bpm: int | None = None
    tonica: str = 'B'
    escala: str | None = None
    compasso: str = '4/4'
    voz: str = 'masculina'
    idioma: str = 'pt-AO'
    ambiente: list = field(default_factory=lambda: ['romantic'])
    instrumentos: list = field(default_factory=list)
    excluir: list = field(default_factory=list)
    estrutura: str = 'classica'
    letra: str = ''
    seed: int | None = None

    def __post_init__(self):
        g = GENEROS.get(self.genero)
        if not g:
            raise ValueError(f'género desconhecido: {self.genero}')
        if self.bpm is None:
            self.bpm = round(sum(g['bpm']) / 2)
        if self.escala is None:
            self.escala = g['escala']
        if not self.instrumentos:
            self.instrumentos = list(g['timbres'])

    @property
    def seccoes(self):
        return ESTRUTURAS[self.estrutura]

    def validar(self) -> list[str]:
        """Devolve os problemas encontrados. Lista vazia = está bem."""
        avisos = []
        lo, hi = GENEROS[self.genero]['bpm']
        if not (lo - 15 <= self.bpm <= hi + 15):
            avisos.append(f'{self.bpm} BPM está longe do habitual em {self.genero} ({lo}–{hi})')
        if self.duracao_s < 20:
            avisos.append('duração abaixo de 20 s não dá para estrutura nenhuma')
        if self.duracao_s > 600:
            avisos.append('acima de 10 minutos nenhum motor conhecido aguenta coerência')
        if self.voz == 'instrumental' and self.letra.strip():
            avisos.append('pediste instrumental mas há letra — a letra vai ser ignorada')
        if self.voz != 'instrumental' and not self.letra.strip():
            avisos.append('sem letra: o motor vai inventar — usa "instrumental" se não queres voz')
        return avisos

    def json(self):
        return json.dumps(asdict(self), ensure_ascii=False, indent=1)


# ─────────────────────────────────────────────────────────────
# Compilador: linguagem natural → blueprint
# ─────────────────────────────────────────────────────────────

_ALIAS = {
    'kizomba': 'kizomba', 'tarraxa': 'tarraxinha', 'tarraxinha': 'tarraxinha',
    'semba': 'semba', 'afro house': 'afrohouse', 'afrohouse': 'afrohouse',
    'afro-house': 'afrohouse', 'kuduro': 'kuduro', 'afrobeat': 'afrobeats',
    'afrobeats': 'afrobeats', 'zouk': 'zouk', 'afro soul': 'afrosoul',
    'afrosoul': 'afrosoul', 'soul': 'afrosoul',
}
_AMBIENTES = {
    'romântic': 'romantic', 'romantic': 'romantic', 'triste': 'melancholic',
    'sofrênc': 'heartbreak', 'melancól': 'melancholic', 'festa': 'celebratory',
    'alegre': 'uplifting', 'dançante': 'danceable', 'sensual': 'sensual',
    'nostálg': 'nostalgic', 'emotiv': 'emotional', 'emocional': 'emotional',
    'energét': 'energetic', 'calmo': 'calm',
}
_VOZES = {
    'masculin': 'masculina', 'homem': 'masculina', 'male': 'masculina',
    'feminin': 'feminina', 'mulher': 'feminina', 'female': 'feminina',
    'dueto': 'dueto', 'duet': 'dueto', 'coro': 'coro', 'choir': 'coro',
    'instrumental': 'instrumental', 'sem voz': 'instrumental',
}
_TONS = {'dó':'C','do':'C','ré':'D','re':'D','mi':'E','fá':'F','fa':'F',
         'sol':'G','lá':'A','la':'A','si':'B'}


def compilar(texto: str, **override) -> Blueprint:
    """
    Transforma uma frase solta num blueprint completo.

    Não manda o texto do utilizador direto para o modelo: extrai o que
    consegue e preenche o resto com valores certos para o género.
    """
    t = texto.lower()
    b = {}

    for chave, g in _ALIAS.items():
        if chave in t:
            b['genero'] = g
            break

    m = re.search(r'(\d{2,3})\s*bpm', t)
    if m:
        b['bpm'] = int(m.group(1))

    m = re.search(r'\b(dó|do|ré|re|mi|fá|fa|sol|lá|la|si)\s*(menor|maior|minor|major)\b', t)
    if m:
        b['tonica'] = _TONS[m.group(1)]
        b['escala'] = 'menor' if m.group(2) in ('menor', 'minor') else 'maior'
    else:
        m = re.search(r'\b([A-G])\s*(minor|major|m)\b', texto)
        if m:
            b['tonica'] = m.group(1)
            b['escala'] = 'maior' if m.group(2) == 'major' else 'menor'

    for chave, v in _VOZES.items():
        if chave in t:
            b['voz'] = v
            break

    amb = []
    for chave, v in _AMBIENTES.items():
        if chave in t and v not in amb:
            amb.append(v)
    if amb:
        b['ambiente'] = amb

    m = re.search(r'\bsem\s+([a-zà-ú\s]{3,24})', t)
    if m:
        b['excluir'] = ['no ' + m.group(1).strip()]

    m = re.search(r'(\d+)\s*(?:min|minuto)', t)
    if m:
        b['duracao_s'] = int(m.group(1)) * 60
    else:
        m = re.search(r'(\d{2,3})\s*(?:seg|segundo|s\b)', t)
        if m:
            b['duracao_s'] = int(m.group(1))

    b.update(override)
    return Blueprint(**b)


# ─────────────────────────────────────────────────────────────
# Adaptadores: blueprint → sintaxe de cada motor
# ─────────────────────────────────────────────────────────────

def para_acestep(b: Blueprint) -> dict:
    """ACE-Step espera etiquetas de estilo separadas por vírgula, e letra à parte."""
    g = GENEROS[b.genero]
    tags = [g['en']]
    tags += b.ambiente
    tags += b.instrumentos
    if b.voz != 'instrumental':
        tags.append(VOZES[b.voz])
        tags.append('Portuguese lyrics')
    else:
        tags.append(VOZES['instrumental'])
    tags.append(f'{b.bpm} BPM')
    tags.append(f'{b.tonica} {"minor" if b.escala == "menor" else "major"}')

    letra = b.letra
    if not letra and b.voz != 'instrumental':
        letra = '\n\n'.join(f'[{SECOES_EN[s]}]' for s in b.seccoes)

    return {
        'prompt': ', '.join(tags),
        'lyrics': letra,
        'audio_duration': b.duracao_s,
        'vocal_language': 'pt' if b.voz != 'instrumental' else None,
        'negative_prompt': ', '.join(b.excluir) or None,
        'seed': b.seed,
    }


def para_generico(b: Blueprint) -> dict:
    """Formato de texto simples, para motores que só aceitam uma frase."""
    d = para_acestep(b)
    p = d['prompt']
    if d['negative_prompt']:
        p += '. Avoid: ' + d['negative_prompt']
    return {'prompt': p, 'duration': b.duracao_s, 'lyrics': d['lyrics']}
