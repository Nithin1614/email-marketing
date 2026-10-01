'use client';

import React, { useEffect, useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { 
  Activity, 
  Database, 
  MailCheck, 
  ShieldAlert, 
  RefreshCw, 
  Play, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Server, 
  Radio, 
  Check, 
  ArrowUpRight 
} from 'lucide-react';
import { apiClient } from '@/services/apiClient';

interface SystemHealthData {
  scheduler: {
    status: 'active' | 'warning' | 'offline';
    last_ping: string | null;
    seconds_ago: number | null;
    pending_queue: number;
    due_queue: number;
    explanation: string;
  };
  database: {
    used_mb: number;
    limit_mb: number;
    used_percentage: number;
    counts: {
      contacts: number;
      campaigns: number;
      templates: number;
      recipient_logs: number;
      test_logs: number;
    };
    explanation: string;
  };
  brevo: {
    api_configured: boolean;
    quota_used: number;
    quota_limit: number;
    quota_remaining: number;
    quota_percentage: number;
    blast_today: number;
    test_today: number;
    explanation: string;
  };
  bounce_radar: {
    bounce_rate: number;
    total_delivered: number;
    total_bounces: number;
    status: 'safe' | 'warning' | 'critical';
    threshold: string;
    explanation: string;
  };
  recent_webhooks: Array<{
    id: number;
    email: string;
    campaign_name: string;
    status: string;
    timestamp: string | null;
  }>;
}

interface DiagnosticResult {
  name: string;
  type: string;
  status: 'pass' | 'fail' | 'warning';
  latency_ms: number;
  message: string;
  explanation: string;
}

export default function SystemHealthPage() {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{
    overall_status: string;
    timestamp: string;
    results: DiagnosticResult[];
  } | null>(null);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);

  const [pruning, setPruning] = useState(false);
  const [pruneResult, setPruneResult] = useState<string | null>(null);

  useEffect(() => {
    loadHealthData();
  }, []);

  async function loadHealthData() {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/v1/system/health/');
      setData(res);
    } catch (err) {
      console.error('Failed to load system health:', err);
    } finally {
      setLoading(false);
    }
  }

  async function runDiagnostics() {
    setDiagnosticsRunning(true);
    setShowDiagnosticsModal(true);
    try {
      const res = await apiClient.post('/api/v1/system/run-diagnostics/', {});
      setDiagnostics(res);
    } catch (err) {
      console.error('Diagnostics failed:', err);
    } finally {
      setDiagnosticsRunning(false);
    }
  }

  async function pruneLogs() {
    if (!confirm('Are you sure you want to clean logs older than 90 days? Historical campaign summary stats will be preserved.')) {
      return;
    }
    setPruning(true);
    setPruneResult(null);
    try {
      const res = await apiClient.post('/api/v1/system/prune-logs/', {});
      setPruneResult(res.message || 'Pruning complete');
      loadHealthData();
      setTimeout(() => setPruneResult(null), 5000);
    } catch (err) {
      setPruneResult('Failed to prune logs');
    } finally {
      setPruning(false);
    }
  }

  function formatTimeAgo(seconds: number | null) {
    if (seconds === null || seconds === undefined) return 'Never';
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Activity className="text-emerald-500 w-8 h-8" />
              System Health & Operations
            </h1>
          </div>
          <p className="text-sm text-foreground/60 mt-1">
            Real-time infrastructure health, database storage, scheduler heartbeat, and email delivery engines.
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          <Button
            variant="outline"
            onClick={loadHealthData}
            disabled={loading}
            className="flex items-center gap-2 text-xs py-2 px-3"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>

          <Button
            variant="custom"
            onClick={runDiagnostics}
            disabled={diagnosticsRunning}
            className="bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 flex items-center gap-2 text-xs py-2 px-3.5 shadow-sm"
          >
            <Play size={14} className={diagnosticsRunning ? 'animate-pulse' : ''} />
            {diagnosticsRunning ? 'Probing Services...' : 'Run Diagnostics'}
          </Button>
        </div>
      </div>

      {pruneResult && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            {pruneResult}
          </span>
          <button onClick={() => setPruneResult(null)} className="text-foreground/50 hover:text-foreground text-xs">Dismiss</button>
        </div>
      )}

      {/* Top 4 Infrastructure Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Scheduler Heartbeat */}
        <Card className="flex flex-col justify-between p-5 border-card-border bg-surface">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold tracking-wider text-foreground/50 uppercase">Scheduler Heartbeat</span>
              <Radio className={`w-4 h-4 ${data?.scheduler.status === 'active' ? 'text-emerald-400 animate-pulse' : data?.scheduler.status === 'warning' ? 'text-amber-400' : 'text-red-400'}`} />
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold capitalize text-foreground">
                {loading ? 'Checking...' : data?.scheduler.status || 'Offline'}
              </span>
              {!loading && data?.scheduler.seconds_ago !== null && (
                <span className="text-xs text-foreground/50">
                  ({formatTimeAgo(data?.scheduler.seconds_ago ?? null)})
                </span>
              )}
            </div>

            <p className="text-xs text-foreground/60 mt-2 leading-relaxed">
              {data?.scheduler.explanation}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-foreground/50">Target: Active (&lt; 3m)</span>
            <span className="font-medium text-indigo-400">
              {data?.scheduler.pending_queue || 0} scheduled queue
            </span>
          </div>
        </Card>

        {/* Card 2: Database Storage Meter */}
        <Card className="flex flex-col justify-between p-5 border-card-border bg-surface">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold tracking-wider text-foreground/50 uppercase">Database Storage</span>
              <Database className="w-4 h-4 text-blue-400" />
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? '...' : `${data?.database.used_mb} MB`}
              </span>
              <span className="text-xs text-foreground/50">
                / {data?.database.limit_mb} MB ({data?.database.used_percentage}%)
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-foreground/10 rounded-full h-2 mt-3 overflow-hidden">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${
                  (data?.database.used_percentage || 0) > 85 ? 'bg-red-500' :
                  (data?.database.used_percentage || 0) > 65 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.max(4, data?.database.used_percentage || 0)}%` }}
              />
            </div>

            <p className="text-xs text-foreground/60 mt-2 leading-relaxed">
              {data?.database.explanation}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-foreground/50">Target: &lt; 70% used</span>
            <span className="font-medium text-foreground/80">
              {data?.database.counts.contacts || 0} contacts
            </span>
          </div>
        </Card>

        {/* Card 3: Brevo Engine & Quota */}
        <Card className="flex flex-col justify-between p-5 border-card-border bg-surface">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold tracking-wider text-foreground/50 uppercase">Brevo Relay Engine</span>
              <MailCheck className="w-4 h-4 text-emerald-400" />
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? '...' : `${data?.brevo.quota_used} / ${data?.brevo.quota_limit}`}
              </span>
              <span className="text-xs text-foreground/50">today</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-foreground/10 rounded-full h-2 mt-3 overflow-hidden">
              <div 
                className={`h-2 rounded-full transition-all duration-500 ${
                  (data?.brevo.quota_percentage || 0) > 90 ? 'bg-red-500' :
                  (data?.brevo.quota_percentage || 0) > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.max(4, data?.brevo.quota_percentage || 0)}%` }}
              />
            </div>

            <p className="text-xs text-foreground/60 mt-2 leading-relaxed">
              {data?.brevo.explanation}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-foreground/50">Remaining: {data?.brevo.quota_remaining || 0}</span>
            <span className="font-medium text-emerald-400">
              {data?.brevo.blast_today || 0} blasts, {data?.brevo.test_today || 0} tests
            </span>
          </div>
        </Card>

        {/* Card 4: Bounce Rate Radar */}
        <Card className="flex flex-col justify-between p-5 border-card-border bg-surface">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold tracking-wider text-foreground/50 uppercase">Account Bounce Radar</span>
              <ShieldAlert className={`w-4 h-4 ${data?.bounce_radar.status === 'safe' ? 'text-emerald-400' : 'text-amber-400'}`} />
            </div>

            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-bold text-foreground">
                {loading ? '...' : `${data?.bounce_radar.bounce_rate}%`}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                data?.bounce_radar.status === 'safe' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {data?.bounce_radar.status === 'safe' ? 'Safe' : 'Warning'}
              </span>
            </div>

            <p className="text-xs text-foreground/60 mt-3 leading-relaxed">
              {data?.bounce_radar.explanation}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
            <span className="text-foreground/50">Target: &lt; 3.0% (Limit: 4%)</span>
            <span className="font-medium text-foreground/80">
              {data?.bounce_radar.total_bounces || 0} bounces
            </span>
          </div>
        </Card>
      </div>

      {/* Middle Operations & Maintenance Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card className="p-5 border-card-border bg-surface md:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Server size={16} className="text-blue-400" />
                PostgreSQL Table Record Breakdown
              </h3>
              <p className="text-xs text-foreground/50 mt-0.5">
                Current row volume stored across your application entities.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={pruneLogs}
              disabled={pruning}
              className="text-xs py-1.5 px-3 flex items-center gap-1.5 text-foreground/70 hover:text-foreground"
            >
              <Trash2 size={13} className={pruning ? 'animate-spin' : ''} />
              {pruning ? 'Pruning...' : 'Prune 90-Day Logs'}
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
            <div className="bg-background/60 p-3 rounded-lg border border-border/30">
              <span className="text-xs text-foreground/50 block">Contacts</span>
              <span className="text-lg font-bold text-foreground mt-0.5 block">{data?.database.counts.contacts ?? 0}</span>
            </div>
            <div className="bg-background/60 p-3 rounded-lg border border-border/30">
              <span className="text-xs text-foreground/50 block">Campaigns</span>
              <span className="text-lg font-bold text-foreground mt-0.5 block">{data?.database.counts.campaigns ?? 0}</span>
            </div>
            <div className="bg-background/60 p-3 rounded-lg border border-border/30">
              <span className="text-xs text-foreground/50 block">Templates</span>
              <span className="text-lg font-bold text-foreground mt-0.5 block">{data?.database.counts.templates ?? 0}</span>
            </div>
            <div className="bg-background/60 p-3 rounded-lg border border-border/30">
              <span className="text-xs text-foreground/50 block">Recipient Logs</span>
              <span className="text-lg font-bold text-foreground mt-0.5 block">{data?.database.counts.recipient_logs ?? 0}</span>
            </div>
            <div className="bg-background/60 p-3 rounded-lg border border-border/30">
              <span className="text-xs text-foreground/50 block">Test Logs</span>
              <span className="text-lg font-bold text-foreground mt-0.5 block">{data?.database.counts.test_logs ?? 0}</span>
            </div>
          </div>
        </Card>

        {/* Quick Diagnostic Card */}
        <Card className="p-5 border-card-border bg-surface flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-1">
              <Play size={16} className="text-emerald-400" />
              1-Click System Diagnostics
            </h3>
            <p className="text-xs text-foreground/60 leading-relaxed">
              Instantly tests DB read/write latency, Brevo API authorization, and SMTP relay ports 587/2525.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-border/40">
            <Button
              variant="custom"
              onClick={runDiagnostics}
              disabled={diagnosticsRunning}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 text-xs py-2 flex items-center justify-center gap-2"
            >
              <Activity size={14} className={diagnosticsRunning ? 'animate-spin' : ''} />
              {diagnosticsRunning ? 'Probing Cloud Services...' : 'Run Diagnostics Probes'}
            </Button>
          </div>
        </Card>
      </div>

      {/* Recent Webhook Events Stream */}
      <Card className="p-5 border-card-border bg-surface">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock size={16} className="text-indigo-400" />
              Live Delivery &amp; Webhook Stream (Recent 10 Events)
            </h3>
            <p className="text-xs text-foreground/50 mt-0.5">
              Real-time events received from Brevo webhooks (Delivered, Opened, Clicked, Bounced).
            </p>
          </div>
          <span className="text-xs text-foreground/40 font-mono">Auto-refreshed with health status</span>
        </div>

        {(!data?.recent_webhooks || data.recent_webhooks.length === 0) ? (
          <div className="py-8 text-center text-xs text-foreground/50 border border-dashed border-border/40 rounded-lg">
            No webhook delivery events recorded yet. Send a test or live blast to see live events.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-border/40 text-foreground/50 uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Recipient Email</th>
                  <th className="py-2.5 px-3">Campaign</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Received At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {data.recent_webhooks.map((item) => (
                  <tr key={item.id} className="hover:bg-foreground/[0.02]">
                    <td className="py-2.5 px-3 font-medium text-foreground">{item.email}</td>
                    <td className="py-2.5 px-3 text-foreground/70">{item.campaign_name}</td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        item.status === 'opened' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                        item.status === 'clicked' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        item.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        item.status === 'failed' || item.status === 'hard_bounce' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-foreground/5 text-foreground/70'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-foreground/50">
                      {item.timestamp ? new Date(item.timestamp).toLocaleString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Diagnostics Modal */}
      {showDiagnosticsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-surface text-foreground border border-card-border rounded-xl shadow-2xl max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center space-x-2.5">
                <Activity size={18} className="text-emerald-400" />
                <h3 className="text-base font-semibold">Live System Diagnostics Probe</h3>
              </div>
              <button 
                onClick={() => setShowDiagnosticsModal(false)}
                className="text-foreground/50 hover:text-foreground text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {diagnosticsRunning ? (
              <div className="py-10 text-center space-y-3">
                <RefreshCw size={28} className="animate-spin text-emerald-400 mx-auto" />
                <p className="text-sm font-medium">Testing database, API credentials, and SMTP ports...</p>
                <p className="text-xs text-foreground/50">Measuring roundtrip network latency</p>
              </div>
            ) : diagnostics ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-foreground/[0.03] border border-border/40 text-xs">
                  <span className="text-foreground/70">Overall Infrastructure Status:</span>
                  <span className={`px-2 py-0.5 rounded font-semibold uppercase text-[11px] ${
                    diagnostics.overall_status === 'healthy' 
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}>
                    {diagnostics.overall_status}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {diagnostics.results.map((r, i) => (
                    <div key={i} className="p-3 rounded-lg bg-background/60 border border-border/40 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          {r.status === 'pass' ? (
                            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                          ) : r.status === 'warning' ? (
                            <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                          ) : (
                            <XCircle size={14} className="text-red-400 shrink-0" />
                          )}
                          {r.name}
                        </span>
                        <span className="text-[11px] font-mono text-foreground/60">{r.message}</span>
                      </div>
                      <p className="text-[11px] text-foreground/50 pl-5">{r.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-border/40">
              <Button
                variant="outline"
                onClick={() => setShowDiagnosticsModal(false)}
                className="text-xs py-1.5 px-4"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
