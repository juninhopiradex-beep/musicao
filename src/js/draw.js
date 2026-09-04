/* =========================================================================
   draw.js — desenho em canvas: forma de onda anotada e curva de loudness
   ========================================================================= */

function css(n,fb){
  try{ return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||fb; }
  catch(_){ return fb; }
}
function fitCanvas(c){
  if(!c||typeof c.getContext!=='function') return null;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const w=c.clientWidth||c.width, h=+c.getAttribute('data-h')||c.height;
  c.width=Math.round(w*dpr); c.height=Math.round(h*dpr);
  /* Sem altura em CSS o elemento assume a altura do buffer e o desenho sai
     esticado pelo factor do dpr. */
  c.style.width='100%'; c.style.height=h+'px';
  const g=c.getContext('2d');
  if(!g) return null;
  g.setTransform(dpr,0,0,dpr,0,0);
  return {g,w,h};
}

/* envelope de picos: mínimo e máximo por coluna */
function envelope(pcm,cols){
  const n=pcm.frames, per=Math.max(1,Math.floor(n/cols));
  const mn=new Float32Array(cols), mx=new Float32Array(cols), rms=new Float32Array(cols);
  for(let x=0;x<cols;x++){
    const a=x*per, b=Math.min(n,a+per);
    let lo=0,hi=0,s=0,cnt=0;
    for(const c of pcm.data){
      for(let i=a;i<b;i++){
        const v=c[i]/pcm.full;
        if(v<lo) lo=v; if(v>hi) hi=v;
        s+=v*v; cnt++;
      }
    }
    mn[x]=lo; mx[x]=hi; rms[x]=cnt?Math.sqrt(s/cnt):0;
  }
  return {mn,mx,rms,per};
}

function drawWave(canvas,pcm,m){
  const fc=fitCanvas(canvas);
  if(!fc) return;
  const {g,w,h}=fc;
  const mid=h/2, cols=Math.max(200,Math.round(w));
  const env=envelope(pcm,cols), sc=x=>x*cols/w;
  const line=css('--line','#2c343d'), amber=css('--amber','#f0a637'),
        red=css('--red','#e2685f'), dim=css('--dim','#5d6975'), mut=css('--mut','#8c99a6');
  g.clearRect(0,0,w,h);

  // silêncio à cabeça e à cauda
  const px=i=>i/pcm.frames*w;
  g.fillStyle='rgba(140,153,166,0.10)';
  if(m&&m.silence.head) g.fillRect(0,0,px(m.silence.head),h);
  if(m&&m.silence.tail) g.fillRect(w-px(m.silence.tail),0,px(m.silence.tail),h);

  // grelha em dBFS
  g.strokeStyle=line; g.lineWidth=1; g.font='10px ui-monospace,monospace'; g.fillStyle=dim;
  for(const db of [-6,-12,-24]){
    const a=Math.pow(10,db/20);
    for(const s of [1,-1]){
      const y=mid-s*a*mid;
      g.beginPath(); g.moveTo(0,y+0.5); g.lineTo(w,y+0.5); g.stroke();
    }
    g.fillText(db+' dB',3,mid-a*mid-3);
  }

  // envelope
  g.strokeStyle=amber; g.globalAlpha=0.85; g.lineWidth=1;
  g.beginPath();
  for(let x=0;x<w;x++){
    const i=Math.min(cols-1,Math.floor(sc(x)));
    g.moveTo(x+0.5,mid-env.mx[i]*mid); g.lineTo(x+0.5,mid-env.mn[i]*mid);
  }
  g.stroke();
  // RMS por cima
  g.globalAlpha=0.5; g.strokeStyle=mut;
  g.beginPath();
  for(let x=0;x<w;x++){
    const i=Math.min(cols-1,Math.floor(sc(x))), y=mid-env.rms[i]*mid;
    x?g.lineTo(x+0.5,y):g.moveTo(x+0.5,y);
  }
  g.stroke();
  g.globalAlpha=1;

  if(!m) return;
  // troços colados ao fundo de escala
  g.fillStyle=red;
  for(const c of (m.clip.at||[])){
    const x=px(c.i);
    g.fillRect(Math.max(0,x-1),mid-mid*0.98,Math.max(2,px(c.len)),mid*1.96);
  }
  // overs de true peak
  g.strokeStyle=red; g.lineWidth=1;
  for(const o of (m.overs||[])){
    const x=px(o.i);
    g.beginPath(); g.moveTo(x+0.5,0); g.lineTo(x+0.5,7); g.stroke();
  }
  g.fillStyle=dim; g.font='10px ui-monospace,monospace';
  g.fillText(timeFmt(pcm.frames/pcm.sr).split('.')[0],w-38,h-4);
}

function drawLoudness(canvas,m,target){
  const fc=fitCanvas(canvas);
  if(!fc) return;
  const {g,w,h}=fc;
  const line=css('--line','#2c343d'), amber=css('--amber','#f0a637'),
        green=css('--green','#7ed6a4'), dim=css('--dim','#5d6975'), blue=css('--blue','#6fb6dd');
  g.clearRect(0,0,w,h);
  const st=m.blocks.short, mo=m.blocks.moment;
  if(!st.length&&!mo.length) return;
  const top=Math.max(-5,(m.momentMax||-10)+2), bot=Math.min(-40,(target||-14)-18);
  const y=v=>h-(Math.max(bot,Math.min(top,v))-bot)/(top-bot)*h;

  g.strokeStyle=line; g.fillStyle=dim; g.font='10px ui-monospace,monospace';
  for(let v=Math.ceil(top/6)*6;v>bot;v-=6){
    const yy=y(v);
    g.beginPath(); g.moveTo(0,yy+0.5); g.lineTo(w,yy+0.5); g.stroke();
    if(yy>14) g.fillText(v+'',3,yy-3);
  }
  // faixa do loudness range
  if(m.lra>0){
    const c=m.integrated;
    g.fillStyle='rgba(111,182,221,0.10)';
    g.fillRect(0,y(c+m.lra/2),w,y(c-m.lra/2)-y(c+m.lra/2));
  }
  // alvo
  if(target!=null){
    g.strokeStyle=green; g.setLineDash([4,4]); g.lineWidth=1;
    g.beginPath(); g.moveTo(0,y(target)+0.5); g.lineTo(w,y(target)+0.5); g.stroke();
    g.setLineDash([]);
    g.fillStyle=green; g.fillText('alvo '+target+' LUFS',w-92,y(target)-4);
  }
  // momentâneo em fundo
  g.strokeStyle='rgba(140,153,166,0.35)'; g.lineWidth=1; g.beginPath();
  mo.forEach((v,i)=>{ const x=i/(mo.length-1||1)*w, yy=y(v); i?g.lineTo(x,yy):g.moveTo(x,yy); });
  g.stroke();
  // short-term
  g.strokeStyle=amber; g.lineWidth=1.6; g.beginPath();
  st.forEach((v,i)=>{ const x=i/(st.length-1||1)*w, yy=y(v); i?g.lineTo(x,yy):g.moveTo(x,yy); });
  g.stroke();
  // integrado
  g.strokeStyle=blue; g.lineWidth=1; g.setLineDash([2,3]);
  g.beginPath(); g.moveTo(0,y(m.integrated)+0.5); g.lineTo(w,y(m.integrated)+0.5); g.stroke();
  g.setLineDash([]);
  g.fillStyle=blue;
  const yi=y(m.integrated);
  g.fillText('integrado '+m.integrated.toFixed(1),w-200,yi>16?yi-5:yi+12);
}

function drawDiff(canvas,diff,sr,full){
  const fc=fitCanvas(canvas);
  if(!fc) return;
  const {g,w,h}=fc;
  const red=css('--red','#e2685f'), line=css('--line','#2c343d'), dim=css('--dim','#5d6975');
  g.clearRect(0,0,w,h);
  const n=diff[0].length, per=Math.max(1,Math.floor(n/w));
  let mx=1e-12;
  const col=new Float32Array(w);
  for(let x=0;x<w;x++){
    const a=x*per, b=Math.min(n,a+per);
    let p=0;
    for(const c of diff) for(let i=a;i<b;i++){ const v=Math.abs(c[i]); if(v>p) p=v; }
    col[x]=p; if(p>mx) mx=p;
  }
  g.strokeStyle=red; g.globalAlpha=0.9;
  g.beginPath();
  for(let x=0;x<w;x++){
    const db=20*Math.log10((col[x]/full)+1e-12);
    const yy=h*(1-(Math.max(-80,db)+80)/80);
    g.moveTo(x+0.5,h); g.lineTo(x+0.5,yy);
  }
  g.stroke(); g.globalAlpha=1;
  g.strokeStyle=line;
  for(const db of [0,-20,-40,-60]){
    const yy=h*(1-(db+80)/80);
    g.beginPath(); g.moveTo(0,yy+0.5); g.lineTo(w,yy+0.5); g.stroke();
    g.fillStyle=dim; g.font='10px ui-monospace,monospace'; g.fillText(db+' dBFS',3,yy-3);
  }
}
