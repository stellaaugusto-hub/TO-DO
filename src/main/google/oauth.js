// Connexion Google officielle (OAuth 2.0 pour applications de bureau).
// L'autorisation s'ouvre dans le navigateur de l'utilisateur (Chrome, Safari…),
// Google renvoie un code sur un petit serveur local 127.0.0.1, l'app l'échange
// contre des jetons. Le jeton de rafraîchissement est chiffré via le trousseau macOS.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app, shell, safeStorage, net } from 'electron';

export const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.readonly',
];

export class NotLoggedInError extends Error {
  constructor(msg = 'Pas connecté à Google') {
    super(msg);
    this.code = 'NOT_LOGGED_IN';
  }
}
export class NotConfiguredError extends Error {
  constructor() {
    super('Connexion Google pas encore configurée');
    this.code = 'NOT_CONFIGURED';
  }
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function buildAuthUrl({ clientId, redirectUri, challenge, state, loginHint }) {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  if (loginHint) p.set('login_hint', loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

const DONE_PAGE = (ok, msg) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>QuestFlow</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#07071a;color:#eeedff;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
.c{text-align:center}.i{width:84px;height:84px;border-radius:26px;margin:0 auto 24px;display:grid;place-items:center;font-size:42px;background:${ok ? 'linear-gradient(135deg,#34d399,#22d3ee)' : 'linear-gradient(135deg,#f43f5e,#f97316)'}}
h1{font-size:28px;margin:0 0 10px}p{color:#a3a1cc;font-size:15px}</style></head>
<body><div class="c"><div class="i">${ok ? '✓' : '!'}</div><h1>${ok ? 'Google est connecté à QuestFlow' : 'Connexion interrompue'}</h1><p>${msg}</p></div></body></html>`;

export class GoogleAuth {
  constructor({ store, log, bundled = {} }) {
    this.store = store;
    this.log = log;
    this.bundled = bundled;
    this.file = path.join(app.getPath('userData'), 'google-token.bin');
    this.access = null; // { token, exp }
    this._refresh = this._load();
  }

  get client() {
    const c = this.store.get().googleClient || {};
    return { clientId: (c.clientId || this.bundled.clientId || '').trim(), clientSecret: (c.clientSecret || this.bundled.clientSecret || '').trim() };
  }

  get configured() {
    return !!this.client.clientId;
  }

  get connected() {
    return !!this._refresh;
  }

  _load() {
    try {
      const buf = fs.readFileSync(this.file);
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8');
    } catch {
      return null;
    }
  }

  _save(token) {
    this._refresh = token;
    if (!token) {
      try { fs.unlinkSync(this.file); } catch {}
      return;
    }
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token, 'utf8');
    fs.writeFileSync(this.file, data, { mode: 0o600 });
  }

  async _token(params) {
    const { clientId, clientSecret } = this.client;
    const body = new URLSearchParams({ client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), ...params });
    const r = await net.fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.error_description || j.error || `HTTP ${r.status}`);
      err.oauth = j.error;
      throw err;
    }
    return j;
  }

  /** Ouvre le navigateur, attend l'autorisation, enregistre les jetons. */
  login({ onOpened } = {}) {
    if (!this.configured) return Promise.reject(new NotConfiguredError());
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const state = b64url(crypto.randomBytes(16));
    return new Promise((resolve, reject) => {
      let finished = false;
      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/') { res.writeHead(404).end(); return; }
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (url.searchParams.get('state') !== state || (!code && !error)) { res.writeHead(400).end(); return; }
        try {
          if (error) throw new Error(error === 'access_denied' ? 'Autorisation refusée' : error);
          const tok = await this._token({ code, code_verifier: verifier, grant_type: 'authorization_code', redirect_uri: redirectUri });
          if (!tok.refresh_token) throw new Error("Google n'a pas renvoyé de jeton de rafraîchissement");
          this._save(tok.refresh_token);
          this.access = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE(true, 'Tu peux fermer cet onglet et revenir dans QuestFlow ✨'));
          finished = true;
          resolve({ connected: true, scope: tok.scope });
        } catch (e) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_PAGE(false, e.message));
          finished = true;
          reject(e);
        } finally {
          setTimeout(() => server.close(), 500);
        }
      });
      let redirectUri;
      server.listen(0, '127.0.0.1', () => {
        redirectUri = `http://127.0.0.1:${server.address().port}`;
        const url = buildAuthUrl({ clientId: this.client.clientId, redirectUri, challenge, state, loginHint: this.store.get().google.email });
        shell.openExternal(url);
        onOpened?.(url);
      });
      setTimeout(() => {
        if (!finished) {
          server.close();
          reject(new Error('Temps écoulé : la connexion a été abandonnée'));
        }
      }, 10 * 60e3);
    });
  }

  async accessToken() {
    if (this.access && this.access.exp > Date.now()) return this.access.token;
    if (!this.configured) throw new NotConfiguredError();
    if (!this._refresh) throw new NotLoggedInError();
    try {
      const tok = await this._token({ refresh_token: this._refresh, grant_type: 'refresh_token' });
      this.access = { token: tok.access_token, exp: Date.now() + (tok.expires_in - 60) * 1000 };
      return this.access.token;
    } catch (e) {
      if (e.oauth === 'invalid_grant') {
        this._save(null);
        throw new NotLoggedInError('Ta connexion Google a expiré, reconnecte-toi');
      }
      throw e;
    }
  }

  async logout() {
    const token = this._refresh;
    this._save(null);
    this.access = null;
    if (token) {
      try { await net.fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }); } catch {}
    }
  }

  /** Requête authentifiée vers une API Google. */
  async api(url, { method = 'GET', body, query } = {}) {
    const token = await this.accessToken();
    const u = new URL(url);
    if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
    const r = await net.fetch(u.toString(), {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 204) return null;
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) {
      this.access = null;
      throw new NotLoggedInError();
    }
    if (!r.ok) {
      const err = new Error(j.error?.message || `HTTP ${r.status}`);
      err.status = r.status;
      err.reason = j.error?.status || j.error?.errors?.[0]?.reason;
      throw err;
    }
    return j;
  }
}
