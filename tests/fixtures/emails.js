// Jeu de mails réalistes pour vérifier que l'extracteur trouve LES vraies missions
// et ignore signatures, pieds de page, citations, newsletters, notifications…
//
// expect.tasks : liste de { title (regex ou chaîne exacte), due?, priority?, subtasks? }
// expect.none  : aucune tâche attendue

const SIG_JEAN = `
Cordialement,

Jean Dupont
Head of Growth | Innerskin
+33 6 12 34 56 78
jean.dupont@innerskin.fr
www.innerskin.fr`;

const DISCLAIMER_FR = `
Ce message et toutes les pièces jointes sont confidentiels et établis à l'intention exclusive de ses destinataires. Toute utilisation ou diffusion non autorisée est interdite. Si vous avez reçu ce message par erreur, merci de le détruire et d'en avertir immédiatement l'expéditeur.
Pensez à l'environnement avant d'imprimer ce mail.`;

const DISCLAIMER_EN = `
CONFIDENTIALITY NOTICE: This email and any attachments are intended solely for the use of the addressee. If you have received this email in error, please notify the sender immediately and delete it from your system. Please consider the environment before printing this email.`;

export const EMAILS = [
  {
    name: "exemple de l'utilisatrice : ajoute des ads sur 3 plateformes",
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'Ads', text: `Salut Stella,\n\nAjoute des nouvelles ads sur Facebook, Instagram et TikTok stp.\n\nMerci !${SIG_JEAN}` },
    expect: { tasks: [{ title: 'Ajouter des nouvelles ads sur Facebook, Instagram et TikTok', subtasks: ['Facebook', 'Instagram', 'TikTok'], tags: ['ads'] }] },
  },
  {
    name: 'signature riche seule : rien',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'Re: point', text: `Ok parfait, merci pour ton retour !${SIG_JEAN}\nPrenez rendez-vous avec moi : https://calendly.com/jean` },
    expect: { none: true },
  },
  {
    name: 'disclaimer FR avec impératifs (merci de le détruire, pensez à…) : ignoré',
    msg: { from: { name: 'Claire Martin', email: 'claire@agence-lumiere.fr' }, subject: 'Visuels', text: `Bonjour Stella,\n\nPeux-tu valider les visuels de la campagne Noël avant vendredi ?\n\nBien à toi,\nClaire\n${DISCLAIMER_FR}` },
    expect: { tasks: [{ title: 'Valider les visuels de la campagne Noël', due: '2026-10-30', priority: 3 }] },
  },
  {
    name: 'disclaimer EN (please notify the sender, delete…) : ignoré',
    msg: { from: { name: 'John Smith', email: 'john@acme.com' }, subject: 'Q3 deck', text: `Hi Stella,\n\nCould you please review the Q3 deck by Friday?\n\nThanks,\nJohn Smith\nMarketing Director\nAcme Inc.\n${DISCLAIMER_EN}` },
    expect: { tasks: [{ title: 'Review the Q3 deck', due: '2026-10-30' }] },
  },
  {
    name: 'réponse avec citation : la demande citée ne compte pas',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'Re: devis', text: `Super, c'est noté merci !\n\nLe mar. 27 oct. 2026 à 10:12, Stella Augusto <stella.augusto@innerskin.fr> a écrit :\n> Peux-tu m'envoyer le devis ?\n> Merci` },
    expect: { none: true },
  },
  {
    name: 'réponse avec en-tête Gmail sur 2 lignes',
    msg: { from: { name: 'Paul', email: 'paul@innerskin.fr' }, subject: 'Re: landing', text: `Oui go, et peux-tu aussi corriger le prix sur la landing page ?\n\nLe mer. 28 oct. 2026 à 09:01, Stella Augusto <\nstella.augusto@innerskin.fr> a écrit :\n\n> On lance la landing demain ?\n> Ajoute le bandeau promo.` },
    expect: { tasks: [{ title: 'Corriger le prix sur la landing page' }] },
  },
  {
    name: 'Outlook : De/Envoyé/Objet',
    msg: { from: { name: 'Sophie', email: 'sophie@client.com' }, subject: 'RE: Contrat', text: `Merci de me renvoyer le contrat signé d'ici demain.\n\nSophie\n\n________________________________\nDe : Stella Augusto <stella.augusto@innerskin.fr>\nEnvoyé : mardi 27 octobre 2026 18:00\nÀ : Sophie <sophie@client.com>\nObjet : Contrat\n\nVoici le contrat, envoie-moi tes remarques.` },
    expect: { tasks: [{ title: 'Renvoyer le contrat signé à Sophie', due: '2026-10-29' }] },
  },
  {
    name: 'newsletter avec List-Unsubscribe : ignorée',
    msg: { from: { name: 'Shopify', email: 'news@shopify.com' }, subject: 'Découvrez les nouveautés', headers: { 'List-Unsubscribe': '<mailto:unsub@shopify.com>' }, text: `Découvrez nos nouveautés ! Profitez de -50% sur les thèmes. Inscrivez-vous au webinar.\n\nSe désinscrire` },
    expect: { none: true, skipped: true },
  },
  {
    name: "newsletter sans en-tête mais avec liens + désinscription",
    msg: { from: { name: 'Growth Weekly', email: 'hello@growthweekly.io' }, subject: 'Les 5 hooks qui convertissent', text: `Teste ces 5 hooks dès aujourd'hui : https://a.io/1 https://a.io/2 https://a.io/3 https://a.io/4\nPartage cette newsletter à ton équipe.\n\nSe désinscrire | Gérer mes préférences` },
    expect: { none: true, skipped: true },
  },
  {
    name: 'expéditeur no-reply : ignoré',
    msg: { from: { name: 'Meta for Business', email: 'noreply@business.facebook.com' }, subject: 'Votre publicité a été approuvée', text: 'Votre publicité "Noël 2026" a été approuvée. Consultez les résultats dans le Gestionnaire de publicités.' },
    expect: { none: true, skipped: true },
  },
  {
    name: "invitation d'agenda : ignorée",
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'Invitation: Point ads @ jeu. 29 oct. 2026 14:00 - 15:00 (CET)', text: 'Point ads\nJoindre avec Google Meet\nRépondre : Oui / Non / Peut-être' },
    expect: { none: true, skipped: true },
  },
  {
    name: 'réponse automatique : ignorée',
    msg: { from: { name: 'Marc', email: 'marc@client.com' }, subject: 'Réponse automatique : Devis', text: "Je suis absent jusqu'au 3 novembre. Pour toute urgence, contactez Julie." },
    expect: { none: true, skipped: true },
  },
  {
    name: 'question de dispo -> simple quête de réponse',
    msg: { from: { name: 'Léa', email: 'lea@innerskin.fr' }, subject: 'café', text: 'Hello ! Tu es dispo demain pour un café ?\n\nLéa' },
    expect: { tasks: [{ title: 'Proposer un créneau à Léa : café', maxDifficulty: 1 }] },
  },
  {
    name: 'prochaines étapes en liste : 3 tâches',
    msg: { from: { name: 'Julie Bernard', email: 'julie@innerskin.fr' }, subject: 'Lancement campagne', text: `Hello Stella,\n\nSuite à notre réunion, voici les prochaines étapes :\n- Envoyer le brief à l'agence\n- Valider les visuels avant jeudi\n- Mettre à jour le reporting\n\nBonne journée,\nJulie` },
    expect: { tasks: [{ title: "Envoyer le brief à l'agence" }, { title: 'Valider les visuels', due: '2026-10-29' }, { title: 'Mettre à jour le reporting' }] },
  },
  {
    name: 'urgent + heure',
    msg: { from: { name: 'Paul', email: 'paul@innerskin.fr' }, subject: 'URGENT prix', text: 'URGENT : peux-tu corriger le prix sur la landing page avant 15h ?\n\nPaul' },
    expect: { tasks: [{ title: 'Corriger le prix sur la landing page', due: '2026-10-28T15:00', priority: 1 }] },
  },
  {
    name: 'il faudrait que tu + subjonctif, ce soir',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'récap', text: "Il faudrait que tu envoies le récap au client ce soir.\n\nMerci,\nJean" },
    expect: { tasks: [{ title: 'Envoyer le récap au client', due: '2026-10-28T20:00', priority: 2 }] },
  },
  {
    name: 'FYI seulement',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'dashboard', text: "Pour info, j'ai mis à jour le dashboard des ventes. Bonne journée !" },
    expect: { none: true },
  },
  {
    name: "l'expéditeur s'engage lui-même",
    msg: { from: { name: 'Marc', email: 'marc@innerskin.fr' }, subject: 'fournisseur', text: 'Je m\'occupe de relancer le fournisseur demain. Je te tiens au courant.' },
    expect: { none: true },
  },
  {
    name: 'merci de bien vouloir + ci-joint',
    msg: { from: { name: 'Comptabilité', email: 'compta@innerskin.fr' }, subject: 'Devis Studio K', text: 'Bonjour,\n\nMerci de bien vouloir valider le devis ci-joint.\n\nCordialement,\nLe service comptable' },
    expect: { tasks: [{ title: 'Valider le devis ci-joint', tags: ['finance'] }] },
  },
  {
    name: "n'oublie pas de + demain matin",
    msg: { from: { name: 'Julie', email: 'julie@innerskin.fr' }, subject: 'Marc', text: "N'oublie pas d'appeler Marc demain matin !" },
    expect: { tasks: [{ title: 'Appeler Marc', due: '2026-10-29T10:00' }] },
  },
  {
    name: "m'envoyer -> à <prénom>",
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'chiffres', text: 'Peux-tu m\'envoyer les chiffres de septembre ?' },
    expect: { tasks: [{ title: 'Envoyer les chiffres de septembre à Jean' }] },
  },
  {
    name: 'pur remerciement',
    msg: { from: { name: 'Léa', email: 'lea@innerskin.fr' }, subject: 'Merci', text: "Merci beaucoup pour ton aide hier, c'était top !\n\nLéa" },
    expect: { none: true },
  },
  {
    name: 'Envoyé de mon iPhone',
    msg: { from: { name: 'Paul', email: 'paul@innerskin.fr' }, subject: 'compte pub', text: 'Tu peux checker le compte pub stp ?\n\nEnvoyé de mon iPhone' },
    expect: { tasks: [{ title: 'Checker le compte pub' }] },
  },
  {
    name: 'mail long avec contexte, une demande au milieu, signature avec adresse',
    msg: {
      from: { name: 'Julie Bernard', email: 'julie@innerskin.fr' }, subject: 'Résultats campagne',
      text: `Bonjour Stella,\n\nJ'espère que tu vas bien.\n\nLa campagne de rentrée a super bien marché, on a dépassé les objectifs de 20 %. Le client est ravi.\nPourrais-tu préparer une présentation des résultats de la campagne pour la réunion de lundi ?\n\nMerci d'avance,\n\nJulie Bernard\nResponsable marketing\n12 rue de la Paix, 75002 Paris\nTél : 01 23 45 67 89`,
    },
    expect: { tasks: [{ title: 'Préparer une présentation des résultats de la campagne pour la réunion de lundi', due: '2026-11-02', minDifficulty: 3 }] },
  },
  {
    name: "transfert : « gère ça » -> sujet du message d'origine",
    msg: {
      from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'Fwd: Demande de devis shooting',
      text: `Peux-tu gérer ça stp ?\n\n---------- Forwarded message ---------\nDe : Client <contact@client.fr>\nDate: mar. 27 oct. 2026\nSubject: Demande de devis shooting\nTo: Jean <jean.dupont@innerskin.fr>\n\nBonjour, pouvez-vous nous envoyer un devis pour un shooting ?`,
    },
    expect: { tasks: [{ title: 'Gérer : Demande de devis shooting' }] },
  },
  {
    name: 'merci de ton retour (pas une demande)',
    msg: { from: { name: 'Marc', email: 'marc@client.com' }, subject: 'Re: offre', text: "Merci de ton retour rapide. On en reparle la semaine prochaine.\n\nMarc" },
    expect: { none: true },
  },
  {
    name: 'pas urgent -> priorité basse, facile',
    msg: { from: { name: 'Léa', email: 'lea@innerskin.fr' }, subject: 'petite chose', text: 'Tu peux regarder le petit bug sur le formulaire quand tu as 5 min ? Pas urgent.' },
    expect: { tasks: [{ title: 'Regarder le petit bug sur le formulaire', priority: 4, maxDifficulty: 2 }] },
  },
  {
    name: 'EN : deux actions dans la même phrase',
    msg: { from: { name: 'John Smith', email: 'john@acme.com' }, subject: 'invoice', text: 'Hi Stella,\n\nCould you send me the invoice and update the CRM?\n\nBest,\nJohn' },
    expect: { tasks: [{ title: 'Send the invoice to John' }, { title: 'Update the CRM' }] },
  },
  {
    name: 'FR : deux actions (et + infinitif)',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'client', text: 'Peux-tu envoyer le devis et appeler le client demain ?' },
    expect: { tasks: [{ title: 'Envoyer le devis' }, { title: 'Appeler le client' }] },
  },
  {
    name: 'signature avec impératif marketing',
    msg: { from: { name: 'Nina', email: 'nina@studio-k.fr' }, subject: 'shooting', text: `Hello,\n\nPeux-tu me confirmer la date du shooting ?\n\nBelle journée,\nNina\nStudio K — Photographie\nSuivez-nous sur Instagram @studiok\nwww.studio-k.fr` },
    expect: { tasks: [{ title: 'Confirmer la date du shooting à Nina' }] },
  },
  {
    name: "rappel d'agenda Google",
    msg: { from: { name: 'Google Agenda', email: 'calendar-notification@google.com' }, subject: 'Notification : Point hebdo @ jeu. 29 oct. 2026 10:00', text: 'Point hebdo\njeudi 29 oct. 2026 10:00 – 11:00' },
    expect: { none: true, skipped: true },
  },
  {
    name: "mail envoyé par l'utilisatrice elle-même",
    msg: { from: { name: 'Stella Augusto', email: 'stella.augusto@innerskin.fr' }, subject: 'brief', text: 'Peux-tu envoyer le brief ?' },
    expect: { none: true, skipped: true },
  },
  {
    name: 'demande adressée à quelqu’un d’autre (vocatif)',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'team', text: "Paul, peux-tu mettre à jour le budget ?\nStella, peux-tu relancer l'agence vidéo ?" },
    expect: { tasks: [{ title: "Relancer l'agence vidéo" }] },
  },
  {
    name: 'liste à faire sans verbes sous un titre « À faire : »',
    msg: { from: { name: 'Julie', email: 'julie@innerskin.fr' }, subject: 'todo semaine', text: 'À faire cette semaine :\n- Devis Durand\n- Facture Studio K\n\nJulie' },
    expect: { tasks: [{ title: 'Devis Durand' }, { title: 'Facture Studio K' }] },
  },
  {
    name: 'demande + énumération sous forme de liste',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'créas', text: "Peux-tu décliner la nouvelle créa sur les formats suivants :\n- Story 9:16\n- Carré 1:1\n- Paysage 16:9\n\nMerci !" },
    expect: { tasks: [{ title: 'Décliner la nouvelle créa sur les formats suivants', subtasks: ['Story 9:16', 'Carré 1:1', 'Paysage 16:9'] }] },
  },
  {
    name: "j'aurais besoin des… -> Fournir … à <prénom>",
    msg: { from: { name: 'Marc', email: 'marc@innerskin.fr' }, subject: 'stats', text: "J'aurais besoin des stats TikTok du mois pour jeudi." },
    expect: { tasks: [{ title: 'Fournir les stats TikTok du mois à Marc', due: '2026-10-29' }] },
  },
  {
    name: 'mail HTML Gmail avec citation et signature balisées',
    msg: {
      from: { name: 'Claire', email: 'claire@agence-lumiere.fr' }, subject: 'Re: bannières',
      html: `<div dir="ltr">Coucou,<div><br></div><div>Tu pourrais m'envoyer les bannières en HD d'ici demain midi ?</div><div><br></div><div class="gmail_signature">Claire Dubois<br>Directrice artistique<br>06 11 22 33 44</div></div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">Le mar. 27 oct. 2026 à 17:02, Stella a écrit :<br></div><blockquote class="gmail_quote">Ajoute le logo en bas à droite.</blockquote></div>`,
    },
    expect: { tasks: [{ title: 'Envoyer les bannières en HD à Claire', due: '2026-10-29T12:00' }] },
  },
  {
    name: 'phrase de clôture « Bonne fin de journée » + PS avec une demande',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'point', text: "Super réunion ce matin.\n\nBonne fin de journée,\nJean\n\nPS : pense à mettre le compte rendu sur le Drive." },
    expect: { tasks: [{ title: 'Mettre le compte rendu sur le Drive' }] },
  },
  {
    name: 'veuillez trouver ci-joint (FYI)',
    msg: { from: { name: 'Sophie', email: 'sophie@client.com' }, subject: 'Facture', text: 'Bonjour,\n\nVeuillez trouver ci-joint la facture du mois d\'octobre.\n\nCordialement,\nSophie Morel' },
    expect: { none: true },
  },
  {
    name: 'impératif direct + fin de semaine',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'brief', text: "Rédige le brief créatif pour la campagne de Noël d'ici la fin de la semaine." },
    expect: { tasks: [{ title: 'Rédiger le brief créatif pour la campagne de Noël', due: '2026-10-30', minDifficulty: 3 }] },
  },
  {
    name: 'occupe-toi de -> S\'occuper de',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'shooting', text: "Occupe-toi de la réservation du studio pour le shooting." },
    expect: { tasks: [{ title: "S'occuper de la réservation du studio pour le shooting" }] },
  },
  {
    name: 'mail purement informatif avec chiffres et dates',
    msg: { from: { name: 'Marc', email: 'marc@innerskin.fr' }, subject: 'résultats', text: "Le ROAS est passé à 3,2 cette semaine. La campagne se termine le 15/11. On fera le bilan à ce moment-là." },
    expect: { none: true },
  },
  {
    name: 'notification Asana : assignation',
    msg: { from: { name: 'Asana', email: 'no-reply@asana.com' }, subject: 'Jean Dupont assigned you: Mettre à jour la fiche produit Sérum', text: 'Jean Dupont assigned a task to you. Mettre à jour la fiche produit Sérum. Due Nov 4.' },
    expect: { tasks: [{ title: /fiche produit S[ée]rum/ }] },
  },
  {
    name: 'Merci ! (formule) suivi seulement de la signature',
    msg: { from: { name: 'Léa', email: 'lea@innerskin.fr' }, subject: 'Re: ok', text: 'Top, merci !\n\nLéa Martin\nChargée de communication\nlea@innerskin.fr' },
    expect: { none: true },
  },
  {
    name: 'EN : let me know / looking forward (pas de mission)',
    msg: { from: { name: 'John', email: 'john@acme.com' }, subject: 'catch up', text: "Hi Stella, great to meet you yesterday. Let me know if you have any questions. Looking forward to working together!\n\nCheers,\nJohn" },
    expect: { none: true },
  },
  {
    name: 'demande avec « est-ce que tu pourrais » + date explicite',
    msg: { from: { name: 'Sophie', email: 'sophie@client.com' }, subject: 'planning', text: 'Est-ce que tu pourrais mettre à jour le planning de diffusion pour le 12 novembre ?' },
    expect: { tasks: [{ title: 'Mettre à jour le planning de diffusion', due: '2026-11-12' }] },
  },
  // --- Cas inspirés de vrais mails (contenus inventés) ---------------------------
  {
    name: "en copie, mail adressé à quelqu'un d'autre (« Hello Marie, »)",
    msg: { from: { name: 'Adèle', email: 'adele@innerskin.fr' }, to: 'Marie <marie@innerskin.fr>', cc: 'Stella <stella.augusto@innerskin.fr>', subject: 'Fichiers imprimeur', text: "Hello Marie,\n\nPeux-tu préparer les fichiers pour l'imprimeur avant jeudi ?\n\nMerci,\nAdèle" },
    expect: { none: true },
  },
  {
    name: 'en copie, mail à tout le monde : la demande compte',
    msg: { from: { name: 'Julie', email: 'julie@innerskin.fr' }, to: 'Team <team@innerskin.fr>', cc: 'stella.augusto@innerskin.fr', subject: 'Planning', text: "Bonjour à tous,\n\nMerci de remplir le fichier de congés avant vendredi.\n\nJulie" },
    expect: { tasks: [{ title: 'Remplir le fichier de congés', due: '2026-10-30' }] },
  },
  {
    name: 'blocs de signature sans « -- » au milieu du mail',
    msg: { from: { name: 'Camille Roux', email: 'camille@innerskin.fr' }, to: 'stella.augusto@innerskin.fr', subject: 'Tests signatures', text: "Test signatures :\n\nCamille Roux\nCheffe de projet marketing\n06 81 28 53 35\ncamille@innerskin.fr\ninnerskin.com\n\nNoé Petit\nDirecteur artistique\n06 11 22 33 44\nnoe@innerskin.fr" },
    expect: { none: true },
  },
  {
    name: 'liste numérotée avec élément coupé sur deux lignes',
    msg: { from: { name: 'Adèle', email: 'adele@innerskin.fr' }, to: 'stella.augusto@innerskin.fr', subject: 'Besoins S45', text: "Bonjour Stella,\n\nVoici les besoins :\n1. Visuels Black Friday d'ici vendredi\n2. Bannière site (possible de décaler en fonction de la\n   charge de travail)\n\nMerci" },
    expect: { tasks: [{ title: 'Visuels Black Friday', due: '2026-10-30' }, { title: 'Bannière site' }] },
  },
  {
    name: 'EN : « please do let us know if you have any questions » (rapport FYI)',
    msg: { from: { name: 'Xena', email: 'xena@pr-agency.com' }, to: 'stella.augusto@innerskin.fr, joe@innerskin.fr', subject: 'UK Launch Wrap Report', text: "Hi all,\n\nPlease find attached the wrap report for the UK launch. Coverage reached 2.3M people.\n\nPlease do let us know if you have any questions.\n\nBest,\nXena" },
    expect: { none: true },
  },
  {
    name: 'demande d’avis implicite',
    msg: { from: { name: 'Joe', email: 'joe@innerskin.fr' }, to: 'lara@innerskin.fr, stella.augusto@innerskin.fr', subject: 'Plateforme de marque', text: "Hello les filles,\n\nJe voulais m'assurer que vous aviez bien vu la plateforme de marque envoyée par l'agence. Dites-moi ce que vous en pensez !\n\nJoe" },
    expect: { tasks: [{ title: 'Donner mon avis à Joe : Plateforme de marque' }] },
  },
  {
    name: 'question de disponibilité',
    msg: { from: { name: 'Victor', email: 'victor@agence.io' }, to: 'stella.augusto@innerskin.fr', subject: 'Réunion à décaler', text: "Bonjour Stella,\n\nNous aimerions décaler la réunion. Vous avez une dispo cette semaine pour faire un point ?\n\nVictor" },
    expect: { tasks: [{ title: 'Proposer un créneau à Victor : Réunion à décaler' }] },
  },
  {
    name: "besoin d'aide implicite (« là où j'aurais besoin de votre aide c'est sur… »)",
    msg: { from: { name: 'Marie', email: 'marie@innerskin.fr' }, to: 'stella.augusto@innerskin.fr, lara@innerskin.fr', subject: 'Déploiement DA', text: "Hello Stella et Lara,\n\nLe déploiement avance bien. Là où j'aurais besoin de votre aide c'est sur la partie texte de présentation des soins.\n\nMarie" },
    expect: { tasks: [{ title: 'Aider Marie sur la partie texte de présentation des soins' }] },
  },
  {
    name: 'transfert sans message : on lit le mail transféré',
    msg: { from: { name: 'Lara', email: 'lara@innerskin.fr' }, to: 'stella.augusto@innerskin.fr', subject: 'Fwd: Signatures de mail', text: "\n\n---------- Forwarded message ---------\nDe : Marie Girard <marie@innerskin.fr>\nDate: lun. 26 oct. 2026\nSubject: Signatures de mail\nTo: Lara <lara@innerskin.fr>\n\nHello Lara,\n\nVoici mes propositions de signatures. Je vous laisse faire vos retours et me dire ce que vous en pensez.\n\nMarie" },
    expect: { tasks: [{ title: 'Donner mon avis à Marie : Signatures de mail' }] },
  },
  {
    name: 'proposition de partenariat (question de décision)',
    msg: { from: { name: 'Sarah', email: 'sarah.wellness@gmail.com' }, to: 'collaborations@innerskin.fr', subject: 'Collaboration événement', text: "Bonjour,\n\nNous organisons un événement bien-être en janvier. Seriez-vous ouverts à l'idée d'un partenariat pour cette journée ?\n\nBelle journée,\nSarah" },
    expect: { tasks: [{ title: 'Répondre à Sarah : Collaboration événement' }] },
  },
  {
    name: 'réaction Gmail (emoji) : ignorée',
    msg: { from: { name: 'Jean Dupont', email: 'jean.dupont@innerskin.fr' }, subject: 'Re: photos', text: "♥️\nJean Dupont a réagi depuis Gmail <https://www.google.com/gmail/about/>" },
    expect: { none: true, skipped: true },
  },
  {
    name: 'adresse avec/sans point = moi',
    msg: { from: { name: 'Stella Augusto', email: 'stellaaugusto@innerskin.fr' }, subject: 'Re: brief', text: 'Peux-tu envoyer le brief ?' },
    expect: { none: true, skipped: true },
  },
];


// Messages de chat (Google Chat)
export const CHATS = [
  { name: 'chat : mention + ce soir', msg: { source: 'chat', from: { name: 'Paul' }, text: '@Stella tu peux mettre à jour le budget ads avant ce soir ?' }, expect: { tasks: [{ title: 'Mettre à jour le budget ads', due: '2026-10-28T20:00' }] } },
  { name: 'chat : ok merci', msg: { source: 'chat', from: { name: 'Paul' }, text: 'ok merci 👍' }, expect: { none: true } },
  { name: 'chat : mention de quelqu’un d’autre', msg: { source: 'chat', from: { name: 'Paul' }, text: '@Marc tu peux envoyer le fichier ?' }, expect: { none: true } },
  { name: 'chat : impératif', msg: { source: 'chat', from: { name: 'Julie' }, text: 'Envoie-moi le lien du Drive stp' }, expect: { tasks: [{ title: 'Envoyer le lien du Drive à Julie' }] } },
  { name: 'chat : constat', msg: { source: 'chat', from: { name: 'Julie' }, text: "J'ai envoyé le fichier au client, c'est bon." }, expect: { none: true } },
];