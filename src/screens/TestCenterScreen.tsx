import React, { useState } from 'react';
import { useAegisStore } from '../store/useAegisStore';
import { runAllTests, runTest, TestResult } from '../engine/testScenarios';
import {
  TestTube2,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Download,
  Check,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Film,
  Sparkles,
} from 'lucide-react';

interface ManualCheckItem {
  id: string;
  name: string;
  setup: string;
  action: string;
  expected: string;
  status: 'pending' | 'pass' | 'fail';
  notes: string;
}

const INITIAL_MANUAL_TESTS: ManualCheckItem[] = [
  {
    id: 'M-01',
    name: 'Preflight Box Closure Invariant',
    setup: 'Box opened with red and yellow visible.',
    action: 'Press Start Experiment.',
    expected: 'Preflight blocks start with fix hint: "Close the box so the red and yellow objects are hidden".',
    status: 'pending',
    notes: '',
  },
  {
    id: 'M-02',
    name: 'Correct Sequence Nominal Run',
    setup: 'Box closed, target empty.',
    action: 'Perform: OPEN_BOX -> PICK_RED -> PLACE_RED -> PICK_YELLOW -> PLACE_YELLOW.',
    expected: 'All 5 steps tick in sequence with speech prompts. Zero error alerts.',
    status: 'pending',
    notes: '',
  },
  {
    id: 'M-03',
    name: 'Out-of-Sequence Pick Detection',
    setup: 'Box opened, red and yellow visible.',
    action: 'Pick the yellow object first.',
    expected: 'OUT_OF_SEQUENCE alert raised. Voice: "Out-of-sequence action. Please pick the red object first."',
    status: 'pending',
    notes: '',
  },
  {
    id: 'M-04',
    name: 'Skipped Step (Direct Slide/Flick)',
    setup: 'Box opened, red inside box.',
    action: 'Slide red object into target zone in < 0.4s without lifting it.',
    expected: 'SKIPPED_STEP alert raised. Voice: "Skipped step detected. The red object was not picked."',
    status: 'pending',
    notes: '',
  },
  {
    id: 'M-05',
    name: 'Self-Healing Error Recovery',
    setup: 'M-03 or M-04 alert active.',
    action: 'Return displaced object back to nominal position inside box.',
    expected: 'Alert clears automatically after 5 frames. Voice: "Action verified. Resuming."',
    status: 'pending',
    notes: '',
  },
  {
    id: 'M-06',
    name: 'Microgravity Drift & Object Loss',
    setup: 'Object picked (HELD).',
    action: 'Cover or remove the held object for > 1.0s away from hand.',
    expected: 'FSM pauses. Purple LOST alert. Voice: "Object lost. Pausing the experiment."',
    status: 'pending',
    notes: '',
  },
  {
    id: 'M-07',
    name: 'Ambient Illumination Robustness',
    setup: 'Chamber light dimmed or brightened.',
    action: 'Execute nominal run M-02 under variable light.',
    expected: 'HSV color segmentation maintains visible tracking without dropouts.',
    status: 'pending',
    notes: '',
  },
  {
    id: 'M-08',
    name: 'Transient Hand Occlusion Invariant',
    setup: 'Object picked.',
    action: 'Briefly cover object with hand for < 500ms.',
    expected: 'Hand occlusion grace window absorbs dropout without triggering LOST.',
    status: 'pending',
    notes: '',
  },
];

export const TestCenterScreen: React.FC = () => {
  const { setActiveScreen } = useAegisStore();

  const [activeTab, setActiveTab] = useState<'automated' | 'manual'>('automated');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const [manualChecks, setManualChecks] = useState<ManualCheckItem[]>(INITIAL_MANUAL_TESTS);

  const handleRunAll = async () => {
    setIsRunningAll(true);
    const results = await runAllTests();
    setTestResults(results);
    setIsRunningAll(false);
  };

  const handleRunSingle = async (id: string) => {
    setRunningTestId(id);
    const res = await runTest(id);
    setTestResults((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = res;
        return copy;
      }
      return [...prev, res];
    });
    setRunningTestId(null);
  };

  const handleReplayInLiveMonitor = (scenarioId: string) => {
    useAegisStore.setState({
      activeScenarioId: scenarioId,
      sourceMode: 'replay',
      activeScreen: 'live',
    });
  };

  const handleExportTestReport = () => {
    const report = {
      title: 'AEGIS Automated Flight Verification & Test Report',
      generatedAt: new Date().toISOString(),
      automatedTests: testResults,
      physicalChecklist: manualChecks,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_verification_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateManualStatus = (id: string, status: 'pass' | 'fail') => {
    setManualChecks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
  };

  const updateManualNotes = (id: string, notes: string) => {
    setManualChecks((prev) =>
      prev.map((item) => (item.id === id ? { ...item, notes } : item))
    );
  };

  const passedAutomatedCount = testResults.filter((r) => r.passed).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
            Verification Test Center &amp; Quality Audit
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Headless verification harness running all 16 deterministic invariant test scenarios + physical manual checklist.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRunAll}
            disabled={isRunningAll}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-mono font-semibold transition-colors shadow-xs cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isRunningAll ? 'Executing Scenarios...' : 'Run All 16 Tests'}</span>
          </button>

          <button
            onClick={handleExportTestReport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-mono transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Report (JSON)</span>
          </button>
        </div>
      </div>

      {/* Segmented Tab Switcher */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-white border border-slate-200 w-fit font-mono text-xs shadow-2xs">
        <button
          onClick={() => setActiveTab('automated')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
            activeTab === 'automated'
              ? 'bg-cyan-50 text-cyan-900 font-bold border border-cyan-300 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <TestTube2 className="w-3.5 h-3.5" />
          <span>Automated Scenarios (TC-01..TC-16)</span>
          {testResults.length > 0 && (
            <span className="ml-1 text-[11px] text-emerald-700 font-bold">
              [{passedAutomatedCount}/{testResults.length}]
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
            activeTab === 'manual'
              ? 'bg-cyan-50 text-cyan-900 font-bold border border-cyan-300 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ListChecks className="w-3.5 h-3.5" />
          <span>Live Physical Test Checklist (M-01..M-08)</span>
        </button>
      </div>

      {/* Tab 1: Automated Scenarios */}
      {activeTab === 'automated' && (
        <div className="space-y-3">
          {testResults.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-slate-500 border border-dashed border-slate-300 rounded-xl bg-white shadow-2xs">
              Press &ldquo;Run All 16 Tests&rdquo; above to verify all deterministic scenarios headless in real-time.
            </div>
          ) : (
            <div className="space-y-2.5">
              {testResults.map((result) => {
                const isExpanded = expandedTestId === result.id;
                return (
                  <div
                    key={result.id}
                    className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 font-mono text-xs transition-colors hover:border-slate-300 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div
                        onClick={() => setExpandedTestId(isExpanded ? null : result.id)}
                        className="flex items-center gap-2.5 cursor-pointer select-none"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                        <span className="font-bold text-slate-900">{result.id}</span>
                        <span className="text-slate-800 font-semibold">{result.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            result.passed
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {result.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-[11px]">{result.executionTimeMs} ms</span>
                        <button
                          onClick={() => handleRunSingle(result.id)}
                          disabled={runningTestId === result.id}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 transition-colors shadow-2xs cursor-pointer"
                        >
                          {runningTestId === result.id ? 'Running...' : 'Re-run'}
                        </button>
                        <button
                          onClick={() => handleReplayInLiveMonitor(result.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-50 border border-cyan-300 text-cyan-800 hover:bg-cyan-100 transition-colors shadow-2xs cursor-pointer"
                        >
                          <Film className="w-3 h-3 text-cyan-600" />
                          <span>Replay in Monitor</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-600 pl-6 font-sans">
                      {result.description}
                    </p>

                    {/* Assertion Breakdown & Details */}
                    {isExpanded && (
                      <div className="pl-6 pt-2 border-t border-slate-100 space-y-3">
                        <div className="space-y-1.5">
                          <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold block">
                            Assertion List:
                          </span>
                          {result.assertions.map((a, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              {a.passed ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              )}
                              <span className={a.passed ? 'text-slate-800' : 'text-rose-700 font-semibold'}>
                                {a.name}
                              </span>
                              {a.detail && (
                                <span className="text-slate-500 text-[10px]">({a.detail})</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Produced Log Lines */}
                        {result.logs.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold block">
                              Produced Log Packets:
                            </span>
                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-800 space-y-1 overflow-x-auto shadow-inner">
                              {result.logs.map((l, i) => (
                                <div key={i}>
                                  [{l.timestamp}] Step {l.step} · Action: {l.action} · Expected: {l.expected} · Status: {l.status} · Conf: {l.confidence}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Spoken Lines Array */}
                        {result.spokenLines.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-slate-500 text-[10px] uppercase tracking-wider font-bold block">
                              Synthesizer Spoken Transcript:
                            </span>
                            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-700 space-y-0.5 shadow-inner">
                              {result.spokenLines.map((line, i) => (
                                <div key={i}>&ldquo;{line}&rdquo;</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Live Physical Test Checklist (M-01..M-08) */}
      {activeTab === 'manual' && (
        <div className="space-y-3 font-mono text-xs">
          <p className="text-slate-600 text-xs font-sans">
            Standard operating procedure checklist for astronaut payload rack acceptance trials. Marks and notes are preserved in the exported JSON report.
          </p>

          <div className="space-y-3">
            {manualChecks.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 shadow-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-cyan-700">{item.id}</span>
                    <span className="font-bold text-slate-900">{item.name}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${
                        item.status === 'pass'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : item.status === 'fail'
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateManualStatus(item.id, 'pass')}
                      className={`px-3 py-1 rounded-lg transition-colors font-semibold shadow-2xs cursor-pointer ${
                        item.status === 'pass'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      Pass
                    </button>
                    <button
                      onClick={() => updateManualStatus(item.id, 'fail')}
                      className={`px-3 py-1 rounded-lg transition-colors font-semibold shadow-2xs cursor-pointer ${
                        item.status === 'fail'
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      Fail
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-sans text-slate-700">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 font-mono block text-[10px] font-semibold">PHYSICAL SETUP:</span>
                    <span>{item.setup}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 font-mono block text-[10px] font-semibold">OPERATOR ACTION:</span>
                    <span>{item.action}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-cyan-50/60 border border-cyan-200">
                    <span className="text-cyan-800 font-mono block text-[10px] font-semibold">EXPECTED RESPONSE:</span>
                    <span className="text-cyan-900 font-medium">{item.expected}</span>
                  </div>
                </div>

                <div>
                  <input
                    type="text"
                    value={item.notes}
                    onChange={(e) => updateManualNotes(item.id, e.target.value)}
                    placeholder="Add test observations, lighting notes, or anomaly details..."
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-900 text-xs focus:outline-none focus:border-cyan-500 font-sans shadow-inner"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
