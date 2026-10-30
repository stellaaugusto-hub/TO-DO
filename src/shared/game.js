// Gamification : XP, niveaux, séries de jours.

import { DIFFICULTY } from './priority.js';
import { dayKey } from './dates.js';

const PRIO_MULT = { 1: 1.5, 2: 1.25, 3: 1, 4: 0.9 };

export function xpForTask(task, completedAt = new Date()) {
  const base = DIFFICULTY[task.difficulty || 2].xp;
  let xp = base * (PRIO_MULT[task.priority || 3] || 1);
  xp += (task.subtasks?.length || 0) * 3;
  if (task.dueAt && new Date(completedAt) <= new Date(task.dueAt)) xp *= 1.2; // bonus à l'heure
  return Math.max(5, Math.round(xp / 5) * 5);
}

/** XP nécessaire pour passer du niveau n au niveau n+1 */
export function levelCost(n) {
  return 100 + (n - 1) * 40;
}

export function levelInfo(totalXp) {
  let level = 1;
  let rest = Math.max(0, totalXp || 0);
  while (rest >= levelCost(level)) {
    rest -= levelCost(level);
    level++;
  }
  const cost = levelCost(level);
  return { level, into: rest, cost, progress: rest / cost, title: rankTitle(level) };
}

const RANKS = ['Novice', 'Recrue', 'Stratège', 'Élite', 'Virtuose', 'Prodige', 'Titan', 'Légende', 'Mythe'];
export function rankTitle(level) {
  return RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 3))];
}

/** Met à jour la série de jours consécutifs avec au moins une quête terminée. */
export function updateStreak(stats, now = new Date()) {
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y);
  if (stats.lastCompletionDay === today) return { ...stats };
  const streak = stats.lastCompletionDay === yesterday ? (stats.streak || 0) + 1 : 1;
  return { ...stats, streak, bestStreak: Math.max(stats.bestStreak || 0, streak), lastCompletionDay: today };
}

/** Série affichée : retombe à 0 si la veille n'a rien été fait. */
export function currentStreak(stats, now = new Date()) {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (stats.lastCompletionDay === dayKey(now) || stats.lastCompletionDay === dayKey(y)) return stats.streak || 0;
  return 0;
}
