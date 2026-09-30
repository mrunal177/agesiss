import React, { useState } from 'react';
import { useAegisStore } from '../store/useAegisStore';
import { CONFIG } from '../config';
import {
  Layers,
  Cpu,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  Sliders,
  CheckCircle2,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

export const ArchitectureScreen: React.FC = () => {
  const { fsm, handMode } = useAegisStore();
  const [selectedPipelineStage, setSelectedPipelineStage] = useState<number | null>(0);
  const [isCrashing, setIsCrashing] = useState<boolean>(false);
  const [crashCountdown, setCrashCountdown] = useState<number>(3);
  const [nConfirmVal, setNConfirmVal] = useState<number>(CONFIG.N_CONFIRM);

  const handleSimulateCrash = async () => {
    setIsCrashing(true);
    setCrashCountdown(3);
    const interval = setInterval(() => {
      setCrashCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    await fsm.simulateCrash();
    setIsCrashing(false);
  };

  const toggleHandMode = () => {
    const nextMode = handMode === 'vision' ? 'fallback' : 'vision';
    useAegisStore.setState({ handMode: nextMode });
  };

  const STAGES = [
    {
      id: 1,
      name: 'Experimental Input',
      tech: 'Fixed Payload Optical Stream (320×240 @ 25 FPS)',
      detail:
        'Optical sensor capturing microgravity biological payload container. Applies Laplacian focus assessment (variance ≥ 60) and EMA frame-rate monitoring (≥ 15 FPS).',
    },
    {
      id: 2,
      name: 'AI Vision & Interaction',
      tech: 'Dual-Tier Object + Hand Tracking',
      detail:
        'Two-pass connected-component color segmentation (HSV) tracking specimen containers (red#1, yellow#2) and MediaPipe HandLandmarker detecting 21 landmarks + palm center.',
    },
    {
      id: 3,
      name: 'Action Verification',
      tech: 'Multi-Modal Unified Confidence Fusion',
      detail:
        'Computes tripartite confidence: State Persistence (45%), Hand-Object Proximity (30%), and Temporal Trajectory Cosine Progress (25%). Acceptance threshold ≥ 0.70.',
    },
    {
      id: 4,
      name: 'Sequence Validation FSM',
      tech: 'Deterministic Protocol State Machine',
      detail:
        'Strict state reducer evaluating actions against expected step sequence. Flags out-of-sequence, skipped steps, repeated actions, and microgravity drift in < 50ms.',
    },
    {
      id: 5,
      name: 'Guidance, Logging & Monitoring',
      tech: 'Closed-Loop Audio, IndexedDB & Relay',
      detail:
        'On-device speech synthesizer issuing immediate voice corrections, immutable structured JSON telemetry logging, and binary WebSocket streaming to ground station.',
    },
  ];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 font-sans">
      {/* Header */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <h1 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
          System Architecture &amp; Deployment Topology
        </h1>
        <p className="text-xs text-slate-600 mt-0.5">
          End-to-end edge perception pipeline, resilience test harness, and spaceflight deployment target comparison.
        </p>
      </div>

      {/* 5-Stage Pipeline Diagram */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 font-bold">
          5-Stage Autonomous Verification Pipeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STAGES.map((st, i) => (
            <button
              key={st.id}
              onClick={() => setSelectedPipelineStage(i)}
              className={`p-4 rounded-xl border text-left transition-all shadow-2xs cursor-pointer ${
                selectedPipelineStage === i
                  ? 'bg-cyan-50/80 border-cyan-400 text-cyan-950 shadow-md ring-2 ring-cyan-200'
                  : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="font-mono text-[10px] text-cyan-700 font-bold mb-1">
                STAGE 0{st.id}
              </div>
              <div className="text-xs font-bold text-slate-900 font-display">
                {st.name}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-1 line-clamp-2">
                {st.tech}
              </div>
            </button>
          ))}
        </div>

        {/* Pipeline Stage Detail Drawer */}
        {selectedPipelineStage !== null && (
          <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1 font-mono text-xs shadow-xs">
            <span className="text-cyan-800 font-bold block">
              {STAGES[selectedPipelineStage].name} Specification:
            </span>
            <p className="text-slate-700 font-sans leading-relaxed text-xs">
              {STAGES[selectedPipelineStage].detail}
            </p>
          </div>
        )}
      </div>

      {/* Resilience Controls & Watchdog Crash Simulation */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-4 font-mono text-xs shadow-xs">
        <h2 className="text-xs uppercase tracking-wider text-slate-800 font-bold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-600" />
          <span>Resilience, Fault-Tolerance &amp; Watchdog Controls</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Simulate Crash */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <span className="text-slate-900 font-bold block">Crash &amp; Recovery Watchdog</span>
            <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
              Terminates the active perception loop, simulates an abrupt system crash, and restores the session from the latest committed checkpoint.
            </p>
            <button
              onClick={handleSimulateCrash}
              disabled={isCrashing}
              className="w-full py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-800 text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{isCrashing ? `Restoring in ${crashCountdown}s...` : 'Simulate Crash'}</span>
            </button>
          </div>

          {/* Force Hand Fallback */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <span className="text-slate-900 font-bold block">Hand Fallback Mode</span>
            <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
              Toggles between MediaPipe HandLandmarker neural delegate and pure optical-flow frame-difference motion tracking ring.
            </p>
            <button
              onClick={toggleHandMode}
              className="w-full py-2 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-mono font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              Mode: {handMode === 'vision' ? 'MediaPipe (Active)' : 'Motion Ring (Active)'}
            </button>
          </div>

          {/* N_CONFIRM Slider */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-slate-900 font-bold">N_CONFIRM Filter:</span>
              <span className="text-cyan-800 font-bold">{nConfirmVal} frames</span>
            </div>
            <p className="text-[11px] text-slate-600 font-sans leading-relaxed">
              Frames a candidate state must persist before commit. Eliminates transient camera flicker.
            </p>
            <input
              type="range"
              min={3}
              max={10}
              value={nConfirmVal}
              onChange={(e) => setNConfirmVal(Number(e.target.value))}
              className="w-full accent-cyan-600"
            />
          </div>
        </div>
      </div>

      {/* Two Columns: Runs in this Build vs Edge Deployment Target */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
        {/* Runs in this build */}
        <div className="p-5 rounded-xl bg-white border border-cyan-300 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-600" />
            <h3 className="font-bold text-slate-900 font-display text-sm">
              Runs in This Build (Browser Client)
            </h3>
          </div>
          <ul className="space-y-2 text-slate-700 leading-relaxed font-sans text-xs">
            <li>• <strong className="font-mono text-cyan-800">Perception:</strong> OpenCV-scale HSV segmentation + MediaPipe HandLandmarker GPU delegate.</li>
            <li>• <strong className="font-mono text-cyan-800">FSM Engine:</strong> Pure TypeScript deterministic reducer with invariant validation.</li>
            <li>• <strong className="font-mono text-cyan-800">Voice Synthesis:</strong> Web Speech SpeechSynthesis API with alert pre-emption.</li>
            <li>• <strong className="font-mono text-cyan-800">Recording:</strong> 10-second segmented MediaRecorder chunks (VP8/WebM).</li>
            <li>• <strong className="font-mono text-cyan-800">Ground Link:</strong> WebSocket binary pipe to local FastAPI ground-relay server.</li>
            <li>• <strong className="font-mono text-cyan-800">Storage:</strong> IndexedDB persistent local cache with JSON/CSV exporter.</li>
          </ul>
        </div>

        {/* Edge deployment target */}
        <div className="p-5 rounded-xl bg-white border border-emerald-300 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
            <h3 className="font-bold text-slate-900 font-display text-sm">
              Edge Deployment Target (Flight Payload Rack)
            </h3>
          </div>
          <ul className="space-y-2 text-slate-700 leading-relaxed font-sans text-xs">
            <li>• <strong className="font-mono text-emerald-800">Hardware:</strong> NVIDIA Jetson Orin Nano (8GB, 40 TOPS @ 15W power envelope).</li>
            <li>• <strong className="font-mono text-emerald-800">Neural Models:</strong> YOLO11-Seg TensorRT FP16 quantization (≥ 15 FPS, &lt; 500ms latency).</li>
            <li>• <strong className="font-mono text-emerald-800">Tracking:</strong> ByteTrack multi-object tracking + ArUco fiducial payload alignment.</li>
            <li>• <strong className="font-mono text-emerald-800">Speech Engine:</strong> Piper TTS (low-latency offline neural vocal synthesis).</li>
            <li>• <strong className="font-mono text-emerald-800">Ground Downlink:</strong> GStreamer RTSP hardware-encoded H.264 pipe over CCSDS Space Packet Protocol.</li>
            <li>• <strong className="font-mono text-emerald-800">Fault Tolerance:</strong> Dual-redundant hardware watchdog + radiation-hardened NVMe.</li>
          </ul>
        </div>
      </div>

      {/* Challenges & Mitigation Table */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3 shadow-xs">
        <h2 className="text-xs font-mono uppercase tracking-wider text-slate-700 font-bold">
          Chamber Challenges &amp; Engineering Mitigations
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono text-left">
            <thead className="border-b border-slate-200 text-slate-500 text-[11px]">
              <tr>
                <th className="pb-2 font-semibold">Challenge in Microgravity</th>
                <th className="pb-2 font-semibold">Potential Failure Mode</th>
                <th className="pb-2 font-semibold">AEGIS Mitigation Architecture</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans text-xs text-slate-700">
              <tr>
                <td className="py-2.5 font-mono font-semibold text-slate-900">Illumination Variances</td>
                <td className="py-2.5 text-slate-500">Specular reflections &amp; shadow dropouts</td>
                <td className="py-2.5 text-cyan-800 font-medium">Normalized HSV space with interactive 9×9 patch median calibration.</td>
              </tr>
              <tr>
                <td className="py-2.5 font-mono font-semibold text-slate-900">Hand Occlusion</td>
                <td className="py-2.5 text-slate-500">False-positive &ldquo;Object Lost&rdquo; alarm</td>
                <td className="py-2.5 text-cyan-800 font-medium">700ms hand occlusion grace window before initiating lost-object state.</td>
              </tr>
              <tr>
                <td className="py-2.5 font-mono font-semibold text-slate-900">Sensor Jitter &amp; Noise</td>
                <td className="py-2.5 text-slate-500">Premature step verification</td>
                <td className="py-2.5 text-cyan-800 font-medium">N=5 frame confirmation hysteresis window + stationary velocity threshold.</td>
              </tr>
              <tr>
                <td className="py-2.5 font-mono font-semibold text-slate-900">Sub-system Crash</td>
                <td className="py-2.5 text-slate-500">Loss of experiment step index</td>
                <td className="py-2.5 text-cyan-800 font-medium">Snapshot watchdog persisting step index &amp; object states after every commit.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* CIMON Related Work & Literature References */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3 font-mono text-xs shadow-xs">
        <span className="text-slate-700 font-bold uppercase tracking-wider block">
          Related Spaceflight Systems &amp; References
        </span>
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 font-sans text-xs text-slate-700">
          <span className="font-bold text-cyan-800 font-mono">CIMON-2 &amp; Crew Interactive Assistants:</span>
          <p className="leading-relaxed">
            Unlike free-flying conversational companion robots (e.g. CIMON on the ISS) which act as generalized dialogue interfaces, AEGIS is specifically engineered as a fixed, deterministic payload rack supervisor. It enforces sub-50ms deterministic activity validation without conversational latency.
          </p>
        </div>

        <div className="space-y-1 text-slate-500 text-[11px] pt-1">
          <div>1. NASA SP-2016-6105: Systems Engineering Handbook for On-Orbit Payloads.</div>
          <div>2. ESA Biological Experiment Facility (BioLab) rack operational procedures.</div>
          <div>3. ISO 9241-210: Ergonomics of human-system interaction for aerospace cockpits.</div>
          <div>4. Redmon et al., YOLOv11 Real-Time Object Detection, 2024.</div>
          <div>5. Lugaresi et al., MediaPipe: A Framework for Building Perception Pipelines, 2019.</div>
          <div>6. Yan et al., Spatial Temporal Graph Convolutional Networks for Skeleton-Based Action Recognition (ST-GCN), AAAI 2018.</div>
          <div>7. CCSDS 133.0-B-2: Space Packet Protocol Telemetry Standard.</div>
          <div>8. NVIDIA Jetson Orin Nano Architecture Whitepaper, 2023.</div>
          <div>9. Smart India Hackathon 2026 Problem Statement SIH26174 Specifications.</div>
        </div>
      </div>
    </div>
  );
};
