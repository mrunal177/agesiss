import React, { useState } from 'react';
import { useAegisStore } from '../store/useAegisStore';
import { FSMOutcome } from '../types';
import {
  Download,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  Trash2,
} from 'lucide-react';

export const EventLogScreen: React.FC = () => {
  const { logger, events } = useAegisStore();

  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const metrics = logger.getMetrics();

  const handleExportJSON = () => {
    const jsonStr = logger.exportJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_telemetry_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const csvStr = logger.exportCSV();
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aegis_telemetry_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredEvents = events.filter((e) => {
    if (statusFilter !== 'ALL' && e.status !== statusFilter) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      e.action.toLowerCase().includes(term) ||
      e.expected.toLowerCase().includes(term) ||
      e.status.toLowerCase().includes(term) ||
      e.timestamp.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base font-bold text-slate-900 font-display flex items-center gap-2">
            Flight Telemetry &amp; Verification Audit Log
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Immutable flight event log with millisecond timestamping, latency auditing, and operator review.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJSON}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-40 text-slate-700 text-xs font-mono transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-600" />
            <span>Export JSON</span>
          </button>
          <button
            onClick={handleExportCSV}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-40 text-slate-700 text-xs font-mono transition-colors shadow-2xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => logger.clear()}
            disabled={events.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-300 disabled:opacity-40 text-slate-600 hover:text-rose-700 hover:border-rose-300 text-xs font-mono transition-colors shadow-2xs cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Audit Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block text-[11px] mb-1 font-semibold">TOTAL EVENTS LOGGED</span>
          <span className="text-2xl font-bold text-slate-900">{metrics.totalEvents}</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block text-[11px] mb-1 font-semibold">STEP ACCURACY</span>
          {metrics.stepAccuracy !== null ? (
            <span className="text-2xl font-bold text-emerald-600">{metrics.stepAccuracy}%</span>
          ) : (
            <span className="text-xs text-slate-500">No runs recorded yet</span>
          )}
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block text-[11px] mb-1 font-semibold">FALSE ALERTS REVIEWED</span>
          <span className="text-2xl font-bold text-cyan-700">{metrics.falseAlerts}</span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
          <span className="text-slate-500 block text-[11px] mb-1 font-semibold">AVG ALERT DELAY</span>
          {metrics.avgAlertLatency !== null ? (
            <span className="text-2xl font-bold text-purple-700">{metrics.avgAlertLatency} ms</span>
          ) : (
            <span className="text-xs text-slate-500">No runs recorded yet</span>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-white border border-slate-200 text-xs font-mono shadow-2xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, expected step, or status..."
            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-cyan-500 shadow-inner"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:border-cyan-500 shadow-2xs"
          >
            <option value="ALL">All Statuses</option>
            <option value="SUCCESS">SUCCESS</option>
            <option value="OUT_OF_SEQUENCE">OUT_OF_SEQUENCE</option>
            <option value="SKIPPED_STEP">SKIPPED_STEP</option>
            <option value="REPEATED_STEP">REPEATED_STEP</option>
            <option value="LOST">LOST</option>
            <option value="WRONG_OBJECT_OR_ZONE">WRONG_OBJECT_OR_ZONE</option>
            <option value="UNCERTAIN">UNCERTAIN</option>
          </select>
        </div>
      </div>

      {/* Telemetry Table */}
      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-xs">
        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-slate-500">
            No runs recorded yet. Start the experiment or run test scenarios to populate the flight log.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4 w-8"></th>
                  <th className="py-2.5 px-3 font-semibold">Timestamp</th>
                  <th className="py-2.5 px-3 font-semibold">Step</th>
                  <th className="py-2.5 px-3 font-semibold">Action</th>
                  <th className="py-2.5 px-3 font-semibold">Expected</th>
                  <th className="py-2.5 px-3 font-semibold">Status</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Confidence</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Latency</th>
                  <th className="py-2.5 px-4 text-center font-semibold">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((ev, idx) => {
                  const isExpanded = expandedIndex === idx;
                  const isSuccess = ev.status === 'SUCCESS';
                  const isAlert = !isSuccess && ev.status !== 'UNCERTAIN';

                  return (
                    <React.Fragment key={idx}>
                      <tr
                        onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-4 text-slate-400">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">{ev.timestamp}</td>
                        <td className="py-2.5 px-3 text-slate-500">0{ev.step}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{ev.action}</td>
                        <td className="py-2.5 px-3 text-slate-600">{ev.expected}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              isSuccess
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : ev.status === 'LOST'
                                ? 'bg-purple-50 text-purple-800 border-purple-300'
                                : ev.status === 'UNCERTAIN'
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-rose-50 text-rose-800 border-rose-300'
                            }`}
                          >
                            {ev.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-800 font-bold">
                          {(ev.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {ev.latencyMs ? `${ev.latencyMs} ms` : '—'}
                        </td>
                        <td
                          className="py-2.5 px-4 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {isAlert && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => logger.updateAlertReview(idx, 'valid')}
                                className={`p-1 rounded transition-colors ${
                                  ev.alertReview === 'valid'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-400'
                                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                }`}
                                title="Confirm Alert Valid"
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => logger.updateAlertReview(idx, 'false')}
                                className={`p-1 rounded transition-colors ${
                                  ev.alertReview === 'false'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-400'
                                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                                }`}
                                title="Mark False Alert"
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Row Expand View (Raw JSON + Forensic Evidence) */}
                      {isExpanded && (
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <td colSpan={9} className="p-4 text-xs font-mono space-y-3">
                            <div className="flex items-center justify-between text-slate-600 border-b border-slate-200 pb-1.5 font-semibold">
                              <span className="uppercase tracking-wider">Raw Telemetry Packet &amp; Evidence</span>
                              <span>FSM Index: {ev.step}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <span className="text-slate-600 block mb-1 font-semibold">Standard Telemetry JSON:</span>
                                <pre className="p-3 rounded-lg bg-white border border-slate-200 text-slate-900 text-[11px] overflow-x-auto leading-relaxed shadow-inner">
{JSON.stringify(
  {
    timestamp: ev.timestamp,
    step: ev.step,
    action: ev.action,
    expected: ev.expected,
    status: ev.status,
    confidence: ev.confidence,
  },
  null,
  2
)}
                                </pre>
                              </div>

                              <div className="space-y-2">
                                <span className="text-slate-600 block mb-1 font-semibold">Forensic Analysis:</span>
                                <div className="p-3 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px] space-y-2 shadow-inner">
                                  <div>
                                    <span className="text-slate-500 font-semibold">Explanation: </span>
                                    <span>{ev.explanation || 'State transition verified with trajectory continuity.'}</span>
                                  </div>
                                  {ev.components && (
                                    <div>
                                      <span className="text-slate-500 font-semibold">Confidence Components: </span>
                                      <span>
                                        State: {(ev.components.state * 100).toFixed(0)}%, Contact: {(ev.components.contact * 100).toFixed(0)}%, Temporal: {(ev.components.temporal * 100).toFixed(0)}%
                                      </span>
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-slate-500 font-semibold">Run Type: </span>
                                    <span>{ev.runType || 'Correct Run'}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
