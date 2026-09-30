import React from 'react';
import { useAegisStore } from '../store/useAegisStore';
import { ExperimentGuidanceVisual } from '../components/ExperimentGuidanceVisual';
import {
  ShieldCheck,
  Radio,
  Sparkles,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Zap,
  Target,
  FileCheck,
} from 'lucide-react';

export const OverviewScreen: React.FC = () => {
  const { setActiveScreen, startWalkthrough } = useAegisStore();

  return (
    <div className="w-full pb-12">
      {/* Hero Section: Complete box from left to right end */}
      <section className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-6 w-auto relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-white via-cyan-50/50 to-slate-50 px-6 sm:px-10 lg:px-16 py-8 md:py-10 lg:py-12 shadow-xs">
        <div className="relative z-10 w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-4">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold font-display tracking-tight text-slate-900 leading-tight">
              Autonomous Experiment Guidance &amp; Interaction System
            </h1>

            <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-2xl">
              Real-time on-board computer vision and deterministic sequence verification for biological payload experiments in microgravity racks. Eliminates operator ambiguity through closed-loop multimodal voice guidance and sub-50ms fault detection.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={() => setActiveScreen('live')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold font-mono transition-colors shadow-md shadow-cyan-900/10 cursor-pointer"
              >
                <Radio className="w-4 h-4" />
                <span>Open Live Monitor</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>

              <button
                onClick={startWalkthrough}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold font-mono transition-colors shadow-2xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-cyan-600" />
                <span>Start Guided Walkthrough</span>
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 w-full">
            <ExperimentGuidanceVisual />
          </div>
        </div>
      </section>

      {/* Main Content Sections Container */}
      <div className="max-w-7xl mx-auto space-y-8 mt-8">
        {/* Operational Flow Strip: Problem -> Solution -> Intelligence -> Result -> Action -> Impact */}
      <section className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 font-bold">
          Operational Flow Architecture
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
          {[
            { step: '01', title: 'Problem', desc: 'Communication latency & high astronaut cognitive load during complex protocols.' },
            { step: '02', title: 'Solution', desc: 'On-device vision edge pipeline with overhead fixed payload camera.' },
            { step: '03', title: 'Intelligence', desc: 'Dual-tier perception: HSV color segmentation + hand kinematics.' },
            { step: '04', title: 'Result', desc: 'Unified confidence fusion verifying state, contact, and trajectory.' },
            { step: '05', title: 'Action', desc: 'State-machine enforcement with instant vocal feedback in < 50ms.' },
            { step: '06', title: 'Impact', desc: '100% protocol fidelity and verified immutable telemetry ground sync.' },
          ].map((item) => (
            <div
              key={item.step}
              className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5 flex flex-col justify-between shadow-2xs"
            >
              <div>
                <span className="text-cyan-700 font-bold block">{item.step} · {item.title}</span>
                <p className="text-[11px] text-slate-600 mt-1 font-sans leading-normal">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 Impact Tiles */}
      <section className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 font-bold">
          Core Mission Impact Dimensions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 mb-3">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm font-display">Mission Autonomy</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Operates self-sufficiently without reliance on continuous Earth communication links during orbital eclipse or Deep Space exploration.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm font-display">Error Reduction</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Eliminates specimen contamination, premature placement, or missed transfers with strict N-frame state confirmation and audio correction.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mb-3">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm font-display">Workload Optimization</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Reduces astronaut flight timeline consumption by replacing manual checklist paper cross-referencing with proactive voice prompts.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-2 shadow-2xs">
            <div className="w-9 h-9 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 mb-3">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 text-sm font-display">Science Integrity</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Generates cryptographic-ready audit trails of every manipulation event with tripartite before/action/after visual evidence.
            </p>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="p-6 rounded-xl bg-white border border-slate-200 space-y-4 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900 font-display">
          Key Engineering Capabilities
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900">Deterministic FSM Decision Table</span>
              <p className="text-slate-600 mt-0.5">
                Strict state transitions prevent race conditions, repeated steps, skipped picks, and wrong destination drops.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900">Self-Healing Error Recovery</span>
              <p className="text-slate-600 mt-0.5">
                Automatically detects when an operator restores a displaced specimen to its nominal snapshot, lifting alerts instantly.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900">Microgravity Drift &amp; Occlusion Invariant</span>
              <p className="text-slate-600 mt-0.5">
                Distinguishes between temporary hand occlusion (700ms grace window) and hazardous specimen loss, pausing the sequence safely.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900">99.4% Bandwidth Reduction</span>
              <p className="text-slate-600 mt-0.5">
                Transmits structured JSON telemetry logs instead of multi-gigabyte continuous video streams to ground mission control.
              </p>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
};
