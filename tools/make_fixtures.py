#!/usr/bin/env python3
"""Gera ficheiros de teste em test/fixtures/ com metadados realistas."""
import struct, os, math, random
D=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'test','fixtures')
os.makedirs(D,exist_ok=True)
SR=44100; SEC=4; N=SR*SEC
random.seed(7)
pcm=[]
for i in range(N):
    t=i/SR; env=0.5+0.45*math.sin(2*math.pi*t/2)
    s=(0.35*math.sin(2*math.pi*55*t)+0.2*math.sin(2*math.pi*220*t)+0.1*math.sin(2*math.pi*440*t)
       +(random.uniform(-1,1)*0.06 if int(t*8)%2==0 else 0))*env*0.7
    v=max(-1,min(1,s)); pcm.append(int(v*32000))
audio=b''.join(struct.pack('<hh',v,int(v*0.96)) for v in pcm)

def ch(cid,data):
    return cid+struct.pack('<I',len(data))+data+(b'\x00' if len(data)&1 else b'')
fmt=struct.pack('<HHIIHH',1,2,SR,SR*4,4,16)
bext=(b'Master final BeatFreak'.ljust(256,b'\x00')+b'Pro Tools 2024'.ljust(32,b'\x00')+
      b'REF001'.ljust(32,b'\x00')+b'2026-08-14'+b'10:22:31'+struct.pack('<qIHHHH',0,1,0,0,0,0)+
      b'\x00'*190+b'A=PCM,F=44100,W=16,M=stereo\r\n')
lst=b'INFO'+ch(b'IART',b'Piradex\x00')+ch(b'ICMT',b'entrega distribuidora\x00')
body=b'WAVE'+ch(b'fmt ',fmt)+ch(b'bext',bext)+ch(b'iXML',b'<BWFXML><PROJECT>Album</PROJECT></BWFXML>')+ch(b'LIST',lst)+ch(b'cue ',b'\x00'*28)+ch(b'data',audio)
open(os.path.join(D,'master.wav'),'wb').write(b'RIFF'+struct.pack('<I',len(body))+body)

body2=b'WAVE'+ch(b'fmt ',fmt)+ch(b'data',audio)
open(os.path.join(D,'limpo.wav'),'wb').write(b'RIFF'+struct.pack('<I',len(body2))+body2)
print('fixtures:',os.listdir(D))
