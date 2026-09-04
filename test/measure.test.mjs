import {LIB} from './_lib.mjs';
const {measure,truePeak,realBitDepth,TARGETS}=await import(LIB);
const sr=48000, n=sr*10, full=32768;
function tone(dbPeak,f){
  const a=Math.pow(10,dbPeak/20)*(full-1), d=[new Float64Array(n),new Float64Array(n)];
  for(let i=0;i<n;i++){ const v=Math.round(a*Math.sin(2*Math.PI*f*i/sr)); d[0][i]=v; d[1][i]=v; }
  return {sr,ch:2,bits:16,isFloat:false,frames:n,data:d,full};
}
// EBU Tech 3341, caso 1: seno 1 kHz estéreo com pico a -23 dBFS -> -23.0 LUFS
const m=await measure(tone(-23,1000));
console.log('seno 1 kHz a -23 dBFS de pico');
console.log('  LUFS integrado  ',m.integrated.toFixed(2),' (esperado -23.0 ±0.1)');
console.log('  short-term máx  ',m.shortMax.toFixed(2));
console.log('  true peak       ',m.truePeak.toFixed(2),'dBTP · pico de amostra',m.samplePeak.toFixed(2),'dBFS');
console.log('  LRA             ',m.lra.toFixed(2),'LU');
if(Math.abs(m.integrated+23)>0.15){ console.log('FALHOU: LUFS fora da tolerância'); process.exit(1); }

// caso 2: -33 dBFS -> -33 LUFS
const m2=await measure(tone(-33,1000));
console.log('\nseno a -33 dBFS ->',m2.integrated.toFixed(2),'LUFS');
if(Math.abs(m2.integrated+33)>0.15){ console.log('FALHOU'); process.exit(1); }

// true peak entre amostras: seno a 11.9 kHz quase a plena escala
const m3=await measure(tone(-0.5,11900));
console.log('\nseno a 11.9 kHz com pico de amostra a -0.5 dBFS');
console.log('  pico de amostra',m3.samplePeak.toFixed(2),'dBFS · true peak',m3.truePeak.toFixed(2),'dBTP');
if(m3.truePeak<=m3.samplePeak){ console.log('FALHOU: o true peak devia ficar acima do pico de amostra'); process.exit(1); }

// profundidade real: 24 bit que na verdade é 16
const d=[new Float64Array(sr),new Float64Array(sr)];
for(let i=0;i<sr;i++){ const v=Math.round(Math.sin(2*Math.PI*440*i/sr)*30000)*256; d[0][i]=v; d[1][i]=v; }
const fake={sr,ch:2,bits:24,isFloat:false,frames:sr,data:d,full:8388608};
const rb=realBitDepth(fake);
console.log('\nficheiro declarado 24 bit -> bits reais',rb.bits,'· bits de enchimento',rb.padded);
if(rb.bits!==16){ console.log('FALHOU'); process.exit(1); }
console.log('\nalvos:',TARGETS.map(t=>t.name+' '+t.lufs).join(' · '));
