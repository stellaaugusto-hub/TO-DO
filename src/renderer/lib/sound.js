// Petits sons de jeu synthétisés (aucun fichier audio).
let ctx = null;
let enabled = true;
export const setSoundEnabled = (v) => { enabled = v; };

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.08, slide = 0 } = {}) {
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, a.currentTime + start + dur);
  g.gain.setValueAtTime(0, a.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, a.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.02);
}

export const sfx = {
  click() { if (enabled) try { tone(880, 0, 0.05, { type: 'triangle', gain: 0.03 }); } catch {} },
  pop() { if (enabled) try { tone(520, 0, 0.12, { type: 'sine', gain: 0.06, slide: 1.8 }); } catch {} },
  complete() {
    if (!enabled) return;
    try { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.08, 0.35, { type: 'triangle', gain: 0.07 })); tone(1568, 0.34, 0.6, { gain: 0.04 }); } catch {}
  },
  levelUp() {
    if (!enabled) return;
    try { [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 0.45, { type: 'square', gain: 0.035 })); } catch {}
  },
  remove() { if (enabled) try { tone(330, 0, 0.18, { type: 'sawtooth', gain: 0.035, slide: 0.5 }); } catch {} },
  jump() { if (enabled) try { tone(420, 0, 0.12, { type: 'square', gain: 0.025, slide: 1.9 }); } catch {} },
  coin() { if (enabled) try { tone(988, 0, 0.06, { type: 'square', gain: 0.03 }); tone(1319, 0.06, 0.12, { type: 'square', gain: 0.03 }); } catch {} },
  hit() { if (enabled) try { tone(140, 0, 0.3, { type: 'sawtooth', gain: 0.06, slide: 0.4 }); } catch {} },
};
