# Como subir para o GitHub

Este zip é o repositório **musicao** completo e já atualizado. Descompacta e
arrasta **o conteúdo da pasta** (não a pasta em si) para o repositório.

```
github.com/juninhopiradex-beep/musicao
   → Add file → Upload files
   → arrasta tudo o que está dentro deste zip
   → Commit changes
```

O GitHub substitui o que já existe e cria o que é novo. Em cerca de um minuto o
Pages reconstrói.

**Depois do commit, faz hard reload** (Ctrl+Shift+R). Em telemóvel, fecha a app
do ecrã inicial e volta a abrir — o service worker guarda o site em cache e sem
isto continuas a ver a versão antiga.

---

## O que mudou nesta atualização

**Novo — módulo Selos de CD**

```
js/selos.js       o módulo: criar edições, gerar códigos, exportar, imprimir
js/qr.js          codificador QR, sem dependências
css/selos.css     estilos, só classes .sl-*
```

**Alterado**

```
index.html        4 linhas acrescentadas (css, link na barra lateral, 2 scripts)
sw.js             cache v1 → v2 e os ficheiros novos na lista
README.md         secção sobre os selos
```

O `js/app.js` **não foi tocado**. O módulo auto-regista-se no router, por isso as
150 KB de código a funcionar ficam exatamente como estavam.

**Novo — pastas de apoio**

```
unlock/           backend de validação (Cloudflare Worker) — deploy separado
ferramentas/      gerador de chaves offline, funciona sem a plataforma
.nojekyll         impede o Jekyll de processar os ficheiros no Pages
```

---

## Antes de vender CDs a sério

O endereço do QR está em `js/selos.js`, linha ~19:

```js
var UNLOCK_BASE = 'https://unlock.musicao.ao';
```

**Muda para o teu domínio.** Fica impresso para sempre nos discos — se mudar
depois, os CDs já vendidos deixam de abrir. Nunca uses um `workers.dev`: prende-te
ao fornecedor.

Depois segue o `unlock/README.md` para pôr o Worker no ar. Sem ele, os códigos
geram-se e imprimem-se, mas ninguém os consegue validar.

---

## Uma limpeza opcional

O repositório tem cópias antigas na raiz que já não são usadas por nada:

```
app.js       (65 KB — a versão a sério é js/app.js, com 150 KB)
data.js      (desatualizado face a js/data.js)
style.css    (desatualizado face a css/style.css)
audio.js     (igual a js/audio.js, mas duplicado)
```

O `index.html` carrega só as versões em `js/` e `css/`. As da raiz são restos de
um commit antigo. Não as incluí alteradas nem as apaguei — apagar ficheiros no
GitHub tem de ser feito à mão, ficheiro a ficheiro. Quando tiveres um minuto,
vale a pena, para não haver dúvidas sobre qual é o ficheiro bom.

---

## Testado antes de entregar

| | |
|---|---|
| 13 rotas | Todas carregam, zero erros de JavaScript |
| Recursos | Nenhum 404 |
| Perfis | Selos de CD só aparece a artistas |
| Saldo insuficiente | Bloqueia e não cria a edição |
| 500 códigos | 500 gerados, 500 únicos |
| Folhas A4 | 10 cartões por página, 20 em 20 QR lidos por descodificador |
| Persistência | Edições sobrevivem ao reload |
| Gerador offline | Funciona dentro de `ferramentas/` |
