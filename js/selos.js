/* ============================================================
   MUSIC AO · SELOS DE CD
   Códigos de acesso digital para edições físicas.

   Cada CD leva um cartão selado com um código único. O QR da capa
   abre a página de validação; o código só funciona uma vez.

   Este módulo auto-regista-se: não altera o app.js.
   Depende de app.js (S, store, persist, debit, toast, openModal,
   closeModal, roleGate, field, nowStamp, render, routes, bindView)
   e de qr.js (MAQR).
   ============================================================ */
(function(){
  'use strict';

  /* ---------- parâmetros do serviço ---------- */
  var PRECO_ALBUM   = 100000;                      // Kz por edição, tiragem à escolha
  var UNLOCK_BASE   = 'https://unlock.musicao.ao'; // domínio próprio do validador
  var A32           = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: sem I L O U
  var MAX_TIRAGEM   = 20000;

  /* ---------- estado ---------- */
  /* persist() no app.js é const — não se reatribui. Guardamos os selos
     à parte, na mesma chave namespaced do store. */
  S.selos = store.get('selos', []);
  function salvar(){ persist(); store.set('selos', S.selos); }

  /* ---------- criptografia ---------- */
  function hexOf(b){
    return Array.prototype.map.call(new Uint8Array(b), function(x){
      return ('0' + x.toString(16)).slice(-2);
    }).join('');
  }
  function unhex(s){ return new Uint8Array(s.match(/../g).map(function(h){ return parseInt(h,16); })); }

  function importKey(secretHex){
    return crypto.subtle.importKey('raw', unhex(secretHex), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  }
  function mac(key, msg){
    return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)).then(function(b){ return new Uint8Array(b); });
  }
  function b32(bytes, n){
    var bits = 0, val = 0, out = '';
    for(var i = 0; i < bytes.length; i++){
      val = (val << 8) | bytes[i]; bits += 8;
      while(bits >= 5){ out += A32[(val >> (bits-5)) & 31]; bits -= 5; if(out.length >= n) return out; }
    }
    return out;
  }
  function sha256hex(s){
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(hexOf);
  }
  function normal(c){
    return String(c).toUpperCase().replace(/[^0-9A-Z]/g,'')
      .replace(/O/g,'0').replace(/[IL]/g,'1').replace(/U/g,'V');
  }

  /* Deriva a chave nº serial. Determinístico: mesmo segredo + prefixo + série
     dá sempre a mesma chave, por isso um lote perdido regenera-se. */
  function makeKey(key, prefix, serial){
    return mac(key, prefix + '|P|' + serial).then(function(p){
      var pay = b32(p, 8);
      return mac(key, prefix + '|C|' + pay).then(function(c){
        return prefix + '-' + pay.slice(0,4) + '-' + pay.slice(4,8) + '-' + b32(c, 4);
      });
    });
  }
  function checkKey(key, prefix, code){
    var n = normal(code), p = String(prefix).toUpperCase();
    if(n.indexOf(p) !== 0) return Promise.resolve(false);
    var rest = n.slice(p.length);
    if(rest.length !== 12) return Promise.resolve(false);
    return mac(key, p + '|C|' + rest.slice(0,8)).then(function(sig){
      return b32(sig, 4) === rest.slice(8);
    });
  }

  /* ---------- utilitários ---------- */
  function slugify(s){
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'edicao';
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }
  function baixar(nome, texto, mime){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type:(mime||'text/plain') + ';charset=utf-8' }));
    a.download = nome; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
  }
  function csv(rows){
    return rows.map(function(r){
      return r.map(function(v){ return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',');
    }).join('\r\n');
  }
  function edicaoDe(id){
    return (S.selos || []).filter(function(e){ return e.id === id; })[0] || null;
  }
  function unlockURL(ed){ return UNLOCK_BASE + '/u/' + ed.slug; }

  /* ============================================================
     VISTA
     ============================================================ */
  function viewSelos(params){
    if(S.role === 'ouvinte') return roleGate('artista', 'Os selos de CD são exclusivos para artistas');
    if(!S.artistProfile && typeof viewArtistOnboarding === 'function') return viewArtistOnboarding();

    var id = params && params[0];
    if(id) return viewEdicao(id);

    var lista = S.selos || [];

    return '' +
    '<div class="eyebrow">Edições físicas</div>' +
    '<h1 class="h-display" style="font-size:32px;margin-bottom:8px">Selos de CD</h1>' +
    '<p style="color:var(--muted);max-width:660px;margin-bottom:26px">' +
      'Cada CD que vendes leva um cartão selado com um código único. O QR impresso na capa abre a página ' +
      'de validação, o comprador escreve o código e o acesso digital abre. Uma vez só — quem partilhar o ' +
      'código não abre nada a mais.</p>' +

    /* Como funciona */
    '<div class="section"><div class="section-head"><h2>Como funciona</h2></div>' +
      '<div class="sl-steps">' +
        '<div class="sl-step"><span class="sl-n">1</span><b>Crias a edição</b><span>Título, tiragem e prefixo. Pagas uma vez por álbum.</span></div>' +
        '<div class="sl-step"><span class="sl-n">2</span><b>Geramos os códigos</b><span>Únicos, com verificação matemática. Sai o QR e as folhas para a gráfica.</span></div>' +
        '<div class="sl-step"><span class="sl-n">3</span><b>Prensas os CDs</b><span>QR na capa, cartão selado lá dentro.</span></div>' +
        '<div class="sl-step"><span class="sl-n">4</span><b>Acompanhas</b><span>Vês quantos discos foram ativados e quando.</span></div>' +
      '</div>' +
    '</div>' +

    /* Nova edição */
    '<div class="section"><div class="section-head"><h2>Nova edição física</h2>' +
      '<span style="font-size:12px;color:var(--muted)">' + fmtKz(PRECO_ALBUM) + ' por álbum</span></div>' +
      '<div class="panel">' +
        '<div class="form-grid">' +
          field('Título do álbum *', 'slTitulo', 'text', 'Nome da edição') +
          field('Artista *', 'slArtista', 'text', (S.artistProfile && S.artistProfile.nome) || 'Nome artístico') +
          field('Tiragem (n.º de CDs) *', 'slTiragem', 'number', '500') +
          field('Prefixo do código *', 'slPrefixo', 'text', 'GA') +
          field('N.º de lote', 'slLote', 'text', '001') +
          field('Série inicial', 'slSerie', 'number', '1') +
        '</div>' +
        '<div class="sl-preco">' +
          '<div><b>' + fmtKz(PRECO_ALBUM) + '</b><span>Preço fixo por edição, seja qual for a tiragem</span></div>' +
          '<div class="sl-saldo">Saldo: <b>' + fmtKz(S.balance) + '</b></div>' +
        '</div>' +
        '<div class="sl-aviso">' +
          '<b>O código do QR fica impresso para sempre.</b> O endereço de validação é ' +
          '<code>' + esc(UNLOCK_BASE) + '</code> — domínio próprio da Music AO. Mesmo que a plataforma mude ' +
          'de servidor, os discos que já vendeste continuam a abrir.' +
        '</div>' +
        '<button class="btn btn-red btn-full" id="slCriar" style="margin-top:18px">Criar edição e gerar códigos</button>' +
      '</div>' +
    '</div>' +

    /* Edições existentes */
    '<div class="section"><div class="section-head"><h2>As tuas edições</h2>' +
      '<span style="font-size:12px;color:var(--muted)">' + lista.length + (lista.length === 1 ? ' edição' : ' edições') + '</span></div>' +
      (lista.length
        ? '<div class="sl-grid">' + lista.map(cardEdicao).join('') + '</div>'
        : '<div class="panel" style="text-align:center;padding:44px 24px;color:var(--muted)">' +
          'Ainda não tens edições físicas. Cria a primeira acima.</div>') +
    '</div>';
  }

  function cardEdicao(e){
    var ativados = (e.ativados || []).length;
    var pct = e.qtd ? Math.round(ativados / e.qtd * 100) : 0;
    return '<a class="sl-card" href="#/selos/' + e.id + '">' +
      '<div class="sl-card-top"><b>' + esc(e.titulo) + '</b><span class="sl-lote">' + esc(e.prefixo) + ' · lote ' + esc(e.lote) + '</span></div>' +
      '<div class="sl-card-art">' + esc(e.artista) + '</div>' +
      '<div class="sl-bar"><span style="width:' + pct + '%"></span></div>' +
      '<div class="sl-card-foot"><span>' + fmtN(ativados) + ' de ' + fmtN(e.qtd) + ' ativados</span><b>' + pct + '%</b></div>' +
    '</a>';
  }

  /* ---------- detalhe de uma edição ---------- */
  function viewEdicao(id){
    var e = edicaoDe(id);
    if(!e) return '<div class="panel" style="text-align:center;padding:48px">' +
      '<h2 class="h-display" style="font-size:20px;margin-bottom:8px">Edição não encontrada</h2>' +
      '<a class="btn btn-ghost btn-sm" href="#/selos">Voltar aos selos</a></div>';

    var ativados = (e.ativados || []).length;
    var pct = e.qtd ? Math.round(ativados / e.qtd * 100) : 0;
    var url = unlockURL(e);
    var qrSvg = '';
    try { qrSvg = MAQR.svg(url, 3); } catch(err){ qrSvg = ''; }

    return '' +
    '<a href="#/selos" style="font-size:13px;color:var(--muted)">← Selos de CD</a>' +
    '<div class="eyebrow" style="margin-top:14px">Edição física · lote ' + esc(e.lote) + '</div>' +
    '<h1 class="h-display" style="font-size:30px;margin-bottom:4px">' + esc(e.titulo) + '</h1>' +
    '<p style="color:var(--muted);margin-bottom:24px">' + esc(e.artista) + ' · ' + fmtN(e.qtd) + ' códigos · criada a ' + esc(e.criada) + '</p>' +

    '<div class="kpis" style="margin-bottom:28px">' +
      '<div class="kpi"><div class="k-label">Códigos emitidos</div><div class="k-value">' + fmtN(e.qtd) + '</div></div>' +
      '<div class="kpi gold"><div class="k-label">Ativados</div><div class="k-value">' + fmtN(ativados) + '</div></div>' +
      '<div class="kpi"><div class="k-label">Taxa de ativação</div><div class="k-value">' + pct + '%</div></div>' +
      '<div class="kpi"><div class="k-label">Folhas A4</div><div class="k-value">' + Math.ceil(e.qtd / 10) + '</div></div>' +
    '</div>' +

    /* QR + cartão */
    '<div class="section"><div class="section-head"><h2>O que vai impresso</h2></div>' +
      '<div class="sl-print">' +
        '<div class="sl-qrbox">' +
          '<div class="sl-qr">' + qrSvg + '</div>' +
          '<div class="sl-qrlbl">QR da capa</div>' +
          '<div class="sl-qrurl">' + esc(url.replace(/^https?:\/\//,'')) + '</div>' +
        '</div>' +
        '<div class="sl-cardproof">' +
          '<div class="sl-cp-hd"><div><b>' + esc(e.titulo) + '</b><span>' + esc(e.artista) + '</span></div>' +
            '<span class="sl-cp-lot">LOTE ' + esc(e.lote) + '</span></div>' +
          '<div class="sl-cp-mid"><div class="sl-cp-qr">' + qrSvg + '</div>' +
            '<div><div class="sl-cp-lbl">Código de acesso</div>' +
            '<div class="sl-cp-code">' + esc(e.amostra) + '</div>' +
            '<div class="sl-cp-ser">N.º 0001 / ' + String(e.qtd).padStart(4,'0') + '</div></div></div>' +
          '<div class="sl-cp-ft"><span>' + esc(url.replace(/^https?:\/\//,'')) + '</span><b>USO ÚNICO</b></div>' +
        '</div>' +
      '</div>' +
      '<p style="color:var(--muted);font-size:13px;margin-top:14px">' +
        'O QR vai na capa, igual em todos os discos. O cartão com o código vai selado dentro da caixa — ' +
        'se estivesse por fora, qualquer pessoa o resgatava na loja sem comprar.</p>' +
    '</div>' +

    /* Exportações */
    '<div class="section"><div class="section-head"><h2>Ficheiros para a produção</h2></div>' +
      '<div class="panel">' +
        '<div class="sl-exp">' +
          '<button class="btn btn-red btn-sm" data-exp="print" data-id="' + e.id + '">Imprimir cartões</button>' +
          '<button class="btn btn-ghost btn-sm" data-exp="grafica" data-id="' + e.id + '">CSV para a gráfica</button>' +
          '<button class="btn btn-ghost btn-sm" data-exp="qr" data-id="' + e.id + '">QR da capa (.svg)</button>' +
          '<button class="btn btn-ghost btn-sm" data-exp="cofre" data-id="' + e.id + '">Cofre (.json)</button>' +
        '</div>' +
        '<div class="sl-aviso" style="margin-top:16px">' +
          '<b>A gráfica só recebe série e código.</b> O segredo que gera os códigos nunca sai daqui, ' +
          'e a base de dados da Music AO guarda apenas os hashes SHA-256 — se vazasse, não desbloqueava nada.' +
        '</div>' +
      '</div>' +
    '</div>' +

    /* Verificador */
    '<div class="section"><div class="section-head"><h2>Verificar um código</h2></div>' +
      '<div class="panel">' +
        '<p style="color:var(--muted);font-size:13px;margin-bottom:14px">Um comprador diz que o código não funciona? Confirma aqui se pertence a esta edição.</p>' +
        '<div class="field"><input id="slVerif" type="text" placeholder="' + esc(e.prefixo) + '-7K2M-9QX4-P3TZ" data-id="' + e.id + '"></div>' +
        '<div id="slVerifRes" class="sl-verif"></div>' +
      '</div>' +
    '</div>' +

    /* Ativações */
    '<div class="section"><div class="section-head"><h2>Ativações</h2>' +
      '<button class="btn btn-ghost btn-sm" data-sim="' + e.id + '">Simular ativação</button></div>' +
      (ativados
        ? '<div class="panel" style="padding:0;overflow:hidden"><table class="sl-tbl">' +
          '<thead><tr><th>Série</th><th>Quando</th><th>Estado</th></tr></thead><tbody>' +
          (e.ativados || []).slice(0, 40).map(function(a){
            return '<tr><td>' + esc(a.serie) + '</td><td>' + esc(a.quando) + '</td>' +
              '<td><span class="sl-tag">resgatado</span></td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="panel" style="text-align:center;padding:40px;color:var(--muted)">' +
          'Nenhum disco ativado ainda. Aparecem aqui à medida que os compradores validam os códigos.</div>') +
    '</div>';
  }

  /* ============================================================
     GERAÇÃO
     ============================================================ */
  function criarEdicao(){
    var titulo  = ($('#slTitulo').value || '').trim();
    var artista = ($('#slArtista').value || '').trim();
    var qtd     = parseInt($('#slTiragem').value, 10);
    var prefixo = ($('#slPrefixo').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    var lote    = ($('#slLote').value || '001').trim();
    var serie0  = parseInt($('#slSerie').value, 10) || 1;

    if(!titulo)  { toast('Indica o <b>título do álbum</b>.', 'red'); return; }
    if(!artista) { toast('Indica o <b>nome do artista</b>.', 'red'); return; }
    if(!qtd || qtd < 1 || qtd > MAX_TIRAGEM){
      toast('A tiragem tem de estar entre <b>1</b> e <b>' + fmtN(MAX_TIRAGEM) + '</b> CDs.', 'red'); return;
    }
    if(!prefixo || prefixo.length > 4){
      toast('O <b>prefixo</b> deve ter 1 a 4 letras ou números (ex.: GA).', 'red'); return;
    }

    /* Slug curto de propósito: entra no URL do QR e cada caractere a mais
       torna o código mais denso, logo mais difícil de ler em papel brilhante.
       Usamos o prefixo; se já existir, juntamos um número. */
    var slug = prefixo.toLowerCase(), n = 1;
    while((S.selos || []).some(function(x){ return x.slug === slug; })){ n++; slug = prefixo.toLowerCase() + n; }

    openModal('<h3>Confirmar edição física</h3>' +
      '<p>Vais criar <b>' + fmtN(qtd) + ' códigos</b> para <b>' + esc(titulo) + '</b>.</p>' +
      '<table class="sl-conf">' +
        '<tr><td>Preço da edição</td><td>' + fmtKz(PRECO_ALBUM) + '</td></tr>' +
        '<tr><td>Saldo atual</td><td>' + fmtKz(S.balance) + '</td></tr>' +
        '<tr><td>Saldo depois</td><td><b>' + fmtKz(Math.max(0, S.balance - PRECO_ALBUM)) + '</b></td></tr>' +
      '</table>' +
      '<p style="font-size:13px;color:var(--muted)">O preço é fixo por álbum, independentemente da tiragem. ' +
      'Podes gerar lotes adicionais para a mesma edição sem pagar de novo.</p>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost btn-sm" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-red btn-sm" id="slConfirm">Pagar e gerar</button></div>');

    $('#slConfirm').addEventListener('click', function(){
      if(!debit(PRECO_ALBUM, 'Selos de CD — ' + titulo + ' (' + fmtN(qtd) + ' códigos)', 'debit')) { closeModal(); return; }
      closeModal();
      toast('A gerar ' + fmtN(qtd) + ' códigos…');
      gerar({ titulo:titulo, artista:artista, qtd:qtd, prefixo:prefixo, lote:lote, serie0:serie0, slug:slug });
    });
  }

  function gerar(cfg){
    var segredo = hexOf(crypto.getRandomValues(new Uint8Array(32)));
    importKey(segredo).then(function(key){
      var pad = Math.max(4, String(cfg.serie0 + cfg.qtd - 1).length);
      var chain = Promise.resolve(), chaves = [];
      for(var i = 0; i < cfg.qtd; i++){
        (function(i){
          chain = chain.then(function(){
            var serial = cfg.serie0 + i;
            return makeKey(key, cfg.prefixo, serial).then(function(code){
              return sha256hex(normal(code)).then(function(h){
                chaves.push({ serie:String(serial).padStart(pad,'0'), code:code, hash:h });
              });
            });
          });
        })(i);
      }
      return chain.then(function(){ return chaves; });
    }).then(function(chaves){
      var ed = {
        id: 'sel_' + Date.now().toString(36),
        titulo: cfg.titulo, artista: cfg.artista, qtd: chaves.length,
        prefixo: cfg.prefixo, lote: cfg.lote, slug: cfg.slug,
        serie0: cfg.serie0, proxSerie: cfg.serie0 + chaves.length,
        segredo: segredo, chaves: chaves, amostra: chaves[0].code,
        ativados: [], criada: nowStamp(),
      };
      S.selos = S.selos || [];
      S.selos.unshift(ed);
      salvar();
      toast('<b>' + fmtN(ed.qtd) + ' códigos gerados</b> para “' + esc(ed.titulo) + '”. Descarrega os ficheiros para a gráfica.', 'ok');
      location.hash = '#/selos/' + ed.id;
      render();
    }).catch(function(err){
      toast('<b>Não foi possível gerar os códigos.</b> ' + (err && err.message ? esc(err.message) : 'Tenta outra vez.'), 'red');
    });
  }

  /* ============================================================
     EXPORTAÇÕES
     ============================================================ */
  function exportar(tipo, id){
    var e = edicaoDe(id);
    if(!e) return;
    var base = slugify(e.titulo) + '-lote' + e.lote;

    if(tipo === 'grafica'){
      baixar('chaves-grafica-' + base + '.csv',
        '\ufeff' + csv([['serie','codigo']].concat(e.chaves.map(function(k){ return [k.serie, k.code]; }))),
        'text/csv');
      toast('CSV da gráfica descarregado. <b>Não contém o segredo</b> — só série e código.', 'ok');
      return;
    }
    if(tipo === 'cofre'){
      baixar('COFRE-' + base + '.json', JSON.stringify({
        titulo:e.titulo, artista:e.artista, prefixo:e.prefixo, lote:e.lote, slug:e.slug,
        qtd:e.qtd, serieInicial:e.serie0, proximaSerie:e.proxSerie,
        segredo:e.segredo, criada:e.criada,
        esquema:'crockford32/hmac-sha256/8+4',
        hashes: e.chaves.map(function(k){ return { serie:k.serie, sha256:k.hash }; }),
      }, null, 2), 'application/json');
      toast('<b>Guarda o cofre em dois sítios.</b> Sem ele não consegues reemitir cartões perdidos.', 'ok');
      return;
    }
    if(tipo === 'qr'){
      try { baixar('qr-capa-' + base + '.svg', MAQR.svg(unlockURL(e), 4), 'image/svg+xml'); }
      catch(err){ toast('Não foi possível gerar o QR.', 'red'); }
      return;
    }
    if(tipo === 'print'){ imprimir(e); return; }
  }

  /* Folhas A4 — 10 cartões de 90×54 mm por página */
  function imprimir(e){
    var host = document.getElementById('slSheets');
    if(!host){
      host = document.createElement('div');
      host.id = 'slSheets';
      document.body.appendChild(host);
    }
    var qr = '';
    try { qr = MAQR.svg(unlockURL(e), 3); } catch(err){}
    var url = unlockURL(e).replace(/^https?:\/\//,'');
    var total = String(e.qtd).padStart(e.chaves[0].serie.length, '0');
    var html = '';
    for(var i = 0; i < e.chaves.length; i += 10){
      html += '<div class="sl-sheet">';
      e.chaves.slice(i, i + 10).forEach(function(k){
        html += '<div class="sl-pcard">' +
          '<div class="sl-pc-hd"><div><div class="sl-pc-alb">' + esc(e.titulo) + '</div>' +
            '<div class="sl-pc-art">' + esc(e.artista) + '</div></div>' +
            '<div class="sl-pc-lot">LOTE ' + esc(e.lote) + '</div></div>' +
          '<div class="sl-pc-mid"><div class="sl-pc-qr">' + qr + '</div>' +
            '<div><div class="sl-pc-lbl">Código de acesso</div>' +
            '<div class="sl-pc-code">' + k.code + '</div>' +
            '<div class="sl-pc-ser">N.º ' + k.serie + ' / ' + total + '</div></div></div>' +
          '<div class="sl-pc-ft"><div class="sl-pc-url">' + esc(url) + '</div>' +
            '<div class="sl-pc-once">USO ÚNICO</div></div>' +
        '</div>';
      });
      html += '</div>';
    }
    host.innerHTML = html;
    document.body.classList.add('sl-printing');
    setTimeout(function(){
      window.print();
      setTimeout(function(){ document.body.classList.remove('sl-printing'); }, 400);
    }, 60);
  }

  /* ============================================================
     LIGAÇÕES
     ============================================================ */
  function bindSelos(){
    var criar = document.getElementById('slCriar');
    if(criar) criar.addEventListener('click', criarEdicao);

    document.querySelectorAll('[data-exp]').forEach(function(b){
      b.addEventListener('click', function(){ exportar(b.dataset.exp, b.dataset.id); });
    });

    document.querySelectorAll('[data-sim]').forEach(function(b){
      b.addEventListener('click', function(){
        var e = edicaoDe(b.dataset.sim);
        if(!e) return;
        var usados = (e.ativados || []).map(function(a){ return a.serie; });
        var livre = e.chaves.filter(function(k){ return usados.indexOf(k.serie) < 0; })[0];
        if(!livre){ toast('Todos os códigos desta edição já foram ativados.', 'red'); return; }
        e.ativados.unshift({ serie:livre.serie, quando:nowStamp() });
        salvar();
        toast('Disco <b>n.º ' + livre.serie + '</b> ativado. Em produção isto vem do validador.', 'ok');
        render();
      });
    });

    var vin = document.getElementById('slVerif');
    if(vin){
      var t;
      vin.addEventListener('input', function(){
        clearTimeout(t);
        t = setTimeout(function(){
          var box = document.getElementById('slVerifRes');
          var e = edicaoDe(vin.dataset.id);
          var raw = (vin.value || '').trim();
          if(!e || !raw){ box.className = 'sl-verif'; box.textContent = ''; return; }
          importKey(e.segredo).then(function(key){
            return checkKey(key, e.prefixo, raw);
          }).then(function(ok){
            if(!ok){
              box.className = 'sl-verif no';
              box.textContent = '✕ Não é um código válido — confere caractere a caractere.';
              return;
            }
            var n = normal(raw);
            var hit = e.chaves.filter(function(k){ return normal(k.code) === n; })[0];
            var usado = hit && (e.ativados || []).some(function(a){ return a.serie === hit.serie; });
            box.className = 'sl-verif ok';
            box.textContent = hit
              ? '✓ Válido · disco n.º ' + hit.serie + (usado ? ' · já foi resgatado' : ' · ainda por resgatar')
              : '✓ Válido, mas de outro lote desta edição.';
          });
        }, 180);
      });
    }
  }

  /* ---------- auto-registo: sem tocar no app.js ---------- */
  routes.selos = viewSelos;

  var _bindView = bindView;
  bindView = function(route, params){
    _bindView(route, params);
    if(route === 'selos') bindSelos();
  };

  /* exposto para consola/depuração */
  window.MASelos = { exportar:exportar, edicaoDe:edicaoDe, PRECO_ALBUM:PRECO_ALBUM, UNLOCK_BASE:UNLOCK_BASE };
})();
