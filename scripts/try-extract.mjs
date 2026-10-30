// Usage : node scripts/try-extract.mjs messages.json
// messages.json = [{ subject, from: {name, email}, text, date }]
import { readFileSync } from 'node:fs';
import { extractTasks } from '../src/shared/extract.js';
const msgs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const m of msgs) {
  const r = extractTasks({ source: 'mail', ...m }, { userEmail: process.env.QF_USER_EMAIL || 'stella.augusto@innerskin.fr', userName: 'Stella', now: m.date ? new Date(m.date) : new Date() });
  console.log(`\n=== ${m.subject}  (de ${m.from?.name || m.from?.email})`);
  if (r.skipped) console.log(`   [ignoré: ${r.skipped}]`);
  else if (!r.tasks.length) console.log('   (aucune tâche)');
  for (const t of r.tasks) console.log(`   • ${t.title}  | prio ${t.priority} | diff ${t.difficulty} | échéance ${t.dueAt || '—'} | tags ${t.tags.join(',')}${t.subtasks.length ? ' | sous-tâches: ' + t.subtasks.map((s) => s.title).join(' / ') : ''}`);
}
