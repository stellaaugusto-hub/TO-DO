// Expérience sur un vrai Mac + vrai Google Chrome : la session survit-elle entre la fenêtre
// de connexion et la lecture ? Une fenêtre apparaît-elle ? QuestFlow perd-il le premier plan ?
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = '/Applications/Google Chrome.app';
const TEST = [...(process.env.CHROME ? ['--no-sandbox', '--no-proxy-server'] : []), '--ignore-certificate-errors', '--host-resolver-rules=MAP *.google.com 127.0.0.1:8443'];
const COMMON = ['--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen', '--profile-directory=Default'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const shot = (name) => { try { execFileSync('/usr/sbin/screencapture', ['-x', `shots/${name}.png`]); } catch (e) { console.log('screencapture', e.message); } };
const front = () => { try { const asn = execFileSync('lsappinfo', ['front']).toString().trim(); return execFileSync('lsappinfo', ['info', '-only', 'name', asn]).toString().trim(); } catch (e) { return '?' + e.message; } };
const hasSAP = (dir) => ['Default/Network/Cookies', 'Default/Cookies'].some((f) => { try { return fs.readFileSync(path.join(dir, f)).includes('SAPISID'); } catch { return false; } });
const lastMail = () => fs.readFileSync('requests.jsonl', 'utf8').trim().split('\n').map(JSON.parse).filter((r) => r.host === 'mail.google.com').pop();
fs.mkdirSync('shots', { recursive: true });

async function login(dir, extra = []) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const p = spawn(CHROME, [`--user-data-dir=${dir}`, ...COMMON, ...extra, ...TEST, '--new-window', 'https://accounts.google.com/ServiceLogin?continue=x'], { stdio: 'ignore' });
  const t0 = Date.now();
  while (!hasSAP(dir) && Date.now() - t0 < 60e3) await sleep(1000);
  const detected = Math.round((Date.now() - t0) / 1000);
  await sleep(4000);
  const lateBefore = +fs.readFileSync('late.txt', 'utf8');
  const t1 = Date.now();
  p.kill('SIGTERM');
  const code = await Promise.race([new Promise((r) => p.once('exit', (c, s) => r(`exit ${c} ${s}`))), sleep(20000).then(() => 'TIMEOUT')]);
  if (code === 'TIMEOUT') p.kill('SIGKILL');
  return { detectedAfter: detected, sigterm: code, quitMs: Date.now() - t1, lateBefore };
}

// --- Pilote DevTools (tube ou WebSocket) ---------------------------------------------
function pipeClient(proc) {
  let buf = '', id = 0; const pend = new Map();
  proc.stdio[4].setEncoding('utf8');
  proc.stdio[4].on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\0')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } } });
  return (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pend.set(i, r); proc.stdio[3].write(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0'); setTimeout(() => r({ error: 'timeout ' + method }), 30000); });
}
async function wsClient(dir) {
  let txt;
  for (let i = 0; i < 60 && !txt; i++) { try { txt = fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8'); } catch { await sleep(500); } }
  const [port, p] = txt.trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${p}`);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  return (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); setTimeout(() => r({ error: 'timeout ' + method }), 30000); });
}
async function readMail(send, name, createParams = {}) {
  const c = await send('Target.createTarget', { url: 'about:blank', ...createParams });
  if (c.error) return { error: JSON.stringify(c.error) };
  const { targetId } = c.result;
  const a = await send('Target.attachToTarget', { targetId, flatten: true });
  const sid = a.result.sessionId;
  await send('Page.enable', {}, sid);
  await send('Page.navigate', { url: 'https://mail.google.com/mail/u/0/#inbox' }, sid);
  await sleep(3500);
  shot(name);
  const ev = await send('Runtime.evaluate', { expression: 'JSON.stringify({href: location.href, title: document.title, webdriver: navigator.webdriver, vis: document.visibilityState})', returnByValue: true }, sid);
  const win = await send('Browser.getWindowForTarget', { targetId });
  return { page: JSON.parse(ev.result?.result?.value || '{}'), window: win.result?.bounds || win.error, front: front(), mailRequest: lastMail() };
}

async function scenario(name, fn) {
  console.log(`\n=== ${name}`);
  try { out[name] = await fn(); } catch (e) { out[name] = { crash: e.stack }; }
  console.log(JSON.stringify(out[name], null, 1));
}

// Ouvre une app au premier plan pour vérifier qu'on ne lui vole pas le focus
if (process.platform === 'darwin') spawn('open', ['-a', 'TextEdit']);
await sleep(3000);
console.log('front initial:', front());

await scenario('A_v1.1_mock_headless', async () => {
  const dir = path.resolve('prof-A');
  const l = await login(dir, ['--use-mock-keychain']);
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${dir}`, ...COMMON, '--use-mock-keychain', ...TEST, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const send = pipeClient(proc);
  const r = await readMail(send, 'A-headless');
  await send('Browser.close'); await sleep(2000); proc.kill('SIGKILL');
  return { login: l, ...r };
});

if (process.platform === 'darwin') await scenario('B1_real_keychain_open_hidden_port', async () => {
  const dir = path.resolve('prof-B1');
  const l = await login(dir);
  const f0 = front();
  execFileSync('open', ['-n', '-g', '-j', '-a', APP, '--args', `--user-data-dir=${dir}`, ...COMMON, '--remote-debugging-port=0', '--no-startup-window', ...TEST]);
  const send = await wsClient(dir);
  const r = await readMail(send, 'B1-open-hidden', { background: true });
  await send('Browser.close');
  await sleep(3000);
  return { login: l, frontBefore: f0, ...r };
});

await scenario('B2_real_keychain_pipe_minimized', async () => {
  const dir = path.resolve('prof-B2');
  const l = await login(dir);
  const f0 = front();
  const proc = spawn(CHROME, ['--remote-debugging-pipe', `--user-data-dir=${dir}`, ...COMMON, '--no-startup-window', ...TEST], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const send = pipeClient(proc);
  await sleep(1500);
  const r = await readMail(send, 'B2-pipe-minimized', { newWindow: true, background: true, windowState: 'minimized' });
  await send('Browser.close'); await sleep(2500); proc.kill('SIGKILL');
  return { login: l, frontBefore: f0, ...r };
});

await scenario('B3_real_keychain_pipe_offscreen', async () => {
  const dir = path.resolve('prof-B3');
  const l = await login(dir);
  const f0 = front();
  const proc = spawn(CHROME, ['--remote-debugging-pipe', `--user-data-dir=${dir}`, ...COMMON, '--no-startup-window', ...TEST], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const send = pipeClient(proc);
  await sleep(1500);
  const r = await readMail(send, 'B3-pipe-offscreen', { newWindow: true, background: true, left: -32000, top: -32000, width: 1280, height: 900 });
  await send('Browser.close'); await sleep(2500); proc.kill('SIGKILL');
  return { login: l, frontBefore: f0, ...r };
});

fs.writeFileSync('results.json', JSON.stringify(out, null, 1));
process.exit(0);
