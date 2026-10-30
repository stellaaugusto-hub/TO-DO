// Google Chat lu directement dans Chrome (sans fenêtre), sans clé API.
// On repère les conversations récentes / non lues, on ouvre chacune et on lit
// les messages des derniers jours (les tiens sont ignorés par l'extracteur).

export const CHAT_URL = 'https://chat.google.com/u/0/';

// --- Fonctions exécutées dans la page (autonomes ; Chat utilise des iframes de même origine) ---

export function chatReady() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) for (const f of docs[i].querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch { /* autre origine */ } }
  return docs.some((d) => d.querySelector('[data-group-id], a[href*="/app/chat/"], a[href*="/room/"], a[href*="/dm/"], [data-message-id], [data-topic-id]'));
}

/** Conversations visibles dans la barre latérale (les non lues en premier). */
export function chatConversations() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) for (const f of docs[i].querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch { /* autre origine */ } }
  const seen = new Set();
  const out = [];
  for (const d of docs) {
    for (const el of d.querySelectorAll('[data-group-id], a[href*="/app/chat/"], a[href*="/room/"], a[href*="/dm/"]')) {
      const gid = el.getAttribute('data-group-id') || '';
      const href = el.getAttribute('href') || '';
      const m = href.match(/\/(?:app\/chat|room|dm)\/([\w-]+)/) || gid.match(/^(?:space|dm)\/([\w-]+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const label = `${el.getAttribute('aria-label') || ''} ${el.innerText || ''}`;
      const unread = /non lu|unread|nouveau message|new message/i.test(label) || [...el.querySelectorAll('*')].some((x) => getComputedStyle(x).fontWeight >= 600 && (x.innerText || '').trim().length > 1);
      out.push({ id: m[1], dm: /^dm\//.test(gid) || /\/dm\//.test(href), name: (el.innerText || '').split('\n')[0].trim().slice(0, 80), unread });
    }
  }
  return out.sort((a, b) => b.unread - a.unread);
}

/** Messages affichés dans la conversation ouverte. */
export function chatMessages() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) for (const f of docs[i].querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch { /* autre origine */ } }
  const out = [];
  const seen = new Set();
  let lastSender = '';
  for (const d of docs) {
    for (const el of d.querySelectorAll('[data-message-id]')) {
      const id = el.getAttribute('data-message-id');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const senderEl = el.querySelector('[data-name], [data-member-id], [data-hovercard-id]') || el.closest('[data-topic-id]')?.querySelector('[data-name], [data-member-id], [data-hovercard-id]');
      const sender = senderEl?.getAttribute('data-name') || senderEl?.innerText?.trim() || lastSender;
      lastSender = sender;
      const tsEl = el.querySelector('[data-absolute-timestamp]') || el.closest('[data-topic-id]')?.querySelector('[data-absolute-timestamp]');
      const ts = Number(tsEl?.getAttribute('data-absolute-timestamp')) || 0;
      const textEl = el.querySelector('[jsname="bgckF"], [data-message-text], .DTp27d') || el;
      let text = (textEl.innerText || '').trim();
      if (sender && text.startsWith(sender)) text = text.slice(sender.length).trim();
      text = text.split('\n').filter((l) => !/^(\d{1,2}[:h]\d{2}|modifié|edited|\d+ (min|h)|hier|yesterday|aujourd'hui|today)\b/i.test(l.trim())).join('\n').trim();
      if (text) out.push({ id, sender, ts, text: text.slice(0, 4000), selfLike: el.closest('[data-is-own], [data-self="true"]') !== null });
    }
  }
  return out;
}

// --- Côté QuestFlow ----------------------------------------------------------------

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Le message te mentionne-t-il (@Prénom, @tous) ? */
export function mentionsMe(text, meName = '') {
  const first = fold(meName).split(/\s+/)[0];
  const t = fold(text);
  return /@(all|tous|tout le monde|everyone)\b/.test(t) || (!!first && t.includes(`@${first}`));
}

/** Retire ta propre mention en tête de message (« @Stella tu peux… » -> « tu peux… »). */
export function cleanMention(text, meName = '') {
  const first = String(meName || '').trim().split(/\s+/)[0];
  if (!first) return text;
  const esc = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`@${esc}(\\s+\\S+)?\\s*[,:]?\\s*`, 'i'), (m, last) => (last && /^\s+[A-ZÉ][a-zé]+$/.test(last) ? '' : last ? last.trimStart() + ' ' : '')).trim();
}

export async function fetchChatMessages(session, { meName = '', lookbackDays = 3, skipIds = new Set(), maxConversations = 8, log } = {}) {
  const tab = await session.open(CHAT_URL, { ready: chatReady, timeout: 40e3 });
  try {
    const convs = await tab.evaluate(chatConversations).catch(() => []);
    if (!convs.length) {
      await session.diagnose(tab, 'chat');
      log?.warn('chat : aucune conversation repérée');
      return { messages: [], conversations: 0 };
    }
    const since = Date.now() - lookbackDays * 86400e3;
    const pick = [...convs.filter((c) => c.unread), ...convs.filter((c) => !c.unread)].slice(0, maxConversations);
    const messages = [];
    const me = meName.trim().toLowerCase();
    for (const c of pick) {
      try {
        await tab.goto(`https://chat.google.com/u/0/app/chat/${c.id}`);
        const list = (await tab.waitFor(`() => { const r = (${chatMessages})(); return r.length ? r : null; }`, [], { timeout: 15e3 })) || [];
        const isSelf = (m) => m.selfLike || (!!me && m.sender.toLowerCase() === me);
        // Conversation à deux (ou message direct) : tout compte. Dans un espace : seulement ce qui te mentionne.
        const others = new Set(list.filter((m) => !isSelf(m) && m.sender).map((m) => m.sender));
        const direct = c.dm || others.size <= 1;
        for (const m of list) {
          const key = `${c.id}/${m.id}`;
          if (skipIds.has(key) || (m.ts && m.ts < since)) continue;
          if (!direct && !mentionsMe(m.text, meName)) continue;
          messages.push({
            id: key,
            source: 'chat',
            fromSelf: isSelf(m),
            from: { name: m.sender || c.name },
            text: cleanMention(m.text, meName),
            space: c.dm ? 'Message direct' : c.name || 'Espace',
            date: new Date(m.ts || Date.now()).toISOString(),
            url: `https://chat.google.com/u/0/app/chat/${c.id}`,
          });
        }
      } catch (e) {
        log?.warn(`chat ${c.id}: ${e.message}`);
      }
    }
    if (!messages.length && pick.length) await session.diagnose(tab, 'chat-messages');
    log?.info(`chat : ${convs.length} conversations, ${pick.length} ouvertes, ${messages.length} messages récents`);
    return { messages, conversations: pick.length };
  } finally {
    await tab.close();
  }
}
