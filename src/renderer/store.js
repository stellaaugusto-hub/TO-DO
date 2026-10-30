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
  googleSetupOpen: false,
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
  setGoogleSetupOpen: (googleSetupOpen) => set({ googleSetupOpen }),

  /** Connexion Google : guide de configuration la première fois, sinon navigateur. */
  async connectGoogle() {
    if (!get().data?.google.configured) return set({ googleSetupOpen: true });
    const r = await api.googleConnect();
    if (r?.connected) get().toast(`Google connecté${r.email ? ` (${r.email})` : ''} 🎉`, { icon: 'check' });
    else if (r?.code === 'NOT_CONFIGURED') set({ googleSetupOpen: true });
    else get().toast(`Connexion Google non terminée : ${r?.error || 'annulée'}`, { icon: 'alert', ms: 6000 });
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
    set({ sync: { key: 'connect', label: 'Connexion à Google…', done: [], startedAt: Date.now() } });
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
      get().toast(n ? `${n} nouvelle${n > 1 ? 's' : ''} quête${n > 1 ? 's' : ''} trouvée${n > 1 ? 's' : ''} dans tes mails et ton chat` : 'Tout est à jour, aucune nouvelle mission', { icon: n ? 'sparkles' : 'check' });
      if (n) sfx.pop();
      setTimeout(() => set({ highlight: [] }), 6000);
    } else if (res?.code === 'NOT_LOGGED_IN' || res?.code === 'NOT_CONFIGURED') {
      get().toast(res.error || 'Connecte ton compte Google pour scanner tes mails', { icon: 'alert' });
      if (!get().data?.google.configured) set({ googleSetupOpen: true });
      else get().connectGoogle();
    } else {
      get().toast(`Synchronisation incomplète : ${res?.error || 'erreur inconnue'}`, { icon: 'alert', ms: 6000 });
    }
  },

  setUpdater: (updater) => set({ updater }),
}));
