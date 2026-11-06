import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, MessageCircle, PenLine, Calendar, Check, Clock, Hash } from 'lucide-react';
import { tagStyle, textColor, STAGES, stageOf, PRIORITY_TAG, SOURCE_TAG, DIFF_COLORS, taskEmoji } from '../lib/notion.js';
import { iconFor } from '../lib/icons.js';
import { DIFFICULTY } from '../../shared/priority.js';
import { formatDue, dueState } from '../lib/format.js';

export function Tag({ color = 'default', children, title, onClick, style }) {
  return (
    <span className="tag" style={{ ...tagStyle(color), ...style }} title={title} onClick={onClick}>
      {children}
    </span>
  );
}

export function StatusTag({ task, stage }) {
  const s = STAGES.find((x) => x.key === (stage || stageOf(task))) || STAGES[0];
  return (
    <span className="status" style={tagStyle(s.color)}>
      <span className="dot" style={{ background: textColor(s.color) }} />
      {s.label}
    </span>
  );
}

export function PriorityTag({ priority = 3 }) {
  const p = PRIORITY_TAG[priority];
  return <Tag color={p.color}>{p.label}</Tag>;
}

const SRC_ICON = { mail: Mail, chat: MessageCircle, slack: Hash, manual: PenLine, calendar: Calendar };
/** Libellé de provenance (distinct de l'icône de la tâche) : enveloppe = mail, crayon = créée par moi. */
export function SourceTag({ source = 'manual' }) {
  const s = SOURCE_TAG[source] || SOURCE_TAG.manual;
  const I = SRC_ICON[source] || PenLine;
  return (
    <Tag color={s.color} title={`Source : ${s.label}`}>
      <I size={12} strokeWidth={2.3} />
      {s.label}
    </Tag>
  );
}

export function DueTag({ dueAt, plain = false }) {
  if (!dueAt) return null;
  const st = dueState(dueAt);
  const label = formatDue(dueAt);
  if (plain) return <span style={{ color: st === 'over' ? 'var(--c-red)' : undefined }}>{label}</span>;
  return (
    <Tag color={st === 'over' ? 'red' : st === 'today' ? 'orange' : 'default'}>
      <Clock size={11} strokeWidth={2.4} />
      {st === 'over' ? 'En retard · ' : ''}
      {label}
    </Tag>
  );
}

export function DiffPips({ value = 2, label = true }) {
  const c = textColor(DIFF_COLORS[value - 1]);
  return (
    <span className="diff" title={`Difficulté : ${DIFFICULTY[value].label}`}>
      <span className="pips">
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className="pip" style={i <= value ? { background: c } : undefined} />)}
      </span>
      {label && DIFFICULTY[value].label}
    </span>
  );
}

/** Icône d'une tâche : emoji (par défaut) ou icône vectorielle colorée. */
export function TaskIcon({ task, size = 18 }) {
  if (task.emoji === '' && task.icon) {
    const I = iconFor(task.icon);
    return <I size={size} color={textColor(task.color)} strokeWidth={2.2} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{taskEmoji(task)}</span>;
}

export function Checkbox({ on, onChange, large = false, title }) {
  return (
    <button
      className={`cb ${on ? 'on' : ''} ${large ? 'lg' : ''}`}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
    >
      {on && <Check size={large ? 14 : 12} strokeWidth={3.5} />}
    </button>
  );
}

export function Toggle({ on, onChange }) {
  return <button className={`toggle ${on ? 'on' : ''}`} onClick={() => onChange(!on)} role="switch" aria-checked={on} />;
}

export function XpBar({ progress, style }) {
  return (
    <div className="bar" style={style}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(2, progress * 100)}%` }} transition={{ type: 'spring', stiffness: 60, damping: 16 }} />
    </div>
  );
}

/**
 * Menu flottant ancré à un élément (rendu dans <body>, se ferme au clic extérieur / Échap).
 */
export function Popover({ anchor, open, onClose, children, align = 'left', width, className = 'menu', offset = 4 }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const w = width || 240;
    let left = align === 'right' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, innerWidth - w - 8));
    let top = r.bottom + offset;
    const h = ref.current?.offsetHeight || 300;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - offset);
    setPos({ left, top, width: w });
  }, [open, anchor, width, align, offset]);
  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !anchor?.contains(e.target)) onClose();
    };
    const esc = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose());
    setTimeout(() => window.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open, anchor, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          className={className}
          style={{ position: 'fixed', ...(pos || { left: -9999, top: -9999 }), width: pos?.width }}
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
          transition={{ duration: 0.12 }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Bouton qui ouvre un Popover. */
export function MenuButton({ button, children, align, width, className, block = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <span ref={ref} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} style={{ display: block ? 'block' : 'inline-flex' }}>{button}</span>
      <Popover anchor={ref.current} open={open} onClose={() => setOpen(false)} align={align} width={width} className={className}>
        {typeof children === 'function' ? children(() => setOpen(false)) : children}
      </Popover>
    </>
  );
}

export function MenuItem({ icon, children, onClick, checked, danger, right }) {
  return (
    <button className="menu-item" onClick={onClick} style={danger ? { color: 'var(--c-red)' } : undefined}>
      {icon && <span style={{ width: 18, display: 'grid', placeItems: 'center', flex: 'none' }}>{icon}</span>}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      {right}
      {checked && <Check size={15} className="chk" />}
    </button>
  );
}

/** Confirmation (utilisée par la croix de suppression). */
export function ConfirmButton({ button, message, confirmLabel = 'Supprimer', onConfirm, align = 'right' }) {
  return (
    <MenuButton button={button} align={align} width={280} className="menu confirm">
      {(close) => (
        <>
          <p>{message}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn outline sm" onClick={close}>Annuler</button>
            <button className="btn sm" style={{ background: 'var(--c-red)', color: '#fff' }} onClick={() => { close(); onConfirm(); }}>{confirmLabel}</button>
          </div>
        </>
      )}
    </MenuButton>
  );
}
