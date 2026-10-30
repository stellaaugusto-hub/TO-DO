// Gmail lu directement dans Chrome (sans fenêtre) : la boîte de réception
// (onglet Principal si tu as les onglets), puis le message d'origine de chaque
// mail (« Afficher l'original »), sans le marquer comme lu. Aucune clé API.

import { simpleParser } from 'mailparser';

export const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox';

/** Date de réception cachée dans l'identifiant Gmail (les 44 premiers bits = millisecondes). */
export function idTime(hexId) {
  try {
    return Number(BigInt(`0x${hexId}`) >> 20n);
  } catch {
    return 0;
  }
}

/** Message brut (RFC 822) -> format attendu par l'extracteur */
export async function parseRaw(raw, meta = {}) {
  const parsed = await simpleParser(raw, { skipImageLinks: true, skipTextToHtml: true });
  const headers = {};
  for (const [k, v] of parsed.headers) headers[k] = typeof v === 'string' ? v : v?.text || (Array.isArray(v?.value) ? v.value.map((x) => x.address || x).join(', ') : JSON.stringify(v));
  const from = parsed.from?.value?.[0] || {};
  return {
    id: meta.id,
    threadId: meta.threadId,
    source: 'mail',
    from: { name: from.name || meta.fromName || '', email: from.address || meta.fromEmail || '' },
    to: parsed.to?.text || '',
    cc: parsed.cc?.text || '',
    subject: parsed.subject || meta.subject || '',
    date: (parsed.date || (meta.time ? new Date(meta.time) : new Date())).toISOString(),
    text: parsed.text || '',
    html: parsed.html || '',
    headers,
    labels: [],
    url: meta.threadId ? `https://mail.google.com/mail/u/0/#all/${meta.threadId}` : 'https://mail.google.com/mail/u/0/#inbox',
  };
}

/** Quand l'original est inaccessible : on se contente de ce que montre la liste (objet + aperçu). */
export function rowToMessage(row) {
  return {
    id: row.id,
    threadId: row.threadId,
    source: 'mail',
    from: { name: row.fromName || '', email: row.fromEmail || '' },
    to: '',
    cc: '',
    subject: row.subject || '',
    date: new Date(row.time || Date.now()).toISOString(),
    text: row.snippet || '',
    html: '',
    headers: {},
    labels: [],
    partial: true,
    url: `https://mail.google.com/mail/u/0/#all/${row.threadId || row.id}`,
  };
}

/** Flux Atom de Gmail (non lus de la boîte de réception) : secours si la liste n'est pas lisible. */
export function parseAtom(xml) {
  const dec = (s = '') => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(lt|gt|amp|quot|apos|#39);/g, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", '#39': "'" })[e]);
  const tag = (s, t) => dec((s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1] || '').trim();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
    const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const id = (dec(link).match(/message_id=([0-9a-f]+)/i) || [])[1] || null;
    const author = (e.match(/<author>([\s\S]*?)<\/author>/) || [])[1] || '';
    return { id, threadId: id, subject: tag(e, 'title'), snippet: tag(e, 'summary'), fromName: tag(author, 'name'), fromEmail: tag(author, 'email'), time: Date.parse(tag(e, 'issued') || tag(e, 'modified')) || (id ? idTime(id) : 0) };
  }).filter((r) => r.id);
}

// --- Fonctions exécutées dans la page Gmail (autonomes) --------------------------

export function gmailReady() {
  const main = document.querySelector('div[role="main"]');
  return !!main && (main.querySelectorAll('tr.zA').length > 0 || !!main.querySelector('td.TC'));
}

export function gmailAccount() {
  const re = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
  const btn = [...document.querySelectorAll('a[aria-label], [role="button"][aria-label]')].find((a) => re.test(a.getAttribute('aria-label')) && /compte|account/i.test(a.getAttribute('aria-label')));
  const label = btn?.getAttribute('aria-label') || '';
  const email = (document.title.match(re) || label.match(re) || [])[0] || null;
  const name = label.includes(':') ? label.split(':').slice(1).join(':').split('(')[0].replace(/\s+/g, ' ').trim() : null;
  return { email, name: name || null };
}

export function gmailRows() {
  const main = document.querySelector('div[role="main"]') || document;
  return [...main.querySelectorAll('tr.zA')].map((tr) => {
    const idEl = tr.querySelector('[data-legacy-last-message-id]') || tr.querySelector('[data-legacy-message-id]');
    const id = idEl?.getAttribute('data-legacy-last-message-id') || idEl?.getAttribute('data-legacy-message-id') || null;
    const threadId = tr.querySelector('[data-legacy-thread-id]')?.getAttribute('data-legacy-thread-id') || id;
    const senders = [...tr.querySelectorAll('span[email]')];
    const s = senders.find((x) => x.closest('.zF')) || senders[senders.length - 1];
    return {
      id,
      threadId,
      fromName: s?.getAttribute('name') || s?.textContent.trim() || '',
      fromEmail: s?.getAttribute('email') || '',
      subject: (tr.querySelector('.bog') || tr.querySelector('.bqe'))?.textContent.trim() || '',
      snippet: tr.querySelector('.y2')?.textContent.replace(/^\s*[-–]\s*/, '').trim() || '',
      unread: tr.classList.contains('zE'),
    };
  }).filter((r) => r.id);
}

/** « Afficher l'original » d'un message, lu depuis la page Gmail (même session, rien n'est marqué comme lu). */
export async function gmailRawInPage(hexId) {
  let ik = '';
  try { ik = (typeof GLOBALS !== 'undefined' && Array.isArray(GLOBALS) && GLOBALS[9]) || ''; } catch { /* rien */ }
  if (!ik) ik = (document.documentElement.innerHTML.match(/[?&]ik=([0-9a-f]{8,12})\b/) || [])[1] || '';
  const base = (location.pathname.match(/^\/mail\/u\/\d+\//) || ['/mail/u/0/'])[0];
  const dec = BigInt(`0x${hexId}`).toString();
  const unescape = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos|nbsp);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1));
    return { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' }[e.toLowerCase()];
  });
  const tries = [`${base}?ik=${ik}&view=om&permmsgid=msg-f:${dec}`, `${base}?ik=${ik}&view=om&th=${hexId}`, `${base}?ik=${ik}&view=att&th=${hexId}&attid=0&disp=comp&safe=1&zw`];
  for (const u of tries) {
    try {
      const r = await fetch(u, { credentials: 'include' });
      if (!r.ok) continue;
      const text = await r.text();
      const m = text.match(/<pre[^>]*raw_message_text[^>]*>([\s\S]*?)<\/pre>/i);
      if (m) return unescape(m[1]);
      if (!/^\s*</.test(text) && /^[A-Za-z-]+:[ \t]/m.test(text.slice(0, 4000)) && /\r?\n\r?\n/.test(text)) return text;
    } catch { /* essai suivant */ }
  }
  return null;
}

export async function gmailAtomInPage() {
  const base = (location.pathname.match(/^\/mail\/u\/\d+\//) || ['/mail/u/0/'])[0];
  const r = await fetch(`${base}feed/atom`, { credentials: 'include' });
  return r.ok ? r.text() : null;
}

// --- Côté QuestFlow -------------------------------------------------------------

/** Ouvre Gmail, vérifie la connexion et renvoie l'adresse du compte. */
export async function openGmail(session) {
  const tab = await session.open(GMAIL_URL, { ready: gmailReady, timeout: 45e3 });
  // laisser la liste se stabiliser (Gmail complète l'affichage en plusieurs fois)
  let prev = -1;
  for (let i = 0; i < 6; i++) {
    const n = await tab.evaluate(() => document.querySelectorAll('div[role="main"] tr.zA').length).catch(() => 0);
    if (n === prev) break;
    prev = n;
    await new Promise((r) => setTimeout(r, 600));
  }
  const account = await tab.evaluate(gmailAccount).catch(() => ({}));
  return { tab, account };
}

export async function fetchRecentMails(session, { lookbackDays = 7, skipIds = new Set(), max = 40, log, onProgress } = {}) {
  const { tab, account } = await openGmail(session);
  try {
    let rows = await tab.evaluate(gmailRows).catch(() => []);
    let via = 'liste';
    if (!rows.length) {
      const empty = await tab.evaluate(() => !!document.querySelector('div[role="main"] td.TC')).catch(() => false);
      if (!empty) {
        await session.diagnose(tab, 'gmail');
        const xml = await tab.evaluate(gmailAtomInPage).catch(() => null);
        rows = xml ? parseAtom(xml) : [];
        via = 'flux';
      }
    }
    const since = Date.now() - lookbackDays * 86400e3;
    const todo = rows
      .map((r) => ({ ...r, time: r.time || idTime(r.id) }))
      .filter((r) => !skipIds.has(r.id) && (!r.time || r.time >= since))
      .slice(0, max);
    log?.info(`gmail (${via}) : ${rows.length} fils visibles, ${todo.length} à lire`);
    const messages = [];
    let partial = 0;
    for (let i = 0; i < todo.length; i++) {
      const row = todo[i];
      onProgress?.({ done: i + 1, total: todo.length });
      let msg = null;
      try {
        const raw = await tab.evaluate(gmailRawInPage, row.id);
        if (raw) msg = await parseRaw(raw, row);
      } catch (e) {
        log?.warn(`gmail ${row.id}: ${e.message}`);
      }
      if (!msg) {
        partial++;
        msg = rowToMessage(row);
      }
      messages.push(msg);
    }
    if (partial) log?.warn(`gmail : ${partial} message(s) lus depuis l'aperçu seulement`);
    return { messages, account, scanned: rows.length };
  } finally {
    await tab.close();
  }
}
