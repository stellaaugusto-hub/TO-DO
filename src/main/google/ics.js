// Lecture des fichiers iCalendar (.ics) exportés par Google Agenda :
// événements, fuseaux horaires, récurrences (RRULE, EXDATE, exceptions).

const DAY_MS = 86400e3;
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// --- Lignes et propriétés ---------------------------------------------------

function splitOutside(s, sep) {
  const out = [];
  let cur = '';
  let q = false;
  for (const c of s) {
    if (c === '"') q = !q;
    if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseLine(line) {
  let i = 0;
  let q = false;
  for (; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    else if (line[i] === ':' && !q) break;
  }
  const [name, ...rest] = splitOutside(line.slice(0, i), ';');
  const params = {};
  for (const p of rest) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

export const unescapeText = (v) => v.replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N' ? '\n' : c));

// --- Dates et fuseaux ---------------------------------------------------------

const fmtCache = new Map();
function tzFormatter(tz) {
  if (!fmtCache.has(tz)) {
    let f = null;
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    } catch { /* fuseau inconnu */ }
    fmtCache.set(tz, f);
  }
  return fmtCache.get(tz);
}

function tzOffset(ms, f) {
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** Heure « murale » dans un fuseau -> instant UTC (gère les changements d'heure). */
export function zonedToUtc([y, mo, d, h = 0, mi = 0, s = 0], tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const f = tz && tzFormatter(tz);
  if (!f) return new Date(y, mo - 1, d, h, mi, s).getTime();
  const first = guess - tzOffset(guess, f);
  return guess - tzOffset(first, f);
}

/** Valeur DATE ou DATE-TIME -> { parts, date, utc, tz } */
export function parseDt(value, params = {}, defaultTz = null) {
  const m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const parts = [+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)];
  const date = params.VALUE === 'DATE' || !m[4];
  return { parts, date, utc: !!m[7], tz: m[7] ? 'UTC' : params.TZID || defaultTz };
}

/** Instant (ms) d'une date iCal. Les journées entières tombent à minuit, heure du Mac. */
export function dtToMs(dt) {
  const [y, mo, d, h, mi, s] = dt.parts;
  if (dt.date) return new Date(y, mo - 1, d).getTime();
  if (dt.utc) return Date.UTC(y, mo - 1, d, h, mi, s);
  return zonedToUtc(dt.parts, dt.tz);
}

function parseDuration(v) {
  const m = String(v).match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const ms = (+(m[2] || 0) * 7 + +(m[3] || 0)) * DAY_MS + (+(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000;
  return m[1] === '-' ? -ms : ms;
}

// --- Lecture du calendrier ------------------------------------------------------

export function parseIcs(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const cal = { name: null, tz: null, events: [] };
  const stack = [];
  let ev = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const { name, params, value } = parseLine(line);
    if (name === 'BEGIN') {
      stack.push(value.toUpperCase());
      if (value.toUpperCase() === 'VEVENT' && stack.length === 2) ev = { exdates: [], attendees: [], raw: {} };
      continue;
    }
    if (name === 'END') {
      const kind = stack.pop();
      if (kind === 'VEVENT' && ev) { cal.events.push(ev); ev = null; }
      continue;
    }
    if (!ev) {
      if (stack.length === 1 && name === 'X-WR-CALNAME') cal.name = unescapeText(value);
      if (stack.length === 1 && name === 'X-WR-TIMEZONE') cal.tz = value.trim();
      continue;
    }
    if (stack[stack.length - 1] !== 'VEVENT') continue; // VALARM…
    switch (name) {
      case 'UID': ev.uid = value.trim(); break;
      case 'SUMMARY': ev.summary = unescapeText(value); break;
      case 'DESCRIPTION': ev.description = unescapeText(value); break;
      case 'LOCATION': ev.location = unescapeText(value); break;
      case 'STATUS': ev.status = value.trim().toUpperCase(); break;
      case 'DTSTART': ev.dtstart = { value, params }; break;
      case 'DTEND': ev.dtend = { value, params }; break;
      case 'DURATION': ev.duration = parseDuration(value); break;
      case 'RRULE': ev.rrule = value; break;
      case 'RECURRENCE-ID': ev.recurrenceId = { value, params }; break;
      case 'EXDATE': for (const v of value.split(',')) ev.exdates.push({ value: v, params }); break;
      case 'ORGANIZER': ev.organizer = value.replace(/^mailto:/i, '').trim().toLowerCase(); break;
      case 'ATTENDEE': ev.attendees.push({ email: value.replace(/^mailto:/i, '').trim().toLowerCase(), partstat: (params.PARTSTAT || '').toUpperCase(), name: params.CN || '' }); break;
      case 'X-GOOGLE-CONFERENCE': ev.conference = value.trim(); break;
      default: break;
    }
  }
  return cal;
}

// --- Récurrences --------------------------------------------------------------

export function parseRrule(s) {
  const r = {};
  for (const part of String(s).split(';')) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) r[k.toUpperCase()] = v;
  }
  const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : null);
  return {
    freq: (r.FREQ || 'DAILY').toUpperCase(),
    interval: Math.max(1, +r.INTERVAL || 1),
    count: r.COUNT ? +r.COUNT : null,
    until: r.UNTIL || null,
    byday: list(r.BYDAY)?.map((x) => { const m = x.match(/^([+-]?\d+)?([A-Z]{2})$/i); return m ? { n: m[1] ? +m[1] : 0, wd: WEEKDAYS.indexOf(m[2].toUpperCase()) } : null; }).filter((x) => x && x.wd >= 0) || null,
    bymonthday: list(r.BYMONTHDAY)?.map(Number) || null,
    bymonth: list(r.BYMONTH)?.map(Number) || null,
    bysetpos: list(r.BYSETPOS)?.map(Number) || null,
    wkst: Math.max(0, WEEKDAYS.indexOf((r.WKST || 'MO').toUpperCase())),
  };
}

const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
const fromDayNum = (n) => { const d = new Date(n * DAY_MS); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
const weekday = (n) => (n + 4) % 7; // 1970-01-01 était un jeudi
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function monthDays(y, m, rule, startDay) {
  const dim = daysInMonth(y, m);
  const first = dayNum(y, m, 1);
  let days = [];
  if (rule.bymonthday) {
    for (const md of rule.bymonthday) {
      const d = md > 0 ? md : dim + md + 1;
      if (d >= 1 && d <= dim) days.push(first + d - 1);
    }
  } else if (rule.byday) {
    for (const { n, wd } of rule.byday) {
      const all = [];
      for (let d = 0; d < dim; d++) if (weekday(first + d) === wd) all.push(first + d);
      if (!n) days.push(...all);
      else {
        const pick = n > 0 ? all[n - 1] : all[all.length + n];
        if (pick !== undefined) days.push(pick);
      }
    }
  } else {
    const d = fromDayNum(startDay)[2];
    if (d <= dim) days.push(first + d - 1);
  }
  days = [...new Set(days)].sort((a, b) => a - b);
  if (rule.bysetpos) days = rule.bysetpos.map((p) => (p > 0 ? days[p - 1] : days[days.length + p])).filter((x) => x !== undefined).sort((a, b) => a - b);
  return days;
}

/**
 * Jours (numéros de jour) d'une règle de récurrence, dans l'ordre, à partir du jour de début.
 * `accept(day)` renvoie false pour arrêter (UNTIL / fin de fenêtre).
 */
export function* recurDays(startDay, rule, maxIter = 40000) {
  const [sy, sm] = fromDayNum(startDay);
  let iter = 0;
  if (rule.freq === 'DAILY') {
    for (let d = startDay; iter++ < maxIter; d += rule.interval) {
      const [, m] = fromDayNum(d);
      if (rule.bymonth && !rule.bymonth.includes(m)) continue;
      if (rule.byday && !rule.byday.some((b) => b.wd === weekday(d))) continue;
      yield d;
    }
  } else if (rule.freq === 'WEEKLY') {
    const offsets = (rule.byday?.length ? rule.byday.map((b) => b.wd) : [weekday(startDay)]).map((wd) => (wd - rule.wkst + 7) % 7).sort((a, b) => a - b);
    const weekStart = startDay - ((weekday(startDay) - rule.wkst + 7) % 7);
    for (let k = 0; iter++ < maxIter; k++) {
      for (const off of [...new Set(offsets)]) {
        const d = weekStart + k * 7 * rule.interval + off;
        if (d < startDay) continue;
        if (rule.bymonth && !rule.bymonth.includes(fromDayNum(d)[1])) continue;
        yield d;
      }
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let k = 0; iter++ < maxIter; k++) {
      const total = sm - 1 + k * rule.interval;
      const y = sy + Math.floor(total / 12);
      const m = (total % 12) + 1;
      if (rule.bymonth && !rule.bymonth.includes(m)) continue;
      for (const d of monthDays(y, m, rule, startDay)) if (d >= startDay) yield d;
    }
  } else if (rule.freq === 'YEARLY') {
    const months = rule.bymonth || [sm];
    for (let k = 0; iter++ < maxIter; k++) {
      const y = sy + k * rule.interval;
      const days = [];
      for (const m of months) days.push(...monthDays(y, m, rule.bymonthday || rule.byday ? rule : { ...rule, bymonthday: [fromDayNum(startDay)[2]] }, startDay));
      for (const d of days.sort((a, b) => a - b)) if (d >= startDay) yield d;
    }
  }
}

// --- Événements de la fenêtre affichée -------------------------------------------

const stamp = (ms, date) => {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return date ? `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` : `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};

function cleanDescription(s = '') {
  return s.split(/\n?-::~:~::~/)[0].replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}

/**
 * Toutes les occurrences entre `from` et `to` d'un calendrier lu par parseIcs.
 * `me` : adresses de l'utilisateur (pour retirer les invitations refusées).
 */
export function expandCalendar(cal, { from, to, calendarId, calendarName, color = null, me = [] }) {
  const fromMs = +from;
  const toMs = +to;
  const mine = new Set(me.map((x) => String(x).toLowerCase()));
  const out = [];
  const overrides = new Map();
  for (const ev of cal.events) {
    if (ev.recurrenceId && ev.uid) {
      if (!overrides.has(ev.uid)) overrides.set(ev.uid, []);
      overrides.get(ev.uid).push(ev);
    }
  }

  const declined = (ev) => ev.attendees.some((a) => mine.has(a.email) && a.partstat === 'DECLINED');
  const make = (ev, startMs, endMs, allDay, instanceSuffix) => {
    const base = String(ev.uid || '').replace(/@google\.com$/i, '');
    const eventId = instanceSuffix ? `${base}_${instanceSuffix}` : base;
    const day = new Date(startMs);
    const meet = ev.conference || (ev.description || '').match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i)?.[0] || null;
    return {
      id: `${calendarId}::${eventId}`,
      eventId,
      calendarId,
      calendar: calendarName || cal.name || 'Agenda',
      color,
      editable: !/#holiday|#contacts|#weather/.test(calendarId) && (!ev.organizer || mine.has(ev.organizer) || ev.organizer === String(calendarId).toLowerCase()),
      recurring: !!(ev.rrule || ev.recurrenceId),
      title: ev.summary || '(Sans titre)',
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      allDay,
      location: ev.location || '',
      description: cleanDescription(ev.description),
      meet,
      url: `https://calendar.google.com/calendar/u/0/r/day/${day.getFullYear()}/${day.getMonth() + 1}/${day.getDate()}`,
    };
  };

  for (const ev of cal.events) {
    if (!ev.dtstart || ev.status === 'CANCELLED' || declined(ev)) continue;
    const start = parseDt(ev.dtstart.value, ev.dtstart.params, cal.tz);
    if (!start) continue;
    const end = ev.dtend ? parseDt(ev.dtend.value, ev.dtend.params, cal.tz) : null;
    const startMs = dtToMs(start);
    let dur = end ? dtToMs(end) - startMs : ev.duration || (start.date ? DAY_MS : 0);
    if (dur < 0) dur = 0;

    if (ev.recurrenceId) {
      // exception d'une série : remplace l'occurrence d'origine
      const rid = parseDt(ev.recurrenceId.value, ev.recurrenceId.params, cal.tz);
      if (startMs < toMs && startMs + dur > fromMs) out.push(make(ev, startMs, startMs + dur, start.date, rid ? stamp(dtToMs(rid), rid.date) : null));
      continue;
    }
    if (!ev.rrule) {
      if (startMs < toMs && startMs + Math.max(dur, 1) > fromMs) out.push(make(ev, startMs, startMs + dur, start.date, null));
      continue;
    }

    const rule = parseRrule(ev.rrule);
    const untilDt = rule.until ? parseDt(rule.until, {}, start.tz) : null;
    const untilMs = untilDt ? (untilDt.date ? dtToMs(untilDt) + DAY_MS - 1 : dtToMs(untilDt)) : Infinity;
    const ex = new Set(ev.exdates.map((x) => { const d = parseDt(x.value, x.params, start.tz); return d ? (start.date ? stamp(dtToMs(d), true) : dtToMs(d)) : null; }));
    const moved = new Set((overrides.get(ev.uid) || []).map((o) => { const d = parseDt(o.recurrenceId.value, o.recurrenceId.params, start.tz); return d ? dtToMs(d) : null; }));
    const [, , , h, mi, s] = start.parts;
    let n = 0;
    for (const day of recurDays(dayNum(...start.parts.slice(0, 3)), rule)) {
      const [y, m, d] = fromDayNum(day);
      const occ = start.date ? new Date(y, m - 1, d).getTime() : start.utc ? Date.UTC(y, m - 1, d, h, mi, s) : zonedToUtc([y, m, d, h, mi, s], start.tz);
      if (occ > untilMs || occ >= toMs) break;
      n++;
      if (rule.count && n > rule.count) break;
      if (ex.has(start.date ? stamp(occ, true) : occ) || moved.has(occ)) continue;
      if (occ + Math.max(dur, 1) > fromMs) out.push(make(ev, occ, occ + dur, start.date, stamp(occ, start.date)));
    }
  }
  return out;
}

/** Nom d'un fichier de l'export (« Nom_identifiant.ics » ou « adresse.ics ») -> identifiant de l'agenda. */
export function calendarIdFromFile(name, me = []) {
  const base = name.split('/').pop().replace(/\.ics$/i, '');
  const mine = me.find((m) => m && (base.toLowerCase() === m.toLowerCase() || base.toLowerCase().endsWith(`_${m.toLowerCase()}`)));
  if (mine) return mine;
  for (let i = base.indexOf('_'); i > 0; i = base.indexOf('_', i + 1)) {
    const right = base.slice(i + 1);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(right)) return right;
  }
  return base;
}
