// Détection d'échéances en français et en anglais : « ce soir », « avant vendredi »,
// « d'ici 15h », « le 12/11 », « by Friday », « ASAP »…

import { fold } from './text.js';

const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = {
  janvier: 0, janv: 0, jan: 0, january: 0,
  fevrier: 1, fevr: 1, fev: 1, feb: 1, february: 1,
  mars: 2, mar: 2, march: 2,
  avril: 3, avr: 3, apr: 3, april: 3,
  mai: 4, may: 4,
  juin: 5, jun: 5, june: 5,
  juillet: 6, juil: 6, jul: 6, july: 6,
  aout: 7, aug: 7, august: 7,
  septembre: 8, sept: 8, sep: 8, september: 8,
  octobre: 9, oct: 9, october: 9,
  novembre: 10, nov: 10, november: 10,
  decembre: 11, dec: 11, december: 11,
};
const NUM_WORDS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, dix: 10, quinze: 15, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, a: 1, an: 1 };

const DEFAULT_HOUR = 18;

function at(base, days, hour, minute = 0) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const URGENT = /\b(urgent|urgente|urgemment|asap|a\.s\.a\.p|au plus vite|des que possible|le plus vite possible|le plus rapidement possible|immediatement|tout de suite|right away|immediately|as soon as possible|sans tarder|en urgence|critique|bloquant|blocking|critical|top priorite)\b|!!!/;
const LOW = /\b(pas urgent|pas presse|rien d'urgent|quand tu (as|auras|peux) (le temps|un moment|5 ?min|deux minutes)|quand tu peux|a l'occasion|si tu as le temps|si tu as un moment|no rush|not urgent|when you (get a chance|have time|can)|whenever you can|low priority)\b/;
const IMPORTANT = /\b(important|importante|prioritaire|priorite|en priorite|rapidement|vite|high priority|priority|important)\b/;

/**
 * @param {string} text
 * @param {Date} now
 * @returns {{ due: Date|null, phrase: string|null, urgency: 'urgent'|'important'|'low'|null, hasTime: boolean }}
 */
export function parseDue(text, now = new Date()) {
  const f = fold(text).replace(/\s+/g, ' ');
  let due = null;
  let phrase = null;
  let hasTime = false;
  let relative = false;

  const setDue = (d, m, timed = false) => {
    if (!due) {
      due = d;
      phrase = m;
      hasTime = timed;
    }
  };

  let m;
  // --- relatifs : ce soir, aujourd'hui, demain… --------------------------------
  if ((m = f.match(/\b(ce soir|cette nuit|tonight|this evening|avant de partir ce soir)\b/))) setDue(at(now, 0, 20), m[0]);
  if ((m = f.match(/\b(ce matin|this morning)\b/))) setDue(at(now, 0, 12), m[0]);
  if ((m = f.match(/\b(cet (apres-midi|apres midi|aprem)|this afternoon)\b/))) setDue(at(now, 0, 17), m[0]);
  if ((m = f.match(/\b(apres-demain|apres demain|day after tomorrow)\b/))) setDue(at(now, 2, DEFAULT_HOUR), m[0]);
  if ((m = f.match(/\b(demain|tomorrow)( (matin|midi|apres-midi|apres midi|soir|morning|afternoon|evening|night))?\b/))) {
    const part = m[3] || '';
    const hour = /matin|morning/.test(part) ? 10 : /midi/.test(part) && !/apres/.test(part) ? 12 : /apres|afternoon/.test(part) ? 15 : /soir|evening|night/.test(part) ? 20 : DEFAULT_HOUR;
    setDue(at(now, 1, hour), m[0]);
  }
  if ((m = f.match(/\b(aujourd'hui|aujourd hui|auj|today|dans la journee|d'ici la fin de (la )?journee|avant la fin de (la )?journee|en fin de journee|fin de journee|eod|end of (the )?day|by end of day|cob)\b/))) setDue(at(now, 0, DEFAULT_HOUR), m[0]);

  // --- dans X heures / jours / semaines ----------------------------------------
  if ((m = f.match(/\b(dans|in) (\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|dix|quinze|one|two|three|four|five|ten|a|an) ?(minutes?|min|heures?|h|hours?|jours?|days?|semaines?|weeks?)\b/) || f.match(/\b(d'ici) (\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|dix|quinze) (jours?|semaines?)\b/))) {
    relative = true;
    const n = /\d/.test(m[2]) ? parseInt(m[2], 10) : NUM_WORDS[m[2]] || 1;
    const unit = m[3];
    const d = new Date(now);
    if (/^min/.test(unit)) d.setMinutes(d.getMinutes() + n);
    else if (/^(h|heure|hour)/.test(unit)) d.setHours(d.getHours() + n);
    else if (/^(jour|day)/.test(unit)) { d.setDate(d.getDate() + n); d.setHours(DEFAULT_HOUR, 0, 0, 0); }
    else { d.setDate(d.getDate() + 7 * n); d.setHours(DEFAULT_HOUR, 0, 0, 0); }
    setDue(d, m[0], /^(min|h|heure|hour)/.test(unit));
  }

  // --- fin de semaine / semaine prochaine / fin du mois --------------------------
  if ((m = f.match(/\b((d'ici |avant |pour |en |a la )?(la )?fin de (la |cette )?semaine|end of (the )?week|by the end of the week|this week|cette semaine)\b/))) {
    const diff = (5 - now.getDay() + 7) % 7; // vendredi
    setDue(at(now, now.getDay() === 6 ? 6 : diff, DEFAULT_HOUR), m[0]);
  }
  if ((m = f.match(/\b((avant |pour |d'ici )?la semaine prochaine|next week|early next week|debut de semaine prochaine)\b/))) {
    const toMonday = ((1 - now.getDay() + 7) % 7) || 7;
    setDue(at(now, toMonday, 10), m[0]);
  }
  if ((m = f.match(/\b((d'ici |avant |pour )?(la )?fin du mois|end of (the )?month)\b/))) {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, 0, DEFAULT_HOUR, 0, 0, 0);
    setDue(d, m[0]);
  }

  // --- jours de la semaine -------------------------------------------------------
  const dayRe = new RegExp(`\\b(?<!black )(?<!cyber )(${DAYS_FR.join('|')}|${DAYS_EN.join('|')})( (prochain|next|matin|soir|apres-midi|midi|morning|afternoon|evening))?\\b`);
  if ((m = f.match(dayRe))) {
    const idx = DAYS_FR.indexOf(m[1]) >= 0 ? DAYS_FR.indexOf(m[1]) : DAYS_EN.indexOf(m[1]);
    const nextKw = /\b(next|prochain)\b/.test(m[0]) || new RegExp(`\\bnext ${m[1]}\\b`).test(f);
    let diff = (idx - now.getDay() + 7) % 7;
    if (nextKw) diff = diff === 0 ? 7 : diff;
    const part = m[3] || '';
    const hour = /matin|morning/.test(part) ? 10 : /midi/.test(part) ? 12 : /apres|afternoon/.test(part) ? 15 : /soir|evening/.test(part) ? 20 : DEFAULT_HOUR;
    setDue(at(now, diff, hour), m[0]);
  }

  // --- dates explicites -----------------------------------------------------------
  if ((m = f.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    setDue(new Date(+m[1], +m[2] - 1, +m[3], DEFAULT_HOUR), m[0]);
  }
  if ((m = f.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/) || f.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/) || f.match(/\b(?:le|du|au|pour|avant|d'ici|on|by) (\d{1,2})\.(\d{1,2})()\b(?![.,]?\d)/)) && !/\d\/\d{1,2}\s?(€|eur|%|k)/.test(f.slice(m.index, m.index + m[0].length + 4))) {
    const dd = +m[1];
    const mm = +m[2];
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      let yy = m[3] ? +m[3] : now.getFullYear();
      if (yy < 100) yy += 2000;
      let d = new Date(yy, mm - 1, dd, DEFAULT_HOUR);
      if (!m[3] && d < at(now, -7, 0)) d = new Date(yy + 1, mm - 1, dd, DEFAULT_HOUR);
      setDue(d, m[0]);
    }
  }
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
  if ((m = f.match(new RegExp(`\\b(?:le |the |on )?(\\d{1,2})(?:er|st|nd|rd|th)? (${monthNames})\\.?(?: (\\d{4}))?\\b`)))) {
    let yy = m[3] ? +m[3] : now.getFullYear();
    let d = new Date(yy, MONTHS[m[2]], +m[1], DEFAULT_HOUR);
    if (!m[3] && d < at(now, -7, 0)) d = new Date(yy + 1, MONTHS[m[2]], +m[1], DEFAULT_HOUR);
    setDue(d, m[0]);
  } else if ((m = f.match(new RegExp(`\\b(${monthNames}) (\\d{1,2})(?:st|nd|rd|th)?\\b`)))) {
    let d = new Date(now.getFullYear(), MONTHS[m[1]], +m[2], DEFAULT_HOUR);
    if (d < at(now, -7, 0)) d = new Date(now.getFullYear() + 1, MONTHS[m[1]], +m[2], DEFAULT_HOUR);
    setDue(d, m[0]);
  }

  // --- heure : « à 15h », « avant 15h30 », « 3pm », « avant midi » ---------------------
  let hm = null;
  let timePhrase = null;
  if (!relative && ((m = f.match(/\b(?:a|avant|pour|vers|d'ici|des|jusqu'a|at|by|before|until) (\d{1,2}) ?h(\d{2})?\b/)) || (m = f.match(/\b(\d{1,2})h(\d{2})\b/)) || (m = f.match(/\b(\d{1,2}):(\d{2})\b/)))) {
    const h = +m[1];
    if (h <= 23) { hm = [h, m[2] ? +m[2] : 0]; timePhrase = m[0]; }
  }
  if (!hm && !relative && (m = f.match(/\b(?:at |by |before )?(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/))) {
    let h = +m[1] % 12;
    if (m[3] === 'pm') h += 12;
    hm = [h, m[2] ? +m[2] : 0];
    timePhrase = m[0];
  }
  if (!hm && (m = f.match(/\b(avant |pour |a |d'ici )?midi\b/)) && !/apres-?midi/.test(f)) { hm = [12, 0]; timePhrase = m[0]; }
  if (hm) {
    if (due) {
      due = new Date(due);
      due.setHours(hm[0], hm[1], 0, 0);
      hasTime = true;
    } else {
      let d = at(now, 0, hm[0], hm[1]);
      if (d < now) d = at(now, 1, hm[0], hm[1]);
      due = d;
      phrase = timePhrase;
      hasTime = true;
    }
  }

  let urgency = null;
  if (LOW.test(f)) urgency = 'low';
  else if (URGENT.test(f)) urgency = 'urgent';
  else if (IMPORTANT.test(f)) urgency = 'important';

  if (urgency === 'urgent' && !due) {
    const d = at(now, 0, DEFAULT_HOUR);
    due = d < now ? new Date(now.getTime() + 2 * 3600e3) : d;
    phrase = null;
  }

  return { due, phrase: phrase ? phrase.trim() : null, urgency, hasTime };
}

/** Clé jour local AAAA-MM-JJ */
export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function isSameDay(a, b) {
  return dayKey(a) === dayKey(b);
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
