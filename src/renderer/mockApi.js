// Simulation de l'API Electron pour l'aperçu dans un navigateur (et les captures d'écran).
import { makeTask } from '../shared/task.js';
import { extractTasks, extractTasksFromText } from '../shared/extract.js';
import { xpForTask, levelInfo, updateStreak } from '../shared/game.js';
import { dayKey } from '../shared/dates.js';

const h = (d, hh, mm = 0) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(hh, mm, 0, 0); return x.toISOString(); };

function demoState(params) {
  const fresh = params.get('fresh') === '1';
  const jean = { name: 'Jean Dupont', email: 'jean.dupont@exemple.fr' };
  const tasks = fresh ? [] : [
    makeTask({ title: 'Ajouter des nouvelles ads sur Facebook, Instagram et TikTok', source: 'mail', sourceMeta: { from: jean, subject: 'Ads', url: '#' }, description: 'Salut, ajoute des nouvelles ads sur Facebook, Instagram et TikTok stp.', subtasks: [{ title: 'Facebook', done: true }, { title: 'Instagram' }, { title: 'TikTok' }], dueAt: h(0, 20), priority: 2, difficulty: 3, tags: ['ads', 'réseaux'], color: 'purple', icon: 'megaphone', emoji: '📣', stage: 'doing' }),
    makeTask({ title: 'Corriger le prix sur la landing page', source: 'mail', sourceMeta: { from: { name: 'Paul Martin', email: 'paul@exemple.fr' }, subject: 'URGENT prix' }, dueAt: h(0, 15), priority: 1, difficulty: 2, tags: ['web'], color: 'red', icon: 'globe', emoji: '🌐' }),
    makeTask({ title: 'Relancer le fournisseur packaging', source: 'chat', sourceMeta: { from: { name: 'Léa' }, space: 'Équipe produit' }, dueAt: h(-1, 18), priority: 3, difficulty: 1, tags: ['produit'], color: 'orange', icon: 'truck', emoji: '📦' }),
    makeTask({ title: 'Préparer la présentation des résultats de la campagne', source: 'mail', sourceMeta: { from: { name: 'Julie Bernard', email: 'julie@exemple.fr' }, subject: 'Résultats campagne' }, dueAt: h(3, 10), priority: 2, difficulty: 4, tags: ['reporting'], color: 'blue', icon: 'presentation', emoji: '📊', stage: 'doing' }),
    makeTask({ title: 'Appeler Marc pour le shooting', source: 'manual', dueAt: h(1, 10), priority: 3, difficulty: 1, tags: ['réunion'], color: 'default', icon: 'phone', emoji: '📞' }),
    makeTask({ title: 'Rédiger le brief créatif de Noël', source: 'manual', dueAt: h(2, 18), priority: 3, difficulty: 4, tags: ['design'], color: 'pink', icon: 'pen', emoji: '✏️' }),
    makeTask({ title: 'Mettre à jour le reporting hebdo', source: 'chat', sourceMeta: { from: { name: 'Marc' }, space: 'Growth' }, dueAt: null, priority: 4, difficulty: 2, tags: ['reporting'], color: 'brown', icon: 'chart', emoji: '📈' }),
    makeTask({ title: 'Donner mon avis à Joe : Plateforme de marque', source: 'mail', sourceMeta: { from: { name: 'Joe' }, subject: 'Plateforme de marque' }, dueAt: null, priority: 3, difficulty: 2, tags: [], color: 'yellow', icon: 'sparkles', emoji: '💬', stage: 'waiting' }),
    makeTask({ title: 'Valider le devis Studio K', source: 'mail', status: 'done', completedAt: h(0, 9, 12), xpEarned: 25, priority: 3, difficulty: 1, tags: ['finance'], color: 'green', icon: 'receipt', emoji: '🧾', sourceMeta: { from: { name: 'Compta' } } }),
    makeTask({ title: 'Envoyer le récap au client', source: 'manual', status: 'done', completedAt: h(-1, 17, 40), xpEarned: 40, priority: 2, difficulty: 2, tags: ['client'], color: 'orange', icon: 'mail', emoji: '✉️' }),
  ];
  const events = fresh ? [] : [
    ...[-3, -2, -1, 0, 1, 2, 3].map((d) => ({ id: 'd' + d, eventId: 'd' + d, calendarId: 'primary', title: 'Daily growth', start: h(d, 9, 30), end: h(d, 9, 50), calendar: 'Travail', color: '#337ea9', editable: true })),
    { id: 'e2', eventId: 'e2', calendarId: 'primary', title: 'Point ads avec Jean', start: h(0, 11), end: h(0, 11, 45), calendar: 'Travail', location: 'Google Meet', color: '#8b5cf6', editable: true },
    { id: 'e3', eventId: 'e3', calendarId: 'primary', title: 'Déjeuner équipe', start: h(0, 12, 30), end: h(0, 13, 30), calendar: 'Travail', color: '#f59e0b', editable: true },
    { id: 'e4', eventId: 'e4', calendarId: 'primary', title: 'Revue créas Noël', start: h(0, 16), end: h(0, 17), calendar: 'Travail', color: '#ec4899', editable: true },
    { id: 'e5', eventId: 'e5', calendarId: 'primary', title: 'Shooting produit', start: h(1, 14), end: h(1, 17, 30), calendar: 'Travail', location: 'Studio K', color: '#10b981', editable: true },
    { id: 'e6', eventId: 'e6', calendarId: 'primary', title: 'Copil marketing', start: h(-1, 15), end: h(-1, 16, 30), calendar: 'Travail', color: '#6366f1', editable: true },
    { id: 'e7', eventId: 'e7', calendarId: 'primary', title: 'Call agence vidéo', start: h(2, 10), end: h(2, 11), calendar: 'Travail', color: '#f43f5e', editable: true },
    { id: 'e8', eventId: 'e8', calendarId: 'primary', title: '⚔️ Rédiger le brief créatif de Noël', start: h(2, 11), end: h(2, 12, 30), calendar: 'Travail', color: '#d946ef', editable: true },
  ];
  return {
    profile: { name: fresh ? '' : 'Stella', createdAt: new Date().toISOString() },
    settings: { appearance: { theme: params.get('theme') || 'light', accent: params.get('accent') || 'blue', font: params.get('font') || 'default' }, tagColors: { ads: 'purple', 'réseaux': 'pink', web: 'blue', finance: 'green', reporting: 'brown', design: 'pink', produit: 'orange', client: 'orange', 'réunion': 'blue' }, notifications: true, notifyLeadMinutes: 60, morningDigest: true, digestHour: 9, sounds: false, autoSyncMinutes: 20, mailLookbackDays: 7, syncChat: true, showSyncWindows: false },
    tasks,
    events,
    stats: { xp: fresh ? 0 : 465, streak: fresh ? 0 : 6, bestStreak: 9, lastCompletionDay: fresh ? null : dayKey(new Date()), completedCount: 31, highScore: fresh ? 0 : 1840, gamesPlayed: 12 },
    google: { connected: !fresh, configured: !fresh, clientId: fresh ? '' : '123456789-demo.apps.googleusercontent.com', email: 'stella@exemple.fr', lastSync: h(0, 9, 5) },
    app: { version: '1.0.0', platform: 'darwin', packaged: false },
  };
}

const SAMPLE_MAILS = [
  { id: 'm1', source: 'mail', from: { name: 'Claire Dubois', email: 'claire@agence.fr' }, subject: 'Bannières HD', text: "Coucou,\n\nTu pourrais m'envoyer les bannières en HD d'ici demain midi ?\n\nBelle journée,\nClaire\nDirectrice artistique\n06 11 22 33 44" },
  { id: 'm2', source: 'mail', from: { name: 'Shopify', email: 'news@shopify.com' }, subject: 'Nouveautés', headers: { 'List-Unsubscribe': '<x>' }, text: 'Découvrez nos nouveautés ! Se désinscrire' },
  { id: 'm3', source: 'mail', from: { name: 'Julie Bernard', email: 'julie@exemple.fr' }, subject: 'Lancement', text: "Hello,\n\nVoici les prochaines étapes :\n- Envoyer le brief à l'agence\n- Valider les visuels avant vendredi\n\nJulie" },
  { id: 'c1', source: 'chat', from: { name: 'Paul' }, text: '@Stella tu peux mettre à jour le budget ads avant ce soir ?' },
];

export function createMockApi() {
  const params = new URLSearchParams(location.search);
  let state = demoState(params);
  const subs = { state: new Set(), progress: new Set(), updater: new Set(), nav: new Set(), open: new Set(), bg: new Set() };
  const emit = () => { const s = structuredClone(state); subs.state.forEach((f) => f(s)); };
  const sub = (k) => (cb) => { subs[k].add(cb); return () => subs[k].delete(cb); };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const syncDuration = +(params.get('syncms') || 9000);
  let updaterStatus = { state: params.get('update') === '1' ? 'available' : 'uptodate', current: '1.0.0', version: '1.0.1' };

  return {
    isElectron: false,
    async getState() { return structuredClone(state); },
    onState: sub('state'),
    async setProfile(p) { state.profile = { ...state.profile, ...p }; emit(); },
    async setSettings(p) { state.settings = { ...state.settings, ...p }; emit(); },
    async createTask(p) { const t = makeTask({ source: 'manual', ...p }); state.tasks.push(t); emit(); return t; },
    async createTasks(list) { const c = list.map((p) => makeTask(p)); state.tasks.push(...c); emit(); return c; },
    async updateTask(id, patch) { const t = state.tasks.find((x) => x.id === id); if (t) Object.assign(t, patch); emit(); },
    async deleteTask(id) { state.tasks = state.tasks.filter((x) => x.id !== id); emit(); },
    async completeTask(id) {
      const t = state.tasks.find((x) => x.id === id);
      if (!t) return null;
      const before = levelInfo(state.stats.xp);
      const xp = xpForTask(t);
      Object.assign(t, { status: 'done', completedAt: new Date().toISOString(), xpEarned: xp, isNew: false });
      state.stats = updateStreak({ ...state.stats, xp: state.stats.xp + xp, completedCount: state.stats.completedCount + 1 });
      const after = levelInfo(state.stats.xp);
      emit();
      return { xp, level: after.level, levelUp: after.level > before.level, title: after.title, streak: state.stats.streak };
    },
    async restoreTask(id) { const t = state.tasks.find((x) => x.id === id); if (t) { state.stats.xp -= t.xpEarned || 0; Object.assign(t, { status: 'todo', completedAt: null, xpEarned: 0 }); } emit(); },
    async markSeen() { state.tasks.forEach((t) => { t.isNew = false; }); emit(); },
    async tasksFromText(text) { return extractTasksFromText(text, { userName: state.profile.name }).tasks; },
    async saveScore(score) { state.stats.highScore = Math.max(state.stats.highScore, score); emit(); return state.stats.highScore; },
    async googleConnect() { await wait(800); state.google.connected = true; emit(); return { connected: true }; },
    async googleDisconnect() { state.google.connected = false; emit(); },
    async googleStatus() { return state.google.connected; },
    async sync() {
      const steps = [['connect', 'Connexion à Google…'], ['calendar', 'Lecture de ton agenda…'], ['mail', 'Lecture de tes mails…'], ['chat', 'Lecture de tes conversations Chat…'], ['analyse', 'Analyse et tri de tes missions…']];
      for (const [key, label] of steps) {
        subs.progress.forEach((f) => f({ key, label }));
        await wait(syncDuration / steps.length);
      }
      const created = [];
      for (const m of SAMPLE_MAILS) for (const t of extractTasks(m, { userName: 'Stella' }).tasks) { const task = makeTask({ ...t, isNew: true }); state.tasks.push(task); created.push(task.id); }
      subs.progress.forEach((f) => f({ key: 'done', label: 'Terminé !' }));
      state.google.lastSync = new Date().toISOString();
      emit();
      return { ok: true, newTasks: created };
    },
    onSyncProgress: sub('progress'),
    onBackgroundSync: sub('bg'),
    async googleConfigure() { state.google.configured = true; emit(); return true; },
    async calendarRefresh() { return { ok: true }; },
    async calendarList() { return { ok: true, events: [] }; },
    async calendarCreate(ev) { const e = { ...ev, id: 'e' + Date.now(), eventId: 'x' + Date.now(), calendarId: 'primary', calendar: 'Travail', editable: true }; state.events.push(e); emit(); return { ok: true, result: e }; },
    async calendarUpdate(ev) { const e = state.events.find((x) => x.eventId === ev.eventId); if (e) Object.assign(e, ev); emit(); return { ok: true }; },
    async calendarDelete(ev) { state.events = state.events.filter((x) => x.eventId !== ev.eventId); emit(); return { ok: true }; },
    async scheduleTask(id) { const t = state.tasks.find((x) => x.id === id); const s = new Date(Date.now() + 3600e3); const e = { id: 'e' + Date.now(), eventId: 'x' + Date.now(), calendarId: 'primary', calendar: 'Travail', editable: true, title: '⚔️ ' + t.title, start: s.toISOString(), end: new Date(+s + 3600e3).toISOString() }; state.events.push(e); emit(); return { ok: true, result: e }; },
    async openCalendarWeb() { window.open('https://calendar.google.com', '_blank'); },
    async checkUpdates() { return updaterStatus; },
    async installUpdate() {
      for (let p = 0; p <= 1.001; p += 0.1) { updaterStatus = { ...updaterStatus, state: 'downloading', progress: p }; subs.updater.forEach((f) => f(updaterStatus)); await wait(250); }
      updaterStatus = { ...updaterStatus, state: 'installing' }; subs.updater.forEach((f) => f(updaterStatus));
      return updaterStatus;
    },
    async updaterStatus() { return updaterStatus; },
    onUpdater: sub('updater'),
    async openExternal(url) { window.open(url, '_blank'); },
    async openLogs() {},
    async testNotification() {},
    onNavigate: sub('nav'),
    onOpenTask: sub('open'),
  };
}
