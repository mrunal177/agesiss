import React from 'react';
import { useAegisStore, ScreenId } from '../store/useAegisStore';
import {
  Activity,
  CheckCircle2,
  FileCode2,
  Sliders,
  History,
  Video,
  Database,
  Layers,
  TestTube2,
  Sparkles,
  Radio,
} from 'lucide-react';

interface NavItem {
  id: ScreenId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'live', label: 'Live Monitor', icon: Radio },
  { id: 'verification', label: 'Verification Lab', icon: CheckCircle2 },
  { id: 'protocol', label: 'Protocol', icon: FileCode2 },
  { id: 'events', label: 'Event Log', icon: History },
  { id: 'recordings', label: 'Recordings & Stream', icon: Video },
  { id: 'model', label: 'Model & Dataset', icon: Database },
  { id: 'architecture', label: 'Architecture', icon: Layers },
  { id: 'tests', label: 'Test Center', icon: TestTube2 },
];

export const Navigation: React.FC = () => {
  const { activeScreen, setActiveScreen, startWalkthrough, openSetupWizard, groundStatus, fsmIdx, activeAlert } =
    useAegisStore();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 bg-white/95 border-b border-slate-200 backdrop-blur-md shadow-xs">
      {/* Zone 1: Single Wordmark Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => setActiveScreen('overview')}
          className="flex items-center gap-2.5 text-left focus:outline-none group"
        >
          <div className="w-8 h-8 rounded-md bg-cyan-50 border border-cyan-300 flex items-center justify-center text-cyan-700 font-mono font-bold text-sm tracking-wider group-hover:border-cyan-500 transition-colors">
            AE
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-slate-900 font-display flex items-center gap-2">
              AEGIS
              <span className="text-[11px] font-mono tracking-widest text-cyan-700 font-medium px-1.5 py-0.5 rounded bg-cyan-50 border border-cyan-200">
                SIH26174
              </span>
            </div>
          </div>
        </button>
      </div>

      {/* Zone 2: Navigation Links */}
      <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-cyan-50 text-cyan-800 border border-cyan-300 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-600' : 'text-slate-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Primary Actions & Telemetry Indicator */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Link telemetry chip */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700">
          <span
            className={`w-2 h-2 rounded-full ${
              groundStatus.connected ? 'bg-emerald-500 ring-2 ring-emerald-200' : 'bg-amber-500'
            }`}
          />
          <span>{groundStatus.connected ? 'Ground Link: Online' : 'Ground Link: Local Only'}</span>
        </div>

        {/* Guided Walkthrough button */}
        <button
          onClick={startWalkthrough}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-800 bg-cyan-50 border border-cyan-300 rounded hover:bg-cyan-100 transition-colors whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
          <span>Guided Walkthrough</span>
        </button>

        {/* Setup Wizard */}
        <button
          onClick={openSetupWizard}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded hover:bg-slate-200 transition-colors whitespace-nowrap"
        >
          <Sliders className="w-3.5 h-3.5 text-slate-600" />
          <span>Setup Wizard</span>
        </button>
      </div>
    </header>
  );
};
