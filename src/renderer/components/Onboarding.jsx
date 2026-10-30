import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { savePrefs, usePrefs } from '../lib/prefs.js';
import { AppIcon } from './Logo.jsx';

/** Premier lancement : prénom, thème, connexion Google, notifications. */
export function Onboarding({ onDone }) {
  const data = useApp((s) => s.data);
  const connectGoogle = useApp((s) => s.connectGoogle);
  const prefs = usePrefs();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.profile.name || '');
  const [connecting, setConnecting] = useState(false);
  const connected = data.google.connected;

  const next = async () => {
    if (step === 0) {
      if (!name.trim()) return;
      await api.setProfile({ name: name.trim() });
    }
    if (step === 3) return onDone();
    setStep(step + 1);
  };
  const anim = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, transition: { duration: 0.22 } };

  return (
    <motion.div className="fullscreen" exit={{ opacity: 0 }}>
      <div style={{ width: 520 }}>
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="0" {...anim}>
              <AppIcon size={72} />
              <h1 style={{ fontSize: 36, margin: '10px 0 6px', letterSpacing: '-0.02em' }}>Bienvenue dans QuestFlow</h1>
              <p className="muted" style={{ fontSize: 16, lineHeight: 1.6, margin: 0 }}>Ta to-do, façon Notion, qui devient un jeu : quêtes du jour, XP, séries… et tes mails transformés en missions automatiquement.</p>
              <div style={{ marginTop: 28, fontWeight: 600 }}>Comment tu t'appelles ?</div>
              <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} placeholder="Ton prénom" style={{ marginTop: 8, height: 44, fontSize: 18 }} />
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="1" {...anim}>
              <div style={{ fontSize: 56 }}>🎨</div>
              <h1 style={{ fontSize: 32, margin: '10px 0 6px' }}>Choisis ton style</h1>
              <p className="muted" style={{ fontSize: 15, margin: 0 }}>Tout se change ensuite dans Réglages → Apparence.</p>
              <div className="theme-cards" style={{ margin: '22px 0' }}>
                {[['light', 'Clair', '#fff', '#f8f8f7'], ['dark', 'Sombre', '#191919', '#202020'], ['system', 'Comme le Mac', 'linear-gradient(90deg,#fff 50%,#191919 50%)', 'linear-gradient(90deg,#f8f8f7 50%,#202020 50%)']].map(([k, l, bg, sb]) => (
                  <button key={k} className={`theme-card ${prefs.appearance.theme === k ? 'on' : ''}`} style={{ width: 150 }} onClick={() => savePrefs({ appearance: { theme: k } })}>
                    <div className="mini" style={{ height: 80 }}><span style={{ background: sb }} /><span style={{ background: bg }} /></div>
                    {l}
                  </button>
                ))}
              </div>
              <div className="seg">
                {[['default', 'Défaut', 'var(--font-default)'], ['serif', 'Serif', 'var(--font-serif)'], ['mono', 'Mono', 'var(--font-mono)']].map(([k, l, f]) => (
                  <button key={k} className={prefs.appearance.font === k ? 'on' : ''} style={{ fontFamily: f }} onClick={() => savePrefs({ appearance: { font: k } })}>{l}</button>
                ))}
              </div>
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="2" {...anim}>
              <div style={{ fontSize: 56 }}>🔗</div>
              <h1 style={{ fontSize: 32, margin: '10px 0 6px' }}>Connecte ton Google, {name}</h1>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>QuestFlow ouvre Google Chrome une seule fois : tu te connectes comme d'habitude, et la fenêtre se ferme toute seule. Ensuite, il lit ton agenda, tes mails et Chat en arrière-plan, sans fenêtre. Aucune clé, aucun réglage.</p>
              <div style={{ marginTop: 22 }}>
                {connected ? (
                  <span className="btn success" style={{ pointerEvents: 'none' }}><Check size={16} /> Compte Google connecté</span>
                ) : (
                  <button className="btn primary" style={{ height: 38, padding: '0 16px' }} disabled={connecting} onClick={async () => { setConnecting(true); await connectGoogle(); setConnecting(false); }}>
                    {connecting ? 'Connexion dans Chrome…' : 'Se connecter avec Google Chrome'}
                  </button>
                )}
              </div>
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="3" {...anim}>
              <div style={{ fontSize: 56 }}>🔔</div>
              <h1 style={{ fontSize: 32, margin: '10px 0 6px' }}>Ne rate aucune quête</h1>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>QuestFlow te prévient avant tes quêtes prioritaires, à l'heure des échéances et chaque matin avec le récap du jour.</p>
              <button className="btn outline" style={{ marginTop: 20 }} onClick={() => api.testNotification()}>Tester une notification</button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="row" style={{ marginTop: 34 }}>
          {[0, 1, 2, 3].map((i) => <motion.span key={i} animate={{ width: i === step ? 22 : 7, background: i === step ? 'var(--accent)' : 'var(--active)' }} style={{ height: 7, borderRadius: 7 }} />)}
          <span className="grow" />
          {step === 2 && !connected && <button className="btn" onClick={() => setStep(3)}>Plus tard</button>}
          <button className="btn primary" style={{ height: 36, padding: '0 16px' }} disabled={step === 0 && !name.trim()} onClick={next}>
            {step === 3 ? "C'est parti" : 'Continuer'} <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
