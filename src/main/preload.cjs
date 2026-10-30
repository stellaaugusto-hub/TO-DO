// Pont sécurisé entre l'interface et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, payload) => cb(payload);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('api', {
  isElectron: true,
  getState: () => ipcRenderer.invoke('state:get'),
  onState: on('state:changed'),
  setProfile: (patch) => ipcRenderer.invoke('profile:set', patch),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  createTask: (t) => ipcRenderer.invoke('task:create', t),
  createTasks: (list) => ipcRenderer.invoke('task:createMany', list),
  updateTask: (id, patch) => ipcRenderer.invoke('task:update', id, patch),
  deleteTask: (id) => ipcRenderer.invoke('task:delete', id),
  completeTask: (id) => ipcRenderer.invoke('task:complete', id),
  restoreTask: (id) => ipcRenderer.invoke('task:restore', id),
  markSeen: () => ipcRenderer.invoke('tasks:markSeen'),
  tasksFromText: (text) => ipcRenderer.invoke('tasks:fromText', text),
  saveScore: (score) => ipcRenderer.invoke('game:score', score),
  googleConnect: () => ipcRenderer.invoke('google:connect'),
  googleFinishLogin: () => ipcRenderer.invoke('google:finishLogin'),
  googleCancelLogin: () => ipcRenderer.invoke('google:cancelLogin'),
  googleTest: () => ipcRenderer.invoke('google:test'),
  onGoogleLogin: on('google:login'),
  onCalendarAssist: on('calendar:assist'),
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect'),
  googleStatus: () => ipcRenderer.invoke('google:status'),
  sync: (sources) => ipcRenderer.invoke('sync:run', sources),
  onSyncProgress: on('sync:progress'),
  onBackgroundSync: on('sync:background'),
  calendarRefresh: () => ipcRenderer.invoke('calendar:refresh'),
  calendarList: (from, to) => ipcRenderer.invoke('calendar:list', from, to),
  calendarCreate: (ev) => ipcRenderer.invoke('calendar:create', ev),
  calendarUpdate: (ev) => ipcRenderer.invoke('calendar:update', ev),
  calendarDelete: (ev) => ipcRenderer.invoke('calendar:delete', ev),
  scheduleTask: (id) => ipcRenderer.invoke('calendar:scheduleTask', id),
  openCalendarWeb: () => ipcRenderer.invoke('calendar:openWeb'),
  checkUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  updaterStatus: () => ipcRenderer.invoke('updater:status'),
  onUpdater: on('updater:status'),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  openLogs: () => ipcRenderer.invoke('logs:open'),
  testNotification: () => ipcRenderer.invoke('notify:test'),
  onNavigate: on('navigate'),
  onOpenTask: on('open-task'),
});
