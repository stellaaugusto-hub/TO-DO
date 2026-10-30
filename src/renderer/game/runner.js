// « Coche ! » : mini-jeu de course pendant les chargements, dessiné comme une page Notion.
// Une petite case à cocher court sur la ligne du temps de la journée, saute les mails,
// les blocs d'agenda et les piles de pages, se baisse sous les notifications et
// attrape les coches. Double saut autorisé. Les couleurs suivent le thème de l'app.

const W = 860;
const H = 260;
const GROUND = 210;
const BOX = 26;

const rand = (a, b) => a + Math.random() * (b - a);

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--bg', '#ffffff'),
    ink: v('--text', '#37352f'),
    soft: v('--text-2', '#787774'),
    faint: v('--text-3', '#9b9a97'),
    line: v('--border-2', 'rgba(55,53,47,.16)'),
    dot: v('--border', 'rgba(55,53,47,.09)'),
    block: v('--callout', '#f1f1ef'),
    accent: v('--accent', '#2383e2'),
    red: v('--c-red', '#d44c47'),
    mono: v('--mono', 'Menlo, monospace'),
    font: v('--font', '-apple-system, sans-serif'),
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

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
    this.c = themeColors();
    // blocs de texte flous à l'arrière-plan (comme une page qui se charge)
    this.ghosts = Array.from({ length: 9 }, (_, i) => ({ x: i * 110 + rand(0, 60), y: rand(26, 120), w: rand(50, 130), lines: Math.random() < 0.5 ? 2 : 1 }));
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
    this.c = themeColors();
    this.player = { x: 92, y: GROUND, vy: 0, onGround: true, ducking: false, jumps: 0, hold: 0, frame: 0, squash: 0, checked: 0 };
    this.obstacles = [];
    this.checks = [];
    this.particles = [];
    this.popups = [];
    this.speed = 6.2;
    this.distance = 0;
    this.bonus = 0;
    this.spawnIn = 70;
    this.checkIn = 110;
    this.t = 0;
    this.shake = 0;
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

  // --- Commandes ------------------------------------------------------------------

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
      p.vy = -12.2; p.onGround = false; p.jumps = 1; p.hold = 14; p.squash = 1;
      this.sfx.jump?.();
      this._dust(p.x + BOX / 2, GROUND, 6);
    } else if (p.jumps < 2) {
      p.vy = -10.5; p.jumps = 2; p.hold = 8; p.squash = 1;
      this.sfx.jump?.();
      this._ring(p.x + BOX / 2, p.y - BOX / 2);
    }
  }

  // --- Effets ---------------------------------------------------------------------

  _dust(x, y, n) {
    for (let i = 0; i < n; i++) this.particles.push({ kind: 'dot', x, y: y - 1, vx: rand(-2.2, 0.2), vy: rand(-1.2, -0.2), life: 1, decay: rand(0.04, 0.07), r: rand(1, 2) });
  }
  _ring(x, y) {
    this.particles.push({ kind: 'ring', x, y, r: 6, life: 1, decay: 0.06 });
  }
  _shards(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(1.2, 4);
      this.particles.push({ kind: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, rot: rand(0, 6), vr: rand(-0.3, 0.3), life: 1, decay: rand(0.02, 0.04), len: rand(3, 7), color });
    }
  }

  // --- Monde ----------------------------------------------------------------------

  _spawn() {
    const roll = Math.random();
    const fast = this.speed > 8.5;
    if (roll < 0.24 && fast) {
      const high = Math.random() < 0.5;
      this.obstacles.push({ type: 'notif', x: W + 20, y: high ? GROUND - 64 : GROUND - 36, w: 40, h: 22, phase: rand(0, 6) });
    } else if (roll < 0.52) {
      const n = Math.random() < 0.3 ? 2 : 1;
      this.obstacles.push({ type: 'mail', x: W + 20, y: GROUND, w: 32 * n + (n - 1) * 4, h: 22, n });
    } else if (roll < 0.8) {
      const tall = fast && Math.random() < 0.45;
      this.obstacles.push({ type: 'event', x: W + 20, y: GROUND, w: 30, h: tall ? 52 : 36 });
    } else {
      this.obstacles.push({ type: 'pages', x: W + 20, y: GROUND, w: 28, h: 30 });
    }
    const gap = rand(52, 105) * (6.2 / this.speed) ** 0.25;
    this.spawnIn = gap + 380 / this.speed;
  }

  _hitbox() {
    const p = this.player;
    const h = p.ducking ? 16 : BOX;
    return { x: p.x + 3, y: p.y - h + 2, w: BOX - 6, h: h - 4 };
  }

  _obBox(o) {
    if (o.type === 'notif') return { x: o.x + 3, y: o.y - o.h + Math.sin(o.phase) * 3 + 3, w: o.w - 6, h: o.h - 6 };
    return { x: o.x + 3, y: o.y - o.h + 3, w: o.w - 6, h: o.h - 3 };
  }

  _update(dt) {
    this.t += dt;
    for (const q of this.particles) {
      if (q.kind === 'ring') { q.r += 1.4 * dt; q.life -= q.decay * dt; continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.08 * dt; q.life -= q.decay * dt;
      if (q.rot !== undefined) q.rot += q.vr * dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    for (const u of this.popups) { u.y -= 0.6 * dt; u.life -= 0.025 * dt; }
    this.popups = this.popups.filter((u) => u.life > 0);
    this.shake = Math.max(0, this.shake - 0.08 * dt);
    if (this.state !== 'running') return;

    const p = this.player;
    this.speed = Math.min(15, this.speed + 0.0028 * dt);
    const v = this.speed * dt;
    this.distance += v;
    for (const gh of this.ghosts) {
      gh.x -= v * 0.18;
      if (gh.x + gh.w < -10) { gh.x = W + rand(10, 80); gh.y = rand(26, 120); gh.w = rand(50, 130); }
    }

    // joueur
    p.ducking = !!this.keys.duck && p.onGround;
    let g = 0.72;
    if (this.keys.jump && p.hold > 0 && p.vy < 0) { g = 0.36; p.hold -= dt; }
    if (this.keys.duck && !p.onGround) g = 1.8;
    p.vy += g * dt;
    p.y += p.vy * dt;
    if (p.y >= GROUND) {
      if (!p.onGround) { this._dust(p.x + BOX / 2, GROUND, 5); p.squash = -1; }
      p.y = GROUND; p.vy = 0; p.onGround = true; p.jumps = 0;
    }
    p.squash *= 0.82;
    p.checked = Math.max(0, p.checked - 0.03 * dt);
    p.frame += 0.28 * dt * (this.speed / 6);

    // obstacles
    this.spawnIn -= v / 6;
    if (this.spawnIn <= 0) this._spawn();
    for (const o of this.obstacles) {
      o.x -= v * (o.type === 'notif' ? 1.12 : 1);
      if (o.phase !== undefined) o.phase += 0.16 * dt;
    }
    this.obstacles = this.obstacles.filter((o) => o.x + o.w > -40);

    // coches à attraper
    this.checkIn -= v / 6;
    if (this.checkIn <= 0) {
      this.checks.push({ x: W + 20, y: rand(GROUND - 118, GROUND - 40), t: rand(0, 6) });
      this.checkIn = rand(90, 200);
    }
    for (const o of this.checks) { o.x -= v; o.t += 0.08 * dt; }
    const ph = this._hitbox();
    this.checks = this.checks.filter((o) => {
      if (o.x < -20) return false;
      if (Math.abs(o.x - (ph.x + ph.w / 2)) < 22 && Math.abs(o.y - (ph.y + ph.h / 2)) < 24) {
        this.bonus += 25;
        p.checked = 1;
        this.sfx.coin?.();
        this.popups.push({ x: o.x, y: o.y - 12, text: '+25', life: 1 });
        this._ring(o.x, o.y);
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
        this.shake = 1;
        this.sfx.hit?.();
        this._shards(p.x + BOX / 2, p.y - BOX / 2, 18, this.c.ink);
        if (this.score > this.highScore) { this.highScore = this.score; this.newRecord = true; }
        this.onGameOver?.(this.score, this.newRecord);
        break;
      }
    }
    this.onScore?.(this.score);
  }

  // --- Dessin ---------------------------------------------------------------------

  _draw() {
    const { ctx, c } = this;
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);
    if (this.shake) ctx.translate(rand(-3, 3) * this.shake, rand(-2, 2) * this.shake);

    // grille de points
    const off = (this.distance * 0.35) % 20;
    ctx.fillStyle = c.dot;
    for (let x = -off; x < W; x += 20) for (let y = 10; y < GROUND - 4; y += 20) ctx.fillRect(x, y, 1.5, 1.5);

    // blocs de texte flous
    ctx.fillStyle = c.block;
    for (const gh of this.ghosts) {
      roundRect(ctx, gh.x, gh.y, gh.w, 7, 3.5); ctx.fill();
      if (gh.lines > 1) { roundRect(ctx, gh.x, gh.y + 13, gh.w * 0.62, 7, 3.5); ctx.fill(); }
    }

    // ligne du temps de la journée (le sol)
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, GROUND + 0.5); ctx.lineTo(W, GROUND + 0.5); ctx.stroke();
    const step = 120;
    const shift = this.distance % step;
    const firstHour = Math.floor(this.distance / step);
    ctx.font = `500 10px ${c.mono}`;
    ctx.textBaseline = 'top';
    for (let i = -1; i < W / step + 2; i++) {
      const x = i * step - shift;
      ctx.strokeStyle = c.line;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 0.5, GROUND + 3); ctx.lineTo(x + 0.5, GROUND + 10); ctx.stroke();
      for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + k * 30 + 0.5, GROUND + 3); ctx.lineTo(x + k * 30 + 0.5, GROUND + 6); ctx.stroke(); }
      const hour = (9 + firstHour + i) % 24;
      ctx.fillStyle = c.faint;
      ctx.fillText(`${String(hour).padStart(2, '0')}:00`, x + 4, GROUND + 14);
    }

    for (const o of this.checks) this._drawCheck(o);
    for (const o of this.obstacles) this._drawObstacle(o);
    this._drawPlayer();

    // particules
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life);
      if (q.kind === 'dot') { ctx.fillStyle = c.faint; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.fill(); }
      else if (q.kind === 'ring') { ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2); ctx.stroke(); }
      else {
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        ctx.strokeStyle = q.color; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-q.len / 2, 0); ctx.lineTo(q.len / 2, 0); ctx.stroke();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.font = `600 12px ${c.mono}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const u of this.popups) { ctx.globalAlpha = Math.max(0, u.life); ctx.fillStyle = c.accent; ctx.fillText(u.text, u.x, u.y); }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    if (this.state === 'ready') this._banner('Appuie sur Espace pour jouer', 'Espace ou ↑ : sauter (deux fois pour un double saut) · ↓ : se baisser');
    if (this.state === 'over') this._banner(this.newRecord ? 'Nouveau record !' : 'Oups, raté', 'Espace pour rejouer');
    ctx.restore();
  }

  _drawPlayer() {
    const { ctx, c } = this;
    const p = this.player;
    const over = this.state === 'over';
    const duck = p.ducking;
    const sq = p.squash;
    const w = BOX * (duck ? 1.18 : 1 - sq * 0.12);
    const h = (duck ? 16 : BOX) * (duck ? 1 : 1 + sq * 0.16);
    const x = p.x + (BOX - w) / 2;
    const y = p.y - h - (p.onGround && !over ? 4 : 4);

    // jambes
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    const run = p.onGround && this.state === 'running';
    const a = run ? Math.sin(p.frame) * 4 : 0;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.32, y + h); ctx.lineTo(x + w * 0.32 + a, p.y);
    ctx.moveTo(x + w * 0.68, y + h); ctx.lineTo(x + w * 0.68 - a, p.y);
    ctx.stroke();

    // la case
    roundRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = p.checked > 0 ? c.ink : c.bg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = c.ink;
    ctx.stroke();

    if (over) {
      ctx.strokeStyle = c.red;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y + h * 0.3); ctx.lineTo(x + w * 0.7, y + h * 0.7);
      ctx.moveTo(x + w * 0.7, y + h * 0.3); ctx.lineTo(x + w * 0.3, y + h * 0.7);
      ctx.stroke();
    } else if (p.checked > 0) {
      ctx.strokeStyle = c.bg;
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.26, y + h * 0.52); ctx.lineTo(x + w * 0.44, y + h * 0.7); ctx.lineTo(x + w * 0.76, y + h * 0.32);
      ctx.stroke();
    } else {
      // yeux
      ctx.fillStyle = c.ink;
      const blink = Math.sin(this.t * 0.05) > 0.97 ? 0.6 : 2.4;
      ctx.fillRect(x + w * 0.52, y + h * 0.36, 2.4, blink);
      ctx.fillRect(x + w * 0.72, y + h * 0.36, 2.4, blink);
    }
  }

  _drawCheck(o) {
    const { ctx, c } = this;
    const y = o.y + Math.sin(o.t) * 4;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(o.x, y, 10, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(o.x - 4.5, y + 0.5); ctx.lineTo(o.x - 1, y + 4); ctx.lineTo(o.x + 5, y - 3.5); ctx.stroke();
  }

  _drawObstacle(o) {
    const { ctx, c } = this;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = c.ink;
    if (o.type === 'mail') {
      for (let i = 0; i < o.n; i++) {
        const x = o.x + i * 36;
        const y = o.y - o.h;
        roundRect(ctx, x, y, 32, o.h, 3);
        ctx.fillStyle = c.bg; ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + 16, y + 12); ctx.lineTo(x + 30, y + 2); ctx.stroke();
      }
    } else if (o.type === 'event') {
      const x = o.x;
      const y = o.y - o.h;
      roundRect(ctx, x, y, o.w, o.h, 4);
      ctx.fillStyle = c.bg; ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.ink;
      ctx.fillRect(x + 1, y + 1, o.w - 2, 7);
      ctx.fillStyle = c.line;
      ctx.fillRect(x + 6, y + 14, o.w - 12, 3);
      ctx.fillRect(x + 6, y + 21, (o.w - 12) * 0.6, 3);
      ctx.strokeStyle = c.ink;
      ctx.beginPath(); ctx.moveTo(x + 8, y - 3); ctx.lineTo(x + 8, y + 3); ctx.moveTo(x + o.w - 8, y - 3); ctx.lineTo(x + o.w - 8, y + 3); ctx.stroke();
    } else if (o.type === 'pages') {
      const x = o.x;
      const y = o.y - o.h;
      for (const d of [5, 0]) {
        ctx.beginPath();
        ctx.moveTo(x + d, y - d + 6); ctx.lineTo(x + d + 6, y - d); ctx.lineTo(x + d + o.w - 6, y - d); ctx.lineTo(x + d + o.w - 6, y - d + o.h); ctx.lineTo(x + d, y - d + o.h);
        ctx.closePath();
        ctx.fillStyle = c.bg; ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = c.line;
      ctx.fillRect(x + 5, y + 12, o.w - 16, 2.5);
      ctx.fillRect(x + 5, y + 18, o.w - 20, 2.5);
    } else if (o.type === 'notif') {
      const x = o.x;
      const y = o.y - o.h + Math.sin(o.phase) * 3;
      roundRect(ctx, x, y, o.w, o.h, 11);
      ctx.fillStyle = c.bg; ctx.fill(); ctx.stroke();
      ctx.font = `700 12px ${c.font}`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.ink;
      ctx.fillText('@', x + 8, y + o.h / 2 + 0.5);
      ctx.fillStyle = c.line;
      ctx.fillRect(x + 22, y + o.h / 2 - 1.5, 11, 3);
      ctx.fillStyle = c.red;
      ctx.beginPath(); ctx.arc(x + o.w - 2, y + 2, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  _banner(title, sub) {
    const { ctx, c } = this;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `650 19px ${c.font}`;
    const tw = Math.max(ctx.measureText(title).width, 300);
    ctx.font = `400 12.5px ${c.font}`;
    const sw = ctx.measureText(sub).width;
    const bw = Math.max(tw, sw) + 48;
    const bx = W / 2 - bw / 2;
    roundRect(ctx, bx, 62, bw, 70, 8);
    ctx.fillStyle = c.bg;
    ctx.globalAlpha = 0.94;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = c.ink;
    ctx.font = `650 19px ${c.font}`;
    ctx.fillText(title, W / 2, 86);
    ctx.fillStyle = c.soft;
    ctx.font = `400 12.5px ${c.font}`;
    ctx.fillText(sub, W / 2, 112);
    ctx.restore();
  }

  _loop(now) {
    const dt = Math.min(2.5, (now - this.last) / 16.67);
    this.last = now;
    this._update(dt);
    this._draw();
    this.raf = requestAnimationFrame(this._loop);
  }
}
