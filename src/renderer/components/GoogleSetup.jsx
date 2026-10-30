import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Check, KeyRound } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';

const STEPS = [
  {
    title: 'Crée un projet Google Cloud',
    body: 'Connecte-toi avec ton adresse pro, nomme le projet « QuestFlow » puis clique sur Créer.',
    links: [['Créer le projet', 'https://console.cloud.google.com/projectcreate']],
  },
  {
    title: 'Active les API Agenda, Gmail et Chat',
    body: 'Ouvre chaque lien et clique sur « Activer » (vérifie que le projet QuestFlow est bien sélectionné en haut).',
    links: [
      ['Google Calendar API', 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com'],
      ['Gmail API', 'https://console.cloud.google.com/apis/library/gmail.googleapis.com'],
      ['Google Chat API', 'https://console.cloud.google.com/apis/library/chat.googleapis.com'],
    ],
  },
  {
    title: "Configure l'écran de consentement",
    body: "Clique sur « Commencer » : nom de l'app « QuestFlow », ton e-mail, puis Audience : « Interne » (réservé à ton entreprise, aucune validation Google nécessaire). Termine avec Créer.",
    links: [['Google Auth Platform', 'https://console.cloud.google.com/auth/overview']],
  },
  {
    title: 'Crée un identifiant « Application de bureau »',
    body: "Clique sur « Créer un client », type « Application de bureau », nom « QuestFlow Mac », puis Créer. Google t'affiche un ID client et un code secret : copie-les ci-dessous.",
    links: [['Créer le client OAuth', 'https://console.cloud.google.com/auth/clients/create']],
  },
  {
    title: 'Pour Google Chat (facultatif)',
    body: "Onglet Configuration : nom « QuestFlow », une URL d'avatar (n'importe quelle image), une description, décoche « fonctionnalités interactives », puis Enregistrer.",
    links: [['Configuration Chat', 'https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat']],
  },
];

export function GoogleSetup() {
  const { googleSetupOpen, setGoogleSetupOpen, data, toast } = useApp();
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const configured = data?.google.configured;

  const save = async () => {
    setBusy(true);
    const ok = await api.googleConfigure({ clientId, clientSecret: secret });
    if (ok) {
      const r = await api.googleConnect();
      toast(r?.connected ? `Google connecté${r.email ? ` (${r.email})` : ''} 🎉` : `Connexion non terminée : ${r?.error || 'annulée'}`, { icon: r?.connected ? 'check' : 'alert', ms: 6000 });
      if (r?.connected) setGoogleSetupOpen(false);
    }
    setBusy(false);
  };

  return (
    <AnimatePresence>
      {googleSetupOpen && (
        <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && setGoogleSetupOpen(false)}>
          <motion.div className="modal" style={{ width: 720 }} initial={{ y: 30, scale: 0.95, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}>
            <div className="modal-head">
              <span className="icon-tile" style={{ '--c': '#4285f4' }}><KeyRound size={20} /></span>
              <div style={{ flex: 1 }}>
                <div className="page-title" style={{ fontSize: 21 }}>Relier QuestFlow à ton compte Google</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                  À faire une seule fois (≈ 10 min, que des clics). C'est la méthode officielle de Google : tes données restent entre ton Mac et Google.
                </div>
              </div>
              <button className="xbtn" onClick={() => setGoogleSetupOpen(false)}><X size={18} /></button>
            </div>
            <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {STEPS.map((st, i) => (
                <motion.div key={i} className="row" style={{ alignItems: 'flex-start', gap: 14 }} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13, background: 'rgba(139,92,246,0.2)', color: '#c4b5fd' }}>{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 650 }}>{st.title}</div>
                    <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>{st.body}</div>
                    <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {st.links.map(([l, u]) => (
                        <button key={u} className="btn small" onClick={() => api.openExternal(u)}><ExternalLink size={13} /> {l}</button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
              <div className="field" style={{ marginTop: 6 }}>
                <label>ID client</label>
                <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder={configured ? `Déjà configuré : ${data.google.clientId.slice(0, 18)}…` : '1234567890-abc….apps.googleusercontent.com'} />
              </div>
              <div className="field">
                <label>Code secret du client</label>
                <input className="input" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="GOCSPX-…" />
              </div>
              <div className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>
                Compte Gmail perso (pas d'option « Interne ») : choisis « Externe » à l'étape 3 et ajoute ton adresse dans « Utilisateurs test ». Dans ce cas, Google demande de se reconnecter toutes les semaines.
              </div>
            </div>
            <div className="modal-foot">
              <span className="grow" />
              {configured && <button className="btn" onClick={async () => { setBusy(true); const r = await api.googleConnect(); setBusy(false); if (r?.connected) { toast('Google connecté 🎉', { icon: 'check' }); setGoogleSetupOpen(false); } }}>Se connecter avec l'identifiant actuel</button>}
              <button className="btn primary" disabled={busy || !clientId.trim().endsWith('.apps.googleusercontent.com')} onClick={save}>
                {busy ? 'Ouvre ton navigateur…' : <><Check size={16} /> Enregistrer et se connecter</>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
