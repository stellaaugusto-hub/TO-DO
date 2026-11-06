// Google Chat lu directement dans Chrome (sans fenêtre), sans clé API.
// On repère les conversations récentes / non lues, on ouvre chacune et on lit
// les messages des derniers jours (les tiens sont ignorés par l'extracteur).
// Repères de la page tirés du projet open source glack (adaptateur Google Chat) :
// messages [data-message-multiplat-item-id][data-id], texte [jsname="bgckF"],
// auteur [jsname="oU6v8b"] / h3, heure [data-absolute-timestamp], conversations
// [role="link"] dans [data-group-id="space/…" | "dm/…"].

export const CHAT_URL = 'https://chat.google.com/u/0/';

// --- Fonctions exécutées dans la page (autonomes ; Chat peut utiliser des iframes de même origine) ---

export function chatReady() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) for (const f of docs[i].querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch { /* autre origine */ } }
  return docs.some((d) => d.querySelector('[data-group-id^="space/"], [data-group-id^="dm/"], [data-hovercard-id^="space/"], [data-hovercard-id^="dm/"], [data-message-multiplat-item-id], a[href*="/room/"], a[href*="/dm/"], a[href*="/app/chat/"]'));
}

/** Conversations de la barre latérale (les non lues en premier). */
export function chatConversations() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) for (const f of docs[i].querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch { /* autre origine */ } }
  const seen = new Set();
  const out = [];
  const add = (el, group, nameHint) => {
    const m = String(group).match(/^(space|dm)\/([\w-]+)/);
    if (!m || seen.has(m[2])) return;
    seen.add(m[2]);
    const aria = el.getAttribute('aria-label') || '';
    const name = (el.querySelector('bdi')?.textContent || aria.replace(/,.*$/, '') || nameHint || el.innerText || '').split('\n')[0].trim().slice(0, 80);
    const unread = /non lu|unread|nouveau message|new message/i.test(`${aria} ${el.innerText || ''}`) || !!el.querySelector('.mL1cqe');
    out.push({ id: m[2], kind: m[1], name, unread });
  };
  for (const d of docs) {
    for (const link of d.querySelectorAll('[role="link"]')) {
      const group = link.closest('[data-group-id]')?.getAttribute('data-group-id') || link.querySelector('[data-hovercard-id]')?.getAttribute('data-hovercard-id') || '';
      add(link, group);
    }
    for (const el of d.querySelectorAll('[data-group-id^="space/"], [data-group-id^="dm/"]')) if (!el.closest('c-wiz[data-is-room-compose-postbar]')) add(el, el.getAttribute('data-group-id'));
    for (const a of d.querySelectorAll('a[href*="/room/"], a[href*="/dm/"]')) {
      const m = a.getAttribute('href').match(/\/(room|dm)\/([\w-]+)/);
      if (m) add(a, `${m[1] === 'room' ? 'space' : 'dm'}/${m[2]}`);
    }
  }
  return out.sort((a, b) => b.unread - a.unread);
}

/** Messages affichés dans la conversation ouverte. */
export function chatMessages() {
  const docs = [document];
  for (let i = 0; i < docs.length; i++) for (const f of docs[i].querySelectorAll('iframe')) { try { if (f.contentDocument) docs.push(f.contentDocument); } catch { /* autre origine */ } }
  const textOf = (e) => {
    const read = (n) => {
      if (n.nodeType === 3) return n.textContent || '';
      if (n.nodeType !== 1) return '';
      if (n.tagName === 'IMG') return n.getAttribute('alt') || '';
      if (n.tagName === 'BR') return '\n';
      const t = [...n.childNodes].map(read).join('');
      return /^(DIV|P|LI|BLOCKQUOTE|PRE)$/.test(n.tagName) ? `\n${t}\n` : t;
    };
    return read(e).replace(/\n{2,}/g, '\n').trim();
  };
  const out = [];
  const seen = new Set();
  let lastSender = '';
  let lastEmail = '';
  for (const d of docs) {
    const rows = d.querySelectorAll('[data-message-multiplat-item-id][data-id]');
    const list = rows.length ? rows : d.querySelectorAll('[data-message-id]');
    for (const row of list) {
      const id = row.getAttribute('data-id') || row.getAttribute('data-message-id');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const author = row.querySelector('[jsname="oU6v8b"], h3, [role="heading"][aria-level="3"]');
      const member = row.querySelector('[data-is-message="true"][data-member-id], [data-member-id], [data-name]');
      const sender = author?.getAttribute('data-name') || author?.textContent?.trim() || member?.getAttribute('data-name') || member?.textContent?.trim() || lastSender;
      const email = ((author || member)?.getAttribute('data-hovercard-id') || '').includes('@') ? (author || member).getAttribute('data-hovercard-id') : sender === lastSender ? lastEmail : '';
      lastSender = sender;
      lastEmail = email;
      const ts = Number(row.querySelector('[data-absolute-timestamp]')?.getAttribute('data-absolute-timestamp')) || 0;
      const body = row.querySelector('[jsname="bgckF"]');
      const text = body ? textOf(body) : '';
      const topic = row.closest('[data-local-topic-id], [data-topic-id]');
      if (text) out.push({ id, topic: topic?.getAttribute('data-local-topic-id') || topic?.getAttribute('data-topic-id') || '', sender, email, ts, text: text.slice(0, 4000) });
    }
  }
  return { title: document.title.replace(/ - (Chat|Google Chat)$/, ''), list: out };
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

export async function fetchChatMessages(session, { meName = '', meEmail = '', lookbackDays = 3, skipIds = new Set(), maxConversations = 10, log } = {}) {
  const tab = await session.open(CHAT_URL, { ready: chatReady, timeout: 40e3 });
  try {
    // la barre latérale se remplit en plusieurs fois
    let convs = [];
    for (let i = 0; i < 6; i++) {
      convs = await tab.evaluate(chatConversations).catch(() => []);
      if (convs.length >= 3) break;
      await new Promise((r) => setTimeout(r, 800));
    }
    if (!convs.length) {
      await session.diagnose(tab, 'chat');
      log?.warn('chat : aucune conversation repérée');
      return { messages: [], conversations: 0 };
    }
    const since = Date.now() - lookbackDays * 86400e3;
    const pick = [...convs.filter((c) => c.unread), ...convs.filter((c) => !c.unread)].slice(0, maxConversations);
    const messages = [];
    const me = fold(meName.trim());
    const myFirst = me.split(/\s+/)[0];
    let read = 0;
    for (const c of pick) {
      try {
        await tab.goto(`https://chat.google.com/u/0/${c.kind === 'dm' ? 'dm' : 'room'}/${c.id}`);
        const probe = `() => { const r = (${chatMessages})(); return r.list.length ? r : null; }`;
        const res = (await tab.waitFor(probe, [], { timeout: 15e3 })) || { list: [], title: '' };
        read += res.list.length;
        const isSelf = (m) => (meEmail && m.email && fold(m.email) === fold(meEmail)) || (!!me && (fold(m.sender) === me || (fold(m.sender) === myFirst && c.kind === 'space')) ) || /^(vous|you|moi|me)$/i.test(m.sender.trim());
        const space = c.kind === 'dm' ? 'Message direct' : res.title || c.name || 'Espace';
        for (const m of res.list) {
          const key = `${c.id}/${m.id}`;
          if (skipIds.has(key) || (m.ts && m.ts < since)) continue;
          messages.push({
            id: key,
            source: 'chat',
            fromSelf: isSelf(m),
            group: c.kind === 'space',
            from: { name: m.sender || c.name, email: m.email || '' },
            text: m.text,
            space,
            date: new Date(m.ts || Date.now()).toISOString(),
            url: `https://chat.google.com/u/0/${c.kind === 'dm' ? 'dm' : 'room'}/${c.id}${m.topic ? `/${m.topic}` : ''}`,
          });
        }
      } catch (e) {
        log?.warn(`chat ${c.kind}/${c.id}: ${e.message}`);
      }
    }
    if (!read && pick.length) await session.diagnose(tab, 'chat-messages');
    log?.info(`chat : ${convs.length} conversations, ${pick.length} ouvertes, ${read} messages affichés, ${messages.length} récents`);
    return { messages, conversations: pick.length };
  } finally {
    await tab.close();
  }
}
