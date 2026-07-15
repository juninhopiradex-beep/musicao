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
  liked: store.get('liked', []),                // ids de faixas com gosto
  playlists: store.get('playlists', [            // playlists do utilizador
    { id:'pl_fav', nome:'Favoritas', tracks:[] },
  ]),
  recent: store.get('recent', []),              // histórico recente (ids)
  authed: store.get('authed', false),           // sessão iniciada (conta criada / login)
  planName: store.get('planName', null),         // 'Semanal' | 'Mensal'
  fraudLog: store.get('fraudLog', []),           // alertas de segurança para admin
  shuffle: false, repeat: false,                 // modos do leitor
  previewMode: false,                            // reprodução atual é preview de 30s?
};
const persist = () => { store.set('role', S.role); store.set('balance', S.balance); store.set('owned', S.owned); store.set('txs', S.txs); store.set('pendingUploads', S.pendingUploads); store.set('followed', S.followed); store.set('premiumUntil', S.premiumUntil); store.set('dlUsed', S.dlUsed); store.set('dataMode', S.dataMode); store.set('cardPool', S.cardPool); store.set('artistProfile', S.artistProfile); store.set('liked', S.liked); store.set('playlists', S.playlists); store.set('recent', S.recent); store.set('authed', S.authed); store.set('planName', S.planName); store.set('fraudLog', S.fraudLog); };
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
const PREMIUM_PRICE = 10000;                  // plano mensal (AKZ) — atualizado
const PLAN_WEEK = 2500, PLAN_MONTH = 10000;  // planos de subscrição
const PLAN_WEEK_DAYS = 7, PLAN_MONTH_DAYS = 30;
const PREVIEW_SEC = 30;                       // escuta gratuita (preview) para não-autenticados
const PREMIUM_DL_LIMIT = 25;                  // downloads incluídos por ciclo mensal
const LOW_BALANCE = 200;                      // limiar de aviso de saldo baixo (AKZ)
const RECARGAS = [500, 1000, 2000];
const CARD_META = {                          // identidade visual dos cartões de recarga
  500:   { nome:'Recarga Essencial', tag:'Para começar a ouvir',                cls:'essencial' },
  1000:  { nome:'Recarga Play',      tag:'Opção económica para o dia a dia',    cls:'play' },
  2000:  { nome:'Recarga Mix',       tag:'Mais música, mais liberdade.',        cls:'max' },
};
const MSG_SEM_SALDO = 'O seu saldo é insuficiente. Faça uma recarga para continuar a ouvir ou descarregar músicas.';
const CHARGE_AFTER_SEC = 5; // demo: cobra aos 5s de escuta paga (30s em produção)

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
  S.recent = [trackId, ...S.recent.filter(id => id !== trackId)].slice(0, 20);
  persist();
  startPlayback();
}
function startPlayback(){
  const t = S.queue[S.qIdx];
  if(!t) return;
  S.previewMode = !S.authed;   // visitante não autenticado → modo preview
  S.isPlaying = true; S.elapsed = 0; S.charged = false;
  AudioEngine.play(t);
  renderPlayerBar(t);
  clearInterval(S.tickTimer);
  S.tickTimer = setInterval(tick, 1000);
  document.querySelectorAll('.trow').forEach(r => r.classList.toggle('playing', r.dataset.tid === t.id));
  if(S.previewMode) toast('Pré-visualização · <b>30s</b> grátis. Cria conta para ouvires na íntegra.');
}
function tick(){
  const t = S.queue[S.qIdx];
  if(!t || !S.isPlaying) return;
  S.elapsed++;

  // ---- MODO PREVIEW: visitante anónimo, corta aos 30s, sem cobrança nem remuneração ----
  if(S.previewMode){
    updateProgress(t, PREVIEW_SEC);
    if(S.elapsed >= PREVIEW_SEC){
      pausePlayback();
      openPreviewGate(t);
    }
    return;
  }

  // ---- REPRODUÇÃO PAGA / SUBSCRIÇÃO ----
  if(!S.charged && S.elapsed >= CHARGE_AFTER_SEC){
    S.charged = true;
    const share = PRICE_STREAM * ARTIST_SHARE;
    if(isPremium()){
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

function openPreviewGate(t){
  openModal('<div style="text-align:center">' +
    '<div style="font-size:34px;margin-bottom:8px">🎧</div>' +
    '<h3>Gostaste do que ouviste?</h3>' +
    '<p>Ouviste os primeiros <b>30 segundos</b> de "' + t.title + '". Para continuares a ouvir na íntegra — e apoiares ' + artistOf(t.artistId).name + ' — cria conta ou inicia sessão.</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px">' +
      '<button class="btn btn-red" id="pgCreate">Criar conta grátis</button>' +
      '<button class="btn btn-ghost" id="pgLogin">Iniciar sessão</button>' +
      '<button class="btn btn-gold" id="pgPlans">Ver planos e recargas</button>' +
    '</div>' +
    '<button class="btn btn-ghost btn-sm" style="margin-top:14px" onclick="closeModal()">Continuar a explorar</button>' +
  '</div>');
  $('#pgCreate').addEventListener('click', () => { closeModal(); doLogin('criada'); });
  $('#pgLogin').addEventListener('click', () => { closeModal(); doLogin('iniciada'); });
  $('#pgPlans').addEventListener('click', () => { closeModal(); doLogin('iniciada'); location.hash = '#/wallet'; });
}
function doLogin(verbo){
  S.authed = true; persist();
  document.body.dataset.authed = 'yes';
  toast('Sessão ' + verbo + '! Bem-vindo à Music AO. Já podes ouvir na íntegra.', 'ok');
  render();
}
function pausePlayback(){
  S.isPlaying = false; AudioEngine.pause();
  $('#eq').classList.remove('on');
  setNpPlayIcon();
}
function resumePlayback(){
  const t = S.queue[S.qIdx]; if(!t) return;
  S.isPlaying = true; AudioEngine.play(t);
  $('#eq').classList.add('on');
  setNpPlayIcon();
}
function nextTrack(){
  if(S.repeat){ startPlayback(); return; }
  if(S.shuffle){
    S.qIdx = Math.floor(Math.random() * S.queue.length);
    startPlayback(); return;
  }
  if(S.qIdx < S.queue.length - 1){ S.qIdx++; startPlayback(); } else pausePlayback();
}
function prevTrack(){ if(S.qIdx > 0){ S.qIdx--; startPlayback(); } }

function renderPlayerBar(t){
  $('#player').hidden = false;
  $('#pCover').style.cssText = coverStyle(t.genre);
  $('#pTitle').textContent = t.title;
  $('#pArtist').textContent = artistOf(t.artistId).name;
  $('#pDur').textContent = fmtDur(t.dur);
  S.isPlaying = true; setNpPlayIcon();
  $('#eq').classList.add('on');
  updateTicker(t);
  const owned = S.owned.includes(t.id);
  const dl = $('#btnDl');
  dl.textContent = owned ? '⭳ adquirida'
    : (isPremium() ? (dlLeft() > 0 ? '⭳ ' + dlLeft() + ' de ' + PREMIUM_DL_LIMIT : '⭳ ' + PRICE_DL + ' Kz')
                   : '⭳ ' + PRICE_DL + ' Kz');
  dl.classList.toggle('owned', owned || (isPremium() && dlLeft() > 0));
}
function syncExpanded(){}
function setNpPlayIcon(){
  const btn = $('#btnPlay'); if(!btn) return;
  const p = btn.querySelector('.ic-play'), q = btn.querySelector('.ic-pause');
  if(p) p.hidden = S.isPlaying;
  if(q) q.hidden = !S.isPlaying;
  if(typeof setFSPlayIcon === 'function') setFSPlayIcon();
}
function updateTicker(t){
  const labels = { economica:'Económica', normal:'Normal', alta:'Alta' };
  const el2 = $('#tickValue'); if(el2) el2.textContent = labels[S.dataMode] || 'Normal';
}
function updateProgress(t, limit){
  const total = limit || t.dur;
  const pct = Math.min(100, S.elapsed / total * 100);
  $('#pTime').textContent = fmtDur(S.elapsed) + (limit ? ' / 0:' + PREVIEW_SEC + ' (preview)' : '');
  $('#pFill').style.width = pct + '%';
  const ff = $('#fsFill'); if(ff && !$('#fsPlayer').hidden){ ff.style.width = pct + '%'; $('#fsTime').textContent = fmtDur(S.elapsed); }
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

/* ---- Leitor em ecrã inteiro ---- */
function syncFS(t){
  if(!t) return;
  const g = genreOf(t.genre);
  $('#fsCover').style.background = 'linear-gradient(135deg,' + g.c1 + ',' + g.c2 + ')';
  $('#fsTitle').textContent = t.title;
  $('#fsArtist').textContent = artistOf(t.artistId).name;
  $('#fsArtist').setAttribute('href', '#/artista/' + t.artistId);
  $('#fsDur').textContent = fmtDur(t.dur);
  $('#fsShuffle').classList.toggle('on', S.shuffle);
  $('#fsRepeat').classList.toggle('on', S.repeat);
  $('#fsFav').classList.toggle('liked', S.liked.includes(t.id));
  setFSPlayIcon();
}
function setFSPlayIcon(){
  const btn = $('#fsPlay'); if(!btn) return;
  const p = btn.querySelector('.ic-play'), q = btn.querySelector('.ic-pause');
  if(p) p.hidden = S.isPlaying;
  if(q) q.hidden = !S.isPlaying;
}
function openFS(){
  const t = S.queue[S.qIdx]; if(!t) return;
  syncFS(t); updateProgress(t);
  // fundo imbondeiro (coloca a imagem em assets/imbondeiro.png ou .jpg);
  // se não existir, o leitor fica só com o preto elegante.
  const bg = $('#fsBg');
  if(bg && !bg.dataset.tried){
    bg.dataset.tried = '1';
    ['assets/imbondeiro.png', 'assets/imbondeiro.jpg', 'assets/imbondeiro.webp'].forEach(src => {
      const img = new Image();
      img.onload = () => { document.documentElement.style.setProperty('--imbondeiro', 'url(' + src + ')'); };
      img.src = src;
    });
  }
  $('#fsPlayer').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeFS(){
  $('#fsPlayer').hidden = true;
  document.body.style.overflow = '';
}
$('#btnFull').addEventListener('click', openFS);
$('#fsClose').addEventListener('click', closeFS);
$('#fsPlay').addEventListener('click', () => { S.isPlaying ? pausePlayback() : resumePlayback(); syncFS(S.queue[S.qIdx]); });
$('#fsNext').addEventListener('click', () => { nextTrack(); });
$('#fsPrev').addEventListener('click', () => { prevTrack(); });
$('#fsShuffle').addEventListener('click', () => { S.shuffle = !S.shuffle; if(S.shuffle) S.repeat = false; syncFS(S.queue[S.qIdx]); toast(S.shuffle ? 'Modo aleatório ligado' : 'Modo aleatório desligado'); });
$('#fsRepeat').addEventListener('click', () => { S.repeat = !S.repeat; if(S.repeat) S.shuffle = false; syncFS(S.queue[S.qIdx]); toast(S.repeat ? 'Repetição ligada' : 'Repetição desligada'); });
$('#fsBar').addEventListener('click', e => {
  const t = S.queue[S.qIdx]; if(!t) return;
  const r = e.currentTarget.getBoundingClientRect();
  S.elapsed = Math.floor((e.clientX - r.left) / r.width * t.dur);
  updateProgress(t);
});
$('#fsFav').addEventListener('click', () => {
  const t = S.queue[S.qIdx]; if(!t) return;
  const i = S.liked.indexOf(t.id);
  if(i >= 0) S.liked.splice(i, 1); else { S.liked.push(t.id); toast('Adicionada às favoritas ♥', 'ok'); }
  persist(); syncFS(t);
});
$('#fsDl').addEventListener('click', () => { const t = S.queue[S.qIdx]; if(t) buyDownload(t.id); });

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
    '<div class="t-title">' + t.title + (t.ai ? ' <span class="ai-badge">IA</span>' : '') + '</div>' +
    '<div class="t-artist">' + a.name + '</div>' +
    '<div class="t-paid">' + fmtN(t.plays) + ' plays</div>' +
    '<button class="play-fab" aria-label="Reproduzir ' + t.title + '">▶</button>' +
  '</div>';
}
function trackRow(t, i){
  const a = artistOf(t.artistId);
  const isLiked = S.liked.includes(t.id);
  return '<div class="trow" data-tid="' + t.id + '" data-play="' + t.id + '">' +
    '<span class="idx">' + String(i + 1).padStart(2, '0') + '</span>' +
    '<div class="mini-cover" style="' + coverStyle(t.genre) + '"></div>' +
    '<div><div class="tt">' + t.title + (t.ai ? ' <span class="ai-badge" title="Contém elementos gerados por IA: ' + t.ai.join(', ') + '">IA</span>' : '') + '</div><div class="ta">' + a.name + '</div></div>' +
    '<span class="tpaid">' + fmtN(t.plays) + ' plays</span>' +
    '<span class="trow-actions">' +
      '<button class="ico-btn' + (isLiked ? ' liked' : '') + '" data-like="' + t.id + '" title="Gosto" aria-label="Gosto">' + (isLiked ? '♥' : '♡') + '</button>' +
      '<button class="ico-btn" data-addpl="' + t.id + '" title="Adicionar a playlist" aria-label="Adicionar a playlist">＋</button>' +
    '</span>' +
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
  '<div class="home-stats">' +
    '<div class="hstat"><div class="hstat-label">Artistas</div><div class="hstat-num">12 480</div><div class="hstat-delta">+214 esta semana</div></div>' +
    '<div class="hstat"><div class="hstat-label">Utilizadores</div><div class="hstat-num">486 200</div><div class="hstat-delta">+8.940 esta semana</div></div>' +
    '<div class="hstat"><div class="hstat-label">Faixas aprovadas</div><div class="hstat-num">38 150</div><div class="hstat-delta">&nbsp;</div></div>' +
  '</div>' +
  '<div class="hero">' +
    '<div class="eyebrow">Plataforma angolana · beta</div>' +
    '<h1 class="h-display">A tua música,<br><span class="accent">o teu dinheiro.</span></h1>' +
    '<p>Cada play paga ao artista, em kwanzas, com transparência total. Ouve, descarrega e apoia quem faz a banda sonora de Angola.</p>' +
    '<div class="hero-actions">' +
      '<a class="btn btn-red" href="#/explorar">Começar a ouvir</a>' +
      '<a class="btn btn-ghost" href="#/upload">Sou artista</a>' +
    '</div>' +
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
    const list = TRACKS.filter(t => t.genre === gid).sort((a, b) => b.plays - a.plays);
    return '<div class="section"><div class="eyebrow">Top Chart · ' + g.name + '</div>' +
      '<h1 class="h-display" style="font-size:32px;margin-bottom:6px">Top ' + g.name + ' 🇦🇴</h1>' +
      '<p style="color:var(--muted);margin-bottom:24px">As faixas mais ouvidas de ' + g.name + ' em Angola, por número de plays.</p>' +
      '<div class="tracklist">' + list.map(trackRow).join('') + '</div></div>';
  }
  return '' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:28px">Explorar</h1>' +
  '<div class="section"><div class="section-head"><h2>Top Charts por estilo</h2><span style="font-size:12px;color:var(--muted)">os mais ouvidos de Angola</span></div>' +
    '<div class="grid grid-genres">' + GENRES.map(g => {
      const top = TRACKS.filter(t => t.genre === g.id).sort((a, b) => b.plays - a.plays)[0];
      return '<div class="chart-card" style="background:linear-gradient(135deg,' + g.c1 + ',' + g.c2 + ')" data-goto="#/explorar/' + g.id + '">' +
        '<div class="chart-badge">TOP ' + g.name.toUpperCase() + '</div>' +
        (top ? '<div class="chart-top">#1 ' + top.title + '<span>' + fmtN(top.plays) + ' plays</span></div>' : '') +
      '</div>';
    }).join('') + '</div></div>' +
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
        '<a class="btn btn-ghost btn-sm" href="#/link/' + a.id + '">↗ Página / QR</a>' +
      '</div>' +
      socialIcons(a.socials || (S.artistProfile && S.artistProfile.artistico === a.name ? S.artistProfile.socials : null)) +
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

  /* ---- Modelo B — Subscrição (Semanal / Mensal) ---- */
  '<div class="section"><div class="section-head"><h2>Planos de subscrição</h2><span style="font-size:12px;color:var(--muted)">Modelo B</span></div>' +
    (premium ?
      '<div class="panel" style="background:radial-gradient(600px 200px at 90% -30%,var(--gold-soft),transparent 60%),var(--surface);border-color:rgba(242,176,30,.3)">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:200px">' +
            '<div style="font-family:var(--font-display);font-weight:700;font-size:20px">' + (S.planName || 'Plano') + ' ativo</div>' +
            '<div style="font-size:13px;color:var(--muted);margin-top:6px">Streaming ilimitado · ' + PREMIUM_DL_LIMIT + ' downloads por ciclo</div>' +
            '<div style="font-size:13px;margin-top:10px">Downloads utilizados: <b>' + S.dlUsed + ' de ' + PREMIUM_DL_LIMIT + '</b> · Disponíveis: <b style="color:var(--gold)">' + dlLeft() + '</b></div>' +
          '</div>' +
          '<div style="text-align:right">' +
            '<div class="pill ' + (premiumDias <= 2 ? 'warn' : 'ok') + '" style="margin-bottom:10px">Faltam ' + premiumDias + ' dias · renova em ' + renewDate() + '</div>' +
            (premiumDias <= 2 ? '<div style="font-size:12px;color:var(--red);margin-bottom:10px">⚠ A tua subscrição está quase a expirar. Renova para não perder o acesso premium.</div>' : '') +
            '<br><button class="btn btn-ghost btn-sm" id="btnCancelPremium" style="border-color:var(--red);color:var(--red)">Cancelar renovação</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    :
      '<div class="plan-grid">' +
        '<div class="plan-card" data-plan="week">' +
          '<div class="plan-name">Plano Semanal</div>' +
          '<div class="plan-price">' + fmtN(PLAN_WEEK) + '<span> AKZ</span></div>' +
          '<div class="plan-per">por ' + PLAN_WEEK_DAYS + ' dias</div>' +
          '<ul class="plan-feats"><li>✓ Streaming ilimitado 7 dias</li><li>✓ ' + PREMIUM_DL_LIMIT + ' downloads incluídos</li><li>✓ Ideal para experimentar</li></ul>' +
          '<button class="btn btn-ghost btn-sm plan-btn" data-plan="week">Subscrever semanal</button>' +
        '</div>' +
        '<div class="plan-card featured" data-plan="month">' +
          '<div class="plan-badge">Mais popular</div>' +
          '<div class="plan-name">Plano Mensal</div>' +
          '<div class="plan-price">' + fmtN(PLAN_MONTH) + '<span> AKZ</span></div>' +
          '<div class="plan-per">por ' + PLAN_MONTH_DAYS + ' dias</div>' +
          '<ul class="plan-feats"><li>✓ Streaming ilimitado 30 dias</li><li>✓ ' + PREMIUM_DL_LIMIT + ' downloads incluídos</li><li>✓ Melhor valor por dia</li></ul>' +
          '<button class="btn btn-gold btn-sm plan-btn" data-plan="month">Subscrever mensal</button>' +
        '</div>' +
      '</div>') +
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
  const vagas = FOUNDER_LIMIT - FOUNDER_COUNT;
  const founder = vagas > 0;
  return '' +
  '<div class="eyebrow">Portal do artista · registo</div>' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:8px">Cria o teu perfil de artista</h1>' +
  '<p style="color:var(--muted);margin-bottom:20px">Antes de publicares música, precisamos de validar a tua identidade e a tua conta bancária — é assim que garantimos que recebes os teus pagamentos. Os campos com * são obrigatórios.</p>' +

  (founder ?
    '<div class="founder-banner">' +
      '<div class="founder-badge">★ ARTISTA FUNDADOR</div>' +
      '<div style="flex:1">' +
        '<div style="font-family:var(--font-display);font-weight:700;font-size:17px;margin-bottom:4px">Inscrição gratuita para os primeiros ' + FOUNDER_LIMIT + ' artistas</div>' +
        '<div style="font-size:13px;color:var(--muted)">Sem taxa de inscrição (10.000 Kz) <b style="color:var(--gold)">e 1 mês de plano Premium oferecido</b>. Faz parte dos fundadores da Music AO.</div>' +
      '</div>' +
      '<div style="text-align:center;min-width:96px">' +
        '<div style="font-family:var(--font-display);font-weight:900;font-size:30px;color:var(--gold);line-height:1">' + vagas + '</div>' +
        '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em">vagas restantes</div>' +
        '<div class="founder-track"><div class="founder-fill" style="width:' + (FOUNDER_COUNT / FOUNDER_LIMIT * 100) + '%"></div></div>' +
      '</div>' +
    '</div>' : '') +

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
  '<h3 style="margin-top:20px">Redes sociais <span style="font-size:12px;color:var(--muted);font-weight:400">(opcional)</span></h3>' +
  '<div class="form-grid">' +
    field('Facebook', 'obFacebook', 'text', 'https://facebook.com/...') +
    field('Instagram', 'obInstagram', 'text', 'https://instagram.com/...') +
    field('TikTok', 'obTiktok', 'text', 'https://tiktok.com/@...') +
    field('YouTube', 'obYoutube', 'text', 'https://youtube.com/@...') +
    field('LinkedIn', 'obLinkedin', 'text', 'https://linkedin.com/in/...') +
  '</div>' +
  (founder ?
    '<div class="fee-note" style="margin-top:20px;background:var(--gold-soft);border-color:rgba(242,176,30,.3)">★ Como <b>Artista Fundador</b>, a tua inscrição é <b>gratuita</b> e recebes <b>1 mês de Premium</b>. Concluis o registo sem qualquer débito.</div>' +
    '<button class="btn btn-gold" id="btnRegisterArtist" style="margin-top:6px">Concluir registo grátis (Fundador)</button>' :
    '<div class="fee-note" style="margin-top:20px">◆ Taxa de inscrição única: <b>' + fmtN(10000) + ' Kz</b> — debitada da tua wallet. Saldo atual: <b>' + fmtKz(S.balance) + '</b>. Após validação, ficas elegível para receber pagamentos.</div>' +
    '<button class="btn btn-red" id="btnRegisterArtist" style="margin-top:6px">Concluir registo e pagar ' + fmtN(10000) + ' Kz</button>') +
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
  '<div class="ai-declare" style="margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--surface2)">' +
    '<div style="font-weight:600;font-size:13.5px;margin-bottom:10px">Declaração de uso de Inteligência Artificial</div>' +
    '<p style="color:var(--muted);font-size:12.5px;margin-bottom:12px">A transparência é obrigatória. Indica se esta faixa usou IA — voz, instrumentação ou masterização. A declaração falsa pode levar à remoção do conteúdo.</p>' +
    '<label style="display:flex;gap:10px;align-items:center;font-size:13.5px;cursor:pointer;margin-bottom:8px"><input type="checkbox" id="upAI"> Esta faixa usou geração por IA</label>' +
    '<div id="upAIType" hidden style="display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);padding-left:26px">' +
      '<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" class="aiKind" value="Voz"> Voz</label>' +
      '<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" class="aiKind" value="Instrumentação"> Instrumentação</label>' +
      '<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" class="aiKind" value="Masterização"> Masterização</label>' +
      '<label style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" class="aiKind" value="Letra"> Letra</label>' +
    '</div>' +
  '</div>' +
  '</div>' +
  '<div class="fee-note">◆ Taxa de publicação: <b>' + fmtN(FEE_UPLOAD) + ' Kz</b> — debitada da tua wallet no envio. Saldo atual: <b>' + fmtKz(S.balance) + '</b>. A faixa entra em moderação e ficas notificado da decisão.</div>' +
  '<button class="btn btn-red" id="btnPublish">Publicar e pagar ' + fmtN(FEE_UPLOAD) + ' Kz</button>' +
  (S.pendingUploads.length ?
    '<div class="section" style="margin-top:40px"><div class="section-head"><h2>Os meus envios</h2></div>' +
    '<div class="panel"><table class="data"><thead><tr><th>Faixa</th><th>Género</th><th>Estado</th></tr></thead><tbody>' +
    S.pendingUploads.map(u => '<tr><td>' + u.title + '</td><td>' + u.genre + '</td><td>' + statusPill(u.status) + (u.flagged ? ' <span class="ai-badge" style="color:var(--red);border-color:var(--red);background:rgba(224,18,44,.1)">⚠</span>' : '') + '</td></tr>').join('') +
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

  /* Totais da plataforma */
  '<div class="totals-grid">' +
    '<div class="total-card"><div class="total-ico">♫</div><div class="total-num">' + fmtN(TRACKS.length) + '</div><div class="total-lbl">Músicas na plataforma</div></div>' +
    '<div class="total-card"><div class="total-ico">🎤</div><div class="total-num">' + fmtN(ARTISTS.length) + '</div><div class="total-lbl">Artistas registados</div></div>' +
    '<div class="total-card"><div class="total-ico">≣</div><div class="total-num">' + fmtN(S.playlists.length) + '</div><div class="total-lbl">Playlists criadas</div></div>' +
    '<div class="total-card"><div class="total-ico">▲</div><div class="total-num">' + fmtN(mine.length + S.pendingUploads.length) + '</div><div class="total-lbl">As tuas faixas</div></div>' +
  '</div>' +

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
    kpi('Faixas publicadas', String(mine.length + S.pendingUploads.filter(u => u.status === 'aprovada').length), S.pendingUploads.filter(u => ['Em Validação','Em Análise de Direitos','Em Upload','em moderação'].includes(u.status)).length + ' em análise') +
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
    S.pendingUploads.map(u => '<tr><td><b>' + u.title + '</b></td><td>—</td><td>—</td><td>—</td><td>' + statusPill(u.status) + '</td></tr>').join('') +
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
  (S.fraudLog && S.fraudLog.length ?
    '<div class="panel" style="border-color:rgba(224,18,44,.3)"><h3 style="color:var(--red)">⚠ Alertas de segurança de uploads</h3>' +
    '<p style="color:var(--muted);font-size:13px;margin-bottom:12px">Deteções automáticas em tempo real. Evidências e logs guardados para auditoria.</p>' +
    '<table class="data"><thead><tr><th>Tipo</th><th>Faixa</th><th>Artista</th><th>Quando</th><th>IP</th></tr></thead><tbody>' +
    S.fraudLog.slice(0, 10).map(a => '<tr><td><span class="pill bad">' + a.tipo + '</span></td><td>' + a.faixa + '</td><td>' + a.artista + '</td><td style="color:var(--muted)">' + a.quando + '</td><td style="color:var(--muted);font-family:monospace">' + a.ip + '</td></tr>').join('') +
    '</tbody></table></div>' : '') +
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
    '<button class="btn btn-ghost" id="psxCsv">Exportar CSV</button>' +
    '<button class="btn btn-ghost" id="psxXls">Exportar Excel</button>' +
    '<button class="btn btn-ghost" id="psxPdf">Exportar PDF</button>' +
  '</div>' +

  (elegiveis.length === 0 ?
    '<div class="panel" style="margin-top:20px;text-align:center;color:var(--muted)">✓ Não há saldos pendentes. Todos os artistas estão pagos — o contador histórico mantém-se acumulado.</div>' : '');
}

/* ============================================================
   ROUTER
   ============================================================ */
/* ============================================================
   BIBLIOTECA DO OUVINTE — favoritos, playlists, downloads, recentes
   ============================================================ */
function viewBiblioteca(){
  const likedTracks = S.liked.map(id => TRACKS.find(t => t.id === id)).filter(Boolean);
  const ownedTracks = S.owned.map(id => TRACKS.find(t => t.id === id)).filter(Boolean);
  const recentTracks = S.recent.map(id => TRACKS.find(t => t.id === id)).filter(Boolean);
  return '' +
  '<h1 class="h-display" style="font-size:30px;margin-bottom:8px">A minha biblioteca</h1>' +
  '<p style="color:var(--muted);margin-bottom:26px">Tudo o que gostas, guardas e descarregas — num só lugar.</p>' +

  '<div class="section"><div class="section-head"><h2>As minhas playlists</h2>' +
    '<button class="btn btn-ghost btn-sm" id="btnNewPlaylist">+ Nova playlist</button></div>' +
    '<div class="grid grid-genres">' + S.playlists.map(pl =>
      '<div class="card-genre" style="background:linear-gradient(135deg,#2b2b38,#14141c)" data-goto="#/playlist/' + pl.id + '">' +
        pl.nome + '<span style="position:absolute;bottom:10px;right:14px;font-size:11px;opacity:.7;font-family:var(--font-body)">' + pl.tracks.length + ' faixas</span></div>'
    ).join('') + '</div></div>' +

  (recentTracks.length ? '<div class="section"><div class="section-head"><h2>Ouvidas recentemente</h2></div>' +
    '<div class="tracklist">' + recentTracks.slice(0, 6).map(trackRow).join('') + '</div></div>' : '') +

  '<div class="section"><div class="section-head"><h2>Favoritas</h2></div>' +
    (likedTracks.length ? '<div class="tracklist">' + likedTracks.map(trackRow).join('') + '</div>'
      : '<div class="panel" style="color:var(--muted);text-align:center;padding:32px">Ainda não tens favoritas. Toca no ♥ de uma faixa para a guardares aqui.</div>') + '</div>' +

  '<div class="section"><div class="section-head"><h2>Downloads offline</h2></div>' +
    (ownedTracks.length ? '<div class="tracklist">' + ownedTracks.map(trackRow).join('') + '</div>'
      : '<div class="panel" style="color:var(--muted);text-align:center;padding:32px">Ainda não descarregaste nenhuma faixa.</div>') + '</div>';
}

function viewPlaylist(params){
  const pl = S.playlists.find(p => p.id === params[0]);
  if(!pl) return '<p>Playlist não encontrada.</p>';
  const tracks = pl.tracks.map(id => TRACKS.find(t => t.id === id)).filter(Boolean);
  return '' +
  '<div class="eyebrow">Playlist</div>' +
  '<h1 class="h-display" style="font-size:32px;margin-bottom:6px">' + pl.nome + '</h1>' +
  '<p style="color:var(--muted);margin-bottom:22px">' + tracks.length + ' faixas' + (pl.id !== 'pl_fav' ? ' · <a href="#" data-delpl="' + pl.id + '" style="color:var(--red)">eliminar playlist</a>' : '') + '</p>' +
  (tracks.length ? '<div class="tracklist">' + tracks.map(trackRow).join('') + '</div>'
    : '<div class="panel" style="color:var(--muted);text-align:center;padding:32px">Playlist vazia. Adiciona faixas pelo menu ⋯ de cada música.</div>');
}

/* ============================================================
   LANDING PAGE PÚBLICA DO ARTISTA — link único + QR partilhável
   ============================================================ */
function viewLink(params){
  const a = artistOf(params[0]);
  if(!a) return '<p>Artista não encontrado.</p>';
  const list = TRACKS.filter(t => t.artistId === a.id);
  const g = genreOf(a.genre);
  const url = 'musicao.ao/' + a.id;
  return '' +
  '<div style="max-width:440px;margin:0 auto">' +
    '<div style="text-align:center;padding:32px 24px;border-radius:22px;border:1px solid var(--line);background:radial-gradient(500px 240px at 50% -10%,' + g.c1 + '44,transparent 60%),var(--surface)">' +
      '<div class="avatar" style="' + avatarStyle(a) + ';width:120px;height:120px;font-size:36px;margin:0 auto 16px">' + initials(a.name) + '</div>' +
      '<h1 class="h-display" style="font-size:26px">' + a.name + (a.verified ? ' <span style="color:var(--gold)">✔</span>' : '') + '</h1>' +
      '<p style="color:var(--muted);font-size:13px;margin:6px 0 20px">' + g.name + ' · ' + a.province + ' · Angola</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
        (list.length ? '<button class="btn btn-red" data-play="' + list[0].id + '">▶ Ouvir agora</button>' : '') +
        '<button class="btn btn-ghost" data-follow="' + a.id + '">+ Seguir</button>' +
        '<button class="btn btn-gold" data-tip="' + a.id + '">♥ Apoiar o artista</button>' +
      '</div>' +
      '<div style="margin-top:24px;display:flex;gap:20px;align-items:center;justify-content:center">' +
        '<div id="qrBox" style="width:96px;height:96px;background:#fff;border-radius:10px;padding:6px"></div>' +
        '<div style="text-align:left"><div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em">Link único</div>' +
          '<div style="font-weight:700;font-size:14px">' + url + '</div>' +
          '<button class="btn btn-ghost btn-sm" id="btnCopyLink" style="margin-top:8px">Copiar link</button></div>' +
      '</div>' +
    '</div>' +
    '<div class="section" style="margin-top:24px"><div class="section-head"><h2>Faixas</h2></div>' +
      '<div class="tracklist">' + list.slice(0, 5).map(trackRow).join('') + '</div></div>' +
  '</div>';
}

/* QR decorativo determinístico (padrão estável a partir do texto).
   Para produção usar uma lib de QR real; aqui basta a leitura visual. */
function drawQR(box, text){
  const N = 21, cell = 84 / N;
  const cv = document.createElement('canvas');
  cv.width = 84; cv.height = 84; cv.style.width = '100%'; cv.style.height = '100%';
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 84, 84);
  ctx.fillStyle = '#0B0B0F';
  // hash do texto → grelha pseudo-aleatória estável
  let seed = 0; for(let i = 0; i < text.length; i++) seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const finder = (ox, oy) => {
    ctx.fillRect(ox * cell, oy * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = '#fff'; ctx.fillRect((ox + 1) * cell, (oy + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = '#0B0B0F'; ctx.fillRect((ox + 2) * cell, (oy + 2) * cell, 3 * cell, 3 * cell);
  };
  for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
    const inFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    if(inFinder) continue;
    if(rnd() > 0.55) ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  box.innerHTML = ''; box.appendChild(cv);
}

/* ============================================================
   CANAL DE VÍDEOS — placeholder extensível para videoclipes
   ============================================================ */
function viewVideos(){
  return '' +
  '<div class="videos-hero">' +
    '<div class="videos-emoji">🎬</div>' +
    '<h1 class="h-display" style="font-size:40px;margin-bottom:10px">Canal de Vídeos</h1>' +
    '<p style="font-size:18px;color:var(--gold);font-weight:600;margin-bottom:8px">Brevemente disponível.</p>' +
    '<p style="color:var(--muted);max-width:440px;margin:0 auto 26px">Videoclipes, sessões ao vivo e conteúdo visual dos teus artistas angolanos favoritos — tudo num só sítio. Estamos a preparar algo especial.</p>' +
    '<div class="countdown" id="vidCountdown">' +
      '<div class="cd-box"><span id="cdD">--</span><label>dias</label></div>' +
      '<div class="cd-box"><span id="cdH">--</span><label>horas</label></div>' +
      '<div class="cd-box"><span id="cdM">--</span><label>min</label></div>' +
      '<div class="cd-box"><span id="cdS">--</span><label>seg</label></div>' +
    '</div>' +
    '<button class="btn btn-gold" id="btnNotifyVideo" style="margin-top:26px">🔔 Quero ser avisado</button>' +
  '</div>';
}

function statusPill(status){
  const map = {
    'Em Upload': 'warn', 'Em Validação': 'warn', 'Em Análise de Direitos': 'warn',
    'Aprovada': 'ok', 'Publicada': 'ok',
    'Rejeitada': 'bad', 'Suspensa': 'bad',
    // compat. legados
    'em moderação': 'warn', 'aprovada': 'ok', 'rejeitada': 'bad',
  };
  return '<span class="pill ' + (map[status] || 'warn') + '">' + status + '</span>';
}

function socialIcons(socials){
  if(!socials) return '';
  const defs = [
    ['facebook', 'f', '#1877F2'], ['instagram', '◉', '#E4405F'], ['tiktok', '♪', '#000000'],
    ['youtube', '▶', '#FF0000'], ['linkedin', 'in', '#0A66C2'],
  ];
  const links = defs.filter(([k]) => socials[k]).map(([k, ico, col]) =>
    '<a href="' + socials[k] + '" target="_blank" rel="noopener" class="social-ico" style="--sc:' + col + '" title="' + k + '">' + ico + '</a>'
  ).join('');
  return links ? '<div class="social-row">' + links + '</div>' : '';
}

const routes = {
  home: viewHome, explorar: viewExplorar, pesquisa: viewPesquisa,
  artista: viewArtista, wallet: viewWallet, upload: viewUpload,
  dashboard: viewDashboard, admin: viewAdmin, pagamentos: viewPagamentos,
  biblioteca: viewBiblioteca, playlist: viewPlaylist, link: viewLink, videos: viewVideos,
};

function render(){
  const hash = location.hash.replace('#/', '') || 'home';
  const [route, ...params] = hash.split('/');
  const view = routes[route] || viewHome;
  $('#main').innerHTML = view(params);
  document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === route));
  window.scrollTo(0, 0);
  bindView(route, params);
}

/* delegação única de cliques no conteúdo principal */
$('#main').addEventListener('click', e => {
  // ações que vivem dentro de uma row clicável têm de ser verificadas primeiro
  const like = e.target.closest('[data-like]');
  if(like){
    const id = like.dataset.like;
    const i = S.liked.indexOf(id);
    if(i >= 0){ S.liked.splice(i, 1); }
    else { S.liked.push(id); toast('Adicionada às favoritas ♥', 'ok'); }
    persist(); render();
    return;
  }
  const addpl = e.target.closest('[data-addpl]');
  if(addpl){
    const tid = addpl.dataset.addpl;
    openModal('<h3>Adicionar a playlist</h3><p>Escolhe onde guardar esta faixa.</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      S.playlists.map(pl => '<button class="btn btn-ghost btn-sm" data-plpick="' + pl.id + '" style="justify-content:flex-start">' + pl.nome + ' <span style="color:var(--muted);margin-left:auto">' + pl.tracks.length + '</span></button>').join('') +
      '</div>' +
      '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Fechar</button></div>');
    document.querySelectorAll('[data-plpick]').forEach(btn => btn.addEventListener('click', () => {
      const pl = S.playlists.find(p => p.id === btn.dataset.plpick);
      if(!pl.tracks.includes(tid)){ pl.tracks.push(tid); persist(); toast('Adicionada a <b>' + pl.nome + '</b>.', 'ok'); }
      else toast('Já está em ' + pl.nome + '.');
      closeModal();
    }));
    return;
  }
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
  const delpl = e.target.closest('[data-delpl]');
  if(delpl){
    e.preventDefault();
    S.playlists = S.playlists.filter(p => p.id !== delpl.dataset.delpl);
    persist(); toast('Playlist eliminada.', 'red'); location.hash = '#/biblioteca';
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

function bindView(route, params){
  const main = $('#main');
  if(route === 'videos'){
    const target = new Date(); target.setDate(target.getDate() + 45); // lançamento em ~45 dias
    const cd = () => {
      const diff = target - new Date();
      if(diff <= 0) return;
      const d = Math.floor(diff / 86400000), h = Math.floor(diff / 3600000) % 24,
            m = Math.floor(diff / 60000) % 60, s = Math.floor(diff / 1000) % 60;
      const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = String(v).padStart(2, '0'); };
      set('cdD', d); set('cdH', h); set('cdM', m); set('cdS', s);
    };
    cd(); clearInterval(S.vidTimer); S.vidTimer = setInterval(cd, 1000);
    const bn = $('#btnNotifyVideo');
    if(bn) bn.addEventListener('click', () => {
      toast('✓ Vais ser avisado assim que o Canal de Vídeos abrir. Obrigado pelo interesse!', 'ok');
      bn.textContent = '✓ Estás na lista'; bn.disabled = true;
    });
  }
  if(route === 'biblioteca'){
    const np = $('#btnNewPlaylist');
    if(np) np.addEventListener('click', () => {
      openModal('<h3>Nova playlist</h3><div class="field"><label>Nome</label><input id="plName" placeholder="Ex.: Treino, Festa, Viagem"></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-gold btn-sm" id="createPl">Criar</button></div>');
      $('#createPl').addEventListener('click', () => {
        const nome = ($('#plName').value || '').trim();
        if(!nome){ toast('Dá um nome à playlist.', 'red'); return; }
        S.playlists.push({ id:'pl_' + Date.now().toString(36), nome, tracks:[] });
        persist(); closeModal(); toast('Playlist <b>' + nome + '</b> criada.', 'ok'); render();
      });
    });
  }
  if(route === 'link'){
    const qr = $('#qrBox');
    if(qr) drawQR(qr, 'https://musicao.ao/' + params[0]);
    const cp = $('#btnCopyLink');
    if(cp) cp.addEventListener('click', () => {
      const url = 'https://musicao.ao/' + params[0];
      if(navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Link copiado! Partilha onde quiseres.', 'ok')).catch(() => toast('Link: ' + url));
      else toast('Link: ' + url);
    });
  }
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
    main.querySelectorAll('.plan-btn').forEach(bp => bp.addEventListener('click', () => {
      const plan = bp.dataset.plan;
      const isWeek = plan === 'week';
      const preco = isWeek ? PLAN_WEEK : PLAN_MONTH;
      const dias = isWeek ? PLAN_WEEK_DAYS : PLAN_MONTH_DAYS;
      const nome = isWeek ? 'Semanal' : 'Mensal';
      openModal('<h3>Subscrever Plano ' + nome + '</h3>' +
        '<p><b>' + fmtN(preco) + ' AKZ</b> · válido por <b>' + dias + ' dias</b>. Streaming ilimitado e ' + PREMIUM_DL_LIMIT + ' downloads incluídos. Renova só quando pagares de novo.</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-gold btn-sm" id="confirmPlan">Pagar ' + fmtN(preco) + ' AKZ</button></div>');
      $('#confirmPlan').addEventListener('click', () => {
        if(S.balance < preco){
          closeModal();
          toast('Precisas de <b>' + fmtN(preco) + ' AKZ</b> em saldo. Recarrega primeiro.', 'red');
          return;
        }
        S.balance -= preco;
        const until = new Date(); until.setDate(until.getDate() + dias);
        S.premiumUntil = until.toISOString();
        S.planName = nome; S.dlUsed = 0;
        S.txs.unshift({ type:'premium', amount:-preco, desc:'Subscrição Plano ' + nome + ' (' + dias + ' dias)', time: nowStamp() });
        persist(); updateWalletChip(); closeModal();
        toast('<b>Plano ' + nome + ' ativado!</b> Válido até ' + until.toLocaleDateString('pt-PT') + '.', 'ok');
        render();
      });
    }));
    const bc = $('#btnCancelPremium');
    if(bc) bc.addEventListener('click', () => {
      openModal('<h3>Cancelar renovação?</h3>' +
        '<p>O plano deixa de renovar. Mantém-se ativo até ao fim do período já pago; depois disso voltas ao modelo de carteira (pré-pago).</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Manter plano</button>' +
        '<button class="btn btn-sm" style="background:var(--red);color:#fff" id="confirmCancel">Cancelar renovação</button></div>');
      $('#confirmCancel').addEventListener('click', () => {
        S.premiumUntil = null; S.planName = null; persist(); closeModal();
        toast('Renovação cancelada. Voltaste ao modelo de carteira.', 'red');
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
      const isFounder = (FOUNDER_LIMIT - FOUNDER_COUNT) > 0;
      if(!isFounder && S.balance < 10000){ toast('Precisas de <b>10.000 Kz</b> para a taxa de inscrição. Recarrega primeiro.', 'red'); location.hash = '#/wallet'; return; }
      if(!isFounder){
        S.balance -= 10000;
        S.txs.unshift({ type:'debit', amount:-10000, desc:'Taxa de inscrição de artista', time: nowStamp() });
      } else {
        // Artista Fundador: inscrição grátis + 1 mês de Premium oferecido
        const until = new Date(); until.setMonth(until.getMonth() + 1);
        S.premiumUntil = until.toISOString(); S.dlUsed = 0;
        S.txs.unshift({ type:'premium', amount:0, desc:'Artista Fundador — inscrição grátis + Premium oferecido (1 mês)', time: nowStamp() });
      }
      // ---- Redes sociais (opcional) com validação de URL ----
      const validURL = (u) => !u || /^https?:\/\/.+\..+/.test(u);
      const socials = {
        facebook: ($('#obFacebook').value || '').trim(),
        instagram: ($('#obInstagram').value || '').trim(),
        tiktok: ($('#obTiktok').value || '').trim(),
        youtube: ($('#obYoutube').value || '').trim(),
        linkedin: ($('#obLinkedin').value || '').trim(),
      };
      for(const [k, v] of Object.entries(socials)){
        if(v && !validURL(v)){ toast('O link de <b>' + k + '</b> não é um URL válido (deve começar por http).', 'red'); return; }
      }
      S.artistProfile = {
        nome, artistico: ($('#obArtistico').value || '').trim() || nome,
        idade: $('#obIdade').value || '', nif: ($('#obNif').value || '').trim(),
        bi: biIn.value.replace(/\s+/g, '').toUpperCase(),
        iban: fmtIBAN(ibanIn.value), banco: $('#obBanco').value,
        titular: ($('#obTitular').value || '').trim() || nome,
        foto: photoData, verificado: false, founder: isFounder,
        socials,
        totalArrecadado: 0, porReceber: 0,   // contadores do artista (privados)
        criadoEm: nowStamp(),
      };
      persist(); updateWalletChip();
      toast(isFounder
        ? '<b>Bem-vindo, Artista Fundador!</b> Inscrição gratuita concluída + 1 mês de Premium oferecido. Já podes publicar.'
        : '<b>Registo concluído!</b> Identidade e IBAN validados. Já podes publicar música e acompanhar os teus ganhos.', 'ok');
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
    const aiChk = $('#upAI');
    if(aiChk) aiChk.addEventListener('change', () => { $('#upAIType').hidden = !aiChk.checked; });
    $('#btnPublish').addEventListener('click', () => {
      const title = $('#upTitle').value.trim();
      const upArtist = ($('#upArtist').value || '').trim();
      if(!title){ toast('<b>Título em falta.</b> Preenche os campos obrigatórios (*).', 'red'); return; }
      if(!fileName){ toast('<b>Falta o ficheiro áudio.</b> Arrasta o teu WAV/FLAC para a zona de upload.', 'red'); return; }
      const usouIA = $('#upAI').checked;
      const tiposIA = Array.from(document.querySelectorAll('.aiKind:checked')).map(c => c.value);
      if(usouIA && tiposIA.length === 0){ toast('Indica <b>o que</b> foi feito com IA (voz, instrumentação…).', 'red'); return; }

      // ---- SECÇÃO 5: deteção inteligente de duplicados (hash+título+duração) ----
      const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const dupExistente = TRACKS.find(t => norm(t.title) === norm(title)) ||
                           S.pendingUploads.find(u => norm(u.title) === norm(title));
      // hash simulado do ficheiro (nome+tamanho) — em produção seria fingerprint acústico
      const fileHash = norm(fileName) + '_' + (fileName.length);
      const hashDup = S.pendingUploads.find(u => u.hash === fileHash);

      // ---- SECÇÃO 6: validação de direitos de autor (nome da conta vs. metadados) ----
      const contaNome = norm(S.artistProfile.artistico || S.artistProfile.nome);
      const metaNome = norm(upArtist);
      const incoerenciaAutor = metaNome && contaNome && metaNome !== contaNome &&
                               !metaNome.includes(contaNome) && !contaNome.includes(metaNome);

      // ---- SECÇÃO 8: anti-fraude (upload repetitivo em curto espaço) ----
      const agora = Date.now();
      const recentes = S.pendingUploads.filter(u => u.ts && (agora - u.ts) < 60000).length;
      const fraudeSuspeita = recentes >= 3 || hashDup;

      // ---- SECÇÃO 7: determinar estado inicial ----
      let estado, msg, alerta = null;
      if(hashDup || dupExistente){
        estado = 'Em Validação';
        msg = 'Foi identificada uma música potencialmente igual ou muito semelhante já existente na plataforma. O conteúdo será encaminhado para validação administrativa.';
      } else if(incoerenciaAutor){
        estado = 'Em Análise de Direitos';
        msg = 'O nome do artista nos metadados ("' + upArtist + '") não corresponde ao da tua conta. A faixa segue para validação de direitos de autor.';
      } else {
        estado = 'Em Validação';
        msg = '"' + title + '" enviada para moderação.' + (usouIA ? ' Declarada com IA (' + tiposIA.join(', ') + ').' : '');
      }
      if(fraudeSuspeita){
        alerta = { tipo: hashDup ? 'Ficheiro duplicado' : 'Upload repetitivo', faixa: title, artista: S.artistProfile.artistico, quando: nowStamp(), ip: '197.2' + Math.floor(Math.random()*10) + '.x.x' };
        S.fraudLog = S.fraudLog || [];
        S.fraudLog.unshift(alerta);
      }

      if(!debit(FEE_UPLOAD, 'Taxa de publicação — ' + title, 'upload')) return;
      S.pendingUploads.unshift({
        title, artist: upArtist, genre: $('#upGenre').value, status: estado,
        ia: usouIA, iaTipos: tiposIA, hash: fileHash, ts: agora,
        flagged: !!(hashDup || dupExistente || incoerenciaAutor || fraudeSuspeita),
      });
      persist();
      const cor = (hashDup || dupExistente || incoerenciaAutor) ? 'red' : 'ok';
      toast('<b>' + estado + '</b> · ' + msg, cor);
      if(alerta) setTimeout(() => toast('⚠ Alerta de segurança registado para a administração (evidências e logs guardados).', 'red'), 900);
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
    const dlFile = (name, content, type) => {
      const blob = new Blob([content], { type });
      const aEl = document.createElement('a'); aEl.href = URL.createObjectURL(blob); aEl.download = name; aEl.click();
    };
    const chosenRows = () => Array.from(main.querySelectorAll('.psxChk:checked')).map(c => {
      const a = ARTIST_ACCOUNTS.find(x => x.artistId === c.dataset.id);
      const art = artistOf(a.artistId);
      return { nome: art ? art.name : a.titular, nif: a.nif, banco: a.banco, iban: a.iban, valor: a.pendValor };
    });
    const csvBtn = $('#psxCsv');
    if(csvBtn) csvBtn.addEventListener('click', () => {
      const rows = chosenRows();
      if(!rows.length){ toast('Seleciona pelo menos um artista.', 'red'); return; }
      const csv = 'NOME;NIF;BANCO;IBAN;VALOR;MOEDA\n' + rows.map(r => [r.nome, r.nif, r.banco, r.iban.replace(/\s/g,''), r.valor, 'AKZ'].join(';')).join('\n');
      dlFile('MUSICAO_pagamentos_202606.csv', csv, 'text/csv');
      toast('Exportado CSV com ' + rows.length + ' beneficiários.', 'ok');
    });
    const xlsBtn = $('#psxXls');
    if(xlsBtn) xlsBtn.addEventListener('click', () => {
      const rows = chosenRows();
      if(!rows.length){ toast('Seleciona pelo menos um artista.', 'red'); return; }
      const html = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr><th>Nome</th><th>NIF</th><th>Banco</th><th>IBAN</th><th>Valor</th><th>Moeda</th></tr>' +
        rows.map(r => '<tr><td>' + r.nome + '</td><td>' + r.nif + '</td><td>' + r.banco + '</td><td>' + r.iban + '</td><td>' + r.valor + '</td><td>AKZ</td></tr>').join('') +
        '<tr><td colspan="4"><b>TOTAL</b></td><td><b>' + rows.reduce((s,r)=>s+r.valor,0) + '</b></td><td>AKZ</td></tr></table></body></html>';
      dlFile('MUSICAO_pagamentos_202606.xls', html, 'application/vnd.ms-excel');
      toast('Exportado Excel com ' + rows.length + ' beneficiários.', 'ok');
    });
    const pdfBtn = $('#psxPdf');
    if(pdfBtn) pdfBtn.addEventListener('click', () => {
      const rows = chosenRows();
      if(!rows.length){ toast('Seleciona pelo menos um artista.', 'red'); return; }
      const total = rows.reduce((s,r)=>s+r.valor,0);
      const win = window.open('', '_blank');
      win.document.write('<html><head><title>Music AO — Relatório de Pagamentos 06/2026</title>' +
        '<style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{color:#E0122C}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#1A1A2E;color:#fff}tfoot td{font-weight:bold;background:#f2f2f5}</style></head><body>' +
        '<h1>MUSIC AO</h1><h2>Relatório de Pagamentos a Artistas — Junho 2026</h2>' +
        '<p>Débito único da conta da plataforma · ' + rows.length + ' beneficiários · gerado em ' + nowStamp() + '</p>' +
        '<table><thead><tr><th>Nome</th><th>NIF</th><th>Banco</th><th>IBAN</th><th style="text-align:right">Valor (AKZ)</th></tr></thead><tbody>' +
        rows.map(r => '<tr><td>' + r.nome + '</td><td>' + r.nif + '</td><td>' + r.banco + '</td><td>' + r.iban + '</td><td style="text-align:right">' + fmtN(r.valor) + '</td></tr>').join('') +
        '</tbody><tfoot><tr><td colspan="4">TOTAL A PAGAR</td><td style="text-align:right">' + fmtN(total) + ' Kz</td></tr></tfoot></table>' +
        '<p style="margin-top:24px;color:#888;font-size:11px">Documento gerado pela plataforma Music AO · confidencial</p>' +
        '</body></html>');
      win.document.close(); setTimeout(() => win.print(), 400);
      toast('Relatório PDF pronto — usa "Guardar como PDF" na janela de impressão.', 'ok');
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
          const d = new Date();
          const descPag = 'Pag. MUSICAO (' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + ')';
          // cabeçalho + linha de débito único + múltiplos créditos
          let seq = 0;
          const linhas = ARTIST_ACCOUNTS.filter(a => chosen.includes(a.artistId) && a.pendValor > 0).map(a => {
            seq++;
            const art = artistOf(a.artistId);
            return [a.iban.replace(/\s/g, ''), (art ? art.name : a.titular), a.nif, a.pendValor,
                    descPag, ref + '-' + String(seq).padStart(4, '0'),
                    dataHoje, 'AKZ', a.banco, seq, 'PAGO'].join(';');
          });
          const header = 'TIPO;IBAN;NOME;NIF;VALOR;DESCRICAO;REFERENCIA;DATA;MOEDA;BANCO;NUM_INTERNO;ESTADO';
          const debito = ['D', 'AO060040000000000000009981', 'MUSIC AO, S.A.', '5417000000',
                          total, descPag, ref + '-DEB', dataHoje, 'AKZ', 'BIC', 0, 'PROCESSADO'].join(';');
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

/* ---------- boot ---------- */
window.addEventListener('hashchange', render);
document.body.dataset.role = S.role;
document.querySelectorAll('.role-btns [data-setrole]').forEach(b => b.classList.toggle('active', b.dataset.setrole === S.role));
updateWalletChip();
render();
