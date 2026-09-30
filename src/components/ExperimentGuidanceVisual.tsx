import React from 'react';
import { Eye, Shield, Activity, Crosshair, Sparkles } from 'lucide-react';

export const ExperimentGuidanceVisual: React.FC = () => {
  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-700/60 bg-slate-950 text-slate-100 shadow-xl shadow-cyan-950/20 group">
      {/* Top Telemetry Header Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 bg-slate-900/90 text-[10px] font-mono select-none">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
          </span>
          <span className="text-cyan-400 font-semibold tracking-wider">CAM-01 · OVERHEAD CV</span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">MICROGRAVITY RACK #4</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400 font-medium">
          <span className="text-emerald-400 font-semibold">60 FPS</span>
          <span className="text-slate-600">·</span>
          <span>1080P</span>
        </div>
      </div>

      {/* SVG Experiment Viewfinder & Laboratory Graphic */}
      <div className="relative aspect-[16/10] sm:aspect-[16/10] w-full bg-slate-950 overflow-hidden">
        {/* Subtle Background Grid */}
        <div 
          className="absolute inset-0 opacity-15"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)`,
            backgroundSize: '20px 20px'
          }}
        />

        {/* Scanline Sweep Effect */}
        <div className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-cyan-500/10 to-transparent pointer-events-none animate-[scanline_4s_linear_infinite]" />

        {/* Scaled SVG Vector Representation of Payload Chamber */}
        <svg
          className="w-full h-full p-2 select-none"
          viewBox="0 0 400 250"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Chamber Outline & Guidewires */}
          <rect
            x="20"
            y="20"
            width="360"
            height="210"
            rx="12"
            stroke="#334155"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Corner HUD Brackets */}
          {/* Top Left */}
          <path d="M 26 38 L 26 26 L 38 26" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          {/* Top Right */}
          <path d="M 374 38 L 374 26 L 362 26" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          {/* Bottom Left */}
          <path d="M 26 212 L 26 224 L 38 224" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          {/* Bottom Right */}
          <path d="M 374 212 L 374 224 L 362 224" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />

          {/* Center Safe Experiment Field */}
          <rect
            x="45"
            y="40"
            width="310"
            height="170"
            rx="8"
            fill="#0f172a"
            fillOpacity="0.75"
            stroke="#1e293b"
            strokeWidth="1"
          />

          {/* Containment Box (Left Zone) */}
          <g transform="translate(60, 65)">
            {/* Box Body */}
            <rect
              x="0"
              y="0"
              width="125"
              height="115"
              rx="6"
              fill="#090d16"
              stroke="#38bdf8"
              strokeWidth="1.5"
              strokeOpacity="0.8"
            />
            {/* Box Interior Rack Lines */}
            <line x1="15" y1="58" x2="110" y2="58" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
            
            {/* Red Specimen in Box */}
            <g transform="translate(32, 28)">
              {/* Bounding Box Brackets */}
              <rect x="-16" y="-16" width="32" height="32" rx="4" stroke="#ef4444" strokeWidth="1.5" fill="#ef4444" fillOpacity="0.15" />
              <circle cx="0" cy="0" r="10" fill="#ef4444" />
              <circle cx="0" cy="0" r="3" fill="#ffffff" />
              {/* Specimen Label */}
              <text x="-16" y="-20" fill="#f87171" fontSize="7" fontFamily="monospace" fontWeight="bold">
                OBJ_RED [99.4%]
              </text>
            </g>

            {/* Yellow Specimen in Box */}
            <g transform="translate(90, 28)">
              {/* Bounding Box Brackets */}
              <rect x="-16" y="-16" width="32" height="32" rx="4" stroke="#eab308" strokeWidth="1.5" fill="#eab308" fillOpacity="0.15" />
              <circle cx="0" cy="0" r="10" fill="#eab308" />
              <circle cx="0" cy="0" r="3" fill="#ffffff" />
              {/* Specimen Label */}
              <text x="-16" y="-20" fill="#facc15" fontSize="7" fontFamily="monospace" fontWeight="bold">
                OBJ_YEL [98.7%]
              </text>
            </g>

            {/* Box Lid / Sliding Cover */}
            <rect
              x="-2"
              y="-10"
              width="129"
              height="20"
              rx="4"
              fill="#1e293b"
              stroke="#06b6d4"
              strokeWidth="1.5"
            />
            {/* Lid Handle / Cyan Latch */}
            <rect x="47" y="-7" width="35" height="6" rx="2" fill="#06b6d4" />
            <text x="64.5" y="-15" fill="#22d3ee" fontSize="7" fontFamily="monospace" textAnchor="middle" fontWeight="bold">
              TOUCHLESS LID LATCH
            </text>
          </g>

          {/* Target Slots (Right Zone) */}
          <g transform="translate(235, 65)">
            {/* Slot A: Red Target Zone */}
            <g transform="translate(0, 5)">
              <rect
                x="0"
                y="0"
                width="110"
                height="50"
                rx="6"
                fill="#181216"
                stroke="#ef4444"
                strokeWidth="1.2"
                strokeDasharray="4 2"
              />
              <circle cx="55" cy="25" r="14" stroke="#ef4444" strokeWidth="1" strokeDasharray="2 2" />
              <path d="M 55 13 L 55 37 M 43 25 L 67 25" stroke="#ef4444" strokeWidth="0.8" />
              <text x="8" y="14" fill="#f87171" fontSize="7" fontFamily="monospace" fontWeight="bold">
                TARGET ZONE A
              </text>
              <text x="8" y="44" fill="#991b1b" fontSize="6.5" fontFamily="monospace">
                SLOT: [RED SPECIMEN]
              </text>
            </g>

            {/* Slot B: Yellow Target Zone */}
            <g transform="translate(0, 62)">
              <rect
                x="0"
                y="0"
                width="110"
                height="50"
                rx="6"
                fill="#1c1912"
                stroke="#eab308"
                strokeWidth="1.2"
                strokeDasharray="4 2"
              />
              <circle cx="55" cy="25" r="14" stroke="#eab308" strokeWidth="1" strokeDasharray="2 2" />
              <path d="M 55 13 L 55 37 M 43 25 L 67 25" stroke="#eab308" strokeWidth="0.8" />
              <text x="8" y="14" fill="#facc15" fontSize="7" fontFamily="monospace" fontWeight="bold">
                TARGET ZONE B
              </text>
              <text x="8" y="44" fill="#854d0e" fontSize="6.5" fontFamily="monospace">
                SLOT: [YELLOW SPECIMEN]
              </text>
            </g>
          </g>

          {/* Touchless Hand Kinematics Vector Pointer */}
          <g transform="translate(122, 48)">
            {/* Dashed Tracking Beam */}
            <line x1="0" y1="0" x2="-2" y2="7" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 2" />
            {/* Tracking Crosshair Reticle */}
            <circle cx="0" cy="0" r="12" stroke="#38bdf8" strokeWidth="1.2" />
            <circle cx="0" cy="0" r="4" fill="#06b6d4" />
            <path d="M -15 0 L -8 0 M 8 0 L 15 0 M 0 -15 L 0 -8 M 0 8 L 0 15" stroke="#38bdf8" strokeWidth="1" />
            {/* Vector Label */}
            <rect x="16" y="-12" width="76" height="15" rx="3" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.8" />
            <text x="20" y="-2" fill="#38bdf8" fontSize="6.5" fontFamily="monospace" fontWeight="bold">
              INDEX_TIP [PINCH]
            </text>
          </g>

          {/* Center Transfer Arrow / Trajectory */}
          <path
            d="M 175 110 C 200 80, 215 85, 235 90"
            stroke="#06b6d4"
            strokeWidth="1.2"
            strokeDasharray="3 3"
            markerEnd="url(#cyan-arrow)"
          />
          <defs>
            <marker id="cyan-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
            </marker>
          </defs>

          {/* Protocol State HUD Floating Tag */}
          <g transform="translate(130, 202)">
            <rect x="0" y="0" width="140" height="20" rx="4" fill="#020617" stroke="#334155" strokeWidth="1" />
            <circle cx="10" cy="10" r="3" fill="#10b981" />
            <text x="18" y="13" fill="#e2e8f0" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
              FSM: DETERMINISTIC STEP 0
            </text>
          </g>
        </svg>

        {/* Live Overlay HUD Indicators */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none text-[9px] font-mono">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700/80 text-cyan-300">
            <Crosshair className="w-3 h-3 text-cyan-400" />
            <span>HSV + KINEMATICS ENGINE</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900/90 border border-slate-700/80 text-emerald-400">
            <span>ACCURACY: 99.4%</span>
          </div>
        </div>
      </div>

      {/* Bottom Sub-bar */}
      <div className="px-3.5 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-[11px] font-mono text-slate-300">Multimodal Closed-Loop Vision</span>
        </div>
        <span className="text-[10px] font-mono text-cyan-400/90 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/60">
          Zero-Fault Telemetry
        </span>
      </div>
    </div>
  );
};
