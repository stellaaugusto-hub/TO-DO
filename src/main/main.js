// QuestFlow — processus principal Electron.

import { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeTheme, Notification, powerMonitor } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createLogger } from './logger.js';
import { Updater } from './updater.js';
import { startNotifier } from './notifier.js';
import { runSync, isSyncing, fetchProfile, calendarWindow } from './sync.js';
import { ChromeSession, findChrome, resetChromeCache } from './google/chrome.js';
import { listEvents, createEvent, updateEvent, deleteEvent, assistUrl } from './google/calendar.js';
import { makeTask } from '../shared/task.js';
import { xpForTask, levelInfo, updateStreak } from '../shared/game.js';
import { extractTasksFromText } from '../shared/extract.js';
import { todaysQuests } from '../shared/priority.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

app.setName('QuestFlow');
// Pas d'accès au trousseau macOS (évite une demande de mot de passe après chaque mise à jour).
app.commandLine.appendSwitch('use-mock-keychain');
if (process.env.QF_USER_DATA) app.setPath('userData', process.env.QF_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let store;
let log;
let updater;
let chrome;
let autoSyncTimer = null;

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

function publicState() {
  const { processed, notified, googleClient, ...rest } = store.get();
  return {
    ...rest,
    google: { ...rest.google, connected: !!rest.google.connected, chrome: !!findChrome(), loginOpen: !!chrome?.loginOpen },
    app: { version: app.getVersion(), platform: process.platform, packaged: app.isPackaged },
  };
}

function changed() {
  send('state:changed', publicState());
  updateBadge();
}

function updateBadge() {
  if (process.platform !== 'darwin' || !app.dock) return;
  const n = todaysQuests(store.get().tasks).length;
  app.dock.setBadge(n ? String(n) : '');
}

function createWindow() {
  const st = store.get();
  const bounds = st.window || {};
  applyNativeTheme();
  win = new BrowserWindow({
    width: bounds.width || 1320,
    height: bounds.height || 860,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    title: 'QuestFlow',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  const saveBounds = () => {
    if (!win.isDestroyed() && !win.isMinimized() && !win.isFullScreen()) {
      store.update((s) => { s.window = win.getBounds(); });
    }
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '../../dist/index.html'));
}

/** Thème natif (barre de titre, menus, champs date) aligné sur le thème choisi dans l'app. */
function applyNativeTheme() {
  const t = store.get().settings.appearance?.theme || 'light';
  nativeTheme.themeSource = t === 'system' ? 'system' : t;
  if (win && !win.isDestroyed()) win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#191919' : '#ffffff');
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: 'QuestFlow',
          submenu: [
            { role: 'about', label: 'À propos de QuestFlow' },
            { label: 'Rechercher les mises à jour…', click: () => updater.check() },
            { type: 'separator' },
            { label: 'Réglages…', accelerator: 'Cmd+,', click: () => send('navigate', 'settings') },
            { type: 'separator' },
            { role: 'hide', label: 'Masquer QuestFlow' },
            { role: 'hideOthers', label: 'Masquer les autres' },
            { role: 'unhide', label: 'Tout afficher' },
            { type: 'separator' },
            { role: 'quit', label: 'Quitter QuestFlow' },
          ],
        }]
      : []),
    {
      label: 'Fichier',
      submenu: [
        { label: 'Nouvelle quête', accelerator: 'CmdOrCtrl+N', click: () => send('navigate', 'new-task') },
        { label: 'Scanner mails et chat', accelerator: 'CmdOrCtrl+R', click: () => send('navigate', 'sync') },
        { label: 'Rechercher', accelerator: 'CmdOrCtrl+F', click: () => send('navigate', 'search') },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Fermer la fenêtre' } : { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Présentation',
      submenu: [
        { label: 'Quêtes du jour', accelerator: 'CmdOrCtrl+1', click: () => send('navigate', 'quests') },
        { label: 'To-do', accelerator: 'CmdOrCtrl+2', click: () => send('navigate', 'todo') },
        { label: 'Agenda', accelerator: 'CmdOrCtrl+3', click: () => send('navigate', 'agenda') },
        { label: 'Terminées', accelerator: 'CmdOrCtrl+4', click: () => send('navigate', 'done') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }, { role: 'reload' }]),
      ],
    },
    { role: 'windowMenu', label: 'Fenêtre' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function focusWindow() {
  if (!win || win.isDestroyed()) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function doSync(sources, { background = false, rescan = false } = {}) {
  try {
    const result = await runSync({
      store,
      chrome,
      log,
      sources,
      rescan,
      onProgress: (p) => send('sync:progress', p),
    });
    changed();
    if (background && result.newTasks.length && store.get().settings.notifications && Notification.isSupported()) {
      const n = result.newTasks.length;
      const notif = new Notification({ title: `✨ ${n} nouvelle${n > 1 ? 's' : ''} quête${n > 1 ? 's' : ''}`, body: result.newTasks.slice(0, 3).map((t) => '• ' + t.title).join('\n') });
      notif.on('click', focusWindow);
      notif.show();
    }
    return { ok: true, newTasks: result.newTasks.map((t) => t.id), events: result.events, mails: result.mails, mailsVisible: result.mailsVisible, chats: result.chats, slack: result.slack, calendarVia: result.calendarVia, errors: result.errors };
  } catch (e) {
    log.error(`sync: ${e.stack || e.message}`);
    store.update((s) => { s.google.lastError = e.message; });
    changed();
    return { ok: false, code: e.code || 'ERROR', error: e.message };
  }
}

/** Liste des événements de la fenêtre courante, relue depuis Google Agenda. */
async function refreshCalendar(session) {
  const st = store.get();
  const info = {};
  const events = await listEvents(session, { ...calendarWindow(), me: [st.google.email].filter(Boolean), info, log });
  store.update((s) => { s.events = events; s.google.lastCalendarSync = new Date().toISOString(); });
  changed();
  return events;
}

// Réglages du Chrome de QuestFlow appris en route (profil qui porte la session, trousseau).
const chromeModeFile = () => path.join(app.getPath('userData'), 'chrome-mode.json');
function loadChromeMode() {
  try { return JSON.parse(fs.readFileSync(chromeModeFile(), 'utf8')); } catch { return {}; }
}
function saveChromeMode(patch) {
  const m = { ...loadChromeMode(), ...patch };
  fs.writeFileSync(chromeModeFile(), JSON.stringify(m, null, 1));
  chrome.mockKeychain = !!m.mockKeychain;
  chrome.profileOverride = m.profile || null;
}

/** Détail technique (sans adresse ni contenu) affiché en cas d'échec et écrit dans les journaux. */
function checkDetail(c) {
  const names = c.cookies || [];
  const pol = chrome.policies();
  const parts = [
    `page : ${c.landing || '?'}`,
    `profils : ${chrome.profileSummary()}`,
    `lu avec : ${c.profile || '?'}`,
    `cookies Google vus : ${names.length}${names.some((n) => /^(SID|__Secure-1PSID)$/.test(n)) ? '' : ' (sans SID)'}`,
  ];
  if (Object.keys(pol).length) parts.push(`règles Chrome : ${Object.entries(pol).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`);
  if (chrome.mockKeychain) parts.push('trousseau : QuestFlow');
  return parts.join(' · ');
}

const hasSid = (c) => (c.cookies || []).some((n) => /^(SID|__Secure-1PSID|SAPISID)$/.test(n));

/**
 * Vérification après connexion, en essayant chaque profil Chrome qui porte une session
 * (avec un compte pro, Chrome range souvent la connexion dans « Profile 1 »).
 */
async function verifyAfterLogin() {
  let c = await chrome.checkSession();
  log.info(`vérification : ${c.ok ? 'ok' : c.state} · ${checkDetail(c)}`);
  if (c.ok) return c;
  for (const p of chrome.profiles().filter((x) => x.session && x.name !== c.profile)) {
    chrome.profileOverride = p.name;
    await chrome.closeBrowser();
    const c2 = await chrome.checkSession();
    log.info(`vérification avec ${p.name} : ${c2.ok ? 'ok' : c2.state} · ${checkDetail(c2)}`);
    if (c2.ok) {
      saveChromeMode({ profile: p.name });
      return c2;
    }
    c = c2;
  }
  chrome.profileOverride = loadChromeMode().profile || null;
  return c;
}

function markConnected(c) {
  store.update((s) => {
    s.google.connected = true;
    s.google.method = 'chrome';
    s.google.lastError = null;
    s.google.lastCheck = { at: new Date().toISOString(), ok: true };
    if (c.email) s.google.email = c.email;
    s.google.profile = { ...(s.google.profile || {}), email: c.email || s.google.email };
  });
  changed();
  // nom affiché, puis un premier scan complet en arrière-plan (mails de la semaine, agenda, chat)
  fetchProfile(chrome)
    .then((account) => { if (account?.name) { store.update((s) => { s.google.profile = { ...(s.google.profile || {}), ...account }; }); changed(); } })
    .catch(() => {})
    .then(() => (isSyncing() ? null : doSync(['mail', 'calendar', 'chat'], { background: true })))
    .then((r) => r && send('sync:background', r));
}

/** Rapport de diagnostic à copier (versions, profils, derniers résultats, journal Google) : sans contenu de mails. */
function diagnosticReport() {
  const st = store.get();
  const g = st.google;
  let logTail = [];
  try {
    logTail = fs.readFileSync(log.file, 'utf8').split('\n').filter((l) => /gmail|agenda|chat|sync|chrome|vérification|session|connexion|diagnostic/i.test(l)).slice(-45);
  } catch { /* pas de journal */ }
  const rep = g.lastReport || {};
  return [
    `QuestFlow ${app.getVersion()} · macOS ${process.getSystemVersion?.() || '?'} · ${process.arch}`,
    `Google : ${g.connected ? 'connecté' : 'non connecté'} · méthode ${g.method || '?'} · ${chrome.mockKeychain ? 'trousseau QuestFlow' : 'trousseau macOS'}`,
    `Profils Chrome : ${chrome.profileSummary()} · profil lu : ${chrome.activeProfile()}`,
    `Règles Chrome : ${JSON.stringify(chrome.policies())}`,
    `Dernier scan : ${rep.at || 'jamais'} · mails visibles ${rep.mailsVisible ?? '—'} · mails lus ${rep.mails ?? '—'} · événements ${rep.events ?? '—'} (${rep.calendarVia || '—'}) · chat ${rep.chats ?? '—'} · nouvelles quêtes ${rep.newTasks ?? '—'}`,
    `Erreurs : ${JSON.stringify(g.lastError || rep.errors || null)}`,
    `Événements en mémoire : ${st.events.length} · quêtes : ${st.tasks.length}`,
    '--- journal ---',
    ...logTail.map((l) => l.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<adresse>')),
  ].join('\n');
}

/**
 * Connexion. D'abord on regarde si le Chrome de QuestFlow est déjà connecté (aucune fenêtre).
 * Sinon : fenêtre Chrome normale pour te connecter, fermée proprement, puis vérification.
 */
async function connectGoogle() {
  const phase = (p) => send('google:login', p);
  if (!findChrome()) {
    resetChromeCache();
    if (!findChrome()) {
      phase({ phase: 'no-chrome' });
      return { connected: false, code: 'NO_CHROME', error: "Google Chrome n'est pas installé" };
    }
  }
  try {
    if (chrome.hasSession()) {
      phase({ phase: 'checking' });
      const c = await chrome.checkSession().catch((e) => ({ ok: false, state: 'error', error: e.message, cookies: [] }));
      log.info(`session existante : ${c.ok ? 'valide' : `${c.state} · ${checkDetail(c)}`}`);
      if (c.ok) {
        markConnected(c);
        phase({ phase: 'done', email: c.email, already: true });
        return { connected: true, email: c.email };
      }
      // Session refusée par Google : on repart d'un profil Chrome neuf.
      if (c.state === 'login') {
        await chrome.resetProfile();
        saveChromeMode({ profile: null });
      }
    }
    phase({ phase: 'opening' });
    const reason = await chrome.login({ onPhase: phase });
    focusWindow();
    if (reason === 'cancel') {
      phase({ phase: 'cancelled' });
      return { connected: false, code: 'CANCELLED', error: 'annulée' };
    }
    phase({ phase: 'verifying' });
    const c = await verifyAfterLogin();
    if (c.ok) {
      markConnected(c);
      phase({ phase: 'done', email: c.email });
      return { connected: true, email: c.email };
    }
    const detail = checkDetail(c);
    let error;
    if (c.state === 'timeout') {
      error = "Gmail n'a pas répondu à temps. Vérifie ta connexion internet puis réessaie.";
    } else if (!chrome.hasSession()) {
      error = "Je n'ai pas vu ta connexion se terminer dans Chrome. Réessaie et attends d'arriver sur ta boîte Gmail : QuestFlow fermera Chrome tout seul.";
    } else if (!hasSid(c) && !chrome.mockKeychain) {
      // Les cookies sont sur le disque mais Chrome ne les relit pas : on change de méthode de
      // chiffrement pour le Chrome de QuestFlow (sans toucher au trousseau) et on repart à zéro.
      saveChromeMode({ mockKeychain: true, profile: null });
      await chrome.resetProfile();
      error = "Chrome a enregistré ta connexion mais n'arrive pas à la relire. J'ai changé un réglage de QuestFlow : clique sur Réessayer et connecte-toi une dernière fois.";
    } else {
      error = 'Google a refusé la session enregistrée. Clique sur Réessayer et reconnecte-toi.';
    }
    log.warn(`connexion échouée : ${error} · ${detail}`);
    store.update((s) => { s.google.connected = false; s.google.lastCheck = { at: new Date().toISOString(), ok: false, error, detail }; });
    changed();
    phase({ phase: 'error', code: 'NOT_LOGGED_IN', error, detail });
    return { connected: false, code: 'NOT_LOGGED_IN', error };
  } catch (e) {
    log.warn(`google connect: ${e.stack || e.message}`);
    focusWindow();
    phase({ phase: 'error', code: e.code, error: e.message });
    store.update((s) => { s.google.connected = false; });
    changed();
    return { connected: false, code: e.code, error: e.message };
  }
}

/**
 * Action sur Google Agenda : d'abord en arrière-plan ; si l'interface de Google ne répond
 * pas comme prévu, Google Agenda s'ouvre dans une fenêtre Chrome sur la bonne page, et
 * cette fenêtre se ferme toute seule une fois l'événement enregistré.
 */
async function calendarAction(kind, fn, ev) {
  try {
    const r = await chrome.run(async (session) => {
      const out = await fn(session);
      await refreshCalendar(session).catch((e) => log.warn(`agenda: ${e.message}`));
      return out;
    });
    return { ok: true, result: r };
  } catch (e) {
    log.warn(`agenda ${kind}: ${e.message}`);
    if (e.code === 'NOT_LOGGED_IN') {
      store.update((s) => { s.google.connected = false; });
      changed();
      return { ok: false, code: e.code, error: 'Reconnecte ton compte Google' };
    }
    if (e.code !== 'UI') return { ok: false, code: e.code, error: e.message };
    send('calendar:assist', { kind, title: ev?.title });
    try {
      // terminé quand on quitte la page de modification (après l'avoir vue au moins une fois)
      let seenEditor = false;
      const isDone = async (tab) => {
        const inEditor = await tab.evaluate(() => /eventedit/.test(location.pathname));
        if (inEditor) seenEditor = true;
        return seenEditor && !inEditor;
      };
      const outcome = await chrome.assisted(assistUrl(kind, ev, e.eid), { isDone });
      focusWindow();
      await chrome.run((session) => refreshCalendar(session)).catch(() => {});
      send('calendar:assist', null);
      return outcome === 'done' ? { ok: true, assisted: true } : { ok: false, code: 'ASSIST_CLOSED', error: 'fenêtre Google Agenda fermée sans enregistrer' };
    } catch (err) {
      send('calendar:assist', null);
      return { ok: false, code: err.code, error: err.message };
    }
  }
}

function scheduleAutoSync() {
  clearInterval(autoSyncTimer);
  const minutes = store.get().settings.autoSyncMinutes;
  if (!minutes) return;
  autoSyncTimer = setInterval(async () => {
    if (isSyncing() || !store.get().google.connected || chrome.visible) return;
    const r = await doSync(['calendar', 'mail', 'chat'], { background: true });
    send('sync:background', r);
  }, minutes * 60e3);
}

function registerIpc() {
  ipcMain.handle('state:get', () => publicState());

  ipcMain.handle('profile:set', (_e, patch) => {
    store.update((s) => {
      s.profile = { ...s.profile, ...patch };
      if (!s.profile.createdAt) s.profile.createdAt = new Date().toISOString();
    });
    changed();
  });

  ipcMain.handle('settings:set', (_e, patch) => {
    store.update((s) => { s.settings = { ...s.settings, ...patch }; });
    if (patch.appearance) applyNativeTheme();
    if ('autoSyncMinutes' in patch) scheduleAutoSync();
    changed();
  });

  ipcMain.handle('task:create', (_e, partial) => {
    const t = makeTask({ source: 'manual', ...partial });
    store.update((s) => { s.tasks.push(t); });
    changed();
    return t;
  });

  ipcMain.handle('task:createMany', (_e, list) => {
    const created = list.map((p) => makeTask(p));
    store.update((s) => { s.tasks.push(...created); });
    changed();
    return created;
  });

  ipcMain.handle('task:update', (_e, id, patch) => {
    store.update((s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (t) Object.assign(t, patch, { id: t.id });
    });
    changed();
  });

  ipcMain.handle('task:delete', (_e, id) => {
    store.update((s) => { s.tasks = s.tasks.filter((x) => x.id !== id); });
    changed();
  });

  ipcMain.handle('task:complete', (_e, id) => {
    let reward = null;
    store.update((s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (!t || t.status === 'done') return;
      const now = new Date();
      const before = levelInfo(s.stats.xp);
      const xp = xpForTask(t, now);
      t.status = 'done';
      t.completedAt = now.toISOString();
      t.xpEarned = xp;
      t.isNew = false;
      s.stats = updateStreak({ ...s.stats, xp: s.stats.xp + xp, completedCount: (s.stats.completedCount || 0) + 1 }, now);
      const after = levelInfo(s.stats.xp);
      reward = { xp, level: after.level, levelUp: after.level > before.level, title: after.title, streak: s.stats.streak };
    });
    changed();
    return reward;
  });

  ipcMain.handle('task:restore', (_e, id) => {
    store.update((s) => {
      const t = s.tasks.find((x) => x.id === id);
      if (!t) return;
      s.stats.xp = Math.max(0, s.stats.xp - (t.xpEarned || 0));
      t.status = 'todo';
      t.completedAt = null;
      t.xpEarned = 0;
    });
    changed();
  });

  ipcMain.handle('tasks:markSeen', () => {
    store.update((s) => { for (const t of s.tasks) t.isNew = false; });
    changed();
  });

  ipcMain.handle('tasks:fromText', (_e, text) => {
    const st = store.get();
    return extractTasksFromText(text, { userName: st.profile.name }).tasks;
  });

  ipcMain.handle('game:score', (_e, score) => {
    store.update((s) => {
      s.stats.gamesPlayed = (s.stats.gamesPlayed || 0) + 1;
      if (score > (s.stats.highScore || 0)) s.stats.highScore = score;
    });
    changed();
    return store.get().stats.highScore;
  });

  ipcMain.handle('google:connect', () => connectGoogle());
  ipcMain.handle('google:finishLogin', () => chrome.finishLogin('done'));
  ipcMain.handle('google:cancelLogin', () => chrome.finishLogin('cancel'));
  ipcMain.handle('google:disconnect', async () => {
    await chrome.forget();
    saveChromeMode({ profile: null });
    store.update((s) => { s.google = { ...s.google, connected: false, email: null, profile: null }; s.events = []; });
    changed();
  });
  ipcMain.handle('google:status', () => store.get().google.connected);
  ipcMain.handle('google:report', () => diagnosticReport());

  /** « Tester la lecture » : un passage complet, sans créer de quêtes. */
  ipcMain.handle('google:test', async () => {
    const st = store.get();
    const out = { mails: null, events: null, chats: null, errors: {}, email: null };
    try {
      await chrome.run(async (session) => {
        try {
          const { fetchRecentMails } = await import('./google/gmail.js');
          const r = await fetchRecentMails(session, { log, lookbackDays: 3, max: 3 });
          out.mails = r.scanned;
          out.email = r.account?.email || null;
        } catch (e) { if (e.code === 'NOT_LOGGED_IN') throw e; out.errors.mail = e.message; }
        try { out.events = (await refreshCalendar(session)).length; } catch (e) { out.errors.calendar = e.message; }
        if (st.settings.syncChat) {
          try {
            const { fetchChatMessages } = await import('./google/chat.js');
            out.chats = (await fetchChatMessages(session, { log, meName: st.google.profile?.name || st.profile.name, meEmail: st.google.email, lookbackDays: 3, maxConversations: 2 })).conversations;
          } catch (e) { out.errors.chat = e.message; }
        }
      });
      return { ok: true, ...out };
    } catch (e) {
      if (e.code === 'NOT_LOGGED_IN') { store.update((s) => { s.google.connected = false; }); changed(); }
      return { ok: false, code: e.code, error: e.message, ...out };
    }
  });

  // --- Agenda : lecture et actions directes sur Google Agenda ----------------------
  ipcMain.handle('calendar:refresh', async () => {
    try {
      const events = await chrome.run((session) => refreshCalendar(session));
      store.update((s) => { if (s.google.lastError && typeof s.google.lastError === 'object') { delete s.google.lastError.calendar; if (!Object.keys(s.google.lastError).length) s.google.lastError = null; } });
      changed();
      return { ok: true, events: events.length };
    } catch (e) {
      store.update((s) => { s.google.lastError = { ...(typeof s.google.lastError === 'object' && s.google.lastError ? s.google.lastError : {}), calendar: e.message }; });
      changed();
      if (e.code === 'NOT_LOGGED_IN') { store.update((s) => { s.google.connected = false; }); changed(); }
      return { ok: false, code: e.code, error: e.message };
    }
  });
  ipcMain.handle('calendar:list', async (_e, from, to) => {
    const f = new Date(from);
    const t = new Date(to);
    const w = calendarWindow();
    if (f >= w.from && t <= w.to) return { ok: true, events: store.get().events.filter((e) => e.end > f.toISOString() && e.start < t.toISOString()) };
    try {
      const events = await chrome.run((session) => listEvents(session, { from: f, to: t, me: [store.get().google.email].filter(Boolean), log }));
      return { ok: true, events };
    } catch (e) { return { ok: false, error: e.message, code: e.code }; }
  });
  ipcMain.handle('calendar:create', (_e, ev) => calendarAction('create', (session) => createEvent(session, ev), ev));
  ipcMain.handle('calendar:update', (_e, ev) => {
    const before = store.get().events.find((x) => x.calendarId === ev.calendarId && x.eventId === ev.eventId) || null;
    return calendarAction('update', (session) => updateEvent(session, ev, before), ev);
  });
  ipcMain.handle('calendar:delete', (_e, ev) => {
    const full = store.get().events.find((x) => x.calendarId === ev.calendarId && x.eventId === ev.eventId) || ev;
    return calendarAction('delete', (session) => deleteEvent(session, full), full);
  });
  ipcMain.handle('calendar:scheduleTask', async (_e, taskId) => {
    const t = store.get().tasks.find((x) => x.id === taskId);
    if (!t) return { ok: false, error: 'Quête introuvable' };
    let start = t.dueAt ? new Date(new Date(t.dueAt).getTime() - 3600e3) : new Date(Math.ceil(Date.now() / 1800e3) * 1800e3 + 1800e3);
    if (start < new Date()) start = new Date(Math.ceil(Date.now() / 1800e3) * 1800e3);
    const ev = {
      title: `⚔️ ${t.title}`,
      description: [t.description, t.sourceMeta?.url ? `Source : ${t.sourceMeta.url}` : '', 'Créé par QuestFlow'].filter(Boolean).join('\n\n'),
      start: start.toISOString(),
      end: new Date(start.getTime() + Math.max(30, (t.difficulty || 2) * 30) * 60e3).toISOString(),
    };
    const r = await calendarAction('create', (session) => createEvent(session, ev), ev);
    if (r.ok) {
      store.update((s) => { const x = s.tasks.find((y) => y.id === taskId); if (x) x.scheduledAt = ev.start; });
      changed();
    }
    return r;
  });
  ipcMain.handle('calendar:openWeb', () => shell.openExternal('https://calendar.google.com/calendar/u/0/r/week'));

  ipcMain.handle('sync:run', (_e, sources, opts = {}) => doSync(sources || ['calendar', 'mail', 'chat'], { rescan: !!opts.rescan }));

  ipcMain.handle('updater:check', () => updater.check());
  ipcMain.handle('updater:install', () => updater.downloadAndInstall());
  ipcMain.handle('updater:status', () => updater.status);

  ipcMain.handle('shell:open', (_e, url) => {
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
  });
  ipcMain.handle('logs:open', () => shell.showItemInFolder(log.file));
  ipcMain.handle('notify:test', () => {
    const name = store.get().profile.name;
    new Notification({ title: '🔔 Notifications activées', body: `${name ? name + ', t' : 'T'}u seras prévenu·e avant tes quêtes prioritaires.` }).show();
  });
}

app.whenReady().then(async () => {
  store = new Store(app.getPath('userData'));
  log = createLogger(path.join(app.getPath('userData'), 'logs'));
  log.info(`QuestFlow ${app.getVersion()} (${process.platform}/${process.arch}) démarre`);

  const mode = loadChromeMode();
  chrome = new ChromeSession({ dir: path.join(app.getPath('userData'), 'chrome-profile'), log, diagDir: path.join(app.getPath('userData'), 'logs'), mockKeychain: !!mode.mockKeychain });
  chrome.profileOverride = mode.profile || null;
  // Si QuestFlow était au premier plan, il le reste quand Chrome démarre en arrière-plan.
  let wasFocused = false;
  chrome.on('launching', () => { wasFocused = !!win && !win.isDestroyed() && win.isFocused(); });
  chrome.on('launched', () => {
    if (wasFocused) setTimeout(() => { if (!win.isDestroyed() && !win.isFocused()) app.focus({ steal: true }); }, 300);
  });

  updater = new Updater({ owner: pkg.questflow?.githubOwner, repo: pkg.questflow?.githubRepo || 'questflow', log });
  updater.on('status', (s) => send('updater:status', s));

  registerIpc();
  buildMenu();
  createWindow();

  // Proposer de déplacer l'app dans /Applications (indispensable pour les mises à jour)
  if (app.isPackaged && process.platform === 'darwin' && !app.isInApplicationsFolder()) {
    const r = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Déplacer dans Applications', 'Plus tard'],
      defaultId: 0,
      message: 'Installer QuestFlow dans le dossier Applications ?',
      detail: 'Les mises à jour automatiques ne fonctionnent que depuis le dossier Applications.',
    });
    if (r.response === 0) {
      try { app.moveToApplicationsFolder(); } catch (e) { log.warn(`move: ${e.message}`); }
    }
  }

  // anciennes versions : connexion par identifiants Google Cloud -> on repart sur Chrome
  store.update((s) => {
    if (s.google.method !== 'chrome') s.google.connected = false;
    delete s.googleClient;
  });

  startNotifier({
    store,
    log,
    onOpenTask: (id) => { focusWindow(); send('open-task', id); },
    onOpenApp: focusWindow,
  });
  scheduleAutoSync();
  updateBadge();
  powerMonitor.on('resume', () => changed());

  // Vérification des mises à jour au lancement (l'interface affiche l'écran de mise à jour)
  setTimeout(() => updater.check(), 1500);
  setInterval(() => updater.check(), 6 * 3600e3);
});

app.on('second-instance', focusWindow);
app.on('activate', focusWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// À la fermeture : on laisse le Chrome de QuestFlow se fermer proprement (il enregistre ses
// cookies Google), sinon la session pourrait être perdue.
let quitting = false;
app.on('before-quit', (e) => {
  store?.save(true);
  if (quitting || !chrome?.busy) return;
  e.preventDefault();
  quitting = true;
  Promise.race([chrome.shutdown(), new Promise((r) => setTimeout(r, 25000))]).finally(() => app.quit());
});
