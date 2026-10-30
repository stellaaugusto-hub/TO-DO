// Google Chat via l'API officielle (lecture seule) : messages récents des
// conversations et espaces, sans les miens.

const BASE = 'https://chat.googleapis.com/v1';

/** Remplace les mentions : « @Moi » disparaît, les autres deviennent « @autre ». */
export function cleanChatText(msg, meId) {
  let text = msg.text || '';
  const anns = (msg.annotations || []).filter((a) => a.type === 'USER_MENTION' && a.startIndex !== undefined).sort((a, b) => b.startIndex - a.startIndex);
  for (const a of anns) {
    const isMe = a.userMention?.user?.name === meId;
    text = text.slice(0, a.startIndex) + (isMe ? '' : '@autre') + text.slice(a.startIndex + a.length);
  }
  return text.replace(/^\s*[,:]\s*/, '').trim();
}

export async function fetchChatMessages(auth, { meId, lookbackDays = 3, skipIds = new Set(), maxSpaces = 25, log }) {
  const since = new Date(Date.now() - lookbackDays * 86400e3).toISOString();
  const spaces = await auth.api(`${BASE}/spaces`, { query: { pageSize: 100 } });
  const recent = (spaces.spaces || [])
    .filter((s) => !s.lastActiveTime || s.lastActiveTime >= since)
    .sort((a, b) => (b.lastActiveTime || '').localeCompare(a.lastActiveTime || ''))
    .slice(0, maxSpaces);
  const messages = [];
  for (const sp of recent) {
    try {
      const r = await auth.api(`${BASE}/${sp.name}/messages`, { query: { filter: `createTime > "${since}"`, orderBy: 'createTime desc', pageSize: 30 } });
      for (const m of r.messages || []) {
        if (skipIds.has(m.name) || !m.text) continue;
        const fromSelf = m.sender?.name === meId;
        // Dans un espace à plusieurs, on ne garde que les messages qui me mentionnent ou qui s'adressent à tous
        const mentionsMe = (m.annotations || []).some((a) => a.userMention?.user?.name === meId || a.userMention?.type === 'MENTION_ALL');
        if (sp.spaceType === 'SPACE' && !mentionsMe) continue;
        messages.push({
          id: m.name,
          source: 'chat',
          fromSelf,
          from: { name: m.sender?.displayName || (sp.spaceType === 'DIRECT_MESSAGE' ? sp.displayName : '') || '' },
          text: cleanChatText(m, meId),
          space: sp.displayName || (sp.spaceType === 'DIRECT_MESSAGE' ? 'Message direct' : 'Espace'),
          date: m.createTime,
          url: `https://chat.google.com/${sp.name.replace('spaces/', 'room/')}`,
        });
      }
    } catch (e) {
      log?.warn(`chat ${sp.name}: ${e.message}`);
    }
  }
  return { messages, spaces: recent.length };
}
