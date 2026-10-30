import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';

const STEPS = [
  { title: 'Crée un projet Google Cloud', body: 'Connecte-toi avec ton adresse pro, nomme le projet « QuestFlow » puis clique sur Créer.', links: [['Créer le projet', 'https://console.cloud.google.com/projectcreate']] },
  {
    title: 'Active les API Agenda, Gmail et Chat',
    body: 'Ouvre chaque lien et clique sur « Activer » (vérifie que le projet QuestFlow est sélectionné en haut).',
    links: [['Google Calendar API', 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'], ['Gmail API', 'https://console.cloud.google.com/apis/library/gmail.googleapis.com'], ['Google Chat API', 'https://console.cloud.google.com/apis/library/chat.googleapis.com']],
  },
  { title: "Configure l'écran de consentement", body: "« Commencer » : nom « QuestFlow », ton e-mail, Audience « Interne » (réservé à ton entreprise, aucune validation Google). Puis Créer.", links: [['Google Auth Platform', 'https://console.cloud.google.com/auth/overview']] },
  { title: 'Crée un identifiant « Application de bureau »', body: "« Créer un client », type « Application de bureau », nom « QuestFlow Mac ». Copie l'ID client et le code secret ci-dessous.", links: [['Créer le client OAuth', 'https://console.cloud.google.com/auth/clients/create']] },
  { title: 'Pour Google Chat (facultatif)', body: "Onglet Configuration : nom « QuestFlow », une URL d'avatar, une description, décoche « fonctionnalités interactives », Enregistrer.", links: [['Configuration Chat', 'https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat']] },
];

export function GoogleSetup() {
  const { googleSetupOpen, setGoogleSetupOpen, data, toast } = useApp();
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = data?.google.configured;
  const connect = async () => {
    setBusy(true);
    const r = await api.googleConnect();
    setBusy(false);
    toast(r?.connected ? `Google connecté${r.email ? ` (${r.email})` : ''}` : `Connexion non terminée : ${r?.error || 'annulée'}`, { icon: r?.connected ? 'check' : 'alert', ms: 6000 });
    if (r?.connected) setGoogleSetupOpen(false);
  };
  const save = async () => {
    setBusy(true);
    const ok = await api.googleConfigure({ clientId, clientSecret: secret });
    setBusy(false);
    if (ok) connect();
  };
  return (
    <AnimatePresence>
      {googleSetupOpen && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && setGoogleSetupOpen(false)}>
          <motion.div className="modal" style={{ width: 640 }} initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.16 }}>
            <div className="modal-head row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h2>🔗 Relier QuestFlow à ton compte Google</h2>
                <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>À faire une seule fois (≈ 10 min, que des clics). C'est la méthode officielle de Google : tes données restent entre ton Mac et Google.</div>
              </div>
              <button className="btn sm icon" onClick={() => setGoogleSetupOpen(false)}><X size={17} /></button>
            </div>
            <div className="modal-body">
              {STEPS.map((st, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="tag" style={{ background: 'var(--c-blue-bg)', color: 'var(--c-blue-tx)', fontWeight: 650, height: 22, minWidth: 22, justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{st.title}</div>
                    <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>{st.body}</div>
                    <div className="row" style={{ gap: 2, marginTop: 4, flexWrap: 'wrap', marginLeft: -8 }}>
                      {st.links.map(([l, u]) => <button key={u} className="btn sm" style={{ color: 'var(--accent)' }} onClick={() => api.openExternal(u)}><ExternalLink size={13} /> {l}</button>)}
                    </div>
                  </div>
                </div>
              ))}
              <div className="field" style={{ marginTop: 16 }}>
                <label>ID client</label>
                <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={configured ? `Déjà configuré : ${data.google.clientId.slice(0, 18)}…` : '1234567890-abc….apps.googleusercontent.com'} />
              </div>
              <div className="field">
                <label>Code secret du client</label>
                <input className="input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" />
              </div>
              <div className="callout" style={{ fontSize: 13 }}><span className="emoji">💡</span><div>Compte Gmail perso (pas d'option « Interne ») : choisis « Externe » à l'étape 3 et ajoute ton adresse dans « Utilisateurs test ». Google demandera alors de se reconnecter chaque semaine.</div></div>
            </div>
            <div className="modal-foot">
              <span className="grow" />
              {configured && <button className="btn outline" disabled={busy} onClick={connect}>Se connecter avec l'identifiant actuel</button>}
              <button className="btn primary" disabled={busy || !clientId.trim().endsWith('.apps.googleusercontent.com')} onClick={save}>{busy ? 'Ouvre ton navigateur…' : 'Enregistrer et se connecter'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
