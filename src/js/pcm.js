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
