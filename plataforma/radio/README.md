# Music AO · Monitor de Rádio

Identifica que músicas do catálogo passaram em cada rádio, a que horas e
durante quanto tempo. É a prova objetiva que o artista angolano hoje não tem.

**Nunca guarda áudio.** Os bytes são descodificados, viram números, e são
descartados. O que fica na base de dados são impressões digitais — não dá
para reconstruir som a partir delas.

## Ficheiros

| Ficheiro | O que faz |
|---|---|
| `fingerprint.py` | O motor: transforma áudio em impressões e identifica |
| `monitor.py` | Liga aos streams e confirma passagens ao longo do tempo |
| `descobrir.py` | Encontra e valida o URL verdadeiro de cada estação |
| `estacoes.json` | As 25 estações angolanas, com os URLs à medida que aparecem |
| `primeiro_teste.py` | **Começa por aqui.** Uma faixa, uma estação, prova a cadeia |
| `metadados.py` | Lê o "a tocar agora" das estações — verdade de referência |
| `radiobrowser.py` | Puxa endereços da base de dados aberta Radio Browser |
| `extrair_streams.py` | Encontra o URL do stream dentro do HTML de uma página |
| `apanhar-streams-consola.js` | Cola na consola do browser e apanha todos os streams de uma vez |
| `gerar_teste.py` | Gera áudio de teste e simula a cadeia de uma emissora |
| `teste_robustez.py` | 21 provas contra sinal degradado |
| `teste_emissao.py` | Uma emissão completa, de ponta a ponta |

## Antes de tudo: o primeiro teste

Não montes 67 estações de uma vez. Prova a cadeia com uma, numa tarde:

```bash
python3 primeiro_teste.py \
  --faixas ./as_minhas_musicas \
  --artista "Piradex" \
  --estacao "Rádio MFM 91.7" \
  --url "https://centova87.instainternet.com/proxy/radiomfm?mp=/live" \
  --metadata "https://centova87.instainternet.com/rpc/radiomfm/streaminfo.get" \
  --minutos 60
```

Indexa as tuas faixas, escuta uma hora, e diz o que detetou. Se der o
`--metadata`, cruza o que o motor detetou com o que a estação declarou —
é assim que se descobre se o limiar está bem posto, sem ouvir rádio à mão.

**Escolhe bem a hora.** Uma hora numa rádio de palavra não prova nada. Vai a
uma estação musical, numa janela de música.

## Instalar

```bash
sudo apt install ffmpeg
pip install numpy scipy
```

## Usar

**0. Quando o URL está escondido.** Algumas rádios põem-no à vista (a MFM
põe-no no rodapé). Outras metem-no dentro do JavaScript do leitor — o site da
RNA é assim. Nesse caso, o mais rápido:

```
F12 (DevTools) → separador Network → filtro "Media"
→ carregar no play da rádio
→ o pedido que aparece É o stream → botão direito → Copy link address
```

Trinta segundos por estação. Em alternativa, guarda a página (Ctrl+S) e corre:

```bash
python3 extrair_streams.py pagina.html
```

**Para sites com muitos canais numa página**, como a RNA (27 de uma vez), cola
o `apanhar-streams-consola.js` na consola do browser (F12 → Console), carrega
no play de cada canal, e escreve `streamsJSON()`. Sai o JSON com nome e
endereço de todos, pronto a colar no `estacoes.json`.

**1. Descobrir os streams.** O myTuner diz que estações existem; não serve
como fonte (os termos proíbem acesso automatizado e os tokens expiram). Abre
o site de cada estação, encontra o URL do stream, e mete-o no `estacoes.json`:

```bash
python3 descobrir.py estacoes.json
```

Confirma que é áudio a sério, que aguenta ligado e que não está mudo.

**2. Indexar o catálogo.**

```python
import fingerprint as fp
cat = fp.Catalogo("catalogo.db")
cat.registar("gostos-antecipados.wav", "Gostos Antecipados", "Piradex")
```

**3. Vigiar.**

```bash
python3 monitor.py estacoes.json
```

## Os metadados das estações

Muitas rádios publicam o que está a tocar num endereço aberto. A Rádio MFM,
por exemplo, corre Centova Cast:

```
stream:    https://centova87.instainternet.com/proxy/radiomfm?mp=/live
metadados: https://centova87.instainternet.com/rpc/radiomfm/streaminfo.get
```

O `metadados.py` lê Centova, Icecast e Shoutcast, e serve para:

1. **Afinar o motor.** Durante o arranque, o que a estação declara é a verdade
   de referência. Cruza-se com o que a impressão digital detetou e ajusta-se o
   `NITIDEZ_MIN` com base em erros reais, não em palpites. É a forma mais
   rápida de calibrar sem ouvir 30 horas de rádio à mão.
2. **Preencher buracos** quando o reconhecimento falha.
3. **Ouvintes online**, que o Centova devolve.

```bash
python3 metadados.py https://centova87.instainternet.com/rpc/radiomfm/streaminfo.get 300
```

**Porque é que não chega e continuamos a precisar da impressão digital:**

- É a estação a declarar-se a si própria. Numa cobrança, a parte interessada
  não pode ser a única fonte da prova.
- Falha muito. Jingles e publicidade aparecem como música, o campo esvazia-se
  nos blocos falados, e há estações que põem só o nome da rádio o dia todo.
  O filtro do `metadados.py` apanha os casos óbvios, mas não todos.
- **Os ouvintes contados são só os de internet.** Numa rádio angolana isso é
  uma fração pequena da audiência, que está em FM. Nunca mostrar este número
  como "quantas pessoas ouviram a música" — seria enganar o artista.

## Como decide

**Camada 1 — a impressão digital.** O áudio vira espetrograma; os picos
(pontos de mais energia) sobrevivem à compressão e ao ruído. Cada pico
liga-se aos seguintes formando pares, e cada par vira um número. Para
identificar, vê-se que faixa partilha muitos pares **com o mesmo
desfasamento no tempo**.

**Camada 2 — a confirmação temporal.** Uma janela isolada não chega. Só se
regista uma passagem quando três janelas seguidas apontam a mesma obra
**com a posição a avançar** os 5 segundos certos. Uma coincidência acerta
numa janela; não acerta em três seguidas com o tempo a andar.

Foi esta segunda camada que eliminou o falso positivo nos testes.

## O que foi medido

Contra sinal que passou pela cadeia de uma emissora — compressão de dinâmica,
equalização, MP3 a 32–64 kbps, ruído, locutor por cima:

| Prova | Resultado |
|---|---|
| Processamento normal + MP3 64k | identifica |
| EQ agressiva + MP3 48k | identifica |
| Banda estreita + MP3 32k | identifica |
| Ruído rosa a −26, −20, −14 dB | identifica |
| Velocidade a −1% e +1% | identifica |
| Locutor sobreposto | identifica |
| Excertos de 5, 7 e 10 segundos | identifica |
| Excerto de 3 segundos | **não identifica** |
| Velocidade a +2% | **não identifica** |
| Faixa fora do catálogo | rejeita |
| Ruído, tom puro, silêncio | rejeita |

Emissão completa de 4,5 minutos com jingle, locutor, quatro faixas do
catálogo e uma faixa desconhecida: **as quatro detetadas, zero falsos
positivos**, início certo com erro de 5 segundos (o passo da janela).

Custo: **37 ms por consulta** de 10 segundos. Uma estação gasta cerca de 1%
de um núcleo. Vinte estações cabem numa máquina modesta.

## Escutar só quando há música

A grelha do Canal A da RNA está no `estacoes.json`, retirada do site oficial.
O Canal A é sobretudo informação: de 168 horas por semana, cerca de **26 são
de música**. Escutar as outras 142 é gastar largura de banda e processador a
analisar noticiários.

Programar o monitor pelas janelas musicais corta o custo em cerca de 85% na
mesma estação. Nas rádios de formato musical, como a MFM, isso não se aplica —
aí vale a pena escutar em contínuo.

Uma janela que vale a pena marcar: **MUSICAL ANGOLANO**, sábado 19h02–20h00 no
Canal A. É uma hora inteira só de música angolana, na rádio pública nacional.

## Limites, ditos com clareza

**Velocidade acima de ±1%.** A impressão é indexada a 0,98 / 0,99 / 1,00 /
1,01 / 1,02. Fora dessa faixa deixa de reconhecer. Se apanhares uma estação
que acelera mais, acrescenta variantes em `Catalogo.VELOCIDADES` — cada uma
aumenta o índice.

**Menos de 5 segundos.** Não é problema real: o monitor ouve continuamente.

**Só apanha o que está no catálogo.** Não descobre música nova — confirma a
que já registaste.

**Só rádios com stream online.** Emissão em FM sem stream exigiria um recetor
físico ligado a um computador em cada cidade. É possível, mas é outro projeto.

**Áudio de teste sintético.** Os testes usaram música gerada, não gravações
reais. Os parâmetros vão precisar de afinação com material angolano a sério —
sobretudo `NITIDEZ_MIN`. O primeiro passo depois de indexares faixas reais é
correr `teste_robustez.py` adaptado a elas.

## Antes de pôr no ar

- [ ] Indexar 20–30 faixas reais e repetir os testes de robustez
- [ ] Gravar 30 minutos de uma rádio e verificar as deteções à mão
- [ ] Afinar `NITIDEZ_MIN` com base nesses resultados
- [ ] Confirmar com cada estação que não há objeção — é emissão pública, mas
      uma conversa evita mal-entendidos
- [ ] Deixar claro no relatório que a deteção é indício técnico, não prova
      jurídica, enquanto não houver acordo com as estações
