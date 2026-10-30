// Le vrai code de QuestFlow v1.2 (chrome.js) sur un vrai Mac + vrai Google Chrome + faux Google.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ChromeSession } from './chrome.js';

process.env.QF_CHROME_EXTRA = '--ignore-certificate-errors --host-resolver-rules=MAP *.google.com 127.0.0.1:8443';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(`TIMEOUT ${what}`); })]);
const shot = (name) => { try { execFileSync('/usr/sbin/screencapture', ['-x', `shots/${name}.png`]); } catch (e) { console.log('screencapture', e.message); } };
const front = () => { try { const asn = execFileSync('lsappinfo', ['front']).toString().trim(); return execFileSync('lsappinfo', ['info', '-only', 'name', asn]).toString().trim(); } catch (e) { return '?'; } };
const mailHits = () => fs.readFileSync('requests.jsonl', 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.host === 'mail.google.com');
const log = { info: (m) => console.log('  ·', m), warn: (m) => console.log('  ⚠', m) };
const dir = path.resolve('prof-v12');
const out = {};
fs.mkdirSync('shots', { recursive: true });
fs.rmSync(dir, { recursive: true, force: true });
execFileSync('open', ['-a', 'TextEdit']);
await sleep(3000);
out.frontInitial = front();

try {
  // 1. Connexion : fenêtre Chrome normale, le faux Google pose les cookies, détection, fermeture SIGINT
  const s1 = new ChromeSession({ dir, log, diagDir: path.resolve('diag'), idleMs: 3000 });
  const t0 = Date.now();
  const phases = [];
  const loginP = s1.login({ onPhase: (p) => phases.push(p.phase) });
  await sleep(8000);
  shot('1-fenetre-connexion');
  const reason = await withTimeout(loginP, 120e3, 'login');
  const lateBefore = +fs.readFileSync('late.txt', 'utf8');
  out.login = { reason, phases, seconds: Math.round((Date.now() - t0) / 1000), lateBefore };
  console.log('login', out.login);

  // 2. Vérification (Chrome de lecture : normal, fenêtre hors écran)
  const f0 = front();
  const checkP = s1.checkSession();
  await sleep(6000);
  shot('2-lecture-en-cours');
  const f1 = front();
  const c1 = await withTimeout(checkP, 120e3, 'check1');
  const m1 = mailHits().pop();
  out.check1 = { ok: c1.ok, state: c1.state, email: c1.email, landing: c1.landing, cookies: c1.cookies, frontBefore: f0, frontDuring: f1, mailUA: m1?.ua, mailCookies: m1?.cookies };
  console.log('check1', out.check1);
  await s1.shutdown();

  // 3. « Relance de l'app » : nouvelle session sur le même profil, la connexion doit tenir
  const s2 = new ChromeSession({ dir, log, diagDir: path.resolve('diag'), idleMs: 3000 });
  console.log('hasSession', s2.hasSession());
  const c2 = await withTimeout(s2.checkSession(), 120e3, 'check2');
  const m2 = mailHits().pop();
  out.check2 = { ok: c2.ok, state: c2.state, email: c2.email, mailCookies: m2?.cookies };
  console.log('check2', out.check2);
  await s2.shutdown();
  out.frontEnd = front();
  shot('3-fin');
} catch (e) {
  out.crash = e.stack;
  console.log('CRASH', e.stack);
}
fs.writeFileSync('v12.json', JSON.stringify(out, null, 1));
process.exit(0);
