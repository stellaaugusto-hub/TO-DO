// Nettoyage du corps d'un mail : on garde uniquement ce que l'expéditeur a
// réellement écrit dans CE message (sans réponses citées, signature, pied de page).

import { fold, normalizeSpaces, htmlToText, wordCount } from './text.js';

const REPLY_HEADER = [
  /^le .{4,200}(a|à) ecrit ?:?$/, // Le mer. 29 oct. 2025 à 10:12, Jean <j@x.fr> a écrit :
  /^on .{4,240}wrote:?$/,
  /^-{2,} ?(original message|message d'origine|forwarded message|message transfere|message original|mensaje original|weitergeleitete nachricht) ?-{2,}/,
  /^(debut du message (reexpedie|transfere)|begin forwarded message) ?:?/,
  /^_{8,}$/,
  /^\[\[quote\]\]$/,
];
const FORWARD_HEADER = /(forwarded message|message transfere|message reexpedie|begin forwarded|debut du message)/;
const HEADER_LINE = /^(de|from|envoye|sent|date|a|to|objet|subject|cc|cci|bcc) ?:/;

const SIGNATURE_DELIM = /^(--|—|__|-- ?\[\[signature\]\]|\[\[signature\]\])\s*$/;
const MOBILE_SIG = /^(envoye|sent|get|obtenir|telecharger|download).{0,30}(iphone|ipad|android|mobile|outlook|samsung|galaxy|blackberry|gmail)/;

export const SIGNOFF = new RegExp(
  '^(bien |tres |tres bien |encore )?(cordialement|bien cordialement|a bientot|bien a (toi|vous)|' +
    'bonne (journee|soiree|fin de journee|semaine|fin de semaine|continuation|apres-midi|aprem|week-end|weekend|nuit)|' +
    'belle (journee|soiree|semaine|fin de journee)|excellente (journee|soiree|semaine)|tres bonne journee|' +
    'bises|biz|bisous|amicalement|sinceres salutations|salutations( distinguees)?|sincerement|merci( beaucoup| bcp| encore| infiniment| mille fois| d\'avance| par avance| a toi| a vous| pour (tout|ton aide|votre aide|ta reponse|votre retour|ton retour))?|' +
    'a \\+|a\\+|a plus|a tout (a l\'heure|de suite)|a demain|a lundi|a tres vite|' +
    'best( regards| wishes)?|kind regards|warm regards|regards|many thanks|thanks( a lot| again| so much| in advance)?|thank you( so much| again| in advance)?|' +
    'cheers|talk soon|sincerely|yours( truly)?|take care|xoxo|ciao|see you( soon)?)' +
    '[\\s!,.:)\\-]*(\\p{L}+)?[\\s!,.]*$',
  'u',
);

const PHONE = /(\+\d{1,3}[\s.-]?)?\(?0?\d{1,3}\)?([\s.-]?\d{2,4}){3,5}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const URL = /(https?:\/\/|www\.)\S+/i;
const POSTAL = /\b\d{5}\b\s+[A-ZÀ-Ý][\p{L}-]+|\b\d{1,4},?\s+(rue|avenue|av\.|bd|boulevard|place|chemin|allee|allée|impasse|quai|street|st\.|road|rd\.)\b/iu;
const JOB = /\b(ceo|cto|cmo|coo|cfo|founder|co-?founder|fondat(eur|rice)|co-?fondat(eur|rice)|directeur|directrice|director|head of|manager|responsable|chef de projet|cheffe de projet|chargee? (de|d')(projet|communication|marketing|clientele|mission|com|affaires|production|developpement|relations?|contenus?|partenariats?)|consultant|consultante|assistant|assistante|stagiaire|intern|commercial|account|growth|marketing|communication|designer|developpeur|developer|engineer|ingenieur|president|presidente|gerant|gerante|associe|associee|partner|lead|product owner|vp|vice[- ]president|office manager|community manager|media buyer|traffic manager|acheteur|acheteuse|comptable|juriste|avocat|rh|hr)\b/;
const COMPANY = /\b(sas|sarl|sa|sasu|eurl|inc|ltd|llc|gmbh|group|groupe|agency|agence|studio)\b\.?$/;
const SOCIAL_LINE = /^(linkedin|instagram|facebook|twitter|x|tiktok|youtube|site|web|website|tel|tél|téléphone|telephone|mob|mobile|port|portable|fax|phone|email|e-mail|mail|adresse|address)\b\s*[:|.-]?/;

const DISCLAIMER = /(confidenti|intended (solely )?(for|recipient|only)|destinataires? (exclusif|designe|vise|indique)|this (e-?mail|message|communication) (and any|is |may contain|contains|including)|ce (message|courriel|mail|e-mail) (et|ainsi que|est |peut|contient|ne peut)|pieces? jointes? (sont|est) (confidenti|strictement|etablie)|if you (have )?received this|si vous (avez )?recu ce|si vous n'etes pas (le|la) destinataire|pensez a l'environnement|ayez un geste|think (about|of) the environment|please consider the environment|avant d'imprimer|before printing|unsubscribe|desinscri|desabonn|se desinscrire|vous recevez ce|you (are )?receiv(ed|ing) this|mentions legales|politique de confidentialite|privacy policy|gerer (mes|vos) preferences|manage (your )?(email )?preferences|view (it |this email )?in (your )?browser|voir (la )?version (en ligne|web)|afficher dans (le|votre) navigateur|tous droits reserves|all rights reserved|\brgpd\b|\bgdpr\b|donnees personnelles|notify the sender|avertir (immediatement )?l'expediteur|prevenir (immediatement )?l'expediteur|virus|disclaimer|avis de confidentialite|legal notice)/;

export function isSignatureLike(line) {
  const raw = line.trim();
  if (!raw) return true;
  const f = fold(raw);
  if (PHONE.test(raw) && wordCount(raw) <= 8) return true;
  if (EMAIL.test(raw) && wordCount(raw) <= 8) return true;
  if (URL.test(raw) && wordCount(raw.replace(URL, '')) <= 6) return true;
  if (POSTAL.test(raw) && wordCount(raw) <= 12) return true;
  if (SOCIAL_LINE.test(f) && wordCount(raw) <= 8) return true;
  if (/\s[|•·]\s/.test(raw) && wordCount(raw) <= 14) return true;
  if (JOB.test(f) && wordCount(raw) <= 8 && !/[.!?]$/.test(raw)) return true;
  if (COMPANY.test(f) && wordCount(raw) <= 6) return true;
  // Nom propre seul : 1 à 4 mots capitalisés, sans ponctuation finale.
  if (/^([A-ZÀ-Ý][\p{L}'’-]+\.?\s?){1,4}$/u.test(raw)) return true;
  if (/^\[(image|cid|logo)[^\]]*\]$/i.test(raw)) return true;
  if (/^[-_=*~.·•]{3,}$/.test(raw)) return true;
  return false;
}

function isPS(line) {
  return /^(p\.?\s?-?s\.?|ps)\s*[:.-]?\s/i.test(line.trim());
}

/**
 * @param {{text?: string, html?: string}} msg
 * @returns {{ body: string, forwarded: boolean, cut: string[] }}
 */
export function cleanEmailBody({ text, html } = {}) {
  let src = text && text.trim() ? text : htmlToText(html || '');
  if (text && html && /\[\[QUOTE\]\]|\[\[SIGNATURE\]\]/.test(htmlToText(html))) {
    // Le HTML de Gmail marque précisément citation et signature : on le préfère.
    src = htmlToText(html);
  }
  src = normalizeSpaces(src)
    .replace(/\[(image|cid):[^\]]*\]/gi, '')
    .replace(/<(https?:\/\/|mailto:)[^>]*>/gi, '')
    .replace(/\n{3,}/g, '\n\n');

  const cut = [];
  let lines = src.split('\n');
  let forwarded = false;
  let rest = '';

  // 1) Réponse / transfert : on coupe au premier en-tête de citation.
  for (let i = 0; i < lines.length; i++) {
    const f = fold(lines[i].trim());
    const joined = fold((lines[i] + ' ' + (lines[i + 1] || '')).trim());
    const joined3 = fold((lines[i] + ' ' + (lines[i + 1] || '') + ' ' + (lines[i + 2] || '')).trim());
    let hit = REPLY_HEADER.some((re) => re.test(f) || re.test(joined) || re.test(joined3));
    if (!hit && HEADER_LINE.test(f) && /^(de|from) ?:/.test(f)) {
      // Bloc "De : ... Envoyé : ... Objet : ..." (Outlook)
      const next = lines.slice(i + 1, i + 6).map((l) => fold(l.trim()));
      hit = next.filter((l) => HEADER_LINE.test(l)).length >= 2;
    }
    if (hit) {
      if (FORWARD_HEADER.test(joined3)) forwarded = true;
      cut.push('quote');
      rest = lines.slice(i + 1).join('\n');
      lines = lines.slice(0, i);
      break;
    }
  }
  // Lignes citées "> ..." restantes
  const before = lines.length;
  lines = lines.filter((l) => !/^\s*>/.test(l));
  if (lines.length !== before) cut.push('quoted-lines');

  // 2) Signature : délimiteur standard, "Envoyé de mon iPhone", formule de politesse.
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const f = fold(t);
    if (SIGNATURE_DELIM.test(f) || MOBILE_SIG.test(f)) {
      const ps = lines.slice(i + 1).filter(isPS);
      lines = lines.slice(0, i).concat(ps);
      cut.push('signature');
      break;
    }
    if (wordCount(t) <= 7 && SIGNOFF.test(f)) {
      const rest = lines.slice(i + 1);
      const nonEmpty = rest.filter((l) => l.trim());
      const sigLike = nonEmpty.filter((l) => isSignatureLike(l) || wordCount(l) <= 6).length;
      if (!nonEmpty.length || sigLike / nonEmpty.length >= 0.7 || nonEmpty.every((l) => isPS(l) || isSignatureLike(l))) {
        const ps = rest.filter(isPS);
        lines = lines.slice(0, i).concat(ps);
        cut.push('signoff');
        break;
      }
    }
  }

  // 3) Pieds de page / mentions légales : paragraphes entiers.
  let paragraphs = lines.join('\n').split(/\n\s*\n/);
  paragraphs = paragraphs.filter((p) => {
    const f = fold(p);
    if (DISCLAIMER.test(f)) {
      cut.push('footer');
      return false;
    }
    return true;
  });
  lines = paragraphs.join('\n\n').split('\n');

  // 4) Bloc de contact final sans formule de politesse (nom, poste, téléphone…)
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) end--;
  let start = end;
  while (start > 0 && isSignatureLike(lines[start - 1]) && !isPS(lines[start - 1])) start--;
  const block = lines.slice(start, end).filter((l) => l.trim());
  const strongSig = block.some((l) => PHONE.test(l) || EMAIL.test(l) || URL.test(l) || JOB.test(fold(l)) || POSTAL.test(l));
  if (block.length >= 2 || (block.length === 1 && strongSig && start > 0)) {
    // On ne coupe pas tout le message si c'est la seule chose qu'il contient.
    if (start > 0) {
      lines = lines.slice(0, start);
      cut.push('contact-block');
    }
  }

  // 5) Blocs de signature au milieu du texte (sans « -- ») : ≥ 3 lignes de contact avec téléphone ou e-mail
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim() || !isSignatureLike(lines[i])) continue;
    let j = i;
    while (j < lines.length && lines[j].trim() && isSignatureLike(lines[j])) j++;
    const run = lines.slice(i, j);
    if (run.length >= 3 && run.some((l) => PHONE.test(l) || EMAIL.test(l))) {
      lines.splice(i, j - i);
      cut.push('signature-block');
      i--;
    } else i = j;
  }

  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return { body, forwarded, cut, rest: forwarded ? rest : '' };
}

/** Récupère le sujet du message transféré (pour donner du contexte à « Gère ça stp »). */
export function forwardedSubject(fullText) {
  const m = String(fullText || '').match(/\n(?:objet|subject)\s*:\s*(.+)/i);
  return m ? m[1].trim() : null;
}
