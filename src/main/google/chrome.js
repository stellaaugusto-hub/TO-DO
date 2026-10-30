// Google Chrome piloté par QuestFlow, sans aucune clé API.
//
// 1. Connexion : la première fois, QuestFlow ouvre une fenêtre Chrome normale
//    (profil réservé à QuestFlow, aucun outil d'automatisation branché) et tu te
//    connectes toi-même à ton compte Google. Dès que la connexion est détectée,
//    la fenêtre se ferme.
// 2. Lecture : ensuite QuestFlow relance ce même Chrome sans fenêtre (headless),
//    lit Agenda, Gmail et Chat comme tu le ferais, puis le referme.
//
// Le pilotage passe par le protocole DevTools sur un tube (pas de port réseau
// ouvert : aucun autre programme ne peut se brancher sur ce Chrome).

import { spawn, execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class NotLoggedInError extends Error {
  constructor(message = 'Connecte-toi à ton compte Google dans Chrome') {
    super(message);
    this.code = 'NOT_LOGGED_IN';
  }
}

export class NoChromeError extends Error {
  constructor() {
    super("Google Chrome n'est pas installé sur ce Mac");
    this.code = 'NO_CHROME';
  }
}

export class UiError extends Error {
  constructor(message) {
    super(message);
    this.code = 'UI';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Où est Chrome ?
// ---------------------------------------------------------------------------
let chromePath;
export function findChrome() {
  if (chromePath !== undefined) return chromePath;
  const candidates = [
    process.env.QF_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  ];
  if (process.platform === 'linux') candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable');
  chromePath = candidates.find((p) => p && fs.existsSync(p)) || null;
  if (!chromePath && process.platform === 'darwin') {
    try {
      const app = execFileSync('/usr/bin/mdfind', ["kMDItemCFBundleIdentifier == 'com.google.Chrome'"], { encoding: 'utf8', timeout: 5000 }).split('\n').find(Boolean);
      const bin = app && path.join(app, 'Contents/MacOS/Google Chrome');
      if (bin && fs.existsSync(bin)) chromePath = bin;
    } catch { /* Spotlight indisponible */ }
  }
  return chromePath;
}

export function resetChromeCache() {
  chromePath = undefined;
}

/** Environnement propre : rien d'Electron ne doit fuiter vers Chrome. */
function chromeEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(ELECTRON_|CHROME_|__CF|XPC_SERVICE)/.test(k)) delete env[k];
  return env;
}

// Options communes aux deux modes. --use-mock-keychain : le Chrome sans fenêtre
// et la fenêtre de connexion chiffrent les cookies avec la même clé, sans
// demande d'accès au trousseau macOS.
const COMMON_ARGS = ['--no-first-run', '--no-default-browser-check', '--use-mock-keychain', '--disable-search-engine-choice-screen', '--profile-directory=Default'];

// ---------------------------------------------------------------------------
// Protocole DevTools sur tube (messages JSON séparés par \0)
// ---------------------------------------------------------------------------
class Cdp extends EventEmitter {
  constructor(input, output) {
    super();
    this.input = input;
    this.nextId = 1;
    this.pending = new Map();
    this.buf = '';
    this.closed = false;
    output.setEncoding('utf8');
    output.on('data', (chunk) => this._data(chunk));
    output.on('close', () => this._close());
    output.on('error', () => this._close());
    input.on('error', () => this._close());
  }

  _data(chunk) {
    this.buf += chunk;
    let i;
    while ((i = this.buf.indexOf('\0')) >= 0) {
      const raw = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      let msg;
      try { msg = JSON.parse(raw); } catch { continue; }
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(Object.assign(new Error(`${p.method}: ${msg.error.message}`), { cdp: msg.error }));
        else p.resolve(msg.result);
      } else if (msg.method) {
        this.emit(msg.method, msg.params, msg.sessionId);
      }
    }
  }

  _close() {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('Chrome a été fermé'));
    }
    this.pending.clear();
    this.emit('close');
  }

  send(method, params = {}, sessionId, timeout = 60e3) {
    if (this.closed) return Promise.reject(new Error('Chrome a été fermé'));
    const id = this.nextId++;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: délai dépassé`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, method });
      this.input.write(JSON.stringify(msg) + '\0');
    });
  }
}

// ---------------------------------------------------------------------------
// Un onglet
// ---------------------------------------------------------------------------
export class Tab {
  constructor(cdp, targetId, sessionId) {
    this.cdp = cdp;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  send(method, params, timeout) {
    return this.cdp.send(method, params, this.sessionId, timeout);
  }

  waitEvent(method, timeout = 30e3) {
    return new Promise((resolve) => {
      const on = (params, sid) => {
        if (sid !== this.sessionId) return;
        clearTimeout(timer);
        this.cdp.off(method, on);
        resolve(params);
      };
      const timer = setTimeout(() => { this.cdp.off(method, on); resolve(null); }, timeout);
      this.cdp.on(method, on);
    });
  }

  async goto(url, { timeout = 45e3 } = {}) {
    const loaded = this.waitEvent('Page.loadEventFired', timeout);
    const r = await this.send('Page.navigate', { url });
    if (r.errorText) throw new Error(`${new URL(url).host} : ${r.errorText}`);
    await loaded;
  }

  /** Exécute une fonction autonome dans la page et renvoie son résultat (JSON). */
  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, 120e3);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text);
    return r.result?.value;
  }

  /** Attend que la fonction renvoie une valeur « vraie » (les erreurs pendant une navigation sont ignorées). */
  async waitFor(fn, args = [], { timeout = 25e3, interval = 400 } = {}) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try {
        last = await this.evaluate(fn, ...args);
        if (last) return last;
      } catch { /* page en cours de chargement */ }
      await sleep(interval);
    }
    return last || null;
  }

  url() {
    return this.evaluate(() => location.href).catch(() => '');
  }

  async clickAt(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  /** Clique au centre de l'élément renvoyé par `finder` (une fonction de page qui renvoie {x,y,w,h}). */
  async click(finder, args = [], { timeout = 15e3 } = {}) {
    const rect = await this.waitFor(finder, args, { timeout });
    if (!rect) return false;
    await this.clickAt(rect.x + rect.w / 2, rect.y + rect.h / 2);
    return true;
  }

  insertText(text) {
    return this.send('Input.insertText', { text });
  }

  async key(key, modifiers = 0) {
    const KEYS = { Enter: [13, 'Enter', '\r'], Tab: [9, 'Tab', ''], Escape: [27, 'Escape', ''], a: [65, 'KeyA', 'a'] };
    const [code, keyCode, text] = KEYS[key];
    const base = { key, code: keyCode, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers };
    await this.send('Input.dispatchKeyEvent', { type: modifiers ? 'rawKeyDown' : 'keyDown', ...base, ...(text && !modifiers ? { text } : {}) });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  async selectAll() {
    await this.key('a', process.platform === 'darwin' ? 4 : 2);
  }

  async screenshot() {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(r.data, 'base64');
  }

  close() {
    return this.cdp.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {});
  }
}

// Fonctions exécutées dans les pages ---------------------------------------

/** Squelette de la page SANS son contenu (balises, rôles, classes) : pour diagnostiquer un changement d'interface Google sans exposer tes mails. */
export function pageSkeleton(maxNodes = 5000) {
  const out = [];
  let n = 0;
  const KEEP = ['class', 'role', 'jsname', 'jscontroller', 'jsaction', 'id', 'type'];
  const walk = (el, depth) => {
    if (!el || n++ > maxNodes || depth > 40) return;
    const attrs = [];
    for (const a of el.attributes || []) {
      if (KEEP.includes(a.name)) attrs.push(`${a.name}="${a.value.slice(0, 60)}"`);
      else if (a.name.startsWith('data-') || a.name.startsWith('aria-') || ['title', 'href', 'email', 'name', 'alt', 'placeholder', 'value'].includes(a.name)) attrs.push(`${a.name}=[${a.value.length}]`);
    }
    const text = [...el.childNodes].filter((c) => c.nodeType === 3).reduce((s, c) => s + c.textContent.trim().length, 0);
    out.push(`${' '.repeat(depth)}<${el.tagName.toLowerCase()}${attrs.length ? ' ' + attrs.join(' ') : ''}>${text ? ` (${text} car.)` : ''}`);
    for (const c of el.children) if (!['SCRIPT', 'STYLE', 'svg', 'PATH', 'path'].includes(c.tagName)) walk(c, depth + 1);
    if (el.tagName === 'IFRAME') {
      try { walk(el.contentDocument?.body, depth + 1); } catch { /* autre origine */ }
    }
  };
  walk(document.body, 0);
  return `${location.host}${location.pathname}\n${out.join('\n')}`;
}

/** Page de connexion Google ou page de présentation (= pas connecté) ? */
export function onLoginPage() {
  const h = location.hostname;
  return h === 'accounts.google.com' || h === 'workspace.google.com' || (h === 'www.google.com' && /\/(gmail|calendar|chat)\/about/.test(location.pathname)) || /\/(intl\/[^/]+\/)?(gmail|calendar|chat)\/about/.test(location.pathname);
}

// ---------------------------------------------------------------------------
// Session Chrome de QuestFlow
// ---------------------------------------------------------------------------
export class ChromeSession extends EventEmitter {
  constructor({ dir, log, diagDir, idleMs = 40e3 }) {
    super();
    this.dir = dir;
    this.log = log;
    this.diagDir = diagDir;
    this.idleMs = idleMs;
    this.browser = null; // { proc, cdp }
    this.visible = null; // { proc, kind }
    this.queue = Promise.resolve();
    this.idleTimer = null;
  }

  get installed() {
    return !!findChrome();
  }

  /** Un compte Google a-t-il déjà été connecté dans ce profil ? (lecture rapide, sans lancer Chrome) */
  hasSession() {
    for (const f of ['Default/Network/Cookies', 'Default/Cookies']) {
      try {
        const buf = fs.readFileSync(path.join(this.dir, f));
        if (buf.includes('SAPISID')) return true;
      } catch { /* pas encore de profil */ }
    }
    return false;
  }

  // --- Chrome sans fenêtre ------------------------------------------------------

  /** Exécute `fn(session)` avec le Chrome sans fenêtre (une tâche à la fois). */
  run(fn) {
    const task = this.queue.then(async () => {
      clearTimeout(this.idleTimer);
      if (this.visible) throw Object.assign(new Error('Une fenêtre Chrome de QuestFlow est encore ouverte : termine ou ferme-la.'), { code: 'BUSY' });
      await this._ensureBrowser();
      try {
        return await fn(this);
      } finally {
        this.idleTimer = setTimeout(() => this.closeBrowser(), this.idleMs);
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }

  async _ensureBrowser() {
    if (this.browser && !this.browser.cdp.closed) return;
    const bin = findChrome();
    if (!bin) throw new NoChromeError();
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    await this._freeProfile();
    const args = ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${this.dir}`, ...COMMON_ARGS, '--window-size=1440,1000', '--mute-audio', '--hide-scrollbars', 'about:blank'];
    if (process.env.QF_CHROME_EXTRA) args.unshift(...process.env.QF_CHROME_EXTRA.trim().split(/\s+(?=--)/)); // tests
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'], env: chromeEnv() });
    const errTail = [];
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (d) => { errTail.push(d); if (errTail.length > 30) errTail.shift(); });
    proc.on('error', (e) => this.log?.warn(`chrome: ${e.message}`));
    const cdp = new Cdp(proc.stdio[3], proc.stdio[4]);
    this.browser = { proc, cdp };
    proc.on('exit', () => { if (this.browser?.proc === proc) this.browser = null; cdp._close(); });
    try {
      const v = await cdp.send('Browser.getVersion', {}, undefined, 20e3);
      this.log?.info(`chrome sans fenêtre : ${v.product}`);
    } catch (e) {
      this.log?.warn(`chrome n'a pas démarré : ${errTail.join('').slice(-800)}`);
      proc.kill('SIGKILL');
      this.browser = null;
      throw new Error(`Chrome n'a pas pu démarrer (${e.message})`);
    }
  }

  /** Si un Chrome tourne encore sur ce profil (fenêtre oubliée, plantage), on le ferme proprement. */
  async _freeProfile() {
    let target;
    try { target = fs.readlinkSync(path.join(this.dir, 'SingletonLock')); } catch { return; }
    const pid = Number(String(target).split('-').pop());
    if (!pid || pid === process.pid) return;
    try { process.kill(pid, 0); } catch { return; } // processus mort : Chrome nettoiera le verrou
    this.log?.info(`chrome ${pid} utilise encore le profil QuestFlow : fermeture`);
    try { process.kill(pid, 'SIGTERM'); } catch { return; }
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      try { process.kill(pid, 0); } catch { return; }
    }
    try { process.kill(pid, 'SIGKILL'); } catch { /* déjà fermé */ }
    await sleep(500);
  }

  async newTab() {
    const { cdp } = this.browser;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const tab = new Tab(cdp, targetId, sessionId);
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');
    return tab;
  }

  /** Ouvre une page Google dans un onglet sans fenêtre et vérifie qu'on est connecté. */
  async open(url, { ready, timeout = 30e3 } = {}) {
    const tab = await this.newTab();
    try {
      await tab.goto(url);
      // (pas d'eval dans la page : Gmail l'interdit)
      const probe = `() => { if ((${onLoginPage})()) return 'login'; return ${ready ? `(${ready})()` : 'true'} ? 'ready' : null; }`;
      const state = await tab.waitFor(probe, [], { timeout });
      if (state === 'login') throw new NotLoggedInError();
      if (!state) await this.diagnose(tab, new URL(url).host.split('.')[0]);
      return tab;
    } catch (e) {
      await tab.close();
      throw e;
    }
  }

  /** Enregistre le squelette de la page (sans contenu) pour comprendre un changement d'interface. */
  async diagnose(tab, name) {
    if (!this.diagDir) return;
    try {
      fs.mkdirSync(this.diagDir, { recursive: true });
      const sk = await tab.evaluate(pageSkeleton);
      fs.writeFileSync(path.join(this.diagDir, `diagnostic-${name}.txt`), `${new Date().toISOString()}\n${sk}`);
      this.log?.warn(`diagnostic enregistré : diagnostic-${name}.txt`);
    } catch (e) {
      this.log?.warn(`diagnostic ${name}: ${e.message}`);
    }
  }

  async closeBrowser() {
    clearTimeout(this.idleTimer);
    const b = this.browser;
    if (!b) return;
    this.browser = null;
    const exited = new Promise((r) => (b.proc.exitCode !== null ? r() : b.proc.once('exit', r)));
    b.cdp.send('Browser.close', {}, undefined, 3000).catch(() => {});
    await Promise.race([exited, sleep(4000)]);
    if (b.proc.exitCode === null) b.proc.kill('SIGKILL');
  }

  // --- Fenêtre Chrome visible ----------------------------------------------------

  get loginOpen() {
    return this.visible?.kind === 'login';
  }

  /**
   * Fenêtre de connexion : Chrome tout à fait normal (aucun pilotage), sur la page de
   * connexion Google. Se termine quand la connexion est détectée, quand tu cliques
   * « J'ai terminé » ou quand tu fermes Chrome.
   */
  async login({ onPhase = () => {} } = {}) {
    const bin = findChrome();
    if (!bin) throw new NoChromeError();
    await this.queue;
    await this.closeBrowser();
    await this.endVisible();
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    await this._freeProfile();
    const hadSession = this.hasSession();
    const url = `https://accounts.google.com/ServiceLogin?hl=fr&continue=${encodeURIComponent('https://mail.google.com/mail/u/0/')}`;
    const proc = spawn(bin, [`--user-data-dir=${this.dir}`, ...COMMON_ARGS, '--window-size=1080,860', '--new-window', url], { stdio: 'ignore', env: chromeEnv() });
    const v = { proc, kind: 'login', reason: null };
    this.visible = v;
    onPhase({ phase: 'waiting' });
    const exited = new Promise((r) => proc.once('exit', r));
    proc.once('error', (e) => { v.reason = 'error'; this.log?.warn(`chrome login: ${e.message}`); });
    // Détection : le cookie de session Google apparaît dans le profil.
    while (proc.exitCode === null && !v.reason) {
      await Promise.race([exited, sleep(1500)]);
      if (!hadSession && this.hasSession()) {
        v.reason = 'detected';
        onPhase({ phase: 'detected' });
        await sleep(2500);
      }
    }
    if (proc.exitCode === null) await this._stop(proc);
    if (this.visible === v) this.visible = null;
    return v.reason || 'closed';
  }

  /** « J'ai terminé » ou « Annuler » depuis QuestFlow. */
  finishLogin(reason = 'done') {
    if (this.visible && !this.visible.reason) this.visible.reason = reason;
  }

  async endVisible() {
    const v = this.visible;
    if (!v) return;
    v.reason = v.reason || 'closed';
    await this._stop(v.proc);
    if (this.visible === v) this.visible = null;
  }

  /** Fermeture propre (Chrome enregistre ses cookies), puis forcée si besoin. */
  async _stop(proc) {
    if (proc.exitCode !== null) return;
    const exited = new Promise((r) => proc.once('exit', r));
    proc.kill('SIGTERM');
    await Promise.race([exited, sleep(8000)]);
    if (proc.exitCode === null) proc.kill('SIGKILL');
  }

  /**
   * Fenêtre Chrome visible et pilotée sur une page Google déjà connectée (ex. modifier un
   * événement quand l'action automatique n'a pas pu se faire). Elle se ferme toute seule
   * quand `isDone(tab)` devient vrai ou quand tu la fermes.
   */
  async assisted(url, { isDone, timeout = 15 * 60e3 } = {}) {
    const bin = findChrome();
    if (!bin) throw new NoChromeError();
    await this.queue;
    await this.closeBrowser();
    await this.endVisible();
    await this._freeProfile();
    const proc = spawn(bin, ['--remote-debugging-pipe', `--user-data-dir=${this.dir}`, ...COMMON_ARGS, '--window-size=1180,860', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'], env: chromeEnv() });
    const v = { proc, kind: 'assist', reason: null };
    this.visible = v;
    const cdp = new Cdp(proc.stdio[3], proc.stdio[4]);
    try {
      await cdp.send('Browser.getVersion', {}, undefined, 20e3);
      const { targetInfos } = await cdp.send('Target.getTargets');
      const page = targetInfos.find((t) => t.type === 'page');
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
      const tab = new Tab(cdp, page.targetId, sessionId);
      await tab.send('Page.enable');
      await tab.send('Runtime.enable');
      await tab.goto(url);
      await cdp.send('Target.activateTarget', { targetId: page.targetId }).catch(() => {});
      const end = Date.now() + timeout;
      let result = 'closed';
      while (!cdp.closed && !v.reason && Date.now() < end) {
        await sleep(800);
        const { targetInfos: now } = await cdp.send('Target.getTargets').catch(() => ({ targetInfos: [] }));
        if (!now.some((t) => t.targetId === page.targetId)) break; // fenêtre fermée
        if (await tab.evaluate(onLoginPage).catch(() => false)) { result = 'login'; break; }
        if (isDone && (await isDone(tab).catch(() => false))) { result = 'done'; await sleep(600); break; }
      }
      return v.reason || result;
    } finally {
      cdp.send('Browser.close', {}, undefined, 3000).catch(() => {});
      await Promise.race([new Promise((r) => (proc.exitCode !== null ? r() : proc.once('exit', r))), sleep(4000)]);
      if (proc.exitCode === null) proc.kill('SIGKILL');
      if (this.visible === v) this.visible = null;
    }
  }

  /** À la fermeture de QuestFlow : on n'attend pas, on arrête tout. */
  killNow() {
    for (const proc of [this.browser?.proc, this.visible?.proc]) if (proc && proc.exitCode === null) proc.kill('SIGTERM');
  }

  async shutdown() {
    await this.closeBrowser();
    await this.endVisible();
  }

  /** Déconnexion : on efface le profil Chrome de QuestFlow (ton Chrome habituel n'est pas touché). */
  async forget() {
    await this.shutdown();
    await this._freeProfile();
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}
