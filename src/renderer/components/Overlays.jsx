import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Download, Sparkles, Trash2, AlertTriangle, Crown, CircleCheck, Calendar, Mail, MessageCircle, Wand2 } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { sfx } from '../lib/sound.js';
import { Runner } from '../game/runner.js';
import { todaysQuests } from '../../shared/priority.js';
import { levelInfo, currentStreak } from '../../shared/game.js';

// Paramètres d'aperçu (captures d'écran) : ?hold=1 fige le Bonjour, ?slow=4 ralentit l'animation de victoire.
const PREVIEW = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const SLOW = +(PREVIEW.get('slow') || 1);

// ---------------------------------------------------------------------------
// Fond animé (aurores + grille)
// ---------------------------------------------------------------------------
export function Background({ calm = false }) {
  const blobs = [
    { c: '#7c3aed', x: '-10%', y: '-20%', s: 620, d: 18 },
    { c: '#0891b2', x: '60%', y: '-25%', s: 560, d: 22 },
    { c: '#db2777', x: '75%', y: '55%', s: 480, d: 26 },
    { c: '#4f46e5', x: '10%', y: '60%', s: 520, d: 20 },
  ];
  return (
    <div className="bg-layer">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className="blob"
          style={{ background: b.c, width: b.s, height: b.s, left: b.x, top: b.y, opacity: calm ? 0.28 : 0.42 }}
          animate={{ x: [0, 60, -40, 0], y: [0, -40, 30, 0], scale: [1, 1.12, 0.95, 1] }}
          transition={{ duration: b.d, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      <div className="grid" />
      <div className="noise" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// « Bonjour <prénom> » plein écran à chaque ouverture
// ---------------------------------------------------------------------------
export function Greeting({ onDone }) {
  const data = useApp((s) => s.data);
  const name = data.profile.name || '';
  const quests = todaysQuests(data.tasks).length;
  const lvl = levelInfo(data.stats.xp);
  const streak = currentStreak(data.stats);
  useEffect(() => {
    const t = PREVIEW.has('hold') ? null : setTimeout(onDone, 3000);
    const skip = () => onDone();
    window.addEventListener('keydown', skip);
    return () => { clearTimeout(t); window.removeEventListener('keydown', skip); };
  }, [onDone]);
  const hour = new Date().getHours();
  const word = 'Bonjour';
  return (
    <motion.div className="fullscreen" style={{ background: 'radial-gradient(circle at 50% 40%, #1c1155, #07071a 70%)', cursor: 'pointer' }} onClick={onDone} initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.08, filter: 'blur(12px)' }} transition={{ duration: 0.7, ease: [0.7, 0, 0.3, 1] }}>
      <Background />
      <motion.div style={{ position: 'absolute', width: 520, height: 520, borderRadius: '50%', border: '1px solid rgba(167,139,250,0.25)' }} initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 1.6], opacity: [0.8, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }} />
      <div style={{ position: 'relative', textAlign: 'center' }}>
        <motion.div className="greet-word" style={{ fontSize: 'clamp(48px, 7vw, 96px)', color: '#c4b5fd' }} initial={{ opacity: 0, y: 30, filter: 'blur(16px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, ease: [0.2, 0.8, 0.2, 1] }}>
          {word}{name ? ',' : ' !'}
        </motion.div>
        {name && (
          <div className="greet-word" style={{ fontSize: 'clamp(64px, 11vw, 150px)', marginTop: 8 }}>
            {[...name].map((ch, i) => (
              <motion.span key={i} className="grad-text" style={{ display: 'inline-block', whiteSpace: 'pre' }} initial={{ opacity: 0, y: 60, rotateX: -80, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }} transition={{ delay: 0.45 + i * 0.06, type: 'spring', stiffness: 180, damping: 14 }}>
                {ch}
              </motion.span>
            ))}
            <motion.span style={{ display: 'inline-block' }} initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.6 + name.length * 0.06, type: 'spring', stiffness: 300, damping: 12 }}>
              {hour < 18 ? ' 👋' : ' 🌙'}
            </motion.span>
          </div>
        )}
        <motion.div style={{ marginTop: 26, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }}>
          <span className="lstep active">⚔️ {quests ? `${quests} quête${quests > 1 ? 's' : ''} aujourd'hui` : 'Aucune quête urgente'}</span>
          <span className="lstep active">✨ Niveau {lvl.level} · {lvl.title}</span>
          {streak > 0 && <span className="lstep active">🔥 Série de {streak} jour{streak > 1 ? 's' : ''}</span>}
        </motion.div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Succès plein écran : le nom s'allume en vert puis part en fumée
// ---------------------------------------------------------------------------
export function SuccessOverlay() {
  const { success, clearSuccess, data } = useApp();
  const canvasRef = useRef(null);
  const titleRef = useRef(null);
  const [phase, setPhase] = useState('in');
  const [levelUp, setLevelUp] = useState(false);

  useEffect(() => {
    if (!success) return;
    setPhase('in');
    setLevelUp(false);
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
      ctx.globalCompositeOperation = 'lighter';
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
          const g = Math.round(222 - (1 - a) * 120);
          ctx.fillStyle = `rgba(${Math.round(74 + (1 - a) * 90)},${g},${Math.round(128 + (1 - a) * 60)},${a * 0.9})`;
        } else ctx.fillStyle = p.color.replace('A', a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      for (const s of puffs) {
        s.x += s.vx; s.y += s.vy; s.r += 0.9; s.life -= 0.011;
        if (s.life <= 0) continue;
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, `rgba(170,200,185,${s.life * 0.16})`);
        g.addColorStop(1, 'rgba(170,200,185,0)');
        ctx.fillStyle = g;
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
      const cols = ['rgba(74,222,128,A)', 'rgba(34,211,238,A)', 'rgba(253,224,71,A)', 'rgba(167,139,250,A)', 'rgba(255,255,255,A)'];
      for (let i = 0; i < 170; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 4 + Math.random() * 11;
        parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, r: 1.5 + Math.random() * 3, life: 1, decay: 0.008 + Math.random() * 0.01, color: cols[i % cols.length] });
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
        o.fillStyle = '#fff';
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
      if (success.reward?.levelUp) { setLevelUp(true); sfx.levelUp(); }
    }, 3000 * SLOW);
    const t4 = setTimeout(() => clearSuccess(), (success.reward?.levelUp ? 5200 : 3500) * SLOW);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); cancelAnimationFrame(raf); };
  }, [success, clearSuccess]);

  const lvl = data ? levelInfo(data.stats.xp) : null;
  return (
    <AnimatePresence>
      {success && (
        <motion.div className="fullscreen" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(6,40,30,0.92), rgba(4,4,16,0.96) 65%)', backdropFilter: 'blur(14px)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} onClick={clearSuccess}>
          <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          <motion.div style={{ position: 'relative', width: 96, height: 96, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #22c55e, #34d399)', boxShadow: '0 0 80px rgba(52,211,153,0.8)' }} initial={{ scale: 0, rotate: -90 }} animate={{ scale: phase === 'smoke' ? 0.85 : 1, rotate: 0, opacity: phase === 'smoke' ? 0 : 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, opacity: { duration: 0.8 } }}>
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#052e1c" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.45 }} />
            </svg>
            <motion.div style={{ position: 'absolute', inset: -10, borderRadius: '50%', border: '2px solid rgba(74,222,128,0.6)' }} animate={{ scale: [1, 1.8], opacity: [0.8, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />
          </motion.div>
          <motion.div style={{ marginTop: 22, fontSize: 13, fontWeight: 700, letterSpacing: '0.3em', color: '#86efac' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: phase === 'smoke' ? 0 : 1, y: 0 }} transition={{ delay: 0.3 }}>
            QUÊTE ACCOMPLIE
          </motion.div>
          <motion.h1
            ref={titleRef}
            style={{ position: 'relative', margin: '14px 40px 0', maxWidth: 1000, textAlign: 'center', fontFamily: 'var(--display)', fontWeight: 700, fontSize: 'clamp(30px, 4.6vw, 58px)', letterSpacing: '-0.02em', lineHeight: 1.15 }}
            initial={{ opacity: 0, y: 20, scale: 0.94, color: '#ffffff' }}
            animate={
              phase === 'in'
                ? { opacity: 1, y: 0, scale: 1, color: '#ffffff', textShadow: '0 0 0px rgba(74,222,128,0)' }
                : phase === 'glow'
                  ? { opacity: 1, y: 0, scale: 1.04, color: '#4ade80', textShadow: '0 0 18px rgba(74,222,128,0.95), 0 0 60px rgba(74,222,128,0.6)' }
                  : { opacity: 0, y: -16, scale: 1.05, color: '#4ade80', filter: 'blur(10px)', textShadow: '0 0 30px rgba(74,222,128,0.4)' }
            }
            transition={phase === 'smoke' ? { duration: 0.45 } : { duration: 0.6, ease: 'easeOut' }}
          >
            {success.task.title}
          </motion.h1>
          <motion.div className="xp-reward" style={{ marginTop: 24, fontSize: 26 }} initial={{ opacity: 0, y: 20, scale: 0.6 }} animate={{ opacity: phase === 'smoke' && !levelUp ? 0 : 1, y: 0, scale: 1 }} transition={{ delay: 0.7, type: 'spring', stiffness: 260, damping: 14 }}>
            ⚡ +{success.reward?.xp || 0} XP {success.reward?.streak > 1 && <span style={{ color: '#fdba74', marginLeft: 12 }}>🔥 {success.reward.streak} jours</span>}
          </motion.div>
          <AnimatePresence>
            {levelUp && (
              <motion.div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }} initial={{ scale: 0.3, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 12 }}>
                <Crown size={64} color="#fde047" style={{ filter: 'drop-shadow(0 0 20px rgba(253,224,71,0.8))' }} />
                <div className="greet-word grad-text" style={{ fontSize: 72 }}>Niveau {success.reward.level}</div>
                <div style={{ fontSize: 18, color: '#fde68a', fontWeight: 700 }}>Nouveau rang : {lvl?.title}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Écran de chargement (scan mails / chat / agenda) avec le mini-jeu
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
  const gameRef = useRef(null);
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
    gameRef.current = game;
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
        <motion.div className="fullscreen" style={{ background: 'rgba(5,5,20,0.88)', backdropFilter: 'blur(18px)', gap: 18 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.04 }} transition={{ duration: 0.3 }}>
          <motion.div style={{ textAlign: 'center' }} initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            <div className="page-title grad-text" style={{ fontSize: 26 }}>Je récupère tes missions…</div>
            <div className="muted" style={{ marginTop: 6 }}>{sync.label} — en attendant, bats ton record !</div>
            <div className="loading-steps">
              {STEPS.map((s, i) => {
                const I = s.icon;
                const st = i < idx || sync.done?.includes(s.key) ? 'done' : i === idx ? 'active' : '';
                return (
                  <motion.span key={s.key} className={`lstep ${st}`} layout>
                    {st === 'active' ? <span className="spin" style={{ display: 'inline-flex' }}><I size={14} /></span> : st === 'done' ? <Check size={14} /> : <I size={14} />}
                    {s.label}
                    {s.key === 'mail' && sync.key === 'mail' && sync.total ? ` ${sync.count}/${sync.total}` : ''}
                  </motion.span>
                );
              })}
            </div>
          </motion.div>
          <motion.div className="game-frame" initial={{ y: 30, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}>
            <canvas ref={canvasRef} />
            <div className="game-hud">
              <span style={{ color: '#fde68a' }}>🏆 RECORD {String(Math.max(hi, score)).padStart(5, '0')}</span>
              <span style={{ color: '#fff' }}>{String(score).padStart(5, '0')}</span>
            </div>
          </motion.div>
          <div className="dim" style={{ fontSize: 12 }}>Dès que c'est prêt, je te ramène directement à tes quêtes.</div>
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
  const label = { available: 'Nouvelle version trouvée', downloading: 'Téléchargement…', extracting: 'Préparation…', ready: 'Installation…', installing: 'Redémarrage…' }[updater?.state];
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fullscreen" style={{ background: 'radial-gradient(circle at 50% 40%, #0f2b44, #07071a 70%)', zIndex: 120 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Background calm />
          <motion.div style={{ position: 'relative', textAlign: 'center', width: 460 }} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            <motion.div style={{ width: 84, height: 84, margin: '0 auto 22px', borderRadius: 26, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #22d3ee, #8b5cf6)', boxShadow: '0 20px 60px -10px rgba(34,211,238,0.7)' }} animate={{ y: [0, -8, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
              <Download size={38} color="white" />
            </motion.div>
            <div className="page-title">Mise à jour vers la v{updater.version}</div>
            <div className="muted" style={{ marginTop: 8 }}>{label} QuestFlow va redémarrer tout seul, tes quêtes sont conservées.</div>
            <div className="xpbar" style={{ height: 12, marginTop: 26 }}>
              <motion.div animate={{ width: `${Math.max(4, p * 100)}%` }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
            </div>
            <div className="xp-label"><span>{Math.round(p * 100)} %</span><span>v{updater.current} → v{updater.version}</span></div>
            {updater.state === 'available' && <button className="btn small ghost" style={{ marginTop: 18 }} onClick={() => setDismissed(true)}>Plus tard</button>}
          </motion.div>
        </motion.div>
      )}
      {updater?.state === 'error' && updater.error && !dismissed && updater.version && (
        <motion.div className="toast" style={{ position: 'fixed', left: '50%', top: 20, transform: 'translateX(-50%)', zIndex: 130 }} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          <span className="ti" style={{ background: '#f43f5e' }}><AlertTriangle size={16} /></span>
          <span>Mise à jour impossible : {updater.error}</span>
          <button className="btn small" onClick={() => { setDismissed(true); setUpdater(null); }}>OK</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Notifications dans l'app
// ---------------------------------------------------------------------------
const TOAST_ICONS = { sparkles: Sparkles, trash: Trash2, alert: AlertTriangle, check: Check };
export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => {
          const I = TOAST_ICONS[t.icon] || Sparkles;
          return (
            <motion.div key={t.id} className="toast" layout initial={{ opacity: 0, x: 60, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 60, scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
              <span className="ti" style={t.icon === 'trash' || t.icon === 'alert' ? { background: 'linear-gradient(135deg,#f43f5e,#f97316)' } : undefined}><I size={16} /></span>
              <span>{t.text}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
