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
