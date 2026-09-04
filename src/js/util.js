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
