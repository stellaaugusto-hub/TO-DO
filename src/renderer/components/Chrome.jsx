import { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, ListTodo, CalendarDays, Trophy, Settings, Search, Plus, RefreshCw, ClipboardPaste, X, Download } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { todaysQuests } from '../../shared/priority.js';
import { levelInfo, currentStreak } from '../../shared/game.js';
import { SEARCH_HINTS, parseQuery } from '../../shared/search.js';
import { XpBar } from './bits.jsx';
import { relative } from '../lib/format.js';

const NAV = [
  { id: 'quests', label: 'Quêtes du jour', icon: Swords },
  { id: 'todo', label: 'To-do', icon: ListTodo },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays },
  { id: 'done', label: 'Terminées', icon: Trophy },
  { id: 'settings', label: 'Réglages', icon: Settings },
];

export function Sidebar() {
  const { data, tab, setTab } = useApp();
  const quests = todaysQuests(data.tasks);
  const open = data.tasks.filter((t) => t.status !== 'done').length;
  const done = data.tasks.filter((t) => t.status === 'done').length;
  const lvl = levelInfo(data.stats.xp);
  const streak = currentStreak(data.stats);
  const counts = { quests: quests.length, todo: open, done };
  return (
    <aside className="sidebar drag">
      <div className="brand">
        <span className="brand-logo"><Swords size={17} color="white" /></span>
        QuestFlow
      </div>
      {NAV.map((n) => {
        const I = n.icon;
        const active = tab === n.id;
        return (
          <button key={n.id} className={`nav-item no-drag ${active ? 'active' : ''}`} onClick={() => setTab(n.id)}>
            {active && <motion.span layoutId="navbg" className="nav-bg" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
            <I size={18} strokeWidth={2.2} />
            <span>{n.label}</span>
            {counts[n.id] > 0 && <span className={`nav-count ${n.id === 'quests' && quests.some((q) => q.priority === 1 || (q.dueAt && new Date(q.dueAt) < new Date())) ? 'hot' : ''}`}>{counts[n.id]}</span>}
          </button>
        );
      })}
      <div className="player-card no-drag">
        <div className="player-row">
          <div className="avatar">{(data.profile.name || '?').charAt(0).toUpperCase()}</div>
          <div style={{ minWidth: 0 }}>
            <div className="player-name">{data.profile.name || 'Aventurier·e'}</div>
            <div className="player-rank">Niv. {lvl.level} · {lvl.title}</div>
          </div>
          <span className="grow" />
          {streak > 0 && <motion.span className="streak" title="Jours consécutifs" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.8, repeat: Infinity }}>🔥{streak}</motion.span>}
        </div>
        <XpBar progress={lvl.progress} />
        <div className="xp-label"><span>{lvl.into} / {lvl.cost} XP</span><span>niv. {lvl.level + 1}</span></div>
      </div>
    </aside>
  );
}

export function TopBar() {
  const { data, query, setQuery, searchOpen, setSearchOpen, newTask, runSync, sync, setPasteOpen, updater } = useApp();
  const inputRef = useRef(null);
  const parsed = useMemo(() => parseQuery(query), [query]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const off = api.onNavigate((where) => { if (where === 'search') inputRef.current?.focus(); });
    return () => { window.removeEventListener('keydown', onKey); off?.(); };
  }, []);

  const toggleHint = (q) => {
    const has = query.split(/\s+/).includes(q);
    setQuery(has ? query.split(/\s+/).filter((x) => x !== q).join(' ') : `${query} ${q}`.trim());
    inputRef.current?.focus();
  };

  return (
    <header className="topbar drag">
      <div className="search no-drag">
        <div className="search-box">
          <Search size={17} className="dim" />
          <input
            ref={inputRef}
            value={query}
            placeholder="Rechercher une quête, #tag, prio:haute, date:demain, de:jean…"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), inputRef.current.blur())}
          />
          {query ? <button className="xbtn" onClick={() => setQuery('')}><X size={15} /></button> : <span className="kbd">⌘K</span>}
        </div>
        <AnimatePresence>
          {searchOpen && (
            <motion.div className="search-pop" initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.16 }}>
              <h6>Filtres rapides</h6>
              <div className="chips">
                {SEARCH_HINTS.map((h) => (
                  <button key={h.q} className={`chip-btn ${query.split(/\s+/).includes(h.q) ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleHint(h.q)}>{h.label}</button>
                ))}
              </div>
              {[...new Set(data.tasks.flatMap((t) => t.tags || []))].length > 0 && (
                <>
                  <h6 style={{ marginTop: 12 }}>Tags</h6>
                  <div className="chips">
                    {[...new Set(data.tasks.flatMap((t) => t.tags || []))].slice(0, 14).map((t) => (
                      <button key={t} className={`chip-btn ${parsed.tags.includes(t) ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => toggleHint(`#${t}`)}>#{t}</button>
                    ))}
                  </div>
                </>
              )}
              <div className="syntax">
                Combine librement : <code>#ads</code> <code>prio:urgente</code> <code>date:retard</code> <code>source:chat</code> <code>diff:epique</code> <code>de:julie</code> <code>statut:tout</code> + du texte.
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="grow" />
      {updater?.state === 'uptodate' ? null : updater?.state === 'available' && (
        <button className="update-banner no-drag" onClick={() => api.installUpdate()}><Download size={14} /> v{updater.version} disponible</button>
      )}
      <button className="btn no-drag" title="Coller un texte pour en extraire des quêtes" onClick={() => setPasteOpen(true)}><ClipboardPaste size={16} /></button>
      <motion.button className="btn no-drag" whileTap={{ scale: 0.95 }} onClick={runSync} disabled={!!sync} title={data.google.lastSync ? `Dernier scan : ${relative(data.google.lastSync)}` : 'Scanner mes mails et mon chat'}>
        <RefreshCw size={16} className={sync ? 'spin' : ''} /> Scanner
      </motion.button>
      <motion.button className="btn primary no-drag" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={newTask}>
        <Plus size={18} strokeWidth={2.6} /> Nouvelle quête
      </motion.button>
    </header>
  );
}
