/* ============================================================
   MUSIC AO · Apanhar streams na consola do browser
   ============================================================

   Para sites onde o endereço vive dentro do JavaScript do leitor
   — o caso da RNA, e da maioria dos WordPress com plugin de rádio.

   COMO USAR
   1. Abre a página da rádio (ex.: https://rna.ao/rna.ao/em-directo/)
   2. F12 → separador Console
   3. Cola isto tudo e carrega Enter
   4. Carrega no play de cada canal que queiras
   5. Escreve  streams()  e carrega Enter → sai a tabela
   6. Escreve  streamsJSON()  → sai o JSON para colar no estacoes.json

   Apanha por três vias ao mesmo tempo, porque nenhuma sozinha chega:
   · intercepta os pedidos de rede (fetch e XHR)
   · vigia os elementos <audio> que o leitor cria
   · varre as variáveis de configuração já carregadas na página
   ============================================================ */

(() => {
  const achados = new Map();
  const ehAudio = (u) =>
    typeof u === 'string' &&
    /^https?:\/\//i.test(u) &&
    /(\.mp3|\.aac|\.m3u8|\.ogg|\/stream|\/listen|\/live|\/proxy\/|:\d{4,5}\/)/i.test(u) &&
    !/\.(js|css|png|jpe?g|gif|svg|webp|woff2?|ico)(\?|$)/i.test(u);

  const juntar = (url, via, rotulo) => {
    if (!ehAudio(url)) return;
    const a = url.split('?')[0];
    // não guardar um endereço que é só prefixo de outro já visto
    for (const k of achados.keys()) if (k !== url && k.startsWith(url)) return;
    const anterior = achados.get(url) || { url, vias: new Set(), rotulos: new Set() };
    anterior.vias.add(via);
    if (rotulo) anterior.rotulos.add(rotulo);
    achados.set(url, anterior);
    console.log('%c♫ ' + url, 'color:#F2B01E;font-weight:700', '(' + via + ')');
  };

  /* 1 · pedidos de rede */
  const _fetch = window.fetch;
  window.fetch = function (...args) {
    const u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url);
    juntar(u, 'fetch');
    return _fetch.apply(this, args);
  };
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...r) {
    juntar(u, 'xhr');
    return _open.call(this, m, u, ...r);
  };

  /* 2 · elementos <audio> que o leitor cria ou altera */
  const olharAudio = (el) => {
    if (!el || el.tagName !== 'AUDIO') return;
    juntar(el.src || el.currentSrc, 'elemento-audio');
    el.querySelectorAll && el.querySelectorAll('source').forEach(
      (s) => juntar(s.src, 'elemento-audio')
    );
  };
  document.querySelectorAll('audio').forEach(olharAudio);
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') olharAudio(m.target);
      m.addedNodes && m.addedNodes.forEach((n) => {
        olharAudio(n);
        n.querySelectorAll && n.querySelectorAll('audio').forEach(olharAudio);
      });
    }
  }).observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['src'],
  });

  /* 3 · varrer a configuração já carregada */
  const visitados = new WeakSet();
  const vasculhar = (obj, rotulo, prof = 0) => {
    if (!obj || prof > 6 || typeof obj !== 'object' || visitados.has(obj)) return;
    visitados.add(obj);
    for (const k of Object.keys(obj)) {
      let v;
      try { v = obj[k]; } catch (e) { continue; }
      const nome = (obj.title || obj.name || obj.station || rotulo);
      if (typeof v === 'string') juntar(v, 'config', nome);
      else if (typeof v === 'object') vasculhar(v, nome, prof + 1);
    }
  };
  for (const k of Object.keys(window)) {
    if (!/radio|player|stream|audio|proradio|station|cast/i.test(k)) continue;
    try { vasculhar(window[k], k); } catch (e) {}
  }
  /* qualquer data-* pode ter o endereço: data-stream-url, data-mp3-src, data-file… */
  document.querySelectorAll('*').forEach((el) => {
    if (!el.attributes || !el.attributes.length) return;
    for (const a of el.attributes) {
      if (a.name.startsWith('data-') && ehAudio(a.value)) {
        juntar(a.value, 'data-attr',
          (el.getAttribute('data-title') || el.textContent || '').trim().slice(0, 40));
      }
    }
  });

  /* saída */
  window.streams = () => {
    const linhas = [...achados.values()].map((a) => ({
      url: a.url,
      via: [...a.vias].join(', '),
      canal: [...a.rotulos].filter(Boolean).join(' / ') || '—',
    }));
    console.table(linhas);
    return linhas;
  };
  window.streamsJSON = () => {
    const j = JSON.stringify(
      [...achados.values()].map((a) => ({
        nome: [...a.rotulos][0] || 'POR IDENTIFICAR',
        url: a.url, ativa: false,
      })), null, 1);
    console.log(j);
    try { copy(j); console.log('%c(copiado para a área de transferência)', 'color:#3ddc84'); } catch (e) {}
    return j;
  };

  console.log('%cMusic AO · à escuta', 'color:#E0122C;font-size:15px;font-weight:700');
  console.log('Carrega no play de cada canal. Depois escreve  streams()  ou  streamsJSON()');
})();
