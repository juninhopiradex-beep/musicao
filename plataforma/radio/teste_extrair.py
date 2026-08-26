"""Testa o extrator contra os padrões reais dos sites de rádio."""
from pathlib import Path
import extrair_streams as ex

CASOS = {
 # o padrão da MFM: URL à vista no rodapé
 'mfm': ('''<html><link rel="canonical" href="https://radiomfmangola.com/">
 <footer><h4>Rádio MFM 91.7</h4><p>Ao Vivo Agora</p>
 <a href="https://centova87.instainternet.com/proxy/radiomfm?mp=/live">ouvir</a>
 <script src="/wp-content/themes/x/app.js"></script></footer></html>''',
  'centova87.instainternet.com/proxy/radiomfm'),

 # plugin WordPress com config JSON — o padrão da RNA
 'proradio': ('''<html><link rel="canonical" href="https://rna.ao/rna.ao/canal-a/">
 <script>var proradio_player={"stations":[{"title":"Canal A",
 "stream_url":"https:\\/\\/stream.rna.ao:8443\\/canala","cover":"/logo.png"},
 {"title":"R\\u00e1dio 5","stream_url":"https:\\/\\/stream.rna.ao:8443\\/radio5"}]};</script>
 <img src="https://rna.ao/wp-content/uploads/logo.png"></html>''',
  'stream.rna.ao:8443/canala'),

 # HTML5 audio simples
 'audio5': ('''<html><audio id="p" controls src="https://s3.radios.pt:8120/stream.mp3"></audio>
 <link href="https://fonts.googleapis.com/css2?family=Sora" rel="stylesheet"></html>''',
  's3.radios.pt:8120/stream.mp3'),

 # data-attribute, comum em temas de rádio
 'dataattr': ('''<html><div class="player" data-stream-url="https://stream.zeno.fm/abc123xyz"
 data-title="Rádio X"></div><script src="https://code.jquery.com/jquery.min.js"></script></html>''',
  'stream.zeno.fm/abc123xyz'),

 # m3u8 (HLS)
 'hls': ('''<html><script>var cfg={file:"https://cdn.exemplo.ao/live/radio/playlist.m3u8"};</script></html>''',
  'cdn.exemplo.ao/live/radio/playlist.m3u8'),

 # página sem stream — não deve inventar
 'vazio': ('''<html><body><h1>Notícias</h1><img src="/foto.jpg">
 <script src="/js/app.js"></script><a href="https://facebook.com/radio">FB</a></body></html>''',
  None),
}

ok=falha=0
for nome,(html,esperado) in CASOS.items():
    achados = ex.extrair(html, ex._base_de(html))
    topo = achados[0]['url'] if achados else None
    if esperado is None:
        bom = not achados
        obtido = 'nada' if bom else topo
    else:
        bom = topo is not None and esperado in topo
        obtido = topo or 'NADA'
    print(('  OK  ' if bom else 'FALHA ')+f'{nome:10s} -> {str(obtido)[:72]}')
    if achados and esperado: print(f'            plataforma: {achados[0]["plataforma"]} · confiança {achados[0]["pontos"]}')
    ok+=bom; falha+=not bom

# ruído não deve entrar
html_ruido = '''<audio src="https://bom.exemplo.ao/stream.mp3"></audio>
<script src="https://cdn.exemplo.ao/wp-content/plugins/x/player.js"></script>
<img src="https://exemplo.ao/capa.jpg"><link href="https://fonts.gstatic.com/f.woff2">'''
a = ex.extrair(html_ruido)
so_bons = all('stream.mp3' in x['url'] for x in a)
print(('  OK  ' if so_bons else 'FALHA ')+f'{"filtra ruido":10s} -> {len(a)} resultado(s): {[x["url"].split("/")[-1] for x in a]}')
ok+=so_bons; falha+=not so_bons

print(f'\n{ok} passaram, {falha} falharam')
