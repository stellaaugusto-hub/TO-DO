// « Quest Runner » : mini-jeu de course infinie pendant les chargements.
// Un petit chevalier court dans un paysage néon, saute les cristaux, se baisse
// sous les chauves-souris et ramasse des orbes d'XP. Double saut autorisé.

const W = 860;
const H = 260;
const GROUND = 214;

const rand = (a, b) => a + Math.random() * (b - a);

export class Runner {
  constructor(canvas, { highScore = 0, onGameOver, onScore, sfx } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * this.dpr;
    canvas.height = H * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.highScore = highScore;
    this.onGameOver = onGameOver;
    this.onScore = onScore;
    this.sfx = sfx || {};
    this.stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, 150), r: rand(0.4, 1.6), p: rand(0, 6) }));
    this.mountains = [0, 1].map((layer) => {
      const pts = [];
      let x = 0;
      while (x < W * 2 + 200) {
        pts.push([x, rand(layer ? 120 : 90, layer ? 175 : 150)]);
        x += rand(60, 140);
      }
      return { pts, offset: 0, speed: layer ? 0.35 : 0.15 };
    });
    this.keys = {};
    this.reset();
    this.state = 'ready';
    this._loop = this._loop.bind(this);
    this._onKey = this._onKey.bind(this);
    this._onPointer = this._onPointer.bind(this);
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKey);
    canvas.addEventListener('pointerdown', this._onPointer);
    this.raf = requestAnimationFrame(this._loop);
    this.last = performance.now();
  }

  reset() {
    this.player = { x: 90, y: GROUND, vy: 0, onGround: true, ducking: false, jumps: 0, hold: 0, frame: 0 };
    this.obstacles = [];
    this.orbs = [];
    this.particles = [];
    this.speed = 6.2;
    this.distance = 0;
    this.bonus = 0;
    this.spawnIn = 70;
    this.orbIn = 120;
    this.t = 0;
    this.flash = 0;
    this.newRecord = false;
  }

  get score() {
    return Math.floor(this.distance / 12) + this.bonus;
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('keyup', this._onKey);
    this.canvas.removeEventListener('pointerdown', this._onPointer);
  }

  _onPointer(e) {
    e.preventDefault();
    this._jumpPressed();
    this.keys.jump = true;
    const up = () => { this.keys.jump = false; window.removeEventListener('pointerup', up); };
    window.addEventListener('pointerup', up);
  }

  _onKey(e) {
    const down = e.type === 'keydown';
    if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) {
      e.preventDefault();
      if (down && !this.keys.jump) this._jumpPressed();
      this.keys.jump = down;
    }
    if (['ArrowDown', 'KeyS'].includes(e.code)) {
      e.preventDefault();
      this.keys.duck = down;
    }
  }

  _jumpPressed() {
    if (this.state === 'ready') { this.state = 'running'; return; }
    if (this.state === 'over') {
      if (performance.now() - this.overAt > 450) { this.reset(); this.state = 'running'; }
      return;
    }
    const p = this.player;
    if (p.onGround) {
      p.vy = -12.2; p.onGround = false; p.jumps = 1; p.hold = 14;
      this.sfx.jump?.();
      this._dust(p.x + 14, GROUND, 8);
    } else if (p.jumps < 2) {
      p.vy = -10.5; p.jumps = 2; p.hold = 8;
      this.sfx.jump?.();
      this._burst(p.x + 16, p.y - 20, '#a78bfa', 10);
    }
  }

  _dust(x, y, n) {
    for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: rand(-2, 0.5), vy: rand(-1.6, -0.2), life: 1, decay: rand(0.03, 0.06), r: rand(1.5, 3), c: 'rgba(196,181,253,' });
  }
  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(1, 4);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: rand(0.025, 0.05), r: rand(1.5, 3.2), hex: color });
    }
  }

  _spawn() {
    const roll = Math.random();
    const fast = this.speed > 8.5;
    if (roll < 0.22 && fast) {
      const high = Math.random() < 0.5;
      this.obstacles.push({ type: 'bat', x: W + 20, y: high ? GROUND - 62 : GROUND - 36, w: 34, h: 20, phase: rand(0, 6) });
    } else if (roll < 0.55) {
      const n = Math.random() < 0.35 ? 2 : 1;
      this.obstacles.push({ type: 'crystal', x: W + 20, y: GROUND, w: 18 * n + 6, h: rand(30, 44), n });
    } else if (roll < 0.8) {
      const stack = fast && Math.random() < 0.4 ? 2 : 1;
      this.obstacles.push({ type: 'crate', x: W + 20, y: GROUND, w: 30, h: 28 * stack, stack });
    } else {
      this.obstacles.push({ type: 'slime', x: W + 20, y: GROUND, w: 30, h: 20, phase: 0 });
    }
    const gap = rand(52, 105) * (6.2 / this.speed) ** 0.25;
    this.spawnIn = gap + 380 / this.speed;
  }

  _update(dt) {
    this.t += dt;
    for (const s of this.stars) s.p += 0.03 * dt;
    if (this.state !== 'running') return;
    const p = this.player;
    this.speed = Math.min(15, this.speed + 0.0028 * dt);
    const v = this.speed * dt;
    this.distance += v;
    for (const m of this.mountains) m.offset = (m.offset + m.speed * v * 0.3) % (W + 200);

    // joueur
    p.ducking = !!this.keys.duck && p.onGround;
    let g = 0.72;
    if (this.keys.jump && p.hold > 0 && p.vy < 0) { g = 0.36; p.hold -= dt; }
    if (this.keys.duck && !p.onGround) g = 1.8;
    p.vy += g * dt;
    p.y += p.vy * dt;
    if (p.y >= GROUND) {
      if (!p.onGround) this._dust(p.x + 14, GROUND, 6);
      p.y = GROUND; p.vy = 0; p.onGround = true; p.jumps = 0;
    }
    p.frame += 0.25 * dt * (this.speed / 6);
    if (p.onGround && Math.random() < 0.25) this._dust(p.x + 6, GROUND, 1);

    // obstacles
    this.spawnIn -= v / 6;
    if (this.spawnIn <= 0) this._spawn();
    for (const o of this.obstacles) {
      o.x -= v * (o.type === 'bat' ? 1.12 : 1);
      if (o.phase !== undefined) o.phase += 0.2 * dt;
    }
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -40);

    // orbes d'XP
    this.orbIn -= v / 6;
    if (this.orbIn <= 0) {
      this.orbs.push({ x: W + 20, y: rand(GROUND - 120, GROUND - 40), t: 0 });
      this.orbIn = rand(90, 200);
    }
    for (const o of this.orbs) { o.x -= v; o.t += 0.1 * dt; }
    const ph = this._hitbox();
    this.orbs = this.orbs.filter((o) => {
      if (o.x < -20) return false;
      if (Math.abs(o.x - (ph.x + ph.w / 2)) < 22 && Math.abs(o.y - (ph.y + ph.h / 2)) < 26) {
        this.bonus += 25;
        this.sfx.coin?.();
        this._burst(o.x, o.y, '#fde047', 12);
        return false;
      }
      return true;
    });

    // collisions
    for (const o of this.obstacles) {
      const ob = this._obBox(o);
      if (ph.x < ob.x + ob.w && ph.x + ph.w > ob.x && ph.y < ob.y + ob.h && ph.y + ph.h > ob.y) {
        this.state = 'over';
        this.overAt = performance.now();
        this.flash = 1;
        this.sfx.hit?.();
        this._burst(p.x + 16, p.y - 20, '#fb7185', 26);
        if (this.score > this.highScore) { this.highScore = this.score; this.newRecord = true; }
        this.onGameOver?.(this.score, this.newRecord);
        break;
      }
    }

    for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.05 * dt; q.life -= q.decay * dt; }
    this.particles = this.particles.filter((q) => q.life > 0);
    this.onScore?.(this.score);
  }

  _hitbox() {
    const p = this.player;
    const h = p.ducking ? 22 : 38;
    return { x: p.x + 7, y: p.y - h, w: 20, h: h - 2 };
  }

  _obBox(o) {
    if (o.type === 'bat') return { x: o.x + 4, y: o.y - 8, w: o.w - 8, h: 14 };
    if (o.type === 'slime') return { x: o.x + 4, y: o.y - o.h + 4, w: o.w - 8, h: o.h - 4 };
    return { x: o.x + 3, y: o.y - o.h + 3, w: o.w - 6, h: o.h - 3 };
  }

  // ------------------------------------------------------------------ rendu
  _draw() {
    const c = this.ctx;
    // ciel
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#120b35');
    sky.addColorStop(0.6, '#2a1250');
    sky.addColorStop(1, '#4a1a5e');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      c.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(s.p));
      c.fillStyle = '#fff';
      c.fillRect(s.x, s.y, s.r, s.r);
    }
    c.globalAlpha = 1;
    // lune
    const moon = c.createRadialGradient(700, 60, 4, 700, 60, 70);
    moon.addColorStop(0, 'rgba(251,207,232,0.95)');
    moon.addColorStop(0.25, 'rgba(244,114,182,0.45)');
    moon.addColorStop(1, 'rgba(244,114,182,0)');
    c.fillStyle = moon;
    c.beginPath(); c.arc(700, 60, 70, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fde4f1';
    c.beginPath(); c.arc(700, 60, 18, 0, Math.PI * 2); c.fill();
    // montagnes
    this.mountains.forEach((m, i) => {
      c.fillStyle = i ? '#2b1556' : '#1f1046';
      c.beginPath();
      c.moveTo(-m.offset, H);
      for (const [x, y] of m.pts) c.lineTo(x - m.offset, y);
      c.lineTo(W * 2 + 200 - m.offset, H);
      c.closePath();
      c.fill();
    });
    // sol néon
    c.fillStyle = '#0e0726';
    c.fillRect(0, GROUND, W, H - GROUND);
    c.strokeStyle = '#22d3ee';
    c.shadowColor = '#22d3ee';
    c.shadowBlur = 12;
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, GROUND + 1); c.lineTo(W, GROUND + 1); c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(139,92,246,0.35)';
    c.lineWidth = 1;
    const off = this.distance % 40;
    for (let x = -off; x < W + 40; x += 40) {
      c.beginPath(); c.moveTo(x, GROUND + 2); c.lineTo(x - 60, H); c.stroke();
    }
    for (const y of [GROUND + 14, GROUND + 30]) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

    for (const o of this.orbs) this._drawOrb(o);
    for (const o of this.obstacles) this._drawObstacle(o);
    this._drawKnight();

    for (const q of this.particles) {
      c.globalAlpha = Math.max(0, q.life);
      c.fillStyle = q.hex || q.c + q.life + ')';
      c.beginPath(); c.arc(q.x, q.y, q.r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1;

    if (this.flash > 0) {
      c.fillStyle = `rgba(251,113,133,${this.flash * 0.35})`;
      c.fillRect(0, 0, W, H);
      this.flash = Math.max(0, this.flash - 0.04);
    }

    c.textAlign = 'center';
    if (this.state === 'ready') this._banner('Appuie sur ESPACE pour jouer', '↑ / Espace : sauter (2× pour double saut) · ↓ : se baisser');
    if (this.state === 'over') this._banner(this.newRecord ? '🏆 Nouveau record !' : 'Aïe !', 'Espace pour rejouer');
  }

  _banner(title, sub) {
    const c = this.ctx;
    c.fillStyle = 'rgba(7,7,26,0.55)';
    c.fillRect(0, 80, W, 76);
    c.fillStyle = '#fff';
    c.font = '700 22px "Sora Variable", sans-serif';
    c.fillText(title, W / 2, 112);
    c.fillStyle = '#c4b5fd';
    c.font = '500 13px "Inter Variable", sans-serif';
    c.fillText(sub, W / 2, 138);
  }

  _drawOrb(o) {
    const c = this.ctx;
    const y = o.y + Math.sin(o.t) * 4;
    const g = c.createRadialGradient(o.x, y, 1, o.x, y, 16);
    g.addColorStop(0, 'rgba(254,240,138,1)');
    g.addColorStop(0.4, 'rgba(250,204,21,0.7)');
    g.addColorStop(1, 'rgba(250,204,21,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(o.x, y, 16, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fffbeb';
    c.beginPath(); c.arc(o.x, y, 4.5, 0, Math.PI * 2); c.fill();
  }

  _drawObstacle(o) {
    const c = this.ctx;
    if (o.type === 'crystal') {
      for (let i = 0; i < o.n; i++) {
        const x = o.x + i * 18;
        const h = o.h - i * 6;
        const g = c.createLinearGradient(x, GROUND - h, x, GROUND);
        g.addColorStop(0, '#f0abfc');
        g.addColorStop(1, '#7c3aed');
        c.fillStyle = g;
        c.shadowColor = '#e879f9';
        c.shadowBlur = 10;
        c.beginPath();
        c.moveTo(x + 2, GROUND); c.lineTo(x + 6, GROUND - h * 0.55); c.lineTo(x + 12, GROUND - h); c.lineTo(x + 18, GROUND - h * 0.5); c.lineTo(x + 22, GROUND);
        c.closePath(); c.fill();
        c.shadowBlur = 0;
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.beginPath(); c.moveTo(x + 9, GROUND - h * 0.6); c.lineTo(x + 12, GROUND - h + 4); c.lineTo(x + 13, GROUND - h * 0.5); c.closePath(); c.fill();
      }
    } else if (o.type === 'crate') {
      for (let s = 0; s < o.stack; s++) {
        const y = GROUND - 28 * (s + 1);
        c.fillStyle = '#92400e';
        c.fillRect(o.x, y, 30, 28);
        c.strokeStyle = '#fbbf24';
        c.lineWidth = 2;
        c.strokeRect(o.x + 1, y + 1, 28, 26);
        c.beginPath(); c.moveTo(o.x + 2, y + 2); c.lineTo(o.x + 28, y + 26); c.moveTo(o.x + 28, y + 2); c.lineTo(o.x + 2, y + 26); c.stroke();
      }
    } else if (o.type === 'slime') {
      const sq = Math.sin(o.phase) * 3;
      c.fillStyle = '#34d399';
      c.shadowColor = '#34d399';
      c.shadowBlur = 10;
      c.beginPath();
      c.ellipse(o.x + 15, GROUND - 9 + sq / 2, 15 + sq / 2, 10 - sq / 2, 0, Math.PI, 0);
      c.lineTo(o.x + 30, GROUND); c.lineTo(o.x, GROUND); c.closePath(); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = '#052e1c';
      c.fillRect(o.x + 9, GROUND - 13, 3, 4); c.fillRect(o.x + 18, GROUND - 13, 3, 4);
    } else {
      const flap = Math.sin(o.phase * 1.6) * 8;
      c.fillStyle = '#1e1b4b';
      c.strokeStyle = '#a78bfa';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(o.x + 17, o.y); c.lineTo(o.x, o.y - 6 + flap); c.lineTo(o.x + 8, o.y + 2); c.lineTo(o.x + 17, o.y + 6);
      c.lineTo(o.x + 26, o.y + 2); c.lineTo(o.x + 34, o.y - 6 + flap); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#f43f5e';
      c.fillRect(o.x + 13, o.y - 1, 2, 2); c.fillRect(o.x + 19, o.y - 1, 2, 2);
    }
  }

  _drawKnight() {
    const c = this.ctx;
    const p = this.player;
    const px = 2; // taille d'un « pixel »
    const duck = p.ducking;
    const baseY = p.y;
    const run = p.onGround ? Math.floor(p.frame) % 4 : 1;
    const bob = p.onGround && !duck ? (run % 2) * 1 : 0;
    const R = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(p.x + x * px, baseY - (y + h) * px - bob, w * px, h * px); };
    // cape
    const wave = Math.sin(this.t * 0.4) * 1.5;
    c.fillStyle = '#ec4899';
    c.beginPath();
    const top = baseY - (duck ? 10 : 15) * px - bob;
    c.moveTo(p.x + 3 * px, top);
    c.lineTo(p.x - 6 * px, top + 6 * px + wave * px);
    c.lineTo(p.x - 3 * px, top + (duck ? 8 : 12) * px);
    c.lineTo(p.x + 4 * px, top + (duck ? 7 : 10) * px);
    c.closePath(); c.fill();
    if (duck) {
      R(2, 0, 4, 3, '#4c1d95'); R(10, 0, 4, 3, '#4c1d95');
      R(1, 3, 14, 5, '#7c3aed');
      R(9, 6, 9, 6, '#cbd5e1'); R(10, 7, 7, 2, '#0f172a'); R(11, 7, 5, 1, '#22d3ee');
      R(12, 12, 3, 2, '#f472b6');
      return;
    }
    // jambes (animation de course)
    const legs = [[0, 3], [2, 1], [3, 0], [1, 2]][run];
    R(4, 0, 3, 4 + (p.onGround ? legs[0] % 2 : 0), '#4c1d95');
    R(9, 0, 3, 4 + (p.onGround ? legs[1] % 2 : 0), '#4c1d95');
    R(3, 0, 4, 1, '#1e1b4b'); R(9, 0, 4, 1, '#1e1b4b');
    // corps
    R(3, 4, 11, 8, '#7c3aed');
    R(3, 8, 11, 1, '#fbbf24');
    R(7, 4, 3, 8, '#8b5cf6');
    // épée dans le dos
    R(1, 7, 1, 10, '#e2e8f0'); R(0, 9, 3, 1, '#fbbf24');
    // bras
    R(12, 6, 3, 5, '#6d28d9');
    // casque
    R(4, 12, 10, 9, '#cbd5e1');
    R(5, 20, 8, 1, '#e2e8f0');
    R(6, 15, 8, 3, '#0f172a');
    R(7, 16, 7, 1, '#22d3ee');
    // plumet
    R(8, 21, 3, 2, '#f472b6'); R(10, 22, 3, 2, '#f472b6');
    c.shadowBlur = 0;
  }

  _loop(now) {
    const dt = Math.min(2.5, (now - this.last) / 16.67);
    this.last = now;
    this._update(dt);
    this._draw();
    this.raf = requestAnimationFrame(this._loop);
  }
}
