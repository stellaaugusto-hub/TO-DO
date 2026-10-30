import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useApp } from './store.js';
import { api } from './api.js';
import { setSoundEnabled } from './lib/sound.js';
import { usePrefs, applyAppearance } from './lib/prefs.js';
import { Sidebar, TopBar, CommandPalette } from './components/Shell.jsx';
import { Greeting, SuccessOverlay, LoadingScreen, UpdateOverlay, Toasts } from './components/Overlays.jsx';
import { Onboarding } from './components/Onboarding.jsx';
import { TaskPeek } from './components/TaskPeek.jsx';
import { GoogleSetup } from './components/GoogleSetup.jsx';
import { QuestsView, TodoView, DoneView, PasteModal } from './views/Views.jsx';
import { AgendaView } from './views/AgendaView.jsx';
import { SettingsView } from './views/SettingsView.jsx';

const VIEWS = { quests: QuestsView, todo: TodoView, done: DoneView, agenda: AgendaView, settings: SettingsView };

export default function App() {
  const { data, phase, tab, setData, setPhase, setTab, newTask, runSync, openTask, setUpdater } = useApp();
  const prefs = usePrefs();
  const a = prefs.appearance;

  useEffect(() => {
    api.getState().then((s) => {
      setData(s);
      setSoundEnabled(s.settings.sounds);
      const params = new URLSearchParams(location.search);
      setPhase(params.get('phase') || (s.profile.name ? 'greeting' : 'onboarding'));
      if (params.get('tab')) useApp.setState({ tab: params.get('tab') });
      if (params.get('theme')) api.setSettings({ appearance: { ...(s.settings.appearance || {}), theme: params.get('theme') } });
    });
    const offs = [
      api.onState((s) => setData(s)),
      api.onUpdater((u) => setUpdater(u)),
      api.onNavigate((where) => {
        if (where === 'new-task') newTask();
        else if (where === 'sync') runSync();
        else if (where !== 'search') setTab(where);
      }),
      api.onOpenTask((id) => openTask(id)),
      api.onBackgroundSync((r) => {
        if (r?.ok && r.newTasks.length) {
          useApp.getState().toast(`${r.newTasks.length} nouvelle(s) quête(s) détectée(s)`);
          useApp.setState({ highlight: r.newTasks });
        }
      }),
    ];
    api.updaterStatus().then(setUpdater);
    return () => offs.forEach((o) => o?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Thème, accent, police, densité
  useEffect(() => {
    applyAppearance(a);
    if (a.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyAppearance(a);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [a.theme, a.accent, a.font, a.smallText, a.fullWidth]);

  const endGreeting = useCallback(() => setPhase('main'), [setPhase]);
  const endOnboarding = useCallback(() => setPhase('greeting'), [setPhase]);

  if (!data) return <div style={{ height: '100%', background: 'var(--bg)' }} />;
  const View = VIEWS[tab] || QuestsView;
  const flush = tab === 'agenda' || tab === 'settings';

  return (
    <MotionConfig reducedMotion={a.reduceMotion ? 'always' : 'never'}>
      {phase === 'main' && (
        <motion.div className="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.35 }}>
          <Sidebar />
          <main className="main">
            <TopBar />
            <div className={`content ${tab === 'agenda' ? 'flush' : ''}`}>
              <AnimatePresence mode="wait">
                <motion.div key={tab} style={flush ? { height: '100%' } : undefined} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                  <View />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </motion.div>
      )}
      <AnimatePresence>
        {phase === 'onboarding' && <Onboarding key="onb" onDone={endOnboarding} />}
        {phase === 'greeting' && <Greeting key="greet" onDone={endGreeting} />}
      </AnimatePresence>
      <TaskPeek />
      <CommandPalette />
      <PasteModal />
      <GoogleSetup />
      <LoadingScreen />
      <SuccessOverlay />
      <UpdateOverlay />
      <Toasts />
    </MotionConfig>
  );
}
