/* ============================================================
   MUSIC AO — motor de áudio de demonstração
   Groove generativo (Web Audio) por género, BPM e tom.
   Em produção o player consome HLS assinado do CDN; aqui
   sintetizamos um loop para dar vida ao protótipo.
   ============================================================ */

const AudioEngine = (() => {
  let ctx = null, master = null, timer = null;
  let nextNoteTime = 0, step = 0, playing = false, current = null;

  const NOTE = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };
  const keyToFreq = (keyStr) => {
    const [root, mode] = keyStr.split(' ');
    const semis = NOTE[root] ?? 9;
    const base = 55 * Math.pow(2, semis / 12);          // oitava do baixo (A1 ref)
    const scale = (mode === 'maj')
      ? [0, 4, 7, 12, 7, 4]                              // arpejo maior
      : [0, 3, 7, 10, 7, 3];                             // arpejo menor 7
    return { base, scale };
  };

  /* padrões de 16 passos por género: k=kick, h=hat, s=snare/rim, b=bass, p=shaker */
  const PATTERNS = {
    kuduro:    { k:[1,0,0,0, 1,0,0,1, 0,0,1,0, 1,0,0,0], s:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1], h:[1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], b:[1,0,0,1, 0,0,1,0, 1,0,0,1, 0,1,0,0], bassGain:.5 },
    afrohouse: { k:[1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0], s:[0,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], h:[0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,1], b:[1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,1], bassGain:.55 },
    amapiano:  { k:[1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0], s:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0], h:[1,0,1,1, 1,0,1,1, 1,0,1,1, 1,0,1,1], b:[1,0,0,0, 0,0,0,0, 1,0,0,1, 0,0,0,0], bassGain:.65 },
    kizomba:   { k:[1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], s:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], h:[1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], b:[1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0], bassGain:.45, pad:true },
    zouk:      { k:[1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0], s:[0,0,1,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], h:[1,0,1,1, 1,0,1,0, 1,0,1,1, 1,0,1,0], b:[1,0,0,0, 0,0,1,0, 0,0,0,1, 0,0,0,0], bassGain:.45, pad:true },
    semba:     { k:[1,0,0,1, 0,0,1,0, 0,1,0,0, 1,0,0,0], s:[0,0,1,0, 0,1,0,0, 1,0,0,1, 0,0,1,0], h:[1,0,1,0, 1,1,1,0, 1,0,1,0, 1,1,1,0], b:[1,0,0,1, 0,0,1,0, 1,0,0,0, 0,1,0,0], bassGain:.5 },
    rap:       { k:[1,0,0,0, 0,0,0,1, 0,0,1,0, 0,0,0,0], s:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], h:[1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1], b:[1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0], bassGain:.6 },
    gospel:    { k:[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0], s:[0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0], h:[1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0], b:[1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0], bassGain:.45, pad:true },
  };

  function ensureCtx(){
    if(!ctx){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.65;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master.connect(comp); comp.connect(ctx.destination);
    }
    if(ctx.state === 'suspended') ctx.resume();
  }

  /* ---- vozes ---- */
  function kick(t){
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.24);
  }
  function hat(t, open){
    const b = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    b.buffer = noiseBuf();
    f.type = 'highpass'; f.frequency.value = 7500;
    g.gain.setValueAtTime(open ? 0.22 : 0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.18 : 0.045));
    b.connect(f); f.connect(g); g.connect(master); b.start(t); b.stop(t + 0.2);
  }
  function snare(t){
    const b = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    b.buffer = noiseBuf();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    b.connect(f); f.connect(g); g.connect(master); b.start(t); b.stop(t + 0.15);
  }
  function bass(t, freq, gain, dur){
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function pad(t, freq, dur){
    [0, 3, 7].forEach(iv => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq * 2 * Math.pow(2, iv / 12);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    });
  }
  let _noise = null;
  function noiseBuf(){
    if(_noise) return _noise;
    _noise = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
    const d = _noise.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return _noise;
  }

  /* ---- sequenciador (lookahead) ---- */
  function scheduler(){
    const pat = PATTERNS[current.genre] || PATTERNS.afrohouse;
    const spb = 60 / current.bpm / 4;                    // segundos por semicolcheia
    const { base, scale } = keyToFreq(current.key);
    while(nextNoteTime < ctx.currentTime + 0.12){
      const s = step % 16, t = nextNoteTime;
      if(pat.k[s]) kick(t);
      if(pat.s[s]) snare(t);
      if(pat.h[s]) hat(t, s % 8 === 6);
      if(pat.b[s]){
        const note = scale[Math.floor(step / 4) % scale.length];
        bass(t, base * Math.pow(2, note / 12), pat.bassGain, spb * 2.6);
      }
      if(pat.pad && s === 0){
        const note = scale[Math.floor(step / 16) % scale.length];
        pad(t, base * Math.pow(2, note / 12), spb * 16);
      }
      nextNoteTime += spb; step++;
    }
  }

  return {
    play(track){
      ensureCtx();
      current = track;
      if(!playing){
        playing = true; step = 0;
        nextNoteTime = ctx.currentTime + 0.06;
        timer = setInterval(scheduler, 40);
      }
    },
    pause(){
      playing = false;
      clearInterval(timer);
    },
    isPlaying: () => playing,
  };
})();
