import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ExternalLink, CalendarPlus, Pin, Check, X, Flame, ArrowUp, Minus, ArrowDown, Sun } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { colorOf, DIFF_COLORS } from '../lib/colors.js';
import { toLocalInput } from '../lib/format.js';
import { PRIORITY, DIFFICULTY } from '../../shared/priority.js';
import { xpForTask } from '../../shared/game.js';
import { dayKey } from '../../shared/dates.js';
import { IconTile, SourceBadge, DeleteButton } from './bits.jsx';
import { IconColorPicker } from './IconColorPicker.jsx';

const PRIO_ICONS = { 1: Flame, 2: ArrowUp, 3: Minus, 4: ArrowDown };
const uid = () => Math.random().toString(36).slice(2, 10);

function presetDue(kind) {
  const d = new Date();
  if (kind === 'none') return null;
  if (kind === 'today') d.setHours(18, 0, 0, 0);
  if (kind === 'tonight') d.setHours(20, 0, 0, 0);
  if (kind === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
  if (kind === 'friday') { d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); d.setHours(18, 0, 0, 0); }
  if (kind === 'nextweek') { d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7)); d.setHours(10, 0, 0, 0); }
  return d.toISOString();
}

export function TaskModal() {
  const { data, selectedId, creating, closeTask, complete, remove, toast, connectGoogle } = useApp();
  const existing = data?.tasks.find((t) => t.id === selectedId);
  const open = !!existing || creating;
  const [draft, setDraft] = useState(null);
  const [picker, setPicker] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const saveTimer = useRef(null);

  useEffect(() => {
    if (existing) setDraft(structuredClone(existing));
    else if (creating) setDraft({ title: '', description: '', notes: '', priority: 3, difficulty: 2, dueAt: null, tags: [], subtasks: [], color: 'violet', icon: 'sword', source: 'manual', pinned: false });
    else setDraft(null);
    setPicker(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, creating]);

  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && !picker && closeTask();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, picker, closeTask]);

  const patch = (p) => {
    setDraft((d) => ({ ...d, ...p }));
    if (existing) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => api.updateTask(existing.id, p), 250);
    }
  };
  const flush = () => {
    if (existing && draft) {
      clearTimeout(saveTimer.current);
      api.updateTask(existing.id, draft);
    }
  };
  const close = () => { flush(); closeTask(); };

  const create = async () => {
    if (!draft.title.trim()) return;
    await api.createTask(draft);
    toast(`Nouvelle quête : ${draft.title}`, { icon: 'sparkles' });
    closeTask();
  };

  const c = colorOf(draft?.color);
  const xp = useMemo(() => (draft ? xpForTask(draft) : 0), [draft]);
  const isQuestToday = draft?.questDay && dayKey(draft.questDay) === dayKey(new Date());

  return (
    <AnimatePresence>
      {open && draft && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <motion.div className="modal" initial={{ opacity: 0, y: 40, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 30, scale: 0.95 }} transition={{ type: 'spring', stiffness: 320, damping: 28 }}>
            <div className="modal-head" style={{ '--c': c }}>
              <span style={{ position: 'relative' }}>
                <IconTile icon={draft.icon} color={draft.color} onClick={() => setPicker((v) => !v)} />
                <AnimatePresence>{picker && <IconColorPicker icon={draft.icon} color={draft.color} style={{ top: 50, left: 0 }} onClose={() => setPicker(false)} onChange={patch} />}</AnimatePresence>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <SourceBadge source={draft.source} />
                  <span className="xp-reward">⚡ +{xp} XP</span>
                  {existing?.confidence != null && existing.source !== 'manual' && <span className="badge" title="Confiance de la détection automatique">🎯 {Math.round(existing.confidence * 100)} %</span>}
                </div>
                <textarea
                  className="title-input"
                  rows={2}
                  autoFocus={creating}
                  placeholder="Nom de la quête…"
                  value={draft.title}
                  onChange={(e) => patch({ title: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); creating ? create() : close(); } }}
                />
              </div>
              <button className="xbtn" onClick={close} title="Fermer"><X size={18} /></button>
            </div>

            <div className="modal-body">
              <div className="field full">
                <label>Échéance</label>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <input type="datetime-local" className="input" style={{ width: 230 }} value={toLocalInput(draft.dueAt)} onChange={(e) => patch({ dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                  <div className="seg">
                    {[['today', "Aujourd'hui"], ['tonight', 'Ce soir'], ['tomorrow', 'Demain'], ['friday', 'Vendredi'], ['nextweek', 'Sem. pro'], ['none', 'Aucune']].map(([k, l]) => (
                      <button key={k} onClick={() => patch({ dueAt: presetDue(k) })}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="field">
                <label>Priorité</label>
                <div className="seg">
                  {[1, 2, 3, 4].map((p) => {
                    const I = PRIO_ICONS[p];
                    return <button key={p} className={draft.priority === p ? 'on' : ''} onClick={() => patch({ priority: p })}><I size={13} />{PRIORITY[p].label}</button>;
                  })}
                </div>
              </div>

              <div className="field">
                <label>Difficulté</label>
                <div className="seg">
                  {[1, 2, 3, 4, 5].map((d) => (
                    <button key={d} className={draft.difficulty === d ? 'on' : ''} onClick={() => patch({ difficulty: d })} style={draft.difficulty === d ? { borderColor: DIFF_COLORS[d - 1], background: `${DIFF_COLORS[d - 1]}33` } : undefined}>
                      {DIFFICULTY[d].label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field full">
                <label>Description</label>
                <textarea className="textarea" value={draft.description} onChange={(e) => patch({ description: e.target.value })} placeholder="Détails, contexte, liens…" />
              </div>

              <div className="field full">
                <label>Étapes ({draft.subtasks.filter((s) => s.done).length}/{draft.subtasks.length})</label>
                <div className="subtasks">
                  <AnimatePresence initial={false}>
                    {draft.subtasks.map((s, i) => (
                      <motion.div key={s.id || i} className="subtask" layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <button className={`mini-check ${s.done ? 'on' : ''}`} onClick={() => patch({ subtasks: draft.subtasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}>
                          {s.done && <Check size={13} strokeWidth={3.5} />}
                        </button>
                        <input type="text" value={s.title} onChange={(e) => patch({ subtasks: draft.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} style={s.done ? { textDecoration: 'line-through', color: 'var(--muted)' } : undefined} />
                        <button className="xbtn" onClick={() => patch({ subtasks: draft.subtasks.filter((_, j) => j !== i) })}><X size={14} /></button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <button className="btn small ghost" style={{ alignSelf: 'flex-start' }} onClick={() => patch({ subtasks: [...draft.subtasks, { id: uid(), title: '', done: false }] })}>
                    <Plus size={14} /> Ajouter une étape
                  </button>
                </div>
              </div>

              <div className="field">
                <label>Tags</label>
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  {draft.tags.map((t) => (
                    <span key={t} className="badge tag" style={{ cursor: 'pointer' }} onClick={() => patch({ tags: draft.tags.filter((x) => x !== t) })} title="Retirer">#{t} ✕</span>
                  ))}
                  <input
                    className="input"
                    style={{ width: 150, minHeight: 32, padding: '4px 10px' }}
                    placeholder="+ tag (Entrée)"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        const t = tagInput.trim().replace(/^#/, '').toLowerCase();
                        if (!draft.tags.includes(t)) patch({ tags: [...draft.tags, t] });
                        setTagInput('');
                      }
                    }}
                  />
                </div>
              </div>

              <div className="field">
                <label>Mise en avant</label>
                <div className="seg">
                  <button className={draft.pinned ? 'on' : ''} onClick={() => patch({ pinned: !draft.pinned })}><Pin size={13} /> Épinglée</button>
                  <button className={isQuestToday ? 'on' : ''} onClick={() => patch({ questDay: isQuestToday ? null : new Date().toISOString() })}><Sun size={13} /> Quête du jour</button>
                </div>
              </div>

              <div className="field full">
                <label>Notes</label>
                <textarea className="textarea" style={{ minHeight: 64 }} value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Tes notes perso…" />
              </div>

              {existing?.sourceMeta && (existing.source === 'mail' || existing.source === 'chat') && (
                <div className="field full">
                  <label>Provenance</label>
                  <div className="source-box">
                    <div className="row">
                      <span>
                        {existing.source === 'mail' ? '✉️ Mail de ' : '💬 Message de '}
                        <b style={{ color: 'var(--text)' }}>{existing.sourceMeta.from?.name || existing.sourceMeta.from?.email || 'inconnu'}</b>
                        {existing.sourceMeta.subject && <> — « {existing.sourceMeta.subject} »</>}
                        {existing.sourceMeta.space && <> — {existing.sourceMeta.space}</>}
                      </span>
                      <span className="grow" />
                      {existing.sourceMeta.url && existing.sourceMeta.url !== '#' && (
                        <button className="btn small" onClick={() => api.openExternal(existing.sourceMeta.url)}><ExternalLink size={13} /> Ouvrir</button>
                      )}
                    </div>
                    {existing.description && <div className="quote">{existing.description.slice(0, 600)}</div>}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-foot">
              {existing ? (
                <>
                  <DeleteButton label={existing.title} onConfirm={() => { remove(existing); closeTask(); }} />
                  <button
                    className="btn small"
                    title="Bloquer un créneau dans Google Agenda pour cette quête"
                    onClick={async () => {
                      flush();
                      if (!data.google.connected) { connectGoogle(); return; }
                      const r = await api.scheduleTask(existing.id);
                      if (r?.ok) toast(`Créneau ajouté à ton agenda : ${new Date(r.result.start).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}`, { icon: 'check' });
                      else toast(`Agenda : ${r?.error || 'erreur'}`, { icon: 'alert' });
                    }}
                  >
                    <CalendarPlus size={14} /> Planifier dans l'agenda
                  </button>
                  <span className="grow" />
                  {existing.status === 'done' ? (
                    <button className="btn" onClick={() => { api.restoreTask(existing.id); closeTask(); }}>Remettre à faire</button>
                  ) : (
                    <motion.button className="btn success" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => { flush(); complete({ ...existing, ...draft }); }}>
                      <Check size={17} strokeWidth={3} /> Quête accomplie
                    </motion.button>
                  )}
                </>
              ) : (
                <>
                  <span className="grow" />
                  <button className="btn" onClick={close}>Annuler</button>
                  <button className="btn primary" disabled={!draft.title.trim()} onClick={create}><Plus size={16} /> Créer la quête</button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
