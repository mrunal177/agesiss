import React, { useEffect, useRef, useState } from 'react';
import { useAegisStore } from '../store/useAegisStore';
import { CONFIG } from '../config';
import { buildScenario } from '../engine/testScenarios';
import {
  Camera,
  Play,
  Pause,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Check,
  Crosshair,
  Sparkles,
  Info,
  CheckCircle2,
  XCircle,
  Eye,
  Hand,
  Box,
  RefreshCw,
  Video,
  Volume2,
} from 'lucide-react';

interface VideoStageProps {
  onFrameCaptured?: (canvas: HTMLCanvasElement) => void;
}

export const VideoStage: React.FC<VideoStageProps> = () => {
  const {
    runner,
    sessionState,
    startSession,
    pauseSession,
    resumeSession,
    resetSession,
    sourceMode,
    setSourceMode,
    activeScenarioId,
    fsmIdx,
    protocol,
    activeAlert,
    isCalibrating,
    setIsCalibrating,
    calibrationMode,
    setCalibrationMode,
    sampleColorAt,
    captureClosedBoxBaseline,
    boxROI,
    targetROI,
    setROIs,
    isDefaultZonesHintDismissed,
    dismissDefaultZonesHint,
    heartbeat,
    isSelfTestActive,
    selfTestRemainingSec,
    selfTestResults,
    startSelfTest,
    stopSelfTest,
    toggleVirtualBox,
    triggerBoxOpen,
    executeVirtualStep,
  } = useAegisStore();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isPhysicalWebcamActive, setIsPhysicalWebcamActive] = useState<boolean>(false);
  const [cameraLoading, setCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [preflightErrorModal, setPreflightErrorModal] = useState<string | null>(null);
  const [virtualActionInProgress, setVirtualActionInProgress] = useState<string | null>(null);

  // Keyboard shortcut: Spacebar or 'O'/'o' to instantly trigger Open Box when at Step 1
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (e.code === 'Space' || e.key === 'o' || e.key === 'O') {
        if (fsmIdx === 0) {
          e.preventDefault();
          triggerBoxOpen();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fsmIdx, triggerBoxOpen]);

  // Dragging / Resizing state for calibration ROI boxes only
  const [draggingTarget, setDraggingTarget] = useState<
    | 'box'
    | 'target'
    | 'box_handle'
    | 'target_handle'
    | null
  >(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialROI, setInitialROI] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 0, h: 0 });

  // Interactive specimen and lid dragging state
  const [draggedObject, setDraggedObject] = useState<'none' | 'red' | 'yellow'>('none');
  const [hoverCursor, setHoverCursor] = useState<'default' | 'pointer' | 'grab' | 'not-allowed'>('default');

  // Connect DOM elements to PerceptionRunner outside React
  useEffect(() => {
    if (videoRef.current) {
      runner.setVideoElement(videoRef.current);
    }
    if (overlayCanvasRef.current) {
      runner.setOverlayCanvas(overlayCanvasRef.current);
    }
  }, [runner]);

  // Keep scenario frames in sync when in replay mode
  useEffect(() => {
    if (sourceMode === 'replay') {
      const frames = buildScenario(activeScenarioId);
      runner.setReplayFrames(frames);
    }
  }, [sourceMode, activeScenarioId, runner]);

  // ResizeObserver: Keep overlay canvas resolution matched to container display dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (overlayCanvasRef.current && width > 0 && height > 0) {
          overlayCanvasRef.current.width = Math.round(width);
          overlayCanvasRef.current.height = Math.round(height);
        }
      }
    });

    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Enumerate camera devices
  const refreshDevices = () => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const videoDevs = devices.filter((d) => d.kind === 'videoinput');
          setCameraDevices(videoDevs);
          if (videoDevs.length > 0 && !selectedDeviceId && videoDevs[0].deviceId) {
            setSelectedDeviceId(videoDevs[0].deviceId);
          }
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    refreshDevices();
  }, []);

  // Initialize physical webcam stream when in 'live' mode
  useEffect(() => {
    if (sourceMode !== 'live') {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      setIsPhysicalWebcamActive(false);
      return;
    }

    let activeStream: MediaStream | null = null;
    let cancelled = false;

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera API is not supported in this browser environment. Running Virtual Space Payload Camera.');
        setIsPhysicalWebcamActive(false);
        return;
      }

      setCameraLoading(true);
      setCameraError(null);

      try {
        let stream: MediaStream | null = null;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: selectedDeviceId
              ? { deviceId: { ideal: selectedDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
              : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: false,
          });
        } catch {
          // Fallback to basic video without constraints
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        if (cancelled || !stream) {
          if (stream) stream.getTracks().forEach((t) => t.stop());
          return;
        }

        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          try {
            await videoRef.current.play();
          } catch {
            // Autoplay error suppressed
          }
          runner.setVideoElement(videoRef.current);
        }

        setIsPhysicalWebcamActive(true);
        setCameraError(null);
        refreshDevices();
      } catch (err: any) {
        if (cancelled) return;
        setIsPhysicalWebcamActive(false);
        const msg =
          err.name === 'NotAllowedError'
            ? 'Camera access permission was denied. You can allow it in your browser settings or use the Virtual Payload Camera.'
            : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
            ? 'No physical camera device was detected on this computer. Running Virtual Space Payload Camera.'
            : (err.message || 'Camera is unavailable. Running Virtual Space Payload Camera.');
        setCameraError(msg);
      } finally {
        if (!cancelled) setCameraLoading(false);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [sourceMode, selectedDeviceId]);

  // Handle clicking & dragging on overlay canvas for calibration ROI adjustment only
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const normX = clickX / rect.width;
    const normY = clickY / rect.height;

    // In calibration mode
    if (isCalibrating) {
      if (calibrationMode === 'sample_red') {
        sampleColorAt(normX, normY, 'red');
        setCalibrationMode('none');
        return;
      }
      if (calibrationMode === 'sample_yellow') {
        sampleColorAt(normX, normY, 'yellow');
        setCalibrationMode('none');
        return;
      }

      const px = normX * CONFIG.PROC_W;
      const py = normY * CONFIG.PROC_H;

      const inBoxCorner =
        Math.abs(px - (boxROI.x + boxROI.w)) < 15 && Math.abs(py - (boxROI.y + boxROI.h)) < 15;
      const inBox = px >= boxROI.x && px <= boxROI.x + boxROI.w && py >= boxROI.y && py <= boxROI.y + boxROI.h;

      const inTargetCorner =
        Math.abs(px - (targetROI.x + targetROI.w)) < 15 && Math.abs(py - (targetROI.y + targetROI.h)) < 15;
      const inTarget =
        px >= targetROI.x && px <= targetROI.x + targetROI.w && py >= targetROI.y && py <= targetROI.y + targetROI.h;

      if (inBoxCorner) {
        setDraggingTarget('box_handle');
        setDragStartPos({ x: px, y: py });
        setInitialROI({ ...boxROI });
      } else if (inBox) {
        setDraggingTarget('box');
        setDragStartPos({ x: px, y: py });
        setInitialROI({ ...boxROI });
      } else if (inTargetCorner) {
        setDraggingTarget('target_handle');
        setDragStartPos({ x: px, y: py });
        setInitialROI({ ...targetROI });
      } else if (inTarget) {
        setDraggingTarget('target');
        setDragStartPos({ x: px, y: py });
        setInitialROI({ ...targetROI });
      }
      return;
    }
    // When not calibrating ROIs, handle interactive mouse clicking & dragging for Specimens and Lid
    const px = normX * CONFIG.PROC_W;
    const py = normY * CONFIG.PROC_H;

    // 1. Check click on Lid Latch (to open box)
    const bX = boxROI.x;
    const bY = boxROI.y;
    const bW = boxROI.w;
    const bH = boxROI.h;
    const lidSlide = runner.virtualCamera.lidSlideOffset;
    const curLidY = bY - lidSlide * (bH * 0.9);
    const curLidX = bX - lidSlide * 15;
    const latchCenterX = curLidX + bW / 2;
    const latchCenterY = curLidY + bH / 2;

    if (!runner.virtualCamera.boxOpen && Math.hypot(px - latchCenterX, py - latchCenterY) <= 45) {
      triggerBoxOpen();
      return;
    }

    // 2. Check click on Red Specimen
    const distToRed = Math.hypot(px - runner.virtualCamera.redPos.x, py - runner.virtualCamera.redPos.y);
    if (distToRed <= 26) {
      // "once the red is droped in the target it should be not avaible to pick"
      if (runner.isRedPlaced || runner.fsm.idx >= 3) {
        // Red is already placed and locked in the target zone! Cannot be picked!
        return;
      }
      setDraggedObject('red');
      runner.pickObject('red');
      runner.virtualCamera.redPos = { x: Math.round(px), y: Math.round(py) };
      return;
    }

    // 3. Check click on Yellow Specimen
    const distToYellow = Math.hypot(px - runner.virtualCamera.yellowPos.x, py - runner.virtualCamera.yellowPos.y);
    if (distToYellow <= 26) {
      if (runner.isYellowPlaced || runner.fsm.idx >= 5) {
        // Yellow is already placed and locked!
        return;
      }
      // Must place Red before Yellow can be picked
      if (!runner.isRedPlaced && runner.fsm.idx < 3) {
        return;
      }
      setDraggedObject('yellow');
      runner.pickObject('yellow');
      runner.virtualCamera.yellowPos = { x: Math.round(px), y: Math.round(py) };
      return;
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const curX = ((e.clientX - rect.left) / rect.width) * CONFIG.PROC_W;
    const curY = ((e.clientY - rect.top) / rect.height) * CONFIG.PROC_H;

    if (isCalibrating && draggingTarget) {
      const dx = curX - dragStartPos.x;
      const dy = curY - dragStartPos.y;

      if (draggingTarget === 'box') {
        const newX = Math.max(0, Math.min(CONFIG.PROC_W - initialROI.w, Math.round(initialROI.x + dx)));
        const newY = Math.max(0, Math.min(CONFIG.PROC_H - initialROI.h, Math.round(initialROI.y + dy)));
        setROIs({ ...boxROI, x: newX, y: newY }, targetROI);
      } else if (draggingTarget === 'box_handle') {
        const newW = Math.max(40, Math.min(CONFIG.PROC_W - initialROI.x, Math.round(initialROI.w + dx)));
        const newH = Math.max(40, Math.min(CONFIG.PROC_H - initialROI.y, Math.round(initialROI.h + dy)));
        setROIs({ ...boxROI, w: newW, h: newH }, targetROI);
      } else if (draggingTarget === 'target') {
        const newX = Math.max(0, Math.min(CONFIG.PROC_W - initialROI.w, Math.round(initialROI.x + dx)));
        const newY = Math.max(0, Math.min(CONFIG.PROC_H - initialROI.h, Math.round(initialROI.y + dy)));
        setROIs(boxROI, { ...targetROI, x: newX, y: newY });
      } else if (draggingTarget === 'target_handle') {
        const newW = Math.max(40, Math.min(CONFIG.PROC_W - initialROI.x, Math.round(initialROI.w + dx)));
        const newH = Math.max(40, Math.min(CONFIG.PROC_H - initialROI.y, Math.round(initialROI.h + dy)));
        setROIs(boxROI, { ...targetROI, w: newW, h: newH });
      }
      return;
    }

    // Handle dragging red or yellow object
    if (draggedObject === 'red') {
      runner.virtualCamera.redPos = {
        x: Math.max(10, Math.min(CONFIG.PROC_W - 10, Math.round(curX))),
        y: Math.max(10, Math.min(CONFIG.PROC_H - 10, Math.round(curY))),
      };
      return;
    }

    if (draggedObject === 'yellow') {
      runner.virtualCamera.yellowPos = {
        x: Math.max(10, Math.min(CONFIG.PROC_W - 10, Math.round(curX))),
        y: Math.max(10, Math.min(CONFIG.PROC_H - 10, Math.round(curY))),
      };
      return;
    }

    // Update hover cursor when moving over interactive elements
    const distToRed = Math.hypot(curX - runner.virtualCamera.redPos.x, curY - runner.virtualCamera.redPos.y);
    const distToYellow = Math.hypot(curX - runner.virtualCamera.yellowPos.x, curY - runner.virtualCamera.yellowPos.y);

    const bX = boxROI.x;
    const bY = boxROI.y;
    const bW = boxROI.w;
    const bH = boxROI.h;
    const lidSlide = runner.virtualCamera.lidSlideOffset;
    const curLidY = bY - lidSlide * (bH * 0.9);
    const curLidX = bX - lidSlide * 15;
    const latchCenterX = curLidX + bW / 2;
    const latchCenterY = curLidY + bH / 2;
    const distToLatch = Math.hypot(curX - latchCenterX, curY - latchCenterY);

    if (distToRed <= 24) {
      if (runner.isRedPlaced || runner.fsm.idx >= 3) {
        setHoverCursor('not-allowed');
      } else {
        setHoverCursor('grab');
      }
    } else if (distToYellow <= 24) {
      if (runner.isYellowPlaced || runner.fsm.idx >= 5) {
        setHoverCursor('not-allowed');
      } else if (runner.isRedPlaced || runner.fsm.idx >= 3) {
        setHoverCursor('grab');
      } else {
        setHoverCursor('not-allowed');
      }
    } else if (!runner.virtualCamera.boxOpen && distToLatch <= 40) {
      setHoverCursor('pointer');
    } else {
      setHoverCursor('default');
    }
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isCalibrating) {
      setDraggingTarget(null);
      return;
    }

    const canvas = overlayCanvasRef.current;
    if (!canvas) {
      setDraggedObject('none');
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const curX = ((e.clientX - rect.left) / rect.width) * CONFIG.PROC_W;
    const curY = ((e.clientY - rect.top) / rect.height) * CONFIG.PROC_H;

    // Check if drop location is within target region (with 25px generous boundary tolerance)
    const inTargetRegion =
      curX >= targetROI.x - 25 &&
      curX <= targetROI.x + targetROI.w + 25 &&
      curY >= targetROI.y - 25 &&
      curY <= targetROI.y + targetROI.h + 25;

    if (draggedObject === 'red') {
      if (inTargetRegion) {
        // Successfully dropped in target region!
        runner.placeObject('red');
      } else {
        // Dropped outside target zone: user can pick again
        runner.virtualCamera.handHolding = 'none';
      }
      setDraggedObject('none');
    } else if (draggedObject === 'yellow') {
      if (inTargetRegion) {
        // Successfully dropped in target region!
        runner.placeObject('yellow');
      } else {
        runner.virtualCamera.handHolding = 'none';
      }
      setDraggedObject('none');
    }
  };

  const activateCameraDirectly = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
    setSourceMode('live');
    if (sessionState === 'idle') {
      startSession(true);
    }
  };

  const handleStartClick = () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
    const res = startSession(false);
    if (!res.started && res.error) {
      setPreflightErrorModal(res.error);
    }
  };

  const runVirtualStep = async (step: 'OPEN' | 'PICK_RED' | 'PLACE_RED' | 'PICK_YELLOW' | 'PLACE_YELLOW' | 'WAVE_HAND' | 'TOUCH_BOX' | 'AUTO_PLAY') => {
    setVirtualActionInProgress(step);
    try {
      await executeVirtualStep(step);
    } finally {
      setVirtualActionInProgress(null);
    }
  };

  const currentStep = protocol.steps[fsmIdx];

  return (
    <div className="relative flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-md">
      {/* Top Banner with Instruction & Camera Quick Button */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-cyan-700 font-bold uppercase tracking-wider">
            STEP {fsmIdx + 1}/{protocol.steps.length}:
          </span>
          <span className="text-slate-900 font-semibold">
            {currentStep?.voice || 'Experiment Procedure Completed'}
          </span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Audio Message Playback Button */}
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.speechSynthesis) {
                window.speechSynthesis.resume();
              }
              runner.voice.replayLast();
            }}
            title="Replay Audio Guidance Voice"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-800 text-xs font-mono font-medium border border-slate-300 shadow-2xs transition-colors cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5 text-cyan-600" />
            <span>Play Audio</span>
          </button>

          {/* Quick Camera Toggle Button */}
          {sourceMode !== 'live' ? (
            <button
              onClick={activateCameraDirectly}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-medium shadow-xs transition-colors"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Turn On Webcam</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Webcam Active</span>
            </div>
          )}

          <span className="text-[11px] text-slate-600 hidden md:inline">
            Status: <strong className="text-cyan-800 uppercase">{sessionState}</strong>
          </span>

          <button
            onClick={() => setIsCalibrating(!isCalibrating)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-colors ${
              isCalibrating
                ? 'bg-amber-100 text-amber-900 border border-amber-400 font-semibold'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{isCalibrating ? 'Exit Calibration' : 'Calibrate Video'}</span>
          </button>
        </div>
      </div>

      {/* DEDICATED TOUCHLESS "OPEN THE BOX" WEBCAM GUIDANCE BANNER (Step 1) */}
      {fsmIdx === 0 && (
        <div className="z-20 bg-linear-to-r from-cyan-50 via-sky-50 to-emerald-50 border-b border-cyan-200 p-3 sm:p-4 text-xs font-mono text-slate-800 shadow-xs">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-cyan-700 text-white font-bold text-[10px] uppercase tracking-wider">
                  Touchless Chamber Opening
                </span>
                <span className="font-bold text-slate-900 font-sans text-sm flex items-center gap-1.5">
                  <Box className="w-4 h-4 text-cyan-600" />
                  Webcam Hand Gesture Sequence:
                </span>
              </div>
              <span className="text-[11px] text-cyan-800 font-bold bg-white px-2 py-0.5 rounded border border-cyan-200">
                NO MOUSE REQUIRED · USE WEBCAM HAND
              </span>
            </div>

            {/* 4-Step Touchless Guidance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1 font-sans text-slate-700 text-xs">
              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-cyan-300 shadow-2xs ring-1 ring-cyan-400">
                <span className="text-xl leading-none shrink-0">👉</span>
                <div>
                  <strong className="block text-cyan-900 font-semibold text-xs">1. POINT TO LID</strong>
                  <span className="text-[11px] text-slate-600 leading-tight block mt-0.5">
                    Point index finger at the virtual <strong>BOX LID</strong> latch.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-cyan-300 shadow-2xs ring-1 ring-cyan-400">
                <span className="text-xl leading-none shrink-0">🤏</span>
                <div>
                  <strong className="block text-cyan-900 font-semibold text-xs">2. PINCH TO GRAB LID</strong>
                  <span className="text-[11px] text-slate-600 leading-tight block mt-0.5">
                    Pinch thumb and index finger together to grab the lid.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-cyan-300 shadow-2xs ring-1 ring-cyan-400">
                <span className="text-xl leading-none shrink-0">⬆️</span>
                <div>
                  <strong className="block text-cyan-900 font-semibold text-xs">3. LIFT / SLIDE UP</strong>
                  <span className="text-[11px] text-slate-600 leading-tight block mt-0.5">
                    Move hand upward while pinching to slide lid open.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-emerald-300 shadow-2xs ring-1 ring-emerald-400">
                <span className="text-xl leading-none shrink-0">✋</span>
                <div>
                  <strong className="block text-emerald-900 font-semibold text-xs">4. RELEASE TO OPEN</strong>
                  <span className="text-[11px] text-slate-600 leading-tight block mt-0.5">
                    Release pinch when open to advance to <strong>PICK_RED</strong>.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dismissible Default Zones Hint (FIX 3) */}
      {!isDefaultZonesHintDismissed && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-cyan-50 border-b border-cyan-200 text-cyan-900 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
            <span>Using default zones. Recalibrate for best accuracy.</span>
          </div>
          <button
            onClick={dismissDefaultZonesHint}
            className="text-[11px] text-cyan-700 hover:text-cyan-900 underline cursor-pointer font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Calibration Controls Bar (FIX 4 - DOM elements above canvas) */}
      {isCalibrating && (
        <div className="z-20 flex flex-wrap items-center justify-between gap-2 p-3 bg-amber-50 border-b border-amber-300 text-xs font-mono text-amber-900">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-amber-800 font-bold uppercase tracking-wider mr-1">
              Calibration Active:
            </span>
            <button
              onClick={() => setCalibrationMode(calibrationMode === 'sample_red' ? 'none' : 'sample_red')}
              className={`px-2.5 py-1 rounded transition-colors ${
                calibrationMode === 'sample_red'
                  ? 'bg-red-600 text-white font-semibold shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              Sample Red (Click on object)
            </button>
            <button
              onClick={() => setCalibrationMode(calibrationMode === 'sample_yellow' ? 'none' : 'sample_yellow')}
              className={`px-2.5 py-1 rounded transition-colors ${
                calibrationMode === 'sample_yellow'
                  ? 'bg-yellow-500 text-slate-900 font-semibold shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              Sample Yellow (Click on object)
            </button>
            <button
              onClick={captureClosedBoxBaseline}
              className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 transition-colors shadow-2xs"
            >
              Capture Closed-Box Baseline
            </button>
          </div>
          <span className="text-amber-800 text-[11px]">
            Drag corners to resize BOX and TARGET zones
          </span>
        </div>
      )}

      {/* Self-Test Active Banner (FIX 7) */}
      {isSelfTestActive && (
        <div className="z-20 flex items-center justify-between px-4 py-2 bg-purple-50 border-b border-purple-200 text-purple-900 text-xs font-mono">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600 animate-spin" />
            <span className="font-semibold">
              Guided Self-Test in Progress ({selfTestRemainingSec}s remaining)
            </span>
          </div>
          <button
            onClick={stopSelfTest}
            className="text-[11px] underline text-purple-700 hover:text-purple-900 font-medium"
          >
            Cancel Test
          </button>
        </div>
      )}

      {/* Space Payload Interactive Toolbar (available in live camera and virtual mode) */}
      {sourceMode !== 'replay' && (
        <div className="z-20 flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-mono text-slate-700">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-cyan-800 font-bold uppercase tracking-wider text-[11px] mr-1 flex items-center gap-1">
              <Box className="w-3.5 h-3.5" /> Payload Controls:
            </span>
            <button
              onClick={toggleVirtualBox}
              className={`px-2.5 py-0.5 rounded text-[11px] transition-colors border shadow-2xs font-medium cursor-pointer ${
                runner.virtualCamera.boxOpen
                  ? 'bg-emerald-100 border-emerald-400 text-emerald-800 font-bold'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {runner.virtualCamera.boxOpen ? '✓ Box Lid: Open' : 'Box Lid: Slide Open'}
            </button>
            <button
              disabled={virtualActionInProgress !== null}
              onClick={() => runVirtualStep('PICK_RED')}
              className="px-2 py-0.5 rounded text-[11px] bg-red-100 hover:bg-red-200 border border-red-300 text-red-800 font-medium transition-colors disabled:opacity-50"
            >
              Pick Red
            </button>
            <button
              disabled={virtualActionInProgress !== null}
              onClick={() => runVirtualStep('PLACE_RED')}
              className="px-2 py-0.5 rounded text-[11px] bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-medium transition-colors disabled:opacity-50"
            >
              Place Red
            </button>
            <button
              disabled={virtualActionInProgress !== null}
              onClick={() => runVirtualStep('PICK_YELLOW')}
              className="px-2 py-0.5 rounded text-[11px] bg-yellow-100 hover:bg-yellow-200 border border-yellow-300 text-yellow-800 font-medium transition-colors disabled:opacity-50"
            >
              Pick Yellow
            </button>
            <button
              disabled={virtualActionInProgress !== null}
              onClick={() => runVirtualStep('PLACE_YELLOW')}
              className="px-2 py-0.5 rounded text-[11px] bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 text-yellow-700 font-medium transition-colors disabled:opacity-50"
            >
              Place Yellow
            </button>
            <button
              disabled={virtualActionInProgress !== null}
              onClick={() => runVirtualStep('WAVE_HAND')}
              className="px-2 py-0.5 rounded text-[11px] bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium transition-colors disabled:opacity-50 flex items-center gap-1 shadow-2xs"
            >
              <Hand className="w-3 h-3 text-cyan-600" />
              Wave Hand
            </button>
            <button
              disabled={virtualActionInProgress !== null}
              onClick={() => runVirtualStep('TOUCH_BOX')}
              className="px-2 py-0.5 rounded text-[11px] bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-medium transition-colors disabled:opacity-50 shadow-2xs"
            >
              Touch Box
            </button>
            <button
              disabled={virtualActionInProgress !== null}
              onClick={() => runVirtualStep('AUTO_PLAY')}
              className="px-2.5 py-0.5 rounded text-[11px] bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors shadow-xs disabled:opacity-50 flex items-center gap-1"
            >
              <Play className="w-3 h-3" />
              Auto Protocol
            </button>
          </div>
          <span className="text-cyan-800 text-[11px] font-semibold hidden md:inline flex items-center gap-1">
            <span>✋ Point → Pinch to Pick → Move → Release to Place.</span>
          </span>
        </div>
      )}

      {/* Main Video & Canvas Layered Stage (FIX 2) */}
      <div
        ref={containerRef}
        className="relative w-full aspect-4/3 bg-slate-900 flex items-center justify-center overflow-hidden"
      >
        {/* Layer 1: Live Video Feed (visible only when physical webcam is active) */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-contain ${
            sourceMode === 'live' && isPhysicalWebcamActive ? '' : 'hidden'
          }`}
        />

        {/* Layer 2: Overlay Canvas (Synchronized size via ResizeObserver) */}
        <canvas
          ref={overlayCanvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          className={`absolute inset-0 w-full h-full object-contain pointer-events-auto z-10 ${
            isCalibrating
              ? 'cursor-crosshair'
              : draggedObject !== 'none'
              ? 'cursor-grabbing'
              : hoverCursor === 'grab'
              ? 'cursor-grab'
              : hoverCursor === 'pointer'
              ? 'cursor-pointer'
              : hoverCursor === 'not-allowed'
              ? 'cursor-not-allowed'
              : 'cursor-default'
          }`}
        />

        {/* Camera Permission / Availability Card (when user selected Live Camera but webcam is unavailable) */}
        {sourceMode === 'live' && !isPhysicalWebcamActive && (
          <div className="z-30 absolute top-4 inset-x-6 p-4 rounded-xl bg-white border border-amber-300 text-slate-800 shadow-2xl backdrop-blur-md space-y-2.5 font-mono text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-700 font-bold">
                <Video className="w-4 h-4" />
                <span>Webcam Access Required</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-100 text-cyan-800 border border-cyan-300 font-semibold">
                Virtual Camera Running
              </span>
            </div>
            <p className="text-slate-600 font-sans text-xs leading-relaxed">
              {cameraError || 'Click below to allow browser camera access. Once active, you can hold blocks and open the box in front of your camera.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={activateCameraDirectly}
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Allow &amp; Start Webcam</span>
              </button>
              <button
                onClick={() => setSourceMode('virtual')}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs transition-colors flex items-center gap-1.5"
              >
                <span>Stay on Virtual Camera</span>
              </button>
            </div>
          </div>
        )}

        {/* Black Frame Warning Card (FIX 1) */}
        {heartbeat.isBlackFrame && sourceMode === 'live' && isPhysicalWebcamActive && (
          <div className="z-30 absolute inset-x-8 top-12 p-4 rounded-xl bg-rose-50 border-2 border-rose-400 text-rose-900 shadow-2xl text-center space-y-2 backdrop-blur-md">
            <div className="flex items-center justify-center gap-2 text-rose-700 font-bold text-sm font-mono">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
              <span>Camera frames are black. Close other camera apps and Retry.</span>
            </div>
            <p className="text-xs text-rose-700">
              The camera sensor is returning zero luminance. Ensure no other applications are holding the camera device.
            </p>
          </div>
        )}

        {/* Large Idle Overlay (FIX 5) */}
        {sessionState === 'idle' && !isSelfTestActive && (
          <div className="z-20 absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center pointer-events-none">
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-2xl max-w-sm pointer-events-auto space-y-3">
              <div className="w-12 h-12 rounded-full bg-cyan-100 border border-cyan-300 flex items-center justify-center mx-auto text-cyan-700">
                <Play className="w-6 h-6 ml-0.5" />
              </div>
              <h3 className="text-base font-bold text-slate-900 font-display">
                Press Start to begin
              </h3>
              <p className="text-xs text-slate-600 font-sans leading-relaxed">
                Autonomous optical tracking, speech guidance, and state machine validation are primed. Press Start to begin protocol verification with real-time voice lines.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={handleStartClick}
                  className="px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-semibold text-xs transition-colors shadow-md shadow-cyan-900/10 flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  <span>Start Experiment</span>
                </button>
                <button
                  onClick={startSelfTest}
                  className="px-4 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-xs transition-colors border border-slate-300"
                >
                  Run Self-Test
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Alert Banner */}
        {activeAlert && (
          <div
            role="alert"
            aria-live="assertive"
            className="z-20 absolute top-3 inset-x-3 p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center justify-between backdrop-blur-md shadow-lg font-mono"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <div>
                <span className="font-bold text-rose-800 mr-2 uppercase">
                  {activeAlert.status}:
                </span>
                <span>{activeAlert.message}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preflight Blocked Modal */}
      {preflightErrorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white border border-rose-300 rounded-xl p-5 shadow-2xl space-y-3 font-mono text-xs">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Preflight Diagnostic Failure</span>
            </div>
            <p className="text-slate-600 text-xs font-sans leading-relaxed">
              {preflightErrorModal}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setPreflightErrorModal(null)}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setPreflightErrorModal(null);
                  startSession(true); // Start anyway
                }}
                className="px-4 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-xs"
              >
                Start Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Camera Selector & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-2">
          {/* Source Mode Switcher */}
          <div className="flex items-center gap-1 p-0.5 rounded bg-white border border-slate-300 shadow-2xs">
            <button
              onClick={() => setSourceMode('virtual')}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                sourceMode === 'virtual'
                  ? 'bg-cyan-600 text-white font-medium shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Virtual Camera
            </button>
            <button
              onClick={activateCameraDirectly}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                sourceMode === 'live'
                  ? 'bg-cyan-600 text-white font-medium shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Live Webcam
            </button>
            <button
              onClick={() => setSourceMode('replay')}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                sourceMode === 'replay'
                  ? 'bg-cyan-600 text-white font-medium shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Replay
            </button>
          </div>

          {sourceMode === 'live' && (
            <div className="flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-cyan-600" />
              {cameraDevices.length > 0 ? (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => setSelectedDeviceId(e.target.value)}
                  className="bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-800 text-xs focus:outline-none focus:border-cyan-500 shadow-2xs"
                >
                  {cameraDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Camera Device ${i + 1}`}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-slate-500 text-[11px]">
                  {cameraLoading ? 'Connecting...' : isPhysicalWebcamActive ? 'Webcam Active' : 'No Webcam Detected'}
                </span>
              )}
            </div>
          )}

          {sourceMode === 'virtual' && (
            <span className="text-emerald-700 text-[11px] flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Autonomous Virtual Space Payload Feed
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 text-slate-600 text-[11px]">
          <span>Processing: 320×240</span>
          <span>
            FPS: <strong className="text-slate-900">{heartbeat.processingFPS}</strong>
          </span>
          <span>
            Box Sensor: <strong className="text-cyan-700 font-bold">{heartbeat.boxChangeRatio}%</strong>
          </span>
        </div>
      </div>
    </div>
  );
};

