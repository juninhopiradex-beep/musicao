import {LIB} from './_lib.mjs';
const {pcmFromWav,wavFromPcm,wmEmbed,wmDetect,wmPack}=await import(LIB);
const sr=44100,n=sr*25,full=32768;
function src(){
  const d=[new Float64Array(n),new Float64Array(n)];
  for(let i=0;i<n;i++){const t=i/sr,env=0.5+0.45*Math.sin(2*Math.PI*t/4);
    let s=(0.35*Math.sin(2*Math.PI*55*t)+0.2*Math.sin(2*Math.PI*220*t)+0.12*Math.sin(2*Math.PI*440*t)
      +((Math.floor(t*8)%2===0)?(Math.random()*2-1)*0.08:0))*env*0.7;
    d[0][i]=Math.round(s*(full-1)); d[1][i]=Math.round(s*0.96*(full-1));}
  return {sr,ch:2,bits:16,isFloat:false,frames:n,data:d,full};
}
const key='BeatFreak Studio', pl=wmPack({track:'teste',copy:1,date:Date.UTC(2026,8,4)});
function lowpass(p,fc,times){
  const q={...p,data:p.data.map(c=>Float64Array.from(c))};
  const a=(1/sr)/(1/(2*Math.PI*fc)+1/sr);
  for(const c of q.data) for(let k=0;k<times;k++){let y=0;for(let i=0;i<c.length;i++){y+=a*(c[i]-y);c[i]=Math.round(y);}}
  return q;
}
function gain(p,db){const g=Math.pow(10,db/20);return {...p,data:p.data.map(c=>c.map(v=>Math.round(v*g)))};}
function noise(p,db){const a=Math.pow(10,db/20)*full;return {...p,data:p.data.map(c=>c.map(v=>Math.round(v+(Math.random()*2-1)*a)))};}
for(const band of ['alta','media']){
  const em=await wmEmbed(src(),key,pl,{band,strength:42});
  const tests={
    'sem alterações':em.pcm,
    'ganho -6 dB':gain(em.pcm,-6),
    'ganho -1.4 dB':gain(em.pcm,-1.4),
    'ruído a -70 dBFS':noise(em.pcm,-70),
    'passa-baixo 16 kHz (tipo MP3)':lowpass(em.pcm,16000,8),
  };
  console.log('\n=== banda '+band+' ('+(band==='alta'?'15–20 kHz':'4–9 kHz')+') ===');
  for(const [k,v] of Object.entries(tests)){
    const d=await wmDetect(v,key,{band,strength:42});
    console.log('  '+k.padEnd(30),d.found?'lida ✓':'perdida ✗','· margem '+d.margin.toFixed(1)+' dB');
  }
}
