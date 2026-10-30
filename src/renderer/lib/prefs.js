// Préférences de personnalisation (stockées dans les réglages de l'app).
import { useApp } from '../store.js';
import { api } from '../api.js';
import { PAGES, TODO_COLUMNS, ACCENTS } from './notion.js';

export const DEFAULT_APPEARANCE = { theme: 'light', accent: 'blue', font: 'default', smallText: false, fullWidth: false, gamification: true, reduceMotion: false };
export const DEFAULT_TODO = { view: 'list', groupBy: 'due', columns: ['stage', 'priority', 'due', 'source'], source: 'all' };

export function getPrefs(settings = {}) {
  const pages = Object.fromEntries(PAGES.map((p) => [p.id, { ...p, hidden: false, ...(settings.pages?.[p.id] || {}) }]));
  return {
    appearance: { ...DEFAULT_APPEARANCE, ...(settings.appearance || {}) },
    pages,
    pageOrder: settings.pageOrder?.length ? settings.pageOrder.filter((id) => pages[id]) : PAGES.map((p) => p.id),
    todo: { ...DEFAULT_TODO, ...(settings.todo || {}) },
    tagColors: settings.tagColors || {},
  };
}

export function usePrefs() {
  const settings = useApp((s) => s.data?.settings);
  return getPrefs(settings);
}

export function savePrefs(patch) {
  const s = useApp.getState().data?.settings || {};
  const p = getPrefs(s);
  const out = {};
  if (patch.appearance) out.appearance = { ...p.appearance, ...patch.appearance };
  if (patch.pages) out.pages = Object.fromEntries(Object.entries({ ...s.pages, ...patch.pages }).map(([k, v]) => [k, { ...(s.pages?.[k] || {}), ...v }]));
  if (patch.pageOrder) out.pageOrder = patch.pageOrder;
  if (patch.todo) out.todo = { ...p.todo, ...patch.todo };
  if (patch.tagColors) out.tagColors = { ...p.tagColors, ...patch.tagColors };
  return api.setSettings(out);
}

/** Applique thème, accent, police… sur <html>. */
export function applyAppearance(a) {
  const root = document.documentElement;
  const dark = a.theme === 'dark' || (a.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.classList.toggle('font-serif', a.font === 'serif');
  root.classList.toggle('font-mono', a.font === 'mono');
  root.classList.toggle('small-text', !!a.smallText);
  root.classList.toggle('full-width', !!a.fullWidth);
  const [c, h] = ACCENTS[a.accent] || ACCENTS.blue;
  root.style.setProperty('--accent', dark && a.accent === 'black' ? '#e3e2e0' : c);
  root.style.setProperty('--accent-hover', dark && a.accent === 'black' ? '#ffffff' : h);
  root.style.setProperty('--accent-soft', `${c}24`);
  return dark;
}

export { TODO_COLUMNS };
