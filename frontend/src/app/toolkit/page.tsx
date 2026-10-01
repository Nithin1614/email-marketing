'use client';

import React, { useState, useEffect } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { 
  Users, 
  Download, 
  CheckCircle2, 
  RefreshCw, 
  Wrench, 
  Check, 
  FileSpreadsheet,
  FileText,
  Database,
  File
} from 'lucide-react';
import { apiClient } from '@/services/apiClient';

interface ContactHygieneResponse {
  dry_run: boolean;
  total_scanned: number;
  cleanliness_score: number;
  target: string;
  duplicates_count: number;
  typos_count: number;
  syntax_errors_count: number;
  duplicates: Array<{ id: number; name: string; email: string }>;
  typos: Array<{ id: number; name: string; original_email: string; corrected_email: string; typo: string; suggestion: string }>;
  syntax_errors: Array<{ id: number; name: string; email: string; issue: string }>;
  fixed_typos_count: number;
  deduped_count: number;
  explanation: string;
}

export default function ToolkitPage() {
  const [activeTab, setActiveTab] = useState<'hygiene' | 'backup'>('hygiene');

  // Contact Hygiene State
  const [hygieneLoading, setHygieneLoading] = useState(false);
  const [fixingHygiene, setFixingHygiene] = useState(false);
  const [hygieneResult, setHygieneResult] = useState<ContactHygieneResponse | null>(null);
  const [fixSuccessMessage, setFixSuccessMessage] = useState<string | null>(null);

  // Backup State
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  useEffect(() => {
    // Initial hygiene scan on page load
    runHygieneScan(true);
  }, []);

  async function runHygieneScan(dryRun: boolean = true) {
    if (dryRun) {
      setHygieneLoading(true);
    } else {
      setFixingHygiene(true);
    }
    setFixSuccessMessage(null);
    try {
      const res = await apiClient.post('/api/v1/toolkit/clean-contacts/', { dry_run: dryRun });
      setHygieneResult(res);
      if (!dryRun) {
        setFixSuccessMessage(`Successfully updated ${res.fixed_typos_count} typos and merged ${res.deduped_count} duplicate contacts!`);
      }
    } catch (err) {
      console.error('Hygiene scan failed:', err);
    } finally {
      setHygieneLoading(false);
      setFixingHygiene(false);
    }
  }

  async function downloadBackup(format: 'json' | 'xlsx' | 'csv' | 'pdf') {
    setDownloadingFormat(format);
    try {
      const nowStr = new Date().toISOString().slice(0, 10);
      let filename = `email_marketing_backup_${nowStr}.json`;
      if (format === 'xlsx') filename = `email_marketing_backup_${nowStr}.xlsx`;
      else if (format === 'csv') filename = `contacts_export_${nowStr}.csv`;
      else if (format === 'pdf') filename = `email_marketing_summary_${nowStr}.pdf`;

      await apiClient.download(`/api/v1/toolkit/backup/?export_format=${format}&format=${format}`, filename);
    } catch (err) {
      console.error(`Failed to download ${format} backup:`, err);
      alert(`Failed to download ${format.toUpperCase()} export. Please try again.`);
    } finally {
      setDownloadingFormat(null);
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Wrench className="text-blue-400 w-8 h-8" />
              Marketing Toolkit
            </h1>
          </div>
          <p className="text-sm text-foreground/60 mt-1">
            Clean subscriber lists, fix domain typos, and export database backups.
          </p>
        </div>
      </div>

      {/* Clean Top Tabs Navigation */}
      <div className="flex items-center space-x-2 border-b border-border/40 overflow-x-auto pb-px">
        <button
          onClick={() => {
            setActiveTab('hygiene');
            if (!hygieneResult) runHygieneScan(true);
          }}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'hygiene'
              ? 'border-blue-500 text-blue-400 bg-blue-500/10'
              : 'border-transparent text-foreground/60 hover:text-foreground hover:bg-foreground/[0.03]'
          }`}
        >
          <Users size={16} />
          Contact Cleaner &amp; Deduplicator
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap ${
            activeTab === 'backup'
              ? 'border-blue-500 text-blue-400 bg-blue-500/10'
              : 'border-transparent text-foreground/60 hover:text-foreground hover:bg-foreground/[0.03]'
          }`}
        >
          <Download size={16} />
          Database Backup &amp; Export
        </button>
      </div>

      {/* TAB 2: CONTACT HYGIENE & DEDUPLICATOR */}
      {activeTab === 'hygiene' && (
        <div className="space-y-6">
          <Card className="p-5 border-card-border bg-surface">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Contact List Cleaner &amp; Deduplicator</h3>
                <p className="text-xs text-foreground/50 mt-0.5">
                  Scans your database for popular domain typos (e.g. @gamil.com), invalid email syntaxes, and duplicate contacts across lists.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => runHygieneScan(true)}
                  disabled={hygieneLoading}
                  className="text-xs py-1.5 px-3 flex items-center gap-1.5"
                >
                  <RefreshCw size={13} className={hygieneLoading ? 'animate-spin' : ''} />
                  {hygieneLoading ? 'Scanning...' : 'Scan Contacts'}
                </Button>

                {hygieneResult && (hygieneResult.typos_count > 0 || hygieneResult.duplicates_count > 0) && (
                  <Button
                    variant="custom"
                    onClick={() => runHygieneScan(false)}
                    disabled={fixingHygiene}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <Check size={13} className={fixingHygiene ? 'animate-spin' : ''} />
                    {fixingHygiene ? 'Fixing Contacts...' : 'Auto-Fix Typos & Deduplicate'}
                  </Button>
                )}
              </div>
            </div>

            {fixSuccessMessage && (
              <div className="mt-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  {fixSuccessMessage}
                </span>
                <button onClick={() => setFixSuccessMessage(null)} className="text-foreground/50 hover:text-foreground text-xs">Dismiss</button>
              </div>
            )}

            {/* Stat Row */}
            {hygieneResult && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border/40">
                <div className="p-3 bg-background/60 rounded-lg border border-border/30">
                  <span className="text-[11px] text-foreground/50 block">Cleanliness Score</span>
                  <span className="text-lg font-bold text-foreground mt-0.5 block">{hygieneResult.cleanliness_score}%</span>
                  <span className="text-[10px] text-emerald-400 block mt-0.5">Target: 98%+ Valid</span>
                </div>
                <div className="p-3 bg-background/60 rounded-lg border border-border/30">
                  <span className="text-[11px] text-foreground/50 block">Total Scanned</span>
                  <span className="text-lg font-bold text-foreground mt-0.5 block">{hygieneResult.total_scanned}</span>
                </div>
                <div className="p-3 bg-background/60 rounded-lg border border-border/30">
                  <span className="text-[11px] text-foreground/50 block">Domain Typos</span>
                  <span className={`text-lg font-bold mt-0.5 block ${hygieneResult.typos_count > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                    {hygieneResult.typos_count}
                  </span>
                </div>
                <div className="p-3 bg-background/60 rounded-lg border border-border/30">
                  <span className="text-[11px] text-foreground/50 block">Duplicates</span>
                  <span className={`text-lg font-bold mt-0.5 block ${hygieneResult.duplicates_count > 0 ? 'text-amber-400' : 'text-foreground'}`}>
                    {hygieneResult.duplicates_count}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Detailed Typos & Issues Table */}
          {hygieneResult && hygieneResult.typos.length > 0 && (
            <Card className="p-5 border-card-border bg-surface">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                Detected Domain Typos ({hygieneResult.typos.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border/40 text-foreground/50 uppercase text-[11px]">
                      <th className="py-2 px-3">Contact</th>
                      <th className="py-2 px-3">Current Email</th>
                      <th className="py-2 px-3">Typo Found</th>
                      <th className="py-2 px-3">Corrected Suggestion</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {hygieneResult.typos.map((t) => (
                      <tr key={t.id} className="hover:bg-foreground/[0.02]">
                        <td className="py-2 px-3 font-medium text-foreground">{t.name || 'Unnamed'}</td>
                        <td className="py-2 px-3 font-mono text-red-400">{t.original_email}</td>
                        <td className="py-2 px-3 font-mono text-foreground/60">{t.typo}</td>
                        <td className="py-2 px-3 font-mono text-emerald-400 font-semibold">{t.corrected_email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {hygieneResult && hygieneResult.duplicates.length > 0 && (
            <Card className="p-5 border-card-border bg-surface">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                Duplicate Email Contacts ({hygieneResult.duplicates.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-border/40 text-foreground/50 uppercase text-[11px]">
                      <th className="py-2 px-3">Name</th>
                      <th className="py-2 px-3">Duplicate Email</th>
                      <th className="py-2 px-3">Action Required</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {hygieneResult.duplicates.map((d, i) => (
                      <tr key={i} className="hover:bg-foreground/[0.02]">
                        <td className="py-2 px-3 font-medium text-foreground">{d.name || 'Unnamed'}</td>
                        <td className="py-2 px-3 font-mono text-amber-400">{d.email}</td>
                        <td className="py-2 px-3 text-foreground/60">Merge into single contact</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {hygieneResult && hygieneResult.typos_count === 0 && hygieneResult.duplicates_count === 0 && (
            <Card className="p-8 border-card-border bg-surface text-center">
              <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-foreground">Clean Subscriber List</h3>
              <p className="text-xs text-foreground/50 mt-1">
                Zero domain typos or duplicate email addresses were found across your database contacts.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* TAB 3: DATABASE BACKUP & EXPORT */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          <Card className="p-6 border-card-border bg-surface space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Download size={16} className="text-blue-400" />
                Data Export &amp; Database Backup
              </h3>
              <p className="text-xs text-foreground/50 mt-1">
                Export your subscribers, email templates, campaigns, and delivery logs in your preferred file format.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Option 1: Excel */}
              <div className="p-4 rounded-lg border border-border/60 bg-background/50 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                    <FileSpreadsheet size={16} className="text-emerald-400" />
                    Excel Workbook (.xlsx)
                  </div>
                  <p className="text-xs text-foreground/60 leading-relaxed">
                    Formatted multi-tab spreadsheet containing Contacts, Campaigns, Email Templates, and Bounce Logs.
                  </p>
                </div>
                <div className="pt-4">
                  <Button
                    variant="custom"
                    onClick={() => downloadBackup('xlsx')}
                    disabled={downloadingFormat !== null}
                    className="w-full bg-surface hover:bg-surface/80 text-foreground border border-border/60 text-xs py-2 px-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Download size={13} className={downloadingFormat === 'xlsx' ? 'animate-spin' : ''} />
                    {downloadingFormat === 'xlsx' ? 'Preparing Excel...' : 'Download Excel (.xlsx)'}
                  </Button>
                </div>
              </div>

              {/* Option 2: CSV */}
              <div className="p-4 rounded-lg border border-border/60 bg-background/50 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                    <FileText size={16} className="text-sky-400" />
                    Contacts CSV (.csv)
                  </div>
                  <p className="text-xs text-foreground/60 leading-relaxed">
                    Universal comma-separated table of all contact emails, names, subscriber lists, and subscription statuses.
                  </p>
                </div>
                <div className="pt-4">
                  <Button
                    variant="custom"
                    onClick={() => downloadBackup('csv')}
                    disabled={downloadingFormat !== null}
                    className="w-full bg-surface hover:bg-surface/80 text-foreground border border-border/60 text-xs py-2 px-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Download size={13} className={downloadingFormat === 'csv' ? 'animate-spin' : ''} />
                    {downloadingFormat === 'csv' ? 'Preparing CSV...' : 'Download CSV (.csv)'}
                  </Button>
                </div>
              </div>

              {/* Option 3: JSON */}
              <div className="p-4 rounded-lg border border-border/60 bg-background/50 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                    <Database size={16} className="text-indigo-400" />
                    Full Database JSON (.json)
                  </div>
                  <p className="text-xs text-foreground/60 leading-relaxed">
                    Complete structured JSON backup of your application data suitable for system migrations or code backups.
                  </p>
                </div>
                <div className="pt-4">
                  <Button
                    variant="custom"
                    onClick={() => downloadBackup('json')}
                    disabled={downloadingFormat !== null}
                    className="w-full bg-surface hover:bg-surface/80 text-foreground border border-border/60 text-xs py-2 px-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Download size={13} className={downloadingFormat === 'json' ? 'animate-spin' : ''} />
                    {downloadingFormat === 'json' ? 'Preparing JSON...' : 'Download JSON (.json)'}
                  </Button>
                </div>
              </div>

              {/* Option 4: PDF */}
              <div className="p-4 rounded-lg border border-border/60 bg-background/50 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-foreground font-medium text-sm">
                    <File size={16} className="text-rose-400" />
                    Summary Report PDF (.pdf)
                  </div>
                  <p className="text-xs text-foreground/60 leading-relaxed">
                    Clean printable executive summary with database metrics, system health, and recent campaign performance.
                  </p>
                </div>
                <div className="pt-4">
                  <Button
                    variant="custom"
                    onClick={() => downloadBackup('pdf')}
                    disabled={downloadingFormat !== null}
                    className="w-full bg-surface hover:bg-surface/80 text-foreground border border-border/60 text-xs py-2 px-3 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <Download size={13} className={downloadingFormat === 'pdf' ? 'animate-spin' : ''} />
                    {downloadingFormat === 'pdf' ? 'Preparing PDF...' : 'Download PDF (.pdf)'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
