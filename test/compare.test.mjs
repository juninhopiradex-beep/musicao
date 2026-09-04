import {JSDOM} from 'jsdom';
import fs from 'fs';
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),
  {runScripts:'dangerously',pretendToBeVisual:true,url:'https://x.test/'});
const w=dom.window, doc=w.document;
await new Promise(r=>setTimeout(r,300));
w.URL.createObjectURL=()=>'blob:t'; w.URL.revokeObjectURL=()=>{};
const raw=fs.readFileSync('test/fixtures/master.wav');
w.addFiles([{name:'master.wav',size:raw.length,
  arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)}]);

doc.getElementById('wmTrack').value='Teste';
doc.getElementById('wmFile').value='0';
doc.getElementById('wmRegister').checked=false;
await w.wmEmbedSel();
console.log('marcado:',w.BFAC.FILES[1].name);

// A = original, B = marcado -> a diferença é a marca
doc.getElementById('cmpA').value='0';
doc.getElementById('cmpB').value='1';
await w.cmpRun();
console.log('\n--- original vs marcado ---');
console.log(doc.getElementById('cmpKV').textContent.replace(/([a-z%)])([A-ZRP])/g,'$1 | $2'));
console.log('leitura:',doc.getElementById('cmpFind').querySelector('.t').childNodes[0].textContent,
            '·',doc.getElementById('cmpFind').querySelector('.m').textContent);

// desmarcar e comparar com o original -> tem de dar zero
doc.getElementById('wmFile').value='1';
await w.wmRemoveSel();
doc.getElementById('cmpA').value='0';
doc.getElementById('cmpB').value='2';
await w.cmpRun();
console.log('\n--- original vs desmarcado ---');
console.log(doc.getElementById('cmpKV').textContent.replace(/([a-z%)])([A-ZRP])/g,'$1 | $2'));
console.log('leitura:',doc.getElementById('cmpFind').querySelector('.t').childNodes[0].textContent);
const txt=doc.getElementById('cmpKV').textContent;
if(!txt.includes('nenhuma')){ console.log('FALHOU: devia ser idêntico'); process.exit(1); }

// medição com os canvas (jsdom não tem contexto 2d: tem de passar na mesma)
doc.getElementById('measSpec').checked=false;
doc.getElementById('measFile').value='1';
await w.runMeasure();
console.log('\nmedição do marcado:',doc.getElementById('measLog').textContent);
console.log('anotações:',doc.getElementById('waveInfo').textContent);
