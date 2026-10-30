import { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RotateCcw, Pin } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { colorOf } from '../lib/colors.js';
import { SourceBadge, PriorityBadge, DifficultyMeter, DueBadge, IconTile, CheckButton, DeleteButton, TagBadge } from './bits.jsx';
import { IconColorPicker } from './IconColorPicker.jsx';

/** Ligne de la to-do. */
export const TaskRow = forwardRef(function TaskRow({ task, index = 0, done = false }, ref) {
  const { openTask, complete, remove, highlight } = useApp();
  const [picker, setPicker] = useState(false);
  const c = colorOf(task.color);
  const subs = task.subtasks || [];
  const isNew = task.isNew || highlight.includes(task.id);
  return (
    <motion.div
      ref={ref}
      layout
      className={`trow ${done ? 'done' : ''}`}
      style={{ '--c': c, zIndex: picker ? 20 : 1 }}
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, filter: 'blur(4px)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: Math.min(index * 0.03, 0.3) }}
      onClick={() => openTask(task.id)}
    >
      {done ? (
        <button className="btn small icon" title="Remettre dans la to-do" onClick={(e) => { e.stopPropagation(); api.restoreTask(task.id); }}>
          <RotateCcw size={15} />
        </button>
      ) : (
        <CheckButton onDone={() => complete(task)} />
      )}
      <span style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <IconTile icon={task.icon} color={task.color} size="sm" onClick={() => setPicker((v) => !v)} />
        <AnimatePresence>
          {picker && <IconColorPicker icon={task.icon} color={task.color} style={{ top: 42, left: 0 }} onClose={() => setPicker(false)} onChange={(p) => api.updateTask(task.id, p)} />}
        </AnimatePresence>
      </span>
      <div className="trow-main">
        <div className="trow-title">
          {task.pinned && <Pin size={13} style={{ marginRight: 6, color: '#fbbf24', verticalAlign: -1 }} />}
          {task.title}
        </div>
        <div className="trow-meta">
          <SourceBadge source={task.source} />
          {isNew && <span className="badge new"><Sparkles size={11} /> Nouveau</span>}
          {done ? (
            <span className="badge" style={{ color: '#a7f3d0' }}>✓ {new Date(task.completedAt).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · +{task.xpEarned} XP</span>
          ) : (
            <DueBadge dueAt={task.dueAt} />
          )}
          <PriorityBadge priority={task.priority} />
          <DifficultyMeter value={task.difficulty} />
          {(task.tags || []).slice(0, 3).map((t) => <TagBadge key={t} tag={t} />)}
          {subs.length > 0 && <span className="badge mono">☑ {subs.filter((s) => s.done).length}/{subs.length}</span>}
        </div>
      </div>
      <DeleteButton label={task.title} onConfirm={() => remove(task)} />
    </motion.div>
  );
});
