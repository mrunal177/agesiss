import React, { useState } from 'react';
import { useAegisStore } from '../store/useAegisStore';
import { ALTERNATE_PROTOCOL, PRIMARY_PROTOCOL } from '../data/protocols';
import { ProtocolConfig, ProtocolStep } from '../types';
import {
  FileCode2,
  Check,
  RotateCcw,
  Sparkles,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Gauge,
  Sliders,
} from 'lucide-react';

export const ProtocolScreen: React.FC = () => {
  const { protocol, setProtocol, gemini, fps, blurScore, isBlurry, isLowFPS } = useAegisStore();

  const [jsonText, setJsonText] = useState<string>(JSON.stringify(protocol, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<boolean>(false);

  const [naturalText, setNaturalText] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsedPreview, setParsedPreview] = useState<ProtocolStep[] | null>(null);

  const handleApplyJSON = () => {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        throw new Error('Protocol must include a non-empty "steps" array.');
      }
      setProtocol(parsed as ProtocolConfig);
      setJsonError(null);
      setApplySuccess(true);
      setTimeout(() => setApplySuccess(false), 2500);
    } catch (err: any) {
      setJsonError(err.message || 'Invalid JSON syntax');
    }
  };

  const handleLoadAlternate = () => {
    setProtocol(ALTERNATE_PROTOCOL);
    setJsonText(JSON.stringify(ALTERNATE_PROTOCOL, null, 2));
    setJsonError(null);
  };

  const handleResetDefault = () => {
    setProtocol(PRIMARY_PROTOCOL);
    setJsonText(JSON.stringify(PRIMARY_PROTOCOL, null, 2));
    setJsonError(null);
  };

  const handleParseNatural = async () => {
    if (!naturalText.trim()) return;
    setIsParsing(true);
    const steps = await gemini.parseNaturalProtocol(naturalText);
    setParsedPreview(steps);
    setIsParsing(false);
  };

  const handleApplyParsed = () => {
    if (!parsedPreview) return;
    const newConfig: ProtocolConfig = {
      ...protocol,
      name: 'Custom Parsed Biological Protocol',
      steps: parsedPreview,
    };
    setProtocol(newConfig);
    setJsonText(JSON.stringify(newConfig, null, 2));
    setParsedPreview(null);
    setNaturalText('');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
            Payload Experiment Protocol Specification
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Synchronized sequence schema, precondition gates, and natural procedure ingestion.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLoadAlternate}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-mono border border-slate-300 transition-colors shadow-2xs cursor-pointer"
          >
            Load Alternate 4-Step Protocol
          </button>
          <button
            onClick={handleResetDefault}
            className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 text-xs font-mono border border-slate-300 transition-colors shadow-2xs cursor-pointer"
          >
            Reset Default
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): JSON/YAML Editor & Step Flow */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3 shadow-xs">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-700 font-bold uppercase tracking-wider">Protocol Configuration (JSON)</span>
              {applySuccess && (
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Schema Applied
                </span>
              )}
            </div>

            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setJsonError(null);
              }}
              rows={14}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs font-mono text-slate-900 focus:outline-none focus:border-cyan-500 selection:bg-cyan-500/20 leading-relaxed resize-y shadow-inner"
            />

            {jsonError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center gap-2 font-mono">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{jsonError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleApplyJSON}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-semibold transition-colors shadow-xs cursor-pointer"
              >
                Validate &amp; Apply Protocol
              </button>
            </div>
          </div>

          {/* Parsed Step-Flow List */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3 shadow-xs">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-700 font-bold block">
              Active Step Flow Invariants
            </span>
            <div className="space-y-2">
              {protocol.steps.map((st, i) => (
                <div
                  key={st.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-cyan-700 font-bold">0{i + 1}</span>
                    <span className="text-slate-900 font-bold">{st.name}</span>
                    <span className="text-slate-500">· Type: {st.type}</span>
                    <span className="text-slate-500">· Object: {st.object}</span>
                  </div>
                  <span className="text-slate-600 italic font-sans text-[11px] truncate max-w-xs">
                    &ldquo;{st.voice}&rdquo;
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Pre/Post Conditions, Frame Quality, Natural Language Parser */}
        <div className="lg:col-span-5 space-y-4">
          {/* Preconditions & Postconditions */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3 shadow-xs">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-700 font-bold block">
              Invariants &amp; Boundary Conditions
            </span>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 space-y-1.5">
                <span className="text-amber-800 font-bold text-[11px] block">
                  PRECONDITIONS (Checked at Start):
                </span>
                {protocol.preconditions.map((p, i) => (
                  <div key={i} className="text-slate-700 flex items-center gap-2 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>

              <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1.5">
                <span className="text-emerald-800 font-bold text-[11px] block">
                  POSTCONDITIONS (Verified at Complete):
                </span>
                {protocol.postconditions.map((p, i) => (
                  <div key={i} className="text-slate-700 flex items-center gap-2 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Frame Quality Diagnostics Panel */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3 font-mono text-xs shadow-xs">
            <span className="text-slate-700 font-bold uppercase tracking-wider block">
              Optical Quality Gate
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-semibold">CURRENT FPS</span>
                <span className={`text-xl font-bold ${isLowFPS ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {fps}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Threshold: ≥ 15</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-500 block text-[10px] font-semibold">LAPLACIAN BLUR</span>
                <span className={`text-xl font-bold ${isBlurry ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {blurScore}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Threshold: ≥ 60</span>
              </div>
            </div>
          </div>

          {/* Protocol Parser (Natural Language Ingestion) */}
          <div className="p-5 rounded-xl bg-white border border-slate-200 space-y-3 shadow-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-mono uppercase tracking-wider text-slate-800 font-bold">
                Natural-Language Protocol Parser
              </span>
            </div>
            <p className="text-xs text-slate-600">
              Converts plain English protocol procedures into structured JSON steps via Gemini with deterministic regex fallback.
            </p>

            <textarea
              value={naturalText}
              onChange={(e) => setNaturalText(e.target.value)}
              placeholder="e.g. First open the experiment box. Then pick the red specimen tube and place it in the target zone. Next pick the yellow tube and deposit it in the target zone."
              rows={3}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 font-sans focus:outline-none focus:border-cyan-500 shadow-inner"
            />

            <button
              onClick={handleParseNatural}
              disabled={isParsing || !naturalText.trim()}
              className="w-full py-2 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-300 text-purple-900 text-xs font-mono font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span>{isParsing ? 'Parsing Structure...' : 'Parse Procedure'}</span>
            </button>

            {parsedPreview && (
              <div className="p-3.5 rounded-lg bg-purple-50/50 border border-purple-300 space-y-2 text-xs font-mono">
                <span className="text-purple-900 font-bold block">
                  Generated {parsedPreview.length} Steps:
                </span>
                <div className="space-y-1 text-slate-700">
                  {parsedPreview.map((s, idx) => (
                    <div key={idx}>
                      • {s.name} ({s.type}) - {s.object}
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleApplyParsed}
                  className="w-full py-1.5 mt-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-semibold transition-colors shadow-xs cursor-pointer"
                >
                  Accept &amp; Overwrite Active Protocol
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
