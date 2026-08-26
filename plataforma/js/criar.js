/* ============================================================
   MUSIC AO · ESTÚDIO AI
   Construtor de prompt e de letra para geração de música.

   O que este módulo FAZ: monta o prompt de estilo e a estrutura
   da letra, com as convenções e os andamentos certos para os
   géneros angolanos. Funciona sem servidor e sem GPU.

   O que este módulo NÃO FAZ: gerar áudio. Isso exige um modelo
   generativo — ver providerAudio() no fim do ficheiro, onde está
   a interface pronta para quando houver um a ligar.

   Auto-regista-se: não altera o app.js.
   ============================================================ */
(function(){
  'use strict';

  /* ---------- géneros, com andamentos reais ---------- */
  var GENEROS = {
    'kizomba':      { bpm:[85,95],   tom:'menor',  base:'kizomba, romantic, smooth bass, African rhythm, sensual guitar, intimate',
                      pt:'Kizomba' },
    'tarraxinha':   { bpm:[85,92],   tom:'menor',  base:'tarraxinha, slow sensual, heavy sub bass, sparse percussion, breathy vocals',
                      pt:'Tarraxinha' },
    'semba':        { bpm:[100,120], tom:'maior',  base:'semba, traditional Angolan, live guitar, dikanza, festive, acoustic drums',
                      pt:'Semba' },
    'afrohouse':    { bpm:[118,124], tom:'menor',  base:'afro house, organic percussion, deep sub bass, atmospheric pads, hypnotic groove',
                      pt:'Afro House' },
    'kuduro':       { bpm:[135,145], tom:'menor',  base:'kuduro, hard percussion, energetic, shouted vocals, synth stabs, street energy',
                      pt:'Kuduro' },
    'afrobeats':    { bpm:[100,112], tom:'maior',  base:'afrobeats, log drums, bright synths, melodic vocals, laid-back groove',
                      pt:'Afrobeats' },
    'zouk':         { bpm:[90,100],  tom:'menor',  base:'zouk, caribbean, smooth keys, melodic bass, romantic vocals',
                      pt:'Zouk' },
    'afrosoul':     { bpm:[80,95],   tom:'menor',  base:'afro soul, emotional, gospel-inspired choir, piano, strings, cinematic build',
                      pt:'Afro Soul' },
    'rnb':          { bpm:[70,90],   tom:'menor',  base:'r&b, smooth, layered harmonies, warm keys, intimate production',
                      pt:'R&B' },
    'gospel':       { bpm:[70,100],  tom:'maior',  base:'gospel, choir, organ, uplifting, powerful lead vocal',
                      pt:'Gospel' },
  };

  var VOZES = {
    'masc':   'emotional male vocals',
    'fem':    'emotional female vocals',
    'dueto':  'male and female duet vocals',
    'coro':   'group choir vocals, crowd chant',
    'inst':   'instrumental, no vocals',
  };

  var AMBIENTES = {
    'romantico':  'romantic, tender, warm',
    'sofrencia':  'heartbreak, melancholic, longing',
    'festa':      'celebratory, upbeat, party energy',
    'pista':      'sensual, dance floor, late night',
    'inspirador': 'uplifting, hopeful, anthemic',
    'nostalgico': 'nostalgic, reflective, bittersweet',
  };

  /* Estruturas. A viral põe o refrão à frente — nos primeiros
     segundos decide-se se alguém fica ou passa à frente. */
  var ESTRUTURAS = {
    'classica': ['Intro','Verse 1','Pre-Chorus','Chorus','Verse 2','Pre-Chorus','Chorus','Bridge','Chorus','Outro'],
    'viral':    ['Chorus','Verse 1','Chorus','Verse 2','Chorus','Bridge','Chorus','Outro'],
    'curta':    ['Intro','Verse 1','Chorus','Verse 2','Chorus','Outro'],
    'pista':    ['Intro','Verse 1','Build','Drop','Verse 2','Build','Drop','Breakdown','Drop','Outro'],
  };

  var DICAS_SECCAO = {
    'Verse 1':'intimate vocal','Verse 2':'intimate vocal',
    'Pre-Chorus':'building tension','Chorus':'powerful layered vocals',
    'Bridge':'stripped back','Drop':'full energy','Build':'rising',
    'Breakdown':'percussion only','Outro':'fading, ad-libs','Intro':'atmospheric',
  };

  var TEMAS = ['Amor à distância','Reconciliação','Traição','Casamento','Saudade de casa',
    'Amor não correspondido','Recomeço','Gratidão','Noite de festa','Primeiro encontro',
    'Separação amigável','Amor que virou família','Orgulho angolano','Superação'];

  var GANCHOS = ['Só tu','Fica','Chora não','Devagar','Diz que sim','Volta','Meu bem',
    'Ei ei','Assim não','Vem cá','Nunca mais','É teu'];

  /* ---------- estado ---------- */
  var st = {
    modo:'simples', genero:'kizomba', voz:'masc', ambiente:'romantico',
    estrutura:'classica', bpm:null, tema:'', gancho:'', titulo:'',
    idioma:'Portuguese', excluir:'', extra:'', letraModo:'auto',
  };

  function esc(s){
    return String(s==null?'':s).replace(/[&<>"]/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];
    });
  }
  function bpmDe(){
    if(st.bpm) return st.bpm;
    var g = GENEROS[st.genero];
    return Math.round((g.bpm[0]+g.bpm[1])/2);
  }

  /* ---------- construir o prompt de estilo ---------- */
  function prompt(){
    var g = GENEROS[st.genero];
    var p = [g.base];
    if(st.voz !== 'inst') p.push(VOZES[st.voz]);
    else p.push(VOZES.inst);
    p.push(AMBIENTES[st.ambiente]);
    if(st.voz !== 'inst') p.push(st.idioma + ' lyrics');
    p.push(bpmDe() + ' BPM');
    if(st.extra.trim()) p.push(st.extra.trim());
    var txt = p.join(', ');
    if(st.excluir.trim()){
      txt += '\n\nExclude: ' + st.excluir.trim();
    }
    return txt;
  }

  /* ---------- construir o esqueleto da letra ---------- */
  function letra(){
    if(st.voz === 'inst') return '[Instrumental]';
    var secs = ESTRUTURAS[st.estrutura];
    var out = [];
    var jaRefrao = false;
    secs.forEach(function(s){
      var dica = DICAS_SECCAO[s];
      out.push('[' + s + (dica ? ' - ' + dica : '') + ']');
      if(s === 'Chorus'){
        if(!jaRefrao){
          out.push(st.gancho ? st.gancho + '...' : '(refrão — 1 a 3 palavras que colem)');
          out.push('(duas linhas que expliquem o gancho)');
          jaRefrao = true;
        } else {
          out.push('(repetir o refrão)');
        }
      } else if(s.indexOf('Verse') === 0){
        out.push('(4 linhas' + (st.tema ? ' sobre: ' + st.tema : '') + ')');
      } else if(s === 'Bridge'){
        out.push('(2 a 4 linhas — mudar de ângulo, não repetir)');
      } else if(s === 'Outro'){
        out.push(st.gancho ? st.gancho + ', ' + st.gancho + '... (ad-libs)' : '(ad-libs, fade)');
      } else {
        out.push('(...)');
      }
      out.push('');
    });
    return out.join('\n').trim();
  }

  /* ============================================================
     LIGAÇÃO AO MOTOR LOCAL
     O site é estático — não pode correr um modelo de IA. Mas pode
     falar com o servidor do VMusicao a correr na máquina de quem
     está a usar. Os browsers permitem uma página HTTPS chamar
     localhost; é a exceção que torna isto possível.
     ============================================================ */
  var SERVIDOR = 'http://localhost:7800';
  var motor = { ligado: false, nome: null, modelo: null, licenca: null, verificada: null };
  var trabalho = null, sonda = null, resultadoVivo = null;

  function procurarMotor(){
    return fetch(SERVIDOR + '/api/generos', { signal: AbortSignal.timeout(2500) })
      .then(function(r){ return r.json(); })
      .then(function(d){
        motor = { ligado:true, nome:d.motor.nome, modelo:d.motor.modelo,
                  licenca:d.motor.licenca, verificada:d.motor.licenca_verificada };
        return true;
      })
      .catch(function(){ motor.ligado = false; return false; });
  }

  function gerar(){
    var g = GENEROS[st.genero];
    var corpo = {
      texto: prompt().split('\n')[0],
      titulo: st.titulo,
      letra: st.voz === 'inst' ? '' : letra(),
      duracao_s: 120,
      estrutura: st.estrutura,
      candidatos: 4,
    };
    var btn = document.getElementById('vmGerar');
    if(btn){ btn.disabled = true; btn.textContent = 'a gerar…'; }
    var barra = document.getElementById('vmProg');
    if(barra) barra.hidden = false;

    fetch(SERVIDOR + '/api/gerar', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(corpo)
    }).then(function(r){ return r.json(); })
      .then(function(d){
        if(d.erro) throw new Error(d.erro);
        acompanhar(d.id);
      })
      .catch(function(e){
        pararGeracao();
        toast('<b>Não foi possível gerar.</b> ' + esc(e.message), 'red');
      });
  }

  function acompanhar(id){
    clearInterval(sonda);
    sonda = setInterval(function(){
      fetch(SERVIDOR + '/api/estado/' + id)
        .then(function(r){ return r.json(); })
        .then(function(t){
          var b = document.getElementById('vmBarra');
          var f = document.getElementById('vmFase');
          if(b) b.style.width = (t.pct || 0) + '%';
          if(f) f.textContent = (t.detalhe ? t.estado + ' · ' + t.detalhe : t.estado) +
                                ' · ' + (t.pct || 0) + '%';
          if(t.estado === 'pronto'){
            clearInterval(sonda); pararGeracao();
            resultadoVivo = t.resultado; render();
            toast('<b>Pronto.</b> ' + t.resultado.resumo.gerados + ' candidatos gerados.', 'ok');
          }
          if(t.estado === 'erro'){
            clearInterval(sonda); pararGeracao();
            toast('<b>Falhou.</b> ' + esc(t.erro || ''), 'red');
          }
        })
        .catch(function(){ clearInterval(sonda); pararGeracao(); });
    }, 700);
  }

  function pararGeracao(){
    var btn = document.getElementById('vmGerar');
    if(btn){ btn.disabled = false; btn.textContent = '✦ Gerar música'; }
    var barra = document.getElementById('vmProg');
    if(barra) setTimeout(function(){ barra.hidden = true; }, 900);
  }

  /* ---------- resultado do motor ---------- */
  var EIXOS = [['tecnica','Técnica'],['dinamica','Dinâmica'],['estereo','Estéreo'],
               ['espectro','Espectro'],['estrutura','Estrutura']];

  function corPont(p){ return p >= 75 ? 'var(--ok)' : p >= 55 ? 'var(--gold)' : 'var(--red)'; }

  function viewResultado(){
    var d = resultadoVivo || (typeof VMDados !== 'undefined' ? VMDados : null);
    if(!d) return '';
    var res = d.resumo;
    var vivo = !!resultadoVivo;

    return '<div class="section"><div class="section-head">' +
      '<h2>Resultado' + (vivo ? '' : ' — exemplo') + '</h2>' +
      '<span class="vm-meta">' + res.gerados + ' candidatos · ' +
      res.acima_do_minimo + ' acima da barreira · ' + res.segundos_gpu + 's de GPU</span></div>' +

      '<div class="vm-cands">' +
        d.candidatos.map(function(c, i){
          return '<div class="vm-c' + (c.escolhido ? ' on' : '') + '">' +
            '<div class="vm-h">' +
              '<span class="vm-t">' + (c.escolhido ? (i === 0 ? 'Versão A' : 'Versão B')
                                                   : 'Candidato ' + (i + 1)) + '</span>' +
              (c.escolhido ? '<span class="vm-tag">escolhido</span>' : '') +
              '<span class="vm-p" style="color:' + corPont(c.pontuacao) + '">' + c.pontuacao + '</span>' +
            '</div>' +
            (c.audio ? '<audio class="vm-audio" controls preload="none" src="' +
               esc(SERVIDOR + c.audio) + '"></audio>' : '') +
            '<div class="vm-eixos">' +
              EIXOS.map(function(e){
                var v = c.eixos[e[0]] || 0;
                return '<div class="vm-e"><span>' + e[1] + '</span>' +
                  '<span class="vm-b"><span style="width:' + v + '%;background:' + corPont(v) + '"></span></span>' +
                  '<b>' + v + '</b></div>';
              }).join('') +
            '</div>' +
            '<div class="vm-med">' +
              '<span>' + c.lufs + ' LUFS</span><span>' + c.tp + ' dBTP</span>' +
              '<span>' + c.lra + ' LU</span><span>corr ' + c.corr + '</span>' +
              '<span>' + c.bpm + ' BPM</span>' +
            '</div>' +
            (c.problemas.length
              ? '<div class="vm-prob">' + c.problemas.map(function(p){
                  return '<span>⚠ ' + esc(p) + '</span>'; }).join('') + '</div>'
              : '<div class="vm-limpo">✓ sem problemas detetados</div>') +
          '</div>';
        }).join('') +
      '</div>' +

      (vivo ? '' : '<div class="vm-nota" style="border-left-color:var(--muted)">' +
        '<b>Isto é um exemplo.</b> São medições reais de uma geração anterior, para veres o ' +
        'formato. Liga o motor acima para gerares as tuas.</div>') +
      '<div class="vm-nota"><b>Como se escolhe.</b> Geram-se ' + res.gerados +
        ' e medem-se todos: clipping, silêncio, offset DC, fase, energia nos agudos, ' +
        'dinâmica e estabilidade do andamento. Mostram-se os dois melhores. ' +
        'Não é gerar melhor — é escolher melhor.</div>' +
    '</div>';
  }

  /* ---------- vista ---------- */
  function viewCriar(){
    if(S.role === 'ouvinte') return roleGate('artista','O Estúdio AI é para artistas');

    var g = GENEROS[st.genero];
    var simples = st.modo === 'simples';

    return '' +
    '<div class="eyebrow">Estúdio AI</div>' +
    '<h1 class="h-display" style="font-size:32px;margin-bottom:8px">Criar</h1>' +
    '<p style="color:var(--muted);max-width:660px;margin-bottom:22px">' +
      'Monta o prompt de estilo e a estrutura da letra com os andamentos certos para ' +
      'os géneros angolanos. Copias, colas no gerador, e ficas com metade do trabalho feito.</p>' +

    '<div class="ai-modos">' +
      '<button class="ai-mb' + (simples?' on':'') + '" data-modo="simples">Simples</button>' +
      '<button class="ai-mb' + (!simples?' on':'') + '" data-modo="pro">Pro</button>' +
    '</div>' +

    '<div class="ai-grid">' +
      '<div>' +
        /* género */
        '<div class="section"><div class="section-head"><h2>Género</h2>' +
          '<span style="font-size:12px;color:var(--muted)">' + g.bpm[0] + '–' + g.bpm[1] + ' BPM · ' + g.tom + '</span></div>' +
          '<div class="ai-chips">' +
            Object.keys(GENEROS).map(function(k){
              return '<button class="ai-chip' + (st.genero===k?' on':'') + '" data-gen="' + k + '">' +
                esc(GENEROS[k].pt) + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        /* voz e ambiente */
        '<div class="section"><div class="section-head"><h2>Voz e ambiente</h2></div>' +
          '<div class="ai-chips" style="margin-bottom:12px">' +
            [['masc','Masculina'],['fem','Feminina'],['dueto','Dueto'],['coro','Coro'],['inst','Instrumental']]
              .map(function(v){
                return '<button class="ai-chip' + (st.voz===v[0]?' on':'') + '" data-voz="' + v[0] + '">' + v[1] + '</button>';
              }).join('') +
          '</div>' +
          '<div class="ai-chips">' +
            [['romantico','Romântico'],['sofrencia','Sofrência'],['festa','Festa'],
             ['pista','Pista'],['inspirador','Inspirador'],['nostalgico','Nostálgico']]
              .map(function(v){
                return '<button class="ai-chip' + (st.ambiente===v[0]?' on':'') + '" data-amb="' + v[0] + '">' + v[1] + '</button>';
              }).join('') +
          '</div>' +
        '</div>' +

        /* tema e gancho */
        '<div class="section"><div class="section-head"><h2>Tema e gancho</h2></div>' +
          '<div class="panel">' +
            '<div class="form-grid">' +
              field('Título (opcional)','aiTitulo','text','Nome da música') +
              field('Tema','aiTema','text','ex.: amor à distância') +
            '</div>' +
            '<div class="field" style="margin-top:4px">' +
              '<label>Gancho — 1 a 3 palavras</label>' +
              '<input type="text" id="aiGancho" value="' + esc(st.gancho) + '" placeholder="ex.: Só tu">' +
            '</div>' +
            '<div class="ai-sug"><span>Temas:</span>' +
              TEMAS.map(function(t){ return '<button class="ai-sg" data-tema="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') +
            '</div>' +
            '<div class="ai-sug"><span>Ganchos:</span>' +
              GANCHOS.map(function(t){ return '<button class="ai-sg" data-gancho="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') +
            '</div>' +
            '<p class="ai-nota">O gancho curto e à frente é o que decide nos primeiros segundos. ' +
              'Duas palavras que se cantem sem pensar valem mais do que um verso bonito.</p>' +
          '</div>' +
        '</div>' +

        /* pro */
        (simples ? '' :
        '<div class="section"><div class="section-head"><h2>Estrutura</h2></div>' +
          '<div class="ai-chips" style="margin-bottom:14px">' +
            [['classica','Clássica'],['viral','Viral — refrão à frente'],['curta','Curta'],['pista','Pista']]
              .map(function(v){
                return '<button class="ai-chip' + (st.estrutura===v[0]?' on':'') + '" data-est="' + v[0] + '">' + v[1] + '</button>';
              }).join('') +
          '</div>' +
          '<div class="panel">' +
            '<div class="form-grid">' +
              '<div class="field"><label>BPM (vazio = meio do género)</label>' +
                '<input type="number" id="aiBpm" value="' + (st.bpm||'') + '" placeholder="' + bpmDe() + '"></div>' +
              '<div class="field"><label>Idioma da letra</label>' +
                '<input type="text" id="aiIdioma" value="' + esc(st.idioma) + '"></div>' +
            '</div>' +
            '<div class="field"><label>Acrescentar ao estilo</label>' +
              '<input type="text" id="aiExtra" value="' + esc(st.extra) + '" placeholder="ex.: dikanza, trumpet stabs, vinyl texture"></div>' +
            '<div class="field"><label>Excluir</label>' +
              '<input type="text" id="aiExcluir" value="' + esc(st.excluir) + '" placeholder="ex.: no trap hi-hats, no autotune"></div>' +
          '</div>' +
        '</div>') +
      '</div>' +

      /* saída */
      '<div class="ai-saida">' +
        '<div class="ai-out">' +
          '<div class="ai-out-hd"><h3>Estilo</h3>' +
            '<button class="btn btn-ghost btn-sm" data-copiar="prompt">Copiar</button></div>' +
          '<pre id="aiPrompt">' + esc(prompt()) + '</pre>' +
        '</div>' +
        '<div class="ai-out">' +
          '<div class="ai-out-hd"><h3>Letra — estrutura</h3>' +
            '<button class="btn btn-ghost btn-sm" data-copiar="letra">Copiar</button></div>' +
          '<pre id="aiLetra">' + esc(letra()) + '</pre>' +
        '</div>' +
        '<button class="btn btn-red btn-full" data-copiar="tudo">Copiar os dois</button>' +

        viewMotor() +
        '<div class="ai-breve" hidden>' +
          '<b>Gerar áudio — por ligar</b>' +
          '<p>A geração de música exige um modelo generativo a correr numa GPU, ou uma API ' +
            'licenciada. A interface está pronta no código (<code>providerAudio</code>); ' +
            'falta escolher o motor. Até lá, o prompt acima serve em qualquer gerador.</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
    viewResultado();
  }

  /* ---------- caixa do motor ---------- */
  function viewMotor(){
    if(motor.ligado){
      return '<div class="vm-motor on">' +
        '<div class="vm-mh"><span class="vm-dot"></span>' +
          '<b>Motor ligado</b>' +
          '<span class="vm-mm">' + esc(motor.nome) + ' · ' + esc(motor.modelo || '—') + '</span></div>' +
        (motor.nome === 'simulado'
          ? '<p class="vm-mp">Motor <b>simulado</b>: produz áudio sintético, não música. ' +
            'Serve para veres a cadeia. Arranca com <code>--motor acestep</code> quando tiveres GPU.</p>'
          : '<p class="vm-mp">' + esc(motor.licenca || '') +
            (motor.verificada ? '' : ' · <b>licença por confirmar</b> — não faturar antes disso') + '</p>') +
        '<button class="btn btn-red btn-full" id="vmGerar">✦ Gerar música</button>' +
        '<div id="vmProg" hidden>' +
          '<div class="vm-pb"><span id="vmBarra"></span></div>' +
          '<div class="vm-pf" id="vmFase">na fila</div>' +
        '</div>' +
      '</div>';
    }
    return '<div class="vm-motor">' +
      '<div class="vm-mh"><span class="vm-dot off"></span><b>Motor desligado</b></div>' +
      '<p class="vm-mp">O site não pode gerar música sozinho — isso precisa de um modelo a correr ' +
        'numa máquina. Arranca o VMusicao no teu computador e o botão aparece aqui.</p>' +
      '<pre class="vm-cmd">cd programa\npip install numpy scipy\npython3 servidor.py</pre>' +
      '<button class="btn btn-ghost btn-full" id="vmProcurar">Procurar motor</button>' +
    '</div>';
  }

  /* ---------- ligações ---------- */
  function refrescar(){
    var p = document.getElementById('aiPrompt');
    var l = document.getElementById('aiLetra');
    if(p) p.textContent = prompt();
    if(l) l.textContent = letra();
  }

  function bindCriar(){
    var bg = document.getElementById('vmGerar');
    if(bg) bg.addEventListener('click', gerar);
    var bp = document.getElementById('vmProcurar');
    if(bp) bp.addEventListener('click', function(){
      bp.disabled = true; bp.textContent = 'a procurar…';
      procurarMotor().then(function(achou){
        if(achou){ toast('<b>Motor encontrado.</b> ' + esc(motor.nome), 'ok'); render(); }
        else { bp.disabled = false; bp.textContent = 'Procurar motor';
               toast('Nenhum motor em ' + SERVIDOR + '. Está a correr?', 'red'); }
      });
    });

    document.querySelectorAll('[data-modo]').forEach(function(b){
      b.addEventListener('click', function(){ st.modo=b.dataset.modo; render(); }); });
    document.querySelectorAll('[data-gen]').forEach(function(b){
      b.addEventListener('click', function(){ st.genero=b.dataset.gen; st.bpm=null; render(); }); });
    document.querySelectorAll('[data-voz]').forEach(function(b){
      b.addEventListener('click', function(){ st.voz=b.dataset.voz; render(); }); });
    document.querySelectorAll('[data-amb]').forEach(function(b){
      b.addEventListener('click', function(){ st.ambiente=b.dataset.amb; render(); }); });
    document.querySelectorAll('[data-est]').forEach(function(b){
      b.addEventListener('click', function(){ st.estrutura=b.dataset.est; render(); }); });
    document.querySelectorAll('[data-tema]').forEach(function(b){
      b.addEventListener('click', function(){ st.tema=b.dataset.tema;
        var i=document.getElementById('aiTema'); if(i) i.value=st.tema; refrescar(); }); });
    document.querySelectorAll('[data-gancho]').forEach(function(b){
      b.addEventListener('click', function(){ st.gancho=b.dataset.gancho;
        var i=document.getElementById('aiGancho'); if(i) i.value=st.gancho; refrescar(); }); });

    [['aiTitulo','titulo'],['aiTema','tema'],['aiGancho','gancho'],
     ['aiIdioma','idioma'],['aiExtra','extra'],['aiExcluir','excluir']].forEach(function(p){
      var el=document.getElementById(p[0]);
      if(el) el.addEventListener('input', function(){ st[p[1]]=el.value; refrescar(); });
    });
    var bpm=document.getElementById('aiBpm');
    if(bpm) bpm.addEventListener('input', function(){
      st.bpm = bpm.value ? parseInt(bpm.value,10) : null; refrescar(); });

    document.querySelectorAll('[data-copiar]').forEach(function(b){
      b.addEventListener('click', function(){
        var q=b.dataset.copiar;
        var txt = q==='prompt' ? prompt()
                : q==='letra'  ? letra()
                : 'ESTILO\n' + prompt() + '\n\n\nLETRA\n' + letra();
        copiar(txt, q==='tudo' ? 'Estilo e letra copiados' : 'Copiado');
      });
    });
  }

  function copiar(txt, msg){
    function fallback(){
      var ta=document.createElement('textarea');
      ta.value=txt; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand('copy'); toast(msg,'ok'); }
      catch(e){ toast('Não foi possível copiar — seleciona e copia à mão.','red'); }
      document.body.removeChild(ta);
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ toast(msg,'ok'); }, fallback);
    } else fallback();
  }

  /* ============================================================
     Interface para o motor de geração de áudio.
     Ainda não há nenhum ligado — é a peça que exige GPU ou API
     licenciada. Quem a implementar só precisa de cumprir isto.
     ============================================================ */
  window.providerAudio = window.providerAudio || {
    disponivel: false,
    /* gerar({estilo, letra, duracao_s, seed}) -> Promise<{url, duracao_s, bpm, tom}> */
    gerar: function(){
      return Promise.reject(new Error('Nenhum motor de geração ligado.'));
    },
  };

  routes.criar = viewCriar;
  var _bv = bindView;
  var jaProcurou = false;
  bindView = function(r,p){
    _bv(r,p);
    if(r === 'criar'){
      bindCriar();
      if(!jaProcurou){
        jaProcurou = true;
        procurarMotor().then(function(achou){ if(achou) render(); });
      }
    }
  };
  window.MACriar = { estado:st, prompt:prompt, letra:letra, GENEROS:GENEROS };
})();
