import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, RefreshCw, ExternalLink, X, MapPin, Video, Trash2, CalendarDays } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { isSameDay, startOfDay } from '../../shared/dates.js';
import { DeleteButton } from '../components/bits.jsx';

const H0 = 7;
const H1 = 23;
const HOUR = 52;
const pad = (n) => String(n).padStart(2, '0');
const dateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtTime = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function mondayOf(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Répartit les événements qui se chevauchent en colonnes. */
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const out = [];
  let cluster = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = [];
    for (const e of cluster) {
      let c = cols.findIndex((end) => end <= +new Date(e.start));
      if (c < 0) { c = cols.length; cols.push(0); }
      cols[c] = +new Date(e.end);
      out.push({ ...e, col: c });
    }
    for (const o of out.slice(-cluster.length)) o.cols = cols.length;
    cluster = [];
  };
  for (const e of sorted) {
    if (cluster.length && +new Date(e.start) >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, +new Date(e.end));
  }
  if (cluster.length) flush();
  return out;
}

function EventModal({ ev, onClose }) {
  const toast = useApp((s) => s.toast);
  const isNew = !ev.eventId;
  const [title, setTitle] = useState(ev.title || '');
  const [day, setDay] = useState(dateInput(new Date(ev.start)));
  const [from, setFrom] = useState(timeInput(new Date(ev.start)));
  const [to, setTo] = useState(timeInput(new Date(ev.end)));
  const [allDay, setAllDay] = useState(!!ev.allDay);
  const [location, setLocation] = useState(ev.location || '');
  const [description, setDescription] = useState(ev.description || '');
  const [busy, setBusy] = useState(false);
  const readOnly = ev.editable === false;

  const save = async () => {
    setBusy(true);
    const start = new Date(`${day}T${allDay ? '00:00' : from}`);
    let end = new Date(`${day}T${allDay ? '00:00' : to}`);
    if (!allDay && end <= start) end = new Date(start.getTime() + 3600e3);
    const payload = { calendarId: ev.calendarId || 'primary', eventId: ev.eventId, title: title.trim() || '(Sans titre)', description, location, start: start.toISOString(), end: end.toISOString(), allDay };
    const r = isNew ? await api.calendarCreate(payload) : await api.calendarUpdate(payload);
    setBusy(false);
    if (r?.ok) { toast(isNew ? 'Événement ajouté à Google Agenda' : 'Événement mis à jour', { icon: 'check' }); onClose(); }
    else toast(`Impossible : ${r?.error || 'erreur'}`, { icon: 'alert' });
  };
  const remove = async () => {
    const r = await api.calendarDelete({ calendarId: ev.calendarId, eventId: ev.eventId });
    if (r?.ok) { toast('Événement supprimé', { icon: 'trash' }); onClose(); }
    else toast(`Impossible : ${r?.error || 'erreur'}`, { icon: 'alert' });
  };

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className="modal" style={{ width: 560 }} initial={{ y: 30, scale: 0.95, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
        <div className="modal-head" style={{ '--c': ev.color || '#22d3ee' }}>
          <span className="icon-tile" style={{ '--c': ev.color || '#06b6d4' }}><CalendarDays size={20} /></span>
          <div style={{ flex: 1 }}>
            <div className="dim" style={{ fontSize: 12, marginBottom: 2 }}>{isNew ? 'Nouvel événement' : ev.calendar}{readOnly ? ' · lecture seule' : ''}</div>
            <input className="title-input" autoFocus={isNew} value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de l'événement" onKeyDown={(e) => e.key === 'Enter' && !readOnly && save()} />
          </div>
          <button className="xbtn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="field full">
            <label>Quand</label>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <input type="date" className="input" style={{ width: 160 }} value={day} disabled={readOnly} onChange={(e) => setDay(e.target.value)} />
              {!allDay && <><input type="time" className="input" style={{ width: 110 }} value={from} disabled={readOnly} onChange={(e) => setFrom(e.target.value)} /><span className="dim">→</span><input type="time" className="input" style={{ width: 110 }} value={to} disabled={readOnly} onChange={(e) => setTo(e.target.value)} /></>}
              <div className="seg"><button className={allDay ? 'on' : ''} disabled={readOnly} onClick={() => setAllDay(!allDay)}>Journée entière</button></div>
            </div>
          </div>
          <div className="field full">
            <label>Lieu</label>
            <input className="input" value={location} disabled={readOnly} onChange={(e) => setLocation(e.target.value)} placeholder="Adresse, salle…" />
          </div>
          <div className="field full">
            <label>Description</label>
            <textarea className="textarea" value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          {!isNew && !readOnly && <DeleteButton label={title || 'cet événement'} onConfirm={remove} />}
          {ev.meet && <button className="btn small" onClick={() => api.openExternal(ev.meet)}><Video size={14} /> Rejoindre</button>}
          {ev.url && <button className="btn small" onClick={() => api.openExternal(ev.url)}><ExternalLink size={14} /> Google Agenda</button>}
          <span className="grow" />
          <button className="btn" onClick={onClose}>{readOnly ? 'Fermer' : 'Annuler'}</button>
          {!readOnly && <button className="btn primary" disabled={busy} onClick={save}>{isNew ? <><Plus size={16} /> Créer</> : 'Enregistrer'}</button>}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function AgendaView() {
  const { data, connectGoogle, toast } = useApp();
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [extra, setExtra] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(week); d.setDate(d.getDate() + i); return d; }), [week]);
  const weekEnd = days[6].getTime() + 86400e3;

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60e3); return () => clearInterval(t); }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, (now.getHours() - H0 - 1.5) * HOUR); }, []);

  // semaine hors de la plage synchronisée : on la charge à la demande
  useEffect(() => {
    if (!data.google.connected) return;
    const inSync = (data.events || []).some((e) => +new Date(e.start) < +week) && (data.events || []).some((e) => +new Date(e.start) > weekEnd);
    if (inSync) { setExtra([]); return; }
    setLoading(true);
    api.calendarList(week.toISOString(), new Date(weekEnd).toISOString()).then((r) => { setLoading(false); if (r?.ok) setExtra(r.events); });
  }, [week, data.google.connected]);

  if (!data.google.connected) {
    return (
      <div className="panel connect-card">
        <div className="google-g"><CalendarDays size={28} color="#4285f4" /></div>
        <div className="page-title" style={{ fontSize: 24 }}>Connecte Google Agenda</div>
        <p className="muted">Tu verras tout ton agenda ici et tu pourras créer, déplacer ou supprimer tes événements directement depuis QuestFlow.</p>
        <button className="btn primary" onClick={connectGoogle}>Connecter mon compte Google</button>
      </div>
    );
  }

  const all = [...(data.events || []), ...extra.filter((x) => !(data.events || []).some((e) => e.id === x.id))].filter((e) => e.start && +new Date(e.start) < weekEnd && +new Date(e.end) > +week);
  const allDay = all.filter((e) => e.allDay || (+new Date(e.end) - +new Date(e.start) >= 86400e3));
  const timed = all.filter((e) => !allDay.includes(e));
  const label = `${days[0].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const shift = (n) => { const d = new Date(week); d.setDate(d.getDate() + 7 * n); setWeek(d); };

  const newAt = (day, hour) => {
    const s = new Date(day);
    s.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
    setEditing({ title: '', start: s.toISOString(), end: new Date(s.getTime() + 3600e3).toISOString(), editable: true });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '6px 28px 20px' }}>
      <div className="row" style={{ marginBottom: 14 }}>
        <h1 className="page-title" style={{ fontSize: 26 }}>Agenda</h1>
        <span className="muted" style={{ marginLeft: 8, fontWeight: 600 }}>{label}</span>
        {loading && <RefreshCw size={14} className="spin dim" />}
        <span className="grow" />
        <button className="btn small icon" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
        <button className="btn small" onClick={() => setWeek(mondayOf(new Date()))}>Aujourd'hui</button>
        <button className="btn small icon" onClick={() => shift(1)}><ChevronRight size={16} /></button>
        <button className="btn small" title="Actualiser" onClick={async () => { setLoading(true); const r = await api.calendarRefresh(); setLoading(false); if (!r?.ok) toast(`Agenda : ${r?.error}`, { icon: 'alert' }); }}><RefreshCw size={14} /></button>
        <button className="btn small" onClick={() => api.openCalendarWeb()}><ExternalLink size={14} /> Google Agenda</button>
        <button className="btn small primary" onClick={() => { const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1); newAt(s, s.getHours()); }}><Plus size={14} /> Événement</button>
      </div>
      <div className="panel" style={{ flex: 1, minHeight: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          <div />
          {days.map((d) => {
            const today = isSameDay(d, now);
            return (
              <div key={+d} style={{ padding: '10px 8px 8px', borderLeft: '1px solid var(--border)', textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: today ? '#67e8f9' : 'var(--dim)' }}>{d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').toUpperCase()}</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 650, marginTop: 2, ...(today ? { width: 36, height: 36, lineHeight: '36px', margin: '2px auto 0', borderRadius: 12, background: 'linear-gradient(135deg,#22d3ee,#8b5cf6)', color: '#fff' } : {}) }}>{d.getDate()}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
                  {allDay.filter((e) => +new Date(e.start) < d.getTime() + 86400e3 && +new Date(e.end) > d.getTime()).map((e) => (
                    <button key={e.id} onClick={() => setEditing(e)} style={{ fontSize: 11, fontWeight: 600, textAlign: 'left', padding: '3px 6px', borderRadius: 6, background: `${e.color || '#8b5cf6'}44`, border: `1px solid ${e.color || '#8b5cf6'}88`, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{e.title}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', position: 'relative', height: (H1 - H0) * HOUR }}>
            <div>
              {Array.from({ length: H1 - H0 }, (_, i) => (
                <div key={i} style={{ height: HOUR, fontSize: 10.5, color: 'var(--dim)', textAlign: 'right', paddingRight: 8, transform: 'translateY(-6px)', fontFamily: 'var(--mono)' }}>{i ? `${pad(H0 + i)}:00` : ''}</div>
              ))}
            </div>
            {days.map((d) => {
              const dayEvents = layoutDay(timed.filter((e) => isSameDay(e.start, d)));
              const today = isSameDay(d, now);
              return (
                <div
                  key={+d}
                  style={{ position: 'relative', borderLeft: '1px solid var(--border)', background: today ? 'rgba(34,211,238,0.035)' : undefined, backgroundImage: `repeating-linear-gradient(to bottom, rgba(255,255,255,0.05) 0 1px, transparent 1px ${HOUR}px)` }}
                  onDoubleClick={(e) => {
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    newAt(d, H0 + Math.floor((y / HOUR) * 2) / 2);
                  }}
                >
                  {dayEvents.map((e, i) => {
                    const s = new Date(e.start);
                    const en = new Date(e.end);
                    const top = Math.max(0, (s.getHours() + s.getMinutes() / 60 - H0) * HOUR);
                    const h = Math.max(22, ((en - s) / 3600e3) * HOUR - 3);
                    const c = e.color || '#8b5cf6';
                    const past = en < now;
                    return (
                      <motion.button
                        key={e.id}
                        onClick={() => setEditing(e)}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: past ? 0.55 : 1, scale: 1 }}
                        transition={{ delay: i * 0.03 }}
                        whileHover={{ scale: 1.02, zIndex: 5 }}
                        style={{
                          position: 'absolute', top, height: h, left: `calc(${(e.col / e.cols) * 100}% + 3px)`, width: `calc(${100 / e.cols}% - 6px)`,
                          borderRadius: 9, padding: '4px 7px', textAlign: 'left', overflow: 'hidden',
                          background: `linear-gradient(135deg, ${c}55, ${c}30)`, border: `1px solid ${c}aa`, borderLeft: `3px solid ${c}`,
                          boxShadow: `0 6px 18px -10px ${c}`, fontSize: 11.5, lineHeight: 1.3,
                        }}
                      >
                        <div style={{ fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                        {h > 34 && <div style={{ opacity: 0.8, fontFamily: 'var(--mono)', fontSize: 10.5 }}>{fmtTime(s)} – {fmtTime(en)}</div>}
                        {h > 54 && e.location && <div style={{ opacity: 0.7, fontSize: 10.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><MapPin size={10} /> {e.location}</div>}
                      </motion.button>
                    );
                  })}
                  {today && now.getHours() >= H0 && now.getHours() < H1 && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: (now.getHours() + now.getMinutes() / 60 - H0) * HOUR, height: 2, background: '#f43f5e', boxShadow: '0 0 10px #f43f5e', zIndex: 4 }}>
                      <span style={{ position: 'absolute', left: -5, top: -4, width: 10, height: 10, borderRadius: '50%', background: '#f43f5e' }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="dim" style={{ fontSize: 11.5, marginTop: 8 }}>Double-clique sur un créneau pour créer un événement · clique sur un événement pour le modifier ou le supprimer. Tout est enregistré directement dans Google Agenda.</div>
      <AnimatePresence>{editing && <EventModal key="ev" ev={editing} onClose={() => setEditing(null)} />}</AnimatePresence>
    </div>
  );
}
