import React from 'react';
import { useAegisStore } from '../store/useAegisStore';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Volume2,
  Play,
  RotateCw,
  Box,
  Eye,
  Check,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  Radio,
  ArrowRight,
} from 'lucide-react';

export const ProtocolGuidancePanel: React.FC = () => {
  const {
    protocol,
    fsmIdx,
    sessionState,
    startSession,
    activeAlert,
    trackedObjects,
    heartbeat,
    voice,
    sourceMode,
    runner,
    executeVirtualStep,
    toggleVirtualBox,
    triggerBoxOpen,
  } = useAegisStore();

  const currentStep = protocol.steps[fsmIdx];
  const nextStep = fsmIdx + 1 < protocol.steps.length ? protocol.steps[fsmIdx + 1] : null;

  const redObj = trackedObjects.find((o) => o.label === 'red');
  const yellowObj = trackedObjects.find((o) => o.label === 'yellow');

  // Evaluate real-time webcam diagnostics & what the user is doing right or wrong
  let liveCoachingStatus: {
    status: 'correct' | 'warning' | 'hint' | 'success';
    headline: string;
    message: string;
    actionHint: string;
  };

  if (sessionState === 'idle') {
    liveCoachingStatus = {
      status: 'hint',
      headline: 'Experiment Ready — Standby',
      message: 'Press "Start Experiment" below to begin voice-guided protocol execution.',
      actionHint: 'Webcam will monitor your actions in real time and verify each protocol step.',
    };
  } else if (sessionState === 'complete' || fsmIdx >= protocol.steps.length) {
    liveCoachingStatus = {
      status: 'success',
      headline: 'All Tasks Completed Successfully!',
      message: 'Autonomous perception verified 100% protocol sequence fidelity.',
      actionHint: 'Telemetry synchronized to ground station.',
    };
  } else if (activeAlert) {
    liveCoachingStatus = {
      status: 'warning',
      headline: `Protocol Alert: ${activeAlert.status}`,
      message: activeAlert.message,
      actionHint: 'Follow the vocal instructions or correct your hand placement in the camera view.',
    };
  } else {
    // Step-by-step real-time webcam checking
    switch (fsmIdx) {
      case 0: {
        // Step 0: Open Box
        const isBoxOpen = runner.virtualCamera.boxOpen || heartbeat.boxChangeRatio >= 15;
        if (isBoxOpen) {
          liveCoachingStatus = {
            status: 'correct',
            headline: 'Box Opened — Verifying Action',
            message: 'Chamber opening signal confirmed by optical sensor. Preparing specimen tracking.',
            actionHint: 'Next Task: Pick up the red specimen from inside the chamber.',
          };
        } else if (redObj?.state === 'HELD' || yellowObj?.state === 'HELD') {
          liveCoachingStatus = {
            status: 'warning',
            headline: 'Chamber Still Closed!',
            message: 'You are attempting to retrieve objects before opening the containment chamber.',
            actionHint: 'Please open the box lid using your webcam hand gesture: Point → Pinch → Lift Up → Release.',
          };
        } else if (heartbeat.handStatus === 'none') {
          liveCoachingStatus = {
            status: 'hint',
            headline: 'Step 1: Open Containment Box (Webcam Hand Gesture)',
            message: 'Touchless gesture sequence: 1) POINT TO LID, 2) PINCH TO GRAB LID, 3) LIFT / SLIDE UP, 4) RELEASE TO OPEN.',
            actionHint: 'Voice Command: "Please open the box." · Use webcam hand gesture',
          };
        } else {
          liveCoachingStatus = {
            status: 'hint',
            headline: 'Webcam Hand Detected Near Chamber',
            message: 'Point index finger at the box lid, pinch thumb and index together, lift upward, and release to open.',
            actionHint: '"POINT TO LID" → "PINCH TO GRAB LID" → "LIFT / SLIDE UP" → "RELEASE TO OPEN"',
          };
        }
        break;
      }
      case 1: {
        // Step 1: Pick Red
        if (yellowObj?.state === 'HELD') {
          liveCoachingStatus = {
            status: 'warning',
            headline: 'Wrong Object! Yellow Block Held',
            message: 'You picked up the yellow block. The protocol requires the RED specimen.',
            actionHint: 'Return the yellow block and pick up the RED block from the chamber.',
          };
        } else if (redObj?.state === 'HELD') {
          liveCoachingStatus = {
            status: 'correct',
            headline: 'Red Specimen Held — Correct!',
            message: 'Red specimen grasped and tracked in camera view.',
            actionHint: 'Move it toward the green Target Zone (bottom-right).',
          };
        } else if (!redObj?.visible) {
          liveCoachingStatus = {
            status: 'hint',
            headline: 'Action Required: Pick Red Specimen',
            message: 'Red specimen not detected. Ensure it is clearly visible to the camera.',
            actionHint: 'Voice Command: "Pick up the red specimen."',
          };
        } else {
          liveCoachingStatus = {
            status: 'hint',
            headline: 'Red Specimen Visible in Chamber',
            message: 'Reach in with your hand and pick up the red block.',
            actionHint: 'The camera will detect hand-to-object contact and lifting.',
          };
        }
        break;
      }
      case 2: {
        // Step 2: Place Red in Target Zone
        if (redObj?.state === 'TARGET_ZONE') {
          liveCoachingStatus = {
            status: 'correct',
            headline: 'Red Specimen in Target Zone — Perfect!',
            message: 'Placement coordinates match bottom-right target zone.',
            actionHint: 'Next: Preparing to pick up yellow specimen.',
          };
        } else if (redObj?.state === 'HELD') {
          liveCoachingStatus = {
            status: 'hint',
            headline: 'Carrying Red Specimen',
            message: 'Move the red block toward the green Target Zone on the bottom right.',
            actionHint: 'Release the block inside the green Target Zone.',
          };
        } else if (!redObj?.visible) {
          liveCoachingStatus = {
            status: 'warning',
            headline: 'Red Specimen Lost from View!',
            message: 'The red specimen left the camera frame before reaching the target zone.',
            actionHint: 'Bring the red specimen back into the camera frame.',
          };
        } else {
          liveCoachingStatus = {
            status: 'warning',
            headline: 'Red Specimen Dropped Outside Target!',
            message: 'The red block is outside the required target zone.',
            actionHint: 'Pick up the red block and place it inside the green Target Zone.',
          };
        }
        break;
      }
      case 3: {
        // Step 3: Pick Yellow
        if (redObj?.state === 'HELD') {
          liveCoachingStatus = {
            status: 'warning',
            headline: 'Red Block Already Placed!',
            message: 'Leave the red block in the target zone. Pick up the YELLOW specimen.',
            actionHint: 'Voice Command: "Pick up the yellow specimen."',
          };
        } else if (yellowObj?.state === 'HELD') {
          liveCoachingStatus = {
            status: 'correct',
            headline: 'Yellow Specimen Held — Correct!',
            message: 'Yellow specimen grasped and tracked in camera view.',
            actionHint: 'Move it toward the green Target Zone (bottom-right).',
          };
        } else if (!yellowObj?.visible) {
          liveCoachingStatus = {
            status: 'hint',
            headline: 'Action Required: Pick Yellow Specimen',
            message: 'Yellow specimen not detected. Ensure it is clearly visible to the camera.',
            actionHint: 'Voice Command: "Pick up the yellow specimen."',
          };
        } else {
          liveCoachingStatus = {
            status: 'hint',
            headline: 'Yellow Specimen Visible in Chamber',
            message: 'Reach in with your hand and pick up the yellow block.',
            actionHint: 'The camera will detect hand-to-object contact and lifting.',
          };
        }
        break;
      }
      case 4: {
        // Step 4: Place Yellow in Target Zone
        if (yellowObj?.state === 'TARGET_ZONE') {
          liveCoachingStatus = {
            status: 'correct',
            headline: 'Yellow Specimen in Target Zone — Perfect!',
            message: 'Placement coordinates match bottom-right target zone.',
            actionHint: 'Finalizing experiment protocol sequence.',
          };
        } else if (yellowObj?.state === 'HELD') {
          liveCoachingStatus = {
            status: 'hint',
            headline: 'Carrying Yellow Specimen',
            message: 'Move the yellow block toward the green Target Zone on the bottom right.',
            actionHint: 'Release the block inside the green Target Zone beside the red specimen.',
          };
        } else if (!yellowObj?.visible) {
          liveCoachingStatus = {
            status: 'warning',
            headline: 'Yellow Specimen Lost from View!',
            message: 'The yellow specimen left the camera frame before reaching the target zone.',
            actionHint: 'Bring the yellow specimen back into the camera frame.',
          };
        } else {
          liveCoachingStatus = {
            status: 'warning',
            headline: 'Yellow Specimen Dropped Outside Target!',
            message: 'The yellow block is outside the required target zone.',
            actionHint: 'Pick up the yellow block and place it inside the green Target Zone.',
          };
        }
        break;
      }
      default:
        liveCoachingStatus = {
          status: 'correct',
          headline: 'Protocol In Progress',
          message: currentStep?.voice || 'Execute current task.',
          actionHint: 'Follow the vocal instructions.',
        };
    }
  }

  const speakCurrentCommand = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
    if (currentStep) {
      voice.speak(currentStep.voice, true, 'guidance');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. REAL-TIME WEBCAM PROTOCOL CHECKER BANNER */}
      <div
        className={`p-4 rounded-xl border shadow-sm transition-all ${
          liveCoachingStatus.status === 'warning'
            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
            : liveCoachingStatus.status === 'success'
            ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
            : liveCoachingStatus.status === 'correct'
            ? 'bg-cyan-50/90 border-cyan-300 text-cyan-950'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                liveCoachingStatus.status === 'warning'
                  ? 'bg-amber-100 text-amber-700 border border-amber-300'
                  : liveCoachingStatus.status === 'success'
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                  : liveCoachingStatus.status === 'correct'
                  ? 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-300'
              }`}
            >
              {liveCoachingStatus.status === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              ) : liveCoachingStatus.status === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : liveCoachingStatus.status === 'correct' ? (
                <Sparkles className="w-5 h-5 text-cyan-600" />
              ) : (
                <Eye className="w-5 h-5 text-slate-600" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-white/80 border border-slate-300/80">
                  {liveCoachingStatus.status === 'warning'
                    ? 'CORRECTIVE GUIDANCE'
                    : liveCoachingStatus.status === 'success'
                    ? 'PROTOCOL COMPLETE'
                    : liveCoachingStatus.status === 'correct'
                    ? 'ACTION VERIFIED'
                    : 'WEBCAM PROTOCOL CHECK'}
                </span>
                <span className="font-bold text-sm font-display text-slate-900">
                  {liveCoachingStatus.headline}
                </span>
              </div>
              <p className="text-xs text-slate-700 font-sans leading-relaxed">
                {liveCoachingStatus.message}
              </p>
              <div className="text-[11px] font-mono text-cyan-800 font-medium flex items-center gap-1.5 pt-0.5">
                <ArrowRight className="w-3 h-3 text-cyan-600 shrink-0" />
                <span>{liveCoachingStatus.actionHint}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={speakCurrentCommand}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-mono font-medium shadow-2xs transition-colors"
              title="Speak current command aloud"
            >
              <Volume2 className="w-3.5 h-3.5 text-cyan-600" />
              <span>Hear Command</span>
            </button>

            {sessionState === 'idle' && (
              <button
                onClick={() => startSession(false)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-semibold shadow-xs transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Experiment</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Camera Sensor Diagnostics Bar */}
        <div className="mt-3 pt-3 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
          <div className="p-2 rounded bg-white/70 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">CHAMBER LID</span>
            <span
              className={`font-semibold ${
                runner.virtualCamera.boxOpen || heartbeat.boxChangeRatio >= 25
                  ? 'text-emerald-700'
                  : 'text-slate-700'
              }`}
            >
              {runner.virtualCamera.boxOpen || heartbeat.boxChangeRatio >= 25 ? 'OPEN' : 'CLOSED'}
            </span>
          </div>

          <div className="p-2 rounded bg-white/70 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">RED SPECIMEN</span>
            <span
              className={`font-semibold ${
                redObj?.state === 'TARGET_ZONE'
                  ? 'text-emerald-700'
                  : redObj?.state === 'HELD'
                  ? 'text-cyan-700'
                  : redObj?.state === 'INSIDE_BOX'
                  ? 'text-slate-800'
                  : 'text-amber-700'
              }`}
            >
              {redObj?.state || 'UNSEEN'}
            </span>
          </div>

          <div className="p-2 rounded bg-white/70 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">YELLOW SPECIMEN</span>
            <span
              className={`font-semibold ${
                yellowObj?.state === 'TARGET_ZONE'
                  ? 'text-emerald-700'
                  : yellowObj?.state === 'HELD'
                  ? 'text-cyan-700'
                  : yellowObj?.state === 'INSIDE_BOX'
                  ? 'text-slate-800'
                  : 'text-amber-700'
              }`}
            >
              {yellowObj?.state || 'UNSEEN'}
            </span>
          </div>

          <div className="p-2 rounded bg-white/70 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">ASTRONAUT HAND</span>
            <span className="font-semibold text-slate-800 capitalize">
              {heartbeat.handStatus === 'landmarks'
                ? 'Gloved Hand'
                : heartbeat.handStatus === 'motion'
                ? 'Motion Tracking'
                : 'Clear of Stage'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. ORDERED PROTOCOL CHECKLIST WITH STATUS BADGES */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900 font-display text-sm">
              Experiment Protocol Checklist
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-medium">
              6-Step Validation Protocol
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Progress: <strong className="text-cyan-800">{Math.min(6, fsmIdx)} / 5 Completed</strong>
          </span>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
          {protocol.steps.map((step, idx) => {
            const isCompleted = fsmIdx > idx || sessionState === 'complete';
            const isCurrent = fsmIdx === idx && sessionState !== 'complete';
            const isPending = fsmIdx < idx && sessionState !== 'complete';

            return (
              <div
                key={step.id}
                className={`p-3 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                  isCurrent
                    ? 'bg-cyan-50/70 border-l-4 border-l-cyan-600'
                    : isCompleted
                    ? 'bg-emerald-50/40 border-l-4 border-l-emerald-500'
                    : 'bg-white border-l-4 border-l-slate-200 opacity-80'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Status Icon */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      isCompleted
                        ? 'bg-emerald-100 text-emerald-700'
                        : isCurrent
                        ? 'bg-cyan-100 text-cyan-700 ring-2 ring-cyan-400 ring-offset-1 animate-pulse'
                        : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                    ) : isCurrent ? (
                      <Radio className="w-3.5 h-3.5 text-cyan-600" />
                    ) : (
                      <span className="text-xs font-bold">{idx + 1}</span>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">{step.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                          isCompleted
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : isCurrent
                            ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isCompleted ? 'DONE' : isCurrent ? 'CURRENT TASK' : 'PENDING'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 font-sans mt-0.5">
                      Vocal Prompt: &ldquo;{step.voice}&rdquo;
                    </div>
                  </div>
                </div>

                {/* Real-time touchless status badge */}
                <div className="flex items-center gap-2">
                  {isCurrent && sessionState === 'running' && (
                    <span className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-cyan-100 text-cyan-800 border border-cyan-300 flex items-center gap-1.5 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-600" />
                      <span>{idx === 0 ? 'Wave/Pinch Lid' : 'Webcam Gesture Active'}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Final Step 6: Completion */}
          <div
            className={`p-3 flex items-center justify-between gap-3 ${
              sessionState === 'complete'
                ? 'bg-emerald-50/70 border-l-4 border-l-emerald-500'
                : 'bg-white border-l-4 border-l-slate-200 opacity-80'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  sessionState === 'complete'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Check className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-xs">EXPERIMENT_COMPLETE</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                      sessionState === 'complete'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {sessionState === 'complete' ? 'DONE' : 'PENDING'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 font-sans mt-0.5">
                  Vocal Prompt: &ldquo;Experiment complete.&rdquo;
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
