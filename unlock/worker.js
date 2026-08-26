/**
 * BeatFreak · Unlock Worker
 * Valida códigos de CD físico e marca-os como usados. Uma vez só.
 *
 * Duas barreiras, por esta ordem:
 *   1. Checksum HMAC — matemática pura, não toca na base de dados.
 *      Um código inventado morre aqui: 1 hipótese em 1.048.576.
 *   2. UPDATE ... WHERE status='unused' — atómico no SQLite/D1.
 *      Dois pedidos ao mesmo tempo: só um vê changes === 1.
 *
 * Segredos (wrangler secret put):
 *   HMAC_SECRET   segredo do cofre, 64 hex
 *   TOKEN_SECRET  assina os tokens de sessão, 64 hex, independente do anterior
 *   ADMIN_TOKEN   protege /api/admin/*
 *
 * Ligações (wrangler.toml):
 *   DB            base de dados D1
 *   MEDIA         bucket R2 com os ficheiros exclusivos (opcional)
 *
 * Rotas:
 *   GET  /              a página (álbum por omissão)
 *   GET  /u/<slug>      a página de um álbum — é para aqui que o QR aponta
 *   POST /api/redeem    valida e marca como usado
 *   GET  /api/session   quem já desbloqueou volta a entrar
 *   GET  /api/file      ficheiro exclusivo, link assinado
 *   GET  /api/admin/geo?album=  onde foram ativados os discos, já agregado
 *   /api/admin/*        painel, protegido por token
 */

import { PAGE } from './page.js';

const A32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/* Marca mostrada na página. Muda para o artista/editora. */
const BRAND  = 'Beatfreak';
const FOOTER = 'Beatfreak Music · Luanda';

/* Qual o álbum servido em / (a raiz). */
const DEFAULT_ALBUM = 'ga';

/* O que fica atrás da porta. Vive aqui, no servidor —
   nunca no HTML, senão qualquer pessoa lê sem código. */
const ALBUMS = {
  // A chave é o que vai no URL do QR: /u/ga
  // Curto de propósito — quanto mais curto o URL, menos denso o QR, melhor lê no papel.
  'ga': {
    title: 'Gostos Antecipados',
    artist: 'Piradex',
    prefix: 'GA',          // tem de bater certo com o prefixo do gerador
    eyebrow: 'Edição física · Lote 001',
    stream: [
      { name: 'Spotify',       url: 'https://open.spotify.com/album/XXXX',  note: 'Álbum completo' },
      { name: 'Apple Music',   url: 'https://music.apple.com/album/XXXX',   note: 'Álbum completo' },
      { name: 'YouTube Music', url: 'https://music.youtube.com/XXXX',       note: 'Álbum completo' },
      { name: 'Audiomack',     url: 'https://audiomack.com/XXXX',           note: 'Álbum completo' },
    ],
    // Ficheiros no R2. Servidos com link assinado de curta duração.
    extra: [
      { name: 'Faixa inédita (WAV)',  key: 'ga/inedita.wav',   note: 'Só nesta edição' },
      { name: 'Instrumentais (ZIP)',  key: 'ga/instrumentais.zip', note: '9 faixas' },
    ],
  },
};

const MAX_ATTEMPTS = 8;      // por IP
const WINDOW_SEC   = 60;
const LINK_TTL     = 900;    // 15 min para os downloads
const SESSION_DAYS = 365;

/* Localidades com menos ativações do que isto não aparecem pelo nome.
   Numa vila pequena, "1 ativação em Cacuaco" aponta para uma pessoa.
   Abaixo do limiar juntamos tudo em "Outras localidades". */
const MIN_LOCALIDADE = 3;

/* Nomes em português dos países que mais aparecem. Os outros ficam pelo código ISO. */
const PAISES = {
  AO:'Angola', PT:'Portugal', BR:'Brasil', ZA:'África do Sul', NA:'Namíbia',
  CD:'RD Congo', CG:'Congo', ZM:'Zâmbia', MZ:'Moçambique', CV:'Cabo Verde',
  ST:'São Tomé e Príncipe', GW:'Guiné-Bissau', FR:'França', GB:'Reino Unido',
  US:'Estados Unidos', ES:'Espanha', NL:'Países Baixos', BE:'Bélgica',
  DE:'Alemanha', CH:'Suíça', LU:'Luxemburgo', IE:'Irlanda', CA:'Canadá',
  IT:'Itália', NG:'Nigéria', CI:'Costa do Marfim', KE:'Quénia', AE:'Emirados Árabes',
};

/* ── utilitários ───────────────────────────────────── */
const te = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = s => new Uint8Array(s.match(/../g).map(h => parseInt(h, 16)));
const b64url = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const clean = c => c.toUpperCase().replace(/[^0-9A-Z]/g, '')
  .replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');

async function hmac(secretHex, msg) {
  const k = await crypto.subtle.importKey('raw', unhex(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, te.encode(msg)));
}
function b32(bytes, chars) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += A32[(val >> (bits - 5)) & 31]; bits -= 5; if (out.length >= chars) return out; }
  }
  return out;
}
async function sha256hex(s) { return hex(await crypto.subtle.digest('SHA-256', te.encode(s))); }

/** Barreira 1. Devolve o código normalizado, ou null. */
async function verifyChecksum(code, secret, prefix) {
  const n = clean(code || '');
  if (!n.startsWith(prefix)) return null;
  const rest = n.slice(prefix.length);
  if (rest.length !== 12) return null;
  const payload = rest.slice(0, 8), checksum = rest.slice(8);
  const expected = b32(await hmac(secret, `${prefix}|C|${payload}`), 4);
  // comparação em tempo constante
  let diff = 0;
  for (let i = 0; i < 4; i++) diff |= checksum.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? n : null;
}

/* ── tokens de sessão ──────────────────────────────── */
async function signToken(payload, secret) {
  const body = b64url(te.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  return `${body}.${sig}`;
}
async function readToken(token, secret) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  if (b64url(await hmac(secret, body)) !== sig) return null;
  try {
    const p = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return p.exp > Math.floor(Date.now() / 1000) ? p : null;
  } catch { return null; }
}

/* ── respostas ─────────────────────────────────────── */
/* Página e API vivem na mesma origem, por isso não há CORS a abrir.
   Só o painel (/api/admin/*) é chamado de fora, com token. */
const CORS = {
  'Access-Control-Allow-Origin': 'null',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS },
});

/* ── limitador de tentativas ───────────────────────── */
async function rateLimited(db, ipHash) {
  const now = Math.floor(Date.now() / 1000);
  await db.prepare('DELETE FROM attempts WHERE ts < ?').bind(now - WINDOW_SEC).run();
  const { c } = await db.prepare('SELECT COUNT(*) AS c FROM attempts WHERE ip_hash = ? AND ts >= ?')
    .bind(ipHash, now - WINDOW_SEC).first();
  if (c >= MAX_ATTEMPTS) return true;
  await db.prepare('INSERT INTO attempts (ip_hash, ts) VALUES (?, ?)').bind(ipHash, now).run();
  return false;
}

/* ── conteúdo desbloqueado ─────────────────────────── */
async function payload(album, env) {
  const cfg = ALBUMS[album];
  if (!cfg) return { stream: [], extra: [] };
  const extra = [];
  for (const f of cfg.extra || []) {
    // Se não tens R2 ainda, mete o URL direto em f.url e apaga este bloco.
    const exp = Math.floor(Date.now() / 1000) + LINK_TTL;
    const sig = b64url(await hmac(env.TOKEN_SECRET, `${f.key}|${exp}`));
    extra.push({ name: f.name, note: f.note, url: `/api/file?k=${encodeURIComponent(f.key)}&e=${exp}&s=${sig}` });
  }
  return { stream: cfg.stream, extra, expires_in: LINK_TTL };
}

/* ── entrada ───────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    try {
      // A página. Mesma origem da API — sem CORS, sem dessincronização.
      if (path === '' || path === '/') return servePage(DEFAULT_ALBUM, url);
      if (path.startsWith('/u/'))      return servePage(path.slice(3), url);

      if (path === '/api/redeem'  && request.method === 'POST') return redeem(request, env);
      if (path === '/api/session' && request.method === 'GET')  return session(request, env);
      if (path === '/api/file'    && request.method === 'GET')  return file(url, env);
      if (path.startsWith('/api/admin/')) return admin(path, request, env);
      return json({ error: 'not_found' }, 404);
    } catch (err) {
      console.error(err);
      return json({ ok: false, error: 'server' }, 500);
    }
  },
};

/* ── a página ──────────────────────────────────────── */
function servePage(slug, url) {
  const cfg = ALBUMS[slug];
  if (!cfg) return new Response('Álbum não encontrado', { status: 404 });
  const esc = s => String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const html = PAGE
    .replaceAll('__SLUG__',    esc(slug))
    .replaceAll('__PREFIX__',  esc(cfg.prefix))
    .replaceAll('__TITLE__',   esc(cfg.title))
    .replaceAll('__ARTIST__',  esc(cfg.artist))
    .replaceAll('__EYEBROW__', esc(cfg.eyebrow || ''))
    .replaceAll('__BRAND__',   esc(BRAND))
    .replaceAll('__FOOTER__',  esc(FOOTER));
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; form-action 'none'; base-uri 'none'",
    },
  });
}

/* ── resgate ───────────────────────────────────────── */
async function redeem(request, env) {
  const { code, album = DEFAULT_ALBUM, device = '' } = await request.json().catch(() => ({}));
  const cfg = ALBUMS[album];
  if (!cfg) return json({ ok: false, error: 'invalid' }, 400);
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ipHash = await sha256hex(ip + '|' + env.TOKEN_SECRET);

  if (await rateLimited(env.DB, ipHash)) return json({ ok: false, error: 'rate' }, 429);

  // Barreira 1 — sem tocar na base de dados
  const normalized = await verifyChecksum(code, env.HMAC_SECRET, cfg.prefix);
  if (!normalized) return json({ ok: false, error: 'invalid' }, 400);

  const hash = await sha256hex(normalized);
  const now = new Date().toISOString();

  // Barreira 2 — atómico. Só um pedido consegue mudar a linha.
  /* Geografia: vem do edge da Cloudflare, sem serviço externo nem custo.
     Nível de província é fiável; a cidade erra com dados móveis e VPN. */
  const cf = request.cf || {};
  const geo = [
    cf.country || null,
    cf.country ? (PAISES[cf.country] || cf.country) : null,
    cf.region || null,
    cf.city || null,
    cf.latitude ? +cf.latitude : null,
    cf.longitude ? +cf.longitude : null,
  ];

  const res = await env.DB.prepare(
    `UPDATE keys SET status='redeemed', redeemed_at=?, device=?, ip_hash=?, ua=?,
            pais=?, pais_nome=?, regiao=?, cidade=?, lat=?, lon=?
     WHERE code_hash=? AND status='unused'`
  ).bind(now, String(device).slice(0, 64), ipHash,
         (request.headers.get('User-Agent') || '').slice(0, 180), ...geo, hash).run();

  if (res.meta.changes === 1) {
    const row = await env.DB.prepare('SELECT serial, album FROM keys WHERE code_hash = ?').bind(hash).first();
    const token = await signToken(
      { h: hash, s: row.serial, a: row.album, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 },
      env.TOKEN_SECRET
    );
    return json({ ok: true, serial: row.serial, redeemed_at: now, token, ...(await payload(row.album, env)) });
  }

  // Não mudou nada: ou já foi usado, ou está bloqueado, ou não existe
  const row = await env.DB.prepare('SELECT status, redeemed_at, device FROM keys WHERE code_hash = ?')
    .bind(hash).first();

  if (!row) return json({ ok: false, error: 'invalid' }, 400);          // checksum válido mas fora do lote
  if (row.status === 'blocked') return json({ ok: false, error: 'blocked' }, 403);

  // Mesmo aparelho a repetir? Devolve o acesso em vez de o punir.
  if (row.device && row.device === String(device)) {
    const full = await env.DB.prepare('SELECT serial, album FROM keys WHERE code_hash = ?').bind(hash).first();
    const token = await signToken(
      { h: hash, s: full.serial, a: full.album, exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400 },
      env.TOKEN_SECRET
    );
    return json({ ok: true, serial: full.serial, redeemed_at: row.redeemed_at, token, ...(await payload(full.album, env)) });
  }

  return json({ ok: false, error: 'redeemed', at: row.redeemed_at }, 409);
}

/* ── sessão: quem já desbloqueou volta sem escrever nada ── */
async function session(request, env) {
  const t = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const p = await readToken(t, env.TOKEN_SECRET);
  if (!p) return json({ ok: false }, 401);
  const row = await env.DB.prepare('SELECT status FROM keys WHERE code_hash = ?').bind(p.h).first();
  if (!row || row.status === 'blocked') return json({ ok: false }, 403);
  return json({ ok: true, serial: p.s, ...(await payload(p.a, env)) });
}

/* ── ficheiros exclusivos, com link assinado ───────── */
async function file(url, env) {
  const k = url.searchParams.get('k'), e = +url.searchParams.get('e'), s = url.searchParams.get('s');
  if (!k || !e || !s) return json({ error: 'bad_request' }, 400);
  if (e < Math.floor(Date.now() / 1000)) return json({ error: 'expired' }, 410);
  if (b64url(await hmac(env.TOKEN_SECRET, `${k}|${e}`)) !== s) return json({ error: 'bad_signature' }, 403);
  const obj = await env.MEDIA.get(k);
  if (!obj) return json({ error: 'not_found' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${k.split('/').pop()}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/* ── painel ────────────────────────────────────────── */
async function admin(path, request, env) {
  const auth = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!auth || auth !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);

  if (path === '/api/admin/stats') {
    const rows = await env.DB.prepare(
      `SELECT album, lot, status, COUNT(*) AS n FROM keys GROUP BY album, lot, status`).all();
    const recent = await env.DB.prepare(
      `SELECT serial, album, redeemed_at FROM keys WHERE status='redeemed'
       ORDER BY redeemed_at DESC LIMIT 25`).all();
    return json({ ok: true, totals: rows.results, recent: recent.results });
  }

  /* Onde foram ativados os discos.
     Devolve já agregado — o painel nunca vê ativações individuais. */
  if (path === '/api/admin/geo') {
    const album = new URL(request.url).searchParams.get('album');
    if (!album) return json({ error: 'album_required' }, 400);

    const cidades = await env.DB.prepare(
      `SELECT pais, pais_nome, regiao, cidade,
              AVG(lat) AS lat, AVG(lon) AS lon, COUNT(*) AS n
         FROM keys
        WHERE album = ? AND status = 'redeemed' AND cidade IS NOT NULL
        GROUP BY pais, cidade
        ORDER BY n DESC`).bind(album).all();

    const paises = await env.DB.prepare(
      `SELECT pais, pais_nome, COUNT(*) AS n
         FROM keys
        WHERE album = ? AND status = 'redeemed' AND pais IS NOT NULL
        GROUP BY pais ORDER BY n DESC`).bind(album).all();

    const totais = await env.DB.prepare(
      `SELECT COUNT(*) AS resgatados,
              SUM(CASE WHEN cidade IS NULL THEN 1 ELSE 0 END) AS sem_local
         FROM keys WHERE album = ? AND status = 'redeemed'`).bind(album).first();

    /* Aplicar o limiar: o que for demasiado pequeno perde o nome. */
    const visiveis = [], resto = { n: 0, locais: 0 };
    for (const c of cidades.results) {
      if (c.n >= MIN_LOCALIDADE) visiveis.push(c);
      else { resto.n += c.n; resto.locais++; }
    }

    return json({
      ok: true,
      cidades: visiveis,
      paises: paises.results,
      agrupadas: resto,
      resgatados: totais.resgatados,
      sem_local: totais.sem_local,
      limiar: MIN_LOCALIDADE,
    });
  }

  // Liberta uma chave: o comprador trocou de telemóvel, perdeu o acesso, etc.
  if (path === '/api/admin/release' && request.method === 'POST') {
    const { serial, album } = await request.json();
    const r = await env.DB.prepare(
      `UPDATE keys SET status='unused', redeemed_at=NULL, device=NULL,
              pais=NULL, pais_nome=NULL, regiao=NULL, cidade=NULL, lat=NULL, lon=NULL
       WHERE serial=? AND album=? AND status='redeemed'`).bind(serial, album).run();
    return json({ ok: r.meta.changes === 1 });
  }

  if (path === '/api/admin/block' && request.method === 'POST') {
    const { serial, album } = await request.json();
    const r = await env.DB.prepare(`UPDATE keys SET status='blocked' WHERE serial=? AND album=?`)
      .bind(serial, album).run();
    return json({ ok: r.meta.changes === 1 });
  }

  return json({ error: 'not_found' }, 404);
}
