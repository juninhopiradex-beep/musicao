# BeatFreak · Desbloqueio por CD

Cada CD leva um cartão selado com um código. O QR da capa abre a página de
validação, o comprador escreve o código, e o acesso digital abre. Uma vez só.

O Worker serve **a página e a API na mesma origem**. Um único deploy, um único
domínio, sem CORS — e a página nunca fica dessincronizada do backend.

## Ficheiros

| Ficheiro | O que é |
|---|---|
| `gerador-chaves.html` | Gera os códigos e as folhas para impressão. Offline, na tua máquina. |
| `worker.js` | O backend. Serve a página, valida e marca como usado. |
| `page.js` | A página, embebida no Worker. Editas aqui; não há passo de build. |
| `unlock.tpl.html` | A mesma página como ficheiro solto, para editares com conforto. |
| `schema.sql` | Tabelas da base de dados. |
| `importar.js` | Converte o CSV do gerador em SQL. |
| `wrangler.toml` | Configuração do Cloudflare. |

## O endereço do QR

**Regra que não se desfaz depois:** usa domínio próprio.

O endereço fica impresso para sempre em centenas de discos que vão estar em casa
de pessoas daqui a anos. Com domínio teu (`unlock.musicao.ao`), mudas de servidor
quando quiseres e os CDs continuam a abrir. Com `algo.workers.dev`, ficas preso
ao fornecedor — e no dia em que mudares, os discos vendidos deixam de funcionar.

Curto também importa: menos caracteres, QR menos denso, módulos maiores no mesmo
espaço impresso, melhor leitura em papel brilhante. Por isso a rota é `/u/ga` e
não `/unlock/gostos-antecipados-2026`.

```
QR impresso  →  https://unlock.musicao.ao/u/ga
                                          └── tem de bater certo com a chave em ALBUMS
```

## Instalar (uma vez)

```bash
npm install -g wrangler
wrangler login

wrangler d1 create beatfreak-unlock
# copia o database_id para o wrangler.toml

wrangler d1 execute beatfreak-unlock --remote --file=schema.sql

# os segredos — gera cada um com:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
wrangler secret put HMAC_SECRET     # o MESMO que está no cofre do lote
wrangler secret put TOKEN_SECRET    # outro, diferente
wrangler secret put ADMIN_TOKEN     # à tua escolha

wrangler deploy
```

Depois, no painel da Cloudflare: **Workers → o teu worker → Settings → Domains &
Routes → Add custom domain** → `unlock.musicao.ao`.

O `HMAC_SECRET` tem de ser exatamente o do cofre que gerou as chaves.
Se forem diferentes, nenhum código passa.

## Carregar um lote

```bash
node importar.js chaves-backend-gostos-antecipados-lote001.csv ga > carregar.sql
wrangler d1 execute beatfreak-unlock --remote --file=carregar.sql
```

O `ga` no fim é o slug do álbum. Tem de ser o mesmo em três sítios: no URL do QR,
na chave de `ALBUMS` (worker.js) e neste comando. Se não bater, o código valida
mas não aparecem links.

Só entram hashes SHA-256. Se a base de dados vazar, não dá para desbloquear nada.

## Editar a página

`page.js` é a página inteira dentro de um template literal. Editas e fazes deploy.
Uma limitação: **não uses crases nem `${` dentro do HTML** — partiriam o ficheiro.
Por isso o JavaScript da página usa concatenação de strings.

Se preferires trabalhar no ficheiro solto, edita `unlock.tpl.html` e depois:

```bash
node -e "const f=require('fs');f.writeFileSync('page.js','export const PAGE = \`'+f.readFileSync('unlock.tpl.html','utf8')+'\`;\n')"
```

Abrir `unlock.tpl.html` diretamente no browser entra em modo demonstração
(valida no browser, não guarda nada) e mostra uma barra amarela.

## Vários álbuns

```js
const ALBUMS = {
  'ga': { title:'Gostos Antecipados', artist:'Piradex', prefix:'GA', ... },
  'xy': { title:'Outro Álbum',        artist:'Outro',   prefix:'XY', ... },
};
```

Cada álbum tem o seu prefixo e a sua rota: `/u/ga`, `/u/xy`. É esta a forma que
vai virar multi-tenant quando entrar no Music AO — cada artista com o seu segredo.

## O que fica atrás da porta

Está em `ALBUMS`, no servidor. Se estivesse no HTML, qualquer pessoa lia os links
sem código nenhum.

Downloads exclusivos: mete os ficheiros num bucket R2 e usa a chave em `extra[].key`.
O Worker devolve links assinados que expiram em 15 minutos.

## Painel

```bash
# quantas chaves já foram usadas
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://unlock.musicao.ao/api/admin/stats

# libertar uma chave (trocou de telemóvel, formatou, etc.)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"serial":"0042","album":"ga"}' https://unlock.musicao.ao/api/admin/release

# bloquear
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"serial":"0042","album":"ga"}' https://unlock.musicao.ao/api/admin/block
```

## Antes da primeira prensagem

- [ ] Domínio próprio ligado ao Worker, e é esse que está no QR
- [ ] Imprime uma folha de teste e faz scan do QR com o telemóvel
- [ ] Corre um código real de ponta a ponta no telemóvel, com dados móveis
- [ ] Confirma que o segundo aparelho vê "já foi usado"
- [ ] Confirma que aparecem os links depois de validar (slug certo nos três sítios)
- [ ] Guarda o cofre `.json` em dois sítios separados
- [ ] Testa o `/api/admin/release` — vais precisar dele
