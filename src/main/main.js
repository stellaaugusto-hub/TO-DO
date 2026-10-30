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
import { GoogleAuth } from './google/oauth.js';
import { listEvents, createEvent, updateEvent, deleteEvent } from './google/calendar.js';
import { makeTask } from '../shared/task.js';
import { xpForTask, levelInfo, updateStreak } from '../shared/game.js';
import { extractTasksFromText } from '../shared/extract.js';
import { todaysQuests } from '../shared/priority.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

app.setName('QuestFlow');
if (process.env.QF_USER_DATA) app.setPath('userData', process.env.QF_USER_DATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;
let store;
let log;
let updater;
let auth;
let autoSyncTimer = null;

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

function publicState() {
  const { processed, notified, googleClient, ...rest } = store.get();
  return {
    ...rest,
    google: { ...rest.google, connected: !!auth?.connected, configured: !!auth?.configured, clientId: auth?.client.clientId || '' },
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
  win = new BrowserWindow({
    width: bounds.width || 1320,
    height: bounds.height || 860,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    title: 'QuestFlow',
    backgroundColor: '#07071a',
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

async function doSync(sources, { background = false } = {}) {
  try {
    const result = await runSync({
      store,
      auth,
      log,
      sources,
      onProgress: (p) => send('sync:progress', p),
    });
    changed();
    if (background && result.newTasks.length && store.get().settings.notifications && Notification.isSupported()) {
      const n = result.newTasks.length;
      const notif = new Notification({ title: `✨ ${n} nouvelle${n > 1 ? 's' : ''} quête${n > 1 ? 's' : ''}`, body: result.newTasks.slice(0, 3).map((t) => '• ' + t.title).join('\n') });
      notif.on('click', focusWindow);
      notif.show();
    }
    return { ok: true, newTasks: result.newTasks.map((t) => t.id), events: result.events, errors: result.errors };
  } catch (e) {
    log.error(`sync: ${e.stack || e.message}`);
    store.update((s) => { s.google.lastError = e.message; });
    changed();
    return { ok: false, code: e.code || 'ERROR', error: e.message };
  }
}

function scheduleAutoSync() {
  clearInterval(autoSyncTimer);
  const minutes = store.get().settings.autoSyncMinutes;
  if (!minutes) return;
  autoSyncTimer = setInterval(async () => {
    if (isSyncing() || !auth.connected) return;
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

  ipcMain.handle('google:configure', (_e, { clientId, clientSecret }) => {
    store.update((s) => { s.googleClient = { clientId: (clientId || '').trim(), clientSecret: (clientSecret || '').trim() }; });
    changed();
    return auth.configured;
  });

  ipcMain.handle('google:connect', async () => {
    try {
      await auth.login();
      focusWindow();
      const profile = await fetchProfile(auth).catch(() => null);
      store.update((s) => {
        s.google.connected = true;
        s.google.lastError = null;
        if (profile) { s.google.email = profile.email; s.google.profile = profile; }
      });
      changed();
      // premier remplissage de l'agenda
      listEvents(auth, calendarWindow()).then((events) => { store.update((s) => { s.events = events; }); changed(); }).catch((e) => log.warn(`agenda: ${e.message}`));
      return { connected: true, email: profile?.email };
    } catch (e) {
      log.warn(`google connect: ${e.message}`);
      focusWindow();
      return { connected: false, code: e.code, error: e.message };
    }
  });

  ipcMain.handle('google:disconnect', async () => {
    await auth.logout();
    store.update((s) => { s.google = { ...s.google, connected: false, email: null, profile: null }; s.events = []; });
    changed();
  });

  ipcMain.handle('google:status', () => auth.connected);

  // --- Agenda : lecture et actions directes sur Google Agenda ----------------------
  const calAction = async (fn) => {
    try {
      const r = await fn();
      const events = await listEvents(auth, calendarWindow());
      store.update((s) => { s.events = events; s.google.lastCalendarSync = new Date().toISOString(); });
      changed();
      return { ok: true, result: r };
    } catch (e) {
      log.warn(`agenda: ${e.message}`);
      return { ok: false, code: e.code, error: e.message };
    }
  };
  ipcMain.handle('calendar:refresh', () => calAction(() => null));
  ipcMain.handle('calendar:list', async (_e, from, to) => {
    try { return { ok: true, events: await listEvents(auth, { from: new Date(from), to: new Date(to) }) }; } catch (e) { return { ok: false, error: e.message, code: e.code }; }
  });
  ipcMain.handle('calendar:create', (_e, ev) => calAction(() => createEvent(auth, ev)));
  ipcMain.handle('calendar:update', (_e, ev) => calAction(() => updateEvent(auth, ev)));
  ipcMain.handle('calendar:delete', (_e, ev) => calAction(() => deleteEvent(auth, ev)));
  ipcMain.handle('calendar:scheduleTask', (_e, taskId) => calAction(async () => {
    const t = store.get().tasks.find((x) => x.id === taskId);
    if (!t) throw new Error('Quête introuvable');
    let start = t.dueAt ? new Date(new Date(t.dueAt).getTime() - 3600e3) : new Date(Math.ceil(Date.now() / 1800e3) * 1800e3 + 1800e3);
    if (start < new Date()) start = new Date(Math.ceil(Date.now() / 1800e3) * 1800e3);
    const ev = await createEvent(auth, {
      title: `⚔️ ${t.title}`,
      description: [t.description, t.sourceMeta?.url ? `Source : ${t.sourceMeta.url}` : '', 'Créé par QuestFlow'].filter(Boolean).join('\n\n'),
      start,
      end: new Date(start.getTime() + Math.max(30, (t.difficulty || 2) * 30) * 60e3),
    });
    store.update((s) => { const x = s.tasks.find((y) => y.id === taskId); if (x) x.calendarEventId = ev.id; });
    return ev;
  }));
  ipcMain.handle('calendar:openWeb', () => shell.openExternal('https://calendar.google.com/calendar/u/0/r/week'));

  ipcMain.handle('sync:run', (_e, sources) => doSync(sources || ['calendar', 'mail', 'chat']));

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
  nativeTheme.themeSource = 'dark';
  auth = new GoogleAuth({ store, log, bundled: { clientId: pkg.questflow?.googleClientId, clientSecret: pkg.questflow?.googleClientSecret } });

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

  store.update((s) => { s.google.connected = auth.connected; });

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
app.on('before-quit', () => store?.save(true));
