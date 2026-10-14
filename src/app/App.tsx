import { AlertCircle, Info } from 'lucide-react';
import { useEffect } from 'react';
import { DetailsPanel } from '../features/details/DetailsPanel';
import { TeamPanel, TeamStrip } from '../features/people/TeamPanel';
import { AgendaView } from '../features/person/AgendaView';
import { PersonBanner } from '../features/person/PersonBanner';
import { Planner } from '../features/planner/Planner';
import { Welcome } from '../features/projects/Welcome';
import { HelpDialog } from '../features/settings/HelpDialog';
import { SettingsDialog } from '../features/settings/SettingsDialog';
import { Toolbar } from '../features/toolbar/Toolbar';
import { useStore } from '../store/projectStore';
import { useShortcuts } from './useShortcuts';

function useTheme() {
  const theme = useStore((s) => s.ui.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

export function App() {
  useTheme();
  useShortcuts();
  const ready = useStore((s) => s.ready);
  const hasDoc = useStore((s) => s.doc !== null);
  const view = useStore((s) => s.ui.view);
  const panel = useStore((s) => s.ui.panel);
  const settingsOpen = useStore((s) => s.ui.settingsOpen);
  const helpOpen = useStore((s) => s.ui.helpOpen);

  if (!ready) return null;

  return (
    <div className="flex h-full flex-col">
      {hasDoc ? (
        <>
          <Toolbar />
          {view.mode === 'plan' ? <TeamStrip /> : <PersonBanner />}
          <div className="flex min-h-0 flex-1">
            {view.mode === 'person' && view.layout === 'agenda' ? <AgendaView /> : <Planner />}
            {panel === 'details' && <DetailsPanel />}
            {panel === 'team' && <TeamPanel />}
          </div>
          {settingsOpen && <SettingsDialog />}
          {helpOpen && <HelpDialog />}
        </>
      ) : (
        <Welcome />
      )}
      <ToastView />
    </div>
  );
}

function ToastView() {
  const toast = useStore((s) => s.ui.toast);
  if (!toast) return null;
  const Icon = toast.tone === 'error' ? AlertCircle : Info;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <div
        role="status"
        className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 shadow-pop ${
          toast.tone === 'error'
            ? 'border-danger/40 bg-surface text-danger'
            : 'border-border bg-surface text-text'
        }`}
      >
        <Icon size={16} />
        {toast.message}
      </div>
    </div>
  );
}
