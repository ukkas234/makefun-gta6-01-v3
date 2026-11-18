// audio.js — Solmara sound, 100% WebAudio synthesis. No audio files, no network.
// createAudio() -> { engine(speed01, on), siren(on), shot(), punch(),
//                    pickup(), sting(), click(), setMuted(b), muted }
// The AudioContext is created lazily on the first user gesture (pointer or
// key), so autoplay policies never block it. If WebAudio is unavailable every
// method degrades silently to a no-op. M toggles mute.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let mutedFlag = false;

  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;

  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let sirenHigh = false;

  // Create (or resume) the context. Returns false when WebAudio is unusable.
  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = mutedFlag ? 0 : 0.5;
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return true;
    } catch (e) {
      return false;
    }
  }

  // Init on first user gesture.
  function bindGestures() {
    const wake = () => { ensure(); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
  }
  try { bindGestures(); } catch (e) { /* no window: stay silent */ }

  // M mutes/unmutes. Ignored while typing in a text field, so pressing M
  // in a chat/name input never flips the mute state by accident.
  try {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
      if (e.code === 'KeyM' && !e.repeat) api.setMuted(!mutedFlag);
    });
  } catch (e) { /* no window: stay silent */ }

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  // Short one-shot tone. type: oscillator type, freq/freqEnd in Hz,
  // dur in seconds, vol 0..1, delay offset in seconds.
  function blip(type, freq, freqEnd, dur, vol, delay) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(1, freq), t0);
      if (freqEnd && freqEnd !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
      }
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (e) { /* silent */ }
  }

  function noiseBurst(dur, filterFreq, vol) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = getNoise();
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    } catch (e) { /* silent */ }
  }

  const api = {
    // Continuous engine hum. speed01 is 0..1, on starts/stops the loop.
    engine(speed01, on) {
      if (!on) {
        if (engineOsc) {
          try {
            const t0 = ctx.currentTime;
            engineGain.gain.setTargetAtTime(0, t0, 0.05);
            const osc = engineOsc;
            const gain = engineGain;
            setTimeout(() => {
              try { osc.stop(); } catch (e) {}
              try { gain.disconnect(); } catch (e) {}
            }, 250);
          } catch (e) { /* silent */ }
          engineOsc = null;
          engineGain = null;
          engineFilter = null;
        }
        return;
      }
      if (!ensure()) return;
      const s = Math.max(0, Math.min(1, typeof speed01 === 'number' ? speed01 : 0));
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineFilter = ctx.createBiquadFilter();
          engineFilter.type = 'lowpass';
          engineFilter.Q.value = 2;
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          engineOsc.connect(engineFilter);
          engineFilter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
          engineGain.gain.setTargetAtTime(0.1, ctx.currentTime, 0.1);
        }
        const t0 = ctx.currentTime;
        engineOsc.frequency.setTargetAtTime(55 + s * 165, t0, 0.08);
        engineFilter.frequency.setTargetAtTime(420 + s * 1600, t0, 0.08);
        engineGain.gain.setTargetAtTime(0.09 + s * 0.07, t0, 0.1);
      } catch (e) { /* silent */ }
    },

    // Two-tone police siren loop.
    siren(on) {
      if (!on) {
        if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
        if (sirenOsc) {
          try {
            const t0 = ctx.currentTime;
            sirenGain.gain.setTargetAtTime(0, t0, 0.05);
            const osc = sirenOsc;
            const gain = sirenGain;
            setTimeout(() => {
              try { osc.stop(); } catch (e) {}
              try { gain.disconnect(); } catch (e) {}
            }, 250);
          } catch (e) { /* silent */ }
          sirenOsc = null;
          sirenGain = null;
        }
        return;
      }
      if (!ensure() || sirenOsc) return;
      try {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'square';
        sirenOsc.frequency.value = 660;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
        sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
        sirenHigh = false;
        sirenTimer = setInterval(() => {
          try {
            sirenHigh = !sirenHigh;
            sirenOsc.frequency.setValueAtTime(sirenHigh ? 880 : 660, ctx.currentTime);
          } catch (e) { /* silent */ }
        }, 420);
      } catch (e) { /* silent */ }
    },

    // Gunshot: sharp noise burst.
    shot() { noiseBurst(0.16, 1800, 0.5); },

    // Punch: low thump, pitch falling fast.
    punch() { blip('sine', 150, 55, 0.13, 0.45, 0); },

    // Pickup chime: two rising notes.
    pickup() {
      blip('sine', 659.25, 0, 0.1, 0.22, 0);
      blip('sine', 880, 0, 0.16, 0.22, 0.09);
    },

    // Mission-complete sting: rising C major arpeggio.
    sting() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => blip('triangle', f, 0, 0.22, 0.25, i * 0.11));
      blip('triangle', 1318.5, 0, 0.35, 0.2, notes.length * 0.11);
    },

    // UI click: tiny blip.
    click() { blip('square', 900, 700, 0.05, 0.12, 0); },

    setMuted(b) {
      mutedFlag = !!b;
      try {
        if (master) master.gain.setTargetAtTime(mutedFlag ? 0 : 0.5, ctx.currentTime, 0.02);
      } catch (e) { /* silent */ }
    },

    get muted() { return mutedFlag; },
  };

  return api;
}
