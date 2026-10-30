import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Calendar, Mail, MessageCircle, Bell, Swords, Check } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.js';
import { Background } from './Overlays.jsx';

/** Premier lancement : prénom, connexion Google, notifications. */
export function Onboarding({ onDone }) {
  const data = useApp((s) => s.data);
  const connectGoogle = useApp((s) => s.connectGoogle);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.profile.name || '');
  const [connecting, setConnecting] = useState(false);
  const connected = data.google.connected;

  const next = async () => {
    if (step === 0) {
      if (!name.trim()) return;
      await api.setProfile({ name: name.trim() });
    }
    if (step === 2) {
      onDone();
      return;
    }
    setStep(step + 1);
  };

  const card = { initial: { opacity: 0, x: 60, filter: 'blur(8px)' }, animate: { opacity: 1, x: 0, filter: 'blur(0px)' }, exit: { opacity: 0, x: -60, filter: 'blur(8px)' }, transition: { type: 'spring', stiffness: 220, damping: 26 } };

  return (
    <motion.div className="fullscreen" style={{ background: 'var(--bg)' }} exit={{ opacity: 0 }}>
      <Background />
      <div style={{ position: 'relative', width: 560, textAlign: 'center' }}>
        <motion.div className="brand-logo" style={{ width: 72, height: 72, borderRadius: 22, margin: '0 auto 26px' }} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
          <Swords size={36} color="white" />
        </motion.div>
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" {...card}>
              <div className="page-title" style={{ fontSize: 38 }}>Bienvenue dans <span className="grad-text">QuestFlow</span></div>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>Ta to-do devient un jeu : quêtes du jour, XP, niveaux, séries… et tes mails transformés en missions automatiquement.</p>
              <div style={{ marginTop: 30, fontWeight: 600 }}>Comment tu t'appelles ?</div>
              <input
                className="input"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && next()}
                placeholder="Ton prénom"
                style={{ marginTop: 12, height: 56, fontSize: 20, textAlign: 'center', fontFamily: 'var(--display)', borderRadius: 16 }}
              />
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="s1" {...card}>
              <div className="page-title" style={{ fontSize: 32 }}>Connecte ton Google, {name}</div>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>QuestFlow utilise la connexion officielle de Google : ton navigateur s'ouvre une seule fois pour autoriser l'accès, puis tout se synchronise en arrière-plan. Tes données restent entre ton Mac et Google.</p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', margin: '24px 0' }}>
                {[[Calendar, 'Agenda'], [Mail, 'Gmail'], [MessageCircle, 'Chat']].map(([I, l], i) => (
                  <motion.div key={l} className="panel" style={{ width: 130, padding: 16 }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.08 }}>
                    <I size={26} color="#a78bfa" />
                    <div style={{ marginTop: 8, fontWeight: 650 }}>{l}</div>
                  </motion.div>
                ))}
              </div>
              {connected ? (
                <div className="btn success" style={{ pointerEvents: 'none' }}><Check size={18} /> Compte Google connecté</div>
              ) : (
                <button className="btn primary" style={{ height: 50, padding: '0 26px' }} disabled={connecting} onClick={async () => { setConnecting(true); await connectGoogle(); setConnecting(false); }}>
                  {connecting ? 'Ouvre ton navigateur…' : data.google.configured ? 'Se connecter avec Google' : 'Configurer la connexion Google'}
                </button>
              )}
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="s2" {...card}>
              <div className="page-title" style={{ fontSize: 32 }}>Ne rate aucune quête</div>
              <p className="muted" style={{ fontSize: 15, lineHeight: 1.6 }}>QuestFlow te prévient avant tes quêtes prioritaires, à l'heure des échéances et chaque matin avec le récap du jour.</p>
              <button className="btn" style={{ marginTop: 20, height: 50 }} onClick={() => api.testNotification()}><Bell size={18} /> Tester une notification</button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="row" style={{ justifyContent: 'center', marginTop: 34, gap: 12 }}>
          {step === 1 && !connected && <button className="btn ghost" onClick={() => setStep(2)}>Plus tard</button>}
          <motion.button className="btn primary" style={{ height: 50, padding: '0 28px' }} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} disabled={step === 0 && !name.trim()} onClick={next}>
            {step === 2 ? "C'est parti !" : 'Continuer'} <ArrowRight size={18} />
          </motion.button>
        </div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 22, gap: 8 }}>
          {[0, 1, 2].map((i) => <motion.span key={i} animate={{ width: i === step ? 26 : 8, background: i === step ? '#a78bfa' : 'rgba(255,255,255,0.2)' }} style={{ height: 8, borderRadius: 8 }} />)}
        </div>
      </div>
    </motion.div>
  );
}
