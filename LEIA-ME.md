# Audio Cleaner na Music AO — ficheiros para subir

Feito contra o teu repositório real (`juninhopiradex-beep/musicao`, commit `ea88e93`),
com o site a correr e testado no Chromium.

## O que subir

Arrasta estes **quatro** ficheiros para o repositório, respeitando as pastas:

```
index.html          ← alterado
sw.js               ← alterado  (cache musicao-v6 → v7)
js/app.js           ← alterado
js/beatfreak-cleaner.js   ← novo
```

No GitHub: **Add file → Upload files**, arrasta, e confirma que o `beatfreak-cleaner.js`
fica dentro de `js/`. Depois do commit, abre o site e faz **Ctrl+Shift+R uma vez** —
o service worker guarda o site em cache e sem isso continuas a ver a versão antiga.

Não há ficheiro de CSS: os estilos viajam dentro do JS.

## O que foi alterado, linha a linha

**index.html** — um item no menu, a seguir à Administração:
`<a href="#/cleaner" data-route="cleaner" data-role="admin">◆ Audio Cleaner</a>`,
e um `<script src="js/beatfreak-cleaner.js">` antes do `js/app.js`.

**js/app.js** — a função `viewCleaner()` antes do `const routes`, e `cleaner: viewCleaner`
dentro do objecto. Mais nada foi tocado: as tuas 15 rotas ficaram como estavam.

**sw.js** — cache `musicao-v6` → `musicao-v7` e o ficheiro novo na lista de pré-guardados.

## Verificado

- 16 rotas carregam, nenhuma vazia, zero erros de JavaScript, zero 404
- o Cleaner monta, e volta a montar quando sais e regressas à rota
- limpeza de um WAV com `bext`: áudio intacto, hash igual antes e depois
- montado em **shadow DOM**: o CSS da Music AO não entra e o do Cleaner não sai

## A marca de água está escondida

Por omissão o módulo monta com `esconder:['wm','reg']`. Ficam a limpeza, as etiquetas,
a medição, a comparação e o espectro.

A razão é séria: tudo o que chega ao browser é público. Se a chave do BeatFreak Studio
for parar ao código da Music AO, qualquer pessoa consegue ler **e remover** as marcas de
todas as tuas entregas. E o `data-role="admin"` é o selector de demonstração — qualquer
visitante carrega em Admin. A marca de água continua no ficheiro único do estúdio, onde
a chave só existe no teu computador.

Para a activares um dia, tira o `esconder` da chamada em `viewCleaner()` — mas só depois
de teres autenticação a sério.
