/* Corre a Music AO já integrada e confirma que a rota #/cleaner funciona. */
import {JSDOM} from 'jsdom';
import fs from 'fs';
import {execFileSync} from 'child_process';
execFileSync('bash',['-c','rm -rf /tmp/mao && mkdir -p /tmp/mao/js /tmp/mao/css']);
fs.writeFileSync('/tmp/mao/index.html',`<!DOCTYPE html><html><head>
<link rel="stylesheet" href="css/style.css"></head><body>
<aside class="sidebar"><nav class="nav">
      <a href="#/home" data-route="home">Início</a>
      <a href="#/admin" data-route="admin" data-role="admin">Administração</a>
</nav></aside><main id="view"></main>
<script src="js/app.js"></script></body></html>`);
fs.writeFileSync('/tmp/mao/js/app.js',`function viewHome(){ return '<h1>Music AO</h1>'; }
const routes = {
  home: viewHome,
};
function router(){ const r=location.hash.slice(2)||'home';
  document.getElementById('view').innerHTML=(routes[r]||viewHome)(); }
window.addEventListener('hashchange',router); router();`);
fs.writeFileSync('/tmp/mao/css/style.css','body{font-family:sans-serif}');
console.log(execFileSync('python3',['tools/integrar_musicao.py','/tmp/mao'],{encoding:'utf8'}).trim());

const html=fs.readFileSync('/tmp/mao/index.html','utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://musicao.test/',
  resources:{fetch(){return null;}}});
const w=dom.window, doc=w.document;
// jsdom não vai buscar os scripts sozinho: injectamos pela ordem do html
for(const src of ['js/beatfreak-cleaner.js','js/app.js']){
  const s=doc.createElement('script'); s.textContent=fs.readFileSync('/tmp/mao/'+src,'utf8');
  doc.body.appendChild(s);
}
await new Promise(r=>setTimeout(r,100));
console.log('\nitem de menu:',doc.querySelector('[data-route="cleaner"]').textContent.trim(),
            '| role:',doc.querySelector('[data-route="cleaner"]').dataset.role);
console.log('rota home:',doc.getElementById('view').textContent.trim());
w.URL.createObjectURL=()=>'blob:t'; w.URL.revokeObjectURL=()=>{};
w.location.hash='#/cleaner'; w.dispatchEvent(new w.Event('hashchange'));
await new Promise(r=>setTimeout(r,60));
console.log('rota cleaner montada:',w.BeatfreakCleaner.montado());
console.log('separadores visíveis:',[...doc.querySelectorAll('#cleanerHost .tabs button')].map(b=>b.dataset.tab).join(','));
console.log('marca de água escondida:',!doc.getElementById('bfac-p-wm'));
const raw=fs.readFileSync('test/fixtures/master.wav');
w.BeatfreakCleaner.adicionar([{name:'master.wav',size:raw.length,
  arrayBuffer:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)}]);
await w.BeatfreakCleaner.limpar_tudo();
console.log('limpeza dentro da Music AO:',doc.querySelector('#bfac-rows tr.f').children[4].textContent.trim());
console.log('CSS isolado:',fs.readFileSync('/tmp/mao/css/beatfreak-cleaner.css','utf8').split('\n')[1].startsWith('.bfac'));
