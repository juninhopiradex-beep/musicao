import {JSDOM} from 'jsdom';
import fs from 'fs';
// página anfitriã que imita a Music AO, com ids e classes que podiam colidir
const host=`<!DOCTYPE html><html><body>
<div class="app">
  <aside class="sidebar"><nav class="nav">
    <a href="#/home" data-route="home">Início</a>
    <a href="#/cleaner" data-route="cleaner" data-role="admin">Audio Cleaner</a>
  </nav></aside>
  <main id="view">
    <span id="count">saldo 1200 Kz</span>
    <div class="tabs"><button>aba da Music AO</button></div>
    <table id="tbl"><tbody id="rows"><tr><td>faixa da Music AO</td></tr></tbody></table>
  </main>
</div>
<div id="cleanerHost"></div>
</body></html>`;
const dom=new JSDOM(host,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://musicao.test/'});
const w=dom.window, doc=w.document;
const s=doc.createElement('script');
s.textContent=fs.readFileSync('dist/musicao/beatfreak-cleaner.js','utf8');
doc.body.appendChild(s);
await new Promise(r=>setTimeout(r,200));
console.log('módulo carregado:',typeof w.BeatfreakCleaner,'· versão',w.BeatfreakCleaner.versao);
console.log('nada montado ainda:',w.BeatfreakCleaner.montado());

w.URL.createObjectURL=()=>'blob:t'; w.URL.revokeObjectURL=()=>{};
w.BeatfreakCleaner.mount(doc.getElementById('cleanerHost'),{esconder:['reg']});
console.log('montado:',w.BeatfreakCleaner.montado());

// o anfitrião ficou intacto?
console.log('id count do anfitrião:',doc.getElementById('count').textContent);
console.log('tabela do anfitrião:',doc.querySelector('#tbl #rows td').textContent);
console.log('separadores do cleaner:',[...doc.querySelectorAll('#cleanerHost .tabs button')].map(b=>b.dataset.tab).join(','));
console.log('ids com prefixo:',!!doc.getElementById('bfac-drop'),'· sem prefixo não existe:',!doc.getElementById('drop'));

// mudar de separador dentro do cleaner não deve mexer na aba do anfitrião
const hostTab=doc.querySelector('#view .tabs button');
doc.querySelector('#cleanerHost .tabs button[data-tab="meas"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
console.log('painel de medição activo:',doc.getElementById('bfac-p-meas').classList.contains('on'),
            '· aba do anfitrião mexeu?',hostTab.classList.contains('on'));

// fluxo real dentro do embebido
const raw=fs.readFileSync('test/fixtures/master.wav');
w.BeatfreakCleaner.adicionar([{name:'master.wav',size:raw.length,
  arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)}]);
await w.BeatfreakCleaner.limpar_tudo();
console.log('limpeza no embebido:',doc.querySelector('#bfac-rows tr.f').children[4].textContent.trim());

// validador de upload
const v=await w.BeatfreakCleaner.validar(new Uint8Array(raw),'master.wav');
console.log('\nvalidador ->',v.nivel,'| formato',v.formato,'| bits reais',v.medidas.bitsReais,
  '|',v.medidas.lufs.toFixed(1),'LUFS |',v.medidas.truePeak.toFixed(2),'dBTP');
v.motivos.forEach(x=>console.log('   ['+x.nivel+']',x.t,'—',x.d.slice(0,80)));

// um ficheiro curto tem de ser recusado
const curto=new Uint8Array(raw.slice(0,44+44100*4));
new DataView(curto.buffer).setUint32(4,curto.length-8,true);
const v2=await w.BeatfreakCleaner.validar(curto,'curto.wav');
console.log('\nficheiro de 1 s ->',v2.nivel,'·',v2.motivos.filter(x=>x.nivel==='rejeitado').map(x=>x.t).join(', '));
