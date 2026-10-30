// Petites fonctions texte partagées.

/** minuscule + sans accents + apostrophes normalisées */
export function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`´]/g, "'")
    .toLowerCase();
}

export function normalizeSpaces(s) {
  return String(s || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿­͏]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n');
}

export function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function wordCount(s) {
  return (String(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

const FR_STOP = /\b(le|la|les|des|une|est|pour|avec|dans|sur|pas|vous|tu|nous|merci|bonjour|stp|svp|ce|cette|demain|ton|ta|tes)\b/g;
const EN_STOP = /\b(the|and|you|your|for|with|please|thanks|this|that|can|could|tomorrow|hi|is|are|of|to)\b/g;

export function detectLang(s) {
  const t = fold(s);
  const fr = (t.match(FR_STOP) || []).length;
  const en = (t.match(EN_STOP) || []).length;
  return en > fr * 1.2 ? 'en' : 'fr';
}

export function truncate(s, max = 90) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…';
}

/** Similarité de Jaccard sur les mots (pour dédoublonner). */
export function similarity(a, b) {
  const A = new Set(fold(a).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const B = new Set(fold(b).split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Conversion HTML -> texte lisible (listes, paragraphes, sauts de ligne). */
export function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Bloc cité (réponses précédentes) : on le marque pour le couper ensuite.
  s = s.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '\n\n[[QUOTE]]\n\n');
  s = s.replace(/<div[^>]*class="?[^">]*gmail_quote[^">]*"?[^>]*>/gi, '\n\n[[QUOTE]]\n\n');
  s = s.replace(/<div[^>]*class="?[^">]*gmail_signature[^">]*"?[^>]*>/gi, '\n\n[[SIGNATURE]]\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '\n- ');
  s = s.replace(/<\/(p|div|h[1-6]|tr|table|ul|ol|li|section|article|header|footer)>/gi, '\n');
  s = s.replace(/<(p|div|h[1-6]|tr|table|ul|ol|section|article|header|footer)[^>]*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s.replace(/\n{3,}/g, '\n\n').trim();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', acirc: 'â', ccedil: 'ç', ocirc: 'ô', ucirc: 'û', ugrave: 'ù', icirc: 'î', iuml: 'ï', euml: 'ë', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', euro: '€', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', Eacute: 'É', Agrave: 'À', Ccedil: 'Ç' };
export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => (n in ENTITIES ? ENTITIES[n] : m));
}
