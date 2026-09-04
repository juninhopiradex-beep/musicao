import {JSDOM} from 'jsdom';
import fs from 'fs';
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/'});
const w=dom.window, doc=w.document;
await new Promise(r=>setTimeout(r,300));
w.URL.createObjectURL=()=>'blob:t'; w.URL.revokeObjectURL=()=>{}; w.confirm=()=>true;
const raw=fs.readFileSync('test/fixtures/master.wav');
w.addFiles([{name:'master.wav',size:raw.length,
  arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)}]);

console.log('— medição —');
doc.getElementById('measSpec').checked=false;
doc.getElementById('measFile').value='0';
await w.runMeasure();
console.log(doc.getElementById('measLog').textContent);
console.log(doc.getElementById('measA').textContent.replace(/([a-z])([A-ZÍ])/g,'$1 | $2'));
console.log(doc.getElementById('measB').textContent.replace(/([a-z%s)])([A-ZÍBODPRSC])/g,'$1 | $2'));
console.log('alvos:',[...doc.querySelectorAll('#measTargets tr')].map(t=>
  t.children[0].textContent+' '+t.children[4].textContent).join(' · '));
console.log('achados:',[...doc.querySelectorAll('#measFind .find')].map(f=>f.className.split(' ')[1]+':'+f.querySelector('.t').childNodes[0].textContent).join(' · '));

console.log('\n— marcação em lote —');
doc.getElementById('wmTrack').value='Gostos Antecipados';
doc.getElementById('wmBatch').value='Editora Kalunga\nRádio Escola\nDJ Maninho';
doc.getElementById('wmFile').value='0';
await w.wmBatch();
console.log(doc.getElementById('wmLog').textContent);
console.log('downloads:',[...doc.querySelectorAll('#wmOut a')].map(a=>a.textContent).join(' | '));
console.log('registo:',w.BFAC.regAll().map(e=>'#'+e.copy+' '+e.recipient+' sha '+e.sha.slice(0,8)).join(' · '));

console.log('\n— ler as marcas de volta —');
const F=w.BFAC.FILES;
for(let i=1;i<F.length;i++){
  const p=await w.BFAC.pcmOf(F[i]);
  const d=await w.BFAC.wmDetect(p,'BeatFreak Studio',{band:'alta',strength:42});
  console.log(' ',F[i].name,'-> cópia',d.found?d.info.copy:'não encontrada','· margem',d.margin.toFixed(1),'dB');
}
console.log('\netiquetas levadas para a cópia:',
  Buffer.from(F[1].out).includes(Buffer.from('Piradex'))?'sim':'não');
console.log('CSV:\n'+w.BFAC.regCSV().split('\r\n').slice(0,2).join('\n'));
