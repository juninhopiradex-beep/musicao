# Music AO — Protótipo Funcional

**A tua música, o teu dinheiro.** Protótipo navegável da plataforma angolana de streaming e monetização musical. 100% estático (HTML + CSS + JavaScript vanilla) — corre diretamente no GitHub Pages, sem build step e sem dependências.

## O que está funcional nesta demo

| Área | Funcionalidade |
|---|---|
| **Player** | Reprodução com áudio generativo (Web Audio) por género/BPM/tom, barra de progresso, fila, equalizador animado |
| **Modelo A — Carteira** | Recargas de **500 · 1.000 · 2.000 · 5.000 · 10.000 AKZ**, saldo persistente, histórico financeiro com data/hora |
| **Modelo B — Subscrição** | Plano **Premium 25.000 AKZ/mês** com ativar/cancelar e validade automática; streaming e downloads ilimitados sem descontar saldo (o artista continua a receber) |
| **Cobrança de streaming** | Débito de **10 Kz** aos 5 s de reprodução (30 s em produção); mensagem oficial de saldo terminado |
| **Downloads** | Compra a **100 Kz**, licença registada, re-download gratuito |
| **Portal do artista** | Upload drag & drop, validação simulada, taxa de **1.000 Kz**, fila de moderação, **IBAN obrigatório** no registo |
| **Contabilidade do artista** | **Contador histórico** (nunca reinicia) + **contador financeiro** (pendente, zera após pagamento) lado a lado no painel |
| **Gerador de Pagamentos PSX** | Módulo admin: selecionar artistas e período, ver totais, gerar e exportar ficheiro bancário (débito único → múltiplos créditos), com **Reinício Inteligente** e proteção contra pagamento duplicado |
| **Administração** | KPIs globais, fila de moderação (aprovar/rejeitar), eventos de fraude |
| **Transparência** | Contador ao vivo de AKZ pagos aos artistas em cada faixa e no hero |
| **Perfis** | Comutador demo Ouvinte / Artista / Admin na barra lateral |

Todos os dados são fictícios e o estado (saldo, licenças, subscrição, uploads, perfil de artista) fica guardado no browser (localStorage).

### Registo de artista (onboarding obrigatório)

Ao entrar no portal do artista pela primeira vez, é obrigatório criar o perfil antes de publicar: **Nome completo, BI e IBAN são obrigatórios**; o BI é validado pelo formato oficial angolano (`^\d{9}[A-Z]{2}\d{3}$`) e o **IBAN é validado com o algoritmo de checksum ISO 7064 MOD-97** (AO + 23 dígitos). É obrigatório carregar uma fotografia. Taxa de inscrição de 10.000 Kz debitada da carteira.

### Privacidade dos valores

Os **valores arrecadados nunca aparecem em páginas abertas** — os perfis públicos mostram apenas seguidores, faixas e plays. Os ganhos são visíveis só no painel privado do artista (Total arrecadado + Valor por receber) e ficam registados na conta de administração com histórico completo.

### Transferência de saldo entre utilizadores

Na carteira, qualquer utilizador com saldo pode **transferir créditos para outro utilizador** (por telefone ou ID), com confirmação e recibo no histórico.

### Instalável como app (PWA) — Android, iOS e tablet

Inclui `manifest.webmanifest` + service worker (`sw.js`), pelo que a plataforma é **instalável no ecrã inicial** de Android, iOS e tablets, com ícone próprio e funcionamento em ecrã cheio. É totalmente responsiva (breakpoints de telemóvel, tablet e desktop).

### Caminho para apps nativas iOS/Android

O protótipo é uma PWA — já instalável hoje. Para publicar nas lojas: (1) empacotar a PWA com **Capacitor** ou **Trusted Web Activity** (Android) para gerar apps nativas rapidamente; ou (2) na versão de produção, reescrever o cliente em **React Native/Expo** partilhando o design system, publicando na App Store e Google Play. O backend e a API (ver `musicao_openapi.yaml`) servem web e nativo sem alterações.

### Regras financeiras implementadas (conforme especificação)

- **Preços:** Play 10 AKZ · Download 100 AKZ · Upload 1.000 AKZ · Registo de artista 10.000 AKZ · Premium 25.000 AKZ/mês
- **Controlo de saldo:** antes de cada play/download valida saldo; se insuficiente bloqueia com a mensagem *"O seu saldo terminou. Efetue uma nova recarga para continuar a ouvir ou descarregar músicas."*
- **Dois contadores por artista:** histórico (acumulado desde sempre) e financeiro (apenas o pendente de pagamento)
- **Ficheiro PSX:** cabeçalho + linha de débito único da conta da plataforma + múltiplas linhas de crédito (IBAN, nome, NIF, valor, descrição, referência, data, moeda, banco, nº interno, estado PAGO), com checksum
- **Reinício inteligente:** após gerar o PSX, o contador pendente zera e o histórico mantém-se — nunca repete pagamentos

## Rodar no GitHub Pages

```bash
# 1. cria o repositório e faz push
git init
git add .
git commit -m "Music AO — protótipo v1"
git branch -M main
git remote add origin https://github.com/<o-teu-user>/musicao.git
git push -u origin main
```

2. No GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**
3. Em ~1 minuto fica disponível em `https://<o-teu-user>.github.io/musicao/`

O ficheiro `.nojekyll` já está incluído para o Pages servir os assets diretamente.

## Rodar localmente

Basta abrir o `index.html` no browser, ou:

```bash
npx serve .        # ou: python3 -m http.server 8080
```

## Estrutura

```
index.html          shell da SPA (router por hash)
css/style.css       design system — preto profundo, vermelho e dourado, Unbounded + Sora
js/data.js          catálogo demo (artistas, faixas, géneros, séries de receita)
js/audio.js         motor Web Audio — groove generativo por género/BPM/tom
js/app.js           router, vistas, player, wallet, upload, dashboards, moderação
```

## Próximos passos (produção)

Este protótipo implementa a UX descrita no **Music_AO_Blueprint_v1.0.docx**. Para produção: substituir o motor de áudio por HLS assinado (CloudFront), ligar a REST API (`musicao_openapi.yaml`) e a base de dados (`musicao_schema.sql`), e ativar os gateways reais de pagamento (EMIS/Stripe).

---
© 2026 Music AO · Protótipo de demonstração · Dados fictícios
