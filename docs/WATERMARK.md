# BFS-1 — marca de água BeatFreak Studio

Espalhamento em quadratura sobre uma banda estreita, com chave, reversível de forma exacta.

## Ideia

O sinal da marca é ruído de banda limitada gerado por uma sequência determinística a partir de três coisas: a **chave**, o **índice do bloco** e a **carga útil**. Quem tiver a chave consegue gerar exactamente o mesmo sinal e subtraí-lo. Quem não a tiver não consegue nem uma coisa nem outra.

A amplitude segue o sinal, mas de forma **quantizada em degraus de 3 dB**, para poder ser recalculada a partir do ficheiro já marcado. É esse o truque que torna a remoção exacta: no momento de remover, o RMS do bloco marcado dá o mesmo degrau que o RMS do bloco original dava, porque a marca está 42 dB abaixo e não chega para mudar o degrau.

## Parâmetros

| | |
|---|---|
| Bloco | 32768 amostras (0,74 s a 44,1 kHz), sem sobreposição |
| Extremos de cada bloco | 512 amostras de subida e descida em cosseno elevado |
| Banda | `alta` 15–20 kHz · `media` 4–9 kHz, limitada a 0,47·fs |
| Carga útil | 128 bits |
| Bins por bit | ~28 a 44,1 kHz, distribuídos por toda a banda |
| Nível | RMS do bloco menos 42 dB (48 ou 36 também disponíveis) |
| Silêncio | blocos abaixo de −58 dBFS ficam sem marca |
| Degrau do envelope | 3 dB |

## Carga útil

16 bytes:

| bytes | conteúdo |
|---|---|
| 0–2 | `BFS` |
| 3 | versão (1) |
| 4–9 | 48 bits do SHA-256 do nome da faixa ou sessão |
| 10–11 | dias desde 2000-01-01 |
| 12–13 | número da cópia |
| 14–15 | CRC-16/CCITT dos bytes 0–13 |

O magic e o CRC dão 40 bits de verificação. A probabilidade de uma leitura aleatória passar por válida é da ordem de 2⁻⁴⁰, o que dispensa estatística sofisticada: ou a carga é válida, ou não há marca.

## Como o sinal é construído

1. `SHA-256(chave + "|bins-" + banda + "-" + fs)` semeia um gerador `sfc32`, que baralha os pares de bins da banda. Cada bit fica com um conjunto fixo de pares, espalhados por toda a banda.
2. Para cada bloco `b`, `SHA-256(chave + "|q-" + b)` semeia outro `sfc32`, que dá a cada bin um par de sinais de quadratura em `{−1,+1}` — sem trigonometria, para ser determinístico em qualquer motor de JavaScript.
3. O espectro do bloco recebe, em cada bin do bit `i`, o sinal de quadratura multiplicado por `+1` ou `−1` conforme o bit. A simetria hermitiana é imposta para a IFFT dar um sinal real.
4. IFFT, normalização para RMS unitário, subida e descida nos extremos.
5. Multiplicação pelo ganho do bloco e soma ao áudio, com arredondamento ao inteiro.

## Leitura

FFT de cada bloco, dividida pelo ganho do bloco, correlacionada com os sinais de quadratura de cada bit e acumulada ao longo de todo o ficheiro. O sinal da soma dá o bit.

Em paralelo corre a mesma correlação com uma **chave de controlo** derivada da mesma chave. É o nível de ruído medido no próprio ficheiro. A razão entre as duas é a *margem*, em dB. Num ficheiro marcado e intacto anda pelos 18 dB; num ficheiro sem marca fica à volta de 0.

## Remoção

Lê a carga útil, reconstrói o sinal bloco a bloco com os bits lidos, subtrai e arredonda. Se a leitura falhar, não há remoção — não há como reconstruir às cegas.

O erro de arredondamento da gravação é no máximo meio LSB, e portanto a subtracção seguida de arredondamento devolve a amostra original. Nos testes com material de 16 bit e 25 segundos, a diferença é de zero amostras em 2 205 000, e o SHA-256 do PCM bate certo com o do original.

## Onde falha

- **Codecs com perdas.** O MP3 e o AAC deitam fora a banda dos 15–20 kHz. A banda `media` sobrevive um pouco melhor, mas a filtragem também a destrói.
- **Reamostragem e filtragem.** Rodam a fase de cada bin e a correlação deixa de somar.
- **Cortes no início.** A leitura assume que os blocos começam na amostra 0. Um corte à cabeça desalinha tudo. Um sincronismo por correlação circular resolveria isto e é o próximo passo óbvio.
- **Alterações depois de marcar.** A marca ainda se lê, mas a remoção deixa resíduo, porque a amplitude reconstruída já não corresponde à que está no ficheiro.

## O que não é

Não é uma marca forense. Uma marca forense a sério é desenhada para sobreviver a gravação com microfone, compressão pesada e edição, e para resistir a ataques de conluio entre várias cópias. Esta é uma marca de **rastreio de entregas lossless**: dizer que cópia é aquela e de que dia, no WAV que saiu do estúdio.
