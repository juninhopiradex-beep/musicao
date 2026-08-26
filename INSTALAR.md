# VMusicao — instalar

## 1. Hoje, sem GPU (5 minutos)

```bash
pip install numpy scipy
sudo apt install ffmpeg        # ou: brew install ffmpeg

python3 servidor.py
```

Abre **http://localhost:7800** e carrega em **Gerar**.

Vais ouvir áudio sintético, não música — é o motor simulado. Serve para veres
o programa inteiro a funcionar: fila, progresso, candidatos, medições, escolha
das duas melhores.

## 2. Com GPU, a sério

Precisas de uma placa NVIDIA com **pelo menos 12 GB** de VRAM. Com 24 GB
(RTX 3090, 4090) corre a variante de melhor qualidade sem cortes.

```bash
git clone https://github.com/ace-step/ACE-Step-1.5.git
cd ACE-Step-1.5
pip install -e .

# voltar à pasta do VMusicao
python3 servidor.py --motor acestep --qualidade estudio
```

Na primeira geração o modelo descarrega sozinho (uns GB).

### Se falhar

O adaptador do ACE-Step foi escrito a partir da documentação pública, **sem
uma GPU à frente**. Os nomes dos parâmetros do CLI podem ter mudado. Corre
`acestep --help` e ajusta a função `gerar` em `motor/provider.py` — são umas
dez linhas, está tudo num sítio só.

## 3. Sem placa própria

Aluga por horas em Vast.ai, RunPod ou Lambda. Uma RTX 4090 anda por cêntimos
à hora. Para o primeiro teste chega bem.

**Faz isto antes de comprar hardware.** Gera kizomba, semba e kuduro em
português angolano e ouve. Nenhum benchmark público cobre estes géneros. Se a
pronúncia e o ritmo não convencerem, não interessa o que dizem os números.

## Antes de faturar

O `licenca_verificada` está a `False` de propósito. As fontes oficiais indicam
MIT com dados de treino licenciados, mas há uma fonte secundária a dizer o
contrário. Confirma na página do modelo no HuggingFace.
