# VMusicao

Motor de produção musical assistida por IA. Este pacote contém a parte que
**funciona hoje, sem GPU**: o blueprint, o compilador de prompt, o controlo
de qualidade e a seleção best-of-N. Mais a interface para ligar um motor de
geração quando houver um.

## O que está feito e testado

| Peça | Estado |
|---|---|
| `motor/blueprint.py` | Blueprint universal + compilador de linguagem natural |
| `motor/qc.py` | Análise de qualidade — LUFS, true peak, fase, artefactos |
| `motor/provider.py` | Interface de motores + best-of-N |
| `testes/` | 50 provas, todas a passar |

**O LUFS foi validado contra o `ebur128` do ffmpeg** — a implementação de
referência da norma ITU-R BS.1770-4. Diferença dentro de **0,05 dB** em
quatro níveis de sinal distintos.

O QC apanha, com defeitos injetados de propósito: clipping, silêncio no
início, offset DC, fase invertida, canais desequilibrados, excesso de energia
acima de 10 kHz, NaN, dinâmica esmagada e andamento instável.

## O programa

```bash
python3 servidor.py
```

Abre **http://localhost:7800**. Tem botão Gerar a sério: escreves, carregas,
aparece a barra de progresso, e no fim os candidatos com áudio para ouvir e
as pontuações do QC.

Por omissão corre com o motor **simulado**, que produz áudio sintético — não é
música, serve para veres a cadeia toda a funcionar sem GPU nenhuma.

Quando tiveres a GPU:

```bash
pip install -e .            # dentro da pasta do ACE-Step-1.5
python3 servidor.py --motor acestep --qualidade estudio
```

Qualidades: `rapido` (turbo, 8 passos), `padrao` (base, 30), `estudio` (SFT, 60).

Só usa a biblioteca padrão do Python. Sem Node, sem framework, sem build.

## Correr os testes

```bash
pip install numpy scipy
sudo apt install ffmpeg

python3 testes/teste_qc.py
python3 testes/teste_motor.py
```

Exemplo:

```python
from motor.blueprint import compilar
from motor.provider import Simulado, melhores_de

b = compilar('Kizomba romântica, 88 BPM, voz masculina, em Si menor, sem guitarra elétrica')
print(b.validar())          # avisos, se houver

r = melhores_de(Simulado(), b, n=4, devolver=2)
for c in r['escolhidos']:
    print(c.pontuacao, c.passou_barreira, c.caminho)
```

Trocar `Simulado()` por `AceStep('estudio')` liga o motor real.

## O que NÃO está feito

**A geração de áudio.** O `AceStep` foi escrito a partir da documentação
pública, **sem uma GPU à frente**. Os nomes dos parâmetros do CLI vão precisar
de afinação na primeira utilização. Está marcado no código.

Só existe para verificar: o `Simulado` produz áudio sintético com defeitos
controlados, para exercitar toda a cadeia sem hardware.

## Licenças — ler antes de faturar

| Modelo | Pesos | Comercial |
|---|---|---|
| **ACE-Step 1.5** | MIT (a confirmar) | Sim — dados de treino licenciados |
| Stable Audio 3 | Community, Small/Medium | Abaixo de $1M de receita · **não gera vozes** |
| Eleven Music | Fechado, API | Sim |
| YuE | Apache 2.0 | Sim, mas pesado |
| **MusicGen** | **CC-BY-NC 4.0** | **NÃO** |

O `AceStep.capacidades()` devolve `licenca_verificada: False` de propósito.
Confirma na página oficial do HuggingFace antes de pôr isto a faturar. Uma
fonte secundária afirma que os pesos têm licença proprietária da StepFun, o
que contradiz as fontes oficiais. Não é um detalhe.

## Decisões que valem a pena manter

**Best-of-N.** Gerar quatro e escolher dois melhora a qualidade percebida sem
trocar de modelo. Não é gerar melhor — é escolher melhor.

**Barreira de qualidade que não esconde tudo.** Se nenhum candidato passar,
devolve-se o melhor com o aviso. Mostrar nada é pior do que mostrar com a nota.

**Duas fases.** Gerar em turbo para o utilizador escolher; gastar o modelo
grande só na versão escolhida. É o que mais poupa em infraestrutura.

**Blueprint como linguagem interna.** Nenhuma parte da aplicação fala a
sintaxe de um motor concreto. Trocar de motor é escrever um adaptador.

## O que falta decidir, e não se decide em código

O ACE-Step nunca foi testado em kuduro, semba, kizomba e português angolano.
Nenhum benchmark público cobre isso. Antes de investir numa GPU, aluga uma
por umas horas e ouve. Se a pronúncia e o ritmo não convencerem, não interessa
o que dizem os números.
