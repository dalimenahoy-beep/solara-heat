// All of Solara Heat's sound is synthesised live with WebAudio; the game ships no audio
// files. The context is created lazily on the first user gesture (browsers refuse it
// sooner), and until it exists every entry point here is a silent no-op.

export function createAudio() {
  let ctx = null;
  let master = null;

  // Continuous voices, created on demand and steered per frame.
  let engine = null; // { osc, gain }
  let siren = null; // { osc, gain, flipTimer }

  // The radio: a slow pad loop in A minor that drifts under the play.
  let musicTimer = null;
  let chordStep = 0;
  const CHORDS = [
    [110.0, 220.0, 261.63, 329.63], // Am add9 colour
    [87.31, 174.61, 220.0, 349.23], // F
    [98.0, 196.0, 293.66, 392.0], // G
    [130.81, 196.0, 261.63, 392.0], // C
  ];

  function wake() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);

  /** One enveloped oscillator note. */
  function tone(freq, seconds, { type = 'sine', volume = 0.2, slideTo = null, delay = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(24, slideTo), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  /** A filtered noise burst: impacts, doors, fists. */
  function noise(seconds, { volume = 0.25, cutoff = 900 } = {}) {
    if (!ctx) return;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  /** A soft pad voice for the radio chords: slow swell in, slow fade out. */
  function pad(freq, at, seconds) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.038, at + 0.7);
    gain.gain.setValueAtTime(0.038, at + seconds - 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + seconds + 0.05);
  }

  function scheduleChord() {
    if (!ctx) return;
    const chord = CHORDS[chordStep % CHORDS.length];
    chordStep += 1;
    const at = ctx.currentTime + 0.05;
    for (const freq of chord) pad(freq, at, 4.6);
    // A low root pulse under each change.
    tone(chord[0] / 2, 1.8, { type: 'sine', volume: 0.05 });
  }

  const api = {
    wake,
    /** UI and pickup blip. */
    blip() { tone(700, 0.09, { type: 'square', volume: 0.1, slideTo: 1050 }); },
    /** Two-note till ring when money lands. */
    cash() {
      tone(932, 0.08, { type: 'square', volume: 0.12 });
      tone(1397, 0.16, { type: 'square', volume: 0.12, delay: 0.07 });
    },
    /** A fist connecting: breath of noise over a low thump. */
    punch() {
      noise(0.09, { volume: 0.3, cutoff: 480 });
      tone(95, 0.11, { volume: 0.3, slideTo: 48 });
    },
    /** Vehicle impact, hardness 0..1. */
    crash(hardness = 0.5) {
      noise(0.22, { volume: 0.18 + hardness * 0.3, cutoff: 1500 });
      tone(150, 0.18, { type: 'triangle', volume: 0.2, slideTo: 55 });
    },
    /** Door slam. */
    door() {
      noise(0.06, { volume: 0.2, cutoff: 650 });
      tone(170, 0.07, { volume: 0.16, slideTo: 85 });
    },
    /** A friendly two-tone horn toot. */
    horn() {
      tone(370, 0.16, { type: 'square', volume: 0.07 });
      tone(466, 0.16, { type: 'square', volume: 0.07 });
    },
    /** Rising three-note sting for a job well done. */
    missionDone() {
      tone(523, 0.12, { type: 'triangle', volume: 0.2 });
      tone(659, 0.12, { type: 'triangle', volume: 0.2, delay: 0.11 });
      tone(784, 0.24, { type: 'triangle', volume: 0.22, delay: 0.22 });
    },
    /** Falling two notes for busted and wasted. */
    fail() {
      tone(392, 0.2, { type: 'triangle', volume: 0.2, slideTo: 366 });
      tone(262, 0.36, { type: 'triangle', volume: 0.2, slideTo: 233, delay: 0.16 });
    },
    /** Phone buzz: Lupe has work. */
    phone() {
      tone(1175, 0.07, { type: 'square', volume: 0.07 });
      tone(1175, 0.07, { type: 'square', volume: 0.07, delay: 0.12 });
    },
    /**
     * The engine voice, steered every frame while Marco drives.
     * load is 0..1 (speed and throttle); running false parks the voice.
     */
    setEngine(load, running) {
      if (!ctx) return;
      if (running && !engine) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        filter.type = 'lowpass';
        filter.frequency.value = 640;
        gain.gain.value = 0;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        osc.start();
        engine = { osc, gain };
      }
      if (!engine) return;
      const now = ctx.currentTime;
      engine.osc.frequency.setTargetAtTime(running ? 52 + load * 170 : 30, now, 0.06);
      engine.gain.gain.setTargetAtTime(running ? 0.045 + load * 0.08 : 0, now, 0.09);
    },
    /** The two-tone siren of the nearest patrol car; closeness 0..1 sets its volume. */
    setSiren(closeness) {
      if (!ctx) return;
      if (closeness > 0.02 && !siren) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(master);
        osc.start();
        let high = false;
        const flipTimer = window.setInterval(() => {
          if (!siren) return;
          high = !high;
          siren.osc.frequency.setTargetAtTime(high ? 950 : 680, ctx.currentTime, 0.03);
        }, 380);
        siren = { osc, gain, flipTimer };
      }
      if (!siren) return;
      siren.gain.gain.setTargetAtTime(Math.max(0, closeness) * 0.05, ctx.currentTime, 0.1);
      if (closeness <= 0.02) {
        const dying = siren;
        siren = null;
        window.clearInterval(dying.flipTimer);
        dying.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        window.setTimeout(() => { try { dying.osc.stop(); } catch { /* already silent */ } }, 300);
      }
    },
    /** Start the pad radio (idempotent); it schedules its own chords. */
    startMusic() {
      if (!ctx || musicTimer !== null) return;
      scheduleChord();
      musicTimer = window.setInterval(scheduleChord, 2300);
    },
    stopMusic() {
      if (musicTimer !== null) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    toggleMusic() {
      if (musicTimer !== null) { api.stopMusic(); return false; }
      api.startMusic();
      return true;
    },
    get musicOn() { return musicTimer !== null; },
  };
  return api;
}
