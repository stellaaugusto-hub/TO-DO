// Mises à jour automatiques depuis les Releases GitHub.
//
// Pourquoi un updater maison ? Le mécanisme standard de macOS (Squirrel) exige un
// certificat Apple payant. Ici : on télécharge le .zip de la nouvelle version, on
// remplace le contenu de QuestFlow.app une fois l'app fermée, puis on la relance.
// Les fichiers téléchargés par l'app elle-même ne sont pas mis en quarantaine par
// macOS : aucune alerte Gatekeeper lors des mises à jour.

import { app, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { compareVersions } from '../shared/version.js';

export { compareVersions };

const run = (cmd, args) =>
  new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))));

export class Updater extends EventEmitter {
  constructor({ owner, repo, log }) {
    super();
    this.owner = owner;
    this.repo = repo;
    this.log = log;
    this.status = { state: 'idle', current: app.getVersion() };
    this.pending = null;
  }

  get enabled() {
    return app.isPackaged && process.platform === 'darwin' && !!this.owner && !this.owner.startsWith('<');
  }

  set(patch) {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  async latest() {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': `QuestFlow/${app.getVersion()}` };
    try {
      const r = await net.fetch(`https://api.github.com/repos/${this.owner}/${this.repo}/releases/latest`, { headers });
      if (r.ok) {
        const rel = await r.json();
        return { version: rel.tag_name.replace(/^v/, ''), notes: rel.body || '', assets: rel.assets.map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })) };
      }
      this.log.warn(`updater api ${r.status}`);
    } catch (e) {
      this.log.warn(`updater api: ${e.message}`);
    }
    // Plan B (limite d'API atteinte) : la page /releases/latest redirige vers /tag/vX.Y.Z
    const r = await net.fetch(`https://github.com/${this.owner}/${this.repo}/releases/latest`, { headers: { 'User-Agent': headers['User-Agent'] } });
    const tag = (r.url.match(/\/tag\/v?([^/?#]+)/) || [])[1];
    if (!tag) throw new Error('Impossible de lire la dernière version');
    const base = `https://github.com/${this.owner}/${this.repo}/releases/download/v${tag}`;
    const names = [`QuestFlow-${tag}-mac-arm64.zip`, `QuestFlow-${tag}-mac-x64.zip`];
    return { version: tag, notes: '', assets: names.flatMap((n) => [{ name: n, url: `${base}/${n}` }, { name: `${n}.sha256`, url: `${base}/${n}.sha256` }]) };
  }

  async check() {
    if (!this.enabled) {
      this.set({ state: 'disabled' });
      return this.status;
    }
    this.set({ state: 'checking', error: null });
    try {
      const rel = await this.latest();
      if (compareVersions(rel.version, app.getVersion()) <= 0) {
        this.set({ state: 'uptodate', latest: rel.version, checkedAt: new Date().toISOString() });
        return this.status;
      }
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const asset = rel.assets.find((a) => a.name === `QuestFlow-${rel.version}-mac-${arch}.zip`) || rel.assets.find((a) => /mac.*\.zip$/.test(a.name) && a.name.includes(arch));
      if (!asset) throw new Error(`Aucun fichier pour ${arch} dans la version ${rel.version}`);
      const sum = rel.assets.find((a) => a.name === `${asset.name}.sha256`);
      this.pending = { version: rel.version, notes: rel.notes, asset, sum };
      this.set({ state: 'available', version: rel.version, notes: rel.notes });
    } catch (e) {
      this.log.warn(`updater check: ${e.message}`);
      this.set({ state: 'error', error: e.message });
    }
    return this.status;
  }

  appBundle() {
    return path.resolve(process.execPath, '..', '..', '..');
  }

  async download() {
    const { asset, sum, version } = this.pending;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'questflow-update-'));
    const zip = path.join(dir, asset.name);
    this.set({ state: 'downloading', progress: 0, version });
    const res = await net.fetch(asset.url, { headers: { 'User-Agent': 'QuestFlow' } });
    if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
    const total = +res.headers.get('content-length') || asset.size || 0;
    const out = fs.createWriteStream(zip);
    const hash = crypto.createHash('sha256');
    const reader = res.body.getReader();
    let received = 0;
    let lastEmit = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      hash.update(value);
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (Date.now() - lastEmit > 150) {
        lastEmit = Date.now();
        this.set({ progress: total ? received / total : 0, received, total });
      }
    }
    await new Promise((r) => out.end(r));
    if (sum) {
      try {
        const r = await net.fetch(sum.url);
        if (r.ok) {
          const expected = (await r.text()).trim().split(/\s+/)[0];
          if (expected && expected !== hash.digest('hex')) throw new Error('Fichier de mise à jour corrompu (empreinte SHA-256 différente)');
        }
      } catch (e) {
        if (/corrompu/.test(e.message)) throw e;
      }
    }
    this.set({ progress: 1, state: 'extracting' });
    const extractDir = path.join(dir, 'app');
    fs.mkdirSync(extractDir);
    await run('/usr/bin/ditto', ['-x', '-k', zip, extractDir]);
    const newApp = fs.readdirSync(extractDir).find((n) => n.endsWith('.app'));
    if (!newApp) throw new Error("Archive invalide : pas d'application dedans");
    const newAppPath = path.join(extractDir, newApp);
    await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', newAppPath]).catch(() => {});
    await run('/usr/bin/codesign', ['--verify', '--deep', newAppPath]).catch((e) => this.log.warn(`codesign verify: ${e.message}`));
    this.pending.newAppPath = newAppPath;
    this.pending.dir = dir;
    this.set({ state: 'ready' });
  }

  /** Remplace l'app et relance. Renvoie false si l'app n'est pas à un endroit modifiable. */
  install() {
    const target = this.appBundle();
    if (/AppTranslocation|^\/Volumes\//.test(target)) {
      this.set({ state: 'error', error: 'Déplace QuestFlow dans le dossier Applications pour activer les mises à jour.' });
      return false;
    }
    let writable = true;
    try {
      fs.accessSync(target, fs.constants.W_OK);
      fs.accessSync(path.join(target, 'Contents'), fs.constants.W_OK);
    } catch {
      writable = false;
    }
    const logFile = path.join(app.getPath('userData'), 'logs', 'update.log');
    const script = path.join(this.pending.dir, 'install.sh');
    const swap = `set -e; OLD="${this.pending.dir}/old-contents"; rm -rf "$OLD"; mv "$APP/Contents" "$OLD"; if ! mv "$NEW/Contents" "$APP/Contents"; then mv "$OLD" "$APP/Contents"; exit 1; fi; rm -rf "$OLD"; xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true; touch "$APP"`;
    fs.writeFileSync(
      script,
      `#!/bin/bash
PID=${process.pid}
APP=${JSON.stringify(target)}
NEW=${JSON.stringify(this.pending.newAppPath)}
for i in $(seq 1 150); do kill -0 $PID 2>/dev/null || break; sleep 0.2; done
echo "$(date) mise à jour vers ${this.pending.version}" >> ${JSON.stringify(logFile)}
${writable
  ? `( ${swap} ) >> ${JSON.stringify(logFile)} 2>&1`
  : `/usr/bin/osascript -e "do shell script \\"APP='$APP' NEW='$NEW'; ${swap.replace(/"/g, '\\\\\\"')}\\" with prompt \\"QuestFlow installe sa mise à jour.\\" with administrator privileges" >> ${JSON.stringify(logFile)} 2>&1`}
open "$APP"
`,
      { mode: 0o755 },
    );
    this.set({ state: 'installing' });
    spawn('/bin/bash', [script], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
    return true;
  }

  async downloadAndInstall() {
    try {
      if (!this.pending) await this.check();
      if (!this.pending) return this.status;
      if (!this.pending.newAppPath) await this.download();
      this.install();
    } catch (e) {
      this.log.error(`updater: ${e.stack || e.message}`);
      this.set({ state: 'error', error: e.message });
    }
    return this.status;
  }
}
