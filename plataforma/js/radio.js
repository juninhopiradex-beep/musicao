/* ============================================================
   MUSIC AO · MONITORIZAÇÃO DE RÁDIO
   Mostra onde e quando as obras do artista passaram na rádio.

   Os dados vêm de radio-dados.js — produzidos pelo motor de
   impressão digital (radio/fingerprint.py) a analisar emissões.
   Em produção chegam do monitor, pela API.

   Auto-regista-se: não altera o app.js.
   ============================================================ */
(function(){
  'use strict';

  var DIAS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  /* ---------- preparar os dados ---------- */
  function passagens(){
    var d = (typeof MARadioDados !== 'undefined') ? MARadioDados : null;
    if(!d) return [];
    return d.passagens.map(function(p){
      var dt = new Date(p[2] + ':00Z');
      return {
        obra: d.obras[p[0]],
        estacao: d.estacoes[p[1]].nome,
        regiao: d.estacoes[p[1]].regiao,
        data: dt,
        duracao: p[3],
        confianca: p[4],
      };
    });
  }

  function agrupar(lista, chave){
    var m = {};
    lista.forEach(function(p){
      var k = chave(p);
      if(!m[k]) m[k] = { chave:k, n:0, segundos:0 };
      m[k].n++; m[k].segundos += p.duracao;
    });
    return Object.keys(m).map(function(k){ return m[k]; })
      .sort(function(a,b){ return b.n - a.n; });
  }

  function horas(seg){
    var h = Math.floor(seg/3600), m = Math.round(seg%3600/60);
    return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm';
  }
  function dataHora(d){
    return DIAS[d.getUTCDay()] + ' ' + String(d.getUTCDate()).padStart(2,'0') + '/' +
      String(d.getUTCMonth()+1).padStart(2,'0') + ' · ' +
      String(d.getUTCHours()).padStart(2,'0') + ':' + String(d.getUTCMinutes()).padStart(2,'0');
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }

  /* ---------- vista ---------- */
  var filtroObra = null;

  function viewRadio(){
    if(S.role === 'ouvinte') return roleGate('artista', 'A monitorização de rádio é para artistas');
    if(!S.artistProfile && typeof viewArtistOnboarding === 'function') return viewArtistOnboarding();

    var todas = passagens();
    if(!todas.length){
      return '<div class="eyebrow">Antena</div>' +
        '<h1 class="h-display" style="font-size:32px;margin-bottom:8px">Monitorização de rádio</h1>' +
        '<div class="panel" style="text-align:center;padding:44px;color:var(--muted)">' +
        'Ainda não há deteções. O monitor começa a registar assim que estiver ligado às estações.</div>';
    }

    var lista = filtroObra ? todas.filter(function(p){ return p.obra === filtroObra; }) : todas;
    var porEstacao = agrupar(lista, function(p){ return p.estacao; });
    var porObra = agrupar(todas, function(p){ return p.obra; });
    var segTotal = lista.reduce(function(s,p){ return s + p.duracao; }, 0);
    var regioes = {};
    lista.forEach(function(p){ regioes[p.regiao] = 1; });

    var maxE = porEstacao.length ? porEstacao[0].n : 1;
    var maxO = porObra.length ? porObra[0].n : 1;

    return '' +
    '<div class="eyebrow">Antena · últimos 7 dias</div>' +
    '<h1 class="h-display" style="font-size:32px;margin-bottom:8px">Monitorização de rádio</h1>' +
    '<p style="color:var(--muted);max-width:680px;margin-bottom:24px">' +
      'Um servidor ouve as estações angolanas em contínuo e reconhece as tuas obras pelo som. ' +
      'Cada linha aqui é uma passagem confirmada — a prova que até hoje não existia.</p>' +

    '<div class="kpis" style="margin-bottom:22px">' +
      '<div class="kpi"><div class="k-label">Passagens</div><div class="k-value">' + fmtN(lista.length) + '</div></div>' +
      '<div class="kpi gold"><div class="k-label">Tempo de antena</div><div class="k-value">' + horas(segTotal) + '</div></div>' +
      '<div class="kpi"><div class="k-label">Estações</div><div class="k-value">' + porEstacao.length + '</div></div>' +
      '<div class="kpi"><div class="k-label">Províncias</div><div class="k-value">' + Object.keys(regioes).length + '</div></div>' +
    '</div>' +

    /* filtro por obra */
    '<div class="rd-filtros">' +
      '<button class="rd-chip' + (filtroObra ? '' : ' on') + '" data-obra="">Todas as obras</button>' +
      porObra.map(function(o){
        return '<button class="rd-chip' + (filtroObra === o.chave ? ' on' : '') + '" data-obra="' + esc(o.chave) + '">' +
          esc(o.chave) + ' <em>' + o.n + '</em></button>';
      }).join('') +
    '</div>' +

    '<div class="rd-cols">' +
      /* estações */
      '<div class="section"><div class="section-head"><h2>Onde passou</h2></div>' +
        '<div class="panel">' +
          porEstacao.map(function(e){
            var reg = (lista.filter(function(p){ return p.estacao === e.chave; })[0] || {}).regiao || '';
            return '<div class="rd-rk">' +
              '<span class="rd-nome">' + esc(e.chave) + '<em>' + esc(reg) + '</em></span>' +
              '<span class="rd-bar"><span style="width:' + Math.round(e.n/maxE*100) + '%"></span></span>' +
              '<span class="rd-n">' + e.n + '</span></div>';
          }).join('') +
        '</div>' +
      '</div>' +

      /* obras */
      '<div class="section"><div class="section-head"><h2>Obras mais tocadas</h2></div>' +
        '<div class="panel">' +
          porObra.map(function(o){
            return '<div class="rd-rk">' +
              '<span class="rd-nome">' + esc(o.chave) + '<em>' + horas(o.segundos) + ' de antena</em></span>' +
              '<span class="rd-bar"><span class="alt" style="width:' + Math.round(o.n/maxO*100) + '%"></span></span>' +
              '<span class="rd-n alt">' + o.n + '</span></div>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>' +

    /* mapa de calor */
    '<div class="section"><div class="section-head"><h2>A que horas tocam</h2>' +
      '<span style="font-size:12px;color:var(--muted)">quanto mais claro, mais passagens</span></div>' +
      '<div class="panel">' + heatmap(lista) + '</div>' +
    '</div>' +

    /* passagens */
    '<div class="section"><div class="section-head"><h2>Passagens registadas</h2>' +
      '<button class="btn btn-ghost btn-sm" id="rdCsv">Exportar CSV</button></div>' +
      '<div class="panel" style="padding:0;overflow:hidden">' +
        '<table class="rd-tbl"><thead><tr>' +
          '<th>Quando</th><th>Obra</th><th>Estação</th><th>Duração</th><th>Confiança</th>' +
        '</tr></thead><tbody>' +
        lista.slice().reverse().slice(0, 40).map(function(p){
          var c = Math.round(p.confianca * 100);
          return '<tr><td class="rd-t">' + esc(dataHora(p.data)) + '</td>' +
            '<td><b>' + esc(p.obra) + '</b></td>' +
            '<td>' + esc(p.estacao) + '<em class="rd-reg">' + esc(p.regiao) + '</em></td>' +
            '<td class="rd-t">' + p.duracao + 's</td>' +
            '<td><span class="rd-conf' + (c >= 70 ? ' alta' : c >= 45 ? ' media' : ' baixa') + '">' + c + '%</span></td></tr>';
        }).join('') +
        '</tbody></table>' +
      '</div>' +
      (lista.length > 40
        ? '<p style="color:var(--muted);font-size:12px;margin-top:10px">As 40 mais recentes de ' +
          fmtN(lista.length) + '. O CSV traz todas.</p>' : '') +
    '</div>' +

    '<div class="rd-aviso">' +
      '<b>O que isto é, e o que não é.</b> A deteção é reconhecimento automático do som — ' +
      'indício técnico sólido, com hora e duração. Para valer como prova numa cobrança, ' +
      'precisa de acordo prévio com as estações sobre o método. Fala com elas antes de usar ' +
      'estes números numa negociação.' +
    '</div>';
  }

  /* ---------- mapa de calor: dia da semana × hora ---------- */
  function heatmap(lista){
    var grelha = {};
    var max = 0;
    lista.forEach(function(p){
      var k = p.data.getUTCDay() + ':' + p.data.getUTCHours();
      grelha[k] = (grelha[k] || 0) + 1;
      if(grelha[k] > max) max = grelha[k];
    });
    var horasEixo = [];
    for(var h = 0; h < 24; h++) horasEixo.push(h);

    var html = '<div class="rd-heat"><div class="rd-heat-lbl"></div>' +
      horasEixo.map(function(h){
        return '<div class="rd-heat-h">' + (h % 3 === 0 ? String(h).padStart(2,'0') : '') + '</div>';
      }).join('');
    for(var d = 0; d < 7; d++){
      html += '<div class="rd-heat-lbl">' + DIAS[d] + '</div>';
      for(var h2 = 0; h2 < 24; h2++){
        var n = grelha[d + ':' + h2] || 0;
        var i = max ? n / max : 0;
        html += '<div class="rd-cel" style="opacity:' + (n ? (0.18 + i * 0.82).toFixed(2) : 0) + '"' +
          (n ? ' title="' + DIAS[d] + ' ' + String(h2).padStart(2,'0') + 'h · ' + n + ' passagens"' : '') +
          '></div>';
      }
    }
    return html + '</div>';
  }

  /* ---------- ligações ---------- */
  function bindRadio(){
    document.querySelectorAll('[data-obra]').forEach(function(b){
      b.addEventListener('click', function(){
        filtroObra = b.dataset.obra || null;
        render();
      });
    });
    var csv = document.getElementById('rdCsv');
    if(csv) csv.addEventListener('click', function(){
      var lista = passagens();
      if(filtroObra) lista = lista.filter(function(p){ return p.obra === filtroObra; });
      var linhas = [['data_hora_utc','obra','estacao','regiao','duracao_s','confianca']]
        .concat(lista.map(function(p){
          return [p.data.toISOString(), p.obra, p.estacao, p.regiao, p.duracao, p.confianca];
        }));
      var texto = '\ufeff' + linhas.map(function(r){
        return r.map(function(v){ return '"' + String(v).replace(/"/g,'""') + '"'; }).join(',');
      }).join('\r\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([texto], {type:'text/csv;charset=utf-8'}));
      a.download = 'passagens-radio.csv';
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 3000);
      toast('CSV com <b>' + fmtN(lista.length) + ' passagens</b> descarregado.', 'ok');
    });
  }

  /* ---------- auto-registo ---------- */
  routes.radio = viewRadio;
  var _bv = bindView;
  bindView = function(route, params){
    _bv(route, params);
    if(route === 'radio') bindRadio();
  };
})();
