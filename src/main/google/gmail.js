// Gmail via l'API officielle (lecture seule) : derniers mails de la boîte de réception,
// message complet (texte, HTML, en-têtes À / Cc / List-Unsubscribe…).

import { simpleParser } from 'mailparser';

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function mailQuery(days) {
  return `in:inbox newer_than:${days}d -category:promotions -category:social -category:forums -from:me`;
}

/** Message brut (RFC 822) -> format attendu par l'extracteur */
export async function parseRaw(raw, meta = {}) {
  const parsed = await simpleParser(Buffer.from(raw, 'base64url'), { skipImageLinks: true, skipTextToHtml: true });
  const headers = {};
  for (const [k, v] of parsed.headers) headers[k] = typeof v === 'string' ? v : v?.text || (Array.isArray(v?.value) ? v.value.map((x) => x.address || x).join(', ') : JSON.stringify(v));
  const from = parsed.from?.value?.[0] || {};
  return {
    id: meta.id,
    threadId: meta.threadId,
    source: 'mail',
    from: { name: from.name || '', email: from.address || '' },
    to: parsed.to?.text || '',
    cc: parsed.cc?.text || '',
    subject: parsed.subject || '',
    date: (parsed.date || (meta.internalDate ? new Date(+meta.internalDate) : new Date())).toISOString(),
    text: parsed.text || '',
    html: parsed.html || '',
    headers,
    labels: meta.labelIds || [],
    url: `https://mail.google.com/mail/u/0/#all/${meta.threadId}`,
  };
}

export async function fetchRecentMails(auth, { lookbackDays = 7, skipIds = new Set(), max = 50, log, onProgress }) {
  const list = await auth.api(`${BASE}/messages`, { query: { q: mailQuery(lookbackDays), maxResults: max } });
  const ids = (list.messages || []).filter((m) => !skipIds.has(m.id));
  const messages = [];
  let i = 0;
  for (const m of ids) {
    onProgress?.({ done: ++i, total: ids.length });
    try {
      const full = await auth.api(`${BASE}/messages/${m.id}`, { query: { format: 'raw' } });
      if ((full.labelIds || []).some((l) => ['CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'SPAM', 'SENT', 'DRAFT'].includes(l))) continue;
      messages.push(await parseRaw(full.raw, full));
    } catch (e) {
      log?.warn(`gmail ${m.id}: ${e.message}`);
    }
  }
  return { messages, scanned: list.resultSizeEstimate || ids.length };
}
