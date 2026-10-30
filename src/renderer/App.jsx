import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { useApp } from './store.js';
import { api } from './api.js';
import { setSoundEnabled } from './lib/sound.js';
import { Sidebar, TopBar } from './components/Chrome.jsx';
import { Background, Greeting, SuccessOverlay, LoadingScreen, UpdateOverlay, Toasts } from './components/Overlays.jsx';
import { Onboarding } from './components/Onboarding.jsx';
import { TaskModal } from './components/TaskModal.jsx';
import { QuestsView, TodoView, SearchView, DoneView, PasteModal } from './views/Views.jsx';
import { AgendaView } from './views/AgendaView.jsx';
import { GoogleSetup } from './components/GoogleSetup.jsx';
import { SettingsView } from './views/SettingsView.jsx';
import { parseQuery, isEmptyQuery } from '../shared/search.js';

const VIEWS = { quests: QuestsView, todo: TodoView, done: DoneView, agenda: AgendaView, settings: SettingsView };

export default function App() {
  const { data, phase, tab, query, setData, setPhase, setTab, newTask, runSync, openTask, setUpdater } = useApp();

  useEffect(() => {
    api.getState().then((s) => {
      setData(s);
      setSoundEnabled(s.settings.sounds);
      const params = new URLSearchParams(location.search);
      const forced = params.get('phase');
      setPhase(forced || (s.profile.name ? 'greeting' : 'onboarding'));
      if (params.get('tab')) useApp.setState({ tab: params.get('tab') });
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

  const endGreeting = useCallback(() => setPhase('main'), [setPhase]);
  const endOnboarding = useCallback(() => setPhase('greeting'), [setPhase]);

  if (!data) return <div style={{ height: '100%', background: 'var(--bg)' }} />;

  const searching = !isEmptyQuery(parseQuery(query)) || /statut:/.test(query);
  const View = searching ? SearchView : VIEWS[tab] || QuestsView;

  return (
    <MotionConfig reducedMotion={data.settings.reduceMotion ? 'always' : 'never'}>
      <Background calm={phase === 'main'} />
      {phase === 'main' && (
        <motion.div className="app" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}>
          <Sidebar />
          <main className="main">
            <TopBar />
            <div className={`content ${tab === 'agenda' && !searching ? 'flush' : ''}`} style={tab === 'agenda' && !searching ? { position: 'relative' } : undefined}>
              <AnimatePresence mode="wait">
                <motion.div key={searching ? 'search' : tab} style={tab === 'agenda' && !searching ? { height: '100%' } : undefined} initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }} transition={{ duration: 0.22 }}>
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
      <TaskModal />
      <PasteModal />
      <GoogleSetup />
      <LoadingScreen />
      <SuccessOverlay />
      <UpdateOverlay />
      <Toasts />
    </MotionConfig>
  );
}
