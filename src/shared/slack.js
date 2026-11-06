// Notifications Slack reçues par mail (mentions, messages directs, récapitulatifs) :
// on les découpe en messages (canal, auteur, heure, texte) pour y chercher des demandes,
// sans clé API Slack. Format : « #canal » ou « @Personne », « Afficher dans les archives : url »,
// puis « Auteur (15 h 32, le 21 octobre) » suivi du texte.

const MONTHS = { janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10, decembre: 11, décembre: 11, january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

const HEADER = /^(.{1,60}?) \((\d{1,2})(?: ?h ?(\d{2})?|:(\d{2}) ?([AaPp][Mm])?)?, (?:le )?(\d{1,2}) ([\p{L}]+)\.?(?: (\d{4}))?\)$/u;
const HEADER_EN = /^(.{1,60}?) \((\d{1,2})(?::(\d{2}))? ?([AaPp][Mm])?, ([\p{L}]+) (\d{1,2})(?:, (\d{4}))?\)$/u;
const FOOTER = /^(vous pouvez (différer|differer|aussi désactiver|aussi desactiver)|pour accéder à des préférences|pour acceder a des preferences|you can (snooze|pause|also)|to change (how|your)|want to change)/i;

/** Est-ce un mail de notification Slack contenant des messages ? */
export function isSlackNotification(msg) {
  const from = String(msg?.from?.email || '').toLowerCase();
  return /@([\w-]+\.)*slack\.com$/.test(from) && /(afficher dans les archives|view in (the )?archives|view in slack)/i.test(msg?.text || '');
}

function parseWhen(h, mi, ampm, day, monthName, year, now) {
  const month = MONTHS[String(monthName).toLowerCase()];
  if (month === undefined) return null;
  let hour = +h;
  if (ampm) hour = (hour % 12) + (/p/i.test(ampm) ? 12 : 0);
  const y = year ? +year : now.getFullYear();
  const d = new Date(y, month, +day, hour, +(mi || 0));
  if (!year && d > new Date(now.getTime() + 86400e3)) d.setFullYear(y - 1);
  return d;
}

/**
 * Découpe une notification Slack en messages.
 * @returns {{ workspace: string, messages: Array<{ channel, dm, author, date, text, url }> }}
 */
export function parseSlackEmail(text, { subject = '', now = new Date() } = {}) {
  const t = String(text || '').replace(/\r/g, '');
  const workspace = ((t.match(/espace de travail\s+(.+?)\s*\(https?:/i) || t.match(/workspace\s+(.+?)\s*\(https?:/i) || subject.match(/(?:dans|sur|in)\s+([^#].+?)\s*$/i) || [])[1] || 'Slack').replace(/\s+/g, ' ').trim();
  const lines = t.split('\n');
  const out = [];
  let channel = null;
  let url = null;
  let cur = null;
  const push = () => {
    if (cur) {
      cur.text = cur.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      delete cur.lines;
      if (cur.text) out.push(cur);
    }
    cur = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (FOOTER.test(line)) { push(); break; }
    if (line === '* * *' || line === '---') { push(); continue; }
    if (/^#[\p{L}\d_.-]+$/u.test(line)) { push(); channel = line; url = null; continue; }
    if (/^@[^\s].{0,60}$/.test(line) && !cur) { channel = line; url = null; continue; }
    const arch = line.match(/^(?:afficher dans les archives|view in (?:the )?archives)\s*:\s*(\S+)/i);
    if (arch) { url = arch[1]; continue; }
    if (/^(voir les messages précédents|voir les messages precedents|see (earlier|previous) messages)/i.test(line)) continue;
    const h = line.match(HEADER);
    const he = !h && line.match(HEADER_EN);
    if ((h || he) && channel) {
      push();
      const date = h ? parseWhen(h[2], h[3] || h[4], h[5], h[6], h[7], h[8], now) : parseWhen(he[2], he[3], he[4], he[6], he[5], he[7], now);
      cur = { channel, dm: channel.startsWith('@'), author: (h || he)[1].trim(), date, url, lines: [] };
      continue;
    }
    if (cur) cur.lines.push(raw.replace(/\s+$/, ''));
  }
  push();
  return { workspace, messages: out };
}

/** Étiquette de l'agence / de l'espace : « Innerskin datashake » -> « datashake ». */
export function workspaceTag(workspace) {
  const words = String(workspace || '').toLowerCase().replace(/[<>&x×]+(?=\s)|\s[x×]\s/g, ' ').split(/[^\p{L}\d-]+/u).filter((w) => w && !['innerskin', 'x', 'slack', 'et', 'and'].includes(w));
  return words[words.length - 1] || null;
}

/** Notification Slack -> messages façon Chat, prêts pour l'extracteur de tâches. */
export function slackMessages(msg, { meName = '', now = new Date() } = {}) {
  const { workspace, messages } = parseSlackEmail(msg.text, { subject: msg.subject, now });
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const me = fold(meName);
  const meFirst = me.split(/\s+/)[0];
  const tag = workspaceTag(workspace);
  return messages.map((m, k) => {
    const author = fold(m.author);
    return {
      id: `${msg.id}:slack${k}`,
      source: 'slack',
      fromSelf: !!me && (author === me || author === meFirst || /^(vous|you)$/.test(author)),
      group: !m.dm,
      from: { name: m.author },
      text: m.text,
      space: `${m.dm ? `Message direct (${m.channel.slice(1)})` : m.channel} · ${workspace}`,
      workspaceTag: tag,
      date: (m.date || new Date(msg.date || Date.now())).toISOString(),
      url: m.url || msg.url,
    };
  });
}
