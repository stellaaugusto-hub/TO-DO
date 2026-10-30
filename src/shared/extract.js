// Extraction de tâches à partir d'un mail ou d'un message de chat.
//
// Pipeline :
//   1. filtre du message (newsletters, no-reply, invitations, réponses auto…)
//   2. nettoyage du corps (citations, signature, pied de page) -> clean.js
//   3. découpage en phrases et listes
//   4. score d'« actionnabilité » de chaque phrase (demande, impératif, échéance…)
//   5. réécriture en titre de tâche à l'infinitif (« Peux-tu m'envoyer X ? » -> « Envoyer X à Jean »)
//   6. sous-tâches (énumérations, listes), échéance, priorité, difficulté, tags

import { fold, normalizeSpaces, capitalize, wordCount, detectLang, truncate, similarity } from './text.js';
import { cleanEmailBody, forwardedSubject } from './clean.js';
import { parseDue } from './dates.js';
import {
  FR_FORM_TO_INF, FR_INFINITIVES, EN_ACTION_VERBS, prettyInfinitive,
  EASY_VERBS, HARD_VERBS, HARD_OBJECTS, EASY_HINTS,
} from './lexicon.js';

export const THRESHOLD = 3;

// ---------------------------------------------------------------------------
// 1. Filtre du message
// ---------------------------------------------------------------------------
const AUTOMATED_SENDER = /(^|[-_.+])(no-?reply|do-?not-?reply|donotreply|ne-?pas-?repondre|mailer-daemon|postmaster|bounces?|newsletters?|notifications?|notify|alerts?|calendar-notification|marketing|promo(tions)?|digest|updates?)([-_.+]|$)/;
const AUTOMATED_SUBJECT = [
  /^(invitation|updated invitation|invitation mise a jour|nouvel evenement|new event|accepted|accepte|declined|refuse|tentative|provisoire|canceled|cancelled|annule|event canceled|evenement annule)( ?:|\b.*@)/,
  /^((re|tr|fwd?) ?: ?)?(out of office|absence|absent|automatic reply|reponse automatique|auto(matic)? ?reply|autoreply|je suis absent|en conges)/,
  /(delivery status notification|undeliverable|non remis|mail delivery (failed|subsystem)|returned mail|message not delivered)/,
  /^(your|votre|ton) (receipt|recu|facture|invoice|order|commande|reservation|booking|abonnement|subscription)\b/,
  /\b(newsletter|webinar|webinaire|digest hebdo|weekly digest)\b/,
  /^(rappel|reminder) ?: .*(@|\d{1,2}[:h]\d{2})/, // rappels d'agenda
];
const ASSIGNMENT = /(assigned (this )?(task )?to you|you('ve| have) been assigned|has assigned you|assigned you|vous a assigne|t'a assigne|vous a ete assigne|nouvelle tache assignee|a assigne une tache)/;

/** Compare deux adresses en ignorant les points de la partie locale (prenom.nom = prenomnom). */
export function sameAddress(a, b) {
  const norm = (x) => {
    const [l, d] = fold(x).trim().split('@');
    return `${(l || '').replace(/\./g, '').replace(/\+.*$/, '')}@${d || ''}`;
  };
  return !!a && !!b && norm(a) === norm(b);
}

function addressListIncludes(list, email) {
  if (!list || !email) return false;
  return (fold(list).match(/[\w.+-]+@[\w.-]+/g) || []).some((x) => sameAddress(x, email));
}

export function classifyMessage(msg, { userEmail } = {}) {
  const fromEmail = fold(msg.from?.email || '');
  const local = fromEmail.split('@')[0] || '';
  const subject = fold(msg.subject || '');
  const h = Object.fromEntries(Object.entries(msg.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v ?? '')]));

  if (userEmail && fromEmail && sameAddress(fromEmail, userEmail)) return { skip: 'self' };
  const body = fold((msg.text || '') + ' ' + (msg.html || '').slice(0, 20000));
  const assignment = ASSIGNMENT.test(subject) || ASSIGNMENT.test(body.slice(0, 3000));
  if (/(a reagi depuis gmail|reacted via gmail|a reagi a votre message|reacted to your message)/.test(body.slice(0, 600))) return { skip: 'reaction' };

  if (AUTOMATED_SENDER.test(local) || /noreply|no-reply/.test(fromEmail)) {
    return assignment ? { skip: null, assignment: true } : { skip: 'automated-sender' };
  }
  if (/^(bulk|junk|list)$/.test(fold(h.precedence || '').trim())) return { skip: 'bulk' };
  if (h['auto-submitted'] && !/^no$/i.test(h['auto-submitted'].trim())) return { skip: 'auto-submitted' };
  if (h['x-autoreply'] || h['x-autorespond'] || /oof|autoreply/i.test(h['x-auto-response-suppress'] || '') && /^(re: )?(absence|out of office|automatic)/.test(subject)) return { skip: 'auto-reply' };
  const isGroup = !!(h['x-google-group-id'] || h['mailing-list']);
  if (h['list-unsubscribe'] && !isGroup) return { skip: 'newsletter' };
  for (const re of AUTOMATED_SUBJECT) if (re.test(subject)) return { skip: 'automated-subject' };
  const links = (body.match(/https?:\/\//g) || []).length;
  if (/(unsubscribe|desinscri|desabonn|se desinscrire|gerer (mes|vos) preferences)/.test(body) && links >= 4) return { skip: 'newsletter' };
  if (/(voir (la )?version (en ligne|web)|view (it |this email )?in (your )?browser|afficher dans (le|votre) navigateur)/.test(body)) return { skip: 'newsletter' };
  return { skip: null, assignment };
}

// ---------------------------------------------------------------------------
// 3. Découpage
// ---------------------------------------------------------------------------
const BULLET = /^\s*([-*•–—▪◦·➤►→✓✔☐□]|\d{1,2}[.)]|[a-hA-H][.)]|\[ ?[xX]? ?\])\s+/;
const TODO_HEADER = /^(voici (les|mes|nos) (besoins|demandes|taches)|(les |mes |nos )?besoins|(les |mes |nos )?demandes|a faire|todo|to do|to-do|taches?|taches a faire|next steps?|prochaines? etapes?|actions?( a mener| items?)?|missions?|checklist|liste|pour (demain|ce soir|aujourd'hui|lundi|mardi|mercredi|jeudi|vendredi|la semaine prochaine)|deliverables?|livrables?|plan d'action)\b[^:]{0,30}:?$/;

const ABBREV = /\b(M|Mme|Mlle|MM|Dr|Pr|St|Ste|cf|ex|etc|vs|env|Cie|réf|ref|tél|tel|n°|No|approx|p|av|bd|fig|vol|max|min|resp|qq|svp|stp)\./gi;

function splitSentences(text) {
  const protectedText = text.replace(ABBREV, (m) => m.replace('.', '§'));
  return protectedText
    .split(/(?<=[.!?…])\s+(?=[«"“(]?[A-ZÀ-Ý0-9@¿¡])|(?<=[!?])\s+|\s+(?=(?:PS|P\.S\.)\s*:)/)
    .map((s) => s.replace(/§/g, '.').trim())
    .filter(Boolean);
}

export function segment(body) {
  const units = [];
  const paragraphs = body.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const rawLines = para.split('\n').filter((l) => l.trim());
    const lines = rawLines.map((l) => l.trim());
    let buf = [];
    const flush = () => {
      if (!buf.length) return;
      const joined = buf.join(' ');
      for (const s of splitSentences(joined)) units.push({ type: 'sentence', text: s });
      buf = [];
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isBullet = BULLET.test(line);
      const prev = units[units.length - 1];
      if (isBullet) {
        const item = line.replace(BULLET, '').trim();
        if (prev && prev.type === 'list' && prev._open) {
          prev.items.push(item);
        } else {
          // l'intro = dernière phrase avant la liste (si elle annonce la liste)
          flush();
          let intro = null;
          const last = units[units.length - 1];
          if (last && last.type === 'sentence' && (/:\s*$/.test(last.text) || last._para === para)) {
            intro = units.pop().text;
          }
          units.push({ type: 'list', intro, items: [item], _open: true });
        }
        continue;
      }
      // Suite d'un élément de liste coupé sur deux lignes
      if (prev && prev.type === 'list' && prev._open && (/^\s{2,}/.test(rawLines[i]) || /^[a-zà-ÿ(]/.test(line))) {
        prev.items[prev.items.length - 1] += ' ' + line;
        continue;
      }
      if (prev && prev.type === 'list') prev._open = false;
      // Ligne « titre : » suivie de lignes courtes sans puces -> liste implicite
      if (/:\s*$/.test(line) && TODO_HEADER.test(fold(line.replace(/:\s*$/, '').trim()))) {
        flush();
        const items = [];
        let j = i + 1;
        while (j < lines.length && wordCount(lines[j]) <= 18 && !/:\s*$/.test(lines[j])) {
          const it = lines[j++];
          if (items.length && !BULLET.test(it) && (/^\s{2,}/.test(rawLines[j - 1]) || /^[a-zà-ÿ(]/.test(it))) items[items.length - 1] += ' ' + it;
          else items.push(it.replace(BULLET, '').trim());
        }
        if (items.length) {
          units.push({ type: 'list', intro: line, items, _open: false });
          i = j - 1;
          continue;
        }
      }
      if (/:\s*$/.test(line)) {
        buf.push(line);
        flush();
        const last = units[units.length - 1];
        if (last) last._para = para;
        continue;
      }
      buf.push(line);
    }
    flush();
    const last = units[units.length - 1];
    if (last && last.type === 'list') last._open = false;
  }
  return units.map(({ _open, _para, ...u }) => u);
}

// ---------------------------------------------------------------------------
// 4. Analyse d'une phrase
// ---------------------------------------------------------------------------
const FILLERS = /^(go|ok go|let's go|c'est parti|nickel|yes|et|aussi|egalement|sinon|du coup|enfin|ensuite|puis|alors|bon|ok|okay|d'accord|donc|par contre|au fait|btw|also|and|then|so|oh|oh and|by the way|petite chose|dernier point|autre chose|derniere chose|une derniere chose|last thing|one more thing|par ailleurs|de plus|en plus|en outre|bref|voila|bref|tiens|ah|oui|yes|parfait|super|top|cool|merci|thanks|great|perfect)\b[\s,:!.-]*/;
const PREFIX_FLAGS = /^(rappel|petit rappel|pour rappel|reminder|important|urgent|tres urgent|asap|ps|p\.s\.|p-s|nb|n\.b\.|attention|warning|info|note|edit|update|maj)\s*[:!.-]\s*/;
const GREETING_PREFIX = /^(bonjour|bonsoir|hello|hello hello|salut|coucou|hey|hi|dear|cher|chere|chers|yo|re|good morning|good afternoon)( (a (tous|toutes|toi|vous)|tout le monde|la team|l'equipe|team|everyone|all|guys|les amis|[\p{L}-]+)){0,3}\s*[,!.:]+\s*/u;
const GREETING_ONLY = /^(bonjour|bonsoir|hello|salut|coucou|hey|hi|dear|cher|chere|yo|good morning|good afternoon)\b[^.!?]{0,40}[,!.]?$/;

const NEGATIVES = [
  { re: /^(j'espere que|j espere que|hope (you|all|this|everything|that)|i hope|en esperant que|j'espere (que )?tu vas bien|comment (vas-tu|allez-vous|ca va)|ca va\s*\?|how are you)/, score: -6, why: 'politesse' },
  { re: /^(passe|passez|profite|profitez|prends soin|prenez soin|bon courage|bonne chance|have a (great|nice|good|lovely)|enjoy|take care|good luck|felicitations|bravo|congrats)\b/, score: -6, why: 'politesse' },
  { re: /^(merci|thanks|thank you|un grand merci|mille mercis|many thanks|merci beaucoup|merci encore)\b/, score: -5, why: 'remerciement', unlessRequest: true },
  { re: /^(pour info|pour information|fyi|f\.y\.i|a titre informatif|just a heads up|heads up|pour ton information|pour votre information|je te mets en copie|je vous mets en copie)/, score: -3, why: 'fyi' },
  { re: /(veuillez trouver|vous trouverez|tu trouveras|ci-joint|ci-dessous|en piece jointe|en pj|please find|attached (is|are|you will find|you'll find)|here is|here are|here's|voici|voila)\b/, score: -2, why: 'pj' },
  { re: /(n'hesite(z)? pas|n hesite pas|feel free|let me know|let us know|do let|if you have any questions|any questions|si vous avez des questions|si tu as des questions|en cas de questions?|pour toute question|tiens-moi au courant|tenez-moi au courant|tiens moi au courant|keep me posted|fais-moi signe|faites-moi signe|reviens vers moi|revenez vers moi|dis-moi (ce que|si|quand|comment)|dites-moi (ce que|si|quand)|je reste a (ta|votre) disposition|je reste dispo|i'm available|i am available|je suis disponible|happy to help|n'hesitez pas)/, score: -3, why: 'formule' },
  { re: /^(je |j'|on |nous |i |i'|we |we')(vais|m'occupe|m'en occupe|m'en charge|me charge|te tiens|vous tiens|reviens|regarde|ferai|passerai|prends|prendrai|s'occupe|s'en occupe|allons|serai|suis en train|t'envoie|vous envoie|te transmets|vous transmets|te fais|vous fais|te redis|vous redis|te propose|vous propose|enverrai|t'enverrai|m'en charge|will|'ll|ll|am going|can take|will take|'m on it|am on it|just sent|have sent|'ve sent)/, score: -4, why: 'engagement-expediteur' },
  { re: /^(j'ai |nous avons |on a |j'avais |i have |i've |we have |we've |i just |je viens d|on vient d|nous venons d|c'est fait|c'est bon|c'est regle|c'est envoye|c'est valide|ca y est|tout est (ok|bon|regle)|done\b|all done|it's done|it is done)/, score: -4, why: 'passe' },
  { re: /^(est-ce que |est ce que )?(tu as|as-tu|t'as|avez-vous|vous avez|tu es|es-tu|vous etes|etes-vous|tu serais|serais-tu|tu sais|sais-tu|did you|have you|has |is |are |were |do you (know|have)|ca te va|ca vous va|c'est ok|ok pour (toi|vous)|qu'en penses-tu|tu en penses quoi|what do you think|des nouvelles|any news|any update|tu (en )?es ou|ou en es-tu|tu as vu|t'as vu|avez-vous vu|have you seen|tu connais|tu dispo|t'es dispo|tu es dispo|dispo)\b.*\?$/, score: -3, why: 'question' },
  { re: /^(pas besoin de|inutile de|no need to|ne pas (faire|envoyer|toucher)|don't (do|send|worry)|t'inquiete|ne t'inquiete pas|no worries)/, score: -5, why: 'negation' },
  { re: /^(je (ne )?(sais|pense|crois|trouve|suis|viens|voulais|me demandais|reviens)|i (think|believe|feel|was wondering|wanted)|il (y a|est|etait)|c'est|c'etait|ca (a ete|etait)|nous sommes|on est|it was|it is|there (is|are))\b/, score: -1, why: 'constat' },
];

const REQUESTS = [
  // FR
  { re: /^(est-ce que |est ce que |est-ce qu')?(tu |vous |t')?(peux|pourrais|pouvez|pourriez|pourras|pourrez|peut|pourrait)( |-)(tu |vous |t'on |on )?((stp|svp|s'il te plait|s'il vous plait|egalement|aussi|juste|rapidement|vite|bien|stp,|svp,|eventuellement|deja|toujours|du coup|si possible)[ ,]+)*/, score: 3.5 },
  { re: /^(est-ce que |est ce que )?(tu |vous )?(aurais|auriez|as|avez|aurais-tu|auriez-vous|as-tu|avez-vous)(-tu|-vous)? (le temps|un moment|un instant|deux minutes|2 ?min|5 ?min|cinq minutes|dix minutes|un peu de temps|un creneau) (de |d'|pour )/, score: 3.5 },
  { re: /^(je te remercie de bien vouloir |je vous remercie de bien vouloir |merci de bien vouloir |merci de |merci d')/, score: 3.5, needsVerb: true },
  { re: /^(je te |je vous )(laisse |demande de |demande d'|demanderais de |prie de |prie d'|serais reconnaissant de |charge de )/, score: 3.5 },
  { re: /^(je compte sur (toi|vous) pour |a (toi|vous) de |a (toi|vous) d'|c'est a (toi|vous) de |c'est a (toi|vous) d'|ce serait (top|super|bien|cool|genial|parfait|ideal) (de |d'|que tu |que vous |si tu |si vous ))/, score: 3.5 },
  { re: /^(il faut|il faudrait|faudrait|faut|il va falloir|va falloir)( absolument| vraiment| juste| aussi)? que (tu |vous )/, score: 3.5, subj: true },
  { re: /^(il faut|il faudrait|faudrait|faut|il va falloir|va falloir)( absolument| vraiment| juste| aussi)? (qu'on |que l'on |que nous )/, score: 2.5, subj: true },
  { re: /^(il faut|il faudrait|faudrait|faut|il va falloir|va falloir)( absolument| vraiment| juste| aussi)? /, score: 3 },
  { re: /^(tu |vous )(dois|devrais|devez|devriez|devras|devrez|vas devoir|allez devoir|as a|avez a|vas|allez) /, score: 3 },
  { re: /^(on |nous )(doit|devrait|devons|devrions|a a|va devoir|aurait besoin de) /, score: 2.5 },
  { re: /^(j'ai besoin que |j'aurais besoin que |j'aimerais que |je voudrais que |je souhaiterais que |je souhaite que |ce serait bien que |ce serait top que |il faudrait que )(tu |vous )/, score: 3.5, subj: true },
  { re: /^(j'ai besoin |j'aurais besoin |il me faudrait |il me faut |on aurait besoin |nous aurions besoin |j'aimerais avoir |j'aimerais recevoir )/, score: 3, need: true },
  { re: /^(n'oublie pas|n'oubliez pas|n'oublies pas|ne pas oublier|noublie pas|n oublie pas|oublie pas|ne surtout pas oublier)( de| d')? ?/, score: 3.5 },
  { re: /^(pense|pensez|penses|pense bien|pensez bien) (a |aussi a |bien a )/, score: 3.5 },
  { re: /^(veuillez|veuille|merci de bien vouloir) /, score: 3.5 },
  { re: /^(a faire|todo|to do|to-do|action|actions|tache|next step|prochaine etape|action item|ta mission|mission|demande) ?: ?/, score: 3.5, any: true },
  { re: /^(est-ce possible de |est-ce que ce serait possible de |serait-il possible de |ce serait possible de |possible de |tu serais dispo pour |tu serais disponible pour |serais-tu dispo pour )/, score: 3.5 },
  // EN
  { re: /^(can|could|would|will) you((,)? (please|kindly|also|quickly|just|maybe|perhaps|possibly))*,? /, score: 3.5 },
  { re: /^(please|pls|plz|kindly)(,)?( also| just| quickly| make sure to| remember to)? /, score: 3.5 },
  { re: /^(i need you to|i'd need you to|i would need you to|i'd like you to|i would like you to|i want you to|we need you to|need you to|i'll need you to|i will need you to) /, score: 3.5 },
  { re: /^(you need to|you should|you must|you have to|you'll need to|you will need to|you're going to need to) /, score: 3 },
  { re: /^(make sure( to| you| that you)?|remember to|don't forget to|dont forget to|do not forget to|be sure to) /, score: 3.5 },
  { re: /^(we need to|we should|we must|we have to|let's|lets) /, score: 2.5 },
  { re: /^(would you mind|do you mind) /, score: 3.5, gerund: true },
  { re: /^(is it possible (for you )?to|would it be possible (for you )?to|are you able to|could we) /, score: 3 },
];

const CLITIC = /^(me |m'|nous |te |t'|lui |leur |le |la |les |l'|en |y |bien |aussi |egalement |juste |rapidement |vite |deja |stp |svp )+/;
const REPLY_ONLY = /^(dire|me dire|nous dire|confirmer si|tell|let) /;

function stripPoliteTail(s) {
  let prev;
  do {
    prev = s;
    s = s
      .replace(/[\s,;:-]*\b(quand|des que|dès que|si|when|if) (tu|vous|you) (as|auras|avez|aurez|peux|pourras|pouvez|get|have|can)( (le temps|un moment|un instant|un creneau|un créneau|\d+ ?min(utes)?|deux minutes|cinq minutes|a (chance|minute|moment)|time))?\s*[!?.,)]*\s*$/i, '')
      .replace(/[\s,;:-]*\b(stp|svp|s'il te pla[iî]t|s'il vous pla[iî]t|please|pls|plz|merci( beaucoup| bcp| d'avance| par avance| encore)?|thanks?( a lot| in advance)?|thank you|si possible|if possible|si tu peux|si vous pouvez|if you can|asap|a\.s\.a\.p|au plus vite|dès que possible|des que possible|en urgence|urgent|rapidement|en priorité|en priorite|quand tu peux|quand tu as le temps|when you can|when you get a chance|pas urgent|no rush)\s*[!?.,)]*\s*$/i, '')
      .replace(/[\s?!.,;:…)(-]+$/, '')
      .trim();
  } while (s !== prev);
  return s;
}

const AMBIGUOUS_NOUNS = new Set(['facture', 'commande', 'note', 'demande', 'relance', 'reserve', 'contact', 'design', 'test', 'update', 'check', 'report', 'call', 'plan', 'draft', 'review', 'budget', 'post', 'email', 'list', 'file', 'order', 'brief', 'point', 'livre', 'montage', 'copie', 'calcule']);

/** Détecte le verbe au début de `core` et renvoie sa forme infinitive. */
function detectVerb(core, { lang, allowMorph = false, gerund = false }) {
  const m = core.match(/^([\p{L}'’]+)((?:-(?:moi|toi|nous|vous|le|la|les|lui|leur|en|y))*)(?=[\s,.!?:;]|$)/u);
  if (!m) return null;
  const word = m[1];
  const f = fold(word);
  const clitics = m[2] ? fold(m[2]).split('-').filter(Boolean) : [];
  if (lang === 'en' || (gerund && f.endsWith('ing'))) {
    let base = f;
    if (gerund && f.endsWith('ing')) {
      base = f.slice(0, -3);
      if (!EN_ACTION_VERBS.has(base) && EN_ACTION_VERBS.has(base + 'e')) base += 'e';
      if (/(.)\1$/.test(base) && !EN_ACTION_VERBS.has(base)) base = base.slice(0, -1);
    }
    if (EN_ACTION_VERBS.has(base)) return { inf: base, word: word + (m[2] || ''), lang: 'en', clitics, kind: 'en' };
    if (lang === 'en' && allowMorph && /^[a-z]{3,}$/.test(base)) return { inf: base, word: word + (m[2] || ''), lang: 'en', clitics, kind: 'en-morph' };
  }
  if (AMBIGUOUS_NOUNS.has(f) && !clitics.length) {
    // « Facture Studio K », « Commande 123 » : ce sont des noms, pas des impératifs
    const next = core.slice(m[0].length).trim();
    if (!next || /^[A-ZÀ-Ý0-9#№]|^n°/u.test(next)) return null;
  }
  if (FR_INFINITIVES.has(f)) return { inf: f, word: word + (m[2] || ''), lang: 'fr', clitics, kind: 'infinitive' };
  if (FR_FORM_TO_INF.has(f)) return { inf: FR_FORM_TO_INF.get(f), word: word + (m[2] || ''), lang: 'fr', clitics, kind: 'imperative' };
  if (allowMorph && /^[a-z]{4,}(er|ir|re|oir)$/.test(f) && !/(ier|iere|eur|oire|aire)$/.test(f)) {
    return { inf: f, word: word + (m[2] || ''), lang: 'fr', clitics, kind: 'morph', pretty: word.toLowerCase() };
  }
  return null;
}

function firstName(from) {
  const n = (from?.name || '').trim();
  if (n) {
    const parts = n.replace(/["']/g, '').split(/[\s,]+/).filter(Boolean);
    if (n.includes(',') && parts.length > 1) return capitalize(parts[1].toLowerCase());
    return parts[0].length > 1 ? capitalize(parts[0].toLowerCase()) : parts[0];
  }
  const local = (from?.email || '').split('@')[0].split(/[._-]/)[0];
  return local ? capitalize(local.toLowerCase()) : null;
}

const SECOND_TO_FIRST = [
  [/\bton\b/g, 'mon'], [/\bta\b/g, 'ma'], [/\btes\b/g, 'mes'], [/\btoi\b/g, 'moi'],
  [/\bTon\b/g, 'Mon'], [/\bTa\b/g, 'Ma'], [/\bTes\b/g, 'Mes'],
  [/\byour\b/g, 'my'], [/\bYour\b/g, 'My'], [/\byourself\b/g, 'myself'],
];
const DIRECT_OBJECT_VERBS = new Set(['appeler', 'rappeler', 'contacter', 'recontacter', 'prevenir', 'aider', 'joindre', 'relancer', 'call', 'ping', 'contact', 'help', 'remind', 'inviter', 'invite', 'tenir', 'retrouver', 'rejoindre', 'join', 'meet', 'voir', 'rencontrer', 'briefer', 'debriefer']);

/**
 * Analyse une phrase. Renvoie { score, title, verb, why[] } — title=null si non actionnable.
 */
export function analyzeSentence(sentence, ctx = {}) {
  const why = [];
  let s = normalizeSpaces(sentence).replace(/\s+/g, ' ').trim();
  if (!s) return { score: -10, title: null, why: ['vide'] };
  const flags = { urgent: false, todo: false };

  // mention @Nom en début (chat) / vocatif « Paul, peux-tu… »
  let addressedToOther = false;
  let addressedToMe = false;
  const mention = s.match(/^@([\p{L}][\p{L}.\- ]{0,30}?)\b[\s,:]+/u);
  if (mention) {
    const target = fold(mention[1]).split(/[\s.]/)[0];
    if (ctx.userFirstName && target !== fold(ctx.userFirstName) && !/^(all|tous|everyone|here|channel|equipe|team)$/.test(target)) addressedToOther = true;
    if (ctx.userFirstName && target === fold(ctx.userFirstName)) addressedToMe = true;
    s = s.slice(mention[0].length);
  }

  let changed = true;
  while (changed) {
    changed = false;
    const f0 = fold(s);
    let m;
    if ((m = f0.match(GREETING_PREFIX)) && m[0].length < s.length) { s = s.slice(m[0].length); changed = true; continue; }
    if ((m = f0.match(PREFIX_FLAGS))) {
      if (/urgent|asap/.test(m[1])) flags.urgent = true;
      s = s.slice(m[0].length); changed = true; continue;
    }
    if ((m = f0.match(/^(stp|svp|s'il te plait|s'il vous plait)[\s,]+/))) { s = s.slice(m[0].length); changed = true; continue; }
    if ((m = f0.match(FILLERS)) && m[0].length && m[0].length < s.length) {
      // « Merci de … » est une demande : on ne retire pas « merci » dans ce cas
      if (/^merci (de|d')/.test(f0) || /^thanks? (for|to)/.test(f0)) break;
      s = s.slice(m[0].length); changed = true; continue;
    }
    // Vocatif : « Paul, peux-tu… »
    const voc = s.match(/^([A-ZÀ-Ý][\p{L}-]+)\s*,\s+(?=\S)/u);
    if (voc && !/^(Bonjour|Hello|Salut|Merci|Ok|Oui|Non|Alors|Donc|Sinon|Enfin|Aussi|Bref|Top|Super|Parfait|Cool|Yes|Hi|Hey|Thanks)$/i.test(voc[1])) {
      const target = fold(voc[1]);
      const looksLikeName = !FR_FORM_TO_INF.has(target) && !FR_INFINITIVES.has(target) && !EN_ACTION_VERBS.has(target);
      if (looksLikeName) {
        if (ctx.userFirstName && target !== fold(ctx.userFirstName)) addressedToOther = true;
        if (ctx.userFirstName && target === fold(ctx.userFirstName)) addressedToMe = true;
        s = s.slice(voc[0].length); changed = true; continue;
      }
    }
  }

  const f = fold(s);
  if (!f || GREETING_ONLY.test(f)) return { score: -6, title: null, why: ['salutation'] };
  const lang = ctx.lang || detectLang(s);

  // « Dites-moi ce que vous en pensez », « je vous laisse faire vos retours » -> donner son avis
  if (/(faire|donner|partager|envoyer|m'envoyer) (tes|vos|ton|votre) (retours?|avis|feedbacks?)|(dire|dites|dis)(-moi)? ce que (tu|vous) en (penses|pensez)|qu'en (penses-tu|pensez-vous)\s*\?|let me know what you think|(share|send) (me )?your (feedback|thoughts)/.test(f) && !ctx.inList) {
    const subj = (ctx.subject || '').replace(/^((re|tr|fw|fwd)\s*:\s*)+/i, '').trim();
    const who = ctx.senderFirstName;
    const title = lang === 'en' ? `Give feedback${who ? ` to ${who}` : ''}${subj ? `: ${subj}` : ''}` : `Donner mon avis${who ? ` à ${who}` : ''}${subj ? ` : ${subj}` : ''}`;
    let score = 3.5;
    if (addressedToOther) score -= 6;
    if (ctx.notForMe && !addressedToMe) score -= ctx.notForMe;
    if (score >= THRESHOLD) return { score, title: truncate(title, 90), subtasks: [], extra: [], why: ['avis'], due: parseDue(s, ctx.now || new Date()), flags, verb: { inf: 'donner' }, sentence: sentence.trim(), difficulty: 2 };
  }

  if (/^(veuillez trouver|vous trouverez|tu trouveras|tu trouveras|please find|find attached|you will find|you'll find|je vous prie de trouver|je te prie de trouver)/.test(f)) {
    return { score: -3, title: null, why: ['pj'] };
  }

  let score = 0;
  let core = null;
  let req = null;
  for (const r of REQUESTS) {
    const m = f.match(r.re);
    if (m) {
      req = r;
      core = s.slice(m[0].length).trim();
      score += r.score;
      why.push('demande');
      break;
    }
  }

  let verb = null;
  if (req) {
    const coreF = fold(core);
    const cm = coreF.match(CLITIC);
    const clitic = cm ? cm[0] : '';
    const afterClitic = core.slice(clitic.length);
    verb = req.need ? null : detectVerb(afterClitic, { lang, allowMorph: true, gerund: !!req.gerund });
    if (req.need) {
      // « J'aurais besoin des chiffres » -> Fournir les chiffres à Jean ; « besoin de valider X » -> Valider X
      const needCore = core.replace(/^(de |d'|d’)/i, '');
      const v = /^(de |d'|d’)/i.test(core) ? detectVerb(needCore, { lang }) : null;
      if (v && !['avoir', 'recevoir', 'recuperer', 'obtenir', 'get', 'have', 'receive'].includes(v.inf)) {
        verb = { ...v, preClitics: [], rest: needCore.slice(v.word.length).trim() };
      } else {
        const obj = v ? needCore.slice(v.word.length).trim() : core;
        verb = {
          inf: lang === 'en' ? 'send' : 'fournir', lang, clitics: [], preClitics: ['me'], kind: 'need',
          rest: obj.replace(/^(des |du |de la |de l'|d'un |d'une |de |d')/i, (x) => ({ 'des ': 'les ', 'du ': 'le ', 'de la ': 'la ', "de l'": "l'", "d'un ": 'un ', "d'une ": 'une ' }[x.toLowerCase()] ?? '')),
        };
      }
    } else if (verb) {
      verb.preClitics = clitic.trim().split(/\s+/).filter(Boolean).map((c) => c.replace(/'$/, ''));
      verb.rest = afterClitic.slice(verb.word.length).trim();
    } else if (req.any) {
      verb = { inf: null, lang, clitics: [], preClitics: [], rest: core, kind: 'label' };
    } else if (req.needsVerb) {
      score -= 6; // « Merci de ton retour »
      why.push('merci-de-nom');
    } else {
      score -= 1.5;
      why.push('demande-sans-verbe');
    }
    if (verb && REPLY_ONLY.test(fold(afterClitic))) {
      score -= 1.5;
      why.push('simple-reponse');
    }
  } else {
    verb = detectVerb(s, { lang });
    if (verb) {
      verb.preClitics = [];
      verb.rest = s.slice(verb.word.length).trim();
      if (verb.kind === 'imperative' || verb.kind === 'en') {
        // Anglais : « Report attached » / « Update: the deck is ready » ne sont pas des ordres
        const next = fold(verb.rest).split(/\s+/)[0] || '';
        if (verb.lang === 'en' && /^(is|are|was|were|has|have|had|attached|below|above|ready|done|sent|:)$/.test(next)) verb = null;
        else if (verb.lang === 'fr' && /^(est|sont|etait|a|ont|:|de la|du)$/.test(next)) verb = null;
        else { score += 3; why.push('imperatif'); }
      } else if (verb.kind === 'infinitive') {
        score += ctx.inList ? 3 : 2.5;
        why.push('infinitif');
      }
    }
  }

  for (const n of NEGATIVES) {
    if (n.re.test(f)) {
      if (n.unlessRequest && req && verb) continue;
      if (req && verb && n.why === 'pj') continue;
      if (req && verb && n.why === 'question') continue;
      if (req && verb && n.why === 'constat') continue;
      score += n.score;
      why.push(n.why);
    }
  }

  const due = parseDue(s, ctx.now || new Date());
  if (due.due && score > 0) { score += 1; why.push('echeance'); }
  if (due.urgency === 'urgent' || flags.urgent) { if (score > 0) score += 0.5; flags.urgent = true; }

  const wc = wordCount(s);
  if (wc < 2) { score -= 3; why.push('trop-court'); }
  if (wc > 55) { score -= 1.5; why.push('trop-long'); }
  if (/^(https?:\/\/|www\.)\S+$/.test(s)) score -= 5;
  if (addressedToOther) { score -= 6; why.push('autre-destinataire'); }
  if (ctx.notForMe && !addressedToMe) { score -= ctx.notForMe; why.push('pas-pour-moi'); }
  if (/:\s*$/.test(s) && !req && !ctx.inList) { score -= 2; why.push('etiquette'); }
  if (ctx.source === 'mail' && /^[a-zà-ÿ]/.test(sentence.trim()) && !ctx.inList) { score -= 1; why.push('fragment'); }
  if ((s.match(/\)/g) || []).length > (s.match(/\(/g) || []).length) { score -= 2; why.push('fragment'); }
  if (ctx.listBoost) score += ctx.listBoost;

  if (score < THRESHOLD || !verb) return { score, title: null, why, due, flags };

  const built = buildTitle(verb, { ...ctx, lang: verb.lang || lang, due });
  if (!built.title || wordCount(built.title) < 1) return { score, title: null, why: [...why, 'titre-vide'], due, flags };
  return { score, why, due, flags, verb, ...built, sentence: sentence.trim() };
}

// ---------------------------------------------------------------------------
// 5. Construction du titre
// ---------------------------------------------------------------------------
function splitEnumeration(rest) {
  // « des nouvelles ads sur Facebook, Instagram et TikTok »
  const m = rest.match(/^(.*\b(?:sur|pour|dans|aux|chez|via|on|for|in|to|across|de|des|du)\s+)(?:(?:les|la|le|l'|the)\s+)?([^,;:]+?(?:\s*,\s*[^,;:]+?)+(?:\s*,?\s+(?:et|and|ou|or|&)\s+[^,;:]+?)|[A-ZÀ-Ý][\p{L}\d.'-]*(?:\s[A-ZÀ-Ý][\p{L}\d.'-]*)?\s+(?:et|and|&)\s+[A-ZÀ-Ý][\p{L}\d.'-]*(?:\s[A-ZÀ-Ý][\p{L}\d.'-]*)?)\s*$/u);
  if (!m) return null;
  const items = m[2].split(/\s*,\s*|\s+(?:et|and|ou|or|&)\s+/).map((x) => x.trim()).filter(Boolean);
  if (items.length < 2 || items.some((it) => wordCount(it) > 5)) return null;
  return items.map((it) => capitalize(it.replace(/^(les?|la|l'|the)\s+/i, '')));
}

function splitActions(rest, lang) {
  // « envoyer le devis et appeler le client » -> 2 actions
  const parts = rest.split(/\s*(?:,\s*)?\b(?:et|puis|ensuite|and|then|plus)\s+(?:(?:aussi|also|egalement|également)\s+)?(?=[\p{L}'’]+)/u);
  if (parts.length < 2) return null;
  const out = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    const cm = fold(parts[i]).match(CLITIC);
    const v = detectVerb(parts[i].slice(cm ? cm[0].length : 0), { lang });
    if (v && (v.kind === 'infinitive' || v.kind === 'en' || v.kind === 'imperative')) out.push(parts[i]);
    else out[out.length - 1] += (/^,/.test(parts[i]) ? '' : ' et ') + parts[i];
  }
  return out.length > 1 ? out : null;
}

function removeDatePhrase(text, due) {
  let t = text;
  for (const phrase of [due?.phrase, due?.timePhrase]) {
    if (!phrase) continue;
    const ft = fold(t);
    const idx = ft.indexOf(phrase);
    if (idx >= 0 && !/\b(de|du|d'|of)\s*$/i.test(t.slice(0, idx))) {
      const before = t.slice(0, idx).replace(/[\s,]*(\b(avant|pour|d'ici|d’ici|dès|des|jusqu'à|jusqu'a|au plus tard|max|maximum|by|before|until|on|for|due|le|la|the|ce|cette|à|a|vers|at)\b[\s,]*)*$/i, '');
      t = (before + ' ' + t.slice(idx + phrase.length)).replace(/\s+/g, ' ').trim();
    }
  }
  t = t.replace(/[\s,]*\b(au plus tard|si possible|asap|au plus vite|dès que possible|des que possible|en urgence|urgemment|rapidement|en priorité|en priorite|tout de suite|immédiatement|immediatement|as soon as possible|right away)\b/gi, '');
  return t.replace(/\s+/g, ' ').trim();
}

function buildTitle(verb, ctx) {
  const lang = verb.lang;
  const sender = ctx.senderFirstName;
  let rest = verb.rest || '';
  rest = stripPoliteTail(rest);
  rest = removeDatePhrase(rest, ctx.due);
  rest = stripPoliteTail(rest);

  if (lang === 'en' && /^(me|us)\b\s*/i.test(rest) && !DIRECT_OBJECT_VERBS.has(verb.inf)) {
    rest = rest.replace(/^(me|us)\b\s*/i, '');
    verb.preClitics = [...(verb.preClitics || []), 'me'];
  } else if (lang === 'en' && /^(me|us)\b\s*/i.test(rest)) {
    rest = rest.replace(/^(me|us)\b\s*/i, '');
    verb.preClitics = [...(verb.preClitics || []), 'me'];
  }
  const allClitics = [...(verb.preClitics || []).map(fold), ...(verb.clitics || [])];
  const toSender = allClitics.some((c) => ['me', 'm', 'moi', 'nous'].includes(c));
  const reflexive = allClitics.some((c) => ['te', 't', 'toi'].includes(c)) && lang === 'fr';
  const objClitic = allClitics.find((c) => ['le', 'la', 'les', 'l', 'lui', 'leur', 'en', 'y'].includes(c));

  let head;
  if (verb.kind === 'label') head = '';
  else if (lang === 'en') head = verb.inf;
  else head = verb.kind === 'morph' ? verb.pretty : prettyInfinitive(verb.inf);

  if (lang === 'fr' && head) {
    if (objClitic) head = (objClitic === 'l' ? "l'" : objClitic + ' ') + head;
    if (reflexive) head = (/^[aeiouyhéè]/i.test(head) ? "s'" : 'se ') + head;
  }

  // 2e personne -> 1re personne (« ta présentation » -> « ma présentation »)
  for (const [re, rep] of SECOND_TO_FIRST) rest = rest.replace(re, rep);
  rest = rest.replace(/\b(stp|svp|please|pls)\b/gi, '').replace(/\s+/g, ' ').trim();

  // Plusieurs actions dans la même phrase
  const actions = verb.kind !== 'label' ? splitActions(rest, lang) : null;
  let extra = [];
  if (actions) {
    rest = actions[0];
    extra = actions.slice(1).map((a) => {
      const cm = fold(a).match(CLITIC);
      const clit = cm ? cm[0] : '';
      const v = detectVerb(a.slice(clit.length), { lang });
      if (!v) return null;
      v.preClitics = clit.trim().split(/\s+/).filter(Boolean).map((c) => c.replace(/'$/, ''));
      v.rest = a.slice(clit.length + v.word.length).trim();
      return buildTitle(v, ctx);
    }).filter(Boolean);
  }

  const subtasks = splitEnumeration(rest) || [];

  let title = [head, rest].filter(Boolean).join(' ');
  if (toSender && sender) {
    const recipient = lang === 'en' ? ` to ${sender}` : ` à ${sender}`;
    if (DIRECT_OBJECT_VERBS.has(verb.inf) && !rest) title = `${head} ${sender}`;
    else if (DIRECT_OBJECT_VERBS.has(verb.inf)) title = `${head} ${sender} ${rest}`;
    else if (!new RegExp(`\\b${sender}\\b`, 'i').test(title)) title += recipient;
  }
  title = title.replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ').trim();

  // Objet vague (« Gère ça stp ») -> on ajoute le sujet du mail
  const restF = fold(rest);
  if (ctx.subject && (!rest || /^(ca|ça|cela|ceci|ce point|ce sujet|ce truc|tout ca|this|that|it|this one|le sujet|la demande|ce mail|cette demande|ca stp|le necessaire)$/.test(restF) || wordCount(title) <= 1)) {
    const subj = ctx.subject.replace(/^((re|tr|fw|fwd|réf|ref)\s*:\s*)+/i, '').trim();
    if (subj) title = `${head ? capitalize(head) : ''}${head ? ' : ' : ''}${subj}`;
  }

  return { title: truncate(capitalize(title), 90), subtasks, extra };
}

// ---------------------------------------------------------------------------
// 6. Difficulté, priorité, tags
// ---------------------------------------------------------------------------
export function estimateDifficulty({ title, subtasks = [], verbInf = null, description = '' }) {
  const t = fold(title + ' ' + description);
  let d = 2;
  if (verbInf && EASY_VERBS.has(verbInf)) d = 1.5;
  if (verbInf && HARD_VERBS.has(verbInf)) d = 3.2;
  if (HARD_OBJECTS.some((o) => new RegExp(`\\b${o.replace('-', '[ -]')}s?\\b`).test(t))) d += 0.9;
  if (EASY_HINTS.some((o) => new RegExp(`\\b${o}\\b`).test(t))) d -= 0.8;
  if (/\b(tout|toute|tous|toutes|complet|complete|entier|entiere|entierement|refonte|from scratch|de zero|global|globale|full|entire|whole)\b/.test(t)) d += 0.6;
  if (subtasks.length > 2) d += Math.min(1.5, (subtasks.length - 2) * 0.4);
  if (wordCount(title) > 12) d += 0.3;
  return Math.max(1, Math.min(5, Math.round(d)));
}

const TAG_RULES = [
  ['ads', /\b(ads?|pubs?|publicites?|campagnes?|meta|facebook ads|google ads|tiktok ads|creas?|creatives?|creatifs?|ugc|cpm|cpc|roas|budget ads|media ?buying|sponsoris)/],
  ['réseaux', /\b(instagram|insta|tiktok|linkedin|facebook|twitter|reels?|stories|story|posts?|reseaux sociaux|social media|pinterest|youtube)\b/],
  ['client', /\b(clients?|customers?|prospects?|leads?)\b/],
  ['finance', /\b(factures?|invoices?|devis|paiements?|payer|payment|budget|compta|comptabilite|remboursements?|notes? de frais|tva|virement|quote)\b/],
  ['réunion', /\b(reunions?|meetings?|calls?|rdv|rendez-vous|visio|point|weekly|daily|sync|comite|copil)\b/],
  ['design', /\b(design|visuels?|maquettes?|figma|logo|charte|mockups?|banni[eè]res?|bannieres?|creas?)\b/],
  ['vidéo', /\b(videos?|montages?|tournages?|shooting|rushs?|reels?|motion)\b/],
  ['web', /\b(site|landing|pages?|web|shopify|wordpress|seo|url|lien|links?|website|checkout)\b/],
  ['reporting', /\b(reporting|rapports?|reports?|dashboards?|kpis?|chiffres|stats|statistiques|analytics|resultats|bilan)\b/],
  ['email', /\b(newsletters?|emailing|mailing|klaviyo|brevo|mailchimp|sequences?)\b/],
  ['produit', /\b(produits?|stocks?|packagings?|commandes?|livraisons?|logistique|fiches? produit)\b/],
  ['rh', /\b(recrutements?|candidats?|entretiens?|onboarding|contrats?|conges)\b/],
];
export function guessTags(text) {
  const f = fold(text);
  return TAG_RULES.filter(([, re]) => re.test(f)).map(([t]) => t).slice(0, 3);
}

export function computePriority({ urgency, due, now = new Date() }) {
  let p = 3;
  if (urgency === 'urgent') p = 1;
  else if (urgency === 'important') p = 2;
  else if (urgency === 'low') p = 4;
  if (due && p > 2) {
    const h = (new Date(due) - now) / 3600e3;
    if (h <= 30) p = 2;
  }
  return p;
}

const ICON_RULES = [
  ['megaphone', /\b(ads?|pubs?|campagnes?|creas?|meta|annonces?)\b/],
  ['mail', /\b(mail|email|envoyer|send|repondre|reply|newsletter)\b/],
  ['phone', /\b(appeler|rappeler|call|telephoner|tel)\b/],
  ['receipt', /\b(factures?|devis|payer|paiement|invoice|budget)\b/],
  ['presentation', /\b(presentation|deck|slides?|pitch)\b/],
  ['video', /\b(videos?|montage|tournage|reels?)\b/],
  ['palette', /\b(design|visuels?|maquettes?|logo|figma|banniere)\b/],
  ['chart', /\b(reporting|rapport|dashboard|kpis?|chiffres|stats|analyse)\b/],
  ['globe', /\b(site|landing|web|seo|page)\b/],
  ['users', /\b(reunion|meeting|rdv|point|equipe)\b/],
  ['check', /\b(valider|verifier|checker|check|relire|review)\b/],
];
// Couleurs de la palette Notion
const COLOR_BY_TAG = { ads: 'purple', 'réseaux': 'pink', client: 'orange', finance: 'green', 'réunion': 'blue', design: 'pink', 'vidéo': 'red', web: 'blue', reporting: 'brown', email: 'blue', produit: 'orange', rh: 'green' };
export function guessIcon(text) {
  const f = fold(text);
  const hit = ICON_RULES.find(([, re]) => re.test(f));
  return hit ? hit[0] : 'sword';
}
export function guessColor(tags, priority) {
  if (priority === 1) return 'red';
  for (const t of tags) if (COLOR_BY_TAG[t]) return COLOR_BY_TAG[t];
  return 'default';
}

// ---------------------------------------------------------------------------
// Demandes implicites
// ---------------------------------------------------------------------------
const SOFT_ASKS = [
  { kind: 'help', re: /besoin de (ton|votre|vos) (aide|coup de main|expertise|input|lumieres|regard)|(need|could use) your help/ },
  { kind: 'review', re: /\b(mes|nos) propositions\b|pour (validation|relecture|avis)\b|\ba (valider|relire)\b|en attente de (ta|votre) validation|\bfor (your )?(review|approval)\b|ready for review/ },
  { kind: 'feedback', re: /(dites|dis)-?moi ce que (vous|tu) en (pensez|penses)|qu'en (penses-tu|pensez-vous)|\b(vos|tes) retours\b|\b(ton|votre) avis\b|let me know what you think|your (feedback|thoughts)|what do you think/ },
  { kind: 'slot', re: /\b(une |des )?dispos?\b[^.?!]*\?|\bdisponibles?\b[^.?!]*\?|\bun creneau\b|quand (es-tu|etes-vous|seriez-vous|serais-tu) (dispo|disponible)|are you (free|available)|do you have (some )?time/ },
  { kind: 'reply', re: /(seriez|serais|etes|es)-(vous|tu) (ouverte?s?|interessee?s?|partante?s?|ok|d'accord)|est-ce que (ca|cela) (vous|te) (interesse|tente|dit|parle)|si (le projet|ca|cela|l'idee) (vous|te) (parle|tente|interesse)|would you be (interested|open)|are you interested/ },
];

function findSoftAsk(units, { lang, sender, subject }) {
  const subj = (subject || '').replace(/^((re|tr|fw|fwd)\s*:\s*)+/i, '').trim() || 'ce mail';
  const who = sender || (lang === 'en' ? 'them' : "l'expéditeur");
  const sentences = units.flatMap((u) => (u.type === 'sentence' ? [u.text] : [u.intro, ...u.items].filter(Boolean)));
  for (const { kind, re } of SOFT_ASKS) {
    const hit = sentences.find((x) => re.test(fold(x)));
    if (!hit) continue;
    let title;
    let difficulty = 2;
    if (kind === 'help') {
      const at = fold(hit).search(re);
      const tail = hit.slice(Math.max(0, at));
      const m = lang === 'en'
        ? tail.match(/\b(on|with|for)\s+(.{6,80}?)(?:[.!?,;]|$)/i)
        : tail.match(/\b(?:c'est |c’est )?(sur|pour|avec)\s+((?:la|le|les|l'|l’|ce|cette|ces|mon|ma|mes|notre|nos)\b.{4,80}?)(?:[.!?,;]|\s+(?:où|et|car|mais|on|nous|je)\s|$)/i);
      title = lang === 'en' ? `Help ${who}${m ? ` ${m[1]} ${m[2]}` : `: ${subj}`}` : `Aider ${who}${m ? ` ${m[1].toLowerCase()} ${m[2]}` : ` : ${subj}`}`;
      difficulty = 3;
    } else if (kind === 'review') title = lang === 'en' ? `Review: ${subj}` : `Relire et valider : ${subj}`;
    else if (kind === 'feedback') title = lang === 'en' ? `Give feedback to ${who}: ${subj}` : `Donner mon avis à ${who} : ${subj}`;
    else if (kind === 'slot') { title = lang === 'en' ? `Suggest a slot to ${who}: ${subj}` : `Proposer un créneau à ${who} : ${subj}`; difficulty = 1; }
    else { title = lang === 'en' ? `Reply to ${who}: ${subj}` : `Répondre à ${who} : ${subj}`; difficulty = 1; }
    return { title: truncate(title, 90), description: hit.trim(), verbInf: null, difficulty };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------
/**
 * @param {object} msg { id, threadId, source:'mail'|'chat', from:{name,email}, subject, date, text, html, headers }
 * @param {object} opts { now, userEmail, userName }
 */
export function extractTasks(msg, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const source = msg.source || 'mail';
  const cls = source === 'mail' ? classifyMessage(msg, opts) : { skip: msg.fromSelf ? 'self' : null };
  if (cls.skip) return { skipped: cls.skip, tasks: [] };

  const senderFirstName = firstName(msg.from);
  const userFirstName = (opts.userName || '').trim().split(/\s+/)[0] || null;
  const subject = (msg.subject || '').trim();

  let body;
  let forwarded = false;
  let contextSender = senderFirstName;
  let forwardOnly = false;
  if (source === 'mail' || source === 'manual') {
    // texte collé : on retire aussi signatures, citations et mentions légales
    const cleaned = cleanEmailBody({ text: msg.text, html: msg.html });
    body = cleaned.body;
    forwarded = cleaned.forwarded;
    if (forwarded && wordCount(body) < 3 && cleaned.rest) {
      // Transfert sans message : on analyse le mail d'origine
      const orig = cleaned.rest;
      const fromLine = orig.match(/^(?:de|from)\s*:\s*"?([^"<\n]+)/im);
      if (fromLine) contextSender = firstName({ name: fromLine[1].trim() });
      forwardOnly = true;
      const bodyStart = orig.split('\n').findIndex((l, k, arr) => k > 0 && !/^\s*(de|from|date|envoy[ée]|sent|objet|subject|[àa]|to|cc)\s*:/i.test(l) && /^\s*(de|from|date|envoy[ée]|sent|objet|subject|[àa]|to|cc)\s*:/i.test(arr[k - 1] || ''));
      body = cleanEmailBody({ text: orig.split('\n').slice(Math.max(0, bodyStart)).join('\n') }).body;
    }
  } else {
    body = normalizeSpaces(msg.text || '').trim();
  }
  const fwdSubject = forwarded ? forwardedSubject(msg.text || '') : null;

  // À qui s'adresse le mail ? (« Hello Marie, » alors que je suis en copie -> pas pour moi)
  // En copie explicite = pas le destinataire principal ; reçu via un alias / une liste = destinataire.
  const userInTo = !msg.to || !opts.userEmail ? true : addressListIncludes(msg.to, opts.userEmail) || !addressListIncludes(msg.cc, opts.userEmail);
  const greet = fold(body.split('\n').find((l) => l.trim()) || '').match(/^(bonjour|bonsoir|hello|salut|coucou|hey|hi|dear|cher|chere)\s+([^,!:.]{2,60})/);
  let greetedOthers = false;
  if (greet && userFirstName && !forwardOnly && !/\b(a tous|a toutes|tout le monde|team|equipe|everyone|all|les (filles|gars|amis|equipes?)|vous)\b/.test(greet[2])) {
    const names = greet[2].split(/\s*(?:,|&|\bet\b|\band\b)\s*/).map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);
    greetedOthers = names.length > 0 && !names.includes(fold(userFirstName));
  }
  const notForMe = greetedOthers ? (userInTo ? 1.5 : 4) : userInTo ? 0 : 1.5;
  const lang = detectLang(subject + ' ' + body);
  const subjDue = parseDue(subject, now);
  const subjectUrgent = subjDue.urgency === 'urgent';

  const baseCtx = { now, lang, senderFirstName: contextSender, userFirstName, subject: fwdSubject || subject, notForMe, source };
  const found = [];
  const push = (res, extra = {}) => {
    const due = res.due?.due || extra.due || null;
    const urgency = res.flags?.urgent || subjectUrgent ? 'urgent' : res.due?.urgency || extra.urgency || null;
    const subtasks = (extra.subtasks || res.subtasks || []).map((t) => ({ title: t }));
    const description = [extra.intro, res.sentence].filter(Boolean).join('\n');
    found.push({
      title: res.title,
      description,
      subtasks,
      dueAt: due ? new Date(due).toISOString() : null,
      urgency,
      verbInf: res.verb?.inf || null,
      difficulty: res.difficulty || null,
      confidence: Math.min(1, Math.max(0.3, (res.score - 1) / 4)),
    });
    for (const x of res.extra || []) {
      found.push({ title: x.title, description, subtasks: (x.subtasks || []).map((t) => ({ title: t })), dueAt: due ? new Date(due).toISOString() : null, urgency, verbInf: null, confidence: 0.6 });
    }
  };

  // Notification d'assignation (Asana, Jira, Notion…) -> une tâche avec le sujet
  if (cls.assignment) {
    const t = subject.replace(/^\[[^\]]+\]\s*/, '').replace(/^(.*?(assigned (to )?you|vous a assigné|t'a assigné)\s*:?\s*)/i, '').trim();
    if (t) found.push({ title: truncate(capitalize(t), 90), description: subject, subtasks: [], dueAt: subjDue.due ? subjDue.due.toISOString() : null, urgency: subjDue.urgency, verbInf: null, confidence: 0.7 });
  }

  const units = segment(body);
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (u.type === 'sentence') {
      const res = analyzeSentence(u.text, baseCtx);
      if (res.title) {
        // « C'est pour ce soir ! » juste après : on rattache l'échéance
        const next = units[i + 1];
        let due = null;
        if (next && next.type === 'sentence' && wordCount(next.text) <= 10) {
          const nd = parseDue(next.text, now);
          const nr = analyzeSentence(next.text, baseCtx);
          if (!nr.title) {
            if (nd.due && !res.due?.due && nd.urgency !== 'urgent') due = nd.due;
            if (nd.urgency) {
              res.due = { ...res.due, urgency: nd.urgency };
              if (nd.urgency === 'urgent') res.flags = { ...res.flags, urgent: true };
              if (nd.urgency === 'urgent' && !res.due?.due) due = nd.due;
            }
          }
        }
        push(res, { due });
      }
      continue;
    }
    // Listes
    const introRes = u.intro ? analyzeSentence(u.intro.replace(/:\s*$/, ''), baseCtx) : null;
    const introDue = u.intro ? parseDue(u.intro, now) : { due: null };
    const isTodoHeader = u.intro && TODO_HEADER.test(fold(u.intro.replace(/:\s*$/, '').trim()));
    const itemRes = u.items.map((it) => analyzeSentence(it, { ...baseCtx, inList: true, listBoost: isTodoHeader || introRes?.title ? 0.5 : 0 }));
    const verbItems = itemRes.filter((r) => r.title);
    if (isTodoHeader) {
      u.items.forEach((it, k) => {
        const r = itemRes[k];
        if (r.title) return push(r, { due: introDue.due, urgency: introDue.urgency, intro: u.intro });
        const t = stripPoliteTail(removeDatePhrase(it.replace(/\s*\([^)]*\)?\s*$/, '').replace(/\s*\([^)]*\)\s*/g, ' '), parseDue(it, now)));
        const itemDue = parseDue(it, now);
        if (wordCount(t) >= 1 && wordCount(t) <= 20 && r.score > -3) found.push({ title: truncate(capitalize(t), 90), description: `${u.intro}\n${it}`, subtasks: [], dueAt: (itemDue.due || introDue.due) ? new Date(itemDue.due || introDue.due).toISOString() : null, urgency: itemDue.urgency || introDue.urgency, verbInf: null, confidence: 0.6 });
      });
    } else if (verbItems.length && verbItems.length >= Math.ceil(u.items.length / 2)) {
      for (const r of verbItems) push(r, { due: introDue.due, urgency: introDue.urgency, intro: u.intro });
    } else if (introRes?.title) {
      push({ ...introRes, title: introRes.title.replace(/\s*:$/, '') }, { subtasks: u.items.map((x) => capitalize(stripPoliteTail(x))), intro: null });
    }
  }

  // Demandes implicites (avis, dispo, aide, validation) quand rien d'explicite n'a été trouvé
  if (!found.length && source === 'mail' && !(greetedOthers && !userInTo) && userInTo) {
    const soft = findSoftAsk(units, { lang, sender: contextSender, subject: fwdSubject || subject });
    if (soft) found.push({ ...soft, subtasks: [], dueAt: null, urgency: null, confidence: 0.55 });
  }

  // Dédoublonnage
  const tasks = [];
  for (const t of found) {
    const dup = tasks.find((x) => similarity(x.title, t.title) >= 0.75);
    if (dup) {
      if (!dup.dueAt && t.dueAt) dup.dueAt = t.dueAt;
      continue;
    }
    tasks.push(t);
  }

  return {
    skipped: null,
    tasks: tasks.map((t) => {
      const tags = guessTags(t.title + ' ' + t.description + ' ' + t.subtasks.map((s) => s.title).join(' '));
      const priority = computePriority({ urgency: t.urgency, due: t.dueAt, now });
      return {
        title: t.title,
        description: t.description,
        subtasks: t.subtasks,
        dueAt: t.dueAt,
        priority,
        difficulty: t.difficulty || estimateDifficulty({ title: t.title, subtasks: t.subtasks, verbInf: t.verbInf, description: t.description }),
        tags,
        icon: guessIcon(t.title + ' ' + tags.join(' ')),
        color: guessColor(tags, priority),
        confidence: Math.round(t.confidence * 100) / 100,
        source,
        sourceMeta: {
          id: msg.id || null,
          threadId: msg.threadId || null,
          from: msg.from || null,
          subject: subject || null,
          date: msg.date || null,
          url: msg.url || null,
          space: msg.space || null,
        },
      };
    }),
  };
}

/** Texte libre collé par l'utilisateur. */
export function extractTasksFromText(text, opts = {}) {
  return extractTasks({ source: 'manual', text, from: null, subject: '' }, opts);
}
