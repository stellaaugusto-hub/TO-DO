// Tri des tâches : ce qui est en retard d'abord, puis ce qui est à faire aujourd'hui
// (une tâche « pour ce soir » passe donc devant une tâche « haute » de la semaine prochaine),
// puis demain, cette semaine, plus tard, sans date. Dans chaque groupe : priorité puis heure.

import { isSameDay, startOfDay } from './dates.js';

export const PRIORITY = {
  1: { key: 'urgent', label: 'Urgente', short: 'Urgent' },
  2: { key: 'high', label: 'Haute', short: 'Haute' },
  3: { key: 'medium', label: 'Moyenne', short: 'Moy.' },
  4: { key: 'low', label: 'Basse', short: 'Basse' },
};

export const DIFFICULTY = {
  1: { label: 'Facile', xp: 10 },
  2: { label: 'Simple', xp: 20 },
  3: { label: 'Moyen', xp: 35 },
  4: { label: 'Difficile', xp: 55 },
  5: { label: 'Épique', xp: 80 },
};

export const BUCKETS = [
  { id: 0, key: 'overdue', label: 'En retard' },
  { id: 1, key: 'today', label: "Aujourd'hui" },
  { id: 2, key: 'tomorrow', label: 'Demain' },
  { id: 3, key: 'week', label: 'Cette semaine' },
  { id: 4, key: 'later', label: 'Plus tard' },
  { id: 5, key: 'nodate', label: 'Sans échéance' },
];

export function bucketOf(task, now = new Date()) {
  if (task.dueAt) {
    const due = new Date(task.dueAt);
    if (due < now && !isSameDay(due, now)) return 0;
    if (due < now) return 0;
    if (isSameDay(due, now)) return 1;
    const tomorrow = new Date(startOfDay(now));
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isSameDay(due, tomorrow)) return 2;
    if (due - now < 7 * 86400e3) return 3;
    return 4;
  }
  if (task.priority === 1) return 1;
  if (task.questDay && isSameDay(task.questDay, now)) return 1;
  if (task.priority === 2) return 3;
  return 5;
}

export function compareTasks(a, b, now = new Date()) {
  if (!!b.pinned - !!a.pinned) return !!b.pinned - !!a.pinned;
  const ba = bucketOf(a, now);
  const bb = bucketOf(b, now);
  if (ba !== bb) return ba - bb;
  if ((a.priority || 3) !== (b.priority || 3)) return (a.priority || 3) - (b.priority || 3);
  const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
  const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
  if (da !== db) return da - db;
  if ((b.difficulty || 2) !== (a.difficulty || 2)) return (b.difficulty || 2) - (a.difficulty || 2);
  return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
}

export function sortTasks(tasks, now = new Date()) {
  return [...tasks].sort((a, b) => compareTasks(a, b, now));
}

/** Quêtes du jour : en retard, à faire aujourd'hui, urgentes, épinglées ou ajoutées au jour. */
export function todaysQuests(tasks, now = new Date()) {
  return sortTasks(
    tasks.filter((t) => t.status !== 'done' && (t.pinned || bucketOf(t, now) <= 1)),
    now,
  );
}

/** Groupes pour la vue liste. */
export function groupTasks(tasks, now = new Date()) {
  const sorted = sortTasks(tasks, now);
  const groups = [];
  for (const t of sorted) {
    const b = t.pinned ? -1 : bucketOf(t, now);
    let g = groups[groups.length - 1];
    if (!g || g.bucket !== b) {
      g = { bucket: b, label: b === -1 ? 'Épinglées' : BUCKETS[b].label, key: b === -1 ? 'pinned' : BUCKETS[b].key, tasks: [] };
      groups.push(g);
    }
    g.tasks.push(t);
  }
  return groups;
}
