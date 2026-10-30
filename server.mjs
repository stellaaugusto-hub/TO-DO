// Faux Google (HTTPS local) : connexion qui pose les cookies, Gmail qui vérifie qu'ils reviennent.
import https from 'node:https';
import fs from 'node:fs';
const log = (o) => fs.appendFileSync('requests.jsonl', JSON.stringify({ t: Date.now(), ...o }) + '\n');
let late = 0;
const year = new Date(Date.now() + 365 * 86400e3).toUTCString();
const ck = (n, v) => `${n}=${v}; Domain=.google.com; Path=/; Expires=${year}; Secure; SameSite=None`;
const srv = https.createServer({ key: fs.readFileSync('key.pem'), cert: fs.readFileSync('cert.pem') }, (req, res) => {
  const host = (req.headers.host || '').split(':')[0];
  const u = new URL(req.url, `https://${host}`);
  const cookies = Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean).map((c) => c.split('=')));
  log({ host, path: u.pathname, ua: req.headers['user-agent'], cookies });
  if (host === 'accounts.google.com' && u.pathname === '/ServiceLogin') {
    res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': [ck('SID', 'sid1'), ck('SAPISID', 'sap1'), ck('__Secure-1PSID', 'p1')] });
    return res.end(`<title>Connexion</title><h1>Connecté (faux Google)</h1><script>setInterval(() => fetch('/late', { credentials: 'include' }), 1500)</script>`);
  }
  if (host === 'accounts.google.com' && u.pathname === '/late') {
    late++;
    fs.writeFileSync('late.txt', String(late));
    res.writeHead(200, { 'set-cookie': [ck('LATE', String(late))], 'access-control-allow-origin': '*' });
    return res.end('ok');
  }
  if (host === 'mail.google.com') {
    if (!cookies.SID) { res.writeHead(302, { location: 'https://accounts.google.com/ServiceLogin?continue=x' }); return res.end(); }
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(`<title>Boîte de réception - test@exemple.fr - Gmail</title><div role="main"><table><tr class="zA"><td>mail</td></tr></table></div>`);
  }
  res.writeHead(404); res.end();
});
srv.listen(8443, '127.0.0.1', () => console.log('fake google on 8443'));
