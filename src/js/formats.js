/* ======================= analisadores por formato ======================= */
/* --PARSERS-START-- */
const REMOVE={tag:'o_tags',art:'o_art',prod:'o_bext',extra:'o_extra',junk:'o_junk'};
function drops(kind,opts){const k=REMOVE[kind]; return k?!!opts[k]:false;}

/* ---------- MP3 ---------- */
const BR_TAB={
 '1-3':[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320],
 '1-2':[0,32,48,56,64,80,96,112,128,160,192,224,256,320,384],
 '1-1':[0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],
 '2-3':[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
 '2-2':[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],
 '2-1':[0,32,48,56,64,80,96,112,128,144,160,176,192,224,256]};
const SR_TAB=[[44100,48000,32000],[22050,24000,16000],[11025,12000,8000]];
function mp3Frame(b,o){
  if(o+4>b.length) return null;
  if(b[o]!==0xff||(b[o+1]&0xe0)!==0xe0) return null;
  const vb=(b[o+1]>>3)&3; if(vb===1) return null;
  const lb=(b[o+1]>>1)&3; if(lb===0) return null;
  const layer=4-lb;                       // 1,2,3
  const vi=vb===3?0:(vb===2?1:2);         // MPEG1 / 2 / 2.5
  const brI=(b[o+2]>>4)&15; if(brI===0||brI===15) return null;
  const srI=(b[o+2]>>2)&3; if(srI===3) return null;
  const pad=(b[o+2]>>1)&1;
  const mode=(b[o+3]>>6)&3;
  const br=BR_TAB[(vi===0?1:2)+'-'+layer][brI], sr=SR_TAB[vi][srI];
  const spf=layer===1?384:(layer===2?1152:(vi===0?1152:576));
  const len=layer===1?(Math.floor(12*br*1000/sr)+pad)*4:Math.floor(spf/8*br*1000/sr)+pad;
  if(len<24) return null;
  return {len,br,sr,spf,layer,mono:mode===3,mpeg1:vi===0,ver:vi};
}
function anaMP3(b){
  const blocks=[],warn=[]; let s=0,e=b.length;
  while(s+10<=e&&ascii(b,s,3)==='ID3'&&b[s+3]<5){
    const ver=b[s+3],fl=b[s+5];
    const sz=((b[s+6]&0x7f)<<21)|((b[s+7]&0x7f)<<14)|((b[s+8]&0x7f)<<7)|(b[s+9]&0x7f);
    const tot=10+sz+((fl&0x10)?10:0);
    if(sz<=0||s+tot>e){warn.push('Cabeçalho ID3v2 com tamanho inconsistente.');break;}
    let fields=[]; try{fields=readID3(b,s,ver,fl,sz);}catch(_){}
    const hasArt=fields.some(f=>f[0]==='Capa');
    blocks.push({name:'ID3v2.'+ver,off:s,len:tot,region:'cabeçalho',kind:'tag',fields,id3:{ver,fl,sz},art:hasArt});
    s+=tot;
  }
  let more=true;
  while(more&&e>s+16){ more=false;
    if(ascii(b,e-32,8)==='APETAGEX'){
      const sz=u32le(b,e-32+12),fl=u32le(b,e-32+20),hdr=(fl&0x80000000)?32:0,st=e-sz-hdr;
      if(st>=s&&sz>32){ blocks.push({name:'APEv2',off:st,len:sz+hdr,region:'fim',kind:'tag',fields:readAPE(b,e-sz,e-32)}); e=st; more=true; continue; }
    }
    if(e-128>=s&&ascii(b,e-128,3)==='TAG'){
      const f=[['Título',txt(TDL.decode(b.subarray(e-125,e-95)))],['Artista',txt(TDL.decode(b.subarray(e-95,e-65)))],
               ['Álbum',txt(TDL.decode(b.subarray(e-65,e-35)))],['Ano',txt(TDL.decode(b.subarray(e-35,e-31)))],
               ['Comentário',txt(TDL.decode(b.subarray(e-31,e-1)))]].filter(x=>x[1]);
      let len=128,off=e-128;
      if(off-227>=s&&ascii(b,off-227,4)==='TAG+'){ len+=227; off-=227; }
      blocks.push({name:'ID3v1',off,len,region:'fim',kind:'tag',fields:f}); e=off; more=true; continue;
    }
    if(e-9>=s&&ascii(b,e-9,9)==='LYRICS200'){
      const sz=parseInt(ascii(b,e-15,6),10);
      if(sz>0&&e-sz-26>=s&&ascii(b,e-sz-26,11)==='LYRICSBEGIN'){
        blocks.push({name:'Lyrics3v2',off:e-sz-26,len:sz+26,region:'fim',kind:'tag',fields:[['Letra',bytesFmt(sz)]]});
        e=e-sz-26; more=true; continue;
      }
    }
  }
  let first=-1;
  for(let o=s;o<Math.min(e,s+1048576);o++){
    const f=mp3Frame(b,o);
    if(f&&(o+f.len>=e||mp3Frame(b,o+f.len))){first=o;break;}
  }
  if(first<0){warn.push('Não foi encontrado nenhum frame MPEG válido.'); return null;}
  if(first>s) blocks.push({name:'Bytes órfãos',off:s,len:first-s,region:'antes do áudio',kind:'junk',fields:[['Conteúdo',txt(TDL.decode(b.subarray(s,Math.min(first,s+80))))||'binário']]});
  const f0=mp3Frame(b,first);
  const xOff=4+(f0.mpeg1?(f0.mono?17:32):(f0.mono?9:17));
  let hdrFrame=null;
  if(first+xOff+4<=e){
    const t=ascii(b,first+xOff,4);
    if(t==='Xing'||t==='Info'){
      let encName='';
      for(let i=first;i<first+f0.len-4;i++){
        const g=ascii(b,i,4);
        if(g==='LAME'||g==='Lavf'||g==='Lavc'){encName=txt(TDL.decode(b.subarray(i,i+9)));break;}
      }
      hdrFrame={off:first,len:f0.len,tag:t};
      blocks.push({name:'Cabeçalho '+t+(encName?' / '+encName:''),off:first,len:f0.len,region:'primeiro frame',kind:'encoder',
        fields:[['Tipo',t==='Xing'?'VBR':'CBR'],encName?['Codificador',encName]:null].filter(Boolean)});
    }
  }
  const aStart=hdrFrame?first+f0.len:first;
  let n=0,samples=0,brs=new Set(),o=aStart;
  while(o<e){const f=mp3Frame(b,o); if(!f) break; n++; samples+=f.spf; brs.add(f.br); o+=f.len;}
  if(o<e-1) warn.push('Dados não reconhecidos no fim do fluxo ('+bytesFmt(e-o)+') — mantidos.');
  const props={'Formato':'MPEG-'+(f0.mpeg1?'1':(f0.ver===1?'2':'2.5'))+' Layer '+f0.layer,
    'Amostragem':f0.sr+' Hz','Canais':f0.mono?'mono':'estéreo',
    'Débito':brs.size>1?'VBR ('+Math.min(...brs)+'–'+Math.max(...brs)+' kbps)':f0.br+' kbps',
    'Frames':String(n),'Duração':timeFmt(samples/f0.sr)};
  return {fmt:'MP3',blocks,warn,props,audio:{off:aStart,len:e-aStart},sr:f0.sr,
    rebuild(opts){
      const segs=[]; let cur=0; const all=blocks.slice().sort((a,c)=>a.off-c.off);
      for(const bl of all){
        if(bl.off>cur) segs.push(b.subarray(cur,bl.off));
        if(bl.kind==='encoder'){
          if(opts.o_enc){
            const cp=b.slice(bl.off,bl.off+bl.len);
            for(let i=0;i<cp.length-4;i++){
              const g=ascii(cp,i,4);
              if(g==='LAME'||g==='Lavf'||g==='Lavc'){ cp.fill(0,i,Math.min(i+20,cp.length)); break; }
            }
            segs.push(cp);
          } else segs.push(b.subarray(bl.off,bl.off+bl.len));
        }
        else if(drops(bl.kind,opts)) {/* removido */}
        else if(bl.id3&&opts.o_art&&bl.art) segs.push(stripAPIC(b.subarray(bl.off,bl.off+bl.len),bl.id3.ver));
        else segs.push(b.subarray(bl.off,bl.off+bl.len));
        cur=bl.off+bl.len;
      }
      if(cur<b.length) segs.push(b.subarray(cur,b.length));
      return cat(segs);
    }};
}
function stripAPIC(tag,ver){
  if(ver<3) return tag;
  const sz=((tag[6]&0x7f)<<21)|((tag[7]&0x7f)<<14)|((tag[8]&0x7f)<<7)|(tag[9]&0x7f);
  const keep=[]; let o=10; const end=10+sz;
  while(o+10<=end){
    const id=ascii(tag,o,4);
    if(!/^[A-Z0-9]{4}$/.test(id)) break;
    const fs=(ver===4)?(((tag[o+4]&0x7f)<<21)|((tag[o+5]&0x7f)<<14)|((tag[o+6]&0x7f)<<7)|(tag[o+7]&0x7f)):u32be(tag,o+4);
    if(fs<=0||o+10+fs>end) break;
    if(id!=='APIC') keep.push(tag.subarray(o,o+10+fs));
    o+=10+fs;
  }
  let body=0; for(const k of keep) body+=k.length;
  const hdr=tag.slice(0,10);
  hdr[5]&=~0x10;
  hdr[6]=(body>>21)&0x7f; hdr[7]=(body>>14)&0x7f; hdr[8]=(body>>7)&0x7f; hdr[9]=body&0x7f;
  return cat([hdr,...keep]);
}

/* ---------- WAV / BWF ---------- */
const WAV_KIND={'fmt ':'core','data':'core','fact':'core','ds64':'core','PEAK':'core',
 'bext':'prod','iXML':'prod','axml':'prod','_PMX':'prod','cart':'prod','umid':'prod','minf':'prod','logi':'prod',
 'ID3 ':'tag','id3 ':'tag','LIST':'tag','DISP':'tag',
 'cue ':'extra','smpl':'extra','inst':'extra','plst':'extra','adtl':'extra','labl':'extra','ltxt':'extra','note':'extra','regn':'extra','JUNK':'extra','PAD ':'extra','FLLR':'extra'};
const WAV_NAME={'bext':'BWF (Broadcast Wave)','iXML':'iXML','_PMX':'XMP','cart':'Cart (rádio)','umid':'UMID',
 'LIST':'LIST/INFO','ID3 ':'ID3 embutido','cue ':'Cue points','smpl':'Loops e afinação','JUNK':'Preenchimento'};
function readBext(b,o,n){
  const f=[['Descrição',txt(decodeText(b.subarray(o,o+256)))],['Origem',txt(decodeText(b.subarray(o+256,o+288)))],
    ['Referência',txt(decodeText(b.subarray(o+288,o+320)))],['Data',txt(decodeText(b.subarray(o+320,o+330)))],
    ['Hora',txt(decodeText(b.subarray(o+330,o+338)))]];
  if(n>602){const ch=txt(decodeText(b.subarray(o+602,o+Math.min(n,602+400)))); if(ch) f.push(['Histórico',ch]);}
  return f.filter(x=>x[1]);
}
function readLIST(b,o,n){
  const f=[]; if(ascii(b,o,4)!=='INFO') return f;
  let p=o+4; const end=o+n;
  while(p+8<=end){
    const id=ascii(b,p,4), sz=u32le(b,p+4);
    if(sz<0||p+8+sz>end) break;
    f.push([id,txt(decodeText(b.subarray(p+8,p+8+Math.min(sz,200))))]);
    p+=8+sz+(sz&1);
  }
  return f.filter(x=>x[1]);
}
function anaWAV(b){
  const blocks=[],warn=[];
  if(ascii(b,0,4)==='RF64'){warn.push('RF64 (>4 GB) não é suportado — ficheiro não alterado.'); return null;}
  let o=12, dataOff=0, dataLen=0, fmt=null, tail=b.length;
  while(o+8<=b.length){
    const id=ascii(b,o,4); let sz=u32le(b,o+4);
    if(o+8+sz>b.length){
      if(id==='data'){ sz=b.length-o-8; warn.push('Chunk data truncado — comprimento corrigido.'); }
      else { warn.push('Chunk "'+id+'" com tamanho inválido; leitura interrompida.'); tail=o; break; }
    }
    const kind=WAV_KIND[id]||'prod';
    let fields=[];
    if(id==='bext') fields=readBext(b,o+8,sz);
    else if(id==='LIST') fields=readLIST(b,o+8,sz);
    else if(id==='iXML'||id==='_PMX'||id==='axml') fields=[['Excerto',txt(TD.decode(b.subarray(o+8,o+8+Math.min(sz,220))))]];
    else if(id==='ID3 '||id==='id3 ') fields=readID3(b,o+8,b[o+11],b[o+13],sz-10);
    else if(kind!=='core') fields=[['Tamanho',bytesFmt(sz)]];
    if(id==='fmt '){ fmt={tag:u16le(b,o+8),ch:u16le(b,o+10),sr:u32le(b,o+12),bits:u16le(b,o+22)}; }
    if(id==='data'){ dataOff=o+8; dataLen=sz; }
    blocks.push({name:WAV_NAME[id]||('Chunk "'+id+'"'),id,off:o,len:8+sz+(sz&1),region:'RIFF',kind,fields,
      art:id==='LIST'&&false});
    o+=8+sz+(sz&1);
  }
  if(!fmt||!dataLen){warn.push('WAV sem chunk fmt/data legível.'); return null;}
  const bps=fmt.ch*fmt.bits/8||1;
  const props={'Formato':(fmt.tag===1?'PCM':(fmt.tag===3?'Float':(fmt.tag===0xFFFE?'PCM extensível':'codec '+fmt.tag))),
    'Amostragem':fmt.sr+' Hz','Bits':fmt.bits+' bit','Canais':String(fmt.ch),
    'Duração':timeFmt(dataLen/(fmt.sr*bps))};
  return {fmt:'WAV',blocks,warn,props,audio:{off:dataOff,len:dataLen},sr:fmt.sr,
    rebuild(opts){
      const keep=blocks.filter(bl=>!drops(bl.kind,opts)).map(bl=>b.subarray(bl.off,bl.off+bl.len));
      let n=4; for(const k of keep) n+=k.length;
      const h=new Uint8Array(12); h.set([82,73,70,70],0); h.set([87,65,86,69],8);
      new DataView(h.buffer).setUint32(4,n,true);
      return cat([h,...keep]);
    }};
}

/* ---------- FLAC ---------- */
const FLAC_T=['STREAMINFO','PADDING','APPLICATION','SEEKTABLE','VORBIS_COMMENT','CUESHEET','PICTURE'];
const FLAC_K=['core','extra','prod','extra','tag','extra','art'];
function anaFLAC(b){
  const blocks=[],warn=[]; let s=0;
  if(ascii(b,0,3)==='ID3'){
    const sz=((b[6]&0x7f)<<21)|((b[7]&0x7f)<<14)|((b[8]&0x7f)<<7)|(b[9]&0x7f);
    blocks.push({name:'ID3v2 antes do FLAC',off:0,len:10+sz,region:'cabeçalho',kind:'tag',fields:readID3(b,0,b[3],b[5],sz)});
    s=10+sz;
  }
  if(ascii(b,s,4)!=='fLaC'){warn.push('Assinatura fLaC não encontrada.'); return null;}
  let o=s+4,last=false,props={};
  while(!last&&o+4<=b.length){
    last=(b[o]&0x80)!==0; const t=b[o]&0x7f, len=u24be(b,o+1);
    if(o+4+len>b.length){warn.push('Bloco de metadados FLAC truncado.'); break;}
    const d=o+4;
    if(t===0){
      const sr=(b[d+10]<<12)|(b[d+11]<<4)|(b[d+12]>>4);
      const ch=((b[d+12]>>1)&7)+1, bits=(((b[d+12]&1)<<4)|(b[d+13]>>4))+1;
      const tot=((b[d+13]&15)*4294967296)+(u32be(b,d+14));
      props={'Amostragem':sr+' Hz','Bits':bits+' bit','Canais':String(ch),'Duração':timeFmt(tot/sr)};
      blocks.push({name:'STREAMINFO',off:o,len:4+len,region:'metadados',kind:'core',fields:[],ftype:t});
    } else {
      let f=[];
      if(t===4) f=readVorbis(b,d,len);
      else if(t===6) f=[['Imagem',bytesFmt(len)]];
      else if(t===5) f=[['Cuesheet',txt(TDL.decode(b.subarray(d,d+128)))||bytesFmt(len)]];
      else f=[['Tamanho',bytesFmt(len)]];
      blocks.push({name:FLAC_T[t]||('Bloco '+t),off:o,len:4+len,region:'metadados',kind:FLAC_K[t]||'prod',fields:f,ftype:t});
    }
    o+=4+len;
  }
  return {fmt:'FLAC',blocks,warn,props,audio:{off:o,len:b.length-o},sr:parseInt(props['Amostragem'])||44100,
    rebuild(opts){
      const keep=blocks.filter(bl=>bl.ftype!==undefined&&!drops(bl.kind,opts)&&bl.ftype!==1);
      const pre=blocks.find(bl=>bl.ftype===undefined);
      const parts=[];
      if(pre&&!drops(pre.kind,opts)) parts.push(b.subarray(pre.off,pre.off+pre.len));
      parts.push(new Uint8Array([0x66,0x4c,0x61,0x43]));
      keep.forEach((bl,i)=>{
        const c=b.slice(bl.off,bl.off+bl.len);
        c[0]=(i===keep.length-1?0x80:0)|(c[0]&0x7f);
        parts.push(c);
      });
      parts.push(b.subarray(o,b.length));
      return cat(parts);
    }};
}

/* ---------- AIFF ---------- */
const AIFF_K={'COMM':'core','SSND':'core','FVER':'core','ID3 ':'tag','NAME':'tag','AUTH':'tag','ANNO':'tag','(c) ':'tag','COMT':'tag',
 'MARK':'extra','INST':'extra','APPL':'prod','CHAN':'prod','basc':'prod','trns':'prod'};
function ext80(b,o){
  const e=u16be(b,o), hi=u32be(b,o+2), lo=u32be(b,o+6);
  if(!e&&!hi&&!lo) return 0;
  return ((e&0x8000)?-1:1)*(hi*4294967296+lo)*Math.pow(2,(e&0x7fff)-16383-63);
}
function anaAIFF(b){
  const blocks=[],warn=[]; let o=12,comm=null,ss=null;
  const aifc=ascii(b,8,4)==='AIFC';
  while(o+8<=b.length){
    const id=ascii(b,o,4), sz=u32be(b,o+4);
    if(sz<0||o+8+sz>b.length){warn.push('Chunk "'+id+'" com tamanho inválido.'); break;}
    const kind=AIFF_K[id]||'prod'; let f=[];
    if(id==='COMM'){ comm={ch:u16be(b,o+8),frames:u32be(b,o+10),bits:u16be(b,o+14),sr:ext80(b,o+16)}; }
    else if(id==='SSND'){ ss={off:o+8+8,len:sz-8}; }
    else if(id==='ID3 ') f=readID3(b,o+8,b[o+11],b[o+13],sz-10);
    else if(kind!=='core') f=[['Conteúdo',txt(decodeText(b.subarray(o+8,o+8+Math.min(sz,200))))||bytesFmt(sz)]];
    blocks.push({name:'Chunk "'+id+'"',id,off:o,len:8+sz+(sz&1),region:'FORM',kind,fields:f});
    o+=8+sz+(sz&1);
  }
  if(!comm||!ss){warn.push('AIFF sem COMM/SSND legível.'); return null;}
  const props={'Formato':aifc?'AIFC':'AIFF','Amostragem':Math.round(comm.sr)+' Hz','Bits':comm.bits+' bit',
    'Canais':String(comm.ch),'Duração':timeFmt(comm.frames/(comm.sr||44100))};
  return {fmt:aifc?'AIFC':'AIFF',blocks,warn,props,audio:ss,sr:Math.round(comm.sr)||44100,
    rebuild(opts){
      const order=['FVER','COMM','SSND'];
      const keep=blocks.filter(bl=>!drops(bl.kind,opts))
        .sort((x,y)=>(order.indexOf(x.id)+1||99)-(order.indexOf(y.id)+1||99)||x.off-y.off)
        .map(bl=>b.subarray(bl.off,bl.off+bl.len));
      let n=4; for(const k of keep) n+=k.length;
      const h=b.slice(0,12); new DataView(h.buffer).setUint32(4,n,false);
      return cat([h,...keep]);
    }};
}

/* ---------- M4A / MP4 ---------- */
const M4A_NAMES={'\xa9nam':'Título','\xa9ART':'Artista','aART':'Artista do álbum','\xa9alb':'Álbum','\xa9day':'Ano',
 '\xa9cmt':'Comentário','\xa9gen':'Género','\xa9wrt':'Compositor','\xa9too':'Codificador','covr':'Capa',
 'cprt':'Copyright','\xa9lyr':'Letra','trkn':'Faixa','disk':'Disco','\xa9grp':'Agrupamento','desc':'Descrição'};
function m4aWalk(b,start,end,cb,depth){
  let o=start;
  while(o+8<=end){
    let sz=u32be(b,o); const t=ascii(b,o,0)+ascii(b,o+4,4); let hdr=8;
    if(sz===1){ sz=u32be(b,o+8)*4294967296+u32be(b,o+12); hdr=16; }
    else if(sz===0) sz=end-o;
    if(sz<hdr||o+sz>end) break;
    cb(t,o,sz,hdr,depth);
    if(['moov','trak','mdia','minf','stbl','edts','udta','meta','ilst'].includes(t)&&depth<6){
      const s2=t==='meta'?o+hdr+4:o+hdr;
      m4aWalk(b,s2,o+sz,cb,depth+1);
    }
    o+=sz;
  }
}
function anaM4A(b){
  const blocks=[],warn=[],props={}; const kill=[];
  let mdat=null,tsc=0,dur=0;
  m4aWalk(b,0,b.length,(t,o,sz,hdr,d)=>{
    if(t==='mdat') mdat={off:o+hdr,len:sz-hdr};
    if(t==='mvhd'){ const v=b[o+hdr]; tsc=u32be(b,o+hdr+(v===1?20:12)); dur=v===1?u32be(b,o+hdr+28):u32be(b,o+hdr+16); }
    if(t==='udta'||(t==='meta'&&d<=1)||t==='uuid'){ kill.push({t,o,sz,hdr}); }
    if(M4A_NAMES[t]&&d>=1){
      let val='';
      const dv=o+hdr;
      if(ascii(b,dv+4,4)==='data'){
        const fl=u32be(b,dv+8)&0xffffff, p=dv+16, n=u32be(b,dv)-16;
        if(t==='covr') val='imagem embutida, '+bytesFmt(n);
        else if(fl===1) val=txt(TD.decode(b.subarray(p,p+Math.min(n,240))));
        else val=bytesFmt(n);
      }
      if(val) blocks.push({name:M4A_NAMES[t],off:o,len:sz,region:'ilst',kind:t==='covr'?'art':'tag',fields:[[M4A_NAMES[t],val]],atom:t,inline:true});
    }
  },0);
  if(!mdat){warn.push('Atom mdat não encontrado.'); return null;}
  for(const k of kill) blocks.push({name:k.t==='uuid'?'XMP / uuid':(k.t==='udta'?'udta (metadados de utilizador)':'meta'),
    off:k.o,len:k.sz,region:'moov',kind:'tag',fields:[['Tamanho',bytesFmt(k.sz)]],atom:k.t,killable:true});
  if(tsc&&dur) props['Duração']=timeFmt(dur/tsc);
  props['Contentor']='MP4 / M4A';
  props['Nota']='os atoms são substituídos por "free" do mesmo tamanho para não deslocar o áudio';
  return {fmt:'M4A',blocks,warn,props,audio:mdat,sr:44100,
    rebuild(opts){
      const out=b.slice();
      for(const bl of blocks){
        let go=false;
        if(bl.killable) go=!!opts.o_tags;
        else if(bl.inline) go=opts.o_tags?false:(bl.kind==='art'&&!!opts.o_art);
        if(!go) continue;
        out.fill(0,bl.off+8,bl.off+bl.len);
        out[bl.off+4]=0x66; out[bl.off+5]=0x72; out[bl.off+6]=0x65; out[bl.off+7]=0x65;
      }
      return out;
    }};
}

function analyze(bytes,name){
  const ext=(name.split('.').pop()||'').toLowerCase();
  const m=ascii(bytes,0,4);
  try{
    if(m==='RIFF'&&ascii(bytes,8,4)==='WAVE') return anaWAV(bytes);
    if(m==='RF64') return anaWAV(bytes);
    if(m==='FORM'&&/AIF[FC]/.test(ascii(bytes,8,4))) return anaAIFF(bytes);
    if(m==='fLaC'||(ascii(bytes,0,3)==='ID3'&&ext==='flac')) return anaFLAC(bytes);
    if(ascii(bytes,4,4)==='ftyp') return anaM4A(bytes);
    if(ascii(bytes,0,3)==='ID3'||(bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0)||ext==='mp3') return anaMP3(bytes);
    if(m==='OggS') return {fmt:'OGG',blocks:[],warn:['Ogg/Opus ainda não é suportado para limpeza — a reescrita das páginas exige recalcular CRC.'],props:{},audio:{off:0,len:bytes.length},rebuild:()=>bytes};
  }catch(err){ return {fmt:ext.toUpperCase()||'?',blocks:[],warn:['Erro a ler o ficheiro: '+err.message],props:{},audio:{off:0,len:bytes.length},rebuild:()=>bytes}; }
  return null;
}
/* --PARSERS-END-- */

