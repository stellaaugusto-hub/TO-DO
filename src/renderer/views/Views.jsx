import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown, List, Table2, Columns3, SlidersHorizontal, Filter, Search, RotateCcw, Wand2, X, Check, Layers } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { usePrefs, savePrefs, TODO_COLUMNS } from '../lib/prefs.js';
import { STAGES, stageOf, PRIORITY_TAG, SOURCE_TAG, textColor, nc, tagStyle } from '../lib/notion.js';
import { todaysQuests, groupTasks, sortTasks, bucketOf, BUCKETS } from '../../shared/priority.js';
import { xpForTask, levelInfo, currentStreak } from '../../shared/game.js';
import { parseDue, isSameDay, dayKey } from '../../shared/dates.js';
import { todayLabel, eventTime } from '../lib/format.js';
import { PageHeader } from '../components/Shell.jsx';
import { StatusTag, PriorityTag, SourceTag, DueTag, DiffPips, Tag, TaskIcon, Checkbox, MenuButton, MenuItem, ConfirmButton, XpBar } from '../components/ui.jsx';

// ---------------------------------------------------------------------------
// Petits composants partagés
// ---------------------------------------------------------------------------
function TaskProps({ task, columns, tagColors }) {
  const out = [];
  for (const c of columns) {
    if (c === 'stage') out.push(<StatusTag key={c} task={task} />);
    if (c === 'priority' && task.priority <= 3) out.push(<PriorityTag key={c} priority={task.priority} />);
    if (c === 'due' && task.status !== 'done') out.push(<DueTag key={c} dueAt={task.dueAt} />);
    if (c === 'source') out.push(<SourceTag key={c} source={task.source} />);
    if (c === 'difficulty') out.push(<DiffPips key={c} value={task.difficulty} label={false} />);
    if (c === 'tags') for (const t of (task.tags || []).slice(0, 2)) out.push(<Tag key={`t-${t}`} color={tagColors[t] || 'purple'}>{t}</Tag>);
    if (c === 'xp') out.push(<span key={c} className="dim" style={{ fontSize: 12.5 }}>+{xpForTask(task)} XP</span>);
    if (c === 'from' && task.sourceMeta?.from?.name) out.push(<span key={c} className="dim" style={{ fontSize: 12.5 }}>{task.sourceMeta.from.name}</span>);
  }
  return out;
}

function NewRow({ placeholder = 'Nouvelle quête… ex. « Appeler Marc demain 10h »', extra: extraProp = {} }) {
  const onAds = useApp((st) => st.tab === 'ads');
  const extra = onAds ? { tags: ['ads'], ...extraProp } : extraProp;
  const [text, setText] = useState('');
  const toast = useApp((s) => s.toast);
  const due = text.trim() ? parseDue(text) : null;
  const add = async () => {
    let title = text.trim();
    if (!title) return;
    if (due?.phrase) {
      const i = title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').indexOf(due.phrase);
      if (i >= 0) title = (title.slice(0, i) + title.slice(i + due.phrase.length)).replace(/\s+(avant|pour|d'ici|à|a)?\s*$/i, '').replace(/\s+/g, ' ').trim();
    }
    await api.createTask({ title: title.charAt(0).toUpperCase() + title.slice(1), dueAt: due?.due ? due.due.toISOString() : null, priority: due?.urgency === 'urgent' ? 1 : due?.urgency === 'low' ? 4 : 3, ...extra });
    toast(`Quête ajoutée : ${title}`);
    setText('');
  };
  return (
    <div className="new-row">
      <Plus size={15} />
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={placeholder} />
      {due?.due && <Tag color="blue">📅 {due.due.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Tag>}
    </div>
  );
}

function ListRow({ task, columns, done = false, index = 0 }) {
  const { openTask, complete, remove, highlight } = useApp();
  const prefs = usePrefs();
  const isNew = task.isNew || highlight.includes(task.id);
  return (
    <motion.div
      layout
      className={`list-row ${done ? 'done' : ''}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.2) }}
      onClick={() => openTask(task.id)}
    >
      {nc(task.color) !== 'default' && <span className="row-bar" style={{ background: textColor(task.color) }} />}
      {done ? (
        <button className="btn sm icon" title="Remettre à faire" onClick={(e) => { e.stopPropagation(); api.restoreTask(task.id); }}><RotateCcw size={14} /></button>
      ) : (
        <Checkbox on={false} onChange={() => complete(task)} title="Terminer" />
      )}
      <span style={{ width: 22, display: 'grid', placeItems: 'center', flex: 'none' }}><TaskIcon task={task} size={17} /></span>
      <span className="title">{task.title}</span>
      {isNew && <span className="new-badge">Nouveau</span>}
      <span className="props"><TaskProps task={task} columns={columns} tagColors={prefs.tagColors} /></span>
      <ConfirmButton
        button={<button className="btn sm icon" title="Supprimer"><X size={15} /></button>}
        message={<>Supprimer « {task.title} » ?</>}
        onConfirm={() => remove(task)}
      />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Quêtes du jour (page d'accueil)
// ---------------------------------------------------------------------------
function QuestCard({ task, index }) {
  const { openTask, complete, remove, highlight } = useApp();
  const prefs = usePrefs();
  const col = nc(task.color);
  const subs = task.subtasks || [];
  const isNew = task.isNew || highlight.includes(task.id);
  return (
    <motion.div
      layout
      className="gcard"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.3) }}
      whileHover={{ y: -2 }}
      onClick={() => openTask(task.id)}
    >
      <div className="gcard-top" style={{ background: col === 'default' ? 'var(--callout)' : `var(--c-${col}-bg)` }}>
        <span className="gcard-emoji"><TaskIcon task={task} size={task.emoji === '' ? 22 : 26} /></span>
        <span className="grow" />
        <span style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
          {isNew && <span className="new-badge" style={{ background: 'var(--bg)' }}>Nouveau</span>}
          <ConfirmButton button={<button className="btn sm icon" style={{ background: 'var(--bg)', height: 22, width: 22 }} title="Supprimer"><X size={13} /></button>} message={<>Supprimer « {task.title} » ?</>} onConfirm={() => remove(task)} />
        </span>
      </div>
      <div className="gcard-body">
        <div className="gcard-title">{task.title}</div>
        {subs.length > 0 && (
          <div className="row" style={{ gap: 6, fontSize: 12.5 }} >
            <XpBar progress={subs.filter((s) => s.done).length / subs.length} style={{ width: 80 }} />
            <span className="dim">{subs.filter((s) => s.done).length}/{subs.length} étapes</span>
          </div>
        )}
        <div className="gcard-props">
          <DueTag dueAt={task.dueAt} />
          {task.priority <= 2 && <PriorityTag priority={task.priority} />}
          <SourceTag source={task.source} />
          {(task.tags || []).slice(0, 1).map((t) => <Tag key={t} color={prefs.tagColors[t] || 'purple'}>{t}</Tag>)}
        </div>
      </div>
      <div className="gcard-foot">
        <DiffPips value={task.difficulty} />
        {prefs.appearance.gamification && <span style={{ color: 'var(--c-yellow)', fontWeight: 600 }}>+{xpForTask(task)} XP</span>}
        <span className="grow" />
        <button className="complete-btn" onClick={(e) => { e.stopPropagation(); complete(task); }}><Check size={13} strokeWidth={3} /> Terminer</button>
      </div>
    </motion.div>
  );
}

export function QuestsView() {
  const { data, runSync, newTask, connectGoogle, openTask } = useApp();
  const prefs = usePrefs();
  const now = new Date();
  const quests = todaysQuests(data.tasks, now);
  const upcoming = sortTasks(data.tasks.filter((t) => t.status !== 'done' && !quests.includes(t)), now).slice(0, 6);
  const doneToday = data.tasks.filter((t) => t.status === 'done' && t.completedAt && isSameDay(t.completedAt, now));
  const events = (data.events || []).filter((e) => e.start && isSameDay(e.start, now)).sort((a, b) => a.start.localeCompare(b.start));
  const lvl = levelInfo(data.stats.xp);
  const streak = currentStreak(data.stats);
  const xpToday = doneToday.reduce((s, t) => s + (t.xpEarned || 0), 0);
  const urgent = quests.filter((q) => q.priority === 1).length;
  const name = data.profile.name;
  const date = todayLabel(now);

  return (
    <div>
      <PageHeader id="quests" subtitle={date.charAt(0).toUpperCase() + date.slice(1)}>
        <div className="callout">
          <span className="emoji">{quests.length ? '⚔️' : '🌿'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>
              {name ? `${name}, ` : ''}
              {quests.length ? `tu as ${quests.length} quête${quests.length > 1 ? 's' : ''} aujourd'hui${urgent ? `, dont ${urgent} urgente${urgent > 1 ? 's' : ''}` : ''}.` : 'rien d\'urgent aujourd\'hui. Profites-en pour avancer une quête à venir.'}
            </div>
            <div className="muted" style={{ fontSize: 14, marginTop: 2 }}>La plus importante est en premier. Clique sur une quête pour tout voir et tout modifier.</div>
            {prefs.appearance.gamification && (
              <div className="row" style={{ gap: 14, marginTop: 10, fontSize: 13.5, flexWrap: 'wrap' }}>
                <span>✅ {doneToday.length}/{doneToday.length + quests.length} faites</span>
                <span>⚡ +{xpToday} XP aujourd'hui</span>
                <span>⭐ Niveau {lvl.level} · {lvl.title}</span>
                {streak > 0 && <span>🔥 {streak} jour{streak > 1 ? 's' : ''} d'affilée</span>}
                <span className="grow" />
                <XpBar progress={lvl.progress} style={{ width: 140 }} />
              </div>
            )}
          </div>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm" onClick={runSync}>📨 Scanner mails & chat</button>
          <button className="btn sm" onClick={newTask}>➕ Nouvelle quête</button>
        </div>

        <div className="h-section">Quêtes du jour <span className="count">{quests.length}</span></div>
        {quests.length ? (
          <motion.div className="gallery" layout>
            <AnimatePresence mode="popLayout">
              {quests.map((t, i) => <QuestCard key={t.id} task={t} index={i} />)}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="empty"><div style={{ fontSize: 34 }}>🌤️</div><div className="big">Journée libre</div><div>Les quêtes dues aujourd'hui, en retard ou urgentes apparaissent ici.</div></div>
        )}

        <div className="columns">
          <div>
            <div className="h-section">Agenda du jour <span className="count">{events.length || ''}</span></div>
            {!data.google.connected ? (
              <div className="callout"><span className="emoji">📅</span><div>Connecte Google Agenda pour voir tes rendez-vous ici.<div style={{ marginTop: 8 }}><button className="btn primary sm" onClick={connectGoogle}>Connecter Google</button></div></div></div>
            ) : events.length ? (
              events.map((e) => {
                const st = new Date(e.end || e.start) < now ? 'past' : new Date(e.start) <= now ? 'now' : '';
                return (
                  <div key={e.id} className="list-row" style={{ cursor: 'default', opacity: st === 'past' ? 0.5 : 1 }}>
                    <span className="mono" style={{ fontSize: 12.5, width: 44, color: st === 'now' ? 'var(--c-red)' : 'var(--text-2)' }}>{eventTime(e)}</span>
                    <span className="dot" style={{ background: e.color || 'var(--accent)' }} />
                    <span className="title">{e.title}</span>
                    {st === 'now' && <Tag color="red">En cours</Tag>}
                  </div>
                );
              })
            ) : (
              <div className="muted" style={{ padding: '6px 4px' }}>Aucun événement aujourd'hui 🎉</div>
            )}
          </div>
          <div>
            <div className="h-section">À venir <span className="count">{upcoming.length || ''}</span></div>
            <AnimatePresence mode="popLayout">
              {upcoming.map((t, i) => <ListRow key={t.id} task={t} index={i} columns={['due', 'priority']} />)}
            </AnimatePresence>
            <NewRow placeholder="Nouvelle quête…" />
          </div>
        </div>
      </PageHeader>
    </div>
  );
}

// ---------------------------------------------------------------------------
// To-do : base de données avec vues Liste / Tableau / Kanban
// ---------------------------------------------------------------------------
const VIEWS = [
  { id: 'list', label: 'Liste', icon: List },
  { id: 'table', label: 'Tableau', icon: Table2 },
  { id: 'board', label: 'Kanban', icon: Columns3 },
];
const SOURCES = [['all', 'Toutes les sources'], ['mail', 'Mails'], ['chat', 'Chat'], ['manual', 'Créées par moi']];
const GROUPS = [['due', 'Échéance'], ['priority', 'Priorité'], ['stage', 'Statut'], ['source', 'Source'], ['none', 'Aucun']];

function groupBy(tasks, key) {
  if (key === 'due') return groupTasks(tasks).map((g) => ({ ...g, color: g.key === 'overdue' ? 'red' : g.key === 'today' ? 'orange' : 'gray' }));
  const sorted = sortTasks(tasks);
  if (key === 'none') return [{ key: 'all', label: 'Toutes les quêtes', tasks: sorted, color: 'gray' }];
  const defs = key === 'priority' ? [1, 2, 3, 4].map((p) => ({ key: p, label: PRIORITY_TAG[p].label, color: PRIORITY_TAG[p].color, f: (t) => t.priority === p }))
    : key === 'stage' ? STAGES.filter((s) => s.key !== 'done').map((s) => ({ key: s.key, label: s.label, color: s.color, f: (t) => stageOf(t) === s.key }))
      : Object.entries(SOURCE_TAG).map(([k, s]) => ({ key: k, label: s.label, color: s.color, f: (t) => (t.source || 'manual') === k }));
  return defs.map((d) => ({ ...d, tasks: sorted.filter(d.f) })).filter((g) => g.tasks.length);
}

function TableView({ tasks, columns }) {
  const { openTask, complete } = useApp();
  const prefs = usePrefs();
  const head = { stage: 'Statut', priority: 'Priorité', due: 'Échéance', source: 'Source', difficulty: 'Difficulté', tags: 'Tags', xp: 'XP', from: 'De' };
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 34 }} />
            <th>Aa Tâche</th>
            {columns.map((c) => <th key={c}>{head[c]}</th>)}
          </tr>
        </thead>
        <tbody>
          {sortTasks(tasks).map((t) => (
            <tr key={t.id} className="body">
              <td><Checkbox on={false} onChange={() => complete(t)} /></td>
              <td className="title-cell" onClick={() => openTask(t.id)}><span className="row" style={{ gap: 8 }}><TaskIcon task={t} size={16} />{t.title}{t.isNew && <span className="new-badge">Nouveau</span>}</span></td>
              {columns.map((c) => (
                <td key={c}>
                  {c === 'stage' && (
                    <MenuButton width={200} button={<span className="clickable"><StatusTag task={t} /></span>}>
                      {(cl) => STAGES.filter((s) => s.key !== 'done').map((s) => <MenuItem key={s.key} checked={stageOf(t) === s.key} onClick={() => { api.updateTask(t.id, { stage: s.key }); cl(); }}><StatusTag stage={s.key} /></MenuItem>)}
                    </MenuButton>
                  )}
                  {c === 'priority' && (
                    <MenuButton width={200} button={<span className="clickable"><PriorityTag priority={t.priority} /></span>}>
                      {(cl) => [1, 2, 3, 4].map((p) => <MenuItem key={p} checked={t.priority === p} onClick={() => { api.updateTask(t.id, { priority: p }); cl(); }}><PriorityTag priority={p} /></MenuItem>)}
                    </MenuButton>
                  )}
                  {c === 'due' && <DueTag dueAt={t.dueAt} plain />}
                  {c === 'source' && <SourceTag source={t.source} />}
                  {c === 'difficulty' && <DiffPips value={t.difficulty} />}
                  {c === 'tags' && <span className="row" style={{ gap: 4 }}>{(t.tags || []).map((x) => <Tag key={x} color={prefs.tagColors[x] || 'purple'}>{x}</Tag>)}</span>}
                  {c === 'xp' && <span className="dim">+{xpForTask(t)}</span>}
                  {c === 'from' && <span className="muted">{t.sourceMeta?.from?.name || ''}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <NewRow />
    </div>
  );
}

function BoardView({ tasks, doneTasks }) {
  const { openTask, complete } = useApp();
  const prefs = usePrefs();
  const [over, setOver] = useState(null);
  const [dragId, setDragId] = useState(null);
  const all = [...tasks, ...doneTasks];
  const drop = (stage) => {
    const t = all.find((x) => x.id === dragId);
    setOver(null);
    setDragId(null);
    if (!t || stageOf(t) === stage) return;
    if (stage === 'done') complete(t);
    else if (t.status === 'done') api.restoreTask(t.id).then(() => api.updateTask(t.id, { stage }));
    else api.updateTask(t.id, { stage });
  };
  return (
    <div className="board">
      {STAGES.map((s) => {
        const list = s.key === 'done' ? doneTasks.slice(0, 12) : sortTasks(tasks.filter((t) => stageOf(t) === s.key));
        return (
          <div key={s.key} className={`col ${over === s.key ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(s.key); }} onDragLeave={() => setOver(null)} onDrop={() => drop(s.key)}>
            <div className="col-head"><StatusTag stage={s.key} /><span className="dim">{list.length}</span></div>
            <AnimatePresence mode="popLayout">
              {list.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  className={`card ${dragId === t.id ? 'dragging' : ''}`}
                  draggable
                  onDragStart={(e) => { setDragId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragEnd={() => { setDragId(null); setOver(null); }}
                  onClick={() => openTask(t.id)}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  style={nc(t.color) !== 'default' ? { boxShadow: `inset 3px 0 0 ${textColor(t.color)}, var(--shadow-sm)` } : undefined}
                >
                  <div className="t" style={s.key === 'done' ? { textDecoration: 'line-through', color: 'var(--text-3)' } : undefined}><span style={{ marginRight: 6 }}><TaskIcon task={t} size={15} /></span>{t.title}</div>
                  <div className="p">
                    {s.key !== 'done' && <DueTag dueAt={t.dueAt} />}
                    {t.priority <= 2 && <PriorityTag priority={t.priority} />}
                    <SourceTag source={t.source} />
                    {(t.tags || []).slice(0, 1).map((x) => <Tag key={x} color={prefs.tagColors[x] || 'purple'}>{x}</Tag>)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {s.key !== 'done' && <NewRow placeholder="Nouvelle…" extra={{ stage: s.key }} />}
          </div>
        );
      })}
    </div>
  );
}

export const isAdsTask = (t) => (t.tags || []).includes('ads');

/** To-do Ads : la même to-do, limitée aux quêtes publicitaires (tag « ads »). */
export function AdsView() {
  return <TodoView pageId="ads" only={isAdsTask} subtitle="Tes quêtes publicitaires : production d'ads, alertes Meta / Google Ads, demandes de l'équipe. Triées par urgence." />;
}

export function TodoView({ pageId = 'todo', only = null, subtitle = "Tout ce que tu as à faire, trié automatiquement : en retard → aujourd'hui → demain → plus tard." } = {}) {
  const { data, setPaletteOpen, newTask, setPasteOpen } = useApp();
  const prefs = usePrefs();
  const v = prefs.todo;
  const srcFilter = (t) => (v.source === 'all' || (t.source || 'manual') === v.source) && (!only || only(t));
  const open = data.tasks.filter((t) => t.status !== 'done' && srcFilter(t));
  const done = data.tasks.filter((t) => t.status === 'done' && srcFilter(t)).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const groups = useMemo(() => groupBy(open, v.groupBy), [open, v.groupBy]);

  return (
    <div>
      <PageHeader id={pageId} subtitle={subtitle}>
        <div className="db-head">
          {VIEWS.map((x) => (
            <button key={x.id} className={`view-tab ${v.view === x.id ? 'on' : ''}`} onClick={() => savePrefs({ todo: { view: x.id } })}><x.icon size={15} />{x.label}</button>
          ))}
          <span className="grow" />
          <MenuButton align="right" width={220} button={<button className="btn sm" style={v.source !== 'all' ? { color: 'var(--accent)' } : undefined}><Filter size={14} />{v.source === 'all' ? 'Filtrer' : SOURCES.find((s) => s[0] === v.source)[1]}</button>}>
            {(c) => SOURCES.map(([k, l]) => <MenuItem key={k} checked={v.source === k} onClick={() => { savePrefs({ todo: { source: k } }); c(); }}>{l}</MenuItem>)}
          </MenuButton>
          {v.view === 'list' && (
            <MenuButton align="right" width={200} button={<button className="btn sm"><Layers size={14} />Grouper</button>}>
              {(c) => GROUPS.map(([k, l]) => <MenuItem key={k} checked={v.groupBy === k} onClick={() => { savePrefs({ todo: { groupBy: k } }); c(); }}>{l}</MenuItem>)}
            </MenuButton>
          )}
          {v.view !== 'board' && (
            <MenuButton align="right" width={230} button={<button className="btn sm"><SlidersHorizontal size={14} />Propriétés</button>}>
              {() => (
                <>
                  <div className="menu-title">Propriétés affichées</div>
                  {TODO_COLUMNS.map((c) => (
                    <MenuItem key={c.key} checked={v.columns.includes(c.key)} onClick={() => savePrefs({ todo: { columns: v.columns.includes(c.key) ? v.columns.filter((x) => x !== c.key) : TODO_COLUMNS.map((x) => x.key).filter((k) => k === c.key || v.columns.includes(k)) } })}>{c.label}</MenuItem>
                  ))}
                </>
              )}
            </MenuButton>
          )}
          <button className="btn sm icon" onClick={() => setPaletteOpen(true)} title="Rechercher"><Search size={15} /></button>
          <span className="split" style={{ marginLeft: 4, marginBottom: 4 }}>
            <button className="btn primary sm" onClick={newTask}>Nouveau</button>
            <MenuButton align="right" width={240} button={<button className="btn primary sm"><ChevronDown size={14} /></button>}>
              {(c) => (
                <>
                  <MenuItem icon={<Plus size={15} />} onClick={() => { c(); newTask(); }}>Nouvelle quête</MenuItem>
                  <MenuItem icon={<Wand2 size={15} />} onClick={() => { c(); setPasteOpen(true); }}>Transformer un texte en quêtes</MenuItem>
                </>
              )}
            </MenuButton>
          </span>
        </div>

        {v.view === 'list' && (
          <div>
            {groups.map((g) => (
              <div key={g.key}>
                <div className="group-head"><Tag color={g.color}>{g.label}</Tag><span className="n">{g.tasks.length}</span></div>
                <AnimatePresence mode="popLayout">
                  {g.tasks.map((t, i) => <ListRow key={t.id} task={t} index={i} columns={v.columns} />)}
                </AnimatePresence>
              </div>
            ))}
            {!open.length && <div className="empty"><div style={{ fontSize: 34 }}>🏆</div><div className="big">Tout est fait !</div><div>Ajoute une quête ou scanne tes mails.</div></div>}
            <div style={{ marginTop: 10 }}><NewRow /></div>
          </div>
        )}
        {v.view === 'table' && <TableView tasks={open} columns={v.columns} />}
        {v.view === 'board' && <BoardView tasks={open} doneTasks={done} />}
      </PageHeader>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminées
// ---------------------------------------------------------------------------
export function DoneView() {
  const data = useApp((s) => s.data);
  const prefs = usePrefs();
  const done = data.tasks.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const byDay = [];
  for (const t of done) {
    const k = dayKey(t.completedAt || t.createdAt);
    let g = byDay[byDay.length - 1];
    if (!g || g.k !== k) byDay.push((g = { k, label: new Date(t.completedAt || t.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }), tasks: [] }));
    g.tasks.push(t);
  }
  const lvl = levelInfo(data.stats.xp);
  return (
    <div>
      <PageHeader id="done" subtitle="Ton tableau de chasse. Tu peux remettre une quête à faire à tout moment.">
        {prefs.appearance.gamification && (
          <div className="callout green">
            <span className="emoji">🏆</span>
            <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
              <span><b>{data.stats.completedCount || done.length}</b> quêtes accomplies</span>
              <span>⚡ <b>{data.stats.xp}</b> XP</span>
              <span>⭐ Niveau <b>{lvl.level}</b> · {lvl.title}</span>
              <span>🔥 Record de série : <b>{data.stats.bestStreak || 0}</b> j</span>
              <span>🎮 Record au jeu : <b>{data.stats.highScore || 0}</b></span>
            </div>
          </div>
        )}
        {byDay.map((g) => (
          <div key={g.k}>
            <div className="group-head" style={{ textTransform: 'capitalize' }}>{g.label}{prefs.appearance.gamification && <span className="n">+{g.tasks.reduce((s, t) => s + (t.xpEarned || 0), 0)} XP</span>}</div>
            <AnimatePresence mode="popLayout">
              {g.tasks.map((t, i) => <ListRow key={t.id} task={t} index={i} done columns={['source', 'tags']} />)}
            </AnimatePresence>
          </div>
        ))}
        {!done.length && <div className="empty"><div style={{ fontSize: 34 }}>✨</div><div className="big">Pas encore de quête terminée</div><div>Coche ta première quête pour voir l'animation de victoire.</div></div>}
      </PageHeader>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coller un texte -> quêtes
// ---------------------------------------------------------------------------
export function PasteModal() {
  const { pasteOpen, setPasteOpen, toast } = useApp();
  const [text, setText] = useState('');
  const [found, setFound] = useState(null);
  const [picked, setPicked] = useState({});
  const reset = () => { setText(''); setFound(null); };
  const analyse = async () => {
    const tasks = await api.tasksFromText(text);
    setFound(tasks);
    setPicked(Object.fromEntries(tasks.map((_, i) => [i, true])));
  };
  const add = async () => {
    const list = found.filter((_, i) => picked[i]).map((t) => ({ ...t, source: 'manual', isNew: true }));
    if (list.length) await api.createTasks(list);
    toast(`${list.length} quête${list.length > 1 ? 's' : ''} ajoutée${list.length > 1 ? 's' : ''}`);
    setPasteOpen(false);
    reset();
  };
  return (
    <AnimatePresence>
      {pasteOpen && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && (setPasteOpen(false), reset())}>
          <motion.div className="modal" initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.16 }}>
            <div className="modal-head">
              <h2>🪄 Transformer un texte en quêtes</h2>
              <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Colle un message (Slack, WhatsApp, notes…) : je trouve les missions, les dates et les priorités.</div>
            </div>
            <div className="modal-body">
              {!found ? (
                <textarea className="textarea" autoFocus style={{ minHeight: 170 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex : Hello ! Peux-tu ajouter des nouvelles ads sur Facebook, Instagram et TikTok avant vendredi ? Et n'oublie pas d'appeler Marc demain matin." />
              ) : found.length ? (
                found.map((t, i) => (
                  <div key={i} className="list-row" onClick={() => setPicked({ ...picked, [i]: !picked[i] })}>
                    <Checkbox on={!!picked[i]} onChange={(v) => setPicked({ ...picked, [i]: v })} />
                    <span className="title">{t.title}</span>
                    <span className="props"><DueTag dueAt={t.dueAt} /><PriorityTag priority={t.priority} />{t.subtasks.length > 0 && <Tag>☑ {t.subtasks.length} étapes</Tag>}</span>
                  </div>
                ))
              ) : (
                <div className="empty"><div className="big">Aucune mission détectée</div><div>Le texte ne contient pas de demande claire.</div></div>
              )}
            </div>
            <div className="modal-foot">
              <span className="grow" />
              <button className="btn" onClick={() => (found ? setFound(null) : (setPasteOpen(false), reset()))}>{found ? 'Modifier le texte' : 'Annuler'}</button>
              {!found ? <button className="btn primary" disabled={!text.trim()} onClick={analyse}>Analyser</button> : found.length > 0 && <button className="btn primary" onClick={add}>Ajouter la sélection</button>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
