import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader, X, Lock, Download, RotateCcw, AlertTriangle } from 'lucide-react';
import { useApp } from '../store.js';
import { api } from '../api.js';

const STEPS = [
  { key: 'open', title: 'Chrome s’ouvre sur la page de connexion Google', sub: 'Une fenêtre Chrome normale, avec un profil réservé à QuestFlow.' },
  { key: 'login', title: 'Connecte-toi à ton compte Google', sub: 'Adresse, mot de passe et validation sur ton téléphone si Google la demande. Comme d’habitude.' },
  { key: 'check', title: 'QuestFlow vérifie et referme Chrome', sub: 'Ensuite, tout se fait en arrière-plan, sans fenêtre.' },
];

const ORDER = { opening: 0, waiting: 1, detected: 2, verifying: 2, done: 3 };

function StepIcon({ state }) {
  if (state === 'done') return <motion.span className="cc-step-ic done" initial={{ scale: 0.6 }} animate={{ scale: 1 }}><Check size={13} strokeWidth={3} /></motion.span>;
  if (state === 'active') return <span className="cc-step-ic active"><Loader size={13} className="spin-inline" /></span>;
  return <span className="cc-step-ic" />;
}

/** Fenêtre de connexion Google par Chrome (aucune clé, aucun réglage). */
export function ChromeConnect() {
  const { googleLogin, setGoogleLogin, connectGoogle } = useApp();
  const phase = googleLogin?.phase;
  const idx = ORDER[phase] ?? 1;
  const failed = phase === 'error' || phase === 'no-chrome';
  const close = () => {
    if (['opening', 'waiting', 'detected'].includes(phase)) api.googleCancelLogin();
    setGoogleLogin(null);
  };
  const status = {
    opening: 'Ouverture de Google Chrome…',
    waiting: 'En attente de ta connexion…',
    detected: 'Connexion détectée, fermeture de Chrome…',
    verifying: 'Vérification de ton agenda et de ta boîte mail…',
    done: `Connecté${googleLogin?.email ? ` : ${googleLogin.email}` : ''}`,
  }[phase];

  return (
    <AnimatePresence>
      {googleLogin && (
        <motion.div className="overlay cc-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="modal cc" initial={{ y: 16, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ duration: 0.18 }}>
            <div className="modal-head row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h2>Connexion avec Google Chrome</h2>
                <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>Une seule fois. Aucune clé, aucun réglage.</div>
              </div>
              <button className="btn sm icon" onClick={close} title="Fermer"><X size={17} /></button>
            </div>

            <div className="modal-body">
              <div className={`cc-window ${phase === 'done' ? 'ok' : ''}`}>
                <div className="cc-bar">
                  <span className="cc-dots"><i /><i /><i /></span>
                  <span className="cc-url"><Lock size={11} /> {phase === 'done' || phase === 'verifying' ? 'mail.google.com' : 'accounts.google.com'}</span>
                </div>
                <div className="cc-page">
                  {failed ? (
                    <div className="cc-center"><AlertTriangle size={26} /><div>{phase === 'no-chrome' ? 'Google Chrome est introuvable sur ce Mac' : 'La connexion n’a pas abouti'}</div></div>
                  ) : phase === 'done' ? (
                    <motion.div className="cc-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <span className="cc-check"><Check size={22} strokeWidth={3} /></span>
                      <div>{googleLogin.email || 'Compte Google connecté'}</div>
                    </motion.div>
                  ) : (
                    <div className="cc-form">
                      <div className="cc-g">G</div>
                      <div className="cc-line w60" />
                      <motion.div className="cc-input" animate={{ borderColor: idx === 1 ? ['var(--border-2)', 'var(--accent)', 'var(--border-2)'] : 'var(--border-2)' }} transition={{ duration: 2.2, repeat: Infinity }}>
                        <motion.span className="cc-caret" animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                      </motion.div>
                      <div className="cc-line w40" />
                    </div>
                  )}
                </div>
              </div>

              {failed ? (
                <div className="callout" style={{ marginTop: 16 }}>
                  <span className="emoji">{phase === 'no-chrome' ? '🧭' : '⚠️'}</span>
                  <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
                    {phase === 'no-chrome'
                      ? 'QuestFlow passe par Google Chrome pour lire ton agenda, tes mails et Chat. Installe Chrome (gratuit), puis clique sur Réessayer.'
                      : googleLogin.error || 'Réessaie : connecte-toi dans la fenêtre Chrome, QuestFlow la fermera tout seul.'}
                  </div>
                </div>
              ) : (
                <div className="cc-steps">
                  {STEPS.map((st, i) => {
                    const state = i < idx ? 'done' : i === idx ? 'active' : '';
                    return (
                      <div key={st.key} className={`cc-step ${state}`}>
                        <StepIcon state={state} />
                        <div>
                          <div className="cc-step-t">{st.title}</div>
                          <div className="cc-step-s">{st.sub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!failed && (
                <div className="cc-note">
                  <Lock size={13} />
                  <span>Ton Chrome habituel n’est pas touché. Tes mails restent entre ton Mac et Google : QuestFlow ne les envoie nulle part.</span>
                </div>
              )}
            </div>

            <div className="modal-foot">
              {status && !failed && <span className="cc-status">{phase !== 'done' && <Loader size={13} className="spin-inline" />}{status}</span>}
              <span className="grow" />
              {failed ? (
                <>
                  {phase === 'no-chrome' && <button className="btn outline" onClick={() => api.openExternal('https://www.google.com/chrome/')}><Download size={14} /> Télécharger Chrome</button>}
                  <button className="btn primary" onClick={() => { setGoogleLogin(null); connectGoogle(); }}><RotateCcw size={14} /> Réessayer</button>
                </>
              ) : phase === 'done' ? (
                <button className="btn primary" onClick={() => setGoogleLogin(null)}>Continuer</button>
              ) : (
                <>
                  <button className="btn" onClick={close}>Annuler</button>
                  <button className="btn primary" disabled={idx !== 1} onClick={() => api.googleFinishLogin()}>J’ai terminé</button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
