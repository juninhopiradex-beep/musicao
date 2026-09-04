/* =========================================================================
   app.js — interface
   ========================================================================= */
const FILES=[];
const OPTIDS=['o_tags','o_art','o_enc','o_bext','o_extra','o_junk'];
const getOpts=()=>Object.fromEntries(OPTIDS.map(k=>[k,$(k).checked]));
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pause=()=>new Promise(r=>setTimeout(r,0));

function removable(an,opts){
  if(!an) return 0;
  let n=0;
  for(const bl of an.blocks) if(drops(bl.kind,opts)&&!bl.inline) n+=bl.len;
  return n;
}
function chip(f){
  if(f.err) return '<span class="chip err">erro</span>';
  switch(f.state){
    case 'idle': return '<span class="chip idle">por analisar</span>';
    case 'reading': return '<span class="chip">a ler…</span>';
    case 'scanned': return f.meta?'<span class="chip warn">'+f.an.blocks.filter(b=>drops(b.kind,getOpts())).length+' blocos a remover</span>':'<span class="chip ok">já está limpo</span>';
    case 'working': return '<span class="chip">a trabalhar…</span>';
    case 'tagged': return '<span class="chip ok">etiquetado</span>';
    case 'marked': return '<span class="chip ok">marca gravada</span>';
    case 'unmarked': return '<span class="chip ok">marca removida</span>';
    case 'done': return f.bitPerfect?'<span class="chip ok">limpo · áudio intacto</span>':'<span class="chip warn">limpo · verificar</span>';
  }
  return '';
}
function fillSelects(){
  for(const id of ['anaFile','tagFile','wmFile','measFile','cmpA','cmpB']){
    const sel=$(id);
    if(!sel) continue;
    const cur=sel.value;
    sel.innerHTML=FILES.map((f,i)=>'<option value="'+i+'">'+esc(f.name)+'</option>').join('');
    if(cur&&FILES[cur]) sel.value=cur;
  }
}
function render(){
  const rows=$('rows');
  if(!rows) return;
  rows.innerHTML='';
  FILES.forEach((f,i)=>{
    const tr=document.createElement('tr'); tr.className='f'; tr.tabIndex=0;
    tr.innerHTML='<td class="name" title="'+esc(f.name)+'">'+esc(f.name)+'</td>'+
      '<td class="fmt">'+(f.an?f.an.fmt:'—')+'</td>'+
      '<td class="n">'+(f.an?(f.meta?bytesFmt(f.meta):'—'):'—')+'</td>'+
      '<td class="n">'+bytesFmt(f.size)+(f.out?' → '+bytesFmt(f.out.length):'')+'</td>'+
      '<td>'+chip(f)+'</td>'+
      '<td>'+(f.url?'<a class="dl" href="'+f.url+'" download="'+esc(f.outName)+'">descarregar</a>':'')+'</td>';
    tr.onclick=ev=>{ if(ev.target.tagName!=='A'){ f.open=!f.open; render(); } };
    tr.onkeydown=ev=>{ if(ev.key==='Enter'){ f.open=!f.open; render(); } };
    rows.appendChild(tr);
    if(f.open) rows.appendChild(detailRow(f));
  });
  $('count').textContent=FILES.length?FILES.length+' ficheiro'+(FILES.length>1?'s':''):'nenhum ficheiro';
  $('tbl').classList.toggle('hidden',!FILES.length);
  $('btnScan').disabled=!FILES.length;
  $('btnClean').disabled=!FILES.some(f=>f.an);
  $('btnZip').disabled=!FILES.some(f=>f.out);
  $('btnClear').disabled=!FILES.length;
  fillSelects();
}
function detailRow(f){
  const tr=document.createElement('tr'); tr.className='detail';
  const td=document.createElement('td'); td.colSpan=6;
  const an=f.an;
  let left='<h4>Metadados encontrados</h4>';
  if(!an) left+='<p class="empty">Ainda não analisado.</p>';
  else {
    const shown=an.blocks.filter(b=>b.kind!=='core');
    if(!shown.length) left+='<p class="empty">Nenhum metadado — o ficheiro só tem áudio.</p>';
    else left+='<div class="blocks">'+shown.map(b=>
      '<div class="blk"><div class="h"><b>'+esc(b.name)+'</b><i>'+bytesFmt(b.len)+' · '+(drops(b.kind,getOpts())?'a remover':'mantido')+'</i></div>'+
      (b.fields&&b.fields.length?b.fields.slice(0,10).map(x=>'<div class="f"><u>'+esc(x[0])+':</u> '+esc(String(x[1]).slice(0,180))+'</div>').join(''):'')+
      '</div>').join('')+'</div>';
    if(an.warn.length) left+='<div class="blk" style="color:var(--amber)">'+an.warn.map(esc).join('<br>')+'</div>';
  }
  let right='<h4>Ficheiro</h4><div class="kv">';
  if(an) for(const [k,v] of Object.entries(an.props)) right+='<div><b>'+esc(k)+'</b><span>'+esc(v)+'</span></div>';
  right+='</div>';
  if(f.hashBefore){
    right+='<h4 style="margin-top:14px">Verificação do áudio</h4><div class="kv">'+
      '<div><b>SHA-256 antes</b><span>'+f.hashBefore.slice(0,32)+'…</span></div>'+
      '<div><b>SHA-256 depois</b><span class="'+(f.bitPerfect?'g':'r')+'">'+f.hashAfter.slice(0,32)+'…</span></div>'+
      '<div><b>Amostras</b><span>'+bytesFmt(f.audioLen)+'</span></div>'+
      '<div><b>Resultado</b><span class="'+(f.bitPerfect?'g':'r')+'">'+(f.bitPerfect?'áudio idêntico ao original':'o áudio mudou')+'</span></div></div>';
  }
  if(f.wmInfo){
    right+='<h4 style="margin-top:14px">Marca BeatFreak</h4><div class="kv">'+
      '<div><b>Faixa</b><span>'+esc(f.wmInfo.trackId)+'</span></div>'+
      '<div><b>Cópia</b><span>'+f.wmInfo.copy+'</span></div>'+
      '<div><b>Data</b><span>'+f.wmInfo.date.toISOString().slice(0,10)+'</span></div></div>';
  }
  td.innerHTML='<div class="det"><div>'+left+'</div><div>'+right+'</div></div>';
  tr.appendChild(td); return tr;
}

/* ---------------- entrada de ficheiros ---------------- */
function addFiles(list){
  for(const file of list){
    if(FILES.some(f=>f.name===file.name&&f.size===file.size)) continue;
    FILES.push({file,name:file.name,size:file.size,state:'idle',open:false});
  }
  render();
}
function addResult(name,bytes,state){
  const f={name,size:bytes.length,bytes,state:state||'done',open:false};
  f.an=analyze(bytes,name);
  f.meta=removable(f.an,getOpts());
  f.outName=name; f.out=bytes;
  f.url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
  FILES.push(f); render();
  return f;
}
async function bytesOf(f){
  if(!f.bytes) f.bytes=new Uint8Array(await f.file.arrayBuffer());
  return f.bytes;
}
async function pcmOf(f){
  if(f.pcm) return f.pcm;
  await bytesOf(f);
  let p=pcmFromWav(f.bytes);
  if(!p){
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const buf=await ctx.decodeAudioData(f.bytes.slice().buffer);
    ctx.close();
    p=pcmFromAudioBuffer(buf,24); p.converted=true;
  }
  f.pcm=p; return p;
}

/* ---------------- limpar ---------------- */
async function scanAll(){
  const opts=getOpts();
  for(const f of FILES){
    if(f.an){ f.meta=removable(f.an,opts); continue; }
    f.state='reading'; render(); await pause();
    try{
      await bytesOf(f);
      f.an=analyze(f.bytes,f.name);
      if(!f.an){ f.err=true; f.state='idle'; }
      else { f.meta=removable(f.an,opts); f.state='scanned'; }
    }catch(err){ f.err=true; }
    render(); await pause();
  }
  render();
}
function attach(f,out,suffix){
  const dot=f.name.lastIndexOf('.');
  f.out=out;
  f.outName=(dot>0?f.name.slice(0,dot):f.name)+suffix+(dot>0?f.name.slice(dot):'');
  if(f.url) URL.revokeObjectURL(f.url);
  f.url=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'}));
}
async function cleanAll(){
  const opts=getOpts();
  await scanAll();
  for(const f of FILES){
    if(!f.an||f.err) continue;
    f.state='working'; render(); await pause();
    try{
      f.hashBefore=sha256(f.bytes.subarray(f.an.audio.off,f.an.audio.off+f.an.audio.len));
      f.audioLen=f.an.audio.len;
      const out=f.an.rebuild(opts);
      const an2=analyze(out,f.name);
      f.hashAfter=an2?sha256(out.subarray(an2.audio.off,an2.audio.off+an2.audio.len)):'ILEGÍVEL';
      f.bitPerfect=(f.hashAfter===f.hashBefore);
      attach(f,out,'_clean');
      f.state='done';
    }catch(err){ f.err=true; f.state='scanned'; console.error(err); }
    render(); await pause();
  }
}
function zipAll(){
  const list=FILES.filter(f=>f.out).map(f=>({name:f.outName,data:f.out}));
  if(!list.length) return;
  const a=document.createElement('a');
  a.href=URL.createObjectURL(makeZip(list));
  a.download='masters.zip'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),8000);
}

/* ---------------- etiquetas ---------------- */
let COVER=null;
function buildTagForm(){
  const box=$('tagForm');
  if(!box) return;
  /* Os ids gerados aqui têm de levar o mesmo prefixo dos que vêm do HTML,
     senão $() não os encontra quando o módulo corre embebido. */
  box.innerHTML=TAG_FIELDS.map(d=>
    '<label class="fld"><span>'+esc(d.label)+'</span><input type="text" id="'+BFAC_PREFIX+'tf_'+d.k+'"></label>').join('');
}
const tagValues=()=>Object.fromEntries(TAG_FIELDS.map(d=>[d.k,($('tf_'+d.k)||{}).value||'']));
async function tagRead(){
  const f=FILES[+$('tagFile').value]; if(!f) return;
  await bytesOf(f); if(!f.an) f.an=analyze(f.bytes,f.name);
  const v=readTagsInto(f.an);
  for(const d of TAG_FIELDS){ const el=$('tf_'+d.k); if(el) el.value=v[d.k]||''; }
  $('tagLog').textContent='lido de '+f.name;
}
async function tagApply(all){
  const vals=tagValues(), targets=all?FILES.slice():[FILES[+$('tagFile').value]];
  let n=0,msg=[];
  for(const f of targets){
    if(!f) continue;
    try{
      await bytesOf(f); if(!f.an) f.an=analyze(f.bytes,f.name);
      if(!f.an){ msg.push(f.name+': ilegível'); continue; }
      const r=writeTags(f.bytes,f.an,vals,COVER,{bext:$('t_bext').checked,o_extra:$('o_extra').checked});
      if(r.bytes){ attach(f,r.bytes,'_tagged'); f.state=r.ok?'tagged':'done'; n++; }
      if(!r.ok) msg.push(f.name+': '+r.error);
    }catch(err){ msg.push(f.name+': '+err.message); }
  }
  $('tagLog').textContent=n+' ficheiro(s) escritos'+(msg.length?' · '+msg.join(' · '):'');
  render();
}

/* ---------------- marca de água ---------------- */
const wmOpts=()=>({band:$('wmBand').value,strength:+$('wmStrength').value});
const wmKey=()=>$('wmKey').value||'BeatFreak Studio';
function wmLog(s){ $('wmLog').textContent=s; }

async function wmScanAll(){
  const rows=$('wmRows'); rows.innerHTML=''; $('wmTbl').classList.remove('hidden');
  for(const f of FILES){
    wmLog('a analisar '+f.name+'…'); await pause();
    let mark='—',copy='',date='',margin='',other='';
    try{
      const p=await pcmOf(f);
      const d=await wmDetect(p,wmKey(),wmOpts(),x=>wmLog('a ler marca em '+f.name+' · '+Math.round(x*100)+'%'));
      margin=d.margin.toFixed(1)+' dB';
      if(d.found){
        f.wmInfo=d.info;
        mark='<span class="chip ok">presente</span>';
        copy=String(d.info.copy); date=d.info.date.toISOString().slice(0,10);
      } else mark='<span class="chip idle">não</span>';
      wmLog('a procurar outros sinais em '+f.name+'…'); await pause();
      const buf=await audioBufferOf(f);
      const sp=await spectral(buf,()=>{});
      const hits=report(sp).out.filter(r=>r.cls==='hit');
      other=hits.length?hits.map(h=>'<span class="chip warn">'+esc(h.t.toLowerCase())+'</span>').join(' '):'<span class="chip idle">nada</span>';
    }catch(err){ other='<span class="chip err">'+esc(err.message)+'</span>'; }
    const tr=document.createElement('tr');
    tr.innerHTML='<td class="name">'+esc(f.name)+'</td><td>'+mark+'</td><td class="n">'+copy+
      '</td><td class="fmt">'+date+'</td><td class="n">'+margin+'</td><td>'+other+'</td>';
    rows.appendChild(tr);
  }
  wmLog('inventário completo. A coluna da direita são anomalias no espectro, não uma identificação de marca: sem chave não há forma de dizer de quem é, nem de remover.');
  render();
}
function wavName(f,suffix){
  const dot=f.name.lastIndexOf('.');
  return (dot>0?f.name.slice(0,dot):f.name)+suffix+'.wav';
}
function wmDl(name,url,label){
  const box=$('wmOut');
  const a=document.createElement('a');
  a.className='dl'; a.href=url; a.download=name; a.textContent=label||('descarregar '+name);
  box.appendChild(a);
}
/* marca uma cópia e devolve o ficheiro pronto a entregar */
async function wmMakeCopy(f,copy,recipient,onStep){
  const p=await pcmOf(f);
  const track=$('wmTrack').value||f.name;
  const payload=wmPack({track,copy,date:Date.now()});
  const r=await wmEmbed(p,wmKey(),payload,wmOpts(),onStep);
  if(!r.ok) throw new Error(r.error);
  let out=wavFromPcm(r.pcm);
  if($('wmKeepTags').checked){
    if(!f.an){ await bytesOf(f); f.an=analyze(f.bytes,f.name); }
    const vals=f.an?readTagsInto(f.an):{};
    if(Object.keys(vals).length){
      const an=analyze(out,'x.wav');
      const w=writeTags(out,an,vals,null,{});
      if(w.bytes) out=w.bytes;
    }
  }
  const suffix=recipient?('_c'+String(copy).padStart(3,'0')):'_BFS';
  const name=wavName(f,suffix);
  const nf=addResult(name,out,'marked');
  nf.pcm=r.pcm; nf.wmInfo=wmUnpack(payload);
  const sha=sha256(out);
  if($('wmRegister').checked){
    regAdd({track,trackId:nf.wmInfo.trackId,copy,recipient:recipient||'',note:'',
      file:name,sha,band:$('wmBand').value,strength:+$('wmStrength').value});
    renderReg();
  }
  wmDl(name,nf.url,name+(recipient?' → '+recipient:''));
  return {name,r,p,sha};
}
async function wmEmbedSel(){
  const f=FILES[+$('wmFile').value]; if(!f) return;
  $('wmOut').innerHTML='';
  try{
    wmLog('a gravar a marca…');
    const {r,p}=await wmMakeCopy(f,+$('wmCopy').value,'',x=>wmLog('a gravar a marca · '+Math.round(x*100)+'%'));
    $('wmCopy').value=String(regNextCopy($('wmTrack').value||f.name));
    wmLog('marca gravada em '+r.marked+' de '+r.blocks+' blocos, a '+r.strength+' dB abaixo do sinal'+
      (r.clipped?' · '+r.clipped+' amostras limitadas no topo':'')+
      (p.converted?' · o original não era WAV, por isso a saída é PCM 24 bit descodificado':'')+
      ' · o ficheiro está pronto aqui em baixo.');
  }catch(err){ wmLog('erro: '+err.message); }
}
async function wmBatch(){
  const f=FILES[+$('wmFile').value]; if(!f) return;
  const list=$('wmBatch').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!list.length){ wmLog('Escreve os destinatários, um por linha.'); return; }
  $('wmOut').innerHTML=''; BATCH.length=0;
  const track=$('wmTrack').value||f.name;
  let copy=regNextCopy(track);
  for(let i=0;i<list.length;i++){
    try{
      const res=await wmMakeCopy(f,copy,list[i],x=>wmLog('cópia '+copy+' para '+list[i]+' · '+Math.round(x*100)+'%'));
      BATCH.push({name:res.name,data:FILES[FILES.length-1].out});
      copy++;
    }catch(err){ wmLog('erro na cópia para '+list[i]+': '+err.message); return; }
  }
  $('wmCopy').value=String(copy);
  wmLog(list.length+' cópias numeradas de '+(copy-list.length)+' a '+(copy-1)+', cada uma com o seu destinatário no registo.');
}
const BATCH=[];
function wmZip(){
  if(!BATCH.length){ wmLog('Ainda não há cópias em lote para juntar.'); return; }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(makeZip(BATCH));
  a.download='copias.zip'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),8000);
}
async function wmRemoveSel(){
  const f=FILES[+$('wmFile').value]; if(!f) return;
  try{
    const p=await pcmOf(f);
    wmLog('a procurar a marca…');
    const det=await wmDetect(p,wmKey(),wmOpts(),x=>wmLog('a ler · '+Math.round(x*100)+'%'));
    if(!det.found){
      wmLog('Nenhuma marca legível com esta chave. Se o ficheiro tem uma marca de outra pessoa, ela não pode ser reconstruída sem a chave de quem a gravou, e por isso não é removível aqui.');
      return;
    }
    const r=await wmRemove(p,wmKey(),{...wmOpts(),detection:det},x=>wmLog('a remover · '+Math.round(x*100)+'%'));
    if(!r.ok){ wmLog(r.error); return; }
    const out=wavFromPcm(r.pcm);
    const nf=addResult(wavName(f,'_sem-marca'),out,'unmarked');
    nf.pcm=r.pcm;
    $('wmOut').innerHTML=''; wmDl(nf.name,nf.url);
    const check=await wmDetect(r.pcm,wmKey(),wmOpts());
    wmLog('marca da cópia '+det.info.copy+' removida de '+r.blocks+' blocos · verificação: '+
      (check.found?'ainda legível, algo correu mal':'já não é legível')+
      ' · SHA-256 do WAV resultante '+sha256(out).slice(0,24)+'… — compara com o master antes de marcares para confirmares que voltou ao mesmo.');
  }catch(err){ wmLog('erro: '+err.message); }
}

/* ---------------- espectro ---------------- */
async function audioBufferOf(f){
  if(f.buf) return f.buf;
  await bytesOf(f);
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  f.buf=await ctx.decodeAudioData(f.bytes.slice().buffer);
  ctx.close();
  return f.buf;
}
async function runAnalysis(){
  const f=FILES[+$('anaFile').value]; if(!f) return;
  const log=m=>{$('anaLog').textContent=m;};
  $('btnAna').disabled=true; $('anaOut').classList.add('hidden');
  try{
    log('a descodificar…'); await pause();
    const buf=await audioBufferOf(f);
    const sp=await spectral(buf,log);
    const {out,notches}=report(sp);
    drawSpec(sp); drawAvg(sp,notches);
    $('findings').innerHTML=out.map(r=>'<div class="find '+r.cls+'"><div class="t">'+esc(r.t)+'<em>'+esc(r.d)+'</em></div><div class="m">'+esc(r.m)+'</div></div>').join('');
    $('anaOut').classList.remove('hidden');
    log(f.name+' · '+buf.numberOfChannels+' canais · '+buf.sampleRate+' Hz · '+timeFmt(buf.duration)+' · '+sp.nF+' janelas de '+N+' amostras');
  }catch(err){ log('Não foi possível descodificar este ficheiro neste browser: '+err.message); }
  $('btnAna').disabled=false;
}

/* ---------------- medição ---------------- */
const dbf=(v,d)=>(isFinite(v)?(v>=0?'+':'')+v.toFixed(d==null?1:d):'—');
function kvRow(k,v,cls){ return '<div><b>'+esc(k)+'</b><span'+(cls?' class="'+cls+'"':'')+'>'+esc(v)+'</span></div>'; }
async function runMeasure(){
  const f=FILES[+$('measFile').value]; if(!f) return;
  const log=m=>{ $('measLog').textContent=m; };
  $('btnMeas').disabled=true; $('measOut').classList.add('hidden');
  try{
    log('a preparar as amostras…'); await pause();
    const p=await pcmOf(f);
    const m=await measure(p,log);
    f.meas=m;
    $('measA').innerHTML=
      kvRow('LUFS integrado',dbf(m.integrated,2)+' LUFS')+
      kvRow('Short-term máx',dbf(m.shortMax,2)+' LUFS')+
      kvRow('Momentâneo máx',dbf(m.momentMax,2)+' LUFS')+
      kvRow('Loudness range',m.lra.toFixed(2)+' LU')+
      kvRow('True peak',dbf(m.truePeak,2)+' dBTP',m.truePeak>-0.1?'r':(m.truePeak>-1?'a':'g'))+
      kvRow('Pico de amostra',dbf(m.samplePeak,2)+' dBFS')+
      kvRow('RMS',dbf(m.rms,2)+' dBFS')+
      kvRow('Crest factor',m.crest.toFixed(1)+' dB')+
      kvRow('PLR',m.plr.toFixed(1)+' LU');
    const d=m.depth, mono=m.mono;
    $('measB').innerHTML=
      kvRow('Declarado',m.sr+' Hz · '+m.bits+' bit · '+m.ch+' canais')+
      kvRow('Bits reais',d.bits+' bit'+(d.padded?' — os '+d.padded+' de baixo estão a zero':''),d.padded?'a':'g')+
      kvRow('Duração',timeFmt(m.duration))+
      kvRow('Silêncio no início',m.silence.headSec.toFixed(3)+' s ('+m.silence.head+' amostras)')+
      kvRow('Silêncio no fim',m.silence.tailSec.toFixed(3)+' s')+
      kvRow('Ruído de fundo',dbf(m.noiseFloor,1)+' dBFS')+
      kvRow('Offset DC',m.dc.map(v=>(v*100).toFixed(4)+'%').join(' · '),Math.max(...m.dc.map(Math.abs))>0.001?'a':'')+
      kvRow('Amostras coladas ao topo',m.clip.runs+' troços'+(m.clip.worst?' · o pior com '+m.clip.worst+' amostras':''),m.clip.runs?'a':'g')+
      (mono?kvRow('Perda em mono',dbf(mono.loss,1)+' dB · graves '+dbf(m.bassMonoLoss,1)+' dB',m.bassMonoLoss<-3?'a':'g'):'')+
      (mono?kvRow('Correlação L/R',mono.corr.toFixed(3)):'');
    $('measTargets').innerHTML=TARGETS.map(t=>{
      const dl=m.integrated-t.lufs, tpOk=m.truePeak<=t.tp;
      const ok=Math.abs(dl)<=1&&tpOk;
      return '<tr><td>'+esc(t.name)+'</td><td class="n">'+t.lufs+' LUFS</td>'+
        '<td class="n">'+dbf(dl,1)+' LU</td><td class="n">'+t.tp.toFixed(1)+' dBTP</td>'+
        '<td>'+(ok?'<span class="chip ok">dentro</span>':
          '<span class="chip warn">'+(Math.abs(dl)>1?(dl>0?'baixar '+dl.toFixed(1)+' LU':'subir '+(-dl).toFixed(1)+' LU'):'')+
          (!tpOk?(Math.abs(dl)>1?' · ':'')+'true peak acima do tecto':'')+'</span>')+'</td></tr>';
    }).join('');
    const finds=[];
    if(m.truePeak>-0.1) finds.push({cls:'hit',t:'True peak no limite',d:'A '+dbf(m.truePeak,2)+' dBTP, qualquer codificação com perdas vai distorcer na descodificação. Baixa o tecto do limitador.',m:dbf(m.truePeak,2)+' dBTP'});
    if(d.padded>=4) finds.push({cls:'hit',t:'Profundidade declarada a mais',d:'O cabeçalho diz '+m.bits+' bit mas os '+d.padded+' bits de baixo estão sempre a zero. Isto é um '+d.bits+' bit com enchimento.',m:d.bits+' bit reais'});
    if(m.clip.runs>0) finds.push({cls:'hit',t:'Amostras consecutivas no fundo de escala',d:m.clip.runs+' troços com pelo menos 3 amostras coladas ao máximo. É a assinatura de um master já esmagado ou de uma conversão que passou do topo.',m:m.clip.samples+' amostras'});
    if(m.bassMonoLoss!=null&&m.bassMonoLoss<-3) finds.push({cls:'hit',t:'Graves desaparecem em mono',d:'Abaixo de 120 Hz perdem-se '+dbf(m.bassMonoLoss,1)+' dB ao somar para mono. Em rádio e em coluna de telemóvel isso ouve-se.',m:dbf(m.bassMonoLoss,1)+' dB'});
    if(Math.max(...m.dc.map(Math.abs))>0.001) finds.push({cls:'hit',t:'Offset DC',d:'Há uma componente contínua a comer margem de pico. Um passa-alto muito baixo resolve.',m:(Math.max(...m.dc.map(Math.abs))*100).toFixed(3)+'%'});
    if(m.silence.headSec>1) finds.push({cls:'info',t:'Silêncio à cabeça',d:'São '+m.silence.headSec.toFixed(2)+' s antes do primeiro som. Algumas plataformas cortam, outras não.',m:m.silence.headSec.toFixed(2)+' s'});
    if($('measSpec').checked){
      log('a analisar o espectro…'); await pause();
      try{
        const buf=await audioBufferOf(f);
        const sp=await spectral(buf,log);
        const pv=provenance(sp);
        finds.push({cls:pv.lossy?'hit':'clear',t:'Origem do material',
          d:pv.lossy?'O espectro corta a pique aos '+(pv.cutoff/1000).toFixed(1)+' kHz, com '+pv.slope.toFixed(0)+' dB de queda logo a seguir. Isto não é um master lossless: passou por '+pv.guess+' e foi descodificado outra vez.'
            :'O topo do espectro chega perto de Nyquist sem corte abrupto. Não há sinal de ter passado por um codec com perdas.',
          m:(pv.cutoff/1000).toFixed(1)+' kHz'});
        for(const r of report(sp).out) if(r.cls==='hit'&&r.t!=='Corte espectral') finds.push(r);
      }catch(err){ finds.push({cls:'info',t:'Análise espectral',d:'Não foi possível descodificar: '+err.message,m:'—'}); }
    }
    $('measFind').innerHTML=finds.map(r=>'<div class="find '+r.cls+'"><div class="t">'+esc(r.t)+'<em>'+esc(r.d)+'</em></div><div class="m">'+esc(r.m)+'</div></div>').join('');
    $('measOut').classList.remove('hidden');
    MEAS_LAST={pcm:p,m};
    drawWave($('measWave'),p,m);
    drawLoudness($('measLoud'),m,+($('measTarget')&&$('measTarget').value||-14));
    $('waveInfo').textContent=m.clip.runs+' troços no fundo de escala · '+(m.overs?m.overs.length:0)+' overs acima de −1 dBTP';
    log(f.name+' · '+m.sr+' Hz · '+m.ch+' canais · '+timeFmt(m.duration));
  }catch(err){ log('erro: '+err.message); }
  $('btnMeas').disabled=false;
}

let MEAS_LAST=null;

/* ---------------- comparar dois ficheiros ---------------- */
let CMP=null, CMP_CTX=null, CMP_SRC=null, CMP_GAIN=null;
function cmpStop(){
  if(CMP_SRC){ try{ CMP_SRC.stop(); }catch(_){} CMP_SRC=null; }
  $('btnCmpStop').disabled=true;
}
function cmpBuffer(chans,sr){
  if(!CMP_CTX) CMP_CTX=new (window.AudioContext||window.webkitAudioContext)();
  const b=CMP_CTX.createBuffer(chans.length,chans[0].length,sr);
  for(let c=0;c<chans.length;c++) b.copyToChannel(Float32Array.from(chans[c]),c);
  return b;
}
function cmpPlay(which){
  if(!CMP) return;
  cmpStop();
  const src=CMP.audio[which];
  if(!src) return;
  const buf=cmpBuffer(src,CMP.sr);
  CMP_SRC=CMP_CTX.createBufferSource(); CMP_SRC.buffer=buf;
  CMP_GAIN=CMP_CTX.createGain();
  CMP_GAIN.gain.value=which==='d'?Math.pow(10,+$('cmpGain').value/20):1;
  CMP_SRC.connect(CMP_GAIN).connect(CMP_CTX.destination);
  CMP_SRC.onended=()=>{ $('btnCmpStop').disabled=true; };
  CMP_SRC.start();
  $('btnCmpStop').disabled=false;
}
async function cmpRun(){
  const a=FILES[+$('cmpA').value], b=FILES[+$('cmpB').value];
  const log=m=>{ $('cmpLog').textContent=m; };
  if(!a||!b||a===b){ log('Escolhe dois ficheiros diferentes.'); return; }
  $('btnCmp').disabled=true; $('cmpOut').classList.add('hidden');
  try{
    log('a preparar…'); await pause();
    const pa=await pcmOf(a), pb=await pcmOf(b);
    if(pa.sr!==pb.sr){ log('Amostragens diferentes: '+pa.sr+' e '+pb.sr+' Hz. A subtracção não faria sentido.'); $('btnCmp').disabled=false; return; }
    const ch=Math.min(pa.ch,pb.ch), n=Math.min(pa.frames,pb.frames);
    const full=Math.max(pa.full,pb.full);
    const ka=full/pa.full, kb=full/pb.full;
    const A=[],B=[],D=[];
    let peak=0,sq=0,diffN=0,worst=0;
    for(let c=0;c<ch;c++){
      const x=new Float32Array(n), y=new Float32Array(n), d=new Float32Array(n);
      for(let i=0;i<n;i++){
        const va=pa.data[c][i]*ka, vb=pb.data[c][i]*kb, dv=va-vb;
        x[i]=va/full; y[i]=vb/full; d[i]=dv/full;
        const ad=Math.abs(dv);
        if(ad>peak) peak=ad;
        if(ad>0){ diffN++; if(ad>worst) worst=ad; }
        sq+=dv*dv;
      }
      A.push(x); B.push(y); D.push(d);
    }
    const peakDb=20*Math.log10(peak/full+1e-15);
    const rmsDb=10*Math.log10(sq/(n*ch)/(full*full)+1e-30);
    let ea=0; for(let c=0;c<ch;c++) for(let i=0;i<n;i++){ const v=pa.data[c][i]*ka/full; ea+=v*v; }
    const snr=10*Math.log10((ea+1e-30)/(sq/(full*full)+1e-30));
    CMP={sr:pa.sr,audio:{a:A,b:B,d:D},n,ch};
    drawDiff($('cmpCanvas'),D,pa.sr,1);
    $('cmpAxis').textContent=timeFmt(n/pa.sr);
    $('cmpKV').innerHTML=
      kvRow('Amostras comparadas',n+' × '+ch+' canais')+
      kvRow('Amostras diferentes',diffN?diffN+' ('+(100*diffN/(n*ch)).toFixed(2)+'%)':'nenhuma',diffN?'a':'g')+
      kvRow('Pico da diferença',diffN?dbf(peakDb,2)+' dBFS':'silêncio absoluto')+
      kvRow('RMS da diferença',diffN?dbf(rmsDb,2)+' dBFS':'silêncio absoluto')+
      kvRow('Relação A / diferença',diffN?snr.toFixed(1)+' dB':'sem diferença para medir')+
      (pa.frames!==pb.frames?kvRow('Aviso','durações diferentes, comparado até '+timeFmt(n/pa.sr),'a'):'');
    const finds=[];
    if(!diffN) finds.push({cls:'clear',t:'Ficheiros idênticos',d:'Não há uma única amostra diferente. Se um destes foi desmarcado, a reconstrução foi exacta.',m:'0 amostras'});
    else if(peakDb<-60) finds.push({cls:'clear',t:'Diferença inaudível',d:'O pico da diferença fica '+Math.abs(peakDb).toFixed(0)+' dB abaixo do fundo de escala. Carrega em "Ouvir só a diferença" com o ganho no máximo para confirmares pelo ouvido.',m:dbf(peakDb,1)+' dBFS'});
    else if(peakDb<-30) finds.push({cls:'info',t:'Diferença discreta',d:'É o que se espera de uma marca de água ou de um dither. Ouve a diferença amplificada para perceber o que é.',m:dbf(peakDb,1)+' dBFS'});
    else finds.push({cls:'hit',t:'Diferença audível',d:'Os ficheiros não são a mesma coisa: houve reprocessamento, mudança de ganho ou recodificação pelo meio.',m:dbf(peakDb,1)+' dBFS'});
    $('cmpFind').innerHTML=finds.map(r=>'<div class="find '+r.cls+'"><div class="t">'+esc(r.t)+'<em>'+esc(r.d)+'</em></div><div class="m">'+esc(r.m)+'</div></div>').join('');
    $('cmpOut').classList.remove('hidden');
    ['btnCmpPlayA','btnCmpPlayB','btnCmpPlayD'].forEach(i=>$(i).disabled=false);
    log('diferença calculada · '+timeFmt(n/pa.sr)+' a '+pa.sr+' Hz');
  }catch(err){ log('erro: '+err.message); }
  $('btnCmp').disabled=false;
}

/* ---------------- registo ---------------- */
function renderReg(){
  if(!$('regRows')) return;
  const list=regAll();
  $('regRows').innerHTML=list.map(e=>
    '<tr><td class="fmt">'+esc(e.ts.slice(0,10))+'</td><td class="name">'+esc(e.track||'')+'</td>'+
    '<td class="n">'+(e.copy|0)+'</td><td>'+esc(e.recipient||'—')+'</td>'+
    '<td class="name fmt">'+esc(e.file||'')+'</td>'+
    '<td class="fmt" title="'+esc(e.sha||'')+'">'+esc((e.sha||'').slice(0,16))+'…</td>'+
    '<td><button data-ts="'+esc(e.ts)+'" class="regDel">apagar</button></td></tr>').join('');
  $('regCount').textContent=list.length?list.length+' entrega'+(list.length>1?'s':''):'ainda sem entregas';
  $$('.regDel').forEach(b=>b.onclick=()=>{ regRemove(b.dataset.ts); renderReg(); });
}

/* ---------------- eventos ---------------- */
function bfacInit(){
  /* Um painel pode ter sido escondido no mount: ligar só o que existe. */
  const _n=()=>{};
  const E=id=>$(id)||{addEventListener:_n,classList:{add:_n,remove:_n,toggle:_n}};
$$('.tabs button').forEach(b=>b.onclick=()=>{
  $$('.tabs button').forEach(x=>x.classList.toggle('on',x===b));
  $$('.panel').forEach(p=>p.classList.toggle('on',p.id===BFAC_PREFIX+'p-'+b.dataset.tab));
});
E('drop').onclick=()=>E('picker').click();
E('drop').onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); E('picker').click(); } };
E('picker').onchange=e=>{ addFiles(e.target.files); e.target.value=''; };
['dragenter','dragover'].forEach(t=>E('drop').addEventListener(t,e=>{e.preventDefault();E('drop').classList.add('over');}));
['dragleave','drop'].forEach(t=>E('drop').addEventListener(t,e=>{e.preventDefault();E('drop').classList.remove('over');}));
E('drop').addEventListener('drop',e=>{ if(e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
window.addEventListener('dragover',e=>e.preventDefault());
window.addEventListener('drop',e=>e.preventDefault());
E('btnScan').onclick=scanAll;
E('btnClean').onclick=cleanAll;
E('btnZip').onclick=zipAll;
E('btnClear').onclick=()=>{ FILES.forEach(f=>f.url&&URL.revokeObjectURL(f.url)); FILES.length=0;
  E('anaOut').classList.add('hidden'); E('anaLog').textContent=''; E('wmTbl').classList.add('hidden'); render(); };
E('btnAna').onclick=runAnalysis;
E('btnTagRead').onclick=tagRead;
E('btnTagApply').onclick=()=>tagApply(false);
E('btnTagAll').onclick=()=>tagApply(true);
E('tagArt').onchange=async e=>{
  const file=e.target.files[0];
  if(!file){ COVER=null; E('artInfo').textContent='nenhuma imagem escolhida'; return; }
  COVER={mime:file.type||'image/jpeg',data:new Uint8Array(await file.arrayBuffer())};
  E('artInfo').textContent=file.name+' · '+bytesFmt(COVER.data.length);
};
E('btnWmScan').onclick=wmScanAll;
E('btnWmEmbed').onclick=wmEmbedSel;
E('btnWmRemove').onclick=wmRemoveSel;
E('btnWmBatch').onclick=wmBatch;
E('btnWmZip').onclick=wmZip;
E('btnMeas').onclick=runMeasure;
E('btnCmp').onclick=cmpRun;
E('btnCmpPlayA').onclick=()=>cmpPlay('a');
E('btnCmpPlayB').onclick=()=>cmpPlay('b');
E('btnCmpPlayD').onclick=()=>cmpPlay('d');
E('btnCmpStop').onclick=cmpStop;
E('cmpGain').oninput=e=>{
  E('cmpGainV').textContent='+'+e.target.value+' dB';
  if(CMP_GAIN) CMP_GAIN.gain.value=Math.pow(10,+e.target.value/20);
};
window.addEventListener('resize',()=>{
  if(MEAS_LAST){ drawWave(E('measWave'),MEAS_LAST.pcm,MEAS_LAST.m); drawLoudness(E('measLoud'),MEAS_LAST.m,-14); }
});
E('btnRegCSV').onclick=()=>regDownload(regCSV(),'entregas-beatfreak.csv','text/csv');
E('btnRegJSON').onclick=()=>regDownload(regJSON(),'entregas-beatfreak.json','application/json');
E('btnRegClear').onclick=()=>{ if(confirm('Apagar o registo todo? Exporta primeiro se ainda não o fizeste.')){ regSave([]); renderReg(); } };
OPTIDS.forEach(id=>$(id).onchange=()=>{ const o=getOpts(); FILES.forEach(f=>{ if(f.an) f.meta=removable(f.an,o); }); render(); });
  buildTagForm();
  renderReg();
  render();
}
if(typeof BFAC_EMBED==='undefined') bfacInit();

/* Acesso pela consola do browser, para automatizar tarefas repetidas. */
window.BFAC={FILES,version:'1.0',
  analyze,sha256,writeTags,readTagsInto,TAG_FIELDS,
  pcmFromWav,wavFromPcm,pcmFromAudioBuffer,
  wmPack,wmUnpack,wmEmbed,wmDetect,wmRemove,wmPlan,
  spectral,report,provenance,measure,TARGETS,
  regAll,regAdd,regCSV,regNextCopy,
  addResult,pcmOf,wmMakeCopy,cmpRun,runMeasure,drawWave,drawLoudness,
  validarEntrega,bfacInit};
