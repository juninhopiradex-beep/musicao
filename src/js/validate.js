/* =========================================================================
   validate.js — porta de entrada para uploads da Music AO

   Devolve um veredicto sobre um ficheiro entregue por um artista, sem
   depender de interface. Serve para o fluxo de publicação recusar um MP3
   disfarçado de WAV antes de ele entrar no catálogo.
   ========================================================================= */

const REGRAS_MUSICAO={
  formatos:['WAV','FLAC','AIFF','AIFC'],   // sem perdas para o master de catálogo
  formatosAviso:['MP3','M4A'],
  bitsMin:16,
  srMin:44100,
  duracaoMin:30,
  duracaoMax:960,
  truePeakMax:-1.0,
  lufsMin:-20,
  lufsMax:-6,
  silencioCabecaMax:5,
  recusarLossyDisfarcado:true
};

/* bytes: Uint8Array do ficheiro. audioBuffer é opcional e só serve para a
   análise espectral (detecção de origem em codec com perdas). */
async function validarEntrega(bytes,nome,regras,opts){
  const R={...REGRAS_MUSICAO,...(regras||{})};
  opts=opts||{};
  const motivos=[], out={ok:false,nivel:'rejeitado',motivos,ficheiro:nome};
  const falha=(t,d)=>motivos.push({cls:'hit',nivel:'rejeitado',t,d});
  const aviso=(t,d)=>motivos.push({cls:'info',nivel:'aviso',t,d});
  const bom  =(t,d)=>motivos.push({cls:'clear',nivel:'aceite',t,d});

  const an=analyze(bytes,nome);
  if(!an){ falha('Ficheiro ilegível','Não foi possível interpretar este ficheiro como áudio.'); return out; }
  out.formato=an.fmt;
  out.metadados=an.blocks.filter(b=>b.kind!=='core').length;

  const lossless=R.formatos.includes(an.fmt);
  if(!lossless&&!R.formatosAviso.includes(an.fmt)){
    falha('Formato não aceite','O catálogo aceita '+R.formatos.join(', ')+'. Este ficheiro é '+an.fmt+'.');
    return out;
  }
  if(!lossless) aviso('Formato com perdas','Aceite para pré-escuta, mas para distribuição é preciso o master em '+R.formatos.join(' ou ')+'.');

  let pcm=pcmFromWav(bytes);
  if(!pcm&&opts.audioBuffer) pcm=pcmFromAudioBuffer(opts.audioBuffer,24);
  if(!pcm){ aviso('Sem leitura das amostras','O formato foi reconhecido mas não foi possível medir o áudio neste contexto.'); out.nivel='aviso'; out.ok=true; return out; }

  const m=await measure(pcm);
  out.medidas={sr:m.sr,ch:m.ch,bitsDeclarados:m.bits,bitsReais:m.depth.bits,
    duracao:m.duration,lufs:m.integrated,truePeak:m.truePeak,lra:m.lra,
    picoAmostra:m.samplePeak,cliques:m.clip.runs,overs:(m.overs||[]).length};

  if(m.sr<R.srMin) falha('Amostragem abaixo do mínimo','O ficheiro está a '+m.sr+' Hz e o mínimo é '+R.srMin+' Hz.');
  if(!pcm.isFloat&&m.depth.bits<R.bitsMin)
    falha('Profundidade abaixo do mínimo','Tem '+m.depth.bits+' bit reais e o mínimo é '+R.bitsMin+'.');
  if(m.depth.padded>=4&&lossless)
    falha('Profundidade declarada a mais','O cabeçalho diz '+m.bits+' bit mas os '+m.depth.padded+
      ' bits de baixo estão sempre a zero. Isto é um '+m.depth.bits+' bit com enchimento.');
  if(m.duration<R.duracaoMin) falha('Faixa curta demais',timeFmt(m.duration)+', e o mínimo é '+R.duracaoMin+' segundos.');
  if(m.duration>R.duracaoMax) aviso('Faixa longa',timeFmt(m.duration)+' — confirma que não é uma mistura contínua.');
  if(m.truePeak>R.truePeakMax)
    falha('True peak acima do tecto','Está a '+m.truePeak.toFixed(2)+' dBTP e o tecto é '+R.truePeakMax.toFixed(1)+
      ' dBTP. Acima disto a codificação para streaming distorce.');
  if(m.integrated>R.lufsMax) aviso('Muito alto','A '+m.integrated.toFixed(1)+' LUFS as plataformas vão baixar o volume e a faixa fica sem dinâmica.');
  if(m.integrated<R.lufsMin) aviso('Muito baixo','A '+m.integrated.toFixed(1)+' LUFS a faixa vai soar fraca ao lado das outras.');
  if(m.clip.runs>0) aviso('Amostras coladas ao fundo de escala',m.clip.runs+' troços. É sinal de um master já esmagado ou de uma conversão que passou do topo.');
  if(m.silence.headSec>R.silencioCabecaMax) aviso('Silêncio à cabeça',m.silence.headSec.toFixed(1)+' s antes do primeiro som.');
  if(m.bassMonoLoss!=null&&m.bassMonoLoss<-4) aviso('Graves desaparecem em mono','Perdem-se '+m.bassMonoLoss.toFixed(1)+' dB abaixo de 120 Hz ao somar para mono.');

  // origem em codec com perdas disfarçada de master
  if(opts.audioBuffer&&lossless){
    try{
      const sp=await spectral(opts.audioBuffer,()=>{});
      const pv=provenance(sp);
      out.medidas.corteEspectral=pv.cutoff;
      if(pv.lossy){
        const msg='O espectro corta a pique aos '+(pv.cutoff/1000).toFixed(1)+' kHz. Isto não é um master sem perdas: passou por '+pv.guess+' e foi descodificado outra vez.';
        if(R.recusarLossyDisfarcado) falha('Master com perdas disfarçado de '+an.fmt,msg);
        else aviso('Origem com perdas',msg);
      } else bom('Origem sem perdas','O topo do espectro chega perto de Nyquist sem corte abrupto.');
    }catch(_){ }
  }

  // marca de água, apenas informativo
  if(opts.chave){
    try{
      const d=await wmDetect(pcm,opts.chave,opts.wm||{});
      if(d.found){ out.marca={copia:d.info.copy,faixa:d.info.trackId,data:d.info.date};
        aviso('Traz uma marca do estúdio','Cópia '+d.info.copy+', de '+d.info.date.toISOString().slice(0,10)+'. Confirma que é a versão certa para publicar.'); }
    }catch(_){ }
  }

  const rej=motivos.filter(x=>x.nivel==='rejeitado').length;
  const avi=motivos.filter(x=>x.nivel==='aviso').length;
  out.nivel=rej?'rejeitado':(avi?'aviso':'aceite');
  out.ok=!rej;
  if(out.ok&&!avi) bom('Pronto para publicar',an.fmt+' a '+m.sr+' Hz, '+m.depth.bits+' bit, '+
    m.integrated.toFixed(1)+' LUFS e '+m.truePeak.toFixed(2)+' dBTP.');
  return out;
}
