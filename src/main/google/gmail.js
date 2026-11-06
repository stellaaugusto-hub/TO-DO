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
  // Mêmes adresses que « Télécharger le message » de Gmail (celles qu'utilise la bibliothèque gmail.js),
  // puis « Afficher l'original ».
  const tries = [
    `${base}?view=att&th=${hexId}&attid=0&disp=comp&safe=1&zw`,
    `${base}?view=att&permmsgid=msg-f:${dec}&attid=0&disp=comp&safe=1&zw`,
    `${base}?ik=${ik}&view=om&permmsgid=msg-f:${dec}`,
    `${base}?ik=${ik}&view=om&th=${hexId}`,
  ];
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

/** Petite empreinte stable d'un texte (identifiant des messages retrouvés dans les citations). */
function hash(t) {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Historique cité dans une réponse (« Le …, Prénom Nom <adresse> a écrit : » puis « > … ») :
 * retrouve les messages précédents du fil, avec leur auteur. Profondeur 1 = message précédent.
 */
export function quotedHistory(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const depthOf = (l) => { const m = l.match(/^((?:[ \t]*>)+)/); return m ? (m[1].match(/>/g) || []).length : 0; };
  const strip = (l, d) => { let x = l; for (let i = 0; i < d; i++) x = x.replace(/^[ \t]*>[ \t]?/, ''); return x; };
  const byDepth = new Map();
  for (const l of lines) {
    const d = depthOf(l);
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d).push(strip(l, d));
  }
  const ATTR = /(?:^|\n)[ \t]*(?:Le|On)\s[^\n]*?(?:\n[^\n]*?)?,?[ \t]*([^<\n,]+?)\s*<([^>\s]+@[^>\s]+)>\s*(?:a\s+[ée]crit|wrote)\s*:/g;
  const HEADER = /\n[ \t]*(?:Le|On)\s[^\n]*(?:\n[^\n]*)?(?:a\s+[ée]crit|wrote)\s*:[\s\S]*$/;
  const out = [];
  const maxD = Math.max(0, ...byDepth.keys());
  for (let d = 1; d <= maxD; d++) {
    const parent = (byDepth.get(d - 1) || []).join('\n');
    const attrs = [...parent.matchAll(ATTR)];
    const a = attrs[attrs.length - 1];
    const own = `\n${(byDepth.get(d) || []).join('\n')}`.replace(HEADER, '').trim();
    if (own) out.push({ depth: d, fromName: (a?.[1] || '').trim(), fromEmail: (a?.[2] || '').trim().toLowerCase(), text: own });
  }
  return out;
}

export async function fetchRecentMails(session, { lookbackDays = 7, skipIds = new Set(), max = 40, searches = [], log, onProgress } = {}) {
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
    // Recherches en plus de la boîte de réception (ex. notifications Slack, souvent rangées dans
    // l'onglet « Notifications ») : une recherche Gmail voit tous les onglets.
    for (const q of searches) {
      try {
        // page vierge d'abord : on force un vrai chargement (sinon Gmail garde la liste précédente affichée)
        await tab.goto('about:blank');
        await tab.goto(`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`${q} newer_than:${lookbackDays}d`)}`);
        await tab.waitFor(gmailReady, [], { timeout: 25e3 });
        await new Promise((r) => setTimeout(r, 1200));
        const found = await tab.evaluate(gmailRows).catch(() => []);
        const known = new Set(rows.map((r) => r.id));
        const extra = found.filter((r) => !known.has(r.id)).map((r) => ({ ...r, search: q }));
        rows = rows.concat(extra);
        log?.info(`gmail (recherche « ${q} ») : ${found.length} fils, ${extra.length} en plus`);
      } catch (e) {
        log?.warn(`gmail recherche « ${q} » : ${e.message}`);
      }
    }
    const since = Date.now() - lookbackDays * 86400e3;
    // Un fil = son dernier message ET son premier (l'identifiant du fil est celui du 1er message) :
    // le dernier est souvent ta propre réponse, la demande est plus haut.
    const todo = rows
      .map((r) => ({ ...r, time: r.time || idTime(r.id) }))
      .filter((r) => !r.time || r.time >= since)
      .filter((r) => !skipIds.has(r.id) || (r.threadId && r.threadId !== r.id && !skipIds.has(r.threadId)))
      .slice(0, max + 25 * searches.length);
    log?.info(`gmail (${via}) : ${rows.length} fils visibles, ${todo.length} à lire`);
    const messages = [];
    const seenTexts = new Set();
    let partial = 0;
    let quoted = 0;
    const read = async (id, row) => {
      try {
        const raw = await tab.evaluate(gmailRawInPage, id);
        if (raw) return await parseRaw(raw, { ...row, id, time: idTime(id) });
      } catch (e) {
        log?.warn(`gmail ${id}: ${e.message}`);
      }
      return null;
    };
    for (let i = 0; i < todo.length; i++) {
      const row = todo[i];
      onProgress?.({ done: i + 1, total: todo.length });
      // dernier message du fil
      let last = skipIds.has(row.id) ? null : await read(row.id, row);
      if (!last && !skipIds.has(row.id)) {
        partial++;
        last = rowToMessage(row);
      }
      if (last) {
        messages.push(last);
        seenTexts.add(last.text.slice(0, 160));
      }
      // premier message du fil (la demande d'origine), s'il est récent
      if (row.threadId && row.threadId !== row.id && !skipIds.has(row.threadId) && idTime(row.threadId) >= since - lookbackDays * 86400e3) {
        const first = await read(row.threadId, row);
        if (first) {
          messages.push(first);
          seenTexts.add(first.text.slice(0, 160));
        }
      }
      // messages intermédiaires retrouvés dans l'historique cité de la dernière réponse
      if (last && !last.partial) {
        for (const q of quotedHistory(last.text)) {
          const key = q.text.slice(0, 160);
          if ([...seenTexts].some((t) => t.slice(0, 80) === key.slice(0, 80))) continue;
          const qid = `${row.threadId || row.id}:${hash(q.fromEmail + q.text.slice(0, 400))}`;
          if (skipIds.has(qid)) continue;
          seenTexts.add(key);
          quoted++;
          messages.push({ ...last, id: qid, from: { name: q.fromName, email: q.fromEmail }, to: '', cc: '', text: q.text, html: '', headers: {}, quoted: true });
        }
      }
    }
    if (partial) log?.warn(`gmail : ${partial} message(s) lus depuis l'aperçu seulement`);
    log?.info(`gmail : ${messages.length} messages analysés (${quoted} retrouvés dans les fils)`);
    return { messages, account, scanned: rows.length };
  } finally {
    await tab.close();
  }
}
