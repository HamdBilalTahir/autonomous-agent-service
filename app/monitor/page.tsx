'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, ExternalLink, GitPullRequest, Clock, CheckCircle2, AlertCircle, CircleDot, ArrowLeft } from 'lucide-react';

interface PipelineState {
  ticketId: string;
  ticketSummary: string;
  node: string;
  nodeLabel: string;
  startedAt: number;
  updatedAt: number;
}

interface Ticket {
  key: string;
  summary: string;
  status: string;
  created: string;
  updated: string;
  priority: string | null;
  labels: string[];
  prUrl: string | null;
  pipeline: PipelineState | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  'In Progress':      { label: 'In Progress',   color: 'bg-blue-100 text-blue-700 border-blue-200',   icon: <CircleDot className="w-3 h-3" /> },
  'In Review':        { label: 'In Review',      color: 'bg-purple-100 text-purple-700 border-purple-200', icon: <GitPullRequest className="w-3 h-3" /> },
  'Done':             { label: 'Done',            color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  'To Do':            { label: 'To Do',           color: 'bg-slate-100 text-slate-600 border-slate-200', icon: <Clock className="w-3 h-3" /> },
  'Selected for Development': { label: 'Queued', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <AlertCircle className="w-3 h-3" /> },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, color: 'bg-slate-100 text-slate-600 border-slate-200', icon: <CircleDot className="w-3 h-3" /> };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const JIRA_BASE = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? 'kuailabs.atlassian.net';

export default function MonitorPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      if (!res.ok) throw new Error('Failed to fetch tickets');
      const data = await res.json();
      setTickets(data.tickets ?? []);
      setLastRefresh(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-refresh every 15s
  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 15_000);
    return () => clearInterval(interval);
  }, [fetchTickets]);

  // Tick every second for elapsed timers
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const running = tickets.filter((t) => t.pipeline !== null);
  const rest = tickets.filter((t) => t.pipeline === null);

  return (
    <main className="min-h-screen bg-[#F5EBFA] p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="flex items-center gap-1.5 text-sm text-[#49225B] hover:text-[#6E3482] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </a>
            <div>
              <h1 className="text-3xl font-extrabold text-[#49225B] tracking-tight">Ticket Monitor</h1>
              <p className="text-sm text-[#6E3482]/70 mt-0.5">
                Live view of AI-generated tickets and pipeline progress
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-xs text-slate-500">
                Updated {timeAgo(lastRefresh.toISOString())}
              </span>
            )}
            <button
              onClick={() => { setIsLoading(true); fetchTickets(); }}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-[#49225B] bg-white border border-[#E7DBEF] rounded-lg hover:bg-[#F5EBFA] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center gap-3 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {isLoading && tickets.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-[#6E3482]" />
          </div>
        ) : (
          <>
            {/* Running tickets */}
            {running.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-widest text-[#49225B]/50 mb-4">
                  Running ({running.length})
                </h2>
                <div className="space-y-3">
                  {running.map((ticket) => {
                    const elapsedMs = ticket.pipeline ? now - ticket.pipeline.startedAt : 0;
                    return (
                      <div key={ticket.key} className="rounded-xl border border-[#E7DBEF] bg-white shadow-[0_2px_10px_rgba(73,34,91,0.05)] p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="flex-shrink-0 mt-0.5">
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <a
                                  href={`https://${JIRA_BASE}/browse/${ticket.key}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-mono text-xs font-bold text-[#6E3482] hover:underline"
                                >
                                  {ticket.key}
                                </a>
                                <span className="text-sm font-medium text-slate-900 truncate">{ticket.summary}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-100 text-blue-700 border-blue-200">
                                  <CircleDot className="w-3 h-3" />
                                  {ticket.pipeline?.nodeLabel ?? ticket.status}
                                </span>
                                <span className="text-xs text-slate-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {elapsed(elapsedMs)}
                                </span>
                              </div>
                            </div>
                          </div>
                          {ticket.prUrl && (
                            <a
                              href={ticket.prUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#6E3482] bg-[#F5EBFA] border border-[#E7DBEF] rounded-lg hover:bg-[#E7DBEF] transition-colors"
                            >
                              <GitPullRequest className="w-3.5 h-3.5" /> PR
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* All tickets */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#49225B]/50 mb-4">
                All Tickets ({rest.length})
              </h2>
              {rest.length === 0 ? (
                <div className="rounded-xl border border-[#E7DBEF] bg-white p-12 text-center">
                  <p className="text-slate-500 text-sm">No tickets yet. Create some from the main page.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-[#E7DBEF] bg-white shadow-[0_2px_10px_rgba(73,34,91,0.05)] overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E7DBEF] bg-[#F5EBFA]/50">
                        <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#49225B]/60 w-28">Key</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#49225B]/60">Summary</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#49225B]/60 w-36">Status</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#49225B]/60 w-28">Updated</th>
                        <th className="px-5 py-3 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E7DBEF]">
                      {rest.map((ticket) => {
                        const sc = getStatusConfig(ticket.status);
                        return (
                          <tr key={ticket.key} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3.5">
                              <a
                                href={`https://${JIRA_BASE}/browse/${ticket.key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs font-bold text-[#6E3482] hover:underline"
                              >
                                {ticket.key}
                              </a>
                            </td>
                            <td className="px-5 py-3.5 text-slate-700 max-w-xs truncate">{ticket.summary}</td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sc.color}`}>
                                {sc.icon} {sc.label}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-xs text-slate-500">{timeAgo(ticket.updated)}</td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                {ticket.prUrl && (
                                  <a href={ticket.prUrl} target="_blank" rel="noopener noreferrer" title="View PR">
                                    <GitPullRequest className="w-4 h-4 text-slate-400 hover:text-[#6E3482] transition-colors" />
                                  </a>
                                )}
                                <a
                                  href={`https://${JIRA_BASE}/browse/${ticket.key}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open in Jira"
                                >
                                  <ExternalLink className="w-4 h-4 text-slate-400 hover:text-[#6E3482] transition-colors" />
                                </a>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
