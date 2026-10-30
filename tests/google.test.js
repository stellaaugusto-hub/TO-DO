import { describe, it, expect } from 'vitest';
import { parseRaw, mailQuery } from '../src/main/google/gmail.js';
import { cleanChatText } from '../src/main/google/chat.js';
import { mapEvent, isDeclined } from '../src/main/google/calendar.js';
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

describe('Gmail', () => {
  it('requête de recherche', () => {
    expect(mailQuery(7)).toBe('in:inbox newer_than:7d -category:promotions -category:social -category:forums -from:me');
  });
  it('message brut -> tâche', async () => {
    const msg = await parseRaw(Buffer.from(RAW).toString('base64url'), { id: 'abc', threadId: 't1', labelIds: ['INBOX'] });
    expect(msg.subject).toBe('Créas Noël');
    expect(msg.from).toEqual({ name: 'Jean Dupont', email: 'jean.dupont@exemple.fr' });
    expect(msg.to).toContain('stella.augusto@innerskin.fr');
    expect(msg.url).toBe('https://mail.google.com/mail/u/0/#all/t1');
    const { tasks } = extractTasks(msg, { now: new Date(2026, 9, 28, 10), userEmail: 'stella.augusto@innerskin.fr', userName: 'Stella' });
    expect(tasks.map((t) => t.title)).toEqual(['Décliner la créa de Noël sur Facebook, Instagram et TikTok']);
    expect(tasks[0].subtasks.map((s) => s.title)).toEqual(['Facebook', 'Instagram', 'TikTok']);
    expect(tasks[0].sourceMeta.url).toBe('https://mail.google.com/mail/u/0/#all/t1');
  });
});

describe('Google Chat', () => {
  const me = 'users/111';
  it('retire ma mention', () => {
    const text = '@Stella Augusto tu peux mettre à jour le budget ads avant ce soir ?';
    const msg = { text, annotations: [{ type: 'USER_MENTION', startIndex: 0, length: 15, userMention: { user: { name: me } } }] };
    expect(cleanChatText(msg, me)).toBe('tu peux mettre à jour le budget ads avant ce soir ?');
  });
  it("garde la trace d'une mention d'une autre personne", () => {
    const text = '@Paul Martin peux-tu envoyer le fichier ?';
    const msg = { text, annotations: [{ type: 'USER_MENTION', startIndex: 0, length: 12, userMention: { user: { name: 'users/222' } } }] };
    const cleaned = cleanChatText(msg, me);
    expect(cleaned).toBe('@autre peux-tu envoyer le fichier ?');
    expect(extractTasks({ source: 'chat', text: cleaned, from: { name: 'Julie' } }, { userName: 'Stella' }).tasks).toEqual([]);
  });
});

describe('Google Agenda', () => {
  const cal = { id: 'primary', summary: 'Travail', backgroundColor: '#039be5', accessRole: 'owner' };
  it('événement horaire', () => {
    const e = mapEvent({ id: 'x', summary: 'Point ads', start: { dateTime: '2026-10-30T11:00:00+01:00' }, end: { dateTime: '2026-10-30T11:45:00+01:00' }, hangoutLink: 'https://meet.google.com/abc' }, cal);
    expect(e).toMatchObject({ id: 'primary::x', title: 'Point ads', allDay: false, editable: true, meet: 'https://meet.google.com/abc', color: '#039be5' });
    expect(new Date(e.end) - new Date(e.start)).toBe(45 * 60e3);
  });
  it('journée entière', () => {
    const e = mapEvent({ id: 'y', summary: 'Salon', start: { date: '2026-11-02' }, end: { date: '2026-11-03' } }, { ...cal, accessRole: 'reader' });
    expect(e.allDay).toBe(true);
    expect(e.editable).toBe(false);
  });
  it('invitation refusée ignorée', () => {
    expect(isDeclined({ attendees: [{ self: true, responseStatus: 'declined' }] })).toBe(true);
    expect(isDeclined({ attendees: [{ self: true, responseStatus: 'accepted' }] })).toBe(false);
  });
});

describe('mises à jour', () => {
  it('compare les versions', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });
});
