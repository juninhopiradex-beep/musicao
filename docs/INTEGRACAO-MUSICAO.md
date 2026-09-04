# Integrar na Music AO

O Cleaner corre dentro da Music AO como uma rota normal, sem alterar nada do que já lá está. Todo o CSS fica isolado dentro de `.bfac` e todos os ids levam o prefixo `bfac-`, por isso não há colisão com a `.sidebar`, com o `#walletChip` nem com nenhuma classe existente.

## Antes de tudo: a chave

**A chave da marca de água nunca pode ficar escrita no código da Music AO.** Tudo o que vai para o browser é público — basta abrir as ferramentas de programador para a ler. Se a chave do BeatFreak Studio for para o `app.js`, qualquer pessoa passa a conseguir ler *e remover* as marcas de todas as tuas entregas, e o rastreio deixa de valer nada.

O campo da chave no separador *Marca de água* está vazio por omissão e o valor só vive na memória da página. Escreve-a quando precisares e fecha o separador quando acabares.

O `data-role="admin"` da Music AO é, no protótipo, um selector de demonstração: qualquer visitante pode carregar em "Admin". Serve para arrumar o menu, não como segurança. Enquanto não houver autenticação a sério, monta o Cleaner com o separador da marca de água escondido em produção:

```js
BeatfreakCleaner.mount(host, { esconder:['wm','reg'] });
```

Com isto continuam disponíveis a limpeza, as etiquetas, a medição, a comparação e o espectro — que não têm segredo nenhum lá dentro.

## Instalação automática

```bash
python3 tools/integrar_musicao.py /caminho/para/musicao-app
python3 tools/integrar_musicao.py /caminho/para/musicao-app --simular   # só mostra o que faria
```

O script copia os dois ficheiros, acrescenta o link do CSS, o item de menu, o `<script>` e a rota. Recusa-se a avançar se não reconhecer os pontos de inserção, e faz cópia de segurança de cada ficheiro que altera.

## Instalação à mão

São quatro edições.

**1.** Copiar `dist/musicao/beatfreak-cleaner.js` para `js/` e `beatfreak-cleaner.css` para `css/`.

**2.** Em `index.html`, a seguir ao `<link>` do `css/style.css`:

```html
<link rel="stylesheet" href="css/beatfreak-cleaner.css">
```

**3.** Ainda no `index.html`, na `<nav class="nav">`, a seguir ao item da Administração:

```html
<a href="#/cleaner" data-route="cleaner" data-role="admin"><span class="nav-ico">◆</span> Audio Cleaner</a>
```

E antes do `<script src="js/app.js">`:

```html
<script src="js/beatfreak-cleaner.js"></script>
```

**4.** Em `js/app.js`, antes do `const routes = {`:

```js
/* ============================================================
   BEATFREAK AUDIO CLEANER  (visível apenas para administração)
   ============================================================ */
function viewCleaner(){
  setTimeout(()=>{
    const host=document.getElementById('cleanerHost');
    if(host && !BeatfreakCleaner.montado()) BeatfreakCleaner.mount(host,{esconder:['wm','reg']});
  },0);
  return `<section class="page">
    <h1 class="page-title">Beatfreak Audio Cleaner</h1>
    <p class="page-sub">Limpeza de metadados, etiquetas, medição de loudness e controlo de entrega. Os ficheiros não saem deste computador.</p>
    <div id="cleanerHost"></div>
  </section>`;
}
```

E dentro do objecto `routes`:

```js
  cleaner: viewCleaner,
```

Se o teu router não usar `innerHTML`, chama `BeatfreakCleaner.mount(host)` depois de a vista estar no DOM — é a única coisa que o módulo precisa.

## Validar uploads de artistas

É aqui que isto rende mais para a plataforma. No fluxo de publicação, antes de aceitar o ficheiro:

```js
const bytes = new Uint8Array(await ficheiro.arrayBuffer());

// opcional, mas é o que apanha o MP3 disfarçado de WAV
let buf = null;
try {
  const ctx = new AudioContext();
  buf = await ctx.decodeAudioData(bytes.slice().buffer);
  ctx.close();
} catch(_) {}

const v = await BeatfreakCleaner.validar(bytes, ficheiro.name, null, { audioBuffer: buf });

if (!v.ok) {
  mostrarErros(v.motivos.filter(m => m.nivel === 'rejeitado'));
  return;
}
if (v.nivel === 'aviso') mostrarAvisos(v.motivos.filter(m => m.nivel === 'aviso'));
guardarMedidas(v.medidas);   // sr, bitsReais, duracao, lufs, truePeak, lra, overs
```

O veredicto vem em três níveis — `aceite`, `aviso`, `rejeitado` — com os motivos já escritos em português para mostrar ao artista.

Recusa por omissão: formato com perdas no catálogo, amostragem abaixo de 44,1 kHz, menos de 16 bit reais, **24 bit com enchimento** (os bits de baixo todos a zero), faixa com menos de 30 segundos, true peak acima de −1 dBTP, e **master com perdas disfarçado de WAV**, detectado pelo corte a pique no espectro.

Avisa, sem recusar: loudness fora de −20 a −6 LUFS, amostras coladas ao fundo de escala, silêncio à cabeça acima de 5 segundos, graves que desaparecem em mono.

Os limites mudam-se passando um objecto no terceiro argumento:

```js
await BeatfreakCleaner.validar(bytes, nome, { duracaoMin:20, truePeakMax:-0.5 }, { audioBuffer:buf });
```

Correr isto no browser do artista poupa a largura de banda de um upload que ia ser recusado — em Luanda isso conta.

## O que o módulo expõe

```js
BeatfreakCleaner.mount(el, {esconder:[...]})   // monta a interface
BeatfreakCleaner.montado()                     // já está montado?
BeatfreakCleaner.validar(bytes, nome, regras, opts)
BeatfreakCleaner.analisar(bytes, nome)         // metadados e estrutura
BeatfreakCleaner.medir(pcm)                    // LUFS, true peak, diagnóstico
BeatfreakCleaner.lerWav(bytes) / escreverWav(pcm)
BeatfreakCleaner.marcar / lerMarca / removerMarca / carga
BeatfreakCleaner.etiquetar(bytes, an, campos, capa, opts)
BeatfreakCleaner.adicionar(ficheiros)          // mete ficheiros na lista da interface
BeatfreakCleaner.sha256(bytes)
BeatfreakCleaner.REGRAS_MUSICAO                // limites por omissão
```

## Peso

O `beatfreak-cleaner.js` tem cerca de 123 kB e o CSS 9 kB, sem dependências. Se preferires não os carregar em todas as visitas, carrega-os só quando a rota abre:

```js
function viewCleaner(){
  if(!window.BeatfreakCleaner){
    const s=document.createElement('script'); s.src='js/beatfreak-cleaner.js';
    const l=document.createElement('link'); l.rel='stylesheet'; l.href='css/beatfreak-cleaner.css';
    document.head.appendChild(l); document.head.appendChild(s);
    s.onload=()=>{ const h=document.getElementById('cleanerHost'); if(h) BeatfreakCleaner.mount(h,{esconder:['wm','reg']}); };
  } else setTimeout(()=>{ /* … como acima … */ },0);
  return '<section class="page"><h1 class="page-title">Beatfreak Audio Cleaner</h1><div id="cleanerHost"></div></section>';
}
```
