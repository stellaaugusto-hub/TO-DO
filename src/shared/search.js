// Recherche dans la to-do : texte libre + filtres.
//   #ads              tag
//   prio:haute  !urgent
//   date:aujourdhui | demain | semaine | retard | sans | 12/11
//   source:mail | chat | slack | perso | agenda     (ou @mail, @chat, @slack, @perso)
//   diff:3 | diff:facile | diff:epique
//   de:jean           expéditeur
//   statut:fait | tout
//   "phrase exacte"

import { fold } from './text.js';
import { PRIORITY, DIFFICULTY, bucketOf, BUCKETS } from './priority.js';
import { isSameDay } from './dates.js';

const PRIO_WORDS = { urgent: 1, urgente: 1, '1': 1, haute: 2, high: 2, '2': 2, moyenne: 3, medium: 3, moy: 3, '3': 3, basse: 4, low: 4, '4': 4 };
const DIFF_WORDS = { facile: 1, simple: 2, moyen: 3, difficile: 4, dur: 4, epique: 5, boss: 5 };
const SOURCE_WORDS = { mail: 'mail', mails: 'mail', email: 'mail', gmail: 'mail', chat: 'chat', slack: 'slack', perso: 'manual', moi: 'manual', manuel: 'manual', manual: 'manual', agenda: 'calendar', calendar: 'calendar' };
const DATE_WORDS = { aujourdhui: 'today', "aujourd'hui": 'today', auj: 'today', today: 'today', demain: 'tomorrow', tomorrow: 'tomorrow', semaine: 'week', week: 'week', retard: 'overdue', overdue: 'overdue', sans: 'nodate', aucune: 'nodate', plus_tard: 'later', later: 'later' };
export const SOURCE_LABEL = { mail: 'Mail', chat: 'Chat', slack: 'Slack', manual: 'Perso', calendar: 'Agenda' };

export function parseQuery(q) {
  const out = { text: [], tags: [], priority: [], dates: [], sources: [], difficulty: [], from: [], status: 'todo', dateExact: null };
  const tokens = String(q || '').match(/"[^"]*"|\S+/g) || [];
  for (const raw of tokens) {
    const tok = fold(raw);
    let m;
    if (tok.startsWith('"')) { const p = tok.replace(/"/g, '').trim(); if (p) out.text.push(p); continue; }
    if ((m = tok.match(/^#(.+)/))) { out.tags.push(m[1]); continue; }
    if ((m = tok.match(/^(?:prio|priorite|p):(.+)$/)) || (m = tok.match(/^!(.+)$/))) {
      if (PRIO_WORDS[m[1]]) { out.priority.push(PRIO_WORDS[m[1]]); continue; }
    }
    if ((m = tok.match(/^(?:date|echeance|quand):(.+)$/))) {
      if (DATE_WORDS[m[1]]) out.dates.push(DATE_WORDS[m[1]]);
      else if ((m = m[1].match(/^(\d{1,2})[/.-](\d{1,2})$/))) out.dateExact = { d: +m[1], m: +m[2] };
      continue;
    }
    if ((m = tok.match(/^(?:source|src):(.+)$/)) || (m = tok.match(/^@(mail|mails|chat|slack|perso|moi|agenda)$/))) {
      if (SOURCE_WORDS[m[1]]) { out.sources.push(SOURCE_WORDS[m[1]]); continue; }
    }
    if ((m = tok.match(/^(?:diff|difficulte|niveau):(.+)$/))) {
      const v = DIFF_WORDS[m[1]] || (+m[1] >= 1 && +m[1] <= 5 ? +m[1] : null);
      if (v) out.difficulty.push(v);
      continue;
    }
    if ((m = tok.match(/^(?:de|from|par):(.+)$/))) { out.from.push(m[1]); continue; }
    if ((m = tok.match(/^(?:statut|status|etat):(.+)$/))) {
      out.status = /^(fait|faite|faites|termine|terminee|terminees|done|fini)$/.test(m[1]) ? 'done' : /^(tout|all|toutes)$/.test(m[1]) ? 'all' : 'todo';
      continue;
    }
    out.text.push(tok);
  }
  return out;
}

export function isEmptyQuery(p) {
  return !p.text.length && !p.tags.length && !p.priority.length && !p.dates.length && !p.sources.length && !p.difficulty.length && !p.from.length && !p.dateExact;
}

function haystack(task, now) {
  const due = task.dueAt ? new Date(task.dueAt) : null;
  const parts = [
    task.title, task.description, task.notes,
    ...(task.tags || []).map((t) => `#${t} ${t}`),
    ...(task.subtasks || []).map((s) => s.title),
    task.sourceMeta?.from?.name, task.sourceMeta?.from?.email, task.sourceMeta?.subject,
    PRIORITY[task.priority]?.label, DIFFICULTY[task.difficulty]?.label, SOURCE_LABEL[task.source],
    BUCKETS[bucketOf(task, now)]?.label,
  ];
  if (due) parts.push(due.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), `${due.getDate()}/${due.getMonth() + 1}`);
  return fold(parts.filter(Boolean).join(' • '));
}

export function matchTask(task, p, now = new Date()) {
  if (p.status === 'todo' && task.status === 'done') return false;
  if (p.status === 'done' && task.status !== 'done') return false;
  if (p.tags.length && !p.tags.every((t) => (task.tags || []).some((x) => fold(x).startsWith(t)))) return false;
  if (p.priority.length && !p.priority.includes(task.priority)) return false;
  if (p.difficulty.length && !p.difficulty.includes(task.difficulty)) return false;
  if (p.sources.length && !p.sources.includes(task.source || 'manual')) return false;
  if (p.from.length) {
    const f = fold(`${task.sourceMeta?.from?.name || ''} ${task.sourceMeta?.from?.email || ''}`);
    if (!p.from.every((x) => f.includes(x))) return false;
  }
  if (p.dates.length) {
    const b = bucketOf(task, now);
    const ok = p.dates.some((d) => (d === 'week' ? b <= 3 && b >= 1 : d === 'nodate' ? !task.dueAt : BUCKETS[b].key === d));
    if (!ok) return false;
  }
  if (p.dateExact) {
    if (!task.dueAt) return false;
    const d = new Date(task.dueAt);
    if (d.getDate() !== p.dateExact.d || d.getMonth() + 1 !== p.dateExact.m) return false;
  }
  if (p.text.length) {
    const h = haystack(task, now);
    if (!p.text.every((t) => h.includes(t))) return false;
  }
  return true;
}

export function searchTasks(tasks, query, now = new Date()) {
  const p = typeof query === 'string' ? parseQuery(query) : query;
  const res = tasks.filter((t) => matchTask(t, p, now));
  if (!p.text.length) return res;
  const rank = (t) => (p.text.every((x) => fold(t.title).includes(x)) ? 0 : 1);
  return res.sort((a, b) => rank(a) - rank(b));
}

/** Suggestions de filtres affichées sous la barre de recherche. */
export const SEARCH_HINTS = [
  { label: "Aujourd'hui", q: 'date:aujourdhui' },
  { label: 'En retard', q: 'date:retard' },
  { label: 'Urgentes', q: 'prio:urgente' },
  { label: 'Depuis mes mails', q: 'source:mail' },
  { label: 'Depuis le chat', q: 'source:chat' },
  { label: 'Depuis Slack (agences)', q: 'source:slack' },
  { label: 'Créées par moi', q: 'source:perso' },
  { label: 'Faciles', q: 'diff:facile' },
  { label: 'Épiques', q: 'diff:epique' },
  { label: 'Terminées', q: 'statut:fait' },
];

export { isSameDay };
