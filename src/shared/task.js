// Création / normalisation d'une tâche (utilisé par le processus principal et l'interface).

import { similarity } from './text.js';
import { guessIcon, guessColor, guessTags, estimateDifficulty } from './extract.js';

const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export function makeTask(p = {}, now = new Date()) {
  const title = (p.title || '').trim() || 'Nouvelle quête';
  const tags = p.tags || guessTags(title + ' ' + (p.description || ''));
  const priority = p.priority || 3;
  return {
    id: p.id || uid(),
    title,
    description: p.description || '',
    notes: p.notes || '',
    source: p.source || 'manual',
    sourceMeta: p.sourceMeta || null,
    priority,
    difficulty: p.difficulty || estimateDifficulty({ title, subtasks: p.subtasks || [] }),
    dueAt: p.dueAt || null,
    tags,
    subtasks: (p.subtasks || []).map((s) => ({ id: s.id || uid(), title: s.title, done: !!s.done })),
    color: p.color || guessColor(tags, priority),
    icon: p.icon || guessIcon(title + ' ' + tags.join(' ')),
    pinned: !!p.pinned,
    questDay: p.questDay || null,
    status: p.status || 'todo',
    createdAt: p.createdAt || now.toISOString(),
    completedAt: p.completedAt || null,
    xpEarned: p.xpEarned || 0,
    isNew: !!p.isNew,
    confidence: p.confidence ?? null,
  };
}

/** Une tâche extraite existe-t-elle déjà (même message ou titre très proche) ? */
export function isDuplicate(candidate, tasks) {
  return tasks.some((t) => {
    if (candidate.sourceMeta?.id && t.sourceMeta?.id === candidate.sourceMeta.id && similarity(t.title, candidate.title) >= 0.5) return true;
    return t.status !== 'done' && similarity(t.title, candidate.title) >= 0.8;
  });
}
