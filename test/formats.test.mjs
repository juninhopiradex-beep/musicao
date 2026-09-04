import {LIB} from './_lib.mjs';
const {analyze,sha256}=await import(LIB);
import fs from 'fs';
const opts={o_tags:1,o_art:1,o_enc:1,o_bext:1,o_extra:1,o_junk:1};
let bad=0;
for(const f of fs.readdirSync('test/fixtures')){
  const raw=new Uint8Array(fs.readFileSync('test/fixtures/'+f));
  const an=analyze(raw,f);
  if(!an){ console.log(f,'ILEGÍVEL'); bad++; continue; }
  const before=sha256(raw.subarray(an.audio.off,an.audio.off+an.audio.len));
  const out=an.rebuild(opts);
  const an2=analyze(out,f);
  const after=an2?sha256(out.subarray(an2.audio.off,an2.audio.off+an2.audio.len)):'X';
  const ok=before===after;
  if(!ok) bad++;
  console.log(f.padEnd(14),an.fmt.padEnd(5),raw.length+'B ->'+out.length+'B',
    '| blocos:',an.blocks.filter(b=>b.kind!=='core').length,
    '| áudio',ok?'intacto ✓':'ALTERADO ✗');
}
if(bad) process.exit(1);
