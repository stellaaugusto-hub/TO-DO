import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, Plus, CalendarDays, ExternalLink, Trophy, Flame, Zap, Target, Wand2, X, Check, Mail, MessageCircle, PenLine } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { TaskCard } from '../components/TaskCard.jsx';
import { TaskRow } from '../components/TaskRow.jsx';
import { ProgressRing, PriorityBadge, DifficultyMeter, DueBadge } from '../components/bits.jsx';
import { todaysQuests, groupTasks, sortTasks } from '../../shared/priority.js';
import { searchTasks, parseQuery } from '../../shared/search.js';
import { levelInfo, currentStreak } from '../../shared/game.js';
import { parseDue, isSameDay, dayKey } from '../../shared/dates.js';
import { todayLabel, eventTime } from '../lib/format.js';

// ---------------------------------------------------------------------------
// Quêtes du jour
// ---------------------------------------------------------------------------
export function QuestsView() {
  const { data, runSync, newTask, connectGoogle } = useApp();
  const now = new Date();
  const quests = todaysQuests(data.tasks, now);
  const doneToday = data.tasks.filter((t) => t.status === 'done' && t.completedAt && isSameDay(t.completedAt, now)).length;
  const sideQuests = sortTasks(data.tasks.filter((t) => t.status !== 'done' && !quests.includes(t)), now).slice(0, 4);
  const lvl = levelInfo(data.stats.xp);
  const streak = currentStreak(data.stats);
  const events = (data.events || []).filter((e) => e.start && isSameDay(e.start, now)).sort((a, b) => a.start.localeCompare(b.start));
  const xpToday = data.tasks.filter((t) => t.status === 'done' && t.completedAt && isSameDay(t.completedAt, now)).reduce((s, t) => s + (t.xpEarned || 0), 0);

  return (
    <div>
      <div className="hero">
        <motion.div className="hero-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <div className="hero-date">{todayLabel(now)}</div>
          <h1 className="page-title" style={{ marginTop: 8, fontSize: 32 }}>
            {quests.length ? <>Tes <span className="grad-text">{quests.length} quête{quests.length > 1 ? 's' : ''}</span> du jour</> : <>Journée <span className="grad-text">libérée</span> ✨</>}
          </h1>
          <div className="page-sub" style={{ position: 'relative' }}>
            {quests.length
              ? quests.some((q) => q.priority === 1) ? '🔥 Commence par la quête urgente : la plus importante est en haut.' : 'Classées par urgence : la première est celle à attaquer maintenant.'
              : 'Aucune quête pour aujourd\'hui. Scanne tes mails ou attaque une quête annexe pour gagner de l\'XP.'}
          </div>
          <div className="row" style={{ marginTop: 18, position: 'relative' }}>
            <button className="btn small" onClick={runSync}><RefreshCw size={14} /> Scanner mails & chat</button>
            <button className="btn small" onClick={newTask}><Plus size={14} /> Ajouter une quête</button>
          </div>
        </motion.div>
        <div className="hero-stats">
          <motion.div className="stat-tile" style={{ alignItems: 'center', justifyContent: 'center' }} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.05 }}>
            <ProgressRing value={doneToday} total={doneToday + quests.length} />
          </motion.div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <motion.div className="stat-tile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <span className="k"><Zap size={12} /> XP du jour</span>
              <span className="v" style={{ color: '#fde68a' }}>+{xpToday}</span>
            </motion.div>
            <motion.div className="stat-tile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <span className="k"><Flame size={12} /> Série</span>
              <span className="v" style={{ color: '#fdba74' }}>{streak} j</span>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="quests-layout">
        <div>
          <div className="section-title"><Target size={14} /> Quêtes principales <span className="count">{quests.length}</span><span className="line" /></div>
          {quests.length ? (
            <motion.div className="quest-grid" layout>
              <AnimatePresence mode="popLayout">
                {quests.map((t, i) => <TaskCard key={t.id} task={t} index={i} />)}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div className="panel empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }} transition={{ duration: 3, repeat: Infinity }}><Sparkles size={40} color="#a78bfa" /></motion.div>
              <div className="big">Rien d'urgent aujourd'hui</div>
              <div>Les quêtes dues aujourd'hui, en retard ou urgentes apparaissent ici.</div>
            </motion.div>
          )}

          {sideQuests.length > 0 && (
            <>
              <div className="section-title"><Sparkles size={14} /> Quêtes annexes <span className="count">à venir</span><span className="line" /></div>
              <AnimatePresence mode="popLayout">
                {sideQuests.map((t, i) => <TaskRow key={t.id} task={t} index={i} />)}
              </AnimatePresence>
            </>
          )}
        </div>

        <motion.div className="panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} style={{ position: 'sticky', top: 0 }}>
          <h3><CalendarDays size={16} color="#67e8f9" /> Agenda du jour</h3>
          {!data.google.connected ? (
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Connecte Google pour voir tes rendez-vous ici.
              <button className="btn small primary" style={{ marginTop: 12, width: '100%' }} onClick={connectGoogle}>Connecter Google Agenda</button>
            </div>
          ) : events.length ? (
            <div className="timeline">
              {events.map((e, i) => {
                const start = new Date(e.start);
                const end = new Date(e.end || e.start);
                const st = end < now ? 'past' : start <= now ? 'now' : '';
                return (
                  <motion.div key={e.id} className={`tl-item ${st}`} initial={{ opacity: 0, x: 12 }} animate={{ opacity: st === 'past' ? 0.5 : 1, x: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
                    <span className="tl-time">{eventTime(e)}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="tl-title">{e.title}</div>
                      <div className="tl-sub">{st === 'now' ? '● En cours · ' : ''}{e.location || e.calendar}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Aucun événement aujourd'hui 🎉</div>
          )}
          <div className="dim" style={{ fontSize: 11.5, marginTop: 14 }}>Niveau {lvl.level} · encore {lvl.cost - lvl.into} XP avant le niveau {lvl.level + 1}</div>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// To-do complète (triée par priorité) + résultats de recherche
// ---------------------------------------------------------------------------
const FILTERS = [
  { id: 'all', label: 'Toutes', f: () => true },
  { id: 'mail', label: 'Mails', icon: Mail, f: (t) => t.source === 'mail' },
  { id: 'chat', label: 'Chat', icon: MessageCircle, f: (t) => t.source === 'chat' },
  { id: 'manual', label: 'Perso', icon: PenLine, f: (t) => t.source === 'manual' },
  { id: 'urgent', label: 'Urgentes & hautes', f: (t) => t.priority <= 2 },
];

function QuickAdd() {
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
    await api.createTask({ title: title.charAt(0).toUpperCase() + title.slice(1), dueAt: due?.due ? due.due.toISOString() : null, priority: due?.urgency === 'urgent' ? 1 : due?.urgency === 'low' ? 4 : 3 });
    toast(`Quête ajoutée : ${title}`);
    setText('');
  };
  return (
    <div className="quickadd">
      <Plus size={18} color="#a78bfa" />
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Ajouter une quête… ex. « Appeler Marc demain 10h » ou « Envoyer le devis ce soir »" />
      {due?.due && <span className="hint">📅 {due.due.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
      <button className="btn small primary" onClick={add} disabled={!text.trim()}>Ajouter</button>
    </div>
  );
}

export function TodoView() {
  const { data, query } = useApp();
  const [filter, setFilter] = useState('all');
  const open = data.tasks.filter((t) => t.status !== 'done' && FILTERS.find((f) => f.id === filter).f(t));
  const groups = groupTasks(open);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Ta <span className="grad-text">to-do</span></h1>
          <div className="page-sub">{data.tasks.filter((t) => t.status !== 'done').length} quêtes, triées automatiquement : retard → aujourd'hui → demain → plus tard.</div>
        </div>
      </div>
      <QuickAdd />
      <div className="filters">
        {FILTERS.map((f) => (
          <button key={f.id} className={`chip-btn ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.icon && <f.icon size={13} />} {f.label}
          </button>
        ))}
      </div>
      {groups.length === 0 && (
        <div className="empty">
          <Trophy size={40} color="#fde68a" />
          <div className="big">Tout est fait !</div>
          <div>Ajoute une quête ou scanne tes mails pour trouver de nouvelles missions.</div>
        </div>
      )}
      <AnimatePresence mode="popLayout">
        {groups.map((g) => (
          <motion.div key={g.key} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="section-title" style={g.key === 'overdue' ? { color: '#fda4af' } : g.key === 'today' ? { color: '#fde68a' } : undefined}>
              {g.label} <span className="count">{g.tasks.length}</span><span className="line" />
            </div>
            <AnimatePresence mode="popLayout">
              {g.tasks.map((t, i) => <TaskRow key={t.id} task={t} index={i} />)}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function SearchView() {
  const { data, query } = useApp();
  const p = parseQuery(query);
  const results = searchTasks(data.tasks, p);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Recherche</h1>
          <div className="page-sub">
            {results.length} résultat{results.length > 1 ? 's' : ''} pour « {query} »
            {p.status === 'todo' && <> · <span className="dim">ajoute <code className="mono">statut:tout</code> pour inclure les terminées</span></>}
          </div>
        </div>
      </div>
      <div className="chips" style={{ marginBottom: 16 }}>
        {p.tags.map((t) => <span key={t} className="badge tag">#{t}</span>)}
        {p.priority.map((x) => <PriorityBadge key={x} priority={x} />)}
        {p.difficulty.map((x) => <DifficultyMeter key={x} value={x} />)}
        {p.sources.map((x) => <span key={x} className={`badge src-${x}`}>{x}</span>)}
        {p.dates.map((x) => <span key={x} className="badge due-today">📅 {x}</span>)}
        {p.from.map((x) => <span key={x} className="badge">de : {x}</span>)}
      </div>
      <AnimatePresence mode="popLayout">
        {sortTasks(results).map((t, i) => <TaskRow key={t.id} task={t} index={i} done={t.status === 'done'} />)}
      </AnimatePresence>
      {!results.length && <div className="empty"><div className="big">Aucune quête trouvée</div><div>Essaie un autre mot, ou un filtre comme <code className="mono">date:semaine</code>.</div></div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terminées
// ---------------------------------------------------------------------------
export function DoneView() {
  const data = useApp((s) => s.data);
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
      <div className="page-head">
        <div>
          <h1 className="page-title">Quêtes <span className="grad-text">terminées</span></h1>
          <div className="page-sub">Ton tableau de chasse. Tu peux remettre une quête à faire à tout moment.</div>
        </div>
      </div>
      <div className="row" style={{ gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        {[
          ['Quêtes accomplies', data.stats.completedCount || done.length, '#a7f3d0'],
          ['XP total', data.stats.xp, '#fde68a'],
          ['Niveau', `${lvl.level} · ${lvl.title}`, '#c4b5fd'],
          ['Meilleure série', `${data.stats.bestStreak || 0} j`, '#fdba74'],
          ['Record au jeu', data.stats.highScore || 0, '#67e8f9'],
        ].map(([k, v, c], i) => (
          <motion.div key={k} className="stat-tile" style={{ minWidth: 150 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <span className="k">{k}</span>
            <span className="v" style={{ color: c, fontSize: 22 }}>{v}</span>
          </motion.div>
        ))}
      </div>
      {byDay.map((g) => (
        <div key={g.k}>
          <div className="section-title" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 13 }}>{g.label} <span className="count">+{g.tasks.reduce((s, t) => s + (t.xpEarned || 0), 0)} XP</span><span className="line" /></div>
          <AnimatePresence mode="popLayout">
            {g.tasks.map((t, i) => <TaskRow key={t.id} task={t} index={i} done />)}
          </AnimatePresence>
        </div>
      ))}
      {!done.length && <div className="empty"><Trophy size={40} color="#fde68a" /><div className="big">Pas encore de quête terminée</div><div>Coche ta première quête pour voir l'animation de victoire ✨</div></div>}
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
  useEffect(() => { if (!pasteOpen) { setText(''); setFound(null); } }, [pasteOpen]);
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
  };
  return (
    <AnimatePresence>
      {pasteOpen && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && setPasteOpen(false)}>
          <motion.div className="modal" style={{ width: 640 }} initial={{ y: 30, scale: 0.95, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
            <div className="modal-head">
              <span className="icon-tile"><Wand2 size={20} /></span>
              <div style={{ flex: 1 }}>
                <div className="page-title" style={{ fontSize: 20 }}>Transformer un texte en quêtes</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Colle un message (Slack, WhatsApp, notes…) : je trouve les missions, les dates et les priorités.</div>
              </div>
              <button className="xbtn" onClick={() => setPasteOpen(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: 20 }}>
              {!found ? (
                <textarea className="textarea" autoFocus style={{ minHeight: 180 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Ex : Hello ! Peux-tu ajouter des nouvelles ads sur Facebook, Instagram et TikTok avant vendredi ? Et n'oublie pas d'appeler Marc demain matin."} />
              ) : found.length ? (
                found.map((t, i) => (
                  <motion.div key={i} className="trow" style={{ '--c': '#8b5cf6' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} onClick={() => setPicked({ ...picked, [i]: !picked[i] })}>
                    <span className={`mini-check ${picked[i] ? 'on' : ''}`}>{picked[i] && <Check size={13} strokeWidth={3.5} />}</span>
                    <div className="trow-main">
                      <div className="trow-title">{t.title}</div>
                      <div className="trow-meta"><DueBadge dueAt={t.dueAt} /><PriorityBadge priority={t.priority} /><DifficultyMeter value={t.difficulty} />{t.subtasks.length > 0 && <span className="badge">☑ {t.subtasks.length} étapes</span>}</div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="empty"><div className="big">Aucune mission détectée</div><div>Le texte ne contient pas de demande claire.</div></div>
              )}
            </div>
            <div className="modal-foot">
              <span className="grow" />
              {found && <button className="btn" onClick={() => setFound(null)}>Modifier le texte</button>}
              {!found ? <button className="btn primary" disabled={!text.trim()} onClick={analyse}><Wand2 size={16} /> Analyser</button> : found.length > 0 && <button className="btn primary" onClick={add}><Plus size={16} /> Ajouter la sélection</button>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
