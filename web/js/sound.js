// Synthesised sound effects (WebAudio) – no audio files needed.
let ctx = null;
let enabled = true;
let lastPlay = {};

export function setSoundEnabled(on) {
  enabled = !!on;
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone({ freq = 440, to = null, dur = 0.12, type = "square", vol = 0.08, delay = 0 }) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.3, vol = 0.12, delay = 0 }) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
}

const SFX = {
  click: () => tone({ freq: 660, dur: 0.05, vol: 0.04 }),
  laser: () => tone({ freq: 1400, to: 300, dur: 0.15, type: "sawtooth", vol: 0.05 }),
  rail: () => { tone({ freq: 200, to: 2000, dur: 0.12, type: "sawtooth", vol: 0.06 }); noise({ dur: 0.15, vol: 0.05 }); },
  rocket: () => noise({ dur: 0.25, vol: 0.06 }),
  explode: () => { noise({ dur: 0.5, vol: 0.18 }); tone({ freq: 120, to: 40, dur: 0.4, type: "triangle", vol: 0.12 }); },
  hit: () => tone({ freq: 220, to: 110, dur: 0.12, type: "square", vol: 0.06 }),
  bump: () => tone({ freq: 140, dur: 0.08, type: "triangle", vol: 0.07 }),
  pickup: () => { tone({ freq: 880, dur: 0.08, type: "sine", vol: 0.06 }); tone({ freq: 1320, dur: 0.1, type: "sine", vol: 0.06, delay: 0.07 }); },
  shield: () => tone({ freq: 500, to: 900, dur: 0.25, type: "sine", vol: 0.06 }),
  repair: () => [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.1, type: "sine", vol: 0.05, delay: i * 0.06 })),
  coin: () => { tone({ freq: 988, dur: 0.07, type: "square", vol: 0.04 }); tone({ freq: 1319, dur: 0.18, type: "square", vol: 0.04, delay: 0.07 }); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, type: "triangle", vol: 0.08, delay: i * 0.11 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.25, type: "triangle", vol: 0.07, delay: i * 0.15 })),
  error: () => tone({ freq: 180, dur: 0.18, type: "sawtooth", vol: 0.05 }),
  unlock: () => [659, 784, 988, 1319].forEach((f, i) => tone({ freq: f, dur: 0.12, type: "sine", vol: 0.06, delay: i * 0.08 })),
};

export function sfx(name) {
  if (!enabled || !SFX[name]) return;
  const now = performance.now();
  if (now - (lastPlay[name] || 0) < 50) return; // avoid stacking the same sound
  lastPlay[name] = now;
  try {
    SFX[name]();
  } catch {
    /* audio not available */
  }
}

/** Play sounds for the events of a replay frame. */
export function sfxForEvents(events = []) {
  const types = new Set(events.map((e) => e.type));
  if (types.has("explode") || types.has("rocket_explode") || types.has("mine_explode")) sfx("explode");
  else if (types.has("rail")) sfx("rail");
  else if (types.has("laser")) sfx("laser");
  else if (types.has("rocket_launch")) sfx("rocket");
  if (types.has("damage")) sfx("hit");
  if (types.has("pickup")) sfx("pickup");
  if (types.has("bump")) sfx("bump");
  if (types.has("shield_up")) sfx("shield");
  if (types.has("repair")) sfx("repair");
}
