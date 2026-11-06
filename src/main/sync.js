// Orchestration de la synchronisation : agenda -> mails -> chat -> analyse et tri.

import { listEvents } from './google/calendar.js';
import { fetchRecentMails, openGmail } from './google/gmail.js';
import { fetchChatMessages } from './google/chat.js';
import { NotLoggedInError } from './google/chrome.js';
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

/** Compte Google connecté dans le Chrome de QuestFlow (adresse, nom). */
export async function fetchProfile(chrome) {
  return chrome.run(async (session) => {
    const { tab, account } = await openGmail(session);
    await tab.close();
    return account || {};
  });
}

export function calendarWindow(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60);
  return { from, to };
}

async function doSync({ store, chrome, log, onProgress = () => {}, sources = ['calendar', 'mail', 'chat'] }) {
  const st = store.get();
  const result = { newTasks: [], events: 0, mails: 0, chats: 0, errors: {} };
  const progress = (key, label, extra = {}) => onProgress({ key, label, ...extra });

  progress('connect', 'Ouverture de Chrome en arrière-plan…');
  if (!st.google.connected && !chrome.hasSession()) throw new NotLoggedInError();
  let email = st.google.email;
  const me = () => [email, st.google.email].filter(Boolean);

  const handle = (key, e) => {
    log.warn(`sync ${key}: ${e.stack || e.message}`);
    if (e.code === 'NOT_LOGGED_IN' || e.code === 'NO_CHROME' || e.code === 'BUSY') {
      if (e.code === 'NOT_LOGGED_IN') store.update((s) => { s.google.connected = false; });
      throw e;
    }
    result.errors[key] = e.message;
  };

  const messages = [];
  await chrome.run(async (session) => {
    // Gmail d'abord : il confirme la connexion et donne l'adresse du compte.
    if (sources.includes('mail')) {
      progress('mail', 'Lecture de tes mails…');
      try {
        const res = await fetchRecentMails(session, {
          log,
          lookbackDays: st.settings.mailLookbackDays,
          skipIds: new Set(st.processed.mail),
          onProgress: (p) => progress('mail', `Lecture de tes mails… ${p.done}/${p.total}`, p),
        });
        if (res.account?.email) email = res.account.email;
        result.mails = res.messages.length;
        result.mailsVisible = res.scanned;
        messages.push(...res.messages);
        store.update((s) => {
          s.google.connected = true;
          s.google.lastMailSync = new Date().toISOString();
          if (res.account?.email) s.google.email = res.account.email;
          if (res.account?.name) s.google.profile = { ...(s.google.profile || {}), name: res.account.name, email: res.account.email };
        });
      } catch (e) { handle('mail', e); }
    }

    if (sources.includes('calendar')) {
      progress('calendar', 'Lecture de ton agenda…');
      try {
        const info = {};
        const events = await listEvents(session, { ...calendarWindow(), me: me(), info, log });
        result.events = events.length;
        result.calendarVia = info.via;
        store.update((s) => { s.events = events; s.google.connected = true; s.google.lastCalendarSync = new Date().toISOString(); });
      } catch (e) { handle('calendar', e); }
    }

    if (sources.includes('chat') && st.settings.syncChat) {
      progress('chat', 'Lecture de tes conversations Chat…');
      try {
        const res = await fetchChatMessages(session, { log, meName: st.google.profile?.name || st.profile.name, lookbackDays: Math.min(3, st.settings.mailLookbackDays), skipIds: new Set(st.processed.chat) });
        result.chats = res.messages.length;
        messages.push(...res.messages);
        store.update((s) => { s.google.lastChatSync = new Date().toISOString(); });
      } catch (e) { handle('chat', e); }
    }
  });

  progress('analyse', 'Analyse et tri de tes missions…', { total: messages.length });
  const now = new Date();
  store.update((s) => {
    for (const msg of messages) {
      let extracted = [];
      try {
        extracted = extractTasks(msg, { userEmail: email || s.google.email, userName: s.profile.name, now }).tasks;
      } catch (e) {
        log.warn(`extract ${msg.id}: ${e.message}`);
      }
      for (const t of extracted) {
        if (isDuplicate(t, s.tasks)) continue;
        const task = makeTask({ ...t, isNew: true }, now);
        s.tasks.push(task);
        result.newTasks.push(task);
      }
      // un aperçu partiel sera relu en entier la prochaine fois
      const list = msg.source === 'chat' ? s.processed.chat : s.processed.mail;
      if (msg.id && !msg.partial && !list.includes(msg.id)) list.push(msg.id);
    }
    s.processed.mail = s.processed.mail.slice(-3000);
    s.processed.chat = s.processed.chat.slice(-3000);
    s.google.lastSync = new Date().toISOString();
    s.google.lastError = Object.keys(result.errors).length ? result.errors : null;
    s.google.lastReport = {
      at: new Date().toISOString(),
      mailsVisible: result.mailsVisible ?? null,
      mails: sources.includes('mail') ? result.mails : null,
      events: sources.includes('calendar') ? result.events : null,
      calendarVia: result.calendarVia || null,
      chats: sources.includes('chat') && st.settings.syncChat ? result.chats : null,
      newTasks: result.newTasks.length,
      errors: result.errors,
    };
  });
  progress('done', 'Terminé !');
  log.info(`sync ok: ${result.newTasks.length} nouvelles tâches, ${result.events} événements, ${result.mails} mails, ${result.chats} messages chat`);
  return result;
}
