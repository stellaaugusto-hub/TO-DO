import { useMemo, useRef, useState } from 'react';
import { Check, Upload, Trash2 } from 'lucide-react';
import { EMOJIS, NOTION_COLORS, COLOR_LABEL, COVER_PRESETS, tagStyle, textColor } from '../lib/notion.js';
import { ICONS } from '../lib/icons.js';

/** Sélecteur d'icône : emoji, icône vectorielle, couleur de la tâche. */
export function IconPicker({ emoji, icon, color, onChange, withColor = true, close }) {
  const [tab, setTab] = useState('emoji');
  const [q, setQ] = useState('');
  const groups = useMemo(() => Object.entries(EMOJIS).map(([g, s]) => [g, [...new Set(s.split(/\s+/).filter(Boolean))]]), []);
  return (
    <div>
      <div className="picker-tabs">
        <button className={tab === 'emoji' ? 'on' : ''} onClick={() => setTab('emoji')}>Emoji</button>
        <button className={tab === 'icons' ? 'on' : ''} onClick={() => setTab('icons')}>Icônes</button>
        {withColor && <button className={tab === 'color' ? 'on' : ''} onClick={() => setTab('color')}>Couleur</button>}
        <span className="grow" />
        <button onClick={() => { onChange({ emoji: null }); close?.(); }}>Par défaut</button>
      </div>
      {tab === 'emoji' && (
        <>
          <input className="menu-search" autoFocus placeholder="Filtrer… (ex. 🎯 ou colle un emoji)" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && q.trim()) { onChange({ emoji: q.trim() }); close?.(); } }} />
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {groups.map(([g, list]) => {
              const shown = q ? list.filter((e) => e.includes(q.trim())) : list;
              if (!shown.length) return null;
              return (
                <div key={g}>
                  <div className="menu-title">{g}</div>
                  <div className="emoji-grid">
                    {shown.map((e) => (
                      <button key={e} className={e === emoji ? 'on' : ''} onClick={() => { onChange({ emoji: e }); close?.(); }}>{e}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {tab === 'icons' && (
        <div className="icon-grid" style={{ maxHeight: 320, overflowY: 'auto' }}>
          {Object.entries(ICONS).map(([k, I]) => (
            <button key={k} className={emoji === '' && icon === k ? 'on' : ''} title={k} onClick={() => { onChange({ emoji: '', icon: k }); close?.(); }}>
              <I size={18} color={textColor(color)} />
            </button>
          ))}
        </div>
      )}
      {tab === 'color' && <ColorList value={color} onChange={(c) => onChange({ color: c })} />}
    </div>
  );
}

export function ColorList({ value, onChange }) {
  return (
    <div>
      {NOTION_COLORS.map((c) => (
        <button key={c} className="menu-item" onClick={() => onChange(c)}>
          <span className="swatch" style={{ ...tagStyle(c), width: 20, height: 20, borderRadius: 4 }} />
          <span style={{ flex: 1 }}>{COLOR_LABEL[c]}</span>
          {(value || 'default') === c && <Check size={15} />}
        </button>
      ))}
    </div>
  );
}

/** Image importée -> JPEG redimensionné (data URL) pour rester léger. */
function resizeImage(file, maxW = 1800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.84));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Choix de la couverture : dégradés, couleurs, image perso. */
export function CoverPicker({ value, onChange, close }) {
  const [tab, setTab] = useState('gallery');
  const fileRef = useRef(null);
  return (
    <div>
      <div className="picker-tabs">
        <button className={tab === 'gallery' ? 'on' : ''} onClick={() => setTab('gallery')}>Galerie</button>
        <button className={tab === 'colors' ? 'on' : ''} onClick={() => setTab('colors')}>Couleurs</button>
        <button className={tab === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>Importer</button>
        <span className="grow" />
        <button onClick={() => { onChange(null); close?.(); }}><Trash2 size={13} style={{ verticalAlign: -2 }} /> Retirer</button>
      </div>
      {tab === 'gallery' && (
        <div className="covers">
          {COVER_PRESETS.map((c) => (
            <button key={c.id} title={c.label} style={{ background: c.css, boxShadow: value === c.id ? '0 0 0 2px var(--accent)' : undefined }} onClick={() => { onChange(c.id); close?.(); }} />
          ))}
        </div>
      )}
      {tab === 'colors' && (
        <div className="covers">
          {NOTION_COLORS.map((c) => (
            <button key={c} title={COLOR_LABEL[c]} style={{ background: `var(--c-${c}-bg)`, boxShadow: value === `color:${c}` ? '0 0 0 2px var(--accent)' : undefined }} onClick={() => { onChange(`color:${c}`); close?.(); }} />
          ))}
        </div>
      )}
      {tab === 'upload' && (
        <div style={{ textAlign: 'center', padding: '18px 8px' }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) { onChange(await resizeImage(f)); close?.(); } }} />
          <button className="btn outline" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choisir une image</button>
          <div className="dim" style={{ fontSize: 12.5, marginTop: 10 }}>Une photo de ta marque, une inspiration… Les images larges (1500 px) rendent le mieux.</div>
        </div>
      )}
    </div>
  );
}
