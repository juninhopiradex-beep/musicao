/* ============================================================
   MUSIC AO · Resultado do VMusicao
   DADOS REAIS: candidatos gerados e medidos pelo motor
   (vmusicao/motor/qc.py). As pontuacoes, os problemas e as
   medicoes sao os que o QC devolveu — nao sao inventados.
   Audio produzido pelo motor Simulado, para exercitar a cadeia
   sem GPU. Em producao vem do ACE-Step.
   ============================================================ */
var VMDados = {
 "blueprint": {
  "titulo": "Gostos Antecipados",
  "genero": "afrohouse",
  "duracao_s": 180,
  "bpm": 122,
  "tonica": "B",
  "escala": "menor",
  "compasso": "4/4",
  "voz": "masculina",
  "idioma": "pt-AO",
  "ambiente": [
   "emotional"
  ],
  "instrumentos": [
   "organic percussion",
   "deep sub bass",
   "atmospheric pads"
  ],
  "excluir": [
   "no trap hi"
  ],
  "estrutura": "classica",
  "letra": "",
  "seed": null
 },
 "prompt_acestep": "afro house, organic percussion, hypnotic groove, emotional, organic percussion, deep sub bass, atmospheric pads, emotional male vocal, Portuguese lyrics, 122 BPM, B minor",
 "avisos": [
  "sem letra: o motor vai inventar — usa \"instrumental\" se não queres voz"
 ],
 "resumo": {
  "gerados": 4,
  "validos": 4,
  "acima_do_minimo": 4,
  "abaixo_do_minimo": 0,
  "segundos_gpu": 1.6,
  "aviso": null
 },
 "candidatos": [
  {
   "seed": 39300,
   "pontuacao": 83,
   "passou": true,
   "escolhido": true,
   "eixos": {
    "tecnica": 99,
    "dinamica": 40,
    "estereo": 66,
    "espectro": 100,
    "estrutura": 100,
    "total": 83
   },
   "problemas": [],
   "lufs": -13.38,
   "tp": -1.93,
   "lra": 0.41,
   "corr": 0.311,
   "crista": 10.15,
   "bpm": 122.3,
   "seg": 0.4
  },
  {
   "seed": 39299,
   "pontuacao": 77,
   "passou": true,
   "escolhido": true,
   "eixos": {
    "tecnica": 80,
    "dinamica": 39,
    "estereo": 66,
    "espectro": 100,
    "estrutura": 100,
    "total": 77
   },
   "problemas": [
    "offset DC de 0.05079"
   ],
   "lufs": -13.41,
   "tp": -1.41,
   "lra": 0.05,
   "corr": 0.329,
   "crista": 10.57,
   "bpm": 137.2,
   "seg": 0.4
  },
  {
   "seed": 39302,
   "pontuacao": 74,
   "passou": null,
   "escolhido": false,
   "eixos": {
    "tecnica": 100,
    "dinamica": 42,
    "estereo": 67,
    "espectro": 100,
    "estrutura": 56,
    "total": 74
   },
   "problemas": [
    "5.0s de silêncio no início"
   ],
   "lufs": -13.36,
   "tp": -1.93,
   "lra": 0.39,
   "corr": 0.344,
   "crista": 10.84,
   "bpm": 123.6,
   "seg": 0.4
  },
  {
   "seed": 39301,
   "pontuacao": 60,
   "passou": null,
   "escolhido": false,
   "eixos": {
    "tecnica": 34,
    "dinamica": 23,
    "estereo": 70,
    "espectro": 100,
    "estrutura": 100,
    "total": 60
   },
   "problemas": [
    "346434 amostras clipadas",
    "true peak a 0.03 dBTP — vai distorcer ao codificar"
   ],
   "lufs": -4.96,
   "tp": 0.03,
   "lra": 0.15,
   "corr": 0.457,
   "crista": 5.78,
   "bpm": 117.2,
   "seg": 0.4
  }
 ]
};
