import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ChevronsRight, Trash2, ExternalLink, CalendarPlus, Check, Loader, Flag, CalendarDays, Swords, Hash, Inbox, Palette, Zap,
  User, Pin, Sun, Plus, MoreHorizontal, AlignLeft,
} from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { usePrefs } from '../lib/prefs.js';
import { STAGES, stageOf, PRIORITY_TAG, NOTION_COLORS, COLOR_LABEL, tagStyle, nc } from '../lib/notion.js';
import { toLocalInput } from '../lib/format.js';
import { DIFFICULTY } from '../../shared/priority.js';
import { xpForTask } from '../../shared/game.js';
import { dayKey } from '../../shared/dates.js';
import { StatusTag, PriorityTag, SourceTag, DiffPips, Tag, TaskIcon, Checkbox, MenuButton, MenuItem, ConfirmButton, Popover } from './ui.jsx';
import { IconPicker, ColorList } from './Pickers.jsx';

const uid = () => Math.random().toString(36).slice(2, 10);

function Prop({ icon: I, name, children, static: st, onClick, refEl }) {
  return (
    <div className="prop">
      <div className="prop-name"><I size={15} />{name}</div>
      <div ref={refEl} className={`prop-val ${st ? 'static' : ''}`} onClick={onClick}>{children}</div>
    </div>
  );
}

function presetDue(kind) {
  const d = new Date();
  if (kind === 'today') d.setHours(18, 0, 0, 0);
  if (kind === 'tonight') d.setHours(20, 0, 0, 0);
  if (kind === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
  if (kind === 'friday') { d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7)); d.setHours(18, 0, 0, 0); }
  if (kind === 'nextweek') { d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7)); d.setHours(10, 0, 0, 0); }
  return d.toISOString();
}

export function TaskPeek() {
  const { data, selectedId, creating, closeTask, complete, remove, toast, connectGoogle } = useApp();
  const prefs = usePrefs();
  const existing = data?.tasks.find((t) => t.id === selectedId);
  const open = !!existing || creating;
  const [draft, setDraft] = useState(null);
  const [iconOpen, setIconOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const iconRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    if (existing) setDraft(structuredClone(existing));
    else if (creating) setDraft({ title: '', description: '', notes: '', priority: 3, difficulty: 2, dueAt: null, tags: useApp.getState().tab === 'ads' ? ['ads'] : [], subtasks: [], color: 'default', emoji: '🎯', icon: 'target', source: 'manual', stage: 'todo', pinned: false });
    else setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, creating]);

  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === 'Escape' && !document.querySelector('.menu') && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  });

  const patch = (p) => {
    setDraft((d) => ({ ...d, ...p }));
    if (existing) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => api.updateTask(existing.id, p), 220);
    }
  };
  const flush = () => { if (existing && draft) { clearTimeout(timer.current); api.updateTask(existing.id, draft); } };
  const close = () => { flush(); closeTask(); };
  const create = async () => {
    if (!draft.title.trim()) return;
    await api.createTask(draft);
    toast(`Quête créée : ${draft.title}`);
    closeTask();
  };

  const isToday = draft?.questDay && dayKey(draft.questDay) === dayKey(new Date());
  const allTags = [...new Set((data?.tasks || []).flatMap((t) => t.tags || []))];

  return (
    <AnimatePresence>
      {open && draft && (
        <>
          <motion.div className="peek-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={close} />
          <motion.aside className="peek" initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 38 }}>
            <div className="peek-bar">
              <button className="btn sm icon" onClick={close} title="Fermer"><ChevronsRight size={18} /></button>
              <span className="grow" />
              {existing && (
                <>
                  {existing.sourceMeta?.url && existing.sourceMeta.url !== '#' && (
                    <button className="btn sm" onClick={() => api.openExternal(existing.sourceMeta.url)}><ExternalLink size={14} /> Ouvrir le {existing.source === 'chat' ? 'message' : 'mail'}</button>
                  )}
                  <button
                    className="btn sm"
                    onClick={async () => {
                      flush();
                      if (!data.google.connected) return connectGoogle();
                      const r = await api.scheduleTask(existing.id);
                      if (r?.ok) toast(`Créneau ajouté à l'agenda : ${new Date(r.result.start).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}`);
                      else toast(`Agenda : ${r?.error || 'erreur'}`);
                    }}
                  >
                    <CalendarPlus size={14} /> Planifier
                  </button>
                  <ConfirmButton
                    button={<button className="btn sm icon" title="Supprimer"><Trash2 size={15} /></button>}
                    message={<>Supprimer « {existing.title} » ? C'est définitif.</>}
                    onConfirm={() => { remove(existing); closeTask(); }}
                  />
                </>
              )}
            </div>

            <div className="peek-body">
              <div ref={iconRef} className="page-icon" style={{ width: 64, height: 64, fontSize: 48, marginLeft: -6 }} onClick={() => setIconOpen(true)} title="Changer l'icône ou la couleur">
                <TaskIcon task={draft} size={draft.emoji === '' ? 40 : 48} />
              </div>
              <Popover anchor={iconRef.current} open={iconOpen} onClose={() => setIconOpen(false)} width={420} className="menu picker">
                <IconPicker emoji={draft.emoji} icon={draft.icon} color={draft.color} close={() => setIconOpen(false)} onChange={patch} />
              </Popover>
              <textarea
                className="peek-title"
                rows={1}
                autoFocus={creating}
                placeholder="Sans titre"
                value={draft.title}
                onChange={(e) => { patch({ title: e.target.value }); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); creating ? create() : e.currentTarget.blur(); } }}
              />

              <MenuButton block width={230} button={<Prop icon={Loader} name="Statut"><StatusTag stage={stageOf(draft)} /></Prop>}>
                {(c) => STAGES.filter((s) => s.key !== 'done').map((s) => (
                  <MenuItem key={s.key} checked={stageOf(draft) === s.key} onClick={() => { patch({ stage: s.key }); c(); }}><StatusTag stage={s.key} /></MenuItem>
                ))}
              </MenuButton>

              <MenuButton block width={230} button={<Prop icon={Flag} name="Priorité"><PriorityTag priority={draft.priority} /></Prop>}>
                {(c) => [1, 2, 3, 4].map((p) => (
                  <MenuItem key={p} checked={draft.priority === p} onClick={() => { patch({ priority: p }); c(); }}><Tag color={PRIORITY_TAG[p].color}>{PRIORITY_TAG[p].label}</Tag></MenuItem>
                ))}
              </MenuButton>

              <MenuButton block width={280} button={<Prop icon={CalendarDays} name="Échéance">{draft.dueAt ? new Date(draft.dueAt).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : <span className="empty-val">Vide</span>}</Prop>}>
                {(c) => (
                  <div style={{ padding: 4 }}>
                    <input type="datetime-local" className="input" value={toLocalInput(draft.dueAt)} onChange={(e) => patch({ dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                    <div className="menu-sep" />
                    {[['today', "Aujourd'hui (18 h)"], ['tonight', 'Ce soir (20 h)'], ['tomorrow', 'Demain matin'], ['friday', 'Vendredi'], ['nextweek', 'Semaine prochaine']].map(([k, l]) => (
                      <MenuItem key={k} onClick={() => { patch({ dueAt: presetDue(k) }); c(); }}>{l}</MenuItem>
                    ))}
                    <MenuItem danger onClick={() => { patch({ dueAt: null }); c(); }}>Retirer l'échéance</MenuItem>
                  </div>
                )}
              </MenuButton>

              <MenuButton block width={230} button={<Prop icon={Swords} name="Difficulté"><DiffPips value={draft.difficulty} /></Prop>}>
                {(c) => [1, 2, 3, 4, 5].map((d) => (
                  <MenuItem key={d} checked={draft.difficulty === d} onClick={() => { patch({ difficulty: d }); c(); }}><DiffPips value={d} /></MenuItem>
                ))}
              </MenuButton>

              <MenuButton block width={260} button={
                <Prop icon={Hash} name="Tags">
                  {draft.tags.length ? draft.tags.map((t) => <Tag key={t} color={prefs.tagColors[t] || 'purple'}>{t}</Tag>) : <span className="empty-val">Vide</span>}
                </Prop>
              }>
                {() => (
                  <div>
                    <input
                      className="menu-search"
                      autoFocus
                      placeholder="Ajouter un tag…"
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
                    {[...new Set([...draft.tags, ...allTags])].filter((t) => !tagInput || t.includes(tagInput.toLowerCase())).slice(0, 14).map((t) => (
                      <MenuItem key={t} checked={draft.tags.includes(t)} onClick={() => patch({ tags: draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] })}>
                        <Tag color={prefs.tagColors[t] || 'purple'}>{t}</Tag>
                      </MenuItem>
                    ))}
                  </div>
                )}
              </MenuButton>

              <MenuButton block width={230} button={<Prop icon={Palette} name="Couleur"><Tag color={draft.color}>{COLOR_LABEL[nc(draft.color)]}</Tag></Prop>}>
                {(c) => <ColorList value={nc(draft.color)} onChange={(col) => { patch({ color: col }); c(); }} />}
              </MenuButton>

              <Prop icon={Inbox} name="Source" static><SourceTag source={draft.source} />{draft.sourceMeta?.from?.name && <span className="muted">de {draft.sourceMeta.from.name}</span>}</Prop>
              {prefs.appearance.gamification && <Prop icon={Zap} name="Récompense" static><span style={{ color: 'var(--c-yellow)', fontWeight: 600 }}>+{xpForTask(draft)} XP</span></Prop>}
              <Prop icon={Pin} name="Mise en avant" static>
                <button className={`chip ${draft.pinned ? 'on' : ''}`} onClick={() => patch({ pinned: !draft.pinned })}><Pin size={12} /> Épinglée</button>
                <button className={`chip ${isToday ? 'on' : ''}`} onClick={() => patch({ questDay: isToday ? null : new Date().toISOString() })}><Sun size={12} /> Quête du jour</button>
              </Prop>

              <div className="divider" style={{ margin: '18px 0' }} />

              <textarea className="block-text" placeholder="Ajoute une description…" value={draft.description} onChange={(e) => { patch({ description: e.target.value }); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} />

              <div style={{ marginTop: 14 }}>
                {draft.subtasks.map((s, i) => (
                  <div key={s.id || i} className={`todo-block ${s.done ? 'on' : ''}`}>
                    <Checkbox on={s.done} onChange={(v) => patch({ subtasks: draft.subtasks.map((x, j) => (j === i ? { ...x, done: v } : x)) })} />
                    <input
                      value={s.title}
                      placeholder="À faire"
                      onChange={(e) => patch({ subtasks: draft.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); const list = [...draft.subtasks]; list.splice(i + 1, 0, { id: uid(), title: '', done: false }); patch({ subtasks: list }); setTimeout(() => e.target.closest('.peek-body').querySelectorAll('.todo-block input')[i + 1]?.focus(), 20); }
                        if (e.key === 'Backspace' && !s.title) { e.preventDefault(); patch({ subtasks: draft.subtasks.filter((_, j) => j !== i) }); }
                      }}
                    />
                  </div>
                ))}
                <button className="new-row" onClick={() => patch({ subtasks: [...draft.subtasks, { id: uid(), title: '', done: false }] })}><Plus size={15} /> Ajouter une étape</button>
              </div>

              <div className="h-section" style={{ marginTop: 26 }}>Notes</div>
              <textarea className="block-text" placeholder="Tes notes perso…" value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} style={{ minHeight: 60 }} />

              {existing?.sourceMeta && (existing.source === 'mail' || existing.source === 'chat') && existing.description && (
                <>
                  <div className="h-section">{existing.source === 'mail' ? 'Extrait du mail' : 'Extrait du message'}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {existing.sourceMeta.from?.name || existing.sourceMeta.from?.email}
                    {existing.sourceMeta.subject && <> · « {existing.sourceMeta.subject} »</>}
                    {existing.sourceMeta.space && <> · {existing.sourceMeta.space}</>}
                  </div>
                  <div className="quote">{existing.description.slice(0, 700)}</div>
                </>
              )}

              <div className="row" style={{ marginTop: 30 }}>
                {existing ? (
                  existing.status === 'done' ? (
                    <button className="btn outline" onClick={() => { api.restoreTask(existing.id); closeTask(); }}>Remettre à faire</button>
                  ) : (
                    <motion.button className="btn success" whileTap={{ scale: 0.96 }} onClick={() => { flush(); complete({ ...existing, ...draft }); }}>
                      <Check size={16} strokeWidth={3} /> Marquer comme terminée
                    </motion.button>
                  )
                ) : (
                  <>
                    <button className="btn primary" disabled={!draft.title.trim()} onClick={create}><Plus size={15} /> Créer la quête</button>
                    <button className="btn" onClick={closeTask}>Annuler</button>
                  </>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
