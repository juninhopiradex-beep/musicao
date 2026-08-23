/* ============================================================
   MUSIC AO · Codificador QR (bytes, nivel M, versoes 1-10)
   Sem dependencias. Validado contra descodificador de referencia.
   ============================================================ */
var MAQR = (function(){

const EXP=new Uint8Array(512),LOG=new Uint8Array(256);
(()=>{let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D;}for(let i=255;i<512;i++)EXP[i]=EXP[i-255];})();
const gmul=(a,b)=>(a===0||b===0)?0:EXP[LOG[a]+LOG[b]];
function genPoly(d){let p=[1];for(let i=0;i<d;i++){const n=new Array(p.length+1).fill(0);for(let j=0;j<p.length;j++){n[j]^=p[j];n[j+1]^=gmul(p[j],EXP[i]);}p=n;}return p;}
function eccOf(data,n){const g=genPoly(n),r=new Uint8Array(n);
  for(let k=0;k<data.length;k++){const f=data[k]^r[0];
    for(let i=0;i<n-1;i++)r[i]=r[i+1]^gmul(g[i+1],f);r[n-1]=gmul(g[n],f);}
  return r;}
const EC={1:[10,[[1,16]]],2:[16,[[1,28]]],3:[26,[[1,44]]],4:[18,[[2,32]]],5:[24,[[2,43]]],
 6:[16,[[4,27]]],7:[18,[[4,31]]],8:[22,[[2,38],[2,39]]],9:[22,[[3,36],[2,37]]],10:[26,[[4,43],[1,44]]]};
const AL={1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};

function encode(text){
  const bytes=Array.from(new TextEncoder().encode(text));
  let ver=0,inf=null;
  for(let v=1;v<=10;v++){const[el,gr]=EC[v];const cap=gr.reduce((s,[n,d])=>s+n*d,0);const cci=v<10?8:16;
    if(Math.ceil((4+cci+bytes.length*8)/8)<=cap){ver=v;inf={el,gr,cap,cci};break;}}
  if(!ver)throw new Error('Endereço demasiado longo para o QR (máx. ~210 caracteres). Encurta o link.');
  const bits=[],push=(v,l)=>{for(let i=l-1;i>=0;i--)bits.push((v>>i)&1);};
  push(4,4);push(bytes.length,inf.cci);for(const b of bytes)push(b,8);
  push(0,Math.min(4,inf.cap*8-bits.length));
  while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];data.push(b);}
  const pad=[0xEC,0x11];let pi=0;while(data.length<inf.cap)data.push(pad[pi++%2]);
  const dB=[],eB=[];let p=0;
  for(const[n,dl]of inf.gr)for(let i=0;i<n;i++){const blk=data.slice(p,p+dl);p+=dl;dB.push(blk);eB.push(eccOf(blk,inf.el));}
  const fin=[],maxD=Math.max(...dB.map(b=>b.length));
  for(let i=0;i<maxD;i++)for(const b of dB)if(i<b.length)fin.push(b[i]);
  for(let i=0;i<inf.el;i++)for(const b of eB)fin.push(b[i]);
  return build(ver,fin);
}
function build(ver,cw){
  const size=17+4*ver;
  const m=Array.from({length:size},()=>new Array(size).fill(0));
  const fn=Array.from({length:size},()=>new Array(size).fill(false));
  const set=(r,c,v)=>{if(r<0||c<0||r>=size||c>=size)return;m[r][c]=v;fn[r][c]=true;};
  const finder=(r0,c0)=>{for(let dr=-1;dr<=7;dr++)for(let dc=-1;dc<=7;dc++){
    const inR=(dr>=0&&dr<=6&&dc>=0&&dc<=6)&&((dr===0||dr===6||dc===0||dc===6)||(dr>=2&&dr<=4&&dc>=2&&dc<=4));
    set(r0+dr,c0+dc,inR?1:0);}};
  finder(0,0);finder(0,size-7);finder(size-7,0);
  for(let i=8;i<size-8;i++){set(6,i,i%2===0?1:0);set(i,6,i%2===0?1:0);}
  for(const r of AL[ver])for(const c of AL[ver]){
    if((r<=8&&c<=8)||(r<=8&&c>=size-9)||(r>=size-9&&c<=8))continue;
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)set(r+dr,c+dc,Math.max(Math.abs(dr),Math.abs(dc))!==1?1:0);}
  set(size-8,8,1);
  for(let i=0;i<9;i++){if(!fn[8][i])set(8,i,0);if(!fn[i][8])set(i,8,0);}
  for(let i=0;i<8;i++){if(!fn[8][size-1-i])set(8,size-1-i,0);if(!fn[size-1-i][8])set(size-1-i,8,0);}
  if(ver>=7)for(let i=0;i<6;i++)for(let j=0;j<3;j++){set(size-11+j,i,0);set(i,size-11+j,0);}
  let bi=0;const nb=()=>{const ix=bi>>3;const b=ix<cw.length?(cw[ix]>>(7-(bi&7)))&1:0;bi++;return b;};
  for(let col=size-1;col>=1;col-=2){if(col===6)col=5;
    const up=((col+1)&2)===0;
    for(let i=0;i<size;i++){const row=up?size-1-i:i;
      for(let k=0;k<2;k++){const c=col-k;if(!fn[row][c])m[row][c]=nb();}}}
  const MK=[(r,c)=>(r+c)%2===0,(r,c)=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,
    (r,c)=>((Math.floor(r/2)+Math.floor(c/3))%2)===0,(r,c)=>((r*c)%2+(r*c)%3)===0,
    (r,c)=>(((r*c)%2+(r*c)%3)%2)===0,(r,c)=>(((r+c)%2+(r*c)%3)%2)===0];
  let best=null,bp=Infinity;
  for(let k=0;k<8;k++){
    const t=m.map(r=>r.slice());
    for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(!fn[r][c]&&MK[k](r,c))t[r][c]^=1;
    fmt(t,size,k);if(ver>=7)vinfo(t,size,ver);
    const p=penalty(t,size);if(p<bp){bp=p;best=t;}}
  return best;
}
function fmt(t,size,mk){
  const d=(0<<3)|mk;let v=d<<10;
  for(let i=14;i>=10;i--)if((v>>i)&1)v^=0x537<<(i-10);
  const bits=((d<<10)|v)^0x5412,bit=i=>(bits>>i)&1;
  for(let i=0;i<=5;i++)t[i][8]=bit(i);
  t[7][8]=bit(6);t[8][8]=bit(7);t[8][7]=bit(8);
  for(let i=9;i<=14;i++)t[8][14-i]=bit(i);
  for(let i=0;i<8;i++)t[8][size-1-i]=bit(i);
  for(let i=8;i<15;i++)t[size-15+i][8]=bit(i);
  t[size-8][8]=1;
}
function vinfo(t,size,ver){
  let rem=ver;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1F25);
  const bits=(ver<<12)|rem;
  for(let i=0;i<18;i++){const b=(bits>>i)&1,a=size-11+i%3,bb=Math.floor(i/3);t[a][bb]=b;t[bb][a]=b;}
}
function penalty(t,s){
  let p=0;
  for(let r=0;r<s;r++){let n=1;for(let c=1;c<s;c++){if(t[r][c]===t[r][c-1])n++;else{if(n>=5)p+=3+(n-5);n=1;}}if(n>=5)p+=3+(n-5);}
  for(let c=0;c<s;c++){let n=1;for(let r=1;r<s;r++){if(t[r][c]===t[r-1][c])n++;else{if(n>=5)p+=3+(n-5);n=1;}}if(n>=5)p+=3+(n-5);}
  for(let r=0;r<s-1;r++)for(let c=0;c<s-1;c++){const v=t[r][c];if(v===t[r][c+1]&&v===t[r+1][c]&&v===t[r+1][c+1])p+=3;}
  const pt=[1,0,1,1,1,0,1];
  const has=(a,i)=>{for(let k=0;k<7;k++)if(a[i+k]!==pt[k])return false;return true;};
  const lt=(a,i,l)=>{for(let k=i;k<i+l;k++){if(k<0||k>=a.length)continue;if(a[k]!==0)return false;}return true;};
  for(let r=0;r<s;r++){const w=t[r];for(let c=0;c+7<=s;c++)if(has(w,c)&&(lt(w,c-4,4)||lt(w,c+7,4)))p+=40;}
  for(let c=0;c<s;c++){const w=[];for(let r=0;r<s;r++)w.push(t[r][c]);for(let r=0;r+7<=s;r++)if(has(w,r)&&(lt(w,r-4,4)||lt(w,r+7,4)))p+=40;}
  let d=0;for(let r=0;r<s;r++)for(let c=0;c<s;c++)d+=t[r][c];
  p+=Math.floor(Math.abs(d*100/(s*s)-50)/5)*10;
  return p;
}
function svg(text,quiet=2){
  const m=encode(text),n=m.length,t=n+quiet*2,d=[];
  for(let r=0;r<n;r++){let c=0;while(c<n){if(m[r][c]){let w=1;while(c+w<n&&m[r][c+w])w++;d.push(`M${c+quiet} ${r+quiet}h${w}v1h-${w}z`);c+=w;}else c++;}}
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path fill="#000" d="${d.join('')}"/></svg>`;
}
return{svg,version:t=>(encode(t).length-17)/4};
})();
