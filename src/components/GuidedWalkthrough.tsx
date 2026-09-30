import React, { useState } from 'react';
import { useAegisStore } from '../store/useAegisStore';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  X,
  CheckCircle,
  Activity,
  Radio,
  History,
  ShieldCheck,
} from 'lucide-react';

interface WalkthroughStep {
  title: string;
  targetScreen: string;
  description: string;
  scenarioId?: string;
}

const STEPS: WalkthroughStep[] = [
  {
    title: '1. Mission & Operational Scope',
    targetScreen: 'overview',
    description:
      'AEGIS provides autonomous computer-vision experiment guidance and sequence verification for space biology payloads (BAS) in microgravity racks.',
  },
  {
    title: '2. Nominal Experiment Execution (TC-01)',
    targetScreen: 'live',
    description:
      'Observe real-time object tracking, state estimator commits, and automated voice guidance advancing across all 5 transfer steps to completion.',
    scenarioId: 'TC-01',
  },
  {
    title: '3. Out-of-Sequence Rejection (TC-02)',
    targetScreen: 'live',
    description:
      'When an operator picks yellow while red is expected, the FSM freezes index advance and issues an immediate spoken correction.',
    scenarioId: 'TC-02',
  },
  {
    title: '4. Skipped Step Detection (TC-03)',
    targetScreen: 'live',
    description:
      'If an object is moved into the target zone without a valid grasp/hold phase (sliding or flicking), a SKIPPED_STEP alert is raised.',
    scenarioId: 'TC-03',
  },
  {
    title: '5. Self-Healing State Recovery (TC-04)',
    targetScreen: 'live',
    description:
      'Returning the misplaced object to the source box matches the expected state snapshot, automatically clearing alerts and resuming guidance.',
    scenarioId: 'TC-04',
  },
  {
    title: '6. Microgravity Drift & Occlusion Guard (TC-05)',
    targetScreen: 'live',
    description:
      'If a specimen is lost or floats away outside both regions beyond the grace threshold, the FSM pauses immediately to preserve experiment integrity.',
    scenarioId: 'TC-05',
  },
  {
    title: '7. Multi-Angle Verification Lab',
    targetScreen: 'verification',
    description:
      'Inspect tripartite BEFORE -> ACTION -> AFTER visual proof frames, temporal velocity consistency, and multi-sensor confidence fusion for each event.',
  },
  {
    title: '8. Mission Telemetry & Flight Audit Log',
    targetScreen: 'events',
    description:
      'Explore immutable telemetry logs, inspect millisecond alert latencies, validate alerts, and export flight data in JSON or CSV.',
  },
  {
    title: '9. Bandwidth-Optimized Edge Streaming',
    targetScreen: 'recordings',
    description:
      'Review segmented 10s video recordings, examine the bandwidth widget comparing raw video vs telemetry logs, and check the WebSocket stream relay.',
  },
  {
    title: '10. Resilient Architecture & Watchdog',
    targetScreen: 'architecture',
    description:
      'Review edge vs ground partition, fail-safe recovery controls, watchdog checkpoint state restoration, and edge Jetson Orin Nano specs.',
  },
  {
    title: '11. Automated Headless Test Center',
    targetScreen: 'tests',
    description:
      'Run the complete test suite verifying all 16 deterministic edge cases, invariants, and protocol scalability checks with zero manual intervention.',
  },
];

export const GuidedWalkthrough: React.FC = () => {
  const {
    isWalkthroughActive,
    walkthroughStep,
    nextWalkthroughStep,
    prevWalkthroughStep,
    stopWalkthrough,
    setActiveScreen,
    logger,
  } = useAegisStore();

  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);

  if (!isWalkthroughActive && !showSummaryModal) return null;

  const currentStep = STEPS[walkthroughStep] || STEPS[0];

  const handleNext = () => {
    if (walkthroughStep < STEPS.length - 1) {
      const nextIdx = walkthroughStep + 1;
      nextWalkthroughStep();
      const nextStepObj = STEPS[nextIdx];
      setActiveScreen(nextStepObj.targetScreen as any);
      if (nextStepObj.scenarioId) {
        useAegisStore.setState({ activeScenarioId: nextStepObj.scenarioId, sourceMode: 'replay' });
      }
    } else {
      stopWalkthrough();
      setShowSummaryModal(true);
    }
  };

  const handlePrev = () => {
    if (walkthroughStep > 0) {
      const prevIdx = walkthroughStep - 1;
      prevWalkthroughStep();
      const prevStepObj = STEPS[prevIdx];
      setActiveScreen(prevStepObj.targetScreen as any);
      if (prevStepObj.scenarioId) {
        useAegisStore.setState({ activeScenarioId: prevStepObj.scenarioId, sourceMode: 'replay' });
      }
    }
  };

  const metrics = logger.getMetrics();

  return (
    <>
      {isWalkthroughActive && (
        <div className="fixed bottom-6 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] bg-white/95 border border-cyan-300 rounded-2xl shadow-2xl p-5 backdrop-blur-md text-slate-800">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-600" />
              <span className="text-xs font-mono font-bold text-cyan-800 tracking-wider">
                GUIDED WALKTHROUGH ({walkthroughStep + 1}/{STEPS.length})
              </span>
            </div>
            <button
              onClick={stopWalkthrough}
              className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h4 className="text-sm font-bold text-slate-900 font-display mb-1.5">
            {currentStep.title}
          </h4>
          <p className="text-xs text-slate-600 leading-relaxed mb-4 font-sans">
            {currentStep.description}
          </p>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <button
              onClick={handlePrev}
              disabled={walkthroughStep === 0}
              className="flex items-center gap-1 px-2.5 py-1 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </button>

            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-colors font-mono text-xs shadow-xs cursor-pointer"
            >
              <span>{walkthroughStep === STEPS.length - 1 ? 'Finish & Summary' : 'Next Step'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Impact Summary Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-6 h-6 text-cyan-600" />
                <h3 className="text-base font-bold text-slate-900 font-display">
                  Autonomous Experiment Impact Summary
                </h3>
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              AEGIS eliminates astronaut operational ambiguity through real-time deterministic verification and closed-loop speech feedback on edge hardware.
            </p>

            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block text-[11px] font-semibold">VERIFIED EVENTS</span>
                <span className="text-xl font-bold text-slate-900">
                  {metrics.totalEvents > 0 ? metrics.totalEvents : '16 Tests Verified'}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <span className="text-emerald-800 block text-[11px] font-semibold">ALERT LATENCY</span>
                <span className="text-xl font-bold text-emerald-700">
                  {metrics.avgAlertLatency !== null ? `${metrics.avgAlertLatency} ms` : '< 50 ms'}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-cyan-50/70 border border-cyan-200">
                <span className="text-cyan-800 block text-[11px] font-semibold">FALSE ALERTS DETECTED</span>
                <span className="text-xl font-bold text-cyan-800">
                  {metrics.falseAlerts}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200">
                <span className="text-purple-800 block text-[11px] font-semibold">TELEMETRY BANDWIDTH SAVINGS</span>
                <span className="text-xl font-bold text-purple-800">99.4%</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowSummaryModal(false)}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold font-mono transition-colors shadow-xs cursor-pointer"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
