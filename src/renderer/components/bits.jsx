import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, MessageCircle, PenLine, Calendar, Flame, ArrowUp, Minus, ArrowDown, Clock, X, Check, Hash } from 'lucide-react';
import { PRIORITY, DIFFICULTY } from '../../shared/priority.js';
import { DIFF_COLORS, colorOf } from '../lib/colors.js';
import { iconFor } from '../lib/icons.js';
import { formatDue, dueState } from '../lib/format.js';

const SRC = {
  mail: { icon: Mail, label: 'Mail' },
  chat: { icon: MessageCircle, label: 'Chat' },
  manual: { icon: PenLine, label: 'Perso' },
  calendar: { icon: Calendar, label: 'Agenda' },
};

/** Libellé de provenance (différent du logo de la quête) : enveloppe = mail, crayon = créée par moi. */
export function SourceBadge({ source = 'manual', compact = false }) {
  const s = SRC[source] || SRC.manual;
  const I = s.icon;
  return (
    <span className={`badge src-${source}`} title={`Source : ${s.label}`}>
      <I size={12} strokeWidth={2.4} />
      {!compact && s.label}
    </span>
  );
}

const PRIO_ICON = { 1: Flame, 2: ArrowUp, 3: Minus, 4: ArrowDown };
export function PriorityBadge({ priority = 3 }) {
  const I = PRIO_ICON[priority];
  return (
    <span className={`badge p${priority}`}>
      <I size={12} strokeWidth={2.6} />
      {PRIORITY[priority].label}
    </span>
  );
}

export function DifficultyMeter({ value = 2, showLabel = true }) {
  const c = DIFF_COLORS[value - 1];
  return (
    <span className="diff" title={`Difficulté : ${DIFFICULTY[value].label}`}>
      <span className="pips">
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.span key={i} className="pip" initial={false} animate={{ background: i <= value ? c : 'rgba(255,255,255,0.12)', boxShadow: i <= value ? `0 0 8px ${c}` : 'none' }} />
        ))}
      </span>
      {showLabel && <span style={{ color: c }}>{DIFFICULTY[value].label}</span>}
    </span>
  );
}

export function DueBadge({ dueAt }) {
  if (!dueAt) return null;
  const st = dueState(dueAt);
  return (
    <span className={`badge ${st === 'over' ? 'due-over' : st === 'today' ? 'due-today' : ''}`}>
      <Clock size={12} strokeWidth={2.4} />
      {st === 'over' ? 'En retard · ' : ''}
      {formatDue(dueAt)}
    </span>
  );
}

export function TagBadge({ tag }) {
  return (
    <span className="badge tag">
      <Hash size={11} strokeWidth={2.6} />
      {tag}
    </span>
  );
}

export function IconTile({ icon, color, size = 'md', onClick, className = '' }) {
  const I = iconFor(icon);
  return (
    <span className={`icon-tile ${size === 'sm' ? 'sm' : ''} ${onClick ? 'btnlike' : ''} ${className}`} style={{ '--c': colorOf(color) }} onClick={onClick} role={onClick ? 'button' : undefined} title={onClick ? "Changer l'icône et la couleur" : undefined}>
      <I size={size === 'sm' ? 17 : 20} strokeWidth={2.2} />
    </span>
  );
}

export function CheckButton({ onDone, large = false, color }) {
  return (
    <motion.button
      className={`check ${large ? 'lg' : ''}`}
      whileTap={{ scale: 0.85 }}
      title="Terminer la quête"
      style={color ? { '--c': color } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onDone();
      }}
    >
      <Check size={large ? 22 : 18} strokeWidth={3} />
    </motion.button>
  );
}

/** Croix de suppression avec confirmation. */
export function DeleteButton({ onConfirm, label = 'cette quête' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
      <button className="xbtn" title="Supprimer" onClick={() => setOpen((v) => !v)}>
        <X size={16} strokeWidth={2.6} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="confirm-pop" initial={{ opacity: 0, y: -6, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.95 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
            <p>Supprimer <b>{label}</b> ? Cette action est définitive.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn small" onClick={() => setOpen(false)}>Annuler</button>
              <button className="btn small danger" onClick={() => { setOpen(false); onConfirm(); }}>Supprimer</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

export function Toggle({ on, onChange }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

export function ProgressRing({ value, total, size = 112 }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const p = total ? value / total : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ringg)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - p) }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} style={{ filter: 'drop-shadow(0 0 6px rgba(52,211,153,0.6))' }} />
      </svg>
      <div className="center">
        <div>
          <b>{value}/{total}</b>
          <span>quêtes</span>
        </div>
      </div>
    </div>
  );
}

export function XpBar({ progress }) {
  return (
    <div className="xpbar">
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(3, progress * 100)}%` }} transition={{ type: 'spring', stiffness: 50, damping: 15 }} />
    </div>
  );
}
