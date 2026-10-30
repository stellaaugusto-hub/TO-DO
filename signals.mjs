// Quelle façon de fermer la fenêtre de connexion enregistre bien les derniers cookies ?
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TEST = [...(process.env.CHROME ? ['--no-sandbox', '--no-proxy-server'] : []), '--ignore-certificate-errors', '--host-resolver-rules=MAP *.google.com 127.0.0.1:8443'];
const COMMON = ['--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen', '--profile-directory=Default'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasSAP = (dir) => ['Default/Network/Cookies', 'Default/Cookies'].some((f) => { try { return fs.readFileSync(path.join(dir, f)).includes('SAPISID'); } catch { return false; } });
const lastMail = () => fs.readFileSync('requests.jsonl', 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.host === 'mail.google.com').pop();
const results = {};
for (const sig of (process.env.SIGNALS || 'SIGTERM,SIGINT,SIGHUP,SIGTERM_WAIT35').split(',')) {
  const dir = path.resolve(`prof-sig-${sig}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const p = spawn(CHROME, [`--user-data-dir=${dir}`, ...COMMON, ...TEST, 'https://accounts.google.com/ServiceLogin?continue=x'], { stdio: 'ignore' });
  while (!hasSAP(dir)) await sleep(500);
  await sleep(sig.endsWith('WAIT35') ? 35000 : 4000);
  const lateBefore = +fs.readFileSync('late.txt', 'utf8');
  const t = Date.now();
  if (sig === 'APPLEQUIT') execFile('osascript', ['-l', 'JavaScript', '-e', `ObjC.import('AppKit'); $.NSRunningApplication.runningApplicationWithProcessIdentifier(${p.pid}).terminate`], (e, o, er) => console.log('osascript', e?.message || '', o, er));
  else p.kill(sig.replace('_WAIT35', ''));
  const how = await Promise.race([new Promise((r) => p.once('exit', (c, s) => r(`exit ${c} ${s}`))), sleep(20000).then(() => 'TIMEOUT')]);
  if (how === 'TIMEOUT') p.kill('SIGKILL');
  const ms = Date.now() - t;
  // relecture avec un Chrome piloté (fenêtre hors écran)
  const r = spawn(CHROME, ['--remote-debugging-pipe', `--user-data-dir=${dir}`, ...COMMON, ...TEST, '--window-position=-32000,-32000', 'https://mail.google.com/mail/u/0/'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  await sleep(5000);
  r.kill('SIGKILL');
  const m = lastMail();
  results[sig] = { how, quitMs: ms, lateBefore, lateRestored: +(m.cookies.LATE || 0), SID: m.cookies.SID };
  console.log(sig, JSON.stringify(results[sig]));
}
fs.writeFileSync('signals.json', JSON.stringify(results, null, 1));
process.exit(0);
