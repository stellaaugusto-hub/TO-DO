// Google Agenda lu et modifié directement dans Chrome (sans fenêtre), sans clé API.
// Lecture : l'export officiel de Google Agenda (Paramètres > Exporter), un .ics par agenda.
// Actions : les mêmes clics que toi dans Google Agenda (créer, renommer, supprimer).

import { unzip } from './zip.js';
import { parseIcs, expandCalendar, calendarIdFromFile } from './ics.js';
import { UiError } from './chrome.js';

export const CALENDAR_URL = 'https://calendar.google.com/calendar/u/0/r';
const PALETTE = ['#2383E2', '#448361', '#D9730D', '#9065B0', '#C14C8A', '#CB912F', '#D44C47', '#337EA9', '#787774'];

const SAVE = '^(enregistrer|save|guardar|speichern|salva|opslaan|salvar)$';
const DELETE = "^(supprimer|delete|supprimer l.événement|delete event|eliminar|löschen|elimina)$";
const MORE = "^(plus d.actions|more actions|autres actions|más acciones|weitere aktionen|altre azioni)$";
const OK = '^(ok|enregistrer|save|supprimer|delete)$';

// --- Fonctions exécutées dans la page (autonomes) --------------------------------

export function calendarReady() {
  return !!document.querySelector('[role="main"]') && !document.querySelector('[role="progressbar"]:not([aria-hidden="true"])');
}

export async function exportZipInPage() {
  for (const u of ['/calendar/exporticalzip', '/calendar/u/0/exporticalzip']) {
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

export async function listEvents(session, { from, to, me = [] }) {
  const tab = await session.open(CALENDAR_URL, { ready: calendarReady, timeout: 40e3 });
  try {
    const b64 = await tab.evaluate(exportZipInPage);
    if (!b64) {
      await session.diagnose(tab, 'agenda');
      throw new Error("l'export de Google Agenda n'a pas répondu");
    }
    return eventsFromZip(Buffer.from(b64, 'base64'), { from, to, me });
  } finally {
    await tab.close();
  }
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
