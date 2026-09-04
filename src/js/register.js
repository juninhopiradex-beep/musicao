/* =========================================================================
   register.js — registo de entregas
   Guardado no localStorage deste browser. Um número de cópia só serve para
   alguma coisa se souberes a quem foi entregue.
   ========================================================================= */
const REG_KEY='bfac.deliveries';

function regAll(){
  try{ return JSON.parse(localStorage.getItem(REG_KEY)||'[]'); }
  catch(_){ return []; }
}
function regSave(list){
  try{ localStorage.setItem(REG_KEY,JSON.stringify(list)); return true; }
  catch(_){ return false; }
}
function regAdd(entry){
  const list=regAll();
  list.unshift({ts:new Date().toISOString(),...entry});
  regSave(list);
  return list;
}
function regRemove(ts){
  const list=regAll().filter(e=>e.ts!==ts);
  regSave(list); return list;
}
function regNextCopy(track){
  let mx=0;
  for(const e of regAll()) if(!track||e.track===track) mx=Math.max(mx,e.copy|0);
  return mx+1;
}
const REG_COLS=['ts','track','trackId','copy','recipient','note','file','sha','band','strength'];
function regCSV(){
  const esc=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"';
  return [REG_COLS.join(',')].concat(regAll().map(e=>REG_COLS.map(c=>esc(e[c])).join(','))).join('\r\n');
}
function regJSON(){ return JSON.stringify(regAll(),null,2); }
function regDownload(text,name,mime){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([text],{type:mime}));
  a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),8000);
}
