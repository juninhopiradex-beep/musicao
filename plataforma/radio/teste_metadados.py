"""Testa o leitor de metadados contra os três formatos, com servidor local."""
import json, threading, http.server, socketserver, time
import metadados as md

RESPOSTAS = {}
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        corpo = RESPOSTAS.get(self.path)
        if corpo is None:
            self.send_response(404); self.end_headers(); return
        d = json.dumps(corpo).encode()
        self.send_response(200); self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(d))); self.end_headers(); self.wfile.write(d)
    def log_message(self,*a): pass

RESPOSTAS['/rpc/radiomfm/streaminfo.get'] = {"type":"result","data":[{
    "title":"Rádio MFM 91.7","song":"Piradex - Gostos Antecipados",
    "track":{"artist":"Piradex","title":"Gostos Antecipados","album":"Gostos Antecipados"},
    "listeners":37,"bitrate":128,"genre":"Afro","status":"streaming"}]}
RESPOSTAS['/rpc/semtrack/streaminfo.get'] = {"type":"result","data":[{
    "title":"Rádio X","song":"Os Kwanzas - Noite de Semba","listeners":12,"bitrate":96}]}
RESPOSTAS['/rpc/jingle/streaminfo.get'] = {"type":"result","data":[{
    "title":"Rádio MFM","song":"Rádio MFM 91.7 - Ao Vivo","listeners":40,"bitrate":128}]}
RESPOSTAS['/status-json.xsl'] = {"icestats":{"source":{
    "title":"Piradex - Ngola","listeners":8,"bitrate":128}}}
RESPOSTAS['/stats'] = {"songtitle":"Piradex - Kuduro na Veia","currentlisteners":21,"bitrate":64}
RESPOSTAS['/vazio'] = {"type":"result","data":[{"title":"Rádio Y","song":"","listeners":3}]}

socketserver.TCPServer.allow_reuse_address=True
import random
PORTA=random.randint(8800,8999)
srv = socketserver.TCPServer(('127.0.0.1',PORTA), H)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.4)
B=f'http://127.0.0.1:{PORTA}'
ok=falha=0
def t(nome,cond,extra=''):
    global ok,falha
    print(('  OK  ' if cond else 'FALHA ')+f'{nome:46s} {extra}')
    ok+=cond; falha+= not cond

print('== formatos ==')
a=md.ler(B+'/rpc/radiomfm/streaminfo.get','Rádio MFM 91.7')
t('Centova com track estruturado', a and a.artista=='Piradex' and a.titulo=='Gostos Antecipados', f'{a.artista} / {a.titulo} · {a.ouvintes} ouvintes')
a2=md.ler(B+'/rpc/semtrack/streaminfo.get','Rádio X')
t('Centova só com "song"', a2 and a2.artista=='Os Kwanzas' and a2.titulo=='Noite de Semba', f'{a2.artista} / {a2.titulo}')
a3=md.ler(B+'/status-json.xsl','Y')
t('Icecast', a3 and a3.titulo=='Ngola', f'{a3.artista} / {a3.titulo}')
a4=md.ler(B+'/stats','Z')
t('Shoutcast v2', a4 and a4.titulo=='Kuduro na Veia', f'{a4.artista} / {a4.titulo} · {a4.ouvintes} ouvintes')
t('endereço inexistente devolve None', md.ler(B+'/nao-existe','X') is None)

print('\n== filtro de lixo ==')
aj=md.ler(B+'/rpc/jingle/streaminfo.get','Rádio MFM')
t('"Rádio MFM 91.7 - Ao Vivo" não é música', not aj.parece_musica, repr(aj.bruto))
av=md.ler(B+'/vazio','Rádio Y')
t('campo vazio não é música', not av.parece_musica)
t('faixa a sério é música', a.parece_musica)

print('\n== cruzamento com o motor ==')
t('motor e estação concordam', md.confere('Gostos Antecipados', a))
t('acentos e maiúsculas não estragam', md.confere('GOSTOS ANTECÍPADOS'.replace('Í','I'), a))
t('obra diferente não confere', not md.confere('Ngola', a))
t('não confere contra jingle', not md.confere('Gostos Antecipados', aj))

print('\n== descoberta do endereço ==')
u=md.descobrir_metadata('https://centova87.instainternet.com/proxy/radiomfm?mp=/live')
t('deduz metadata do URL Centova', u=='https://centova87.instainternet.com/rpc/radiomfm/streaminfo.get', u)

print('\n== registo e relatório ==')
r=md.Registo('Rádio MFM 91.7', B+'/rpc/radiomfm/streaminfo.get')
r.sondar('Gostos Antecipados'); r.sondar('Ngola'); r.sondar('Gostos Antecipados')
rel=r.relatorio()
t('relatório conta o acordo', rel['comparaveis']==3 and rel['concordam']==2, f"taxa {rel['taxa_acordo']} · {rel['ouvintes_medio']} ouvintes médios")

print(f'\n{ok} passaram, {falha} falharam')
srv.shutdown()
