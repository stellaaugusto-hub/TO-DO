import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Globe, RefreshCw, Bell, Gamepad2, Download, FolderOpen, LogOut } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';
import { Toggle } from '../components/bits.jsx';
import { relative } from '../lib/format.js';
import { setSoundEnabled } from '../lib/sound.js';

function Row({ title, sub, children }) {
  return (
    <div className="setting-row">
      <div className="lbl"><b>{title}</b>{sub && <span>{sub}</span>}</div>
      {children}
    </div>
  );
}

export function SettingsView() {
  const { data, updater, toast, runSync, connectGoogle, setGoogleSetupOpen } = useApp();
  const s = data.settings;
  const [name, setName] = useState(data.profile.name);
  const [connecting, setConnecting] = useState(false);
  useEffect(() => setName(data.profile.name), [data.profile.name]);
  const set = (patch) => api.setSettings(patch);
  const g = data.google;

  const panels = [
    {
      icon: User, title: 'Profil',
      body: (
        <>
          <Row title="Ton prénom" sub="Affiché en plein écran à chaque ouverture (« Bonjour … »)">
            <input className="input" style={{ width: 170 }} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== data.profile.name && api.setProfile({ name: name.trim() }).then(() => toast('Prénom mis à jour'))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </Row>
          <Row title="Sons" sub="Petits effets sonores (validation, niveau, jeu)">
            <Toggle on={s.sounds} onChange={(v) => { setSoundEnabled(v); set({ sounds: v }); }} />
          </Row>
        </>
      ),
    },
    {
      icon: Globe, title: 'Compte Google',
      body: (
        <>
          <Row title={g.connected ? 'Connecté' : g.configured ? 'Non connecté' : 'À configurer (une fois)'} sub={g.connected ? `${g.email || 'Compte Google'} · dernier scan ${relative(g.lastSync)}` : 'Agenda, Gmail et Chat via la connexion officielle Google'}>
            <span className={`status-dot ${g.connected ? 'ok' : 'warn'}`} />
            {g.connected ? (
              <button className="btn small" onClick={() => api.googleDisconnect()}><LogOut size={14} /> Déconnecter</button>
            ) : (
              <button className="btn small primary" disabled={connecting} onClick={async () => { setConnecting(true); await connectGoogle(); setConnecting(false); }}>
                {connecting ? 'Ouvre ton navigateur…' : g.configured ? 'Se connecter' : 'Configurer'}
              </button>
            )}
          </Row>
          {g.lastError && <div className="dim" style={{ fontSize: 12, padding: '0 0 10px' }}>⚠️ Dernière erreur : {typeof g.lastError === 'string' ? g.lastError : Object.entries(g.lastError).map(([k, v]) => `${k} : ${v}`).join(' · ')}</div>}
          <Row title="Identifiants Google Cloud" sub={g.configured ? `ID client : ${g.clientId.slice(0, 22)}…` : 'Guide pas à pas (≈ 10 min)'}>
            <button className="btn small" onClick={() => setGoogleSetupOpen(true)}>{g.configured ? 'Modifier' : 'Ouvrir le guide'}</button>
          </Row>
          <Row title="Lire Google Chat" sub="Messages directs et mentions">
            <Toggle on={s.syncChat} onChange={(v) => set({ syncChat: v })} />
          </Row>
        </>
      ),
    },
    {
      icon: RefreshCw, title: 'Synchronisation',
      body: (
        <>
          <Row title="Scan automatique" sub="Mails, chat et agenda en arrière-plan">
            <select className="select" style={{ width: 150 }} value={s.autoSyncMinutes} onChange={(e) => set({ autoSyncMinutes: +e.target.value })}>
              <option value={0}>Désactivé</option>
              <option value={10}>Toutes les 10 min</option>
              <option value={20}>Toutes les 20 min</option>
              <option value={60}>Toutes les heures</option>
            </select>
          </Row>
          <Row title="Mails analysés" sub="Ancienneté maximale des mails lus">
            <select className="select" style={{ width: 150 }} value={s.mailLookbackDays} onChange={(e) => set({ mailLookbackDays: +e.target.value })}>
              <option value={2}>2 derniers jours</option>
              <option value={7}>7 derniers jours</option>
              <option value={14}>14 derniers jours</option>
              <option value={30}>30 derniers jours</option>
            </select>
          </Row>
          <Row title="Scanner maintenant">
            <button className="btn small" onClick={runSync}><RefreshCw size={14} /> Lancer</button>
          </Row>
        </>
      ),
    },
    {
      icon: Bell, title: 'Notifications',
      body: (
        <>
          <Row title="Notifications" sub="Quêtes prioritaires, échéances, réunions">
            <Toggle on={s.notifications} onChange={(v) => set({ notifications: v })} />
          </Row>
          <Row title="Prévenir avant une quête prioritaire">
            <select className="select" style={{ width: 150 }} value={s.notifyLeadMinutes} onChange={(e) => set({ notifyLeadMinutes: +e.target.value })}>
              <option value={15}>15 min avant</option>
              <option value={30}>30 min avant</option>
              <option value={60}>1 h avant</option>
              <option value={120}>2 h avant</option>
            </select>
          </Row>
          <Row title="Récap du matin" sub={`Vers ${s.digestHour} h : tes quêtes du jour`}>
            <Toggle on={s.morningDigest} onChange={(v) => set({ morningDigest: v })} />
          </Row>
          <Row title="Tester">
            <button className="btn small" onClick={() => api.testNotification()}><Bell size={14} /> Envoyer un test</button>
          </Row>
        </>
      ),
    },
    {
      icon: Gamepad2, title: 'Jeu & progression',
      body: (
        <>
          <Row title="Record au Quest Runner" sub={`${data.stats.gamesPlayed || 0} parties jouées pendant les chargements`}><span className="mono" style={{ fontSize: 18, color: '#fde68a' }}>{data.stats.highScore || 0}</span></Row>
          <Row title="XP total"><span className="mono" style={{ fontSize: 18 }}>{data.stats.xp}</span></Row>
        </>
      ),
    },
    {
      icon: Download, title: 'Mises à jour',
      body: (
        <>
          <Row title={`Version ${data.app.version}`} sub={updater?.state === 'uptodate' ? 'Tu as la dernière version ✓' : updater?.state === 'available' ? `Version ${updater.version} disponible` : updater?.state === 'disabled' ? 'Automatiques dans l’app installée' : updater?.state === 'error' ? `Erreur : ${updater.error}` : 'Vérifiées à chaque lancement'}>
            {updater?.state === 'available' ? (
              <button className="btn small primary" onClick={() => api.installUpdate()}><Download size={14} /> Installer</button>
            ) : (
              <button className="btn small" onClick={async () => { const st = await api.checkUpdates(); toast(st.state === 'uptodate' ? 'Tu as déjà la dernière version' : st.state === 'available' ? `Version ${st.version} disponible` : 'Vérification terminée'); }}><RefreshCw size={14} /> Vérifier</button>
            )}
          </Row>
          <Row title="Journal de diagnostic" sub="À m'envoyer si quelque chose ne marche pas">
            <button className="btn small" onClick={() => api.openLogs()}><FolderOpen size={14} /> Ouvrir</button>
          </Row>
        </>
      ),
    },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Réglages</h1>
          <div className="page-sub">Tout se personnalise, et tout reste sur ton Mac.</div>
        </div>
      </div>
      <div className="settings">
        {panels.map((p, i) => {
          const I = p.icon;
          return (
            <motion.div key={p.title} className="panel" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <h3><I size={16} color="#a78bfa" /> {p.title}</h3>
              {p.body}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
