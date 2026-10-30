import { useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { colorOf } from '../lib/colors.js';
import { xpForTask } from '../../shared/game.js';
import { SourceBadge, PriorityBadge, DifficultyMeter, DueBadge, IconTile, CheckButton, DeleteButton, TagBadge } from './bits.jsx';
import { IconColorPicker } from './IconColorPicker.jsx';

/** Carte « quête » (vue Quêtes du jour). */
export const TaskCard = forwardRef(function TaskCard({ task, index = 0 }, ref) {
  const { openTask, complete, remove, highlight } = useApp();
  const [picker, setPicker] = useState(false);
  const c = colorOf(task.color);
  const subs = task.subtasks || [];
  const subsDone = subs.filter((s) => s.done).length;
  const isNew = task.isNew || highlight.includes(task.id);
  return (
    <motion.div
      ref={ref}
      layout
      className={`qcard ${isNew ? 'new' : ''}`}
      style={{ '--c': c, zIndex: picker ? 20 : 1 }}
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85, filter: 'blur(6px)' }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, delay: Math.min(index * 0.05, 0.4) }}
      whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 22 } }}
      onClick={() => openTask(task.id)}
    >
      <div className="qcard-inner">
        <div className="qcard-top">
          <span style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <IconTile icon={task.icon} color={task.color} onClick={() => setPicker((v) => !v)} />
            <AnimatePresence>
              {picker && (
                <IconColorPicker icon={task.icon} color={task.color} style={{ top: 48, left: 0 }} onClose={() => setPicker(false)} onChange={(p) => api.updateTask(task.id, p)} />
              )}
            </AnimatePresence>
          </span>
          <SourceBadge source={task.source} />
          {isNew && (
            <span className="badge new">
              <Sparkles size={11} /> Nouveau
            </span>
          )}
          <span className="grow" />
          <DeleteButton label={task.title} onConfirm={() => remove(task)} />
        </div>
        <div className="qcard-title">{task.title}</div>
        {subs.length > 0 && (
          <div className="row" style={{ gap: 8 }}>
            <div className="subprog" style={{ '--c': c, width: 90 }}>
              <div style={{ width: `${(subsDone / subs.length) * 100}%` }} />
            </div>
            <span className="dim mono" style={{ fontSize: 11 }}>{subsDone}/{subs.length}</span>
          </div>
        )}
        <div className="qcard-meta">
          <DueBadge dueAt={task.dueAt} />
          {task.priority <= 2 && <PriorityBadge priority={task.priority} />}
          <DifficultyMeter value={task.difficulty} />
          {(task.tags || []).slice(0, 1).map((t) => <TagBadge key={t} tag={t} />)}
        </div>
        <div className="qcard-foot">
          <span className="xp-reward">⚡ +{xpForTask(task)} XP</span>
          <span className="grow" />
          <CheckButton large onDone={() => complete(task)} />
        </div>
      </div>
    </motion.div>
  );
});
