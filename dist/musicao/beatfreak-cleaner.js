/* Beatfreak Audio Cleaner 2026-09-04 — módulo embebível.
   Uso:  BeatfreakCleaner.mount(document.getElementById("host"));
   Requer beatfreak-cleaner.css. Nada sai do browser. */
(function(){
'use strict';
var BFAC_EMBED=true;
/* ==== util.js ==== */
/* ============================ utilitários ============================ */
/* Quando o Cleaner corre embebido noutra aplicação, os ids levam prefixo e as
   consultas por classe ficam limitadas ao contentor, para não colidir. */
let BFAC_PREFIX='', BFAC_ROOT=null;
const $=id=>document.getElementById(BFAC_PREFIX+id);
const $$=sel=>(BFAC_ROOT||document).querySelectorAll(sel);
const ascii=(b,o,n)=>{let s='';for(let i=0;i<n;i++)s+=String.fromCharCode(b[o+i]);return s;};
const u32le=(b,o)=>(b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0;
const u32be=(b,o)=>(b[o]<<24|b[o+1]<<16|b[o+2]<<8|b[o+3])>>>0;
const u24be=(b,o)=>(b[o]<<16|b[o+1]<<8|b[o+2]);
const u16be=(b,o)=>(b[o]<<8|b[o+1]);
const u16le=(b,o)=>(b[o]|b[o+1]<<8);
const TD=new TextDecoder('utf-8',{fatal:false});
const TD16=new TextDecoder('utf-16',{fatal:false});
const TDL=new TextDecoder('latin1',{fatal:false});
/* Muitos ficheiros trazem UTF-8 em campos que a especificação diz ASCII.
   Tentamos UTF-8 e só caímos para latin1 se aparecer o carácter de troca. */
function decodeText(b){
  const u=TD.decode(b);
  return u.indexOf('\uFFFD')<0?u:TDL.decode(b);
}
function txt(s){return String(s).replace(/\u0000[\s\S]*$/,'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,' ').trim();}
function bytesFmt(n){
  if(n<1024) return n+' B';
  if(n<1048576) return (n/1024).toFixed(1)+' kB';
  return (n/1048576).toFixed(2)+' MB';
}
function timeFmt(s){
  if(!isFinite(s)) return '—';
  const m=Math.floor(s/60), r=s-m*60;
  return m+':'+(r<10?'0':'')+r.toFixed(3);
}
function cat(parts){
  let n=0; for(const p of parts) n+=p.length;
  const out=new Uint8Array(n); let o=0;
  for(const p of parts){ out.set(p,o); o+=p.length; }
  return out;
}

/* ---- SHA-256 em JS puro (funciona em file:// onde crypto.subtle não existe) ---- */
const _K=new Uint32Array([
0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const _rr=(x,n)=>(x>>>n)|(x<<(32-n));
function _sha_blk(H,w){
  for(let i=16;i<64;i++){
    const a=w[i-15],b=w[i-2];
    w[i]=(w[i-16]+((_rr(a,7)^_rr(a,18)^(a>>>3))>>>0)+w[i-7]+((_rr(b,17)^_rr(b,19)^(b>>>10))>>>0))>>>0;
  }
  let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
  for(let i=0;i<64;i++){
    const t1=(h+(_rr(e,6)^_rr(e,11)^_rr(e,25))+((e&f)^(~e&g))+_K[i]+w[i])>>>0;
    const t2=((_rr(a,2)^_rr(a,13)^_rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
    h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
  }
  H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
  H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
}
function sha256(bytes){
  const H=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const w=new Uint32Array(64), n=bytes.length, full=n-(n%64);
  for(let o=0;o<full;o+=64){
    for(let i=0;i<16;i++){const j=o+i*4; w[i]=((bytes[j]<<24)|(bytes[j+1]<<16)|(bytes[j+2]<<8)|bytes[j+3])>>>0;}
    _sha_blk(H,w);
  }
  const rem=n-full, tail=new Uint8Array(rem<56?64:128);
  tail.set(bytes.subarray(full)); tail[rem]=0x80;
  const bits=n*8, hi=Math.floor(bits/4294967296), lo=bits>>>0, L=tail.length;
  tail[L-8]=(hi>>>24)&255; tail[L-7]=(hi>>>16)&255; tail[L-6]=(hi>>>8)&255; tail[L-5]=hi&255;
  tail[L-4]=(lo>>>24)&255; tail[L-3]=(lo>>>16)&255; tail[L-2]=(lo>>>8)&255; tail[L-1]=lo&255;
  for(let o=0;o<L;o+=64){
    for(let i=0;i<16;i++){const j=o+i*4; w[i]=((tail[j]<<24)|(tail[j+1]<<16)|(tail[j+2]<<8)|tail[j+3])>>>0;}
    _sha_blk(H,w);
  }
  let s=''; for(let i=0;i<8;i++) s+=H[i].toString(16).padStart(8,'0');
  return s.toUpperCase();
}

/* ---- ZIP sem compressão (store) ---- */
const _crcT=(()=>{const t=new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); t[i]=c>>>0;} return t;})();
function crc32(b){let c=0xFFFFFFFF; for(let i=0;i<b.length;i++) c=_crcT[(c^b[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0;}
function makeZip(files){
  const enc=new TextEncoder(), locals=[], central=[]; let off=0;
  for(const f of files){
    const nm=enc.encode(f.name), crc=crc32(f.data), sz=f.data.length;
    const lh=new Uint8Array(30+nm.length), dv=new DataView(lh.buffer);
    dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true); dv.setUint16(6,0x0800,true);
    dv.setUint16(8,0,true); dv.setUint16(10,0,true); dv.setUint16(12,0x21,true);
    dv.setUint32(14,crc,true); dv.setUint32(18,sz,true); dv.setUint32(22,sz,true);
    dv.setUint16(26,nm.length,true); lh.set(nm,30);
    locals.push(lh,f.data);
    const ch=new Uint8Array(46+nm.length), cv=new DataView(ch.buffer);
    cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
    cv.setUint16(8,0x0800,true); cv.setUint16(12,0,true); cv.setUint16(14,0x21,true);
    cv.setUint32(16,crc,true); cv.setUint32(20,sz,true); cv.setUint32(24,sz,true);
    cv.setUint16(28,nm.length,true); cv.setUint32(42,off,true); ch.set(nm,46);
    central.push(ch); off+=lh.length+sz;
  }
  let cs=0; for(const c of central) cs+=c.length;
  const end=new Uint8Array(22), ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true); ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
  ev.setUint32(12,cs,true); ev.setUint32(16,off,true);
  return new Blob([...locals,...central,end],{type:'application/zip'});
}

/* ============================ leitura de tags ============================ */
const ID3NAMES={TIT2:'Título',TT2:'Título',TPE1:'Artista',TP1:'Artista',TPE2:'Artista do álbum',TALB:'Álbum',TAL:'Álbum',
 TCON:'Género',TYER:'Ano',TDRC:'Data',TRCK:'Faixa',TCOM:'Compositor',TENC:'Codificador',TSSE:'Definições do codificador',
 TSRC:'ISRC',TCOP:'Copyright',TPUB:'Editora',TPOS:'Disco',COMM:'Comentário',TXXX:'Tag personalizada',
 APIC:'Capa',PIC:'Capa',PRIV:'Dados privados',UFID:'Identificador único',GEOB:'Objecto embutido',WXXX:'URL',
 TBPM:'BPM',TKEY:'Tonalidade',TOWN:'Proprietário',TMED:'Suporte'};
function id3text(b,o,n){
  if(n<=0) return '';
  const enc=b[o], p=b.subarray(o+1,o+n);
  if(enc===1||enc===2) return txt(TD16.decode(p));
  if(enc===3) return txt(TD.decode(p));
  return txt(TDL.decode(p));
}
function readID3(b,base,ver,flags,size){
  const out=[]; let o=base+10; const end=base+10+size;
  if(flags&0x40){ // cabeçalho estendido
    const es=(ver===4)?(((b[o]&0x7f)<<21)|((b[o+1]&0x7f)<<14)|((b[o+2]&0x7f)<<7)|(b[o+3]&0x7f)):u32be(b,o)+4;
    o+=Math.max(6,es);
  }
  const idLen=(ver<=2)?3:4;
  let guard=0;
  while(o+idLen+(idLen===3?3:6)<=end && guard++<500){
    const id=ascii(b,o,idLen);
    if(!/^[A-Z0-9]{3,4}$/.test(id)) break;
    let fs, hdr;
    if(idLen===3){ fs=u24be(b,o+3); hdr=6; }
    else if(ver===4){ fs=((b[o+4]&0x7f)<<21)|((b[o+5]&0x7f)<<14)|((b[o+6]&0x7f)<<7)|(b[o+7]&0x7f); hdr=10; }
    else { fs=u32be(b,o+4); hdr=10; }
    if(fs<=0||o+hdr+fs>end) break;
    const d=o+hdr, name=ID3NAMES[id]||id;
    if(id==='APIC'||id==='PIC') out.push([name,'imagem embutida, '+bytesFmt(fs)]);
    else if(id==='PRIV'||id==='GEOB'||id==='UFID') out.push([name,txt(TDL.decode(b.subarray(d,Math.min(d+60,d+fs))))+' ('+bytesFmt(fs)+')']);
    else if(id==='COMM'||id==='USLT') out.push([name,id3text(b,d+3,fs-3).replace(/^\u0000+/,'')]);
    else if(id==='TXXX'||id==='WXXX') out.push([name,id3text(b,d,fs).replace(/\u0000/g,': ')]);
    else if(id[0]==='T') out.push([name,id3text(b,d,fs)]);
    else out.push([name,bytesFmt(fs)]);
    o+=hdr+fs;
  }
  return out.filter(f=>f[1]!=='');
}
function readAPE(b,itemsStart,footerOff){
  const out=[]; if(ascii(b,footerOff,8)!=='APETAGEX') return out;
  const items=u32le(b,footerOff+16); let o=itemsStart, guard=0;
  while(o+8<=footerOff && guard++<200){
    const sz=u32le(b,o); o+=8; let key='';
    while(o<b.length && b[o]!==0){ key+=String.fromCharCode(b[o]); o++; }
    o++;
    if(sz<0||o+sz>b.length) break;
    out.push([key,txt(TD.decode(b.subarray(o,o+Math.min(sz,200))))]);
    o+=sz;
    if(out.length>=items) break;
  }
  return out;
}
function readVorbis(b,o,len){
  const out=[]; const end=o+len;
  const vl=u32le(b,o); o+=4;
  if(vl>0&&o+vl<=end){ out.push(['Codificador',txt(TD.decode(b.subarray(o,o+vl)))]); o+=vl; }
  if(o+4>end) return out;
  let n=u32le(b,o); o+=4;
  for(let i=0;i<n&&o+4<=end;i++){
    const l=u32le(b,o); o+=4;
    if(l<0||o+l>end) break;
    const s=txt(TD.decode(b.subarray(o,o+Math.min(l,300)))); o+=l;
    const eq=s.indexOf('=');
    if(eq>0) out.push([s.slice(0,eq),s.slice(eq+1)]);
  }
  return out;
}

/* ==== formats.js ==== */
/* ======================= analisadores por formato ======================= */
/* --PARSERS-START-- */
const REMOVE={tag:'o_tags',art:'o_art',prod:'o_bext',extra:'o_extra',junk:'o_junk'};
function drops(kind,opts){const k=REMOVE[kind]; return k?!!opts[k]:false;}

/* ---------- MP3 ---------- */
const BR_TAB={
 '1-3':[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320],
 '1-2':[0,32,48,56,64,80,96,112,128,160,192,224,256,320,384],
 '1-1':[0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],
 '2-3':[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
 '2-2':[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
 '2-1':[0,32,48,56,64,80,96,112,128,144,160,176,192,224,256]};
const SR_TAB=[[44100,48000,32000],[22050,24000,16000],[11025,12000,8000]];
function mp3Frame(b,o){
  if(o+4>b.length) return null;
  if(b[o]!==0xff||(b[o+1]&0xe0)!==0xe0) return null;
  const vb=(b[o+1]>>3)&3; if(vb===1) return null;
  const lb=(b[o+1]>>1)&3; if(lb===0) return null;
  const layer=4-lb;                       // 1,2,3
  const vi=vb===3?0:(vb===2?1:2);         // MPEG1 / 2 / 2.5
  const brI=(b[o+2]>>4)&15; if(brI===0||brI===15) return null;
  const srI=(b[o+2]>>2)&3; if(srI===3) return null;
  const pad=(b[o+2]>>1)&1;
  const mode=(b[o+3]>>6)&3;
  const br=BR_TAB[(vi===0?1:2)+'-'+layer][brI], sr=SR_TAB[vi][srI];
  const spf=layer===1?384:(layer===2?1152:(vi===0?1152:576));
  const len=layer===1?(Math.floor(12*br*1000/sr)+pad)*4:Math.floor(spf/8*br*1000/sr)+pad;
  if(len<24) return null;
  return {len,br,sr,spf,layer,mono:mode===3,mpeg1:vi===0,ver:vi};
}
function anaMP3(b){
  const blocks=[],warn=[]; let s=0,e=b.length;
  while(s+10<=e&&ascii(b,s,3)==='ID3'&&b[s+3]<5){
    const ver=b[s+3],fl=b[s+5];
    const sz=((b[s+6]&0x7f)<<21)|((b[s+7]&0x7f)<<14)|((b[s+8]&0x7f)<<7)|(b[s+9]&0x7f);
    const tot=10+sz+((fl&0x10)?10:0);
    if(sz<=0||s+tot>e){warn.push('Cabeçalho ID3v2 com tamanho inconsistente.');break;}
    let fields=[]; try{fields=readID3(b,s,ver,fl,sz);}catch(_){}
    const hasArt=fields.some(f=>f[0]==='Capa');
    blocks.push({name:'ID3v2.'+ver,off:s,len:tot,region:'cabeçalho',kind:'tag',fields,id3:{ver,fl,sz},art:hasArt});
    s+=tot;
  }
  let more=true;
  while(more&&e>s+16){ more=false;
    if(ascii(b,e-32,8)==='APETAGEX'){
      const sz=u32le(b,e-32+12),fl=u32le(b,e-32+20),hdr=(fl&0x80000000)?32:0,st=e-sz-hdr;
      if(st>=s&&sz>32){ blocks.push({name:'APEv2',off:st,len:sz+hdr,region:'fim',kind:'tag',fields:readAPE(b,e-sz,e-32)}); e=st; more=true; continue; }
    }
    if(e-128>=s&&ascii(b,e-128,3)==='TAG'){
      const f=[['Título',txt(TDL.decode(b.subarray(e-125,e-95)))],['Artista',txt(TDL.decode(b.subarray(e-95,e-65)))],
               ['Álbum',txt(TDL.decode(b.subarray(e-65,e-35)))],['Ano',txt(TDL.decode(b.subarray(e-35,e-31)))],
               ['Comentário',txt(TDL.decode(b.subarray(e-31,e-1)))]].filter(x=>x[1]);
      let len=128,off=e-128;
      if(off-227>=s&&ascii(b,off-227,4)==='TAG+'){ len+=227; off-=227; }
      blocks.push({name:'ID3v1',off,len,region:'fim',kind:'tag',fields:f}); e=off; more=true; continue;
    }
    if(e-9>=s&&ascii(b,e-9,9)==='LYRICS200'){
      const sz=parseInt(ascii(b,e-15,6),10);
      if(sz>0&&e-sz-26>=s&&ascii(b,e-sz-26,11)==='LYRICSBEGIN'){
        blocks.push({name:'Lyrics3v2',off:e-sz-26,len:sz+26,region:'fim',kind:'tag',fields:[['Letra',bytesFmt(sz)]]});
        e=e-sz-26; more=true; continue;
      }
    }
  }
  let first=-1;
  for(let o=s;o<Math.min(e,s+1048576);o++){
    const f=mp3Frame(b,o);
    if(f&&(o+f.len>=e||mp3Frame(b,o+f.len))){first=o;break;}
  }
  if(first<0){warn.push('Não foi encontrado nenhum frame MPEG válido.'); return null;}
  if(first>s) blocks.push({name:'Bytes órfãos',off:s,len:first-s,region:'antes do áudio',kind:'junk',fields:[['Conteúdo',txt(TDL.decode(b.subarray(s,Math.min(first,s+80))))||'binário']]});
  const f0=mp3Frame(b,first);
  const xOff=4+(f0.mpeg1?(f0.mono?17:32):(f0.mono?9:17));
  let hdrFrame=null;
  if(first+xOff+4<=e){
    const t=ascii(b,first+xOff,4);
    if(t==='Xing'||t==='Info'){
      let encName='';
      for(let i=first;i<first+f0.len-4;i++){
        const g=ascii(b,i,4);
        if(g==='LAME'||g==='Lavf'||g==='Lavc'){encName=txt(TDL.decode(b.subarray(i,i+9)));break;}
      }
      hdrFrame={off:first,len:f0.len,tag:t};
      blocks.push({name:'Cabeçalho '+t+(encName?' / '+encName:''),off:first,len:f0.len,region:'primeiro frame',kind:'encoder',
        fields:[['Tipo',t==='Xing'?'VBR':'CBR'],encName?['Codificador',encName]:null].filter(Boolean)});
    }
  }
  const aStart=hdrFrame?first+f0.len:first;
  let n=0,samples=0,brs=new Set(),o=aStart;
  while(o<e){const f=mp3Frame(b,o); if(!f) break; n++; samples+=f.spf; brs.add(f.br); o+=f.len;}
  if(o<e-1) warn.push('Dados não reconhecidos no fim do fluxo ('+bytesFmt(e-o)+') — mantidos.');
  const props={'Formato':'MPEG-'+(f0.mpeg1?'1':(f0.ver===1?'2':'2.5'))+' Layer '+f0.layer,
    'Amostragem':f0.sr+' Hz','Canais':f0.mono?'mono':'estéreo',
    'Débito':brs.size>1?'VBR ('+Math.min(...brs)+'–'+Math.max(...brs)+' kbps)':f0.br+' kbps',
    'Frames':String(n),'Duração':timeFmt(samples/f0.sr)};
  return {fmt:'MP3',blocks,warn,props,audio:{off:aStart,len:e-aStart},sr:f0.sr,
    rebuild(opts){
      const segs=[]; let cur=0; const all=blocks.slice().sort((a,c)=>a.off-c.off);
      for(const bl of all){
        if(bl.off>cur) segs.push(b.subarray(cur,bl.off));
        if(bl.kind==='encoder'){
          if(opts.o_enc){
            const cp=b.slice(bl.off,bl.off+bl.len);
            for(let i=0;i<cp.length-4;i++){
              const g=ascii(cp,i,4);
              if(g==='LAME'||g==='Lavf'||g==='Lavc'){ cp.fill(0,i,Math.min(i+20,cp.length)); break; }
            }
            segs.push(cp);
          } else segs.push(b.subarray(bl.off,bl.off+bl.len));
        }
        else if(drops(bl.kind,opts)) {/* removido */}
        else if(bl.id3&&opts.o_art&&bl.art) segs.push(stripAPIC(b.subarray(bl.off,bl.off+bl.len),bl.id3.ver));
        else segs.push(b.subarray(bl.off,bl.off+bl.len));
        cur=bl.off+bl.len;
      }
      if(cur<b.length) segs.push(b.subarray(cur,b.length));
      return cat(segs);
    }};
}
function stripAPIC(tag,ver){
  if(ver<3) return tag;
  const sz=((tag[6]&0x7f)<<21)|((tag[7]&0x7f)<<14)|((tag[8]&0x7f)<<7)|(tag[9]&0x7f);
  const keep=[]; let o=10; const end=10+sz;
  while(o+10<=end){
    const id=ascii(tag,o,4);
    if(!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs=(ver===4)?(((tag[o+4]&0x7f)<<21)|((tag[o+5]&0x7f)<<14)|((tag[o+6]&0x7f)<<7)|(tag[o+7]&0x7f)):u32be(tag,o+4);
    if(fs<=0||o+10+fs>end) break;
    if(id!=='APIC') keep.push(tag.subarray(o,o+10+fs));
    o+=10+fs;
  }
  let body=0; for(const k of keep) body+=k.length;
  const hdr=tag.slice(0,10);
  hdr[5]&=~0x10;
  hdr[6]=(body>>21)&0x7f; hdr[7]=(body>>14)&0x7f; hdr[8]=(body>>7)&0x7f; hdr[9]=body&0x7f;
  return cat([hdr,...keep]);
}

/* ---------- WAV / BWF ---------- */
const WAV_KIND={'fmt ':'core','data':'core','fact':'core','ds64':'core','PEAK':'core',
 'bext':'prod','iXML':'prod','axml':'prod','_PMX':'prod','cart':'prod','umid':'prod','minf':'prod','logi':'prod',
 'ID3 ':'tag','id3 ':'tag','LIST':'tag','DISP':'tag',
 'cue ':'extra','smpl':'extra','inst':'extra','plst':'extra','adtl':'extra','labl':'extra','ltxt':'extra','note':'extra','regn':'extra','JUNK':'extra','PAD ':'extra','FLLR':'extra'};
const WAV_NAME={'bext':'BWF (Broadcast Wave)','iXML':'iXML','_PMX':'XMP','cart':'Cart (rádio)','umid':'UMID',
 'LIST':'LIST/INFO','ID3 ':'ID3 embutido','cue ':'Cue points','smpl':'Loops e afinação','JUNK':'Preenchimento'};
function readBext(b,o,n){
  const f=[['Descrição',txt(decodeText(b.subarray(o,o+256)))],['Origem',txt(decodeText(b.subarray(o+256,o+288)))],
    ['Referência',txt(decodeText(b.subarray(o+288,o+320)))],['Data',txt(decodeText(b.subarray(o+320,o+330)))],
    ['Hora',txt(decodeText(b.subarray(o+330,o+338)))]];
  if(n>602){const ch=txt(decodeText(b.subarray(o+602,o+Math.min(n,602+400)))); if(ch) f.push(['Histórico',ch]);}
  return f.filter(x=>x[1]);
}
function readLIST(b,o,n){
  const f=[]; if(ascii(b,o,4)!=='INFO') return f;
  let p=o+4; const end=o+n;
  while(p+8<=end){
    const id=ascii(b,p,4), sz=u32le(b,p+4);
    if(sz<0||p+8+sz>end) break;
    f.push([id,txt(decodeText(b.subarray(p+8,p+8+Math.min(sz,200))))]);
    p+=8+sz+(sz&1);
  }
  return f.filter(x=>x[1]);
}
function anaWAV(b){
  const blocks=[],warn=[];
  if(ascii(b,0,4)==='RF64'){warn.push('RF64 (>4 GB) não é suportado — ficheiro não alterado.'); return null;}
  let o=12, dataOff=0, dataLen=0, fmt=null, tail=b.length;
  while(o+8<=b.length){
    const id=ascii(b,o,4); let sz=u32le(b,o+4);
    if(o+8+sz>b.length){
      if(id==='data'){ sz=b.length-o-8; warn.push('Chunk data truncado — comprimento corrigido.'); }
      else { warn.push('Chunk "'+id+'" com tamanho inválido; leitura interrompida.'); tail=o; break; }
    }
    const kind=WAV_KIND[id]||'prod';
    let fields=[];
    if(id==='bext') fields=readBext(b,o+8,sz);
    else if(id==='LIST') fields=readLIST(b,o+8,sz);
    else if(id==='iXML'||id==='_PMX'||id==='axml') fields=[['Excerto',txt(TD.decode(b.subarray(o+8,o+8+Math.min(sz,220))))]];
    else if(id==='ID3 '||id==='id3 ') fields=readID3(b,o+8,b[o+11],b[o+13],sz-10);
    else if(kind!=='core') fields=[['Tamanho',bytesFmt(sz)]];
    if(id==='fmt '){ fmt={tag:u16le(b,o+8),ch:u16le(b,o+10),sr:u32le(b,o+12),bits:u16le(b,o+22)}; }
    if(id==='data'){ dataOff=o+8; dataLen=sz; }
    blocks.push({name:WAV_NAME[id]||('Chunk "'+id+'"'),id,off:o,len:8+sz+(sz&1),region:'RIFF',kind,fields,
      art:id==='LIST'&&false});
    o+=8+sz+(sz&1);
  }
  if(!fmt||!dataLen){warn.push('WAV sem chunk fmt/data legível.'); return null;}
  const bps=fmt.ch*fmt.bits/8||1;
  const props={'Formato':(fmt.tag===1?'PCM':(fmt.tag===3?'Float':(fmt.tag===0xFFFE?'PCM extensível':'codec '+fmt.tag))),
    'Amostragem':fmt.sr+' Hz','Bits':fmt.bits+' bit','Canais':String(fmt.ch),
    'Duração':timeFmt(dataLen/(fmt.sr*bps))};
  return {fmt:'WAV',blocks,warn,props,audio:{off:dataOff,len:dataLen},sr:fmt.sr,
    rebuild(opts){
      const keep=blocks.filter(bl=>!drops(bl.kind,opts)).map(bl=>b.subarray(bl.off,bl.off+bl.len));
      let n=4; for(const k of keep) n+=k.length;
      const h=new Uint8Array(12); h.set([82,73,70,70],0); h.set([87,65,86,69],8);
      new DataView(h.buffer).setUint32(4,n,true);
      return cat([h,...keep]);
    }};
}

/* ---------- FLAC ---------- */
const FLAC_T=['STREAMINFO','PADDING','APPLICATION','SEEKTABLE','VORBIS_COMMENT','CUESHEET','PICTURE'];
const FLAC_K=['core','extra','prod','extra','tag','extra','art'];
function anaFLAC(b){
  const blocks=[],warn=[]; let s=0;
  if(ascii(b,0,3)==='ID3'){
    const sz=((b[6]&0x7f)<<21)|((b[7]&0x7f)<<14)|((b[8]&0x7f)<<7)|(b[9]&0x7f);
    blocks.push({name:'ID3v2 antes do FLAC',off:0,len:10+sz,region:'cabeçalho',kind:'tag',fields:readID3(b,0,b[3],b[5],sz)});
    s=10+sz;
  }
  if(ascii(b,s,4)!=='fLaC'){warn.push('Assinatura fLaC não encontrada.'); return null;}
  let o=s+4,last=false,props={};
  while(!last&&o+4<=b.length){
    last=(b[o]&0x80)!==0; const t=b[o]&0x7f, len=u24be(b,o+1);
    if(o+4+len>b.length){warn.push('Bloco de metadados FLAC truncado.'); break;}
    const d=o+4;
    if(t===0){
      const sr=(b[d+10]<<12)|(b[d+11]<<4)|(b[d+12]>>4);
      const ch=((b[d+12]>>1)&7)+1, bits=(((b[d+12]&1)<<4)|(b[d+13]>>4))+1;
      const tot=((b[d+13]&15)*4294967296)+(u32be(b,d+14));
      props={'Amostragem':sr+' Hz','Bits':bits+' bit','Canais':String(ch),'Duração':timeFmt(tot/sr)};
      blocks.push({name:'STREAMINFO',off:o,len:4+len,region:'metadados',kind:'core',fields:[],ftype:t});
    } else {
      let f=[];
      if(t===4) f=readVorbis(b,d,len);
      else if(t===6) f=[['Imagem',bytesFmt(len)]];
      else if(t===5) f=[['Cuesheet',txt(TDL.decode(b.subarray(d,d+128)))||bytesFmt(len)]];
      else f=[['Tamanho',bytesFmt(len)]];
      blocks.push({name:FLAC_T[t]||('Bloco '+t),off:o,len:4+len,region:'metadados',kind:FLAC_K[t]||'prod',fields:f,ftype:t});
    }
    o+=4+len;
  }
  return {fmt:'FLAC',blocks,warn,props,audio:{off:o,len:b.length-o},sr:parseInt(props['Amostragem'])||44100,
    rebuild(opts){
      const keep=blocks.filter(bl=>bl.ftype!==undefined&&!drops(bl.kind,opts)&&bl.ftype!==1);
      const pre=blocks.find(bl=>bl.ftype===undefined);
      const parts=[];
      if(pre&&!drops(pre.kind,opts)) parts.push(b.subarray(pre.off,pre.off+pre.len));
      parts.push(new Uint8Array([0x66,0x4c,0x61,0x43]));
      keep.forEach((bl,i)=>{
        const c=b.slice(bl.off,bl.off+bl.len);
        c[0]=(i===keep.length-1?0x80:0)|(c[0]&0x7f);
        parts.push(c);
      });
      parts.push(b.subarray(o,b.length));
      return cat(parts);
    }};
}

/* ---------- AIFF ---------- */
const AIFF_K={'COMM':'core','SSND':'core','FVER':'core','ID3 ':'tag','NAME':'tag','AUTH':'tag','ANNO':'tag','(c) ':'tag','COMT':'tag',
 'MARK':'extra','INST':'extra','APPL':'prod','CHAN':'prod','basc':'prod','trns':'prod'};
function ext80(b,o){
  const e=u16be(b,o), hi=u32be(b,o+2), lo=u32be(b,o+6);
  if(!e&&!hi&&!lo) return 0;
  return ((e&0x8000)?-1:1)*(hi*4294967296+lo)*Math.pow(2,(e&0x7fff)-16383-63);
}
function anaAIFF(b){
  const blocks=[],warn=[]; let o=12,comm=null,ss=null;
  const aifc=ascii(b,8,4)==='AIFC';
  while(o+8<=b.length){
    const id=ascii(b,o,4), sz=u32be(b,o+4);
    if(sz<0||o+8+sz>b.length){warn.push('Chunk "'+id+'" com tamanho inválido.'); break;}
    const kind=AIFF_K[id]||'prod'; let f=[];
    if(id==='COMM'){ comm={ch:u16be(b,o+8),frames:u32be(b,o+10),bits:u16be(b,o+14),sr:ext80(b,o+16)}; }
    else if(id==='SSND'){ ss={off:o+8+8,len:sz-8}; }
    else if(id==='ID3 ') f=readID3(b,o+8,b[o+11],b[o+13],sz-10);
    else if(kind!=='core') f=[['Conteúdo',txt(decodeText(b.subarray(o+8,o+8+Math.min(sz,200))))||bytesFmt(sz)]];
    blocks.push({name:'Chunk "'+id+'"',id,off:o,len:8+sz+(sz&1),region:'FORM',kind,fields:f});
    o+=8+sz+(sz&1);
  }
  if(!comm||!ss){warn.push('AIFF sem COMM/SSND legível.'); return null;}
  const props={'Formato':aifc?'AIFC':'AIFF','Amostragem':Math.round(comm.sr)+' Hz','Bits':comm.bits+' bit',
    'Canais':String(comm.ch),'Duração':timeFmt(comm.frames/(comm.sr||44100))};
  return {fmt:aifc?'AIFC':'AIFF',blocks,warn,props,audio:ss,sr:Math.round(comm.sr)||44100,
    rebuild(opts){
      const order=['FVER','COMM','SSND'];
      const keep=blocks.filter(bl=>!drops(bl.kind,opts))
        .sort((x,y)=>(order.indexOf(x.id)+1||99)-(order.indexOf(y.id)+1||99)||x.off-y.off)
        .map(bl=>b.subarray(bl.off,bl.off+bl.len));
      let n=4; for(const k of keep) n+=k.length;
      const h=b.slice(0,12); new DataView(h.buffer).setUint32(4,n,false);
      return cat([h,...keep]);
    }};
}

/* ---------- M4A / MP4 ---------- */
const M4A_NAMES={'\xa9nam':'Título','\xa9ART':'Artista','aART':'Artista do álbum','\xa9alb':'Álbum','\xa9day':'Ano',
 '\xa9cmt':'Comentário','\xa9gen':'Género','\xa9wrt':'Compositor','\xa9too':'Codificador','covr':'Capa',
 'cprt':'Copyright','\xa9lyr':'Letra','trkn':'Faixa','disk':'Disco','\xa9grp':'Agrupamento','desc':'Descrição'};
function m4aWalk(b,start,end,cb,depth){
  let o=start;
  while(o+8<=end){
    let sz=u32be(b,o); const t=ascii(b,o,0)+ascii(b,o+4,4); let hdr=8;
    if(sz===1){ sz=u32be(b,o+8)*4294967296+u32be(b,o+12); hdr=16; }
    else if(sz===0) sz=end-o;
    if(sz<hdr||o+sz>end) break;
    cb(t,o,sz,hdr,depth);
    if(['moov','trak','mdia','minf','stbl','edts','udta','meta','ilst'].includes(t)&&depth<6){
      const s2=t==='meta'?o+hdr+4:o+hdr;
      m4aWalk(b,s2,o+sz,cb,depth+1);
    }
    o+=sz;
  }
}
function anaM4A(b){
  const blocks=[],warn=[],props={}; const kill=[];
  let mdat=null,tsc=0,dur=0;
  m4aWalk(b,0,b.length,(t,o,sz,hdr,d)=>{
    if(t==='mdat') mdat={off:o+hdr,len:sz-hdr};
    if(t==='mvhd'){ const v=b[o+hdr]; tsc=u32be(b,o+hdr+(v===1?20:12)); dur=v===1?u32be(b,o+hdr+28):u32be(b,o+hdr+16); }
    if(t==='udta'||(t==='meta'&&d<=1)||t==='uuid'){ kill.push({t,o,sz,hdr}); }
    if(M4A_NAMES[t]&&d>=1){
      let val='';
      const dv=o+hdr;
      if(ascii(b,dv+4,4)==='data'){
        const fl=u32be(b,dv+8)&0xffffff, p=dv+16, n=u32be(b,dv)-16;
        if(t==='covr') val='imagem embutida, '+bytesFmt(n);
        else if(fl===1) val=txt(TD.decode(b.subarray(p,p+Math.min(n,240))));
        else val=bytesFmt(n);
      }
      if(val) blocks.push({name:M4A_NAMES[t],off:o,len:sz,region:'ilst',kind:t==='covr'?'art':'tag',fields:[[M4A_NAMES[t],val]],atom:t,inline:true});
    }
  },0);
  if(!mdat){warn.push('Atom mdat não encontrado.'); return null;}
  for(const k of kill) blocks.push({name:k.t==='uuid'?'XMP / uuid':(k.t==='udta'?'udta (metadados de utilizador)':'meta'),
    off:k.o,len:k.sz,region:'moov',kind:'tag',fields:[['Tamanho',bytesFmt(k.sz)]],atom:k.t,killable:true});
  if(tsc&&dur) props['Duração']=timeFmt(dur/tsc);
  props['Contentor']='MP4 / M4A';
  props['Nota']='os atoms são substituídos por "free" do mesmo tamanho para não deslocar o áudio';
  return {fmt:'M4A',blocks,warn,props,audio:mdat,sr:44100,
    rebuild(opts){
      const out=b.slice();
      for(const bl of blocks){
        let go=false;
        if(bl.killable) go=!!opts.o_tags;
        else if(bl.inline) go=opts.o_tags?false:(bl.kind==='art'&&!!opts.o_art);
        if(!go) continue;
        out.fill(0,bl.off+8,bl.off+bl.len);
        out[bl.off+4]=0x66; out[bl.off+5]=0x72; out[bl.off+6]=0x65; out[bl.off+7]=0x65;
      }
      return out;
    }};
}

function analyze(bytes,name){
  const ext=(name.split('.').pop()||'').toLowerCase();
  const m=ascii(bytes,0,4);
  try{
    if(m==='RIFF'&&ascii(bytes,8,4)==='WAVE') return anaWAV(bytes);
    if(m==='RF64') return anaWAV(bytes);
    if(m==='FORM'&&/AIF[FC]/.test(ascii(bytes,8,4))) return anaAIFF(bytes);
    if(m==='fLaC'||(ascii(bytes,0,3)==='ID3'&&ext==='flac')) return anaFLAC(bytes);
    if(ascii(bytes,4,4)==='ftyp') return anaM4A(bytes);
    if(ascii(bytes,0,3)==='ID3'||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0)||ext==='mp3') return anaMP3(bytes);
    if(m==='OggS') return {fmt:'OGG',blocks:[],warn:['Ogg/Opus ainda não é suportado para limpeza — a reescrita das páginas exige recalcular CRC.'],props:{},audio:{off:0,len:bytes.length},rebuild:()=>bytes};
  }catch(err){ return {fmt:ext.toUpperCase()||'?',blocks:[],warn:['Erro a ler o ficheiro: '+err.message],props:{},audio:{off:0,len:bytes.length},rebuild:()=>bytes}; }
  return null;
}
/* --PARSERS-END-- */


/* ==== pcm.js ==== */
/* =========================================================================
   pcm.js — leitura e escrita de PCM a partir de WAV, sem perder a
   profundidade de bits original. As amostras inteiras ficam guardadas em
   Float64Array em unidades de LSB (não normalizadas), para que marcar e
   desmarcar seja exacto ao inteiro.
   ========================================================================= */

function pcmFromWav(bytes){
  if(ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WAVE') return null;
  let o=12, fmt=null, dataOff=0, dataLen=0;
  while(o+8<=bytes.length){
    const id=ascii(bytes,o,4); let sz=u32le(bytes,o+4);
    if(o+8+sz>bytes.length){ if(id==='data') sz=bytes.length-o-8; else break; }
    if(id==='fmt '){
      fmt={tag:u16le(bytes,o+8),ch:u16le(bytes,o+10),sr:u32le(bytes,o+12),bits:u16le(bytes,o+22)};
      if(fmt.tag===0xFFFE&&sz>=40) fmt.tag=u16le(bytes,o+32);
    }
    if(id==='data'){ dataOff=o+8; dataLen=sz; }
    o+=8+sz+(sz&1);
  }
  if(!fmt||!dataLen) return null;
  const isFloat=fmt.tag===3, bits=fmt.bits, ch=fmt.ch;
  const bps=bits>>3, frame=bps*ch, frames=Math.floor(dataLen/frame);
  if(![8,16,24,32].includes(bits)) return null;
  const data=[]; for(let c=0;c<ch;c++) data.push(new Float64Array(frames));
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<frames;i++){
    const base=dataOff+i*frame;
    for(let c=0;c<ch;c++){
      const p=base+c*bps;
      let v;
      if(isFloat) v=dv.getFloat32(p,true);
      else if(bits===8) v=bytes[p]-128;
      else if(bits===16) v=dv.getInt16(p,true);
      else if(bits===24) v=((bytes[p]|bytes[p+1]<<8|bytes[p+2]<<16)<<8)>>8;
      else v=dv.getInt32(p,true);
      data[c][i]=v;
    }
  }
  return {sr:fmt.sr,ch,bits,isFloat,frames,data,
    full:isFloat?1:Math.pow(2,bits-1),
    dataOff,dataLen};
}

function wavFromPcm(p){
  const bps=p.isFloat?4:(p.bits>>3), frame=bps*p.ch, dataLen=p.frames*frame;
  const out=new Uint8Array(44+dataLen+(dataLen&1));
  const dv=new DataView(out.buffer);
  out.set([82,73,70,70],0); dv.setUint32(4,36+dataLen,true); out.set([87,65,86,69],8);
  out.set([102,109,116,32],12); dv.setUint32(16,16,true);
  dv.setUint16(20,p.isFloat?3:1,true); dv.setUint16(22,p.ch,true);
  dv.setUint32(24,p.sr,true); dv.setUint32(28,p.sr*frame,true);
  dv.setUint16(32,frame,true); dv.setUint16(34,p.isFloat?32:p.bits,true);
  out.set([100,97,116,97],36); dv.setUint32(40,dataLen,true);
  const lim=p.isFloat?0:p.full-1;
  for(let i=0;i<p.frames;i++){
    const base=44+i*frame;
    for(let c=0;c<p.ch;c++){
      const q=base+c*bps; let v=p.data[c][i];
      if(p.isFloat){ dv.setFloat32(q,v,true); continue; }
      v=Math.round(v);
      if(v>lim) v=lim; if(v<-p.full) v=-p.full;
      if(p.bits===8) out[q]=v+128;
      else if(p.bits===16) dv.setInt16(q,v,true);
      else if(p.bits===24){ out[q]=v&255; out[q+1]=(v>>8)&255; out[q+2]=(v>>16)&255; }
      else dv.setInt32(q,v,true);
    }
  }
  return out;
}

/* AudioBuffer (Web Audio) -> pcm em 24 bit, para formatos que só conseguimos
   descodificar (MP3, M4A, FLAC, AIFF). Perde a relação com o ficheiro original,
   por isso só se usa quando não há caminho PCM directo. */
function pcmFromAudioBuffer(buf,bits){
  bits=bits||24;
  const full=Math.pow(2,bits-1), ch=buf.numberOfChannels, n=buf.length;
  const data=[];
  for(let c=0;c<ch;c++){
    const src=buf.getChannelData(c), dst=new Float64Array(n);
    for(let i=0;i<n;i++) dst[i]=Math.round(src[i]*full);
    data.push(dst);
  }
  return {sr:buf.sampleRate,ch,bits,isFloat:false,frames:n,data,full};
}

function pcmPeakDb(p){
  let mx=0;
  for(const c of p.data) for(let i=0;i<c.length;i++){ const a=Math.abs(c[i]); if(a>mx) mx=a; }
  return 20*Math.log10((mx/p.full)+1e-15);
}
function pcmClone(p){
  return {...p,data:p.data.map(c=>Float64Array.from(c))};
}

/* ==== dsp.js ==== */
/* ============================ análise espectral ============================ */
function fft(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1) j^=bit;
    j^=bit;
    if(i<j){const tr=re[i];re[i]=re[j];re[j]=tr;const ti=im[i];im[i]=im[j];im[j]=ti;}
  }
  for(let len=2;len<=n;len<<=1){
    const ang=-2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang), h=len>>1;
    for(let i=0;i<n;i+=len){
      let cr=1,ci=0;
      for(let k=0;k<h;k++){
        const a=i+k,b=i+k+h;
        const vr=re[b]*cr-im[b]*ci, vi=re[b]*ci+im[b]*cr;
        re[b]=re[a]-vr; im[b]=im[a]-vi; re[a]+=vr; im[a]+=vi;
        const t=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=t;
      }
    }
  }
}
const N=4096, HB=N>>1;
async function spectral(buf,log){
  const sr=buf.sampleRate, ch=buf.numberOfChannels;
  const L=buf.getChannelData(0), R=ch>1?buf.getChannelData(1):L;
  const total=buf.length;
  let hop=2048;
  const maxF=3000;
  if(Math.floor(total/hop)>maxF) hop=Math.ceil(total/maxF/64)*64;
  const nF=Math.max(1,Math.floor((total-N)/hop));
  const win=new Float32Array(N);
  for(let i=0;i<N;i++) win[i]=0.5-0.5*Math.cos(2*Math.PI*i/(N-1));
  const avg=new Float64Array(HB);
  const cols=[], envHi=new Float32Array(nF), envSideHi=new Float32Array(nF);
  const re=new Float32Array(N), im=new Float32Array(N);
  const hiBin=Math.floor(14000/(sr/N)), nyBin=HB-1;
  let sumL=0,sumR=0,sumLR=0,midE=0,sideE=0;
  for(let f=0;f<nF;f++){
    const o=f*hop;
    for(let i=0;i<N;i++){ const l=L[o+i],r=R[o+i]; re[i]=(l+r)*0.5*win[i]; im[i]=0; }
    fft(re,im);
    const col=new Float32Array(HB);
    for(let k=0;k<HB;k++){ const m=Math.sqrt(re[k]*re[k]+im[k]*im[k]); col[k]=m; avg[k]+=m; }
    cols.push(col);
    let hi=0; for(let k=hiBin;k<=nyBin;k++) hi+=col[k]*col[k];
    envHi[f]=Math.sqrt(hi);
    for(let i=0;i<N;i++){ const l=L[o+i],r=R[o+i]; re[i]=(l-r)*0.5*win[i]; im[i]=0; }
    fft(re,im);
    let sh=0; for(let k=hiBin;k<=nyBin;k++) sh+=re[k]*re[k]+im[k]*im[k];
    envSideHi[f]=Math.sqrt(sh);
    if(f%150===0){ log('a analisar… '+Math.round(100*f/nF)+'%'); await pause(); }
  }
  const step=Math.max(1,Math.floor(total/200000));
  for(let i=0;i<total;i+=step){ const l=L[i],r=R[i]; sumL+=l*l; sumR+=r*r; sumLR+=l*r; midE+=(l+r)*(l+r)/4; sideE+=(l-r)*(l-r)/4; }
  const db=new Float32Array(HB); let peak=-999;
  for(let k=0;k<HB;k++){ db[k]=20*Math.log10(avg[k]/nF+1e-12); if(db[k]>peak) peak=db[k]; }
  return {sr,nF,hop,cols,db,peak,envHi,envSideHi,
    corr:sumLR/(Math.sqrt(sumL*sumR)+1e-12), sideRatio:10*Math.log10((sideE+1e-12)/(midE+1e-12))};
}
function findNotches(db,sr,peak){
  const bw=sr/N, out=[]; const W=24;
  const from=Math.floor(300/bw), to=Math.floor((sr/2-1500)/bw);
  for(let k=from;k<to;k++){
    if(db[k]<peak-70) continue;
    let sum=0,n=0;
    for(let j=k-W;j<=k+W;j++){ if(j<0||j>=db.length||Math.abs(j-k)<4) continue; sum+=db[j]; n++; }
    const loc=sum/n;
    if(db[k]<loc-9&&db[k]<=db[k-1]&&db[k]<=db[k+1]){
      const last=out[out.length-1];
      if(last&&k-last.bin<6){ if(db[k]<last.depth0){ last.bin=k; last.depth0=db[k]; last.f=k*bw; last.depth=loc-db[k]; } }
      else out.push({bin:k,f:k*bw,depth:loc-db[k],depth0:db[k]});
    }
  }
  return out.sort((a,b)=>b.depth-a.depth).slice(0,6);
}
function periodicity(env,hop,sr){
  const n=env.length; if(n<64) return null;
  let mean=0; for(let i=0;i<n;i++) mean+=env[i]; mean/=n;
  const x=new Float32Array(n); let e0=0;
  for(let i=0;i<n;i++){ x[i]=env[i]-mean; e0+=x[i]*x[i]; }
  if(e0<=0) return null;
  const maxLag=Math.min(n>>1,Math.floor(30*sr/hop)), l0=Math.max(2,Math.floor(0.4*sr/hop));
  const c=new Float32Array(maxLag); let best=0;
  for(let l=l0;l<maxLag;l++){
    let s=0; for(let i=0;i<n-l;i++) s+=x[i]*x[i+l];
    c[l]=s/e0; if(c[l]>best) best=c[l];
  }
  let bl=0;
  for(let l=l0;l<maxLag;l++) if(c[l]>=best*0.9&&c[l]>=c[l-1]&&c[l]>=c[l+1]){ bl=l; break; }
  if(!bl) return {r:best,period:0};
  return {r:best,period:bl*hop/sr};
}
function drawSpec(sp){
  const c=$('spec'), g=c.getContext('2d'), W=c.width, H=c.height;
  const img=g.createImageData(W,H);
  const nF=sp.cols.length;
  let mx=0;
  for(const col of sp.cols) for(let k=0;k<HB;k++) if(col[k]>mx) mx=col[k];
  const ref=20*Math.log10(mx+1e-12);
  for(let x=0;x<W;x++){
    const col=sp.cols[Math.min(nF-1,Math.floor(x*nF/W))];
    for(let y=0;y<H;y++){
      const k=Math.min(HB-1,Math.floor((H-1-y)*HB/H));
      let v=(20*Math.log10(col[k]+1e-12)-ref+92)/92;
      v=Math.max(0,Math.min(1,v));
      const i=(y*W+x)*4;
      img.data[i]=Math.min(255,v*v*340); img.data[i+1]=Math.min(255,Math.pow(v,1.6)*250);
      img.data[i+2]=Math.min(255,30+Math.pow(1-v,2)*40+v*v*v*200); img.data[i+3]=255;
    }
  }
  g.putImageData(img,0,0);
  const dur=sp.nF*sp.hop/sp.sr;
  $('axMid').textContent=timeFmt(dur/2).split('.')[0]+' s';
  $('axEnd').textContent=timeFmt(dur).split('.')[0]+' s · '+Math.round(sp.sr/2000)+' kHz no topo';
}
function drawAvg(sp,notches){
  const c=$('avg'), g=c.getContext('2d'), W=c.width, H=c.height;
  g.clearRect(0,0,W,H);
  g.strokeStyle='#232b34'; g.lineWidth=1;
  for(let d=0;d<=100;d+=20){ const y=H*d/110; g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
  g.strokeStyle='#f0a637'; g.lineWidth=1.4; g.beginPath();
  for(let x=0;x<W;x++){
    const k=Math.min(HB-1,Math.floor(x*HB/W));
    const y=H-Math.max(0,Math.min(1,(sp.db[k]-sp.peak+100)/100))*H;
    x?g.lineTo(x,y):g.moveTo(x,y);
  }
  g.stroke();
  g.strokeStyle='#e2685f';
  for(const n of notches){
    const x=n.bin/HB*W;
    g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke();
  }
  const ny=sp.sr/2;
  $('axF1').textContent=Math.round(ny/4/1000)+' kHz';
  $('axF2').textContent=Math.round(ny/2/1000)+' kHz';
  $('axF3').textContent=Math.round(3*ny/4/1000)+' kHz';
  $('axNy').textContent=Math.round(ny/1000)+' kHz';
}
function bandAbs(sp,f1,f2){
  const bw=sp.sr/N; let s=0,n=0;
  for(let k=Math.floor(f1/bw);k<Math.min(HB,Math.floor(f2/bw));k++){ s+=Math.pow(10,sp.db[k]/10); n++; }
  return 10*Math.log10(s/Math.max(1,n)+1e-12);
}
const band=(sp,f1,f2)=>bandAbs(sp,f1,f2)-sp.peak;
function report(sp){
  const out=[], ny=sp.sr/2, bw=sp.sr/N;
  const ref=bandAbs(sp,1000,8000);
  let cf=ny;
  for(let f=ny-500;f>2000;f-=250){ if(bandAbs(sp,f,f+500)>ref-45){ cf=f+500; break; } }
  out.push({cls:cf<ny*0.92?'hit':'info',t:'Corte espectral',
    d:cf<ny*0.92?'A energia acaba a '+(cf/1000).toFixed(1)+' kHz, abaixo de Nyquist. O ficheiro passou por um codificador com perdas em algum momento.'
      :'O espectro estende-se até junto de Nyquist. Não há sinal de compressão com perdas.',
    m:(cf/1000).toFixed(1)+' kHz'});
  const _=bw;
  const notches=findNotches(sp.db,sp.sr,sp.peak);
  out.push({cls:notches.length?'hit':'clear',t:'Entalhes fixos no espectro',
    d:notches.length?'Buracos estreitos e persistentes em '+notches.map(n=>(n.f/1000).toFixed(2)+' kHz').join(', ')+'. É assim que várias marcas de água escondem dados — mas filtros de eliminação de banda e ressonâncias do próprio arranjo dão o mesmo desenho.'
      :'Nenhum entalhe estreito persistente. O espectro médio é contínuo.',
    m:notches.length?notches.length+' entalhes':'nenhum'});
  const b14=bandAbs(sp,14000,19000), b19=bandAbs(sp,19000,Math.min(ny,22050));
  const rise=b19-b14, anom=ny>19000&&rise>2;
  out.push({cls:anom?'hit':'clear',t:'Banda acima de 19 kHz',
    d:anom?'A energia sobe '+rise.toFixed(1)+' dB entre 14–19 kHz e 19 kHz–Nyquist. Num master normal o topo desce sempre; uma subida indica alguma coisa colocada lá em cima.'
      :'O topo desce de forma natural em direcção a Nyquist, como é esperado.',
    m:(rise>0?'+':'')+rise.toFixed(1)+' dB'});
  const p=periodicity(sp.envHi,sp.hop,sp.sr);
  out.push({cls:(p&&p.r>0.34)?'hit':'clear',t:'Repetição no tempo (banda alta)',
    d:(p&&p.r>0.34)?'A energia acima de 14 kHz repete-se de '+p.period.toFixed(2)+' em '+p.period.toFixed(2)+' s. Cargas de marca de água costumam repetir-se em ciclo — mas uma batida constante também.'
      :'Sem ciclo detectável na banda alta.',
    m:p?('r='+p.r.toFixed(2)+(p.r>0.34?' · '+p.period.toFixed(2)+' s':'')):'—'});
  let sh=0,mh=0;
  for(let i=0;i<sp.envSideHi.length;i++){ sh+=sp.envSideHi[i]; mh+=sp.envHi[i]; }
  const sideHi=20*Math.log10((sh+1e-12)/(mh+1e-12));
  out.push({cls:(sideHi>-3&&sp.sideRatio<-6)?'hit':'info',t:'Canal lateral (L−R)',
    d:(sideHi>-3&&sp.sideRatio<-6)?'A mistura é estreita mas a banda alta do canal lateral está anormalmente cheia. Vale a pena ouvir só o L−R.'
      :'A relação entre o canal lateral e o central é a esperada para esta largura de imagem.',
    m:'lado '+sp.sideRatio.toFixed(1)+' dB · alta '+sideHi.toFixed(1)+' dB'});
  out.push({cls:'info',t:'Correlação L/R',
    d:sp.corr>0.98?'Praticamente mono.':(sp.corr<0.2?'Imagem muito larga ou fases opostas — confirmar a compatibilidade mono.':'Correlação normal para uma mistura estéreo.'),
    m:sp.corr.toFixed(3)});
  return {out,notches};
}

/* ==== measure.js ==== */
/* =========================================================================
   measure.js — controlo de entrega
   Loudness por ITU-R BS.1770-4 / EBU R128, true peak com sobreamostragem,
   e um conjunto de leituras que dizem o que é que o ficheiro é mesmo.
   ========================================================================= */

/* ---------------- filtro K ---------------- */
function kFilterCoeffs(fs){
  // andar 1: prateleira alta
  const f1=1681.974450955533, G=3.999843853973347, Q1=0.7071752369554196;
  const K1=Math.tan(Math.PI*f1/fs), Vh=Math.pow(10,G/20), Vb=Math.pow(Vh,0.4996667741545416);
  const a0=1+K1/Q1+K1*K1;
  const s={b0:(Vh+Vb*K1/Q1+K1*K1)/a0, b1:2*(K1*K1-Vh)/a0, b2:(Vh-Vb*K1/Q1+K1*K1)/a0,
           a1:2*(K1*K1-1)/a0, a2:(1-K1/Q1+K1*K1)/a0};
  // andar 2: passa-alto RLB
  const f2=38.13547087602444, Q2=0.5003270373238773, K2=Math.tan(Math.PI*f2/fs);
  const d=1+K2/Q2+K2*K2;
  const h={b0:1, b1:-2, b2:1, a1:2*(K2*K2-1)/d, a2:(1-K2/Q2+K2*K2)/d};
  return [s,h];
}
function biquad(x,c){
  const y=new Float64Array(x.length);
  let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<x.length;i++){
    const xn=x[i];
    const yn=c.b0*xn+c.b1*x1+c.b2*x2-c.a1*y1-c.a2*y2;
    x2=x1; x1=xn; y2=y1; y1=yn; y[i]=yn;
  }
  return y;
}

/* ---------------- loudness ---------------- */
function blockLoudness(chans,fs,winSec,hopSec){
  const win=Math.round(fs*winSec), hop=Math.round(fs*hopSec);
  const n=chans[0].length, out=[];
  if(n<win) return out;
  for(let o=0;o+win<=n;o+=hop){
    let sum=0;
    for(const c of chans){
      let s=0;
      for(let i=o;i<o+win;i++) s+=c[i]*c[i];
      sum+=s/win;                       // peso 1.0 para L e R
    }
    out.push(-0.691+10*Math.log10(sum+1e-24));
  }
  return out;
}
function gatedLoudness(blocks){
  const abs=blocks.filter(b=>b>-70);
  if(!abs.length) return -Infinity;
  let s=0; for(const b of abs) s+=Math.pow(10,b/10);
  const mean=10*Math.log10(s/abs.length);
  const rel=blocks.filter(b=>b>-70&&b>mean-10);
  if(!rel.length) return -Infinity;
  let s2=0; for(const b of rel) s2+=Math.pow(10,b/10);
  return 10*Math.log10(s2/rel.length);
}
function loudnessRange(blocks){
  const abs=blocks.filter(b=>b>-70);
  if(abs.length<2) return 0;
  let s=0; for(const b of abs) s+=Math.pow(10,b/10);
  const mean=10*Math.log10(s/abs.length);
  const rel=abs.filter(b=>b>mean-20).sort((a,b)=>a-b);
  if(rel.length<2) return 0;
  const q=p=>rel[Math.min(rel.length-1,Math.max(0,Math.round(p*(rel.length-1))))];
  return q(0.95)-q(0.10);
}

/* ---------------- true peak ---------------- */
function tpFilter(phases,taps){
  const L=phases*taps, h=new Float64Array(L), c=(L-1)/2;
  for(let i=0;i<L;i++){
    const t=(i-c)/phases;
    const s=Math.abs(t)<1e-9?1:Math.sin(Math.PI*t)/(Math.PI*t);
    const w=0.42-0.5*Math.cos(2*Math.PI*i/(L-1))+0.08*Math.cos(4*Math.PI*i/(L-1));
    h[i]=s*w;
  }
  let g=0; for(let i=0;i<L;i+=phases) g+=h[i];
  for(let i=0;i<L;i++) h[i]/=g;
  return h;
}
function truePeak(chans,full,overDb){
  const P=4, T=12, h=tpFilter(P,T);
  const overLim=full*Math.pow(10,(overDb==null?-1:overDb)/20);
  let sp=0;
  for(const ch of chans) for(let i=0;i<ch.length;i++){ const a=Math.abs(ch[i]); if(a>sp) sp=a; }
  if(!sp) return {tp:-Infinity,sample:-Infinity,overs:[]};
  const gate=Math.min(sp,overLim)*0.9;   // só interpola perto dos picos
  let tp=sp; const overs=[];
  for(const ch of chans){
    const n=ch.length;
    for(let i=0;i<n;i++){
      if(Math.abs(ch[i])<gate) continue;
      let loc=Math.abs(ch[i]);
      for(let p=0;p<P;p++){
        let acc=0;
        for(let t=0;t<T;t++){
          const idx=i-T/2+t+1;
          if(idx<0||idx>=n) continue;
          acc+=ch[idx]*h[(T-1-t)*P+p];
        }
        const a=Math.abs(acc); if(a>loc) loc=a;
      }
      if(loc>tp) tp=loc;
      if(loc>overLim&&(!overs.length||i-overs[overs.length-1].i>32))
        overs.push({i,db:20*Math.log10(loc/full)});
    }
  }
  return {tp:20*Math.log10(tp/full),sample:20*Math.log10(sp/full),overs};
}

/* ---------------- diagnóstico do ficheiro ---------------- */
function realBitDepth(pcm){
  if(pcm.isFloat) return {bits:32,padded:0,note:'vírgula flutuante'};
  let or_=0, mx=0;
  for(const c of pcm.data) for(let i=0;i<c.length;i++){
    const v=c[i]|0; or_|=(v<0?-v:v); const a=Math.abs(v); if(a>mx) mx=a;
  }
  if(!or_) return {bits:0,padded:pcm.bits,note:'silêncio digital'};
  let low=0; while(low<32&&!((or_>>>low)&1)) low++;
  return {bits:pcm.bits-low,padded:low,
    headroom:20*Math.log10(mx/pcm.full)};
}
function clipRuns(pcm,minRun){
  minRun=minRun||3;
  const lim=pcm.isFloat?0.9999:pcm.full-1;
  let runs=0,worst=0,samples=0; const at=[];
  for(const c of pcm.data){
    let run=0;
    for(let i=0;i<c.length;i++){
      if(Math.abs(c[i])>=lim){ run++; samples++; }
      else {
        if(run>=minRun){ runs++; if(run>worst) worst=run; if(at.length<4000) at.push({i:i-run,len:run}); }
        run=0;
      }
    }
    if(run>=minRun){ runs++; if(run>worst) worst=run; if(at.length<4000) at.push({i:c.length-run,len:run}); }
  }
  return {runs,worst,samples,at};
}
function dcOffset(pcm){
  return pcm.data.map(c=>{
    let s=0; for(let i=0;i<c.length;i++) s+=c[i];
    return s/c.length/pcm.full;
  });
}
function edgeSilence(pcm){
  const th=pcm.full*Math.pow(10,-90/20), n=pcm.frames;
  let head=0,tail=0;
  outer1: for(let i=0;i<n;i++){ for(const c of pcm.data) if(Math.abs(c[i])>th) break outer1; head++; }
  outer2: for(let i=n-1;i>=0;i--){ for(const c of pcm.data) if(Math.abs(c[i])>th) break outer2; tail++; }
  return {head,tail,headSec:head/pcm.sr,tailSec:tail/pcm.sr};
}
function noiseFloor(chans,fs,full){
  const win=Math.round(fs*0.4), n=chans[0].length;
  let best=Infinity;
  for(let o=0;o+win<=n;o+=win){
    let s=0;
    for(const c of chans) for(let i=o;i<o+win;i++) s+=c[i]*c[i];
    const r=Math.sqrt(s/(win*chans.length));
    if(r>1e-9&&r<best) best=r;
  }
  return best===Infinity?-Infinity:20*Math.log10(best);
}
function monoCompat(chans){
  if(chans.length<2) return null;
  const [L,R]=chans, n=L.length;
  let eS=0,eM=0,sLR=0,sL=0,sR=0;
  for(let i=0;i<n;i++){
    const m=(L[i]+R[i])/2;
    eM+=m*m; eS+=(L[i]*L[i]+R[i]*R[i])/2;
    sLR+=L[i]*R[i]; sL+=L[i]*L[i]; sR+=R[i]*R[i];
  }
  return {loss:10*Math.log10((eM+1e-24)/(eS+1e-24)),
    corr:sLR/(Math.sqrt(sL*sR)+1e-24)};
}
function bassMonoLoss(chans,fs){
  if(chans.length<2) return null;
  // passa-baixo de 1 pólo a 120 Hz, duas passagens, só para comparar energia
  const a=(1/fs)/(1/(2*Math.PI*120)+1/fs);
  const lp=x=>{const y=new Float64Array(x.length); let v=0;
    for(let i=0;i<x.length;i++){ v+=a*(x[i]-v); y[i]=v; }
    let v2=0; for(let i=0;i<y.length;i++){ v2+=a*(y[i]-v2); y[i]=v2; }
    return y;};
  const L=lp(chans[0]), R=lp(chans[1]);
  let eM=0,eS=0;
  for(let i=0;i<L.length;i++){ const m=(L[i]+R[i])/2; eM+=m*m; eS+=(L[i]*L[i]+R[i]*R[i])/2; }
  return 10*Math.log10((eM+1e-24)/(eS+1e-24));
}

/* ---------------- alvos de entrega ---------------- */
const TARGETS=[
  {name:'Spotify / Amazon',      lufs:-14, tp:-1.0},
  {name:'Apple Music',           lufs:-16, tp:-1.0},
  {name:'YouTube',               lufs:-14, tp:-1.0},
  {name:'Broadcast EBU R128',    lufs:-23, tp:-1.0},
  {name:'Club master BeatFreak', lufs:-9,  tp:-0.3}
];

/* ---------------- ponto de entrada ---------------- */
async function measure(pcm,onProgress){
  const step=m=>{ if(onProgress) onProgress(m); };
  const norm=pcm.data.map(c=>{
    const o=new Float64Array(c.length);
    for(let i=0;i<c.length;i++) o[i]=c[i]/pcm.full;
    return o;
  });
  step('a aplicar o filtro K…'); await new Promise(r=>setTimeout(r,0));
  const [sh,hp]=kFilterCoeffs(pcm.sr);
  const k=norm.map(c=>biquad(biquad(c,sh),hp));

  step('a medir loudness…'); await new Promise(r=>setTimeout(r,0));
  const b400=blockLoudness(k,pcm.sr,0.4,0.1);
  const b3000=blockLoudness(k,pcm.sr,3.0,1.0);
  const integrated=gatedLoudness(b400);
  const lra=loudnessRange(b3000);
  const shortMax=b3000.length?Math.max(...b3000):-Infinity;
  const momentMax=b400.length?Math.max(...b400):-Infinity;

  step('a procurar o true peak…'); await new Promise(r=>setTimeout(r,0));
  const peak=truePeak(pcm.data,pcm.full,-1);

  step('a examinar as amostras…'); await new Promise(r=>setTimeout(r,0));
  let sq=0,cnt=0;
  for(const c of norm){ for(let i=0;i<c.length;i++) sq+=c[i]*c[i]; cnt+=c.length; }
  const rms=10*Math.log10(sq/cnt+1e-24);

  const depth=realBitDepth(pcm);
  const clip=clipRuns(pcm);
  const dc=dcOffset(pcm);
  const sil=edgeSilence(pcm);
  const floor=noiseFloor(norm,pcm.sr,pcm.full);
  const mono=monoCompat(norm);
  const bass=bassMonoLoss(norm,pcm.sr);

  return {sr:pcm.sr,ch:pcm.ch,bits:pcm.bits,frames:pcm.frames,duration:pcm.frames/pcm.sr,
    integrated,lra,shortMax,momentMax,truePeak:peak.tp,samplePeak:peak.sample,rms,
    crest:peak.sample-rms, plr:peak.tp-integrated,
    depth,clip,dc,silence:sil,noiseFloor:floor,mono,bassMonoLoss:bass,overs:peak.overs,
    blocks:{short:b3000,moment:b400}};
}

/* proveniência: um WAV que na verdade saiu de um codec com perdas */
function provenance(sp){
  const ny=sp.sr/2, ref=bandAbs(sp,1000,8000);
  let cf=ny;
  for(let f=ny-500;f>2000;f-=250){ if(bandAbs(sp,f,f+500)>ref-45){ cf=f+500; break; } }
  const above=bandAbs(sp,Math.min(ny-100,cf+500),Math.min(ny,cf+2000));
  const below=bandAbs(sp,Math.max(500,cf-2000),cf);
  const slope=below-above;                       // dB de queda logo acima do corte
  const guess=()=>{
    if(cf>=ny*0.95) return null;
    if(cf<14000) return 'MP3 a 96–128 kbps ou AAC a 96 kbps';
    if(cf<16500) return 'MP3 a 128–192 kbps ou AAC a 128 kbps';
    if(cf<18500) return 'MP3 a 192–256 kbps ou AAC a 192 kbps';
    if(cf<20500) return 'MP3 a 320 kbps ou AAC a 256 kbps';
    return null;
  };
  const g=guess();
  return {cutoff:cf,slope,lossy:!!g&&slope>18,guess:g};
}

/* ==== draw.js ==== */
/* =========================================================================
   draw.js — desenho em canvas: forma de onda anotada e curva de loudness
   ========================================================================= */

function css(n,fb){
  try{ return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||fb; }
  catch(_){ return fb; }
}
function fitCanvas(c){
  if(!c||typeof c.getContext!=='function') return null;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=c.clientWidth||c.width, h=+c.getAttribute('data-h')||c.height;
  c.width=Math.round(w*dpr); c.height=Math.round(h*dpr);
  /* Sem altura em CSS o elemento assume a altura do buffer e o desenho sai
     esticado pelo factor do dpr. */
  c.style.width='100%'; c.style.height=h+'px';
  const g=c.getContext('2d');
  if(!g) return null;
  g.setTransform(dpr,0,0,dpr,0,0);
  return {g,w,h};
}

/* envelope de picos: mínimo e máximo por coluna */
function envelope(pcm,cols){
  const n=pcm.frames, per=Math.max(1,Math.floor(n/cols));
  const mn=new Float32Array(cols), mx=new Float32Array(cols), rms=new Float32Array(cols);
  for(let x=0;x<cols;x++){
    const a=x*per, b=Math.min(n,a+per);
    let lo=0,hi=0,s=0,cnt=0;
    for(const c of pcm.data){
      for(let i=a;i<b;i++){
        const v=c[i]/pcm.full;
        if(v<lo) lo=v; if(v>hi) hi=v;
        s+=v*v; cnt++;
      }
    }
    mn[x]=lo; mx[x]=hi; rms[x]=cnt?Math.sqrt(s/cnt):0;
  }
  return {mn,mx,rms,per};
}

function drawWave(canvas,pcm,m){
  const fc=fitCanvas(canvas);
  if(!fc) return;
  const {g,w,h}=fc;
  const mid=h/2, cols=Math.max(200,Math.round(w));
  const env=envelope(pcm,cols), sc=x=>x*cols/w;
  const line=css('--line','#2c343d'), amber=css('--amber','#f0a637'),
        red=css('--red','#e2685f'), dim=css('--dim','#5d6975'), mut=css('--mut','#8c99a6');
  g.clearRect(0,0,w,h);

  // silêncio à cabeça e à cauda
  const px=i=>i/pcm.frames*w;
  g.fillStyle='rgba(140,153,166,0.10)';
  if(m&&m.silence.head) g.fillRect(0,0,px(m.silence.head),h);
  if(m&&m.silence.tail) g.fillRect(w-px(m.silence.tail),0,px(m.silence.tail),h);

  // grelha em dBFS
  g.strokeStyle=line; g.lineWidth=1; g.font='10px ui-monospace,monospace'; g.fillStyle=dim;
  for(const db of [-6,-12,-24]){
    const a=Math.pow(10,db/20);
    for(const s of [1,-1]){
      const y=mid-s*a*mid;
      g.beginPath(); g.moveTo(0,y+0.5); g.lineTo(w,y+0.5); g.stroke();
    }
    g.fillText(db+' dB',3,mid-a*mid-3);
  }

  // envelope
  g.strokeStyle=amber; g.globalAlpha=0.85; g.lineWidth=1;
  g.beginPath();
  for(let x=0;x<w;x++){
    const i=Math.min(cols-1,Math.floor(sc(x)));
    g.moveTo(x+0.5,mid-env.mx[i]*mid); g.lineTo(x+0.5,mid-env.mn[i]*mid);
  }
  g.stroke();
  // RMS por cima
  g.globalAlpha=0.5; g.strokeStyle=mut;
  g.beginPath();
  for(let x=0;x<w;x++){
    const i=Math.min(cols-1,Math.floor(sc(x))), y=mid-env.rms[i]*mid;
    x?g.lineTo(x+0.5,y):g.moveTo(x+0.5,y);
  }
  g.stroke();
  g.globalAlpha=1;

  if(!m) return;
  // troços colados ao fundo de escala
  g.fillStyle=red;
  for(const c of (m.clip.at||[])){
    const x=px(c.i);
    g.fillRect(Math.max(0,x-1),mid-mid*0.98,Math.max(2,px(c.len)),mid*1.96);
  }
  // overs de true peak
  g.strokeStyle=red; g.lineWidth=1;
  for(const o of (m.overs||[])){
    const x=px(o.i);
    g.beginPath(); g.moveTo(x+0.5,0); g.lineTo(x+0.5,7); g.stroke();
  }
  g.fillStyle=dim; g.font='10px ui-monospace,monospace';
  g.fillText(timeFmt(pcm.frames/pcm.sr).split('.')[0],w-38,h-4);
}

function drawLoudness(canvas,m,target){
  const fc=fitCanvas(canvas);
  if(!fc) return;
  const {g,w,h}=fc;
  const line=css('--line','#2c343d'), amber=css('--amber','#f0a637'),
        green=css('--green','#7ed6a4'), dim=css('--dim','#5d6975'), blue=css('--blue','#6fb6dd');
  g.clearRect(0,0,w,h);
  const st=m.blocks.short, mo=m.blocks.moment;
  if(!st.length&&!mo.length) return;
  const top=Math.max(-5,(m.momentMax||-10)+2), bot=Math.min(-40,(target||-14)-18);
  const y=v=>h-(Math.max(bot,Math.min(top,v))-bot)/(top-bot)*h;

  g.strokeStyle=line; g.fillStyle=dim; g.font='10px ui-monospace,monospace';
  for(let v=Math.ceil(top/6)*6;v>bot;v-=6){
    const yy=y(v);
    g.beginPath(); g.moveTo(0,yy+0.5); g.lineTo(w,yy+0.5); g.stroke();
    if(yy>14) g.fillText(v+'',3,yy-3);
  }
  // faixa do loudness range
  if(m.lra>0){
    const c=m.integrated;
    g.fillStyle='rgba(111,182,221,0.10)';
    g.fillRect(0,y(c+m.lra/2),w,y(c-m.lra/2)-y(c+m.lra/2));
  }
  // alvo
  if(target!=null){
    g.strokeStyle=green; g.setLineDash([4,4]); g.lineWidth=1;
    g.beginPath(); g.moveTo(0,y(target)+0.5); g.lineTo(w,y(target)+0.5); g.stroke();
    g.setLineDash([]);
    g.fillStyle=green; g.fillText('alvo '+target+' LUFS',w-92,y(target)-4);
  }
  // momentâneo em fundo
  g.strokeStyle='rgba(140,153,166,0.35)'; g.lineWidth=1; g.beginPath();
  mo.forEach((v,i)=>{ const x=i/(mo.length-1||1)*w, yy=y(v); i?g.lineTo(x,yy):g.moveTo(x,yy); });
  g.stroke();
  // short-term
  g.strokeStyle=amber; g.lineWidth=1.6; g.beginPath();
  st.forEach((v,i)=>{ const x=i/(st.length-1||1)*w, yy=y(v); i?g.lineTo(x,yy):g.moveTo(x,yy); });
  g.stroke();
  // integrado
  g.strokeStyle=blue; g.lineWidth=1; g.setLineDash([2,3]);
  g.beginPath(); g.moveTo(0,y(m.integrated)+0.5); g.lineTo(w,y(m.integrated)+0.5); g.stroke();
  g.setLineDash([]);
  g.fillStyle=blue;
  const yi=y(m.integrated);
  g.fillText('integrado '+m.integrated.toFixed(1),w-200,yi>16?yi-5:yi+12);
}

function drawDiff(canvas,diff,sr,full){
  const fc=fitCanvas(canvas);
  if(!fc) return;
  const {g,w,h}=fc;
  const red=css('--red','#e2685f'), line=css('--line','#2c343d'), dim=css('--dim','#5d6975');
  g.clearRect(0,0,w,h);
  const n=diff[0].length, per=Math.max(1,Math.floor(n/w));
  let mx=1e-12;
  const col=new Float32Array(w);
  for(let x=0;x<w;x++){
    const a=x*per, b=Math.min(n,a+per);
    let p=0;
    for(const c of diff) for(let i=a;i<b;i++){ const v=Math.abs(c[i]); if(v>p) p=v; }
    col[x]=p; if(p>mx) mx=p;
  }
  g.strokeStyle=red; g.globalAlpha=0.9;
  g.beginPath();
  for(let x=0;x<w;x++){
    const db=20*Math.log10((col[x]/full)+1e-12);
    const yy=h*(1-(Math.max(-80,db)+80)/80);
    g.moveTo(x+0.5,h); g.lineTo(x+0.5,yy);
  }
  g.stroke(); g.globalAlpha=1;
  g.strokeStyle=line;
  for(const db of [0,-20,-40,-60]){
    const yy=h*(1-(db+80)/80);
    g.beginPath(); g.moveTo(0,yy+0.5); g.lineTo(w,yy+0.5); g.stroke();
    g.fillStyle=dim; g.font='10px ui-monospace,monospace'; g.fillText(db+' dBFS',3,yy-3);
  }
}

/* ==== watermark.js ==== */
/* =========================================================================
   watermark.js — marca de água BFS-1 (BeatFreak Studio)

   Espalhamento em quadratura sobre uma banda alta, com chave.
   - o mapa de bins e os sinais de quadratura derivam da chave;
   - a amplitude segue o RMS do bloco, quantizado em degraus de 3 dB, para
     poder ser recalculado a partir do ficheiro já marcado;
   - a remoção reconstrói exactamente o mesmo sinal e subtrai-o, devolvendo
     as amostras inteiras originais.

   Sem a chave não há reconstrução possível, e portanto não há remoção.
   ========================================================================= */

const WM_N=32768, WM_TAPER=512, WM_BITS=128;
const WM_BANDS={alta:[15000,20000], media:[4000,9000]};
const WM_QSTEP=3;          // degrau de quantização do envelope, em dB
const WM_SILENCE=-58;      // abaixo disto o bloco fica sem marca
const WM_ENC=new TextEncoder();

function sfc32(a,b,c,d){
  return function(){
    a|=0;b|=0;c|=0;d|=0;
    const t=(((a+b)|0)+d)|0;
    d=(d+1)|0; a=b^(b>>>9); b=(c+(c<<3))|0; c=(c<<21)|(c>>>11); c=(c+t)|0;
    return (t>>>0)/4294967296;
  };
}
function wmPrng(key,label){
  const h=sha256(WM_ENC.encode(key+'|'+label));
  return sfc32(parseInt(h.slice(0,8),16),parseInt(h.slice(8,16),16),
               parseInt(h.slice(16,24),16),parseInt(h.slice(24,32),16));
}
function crc16(b){
  let c=0xFFFF;
  for(let i=0;i<b.length;i++){
    c^=b[i]<<8;
    for(let k=0;k<8;k++) c=(c&0x8000)?((c<<1)^0x1021)&0xFFFF:(c<<1)&0xFFFF;
  }
  return c;
}

/* ---------------- carga útil ---------------- */
function wmPack(o){
  const p=new Uint8Array(16);
  p[0]=0x42; p[1]=0x46; p[2]=0x53; p[3]=1;                 // 'BFS' + versão
  const h=sha256(WM_ENC.encode(String(o.track||'')));
  for(let i=0;i<6;i++) p[4+i]=parseInt(h.substr(i*2,2),16); // id da faixa
  const d=Math.max(0,Math.min(65535,Math.round(((o.date||Date.now())-Date.UTC(2000,0,1))/86400000)));
  p[10]=(d>>8)&255; p[11]=d&255;
  const c=Math.max(0,Math.min(65535,o.copy|0));
  p[12]=(c>>8)&255; p[13]=c&255;
  const k=crc16(p.subarray(0,14)); p[14]=k>>8; p[15]=k&255;
  return p;
}
function wmUnpack(p){
  if(p[0]!==0x42||p[1]!==0x46||p[2]!==0x53) return null;
  if(crc16(p.subarray(0,14))!==((p[14]<<8)|p[15])) return null;
  let id=''; for(let i=4;i<10;i++) id+=p[i].toString(16).padStart(2,'0');
  const days=(p[10]<<8)|p[11];
  return {version:p[3],trackId:id.toUpperCase(),copy:(p[12]<<8)|p[13],
    date:new Date(Date.UTC(2000,0,1)+days*86400000)};
}
const wmBits=p=>{const b=new Int8Array(WM_BITS);for(let i=0;i<WM_BITS;i++)b[i]=(p[i>>3]>>(7-(i&7)))&1;return b;};
const wmBytes=b=>{const p=new Uint8Array(16);for(let i=0;i<WM_BITS;i++)if(b[i])p[i>>3]|=1<<(7-(i&7));return p;};

/* ---------------- plano de bins ---------------- */
function wmPlan(key,sr,bandName){
  const band=WM_BANDS[bandName]||WM_BANDS.alta, bw=sr/WM_N;
  const k0=Math.max(2,Math.ceil(band[0]/bw));
  const k1=Math.min((WM_N>>1)-2,Math.floor(Math.min(band[1],sr*0.47)/bw));
  if(k1-k0<WM_BITS*6) return null;
  /* pares de bins vizinhos: o bit vive na relação entre os dois, para que
     uma rotação de fase comum (EQ, filtro, atraso curto) se anule. */
  const pairs=[]; for(let k=k0;k+1<=k1;k+=2) pairs.push([k,k+1]);
  const r=wmPrng(key,'bins-'+bandName+'-'+sr);
  for(let i=pairs.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); const t=pairs[i]; pairs[i]=pairs[j]; pairs[j]=t; }
  const per=Math.floor(pairs.length/WM_BITS);
  if(per<4) return null;
  const map=[];
  for(let b=0;b<WM_BITS;b++) map.push(pairs.slice(b*per,b*per+per));
  return {k0,k1,per,map,bw,band,bandName,sr,pairs:pairs.length};
}
function wmSigns(key,plan,blk){
  const M=plan.k1-plan.k0+1, r=wmPrng(key,'q-'+blk);
  const a=new Int8Array(M), b=new Int8Array(M);
  for(let i=0;i<M;i++){ const v=(r()*4)|0; a[i]=(v&1)?1:-1; b[i]=(v&2)?1:-1; }
  return {a,b};
}
/* sinal do bloco, RMS unitário */
function wmChip(key,plan,blk,bits){
  const re=new Float64Array(WM_N), im=new Float64Array(WM_N);
  const s=wmSigns(key,plan,blk);
  for(let bi=0;bi<WM_BITS;bi++){
    const sg=bits[bi]?1:-1;
    for(const [ka,kb] of plan.map[bi]){
      const ia=ka-plan.k0, ib=kb-plan.k0;
      re[ka]=sg*s.a[ia]; im[ka]=sg*s.b[ia];
      re[kb]=sg*s.a[ib]; im[kb]=sg*s.b[ib];
      re[WM_N-ka]=re[ka]; im[WM_N-ka]=-im[ka];
      re[WM_N-kb]=re[kb]; im[WM_N-kb]=-im[kb];
    }
  }
  for(let i=0;i<WM_N;i++) im[i]=-im[i];
  fft(re,im);
  const w=new Float64Array(WM_N);
  let e=0;
  for(let i=0;i<WM_N;i++){ const v=re[i]/WM_N; w[i]=v; e+=v*v; }
  const g=1/Math.sqrt(e/WM_N);
  for(let i=0;i<WM_N;i++) w[i]*=g;
  for(let i=0;i<WM_TAPER;i++){
    const f=0.5-0.5*Math.cos(Math.PI*i/WM_TAPER);
    w[i]*=f; w[WM_N-1-i]*=f;
  }
  return w;
}
/* ganho do bloco: RMS do bloco quantizado em degraus de 3 dB */
function wmGain(mix,off,full,strength){
  let e=0,n=0;
  for(let i=off;i<off+WM_N;i++){ const v=mix[i]/full; e+=v*v; n++; }
  const rms=20*Math.log10(Math.sqrt(e/n)+1e-15);
  if(rms<WM_SILENCE) return 0;
  const q=Math.round(rms/WM_QSTEP)*WM_QSTEP;
  return Math.pow(10,(q-strength)/20)*full;
}
function wmMix(pcm){
  const n=pcm.frames, m=new Float64Array(n), c=pcm.ch;
  for(let i=0;i<n;i++){ let s=0; for(let k=0;k<c;k++) s+=pcm.data[k][i]; m[i]=s/c; }
  return m;
}

/* ---------------- gravar ---------------- */
async function wmEmbed(pcm,key,payload,opts,onProgress){
  opts=opts||{};
  const strength=opts.strength||42, plan=wmPlan(key,pcm.sr,opts.band||'alta');
  if(!plan) return {ok:false,error:'A amostragem deste ficheiro não comporta a banda escolhida.'};
  const bits=wmBits(payload), out=pcmClone(pcm), mix=wmMix(pcm);
  const nb=Math.floor(pcm.frames/WM_N), lim=pcm.isFloat?Infinity:pcm.full-1;
  let marked=0, clipped=0;
  for(let b=0;b<nb;b++){
    const off=b*WM_N, g=wmGain(mix,off,pcm.full,strength);
    if(!g) continue;
    const w=wmChip(key,plan,b,bits);
    for(let c=0;c<out.ch;c++){
      const d=out.data[c];
      for(let i=0;i<WM_N;i++){
        let v=d[off+i]+w[i]*g;
        if(!pcm.isFloat){ v=Math.round(v); if(v>lim){v=lim;clipped++;} if(v<-pcm.full){v=-pcm.full;clipped++;} }
        d[off+i]=v;
      }
    }
    marked++;
    if(onProgress&&b%16===0){ onProgress(b/nb); await new Promise(r=>setTimeout(r,0)); }
  }
  return {ok:true,pcm:out,blocks:nb,marked,clipped,plan,strength};
}

/* ---------------- ler ---------------- */
async function wmDetect(pcm,key,opts,onProgress){
  opts=opts||{};
  const plan=wmPlan(key,pcm.sr,opts.band||'alta');
  if(!plan) return {found:false,reason:'banda incompatível'};
  const strength=opts.strength||42, mix=wmMix(pcm);
  const nb=Math.floor(pcm.frames/WM_N);
  if(nb<1) return {found:false,reason:'ficheiro demasiado curto'};
  const score=new Float64Array(WM_BITS), ctrl=new Float64Array(WM_BITS);
  const re=new Float64Array(WM_N), im=new Float64Array(WM_N);
  let used=0;
  for(let b=0;b<nb;b++){
    const off=b*WM_N, g=wmGain(mix,off,pcm.full,strength);
    if(!g) continue;
    for(let i=0;i<WM_N;i++){ re[i]=mix[off+i]/g; im[i]=0; }
    fft(re,im);
    const s=wmSigns(key,plan,b), t=wmSigns(key+'\u0000control',plan,b);
    for(let bi=0;bi<WM_BITS;bi++){
      for(const [ka,kb] of plan.map[bi]){
        const ia=ka-plan.k0, ib=kb-plan.k0;
        score[bi]+=re[ka]*s.a[ia]+im[ka]*s.b[ia]+re[kb]*s.a[ib]+im[kb]*s.b[ib];
        ctrl[bi] +=re[ka]*t.a[ia]+im[ka]*t.b[ia]+re[kb]*t.a[ib]+im[kb]*t.b[ib];
      }
    }
    used++;
    if(onProgress&&b%16===0){ onProgress(b/nb); await new Promise(r=>setTimeout(r,0)); }
  }
  if(!used) return {found:false,reason:'só silêncio'};
  const bits=new Int8Array(WM_BITS);
  let ms=0,mc=0;
  for(let i=0;i<WM_BITS;i++){ bits[i]=score[i]>0?1:0; ms+=Math.abs(score[i]); mc+=Math.abs(ctrl[i]); }
  const margin=20*Math.log10((ms/WM_BITS+1e-30)/(mc/WM_BITS+1e-30));
  const payload=wmBytes(bits), info=wmUnpack(payload);
  return {found:!!info,info,payload,bits,margin,blocks:used,plan,
    reason:info?null:'sem carga válida para esta chave'};
}

/* ---------------- remover ---------------- */
async function wmRemove(pcm,key,opts,onProgress){
  opts=opts||{};
  const det=opts.detection||await wmDetect(pcm,key,opts);
  if(!det.found) return {ok:false,error:'Não há nenhuma marca legível com esta chave, por isso não há nada para reconstruir e subtrair.'};
  const strength=opts.strength||42, plan=det.plan;
  const out=pcmClone(pcm), mix=wmMix(pcm), nb=Math.floor(pcm.frames/WM_N);
  let cleaned=0;
  for(let b=0;b<nb;b++){
    const off=b*WM_N, g=wmGain(mix,off,pcm.full,strength);
    if(!g) continue;
    const w=wmChip(key,plan,b,det.bits);
    for(let c=0;c<out.ch;c++){
      const d=out.data[c];
      for(let i=0;i<WM_N;i++){
        let v=d[off+i]-w[i]*g;
        if(!pcm.isFloat) v=Math.round(v);
        d[off+i]=v;
      }
    }
    cleaned++;
    if(onProgress&&b%16===0){ onProgress(b/nb); await new Promise(r=>setTimeout(r,0)); }
  }
  return {ok:true,pcm:out,blocks:cleaned,info:det.info};
}

/* ==== tags.js ==== */
/* =========================================================================
   tags.js — escrita de metadados.
   O ficheiro é primeiro reconstruído sem nenhuma etiqueta e só depois
   recebe as novas, para não ficarem restos da anterior.
   ========================================================================= */

const TAG_FIELDS=[
  {k:'title', label:'Título',      id3:'TIT2', vorbis:'TITLE',       riff:'INAM', aiff:'NAME'},
  {k:'artist',label:'Artista',     id3:'TPE1', vorbis:'ARTIST',      riff:'IART', aiff:'AUTH'},
  {k:'album', label:'Álbum',       id3:'TALB', vorbis:'ALBUM',       riff:'IPRD'},
  {k:'year',  label:'Ano',         id3:'TYER', vorbis:'DATE',        riff:'ICRD'},
  {k:'genre', label:'Género',      id3:'TCON', vorbis:'GENRE',       riff:'IGNR'},
  {k:'track', label:'Faixa',       id3:'TRCK', vorbis:'TRACKNUMBER', riff:'ITRK'},
  {k:'isrc',  label:'ISRC',        id3:'TSRC', vorbis:'ISRC'},
  {k:'composer',label:'Compositor',id3:'TCOM', vorbis:'COMPOSER',    riff:'IENG'},
  {k:'publisher',label:'Editora',  id3:'TPUB', vorbis:'ORGANIZATION'},
  {k:'copyright',label:'Copyright',id3:'TCOP', vorbis:'COPYRIGHT',   riff:'ICOP', aiff:'(c) '},
  {k:'engineer',label:'Masterização',id3:'TENC',vorbis:'ENCODED-BY', riff:'IENG'},
  {k:'comment',label:'Comentário', id3:'COMM', vorbis:'COMMENT',     riff:'ICMT', aiff:'ANNO'}
];
const TE=new TextEncoder();
const be32=n=>new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);
const le32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
const syncsafe=n=>new Uint8Array([(n>>21)&0x7f,(n>>14)&0x7f,(n>>7)&0x7f,n&0x7f]);
function utf16(s){
  const o=new Uint8Array(2+s.length*2); o[0]=0xff; o[1]=0xfe;
  for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); o[2+i*2]=c&255; o[3+i*2]=c>>8; }
  return o;
}
const latin=s=>Uint8Array.from([...s].map(c=>c.charCodeAt(0)&255));

/* ---------------- ID3v2.3 ---------------- */
function buildID3(f,art){
  const frames=[];
  const push=(id,body)=>frames.push(cat([latin(id),be32(body.length),new Uint8Array([0,0]),body]));
  for(const d of TAG_FIELDS){
    const v=(f[d.k]||'').trim();
    if(!v||!d.id3||d.id3==='COMM') continue;
    push(d.id3,cat([new Uint8Array([1]),utf16(v)]));
  }
  if((f.comment||'').trim())
    push('COMM',cat([new Uint8Array([1]),latin('por'),utf16(''),new Uint8Array([0,0]),utf16(f.comment.trim())]));
  if(art&&art.data)
    push('APIC',cat([new Uint8Array([0]),latin(art.mime),new Uint8Array([0,3]),new Uint8Array([0]),art.data]));
  let n=0; for(const fr of frames) n+=fr.length;
  if(!n) return new Uint8Array(0);
  const pad=1024;
  return cat([latin('ID3'),new Uint8Array([3,0,0]),syncsafe(n+pad),...frames,new Uint8Array(pad)]);
}

/* ---------------- Vorbis comment (FLAC) ---------------- */
function buildVorbisBlock(f,vendor){
  const items=[];
  for(const d of TAG_FIELDS){
    const v=(f[d.k]||'').trim();
    if(v&&d.vorbis) items.push(TE.encode(d.vorbis+'='+v));
  }
  const ven=TE.encode(vendor||'Beatfreak Audio Cleaner');
  const parts=[le32(ven.length),ven,le32(items.length)];
  for(const it of items){ parts.push(le32(it.length),it); }
  const body=cat(parts);
  return cat([new Uint8Array([4]),be32(body.length).subarray(1),body]);
}
function buildPictureBlock(art){
  if(!art||!art.data) return null;
  const mime=TE.encode(art.mime), desc=TE.encode('');
  const body=cat([be32(3),be32(mime.length),mime,be32(desc.length),desc,
    be32(art.width||0),be32(art.height||0),be32(24),be32(0),be32(art.data.length),art.data]);
  return cat([new Uint8Array([6]),be32(body.length).subarray(1),body]);
}

/* ---------------- RIFF LIST/INFO e bext ---------------- */
function riffChunk(id,body){
  const pad=body.length&1?new Uint8Array(1):new Uint8Array(0);
  return cat([latin(id),le32(body.length),body,pad]);
}
function buildLISTInfo(f){
  const subs=[];
  for(const d of TAG_FIELDS){
    const v=(f[d.k]||'').trim();
    if(v&&d.riff) subs.push(riffChunk(d.riff,cat([TE.encode(v),new Uint8Array([0])])));
  }
  if(!subs.length) return null;
  return riffChunk('LIST',cat([latin('INFO'),...subs]));
}
function buildBext(f){
  const b=new Uint8Array(602);
  const put=(s,o,n)=>{ const e=TE.encode((s||'').slice(0,n)); b.set(e.subarray(0,n),o); };
  put(f.title||'',0,256);
  put(f.originator||'BeatFreak Studio',256,32);
  put(f.isrc||f.track||'',288,32);
  const d=new Date();
  put(d.toISOString().slice(0,10),320,10);
  put(d.toTimeString().slice(0,8),330,8);
  const hist=TE.encode('A=PCM,BeatFreak Studio\r\n');
  return riffChunk('bext',cat([b,hist]));
}

/* ---------------- AIFF ---------------- */
function aiffChunk(id,body){
  const pad=body.length&1?new Uint8Array(1):new Uint8Array(0);
  return cat([latin(id),be32(body.length),body,pad]);
}

/* ---------------- ponto de entrada ---------------- */
function writeTags(bytes,an,f,art,opts){
  opts=opts||{};
  const strip={o_tags:true,o_art:true,o_enc:!!opts.o_enc,o_bext:true,o_extra:!!opts.o_extra,o_junk:true};
  const clean=an.rebuild(strip);
  const an2=analyze(clean,'x.'+an.fmt.toLowerCase());
  if(!an2) return {ok:false,error:'O ficheiro limpo deixou de ser legível; nada foi escrito.'};

  if(an.fmt==='MP3'){
    const tag=buildID3(f,art);
    return {ok:true,bytes:tag.length?cat([tag,clean]):clean};
  }
  if(an.fmt==='FLAC'){
    const si=an2.blocks.find(b=>b.ftype===0);
    if(!si) return {ok:false,error:'FLAC sem STREAMINFO.'};
    const head=clean.subarray(0,si.off+si.len);
    const rest=clean.subarray(si.off+si.len);
    const blocks=[buildVorbisBlock(f,opts.vendor)];
    const pic=buildPictureBlock(art); if(pic) blocks.push(pic);
    head[si.off]&=0x7f;                       // STREAMINFO deixa de ser o último
    for(let i=0;i<blocks.length;i++) blocks[i][0]=(i===blocks.length-1&&rest.length===0?0x80:blocks[i][0]&0x7f);
    const lastOld=rest.length?null:1;
    if(rest.length===0) blocks[blocks.length-1][0]|=0x80;
    else blocks[blocks.length-1][0]&=0x7f;
    return {ok:true,bytes:cat([head,...blocks,rest])};
  }
  if(an.fmt==='WAV'){
    const fmtBlk=an2.blocks.find(b=>b.id==='fmt ');
    const ins=[]; const list=buildLISTInfo(f);
    if(opts.bext) ins.push(buildBext(f));
    if(list) ins.push(list);
    if(!ins.length) return {ok:true,bytes:clean};
    const at=fmtBlk?fmtBlk.off+fmtBlk.len:12;
    const body=cat([clean.subarray(12,at),...ins,clean.subarray(at)]);
    const head=clean.slice(0,12);
    new DataView(head.buffer).setUint32(4,body.length+4,true);
    return {ok:true,bytes:cat([head,body])};
  }
  if(an.fmt==='AIFF'||an.fmt==='AIFC'){
    const ssnd=an2.blocks.find(b=>b.id==='SSND');
    const ins=[];
    for(const d of TAG_FIELDS){
      const v=(f[d.k]||'').trim();
      if(v&&d.aiff) ins.push(aiffChunk(d.aiff,TE.encode(v)));
    }
    if(!ins.length) return {ok:true,bytes:clean};
    const at=ssnd?ssnd.off:clean.length;
    const body=cat([clean.subarray(12,at),...ins,clean.subarray(at)]);
    const head=clean.slice(0,12);
    new DataView(head.buffer).setUint32(4,body.length+4,false);
    return {ok:true,bytes:cat([head,body])};
  }
  return {ok:false,error:'Escrever etiquetas em '+an.fmt+' ainda não está implementado. O ficheiro foi apenas limpo.',bytes:clean};
}

/* lê as etiquetas actuais para preencher o formulário */
function readTagsInto(an){
  const f={};
  if(!an) return f;
  const grab=(name,keys)=>{
    for(const bl of an.blocks) for(const [k,v] of (bl.fields||[]))
      if(keys.includes(k)&&!f[name]) f[name]=String(v);
  };
  grab('title',['Título','TITLE','INAM','NAME','Descrição']);
  grab('artist',['Artista','ARTIST','IART','AUTH']);
  grab('album',['Álbum','ALBUM','IPRD']);
  grab('year',['Ano','Data','DATE','ICRD']);
  grab('genre',['Género','GENRE','IGNR']);
  grab('track',['Faixa','TRACKNUMBER','ITRK']);
  grab('isrc',['ISRC']);
  grab('composer',['Compositor','COMPOSER']);
  grab('publisher',['Editora','ORGANIZATION']);
  grab('copyright',['Copyright','COPYRIGHT','ICOP']);
  grab('engineer',['Codificador','ENCODED-BY','IENG']);
  grab('comment',['Comentário','COMMENT','ICMT','ANNO','Conteúdo']);
  return f;
}

/* ==== register.js ==== */
/* =========================================================================
   register.js — registo de entregas
   Guardado no localStorage deste browser. Um número de cópia só serve para
   alguma coisa se souberes a quem foi entregue.
   ========================================================================= */
const REG_KEY='bfac.deliveries';

function regAll(){
  try{ return JSON.parse(localStorage.getItem(REG_KEY)||'[]'); }
  catch(_){ return []; }
}
function regSave(list){
  try{ localStorage.setItem(REG_KEY,JSON.stringify(list)); return true; }
  catch(_){ return false; }
}
function regAdd(entry){
  const list=regAll();
  list.unshift({ts:new Date().toISOString(),...entry});
  regSave(list);
  return list;
}
function regRemove(ts){
  const list=regAll().filter(e=>e.ts!==ts);
  regSave(list); return list;
}
function regNextCopy(track){
  let mx=0;
  for(const e of regAll()) if(!track||e.track===track) mx=Math.max(mx,e.copy|0);
  return mx+1;
}
const REG_COLS=['ts','track','trackId','copy','recipient','note','file','sha','band','strength'];
function regCSV(){
  const esc=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  return [REG_COLS.join(',')].concat(regAll().map(e=>REG_COLS.map(c=>esc(e[c])).join(','))).join('\r\n');
}
function regJSON(){ return JSON.stringify(regAll(),null,2); }
function regDownload(text,name,mime){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:mime}));
  a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),8000);
}

/* ==== validate.js ==== */
/* =========================================================================
   validate.js — porta de entrada para uploads da Music AO

   Devolve um veredicto sobre um ficheiro entregue por um artista, sem
   depender de interface. Serve para o fluxo de publicação recusar um MP3
   disfarçado de WAV antes de ele entrar no catálogo.
   ========================================================================= */

const REGRAS_MUSICAO={
  formatos:['WAV','FLAC','AIFF','AIFC'],   // sem perdas para o master de catálogo
  formatosAviso:['MP3','M4A'],
  bitsMin:16,
  srMin:44100,
  duracaoMin:30,
  duracaoMax:960,
  truePeakMax:-1.0,
  lufsMin:-20,
  lufsMax:-6,
  silencioCabecaMax:5,
  recusarLossyDisfarcado:true
};

/* bytes: Uint8Array do ficheiro. audioBuffer é opcional e só serve para a
   análise espectral (detecção de origem em codec com perdas). */
async function validarEntrega(bytes,nome,regras,opts){
  const R={...REGRAS_MUSICAO,...(regras||{})};
  opts=opts||{};
  const motivos=[], out={ok:false,nivel:'rejeitado',motivos,ficheiro:nome};
  const falha=(t,d)=>motivos.push({cls:'hit',nivel:'rejeitado',t,d});
  const aviso=(t,d)=>motivos.push({cls:'info',nivel:'aviso',t,d});
  const bom  =(t,d)=>motivos.push({cls:'clear',nivel:'aceite',t,d});

  const an=analyze(bytes,nome);
  if(!an){ falha('Ficheiro ilegível','Não foi possível interpretar este ficheiro como áudio.'); return out; }
  out.formato=an.fmt;
  out.metadados=an.blocks.filter(b=>b.kind!=='core').length;

  const lossless=R.formatos.includes(an.fmt);
  if(!lossless&&!R.formatosAviso.includes(an.fmt)){
    falha('Formato não aceite','O catálogo aceita '+R.formatos.join(', ')+'. Este ficheiro é '+an.fmt+'.');
    return out;
  }
  if(!lossless) aviso('Formato com perdas','Aceite para pré-escuta, mas para distribuição é preciso o master em '+R.formatos.join(' ou ')+'.');

  let pcm=pcmFromWav(bytes);
  if(!pcm&&opts.audioBuffer) pcm=pcmFromAudioBuffer(opts.audioBuffer,24);
  if(!pcm){ aviso('Sem leitura das amostras','O formato foi reconhecido mas não foi possível medir o áudio neste contexto.'); out.nivel='aviso'; out.ok=true; return out; }

  const m=await measure(pcm);
  out.medidas={sr:m.sr,ch:m.ch,bitsDeclarados:m.bits,bitsReais:m.depth.bits,
    duracao:m.duration,lufs:m.integrated,truePeak:m.truePeak,lra:m.lra,
    picoAmostra:m.samplePeak,cliques:m.clip.runs,overs:(m.overs||[]).length};

  if(m.sr<R.srMin) falha('Amostragem abaixo do mínimo','O ficheiro está a '+m.sr+' Hz e o mínimo é '+R.srMin+' Hz.');
  if(!pcm.isFloat&&m.depth.bits<R.bitsMin)
    falha('Profundidade abaixo do mínimo','Tem '+m.depth.bits+' bit reais e o mínimo é '+R.bitsMin+'.');
  if(m.depth.padded>=4&&lossless)
    falha('Profundidade declarada a mais','O cabeçalho diz '+m.bits+' bit mas os '+m.depth.padded+
      ' bits de baixo estão sempre a zero. Isto é um '+m.depth.bits+' bit com enchimento.');
  if(m.duration<R.duracaoMin) falha('Faixa curta demais',timeFmt(m.duration)+', e o mínimo é '+R.duracaoMin+' segundos.');
  if(m.duration>R.duracaoMax) aviso('Faixa longa',timeFmt(m.duration)+' — confirma que não é uma mistura contínua.');
  if(m.truePeak>R.truePeakMax)
    falha('True peak acima do tecto','Está a '+m.truePeak.toFixed(2)+' dBTP e o tecto é '+R.truePeakMax.toFixed(1)+
      ' dBTP. Acima disto a codificação para streaming distorce.');
  if(m.integrated>R.lufsMax) aviso('Muito alto','A '+m.integrated.toFixed(1)+' LUFS as plataformas vão baixar o volume e a faixa fica sem dinâmica.');
  if(m.integrated<R.lufsMin) aviso('Muito baixo','A '+m.integrated.toFixed(1)+' LUFS a faixa vai soar fraca ao lado das outras.');
  if(m.clip.runs>0) aviso('Amostras coladas ao fundo de escala',m.clip.runs+' troços. É sinal de um master já esmagado ou de uma conversão que passou do topo.');
  if(m.silence.headSec>R.silencioCabecaMax) aviso('Silêncio à cabeça',m.silence.headSec.toFixed(1)+' s antes do primeiro som.');
  if(m.bassMonoLoss!=null&&m.bassMonoLoss<-4) aviso('Graves desaparecem em mono','Perdem-se '+m.bassMonoLoss.toFixed(1)+' dB abaixo de 120 Hz ao somar para mono.');

  // origem em codec com perdas disfarçada de master
  if(opts.audioBuffer&&lossless){
    try{
      const sp=await spectral(opts.audioBuffer,()=>{});
      const pv=provenance(sp);
      out.medidas.corteEspectral=pv.cutoff;
      if(pv.lossy){
        const msg='O espectro corta a pique aos '+(pv.cutoff/1000).toFixed(1)+' kHz. Isto não é um master sem perdas: passou por '+pv.guess+' e foi descodificado outra vez.';
        if(R.recusarLossyDisfarcado) falha('Master com perdas disfarçado de '+an.fmt,msg);
        else aviso('Origem com perdas',msg);
      } else bom('Origem sem perdas','O topo do espectro chega perto de Nyquist sem corte abrupto.');
    }catch(_){ }
  }

  // marca de água, apenas informativo
  if(opts.chave){
    try{
      const d=await wmDetect(pcm,opts.chave,opts.wm||{});
      if(d.found){ out.marca={copia:d.info.copy,faixa:d.info.trackId,data:d.info.date};
        aviso('Traz uma marca do estúdio','Cópia '+d.info.copy+', de '+d.info.date.toISOString().slice(0,10)+'. Confirma que é a versão certa para publicar.'); }
    }catch(_){ }
  }

  const rej=motivos.filter(x=>x.nivel==='rejeitado').length;
  const avi=motivos.filter(x=>x.nivel==='aviso').length;
  out.nivel=rej?'rejeitado':(avi?'aviso':'aceite');
  out.ok=!rej;
  if(out.ok&&!avi) bom('Pronto para publicar',an.fmt+' a '+m.sr+' Hz, '+m.depth.bits+' bit, '+
    m.integrated.toFixed(1)+' LUFS e '+m.truePeak.toFixed(2)+' dBTP.');
  return out;
}

/* ==== app.js ==== */
/* =========================================================================
   app.js — interface
   ========================================================================= */
const FILES=[];
const OPTIDS=['o_tags','o_art','o_enc','o_bext','o_extra','o_junk'];
const getOpts=()=>Object.fromEntries(OPTIDS.map(k=>[k,$(k).checked]));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pause=()=>new Promise(r=>setTimeout(r,0));

function removable(an,opts){
  if(!an) return 0;
  let n=0;
  for(const bl of an.blocks) if(drops(bl.kind,opts)&&!bl.inline) n+=bl.len;
  return n;
}
function chip(f){
  if(f.err) return '<span class="chip err">erro</span>';
  switch(f.state){
    case 'idle': return '<span class="chip idle">por analisar</span>';
    case 'reading': return '<span class="chip">a ler…</span>';
    case 'scanned': return f.meta?'<span class="chip warn">'+f.an.blocks.filter(b=>drops(b.kind,getOpts())).length+' blocos a remover</span>':'<span class="chip ok">já está limpo</span>';
    case 'working': return '<span class="chip">a trabalhar…</span>';
    case 'tagged': return '<span class="chip ok">etiquetado</span>';
    case 'marked': return '<span class="chip ok">marca gravada</span>';
    case 'unmarked': return '<span class="chip ok">marca removida</span>';
    case 'done': return f.bitPerfect?'<span class="chip ok">limpo · áudio intacto</span>':'<span class="chip warn">limpo · verificar</span>';
  }
  return '';
}
function fillSelects(){
  for(const id of ['anaFile','tagFile','wmFile','measFile','cmpA','cmpB']){
    const sel=$(id);
    if(!sel) continue;
    const cur=sel.value;
    sel.innerHTML=FILES.map((f,i)=>'<option value="'+i+'">'+esc(f.name)+'</option>').join('');
    if(cur&&FILES[cur]) sel.value=cur;
  }
}
function render(){
  const rows=$('rows');
  if(!rows) return;
  rows.innerHTML='';
  FILES.forEach((f,i)=>{
    const tr=document.createElement('tr'); tr.className='f'; tr.tabIndex=0;
    tr.innerHTML='<td class="name" title="'+esc(f.name)+'">'+esc(f.name)+'</td>'+
      '<td class="fmt">'+(f.an?f.an.fmt:'—')+'</td>'+
      '<td class="n">'+(f.an?(f.meta?bytesFmt(f.meta):'—'):'—')+'</td>'+
      '<td class="n">'+bytesFmt(f.size)+(f.out?' → '+bytesFmt(f.out.length):'')+'</td>'+
      '<td>'+chip(f)+'</td>'+
      '<td>'+(f.url?'<a class="dl" href="'+f.url+'" download="'+esc(f.outName)+'">descarregar</a>':'')+'</td>';
    tr.onclick=ev=>{ if(ev.target.tagName!=='A'){ f.open=!f.open; render(); } };
    tr.onkeydown=ev=>{ if(ev.key==='Enter'){ f.open=!f.open; render(); } };
    rows.appendChild(tr);
    if(f.open) rows.appendChild(detailRow(f));
  });
  $('count').textContent=FILES.length?FILES.length+' ficheiro'+(FILES.length>1?'s':''):'nenhum ficheiro';
  $('tbl').classList.toggle('hidden',!FILES.length);
  $('btnScan').disabled=!FILES.length;
  $('btnClean').disabled=!FILES.some(f=>f.an);
  $('btnZip').disabled=!FILES.some(f=>f.out);
  $('btnClear').disabled=!FILES.length;
  fillSelects();
}
function detailRow(f){
  const tr=document.createElement('tr'); tr.className='detail';
  const td=document.createElement('td'); td.colSpan=6;
  const an=f.an;
  let left='<h4>Metadados encontrados</h4>';
  if(!an) left+='<p class="empty">Ainda não analisado.</p>';
  else {
    const shown=an.blocks.filter(b=>b.kind!=='core');
    if(!shown.length) left+='<p class="empty">Nenhum metadado — o ficheiro só tem áudio.</p>';
    else left+='<div class="blocks">'+shown.map(b=>
      '<div class="blk"><div class="h"><b>'+esc(b.name)+'</b><i>'+bytesFmt(b.len)+' · '+(drops(b.kind,getOpts())?'a remover':'mantido')+'</i></div>'+
      (b.fields&&b.fields.length?b.fields.slice(0,10).map(x=>'<div class="f"><u>'+esc(x[0])+':</u> '+esc(String(x[1]).slice(0,180))+'</div>').join(''):'')+
      '</div>').join('')+'</div>';
    if(an.warn.length) left+='<div class="blk" style="color:var(--amber)">'+an.warn.map(esc).join('<br>')+'</div>';
  }
  let right='<h4>Ficheiro</h4><div class="kv">';
  if(an) for(const [k,v] of Object.entries(an.props)) right+='<div><b>'+esc(k)+'</b><span>'+esc(v)+'</span></div>';
  right+='</div>';
  if(f.hashBefore){
    right+='<h4 style="margin-top:14px">Verificação do áudio</h4><div class="kv">'+
      '<div><b>SHA-256 antes</b><span>'+f.hashBefore.slice(0,32)+'…</span></div>'+
      '<div><b>SHA-256 depois</b><span class="'+(f.bitPerfect?'g':'r')+'">'+f.hashAfter.slice(0,32)+'…</span></div>'+
      '<div><b>Amostras</b><span>'+bytesFmt(f.audioLen)+'</span></div>'+
      '<div><b>Resultado</b><span class="'+(f.bitPerfect?'g':'r')+'">'+(f.bitPerfect?'áudio idêntico ao original':'o áudio mudou')+'</span></div></div>';
  }
  if(f.wmInfo){
    right+='<h4 style="margin-top:14px">Marca BeatFreak</h4><div class="kv">'+
      '<div><b>Faixa</b><span>'+esc(f.wmInfo.trackId)+'</span></div>'+
      '<div><b>Cópia</b><span>'+f.wmInfo.copy+'</span></div>'+
      '<div><b>Data</b><span>'+f.wmInfo.date.toISOString().slice(0,10)+'</span></div></div>';
  }
  td.innerHTML='<div class="det"><div>'+left+'</div><div>'+right+'</div></div>';
  tr.appendChild(td); return tr;
}

/* ---------------- entrada de ficheiros ---------------- */
function addFiles(list){
  for(const file of list){
    if(FILES.some(f=>f.name===file.name&&f.size===file.size)) continue;
    FILES.push({file,name:file.name,size:file.size,state:'idle',open:false});
  }
  render();
}
function addResult(name,bytes,state){
  const f={name,size:bytes.length,bytes,state:state||'done',open:false};
  f.an=analyze(bytes,name);
  f.meta=removable(f.an,getOpts());
  f.outName=name; f.out=bytes;
  f.url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
  FILES.push(f); render();
  return f;
}
async function bytesOf(f){
  if(!f.bytes) f.bytes=new Uint8Array(await f.file.arrayBuffer());
  return f.bytes;
}
async function pcmOf(f){
  if(f.pcm) return f.pcm;
  await bytesOf(f);
  let p=pcmFromWav(f.bytes);
  if(!p){
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const buf=await ctx.decodeAudioData(f.bytes.slice().buffer);
    ctx.close();
    p=pcmFromAudioBuffer(buf,24); p.converted=true;
  }
  f.pcm=p; return p;
}

/* ---------------- limpar ---------------- */
async function scanAll(){
  const opts=getOpts();
  for(const f of FILES){
    if(f.an){ f.meta=removable(f.an,opts); continue; }
    f.state='reading'; render(); await pause();
    try{
      await bytesOf(f);
      f.an=analyze(f.bytes,f.name);
      if(!f.an){ f.err=true; f.state='idle'; }
      else { f.meta=removable(f.an,opts); f.state='scanned'; }
    }catch(err){ f.err=true; }
    render(); await pause();
  }
  render();
}
function attach(f,out,suffix){
  const dot=f.name.lastIndexOf('.');
  f.out=out;
  f.outName=(dot>0?f.name.slice(0,dot):f.name)+suffix+(dot>0?f.name.slice(dot):'');
  if(f.url) URL.revokeObjectURL(f.url);
  f.url=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'}));
}
async function cleanAll(){
  const opts=getOpts();
  await scanAll();
  for(const f of FILES){
    if(!f.an||f.err) continue;
    f.state='working'; render(); await pause();
    try{
      f.hashBefore=sha256(f.bytes.subarray(f.an.audio.off,f.an.audio.off+f.an.audio.len));
      f.audioLen=f.an.audio.len;
      const out=f.an.rebuild(opts);
      const an2=analyze(out,f.name);
      f.hashAfter=an2?sha256(out.subarray(an2.audio.off,an2.audio.off+an2.audio.len)):'ILEGÍVEL';
      f.bitPerfect=(f.hashAfter===f.hashBefore);
      attach(f,out,'_clean');
      f.state='done';
    }catch(err){ f.err=true; f.state='scanned'; console.error(err); }
    render(); await pause();
  }
}
function zipAll(){
  const list=FILES.filter(f=>f.out).map(f=>({name:f.outName,data:f.out}));
  if(!list.length) return;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(makeZip(list));
  a.download='masters.zip'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),8000);
}

/* ---------------- etiquetas ---------------- */
let COVER=null;
function buildTagForm(){
  const box=$('tagForm');
  if(!box) return;
  /* Os ids gerados aqui têm de levar o mesmo prefixo dos que vêm do HTML,
     senão $() não os encontra quando o módulo corre embebido. */
  box.innerHTML=TAG_FIELDS.map(d=>
    '<label class="fld"><span>'+esc(d.label)+'</span><input type="text" id="'+BFAC_PREFIX+'tf_'+d.k+'"></label>').join('');
}
const tagValues=()=>Object.fromEntries(TAG_FIELDS.map(d=>[d.k,($('tf_'+d.k)||{}).value||'']));
async function tagRead(){
  const f=FILES[+$('tagFile').value]; if(!f) return;
  await bytesOf(f); if(!f.an) f.an=analyze(f.bytes,f.name);
  const v=readTagsInto(f.an);
  for(const d of TAG_FIELDS){ const el=$('tf_'+d.k); if(el) el.value=v[d.k]||''; }
  $('tagLog').textContent='lido de '+f.name;
}
async function tagApply(all){
  const vals=tagValues(), targets=all?FILES.slice():[FILES[+$('tagFile').value]];
  let n=0,msg=[];
  for(const f of targets){
    if(!f) continue;
    try{
      await bytesOf(f); if(!f.an) f.an=analyze(f.bytes,f.name);
      if(!f.an){ msg.push(f.name+': ilegível'); continue; }
      const r=writeTags(f.bytes,f.an,vals,COVER,{bext:$('t_bext').checked,o_extra:$('o_extra').checked});
      if(r.bytes){ attach(f,r.bytes,'_tagged'); f.state=r.ok?'tagged':'done'; n++; }
      if(!r.ok) msg.push(f.name+': '+r.error);
    }catch(err){ msg.push(f.name+': '+err.message); }
  }
  $('tagLog').textContent=n+' ficheiro(s) escritos'+(msg.length?' · '+msg.join(' · '):'');
  render();
}

/* ---------------- marca de água ---------------- */
const wmOpts=()=>({band:$('wmBand').value,strength:+$('wmStrength').value});
const wmKey=()=>$('wmKey').value||'BeatFreak Studio';
function wmLog(s){ $('wmLog').textContent=s; }

async function wmScanAll(){
  const rows=$('wmRows'); rows.innerHTML=''; $('wmTbl').classList.remove('hidden');
  for(const f of FILES){
    wmLog('a analisar '+f.name+'…'); await pause();
    let mark='—',copy='',date='',margin='',other='';
    try{
      const p=await pcmOf(f);
      const d=await wmDetect(p,wmKey(),wmOpts(),x=>wmLog('a ler marca em '+f.name+' · '+Math.round(x*100)+'%'));
      margin=d.margin.toFixed(1)+' dB';
      if(d.found){
        f.wmInfo=d.info;
        mark='<span class="chip ok">presente</span>';
        copy=String(d.info.copy); date=d.info.date.toISOString().slice(0,10);
      } else mark='<span class="chip idle">não</span>';
      wmLog('a procurar outros sinais em '+f.name+'…'); await pause();
      const buf=await audioBufferOf(f);
      const sp=await spectral(buf,()=>{});
      const hits=report(sp).out.filter(r=>r.cls==='hit');
      other=hits.length?hits.map(h=>'<span class="chip warn">'+esc(h.t.toLowerCase())+'</span>').join(' '):'<span class="chip idle">nada</span>';
    }catch(err){ other='<span class="chip err">'+esc(err.message)+'</span>'; }
    const tr=document.createElement('tr');
    tr.innerHTML='<td class="name">'+esc(f.name)+'</td><td>'+mark+'</td><td class="n">'+copy+
      '</td><td class="fmt">'+date+'</td><td class="n">'+margin+'</td><td>'+other+'</td>';
    rows.appendChild(tr);
  }
  wmLog('inventário completo. A coluna da direita são anomalias no espectro, não uma identificação de marca: sem chave não há forma de dizer de quem é, nem de remover.');
  render();
}
function wavName(f,suffix){
  const dot=f.name.lastIndexOf('.');
  return (dot>0?f.name.slice(0,dot):f.name)+suffix+'.wav';
}
function wmDl(name,url,label){
  const box=$('wmOut');
  const a=document.createElement('a');
  a.className='dl'; a.href=url; a.download=name; a.textContent=label||('descarregar '+name);
  box.appendChild(a);
}
/* marca uma cópia e devolve o ficheiro pronto a entregar */
async function wmMakeCopy(f,copy,recipient,onStep){
  const p=await pcmOf(f);
  const track=$('wmTrack').value||f.name;
  const payload=wmPack({track,copy,date:Date.now()});
  const r=await wmEmbed(p,wmKey(),payload,wmOpts(),onStep);
  if(!r.ok) throw new Error(r.error);
  let out=wavFromPcm(r.pcm);
  if($('wmKeepTags').checked){
    if(!f.an){ await bytesOf(f); f.an=analyze(f.bytes,f.name); }
    const vals=f.an?readTagsInto(f.an):{};
    if(Object.keys(vals).length){
      const an=analyze(out,'x.wav');
      const w=writeTags(out,an,vals,null,{});
      if(w.bytes) out=w.bytes;
    }
  }
  const suffix=recipient?('_c'+String(copy).padStart(3,'0')):'_BFS';
  const name=wavName(f,suffix);
  const nf=addResult(name,out,'marked');
  nf.pcm=r.pcm; nf.wmInfo=wmUnpack(payload);
  const sha=sha256(out);
  if($('wmRegister').checked){
    regAdd({track,trackId:nf.wmInfo.trackId,copy,recipient:recipient||'',note:'',
      file:name,sha,band:$('wmBand').value,strength:+$('wmStrength').value});
    renderReg();
  }
  wmDl(name,nf.url,name+(recipient?' → '+recipient:''));
  return {name,r,p,sha};
}
async function wmEmbedSel(){
  const f=FILES[+$('wmFile').value]; if(!f) return;
  $('wmOut').innerHTML='';
  try{
    wmLog('a gravar a marca…');
    const {r,p}=await wmMakeCopy(f,+$('wmCopy').value,'',x=>wmLog('a gravar a marca · '+Math.round(x*100)+'%'));
    $('wmCopy').value=String(regNextCopy($('wmTrack').value||f.name));
    wmLog('marca gravada em '+r.marked+' de '+r.blocks+' blocos, a '+r.strength+' dB abaixo do sinal'+
      (r.clipped?' · '+r.clipped+' amostras limitadas no topo':'')+
      (p.converted?' · o original não era WAV, por isso a saída é PCM 24 bit descodificado':'')+
      ' · o ficheiro está pronto aqui em baixo.');
  }catch(err){ wmLog('erro: '+err.message); }
}
async function wmBatch(){
  const f=FILES[+$('wmFile').value]; if(!f) return;
  const list=$('wmBatch').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!list.length){ wmLog('Escreve os destinatários, um por linha.'); return; }
  $('wmOut').innerHTML=''; BATCH.length=0;
  const track=$('wmTrack').value||f.name;
  let copy=regNextCopy(track);
  for(let i=0;i<list.length;i++){
    try{
      const res=await wmMakeCopy(f,copy,list[i],x=>wmLog('cópia '+copy+' para '+list[i]+' · '+Math.round(x*100)+'%'));
      BATCH.push({name:res.name,data:FILES[FILES.length-1].out});
      copy++;
    }catch(err){ wmLog('erro na cópia para '+list[i]+': '+err.message); return; }
  }
  $('wmCopy').value=String(copy);
  wmLog(list.length+' cópias numeradas de '+(copy-list.length)+' a '+(copy-1)+', cada uma com o seu destinatário no registo.');
}
const BATCH=[];
function wmZip(){
  if(!BATCH.length){ wmLog('Ainda não há cópias em lote para juntar.'); return; }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(makeZip(BATCH));
  a.download='copias.zip'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),8000);
}
async function wmRemoveSel(){
  const f=FILES[+$('wmFile').value]; if(!f) return;
  try{
    const p=await pcmOf(f);
    wmLog('a procurar a marca…');
    const det=await wmDetect(p,wmKey(),wmOpts(),x=>wmLog('a ler · '+Math.round(x*100)+'%'));
    if(!det.found){
      wmLog('Nenhuma marca legível com esta chave. Se o ficheiro tem uma marca de outra pessoa, ela não pode ser reconstruída sem a chave de quem a gravou, e por isso não é removível aqui.');
      return;
    }
    const r=await wmRemove(p,wmKey(),{...wmOpts(),detection:det},x=>wmLog('a remover · '+Math.round(x*100)+'%'));
    if(!r.ok){ wmLog(r.error); return; }
    const out=wavFromPcm(r.pcm);
    const nf=addResult(wavName(f,'_sem-marca'),out,'unmarked');
    nf.pcm=r.pcm;
    $('wmOut').innerHTML=''; wmDl(nf.name,nf.url);
    const check=await wmDetect(r.pcm,wmKey(),wmOpts());
    wmLog('marca da cópia '+det.info.copy+' removida de '+r.blocks+' blocos · verificação: '+
      (check.found?'ainda legível, algo correu mal':'já não é legível')+
      ' · SHA-256 do WAV resultante '+sha256(out).slice(0,24)+'… — compara com o master antes de marcares para confirmares que voltou ao mesmo.');
  }catch(err){ wmLog('erro: '+err.message); }
}

/* ---------------- espectro ---------------- */
async function audioBufferOf(f){
  if(f.buf) return f.buf;
  await bytesOf(f);
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  f.buf=await ctx.decodeAudioData(f.bytes.slice().buffer);
  ctx.close();
  return f.buf;
}
async function runAnalysis(){
  const f=FILES[+$('anaFile').value]; if(!f) return;
  const log=m=>{$('anaLog').textContent=m;};
  $('btnAna').disabled=true; $('anaOut').classList.add('hidden');
  try{
    log('a descodificar…'); await pause();
    const buf=await audioBufferOf(f);
    const sp=await spectral(buf,log);
    const {out,notches}=report(sp);
    drawSpec(sp); drawAvg(sp,notches);
    $('findings').innerHTML=out.map(r=>'<div class="find '+r.cls+'"><div class="t">'+esc(r.t)+'<em>'+esc(r.d)+'</em></div><div class="m">'+esc(r.m)+'</div></div>').join('');
    $('anaOut').classList.remove('hidden');
    log(f.name+' · '+buf.numberOfChannels+' canais · '+buf.sampleRate+' Hz · '+timeFmt(buf.duration)+' · '+sp.nF+' janelas de '+N+' amostras');
  }catch(err){ log('Não foi possível descodificar este ficheiro neste browser: '+err.message); }
  $('btnAna').disabled=false;
}

/* ---------------- medição ---------------- */
const dbf=(v,d)=>(isFinite(v)?(v>=0?'+':'')+v.toFixed(d==null?1:d):'—');
function kvRow(k,v,cls){ return '<div><b>'+esc(k)+'</b><span'+(cls?' class="'+cls+'"':'')+'>'+esc(v)+'</span></div>'; }
async function runMeasure(){
  const f=FILES[+$('measFile').value]; if(!f) return;
  const log=m=>{ $('measLog').textContent=m; };
  $('btnMeas').disabled=true; $('measOut').classList.add('hidden');
  try{
    log('a preparar as amostras…'); await pause();
    const p=await pcmOf(f);
    const m=await measure(p,log);
    f.meas=m;
    $('measA').innerHTML=
      kvRow('LUFS integrado',dbf(m.integrated,2)+' LUFS')+
      kvRow('Short-term máx',dbf(m.shortMax,2)+' LUFS')+
      kvRow('Momentâneo máx',dbf(m.momentMax,2)+' LUFS')+
      kvRow('Loudness range',m.lra.toFixed(2)+' LU')+
      kvRow('True peak',dbf(m.truePeak,2)+' dBTP',m.truePeak>-0.1?'r':(m.truePeak>-1?'a':'g'))+
      kvRow('Pico de amostra',dbf(m.samplePeak,2)+' dBFS')+
      kvRow('RMS',dbf(m.rms,2)+' dBFS')+
      kvRow('Crest factor',m.crest.toFixed(1)+' dB')+
      kvRow('PLR',m.plr.toFixed(1)+' LU');
    const d=m.depth, mono=m.mono;
    $('measB').innerHTML=
      kvRow('Declarado',m.sr+' Hz · '+m.bits+' bit · '+m.ch+' canais')+
      kvRow('Bits reais',d.bits+' bit'+(d.padded?' — os '+d.padded+' de baixo estão a zero':''),d.padded?'a':'g')+
      kvRow('Duração',timeFmt(m.duration))+
      kvRow('Silêncio no início',m.silence.headSec.toFixed(3)+' s ('+m.silence.head+' amostras)')+
      kvRow('Silêncio no fim',m.silence.tailSec.toFixed(3)+' s')+
      kvRow('Ruído de fundo',dbf(m.noiseFloor,1)+' dBFS')+
      kvRow('Offset DC',m.dc.map(v=>(v*100).toFixed(4)+'%').join(' · '),Math.max(...m.dc.map(Math.abs))>0.001?'a':'')+
      kvRow('Amostras coladas ao topo',m.clip.runs+' troços'+(m.clip.worst?' · o pior com '+m.clip.worst+' amostras':''),m.clip.runs?'a':'g')+
      (mono?kvRow('Perda em mono',dbf(mono.loss,1)+' dB · graves '+dbf(m.bassMonoLoss,1)+' dB',m.bassMonoLoss<-3?'a':'g'):'')+
      (mono?kvRow('Correlação L/R',mono.corr.toFixed(3)):'');
    $('measTargets').innerHTML=TARGETS.map(t=>{
      const dl=m.integrated-t.lufs, tpOk=m.truePeak<=t.tp;
      const ok=Math.abs(dl)<=1&&tpOk;
      return '<tr><td>'+esc(t.name)+'</td><td class="n">'+t.lufs+' LUFS</td>'+
        '<td class="n">'+dbf(dl,1)+' LU</td><td class="n">'+t.tp.toFixed(1)+' dBTP</td>'+
        '<td>'+(ok?'<span class="chip ok">dentro</span>':
          '<span class="chip warn">'+(Math.abs(dl)>1?(dl>0?'baixar '+dl.toFixed(1)+' LU':'subir '+(-dl).toFixed(1)+' LU'):'')+
          (!tpOk?(Math.abs(dl)>1?' · ':'')+'true peak acima do tecto':'')+'</span>')+'</td></tr>';
    }).join('');
    const finds=[];
    if(m.truePeak>-0.1) finds.push({cls:'hit',t:'True peak no limite',d:'A '+dbf(m.truePeak,2)+' dBTP, qualquer codificação com perdas vai distorcer na descodificação. Baixa o tecto do limitador.',m:dbf(m.truePeak,2)+' dBTP'});
    if(d.padded>=4) finds.push({cls:'hit',t:'Profundidade declarada a mais',d:'O cabeçalho diz '+m.bits+' bit mas os '+d.padded+' bits de baixo estão sempre a zero. Isto é um '+d.bits+' bit com enchimento.',m:d.bits+' bit reais'});
    if(m.clip.runs>0) finds.push({cls:'hit',t:'Amostras consecutivas no fundo de escala',d:m.clip.runs+' troços com pelo menos 3 amostras coladas ao máximo. É a assinatura de um master já esmagado ou de uma conversão que passou do topo.',m:m.clip.samples+' amostras'});
    if(m.bassMonoLoss!=null&&m.bassMonoLoss<-3) finds.push({cls:'hit',t:'Graves desaparecem em mono',d:'Abaixo de 120 Hz perdem-se '+dbf(m.bassMonoLoss,1)+' dB ao somar para mono. Em rádio e em coluna de telemóvel isso ouve-se.',m:dbf(m.bassMonoLoss,1)+' dB'});
    if(Math.max(...m.dc.map(Math.abs))>0.001) finds.push({cls:'hit',t:'Offset DC',d:'Há uma componente contínua a comer margem de pico. Um passa-alto muito baixo resolve.',m:(Math.max(...m.dc.map(Math.abs))*100).toFixed(3)+'%'});
    if(m.silence.headSec>1) finds.push({cls:'info',t:'Silêncio à cabeça',d:'São '+m.silence.headSec.toFixed(2)+' s antes do primeiro som. Algumas plataformas cortam, outras não.',m:m.silence.headSec.toFixed(2)+' s'});
    if($('measSpec').checked){
      log('a analisar o espectro…'); await pause();
      try{
        const buf=await audioBufferOf(f);
        const sp=await spectral(buf,log);
        const pv=provenance(sp);
        finds.push({cls:pv.lossy?'hit':'clear',t:'Origem do material',
          d:pv.lossy?'O espectro corta a pique aos '+(pv.cutoff/1000).toFixed(1)+' kHz, com '+pv.slope.toFixed(0)+' dB de queda logo a seguir. Isto não é um master lossless: passou por '+pv.guess+' e foi descodificado outra vez.'
            :'O topo do espectro chega perto de Nyquist sem corte abrupto. Não há sinal de ter passado por um codec com perdas.',
          m:(pv.cutoff/1000).toFixed(1)+' kHz'});
        for(const r of report(sp).out) if(r.cls==='hit'&&r.t!=='Corte espectral') finds.push(r);
      }catch(err){ finds.push({cls:'info',t:'Análise espectral',d:'Não foi possível descodificar: '+err.message,m:'—'}); }
    }
    $('measFind').innerHTML=finds.map(r=>'<div class="find '+r.cls+'"><div class="t">'+esc(r.t)+'<em>'+esc(r.d)+'</em></div><div class="m">'+esc(r.m)+'</div></div>').join('');
    $('measOut').classList.remove('hidden');
    MEAS_LAST={pcm:p,m};
    drawWave($('measWave'),p,m);
    drawLoudness($('measLoud'),m,+($('measTarget')&&$('measTarget').value||-14));
    $('waveInfo').textContent=m.clip.runs+' troços no fundo de escala · '+(m.overs?m.overs.length:0)+' overs acima de −1 dBTP';
    log(f.name+' · '+m.sr+' Hz · '+m.ch+' canais · '+timeFmt(m.duration));
  }catch(err){ log('erro: '+err.message); }
  $('btnMeas').disabled=false;
}

let MEAS_LAST=null;

/* ---------------- comparar dois ficheiros ---------------- */
let CMP=null, CMP_CTX=null, CMP_SRC=null, CMP_GAIN=null;
function cmpStop(){
  if(CMP_SRC){ try{ CMP_SRC.stop(); }catch(_){} CMP_SRC=null; }
  $('btnCmpStop').disabled=true;
}
function cmpBuffer(chans,sr){
  if(!CMP_CTX) CMP_CTX=new (window.AudioContext||window.webkitAudioContext)();
  const b=CMP_CTX.createBuffer(chans.length,chans[0].length,sr);
  for(let c=0;c<chans.length;c++) b.copyToChannel(Float32Array.from(chans[c]),c);
  return b;
}
function cmpPlay(which){
  if(!CMP) return;
  cmpStop();
  const src=CMP.audio[which];
  if(!src) return;
  const buf=cmpBuffer(src,CMP.sr);
  CMP_SRC=CMP_CTX.createBufferSource(); CMP_SRC.buffer=buf;
  CMP_GAIN=CMP_CTX.createGain();
  CMP_GAIN.gain.value=which==='d'?Math.pow(10,+$('cmpGain').value/20):1;
  CMP_SRC.connect(CMP_GAIN).connect(CMP_CTX.destination);
  CMP_SRC.onended=()=>{ $('btnCmpStop').disabled=true; };
  CMP_SRC.start();
  $('btnCmpStop').disabled=false;
}
async function cmpRun(){
  const a=FILES[+$('cmpA').value], b=FILES[+$('cmpB').value];
  const log=m=>{ $('cmpLog').textContent=m; };
  if(!a||!b||a===b){ log('Escolhe dois ficheiros diferentes.'); return; }
  $('btnCmp').disabled=true; $('cmpOut').classList.add('hidden');
  try{
    log('a preparar…'); await pause();
    const pa=await pcmOf(a), pb=await pcmOf(b);
    if(pa.sr!==pb.sr){ log('Amostragens diferentes: '+pa.sr+' e '+pb.sr+' Hz. A subtracção não faria sentido.'); $('btnCmp').disabled=false; return; }
    const ch=Math.min(pa.ch,pb.ch), n=Math.min(pa.frames,pb.frames);
    const full=Math.max(pa.full,pb.full);
    const ka=full/pa.full, kb=full/pb.full;
    const A=[],B=[],D=[];
    let peak=0,sq=0,diffN=0,worst=0;
    for(let c=0;c<ch;c++){
      const x=new Float32Array(n), y=new Float32Array(n), d=new Float32Array(n);
      for(let i=0;i<n;i++){
        const va=pa.data[c][i]*ka, vb=pb.data[c][i]*kb, dv=va-vb;
        x[i]=va/full; y[i]=vb/full; d[i]=dv/full;
        const ad=Math.abs(dv);
        if(ad>peak) peak=ad;
        if(ad>0){ diffN++; if(ad>worst) worst=ad; }
        sq+=dv*dv;
      }
      A.push(x); B.push(y); D.push(d);
    }
    const peakDb=20*Math.log10(peak/full+1e-15);
    const rmsDb=10*Math.log10(sq/(n*ch)/(full*full)+1e-30);
    let ea=0; for(let c=0;c<ch;c++) for(let i=0;i<n;i++){ const v=pa.data[c][i]*ka/full; ea+=v*v; }
    const snr=10*Math.log10((ea+1e-30)/(sq/(full*full)+1e-30));
    CMP={sr:pa.sr,audio:{a:A,b:B,d:D},n,ch};
    drawDiff($('cmpCanvas'),D,pa.sr,1);
    $('cmpAxis').textContent=timeFmt(n/pa.sr);
    $('cmpKV').innerHTML=
      kvRow('Amostras comparadas',n+' × '+ch+' canais')+
      kvRow('Amostras diferentes',diffN?diffN+' ('+(100*diffN/(n*ch)).toFixed(2)+'%)':'nenhuma',diffN?'a':'g')+
      kvRow('Pico da diferença',diffN?dbf(peakDb,2)+' dBFS':'silêncio absoluto')+
      kvRow('RMS da diferença',diffN?dbf(rmsDb,2)+' dBFS':'silêncio absoluto')+
      kvRow('Relação A / diferença',diffN?snr.toFixed(1)+' dB':'sem diferença para medir')+
      (pa.frames!==pb.frames?kvRow('Aviso','durações diferentes, comparado até '+timeFmt(n/pa.sr),'a'):'');
    const finds=[];
    if(!diffN) finds.push({cls:'clear',t:'Ficheiros idênticos',d:'Não há uma única amostra diferente. Se um destes foi desmarcado, a reconstrução foi exacta.',m:'0 amostras'});
    else if(peakDb<-60) finds.push({cls:'clear',t:'Diferença inaudível',d:'O pico da diferença fica '+Math.abs(peakDb).toFixed(0)+' dB abaixo do fundo de escala. Carrega em "Ouvir só a diferença" com o ganho no máximo para confirmares pelo ouvido.',m:dbf(peakDb,1)+' dBFS'});
    else if(peakDb<-30) finds.push({cls:'info',t:'Diferença discreta',d:'É o que se espera de uma marca de água ou de um dither. Ouve a diferença amplificada para perceber o que é.',m:dbf(peakDb,1)+' dBFS'});
    else finds.push({cls:'hit',t:'Diferença audível',d:'Os ficheiros não são a mesma coisa: houve reprocessamento, mudança de ganho ou recodificação pelo meio.',m:dbf(peakDb,1)+' dBFS'});
    $('cmpFind').innerHTML=finds.map(r=>'<div class="find '+r.cls+'"><div class="t">'+esc(r.t)+'<em>'+esc(r.d)+'</em></div><div class="m">'+esc(r.m)+'</div></div>').join('');
    $('cmpOut').classList.remove('hidden');
    ['btnCmpPlayA','btnCmpPlayB','btnCmpPlayD'].forEach(i=>$(i).disabled=false);
    log('diferença calculada · '+timeFmt(n/pa.sr)+' a '+pa.sr+' Hz');
  }catch(err){ log('erro: '+err.message); }
  $('btnCmp').disabled=false;
}

/* ---------------- registo ---------------- */
function renderReg(){
  if(!$('regRows')) return;
  const list=regAll();
  $('regRows').innerHTML=list.map(e=>
    '<tr><td class="fmt">'+esc(e.ts.slice(0,10))+'</td><td class="name">'+esc(e.track||'')+'</td>'+
    '<td class="n">'+(e.copy|0)+'</td><td>'+esc(e.recipient||'—')+'</td>'+
    '<td class="name fmt">'+esc(e.file||'')+'</td>'+
    '<td class="fmt" title="'+esc(e.sha||'')+'">'+esc((e.sha||'').slice(0,16))+'…</td>'+
    '<td><button data-ts="'+esc(e.ts)+'" class="regDel">apagar</button></td></tr>').join('');
  $('regCount').textContent=list.length?list.length+' entrega'+(list.length>1?'s':''):'ainda sem entregas';
  $$('.regDel').forEach(b=>b.onclick=()=>{ regRemove(b.dataset.ts); renderReg(); });
}

/* ---------------- eventos ---------------- */
function bfacInit(){
  /* Um painel pode ter sido escondido no mount: ligar só o que existe. */
  const _n=()=>{};
  const E=id=>$(id)||{addEventListener:_n,classList:{add:_n,remove:_n,toggle:_n}};
$$('.tabs button').forEach(b=>b.onclick=()=>{
  $$('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  $$('.panel').forEach(p=>p.classList.toggle('on',p.id===BFAC_PREFIX+'p-'+b.dataset.tab));
});
E('drop').onclick=()=>E('picker').click();
E('drop').onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); E('picker').click(); } };
E('picker').onchange=e=>{ addFiles(e.target.files); e.target.value=''; };
['dragenter','dragover'].forEach(t=>E('drop').addEventListener(t,e=>{e.preventDefault();E('drop').classList.add('over');}));
['dragleave','drop'].forEach(t=>E('drop').addEventListener(t,e=>{e.preventDefault();E('drop').classList.remove('over');}));
E('drop').addEventListener('drop',e=>{ if(e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>e.preventDefault());
E('btnScan').onclick=scanAll;
E('btnClean').onclick=cleanAll;
E('btnZip').onclick=zipAll;
E('btnClear').onclick=()=>{ FILES.forEach(f=>f.url&&URL.revokeObjectURL(f.url)); FILES.length=0;
  E('anaOut').classList.add('hidden'); E('anaLog').textContent=''; E('wmTbl').classList.add('hidden'); render(); };
E('btnAna').onclick=runAnalysis;
E('btnTagRead').onclick=tagRead;
E('btnTagApply').onclick=()=>tagApply(false);
E('btnTagAll').onclick=()=>tagApply(true);
E('tagArt').onchange=async e=>{
  const file=e.target.files[0];
  if(!file){ COVER=null; E('artInfo').textContent='nenhuma imagem escolhida'; return; }
  COVER={mime:file.type||'image/jpeg',data:new Uint8Array(await file.arrayBuffer())};
  E('artInfo').textContent=file.name+' · '+bytesFmt(COVER.data.length);
};
E('btnWmScan').onclick=wmScanAll;
E('btnWmEmbed').onclick=wmEmbedSel;
E('btnWmRemove').onclick=wmRemoveSel;
E('btnWmBatch').onclick=wmBatch;
E('btnWmZip').onclick=wmZip;
E('btnMeas').onclick=runMeasure;
E('btnCmp').onclick=cmpRun;
E('btnCmpPlayA').onclick=()=>cmpPlay('a');
E('btnCmpPlayB').onclick=()=>cmpPlay('b');
E('btnCmpPlayD').onclick=()=>cmpPlay('d');
E('btnCmpStop').onclick=cmpStop;
E('cmpGain').oninput=e=>{
  E('cmpGainV').textContent='+'+e.target.value+' dB';
  if(CMP_GAIN) CMP_GAIN.gain.value=Math.pow(10,+e.target.value/20);
};
window.addEventListener('resize',()=>{
  if(MEAS_LAST){ drawWave(E('measWave'),MEAS_LAST.pcm,MEAS_LAST.m); drawLoudness(E('measLoud'),MEAS_LAST.m,-14); }
});
E('btnRegCSV').onclick=()=>regDownload(regCSV(),'entregas-beatfreak.csv','text/csv');
E('btnRegJSON').onclick=()=>regDownload(regJSON(),'entregas-beatfreak.json','application/json');
E('btnRegClear').onclick=()=>{ if(confirm('Apagar o registo todo? Exporta primeiro se ainda não o fizeste.')){ regSave([]); renderReg(); } };
OPTIDS.forEach(id=>$(id).onchange=()=>{ const o=getOpts(); FILES.forEach(f=>{ if(f.an) f.meta=removable(f.an,o); }); render(); });
  buildTagForm();
  renderReg();
  render();
}
if(typeof BFAC_EMBED==='undefined') bfacInit();

/* Acesso pela consola do browser, para automatizar tarefas repetidas. */
window.BFAC={FILES,version:'1.0',
  analyze,sha256,writeTags,readTagsInto,TAG_FIELDS,
  pcmFromWav,wavFromPcm,pcmFromAudioBuffer,
  wmPack,wmUnpack,wmEmbed,wmDetect,wmRemove,wmPlan,
  spectral,report,provenance,measure,TARGETS,
  regAll,regAdd,regCSV,regNextCopy,
  addResult,pcmOf,wmMakeCopy,cmpRun,runMeasure,drawWave,drawLoudness,
  validarEntrega,bfacInit};

const BFAC_VIEW=`<div class="wrap">

<header>
  <h1>Beatfreak Audio Cleaner</h1>
  <span class="v">v1.0 · offline</span>
  <p>Inspecciona, limpa e etiqueta masters antes da entrega, e gere a marca de água BeatFreak Studio. As amostras nunca são recodificadas sem necessidade — o SHA-256 do bloco de áudio é comparado antes e depois para o provar. Nada sai deste computador.</p>
</header>

<nav class="tabs" role="tablist">
  <button role="tab" data-tab="files" class="on">Ficheiros</button>
  <button role="tab" data-tab="tags">Etiquetas</button>
  <button role="tab" data-tab="wm">Marca de água</button>
  <button role="tab" data-tab="meas">Medição</button>
  <button role="tab" data-tab="reg">Entregas</button>
  <button role="tab" data-tab="cmp">Comparar</button>
  <button role="tab" data-tab="spec">Espectro</button>
</nav>

<!-- ============ FICHEIROS ============ -->
<div class="panel on" id="bfac-p-files">
  <div id="bfac-drop" tabindex="0" role="button" aria-label="Escolher ficheiros de áudio">
    <strong>Larga aqui os ficheiros ou clica para escolher</strong>
    <span>WAV · BWF · MP3 · FLAC · AIFF · M4A</span>
  </div>
  <input id="bfac-picker" type="file" multiple accept=".wav,.bwf,.mp3,.flac,.aif,.aiff,.aifc,.m4a,.mp4,audio/*" class="hidden">

  <div class="grid">
    <fieldset>
      <legend>Tags e etiquetas</legend>
      <label class="opt"><input type="checkbox" id="bfac-o_tags" checked>
        <span>Remover tags ID3, APE e Lyrics3<em>Título, artista, álbum, ISRC, comentários, tags personalizadas</em></span></label>
      <label class="opt"><input type="checkbox" id="bfac-o_art" checked>
        <span>Remover capa embutida<em>Blocos APIC e PICTURE</em></span></label>
      <label class="opt"><input type="checkbox" id="bfac-o_enc" checked>
        <span>Neutralizar assinatura do codificador<em>Apaga o identificador LAME e o ReplayGain, mantém o delay de gapless</em></span></label>
    </fieldset>
    <fieldset>
      <legend>Chunks de produção</legend>
      <label class="opt"><input type="checkbox" id="bfac-o_bext" checked>
        <span>Remover BWF, iXML, XMP e LIST<em>Estúdio, DAW, data, timecode, histórico de codificação, UMID</em></span></label>
      <label class="opt"><input type="checkbox" id="bfac-o_extra" checked>
        <span>Remover marcadores, regiões e cue points<em>cue, smpl, MARK, SEEKTABLE, CUESHEET</em></span></label>
      <label class="opt"><input type="checkbox" id="bfac-o_junk" checked>
        <span>Remover lixo antes do primeiro frame<em>Bytes órfãos deixados por editores e conversores</em></span></label>
    </fieldset>
  </div>

  <div class="bar">
    <button id="bfac-btnScan" class="primary" disabled>Analisar</button>
    <button id="bfac-btnClean" disabled>Limpar</button>
    <button id="bfac-btnZip" disabled>Descarregar tudo (.zip)</button>
    <button id="bfac-btnClear" disabled>Limpar lista</button>
    <span class="count" id="bfac-count">nenhum ficheiro</span>
  </div>

  <table id="bfac-tbl" class="hidden">
    <thead><tr>
      <th>Ficheiro</th><th>Formato</th><th class="n">Metadados</th><th class="n">Tamanho</th><th>Estado</th><th></th>
    </tr></thead>
    <tbody id="bfac-rows"></tbody>
  </table>
</div>

<!-- ============ ETIQUETAS ============ -->
<div class="panel" id="bfac-p-tags">
  <h2>Escrever etiquetas</h2>
  <p class="sub">Apaga tudo o que lá estava e escreve de novo, só com o que puseres aqui. ID3v2.3 em MP3, Vorbis comment em FLAC, LIST/INFO em WAV, chunks de texto em AIFF. Em M4A só é possível ler e limpar.</p>
  <div class="bar" style="margin-top:0">
    <select id="bfac-tagFile"></select>
    <button id="bfac-btnTagRead">Ler do ficheiro</button>
  </div>
  <div class="formgrid" id="bfac-tagForm"></div>
  <fieldset style="margin-top:18px">
    <legend>Extras</legend>
    <label class="opt"><input type="checkbox" id="bfac-t_bext">
      <span>Assinar o WAV como BeatFreak Studio<em>Escreve um chunk bext novo com o estúdio, a data e a hora</em></span></label>
    <label class="opt" style="align-items:center"><input type="file" id="bfac-tagArt" accept="image/jpeg,image/png" style="margin:0">
      <span>Capa (JPEG ou PNG) — MP3 e FLAC<em id="bfac-artInfo">nenhuma imagem escolhida</em></span></label>
  </fieldset>
  <div class="bar">
    <button id="bfac-btnTagApply" class="primary">Aplicar a este ficheiro</button>
    <button id="bfac-btnTagAll">Aplicar a todos</button>
    <span class="count" id="bfac-tagLog"></span>
  </div>
</div>

<!-- ============ MARCA DE ÁGUA ============ -->
<div class="panel" id="bfac-p-wm">
  <h2>Marca de água BeatFreak Studio</h2>
  <p class="sub">A marca é gerada a partir da tua chave. Quem não a tiver não consegue reconstruir o sinal, e por isso não o consegue subtrair. Marcas de outros aparecem no inventário como detectadas, mas sem chave não são removíveis aqui.</p>

  <div class="formgrid">
    <label class="fld"><span>Chave do estúdio</span><input id="bfac-wmKey" type="password" value="BeatFreak Studio">
      <em>Guarda-a. Sem ela não há leitura nem remoção das tuas marcas.</em></label>
    <label class="fld"><span>Faixa ou sessão</span><input id="bfac-wmTrack" placeholder="Gostos Antecipados — master v3"></label>
    <label class="fld"><span>Número da cópia</span><input id="bfac-wmCopy" type="number" value="1" min="0" max="65535">
      <em>Uma cópia por destinatário permite saber de onde veio uma fuga.</em></label>
    <label class="fld"><span>Banda</span><select id="bfac-wmBand">
      <option value="alta">15–20 kHz — inaudível</option>
      <option value="media">4–9 kHz — mais robusta</option></select></label>
    <label class="fld"><span>Nível abaixo do sinal</span><select id="bfac-wmStrength">
      <option value="48">48 dB — mais discreta</option>
      <option value="42" selected>42 dB — equilíbrio</option>
      <option value="36">36 dB — mais robusta</option></select></label>
  </div>

  <fieldset style="margin-top:16px">
    <legend>Ao marcar</legend>
    <label class="opt"><input type="checkbox" id="bfac-wmKeepTags" checked>
      <span>Levar as etiquetas do original para o ficheiro marcado<em>Sem isto o WAV marcado sai só com fmt e data</em></span></label>
    <label class="opt"><input type="checkbox" id="bfac-wmRegister" checked>
      <span>Registar a entrega<em>Guarda faixa, cópia, destinatário e SHA-256 no separador Entregas</em></span></label>
  </fieldset>

  <div class="bar">
    <button id="bfac-btnWmScan" class="primary">Ver que marcas têm</button>
    <button id="bfac-btnWmEmbed">Marcar</button>
    <button id="bfac-btnWmRemove">Remover a minha marca</button>
    <select id="bfac-wmFile"></select>
  </div>

  <label class="fld" style="margin-top:16px"><span>Destinatários, um por linha — gera uma cópia numerada para cada</span>
    <textarea id="bfac-wmBatch" rows="4" placeholder="Editora Kalunga&#10;Rádio Escola&#10;DJ Maninho"></textarea></label>
  <div class="bar">
    <button id="bfac-btnWmBatch">Marcar em lote</button>
    <button id="bfac-btnWmZip">Descarregar as cópias (.zip)</button>
  </div>

  <div class="log" id="bfac-wmLog"></div>
  <div class="dlbox" id="bfac-wmOut"></div>

  <table id="bfac-wmTbl" class="hidden">
    <thead><tr><th>Ficheiro</th><th>Marca BeatFreak</th><th>Cópia</th><th>Data</th><th class="n">Margem</th><th>Outros sinais</th></tr></thead>
    <tbody id="bfac-wmRows"></tbody>
  </table>
</div>

<!-- ============ MEDIÇÃO ============ -->
<div class="panel" id="bfac-p-meas">
  <h2>Controlo de entrega</h2>
  <p class="sub">Loudness por ITU-R BS.1770-4 e EBU R128, true peak com sobreamostragem de 4×, e as leituras que dizem o que é que o ficheiro é mesmo — por baixo do que o cabeçalho declara.</p>
  <div class="bar" style="margin-top:0">
    <select id="bfac-measFile"></select>
    <button id="bfac-btnMeas" class="primary">Medir</button>
    <label class="opt" style="padding:0"><input type="checkbox" id="bfac-measSpec" checked>
      <span>Incluir a análise espectral<em>Para detectar origem em codec com perdas</em></span></label>
  </div>
  <div class="log" id="bfac-measLog"></div>
  <div id="bfac-measOut" class="hidden">
    <div class="det" style="padding:0; margin-top:18px">
      <div><h4>Loudness e pico</h4><div class="kv" id="bfac-measA"></div></div>
      <div><h4>O ficheiro por dentro</h4><div class="kv" id="bfac-measB"></div></div>
    </div>
    <div class="canvasBox" style="margin-top:18px">
      <canvas id="bfac-measWave" data-h="150" height="150"></canvas>
      <div class="axis"><span>forma de onda · vermelho: amostras no fundo de escala e overs de true peak</span><span id="bfac-waveInfo"></span></div>
    </div>
    <div class="canvasBox">
      <canvas id="bfac-measLoud" data-h="170" height="170"></canvas>
      <div class="axis"><span>loudness ao longo do tempo, em LUFS</span><span>âmbar: short-term · cinza: momentâneo · faixa azul: loudness range</span></div>
    </div>
    <h4 style="margin:22px 0 8px; font-size:12.5px; color:var(--mut); font-weight:500">Contra os alvos</h4>
    <table><thead><tr><th>Destino</th><th class="n">Alvo</th><th class="n">Diferença</th><th class="n">Tecto</th><th>Estado</th></tr></thead>
    <tbody id="bfac-measTargets"></tbody></table>
    <div class="findings" id="bfac-measFind"></div>
  </div>
</div>

<!-- ============ ENTREGAS ============ -->
<div class="panel" id="bfac-p-reg">
  <h2>Registo de entregas</h2>
  <p class="sub">Cada cópia marcada fica aqui com o destinatário e o SHA-256 do ficheiro entregue. Se um dia aparecer uma fuga, lês o número da cópia e sabes de onde veio. Fica guardado só neste browser — exporta de vez em quando.</p>
  <div class="bar" style="margin-top:0">
    <button id="bfac-btnRegCSV">Exportar CSV</button>
    <button id="bfac-btnRegJSON">Exportar JSON</button>
    <button id="bfac-btnRegClear">Apagar tudo</button>
    <span class="count" id="bfac-regCount"></span>
  </div>
  <table id="bfac-regTbl"><thead><tr>
    <th>Data</th><th>Faixa</th><th class="n">Cópia</th><th>Destinatário</th><th>Ficheiro</th><th>SHA-256</th><th></th>
  </tr></thead><tbody id="bfac-regRows"></tbody></table>
</div>

<!-- ============ COMPARAR ============ -->
<div class="panel" id="bfac-p-cmp">
  <h2>Comparar dois ficheiros</h2>
  <p class="sub">Subtrai um ficheiro do outro e deixa ouvir só a diferença. É assim que se prova que uma marca de água é inaudível, e é assim que se descobre o que é que um distribuidor fez a um master que voltou.</p>
  <div class="formgrid">
    <label class="fld"><span>A — referência</span><select id="bfac-cmpA"></select></label>
    <label class="fld"><span>B — a comparar</span><select id="bfac-cmpB"></select></label>
  </div>
  <div class="bar">
    <button id="bfac-btnCmp" class="primary">Calcular a diferença</button>
    <button id="bfac-btnCmpPlayA" disabled>Ouvir A</button>
    <button id="bfac-btnCmpPlayB" disabled>Ouvir B</button>
    <button id="bfac-btnCmpPlayD" disabled>Ouvir só a diferença</button>
    <button id="bfac-btnCmpStop" disabled>Parar</button>
  </div>
  <label class="fld" style="max-width:420px"><span>Amplificar o que se ouve: <b id="bfac-cmpGainV">+40 dB</b></span>
    <input id="bfac-cmpGain" type="range" min="0" max="70" value="40" step="1"></label>
  <div class="log" id="bfac-cmpLog"></div>
  <div id="bfac-cmpOut" class="hidden">
    <div class="canvasBox">
      <canvas id="bfac-cmpCanvas" data-h="160" height="160"></canvas>
      <div class="axis"><span>nível da diferença ao longo do tempo</span><span id="bfac-cmpAxis"></span></div>
    </div>
    <div class="det" style="padding:0; margin-top:16px">
      <div><h4>A diferença</h4><div class="kv" id="bfac-cmpKV"></div></div>
      <div><h4>Leitura</h4><div class="findings" id="bfac-cmpFind"></div></div>
    </div>
  </div>
</div>

<!-- ============ ESPECTRO ============ -->
<div class="panel" id="bfac-p-spec">
  <h2>Análise espectral</h2>
  <p class="sub">Procura assinaturas típicas de marca de água: entalhes fixos no espectro, energia acima da banda audível, padrões que se repetem no tempo e conteúdo escondido no canal lateral. É uma leitura de diagnóstico — indica onde olhar, não dá uma certeza.</p>
  <div class="bar" style="margin-top:0">
    <select id="bfac-anaFile"></select>
    <button id="bfac-btnAna">Analisar espectro</button>
  </div>
  <div id="bfac-anaOut" class="hidden">
    <div class="canvasBox">
      <canvas id="bfac-spec" width="1000" height="300"></canvas>
      <div class="axis"><span>0 s</span><span id="bfac-axMid"></span><span id="bfac-axEnd"></span></div>
    </div>
    <div class="canvasBox">
      <canvas id="bfac-avg" width="1000" height="200"></canvas>
      <div class="axis"><span>0 Hz</span><span id="bfac-axF1"></span><span id="bfac-axF2"></span><span id="bfac-axF3"></span><span id="bfac-axNy"></span></div>
    </div>
    <div class="findings" id="bfac-findings"></div>
    <p class="note">Uma marca de água forense é desenhada para sobreviver a conversões e para não ser vista num espectrograma. Não encontrar nada aqui não significa que o ficheiro esteja limpo.</p>
  </div>
  <div class="log" id="bfac-anaLog"></div>
</div>

</div>`;
let BFAC_MOUNTED=false;
window.BeatfreakCleaner={
  versao:'1.0', data:'2026-09-04',
  mount(el,opts){
    opts=opts||{};
    if(!el) throw new Error('BeatfreakCleaner.mount: falta o elemento contentor.');
    el.classList.add('bfac');
    el.innerHTML=BFAC_VIEW;
    BFAC_PREFIX='bfac-'; BFAC_ROOT=el;
    if(opts.paleta) for(const k in opts.paleta) el.style.setProperty("--"+k,opts.paleta[k]);
    if(opts.esconder) for(const t of opts.esconder){
      const b=el.querySelector('.tabs button[data-tab="'+t+'"]'); if(b) b.remove();
      const p=el.querySelector('#bfac-p-'+t); if(p) p.remove();
    }
    if(opts.cabecalho!==true){ const h=el.querySelector("header"); if(h) h.remove(); }
    bfacInit();
    BFAC_MOUNTED=true;
    return el;
  },
  montado(){ return BFAC_MOUNTED; },
  validar:validarEntrega, REGRAS_MUSICAO,
  analisar:analyze, medir:measure, lerWav:pcmFromWav, escreverWav:wavFromPcm,
  marcar:wmEmbed, lerMarca:wmDetect, removerMarca:wmRemove, carga:wmPack,
  etiquetar:writeTags, entregas:regAll, sha256:sha256,
  adicionar(lista){ addFiles(lista); }, ficheiros(){ return FILES; },
  analisar_tudo:scanAll, limpar_tudo:cleanAll
};
})();
