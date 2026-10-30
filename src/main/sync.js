// Orchestration de la synchronisation : agenda -> mails -> chat -> analyse et tri.

import { listEvents } from './google/calendar.js';
import { fetchRecentMails } from './google/gmail.js';
import { fetchChatMessages } from './google/chat.js';
import { NotLoggedInError } from './google/oauth.js';
import { extractTasks } from '../shared/extract.js';
import { makeTask, isDuplicate } from '../shared/task.js';

let running = null;

export function isSyncing() {
  return !!running;
}

export function runSync(opts) {
  if (running) return running;
  running = doSync(opts).finally(() => {
    running = null;
  });
  return running;
}

/** Profil Google (adresse, identifiant pour Chat). */
export async function fetchProfile(auth) {
  const me = await auth.api('https://openidconnect.googleapis.com/v1/userinfo');
  return { email: me.email, name: me.name, id: me.sub, picture: me.picture };
}

export function calendarWindow(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60);
  return { from, to };
}

async function doSync({ store, auth, log, onProgress = () => {}, sources = ['calendar', 'mail', 'chat'] }) {
  const st = store.get();
  const result = { newTasks: [], events: 0, mails: 0, chats: 0, errors: {} };
  const progress = (key, label, extra = {}) => onProgress({ key, label, ...extra });

  progress('connect', 'Connexion à Google…');
  if (!auth.configured || !auth.connected) throw new NotLoggedInError();
  let profile = st.google.profile;
  try {
    profile = await fetchProfile(auth);
    store.update((s) => { s.google.email = profile.email; s.google.profile = profile; s.google.connected = true; });
  } catch (e) {
    if (e.code === 'NOT_LOGGED_IN') {
      store.update((s) => { s.google.connected = false; });
      throw e;
    }
    log.warn(`profil: ${e.message}`);
  }

  const handle = (key, e) => {
    log.warn(`sync ${key}: ${e.stack || e.message}`);
    if (e.code === 'NOT_LOGGED_IN') {
      store.update((s) => { s.google.connected = false; });
      throw e;
    }
    result.errors[key] = e.status === 403 ? `accès refusé (${e.message})` : e.message;
  };

  if (sources.includes('calendar')) {
    progress('calendar', 'Lecture de ton agenda…');
    try {
      const events = await listEvents(auth, calendarWindow());
      result.events = events.length;
      store.update((s) => { s.events = events; s.google.lastCalendarSync = new Date().toISOString(); });
    } catch (e) { handle('calendar', e); }
  }

  const messages = [];
  if (sources.includes('mail')) {
    progress('mail', 'Lecture de tes mails…');
    try {
      const res = await fetchRecentMails(auth, {
        log,
        lookbackDays: st.settings.mailLookbackDays,
        skipIds: new Set(st.processed.mail),
        onProgress: (p) => progress('mail', `Lecture de tes mails… ${p.done}/${p.total}`, p),
      });
      result.mails = res.messages.length;
      messages.push(...res.messages);
      store.update((s) => { s.google.lastMailSync = new Date().toISOString(); });
    } catch (e) { handle('mail', e); }
  }

  if (sources.includes('chat') && st.settings.syncChat && profile?.id) {
    progress('chat', 'Lecture de tes conversations Chat…');
    try {
      const res = await fetchChatMessages(auth, { log, meId: `users/${profile.id}`, lookbackDays: Math.min(3, st.settings.mailLookbackDays), skipIds: new Set(st.processed.chat) });
      result.chats = res.messages.length;
      messages.push(...res.messages);
      store.update((s) => { s.google.lastChatSync = new Date().toISOString(); });
    } catch (e) { handle('chat', e); }
  }

  progress('analyse', 'Analyse et tri de tes missions…', { total: messages.length });
  const now = new Date();
  store.update((s) => {
    for (const msg of messages) {
      let extracted = [];
      try {
        extracted = extractTasks(msg, { userEmail: profile?.email || s.google.email, userName: s.profile.name, now }).tasks;
      } catch (e) {
        log.warn(`extract ${msg.id}: ${e.message}`);
      }
      for (const t of extracted) {
        if (isDuplicate(t, s.tasks)) continue;
        const task = makeTask({ ...t, isNew: true }, now);
        s.tasks.push(task);
        result.newTasks.push(task);
      }
      const list = msg.source === 'chat' ? s.processed.chat : s.processed.mail;
      if (msg.id && !list.includes(msg.id)) list.push(msg.id);
    }
    s.processed.mail = s.processed.mail.slice(-3000);
    s.processed.chat = s.processed.chat.slice(-3000);
    s.google.lastSync = new Date().toISOString();
    s.google.lastError = Object.keys(result.errors).length ? result.errors : null;
  });
  progress('done', 'Terminé !');
  log.info(`sync ok: ${result.newTasks.length} nouvelles tâches, ${result.events} événements, ${result.mails} mails, ${result.chats} messages chat`);
  return result;
}
