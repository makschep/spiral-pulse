import { save } from './state.js';

let audioCtx = null;
let masterGain = null;
let hatNoiseBuffer = null;

export function ensureAudio() {
  if (!save.sound) return;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.28;
    masterGain.connect(audioCtx.destination);

    // Pre-generate hi-hat noise buffer ONCE (eliminates per-beat GC allocation!)
    const len = Math.floor(audioCtx.sampleRate * 0.035);
    hatNoiseBuffer = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = hatNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

export function playKick(strong) {
  if (!audioCtx || !save.sound) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(strong ? 156 : 128, now);
  osc.frequency.exponentialRampToValueAtTime(36, now + 0.13);
  g.gain.setValueAtTime(strong ? 0.6 : 0.42, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.17);
}

export function playBass(freq, dur, lush) {
  if (!audioCtx || !save.sound) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const filt = audioCtx.createBiquadFilter();
  const g = audioCtx.createGain();
  osc.type = lush ? 'sawtooth' : 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(lush ? 1150 : 600, now);
  filt.frequency.exponentialRampToValueAtTime(220, now + dur);
  g.gain.setValueAtTime(lush ? 0.18 : 0.26, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(filt);
  filt.connect(g);
  g.connect(masterGain);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function playShimmerPad(freq, dur) {
  if (!audioCtx || !save.sound) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 2, now);
  g.gain.setValueAtTime(0.001, now);
  g.gain.linearRampToValueAtTime(0.085, now + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.4);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(now);
  osc.stop(now + dur * 1.5);
}

export function playLead(freq, dur) {
  if (!audioCtx || !save.sound) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0.1, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(g);
  g.connect(masterGain);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function playHat(vol) {
  if (!audioCtx || !save.sound || !hatNoiseBuffer) return;
  const now = audioCtx.currentTime;
  const src = audioCtx.createBufferSource();
  src.buffer = hatNoiseBuffer;
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6500;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.032);
  src.connect(hp);
  hp.connect(g);
  g.connect(masterGain);
  src.start(now);
}

export function playSfx(type) {
  if (!audioCtx || !save.sound) return;
  const now = audioCtx.currentTime;
  if (type === 'crystal') {
    const chord = [659.25, 987.77, 1318.51, 1760];
    for (let idx = 0; idx < chord.length; idx++) {
      const f = chord[idx];
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.015);
      osc.frequency.exponentialRampToValueAtTime(f * 1.25, now + 0.22);
      g.gain.setValueAtTime(0.16, now + idx * 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(g);
      g.connect(masterGain);
      osc.start(now + idx * 0.015);
      osc.stop(now + 0.27);
    }
    return;
  }
  if (type === 'gravity') {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.55);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.95);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.42, now + 0.22);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.98);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 1.0);
    return;
  }
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  if (type === 'coin') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1480, now + 0.11);
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
  } else if (type === 'nearmiss') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.09);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  } else if (type === 'scrape') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190 + Math.random() * 70, now);
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  } else if (type === 'vanish') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  } else if (type === 'tick') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(980, now);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
  } else if (type === 'laser') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.22);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
  } else if (type === 'split') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.25);
    g.gain.setValueAtTime(0.24, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
  } else if (type === 'shatter') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.36);
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
  } else {
    return;
  }
  osc.connect(g);
  g.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.4);
}

export function vibe(ms) {
  if (save.vibe && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (_) {}
  }
}
