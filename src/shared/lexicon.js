// Vocabulaire utilisé par l'extracteur de tâches (FR + EN).
// Tout est comparé en minuscules et sans accents (voir text.js > fold).

import { fold } from './text.js';

// --- Verbes français du 1er groupe (-er) courants dans un contexte pro ----
const FR_ER = `
accepter acheter activer assurer bosser boucler caler coordonner occuper charger renseigner relayer solliciter recaler rebooker reprendre rafraichir recontacter cibler budgetiser scaler iterer
accepter actualiser adapter ajouter ajuster aligner analyser animer annoncer annuler appeler
apporter approuver archiver arranger arreter assister augmenter automatiser avancer booker brainstormer briefer
budgeter calculer caler changer charger checker chercher chiffrer classer cliquer coder collecter commander
commenter communiquer comparer compiler completer compter confirmer configurer connecter consolider contacter
continuer contrôler controler corriger creer cadrer dupliquer debriefer debugger decaler decider declarer decliner
decouper dedoublonner deleguer demander demarrer deplacer deposer designer dessiner developper diffuser dispatcher
documenter donner doubler dresser echanger editer effectuer elaborer emailer encaisser enlever enregistrer
envoyer essayer estimer etudier evaluer exporter facturer filmer finaliser fixer formaliser former formuler gerer
gérer googler graphiquer harmoniser identifier illustrer imaginer implementer importer imprimer indiquer informer
installer integrer interviewer inviter jeter lancer livrer localiser manager maquetter marquer mentionner merger
mesurer migrer modifier monitorer monter motiver negocier nettoyer noter notifier numeroter optimiser organiser
paginer parametrer partager passer payer peaufiner penser photographier piloter placer planifier poster pousser
preciser preparer presenter prioriser proceder programmer projeter proposer prospecter publier quantifier
questionner rappeler rapprocher rassembler rattraper realiser recadrer recapituler recenser rechercher recommander
recruter rectifier rediger referencer reflechir regarder regler relancer remplacer remonter renommer renseigner
reorganiser reparer repasser repertorier repondre reporter reserver resumer retirer retoucher retravailler
retrouver reviser rajouter rechecker recopier redesigner refacturer reformuler relever relooker remercier
remanier renouveler reprogrammer resilier retourner sauvegarder unifier scanner scheduler scripter segmenter
selectionner shooter signaler signer simplifier simuler sonder souligner sourcer specifier stocker structurer
suggerer supprimer synchroniser synthetiser tagger telecharger telephoner terminer tester tirer tourner tracker
traiter transferer travailler trier trouver tweeter uploader utiliser valider verifier visualiser voter
`;

// --- 2e groupe (-ir, finir) -------------------------------------------------
const FR_IR2 = `
aboutir accomplir agir avertir batir choisir convertir definir enrichir etablir finir fournir garantir investir
rafraichir reflechir remplir reunir reussir saisir
`;

// --- Formes irrégulières : infinitif -> [impératif 2s, impératif 2p, subjonctif 2s, subjonctif 2p] ------
export const FR_IRREGULAR = {
  'faire': ['fais', 'faites', 'fasses', 'fassiez'],
  'refaire': ['refais', 'refaites', 'refasses', 'refassiez'],
  'defaire': ['defais', 'defaites', 'defasses', 'defassiez'],
  'mettre': ['mets', 'mettez', 'mettes', 'mettiez'],
  'remettre': ['remets', 'remettez', 'remettes', 'remettiez'],
  'transmettre': ['transmets', 'transmettez', 'transmettes', 'transmettiez'],
  'soumettre': ['soumets', 'soumettez', 'soumettes', 'soumettiez'],
  'permettre': ['permets', 'permettez', 'permettes', 'permettiez'],
  'prendre': ['prends', 'prenez', 'prennes', 'preniez'],
  'reprendre': ['reprends', 'reprenez', 'reprennes', 'repreniez'],
  'comprendre': ['comprends', 'comprenez', 'comprennes', 'compreniez'],
  'apprendre': ['apprends', 'apprenez', 'apprennes', 'appreniez'],
  'entreprendre': ['entreprends', 'entreprenez', 'entreprennes', 'entrepreniez'],
  'voir': ['vois', 'voyez', 'voies', 'voyiez'],
  'revoir': ['revois', 'revoyez', 'revoies', 'revoyiez'],
  'prevoir': ['prevois', 'prevoyez', 'prevoies', 'prevoyiez'],
  'ecrire': ['ecris', 'ecrivez', 'ecrives', 'ecriviez'],
  'reecrire': ['reecris', 'reecrivez', 'reecrives', 'reecriviez'],
  'decrire': ['decris', 'decrivez', 'decrives', 'decriviez'],
  'inscrire': ['inscris', 'inscrivez', 'inscrives', 'inscriviez'],
  'lire': ['lis', 'lisez', 'lises', 'lisiez'],
  'relire': ['relis', 'relisez', 'relises', 'relisiez'],
  'dire': ['dis', 'dites', 'dises', 'disiez'],
  'redire': ['redis', 'redites', 'redises', 'redisiez'],
  'envoyer': ['envoie', 'envoyez', 'envoies', 'envoyiez'],
  'renvoyer': ['renvoie', 'renvoyez', 'renvoies', 'renvoyiez'],
  'aller': ['va', 'allez', 'ailles', 'alliez'],
  'venir': ['viens', 'venez', 'viennes', 'veniez'],
  'revenir': ['reviens', 'revenez', 'reviennes', 'reveniez'],
  'tenir': ['tiens', 'tenez', 'tiennes', 'teniez'],
  'obtenir': ['obtiens', 'obtenez', 'obtiennes', 'obteniez'],
  'maintenir': ['maintiens', 'maintenez', 'maintiennes', 'mainteniez'],
  'prevenir': ['previens', 'prevenez', 'previennes', 'preveniez'],
  'ouvrir': ['ouvre', 'ouvrez', 'ouvres', 'ouvriez'],
  'rouvrir': ['rouvre', 'rouvrez', 'rouvres', 'rouvriez'],
  'offrir': ['offre', 'offrez', 'offres', 'offriez'],
  'couvrir': ['couvre', 'couvrez', 'couvres', 'couvriez'],
  'decouvrir': ['decouvre', 'decouvrez', 'decouvres', 'decouvriez'],
  'sortir': ['sors', 'sortez', 'sortes', 'sortiez'],
  'partir': ['pars', 'partez', 'partes', 'partiez'],
  'servir': ['sers', 'servez', 'serves', 'serviez'],
  'repondre': ['reponds', 'repondez', 'repondes', 'repondiez'],
  'rendre': ['rends', 'rendez', 'rendes', 'rendiez'],
  'attendre': ['attends', 'attendez', 'attendes', 'attendiez'],
  'vendre': ['vends', 'vendez', 'vendes', 'vendiez'],
  'descendre': ['descends', 'descendez', 'descendes', 'descendiez'],
  'suivre': ['suis', 'suivez', 'suives', 'suiviez'],
  'poursuivre': ['poursuis', 'poursuivez', 'poursuives', 'poursuiviez'],
  'joindre': ['joins', 'joignez', 'joignes', 'joigniez'],
  'rejoindre': ['rejoins', 'rejoignez', 'rejoignes', 'rejoigniez'],
  'resoudre': ['resous', 'resolvez', 'resolves', 'resolviez'],
  'produire': ['produis', 'produisez', 'produises', 'produisiez'],
  'traduire': ['traduis', 'traduisez', 'traduises', 'traduisiez'],
  'reduire': ['reduis', 'reduisez', 'reduises', 'reduisiez'],
  'construire': ['construis', 'construisez', 'construises', 'construisiez'],
  'introduire': ['introduis', 'introduisez', 'introduises', 'introduisiez'],
  'recevoir': ['recois', 'recevez', 'recoives', 'receviez'],
  'concevoir': ['concois', 'concevez', 'concoives', 'conceviez'],
  'courir': ['cours', 'courez', 'coures', 'couriez'],
  'parcourir': ['parcours', 'parcourez', 'parcoures', 'parcouriez'],
  'conclure': ['conclus', 'concluez', 'conclues', 'concluiez'],
  'inclure': ['inclus', 'incluez', 'inclues', 'incluiez'],
  'exclure': ['exclus', 'excluez', 'exclues', 'excluiez'],
  'accueillir': ['accueille', 'accueillez', 'accueilles', 'accueilliez'],
  'recueillir': ['recueille', 'recueillez', 'recueilles', 'recueilliez'],
  'savoir': ['sache', 'sachez', 'saches', 'sachiez'],
  'appeler': ['appelle', 'appelez', 'appelles', 'appeliez'],
  'rappeler': ['rappelle', 'rappelez', 'rappelles', 'rappeliez'],
  'renouveler': ['renouvelle', 'renouvelez', 'renouvelles', 'renouveliez'],
  'jeter': ['jette', 'jetez', 'jettes', 'jetiez'],
  'payer': ['paie', 'payez', 'paies', 'payiez'],
  'essayer': ['essaie', 'essayez', 'essaies', 'essayiez'],
  'nettoyer': ['nettoie', 'nettoyez', 'nettoies', 'nettoyiez'],
  'employer': ['emploie', 'employez', 'emploies', 'employiez'],
}

// Verbes anglais d'action (forme de base).
const EN_VERBS = `
add adjust analyze analyse answer approve archive arrange ask assign audit book brief build buy calculate call
cancel change check clean close collect compare compile complete confirm connect contact continue copy correct
create deal debug decide define delete deliver deploy design develop do double-check download draft drop edit
email estimate evaluate export file fill finalize finalise find finish fix follow forward gather get give handle
help implement import improve include inform install invite investigate launch list look make manage merge
migrate move negotiate note notify order organize organise pay pick plan post prepare present print prioritize
publish push put reach read rebook reconcile record redo refactor register reply report request research reschedule
reserve resolve respond restart review revise rework rewrite run save schedule scan send set setup share ship shoot
sign sort start submit summarize summarise sync take test track transfer translate update upload validate verify
write
`;

// --- Construction des tables de lookup ------------------------------------
const words = (s) => s.split(/\s+/).map((w) => fold(w)).filter(Boolean);

/** forme fléchie (sans accents) -> infinitif (sans accents) */
export const FR_FORM_TO_INF = new Map();
/** ensemble des infinitifs connus (sans accents) */
export const FR_INFINITIVES = new Set();

function addForm(form, inf) {
  if (!FR_FORM_TO_INF.has(form)) FR_FORM_TO_INF.set(form, inf);
}

for (const inf of words(FR_ER)) {
  FR_INFINITIVES.add(inf);
  const stem = inf.slice(0, -2);
  addForm(stem + 'e', inf); // ajoute
  addForm(stem + 'ez', inf); // ajoutez
  addForm(stem + 'es', inf); // (que tu) ajoutes
  addForm(stem + 'iez', inf); // (que vous) ajoutiez
  if (/[lt]$/.test(stem)) {
    // appeler -> appelle, jeter -> jette
    addForm(stem + stem.slice(-1) + 'e', inf);
    addForm(stem + stem.slice(-1) + 'es', inf);
  }
  if (stem.endsWith('y')) {
    // envoyer -> envoie, payer -> paie
    addForm(stem.slice(0, -1) + 'ie', inf);
    addForm(stem.slice(0, -1) + 'ies', inf);
  }
}
for (const inf of words(FR_IR2)) {
  FR_INFINITIVES.add(inf);
  const stem = inf.slice(0, -2);
  addForm(stem + 'is', inf); // finis
  addForm(stem + 'issez', inf); // finissez
  addForm(stem + 'isses', inf); // (que tu) finisses
  addForm(stem + 'issiez', inf);
}
for (const [inf, forms] of Object.entries(FR_IRREGULAR)) {
  FR_INFINITIVES.add(inf);
  for (const f of forms) FR_FORM_TO_INF.set(f, inf);
}
// Formes ambiguës en début de phrase (« Suis » = je suis, « Reste » = le reste…).
for (const bad of ['suis', 'reste', 'merci']) FR_FORM_TO_INF.delete(bad);

export const EN_ACTION_VERBS = new Set(words(EN_VERBS));

// Accents de l'infinitif d'origine (pour reconstruire un titre propre).
const ACCENTED = `
accélérer achever améliorer annoncer appeler arrêter bâtir céder compléter contrôler créer débriefer
décaler décider déclarer décliner découper déléguer démarrer déplacer déposer développer éditer élaborer
enregistrer étudier évaluer exécuter gérer intégrer implémenter libérer modérer négocier numéroter paramétrer
préciser préparer présenter procéder réaliser récapituler récupérer rédiger référencer réfléchir régler
réorganiser réparer répertorier répondre réserver résumer réviser sélectionner spécifier suggérer synthétiser
télécharger téléphoner transférer vérifier définir établir rafraîchir réunir réussir écrire réécrire décrire
prévoir prévenir découvrir résoudre réduire recevoir concevoir défaire résilier refléter révéler
dédoublonner itérer générer lister accéder interpréter supprimer mettre être
`;
export const FR_ACCENTED = new Map(
  ACCENTED.split(/\s+/).filter(Boolean).map((w) => [fold(w), w]),
);

export function prettyInfinitive(infFolded) {
  return FR_ACCENTED.get(infFolded) || infFolded;
}

/** Verbes jugés faciles / difficiles (pour la difficulté). */
export const EASY_VERBS = new Set(words(`
appeler rappeler telephoner repondre envoyer renvoyer transferer valider confirmer checker verifier relire
imprimer signer reserver booker payer partager transmettre noter accepter annuler cliquer poster tweeter
uploader telecharger regarder jeter lire relancer remercier inviter informer prevenir demander scanner
call reply respond send forward confirm check sign book pay share read print approve cancel email ask notify
look post upload download
`));
export const HARD_VERBS = new Set(words(`
creer concevoir rediger developper construire analyser refaire reecrire migrer auditer lancer tourner monter
realiser elaborer implementer integrer automatiser restructurer reorganiser designer maquetter produire
retravailler recruter negocier etudier optimiser programmer coder structurer prototyper ecrire definir
build create design develop write analyze analyse migrate audit launch implement research produce redo
rewrite refactor negotiate plan draft architect investigate
`));
export const HARD_OBJECTS = words(`
rapport presentation strategie campagne site refonte video audit budget business-plan deck landing roadmap
dossier etude analyse prototype application app plateforme tunnel catalogue formation process processus
contrat reporting dashboard tableau newsletter shooting tournage film montage benchmark bilan plan
report presentation strategy campaign website redesign proposal roadmap pitch whitepaper
`);
export const EASY_HINTS = words(`
petit petite rapide rapidement juste simple vite 2min 5min minute quick small just simple tiny
`);
