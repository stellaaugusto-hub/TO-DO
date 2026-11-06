import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Settings, Plus, RefreshCw, ClipboardPaste, MoreHorizontal, ChevronDown, Image as ImageIcon, Smile, Download, Sun, Moon, Monitor, CornerDownLeft } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { usePrefs, savePrefs } from '../lib/prefs.js';
import { coverCss, taskEmoji } from '../lib/notion.js';
import { todaysQuests, sortTasks } from '../../shared/priority.js';
import { levelInfo, currentStreak } from '../../shared/game.js';
import { SEARCH_HINTS, parseQuery, searchTasks } from '../../shared/search.js';
import { relative } from '../lib/format.js';
import { Popover, MenuButton, MenuItem, Toggle, XpBar, DueTag, TaskIcon } from './ui.jsx';
import { IconPicker, CoverPicker } from './Pickers.jsx';

// ---------------------------------------------------------------------------
// Barre latérale
// ---------------------------------------------------------------------------
export function Sidebar() {
  const { data, tab, setTab, setPaletteOpen, newTask } = useApp();
  const prefs = usePrefs();
  const quests = todaysQuests(data.tasks);
  const counts = { quests: quests.length, todo: data.tasks.filter((t) => t.status !== 'done').length, ads: data.tasks.filter((t) => t.status !== 'done' && (t.tags || []).includes('ads')).length, done: data.tasks.filter((t) => t.status === 'done').length };
  const hot = quests.some((q) => q.priority === 1 || (q.dueAt && new Date(q.dueAt) < new Date()));
  const lvl = levelInfo(data.stats.xp);
  const streak = currentStreak(data.stats);
  const name = data.profile.name || 'Toi';
  return (
    <aside className="sidebar drag">
      <MenuButton
        width={260}
        button={
          <button className="sb-workspace no-drag">
            <span className="sb-avatar">{name.charAt(0).toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Espace de {name}</span>
            <ChevronDown size={14} className="dim" />
          </button>
        }
      >
        {(close) => <ThemeMenu close={close} />}
      </MenuButton>
      <button className="sb-item no-drag" onClick={() => setPaletteOpen(true)}>
        <span className="ico"><Search size={16} /></span>Rechercher<span className="count"><kbd>⌘K</kbd></span>
      </button>
      <button className={`sb-item no-drag ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
        <span className="ico"><Settings size={16} /></span>Réglages
      </button>
      <button className="sb-item no-drag" onClick={newTask}>
        <span className="ico"><Plus size={16} /></span>Nouvelle quête
      </button>

      <div className="sb-section">Mon espace</div>
      {prefs.pageOrder.filter((id) => !prefs.pages[id].hidden).map((id) => {
        const p = prefs.pages[id];
        return (
          <button key={id} className={`sb-item no-drag ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            <span className="ico">{p.emoji}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
            {counts[id] > 0 && <span className={`count ${id === 'quests' && hot ? 'hot' : ''}`}>{counts[id]}</span>}
          </button>
        );
      })}

      {prefs.appearance.gamification && (
        <div className="sb-footer no-drag">
          <div className="sb-level" style={{ marginBottom: 6 }}>
            <span>⭐ Niveau {lvl.level} · {lvl.title}</span>
            <span className="grow" />
            {streak > 0 && <span title="Jours consécutifs">🔥 {streak}</span>}
          </div>
          <XpBar progress={lvl.progress} />
          <div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>{lvl.into} / {lvl.cost} XP</div>
        </div>
      )}
    </aside>
  );
}

function ThemeMenu({ close }) {
  const prefs = usePrefs();
  const { setTab } = useApp();
  const t = prefs.appearance.theme;
  return (
    <>
      <div className="menu-title">Thème</div>
      <MenuItem icon={<Sun size={15} />} checked={t === 'light'} onClick={() => savePrefs({ appearance: { theme: 'light' } })}>Clair</MenuItem>
      <MenuItem icon={<Moon size={15} />} checked={t === 'dark'} onClick={() => savePrefs({ appearance: { theme: 'dark' } })}>Sombre</MenuItem>
      <MenuItem icon={<Monitor size={15} />} checked={t === 'system'} onClick={() => savePrefs({ appearance: { theme: 'system' } })}>Comme le Mac</MenuItem>
      <div className="menu-sep" />
      <MenuItem icon={<Settings size={15} />} onClick={() => { close(); setTab('settings'); }}>Réglages et personnalisation</MenuItem>
    </>
  );
}

// ---------------------------------------------------------------------------
// Barre du haut : fil d'Ariane + actions + options de page
// ---------------------------------------------------------------------------
export function TopBar() {
  const { data, tab, runSync, sync, setPasteOpen, updater } = useApp();
  const prefs = usePrefs();
  const page = prefs.pages[tab];
  const a = prefs.appearance;
  return (
    <header className="topbar drag">
      <span className="crumb no-drag">
        <span>{page?.emoji || '⚙️'}</span>
        <span>{page?.title || 'Réglages'}</span>
      </span>
      <span className="grow" />
      {data.google.lastSync && <span className="dim" style={{ fontSize: 12.5, marginRight: 6 }}>Scanné {relative(data.google.lastSync)}</span>}
      {updater?.state === 'available' && (
        <button className="btn sm no-drag" style={{ color: 'var(--accent)' }} onClick={() => api.installUpdate()}><Download size={14} /> v{updater.version}</button>
      )}
      <button className="btn sm no-drag" onClick={() => setPasteOpen(true)} title="Transformer un texte en quêtes"><ClipboardPaste size={15} /></button>
      <button className="btn sm no-drag" onClick={runSync} disabled={!!sync} title="Scanner mails, chat et agenda">
        <RefreshCw size={14} className={sync ? 'spin' : ''} /> Scanner
      </button>
      <MenuButton align="right" width={250} button={<button className="btn sm icon no-drag" title="Options de la page"><MoreHorizontal size={17} /></button>}>
        {() => (
          <>
            <div className="menu-title">Style</div>
            <div className="row" style={{ gap: 4, padding: '2px 4px 6px' }}>
              {[['default', 'Défaut', 'var(--font-default)'], ['serif', 'Serif', 'var(--font-serif)'], ['mono', 'Mono', 'var(--font-mono)']].map(([k, l, f]) => (
                <button key={k} className="menu-item" style={{ flexDirection: 'column', gap: 0, padding: '6px 4px', boxShadow: a.font === k ? 'inset 0 0 0 1px var(--accent)' : undefined }} onClick={() => savePrefs({ appearance: { font: k } })}>
                  <span style={{ fontFamily: f, fontSize: 22, color: a.font === k ? 'var(--accent)' : undefined }}>Ag</span>
                  <span className="dim" style={{ fontSize: 11.5 }}>{l}</span>
                </button>
              ))}
            </div>
            <div className="menu-sep" />
            <div className="menu-item" onClick={() => savePrefs({ appearance: { smallText: !a.smallText } })}>
              <span style={{ flex: 1 }}>Petit texte</span><Toggle on={a.smallText} onChange={() => {}} />
            </div>
            <div className="menu-item" onClick={() => savePrefs({ appearance: { fullWidth: !a.fullWidth } })}>
              <span style={{ flex: 1 }}>Pleine largeur</span><Toggle on={a.fullWidth} onChange={() => {}} />
            </div>
            <div className="menu-item" onClick={() => savePrefs({ appearance: { gamification: !a.gamification } })}>
              <span style={{ flex: 1 }}>Mode jeu (XP, niveaux)</span><Toggle on={a.gamification} onChange={() => {}} />
            </div>
            <div className="menu-sep" />
            <div className="menu-title">Thème</div>
            <div className="seg" style={{ margin: '2px 6px 6px' }}>
              {[['light', 'Clair'], ['dark', 'Sombre'], ['system', 'Auto']].map(([k, l]) => (
                <button key={k} className={a.theme === k ? 'on' : ''} onClick={() => savePrefs({ appearance: { theme: k } })}>{l}</button>
              ))}
            </div>
          </>
        )}
      </MenuButton>
    </header>
  );
}

// ---------------------------------------------------------------------------
// En-tête de page : couverture + icône + titre (tout est personnalisable)
// ---------------------------------------------------------------------------
export function PageHeader({ id, subtitle, children }) {
  const prefs = usePrefs();
  const p = prefs.pages[id];
  const [coverOpen, setCoverOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const coverBtn = useRef(null);
  const iconBtn = useRef(null);
  const css = coverCss(p.cover);
  const set = (patch) => savePrefs({ pages: { [id]: patch } });
  return (
    <>
      {css && (
        <div className="cover" style={{ background: css, backgroundSize: 'cover', backgroundPosition: 'center 40%' }}>
          <div className="cover-actions">
            <button ref={coverBtn} className="cover-btn" onClick={() => setCoverOpen(true)}>Changer la couverture</button>
          </div>
        </div>
      )}
      <div className="page page-head">
        <div ref={iconBtn} className={`page-icon ${css ? '' : 'no-cover'}`} onClick={() => setIconOpen(true)} title="Changer l'icône">{p.emoji}</div>
        {!css && (
          <div className="page-hint">
            <button ref={css ? null : coverBtn} className="btn sm" onClick={() => setCoverOpen(true)}><ImageIcon size={14} /> Ajouter une couverture</button>
          </div>
        )}
        <div
          className="page-title"
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(e) => { const v = e.currentTarget.textContent.trim(); if (v && v !== p.title) set({ title: v }); else e.currentTarget.textContent = p.title; }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
        >
          {p.title}
        </div>
        {subtitle && <div className="page-sub">{subtitle}</div>}
        {children}
      </div>
      <Popover anchor={iconBtn.current} open={iconOpen} onClose={() => setIconOpen(false)} width={420} className="menu picker">
        <IconPicker emoji={p.emoji} withColor={false} close={() => setIconOpen(false)} onChange={({ emoji }) => emoji && set({ emoji })} />
      </Popover>
      <Popover anchor={coverBtn.current} open={coverOpen} onClose={() => setCoverOpen(false)} width={420} align="right" className="menu picker">
        <CoverPicker value={p.cover} close={() => setCoverOpen(false)} onChange={(cover) => set({ cover })} />
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------------------
// Recherche ⌘K (texte + filtres #tag, prio:, date:, source:, de:…)
// ---------------------------------------------------------------------------
export function CommandPalette() {
  const { data, paletteOpen, setPaletteOpen, openTask } = useApp();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'p')) { e.preventDefault(); setPaletteOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    const off = api.onNavigate((w) => w === 'search' && setPaletteOpen(true));
    return () => { window.removeEventListener('keydown', onKey); off?.(); };
  }, [setPaletteOpen]);
  useEffect(() => { if (paletteOpen) { setQ(''); setFocus(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [paletteOpen]);
  const parsed = useMemo(() => parseQuery(q), [q]);
  const results = useMemo(() => (q.trim() ? searchTasks(data?.tasks || [], parsed) : sortTasks((data?.tasks || []).filter((t) => t.status !== 'done')).slice(0, 8)), [q, parsed, data]);
  const tags = [...new Set((data?.tasks || []).flatMap((t) => t.tags || []))].slice(0, 10);
  const toggle = (token) => {
    const parts = q.split(/\s+/).filter(Boolean);
    setQ((parts.includes(token) ? parts.filter((x) => x !== token) : [...parts, token]).join(' ') + ' ');
    inputRef.current?.focus();
  };
  const choose = (t) => { setPaletteOpen(false); openTask(t.id); };
  return (
    <AnimatePresence>
      {paletteOpen && (
        <>
          <motion.div className="overlay" style={{ background: 'rgba(15,15,15,0.35)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setPaletteOpen(false)} />
          <motion.div className="palette" initial={{ opacity: 0, y: -10, scale: 0.98, x: '-50%' }} animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }} exit={{ opacity: 0, y: -6, x: '-50%' }} transition={{ duration: 0.14 }}>
            <div className="palette-input">
              <Search size={18} className="dim" />
              <input
                ref={inputRef}
                value={q}
                placeholder="Rechercher une quête, #tag, prio:haute, date:demain, de:jean…"
                onChange={(e) => { setQ(e.target.value); setFocus(0); }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setPaletteOpen(false);
                  if (e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(results.length - 1, f + 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
                  if (e.key === 'Enter' && results[focus]) choose(results[focus]);
                }}
              />
            </div>
            <div className="palette-chips">
              {SEARCH_HINTS.map((h) => <button key={h.q} className={`chip ${q.split(/\s+/).includes(h.q) ? 'on' : ''}`} onClick={() => toggle(h.q)}>{h.label}</button>)}
              {tags.map((t) => <button key={t} className={`chip ${parsed.tags.includes(t) ? 'on' : ''}`} onClick={() => toggle(`#${t}`)}>#{t}</button>)}
            </div>
            <div className="palette-list">
              <div className="menu-title">{q.trim() ? `${results.length} résultat${results.length > 1 ? 's' : ''}` : 'À faire en priorité'}</div>
              {results.slice(0, 40).map((t, i) => (
                <button key={t.id} className={`palette-item ${i === focus ? 'focus' : ''}`} onMouseEnter={() => setFocus(i)} onClick={() => choose(t)}>
                  <span style={{ width: 22, display: 'grid', placeItems: 'center' }}><TaskIcon task={t} size={17} /></span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: t.status === 'done' ? 'line-through' : undefined }}>{t.title}</span>
                  <DueTag dueAt={t.status === 'done' ? null : t.dueAt} />
                  {i === focus && <CornerDownLeft size={14} className="dim" />}
                </button>
              ))}
              {!results.length && <div className="empty" style={{ padding: 24 }}>Aucune quête ne correspond.</div>}
            </div>
            <div className="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> naviguer</span><span><kbd>↵</kbd> ouvrir</span><span>Combine : <b>#ads prio:haute date:semaine source:mail diff:epique de:jean statut:tout</b></span></div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
