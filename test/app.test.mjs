import {JSDOM} from 'jsdom';
import fs from 'fs';
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window, doc=w.document;
await new Promise(r=>setTimeout(r,300));
w.URL.createObjectURL=()=>'blob:t'; w.URL.revokeObjectURL=()=>{};
const raw=fs.readFileSync('test/fixtures/master.wav');
w.addFiles([{name:'master.wav',size:raw.length,
  arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)}]);

console.log('— limpar —');
await w.cleanAll();
console.log([...doc.querySelectorAll('#rows tr.f')].map(t=>[...t.children].map(x=>x.textContent.trim()).join(' | ')).join('\n'));

console.log('\n— etiquetas —');
doc.getElementById('tf_title').value='Gostos Antecipados';
doc.getElementById('tf_artist').value='Piradex';
doc.getElementById('tf_isrc').value='AOBIC2600001';
doc.getElementById('tf_engineer').value='BeatFreak Studio';
doc.getElementById('t_bext').checked=true;
await w.tagApply(false);
console.log(doc.getElementById('tagLog').textContent);
const tagged=w.BFAC.FILES[0].out;
console.log('bext novo:',Buffer.from(tagged).includes(Buffer.from('BeatFreak Studio')),
            '| INAM:',Buffer.from(tagged).includes(Buffer.from('Gostos Antecipados')),
            '| Pro Tools apagado:',!Buffer.from(tagged).includes(Buffer.from('Pro Tools')));

console.log('\n— marca de água —');
doc.getElementById('wmTrack').value='Gostos Antecipados — master v3';
doc.getElementById('wmCopy').value='42';
doc.getElementById('wmFile').value='0';
await w.wmEmbedSel();
console.log(doc.getElementById('wmLog').textContent);
doc.getElementById('wmFile').value=String(w.BFAC.FILES.length-1);
await w.wmRemoveSel();
console.log(doc.getElementById('wmLog').textContent);
console.log('\nficheiros na lista:');
w.BFAC.FILES.forEach((f,i)=>console.log(' ',i,f.name,f.state));

// o ficheiro desmarcado tem de ser idêntico ao original, amostra a amostra
const F=w.BFAC.FILES;
const a=await w.BFAC.pcmOf(F[0]), c=await w.BFAC.pcmOf(F[2]);
let d=0; for(let k=0;k<a.ch;k++) for(let i=0;i<a.frames;i++) if(a.data[k][i]!==c.data[k][i]) d++;
console.log('\noriginal vs desmarcado: amostras diferentes =',d,'de',a.frames*a.ch);
