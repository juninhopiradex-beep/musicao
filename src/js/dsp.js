/* ============================ análise espectral ============================ */
function fft(re,im){
  const n=re.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;
    for(;j&bit;bit>>=1) j^=bit;
    j^=bit;
    if(i<j){const tr=re[i];re[i]=re[j];re[j]=tr;const ti=im[i];im[i]=im[j];im[j]=ti;}
  }
  for(let len=2;len<=n;len<<=1){
    const ang=-2*Math.PI/len, wr=Math.cos(ang), wi=Math.sin(ang), h=len>>1;
    for(let i=0;i<n;i+=len){
      let cr=1,ci=0;
      for(let k=0;k<h;k++){
        const a=i+k,b=i+k+h;
        const vr=re[b]*cr-im[b]*ci, vi=re[b]*ci+im[b]*cr;
        re[b]=re[a]-vr; im[b]=im[a]-vi; re[a]+=vr; im[a]+=vi;
        const t=cr*wr-ci*wi; ci=cr*wi+ci*wr; cr=t;
      }
    }
  }
}
const N=4096, HB=N>>1;
async function spectral(buf,log){
  const sr=buf.sampleRate, ch=buf.numberOfChannels;
  const L=buf.getChannelData(0), R=ch>1?buf.getChannelData(1):L;
  const total=buf.length;
  let hop=2048;
  const maxF=3000;
  if(Math.floor(total/hop)>maxF) hop=Math.ceil(total/maxF/64)*64;
  const nF=Math.max(1,Math.floor((total-N)/hop));
  const win=new Float32Array(N);
  for(let i=0;i<N;i++) win[i]=0.5-0.5*Math.cos(2*Math.PI*i/(N-1));
  const avg=new Float64Array(HB);
  const cols=[], envHi=new Float32Array(nF), envSideHi=new Float32Array(nF);
  const re=new Float32Array(N), im=new Float32Array(N);
  const hiBin=Math.floor(14000/(sr/N)), nyBin=HB-1;
  let sumL=0,sumR=0,sumLR=0,midE=0,sideE=0;
  for(let f=0;f<nF;f++){
    const o=f*hop;
    for(let i=0;i<N;i++){ const l=L[o+i],r=R[o+i]; re[i]=(l+r)*0.5*win[i]; im[i]=0; }
    fft(re,im);
    const col=new Float32Array(HB);
    for(let k=0;k<HB;k++){ const m=Math.sqrt(re[k]*re[k]+im[k]*im[k]); col[k]=m; avg[k]+=m; }
    cols.push(col);
    let hi=0; for(let k=hiBin;k<=nyBin;k++) hi+=col[k]*col[k];
    envHi[f]=Math.sqrt(hi);
    for(let i=0;i<N;i++){ const l=L[o+i],r=R[o+i]; re[i]=(l-r)*0.5*win[i]; im[i]=0; }
    fft(re,im);
    let sh=0; for(let k=hiBin;k<=nyBin;k++) sh+=re[k]*re[k]+im[k]*im[k];
    envSideHi[f]=Math.sqrt(sh);
    if(f%150===0){ log('a analisar… '+Math.round(100*f/nF)+'%'); await pause(); }
  }
  const step=Math.max(1,Math.floor(total/200000));
  for(let i=0;i<total;i+=step){ const l=L[i],r=R[i]; sumL+=l*l; sumR+=r*r; sumLR+=l*r; midE+=(l+r)*(l+r)/4; sideE+=(l-r)*(l-r)/4; }
  const db=new Float32Array(HB); let peak=-999;
  for(let k=0;k<HB;k++){ db[k]=20*Math.log10(avg[k]/nF+1e-12); if(db[k]>peak) peak=db[k]; }
  return {sr,nF,hop,cols,db,peak,envHi,envSideHi,
    corr:sumLR/(Math.sqrt(sumL*sumR)+1e-12), sideRatio:10*Math.log10((sideE+1e-12)/(midE+1e-12))};
}
function findNotches(db,sr,peak){
  const bw=sr/N, out=[]; const W=24;
  const from=Math.floor(300/bw), to=Math.floor((sr/2-1500)/bw);
  for(let k=from;k<to;k++){
    if(db[k]<peak-70) continue;
    let sum=0,n=0;
    for(let j=k-W;j<=k+W;j++){ if(j<0||j>=db.length||Math.abs(j-k)<4) continue; sum+=db[j]; n++; }
    const loc=sum/n;
    if(db[k]<loc-9&&db[k]<=db[k-1]&&db[k]<=db[k+1]){
      const last=out[out.length-1];
      if(last&&k-last.bin<6){ if(db[k]<last.depth0){ last.bin=k; last.depth0=db[k]; last.f=k*bw; last.depth=loc-db[k]; } }
      else out.push({bin:k,f:k*bw,depth:loc-db[k],depth0:db[k]});
    }
  }
  return out.sort((a,b)=>b.depth-a.depth).slice(0,6);
}
function periodicity(env,hop,sr){
  const n=env.length; if(n<64) return null;
  let mean=0; for(let i=0;i<n;i++) mean+=env[i]; mean/=n;
  const x=new Float32Array(n); let e0=0;
  for(let i=0;i<n;i++){ x[i]=env[i]-mean; e0+=x[i]*x[i]; }
  if(e0<=0) return null;
  const maxLag=Math.min(n>>1,Math.floor(30*sr/hop)), l0=Math.max(2,Math.floor(0.4*sr/hop));
  const c=new Float32Array(maxLag); let best=0;
  for(let l=l0;l<maxLag;l++){
    let s=0; for(let i=0;i<n-l;i++) s+=x[i]*x[i+l];
    c[l]=s/e0; if(c[l]>best) best=c[l];
  }
  let bl=0;
  for(let l=l0;l<maxLag;l++) if(c[l]>=best*0.9&&c[l]>=c[l-1]&&c[l]>=c[l+1]){ bl=l; break; }
  if(!bl) return {r:best,period:0};
  return {r:best,period:bl*hop/sr};
}
function drawSpec(sp){
  const c=$('spec'), g=c.getContext('2d'), W=c.width, H=c.height;
  const img=g.createImageData(W,H);
  const nF=sp.cols.length;
  let mx=0;
  for(const col of sp.cols) for(let k=0;k<HB;k++) if(col[k]>mx) mx=col[k];
  const ref=20*Math.log10(mx+1e-12);
  for(let x=0;x<W;x++){
    const col=sp.cols[Math.min(nF-1,Math.floor(x*nF/W))];
    for(let y=0;y<H;y++){
      const k=Math.min(HB-1,Math.floor((H-1-y)*HB/H));
      let v=(20*Math.log10(col[k]+1e-12)-ref+92)/92;
      v=Math.max(0,Math.min(1,v));
      const i=(y*W+x)*4;
      img.data[i]=Math.min(255,v*v*340); img.data[i+1]=Math.min(255,Math.pow(v,1.6)*250);
      img.data[i+2]=Math.min(255,30+Math.pow(1-v,2)*40+v*v*v*200); img.data[i+3]=255;
    }
  }
  g.putImageData(img,0,0);
  const dur=sp.nF*sp.hop/sp.sr;
  $('axMid').textContent=timeFmt(dur/2).split('.')[0]+' s';
  $('axEnd').textContent=timeFmt(dur).split('.')[0]+' s · '+Math.round(sp.sr/2000)+' kHz no topo';
}
function drawAvg(sp,notches){
  const c=$('avg'), g=c.getContext('2d'), W=c.width, H=c.height;
  g.clearRect(0,0,W,H);
  g.strokeStyle='#232b34'; g.lineWidth=1;
  for(let d=0;d<=100;d+=20){ const y=H*d/110; g.beginPath(); g.moveTo(0,y); g.lineTo(W,y); g.stroke(); }
  g.strokeStyle='#f0a637'; g.lineWidth=1.4; g.beginPath();
  for(let x=0;x<W;x++){
    const k=Math.min(HB-1,Math.floor(x*HB/W));
    const y=H-Math.max(0,Math.min(1,(sp.db[k]-sp.peak+100)/100))*H;
    x?g.lineTo(x,y):g.moveTo(x,y);
  }
  g.stroke();
  g.strokeStyle='#e2685f';
  for(const n of notches){
    const x=n.bin/HB*W;
    g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke();
  }
  const ny=sp.sr/2;
  $('axF1').textContent=Math.round(ny/4/1000)+' kHz';
  $('axF2').textContent=Math.round(ny/2/1000)+' kHz';
  $('axF3').textContent=Math.round(3*ny/4/1000)+' kHz';
  $('axNy').textContent=Math.round(ny/1000)+' kHz';
}
function bandAbs(sp,f1,f2){
  const bw=sp.sr/N; let s=0,n=0;
  for(let k=Math.floor(f1/bw);k<Math.min(HB,Math.floor(f2/bw));k++){ s+=Math.pow(10,sp.db[k]/10); n++; }
  return 10*Math.log10(s/Math.max(1,n)+1e-12);
}
const band=(sp,f1,f2)=>bandAbs(sp,f1,f2)-sp.peak;
function report(sp){
  const out=[], ny=sp.sr/2, bw=sp.sr/N;
  const ref=bandAbs(sp,1000,8000);
  let cf=ny;
  for(let f=ny-500;f>2000;f-=250){ if(bandAbs(sp,f,f+500)>ref-45){ cf=f+500; break; } }
  out.push({cls:cf<ny*0.92?'hit':'info',t:'Corte espectral',
    d:cf<ny*0.92?'A energia acaba a '+(cf/1000).toFixed(1)+' kHz, abaixo de Nyquist. O ficheiro passou por um codificador com perdas em algum momento.'
      :'O espectro estende-se até junto de Nyquist. Não há sinal de compressão com perdas.',
    m:(cf/1000).toFixed(1)+' kHz'});
  const _=bw;
  const notches=findNotches(sp.db,sp.sr,sp.peak);
  out.push({cls:notches.length?'hit':'clear',t:'Entalhes fixos no espectro',
    d:notches.length?'Buracos estreitos e persistentes em '+notches.map(n=>(n.f/1000).toFixed(2)+' kHz').join(', ')+'. É assim que várias marcas de água escondem dados — mas filtros de eliminação de banda e ressonâncias do próprio arranjo dão o mesmo desenho.'
      :'Nenhum entalhe estreito persistente. O espectro médio é contínuo.',
    m:notches.length?notches.length+' entalhes':'nenhum'});
  const b14=bandAbs(sp,14000,19000), b19=bandAbs(sp,19000,Math.min(ny,22050));
  const rise=b19-b14, anom=ny>19000&&rise>2;
  out.push({cls:anom?'hit':'clear',t:'Banda acima de 19 kHz',
    d:anom?'A energia sobe '+rise.toFixed(1)+' dB entre 14–19 kHz e 19 kHz–Nyquist. Num master normal o topo desce sempre; uma subida indica alguma coisa colocada lá em cima.'
      :'O topo desce de forma natural em direcção a Nyquist, como é esperado.',
    m:(rise>0?'+':'')+rise.toFixed(1)+' dB'});
  const p=periodicity(sp.envHi,sp.hop,sp.sr);
  out.push({cls:(p&&p.r>0.34)?'hit':'clear',t:'Repetição no tempo (banda alta)',
    d:(p&&p.r>0.34)?'A energia acima de 14 kHz repete-se de '+p.period.toFixed(2)+' em '+p.period.toFixed(2)+' s. Cargas de marca de água costumam repetir-se em ciclo — mas uma batida constante também.'
      :'Sem ciclo detectável na banda alta.',
    m:p?('r='+p.r.toFixed(2)+(p.r>0.34?' · '+p.period.toFixed(2)+' s':'')):'—'});
  let sh=0,mh=0;
  for(let i=0;i<sp.envSideHi.length;i++){ sh+=sp.envSideHi[i]; mh+=sp.envHi[i]; }
  const sideHi=20*Math.log10((sh+1e-12)/(mh+1e-12));
  out.push({cls:(sideHi>-3&&sp.sideRatio<-6)?'hit':'info',t:'Canal lateral (L−R)',
    d:(sideHi>-3&&sp.sideRatio<-6)?'A mistura é estreita mas a banda alta do canal lateral está anormalmente cheia. Vale a pena ouvir só o L−R.'
      :'A relação entre o canal lateral e o central é a esperada para esta largura de imagem.',
    m:'lado '+sp.sideRatio.toFixed(1)+' dB · alta '+sideHi.toFixed(1)+' dB'});
  out.push({cls:'info',t:'Correlação L/R',
    d:sp.corr>0.98?'Praticamente mono.':(sp.corr<0.2?'Imagem muito larga ou fases opostas — confirmar a compatibilidade mono.':'Correlação normal para uma mistura estéreo.'),
    m:sp.corr.toFixed(3)});
  return {out,notches};
}
