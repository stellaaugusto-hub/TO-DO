import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Palette, LayoutGrid, Hash, Globe, RefreshCw, Bell, Gamepad2, Download, LogOut, FolderOpen, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { usePrefs, savePrefs } from '../lib/prefs.js';
import { ACCENTS, NOTION_COLORS, COLOR_LABEL, coverCss } from '../lib/notion.js';
import { relative } from '../lib/format.js';
import { setSoundEnabled } from '../lib/sound.js';
import { Toggle, Tag, MenuButton, Popover, ConfirmButton } from '../components/ui.jsx';
import { IconPicker, CoverPicker, ColorList } from '../components/Pickers.jsx';

function Row({ title, sub, children }) {
  return (
    <div className="set-row">
      <div className="lbl"><b>{title}</b>{sub && <span>{sub}</span>}</div>
      {children}
    </div>
  );
}

const SECTIONS = [
  { id: 'account', label: 'Mon compte', icon: User },
  { id: 'appearance', label: 'Apparence', icon: Palette },
  { id: 'pages', label: 'Pages', icon: LayoutGrid },
  { id: 'tags', label: 'Tags', icon: Hash },
  { id: 'google', label: 'Google', icon: Globe },
  { id: 'sync', label: 'Synchronisation', icon: RefreshCw },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'game', label: 'Jeu & progression', icon: Gamepad2 },
  { id: 'updates', label: 'Mises à jour', icon: Download },
];

function PageRow({ id, p, index, total, order }) {
  const [iconOpen, setIconOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [iconEl, setIconEl] = useState(null);
  const [coverEl, setCoverEl] = useState(null);
  const set = (patch) => savePrefs({ pages: { [id]: patch } });
  const move = (d) => {
    const o = [...order];
    const [x] = o.splice(index, 1);
    o.splice(index + d, 0, x);
    savePrefs({ pageOrder: o });
  };
  return (
    <div className="set-row">
      <button ref={setIconEl} className="btn icon" style={{ fontSize: 20, width: 36, height: 36 }} onClick={() => setIconOpen(true)}>{p.emoji}</button>
      <input className="input" style={{ maxWidth: 230 }} defaultValue={p.title} onBlur={(e) => e.target.value.trim() && e.target.value !== p.title && set({ title: e.target.value.trim() })} />
      <button ref={setCoverEl} className="btn sm outline" onClick={() => setCoverOpen(true)}>
        <span style={{ width: 28, height: 16, borderRadius: 3, background: coverCss(p.cover) || 'var(--active)', backgroundSize: 'cover', display: 'inline-block' }} />
        Couverture
      </button>
      <span className="grow" />
      <button className="btn sm icon" disabled={index === 0} onClick={() => move(-1)} title="Monter"><ArrowUp size={14} /></button>
      <button className="btn sm icon" disabled={index === total - 1} onClick={() => move(1)} title="Descendre"><ArrowDown size={14} /></button>
      <button className="btn sm icon" onClick={() => set({ hidden: !p.hidden })} title={p.hidden ? 'Afficher dans la barre latérale' : 'Masquer'}>{p.hidden ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      <Popover anchor={iconEl} open={iconOpen} onClose={() => setIconOpen(false)} width={420} className="menu picker">
        <IconPicker emoji={p.emoji} withColor={false} close={() => setIconOpen(false)} onChange={({ emoji }) => emoji && set({ emoji })} />
      </Popover>
      <Popover anchor={coverEl} open={coverOpen} onClose={() => setCoverOpen(false)} width={420} className="menu picker">
        <CoverPicker value={p.cover} close={() => setCoverOpen(false)} onChange={(cover) => set({ cover })} />
      </Popover>
    </div>
  );
}

export function SettingsView() {
  const { data, updater, toast, runSync, connectGoogle } = useApp();
  const prefs = usePrefs();
  const a = prefs.appearance;
  const s = data.settings;
  const g = data.google;
  const [section, setSection] = useState('account');
  const [name, setName] = useState(data.profile.name);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState(null);
  useEffect(() => setName(data.profile.name), [data.profile.name]);
  const set = (patch) => api.setSettings(patch);
  const ap = (patch) => savePrefs({ appearance: patch });
  const tags = [...new Set(data.tasks.flatMap((t) => t.tags || []))].sort();

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        <div className="menu-title" style={{ padding: '0 8px 8px' }}>Réglages</div>
        {SECTIONS.map((x) => (
          <button key={x.id} className={`sb-item ${section === x.id ? 'active' : ''}`} onClick={() => setSection(x.id)}>
            <span className="ico"><x.icon size={16} /></span>{x.label}
          </button>
        ))}
      </nav>
      <motion.div key={section} className="settings-main" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.15 }}>
        {section === 'account' && (
          <>
            <h1>Mon compte</h1>
            <div className="set-group">
              <h3>Profil</h3>
              <Row title="Prénom" sub="Affiché en plein écran à chaque ouverture : « Bonjour … »">
                <input className="input" style={{ width: 200 }} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== data.profile.name && api.setProfile({ name: name.trim() }).then(() => toast('Prénom mis à jour'))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              </Row>
            </div>
          </>
        )}

        {section === 'appearance' && (
          <>
            <h1>Apparence</h1>
            <div className="set-group">
              <h3>Thème</h3>
              <div className="theme-cards" style={{ padding: '12px 0' }}>
                {[['light', 'Clair', '#fff', '#f8f8f7'], ['dark', 'Sombre', '#191919', '#202020'], ['system', 'Comme le Mac', 'linear-gradient(90deg,#fff 50%,#191919 50%)', 'linear-gradient(90deg,#f8f8f7 50%,#202020 50%)']].map(([k, l, bg, sb]) => (
                  <button key={k} className={`theme-card ${a.theme === k ? 'on' : ''}`} onClick={() => ap({ theme: k })}>
                    <div className="mini"><span style={{ background: sb }} /><span style={{ background: bg }} /></div>
                    {l}
                  </button>
                ))}
              </div>
              <Row title="Couleur d'accent" sub="Boutons, cases cochées, barre d'XP">
                <div className="swatches">
                  {Object.entries(ACCENTS).map(([k, [c]]) => <button key={k} className={`swatch ${a.accent === k ? 'on' : ''}`} style={{ background: c }} onClick={() => ap({ accent: k })} title={k} />)}
                </div>
              </Row>
            </div>
            <div className="set-group">
              <h3>Texte</h3>
              <Row title="Police">
                <div className="seg">
                  {[['default', 'Défaut', 'var(--font-default)'], ['serif', 'Serif', 'var(--font-serif)'], ['mono', 'Mono', 'var(--font-mono)']].map(([k, l, f]) => (
                    <button key={k} className={a.font === k ? 'on' : ''} style={{ fontFamily: f }} onClick={() => ap({ font: k })}>{l}</button>
                  ))}
                </div>
              </Row>
              <Row title="Petit texte" sub="Plus d'informations à l'écran"><Toggle on={a.smallText} onChange={(v) => ap({ smallText: v })} /></Row>
              <Row title="Pleine largeur" sub="Les pages utilisent toute la largeur de la fenêtre"><Toggle on={a.fullWidth} onChange={(v) => ap({ fullWidth: v })} /></Row>
            </div>
            <div className="set-group">
              <h3>Expérience</h3>
              <Row title="Mode jeu" sub="XP, niveaux, séries de jours"><Toggle on={a.gamification} onChange={(v) => ap({ gamification: v })} /></Row>
              <Row title="Animations réduites" sub="Moins de mouvements dans l'interface"><Toggle on={a.reduceMotion} onChange={(v) => ap({ reduceMotion: v })} /></Row>
              <Row title="Sons" sub="Petits effets sonores (validation, niveau, jeu)"><Toggle on={s.sounds} onChange={(v) => { setSoundEnabled(v); set({ sounds: v }); }} /></Row>
            </div>
          </>
        )}

        {section === 'pages' && (
          <>
            <h1>Pages</h1>
            <div className="muted" style={{ fontSize: 14 }}>Renomme tes pages, change leur emoji et leur couverture, réordonne-les ou masque-les de la barre latérale.</div>
            <div className="set-group">
              <h3>Barre latérale</h3>
              {prefs.pageOrder.map((id, i) => <PageRow key={id} id={id} p={prefs.pages[id]} index={i} total={prefs.pageOrder.length} order={prefs.pageOrder} />)}
            </div>
          </>
        )}

        {section === 'tags' && (
          <>
            <h1>Tags</h1>
            <div className="muted" style={{ fontSize: 14 }}>Choisis la couleur de chaque tag (comme les options d'une propriété Notion).</div>
            <div className="set-group">
              <h3>{tags.length} tag{tags.length > 1 ? 's' : ''}</h3>
              {tags.map((t) => (
                <div key={t} className="set-row">
                  <Tag color={prefs.tagColors[t] || 'purple'}>{t}</Tag>
                  <span className="dim" style={{ fontSize: 12.5 }}>{data.tasks.filter((x) => (x.tags || []).includes(t)).length} quête(s)</span>
                  <span className="grow" />
                  <MenuButton align="right" width={210} button={<button className="btn sm outline">{COLOR_LABEL[prefs.tagColors[t] || 'purple']}</button>}>
                    {(c) => <ColorList value={prefs.tagColors[t] || 'purple'} onChange={(col) => { savePrefs({ tagColors: { [t]: col } }); c(); }} />}
                  </MenuButton>
                </div>
              ))}
              {!tags.length && <div className="muted" style={{ padding: '12px 0' }}>Aucun tag pour l'instant.</div>}
            </div>
          </>
        )}

        {section === 'google' && (
          <>
            <h1>Google</h1>
            <div className="set-group">
              <h3>Compte</h3>
              <Row title={g.connected ? 'Connecté' : 'Non connecté'} sub={g.connected ? `${g.email || 'Compte Google'} · dernier scan ${relative(g.lastSync)}` : 'Agenda, Gmail et Chat, via Google Chrome : tu te connectes une fois, sans clé ni réglage'}>
                <span className={`status-dot ${g.connected ? 'ok' : 'warn'}`} />
                {g.connected ? (
                  <ConfirmButton button={<button className="btn sm outline"><LogOut size={14} /> Déconnecter</button>} message="Se déconnecter de Google dans QuestFlow ? Ton Chrome habituel n'est pas touché." confirmLabel="Déconnecter" onConfirm={() => api.googleDisconnect()} />
                ) : (
                  <button className="btn sm primary" disabled={connecting} onClick={async () => { setConnecting(true); await connectGoogle(); setConnecting(false); }}>{connecting ? 'Connexion dans Chrome…' : 'Se connecter avec Chrome'}</button>
                )}
              </Row>
              {g.lastError && <div className="callout" style={{ margin: '4px 0' }}><span className="emoji">⚠️</span><div style={{ fontSize: 13.5 }}>Dernière erreur : {typeof g.lastError === 'string' ? g.lastError : Object.entries(g.lastError).map(([k, v]) => `${{ mail: 'Gmail', calendar: 'Agenda', chat: 'Chat' }[k] || k} : ${v}`).join(' · ')}</div></div>}
              <Row title="Google Chrome" sub={g.chrome ? 'Installé. QuestFlow l’ouvre en arrière-plan, sans fenêtre, le temps de lire, puis le referme.' : 'Introuvable : installe Google Chrome pour relier ton compte'}>
                {g.chrome ? <span className="tag" style={{ background: 'var(--c-green-bg)', color: 'var(--c-green-tx)' }}>Prêt</span> : <button className="btn sm outline" onClick={() => api.openExternal('https://www.google.com/chrome/')}>Télécharger</button>}
              </Row>
              {g.lastReport && (
                <Row title="Dernier scan" sub={`${relative(g.lastReport.at)} · ${[g.lastReport.mails != null && `${g.lastReport.mails} mail(s) lu(s) sur ${g.lastReport.mailsVisible ?? '?'} visibles`, g.lastReport.events != null && `${g.lastReport.events} événement(s)${g.lastReport.calendarVia ? ` (${g.lastReport.calendarVia})` : ''}`, g.lastReport.chats != null && `${g.lastReport.chats} message(s) Chat`, g.lastReport.slack != null && `${g.lastReport.slack} message(s) Slack`, `${g.lastReport.newTasks} nouvelle(s) quête(s)`].filter(Boolean).join(' · ')}`}>
                  <span />
                </Row>
              )}
              {g.connected && (
                <Row title="Relire mes mails et Chat de la semaine" sub="Utile si des demandes manquent dans ta to-do">
                  <button className="btn sm primary" onClick={() => runSync({ rescan: true })}><RefreshCw size={14} /> Relire</button>
                </Row>
              )}
              <Row title="Rapport de diagnostic" sub="Copie un rapport technique (sans le contenu de tes mails) à m'envoyer si quelque chose ne marche pas">
                <button className="btn sm outline" onClick={async () => { const t = await api.googleReport(); try { await navigator.clipboard.writeText(t); toast('Rapport copié : colle-le dans ton message', { icon: 'check' }); } catch { toast('Copie impossible', { icon: 'alert' }); } }}>Copier le rapport</button>
              </Row>
              {g.connected && (
                <Row title="Tester la lecture" sub={test ? (test.ok ? [`Gmail : ${test.mails ?? '—'} fil(s) visibles`, `Agenda : ${test.events ?? '—'} événement(s)`, s.syncChat ? `Chat : ${test.chats ?? '—'} conversation(s)` : null, ...Object.entries(test.errors || {}).map(([k, v]) => `⚠️ ${k} : ${v}`)].filter(Boolean).join(' · ') : `⚠️ ${test.error}`) : 'Vérifie que Gmail, Agenda et Chat se lisent bien (≈ 20 s)'}>
                  <button className="btn sm outline" disabled={testing} onClick={async () => { setTesting(true); setTest(null); setTest(await api.googleTest()); setTesting(false); }}>{testing ? 'Test en cours…' : 'Tester'}</button>
                </Row>
              )}
            </div>
            <div className="set-group">
              <h3>Sources</h3>
              <Row title="Gmail" sub="Boîte de réception (onglet Principal), sans marquer les mails comme lus"><span className="tag">Toujours</span></Row>
              <Row title="Google Agenda" sub="Tous tes agendas, avec création, modification et suppression d'événements"><span className="tag">Toujours</span></Row>
              <Row title="Slack des agences (Roads, Datashake…)" sub="Via les notifications Slack reçues par mail : mentions, messages directs et récaps. Astuce : dans Slack, Préférences → Notifications → « Recevoir des notifications par e-mail » toutes les 15 minutes."><Toggle on={s.syncSlack !== false} onChange={(v) => set({ syncSlack: v })} /></Row>
              <Row title="Google Chat (bêta)" sub="Messages directs et mentions. Les conversations lues par QuestFlow passent en « lu »."><Toggle on={s.syncChat} onChange={(v) => set({ syncChat: v })} /></Row>
            </div>
            <div className="callout" style={{ fontSize: 13 }}>
              <span className="emoji">🔒</span>
              <div style={{ lineHeight: 1.55 }}>QuestFlow utilise un profil Chrome à part, rangé dans ses propres fichiers : ton Chrome habituel, tes favoris et tes mots de passe ne sont pas touchés. Tes mails restent entre ton Mac et Google. Si Google te demande de te reconnecter (ça arrive de temps en temps), QuestFlow rouvre simplement la fenêtre de connexion.</div>
            </div>
          </>
        )}

        {section === 'sync' && (
          <>
            <h1>Synchronisation</h1>
            <div className="set-group">
              <h3>Scan des mails, du chat et de l'agenda</h3>
              <Row title="Scan automatique" sub="En arrière-plan, avec notification des nouvelles missions">
                <select className="select" style={{ width: 180 }} value={s.autoSyncMinutes} onChange={(e) => set({ autoSyncMinutes: +e.target.value })}>
                  <option value={0}>Désactivé</option><option value={10}>Toutes les 10 min</option><option value={20}>Toutes les 20 min</option><option value={60}>Toutes les heures</option>
                </select>
              </Row>
              <Row title="Mails analysés" sub="Ancienneté maximale">
                <select className="select" style={{ width: 180 }} value={s.mailLookbackDays} onChange={(e) => set({ mailLookbackDays: +e.target.value })}>
                  <option value={2}>2 derniers jours</option><option value={7}>7 derniers jours</option><option value={14}>14 derniers jours</option><option value={30}>30 derniers jours</option>
                </select>
              </Row>
              <Row title="Scanner maintenant" sub="Les nouveaux mails et messages Chat"><button className="btn sm outline" onClick={() => runSync()}><RefreshCw size={14} /> Lancer</button></Row>
              <Row title="Relire toute la période" sub={`Repasse sur tous les mails et messages Chat des ${s.mailLookbackDays} derniers jours, même ceux déjà lus (les quêtes en double sont écartées)`}><button className="btn sm outline" onClick={() => runSync({ rescan: true })}><RefreshCw size={14} /> Relire</button></Row>
            </div>
          </>
        )}

        {section === 'notifications' && (
          <>
            <h1>Notifications</h1>
            <div className="set-group">
              <h3>Rappels</h3>
              <Row title="Notifications" sub="Quêtes prioritaires, échéances, réunions"><Toggle on={s.notifications} onChange={(v) => set({ notifications: v })} /></Row>
              <Row title="Prévenir avant une quête prioritaire">
                <select className="select" style={{ width: 180 }} value={s.notifyLeadMinutes} onChange={(e) => set({ notifyLeadMinutes: +e.target.value })}>
                  <option value={15}>15 min avant</option><option value={30}>30 min avant</option><option value={60}>1 h avant</option><option value={120}>2 h avant</option>
                </select>
              </Row>
              <Row title="Récap du matin" sub={`Vers ${s.digestHour} h : tes quêtes du jour`}><Toggle on={s.morningDigest} onChange={(v) => set({ morningDigest: v })} /></Row>
              <Row title="Tester"><button className="btn sm outline" onClick={() => api.testNotification()}><Bell size={14} /> Envoyer un test</button></Row>
            </div>
          </>
        )}

        {section === 'game' && (
          <>
            <h1>Jeu & progression</h1>
            <div className="set-group">
              <h3>Statistiques</h3>
              <Row title="XP total"><span className="mono">{data.stats.xp}</span></Row>
              <Row title="Quêtes accomplies"><span className="mono">{data.stats.completedCount || 0}</span></Row>
              <Row title="Meilleure série"><span className="mono">{data.stats.bestStreak || 0} jours</span></Row>
              <Row title="Record au Quest Runner" sub={`${data.stats.gamesPlayed || 0} parties jouées pendant les chargements`}><span className="mono">{data.stats.highScore || 0}</span></Row>
            </div>
          </>
        )}

        {section === 'updates' && (
          <>
            <h1>Mises à jour</h1>
            <div className="set-group">
              <h3>QuestFlow {data.app.version}</h3>
              <Row title="Mises à jour automatiques" sub={updater?.state === 'uptodate' ? 'Tu as la dernière version ✓' : updater?.state === 'available' ? `Version ${updater.version} disponible` : updater?.state === 'error' ? `Erreur : ${updater.error}` : 'Vérifiées à chaque lancement'}>
                {updater?.state === 'available' ? (
                  <button className="btn sm primary" onClick={() => api.installUpdate()}><Download size={14} /> Installer</button>
                ) : (
                  <button className="btn sm outline" onClick={async () => { const st = await api.checkUpdates(); toast(st.state === 'uptodate' ? 'Tu as déjà la dernière version' : st.state === 'available' ? `Version ${st.version} disponible` : 'Vérification terminée'); }}><RefreshCw size={14} /> Vérifier</button>
                )}
              </Row>
              <Row title="Journal de diagnostic" sub="À m'envoyer si quelque chose ne marche pas"><button className="btn sm outline" onClick={() => api.openLogs()}><FolderOpen size={14} /> Ouvrir</button></Row>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
