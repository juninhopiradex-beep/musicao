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
