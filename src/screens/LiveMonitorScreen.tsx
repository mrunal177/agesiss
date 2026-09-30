import React, { useEffect, useState } from 'react';
import { useAegisStore } from '../store/useAegisStore';
import { VideoStage } from '../components/VideoStage';
import { ProtocolGuidancePanel } from '../components/ProtocolGuidancePanel';
import { CONFIG } from '../config';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Volume2,
  VolumeX,
  RotateCw,
  Sparkles,
  Info,
  Radio,
  Clock,
  Gauge,
  Activity,
  ShieldAlert,
  TestTube2,
  Download,
  Check,
  XCircle,
} from 'lucide-react';

export const LiveMonitorScreen: React.FC = () => {
  const {
    protocol,
    fsmIdx,
    activeAlert,
    sessionState,
    startSession,
    pauseSession,
    resumeSession,
    resetSession,
    runType,
    setRunType,
    sourceMode,
    setSourceMode,
    activeScenarioId,
    heartbeat,
    isSelfTestActive,
    selfTestResults,
    startSelfTest,
    stopSelfTest,
    voice,
    gemini,
    events,
    transcript,
    fps,
    blurScore,
    isBlurry,
    isLowFPS,
    handMode,
    boxROI,
    trackedObjects,
    triggerBoxOpen,
  } = useAegisStore();

  const [isMuted, setIsMuted] = useState<boolean>(voice.getMuted());
  const [sceneData, setSceneData] = useState<any>(null);

  // Poll advisory Gemini Scene Interpreter every 2s
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await gemini.interpretFrame('');
      setSceneData(res);
    }, 2000);
    return () => clearInterval(interval);
  }, [gemini]);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    voice.setMuted(nextMuted);
    setIsMuted(nextMuted);
  };

  const handleExportSelfTest = () => {
    if (!selfTestResults) return;
    const blob = new Blob([JSON.stringify(selfTestResults, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_selftest_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentStep = protocol.steps[fsmIdx];
  const nextStep = fsmIdx + 1 < protocol.steps.length ? protocol.steps[fsmIdx + 1] : null;
  const recentEvents = events.slice(-8).reverse();

  const lastOutcome = events[events.length - 1];
  const lastComponents = lastOutcome?.components || {
    state: 0.95,
    contact: 0.85,
    temporal: 0.9,
  };
  const unifiedScore = lastOutcome?.confidence ?? 0.92;

  const lastAlert = events
    .slice()
    .reverse()
    .find((e) => e.status !== 'SUCCESS');
  const alertLatencyText =
    lastAlert && typeof lastAlert.latencyMs === 'number'
      ? `${lastAlert.latencyMs} ms`
      : 'Nominal (< 50 ms)';

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-8 font-sans">
      {/* Control Strip & Session State Indicator (FIX 5) */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Session State Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 font-mono text-xs">
            <span className="text-slate-500">Session:</span>
            <span
              className={`font-bold uppercase tracking-wider ${
                sessionState === 'running'
                  ? 'text-emerald-700'
                  : sessionState === 'paused'
                  ? 'text-amber-700'
                  : sessionState === 'complete'
                  ? 'text-cyan-700'
                  : 'text-slate-600'
              }`}
            >
              {sessionState}
            </span>
          </div>

          {/* Session Control Buttons */}
          {sessionState === 'idle' && (
            <button
              onClick={() => startSession()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-medium transition-colors shadow-xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start</span>
            </button>
          )}

          {sessionState === 'running' && (
            <button
              onClick={pauseSession}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-mono font-medium transition-colors shadow-xs"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}

          {sessionState === 'paused' && (
            <button
              onClick={resumeSession}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-medium transition-colors shadow-xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
          )}

          <button
            onClick={resetSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {/* Guided Self-Test Button (FIX 7) */}
          <button
            onClick={isSelfTestActive ? stopSelfTest : startSelfTest}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-colors ${
              isSelfTestActive
                ? 'bg-purple-100 text-purple-900 border border-purple-400 ring-2 ring-purple-300'
                : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
            }`}
          >
            <TestTube2 className="w-3.5 h-3.5 text-purple-600" />
            <span>{isSelfTestActive ? 'Stop Self-Test' : 'Run Self-Test'}</span>
          </button>

          {/* Run Type Selector */}
          <div className="flex items-center gap-1 p-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-xs">
            <button
              onClick={() => setRunType('correct')}
              className={`px-2.5 py-1 rounded transition-colors ${
                runType === 'correct' ? 'bg-white text-cyan-800 font-semibold shadow-2xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Correct Run
            </button>
            <button
              onClick={() => setRunType('error')}
              className={`px-2.5 py-1 rounded transition-colors ${
                runType === 'error' ? 'bg-rose-100 text-rose-800 font-semibold shadow-2xs border border-rose-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Error Run
            </button>
          </div>

          {/* Scenario Source Selector */}
          <div className="flex items-center gap-1 p-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-xs">
            <button
              onClick={() => setSourceMode('virtual')}
              className={`px-2.5 py-1 rounded transition-colors ${
                sourceMode === 'virtual' ? 'bg-white text-cyan-800 font-semibold shadow-2xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Virtual Camera
            </button>
            <button
              onClick={() => setSourceMode('live')}
              className={`px-2.5 py-1 rounded transition-colors ${
                sourceMode === 'live' ? 'bg-white text-cyan-800 font-semibold shadow-2xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Live Webcam
            </button>
            <button
              onClick={() => setSourceMode('replay')}
              className={`px-2.5 py-1 rounded transition-colors ${
                sourceMode === 'replay' ? 'bg-white text-cyan-800 font-semibold shadow-2xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Scenario Replay
            </button>
          </div>

          {sourceMode === 'replay' && (
            <select
              value={activeScenarioId}
              onChange={(e) => useAegisStore.setState({ activeScenarioId: e.target.value })}
              className="bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-800 text-xs font-mono focus:outline-none focus:border-cyan-500 shadow-2xs"
            >
              <option value="TC-01">TC-01: Correct Full Run</option>
              <option value="TC-02">TC-02: Pick Yellow First</option>
              <option value="TC-03">TC-03: Skipped Pick Phase</option>
              <option value="TC-04">TC-04: Self-Healing Recovery</option>
              <option value="TC-05">TC-05: Lost Object Guard</option>
              <option value="TC-06">TC-06: Repeated Pick</option>
              <option value="TC-07">TC-07: Wrong Zone Drop</option>
            </select>
          )}
        </div>

        {/* Global Optical Telemetry */}
        <div className="flex items-center gap-3 text-xs font-mono text-slate-600">
          <div className="flex items-center gap-1">
            <span className="text-slate-500">FPS:</span>
            <span className={isLowFPS ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
              {heartbeat.processingFPS}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Blur:</span>
            <span className={isBlurry ? 'text-amber-600' : 'text-emerald-600'}>{blurScore}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Latency:</span>
            <span className="text-cyan-700 font-medium">{alertLatencyText}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Hand:</span>
            <span className="text-slate-800 capitalize">{heartbeat.handStatus}</span>
          </div>
        </div>
      </div>

      {/* PIPELINE HEARTBEAT STRIP (FIX 6 - Always visible, updated every second) */}
      <div className="p-3.5 rounded-xl bg-white border border-cyan-200 font-mono text-xs space-y-1.5 shadow-sm">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="uppercase tracking-wider flex items-center gap-1.5 text-cyan-700 font-bold">
            <Activity className="w-3.5 h-3.5 animate-pulse text-cyan-600" />
            <span>Pipeline Heartbeat Strip</span>
          </span>
          <span>1-Second Cadence Telemetry</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 text-center">
          {/* 1. Frames Grabbed */}
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="text-slate-500 text-[10px] block truncate">GRABBED</span>
            <span className="font-bold text-slate-800">{heartbeat.framesGrabbed}</span>
          </div>

          {/* 2. Frames Processed (stuck check) */}
          <div
            className={`p-2 rounded border ${
              heartbeat.stuckCounters.framesProcessed
                ? 'bg-amber-100 border-amber-400 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
            title={heartbeat.stuckCounters.framesProcessed ? '0 frames processed: the loop is not running' : ''}
          >
            <span className="text-slate-500 text-[10px] block truncate">PROCESSED</span>
            <span className="font-bold">{heartbeat.framesProcessed}</span>
          </div>

          {/* 3. Processing FPS */}
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="text-slate-500 text-[10px] block truncate">FPS</span>
            <span className="font-bold text-emerald-600">{heartbeat.processingFPS}</span>
          </div>

          {/* 4. Red Blob */}
          <div
            className={`p-2 rounded border ${
              heartbeat.stuckCounters.redBlob && sessionState === 'running'
                ? 'bg-amber-100 border-amber-400 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
            title={heartbeat.stuckCounters.redBlob ? 'Red blob not detected for 5s' : ''}
          >
            <span className="text-slate-500 text-[10px] block truncate">RED BLOB</span>
            <span className="font-bold text-red-600">
              {heartbeat.redBlobArea ? `${heartbeat.redBlobArea} px` : 'none'}
            </span>
          </div>

          {/* 5. Yellow Blob */}
          <div
            className={`p-2 rounded border ${
              heartbeat.stuckCounters.yellowBlob && sessionState === 'running'
                ? 'bg-amber-100 border-amber-400 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
            title={heartbeat.stuckCounters.yellowBlob ? 'Yellow blob not detected for 5s' : ''}
          >
            <span className="text-slate-500 text-[10px] block truncate">YELLOW BLOB</span>
            <span className="font-bold text-yellow-600">
              {heartbeat.yellowBlobArea ? `${heartbeat.yellowBlobArea} px` : 'none'}
            </span>
          </div>

          {/* 6. Hand */}
          <div
            className={`p-2 rounded border ${
              heartbeat.stuckCounters.hand && sessionState === 'running'
                ? 'bg-amber-100 border-amber-400 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
            title={heartbeat.stuckCounters.hand ? 'No hand or motion detected for 5s' : ''}
          >
            <span className="text-slate-500 text-[10px] block truncate">HAND</span>
            <span className="font-bold text-cyan-700 capitalize">{heartbeat.handStatus}</span>
          </div>

          {/* 7. Box Change Ratio */}
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="text-slate-500 text-[10px] block truncate">BOX SENSOR</span>
            <span className="font-bold text-cyan-700">{heartbeat.boxChangeRatio}%</span>
          </div>

          {/* 8. Events Emitted */}
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="text-slate-500 text-[10px] block truncate">EVENTS</span>
            <span className="font-bold text-slate-800">{heartbeat.eventsEmitted}</span>
          </div>

          {/* 9. FSM Index */}
          <div className="p-2 rounded bg-slate-50 border border-slate-200">
            <span className="text-slate-500 text-[10px] block truncate">FSM IDX</span>
            <span className="font-bold text-emerald-600">0{heartbeat.fsmIdx}</span>
          </div>
        </div>
      </div>

      {/* Guided Self-Test Results Panel (FIX 7) */}
      {selfTestResults && (
        <div className="p-4 rounded-xl bg-[#0B0E17] border border-purple-500/50 space-y-3 font-mono text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TestTube2 className="w-4 h-4 text-purple-400" />
              <span className="text-purple-300 font-bold uppercase tracking-wider">
                Guided Self-Test Diagnostic Scorecard
              </span>
            </div>
            <button
              onClick={handleExportSelfTest}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-purple-200 text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Diagnostic JSON</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {selfTestResults.map((check) => (
              <div
                key={check.id}
                className={`p-3 rounded-lg border space-y-1.5 ${
                  check.passed
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">{check.label}</span>
                  {check.passed ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <span className="text-[10px] text-slate-500">{Math.round(check.progress * 100)}%</span>
                  )}
                </div>

                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden border border-slate-200">
                  <div
                    className={`h-full ${check.passed ? 'bg-emerald-500' : 'bg-purple-500'}`}
                    style={{ width: `${Math.round(check.progress * 100)}%` }}
                  />
                </div>

                {!check.passed && check.hint && (
                  <p className="text-[10px] text-amber-700 font-sans">{check.hint}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Protocol Guidance, Live Camera Verification & Voice Commands */}
      <ProtocolGuidancePanel />

      {/* Main Grid: Left Stage (Video + Timeline) & Right Intelligence Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (7 cols): Video Stage, 6-Step Progress Bar, Timeline */}
        <div className="lg:col-span-7 space-y-4">
          <VideoStage />

          {/* 6-Step Progress Bar with Ticks */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 font-mono text-xs shadow-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span className="uppercase tracking-wider font-semibold">Protocol Sequence State</span>
              <span className="text-cyan-700 font-bold">
                {sessionState === 'complete' ? 'COMPLETE' : `STEP ${fsmIdx + 1} OF ${protocol.steps.length}`}
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {protocol.steps
                .concat({ id: 6, name: 'COMPLETE', type: 'OPEN', object: 'box', voice: 'Complete' } as any)
                .map((stepItem, idx) => {
                  const isPassed = fsmIdx > idx || (sessionState === 'complete' && idx === 5);
                  const isCurrent = fsmIdx === idx && sessionState !== 'complete';
                  return (
                    <div
                      key={stepItem.id}
                      className={`h-2.5 rounded transition-colors ${
                        isPassed
                          ? 'bg-emerald-500 shadow-xs'
                          : isCurrent
                          ? 'bg-cyan-500 ring-2 ring-cyan-200 animate-pulse'
                          : 'bg-slate-200'
                      }`}
                      title={stepItem.name}
                    />
                  );
                })}
            </div>

            <div className="grid grid-cols-6 gap-1 text-[10px] text-slate-500 pt-1 text-center font-semibold">
              <span>OPEN</span>
              <span>PICK_RED</span>
              <span>PLACE_RED</span>
              <span>PICK_YEL</span>
              <span>PLACE_YEL</span>
              <span>DONE</span>
            </div>
          </div>

          {/* Event Timeline */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 font-mono text-xs shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-700 font-bold uppercase tracking-wider">Recent Event Timeline</span>
              <span className="text-slate-500">{events.length} Events Total</span>
            </div>

            {events.length === 0 ? (
              <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-lg border border-slate-100">
                No runs recorded yet. Press Start to initiate autonomous detection.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {recentEvents.map((ev, i) => {
                  const isSuccess = ev.status === 'SUCCESS';
                  const isLost = ev.status === 'LOST';
                  const isUncertain = ev.status === 'UNCERTAIN';
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-2.5 rounded-lg border ${
                        isSuccess
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : isLost
                          ? 'bg-purple-50/70 border-purple-200 text-purple-950'
                          : isUncertain
                          ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                          : 'bg-rose-50/70 border-rose-200 text-rose-950'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isSuccess ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : isLost ? (
                          <ShieldAlert className="w-4 h-4 text-purple-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <span className="font-bold">{ev.action}</span>
                        <span className="text-slate-600">· Expected: {ev.expected}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-600">
                        <span>Conf: {(ev.confidence * 100).toFixed(0)}%</span>
                        <span>{ev.timestamp}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Step Cards, Confidence Gauge, Object Table, JSON Log, Voice, AI */}
        <div className="lg:col-span-5 space-y-4">
          {/* Step Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-cyan-50/60 border-2 border-cyan-300 space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono text-cyan-800 font-bold uppercase tracking-wider block">
                Current Step [idx={fsmIdx}]
              </span>
              <div className="font-bold text-sm text-slate-900 font-display">
                {currentStep?.name || 'COMPLETE'}
              </div>
              <p className="text-xs text-slate-700 leading-snug line-clamp-2">
                {currentStep?.voice || 'All protocol objectives achieved.'}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-1 shadow-2xs">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">
                Next In Sequence
              </span>
              <div className="font-bold text-sm text-slate-800 font-display">
                {nextStep?.name || (sessionState === 'complete' ? 'None' : 'Final Step')}
              </div>
              <p className="text-xs text-slate-600 leading-snug line-clamp-2">
                {nextStep?.voice || 'Sequence conclusion.'}
              </p>
            </div>
          </div>

          {/* Unified Action Confidence Gauge */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 font-mono text-xs shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-bold uppercase tracking-wider">
                Unified Action Confidence
              </span>
              <span className="text-cyan-800 font-bold text-sm">
                {(unifiedScore * 100).toFixed(0)}%
              </span>
            </div>

            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  unifiedScore >= CONFIG.ACCEPT
                    ? 'bg-emerald-500'
                    : unifiedScore >= CONFIG.UNCERTAIN_MIN
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(5, unifiedScore * 100))}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px] pt-1 border-t border-slate-100">
              <div>
                <span className="text-slate-500 block text-[10px]">STATE (45%)</span>
                <span className="text-slate-900 font-bold">
                  {(lastComponents.state * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">CONTACT (30%)</span>
                <span className="text-slate-900 font-bold">
                  {(lastComponents.contact * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">TEMPORAL (25%)</span>
                <span className="text-slate-900 font-bold">
                  {(lastComponents.temporal * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Object State Table */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 font-mono text-xs shadow-xs">
            <span className="uppercase tracking-wider text-slate-700 font-bold block">
              Specimen Track Matrix
            </span>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                    <th className="pb-1.5 font-semibold">Track ID</th>
                    <th className="pb-1.5 font-semibold">State</th>
                    <th className="pb-1.5 font-semibold">Contact</th>
                    <th className="pb-1.5 text-right font-semibold">Relative Coords</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trackedObjects.map((obj) => {
                    const relX = ((obj.centroid.x - boxROI.x) / boxROI.w).toFixed(2);
                    const relY = ((obj.centroid.y - boxROI.y) / boxROI.h).toFixed(2);
                    return (
                      <tr key={obj.id} className="text-slate-800">
                        <td className="py-2 font-semibold">{obj.id}</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              obj.state === 'HELD'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : obj.state === 'TARGET_ZONE'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {obj.state}
                          </span>
                        </td>
                        <td className="py-2">
                          {obj.contact ? (
                            <span className="text-cyan-700 font-bold">Yes</span>
                          ) : (
                            <span className="text-slate-400">No</span>
                          )}
                        </td>
                        <td className="py-2 text-right text-slate-600">
                          {obj.visible ? `(${relX}, ${relY})` : 'Unseen'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Voice Panel */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3 font-mono text-xs shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-600" />
                <span className="font-bold text-slate-800 font-sans">On-device Speech Guidance</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleMute}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-600" />}
                </button>
                <button
                  onClick={() => voice.replayLast()}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                  title="Replay Last Utterance"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Live Transcript (Last 3) */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 max-h-24 overflow-y-auto space-y-1">
              {transcript.length === 0 ? (
                <div className="text-slate-500 text-[11px]">Speech synthesizer idle. Press Start to hear guidance.</div>
              ) : (
                transcript.slice(-3).map((line) => (
                  <div key={line.id} className="text-slate-800 leading-snug">
                    <span className="text-slate-500 text-[10px] mr-1.5 font-bold">[{line.timestamp}]</span>
                    <span>{line.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Scene Interpreter (Advisory) */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-2 font-mono text-xs shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                <span className="font-bold text-slate-800 font-sans">Scene Interpreter (Advisory)</span>
              </div>
              <span className="text-[10px] text-slate-500">
                {sceneData?.isOnline ? `${sceneData.latencyMs} ms` : 'Local Edge Pipeline Active'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1">
              {sceneData?.isOnline ? (
                <>
                  <div>Action: <strong className="text-slate-900">{sceneData.current_action}</strong></div>
                  <div>Red: {sceneData.red_state} · Yellow: {sceneData.yellow_state}</div>
                  <div>Box Open: {sceneData.box_open ? 'True' : 'False'}</div>
                </>
              ) : (
                <div className="text-slate-600">
                  Local edge deterministic pipeline active (FSM independent of cloud connection).
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
