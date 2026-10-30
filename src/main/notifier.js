// Notifications macOS : quêtes prioritaires bientôt dues, échéances atteintes,
// réunions imminentes et récap du matin.

import { Notification } from 'electron';
import { todaysQuests } from '../shared/priority.js';
import { dayKey } from '../shared/dates.js';

export function startNotifier({ store, log, onOpenTask, onOpenApp }) {
  const notify = (key, { title, body, taskId }) => {
    const st = store.get();
    if (st.notified[key]) return;
    st.notified[key] = Date.now();
    store.save();
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => (taskId ? onOpenTask(taskId) : onOpenApp()));
    n.show();
    log.info(`notification ${key}`);
  };

  const tick = () => {
    const st = store.get();
    if (!st.settings.notifications) return;
    const now = new Date();
    const lead = (st.settings.notifyLeadMinutes || 60) * 60e3;
    const name = st.profile.name ? `${st.profile.name}, ` : '';

    for (const t of st.tasks) {
      if (t.status === 'done' || !t.dueAt) continue;
      const due = new Date(t.dueAt).getTime();
      const left = due - now.getTime();
      if (t.priority <= 2 && left > 0 && left <= lead) {
        const min = Math.round(left / 60e3);
        notify(`soon:${t.id}:${t.dueAt}`, {
          title: t.priority === 1 ? '🔥 Quête urgente' : '⚔️ Quête prioritaire',
          body: `${t.title} — dans ${min >= 60 ? Math.round(min / 60) + ' h' : min + ' min'}`,
          taskId: t.id,
        });
      }
      if (left <= 0 && left > -15 * 60e3) {
        notify(`due:${t.id}:${t.dueAt}`, { title: "⏰ C'est l'heure !", body: t.title, taskId: t.id });
      }
    }

    for (const e of st.events || []) {
      if (!e.start || e.allDay) continue;
      const left = new Date(e.start).getTime() - now.getTime();
      if (left > 0 && left <= 10 * 60e3) {
        notify(`event:${e.id}`, { title: `📅 Dans ${Math.round(left / 60e3)} min`, body: e.title });
      }
    }

    if (st.settings.morningDigest && now.getHours() >= (st.settings.digestHour ?? 9) && now.getHours() < 12) {
      const quests = todaysQuests(st.tasks, now);
      if (quests.length) {
        const urgent = quests.filter((q) => q.priority === 1).length;
        notify(`digest:${dayKey(now)}`, {
          title: `☀️ ${name}tes quêtes du jour`,
          body: `${quests.length} quête${quests.length > 1 ? 's' : ''} aujourd'hui${urgent ? `, dont ${urgent} urgente${urgent > 1 ? 's' : ''}` : ''}. En avant !`,
        });
      }
    }

    // ménage des clés anciennes
    const cutoff = Date.now() - 14 * 86400e3;
    for (const [k, v] of Object.entries(st.notified)) if (v < cutoff) delete st.notified[k];
  };

  tick();
  const timer = setInterval(tick, 60e3);
  return { stop: () => clearInterval(timer), tick };
}
