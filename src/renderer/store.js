import { create } from 'zustand';
import { api } from './api.js';
import { sfx } from './lib/sound.js';

let toastId = 0;

export const useApp = create((set, get) => ({
  data: null,
  phase: 'boot', // boot | onboarding | greeting | main
  tab: 'quests',
  query: '',
  searchOpen: false,
  selectedId: null,
  creating: false,
  pasteOpen: false,
  googleLogin: null, // { phase: opening | waiting | detected | verifying | done | error | no-chrome, email, error }
  calendarAssist: null,
  paletteOpen: false,
  sync: null, // { label, key, done: [], startedAt }
  success: null, // { task, reward }
  toasts: [],
  updater: null,
  highlight: [],

  setData: (data) => set({ data }),
  setPhase: (phase) => set({ phase }),
  setTab: (tab) => { sfx.click(); set({ tab, query: '', selectedId: null }); },
  setQuery: (query) => set({ query }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  openTask: (selectedId) => set({ selectedId, creating: false }),
  closeTask: () => set({ selectedId: null, creating: false }),
  newTask: () => set({ creating: true, selectedId: null }),
  setPasteOpen: (pasteOpen) => set({ pasteOpen }),
  setGoogleLogin: (googleLogin) => set({ googleLogin }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  /** Connexion Google : une fenêtre Chrome s'ouvre, tu te connectes, elle se ferme toute seule. */
  async connectGoogle() {
    if (get().googleLogin && !['done', 'error', 'no-chrome', 'cancelled'].includes(get().googleLogin.phase)) return null;
    set({ googleLogin: { phase: 'opening' } });
    const r = await api.googleConnect();
    if (r?.connected) {
      set({ googleLogin: { ...(get().googleLogin || {}), phase: 'done', email: r.email } });
      get().toast(`Google connecté${r.email ? ` (${r.email})` : ''}`, { icon: 'check' });
      setTimeout(() => { if (get().googleLogin?.phase === 'done') set({ googleLogin: null }); }, 1600);
    } else if (r?.code === 'CANCELLED') set({ googleLogin: null });
    else if (!['error', 'no-chrome'].includes(get().googleLogin?.phase)) set({ googleLogin: { phase: r?.code === 'NO_CHROME' ? 'no-chrome' : 'error', error: r?.error } });
    return r;
  },

  toast(text, { icon = 'sparkles', ms = 3800 } = {}) {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, icon }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), ms);
  },

  async complete(task) {
    const reward = await api.completeTask(task.id);
    if (!reward) return;
    sfx.complete();
    set({ success: { task, reward }, selectedId: null });
  },
  clearSuccess: () => set({ success: null }),

  async remove(task) {
    sfx.remove();
    await api.deleteTask(task.id);
    if (get().selectedId === task.id) set({ selectedId: null });
    get().toast(`Quête supprimée : ${task.title}`, { icon: 'trash' });
  },

  async runSync() {
    if (get().sync) return;
    const prevTab = get().tab;
    set({ sync: { key: 'connect', label: 'Ouverture de Chrome en arrière-plan…', done: [], startedAt: Date.now() } });
    const off = api.onSyncProgress((p) => {
      const s = get().sync;
      if (!s) return;
      const done = s.key !== p.key && !s.done.includes(s.key) ? [...s.done, s.key] : s.done;
      set({ sync: { ...s, key: p.key, label: p.label, count: p.done, total: p.total, done } });
    });
    let res;
    try {
      res = await api.sync(['calendar', 'mail', 'chat']);
    } finally {
      off();
    }
    // Dès que c'est fini : retour direct à l'onglet, nouvelles quêtes mises en avant.
    set({ sync: null, tab: prevTab === 'agenda' || prevTab === 'settings' ? 'todo' : prevTab, highlight: res?.newTasks || [] });
    if (res?.ok) {
      const n = res.newTasks.length;
      const read = [res.mails != null && `${res.mails} mail${res.mails > 1 ? 's' : ''} lu${res.mails > 1 ? 's' : ''}`, res.events != null && `${res.events} événement${res.events > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
      get().toast(`${n ? `${n} nouvelle${n > 1 ? 's' : ''} quête${n > 1 ? 's' : ''}` : 'Aucune nouvelle mission'}${read ? ` (${read})` : ''}`, { icon: n ? 'sparkles' : 'check', ms: 5000 });
      const errs = Object.entries(res.errors || {});
      if (errs.length) setTimeout(() => get().toast(`Lecture incomplète : ${errs.map(([k, v]) => `${{ mail: 'Gmail', calendar: 'Agenda', chat: 'Chat' }[k] || k} : ${v}`).join(' · ')}`, { icon: 'alert', ms: 9000 }), 600);
      if (n) sfx.pop();
      setTimeout(() => set({ highlight: [] }), 6000);
    } else if (res?.code === 'NOT_LOGGED_IN' || res?.code === 'NO_CHROME') {
      get().toast(res.code === 'NO_CHROME' ? 'Installe Google Chrome pour relier ton compte Google' : 'Ta session Google a expiré : reconnecte-toi dans Chrome', { icon: 'alert', ms: 6000 });
      get().connectGoogle();
    } else if (res?.code === 'BUSY') {
      get().toast(res.error, { icon: 'alert', ms: 6000 });
    } else {
      get().toast(`Synchronisation incomplète : ${res?.error || 'erreur inconnue'}`, { icon: 'alert', ms: 6000 });
    }
  },

  setUpdater: (updater) => set({ updater }),
}));
