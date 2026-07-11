/* ============================================================
   MUSIC AO — protótipo funcional (SPA vanilla, GitHub Pages)
   Router hash · player com cobrança demo · wallet · upload ·
   dashboards artista/admin · moderação · transparência AKZ
   ============================================================ */

/* ---------- storage seguro (funciona mesmo sem localStorage) ---------- */
const store = {
  get(k, fallback){ try { const v = localStorage.getItem('musicao_' + k); return v ? JSON.parse(v) : fallback; } catch(e){ return fallback; } },
  set(k, v){ try { localStorage.setItem('musicao_' + k, JSON.stringify(v)); } catch(e){} },
};

/* ---------- estado ---------- */
const S = {
  role: store.get('role', 'ouvinte'),
  balance: store.get('balance', 5000),
  owned: store.get('owned', []),               // ids de faixas licenciadas
  txs: store.get('txs', [
    { type:'topup', amount:+5000, desc:'Recarga inicial de boas-vindas', time:'hoje' },
  ]),
  pendingUploads: store.get('pendingUploads', []),
  queue: [], qIdx: -1,
  isPlaying: false, elapsed: 0, charged: false, tickTimer: null,
  followed: store.get('followed', []),
  paidLive: {},                                 // incrementos live do ticker
  premiumUntil: store.get('premiumUntil', null),// timestamp de fim da subscrição (ISO) ou null
  dlUsed: store.get('dlUsed', 0),               // downloads utilizados no ciclo atual
  dataMode: store.get('dataMode', 'normal'),    // economica | normal | alta
  cardPool: store.get('cardPool', []),          // cartões de recarga gerados pelo admin
  artistProfile: store.get('artistProfile', null), // perfil do artista registado (onboarding)
};
const persist = () => { store.set('role', S.role); store.set('balance', S.balance); store.set('owned', S.owned); store.set('txs', S.txs); store.set('pendingUploads', S.pendingUploads); store.set('followed', S.followed); store.set('premiumUntil', S.premiumUntil); store.set('dlUsed', S.dlUsed); store.set('dataMode', S.dataMode); store.set('cardPool', S.cardPool); store.set('artistProfile', S.artistProfile); };
const isPremium = () => S.premiumUntil && new Date(S.premiumUntil) > new Date();
const dlLeft = () => Math.max(0, PREMIUM_DL_LIMIT - S.dlUsed);
const renewDate = () => S.premiumUntil ? new Date(S.premiumUntil).toLocaleDateString('pt-PT') : '—';

/* ---- Validação de documentos angolanos ---- */
// IBAN Angola: AO + 2 dígitos de controlo + 21 dígitos NBA = 25 caracteres.
// Validação estrutural + checksum ISO 7064 MOD-97-10.
function validarIBAN_AO(raw){
  const s = (raw || '').replace(/\s+/g, '').toUpperCase();
  if(!/^AO\d{23}$/.test(s)) return { ok:false, motivo:'O IBAN deve ter o formato AO + 23 dígitos (25 caracteres).' };
  const rearr = s.slice(4) + s.slice(0, 4);
  let expanded = '';
  for(const ch of rearr) expanded += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  let rem = 0;
  for(let i = 0; i < expanded.length; i++) rem = (rem * 10 + (expanded.charCodeAt(i) - 48)) % 97;
  return rem === 1 ? { ok:true } : { ok:false, motivo:'IBAN inválido (dígitos de controlo não conferem).' };
}
// BI Angola: 9 dígitos + 2 letras + 3 dígitos = 14 caracteres.
function validarBI_AO(raw){
  const s = (raw || '').replace(/\s+/g, '').toUpperCase();
  return /^\d{9}[A-Z]{2}\d{3}$/.test(s)
    ? { ok:true } : { ok:false, motivo:'O BI deve ter 9 dígitos + 2 letras + 3 dígitos (ex.: 007654321LA042).' };
}
function fmtIBAN(s){ return (s || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim(); }

const PRICE_STREAM = 10, PRICE_DL = 100, FEE_UPLOAD = 1000, ARTIST_SHARE = 0.8;
const PREMIUM_PRICE = 25000;                 // subscrição mensal (AKZ)
const PREMIUM_DL_LIMIT = 25;                 // downloads incluídos por ciclo mensal
const LOW_BALANCE = 200;                     // limiar de aviso de saldo baixo (AKZ)
const RECARGAS = [500, 1000, 2000, 5000, 10000];
const CARD_META = {                          // identidade visual dos cartões de recarga
  500:   { nome:'Recarga Essencial', tag:'Para começar a ouvir',                cls:'essencial' },
  1000:  { nome:'Recarga Play',      tag:'Opção económica para o dia a dia',    cls:'play' },
  2000:  { nome:'Recarga Mix',       tag:'Mais música, mais liberdade.',        cls:'mix' },
  5000:  { nome:'Recarga Premium',   tag:'Ideal para quem ouve música todos os dias.', cls:'premium' },
  10000: { nome:'Recarga Max',       tag:'Máxima liberdade para ouvir e descarregar.', cls:'max' },
};
const MSG_SEM_SALDO = 'O seu saldo é insuficiente. Faça uma recarga para continuar a ouvir ou descarregar músicas.';
const CHARGE_AFTER_SEC = 5; // demo — pré-escuta gratuita (30 s em produção)

/* ---------- helpers UI ---------- */
const $ = sel => document.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

function toast(msg, kind){
  const t = el('<div class="toast ' + (kind || '') + '">' + msg + '</div>');
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 4200);
}
function openModal(html){ $('#modalBox').innerHTML = html; $('#modal').hidden = false; }
function closeModal(){ $('#modal').hidden = true; }
$('#modal').addEventListener('click', e => { if(e.target.id === 'modal') closeModal(); });

function coverStyle(genreId, size){
  const g = genreOf(genreId);
  return 'background:linear-gradient(135deg,' + g.c1 + ',' + g.c2 + ');' + (size ? 'width:' + size + 'px;height:' + size + 'px;' : '');
}
function avatarStyle(a){
  const g = genreOf(a.genre);
  return 'background:linear-gradient(135deg,' + g.c1 + ',' + g.c2 + ')';
}
function updateWalletChip(){ $('#walletBalance').textContent = fmtKz(S.balance); }

function debit(amount, desc, kind){
  if(S.balance < amount){
    toast(MSG_SEM_SALDO + ' <a href="#/wallet" style="color:var(--gold);font-weight:700">Carregar saldo →</a>', 'red');
    return false;
  }
  S.balance -= amount;
  S.txs.unshift({ type: kind || 'debit', amount: -amount, desc, time: nowStamp() });
  persist(); updateWalletChip();
  if(S.balance < LOW_BALANCE){
    toast('⚠ O seu saldo está abaixo de ' + LOW_BALANCE + ' AKZ. <a href="#/wallet" style="color:var(--gold);font-weight:700">Carregar saldo →</a>');
  }
  return true;
}
function credit(amount, desc){
  S.balance += amount;
  S.txs.unshift({ type:'topup', amount:+amount, desc, time:'agora' });
  persist(); updateWalletChip();
}

/* ============================================================
   PLAYER
   ============================================================ */
function playTrack(trackId){
  const approved = TRACKS.slice();
  S.queue = approved;
  S.qIdx = approved.findIndex(t => t.id === trackId);
  startPlayback();
}
function startPlayback(){
  const t = S.queue[S.qIdx];
  if(!t) return;
  S.isPlaying = true; S.elapsed = 0; S.charged = false;
  AudioEngine.play(t);
  renderPlayerBar(t);
  clearInterval(S.tickTimer);
  S.tickTimer = setInterval(tick, 1000);
  document.querySelectorAll('.trow').forEach(r => r.classList.toggle('playing', r.dataset.tid === t.id));
}
function tick(){
  const t = S.queue[S.qIdx];
  if(!t || !S.isPlaying) return;
  S.elapsed++;
  if(!S.charged && S.elapsed >= CHARGE_AFTER_SEC){
    S.charged = true;
    const share = PRICE_STREAM * ARTIST_SHARE;
    if(isPremium()){
      // Plano Premium: consumo ilimitado, sem débito da wallet.
      // O play conta na mesma e o artista recebe (fundo Premium).
      S.paidLive[t.id] = (S.paidLive[t.id] || 0) + share;
      toast('Play Premium ▪ ilimitado · <b>' + share + ' Kz</b> para ' + artistOf(t.artistId).name, 'ok');
      updateTicker(t);
    } else if(debit(PRICE_STREAM, 'Streaming — ' + t.title, 'stream')){
      S.paidLive[t.id] = (S.paidLive[t.id] || 0) + share;
      toast('Play faturado: <b>' + PRICE_STREAM + ' Kz</b> · <b>' + share + ' Kz</b> vão para ' + artistOf(t.artistId).name + ' <span style="color:var(--muted)">(80%)</span>', 'ok');
      updateTicker(t);
    } else { pausePlayback(); }
  }
  updateProgress(t);
  if(S.elapsed >= t.dur) nextTrack();
}
function pausePlayback(){
  S.isPlaying = false; AudioEngine.pause();
  $('#btnPlay').textContent = '▶'; $('#eq').classList.remove('on');
}
function resumePlayback(){
  const t = S.queue[S.qIdx]; if(!t) return;
  S.isPlaying = true; AudioEngine.play(t);
  $('#btnPlay').textContent = '❚❚'; $('#eq').classList.add('on');
}
function nextTrack(){ if(S.qIdx < S.queue.length - 1){ S.qIdx++; startPlayback(); } else pausePlayback(); }
function prevTrack(){ if(S.qIdx > 0){ S.qIdx--; startPlayback(); } }

function renderPlayerBar(t){
  $('#player').hidden = false;
  $('#pCover').style.cssText = coverStyle(t.genre);
  $('#pTitle').textContent = t.title;
  $('#pArtist').textContent = artistOf(t.artistId).name;
  $('#pDur').textContent = fmtDur(t.dur);
  $('#btnPlay').textContent = '❚❚';
  $('#eq').classList.add('on');
  updateTicker(t);
  const owned = S.owned.includes(t.id);
  const dl = $('#btnDl');
  dl.textContent = owned ? '⭳ adquirida'
    : (isPremium() ? (dlLeft() > 0 ? '⭳ ' + dlLeft() + ' de ' + PREMIUM_DL_LIMIT : '⭳ ' + PRICE_DL + ' Kz')
                   : '⭳ ' + PRICE_DL + ' Kz');
  dl.classList.toggle('owned', owned || (isPremium() && dlLeft() > 0));
}
function updateTicker(t){
  const labels = { economica:'Económica', normal:'Normal', alta:'Alta' };
  const el2 = $('#tickValue'); if(el2) el2.textContent = labels[S.dataMode] || 'Normal';
}
function updateProgress(t){
  $('#pTime').textContent = fmtDur(S.elapsed);
  $('#pFill').style.width = Math.min(100, S.elapsed / t.dur * 100) + '%';
}
$('#btnPlay').addEventListener('click', () => S.isPlaying ? pausePlayback() : resumePlayback());
$('#btnNext').addEventListener('click', nextTrack);
$('#btnPrev').addEventListener('click', prevTrack);
$('#pBar').addEventListener('click', e => {
  const t = S.queue[S.qIdx]; if(!t) return;
  const r = e.currentTarget.getBoundingClientRect();
  S.elapsed = Math.floor((e.clientX - r.left) / r.width * t.dur);
  updateProgress(t);
});
$('#btnDl').addEventListener('click', () => {
  const t = S.queue[S.qIdx]; if(!t) return;
  buyDownload(t.id);
});

/* ---- Regras de download (secção 8 da especificação) ---- */
function buyDownload(trackId){
  const t = TRACKS.find(x => x.id === trackId);
  if(S.owned.includes(trackId)){
    toast('Já tens licença de <b>' + t.title + '</b> — re-download gratuito.', 'ok');
    return;
  }
  const a = artistOf(t.artistId);
  const sizeMB = (t.dur * 0.32).toFixed(1);          // ~MP3 320
  const premium = isPremium();
  const temQuota = premium && dlLeft() > 0;

  let corpo = '<table class="data" style="margin-bottom:6px"><tbody>' +
    '<tr><td>Música</td><td style="text-align:right"><b>' + t.title + '</b></td></tr>' +
    '<tr><td>Artista</td><td style="text-align:right">' + a.name + '</td></tr>' +
    '<tr><td>Formato</td><td style="text-align:right">MP3 320 kbps</td></tr>' +
    '<tr><td>Tamanho aprox.</td><td style="text-align:right">' + sizeMB + ' MB</td></tr>';

  if(temQuota){
    corpo += '<tr><td>Valor</td><td style="text-align:right;color:var(--gold)"><b>Incluído no plano</b></td></tr>' +
      '</tbody></table>' +
      '<p style="font-size:13px;color:var(--gold)">Este download utilizará 1 dos seus ' + PREMIUM_DL_LIMIT + ' downloads mensais. Ficarão disponíveis ' + (dlLeft() - 1) + '.</p>';
  } else if(premium){
    // subscritor sem quota → oferecer saldo
    corpo += '<tr><td>Valor</td><td style="text-align:right"><b>' + PRICE_DL + ' AKZ</b> (via saldo)</td></tr>' +
      '<tr><td>Saldo atual</td><td style="text-align:right">' + fmtKz(S.balance) + '</td></tr>' +
      '<tr><td>Saldo após</td><td style="text-align:right">' + fmtKz(S.balance - PRICE_DL) + '</td></tr>' +
      '</tbody></table>' +
      '<p style="font-size:13px;color:var(--muted)">Já utilizou os ' + PREMIUM_DL_LIMIT + ' downloads incluídos no seu plano. O limite será renovado em <b style="color:var(--text)">' + renewDate() + '</b>. Pode continuar a ouvir música normalmente.</p>';
  } else {
    corpo += '<tr><td>Valor</td><td style="text-align:right"><b>' + PRICE_DL + ' AKZ</b></td></tr>' +
      '<tr><td>Saldo atual</td><td style="text-align:right">' + fmtKz(S.balance) + '</td></tr>' +
      '<tr><td>Saldo após</td><td style="text-align:right;color:' + (S.balance - PRICE_DL < 0 ? 'var(--red)' : 'var(--ok)') + '">' + fmtKz(S.balance - PRICE_DL) + '</td></tr>' +
      '</tbody></table>';
  }

  const btnLabel = temQuota ? 'Descarregar (1 de ' + PREMIUM_DL_LIMIT + ')' : 'Descarregar por ' + PRICE_DL + ' AKZ';
  openModal('<h3>Confirmar download</h3>' + corpo +
    '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
    '<button class="btn btn-gold btn-sm" id="confirmDl">' + btnLabel + '</button></div>');

  $('#confirmDl').addEventListener('click', () => {
    closeModal();
    const share = PRICE_DL * ARTIST_SHARE;
    if(temQuota){
      S.dlUsed++; S.owned.push(trackId);
      S.txs.unshift({ type:'download', amount:0, desc:'Download (plano ' + S.dlUsed + '/' + PREMIUM_DL_LIMIT + ') — ' + t.title, time: nowStamp() });
      persist();
      S.paidLive[trackId] = (S.paidLive[trackId] || 0) + share;
      toast('Download concluído · <b>' + S.dlUsed + ' de ' + PREMIUM_DL_LIMIT + '</b> utilizados este mês · <b>' + share + ' Kz</b> para ' + a.name + '.', 'ok');
      if(dlLeft() === 0) toast('Utilizaste os ' + PREMIUM_DL_LIMIT + ' downloads do plano. Renovação em <b>' + renewDate() + '</b>. O streaming continua ilimitado.');
    } else if(debit(PRICE_DL, 'Download — ' + t.title, 'download')){
      S.owned.push(trackId); persist();
      S.paidLive[trackId] = (S.paidLive[trackId] || 0) + share;
      toast('Download adquirido: <b>' + PRICE_DL + ' Kz</b> · <b>' + share + ' Kz</b> para ' + a.name + '. Recibo guardado no histórico.', 'ok');
    } else { return; }
    if(S.queue[S.qIdx] && S.queue[S.qIdx].id === trackId) renderPlayerBar(t);
  });
}

/* ============================================================
   COMPONENTES
   ============================================================ */
function trackCard(t){
  const a = artistOf(t.artistId), g = genreOf(t.genre);
  return '<div class="card-track" data-play="' + t.id + '">' +
    '<div class="cover" style="' + coverStyle(t.genre) + '"><span class="genre-tag">' + g.name + '</span></div>' +
    '<div class="t-title">' + t.title + '</div>' +
    '<div class="t-artist">' + a.name + '</div>' +
    '<div class="t-paid">' + fmtN(t.plays) + ' plays</div>' +
    '<button class="play-fab" aria-label="Reproduzir ' + t.title + '">▶</button>' +
  '</div>';
}
function trackRow(t, i){
  const a = artistOf(t.artistId);
  return '<div class="trow" data-tid="' + t.id + '" data-play="' + t.id + '">' +
    '<span class="idx">' + String(i + 1).padStart(2, '0') + '</span>' +
    '<div class="mini-cover" style="' + coverStyle(t.genre) + '"></div>' +
    '<div><div class="tt">' + t.title + '</div><div class="ta">' + a.name + '</div></div>' +
    '<span class="tpaid">' + fmtN(t.plays) + ' plays</span>' +
    '<span class="tdur">' + fmtDur(t.dur) + '</span>' +
  '</div>';
}
function artistCard(a){
  return '<div class="card-artist" data-goto="#/artista/' + a.id + '">' +
    '<div class="avatar" style="' + avatarStyle(a) + '">' + initials(a.name) + '</div>' +
    '<div class="a-name">' + a.name + (a.verified ? ' <span style="color:var(--gold)">✔</span>' : '') + '</div>' +
    '<div class="a-meta">' + genreOf(a.genre).name + ' · ' + a.province + '</div>' +
    '<div class="a-meta">' + fmtN(a.followers) + ' seguidores</div>' +
  '</div>';
}
function kpi(label, value, sub, cls){
  return '<div class="kpi ' + (cls || '') + '"><div class="k-label">' + label + '</div>' +
    '<div class="k-value">' + value + '</div>' + (sub ? '<div class="k-sub">' + sub + '</div>' : '') + '</div>';
}
function roleGate(needed, msg){
  return '<div class="panel" style="text-align:center;padding:56px 24px">' +
    '<div class="eyebrow">Acesso restrito</div>' +
    '<h2 class="h-display" style="font-size:22px;margin-bottom:10px">' + msg + '</h2>' +
    '<p style="color:var(--muted);margin-bottom:22px">Isto é uma demo — muda de perfil na barra lateral para experimentares esta área.</p>' +
    '<button class="btn btn-red" data-setrole="' + needed + '">Entrar como ' + needed + '</button>' +
  '</div>';
}

/* gráfico SVG de receita (área) */
function revenueChart(series){
  const W = 720, H = 220, P = 34;
  const max = Math.max(...series.map(d => d.v)) * 1.12;
  const x = i => P + i * (W - P * 2) / (series.length - 1);
  const y = v => H - P - (v / max) * (H - P * 2);
  let line = '', area = 'M' + x(0) + ',' + (H - P) + ' ';
  series.forEach((d, i) => { const px = x(i), py = y(d.v); line += (i ? 'L' : 'M') + px + ',' + py + ' '; area += 'L' + px + ',' + py + ' '; });
  area += 'L' + x(series.length - 1) + ',' + (H - P) + ' Z';
  const labels = series.map((d, i) => '<text x="' + x(i) + '" y="' + (H - 10) + '" text-anchor="middle" fill="#8f8f9e" font-size="10">' + d.m + '</text>').join('');
  const dots = series.map((d, i) => '<circle cx="' + x(i) + '" cy="' + y(d.v) + '" r="3.2" fill="#F2B01E"/>').join('');
  return '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Receita mensal">' +
    '<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#E0122C" stop-opacity=".35"/><stop offset="1" stop-color="#E0122C" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#ga)"/>' +
    '<path d="' + line + '" fill="none" stroke="#E0122C" stroke-width="2.5" stroke-linejoin="round"/>' +
    dots + labels + '</svg>';
}

/* ============================================================
   VISTAS
   ============================================================ */
const totalPaidAll = () => TRACKS.reduce((s, t) => s + t.paidTotal + (S.paidLive[t.id] || 0), 0);

function viewHome(){
  const top = TRACKS.slice().sort((a, b) => b.plays - a.plays).slice(0, 8);
  const novos = TRACKS.filter(t => t.year === 2026).slice(0, 6);
  return '' +
  '<div class="hero">' +
    '<div class="eyebrow">Plataforma angolana · beta</div>' +
    '<h1 class="h-display">A tua música,<br><span class="accent">o teu dinheiro.</span></h1>' +
    '<p>Cada play paga ao artista, em kwanzas, com transparência total. Ouve, descarrega e apoia quem faz a banda sonora de Angola.</p>' +
    '<div class="hero-actions">' +
      '<a class="btn btn-red" href="#/explorar">Começar a ouvir</a>' +
      '<a class="btn btn-ghost" href="#/upload">Sou artista</a>' +
    '</div>' +
    '<div class="hero-counter"><div class="num" id="heroCounter">' + fmtKz(totalPaidAll()) + '</div>' +
    '<div class="lbl">já pagos aos artistas</div></div>' +
  '</div>' +
  '<div class="section"><div class="section-head"><h2>Top Angola</h2><a href="#/explorar">ver tudo →</a></div>' +
    '<div class="tracklist">' + top.map(trackRow).join('') + '</div></div>' +
  '<div class="section"><div class="section-head"><h2>Lançamentos 2026</h2></div>' +
    '<div class="grid grid-tracks">' + novos.map(trackCard).join('') + '</div></div>' +
  '<div class="section"><div class="section-head"><h2>Artistas em destaque</h2></div>' +
    '<div class="grid grid-artists">' + ARTISTS.slice(0, 4).map(artistCard).join('') + '</div></div>';
}

function viewExplorar(params){
  const gid = params[0];
  if(gid){
    const g = genreOf(gid);
    const list = TRACKS.filter(t => t.genre === gid);
    return '<div class="section"><div class="eyebrow">Género</div>' +
      '<h1 class="h-display" style="font-size:32px;margin-bottom:24px">' + g.name + '</h1>' +
      '<div class="tracklist">' + list.map(trackRow).join('') + '</div></div>';
  }
  return '' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:28px">Explorar</h1>' +
  '<div class="section"><div class="section-head"><h2>Géneros</h2></div>' +
    '<div class="grid grid-genres">' + GENRES.map(g =>
      '<div class="card-genre" style="background:linear-gradient(135deg,' + g.c1 + ',' + g.c2 + ')" data-goto="#/explorar/' + g.id + '">' + g.name + '</div>'
    ).join('') + '</div></div>' +
  '<div class="section"><div class="section-head"><h2>Streams por província</h2></div>' +
    '<div class="panel"><div class="hbars">' + PROVINCES_TOP.map(p =>
      '<div class="hbar"><span>' + p.name + '</span><div class="hb-track"><div class="hb-fill" style="width:' + p.pct + '%"></div></div><span class="hb-val">' + p.streams + '</span></div>'
    ).join('') + '</div></div></div>' +
  '<div class="section"><div class="section-head"><h2>Todos os artistas</h2></div>' +
    '<div class="grid grid-artists">' + ARTISTS.map(artistCard).join('') + '</div></div>';
}

function viewPesquisa(){
  return '<h1 class="h-display" style="font-size:30px;margin-bottom:22px">Pesquisar</h1>' +
  '<div class="field" style="margin-bottom:26px"><input id="searchBox" type="search" placeholder="Faixa, artista, género, província…" autocomplete="off" style="font-size:16px;padding:15px 18px"></div>' +
  '<div id="searchResults"><p style="color:var(--muted)">Escreve para pesquisar no catálogo — resultados instantâneos.</p></div>';
}
function runSearch(q){
  q = q.toLowerCase().trim();
  const box = $('#searchResults');
  if(!q){ box.innerHTML = '<p style="color:var(--muted)">Escreve para pesquisar no catálogo.</p>'; return; }
  const ts = TRACKS.filter(t => (t.title + ' ' + artistOf(t.artistId).name + ' ' + genreOf(t.genre).name).toLowerCase().includes(q));
  const as = ARTISTS.filter(a => (a.name + ' ' + a.province + ' ' + genreOf(a.genre).name).toLowerCase().includes(q));
  box.innerHTML =
    (ts.length ? '<div class="section"><div class="section-head"><h2>Faixas</h2></div><div class="tracklist">' + ts.map(trackRow).join('') + '</div></div>' : '') +
    (as.length ? '<div class="section"><div class="section-head"><h2>Artistas</h2></div><div class="grid grid-artists">' + as.map(artistCard).join('') + '</div></div>' : '') +
    (!ts.length && !as.length ? '<p style="color:var(--muted)">Sem resultados para “' + q + '”. Experimenta outro termo.</p>' : '');
}

function viewArtista(params){
  const a = artistOf(params[0]);
  if(!a) return '<p>Artista não encontrado.</p>';
  const list = TRACKS.filter(t => t.artistId === a.id);
  const paid = list.reduce((s, t) => s + t.paidTotal, 0);
  const following = S.followed.includes(a.id);
  const g = genreOf(a.genre);
  return '' +
  '<div class="artist-hero" style="background:radial-gradient(700px 260px at 85% -20%,' + g.c1 + '33,transparent 60%),var(--surface)">' +
    '<div class="avatar" style="' + avatarStyle(a) + '">' + initials(a.name) + '</div>' +
    '<div>' +
      '<div class="eyebrow">' + g.name + ' · ' + a.province + (a.verified ? ' · <span style="color:var(--gold)">verificado ✔</span>' : '') + '</div>' +
      '<h1 class="h-display">' + a.name + '</h1>' +
      '<div class="stats">' +
        '<span><b>' + fmtN(a.followers) + '</b> seguidores</span>' +
        '<span><b>' + list.length + '</b> faixas</span>' +
        '<span><b>' + fmtN(list.reduce((s,t)=>s+t.plays,0)) + '</b> plays</span>' +
      '</div>' +
      '<div style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap">' +
        '<button class="btn btn-red btn-sm" data-follow="' + a.id + '">' + (following ? 'A seguir ✓' : '+ Seguir') + '</button>' +
        (list.length ? '<button class="btn btn-ghost btn-sm" data-play="' + list[0].id + '">▶ Reproduzir</button>' : '') +
        '<button class="btn btn-gold btn-sm" data-tip="' + a.id + '">♥ Apoiar o artista</button>' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="section"><div class="section-head"><h2>Discografia</h2></div>' +
    '<div class="tracklist">' + list.map(trackRow).join('') + '</div></div>';
}

function viewWallet(){
  const icons = { topup:'▲', stream:'♪', download:'⭳', upload:'✚', debit:'−', premium:'★' };
  const premium = isPremium();
  const premiumDias = premium ? Math.ceil((new Date(S.premiumUntil) - new Date()) / 86400000) : 0;

  return '' +
  '<div class="wallet-hero">' +
    '<div class="eyebrow">Wallet Music AO' + (premium ? ' · <span style="color:var(--gold)">Premium ativo</span>' : '') + '</div>' +
    '<div class="bal">' + fmtKz(S.balance) + '</div>' +
    '<p style="color:var(--muted);margin-top:8px">Streaming ' + PRICE_STREAM + ' Kz · Download ' + PRICE_DL + ' Kz · Upload de faixa ' + fmtN(FEE_UPLOAD) + ' Kz' +
      (premium ? ' <span style="color:var(--gold)">· com Premium, plays e downloads são ilimitados</span>' : '') + '</p>' +
  '</div>' +

  /* ---- Modelo B — Subscrição Premium ---- */
  '<div class="section"><div class="section-head"><h2>Plano Premium</h2><span style="font-size:12px;color:var(--muted)">Modelo B — subscrição</span></div>' +
    '<div class="panel" style="background:radial-gradient(600px 200px at 90% -30%,var(--gold-soft),transparent 60%),var(--surface);border-color:rgba(242,176,30,.3)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:200px">' +
          '<div style="font-family:var(--font-display);font-weight:700;font-size:22px">' + fmtN(PREMIUM_PRICE) + ' Kz<span style="font-size:14px;color:var(--muted);font-weight:400"> / mês</span></div>' +
          '<ul style="list-style:none;margin-top:12px;display:flex;flex-direction:column;gap:7px;font-size:13.5px;color:var(--muted)">' +
            '<li>✓ Streaming ilimitado durante o período ativo</li>' +
            '<li>✓ <b style="color:var(--text)">' + PREMIUM_DL_LIMIT + ' downloads</b> incluídos por ciclo mensal</li>' +
            '<li>✓ Downloads extra por ' + PRICE_DL + ' AKZ via saldo</li>' +
            '<li>✓ Os artistas continuam a receber por cada play e download</li>' +
            '<li>✓ Renovação manual ou automática · cancela quando quiseres</li>' +
          '</ul>' +
        '</div>' +
        '<div style="text-align:right">' +
          (premium ?
            '<div class="pill ok" style="margin-bottom:10px">Ativo · renova em ' + renewDate() + '</div>' +
            '<div style="font-size:13px;margin-bottom:4px">Downloads utilizados: <b>' + S.dlUsed + ' de ' + PREMIUM_DL_LIMIT + '</b></div>' +
            '<div style="font-size:13px;color:var(--gold);margin-bottom:12px">Disponíveis: <b>' + dlLeft() + '</b></div>' +
            '<div class="hb-track" style="width:180px;margin-left:auto;margin-bottom:14px"><div class="hb-fill" style="width:' + (S.dlUsed / PREMIUM_DL_LIMIT * 100) + '%"></div></div>' +
            '<button class="btn btn-ghost btn-sm" id="btnCancelPremium" style="border-color:var(--red);color:var(--red)">Cancelar subscrição</button>' :
            '<button class="btn btn-gold" id="btnPremium">Subscrever plano mensal</button>') +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>' +

  /* ---- Modelo A — Cartões de recarga ---- */
  '<div class="section"><div class="section-head"><h2>Recarregar saldo</h2><span style="font-size:12px;color:var(--muted)">Modelo A — carteira</span></div>' +
    '<div class="rcards">' + RECARGAS.map((v, i) => {
      const m = CARD_META[v];
      return '<div class="rcard rc-' + m.cls + (i === 1 ? ' sel' : '') + '" data-pack="' + v + '">' +
        '<div class="rc-top"><span class="rc-brand">MUSIC<em>AO</em></span><span class="rc-waves">▁▃▅▇</span></div>' +
        '<div class="rc-amt">' + fmtN(v) + '<span> AKZ</span></div>' +
        '<div class="rc-name">' + m.nome + '</div>' +
        '<div class="rc-est">≈ ' + fmtN(Math.floor(v / PRICE_STREAM)) + ' plays · ' + Math.floor(v / PRICE_DL) + ' downloads</div>' +
        '<div class="rc-tag">' + m.tag + '</div>' +
      '</div>';
    }).join('') + '</div>' +
    '<div class="methods">' + [
      ['💳', 'Multicaixa Express', 'mcx'], ['🔢', 'Referência EMIS', 'ref'], ['🏦', 'Transferência', 'transf'],
      ['💠', 'Visa / Mastercard', 'card'], ['🅿️', 'PayPal', 'paypal'], ['', 'Apple Pay / Google Pay', 'wallet'],
    ].map((m, i) =>
      '<div class="method' + (i === 0 ? ' sel' : '') + '" data-method="' + m[1] + '"><span class="m-ico">' + m[0] + '</span>' + m[1] + '</div>'
    ).join('') + '</div>' +
    '<div style="margin-top:22px"><button class="btn btn-gold" id="btnTopup">Carregar saldo</button></div>' +
  '</div>' +

  /* ---- Transferir saldo para outro utilizador ---- */
  '<div class="section"><div class="section-head"><h2>Transferir saldo</h2></div>' +
    '<div class="panel"><p style="color:var(--muted);font-size:13px;margin-bottom:14px">Envia créditos da tua carteira para outro utilizador Music AO — ele poderá usá-los para ouvir e descarregar música. Indica o telefone ou o ID da conta de destino.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">' +
        '<div class="field" style="flex:1;min-width:200px"><label for="trfTo">Destinatário</label><input id="trfTo" placeholder="Ex.: 923 000 000 ou @ndala"></div>' +
        '<div class="field" style="width:150px"><label for="trfAmt">Valor (AKZ)</label><input id="trfAmt" type="number" placeholder="500" min="50"></div>' +
        '<button class="btn btn-gold btn-sm" id="btnTransfer" style="padding:12px 20px">Enviar</button>' +
      '</div></div></div>' +

  /* ---- Ativar código de recarga (cartão físico/digital) ---- */
  '<div class="section"><div class="section-head"><h2>Ativar código de recarga</h2></div>' +
    '<div class="panel"><p style="color:var(--muted);font-size:13px;margin-bottom:14px">Compraste um cartão Music AO num agente? Introduz o código (ou lê o QR) para creditar o saldo. Cada cartão só pode ser utilizado uma vez.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<input id="cardCode" placeholder="Ex.: MAO-2000-7GK4-QZ1B" style="flex:1;min-width:220px;background:var(--surface2);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:12px 14px;font-family:var(--font-body);letter-spacing:.06em;text-transform:uppercase">' +
        '<button class="btn btn-gold btn-sm" id="btnActivateCard" style="padding:12px 20px">Ativar</button>' +
      '</div></div></div>' +

  /* ---- Qualidade de áudio / consumo de dados ---- */
  '<div class="section"><div class="section-head"><h2>Consumo de dados</h2></div>' +
    '<div class="panel"><p style="color:var(--muted);font-size:13px;margin-bottom:14px">Escolhe a qualidade de áudio para poupares dados móveis.</p>' +
    '<div class="role-btns" style="max-width:420px">' +
      [['economica','Económica · 48 kbps'],['normal','Normal · 128 kbps'],['alta','Alta · 320 kbps']].map(m =>
        '<button data-datamode="' + m[0] + '"' + (S.dataMode === m[0] ? ' class="active"' : '') + '>' + m[1] + '</button>').join('') +
    '</div></div></div>' +

  /* ---- Histórico financeiro ---- */
  '<div class="section"><div class="section-head"><h2>Histórico financeiro</h2></div>' +
    '<div class="panel"><table class="data"><thead><tr><th></th><th>Descrição</th><th>Data / hora</th><th style="text-align:right">Valor</th></tr></thead><tbody>' +
    S.txs.slice(0, 14).map(tx =>
      '<tr><td>' + (icons[tx.type] || '·') + '</td><td>' + tx.desc + '</td><td style="color:var(--muted)">' + (tx.time || nowStamp()) + '</td>' +
      '<td style="text-align:right;color:' + (tx.amount >= 0 ? 'var(--ok)' : 'var(--text)') + '">' + (tx.amount >= 0 ? '+' : '') + fmtKz(tx.amount) + '</td></tr>'
    ).join('') + '</tbody></table></div></div>';
}

function nowStamp(){
  const d = new Date();
  return d.toLocaleDateString('pt-PT') + ' ' + d.toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' });
}

/* ============================================================
   ONBOARDING DO ARTISTA — cadastro obrigatório antes de publicar
   Nome completo, BI e IBAN obrigatórios e validados. Foto obrigatória.
   ============================================================ */
function viewArtistOnboarding(){
  return '' +
  '<div class="eyebrow">Portal do artista · registo</div>' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:8px">Cria o teu perfil de artista</h1>' +
  '<p style="color:var(--muted);margin-bottom:24px">Antes de publicares música, precisamos de validar a tua identidade e a tua conta bancária — é assim que garantimos que recebes os teus pagamentos. Os campos com * são obrigatórios.</p>' +

  '<div class="panel"><div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start">' +
    '<div style="text-align:center">' +
      '<div id="obPhoto" style="width:132px;height:132px;border-radius:16px;background:var(--surface2);border:2px dashed var(--line);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;color:var(--muted);font-size:12px;text-align:center;padding:8px">Carregar<br>fotografia *</div>' +
      '<input id="obPhotoInput" type="file" accept="image/*" hidden>' +
    '</div>' +
    '<div style="flex:1;min-width:260px"><div class="form-grid">' +
      field('Nome completo *', 'obNome', 'text', 'Como no BI') +
      field('Nome artístico', 'obArtistico', 'text', 'Ex.: Kalunga MC') +
      field('Idade', 'obIdade', 'number', '') +
      field('NIF', 'obNif', 'text', 'opcional') +
    '</div></div>' +
  '</div></div>' +

  '<div class="panel"><h3>Identificação e conta bancária</h3><div class="form-grid">' +
    '<div class="field"><label for="obBI">Bilhete de Identidade *</label><input id="obBI" type="text" placeholder="007654321LA042" style="text-transform:uppercase"><div class="valid-msg" id="msgBI"></div></div>' +
    selectField('Banco', 'obBanco', ['BIC','BAI','BFA','BPC','SOL','BCI','Standard Bank','Keve','BNI']) +
    '<div class="field" style="grid-column:1 / -1"><label for="obIBAN">IBAN *</label><input id="obIBAN" type="text" placeholder="AO06 0040 0000 1089 4244 10175" style="text-transform:uppercase;font-family:monospace"><div class="valid-msg" id="msgIBAN"></div></div>' +
    field('Titular da conta', 'obTitular', 'text', 'Nome do titular') +
  '</div>' +
  '<div class="fee-note" style="margin-top:20px">◆ Taxa de inscrição única: <b>' + fmtN(10000) + ' Kz</b> — debitada da tua wallet. Saldo atual: <b>' + fmtKz(S.balance) + '</b>. Após validação, ficas elegível para receber pagamentos.</div>' +
  '<button class="btn btn-red" id="btnRegisterArtist" style="margin-top:6px">Concluir registo e pagar ' + fmtN(10000) + ' Kz</button>' +
  '</div>';
}

function viewUpload(){
  if(S.role === 'ouvinte') return roleGate('artista', 'O portal de publicação é exclusivo para artistas');
  if(!S.artistProfile) return viewArtistOnboarding();   // cadastro obrigatório primeiro
  return '' +
  '<div class="eyebrow">Portal do artista · ' + (S.artistProfile.artistico || S.artistProfile.nome) + (S.artistProfile.verificado ? ' <span style="color:var(--gold)">✔ verificado</span>' : '') + '</div>' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:26px">Publicar nova faixa</h1>' +
  '<div class="dropzone" id="dropzone"><span class="dz-ico">▲</span>' +
    '<b>Arrasta o teu WAV, FLAC ou MP3 para aqui</b><br>ou clica para escolher · máx. 200 MB · validação e antivírus automáticos' +
    '<div class="progressbar" id="dzProgress" hidden><div class="pf" id="dzFill"></div></div>' +
    '<div id="dzFile" style="margin-top:12px;font-weight:600;color:var(--gold)"></div>' +
  '</div>' +
  '<div class="panel"><h3>Metadados obrigatórios</h3><div class="form-grid">' +
    field('Título *', 'upTitle', 'text', 'Ex.: Kuduro na Kianda') +
    field('Nome artístico *', 'upArtist', 'text', '') +
    field('Autores *', 'upAuthors', 'text', 'separados por vírgula') +
    field('Compositores *', 'upComposers', 'text', '') +
    field('Produtores *', 'upProducers', 'text', '') +
    field('Feat.', 'upFeat', 'text', 'opcional') +
    selectField('Género *', 'upGenre', GENRES.map(g => g.name)) +
    field('Subgénero', 'upSub', 'text', '') +
    field('Idioma *', 'upLang', 'text', 'Português, Kimbundu, Kikongo…') +
    field('Ano *', 'upYear', 'number', '2026') +
    field('BPM', 'upBpm', 'number', '') +
    field('Tom musical', 'upKey', 'text', 'Ex.: G min') +
    field('Copyright *', 'upCopy', 'text', '© 2026 …') +
    field('ISRC', 'upIsrc', 'text', 'se existir') +
    field('Código interno', 'upCode', 'text', '') +
    field('Tags', 'upTags', 'text', 'separadas por vírgula') +
  '</div>' +
  '<div class="field" style="margin-top:16px"><label>Letra</label><textarea id="upLyrics" rows="3" placeholder="Cola aqui a letra da faixa"></textarea></div>' +
  '</div>' +
  '<div class="fee-note">◆ Taxa de publicação: <b>' + fmtN(FEE_UPLOAD) + ' Kz</b> — debitada da tua wallet no envio. Saldo atual: <b>' + fmtKz(S.balance) + '</b>. A faixa entra em moderação e ficas notificado da decisão.</div>' +
  '<button class="btn btn-red" id="btnPublish">Publicar e pagar ' + fmtN(FEE_UPLOAD) + ' Kz</button>' +
  (S.pendingUploads.length ?
    '<div class="section" style="margin-top:40px"><div class="section-head"><h2>Os meus envios</h2></div>' +
    '<div class="panel"><table class="data"><thead><tr><th>Faixa</th><th>Género</th><th>Estado</th></tr></thead><tbody>' +
    S.pendingUploads.map(u => '<tr><td>' + u.title + '</td><td>' + u.genre + '</td><td><span class="pill ' + (u.status === 'aprovada' ? 'ok' : u.status === 'rejeitada' ? 'bad' : 'warn') + '">' + u.status + '</span></td></tr>').join('') +
    '</tbody></table></div></div>' : '');
}
function field(label, id, type, ph){
  return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" placeholder="' + ph + '"></div>';
}
function selectField(label, id, opts){
  return '<div class="field"><label for="' + id + '">' + label + '</label><select id="' + id + '">' + opts.map(o => '<option>' + o + '</option>').join('') + '</select></div>';
}

function viewDashboard(){
  if(S.role === 'ouvinte') return roleGate('artista', 'O painel analítico é exclusivo para artistas');
  if(!S.artistProfile) return viewArtistOnboarding();
  const a = ARTISTS[0]; // artista demo: Kalunga MC
  const acc = ARTIST_ACCOUNTS.find(x => x.artistId === a.id) || {};
  const mine = TRACKS.filter(t => t.artistId === a.id);
  const totalRev = ARTIST_REVENUE_SERIES.reduce((s, d) => s + d.v, 0);
  return '' +
  '<div class="eyebrow">Painel do artista · ' + a.name + '</div>' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:22px">A tua contabilidade</h1>' +

  /* Contador financeiro (pendente) vs Histórico */
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:16px" class="dash-cols">' +
    '<div class="panel" style="background:radial-gradient(500px 180px at 90% -30%,var(--gold-soft),transparent 60%);border-color:rgba(242,176,30,.3)">' +
      '<h3 style="color:var(--gold)">◈ Contador financeiro — a receber</h3>' +
      '<div style="font-family:var(--font-display);font-weight:900;font-size:32px;color:var(--gold);margin:6px 0 4px">' + fmtKz(acc.pendValor || 0) + '</div>' +
      '<p style="color:var(--muted);font-size:13px">' + fmtN(acc.pendPlays || 0) + ' plays · ' + fmtN(acc.pendDownloads || 0) + ' downloads pendentes de pagamento</p>' +
      '<p style="color:var(--muted);font-size:12px;margin-top:10px">Pago via ficheiro PSX. Após o pagamento este contador zera; o histórico mantém-se.</p>' +
    '</div>' +
    '<div class="panel">' +
      '<h3>▤ Contador histórico — desde sempre</h3>' +
      '<div style="font-family:var(--font-display);font-weight:900;font-size:32px;margin:6px 0 4px">' + fmtKz(acc.histRevenue || 0) + '</div>' +
      '<p style="color:var(--muted);font-size:13px">' + fmtN(acc.histPlays || 0) + ' plays · ' + fmtN(acc.histDownloads || 0) + ' downloads acumulados</p>' +
      '<p style="color:var(--muted);font-size:12px;margin-top:10px">Nunca reinicia. Total gerado na plataforma desde o primeiro dia.</p>' +
    '</div>' +
  '</div>' +

  '<div class="kpis">' +
    kpi('Ganhos do mês', fmtKz(ARTIST_REVENUE_SERIES[ARTIST_REVENUE_SERIES.length - 1].v), '+18% vs. mês anterior') +
    kpi('Ganhos totais (12 m)', fmtKz(totalRev), '') +
    kpi('Faixas publicadas', String(mine.length + S.pendingUploads.filter(u => u.status === 'aprovada').length), S.pendingUploads.filter(u => u.status === 'em moderação').length + ' em moderação') +
    kpi('Ranking nacional', '#3', '▲ 2 posições', 'red') +
  '</div>' +
  '<div class="panel"><h3>Receita mensal (AKZ)</h3>' + revenueChart(ARTIST_REVENUE_SERIES) + '</div>' +
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px" class="dash-cols">' +
    '<div class="panel"><h3>Top cidades de ouvintes</h3><div class="hbars">' +
      [['Luanda', 100, '512 k'], ['Lisboa', 44, '224 k'], ['Benguela', 31, '158 k'], ['Paris', 18, '92 k'], ['Huambo', 14, '73 k']].map(c =>
        '<div class="hbar"><span>' + c[0] + '</span><div class="hb-track"><div class="hb-fill" style="width:' + c[1] + '%"></div></div><span class="hb-val">' + c[2] + '</span></div>'
      ).join('') + '</div></div>' +
    '<div class="panel"><h3>Dispositivos</h3><div class="hbars">' +
      [['Android', 100, '68%'], ['iOS', 32, '22%'], ['Web', 13, '9%'], ['Desktop', 2, '1%']].map(c =>
        '<div class="hbar"><span>' + c[0] + '</span><div class="hb-track"><div class="hb-fill" style="width:' + c[1] + '%"></div></div><span class="hb-val">' + c[2] + '</span></div>'
      ).join('') + '</div></div>' +
  '</div>' +
  '<div class="panel"><h3>As tuas faixas</h3><table class="data"><thead>' +
    '<tr><th>Faixa</th><th>Plays</th><th>Downloads</th><th>Pago (total)</th><th>Estado</th></tr></thead><tbody>' +
    mine.map(t => '<tr><td><b>' + t.title + '</b></td><td>' + fmtN(t.plays) + '</td><td>' + fmtN(Math.round(t.plays * 0.04)) + '</td><td style="color:var(--gold)">' + fmtKz(t.paidTotal) + '</td><td><span class="pill ok">publicada</span></td></tr>').join('') +
    S.pendingUploads.map(u => '<tr><td><b>' + u.title + '</b></td><td>—</td><td>—</td><td>—</td><td><span class="pill ' + (u.status === 'aprovada' ? 'ok' : u.status === 'rejeitada' ? 'bad' : 'warn') + '">' + u.status + '</span></td></tr>').join('') +
  '</tbody></table></div>';
}

function viewAdmin(){
  if(S.role !== 'admin') return roleGate('admin', 'A administração requer perfil de administrador');
  const totalWallet = 184300000, totalTopups = 96;
  return '' +
  '<div class="eyebrow">Super administração</div>' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:26px">Music AO em tempo real</h1>' +
  '<div class="kpis">' +
    kpi('Artistas', fmtN(12480), '+214 esta semana') +
    kpi('Utilizadores', fmtN(486200), '+8.940 esta semana') +
    kpi('Faixas aprovadas', fmtN(38150), '') +
    kpi('Wallet total em circulação', fmtKz(totalWallet), '', 'gold') +
    kpi('Recargas hoje', fmtKz(2140000), totalTopups + ' operações') +
    kpi('Alertas de fraude 24 h', String(ADMIN_FRAUD.length), 'motor anti-fraude ativo', 'red') +
  '</div>' +
  '<div class="panel"><h3>Fila de moderação · ' + ADMIN_PENDING.filter(p => !p.done).length + ' pendentes</h3>' +
    '<table class="data"><thead><tr><th>Faixa</th><th>Artista</th><th>Género</th><th>Envio</th><th style="text-align:right">Decisão</th></tr></thead><tbody>' +
    ADMIN_PENDING.map(pnd => '<tr id="row-' + pnd.id + '">' +
      '<td><b>' + pnd.title + '</b></td><td>' + pnd.artist + '</td><td>' + pnd.genre + '</td><td style="color:var(--muted)">' + pnd.uploaded + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + (pnd.done ?
        '<span class="pill ' + (pnd.done === 'aprovada' ? 'ok' : 'bad') + '">' + pnd.done + '</span>' :
        '<button class="btn btn-sm btn-ghost" data-mod="ok" data-id="' + pnd.id + '" style="color:var(--ok);border-color:var(--ok)">Aprovar</button> ' +
        '<button class="btn btn-sm btn-ghost" data-mod="no" data-id="' + pnd.id + '" style="color:var(--red);border-color:var(--red)">Rejeitar</button>') +
      '</td></tr>').join('') +
    '</tbody></table></div>' +
  '<div class="panel"><h3>Eventos de fraude (24 h)</h3>' +
    '<table class="data"><thead><tr><th>Tipo</th><th>Alvo</th><th>Score</th><th>Ação</th></tr></thead><tbody>' +
    ADMIN_FRAUD.map(f => '<tr><td><span class="pill bad">' + f.type + '</span></td><td>' + f.target + '</td><td>' + f.score.toFixed(2) + '</td><td style="color:var(--muted)">' + f.action + '</td></tr>').join('') +
    '</tbody></table></div>' +
  '<div class="panel"><h3>Gestão de Recargas — cartões</h3>' +
    '<p style="color:var(--muted);font-size:13px;margin-bottom:14px">Gera lotes de cartões com código único, número de série e QR. Estados: Criado → Disponível → Vendido → Ativado/Utilizado · Bloqueado · Cancelado. Um cartão nunca pode ser usado duas vezes.</p>' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px">' +
      '<div class="field" style="min-width:160px"><label>Valor do cartão</label><select id="lotValor">' + RECARGAS.map(v => '<option value="' + v + '">' + fmtN(v) + ' AKZ — ' + CARD_META[v].nome + '</option>').join('') + '</select></div>' +
      '<div class="field" style="width:110px"><label>Quantidade</label><input id="lotQtd" type="number" value="5" min="1" max="50"></div>' +
      '<div class="field" style="min-width:150px"><label>Agente</label><input id="lotAgente" placeholder="Ex.: Kiosque Maianga"></div>' +
      '<button class="btn btn-gold btn-sm" id="btnGerarLote" style="padding:12px 18px">Gerar lote</button>' +
      (S.cardPool.length ? '<button class="btn btn-ghost btn-sm" id="btnExportCards" style="padding:12px 18px">Exportar CSV</button>' : '') +
    '</div>' +
    (S.cardPool.length ?
      '<table class="data"><thead><tr><th>Código</th><th>Série</th><th>Valor</th><th>Agente</th><th>Criado</th><th>Estado</th></tr></thead><tbody>' +
      S.cardPool.slice(0, 12).map(c =>
        '<tr><td style="font-family:monospace;letter-spacing:.04em">' + c.code + '</td><td style="color:var(--muted)">' + c.serie + '</td><td>' + fmtN(c.valor) + ' Kz</td><td>' + (c.agente || '—') + '</td><td style="color:var(--muted)">' + c.criado + '</td>' +
        '<td><span class="pill ' + (c.estado === 'Utilizado' ? 'ok' : c.estado === 'Bloqueado' ? 'bad' : 'warn') + '">' + c.estado + '</span></td></tr>').join('') +
      '</tbody></table>' + (S.cardPool.length > 12 ? '<p style="color:var(--muted);font-size:12px;margin-top:10px">… e mais ' + (S.cardPool.length - 12) + ' cartões no lote.</p>' : '')
      : '<p style="color:var(--muted);font-size:13px">Ainda não há cartões gerados.</p>') +
  '</div>' +

  '<div class="panel"><h3>Gerador de Pagamentos PSX</h3>' +
    '<p style="color:var(--muted);font-size:13.5px;margin-bottom:16px">Valores pendentes (contador financeiro) a pagar aos artistas: <b style="color:var(--gold)">' + fmtKz(totalPendente()) + '</b> em <b style="color:var(--text)">' + ARTIST_ACCOUNTS.filter(x=>x.pendValor>0).length + '</b> artistas. Seleciona, gera e exporta o ficheiro bancário.</p>' +
    '<a class="btn btn-gold" href="#/pagamentos">Abrir Gerador de Pagamentos PSX →</a></div>';
}

/* ============================================================
   GERADOR DE PAGAMENTOS PSX  (Modelo administrativo)
   Selecionar artistas · período · totais · gerar · exportar · confirmar
   + Reinício Inteligente (zera pendente, mantém histórico)
   ============================================================ */
function totalPendente(){ return ARTIST_ACCOUNTS.reduce((s,a)=>s+a.pendValor,0); }

function viewPagamentos(){
  if(S.role !== 'admin') return roleGate('admin', 'O Gerador de Pagamentos PSX requer perfil de administrador');
  const elegiveis = ARTIST_ACCOUNTS.filter(a => a.pendValor > 0);
  return '' +
  '<div class="eyebrow">Administração · financeiro</div>' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:8px">Gerador de Pagamentos PSX</h1>' +
  '<p style="color:var(--muted);margin-bottom:24px">Débito único da conta da plataforma → múltiplos créditos aos artistas. Só o <b>contador financeiro pendente</b> é pago; o histórico nunca reinicia.</p>' +

  '<div class="panel"><div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-end">' +
    '<div class="field" style="min-width:150px"><label>Período — de</label><input type="date" id="psxFrom" value="2026-06-01"></div>' +
    '<div class="field" style="min-width:150px"><label>Período — até</label><input type="date" id="psxTo" value="2026-06-30"></div>' +
    '<div class="field" style="min-width:150px"><label>Conta de débito</label><select id="psxDebit"><option>Music AO · BIC · AO06.0040…9981</option></select></div>' +
    '<div style="margin-left:auto;text-align:right"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Total selecionado</div>' +
      '<div id="psxTotal" style="font-family:var(--font-display);font-weight:700;font-size:22px;color:var(--gold)">—</div></div>' +
  '</div></div>' +

  '<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
    '<h3 style="margin:0">Artistas com saldo pendente</h3>' +
    '<label style="font-size:13px;color:var(--muted);display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="psxAll" checked> selecionar todos</label></div>' +
    '<table class="data"><thead><tr><th></th><th>Artista</th><th>IBAN</th><th>Banco</th><th style="text-align:right">Plays pend.</th><th style="text-align:right">Downloads pend.</th><th style="text-align:right">Valor a pagar</th></tr></thead><tbody>' +
    elegiveis.map(a => {
      const art = artistOf(a.artistId);
      return '<tr>' +
        '<td><input type="checkbox" class="psxChk" data-id="' + a.artistId + '" data-val="' + a.pendValor + '" checked></td>' +
        '<td><b>' + (art ? art.name : a.titular) + '</b><div style="font-size:11px;color:var(--muted)">' + a.nif + '</div></td>' +
        '<td style="font-size:12px;color:var(--muted)">' + a.iban + '</td>' +
        '<td>' + a.banco + '</td>' +
        '<td style="text-align:right">' + fmtN(a.pendPlays) + '</td>' +
        '<td style="text-align:right">' + fmtN(a.pendDownloads) + '</td>' +
        '<td style="text-align:right;color:var(--gold)"><b>' + fmtKz(a.pendValor) + '</b></td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>' +

  '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
    '<button class="btn btn-ghost" id="psxPreview">Visualizar totais</button>' +
    '<button class="btn btn-gold" id="psxGenerate">Gerar e exportar ficheiro PSX</button>' +
  '</div>' +

  (elegiveis.length === 0 ?
    '<div class="panel" style="margin-top:20px;text-align:center;color:var(--muted)">✓ Não há saldos pendentes. Todos os artistas estão pagos — o contador histórico mantém-se acumulado.</div>' : '');
}

/* ============================================================
   ROUTER
   ============================================================ */
const routes = {
  home: viewHome, explorar: viewExplorar, pesquisa: viewPesquisa,
  artista: viewArtista, wallet: viewWallet, upload: viewUpload,
  dashboard: viewDashboard, admin: viewAdmin, pagamentos: viewPagamentos,
};

function render(){
  const hash = location.hash.replace('#/', '') || 'home';
  const [route, ...params] = hash.split('/');
  const view = routes[route] || viewHome;
  $('#main').innerHTML = view(params);
  document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  window.scrollTo(0, 0);
  bindView(route);
}

/* delegação única de cliques no conteúdo principal */
$('#main').addEventListener('click', e => {
  const play = e.target.closest('[data-play]');
  if(play){ playTrack(play.dataset.play); return; }
  const go = e.target.closest('[data-goto]');
  if(go){ location.hash = go.dataset.goto; return; }
  const fol = e.target.closest('[data-follow]');
  if(fol){
    const id = fol.dataset.follow;
    const i = S.followed.indexOf(id);
    if(i >= 0){ S.followed.splice(i, 1); fol.textContent = '+ Seguir'; }
    else { S.followed.push(id); fol.textContent = 'A seguir ✓'; toast('Estás a seguir <b>' + artistOf(id).name + '</b> — vais receber os novos lançamentos.', 'ok'); }
    persist();
    return;
  }
  const tip = e.target.closest('[data-tip]');
  if(tip){
    const art = artistOf(tip.dataset.tip);
    openModal('<h3>Apoiar ' + art.name + '</h3>' +
      '<p>Envia uma contribuição direta — 100% do valor vai para o artista.</p>' +
      '<div class="packs" style="grid-template-columns:repeat(4,1fr)">' +
        [100, 500, 1000].map((v, i) => '<div class="pack' + (i === 0 ? ' sel' : '') + '" data-tipval="' + v + '"><div class="p-amt">' + fmtN(v) + '</div><div class="p-note">Kz</div></div>').join('') +
        '<div class="pack" data-tipval="custom"><div class="p-amt">Outro</div><div class="p-note">valor</div></div>' +
      '</div>' +
      '<input id="tipCustom" type="number" placeholder="Valor em AKZ" hidden style="width:100%;background:var(--surface2);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:11px 13px;margin-top:8px">' +
      '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
      '<button class="btn btn-gold btn-sm" id="confirmTip">Enviar apoio</button></div>');
    document.querySelectorAll('[data-tipval]').forEach(p => p.addEventListener('click', () => {
      document.querySelectorAll('[data-tipval]').forEach(x => x.classList.remove('sel')); p.classList.add('sel');
      $('#tipCustom').hidden = p.dataset.tipval !== 'custom';
    }));
    $('#confirmTip').addEventListener('click', () => {
      const selP = document.querySelector('[data-tipval].sel');
      const val = selP.dataset.tipval === 'custom' ? (+$('#tipCustom').value || 0) : +selP.dataset.tipval;
      if(val < 50){ toast('Valor mínimo de apoio: 50 AKZ.', 'red'); return; }
      closeModal();
      if(debit(val, 'Apoio ao artista — ' + art.name, 'tip')){
        toast('♥ Enviaste <b>' + fmtN(val) + ' Kz</b> a ' + art.name + '. Obrigado por apoiares a música angolana!', 'ok');
      }
    });
    return;
  }
  const roleBtn = e.target.closest('#main [data-setrole]');
  if(roleBtn){ setRole(roleBtn.dataset.setrole); return; }
  const mod = e.target.closest('[data-mod]');
  if(mod){
    const pnd = ADMIN_PENDING.find(x => x.id === mod.dataset.id);
    if(mod.dataset.mod === 'ok'){ pnd.done = 'aprovada'; toast('<b>' + pnd.title + '</b> aprovada — ' + pnd.artist + ' foi notificado.', 'ok'); render(); }
    else openRejectModal(pnd);
  }
});

function bindView(route){
  const main = $('#main');
  if(route === 'pesquisa'){
    const box = $('#searchBox');
    box.addEventListener('input', () => runSearch(box.value));
    box.focus();
  }
  if(route === 'wallet'){
    main.querySelectorAll('.rcard').forEach(pk => pk.addEventListener('click', () => {
      main.querySelectorAll('.rcard').forEach(x => x.classList.remove('sel')); pk.classList.add('sel');
    }));
    main.querySelectorAll('.method').forEach(m => m.addEventListener('click', () => {
      main.querySelectorAll('.method').forEach(x => x.classList.remove('sel')); m.classList.add('sel');
    }));
    main.querySelectorAll('[data-datamode]').forEach(b => b.addEventListener('click', () => {
      S.dataMode = b.dataset.datamode; persist();
      main.querySelectorAll('[data-datamode]').forEach(x => x.classList.toggle('active', x === b));
      toast('Qualidade de áudio: <b>' + b.textContent + '</b>.', 'ok');
    }));
    const trf = $('#btnTransfer');
    if(trf) trf.addEventListener('click', () => {
      const to = ($('#trfTo').value || '').trim();
      const amt = +$('#trfAmt').value || 0;
      if(!to){ toast('Indica o destinatário.', 'red'); return; }
      if(amt < 50){ toast('Valor mínimo de transferência: 50 AKZ.', 'red'); return; }
      if(amt > S.balance){ toast('Saldo insuficiente para transferir <b>' + fmtN(amt) + ' Kz</b>.', 'red'); return; }
      openModal('<h3>Confirmar transferência</h3>' +
        '<p>Vais enviar <b style="color:var(--gold)">' + fmtN(amt) + ' Kz</b> para <b style="color:var(--text)">' + to + '</b>. Esta operação é imediata e não pode ser revertida.</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-gold btn-sm" id="confirmTrf">Enviar ' + fmtN(amt) + ' Kz</button></div>');
      $('#confirmTrf').addEventListener('click', () => {
        closeModal();
        S.balance -= amt;
        S.txs.unshift({ type:'debit', amount:-amt, desc:'Transferência para ' + to, time: nowStamp() });
        persist(); updateWalletChip();
        toast('Transferência concluída: <b>' + fmtN(amt) + ' Kz</b> enviados para <b>' + to + '</b>. Recibo no histórico.', 'ok');
        render();
      });
    });
    const act = $('#btnActivateCard');
    if(act) act.addEventListener('click', () => {
      const code = ($('#cardCode').value || '').trim().toUpperCase();
      if(!code){ toast('Introduz o código do cartão.', 'red'); return; }
      const card = S.cardPool.find(c => c.code === code);
      if(card && card.estado === 'Disponível'){
        card.estado = 'Utilizado'; card.ativadoEm = nowStamp();
        credit(card.valor, 'Ativação de cartão ' + CARD_META[card.valor].nome + ' (' + code + ')');
        persist();
        toast('<b>' + CARD_META[card.valor].nome + '</b> ativada: <b>+' + fmtN(card.valor) + ' Kz</b> na tua carteira.', 'ok');
        render();
      } else if(card){
        toast('Este cartão já foi utilizado ou está bloqueado (estado: ' + card.estado + '). Cada cartão só pode ser usado uma vez.', 'red');
      } else {
        toast('Código inválido. Verifica o cartão ou contacta o suporte.', 'red');
      }
    });
    $('#btnTopup').addEventListener('click', () => {
      const amt = +main.querySelector('.rcard.sel').dataset.pack;
      const method = main.querySelector('.method.sel').dataset.method;
      openModal('<h3>Recarga de ' + fmtN(amt) + ' Kz</h3>' +
        '<p>Método: <b style="color:var(--text)">' + method + '</b>. Em produção serias redirecionado para o gateway; nesta demo a confirmação chega pelo webhook em segundos.</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-gold btn-sm" id="confirmTopup">Pagar agora</button></div>');
      $('#confirmTopup').addEventListener('click', () => {
        closeModal();
        toast('Recarga iniciada — a aguardar confirmação de <b>' + method + '</b>…');
        setTimeout(() => { credit(amt, 'Recarga ' + method); toast('Recarga confirmada: <b>+' + fmtN(amt) + ' Kz</b> na tua wallet.', 'ok'); if(location.hash.includes('wallet')) render(); }, 1800);
      });
    });
    const bp = $('#btnPremium');
    if(bp) bp.addEventListener('click', () => {
      openModal('<h3>Ativar Plano Premium</h3>' +
        '<p>' + fmtN(PREMIUM_PRICE) + ' Kz por mês · streaming e downloads ilimitados. A subscrição renova automaticamente e podes cancelar a qualquer momento.</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-gold btn-sm" id="confirmPremium">Pagar ' + fmtN(PREMIUM_PRICE) + ' Kz</button></div>');
      $('#confirmPremium').addEventListener('click', () => {
        if(S.balance < PREMIUM_PRICE){
          closeModal();
          toast('Precisas de <b>' + fmtN(PREMIUM_PRICE) + ' Kz</b> em saldo para ativar o Premium. Recarrega primeiro.', 'red');
          return;
        }
        S.balance -= PREMIUM_PRICE;
        const until = new Date(); until.setMonth(until.getMonth() + 1);
        S.premiumUntil = until.toISOString();
        S.dlUsed = 0;   // novo ciclo: renova o limite; downloads não utilizados não acumulam
        S.txs.unshift({ type:'premium', amount:-PREMIUM_PRICE, desc:'Subscrição plano mensal (' + PREMIUM_DL_LIMIT + ' downloads incluídos)', time: nowStamp() });
        persist(); updateWalletChip(); closeModal();
        toast('<b>Plano mensal ativado!</b> Streaming ilimitado + ' + PREMIUM_DL_LIMIT + ' downloads até ' + until.toLocaleDateString('pt-PT') + '.', 'ok');
        render();
      });
    });
    const bc = $('#btnCancelPremium');
    if(bc) bc.addEventListener('click', () => {
      openModal('<h3>Cancelar subscrição Premium?</h3>' +
        '<p>O plano deixa de renovar. Mantém-se ativo até ao fim do período já pago; depois disso voltas ao modelo de carteira (pré-pago).</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Manter Premium</button>' +
        '<button class="btn btn-sm" style="background:var(--red);color:#fff" id="confirmCancel">Cancelar subscrição</button></div>');
      $('#confirmCancel').addEventListener('click', () => {
        S.premiumUntil = null; persist(); closeModal();
        toast('Subscrição Premium cancelada. Voltaste ao modelo de carteira.', 'red');
        render();
      });
    });
  }
  if((route === 'upload' || route === 'dashboard') && S.role !== 'ouvinte' && !S.artistProfile){
    let photoData = null;
    const photoBox = $('#obPhoto'), photoInput = $('#obPhotoInput');
    if(photoBox){
      photoBox.addEventListener('click', () => photoInput.click());
      photoInput.addEventListener('change', () => {
        const f = photoInput.files[0]; if(!f) return;
        const r = new FileReader();
        r.onload = () => { photoData = r.result; photoBox.style.backgroundImage = 'url(' + photoData + ')'; photoBox.style.backgroundSize = 'cover'; photoBox.style.backgroundPosition = 'center'; photoBox.style.border = '2px solid var(--gold)'; photoBox.textContent = ''; };
        r.readAsDataURL(f);
      });
    }
    const biIn = $('#obBI'), ibanIn = $('#obIBAN');
    const liveBI = () => {
      const v = validarBI_AO(biIn.value);
      const m = $('#msgBI');
      if(!biIn.value){ m.textContent = ''; biIn.style.borderColor = ''; return; }
      m.textContent = v.ok ? '✓ BI válido' : v.motivo;
      m.className = 'valid-msg ' + (v.ok ? 'ok' : 'bad');
      biIn.style.borderColor = v.ok ? 'var(--ok)' : 'var(--red)';
    };
    const liveIBAN = () => {
      const v = validarIBAN_AO(ibanIn.value);
      const m = $('#msgIBAN');
      if(!ibanIn.value){ m.textContent = ''; ibanIn.style.borderColor = ''; return; }
      m.textContent = v.ok ? '✓ IBAN válido (checksum confere)' : v.motivo;
      m.className = 'valid-msg ' + (v.ok ? 'ok' : 'bad');
      ibanIn.style.borderColor = v.ok ? 'var(--ok)' : 'var(--red)';
    };
    if(biIn) biIn.addEventListener('input', liveBI);
    if(ibanIn) ibanIn.addEventListener('input', liveIBAN);

    const reg = $('#btnRegisterArtist');
    if(reg) reg.addEventListener('click', () => {
      const nome = ($('#obNome').value || '').trim();
      const bi = validarBI_AO(biIn.value);
      const iban = validarIBAN_AO(ibanIn.value);
      if(!nome){ toast('<b>Nome completo</b> é obrigatório.', 'red'); return; }
      if(!bi.ok){ toast('<b>BI inválido.</b> ' + bi.motivo, 'red'); liveBI(); return; }
      if(!iban.ok){ toast('<b>IBAN inválido.</b> ' + iban.motivo, 'red'); liveIBAN(); return; }
      if(!photoData){ toast('<b>Fotografia</b> é obrigatória.', 'red'); return; }
      if(S.balance < 10000){ toast('Precisas de <b>10.000 Kz</b> para a taxa de inscrição. Recarrega primeiro.', 'red'); location.hash = '#/wallet'; return; }
      S.balance -= 10000;
      S.txs.unshift({ type:'debit', amount:-10000, desc:'Taxa de inscrição de artista', time: nowStamp() });
      S.artistProfile = {
        nome, artistico: ($('#obArtistico').value || '').trim() || nome,
        idade: $('#obIdade').value || '', nif: ($('#obNif').value || '').trim(),
        bi: biIn.value.replace(/\s+/g, '').toUpperCase(),
        iban: fmtIBAN(ibanIn.value), banco: $('#obBanco').value,
        titular: ($('#obTitular').value || '').trim() || nome,
        foto: photoData, verificado: false,
        totalArrecadado: 0, porReceber: 0,   // contadores do artista (privados)
        criadoEm: nowStamp(),
      };
      persist(); updateWalletChip();
      toast('<b>Registo concluído!</b> Identidade e IBAN validados. Já podes publicar música e acompanhar os teus ganhos.', 'ok');
      location.hash = '#/dashboard';
      render();
    });
  }
  if(route === 'upload' && S.role !== 'ouvinte' && S.artistProfile){
    const dz = $('#dropzone');
    let fileName = '';
    const pick = () => { fileName = 'master_' + Date.now() + '.wav'; simulateUpload(fileName); };
    dz.addEventListener('click', pick);
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', e => {
      e.preventDefault(); dz.classList.remove('drag');
      fileName = (e.dataTransfer.files[0] && e.dataTransfer.files[0].name) || 'master.wav';
      simulateUpload(fileName);
    });
    function simulateUpload(name){
      const bar = $('#dzProgress'), fill = $('#dzFill');
      bar.hidden = false; let pct = 0;
      const iv = setInterval(() => {
        pct += 8 + Math.random() * 14;
        if(pct >= 100){ pct = 100; clearInterval(iv);
          $('#dzFile').textContent = '✔ ' + name + ' · validado · antivírus OK · loudness −11,2 LUFS';
        }
        fill.style.width = pct + '%';
      }, 120);
    }
    $('#btnPublish').addEventListener('click', () => {
      const title = $('#upTitle').value.trim();
      if(!title){ toast('<b>Título em falta.</b> Preenche os campos obrigatórios (*).', 'red'); return; }
      if(!fileName){ toast('<b>Falta o ficheiro áudio.</b> Arrasta o teu WAV/FLAC para a zona de upload.', 'red'); return; }
      if(!debit(FEE_UPLOAD, 'Taxa de publicação — ' + title, 'upload')) return;
      S.pendingUploads.unshift({ title, genre: $('#upGenre').value, status: 'em moderação' });
      persist();
      toast('<b>' + title + '</b> enviada para moderação. Taxa de ' + fmtN(FEE_UPLOAD) + ' Kz debitada.', 'ok');
      render();
    });
  }
  if(route === 'admin' && S.role === 'admin'){
    const gl = $('#btnGerarLote');
    if(gl) gl.addEventListener('click', () => {
      const valor = +$('#lotValor').value;
      const qtd = Math.min(50, Math.max(1, +$('#lotQtd').value || 1));
      const agente = $('#lotAgente').value.trim();
      const lote = 'L' + Date.now().toString(36).toUpperCase().slice(-5);
      const rand = n => Array.from({length:n}, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*31)]).join('');
      for(let i = 0; i < qtd; i++){
        S.cardPool.unshift({
          code: 'MAO-' + valor + '-' + rand(4) + '-' + rand(4),
          serie: lote + '-' + String(i + 1).padStart(3, '0'),
          valor, agente, lote,
          criado: nowStamp(),
          estado: 'Disponível',
          pin: rand(6),
        });
      }
      persist();
      toast('Lote <b>' + lote + '</b> gerado: ' + qtd + ' cartões ' + CARD_META[valor].nome + ' (' + fmtN(valor * qtd) + ' Kz de valor facial). Copia um código e testa a ativação na Wallet.', 'ok');
      render();
    });
    const ex = $('#btnExportCards');
    if(ex) ex.addEventListener('click', () => {
      const header = 'CODIGO;PIN;SERIE;LOTE;VALOR;AGENTE;CRIADO;ESTADO;ATIVADO_EM';
      const rows = S.cardPool.map(c => [c.code, c.pin, c.serie, c.lote, c.valor, c.agente || '', c.criado, c.estado, c.ativadoEm || ''].join(';'));
      const blob = new Blob([header + '\n' + rows.join('\n') + '\n'], { type: 'text/csv' });
      const aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(blob);
      aEl.download = 'MUSICAO_cartoes_recarga.csv';
      aEl.click();
      toast('Exportados ' + S.cardPool.length + ' cartões para CSV (pronto para impressão/distribuição).', 'ok');
    });
  }
  if(route === 'pagamentos' && S.role === 'admin'){
    const selectedTotal = () => Array.from(main.querySelectorAll('.psxChk:checked')).reduce((s, c) => s + (+c.dataset.val), 0);
    const refreshTotal = () => { const el2 = $('#psxTotal'); if(el2) el2.textContent = fmtKz(selectedTotal()); };
    refreshTotal();
    main.querySelectorAll('.psxChk').forEach(c => c.addEventListener('change', refreshTotal));
    const all = $('#psxAll');
    if(all) all.addEventListener('change', () => {
      main.querySelectorAll('.psxChk').forEach(c => { c.checked = all.checked; });
      refreshTotal();
    });
    const prev = $('#psxPreview');
    if(prev) prev.addEventListener('click', () => {
      const chosen = Array.from(main.querySelectorAll('.psxChk:checked'));
      openModal('<h3>Totais do pagamento</h3>' +
        '<p>Período 01–30 Jun 2026 · débito único da conta Music AO · ' + chosen.length + ' créditos a artistas.</p>' +
        '<table class="data"><tbody>' +
        '<tr><td>Artistas selecionados</td><td style="text-align:right"><b>' + chosen.length + '</b></td></tr>' +
        '<tr><td>Total a debitar (plataforma)</td><td style="text-align:right;color:var(--gold)"><b>' + fmtKz(selectedTotal()) + '</b></td></tr>' +
        '<tr><td>Moeda</td><td style="text-align:right">AKZ</td></tr>' +
        '</tbody></table>' +
        '<div class="modal-actions"><button class="btn btn-gold btn-sm" onclick="closeModal()">Fechar</button></div>');
    });
    const gen = $('#psxGenerate');
    if(gen) gen.addEventListener('click', () => {
      const chosen = Array.from(main.querySelectorAll('.psxChk:checked')).map(c => c.dataset.id);
      if(chosen.length === 0){ toast('Seleciona pelo menos um artista.', 'red'); return; }
      const total = selectedTotal();
      openModal('<h3>Confirmar geração do ficheiro PSX</h3>' +
        '<p>Vais gerar o pagamento de <b style="color:var(--gold)">' + fmtKz(total) + '</b> para <b>' + chosen.length + '</b> artistas. ' +
        'Após confirmar, os registos passam a <b>PAGO</b> e o contador financeiro pendente é <b>zerado</b> — o histórico mantém-se acumulado. Esta ação é auditada e não pode ser duplicada.</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-gold btn-sm" id="confirmPsx">Confirmar e gerar</button></div>');
      $('#confirmPsx').addEventListener('click', () => {
        closeModal();
        toast('A gerar ficheiro PSX e a calcular checksum…');
        setTimeout(() => {
          const ref = 'MUSICAO-202606';
          const dataHoje = new Date().toISOString().slice(0, 10);
          // cabeçalho + linha de débito único + múltiplos créditos
          let seq = 0;
          const linhas = ARTIST_ACCOUNTS.filter(a => chosen.includes(a.artistId) && a.pendValor > 0).map(a => {
            seq++;
            const art = artistOf(a.artistId);
            return [a.iban.replace(/\s/g, ''), (art ? art.name : a.titular), a.nif, a.pendValor,
                    'Royalties Music AO 06/2026', ref + '-' + String(seq).padStart(4, '0'),
                    dataHoje, 'AKZ', a.banco, seq, 'PAGO'].join(';');
          });
          const header = 'TIPO;IBAN;NOME;NIF;VALOR;DESCRICAO;REFERENCIA;DATA;MOEDA;BANCO;NUM_INTERNO;ESTADO';
          const debito = ['D', 'AO060040000000000000009981', 'MUSIC AO, S.A.', '5417000000',
                          total, 'Débito consolidado royalties 06/2026', ref + '-DEB', dataHoje, 'AKZ', 'BIC', 0, 'PROCESSADO'].join(';');
          const creditos = linhas.map(l => 'C;' + l);
          const conteudo = header + '\n' + debito + '\n' + creditos.join('\n') + '\n';

          // checksum simples (demo)
          let hash = 0; for(let i = 0; i < conteudo.length; i++){ hash = (hash * 31 + conteudo.charCodeAt(i)) >>> 0; }
          const checksum = hash.toString(16).toUpperCase().padStart(8, '0');
          const ficheiro = '# MUSIC AO · Ficheiro PSX · ' + dataHoje + '\n# Registos: ' + seq + ' · Total: ' + total + ' AKZ · Checksum: ' + checksum + '\n' + conteudo;

          const blob = new Blob([ficheiro], { type: 'text/plain' });
          const aEl = document.createElement('a');
          aEl.href = URL.createObjectURL(blob);
          aEl.download = 'PSX_202606_MUSICAO.txt';
          aEl.click();

          // ---- REINÍCIO INTELIGENTE: zerar pendente, manter histórico ----
          ARTIST_ACCOUNTS.forEach(a => {
            if(chosen.includes(a.artistId)){
              a.histPlays     += a.pendPlays;
              a.histDownloads += a.pendDownloads;
              a.histRevenue   += a.pendValor;
              a.pendPlays = 0; a.pendDownloads = 0; a.pendValor = 0;   // zera só o pendente
            }
          });
          toast('<b>PSX_202606_MUSICAO.txt</b> gerado · ' + seq + ' registos · ' + fmtKz(total) + ' · checksum ' + checksum + '. Registos marcados <b>PAGO</b>.', 'ok');
          setTimeout(() => toast('Reinício inteligente aplicado: contador pendente a zero, histórico preservado. Sem risco de pagamento duplicado.', 'ok'), 900);
          render();
        }, 1500);
      });
    });
  }
}

function openRejectModal(pnd){
  openModal('<h3>Rejeitar “' + pnd.title + '”</h3><p>Escolhe o motivo — o artista é notificado automaticamente.</p>' +
    '<div class="field"><select id="rejReason">' +
    ['Qualidade de áudio insuficiente', 'Metadados incompletos ou incorretos', 'Suspeita de violação de direitos de autor', 'Conteúdo viola os termos de serviço'].map(r => '<option>' + r + '</option>').join('') +
    '</select></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
    '<button class="btn btn-red btn-sm" id="confirmRej">Rejeitar faixa</button></div>');
  $('#confirmRej').addEventListener('click', () => {
    const reason = $('#rejReason').value;
    pnd.done = 'rejeitada';
    closeModal();
    toast('<b>' + pnd.title + '</b> rejeitada — “' + reason + '”. ' + pnd.artist + ' foi notificado.', 'red');
    render();
  });
}

/* ---------- role ---------- */
function setRole(r){
  S.role = r; persist();
  document.body.dataset.role = r;
  document.querySelectorAll('[data-setrole]').forEach(b => b.classList.toggle('active', b.dataset.setrole === r));
  toast('Perfil de demonstração: <b>' + r + '</b>.');
  render();
}
document.querySelectorAll('.role-btns [data-setrole]').forEach(b =>
  b.addEventListener('click', () => setRole(b.dataset.setrole)));

/* ---------- hero counter live ---------- */
setInterval(() => {
  const hc = $('#heroCounter');
  if(hc){
    // simula plays a acontecer pela plataforma fora
    const t = TRACKS[Math.floor(Math.random() * TRACKS.length)];
    t.paidTotal += 8;
    hc.textContent = fmtKz(totalPaidAll());
  }
}, 2500);

/* ---------- boot ---------- */
window.addEventListener('hashchange', render);
document.body.dataset.role = S.role;
document.querySelectorAll('.role-btns [data-setrole]').forEach(b => b.classList.toggle('active', b.dataset.setrole === S.role));
updateWalletChip();
render();
