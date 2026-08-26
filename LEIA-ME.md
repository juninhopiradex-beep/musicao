# VMusicao — entrega completa

Duas coisas diferentes, em pastas separadas de propósito. **Não se misturam.**

| Pasta | O que é | Onde vive |
|---|---|---|
| `plataforma/` | O site Music AO | Sobe para o GitHub |
| `programa/` | O gerador de música | Corre na tua máquina |
| `mockups/` | Imagens e material para redes sociais | Só para veres |

---

## plataforma/ — o site

É o repositório `musicao` inteiro, já atualizado. Descompacta e leva o
**conteúdo desta pasta** para o repositório.

```
Add file → Upload files → arrasta tudo o que está em plataforma/
```

**Depois do commit, faz hard reload** (`Ctrl+Shift+R`). O service worker guarda
o site em cache — sem isso continuas a ver a versão antiga. Para confirmares
que passou, abre `sw.js` no repositório: deve dizer `musicao-v6`.

Detalhes em `plataforma/COMO-SUBIR.md`.

### O que tem de novo

| Módulo | Onde |
|---|---|
| **Estúdio AI** | Perfil Artista → constrói o prompt e a estrutura da letra |
| **Selos de CD** | Códigos de acesso para edições físicas, com mapa de ativações |
| **Rádio** | Painel de passagens em antena |

Mais duas pastas de apoio, que **não são páginas do site**:

- `plataforma/unlock/` — o backend dos Selos (Cloudflare Worker, deploy à parte)
- `plataforma/radio/` — o monitor de rádio em Python (corre num servidor)

---

## O botão Gerar — como funciona

O site é estático: não pode correr um modelo de IA sozinho. Mas **pode falar
com o gerador a correr na tua máquina**. Os browsers permitem uma página HTTPS
chamar `localhost` — é a exceção que torna isto possível sem túneis nem
certificados.

```
1. No teu computador:   cd programa && python3 servidor.py
2. No site:             Estúdio AI → o botão "Gerar música" aparece sozinho
```

Com o servidor desligado, a caixa mostra o comando para o arrancar e um botão
**Procurar motor**. Com ele ligado, aparece o botão **Gerar música**, a barra
de progresso, e os candidatos com áudio para ouvir — tudo dentro do site.

Se não aparecer: confirma que o servidor está a correr (`http://localhost:7800`
deve abrir) e carrega em **Procurar motor**.

## programa/ — o gerador

Isto **não vai para o GitHub Pages**. É um programa Python que corre no teu
computador. Também tem interface própria em `http://localhost:7800`, se
preferires usá-lo sem passar pelo site.

```bash
cd programa
pip install numpy scipy
sudo apt install ffmpeg        # ou: brew install ffmpeg

python3 servidor.py
```

Abre **http://localhost:7800**.

Por omissão corre com o motor **simulado**: produz áudio sintético, não música.
Serve para veres o programa inteiro a funcionar — fila, progresso, candidatos,
medições, escolha das duas melhores — sem GPU nenhuma.

Com GPU (12 GB mínimo, 24 GB para a melhor qualidade):

```bash
git clone https://github.com/ace-step/ACE-Step-1.5.git
cd ACE-Step-1.5 && pip install -e . && cd -
python3 servidor.py --motor acestep --qualidade estudio
```

Detalhes em `programa/INSTALAR.md`.

---

## O que está testado, e o que não está

**Testado:**

| | |
|---|---|
| Controlo de qualidade | 14 provas · LUFS validado contra o `ebur128` do ffmpeg, dentro de 0,05 dB |
| Blueprint e best-of-N | 36 provas |
| Servidor e interface | Fluxo completo: gerar → progresso → candidatos → áudio a tocar |
| Selos de CD | 21 provas · 12 pedidos em simultâneo, 1 vencedor |
| Monitor de rádio | Contra sinal degradado de emissora, com falsos positivos rejeitados |
| Plataforma | 13 rotas, zero erros, zero recursos em falta |

```bash
cd programa
python3 testes/teste_qc.py
python3 testes/teste_motor.py
```

**Não testado:**

O adaptador do ACE-Step foi escrito a partir da documentação pública, **sem uma
GPU à frente**. Os nomes dos parâmetros do CLI podem ter mudado. Se falhar,
corre `acestep --help` e ajusta a função `gerar` em `programa/motor/provider.py`
— são dez linhas, todas no mesmo sítio.

---

## Três coisas para fazer antes de gastar dinheiro

**1. Aluga uma GPU por horas** no Vast.ai ou RunPod, em vez de comprar. Gera
kizomba, semba e kuduro em português angolano, e ouve. Nenhum benchmark público
cobre estes géneros. Se a pronúncia e o ritmo não convencerem, os números não
interessam.

**2. Confirma a licença do ACE-Step** na página do modelo no HuggingFace. As
fontes oficiais dizem MIT com dados de treino licenciados, mas há uma fonte
secundária a dizer o contrário. O código marca `licenca_verificada: False` de
propósito, e assim deve ficar até alguém ir lá ver.

**3. Faz o primeiro teste de rádio com uma estação só.** O
`programa/../radio/primeiro_teste.py` indexa as tuas faixas, escuta uma hora, e
cruza o que detetou com o que a estação declarou. É assim que se calibra sem
ouvir rádio à mão durante dias.

---

## O que continua por fazer

**Registo de autoria com data verificável** — a opção 2 que discutimos. Cadeia
de hashes, certificado, integração no Music AO. Reaproveita o motor de impressão
digital que já está no monitor de rádio, por isso fica muito mais barata agora
do que ficaria antes.
