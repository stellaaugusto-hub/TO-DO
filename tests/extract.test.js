import { describe, it, expect } from 'vitest';
import { extractTasks } from '../src/shared/extract.js';
import { cleanEmailBody } from '../src/shared/clean.js';
import { EMAILS, CHATS } from './fixtures/emails.js';

// Mercredi 28 octobre 2026, 10h00 (heure locale)
const NOW = new Date(2026, 9, 28, 10, 0, 0);
const OPTS = { now: NOW, userEmail: 'stella.augusto@innerskin.fr', userName: 'Stella' };

function localIso(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function check(c) {
  const res = extractTasks(c.msg, OPTS);
  const titles = res.tasks.map((t) => t.title);
  if (c.expect.none) {
    expect(titles, `aucune tâche attendue (${res.skipped || 'non filtré'})`).toEqual([]);
    if (c.expect.skipped) expect(res.skipped).toBeTruthy();
    return;
  }
  expect(titles.length, `titres obtenus : ${JSON.stringify(titles)}`).toBe(c.expect.tasks.length);
  c.expect.tasks.forEach((exp, i) => {
    const t = res.tasks[i];
    if (exp.title instanceof RegExp) expect(t.title).toMatch(exp.title);
    else expect(t.title).toBe(exp.title);
    if (exp.due) expect(localIso(t.dueAt).startsWith(exp.due), `échéance ${t.dueAt && localIso(t.dueAt)} ≠ ${exp.due}`).toBe(true);
    if (exp.priority) expect(t.priority).toBe(exp.priority);
    if (exp.subtasks) expect(t.subtasks.map((s) => s.title)).toEqual(exp.subtasks);
    if (exp.tags) for (const tag of exp.tags) expect(t.tags).toContain(tag);
    if (exp.minDifficulty) expect(t.difficulty).toBeGreaterThanOrEqual(exp.minDifficulty);
    if (exp.maxDifficulty) expect(t.difficulty).toBeLessThanOrEqual(exp.maxDifficulty);
  });
}

describe('extraction de tâches — mails', () => {
  for (const c of EMAILS) it(c.name, () => check(c));
});

describe('extraction de tâches — chat', () => {
  for (const c of CHATS) it(c.name, () => check(c));
});

describe('nettoyage du corps', () => {
  it('retire signature, coordonnées et mentions légales', () => {
    const { body } = cleanEmailBody({
      text: "Bonjour,\n\nPeux-tu valider le budget ?\n\nCordialement,\nJean Dupont\nHead of Growth\n+33 6 12 34 56 78\n\nCe message et ses pièces jointes sont confidentiels. Si vous avez reçu ce message par erreur, merci d'avertir l'expéditeur.",
    });
    expect(body).toContain('Peux-tu valider le budget ?');
    expect(body).not.toMatch(/Jean Dupont|Head of|\+33|confidentiels/);
  });
  it('garde un mail sans signature intact', () => {
    const { body } = cleanEmailBody({ text: 'Envoie le fichier au client.' });
    expect(body).toBe('Envoie le fichier au client.');
  });
});

describe('qualité globale', () => {
  it('précision et rappel ≥ 95 % sur le corpus', () => {
    let tp = 0, fp = 0, fn = 0;
    for (const c of [...EMAILS, ...CHATS]) {
      const got = extractTasks(c.msg, OPTS).tasks.map((t) => t.title);
      const want = c.expect.none ? [] : c.expect.tasks.map((t) => t.title);
      const matched = new Set();
      for (const w of want) {
        const idx = got.findIndex((g, i) => !matched.has(i) && (w instanceof RegExp ? w.test(g) : g === w));
        if (idx >= 0) { matched.add(idx); tp++; } else fn++;
      }
      fp += got.length - matched.size;
    }
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    console.log(`précision=${(precision * 100).toFixed(1)}% rappel=${(recall * 100).toFixed(1)}% (tp=${tp} fp=${fp} fn=${fn})`);
    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.95);
  });
});
