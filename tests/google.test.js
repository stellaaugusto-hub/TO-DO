import { describe, it, expect } from 'vitest';
import zlib from 'node:zlib';
import { parseRaw, parseAtom, idTime, rowToMessage, quotedHistory } from '../src/main/google/gmail.js';
import { mentionsMe, cleanMention } from '../src/main/google/chat.js';
import { eventsFromZip, templateUrl, assistUrl, parseChipText, eventsFromChips, textShape } from '../src/main/google/calendar.js';
import { parseIcs, expandCalendar, zonedToUtc, calendarIdFromFile, parseLine } from '../src/main/google/ics.js';
import { unzip } from '../src/main/google/zip.js';
import { onLoginPage, COMMON_ARGS, READ_ARGS, ChromeSession } from '../src/main/google/chrome.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractTasks } from '../src/shared/extract.js';
import { compareVersions } from '../src/shared/version.js';

const RAW = [
  'From: "Jean Dupont" <jean.dupont@exemple.fr>',
  'To: Stella Augusto <stella.augusto@innerskin.fr>',
  'Cc: Paul <paul@exemple.fr>',
  'Subject: =?UTF-8?Q?Cr=C3=A9as_No=C3=ABl?=',
  'Date: Wed, 28 Oct 2026 09:12:00 +0100',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset="UTF-8"',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Salut Stella,',
  '',
  'Peux-tu d=C3=A9cliner la cr=C3=A9a de No=C3=ABl sur Facebook, Instagram et TikTok avant vendredi ?',
  '',
  'Merci !',
  'Jean Dupont',
  'Head of Growth',
  '+33 6 12 34 56 78',
  '--b1--',
  '',
].join('\r\n');

describe('Gmail (lu dans Chrome)', () => {
  it("message d'origine -> tâche", async () => {
    // « Afficher l'original » renvoie le texte brut avec des fins de ligne \n
    const msg = await parseRaw(RAW.replace(/\r\n/g, '\n'), { id: '19a2f3b4c5d6e7f8', threadId: '19a2f3b4c5d6e7f8' });
    expect(msg.subject).toBe('Créas Noël');
    expect(msg.from).toEqual({ name: 'Jean Dupont', email: 'jean.dupont@exemple.fr' });
    expect(msg.to).toContain('stella.augusto@innerskin.fr');
    expect(msg.url).toBe('https://mail.google.com/mail/u/0/#all/19a2f3b4c5d6e7f8');
    const { tasks } = extractTasks(msg, { now: new Date(2026, 9, 28, 10), userEmail: 'stella.augusto@innerskin.fr', userName: 'Stella' });
    expect(tasks.map((t) => t.title)).toEqual(['Décliner la créa de Noël sur Facebook, Instagram et TikTok']);
    expect(tasks[0].subtasks.map((s) => s.title)).toEqual(['Facebook', 'Instagram', 'TikTok']);
  });

  it("date de réception lue dans l'identifiant Gmail", () => {
    const ms = Date.UTC(2026, 9, 28, 8, 12);
    const id = ((BigInt(ms) << 20n) | 0x5a5an).toString(16);
    expect(idTime(id)).toBe(ms);
    expect(idTime('pas-hexa')).toBe(0);
  });

  it("aperçu de la liste quand l'original est inaccessible", () => {
    const m = rowToMessage({ id: 'abc', threadId: 't9', fromName: 'Léa', fromEmail: 'lea@x.fr', subject: 'Visuels', snippet: 'Tu peux envoyer les visuels avant 17h ?', time: Date.UTC(2026, 9, 28) });
    expect(m).toMatchObject({ id: 'abc', partial: true, subject: 'Visuels', text: 'Tu peux envoyer les visuels avant 17h ?', from: { name: 'Léa', email: 'lea@x.fr' } });
  });

  it('flux Atom (secours)', () => {
    const xml = `<?xml version="1.0"?><feed><entry><title>Brief &amp; planning</title><summary>Peux-tu valider le planning ?</summary>
      <link rel="alternate" href="https://mail.google.com/mail?account_id=a@b.fr&amp;message_id=19a2f3b4c5d6e7f8&amp;view=conv&amp;extsrc=atom" type="text/html" />
      <issued>2026-10-28T09:00:00Z</issued><author><name>Léa</name><email>lea@x.fr</email></author></entry></feed>`;
    expect(parseAtom(xml)).toEqual([{ id: '19a2f3b4c5d6e7f8', threadId: '19a2f3b4c5d6e7f8', subject: 'Brief & planning', snippet: 'Peux-tu valider le planning ?', fromName: 'Léa', fromEmail: 'lea@x.fr', time: Date.UTC(2026, 9, 28, 9) }]);
  });
});

describe('Gmail : fil de discussion retrouvé dans les citations', () => {
  // Dernier message du fil = ta propre réponse ; les demandes sont plus haut, citées.
  const last = "Hello Sophie,\n\nTu trouveras en pièce jointe l'invitation.\n\nStella\n\nLe ven. 6 nov. 2026 à 09:36, Claire Morel <claire.morel@innerskin.fr> a\nécrit :\n\n> Aux clients invités en centre. Il faudra que tu l’envoies à Sophie.\n>\n> Merci\n>\n> Le ven. 6 nov. 2026 à 09:09, Stella Augusto <stella.augusto@innerskin.fr>\n> a écrit :\n>\n>> Oui pas de soucis je prépare ça.\n>>\n>> Le ven. 6 nov. 2026 à 08:34, Claire Morel <claire.morel@innerskin.fr>\n>> a écrit :\n>>\n>>> Hello à tous,\n>>>\n>>> @Stella Augusto <stella.augusto@innerskin.fr> peux-tu préparer une\n>>> invitation digitale ce matin ?\n>>>\n>>> Merci,\n>>> Claire\n\n--";
  it('retrouve chaque message cité avec son auteur', () => {
    const h = quotedHistory(last);
    expect(h.map((q) => [q.depth, q.fromEmail, q.text.split('\n')[0]])).toEqual([
      [1, 'claire.morel@innerskin.fr', 'Aux clients invités en centre. Il faudra que tu l’envoies à Sophie.'],
      [2, 'stella.augusto@innerskin.fr', 'Oui pas de soucis je prépare ça.'],
      [3, 'claire.morel@innerskin.fr', 'Hello à tous,'],
    ]);
  });
  it('les demandes du fil deviennent des quêtes, pas mes propres réponses', () => {
    const now = new Date(2026, 10, 6, 8);
    const titles = quotedHistory(last).flatMap((q) => extractTasks({ source: 'mail', from: { name: q.fromName, email: q.fromEmail }, subject: 'Re: Soirée clients', text: q.text, headers: {} }, { userEmail: 'stella.augusto@innerskin.fr', userName: 'Stella', now }).tasks.map((t) => t.title));
    expect(titles).toEqual(['Envoyer à Sophie (Soirée clients)', 'Préparer une invitation digitale']);
  });
});

describe('Google Chat (lu dans Chrome)', () => {
  it('mentions', () => {
    expect(mentionsMe('@Stella tu peux relire ?', 'Stella Augusto')).toBe(true);
    expect(mentionsMe('@tous point à 15h', 'Stella')).toBe(true);
    expect(mentionsMe('@Paul tu peux relire ?', 'Stella')).toBe(false);
  });
  it('retire ma mention', () => {
    expect(cleanMention('@Stella Augusto tu peux mettre à jour le budget ads avant ce soir ?', 'Stella')).toBe('tu peux mettre à jour le budget ads avant ce soir ?');
    expect(cleanMention('@Stella, tu peux envoyer le fichier ?', 'Stella')).toBe('tu peux envoyer le fichier ?');
  });
});

describe('Chrome', () => {
  it('suit le profil où Chrome a rangé la connexion (compte pro -> « Profile 1 »)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf-prof-'));
    const put = (p, content) => { fs.mkdirSync(path.join(dir, p, 'Network'), { recursive: true }); fs.writeFileSync(path.join(dir, p, 'Network', 'Cookies'), content); };
    const s = new ChromeSession({ dir });
    expect([s.hasSession(), s.activeProfile()]).toEqual([false, 'Default']);
    put('Default', 'SQLite format 3 NID AEC');
    put('Profile 1', 'SQLite format 3 SID SAPISID __Secure-1PSID');
    fs.writeFileSync(path.join(dir, 'Local State'), JSON.stringify({ profile: { last_used: 'Profile 1', info_cache: { Default: {}, 'Profile 1': { hosted_domain: 'innerskin.fr' } } } }));
    expect([s.hasSession(), s.activeProfile()]).toEqual([true, 'Profile 1']);
    expect(s.profileSummary()).toBe('Default, Profile 1 (pro) ✓');
    expect(s._profileArgs('Profile 1')).toContain('--profile-directory=Profile 1');
    s.mockKeychain = true;
    expect(s._profileArgs('Default')).toContain('--use-mock-keychain');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lecture avec un Chrome normal : ni mode headless, ni trousseau factice', () => {
    // Le mode headless s'annonce « HeadlessChrome » à Google, et un trousseau différent
    // entre la connexion et la lecture rend les cookies illisibles : la session tombe.
    const all = [...COMMON_ARGS, ...READ_ARGS];
    expect(all.some((a) => a.startsWith('--headless'))).toBe(false);
    expect(all).not.toContain('--use-mock-keychain');
    expect(READ_ARGS).toContain('--no-startup-window');
  });

  it('page de connexion Google détectée', () => {
    const at = (href) => {
      const u = new URL(href);
      globalThis.location = { hostname: u.hostname, pathname: u.pathname };
      return onLoginPage();
    };
    expect(at('https://accounts.google.com/v3/signin/identifier')).toBe(true);
    expect(at('https://workspace.google.com/intl/fr/gmail/')).toBe(true);
    expect(at('https://www.google.com/intl/fr/gmail/about/')).toBe(true);
    expect(at('https://mail.google.com/mail/u/0/#inbox')).toBe(false);
    expect(at('https://calendar.google.com/calendar/u/0/r')).toBe(false);
    delete globalThis.location;
  });
});

// --- Google Agenda : export .ics -----------------------------------------------------

function makeZip(files) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const data = zlib.deflateRawSync(Buffer.from(content));
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(Buffer.byteLength(content), 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(Buffer.byteLength(content), 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, data);
    central.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const ics = (events, name = 'Stella Augusto') => ['BEGIN:VCALENDAR', 'VERSION:2.0', `X-WR-CALNAME:${name}`, 'X-WR-TIMEZONE:Europe/Paris',
  'BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'END:STANDARD', 'END:VTIMEZONE',
  ...events.flatMap((e) => ['BEGIN:VEVENT', ...e, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');

const ME = 'stella.augusto@innerskin.fr';
const WINDOW = { from: new Date(Date.UTC(2026, 9, 1)), to: new Date(Date.UTC(2026, 11, 1)) };
const expand = (events, extra = {}) => expandCalendar(parseIcs(ics(events)), { ...WINDOW, calendarId: ME, me: [ME], ...extra });

describe('Google Agenda (export .ics)', () => {
  it('lignes repliées, paramètres entre guillemets, texte échappé', () => {
    const cal = parseIcs(ics([['UID:a1@google.com', 'DTSTART;TZID=Europe/Paris:20261030T100000', 'DTEND;TZID=Europe/Paris:20261030T110000', 'SUMMARY:Point créa\\, ', ' Noël', 'DESCRIPTION:Ligne 1\\nLigne 2\\n\\n-::~:~::~:~:~:~::~:~::-\\nRejoindre avec Google Meet']]));
    expect(cal.name).toBe('Stella Augusto');
    expect(cal.events[0].summary).toBe('Point créa, Noël');
    expect(parseLine('ATTENDEE;CN="Dupont: Jean";PARTSTAT=DECLINED:mailto:jean@x.fr')).toEqual({ name: 'ATTENDEE', params: { CN: 'Dupont: Jean', PARTSTAT: 'DECLINED' }, value: 'mailto:jean@x.fr' });
    const [ev] = expandCalendar(cal, { ...WINDOW, calendarId: ME, me: [ME] });
    expect(ev.description).toBe('Ligne 1\nLigne 2');
  });

  it("fuseau horaire et changement d'heure", () => {
    expect(new Date(zonedToUtc([2026, 10, 20, 9, 0, 0], 'Europe/Paris')).toISOString()).toBe('2026-10-20T07:00:00.000Z');
    expect(new Date(zonedToUtc([2026, 10, 27, 9, 0, 0], 'Europe/Paris')).toISOString()).toBe('2026-10-27T08:00:00.000Z');
    expect(new Date(zonedToUtc([2026, 7, 1, 9, 30, 0], 'America/New_York')).toISOString()).toBe('2026-07-01T13:30:00.000Z');
  });

  it('événement simple, Meet, identifiant Google', () => {
    const [ev] = expand([['UID:abc123@google.com', 'DTSTART;TZID=Europe/Paris:20261030T100000', 'DTEND;TZID=Europe/Paris:20261030T110000', 'SUMMARY:Point créa', 'LOCATION:Studio', 'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij', `ORGANIZER;CN=Stella:mailto:${ME}`]]);
    expect(ev).toMatchObject({ eventId: 'abc123', calendarId: ME, title: 'Point créa', start: '2026-10-30T09:00:00.000Z', end: '2026-10-30T10:00:00.000Z', allDay: false, location: 'Studio', meet: 'https://meet.google.com/abc-defg-hij', editable: true, recurring: false });
    expect(ev.url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/u\/0\/r\/day\/2026\/10\/30$/);
  });

  it('journée entière', () => {
    const [ev] = expand([['UID:d1@google.com', 'DTSTART;VALUE=DATE:20261102', 'DTEND;VALUE=DATE:20261103', 'SUMMARY:Shooting']]);
    const s = new Date(ev.start);
    expect([ev.allDay, s.getFullYear(), s.getMonth(), s.getDate(), s.getHours()]).toEqual([true, 2026, 10, 2, 0]);
    expect(new Date(ev.end) - s).toBe(86400e3);
  });

  it("invitation refusée et événement annulé ignorés, réunion d'un autre en lecture seule", () => {
    const evs = expand([
      ['UID:x1@google.com', 'DTSTART:20261030T090000Z', 'DTEND:20261030T100000Z', 'SUMMARY:Refusé', 'ORGANIZER:mailto:boss@x.fr', `ATTENDEE;PARTSTAT=DECLINED:mailto:${ME}`],
      ['UID:x2@google.com', 'DTSTART:20261030T090000Z', 'DTEND:20261030T100000Z', 'SUMMARY:Annulé', 'STATUS:CANCELLED'],
      ['UID:x3@google.com', 'DTSTART:20261030T120000Z', 'DTEND:20261030T130000Z', 'SUMMARY:Comité', 'ORGANIZER:mailto:boss@x.fr', `ATTENDEE;PARTSTAT=ACCEPTED:mailto:${ME}`],
    ]);
    expect(evs.map((e) => [e.title, e.editable])).toEqual([['Comité', false]]);
  });

  it("récurrence hebdo : jours, fin, exceptions déplacées ou supprimées, heure d'hiver", () => {
    const evs = expand([
      ['UID:w1@google.com', 'DTSTART;TZID=Europe/Paris:20261019T093000', 'DTEND;TZID=Europe/Paris:20261019T100000', 'SUMMARY:Daily', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261104T225959Z', 'EXDATE;TZID=Europe/Paris:20261021T093000'],
      ['UID:w1@google.com', 'RECURRENCE-ID;TZID=Europe/Paris:20261028T093000', 'DTSTART;TZID=Europe/Paris:20261028T150000', 'DTEND;TZID=Europe/Paris:20261028T153000', 'SUMMARY:Daily (déplacé)'],
      ['UID:w1@google.com', 'RECURRENCE-ID;TZID=Europe/Paris:20261102T093000', 'DTSTART;TZID=Europe/Paris:20261102T093000', 'DTEND;TZID=Europe/Paris:20261102T100000', 'SUMMARY:Daily', 'STATUS:CANCELLED'],
    ]);
    expect(evs.map((e) => [e.title, e.start, e.eventId]).sort((a, b) => a[1].localeCompare(b[1]))).toEqual([
      ['Daily', '2026-10-19T07:30:00.000Z', 'w1_20261019T073000Z'],
      ['Daily', '2026-10-26T08:30:00.000Z', 'w1_20261026T083000Z'],
      ['Daily (déplacé)', '2026-10-28T14:00:00.000Z', 'w1_20261028T083000Z'],
      ['Daily', '2026-11-04T08:30:00.000Z', 'w1_20261104T083000Z'],
    ]);
  });

  it('récurrence mensuelle (dernier vendredi), quotidienne avec COUNT, annuelle', () => {
    const monthly = expand([['UID:m1@google.com', 'DTSTART:20260925T160000Z', 'DTEND:20260925T170000Z', 'SUMMARY:Bilan', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR']]);
    expect(monthly.map((e) => e.start.slice(0, 10))).toEqual(['2026-10-30', '2026-11-27']);
    const daily = expand([['UID:c1@google.com', 'DTSTART:20261029T080000Z', 'DTEND:20261029T081500Z', 'SUMMARY:Stand-up', 'RRULE:FREQ=DAILY;COUNT=3']]);
    expect(daily.map((e) => e.start.slice(0, 10))).toEqual(['2026-10-29', '2026-10-30', '2026-10-31']);
    const yearly = expand([['UID:y1@google.com', 'DTSTART;VALUE=DATE:20201112', 'DTEND;VALUE=DATE:20201113', 'SUMMARY:Anniv Léa', 'RRULE:FREQ=YEARLY']]);
    expect(yearly.map((e) => [e.title, new Date(e.start).getDate(), new Date(e.start).getMonth()])).toEqual([['Anniv Léa', 12, 10]]);
  });

  it("archive zip de l'export -> événements de tous les agendas", () => {
    const zip = makeZip({
      [`${ME}.ics`]: ics([['UID:p1@google.com', 'DTSTART:20261030T090000Z', 'DTEND:20261030T100000Z', 'SUMMARY:Perso']]),
      'Marketing_c_abc123@group.calendar.google.com.ics': ics([['UID:g1@google.com', 'DTSTART:20261030T080000Z', 'DTEND:20261030T083000Z', 'SUMMARY:Lancement']], 'Marketing'),
    });
    expect(unzip(zip).map((f) => f.name)).toHaveLength(2);
    const evs = eventsFromZip(zip, { ...WINDOW, me: [ME] });
    expect(evs.map((e) => [e.title, e.calendar, e.calendarId])).toEqual([
      ['Lancement', 'Marketing', 'c_abc123@group.calendar.google.com'],
      ['Perso', 'Stella Augusto', ME],
    ]);
    expect(evs[1].color).toBe('#2383E2');
    expect(calendarIdFromFile('Jours fériés en France_fr.french#holiday@group.v.calendar.google.com.ics')).toBe('fr.french#holiday@group.v.calendar.google.com');
    expect(calendarIdFromFile('john_doe@gmail.com.ics', ['john_doe@gmail.com'])).toBe('john_doe@gmail.com');
  });

  it('lien « nouvel événement » pré-rempli', () => {
    const u = new URL(templateUrl({ title: 'Quête : brief', description: 'Créé par QuestFlow', start: '2026-10-30T09:00:00.000Z', end: '2026-10-30T10:30:00.000Z' }));
    expect(u.origin + u.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(Object.fromEntries([...u.searchParams].filter(([k]) => k !== 'ctz'))).toEqual({ action: 'TEMPLATE', text: 'Quête : brief', dates: '20261030T090000Z/20261030T103000Z', details: 'Créé par QuestFlow' });
    expect(assistUrl('delete', { start: '2026-10-30T09:00:00.000Z' }, 'ZWlk')).toBe('https://calendar.google.com/calendar/u/0/r/eventedit/ZWlk');
  });
});

describe('Google Agenda (pages semaine, secours)', () => {
  const ref = new Date(2026, 10, 6, 8);
  const local = (iso) => { const d = new Date(iso); return [d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]; };
  it('texte français : heure, titre, date', () => {
    const e = parseChipText({ sr: '10:00 à 11:30, Point créa, Stella Augusto, Accepté, Studio, 6 novembre 2026', visible: 'Point créa\n10:00 – 11:30' }, ref);
    expect(e.title).toBe('Point créa');
    expect([local(e.start), local(e.end), e.allDay]).toEqual([[11, 6, 10, 0], [11, 6, 11, 30], false]);
  });
  it('texte anglais avec am/pm et journée entière', () => {
    const e = parseChipText({ sr: '2pm to 3:15pm, Budget review, Accepted, No location, November 9, 2026', visible: '' }, ref);
    expect([e.title, local(e.start), local(e.end)]).toEqual(['Budget review', [11, 9, 14, 0], [11, 9, 15, 15]]);
    const a = parseChipText({ sr: 'Toute la journée, Shooting produit, 10 novembre 2026', visible: 'Shooting produit' }, ref);
    expect([a.title, a.allDay, local(a.start)]).toEqual(['Shooting produit', true, [11, 10, 0, 0]]);
  });
  it('identifiant Google décodé, doublons retirés, hors période ignoré', () => {
    const eid = Buffer.from('abc123_20261106T090000Z stella.augusto@innerskin.fr').toString('base64').replace(/=+$/, '');
    const chips = [
      { eid, sr: '10:00 à 11:00, Daily, 6 novembre 2026', visible: 'Daily' },
      { eid, sr: '10:00 à 11:00, Daily, 6 novembre 2026', visible: 'Daily' },
      { eid: 'eHl6IHg=', sr: '10:00 à 11:00, Vieux, 6 janvier 2026', visible: 'Vieux' },
    ];
    const evs = eventsFromChips(chips, { from: new Date(2026, 10, 1), to: new Date(2026, 11, 31) });
    expect(evs.map((e) => [e.title, e.eventId, e.calendarId, e.recurring])).toEqual([['Daily', 'abc123_20261106T090000Z', 'stella.augusto@innerskin.fr', true]]);
  });
  it('journal : la forme du texte, sans son contenu', () => {
    expect(textShape('10:00 à 11:00, Rendez-vous secret, 6 novembre 2026')).toBe('10:00 à 11:00, x x, 6 novembre 2026');
  });
});

describe('mises à jour', () => {
  it('compare les versions', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });
});
