/* =========================================================================
   tags.js — escrita de metadados.
   O ficheiro é primeiro reconstruído sem nenhuma etiqueta e só depois
   recebe as novas, para não ficarem restos da anterior.
   ========================================================================= */

const TAG_FIELDS=[
  {k:'title', label:'Título',      id3:'TIT2', vorbis:'TITLE',       riff:'INAM', aiff:'NAME'},
  {k:'artist',label:'Artista',     id3:'TPE1', vorbis:'ARTIST',      riff:'IART', aiff:'AUTH'},
  {k:'album', label:'Álbum',       id3:'TALB', vorbis:'ALBUM',       riff:'IPRD'},
  {k:'year',  label:'Ano',         id3:'TYER', vorbis:'DATE',        riff:'ICRD'},
  {k:'genre', label:'Género',      id3:'TCON', vorbis:'GENRE',       riff:'IGNR'},
  {k:'track', label:'Faixa',       id3:'TRCK', vorbis:'TRACKNUMBER', riff:'ITRK'},
  {k:'isrc',  label:'ISRC',        id3:'TSRC', vorbis:'ISRC'},
  {k:'composer',label:'Compositor',id3:'TCOM', vorbis:'COMPOSER',    riff:'IENG'},
  {k:'publisher',label:'Editora',  id3:'TPUB', vorbis:'ORGANIZATION'},
  {k:'copyright',label:'Copyright',id3:'TCOP', vorbis:'COPYRIGHT',   riff:'ICOP', aiff:'(c) '},
  {k:'engineer',label:'Masterização',id3:'TENC',vorbis:'ENCODED-BY', riff:'IENG'},
  {k:'comment',label:'Comentário', id3:'COMM', vorbis:'COMMENT',     riff:'ICMT', aiff:'ANNO'}
];
const TE=new TextEncoder();
const be32=n=>new Uint8Array([(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]);
const le32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
const syncsafe=n=>new Uint8Array([(n>>21)&0x7f,(n>>14)&0x7f,(n>>7)&0x7f,n&0x7f]);
function utf16(s){
  const o=new Uint8Array(2+s.length*2); o[0]=0xff; o[1]=0xfe;
  for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); o[2+i*2]=c&255; o[3+i*2]=c>>8; }
  return o;
}
const latin=s=>Uint8Array.from([...s].map(c=>c.charCodeAt(0)&255));

/* ---------------- ID3v2.3 ---------------- */
function buildID3(f,art){
  const frames=[];
  const push=(id,body)=>frames.push(cat([latin(id),be32(body.length),new Uint8Array([0,0]),body]));
  for(const d of TAG_FIELDS){
    const v=(f[d.k]||'').trim();
    if(!v||!d.id3||d.id3==='COMM') continue;
    push(d.id3,cat([new Uint8Array([1]),utf16(v)]));
  }
  if((f.comment||'').trim())
    push('COMM',cat([new Uint8Array([1]),latin('por'),utf16(''),new Uint8Array([0,0]),utf16(f.comment.trim())]));
  if(art&&art.data)
    push('APIC',cat([new Uint8Array([0]),latin(art.mime),new Uint8Array([0,3]),new Uint8Array([0]),art.data]));
  let n=0; for(const fr of frames) n+=fr.length;
  if(!n) return new Uint8Array(0);
  const pad=1024;
  return cat([latin('ID3'),new Uint8Array([3,0,0]),syncsafe(n+pad),...frames,new Uint8Array(pad)]);
}

/* ---------------- Vorbis comment (FLAC) ---------------- */
function buildVorbisBlock(f,vendor){
  const items=[];
  for(const d of TAG_FIELDS){
    const v=(f[d.k]||'').trim();
    if(v&&d.vorbis) items.push(TE.encode(d.vorbis+'='+v));
  }
  const ven=TE.encode(vendor||'Beatfreak Audio Cleaner');
  const parts=[le32(ven.length),ven,le32(items.length)];
  for(const it of items){ parts.push(le32(it.length),it); }
  const body=cat(parts);
  return cat([new Uint8Array([4]),be32(body.length).subarray(1),body]);
}
function buildPictureBlock(art){
  if(!art||!art.data) return null;
  const mime=TE.encode(art.mime), desc=TE.encode('');
  const body=cat([be32(3),be32(mime.length),mime,be32(desc.length),desc,
    be32(art.width||0),be32(art.height||0),be32(24),be32(0),be32(art.data.length),art.data]);
  return cat([new Uint8Array([6]),be32(body.length).subarray(1),body]);
}

/* ---------------- RIFF LIST/INFO e bext ---------------- */
function riffChunk(id,body){
  const pad=body.length&1?new Uint8Array(1):new Uint8Array(0);
  return cat([latin(id),le32(body.length),body,pad]);
}
function buildLISTInfo(f){
  const subs=[];
  for(const d of TAG_FIELDS){
    const v=(f[d.k]||'').trim();
    if(v&&d.riff) subs.push(riffChunk(d.riff,cat([TE.encode(v),new Uint8Array([0])])));
  }
  if(!subs.length) return null;
  return riffChunk('LIST',cat([latin('INFO'),...subs]));
}
function buildBext(f){
  const b=new Uint8Array(602);
  const put=(s,o,n)=>{ const e=TE.encode((s||'').slice(0,n)); b.set(e.subarray(0,n),o); };
  put(f.title||'',0,256);
  put(f.originator||'BeatFreak Studio',256,32);
  put(f.isrc||f.track||'',288,32);
  const d=new Date();
  put(d.toISOString().slice(0,10),320,10);
  put(d.toTimeString().slice(0,8),330,8);
  const hist=TE.encode('A=PCM,BeatFreak Studio\r\n');
  return riffChunk('bext',cat([b,hist]));
}

/* ---------------- AIFF ---------------- */
function aiffChunk(id,body){
  const pad=body.length&1?new Uint8Array(1):new Uint8Array(0);
  return cat([latin(id),be32(body.length),body,pad]);
}

/* ---------------- ponto de entrada ---------------- */
function writeTags(bytes,an,f,art,opts){
  opts=opts||{};
  const strip={o_tags:true,o_art:true,o_enc:!!opts.o_enc,o_bext:true,o_extra:!!opts.o_extra,o_junk:true};
  const clean=an.rebuild(strip);
  const an2=analyze(clean,'x.'+an.fmt.toLowerCase());
  if(!an2) return {ok:false,error:'O ficheiro limpo deixou de ser legível; nada foi escrito.'};

  if(an.fmt==='MP3'){
    const tag=buildID3(f,art);
    return {ok:true,bytes:tag.length?cat([tag,clean]):clean};
  }
  if(an.fmt==='FLAC'){
    const si=an2.blocks.find(b=>b.ftype===0);
    if(!si) return {ok:false,error:'FLAC sem STREAMINFO.'};
    const head=clean.subarray(0,si.off+si.len);
    const rest=clean.subarray(si.off+si.len);
    const blocks=[buildVorbisBlock(f,opts.vendor)];
    const pic=buildPictureBlock(art); if(pic) blocks.push(pic);
    head[si.off]&=0x7f;                       // STREAMINFO deixa de ser o último
    for(let i=0;i<blocks.length;i++) blocks[i][0]=(i===blocks.length-1&&rest.length===0?0x80:blocks[i][0]&0x7f);
    const lastOld=rest.length?null:1;
    if(rest.length===0) blocks[blocks.length-1][0]|=0x80;
    else blocks[blocks.length-1][0]&=0x7f;
    return {ok:true,bytes:cat([head,...blocks,rest])};
  }
  if(an.fmt==='WAV'){
    const fmtBlk=an2.blocks.find(b=>b.id==='fmt ');
    const ins=[]; const list=buildLISTInfo(f);
    if(opts.bext) ins.push(buildBext(f));
    if(list) ins.push(list);
    if(!ins.length) return {ok:true,bytes:clean};
    const at=fmtBlk?fmtBlk.off+fmtBlk.len:12;
    const body=cat([clean.subarray(12,at),...ins,clean.subarray(at)]);
    const head=clean.slice(0,12);
    new DataView(head.buffer).setUint32(4,body.length+4,true);
    return {ok:true,bytes:cat([head,body])};
  }
  if(an.fmt==='AIFF'||an.fmt==='AIFC'){
    const ssnd=an2.blocks.find(b=>b.id==='SSND');
    const ins=[];
    for(const d of TAG_FIELDS){
      const v=(f[d.k]||'').trim();
      if(v&&d.aiff) ins.push(aiffChunk(d.aiff,TE.encode(v)));
    }
    if(!ins.length) return {ok:true,bytes:clean};
    const at=ssnd?ssnd.off:clean.length;
    const body=cat([clean.subarray(12,at),...ins,clean.subarray(at)]);
    const head=clean.slice(0,12);
    new DataView(head.buffer).setUint32(4,body.length+4,false);
    return {ok:true,bytes:cat([head,body])};
  }
  return {ok:false,error:'Escrever etiquetas em '+an.fmt+' ainda não está implementado. O ficheiro foi apenas limpo.',bytes:clean};
}

/* lê as etiquetas actuais para preencher o formulário */
function readTagsInto(an){
  const f={};
  if(!an) return f;
  const grab=(name,keys)=>{
    for(const bl of an.blocks) for(const [k,v] of (bl.fields||[]))
      if(keys.includes(k)&&!f[name]) f[name]=String(v);
  };
  grab('title',['Título','TITLE','INAM','NAME','Descrição']);
  grab('artist',['Artista','ARTIST','IART','AUTH']);
  grab('album',['Álbum','ALBUM','IPRD']);
  grab('year',['Ano','Data','DATE','ICRD']);
  grab('genre',['Género','GENRE','IGNR']);
  grab('track',['Faixa','TRACKNUMBER','ITRK']);
  grab('isrc',['ISRC']);
  grab('composer',['Compositor','COMPOSER']);
  grab('publisher',['Editora','ORGANIZATION']);
  grab('copyright',['Copyright','COPYRIGHT','ICOP']);
  grab('engineer',['Codificador','ENCODED-BY','IENG']);
  grab('comment',['Comentário','COMMENT','ICMT','ANNO','Conteúdo']);
  return f;
}
