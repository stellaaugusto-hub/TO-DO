// Google Agenda via l'API officielle : lecture de tous les agendas affichés,
// création / modification / suppression d'événements.

const BASE = 'https://www.googleapis.com/calendar/v3';

/** Événement API -> format QuestFlow */
export function mapEvent(ev, cal) {
  const allDay = !!ev.start?.date;
  const start = allDay ? new Date(`${ev.start.date}T00:00:00`) : new Date(ev.start?.dateTime);
  const end = allDay ? new Date(`${ev.end?.date || ev.start.date}T00:00:00`) : new Date(ev.end?.dateTime || ev.start?.dateTime);
  return {
    id: `${cal.id}::${ev.id}`,
    eventId: ev.id,
    calendarId: cal.id,
    calendar: cal.summaryOverride || cal.summary || 'Agenda',
    color: ev.colorId ? null : cal.backgroundColor || null,
    editable: ['owner', 'writer'].includes(cal.accessRole),
    title: ev.summary || '(Sans titre)',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay,
    location: ev.location || '',
    description: (ev.description || '').slice(0, 2000),
    meet: ev.hangoutLink || ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || null,
    url: ev.htmlLink || null,
  };
}

export function isDeclined(ev) {
  return (ev.attendees || []).some((a) => a.self && a.responseStatus === 'declined');
}

export async function listEvents(auth, { from, to }) {
  const cals = await auth.api(`${BASE}/users/me/calendarList`, { query: { minAccessRole: 'reader', maxResults: 100 } });
  const visible = (cals.items || []).filter((c) => c.selected !== false && !c.hidden);
  const out = [];
  await Promise.all(
    visible.map(async (cal) => {
      let pageToken;
      do {
        const r = await auth.api(`${BASE}/calendars/${encodeURIComponent(cal.id)}/events`, {
          query: { singleEvents: 'true', orderBy: 'startTime', timeMin: from.toISOString(), timeMax: to.toISOString(), maxResults: 250, pageToken },
        });
        for (const ev of r.items || []) if (ev.status !== 'cancelled' && !isDeclined(ev)) out.push(mapEvent(ev, cal));
        pageToken = r.nextPageToken;
      } while (pageToken);
    }),
  );
  const seen = new Set();
  return out
    .filter((e) => (seen.has(e.title + e.start) ? false : seen.add(e.title + e.start)))
    .sort((a, b) => a.start.localeCompare(b.start));
}

function toApiTimes({ start, end, allDay }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (allDay) {
    const d = (x) => new Date(x).toLocaleDateString('sv-SE');
    const e = new Date(end || start);
    if (d(e) === d(start)) e.setDate(e.getDate() + 1);
    return { start: { date: d(start) }, end: { date: d(e) } };
  }
  return { start: { dateTime: new Date(start).toISOString(), timeZone: tz }, end: { dateTime: new Date(end || new Date(new Date(start).getTime() + 3600e3)).toISOString(), timeZone: tz } };
}

export async function createEvent(auth, { calendarId = 'primary', title, description, location, start, end, allDay }) {
  const ev = await auth.api(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: { summary: title, description, location, ...toApiTimes({ start, end, allDay }) },
  });
  return mapEvent(ev, { id: calendarId, summary: 'Agenda', accessRole: 'owner' });
}

export async function updateEvent(auth, { calendarId, eventId, title, description, location, start, end, allDay }) {
  const body = {};
  if (title !== undefined) body.summary = title;
  if (description !== undefined) body.description = description;
  if (location !== undefined) body.location = location;
  if (start) Object.assign(body, toApiTimes({ start, end, allDay }));
  const ev = await auth.api(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body });
  return mapEvent(ev, { id: calendarId, summary: 'Agenda', accessRole: 'owner' });
}

export async function deleteEvent(auth, { calendarId, eventId }) {
  await auth.api(`${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
}
