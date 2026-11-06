// Google Agenda lu et modifié directement dans Chrome (sans fenêtre), sans clé API.
// Lecture : l'export officiel de Google Agenda (Paramètres > Exporter, comme si tu cliquais
// sur le bouton), un .ics par agenda ; à défaut, les événements affichés dans les pages
// « semaine » de Google Agenda.
// Actions : les mêmes clics que toi dans Google Agenda (créer, renommer, supprimer).

import { unzip } from './zip.js';
import { parseIcs, expandCalendar, calendarIdFromFile } from './ics.js';
import { UiError, NotLoggedInError, onLoginPage } from './chrome.js';

export const CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';
const PALETTE = ['#2383E2', '#448361', '#D9730D', '#9065B0', '#C14C8A', '#CB912F', '#D44C47', '#337EA9', '#787774'];

const SAVE = '^(enregistrer|save|guardar|speichern|salva|opslaan|salvar)$';
const DELETE = "^(supprimer|delete|supprimer l.événement|delete event|eliminar|löschen|elimina)$";
const MORE = "^(plus d.actions|more actions|autres actions|más acciones|weitere aktionen|altre azioni)$";
const OK = '^(ok|enregistrer|save|supprimer|delete)$';
const EXPORT = '^(exporter|export|exportar|exportieren|esporta|exporteren)$';
const EXPORT_PAGE = `${CALENDAR_URL}/settings/export`;

// --- Fonctions exécutées dans la page (autonomes) --------------------------------

export function calendarReady() {
  return !!document.querySelector('[role="main"]') && !document.querySelector('[role="progressbar"]:not([aria-hidden="true"])');
}

/** Télécharge une archive ZIP depuis la page (même session) et la renvoie en base64. */
export async function fetchZipInPage(urls) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { credentials: 'include' });
      if (!r.ok) continue;
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf[0] !== 0x50 || buf[1] !== 0x4b) continue; // « PK »
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(s);
    } catch { /* adresse suivante */ }
  }
  return null;
}

/** Lien d'export avec son jeton (…/exporticalzip?cexp=…) s'il est présent dans la page. */
export function findExportLink() {
  const a = document.querySelector('a[href*="exporticalzip"]');
  return a ? a.href : null;
}

/** Événements affichés dans la vue semaine : identifiant, texte lu par les lecteurs d'écran et texte visible. */
export function readGridChips() {
  const out = [];
  const seen = new Set();
  for (const chip of document.querySelectorAll('[data-eventid]')) {
    const eid = chip.getAttribute('data-eventid');
    if (!eid || seen.has(eid)) continue;
    seen.add(eid);
    const hidden = new Set(chip.querySelectorAll('[aria-hidden="true"], [aria-hidden="true"] *'));
    let sr = '';
    const walker = document.createTreeWalker(chip, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!hidden.has(n.parentElement)) sr += n.textContent + ' ';
    const visible = [...chip.querySelectorAll('[aria-hidden="true"]')].map((e) => e.innerText || e.textContent || '').join('\n');
    const label = chip.getAttribute('aria-label') || chip.querySelector('[role="button"]')?.getAttribute('aria-label') || '';
    const cell = chip.closest('[role="gridcell"]');
    out.push({ eid, sr: (label || sr).replace(/\s+/g, ' ').trim(), visible: visible.trim(), dayKey: cell?.getAttribute('data-datekey') || null });
  }
  return out;
}

/** Bouton / élément visible dont le texte ou l'aria-label correspond au motif : renvoie sa position. */
export function findByText(pattern, selector = 'button, [role="button"], [role="menuitem"]', scope = '') {
  const re = new RegExp(pattern, 'i');
  const root = (scope && [...document.querySelectorAll(scope)].pop()) || document;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const label = (el) => [(el.innerText || el.textContent || '').trim(), (el.getAttribute('aria-label') || '').trim(), (el.getAttribute('data-tooltip') || '').trim()];
  const el = [...root.querySelectorAll(selector)].find((b) => visible(b) && label(b).some((t) => t && re.test(t)));
  if (!el) return null;
  el.scrollIntoView?.({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

/** Champ (input ou zone de texte) repéré par son aria-label ou son placeholder : renvoie sa position. */
export function findField(pattern) {
  const re = new RegExp(pattern, 'i');
  const el = [...document.querySelectorAll('input, textarea, [contenteditable="true"]')].find((f) => {
    const r = f.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && [f.getAttribute('aria-label'), f.getAttribute('placeholder')].some((t) => t && re.test(t.trim()));
  });
  if (!el) return null;
  el.scrollIntoView?.({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

/** Repère l'événement dans la vue « jour » (attribut data-eventid = base64 « id agenda »). */
export function findEventChip(eventId, title) {
  const dec = (s) => { try { const b = s.replace(/-/g, '+').replace(/_/g, '/'); return atob(b + '==='.slice((b.length + 3) % 4)); } catch { return ''; } };
  const chips = [...document.querySelectorAll('[data-eventid]')];
  const el = chips.find((c) => dec(c.getAttribute('data-eventid')).split(' ')[0] === eventId)
    || chips.find((c) => title && (c.innerText || '').includes(title));
  if (!el) return null;
  el.scrollIntoView?.({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { eid: el.getAttribute('data-eventid'), x: r.x, y: r.y, w: r.width, h: r.height };
}

// --- Lecture ---------------------------------------------------------------------

/** Lit l'export (zip de .ics) et renvoie les événements de la fenêtre, triés. */
export function eventsFromZip(buf, { from, to, me = [] }) {
  const files = unzip(buf).filter((f) => /\.ics$/i.test(f.name));
  const out = [];
  files.forEach((f, i) => {
    const cal = parseIcs(f.data.toString('utf8'));
    const calendarId = calendarIdFromFile(f.name, me);
    const primary = me.some((m) => m && m.toLowerCase() === calendarId.toLowerCase());
    out.push(...expandCalendar(cal, { from, to, calendarId, calendarName: primary ? cal.name || 'Agenda' : cal.name, color: primary ? PALETTE[0] : PALETTE[(i % (PALETTE.length - 1)) + 1], me: [...me, ...(primary ? [calendarId] : [])] }));
  });
  const seen = new Set();
  return out
    .filter((e) => (seen.has(e.title + e.start) ? false : seen.add(e.title + e.start)))
    .sort((a, b) => a.start.localeCompare(b.start));
}

// --- Lecture des pages « semaine » (secours) ------------------------------------------

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const STATUS = /^(accepté|acceptée|refusé|peut-être|en attente|aucune réponse|invitation|accepted|declined|maybe|tentative|needs rsvp|awaiting|pas de lieu|no location|organisateur|organizer)\b/i;

const decodeEid = (eid) => {
  try {
    const b = eid.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(b + '==='.slice((b.length + 3) % 4), 'base64').toString('utf8');
  } catch {
    return '';
  }
};

/**
 * Texte d'un événement de Google Agenda (« 10:00 à 11:00, Point créa, Stella, Accepté,
 * 6 novembre 2026 » ou en anglais) -> { title, start, end, allDay }.
 */
export function parseChipText(chip, ref = new Date()) {
  const text = `${chip.sr || ''}`.replace(/[\u202f\u00a0]/g, ' ');
  const low = text.toLowerCase();
  let date = null;
  let m;
  if ((m = low.match(new RegExp(`(\\d{1,2})(?:er)? (${MONTHS_FR.join('|')})(?: (\\d{4}))?`)))) date = [m[3] ? +m[3] : ref.getFullYear(), MONTHS_FR.indexOf(m[2]), +m[1]];
  else if ((m = low.match(new RegExp(`(${MONTHS_EN.join('|')}) (\\d{1,2})(?:st|nd|rd|th)?(?:, (\\d{4}))?`)))) date = [m[3] ? +m[3] : ref.getFullYear(), MONTHS_EN.indexOf(m[1]), +m[2]];
  if (!date) return null;
  const allDay = /toute la journée|journée entière|all day/.test(low);
  let start = null;
  let end = null;
  if (!allDay) {
    const h24 = (h, mi, ap) => { let x = +h % (ap ? 12 : 24); if (ap === 'pm') x += 12; return [x, +(mi || 0)]; };
    if ((m = low.match(/(\d{1,2})(?::(\d{2}))? ?(am|pm)? ?(?:to|à|-|–) ?(\d{1,2})(?::(\d{2}))? ?(am|pm)/))) {
      start = h24(m[1], m[2], m[3] || m[6]);
      end = h24(m[4], m[5], m[6]);
    } else if ((m = low.match(/(\d{1,2})[:h](\d{2})? ?(?:à|-|–|to) ?(\d{1,2})[:h](\d{2})?/))) {
      start = [+m[1], +(m[2] || 0)];
      end = [+m[3], +(m[4] || 0)];
    } else if ((m = low.match(/(\d{1,2})[:h](\d{2})/))) {
      start = [+m[1], +m[2]];
      end = [+m[1] + 1, +m[2]];
    }
  }
  const [y, mo, d] = date;
  const s = allDay || !start ? new Date(y, mo, d) : new Date(y, mo, d, start[0], start[1]);
  let e = allDay || !start ? new Date(y, mo, d + 1) : new Date(y, mo, d, end[0], end[1]);
  if (e <= s) e = new Date(s.getTime() + (allDay ? 86400e3 : 3600e3));
  // Titre : première ligne visible qui n'est pas une heure, sinon premier morceau du texte complet.
  const isMeta = (t) => !t || /^(de )?\d{1,2}([:h]\d{2})?/.test(t) || STATUS.test(t) || /toute la journée|all day/i.test(t) || new RegExp(`(${MONTHS_FR.join('|')}|${MONTHS_EN.join('|')})`, 'i').test(t) && /\d{4}/.test(t);
  const lines = `${chip.visible || ''}`.split(/\n/).map((x) => x.trim());
  const title = lines.find((t) => !isMeta(t)) || text.split(/,\s*/).map((x) => x.trim()).find((t) => !isMeta(t)) || '(Sans titre)';
  return { title, start: s.toISOString(), end: e.toISOString(), allDay: allDay || !start };
}

/** Forme d'un texte sans son contenu (les mots inconnus deviennent « x ») : pour les journaux. */
export function textShape(t) {
  const keep = new Set([...MONTHS_FR, ...MONTHS_EN, 'à', 'de', 'to', 'am', 'pm', 'toute', 'la', 'journée', 'all', 'day', 'accepté', 'accepted']);
  return String(t || '').split(/(\s+|[,:])/).map((w) => (/^[\s,:]*$/.test(w) || /^\d+h?$/.test(w) || keep.has(w.toLowerCase()) ? w : 'x')).join('').slice(0, 120);
}

/** Morceaux lus dans les pages « semaine » -> événements QuestFlow. */
export function eventsFromChips(chips, { from, to, me = [] } = {}) {
  const seen = new Set();
  const out = [];
  for (const c of chips) {
    const p = parseChipText(c, from || new Date());
    if (!p) continue;
    const [eventId, calendarId = me[0] || 'primary'] = decodeEid(c.eid).split(' ');
    const key = `${eventId}|${p.start}`;
    if (seen.has(key) || (from && p.end <= new Date(from).toISOString()) || (to && p.start >= new Date(to).toISOString())) continue;
    seen.add(key);
    const day = new Date(p.start);
    out.push({
      id: `${calendarId}::${eventId}`,
      eventId,
      calendarId,
      calendar: 'Agenda',
      color: PALETTE[0],
      editable: true,
      recurring: /_\d{8}/.test(eventId),
      ...p,
      location: '',
      description: '',
      meet: null,
      url: `${CALENDAR_URL}/day/${day.getFullYear()}/${day.getMonth() + 1}/${day.getDate()}`,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

// --- Lecture -----------------------------------------------------------------------

/**
 * L'archive de l'export, récupérée comme toi : page Paramètres > Exporter, lien avec son
 * jeton ou clic sur le bouton « Exporter » (téléchargement intercepté), sinon l'adresse simple.
 */
async function exportArchive(session, log) {
  const tab = await session.open(EXPORT_PAGE, { ready: calendarReady, timeout: 40e3 });
  try {
    const link = await tab.waitFor(findExportLink, [], { timeout: 4e3 });
    if (link) {
      const b64 = await tab.evaluate(fetchZipInPage, [link]);
      if (b64) return { buf: Buffer.from(b64, 'base64'), via: 'export (lien)' };
    }
    const dl = await session.download(() => tab.click(findByText, [EXPORT, 'button, [role="button"], a'], { timeout: 10e3 }), { timeout: 60e3 });
    log?.info(`agenda : bouton Exporter -> ${dl.state}${dl.url ? ` (${new URL(dl.url).pathname})` : ''}`);
    if (dl.data && dl.data[0] === 0x50 && dl.data[1] === 0x4b) return { buf: dl.data, via: 'export (bouton)' };
    const b64 = await tab.evaluate(fetchZipInPage, [...(dl.url ? [dl.url] : []), '/calendar/u/0/exporticalzip', '/calendar/exporticalzip']);
    if (b64) return { buf: Buffer.from(b64, 'base64'), via: 'export' };
    await session.diagnose(tab, 'agenda-export');
    return null;
  } finally {
    await tab.close();
  }
}

/** Secours : les événements affichés dans les pages « semaine » de la période. */
async function readWeeks(session, { from, to, me }, log) {
  const tab = await session.newTab();
  const chips = [];
  try {
    const start = new Date(from);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const last = new Date(Math.min(new Date(to).getTime(), Date.now() + 35 * 86400e3));
    for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 7)) {
      await tab.goto(`${CALENDAR_URL}/week/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`);
      const ok = await tab.waitFor(() => !!document.querySelector('[role="main"] [role="gridcell"], [role="main"] [data-eventid]'), [], { timeout: 20e3 });
      if (!ok) {
        if (await tab.evaluate(onLoginPage).catch(() => false)) throw new NotLoggedInError();
        await session.diagnose(tab, 'agenda-semaine');
        continue;
      }
      await new Promise((r) => setTimeout(r, 900)); // les événements s'affichent juste après la grille
      chips.push(...(await tab.evaluate(readGridChips).catch(() => [])));
    }
  } finally {
    await tab.close();
  }
  const events = eventsFromChips(chips, { from, to, me });
  log?.info(`agenda (pages semaine) : ${chips.length} éléments lus, ${events.length} événements`);
  if (chips.length && !events.length) log?.warn(`agenda : textes non reconnus, forme : « ${textShape(chips[0].sr)} »`);
  return events;
}

export async function listEvents(session, { from, to, me = [], info = {}, log } = {}) {
  let archive = null;
  try {
    archive = await exportArchive(session, log);
  } catch (e) {
    if (e.code === 'NOT_LOGGED_IN') throw e;
    log?.warn(`agenda export : ${e.message}`);
  }
  if (archive) {
    const events = eventsFromZip(archive.buf, { from, to, me });
    info.via = archive.via;
    log?.info(`agenda (${archive.via}) : ${events.length} événements`);
    return events;
  }
  info.via = 'pages semaine';
  return readWeeks(session, { from, to, me }, log);
}

// --- Actions -----------------------------------------------------------------------

const utcStamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateStamp = (d) => new Date(d).toLocaleDateString('sv-SE').replace(/-/g, '');

/** Page « nouvel événement » pré-remplie (lien officiel de Google Agenda). */
export function templateUrl({ title, description, location, start, end, allDay }) {
  const s = new Date(start);
  let e = new Date(end || s.getTime() + 3600e3);
  let dates;
  if (allDay) {
    if (dateStamp(e) <= dateStamp(s)) e = new Date(s.getTime() + 86400e3);
    dates = `${dateStamp(s)}/${dateStamp(e)}`;
  } else dates = `${utcStamp(s)}/${utcStamp(e)}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title || '', dates });
  if (description) q.set('details', description);
  if (location) q.set('location', location);
  q.set('ctz', Intl.DateTimeFormat().resolvedOptions().timeZone);
  return `https://calendar.google.com/calendar/render?${q}`;
}

const dayUrl = (d) => { const x = new Date(d); return `${CALENDAR_URL}/day/${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}`; };
const editUrl = (eid) => `${CALENDAR_URL}/eventedit/${eid}`;
const leftEditor = (tab, ms = 15e3) => tab.waitFor(() => !/eventedit/.test(location.pathname), [], { timeout: ms });

/** Valide les éventuelles boîtes de dialogue (série récurrente, invitations…). */
async function confirmDialogs(tab) {
  for (let i = 0; i < 2; i++) {
    const ok = await tab.click(findByText, [OK, 'button, [role="button"]', '[role="dialog"], [role="alertdialog"]'], { timeout: 2500 });
    if (!ok) return;
    await new Promise((r) => setTimeout(r, 700));
  }
}

export async function createEvent(session, ev) {
  const tab = await session.open(templateUrl(ev), { ready: () => !!document.querySelector('input'), timeout: 35e3 });
  try {
    const clicked = await tab.click(findByText, [SAVE, 'button, [role="button"]']);
    if (!clicked) throw new UiError("bouton « Enregistrer » introuvable");
    if (!(await leftEditor(tab, 8e3))) {
      await confirmDialogs(tab);
      if (!(await leftEditor(tab, 8e3))) throw new UiError("Google Agenda n'a pas confirmé l'enregistrement");
    }
    return { ok: true };
  } catch (e) {
    if (e.code === 'UI') await session.diagnose(tab, 'agenda-creation');
    throw e;
  } finally {
    await tab.close();
  }
}

/** Trouve l'identifiant Google (eid) de l'événement depuis la vue « jour ». */
async function locate(session, ev) {
  const tab = await session.open(dayUrl(ev.start), { ready: () => !!document.querySelector('[role="main"] [data-eventid], [role="main"] [role="grid"], [role="main"] [role="gridcell"]'), timeout: 35e3 });
  const chip = await tab.waitFor(findEventChip, [ev.eventId, ev.title], { timeout: 8e3 });
  return { tab, chip };
}

export async function deleteEvent(session, ev) {
  const { tab, chip } = await locate(session, ev);
  try {
    if (!chip) throw new UiError('événement introuvable dans Google Agenda');
    await tab.clickAt(chip.x + chip.w / 2, chip.y + Math.min(chip.h / 2, 12));
    let done = await tab.click(findByText, [DELETE, 'button, [role="button"]', '[role="dialog"]'], { timeout: 6e3 });
    if (!done) {
      // Plan B : page de modification > « Plus d'actions » > Supprimer
      await tab.goto(editUrl(chip.eid));
      if (await tab.click(findByText, [MORE, 'button, [role="button"]'], { timeout: 12e3 })) done = await tab.click(findByText, [DELETE, '[role="menuitem"], [role="option"], li, button'], { timeout: 4e3 });
    }
    if (!done) throw new UiError("bouton « Supprimer » introuvable");
    await new Promise((r) => setTimeout(r, 600));
    await confirmDialogs(tab);
    return { ok: true, eid: chip.eid };
  } catch (e) {
    if (e.code === 'UI') await session.diagnose(tab, 'agenda-suppression');
    throw Object.assign(e, { eid: chip?.eid });
  } finally {
    await tab.close();
  }
}

/** Modifie titre, lieu, description. Un changement d'horaire passe par la fenêtre Google Agenda. */
export async function updateEvent(session, ev, before = null) {
  const { tab, chip } = await locate(session, before || ev);
  try {
    if (!chip) throw new UiError('événement introuvable dans Google Agenda');
    if (before && (before.start !== ev.start || before.end !== ev.end || !!before.allDay !== !!ev.allDay)) throw Object.assign(new UiError('changement d’horaire'), { eid: chip.eid, needsWindow: true });
    await tab.goto(editUrl(chip.eid));
    const fill = async (pattern, value) => {
      if (value === undefined || (before && before[pattern.key] === value)) return true;
      if (!(await tab.click(findField, [pattern.re], { timeout: 10e3 }))) return false;
      await tab.selectAll();
      await tab.insertText(value || '');
      return true;
    };
    const ok = (await fill({ key: 'title', re: '^(titre|title|ajouter un titre|add title|título|titel|titolo)$' }, ev.title))
      && (await fill({ key: 'location', re: '(lieu|location|ubicación|ort|luogo)' }, ev.location))
      && (await fill({ key: 'description', re: '^(description|ajouter une description|add description|descripción|beschreibung|descrizione)$' }, ev.description));
    if (!ok) throw Object.assign(new UiError('champ introuvable'), { eid: chip.eid });
    if (!(await tab.click(findByText, [SAVE, 'button, [role="button"]']))) throw Object.assign(new UiError("bouton « Enregistrer » introuvable"), { eid: chip.eid });
    if (!(await leftEditor(tab, 8e3))) {
      await confirmDialogs(tab);
      if (!(await leftEditor(tab, 8e3))) throw Object.assign(new UiError("Google Agenda n'a pas confirmé"), { eid: chip.eid });
    }
    return { ok: true };
  } catch (e) {
    if (e.code === 'UI' && !e.needsWindow) await session.diagnose(tab, 'agenda-modification');
    throw e;
  } finally {
    await tab.close();
  }
}

/** Adresse à ouvrir dans la fenêtre Google Agenda quand une action automatique n'aboutit pas. */
export function assistUrl(kind, ev, eid) {
  if (kind === 'create') return templateUrl(ev);
  return eid ? editUrl(eid) : dayUrl(ev.start);
}
