import React, { useState } from 'react';
import { useAegisStore } from '../store/useAegisStore';
import { BoxMode, RegionOfInterest, TrackedObject } from '../types';
import {
  Sliders,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  Camera,
  Layers,
  Palette,
  Gauge,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

export const SetupWizard: React.FC = () => {
  const {
    isSetupWizardOpen,
    closeSetupWizard,
    boxMode,
    setBoxMode,
    boxROI,
    targetROI,
    setROIs,
    colors,
    setColors,
    fps,
    blurScore,
    isBlurry,
    isLowFPS,
    detector,
    fsm,
  } = useAegisStore();

  const [step, setStep] = useState<number>(1);
  const [selectedMode, setSelectedMode] = useState<BoxMode>(boxMode);
  const [tempBoxROI, setTempBoxROI] = useState<RegionOfInterest>({ ...boxROI });
  const [tempTargetROI, setTempTargetROI] = useState<RegionOfInterest>({ ...targetROI });
  const [preflightErrors, setPreflightErrors] = useState<string[]>([]);
  const [preflightPassed, setPreflightPassed] = useState<boolean>(false);

  if (!isSetupWizardOpen) return null;

  const handleRunPreflight = () => {
    const errors: string[] = [];
    const redState = detector.getObjectState('red');
    const yellowState = detector.getObjectState('yellow');

    if (selectedMode === 'A') {
      const redVisible = detector.getTrackedObjects().find((o: TrackedObject) => o.label === 'red')?.visible;
      const yellowVisible = detector.getTrackedObjects().find((o: TrackedObject) => o.label === 'yellow')?.visible;

      if (redVisible && yellowVisible && redState === 'TARGET_ZONE') {
        errors.push('Precondition failed: Target zone is not empty prior to start.');
      }
    }

    if (isBlurry) {
      errors.push('Precondition failed: Camera feed blur level exceeds limit (Laplacian < 60).');
    }

    if (errors.length > 0) {
      setPreflightErrors(errors);
      setPreflightPassed(false);
    } else {
      setPreflightErrors([]);
      setPreflightPassed(true);
    }
  };

  const handleFinish = () => {
    setBoxMode(selectedMode);
    setROIs(tempBoxROI, tempTargetROI);
    closeSetupWizard();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-cyan-600" />
            <h2 className="text-base font-bold text-slate-900 font-display">
              Payload Vision Calibration Wizard
            </h2>
          </div>
          <button
            onClick={closeSetupWizard}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-between text-xs font-mono">
          <span className="text-cyan-800 font-bold">Step {step} of 7</span>
          <span className="text-slate-600 font-semibold">
            {step === 1 && '1. Optical Sensor Selection'}
            {step === 2 && '2. Box Protocol Mode'}
            {step === 3 && '3. Box Region of Interest (ROI)'}
            {step === 4 && '4. Target Zone Calibration'}
            {step === 5 && '5. Color Spectral Segmentation'}
            {step === 6 && '6. Frame Quality & Illumination'}
            {step === 7 && '7. Mission Preflight Verification'}
          </span>
        </div>

        {/* Step Content */}
        <div className="p-6 overflow-y-auto flex-1 text-sm text-slate-700 space-y-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <Camera className="w-6 h-6 text-cyan-600 shrink-0" />
                <div>
                  <h3 className="font-bold text-slate-900">Fixed Overhead Payload Camera</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Sensor aligned with experimental chamber coordinate frame. Fixed focal length and resolution (320×240).
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                Select your live USB video capture device or use scenario replay for automated flight verification.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h3 className="font-bold text-slate-900">Select Box Detection Mode:</h3>
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  {
                    mode: 'A' as BoxMode,
                    title: 'Mode A — Lidded Box (Default)',
                    desc: 'Contents hidden until opened. Fires when red/yellow becomes visible inside box ROI for 5 frames after hand contact.',
                  },
                  {
                    mode: 'B' as BoxMode,
                    title: 'Mode B — Open-Top Box',
                    desc: 'Fires when operator hand dwells inside box ROI ≥ 500 ms and leaves for ≥ 300 ms.',
                  },
                  {
                    mode: 'C' as BoxMode,
                    title: 'Mode C — Lid Color Marker',
                    desc: 'Fires when lid marker blob area falls below 30% of baseline area or centroid shifts > 0.5× ROI width.',
                  },
                ].map((item) => (
                  <button
                    key={item.mode}
                    onClick={() => setSelectedMode(item.mode)}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedMode === item.mode
                        ? 'bg-cyan-50/70 border-cyan-400 text-cyan-950 font-medium ring-2 ring-cyan-200'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{item.title}</span>
                      {selectedMode === item.mode && <Check className="w-4 h-4 text-cyan-600 stroke-[3]" />}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900">Box Region Calibration</h3>
              <p className="text-xs text-slate-600">
                Adjust the normalized coordinates for the source containment box:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div>
                  <label className="text-slate-600 block mb-1 font-semibold">X Offset</label>
                  <input
                    type="number"
                    value={tempBoxROI.x}
                    onChange={(e) => setTempBoxROI({ ...tempBoxROI, x: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-semibold">Y Offset</label>
                  <input
                    type="number"
                    value={tempBoxROI.y}
                    onChange={(e) => setTempBoxROI({ ...tempBoxROI, y: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-semibold">Width</label>
                  <input
                    type="number"
                    value={tempBoxROI.w}
                    onChange={(e) => setTempBoxROI({ ...tempBoxROI, w: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-semibold">Height</label>
                  <input
                    type="number"
                    value={tempBoxROI.h}
                    onChange={(e) => setTempBoxROI({ ...tempBoxROI, h: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 shadow-inner"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900">Target Destination Zone Calibration</h3>
              <p className="text-xs text-slate-600">
                Adjust coordinates for destination target zone ROI:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                <div>
                  <label className="text-slate-600 block mb-1 font-semibold">X Offset</label>
                  <input
                    type="number"
                    value={tempTargetROI.x}
                    onChange={(e) => setTempTargetROI({ ...tempTargetROI, x: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-semibold">Y Offset</label>
                  <input
                    type="number"
                    value={tempTargetROI.y}
                    onChange={(e) => setTempTargetROI({ ...tempTargetROI, y: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-semibold">Width</label>
                  <input
                    type="number"
                    value={tempTargetROI.w}
                    onChange={(e) => setTempTargetROI({ ...tempTargetROI, w: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 shadow-inner"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-semibold">Height</label>
                  <input
                    type="number"
                    value={tempTargetROI.h}
                    onChange={(e) => setTempTargetROI({ ...tempTargetROI, h: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 shadow-inner"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900">Color Calibration Verification</h3>
              <p className="text-xs text-slate-600">
                Segmented HSV ranges for payload specimen containers:
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-red-500" />
                    <span className="font-bold text-xs text-slate-900">Red Specimen Container</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 space-y-1">
                    <div>H: [0, 10] ∪ [170, 180]</div>
                    <div>S: ≥ 120, V: ≥ 80</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-yellow-400" />
                    <span className="font-bold text-xs text-slate-900">Yellow Reagent Container</span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-600 space-y-1">
                    <div>H: [20, 35]</div>
                    <div>S: ≥ 120, V: ≥ 100</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900">Optical Quality & Illumination Inspection</h3>
              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block mb-1 font-semibold">PROCESSING FPS</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{fps}</span>
                    <span className="text-[11px] text-slate-500">Hz (Min: 15)</span>
                  </div>
                  <span className={`text-[10px] mt-1 block font-semibold ${isLowFPS ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {isLowFPS ? '▲ Sub-optimal frame rate' : '● Nominal throughput'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block mb-1 font-semibold">LAPLACIAN VARIANCE</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-900">{blurScore}</span>
                    <span className="text-[11px] text-slate-500">(Min: 60)</span>
                  </div>
                  <span className={`text-[10px] mt-1 block font-semibold ${isBlurry ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {isBlurry ? '▲ Focus or blur warning' : '● Image sharp and focused'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900">Preflight Invariant Check</h3>
              <p className="text-xs text-slate-600">
                Validates chamber preconditions before granting experiment start permission:
              </p>

              <button
                onClick={handleRunPreflight}
                className="w-full py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Execute Preflight Diagnostics</span>
              </button>

              {preflightPassed && (
                <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs flex items-center gap-2 font-medium">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0 stroke-[3]" />
                  <span>All preconditions satisfied. Experiment ready for autonomous execution.</span>
                </div>
              )}

              {preflightErrors.length > 0 && (
                <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 text-xs space-y-1 font-medium">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Preflight Blocked:</span>
                  </div>
                  {preflightErrors.map((err, i) => (
                    <div key={i} className="pl-5 text-rose-800">
                      • {err}
                    </div>
                  ))}
                  <div className="pl-5 text-slate-600 text-[11px] mt-1 italic">
                    Hint: Close the box so the red and yellow objects are hidden prior to start.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-200 bg-slate-50">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          {step < 7 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-xs cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Apply &amp; Save Calibration</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
