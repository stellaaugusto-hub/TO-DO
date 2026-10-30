import { isSameDay, startOfDay } from '../../shared/dates.js';

const time = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « Ce soir 20:00 », « Demain 10:00 », « Ven. 12:00 », « 12 nov. » */
export function formatDue(iso, now = new Date()) {
  if (!iso) return null;
  const d = new Date(iso);
  const tomorrow = new Date(startOfDay(now));
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(startOfDay(now));
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, now)) return d.getHours() >= 19 ? `Ce soir ${time(d)}` : `Aujourd'hui ${time(d)}`;
  if (isSameDay(d, tomorrow)) return `Demain ${time(d)}`;
  if (isSameDay(d, yesterday)) return `Hier ${time(d)}`;
  if (Math.abs(d - now) < 6 * 86400e3) return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${time(d)}`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function dueState(iso, now = new Date()) {
  if (!iso) return null;
  const d = new Date(iso);
  if (d < now) return 'over';
  if (isSameDay(d, now)) return 'today';
  return null;
}

export function relative(iso, now = new Date()) {
  if (!iso) return 'jamais';
  const s = Math.round((now - new Date(iso)) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function todayLabel(now = new Date()) {
  return now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function eventTime(e) {
  if (e.allDay || !e.start) return 'Journée';
  return time(new Date(e.start));
}
