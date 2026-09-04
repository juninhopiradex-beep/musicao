/* Corre todos os testes. node test/run.mjs */
import {execFileSync} from 'child_process';
import fs from 'fs';
const files=['formats.test.mjs','measure.test.mjs','watermark.test.mjs','robustness.test.mjs','app.test.mjs','flow.test.mjs','compare.test.mjs','embed.test.mjs','musicao.test.mjs'];
let bad=0;
for(const f of files){
  if(!fs.existsSync('test/'+f)) continue;
  console.log('\n\u001b[1m### '+f+'\u001b[0m');
  try{ console.log(execFileSync('node',['test/'+f],{encoding:'utf8'})); }
  catch(e){ bad++; console.log(e.stdout||'', e.stderr||''); console.log('FALHOU'); }
}
console.log(bad?bad+' teste(s) falharam':'todos os testes passaram');
process.exit(bad?1:0);
