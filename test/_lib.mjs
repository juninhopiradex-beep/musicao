/* Constrói o bundle a partir de src/ e exporta as funções para os testes. */
import {execFileSync} from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
const out=path.join(os.tmpdir(),'bfac-test-lib.mjs');
const js=execFileSync('python3',['-c',
  "import sys;sys.path.insert(0,'tools');from bundle import bundle;print(bundle(['util.js','formats.js','pcm.js','dsp.js','measure.js','draw.js','watermark.js','tags.js','validate.js']))"],
  {encoding:'utf8'});
fs.writeFileSync(out,js+"\nexport {analyze,sha256,drops,bytesFmt,pcmFromWav,wavFromPcm,pcmClone,"+
  "wmEmbed,wmDetect,wmRemove,wmPack,wmUnpack,wmPlan,writeTags,readTagsInto,TAG_FIELDS,spectral,report,measure,truePeak,realBitDepth,clipRuns,provenance,TARGETS,validarEntrega,REGRAS_MUSICAO};\n");
export const LIB=out;
