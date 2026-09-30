import React, { useState, useRef, useEffect } from 'react';
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
  ChevronDown,
} from 'lucide-react';

interface NavItem {
  id: ScreenId;
  label: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
}

// 3 Main Nav Items permanently visible on navbar
const MAIN_NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'live', label: 'Live Monitor', icon: Radio },
  { id: 'verification', label: 'Verification Lab', icon: CheckCircle2 },
];

// Additional screens housed in the "More Options" dropdown
const MORE_NAV_ITEMS: NavItem[] = [
  { id: 'protocol', label: 'Protocol', description: 'Deterministic step sequences & timings', icon: FileCode2 },
  { id: 'events', label: 'Event Log', description: 'Verification telemetry & timestamp audits', icon: History },
  { id: 'recordings', label: 'Recordings & Stream', description: 'Video feeds & visual evidence archive', icon: Video },
  { id: 'model', label: 'Model & Dataset', description: 'Color calibration & detector thresholds', icon: Database },
  { id: 'architecture', label: 'Architecture', description: 'Edge pipeline & FSM state diagram', icon: Layers },
  { id: 'tests', label: 'Test Center', description: 'Automated test suites & fault injection', icon: TestTube2 },
];

export const Navigation: React.FC = () => {
  const { activeScreen, setActiveScreen, startWalkthrough, openSetupWizard } = useAegisStore();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isMoreActive = MORE_NAV_ITEMS.some((item) => item.id === activeScreen);
  const activeMoreItem = MORE_NAV_ITEMS.find((item) => item.id === activeScreen);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white/95 border-b border-slate-200 backdrop-blur-md shadow-xs">
      {/* Zone 1: Single Wordmark Brand (Clean, no SIH badge) */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => setActiveScreen('overview')}
          className="flex items-center gap-2.5 text-left focus:outline-none group cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white font-mono font-bold text-sm tracking-wider shadow-xs group-hover:bg-cyan-500 transition-colors">
            AE
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display">
            AEGIS
          </span>
        </button>
      </div>

      {/* Zone 2: Navigation Links - 3 Main Ones + More Options Dropdown */}
      <nav className="flex items-center gap-1.5 sm:gap-2">
        {/* 3 Main Items */}
        {MAIN_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveScreen(item.id);
                setIsMoreOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-cyan-50 text-cyan-900 border border-cyan-300 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-600' : 'text-slate-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}

        {/* More Options Dropdown Menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsMoreOpen((prev) => !prev)}
            aria-expanded={isMoreOpen}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer border ${
              isMoreActive
                ? 'bg-cyan-50 text-cyan-900 border-cyan-300 font-semibold shadow-2xs'
                : isMoreOpen
                ? 'bg-slate-100 text-slate-900 border-slate-300'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-transparent'
            }`}
          >
            <span>{isMoreActive && activeMoreItem ? `More: ${activeMoreItem.label}` : 'More Options'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${
                isMoreOpen ? 'rotate-180 text-cyan-700' : ''
              }`}
            />
          </button>

          {/* Dropdown Popover */}
          {isMoreOpen && (
            <div className="absolute right-0 sm:left-0 sm:right-auto mt-2 w-64 rounded-xl bg-white border border-slate-200 shadow-xl p-1.5 z-50 animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-100 mb-1">
                Additional Modules
              </div>
              <div className="space-y-0.5">
                {MORE_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveScreen(item.id);
                        setIsMoreOpen(false);
                      }}
                      className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-cyan-50 text-cyan-900 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <div className={`p-1 rounded-md mt-0.5 ${isActive ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium flex items-center justify-between">
                          <span>{item.label}</span>
                          {isActive && (
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-600" />
                          )}
                        </div>
                        {item.description && (
                          <div className="text-[11px] text-slate-500 font-normal truncate mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Zone 3: Primary Actions (Walkthrough & Setup Wizard) */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Guided Walkthrough button */}
        <button
          onClick={startWalkthrough}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-900 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-600" />
          <span className="hidden sm:inline">Guided Walkthrough</span>
          <span className="sm:hidden">Tour</span>
        </button>

        {/* Setup Wizard */}
        <button
          onClick={openSetupWizard}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5 text-slate-600" />
          <span className="hidden sm:inline">Setup Wizard</span>
          <span className="sm:hidden">Setup</span>
        </button>
      </div>
    </header>
  );
};
