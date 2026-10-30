import { describe, it, expect } from 'vitest';
import { extractTasksFromText } from '../src/shared/extract.js';
import { sortTasks, bucketOf, todaysQuests, groupTasks } from '../src/shared/priority.js';
import { parseQuery, searchTasks } from '../src/shared/search.js';
import { parseDue } from '../src/shared/dates.js';
import { xpForTask, levelInfo, updateStreak, currentStreak } from '../src/shared/game.js';

const NOW = new Date(2026, 9, 28, 10, 0, 0); // mercredi 28/10/2026 10:00
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();

const TASKS = [
  { id: 'a', title: 'Préparer le deck investisseurs', priority: 2, difficulty: 5, dueAt: at(30, 18), tags: ['finance'], source: 'manual', status: 'todo' },
  { id: 'b', title: 'Envoyer le récap au client', priority: 3, difficulty: 1, dueAt: at(28, 20), tags: ['client'], source: 'mail', sourceMeta: { from: { name: 'Jean Dupont', email: 'jean@x.fr' } }, status: 'todo' },
  { id: 'c', title: 'Relancer le fournisseur', priority: 3, difficulty: 1, dueAt: at(27, 18), tags: [], source: 'chat', status: 'todo' },
  { id: 'd', title: 'Ranger le Drive', priority: 4, difficulty: 2, dueAt: null, tags: [], source: 'manual', status: 'todo' },
  { id: 'e', title: 'Corriger le prix landing', priority: 1, difficulty: 2, dueAt: null, tags: ['web'], source: 'mail', status: 'todo' },
  { id: 'f', title: 'Ajouter des ads TikTok', priority: 3, difficulty: 3, dueAt: at(29, 12), tags: ['ads'], source: 'mail', status: 'todo' },
  { id: 'g', title: 'Facture Studio K', priority: 3, difficulty: 1, dueAt: null, tags: ['finance'], source: 'manual', status: 'done' },
];

describe('tri par priorité', () => {
  it('retard > ce soir > urgente sans date > demain > semaine > sans date', () => {
    const order = sortTasks(TASKS.filter((t) => t.status !== 'done'), NOW).map((t) => t.id);
    expect(order).toEqual(['c', 'e', 'b', 'f', 'a', 'd']);
  });
  it('une tâche pour ce soir passe devant une tâche haute de vendredi', () => {
    expect(bucketOf(TASKS[1], NOW)).toBeLessThan(bucketOf(TASKS[0], NOW));
  });
  it('quêtes du jour', () => {
    expect(todaysQuests(TASKS, NOW).map((t) => t.id)).toEqual(['c', 'e', 'b']);
  });
  it('groupes', () => {
    expect(groupTasks(TASKS.filter((t) => t.status !== 'done'), NOW).map((g) => g.key)).toEqual(['overdue', 'today', 'tomorrow', 'week', 'nodate']);
  });
});

describe('recherche', () => {
  const s = (q) => searchTasks(TASKS, q, NOW).map((t) => t.id);
  it('texte sans accents', () => expect(s('recap')).toEqual(['b']));
  it('tag', () => expect(s('#finance')).toEqual(['a']));
  it('priorité', () => expect(s('prio:urgente')).toEqual(['e']));
  it('source', () => expect(s('source:mail').sort()).toEqual(['b', 'e', 'f']));
  it('date', () => expect(s('date:aujourdhui').sort()).toEqual(['b', 'e']));
  it('retard', () => expect(s('date:retard')).toEqual(['c']));
  it('expéditeur', () => expect(s('de:jean')).toEqual(['b']));
  it('difficulté', () => expect(s('diff:epique')).toEqual(['a']));
  it('terminées', () => expect(s('statut:fait')).toEqual(['g']));
  it('combinaison', () => expect(s('ads demain')).toEqual(['f']));
  it('libellés en texte libre', () => expect(s('haute')).toEqual(['a']));
  it('parse', () => {
    const p = parseQuery('#ads prio:haute "landing page" @mail');
    expect(p.tags).toEqual(['ads']);
    expect(p.priority).toEqual([2]);
    expect(p.text).toEqual(['landing page']);
    expect(p.sources).toEqual(['mail']);
  });
});

describe('dates', () => {
  const d = (txt) => {
    const r = parseDue(txt, NOW);
    if (!r.due) return null;
    const x = r.due;
    return `${x.getDate()}/${x.getMonth() + 1} ${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}`;
  };
  it('ce soir', () => expect(d('à envoyer ce soir')).toBe('28/10 20:00'));
  it('demain matin', () => expect(d('demain matin')).toBe('29/10 10:00'));
  it('avant vendredi', () => expect(d('avant vendredi')).toBe('30/10 18:00'));
  it('lundi prochain', () => expect(d('lundi prochain')).toBe('2/11 18:00'));
  it('avant 15h', () => expect(d('avant 15h')).toBe('28/10 15:00'));
  it('14h30 demain', () => expect(d('demain à 14h30')).toBe('29/10 14:30'));
  it('le 12/11', () => expect(d('pour le 12/11')).toBe('12/11 18:00'));
  it('12 novembre', () => expect(d('le 12 novembre')).toBe('12/11 18:00'));
  it('fin de semaine', () => expect(d("d'ici la fin de la semaine")).toBe('30/10 18:00'));
  it('dans 3 jours', () => expect(d('dans 3 jours')).toBe('31/10 18:00'));
  it('dans 2h', () => expect(d('dans 2h')).toBe('28/10 12:00'));
  it('by Friday', () => expect(d('by Friday')).toBe('30/10 18:00'));
  it('tomorrow 3pm', () => expect(d('tomorrow at 3pm')).toBe('29/10 15:00'));
  it('ASAP', () => expect(parseDue('ASAP stp', NOW).urgency).toBe('urgent'));
  it('pas urgent', () => expect(parseDue('pas urgent', NOW).urgency).toBe('low'));
  it('pas de date dans un prix', () => expect(d('le CPM est à 3.5')).toBe(null));
  it('durée ≠ heure', () => expect(d('ça prend 2h de travail')).toBe(null));
});

describe('gamification', () => {
  it('XP selon difficulté et priorité', () => {
    expect(xpForTask({ difficulty: 1, priority: 3 }, NOW)).toBe(10);
    expect(xpForTask({ difficulty: 5, priority: 1 }, NOW)).toBe(120);
    expect(xpForTask({ difficulty: 3, priority: 3, dueAt: at(29, 10) }, NOW)).toBe(40);
  });
  it('niveaux', () => {
    expect(levelInfo(0).level).toBe(1);
    expect(levelInfo(100).level).toBe(2);
    expect(levelInfo(239).level).toBe(2);
    expect(levelInfo(240).level).toBe(3);
  });
  it('série', () => {
    let st = { streak: 0 };
    st = updateStreak(st, new Date(2026, 9, 26, 9));
    st = updateStreak(st, new Date(2026, 9, 27, 9));
    st = updateStreak(st, new Date(2026, 9, 27, 18));
    expect(st.streak).toBe(2);
    expect(currentStreak(st, NOW)).toBe(2);
    expect(currentStreak(st, new Date(2026, 9, 30))).toBe(0);
  });
});

describe('heure dans le titre', () => {
  const now = new Date(2026, 9, 30, 10);
  const one = (t) => extractTasksFromText(t, { userName: 'Stella', now }).tasks[0];
  it("retire « demain 17h », « à 17h », « avant 17h demain » du titre et garde l'heure", () => {
    for (const t of ["Peux-tu m'envoyer les visuels Black Friday avant demain 17h ?", 'Peux-tu envoyer les visuels Black Friday demain à 17h ?', 'Envoie les visuels Black Friday avant 17h demain stp']) {
      const task = one(t);
      expect(task.title).toBe('Envoyer les visuels Black Friday');
      expect(new Date(task.dueAt).getDate()).toBe(31);
      expect(new Date(task.dueAt).getHours()).toBe(17);
    }
  });
  it('une durée reste dans le titre', () => {
    expect(one('Peux-tu relire le brief de 2h demain ?').title).toBe('Relire le brief de 2h');
  });
});
