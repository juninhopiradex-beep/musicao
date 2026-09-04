import {LIB} from './_lib.mjs';
const {pcmFromWav,wavFromPcm,wmEmbed,wmDetect,wmRemove,wmPack,sha256}=await import(LIB);
const sr=44100, dur=25, n=sr*dur, ch=2, bits=16, full=32768;
function makeWav(){
  const d=[new Float64Array(n),new Float64Array(n)];
  for(let i=0;i<n;i++){
    const t=i/sr, env=0.5+0.45*Math.sin(2*Math.PI*t/4);
    let s=0.35*Math.sin(2*Math.PI*55*t)+0.2*Math.sin(2*Math.PI*220*t+0.3)
         +0.12*Math.sin(2*Math.PI*440*t)+0.06*Math.sin(2*Math.PI*1320*t);
    const hat=(Math.floor(t*8)%2===0)?(Math.random()*2-1)*0.08*Math.exp(-((t*8)%1)*9):0;
    s=(s*env+hat)*0.7;
    d[0][i]=Math.round(Math.max(-1,Math.min(1,s))*(full-1));
    d[1][i]=Math.round(Math.max(-1,Math.min(1,s*0.96+hat*0.3))*(full-1));
  }
  return {sr,ch,bits,isFloat:false,frames:n,data:d,full};
}
const pcm=pcmFromWav(wavFromPcm(makeWav()));
console.log('PCM:',pcm.sr,'Hz',pcm.bits,'bit',pcm.ch,'ch',pcm.frames,'frames');
const payload=wmPack({track:'Gostos Antecipados — master v3',copy:7,date:Date.UTC(2026,8,4)});
let t=Date.now();
const em=await wmEmbed(pcm,'BeatFreak Studio',payload,{strength:42});
console.log('marcar:',Date.now()-t,'ms ·',em.marked+'/'+em.blocks,'blocos · clip',em.clipped);
let mx=0,se=0,so=0;
for(let c=0;c<ch;c++) for(let i=0;i<n;i++){
  const df=em.pcm.data[c][i]-pcm.data[c][i];
  if(Math.abs(df)>mx) mx=Math.abs(df); se+=df*df; so+=pcm.data[c][i]*pcm.data[c][i];
}
console.log('marca: pico',(20*Math.log10(mx/full)).toFixed(1),'dBFS · SNR',(10*Math.log10(so/se)).toFixed(1),'dB');
t=Date.now();
const det=await wmDetect(em.pcm,'BeatFreak Studio',{strength:42});
console.log('ler:',Date.now()-t,'ms ·',JSON.stringify(det.info),'· margem',det.margin.toFixed(1),'dB');
const bad=await wmDetect(em.pcm,'outra chave qualquer',{strength:42});
console.log('chave errada -> encontrada?',bad.found,'| margem',bad.margin.toFixed(1),'dB');
const c0=await wmDetect(pcm,'BeatFreak Studio',{strength:42});
console.log('ficheiro limpo -> encontrada?',c0.found,'| margem',c0.margin.toFixed(1),'dB');
const rm=await wmRemove(em.pcm,'BeatFreak Studio',{strength:42});
let diff=0,worst=0;
for(let c=0;c<ch;c++) for(let i=0;i<n;i++){
  const df=Math.abs(rm.pcm.data[c][i]-pcm.data[c][i]);
  if(df){diff++; if(df>worst) worst=df;}
}
console.log('remover: amostras != original =',diff,'/',n*ch,'| pior desvio',worst,'LSB');
console.log('SHA(PCM original) === SHA(PCM recuperado):',sha256(wavFromPcm(pcm))===sha256(wavFromPcm(rm.pcm)));
const af=await wmDetect(rm.pcm,'BeatFreak Studio',{strength:42});
console.log('depois de remover -> encontrada?',af.found,'| margem',af.margin.toFixed(1),'dB');
