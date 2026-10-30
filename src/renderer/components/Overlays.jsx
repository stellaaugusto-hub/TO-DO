import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Download, Calendar, Mail, MessageCircle, Wand2, CircleCheck } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { sfx } from '../lib/sound.js';
import { usePrefs } from '../lib/prefs.js';
import { coverCss } from '../lib/notion.js';
import { Runner } from '../game/runner.js';
import { todaysQuests } from '../../shared/priority.js';
import { levelInfo, currentStreak } from '../../shared/game.js';
import { XpBar } from './ui.jsx';

// Paramètres d'aperçu (captures d'écran) : ?hold=1 fige le Bonjour, ?slow=4 ralentit l'animation de victoire.
const PREVIEW = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const SLOW = +(PREVIEW.get('slow') || 1);
const isDark = () => document.documentElement.dataset.theme === 'dark';

// ---------------------------------------------------------------------------
// « Bonjour <prénom> » plein écran à chaque ouverture
// ---------------------------------------------------------------------------
export function Greeting({ onDone }) {
  const data = useApp((s) => s.data);
  const prefs = usePrefs();
  const name = data.profile.name || '';
  const quests = todaysQuests(data.tasks).length;
  const lvl = levelInfo(data.stats.xp);
  const streak = currentStreak(data.stats);
  useEffect(() => {
    const t = PREVIEW.has('hold') ? null : setTimeout(onDone, 2800);
    const skip = () => onDone();
    window.addEventListener('keydown', skip);
    return () => { clearTimeout(t); window.removeEventListener('keydown', skip); };
  }, [onDone]);
  const cover = coverCss(prefs.pages.quests.cover) || coverCss('nude');
  const hour = new Date().getHours();
  return (
    <motion.div className="fullscreen" style={{ cursor: 'pointer' }} onClick={onDone} exit={{ opacity: 0, y: -20, transition: { duration: 0.5, ease: [0.6, 0, 0.3, 1] } }}>
      <motion.div style={{ position: 'absolute', inset: 0, background: cover, backgroundSize: 'cover', backgroundPosition: 'center' }} initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 0.55, scale: 1 }} transition={{ duration: 1.6, ease: 'easeOut' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 0%, var(--bg) 75%)' }} />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <motion.div style={{ fontSize: 76, lineHeight: 1 }} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: [0, 18, -8, 14, 0] }} transition={{ scale: { type: 'spring', stiffness: 260, damping: 14 }, rotate: { delay: 0.5, duration: 1 } }}>
          {hour < 18 ? '👋' : '🌙'}
        </motion.div>
        <motion.div style={{ fontSize: 'clamp(46px, 6.5vw, 84px)', fontWeight: 700, letterSpacing: '-0.03em', marginTop: 18, lineHeight: 1.05 }} initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.15, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}>
          Bonjour{name ? ',' : ' !'}
        </motion.div>
        {name && (
          <div style={{ fontSize: 'clamp(56px, 9vw, 120px)', fontWeight: 750, letterSpacing: '-0.04em', lineHeight: 1.05, color: 'var(--accent)' }}>
            {[...name].map((ch, i) => (
              <motion.span key={i} style={{ display: 'inline-block', whiteSpace: 'pre' }} initial={{ opacity: 0, y: 40, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ delay: 0.4 + i * 0.05, type: 'spring', stiffness: 200, damping: 16 }}>{ch}</motion.span>
            ))}
          </div>
        )}
        <motion.div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 28, flexWrap: 'wrap' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}>
          <span className="chip">⚔️ {quests ? `${quests} quête${quests > 1 ? 's' : ''} aujourd'hui` : 'Aucune quête urgente'}</span>
          {prefs.appearance.gamification && <span className="chip">⭐ Niveau {lvl.level} · {lvl.title}</span>}
          {prefs.appearance.gamification && streak > 0 && <span className="chip">🔥 {streak} jour{streak > 1 ? 's' : ''} d'affilée</span>}
        </motion.div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Victoire plein écran : le nom s'allume en vert puis part en fumée
// ---------------------------------------------------------------------------
export function SuccessOverlay() {
  const { success, clearSuccess } = useApp();
  const prefs = usePrefs();
  const canvasRef = useRef(null);
  const titleRef = useRef(null);
  const [phase, setPhase] = useState('in');
  const [levelUp, setLevelUp] = useState(false);

  useEffect(() => {
    if (!success) return;
    setPhase('in');
    setLevelUp(false);
    const dark = isDark();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    let parts = [];
    let puffs = [];
    let raf;
    let t = 0;
    const loop = () => {
      t++;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      for (const p of parts) {
        if (p.kind === 'smoke') {
          p.vx += Math.sin(p.y * 0.018 + t * 0.05 + p.seed) * 0.06;
          p.vy -= 0.022;
          p.vx *= 0.985;
          p.r += 0.035;
        } else {
          p.vy += 0.12;
          p.vx *= 0.99;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0) continue;
        const a = Math.max(0, p.life);
        if (p.kind === 'smoke') {
          // vert vif -> gris fumée
          const mix = 1 - a;
          const r = Math.round(68 + mix * (dark ? 100 : 90));
          const g = Math.round((dark ? 210 : 150) - mix * (dark ? 90 : 20));
          const b = Math.round(110 + mix * (dark ? 60 : 50));
          ctx.fillStyle = `rgba(${r},${g},${b},${a * (dark ? 0.9 : 0.75)})`;
        } else ctx.fillStyle = p.color.replace('A', a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const s of puffs) {
        s.x += s.vx; s.y += s.vy; s.r += 0.9; s.life -= 0.011;
        if (s.life <= 0) continue;
        const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        gr.addColorStop(0, dark ? `rgba(170,200,185,${s.life * 0.16})` : `rgba(120,140,130,${s.life * 0.14})`);
        gr.addColorStop(1, 'rgba(150,170,160,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      parts = parts.filter((p) => p.life > 0);
      puffs = puffs.filter((p) => p.life > 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // 1) confettis quand le nom s'allume en vert
    const t1 = setTimeout(() => {
      setPhase('glow');
      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      const cols = ['rgba(68,131,97,A)', 'rgba(35,131,226,A)', 'rgba(203,145,47,A)', 'rgba(144,101,176,A)', 'rgba(193,76,138,A)', 'rgba(217,115,13,A)'];
      for (let i = 0; i < 170; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 4 + Math.random() * 11;
        parts.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 4, r: 2 + Math.random() * 3, life: 1, decay: 0.008 + Math.random() * 0.01, color: cols[i % cols.length] });
      }
    }, 450 * SLOW);

    // 2) le texte se dissout en fumée
    const t2 = setTimeout(() => {
      const el = titleRef.current;
      if (el) {
        const off = document.createElement('canvas');
        off.width = innerWidth;
        off.height = innerHeight;
        const o = off.getContext('2d');
        const cs = getComputedStyle(el);
        o.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        o.fillStyle = '#000';
        o.textBaseline = 'top';
        const range = document.createRange();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        const fontPx = parseFloat(cs.fontSize);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const re = /\S+/g;
          let m;
          while ((m = re.exec(node.textContent))) {
            range.setStart(node, m.index);
            range.setEnd(node, m.index + m[0].length);
            const r = range.getBoundingClientRect();
            o.fillText(m[0], r.left, r.top + (r.height - fontPx) / 2 + fontPx * 0.06);
          }
        }
        const box = el.getBoundingClientRect();
        const img = o.getImageData(Math.max(0, box.left), Math.max(0, box.top), Math.min(innerWidth, box.width), Math.min(innerHeight, box.height));
        const step = Math.max(2, Math.round(Math.sqrt((box.width * box.height) / 9000)));
        for (let y = 0; y < img.height; y += step) {
          for (let x = 0; x < img.width; x += step) {
            if (img.data[(y * img.width + x) * 4 + 3] > 128) {
              parts.push({ kind: 'smoke', x: box.left + x, y: box.top + y, vx: (Math.random() - 0.3) * 0.8, vy: -Math.random() * 0.6, r: step * 0.55, life: 1, decay: 0.006 + Math.random() * 0.012 + (x / img.width) * 0.004, seed: Math.random() * 6 });
            }
          }
        }
        for (let i = 0; i < 26; i++) puffs.push({ x: box.left + Math.random() * box.width, y: box.top + Math.random() * box.height, vx: (Math.random() - 0.5) * 0.6, vy: -0.6 - Math.random() * 1.2, r: 20 + Math.random() * 30, life: 1 });
      }
      setPhase('smoke');
    }, 1900 * SLOW);

    const t3 = setTimeout(() => {
      if (success.reward?.levelUp && prefs.appearance.gamification) { setLevelUp(true); sfx.levelUp(); }
    }, 3000 * SLOW);
    const t4 = setTimeout(() => clearSuccess(), (success.reward?.levelUp ? 5200 : 3500) * SLOW);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, clearSuccess]);

  const green = 'var(--c-green)';
  return (
    <AnimatePresence>
      {success && (
        <motion.div className="fullscreen" style={{ background: 'color-mix(in srgb, var(--bg) 92%, transparent)', backdropFilter: 'blur(10px)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} onClick={clearSuccess}>
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          <motion.div style={{ position: 'relative', width: 84, height: 84, borderRadius: '50%', display: 'grid', placeItems: 'center', background: green, boxShadow: '0 10px 40px -8px rgba(68,131,97,0.7)' }} initial={{ scale: 0, rotate: -90 }} animate={{ scale: phase === 'smoke' ? 0.85 : 1, rotate: 0, opacity: phase === 'smoke' ? 0 : 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, opacity: { duration: 0.6 } }}>
            <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.45 }} />
            </svg>
          </motion.div>
          <motion.div style={{ marginTop: 20, fontSize: 13, fontWeight: 650, letterSpacing: '0.2em', color: green }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: phase === 'smoke' ? 0 : 1, y: 0 }} transition={{ delay: 0.3 }}>
            QUÊTE ACCOMPLIE
          </motion.div>
          <motion.h1
            ref={titleRef}
            style={{ position: 'relative', margin: '12px 40px 0', maxWidth: 1000, textAlign: 'center', fontWeight: 750, fontSize: 'clamp(30px, 4.4vw, 56px)', letterSpacing: '-0.02em', lineHeight: 1.15 }}
            initial={{ opacity: 0, y: 20, scale: 0.96, color: 'var(--text)' }}
            animate={
              phase === 'in'
                ? { opacity: 1, y: 0, scale: 1, color: 'var(--text)', textShadow: '0 0 0px rgba(68,190,120,0)' }
                : phase === 'glow'
                  ? { opacity: 1, y: 0, scale: 1.04, color: isDark() ? '#5fd38d' : '#2f9e5f', textShadow: isDark() ? '0 0 18px rgba(95,211,141,0.9), 0 0 60px rgba(95,211,141,0.5)' : '0 0 14px rgba(47,158,95,0.45), 0 0 40px rgba(47,158,95,0.3)' }
                  : { opacity: 0, y: -16, scale: 1.05, filter: 'blur(10px)' }
            }
            transition={phase === 'smoke' ? { duration: 0.45 } : { duration: 0.6, ease: 'easeOut' }}
          >
            {success.task.title}
          </motion.h1>
          {prefs.appearance.gamification && (
            <motion.div style={{ marginTop: 22, fontSize: 22, fontWeight: 650, color: 'var(--c-yellow)' }} initial={{ opacity: 0, y: 20, scale: 0.6 }} animate={{ opacity: phase === 'smoke' && !levelUp ? 0 : 1, y: 0, scale: 1 }} transition={{ delay: 0.7, type: 'spring', stiffness: 260, damping: 14 }}>
              ⚡ +{success.reward?.xp || 0} XP {success.reward?.streak > 1 && <span style={{ color: 'var(--c-orange)', marginLeft: 12 }}>🔥 {success.reward.streak} jours</span>}
            </motion.div>
          )}
          <AnimatePresence>
            {levelUp && (
              <motion.div style={{ position: 'absolute', textAlign: 'center' }} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }}>
                <div style={{ fontSize: 64 }}>👑</div>
                <div style={{ fontSize: 64, fontWeight: 750, letterSpacing: '-0.03em', color: 'var(--accent)' }}>Niveau {success.reward.level}</div>
                <div className="muted" style={{ fontSize: 18 }}>Nouveau rang : {success.reward.title}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Chargement (scan mails / chat / agenda) avec le mini-jeu
// ---------------------------------------------------------------------------
const STEPS = [
  { key: 'connect', label: 'Google', icon: CircleCheck },
  { key: 'calendar', label: 'Agenda', icon: Calendar },
  { key: 'mail', label: 'Mails', icon: Mail },
  { key: 'chat', label: 'Chat', icon: MessageCircle },
  { key: 'analyse', label: 'Tri des missions', icon: Wand2 },
];

export function LoadingScreen() {
  const { sync, data } = useApp();
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [hi, setHi] = useState(data?.stats.highScore || 0);
  useEffect(() => {
    if (!sync || !canvasRef.current) return;
    const game = new Runner(canvasRef.current, {
      highScore: data?.stats.highScore || 0,
      sfx,
      onScore: (s) => setScore(s),
      onGameOver: (s) => { api.saveScore(s).then(setHi); },
    });
    return () => {
      if (game.state === 'running' && game.score > 0) api.saveScore(game.score);
      game.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!sync]);
  const idx = sync ? STEPS.findIndex((s) => s.key === sync.key) : -1;
  return (
    <AnimatePresence>
      {sync && (
        <motion.div className="fullscreen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>📨</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>Je récupère tes missions…</div>
            <div className="muted" style={{ marginTop: 4 }}>{sync.label} En attendant, bats ton record !</div>
            <div className="steps">
              {STEPS.map((s, i) => {
                const st = i < idx || sync.done?.includes(s.key) ? 'done' : i === idx ? 'active' : '';
                return (
                  <span key={s.key} className={`step ${st}`}>
                    {st === 'active' ? <span className="spin" style={{ display: 'inline-flex' }}><s.icon size={13} /></span> : st === 'done' ? <Check size={13} /> : <s.icon size={13} />}
                    {s.label}
                    {s.key === 'mail' && sync.key === 'mail' && sync.total ? ` ${sync.count}/${sync.total}` : ''}
                  </span>
                );
              })}
            </div>
          </div>
          <motion.div className="game-frame" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.08 }}>
            <canvas ref={canvasRef} />
            <div className="game-hud">
              <span style={{ color: '#fde68a' }}>🏆 RECORD {String(Math.max(hi, score)).padStart(5, '0')}</span>
              <span style={{ color: '#fff' }}>{String(score).padStart(5, '0')}</span>
            </div>
          </motion.div>
          <div className="dim" style={{ fontSize: 12.5, marginTop: 14 }}>Espace ou ↑ pour sauter (deux fois pour un double saut), ↓ pour se baisser. Dès que c'est prêt, je te ramène à tes quêtes.</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Mise à jour automatique au lancement
// ---------------------------------------------------------------------------
export function UpdateOverlay() {
  const { updater, setUpdater } = useApp();
  const [dismissed, setDismissed] = useState(false);
  const show = !dismissed && updater && ['available', 'downloading', 'extracting', 'ready', 'installing'].includes(updater.state);
  useEffect(() => {
    if (updater?.state === 'available' && !dismissed) {
      const t = setTimeout(() => api.installUpdate(), 1200);
      return () => clearTimeout(t);
    }
  }, [updater?.state, dismissed]);
  const p = updater?.progress || 0;
  const label = { available: 'Nouvelle version trouvée.', downloading: 'Téléchargement…', extracting: 'Préparation…', ready: 'Installation…', installing: 'Redémarrage…' }[updater?.state];
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fullscreen" style={{ zIndex: 120 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div style={{ textAlign: 'center', width: 440 }} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            <motion.div style={{ fontSize: 54 }} animate={{ y: [0, -8, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>🚀</motion.div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>Mise à jour vers la v{updater.version}</div>
            <div className="muted" style={{ marginTop: 6 }}>{label} QuestFlow va redémarrer tout seul, tes quêtes sont conservées.</div>
            <XpBar progress={p} style={{ height: 6, marginTop: 24 }} />
            <div className="row dim" style={{ justifyContent: 'space-between', fontSize: 12.5, marginTop: 6 }}><span>{Math.round(p * 100)} %</span><span>v{updater.current} → v{updater.version}</span></div>
            {updater.state === 'available' && <button className="btn sm" style={{ marginTop: 16 }} onClick={() => setDismissed(true)}>Plus tard</button>}
          </motion.div>
        </motion.div>
      )}
      {updater?.state === 'error' && updater.error && !dismissed && updater.version && (
        <motion.div className="toasts" style={{ bottom: 'auto', top: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="toast">⚠️ Mise à jour impossible : {updater.error} <button className="btn sm" style={{ color: '#fff' }} onClick={() => { setDismissed(true); setUpdater(null); }}>OK</button></div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Messages en bas de l'écran
// ---------------------------------------------------------------------------
const TOAST_EMOJI = { sparkles: '✨', trash: '🗑️', alert: '⚠️', check: '✅' };
export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className="toast" layout initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={{ duration: 0.18 }}>
            <span>{TOAST_EMOJI[t.icon] || '✨'}</span>
            <span>{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
