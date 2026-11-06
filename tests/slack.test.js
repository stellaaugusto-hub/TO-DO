import { describe, it, expect } from 'vitest';
import { parseSlackEmail, slackMessages, isSlackNotification, workspaceTag } from '../src/shared/slack.js';
import { extractTasks } from '../src/shared/extract.js';

// Structure exacte des notifications Slack par mail (contenus inventés)
const FOOT = `* * *

Vous pouvez différer ces notifications pendant
une heure : https://agence.slack.com/unsub/x-notify-mute-1h

Vous pouvez aussi désactiver les notifications par e-mail : https://agence.slack.com/unsub/x-notify.

Pour accéder à des préférences plus détaillées, rendez-vous sur la page de votre compte : https://agence.slack.com/account.`;

const MENTION = `Bonjour Stella,

Vous avez une nouvelle mention provenant de l'espace de travail Innerskin agence (https://innerskinagence.slack.com/team).

---

#crea-innerskin-x-agence
Afficher dans les archives : https://innerskinagence.slack.com/archives/C01/p1

Élise H (11 h 05, le 5 novembre)

Hello @Stella ! Voici les 3 nouvelles vidéos UGC pour la campagne Hydra X.

Élise H (11 h 06, le 5 novembre)

Tu peux nous faire tes retours d'ici jeudi ?

Marie (11 h 20, le 5 novembre)

@Boris Valenzuela tu peux valider le budget de novembre ?

Stella (11 h 30, le 5 novembre)

Je regarde ça !

${FOOT}`;

const DM = `Bonjour Stella,

Vous avez un nouveau message direct provenant de l'espace de travail Innerskin x Roads (https://innerskinxroads.slack.com/team).

---

@Adrien O
Afficher dans les archives : https://innerskinxroads.slack.com/archives/D01/p2

Adrien O (9 h 12, le 6 novembre)

Peux-tu nous envoyer les visuels produits de Noël en HD ?

${FOOT}`;

const now = new Date(2026, 10, 6, 12);
const mail = (text, subject, id) => ({ id, source: 'mail', from: { name: 'Slack', email: 'notification@slack.com' }, subject, text, date: now.toISOString(), url: 'https://mail.google.com/mail/u/0/#all/x' });

describe('Slack (notifications par mail)', () => {
  it('reconnaît une notification Slack (et pas un code de connexion)', () => {
    expect(isSlackNotification(mail(MENTION, 'Élise H vous a mentionné(e)', 'a'))).toBe(true);
    expect(isSlackNotification(mail('Votre code de sécurité se trouve ci-dessous. 599780', 'Votre code de sécurité pour Slack', 'b'))).toBe(false);
    expect(isSlackNotification({ ...mail(MENTION, 'x', 'c'), from: { email: 'pirate@slack.com.evil.fr' } })).toBe(false);
  });

  it('découpe canal, auteurs, heures et textes, sans le pied de page', () => {
    const { workspace, messages } = parseSlackEmail(MENTION, { now });
    expect(workspace).toBe('Innerskin agence');
    expect(messages.map((m) => [m.channel, m.author, m.date.getHours(), m.date.getMinutes(), m.text])).toEqual([
      ['#crea-innerskin-x-agence', 'Élise H', 11, 5, 'Hello @Stella ! Voici les 3 nouvelles vidéos UGC pour la campagne Hydra X.'],
      ['#crea-innerskin-x-agence', 'Élise H', 11, 6, "Tu peux nous faire tes retours d'ici jeudi ?"],
      ['#crea-innerskin-x-agence', 'Marie', 11, 20, '@Boris Valenzuela tu peux valider le budget de novembre ?'],
      ['#crea-innerskin-x-agence', 'Stella', 11, 30, 'Je regarde ça !'],
    ]);
    expect(messages[0].url).toBe('https://innerskinagence.slack.com/archives/C01/p1');
  });

  it("étiquette de l'agence", () => {
    expect(workspaceTag('Innerskin agence')).toBe('agence');
    expect(workspaceTag('Innerskin x Roads')).toBe('roads');
    expect(workspaceTag('Innerskin <> datashake')).toBe('datashake');
  });

  it('demandes de l’agence -> quêtes (pas celles pour un autre, pas mes messages), tag agence + ads', () => {
    const msgs = [...slackMessages(mail(MENTION, 'Élise H vous a mentionné(e) dans #crea-innerskin-x-agence', 'm1'), { meName: 'Stella Augusto', now }), ...slackMessages(mail(DM, 'Adrien O vous a envoyé un message', 'm2'), { meName: 'Stella Augusto', now })];
    expect(msgs.filter((m) => m.fromSelf).map((m) => m.text)).toEqual(['Je regarde ça !']);
    const tasks = msgs.flatMap((m) => extractTasks(m, { userEmail: 'stella.augusto@innerskin.fr', userName: 'Stella', now }).tasks.map((t) => ({ title: t.title, source: t.source, tags: t.tags, space: t.sourceMeta.space })));
    expect(tasks.map((t) => t.title)).toEqual(['Donner mon avis à Élise', 'Envoyer les visuels produits de Noël en HD à Adrien']);
    expect(tasks[0].source).toBe('slack');
    expect(tasks[0].tags).toEqual(expect.arrayContaining(['ads', 'agence']));
    expect(tasks[0].space).toBe('#crea-innerskin-x-agence · Innerskin agence');
    expect(tasks[1].tags).toContain('roads');
  });
});
