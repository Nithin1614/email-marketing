'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { Plus, X, Send, AlertCircle, RefreshCw, ChartNoAxesCombined, Trash2, Zap, MailCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../services/apiClient';
import { Campaign, ContactList, EmailTemplate } from '../../types';
import SendTestModal from '../../components/SendTestModal';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [showMasterLinkModal, setShowMasterLinkModal] = useState(false);
  const [testModalCampaign, setTestModalCampaign] = useState<Campaign | null>(null);
  const router = useRouter();

  const [actionError, setActionError] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const hasSending = campaigns.some(c => c.status === 'sending');
    if (hasSending && !polling) {
      setPolling(true);
    }
  }, [campaigns, polling]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (polling) {
      intervalId = setInterval(async () => {
        try {
          const campaignsRes = await apiClient.get('/api/v1/campaigns/');
          const activeCampaigns: Campaign[] = campaignsRes.results || [];
          setCampaigns(activeCampaigns);

          const stillSending = activeCampaigns.some(c => c.status === 'sending');
          if (!stillSending) {
            setPolling(false);
          }
        } catch (err) {
          console.error('Failed to poll campaigns:', err);
        }
      }, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [polling]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const [campaignsRes, listsRes, templatesRes] = await Promise.all([
        apiClient.get('/api/v1/campaigns/?limit=10000'),
        apiClient.get('/api/v1/contact-lists/?limit=10000'),
        apiClient.get('/api/v1/templates/?limit=10000'),
      ]);
      setCampaigns(campaignsRes.results || []);
      setLists(listsRes.results || []);
      setTemplates(templatesRes.results || []);
    } catch (err) {
      console.error('Failed to load campaigns initial data:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleSendCampaign = async (campaignId: number) => {
    setActionError('');
    const confirmed = window.confirm('Are you sure you want to send this campaign now? This will immediately mail all contacts in the target list.');
    if (!confirmed) return;

    setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: 'sending' } : c));

    try {
      await apiClient.post(`/api/v1/campaigns/${campaignId}/send/`, {});
      setPolling(true);
    } catch (err: any) {
      setActionError(err.message || 'Failed to send campaign.');
      loadInitialData();
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    setActionError('');
    const confirmed = window.confirm(
      `Delete “${campaign.name}”? This permanently removes the campaign and its analytics.`
    );
    if (!confirmed) return;

    try {
      await apiClient.delete(`/api/v1/campaigns/${campaign.id}/`);
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete campaign.');
    }
  };

  const handleConvertToAdvanced = async (campaignId: number, campaignName: string) => {
    setActionError('');
    const confirmed = window.confirm(`Convert "${campaignName}" into an Advance Campaign? It will become the first step of the new Advance Campaign.`);
    if (!confirmed) return;

    try {
      const res = await apiClient.post(`/api/v1/campaigns/${campaignId}/convert-to-advanced/`, {});
      if (res.advance_campaign_id) {
        router.push(`/advance-campaigns/${res.advance_campaign_id}`);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to convert campaign.');
    }
  };

  const getListName = (id: number) => lists.find(l => l.id === id)?.name || `List #${id}`;
  const getTemplateName = (id: number) => templates.find(t => t.id === id)?.name || `Template #${id}`;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
          <p className="text-foreground/50 mt-1 text-sm">Manage and send your email campaigns.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setShowMasterLinkModal(true)}>
            <ChartNoAxesCombined size={16} />
            <span className="ml-1">Master Link</span>
          </Button>
          <Link href="/campaigns/new">
            <Button>
              <Plus size={16} />
              <span>New Campaign</span>
            </Button>
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-950/20 text-red-500 text-sm rounded-md font-medium border border-red-900/30 flex items-start space-x-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{actionError}</span>
        </div>
      )}

      <Card className="p-4">
        <div className="border-t border-border pt-3">
          <div className="hidden md:grid grid-cols-12 text-xs font-medium uppercase tracking-widest text-foreground/40 pb-2 border-b border-border mb-2 px-2">
            <span className="col-span-3">Name</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-3">Target List</span>
            <span className="col-span-2">Sent At</span>
            <span className="col-span-2 text-right">Actions</span>
          </div>

          {loading ? (
            <div className="text-sm text-foreground/40 py-12 text-center">Loading campaigns...</div>
          ) : campaigns.length === 0 ? (
            <div className="text-sm text-foreground/40 py-12 text-center">
              No campaigns found. Create your first campaign to get started.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {campaigns.map((c) => (
                <div key={c.id} className="flex flex-col md:grid md:grid-cols-12 gap-1 md:gap-0 py-4 md:py-3 text-sm items-start md:items-center hover:bg-foreground/5 rounded-lg md:rounded-md border border-border md:border-transparent bg-foreground/[0.02] md:bg-transparent px-3 md:px-2 mb-4 md:mb-0 transition-colors shadow-sm md:shadow-none">
                  {/* Name and Basic Info */}
                  <div className="flex flex-col md:col-span-3 pr-2 min-w-0 w-full mb-3 md:mb-0">
                    <span className="font-bold md:font-medium text-base md:text-sm truncate text-foreground">{c.name}</span>
                    <span className="text-xs text-foreground/50 mt-1 truncate font-medium">Template: {getTemplateName(c.template)}</span>
                    <span className="text-xs text-foreground/50 mt-0.5 truncate">From: {c.from_email}</span>
                  </div>

                  {/* Status and List Group (Row on Mobile) */}
                  <div className="flex justify-between items-center w-full md:contents mb-2 md:mb-0">
                    <div className="flex flex-col md:col-span-2 md:block">
                      <span className="md:hidden text-[10px] uppercase font-bold text-foreground/40 mb-1">Status</span>
                      <span className="capitalize text-xs">
                        <span className={`px-2 py-0.5 border rounded-full inline-flex items-center space-x-1 ${
                          c.status === 'sent' ? 'border-foreground text-foreground font-bold' :
                          c.status === 'sending' ? 'border-foreground/30 text-foreground/50 animate-pulse' :
                          c.status === 'failed' ? 'border-red-900/40 text-red-500 font-bold' :
                          'border-border text-foreground/40'
                        }`}>
                          {c.status === 'sending' && <RefreshCw size={10} className="animate-spin mr-1" />}
                          <span>{c.status}</span>
                        </span>
                      </span>
                    </div>
                    <div className="flex flex-col text-right md:text-left md:col-span-3 md:block min-w-0">
                      <span className="md:hidden text-[10px] uppercase font-bold text-foreground/40 mb-1">Target List</span>
                      <span className="truncate font-medium text-foreground/80">{getListName(c.target_list)}</span>
                    </div>
                  </div>

                  {/* Sent Date Group */}
                  <div className="flex flex-col md:col-span-2 md:block w-full mb-4 md:mb-0">
                    <span className="md:hidden text-[10px] uppercase font-bold text-foreground/40 mb-1">Sent At</span>
                    <span className="text-foreground/70">{c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '—'}</span>
                  </div>

                  {/* Actions Group */}
                  <div className="w-full pt-3 border-t border-border/50 md:border-0 md:pt-0 md:col-span-2 text-left md:text-right">
                    {(c.status === 'draft' || c.status === 'failed') ? (
                      <div className="flex items-center md:justify-end gap-2 flex-wrap md:flex-nowrap">
                        <Button
                          variant="outline"
                          className="py-1.5 md:py-1 px-3 text-xs w-full md:w-auto justify-center text-primary border-primary/30 hover:bg-primary/10"
                          onClick={() => setTestModalCampaign(c)}
                          title="Send a preview test email"
                        >
                          <MailCheck size={12} />
                          <span>Send Test</span>
                        </Button>
                        <Button variant="outline" className="py-1.5 md:py-1 px-3 text-xs w-full md:w-auto justify-center" onClick={() => handleConvertToAdvanced(c.id, c.name)}>
                          <Zap size={12} className="text-yellow-500" />
                          <span>To Advance</span>
                        </Button>
                        <Button variant="outline" className="py-1.5 md:py-1 px-3 text-xs w-full md:w-auto justify-center" onClick={() => handleSendCampaign(c.id)}>
                          <Send size={12} />
                          <span>Send Now</span>
                        </Button>
                        <Button
                          variant="outline"
                          className="py-1.5 md:py-1 px-3 md:px-2 text-red-600 border-red-600/40 hover:bg-red-600 hover:text-white hover:border-red-600 w-full md:w-auto"
                          onClick={() => handleDeleteCampaign(c)}
                          title={`Delete ${c.name}`}
                        >
                          <Trash2 size={14} className="md:w-3.5 md:h-3.5 hidden md:block" />
                          <span className="md:hidden ml-1">Delete</span>
                        </Button>
                      </div>
                    ) : c.status === 'sending' ? (
                      <span className="text-xs text-foreground/40 italic">Sending...</span>
                    ) : (
                      <div className="flex items-center md:justify-end gap-2 flex-wrap md:flex-nowrap">
                        <Button variant="outline" className="py-1.5 md:py-1 px-3 text-xs w-full md:w-auto justify-center" onClick={() => handleConvertToAdvanced(c.id, c.name)}>
                          <Zap size={12} className="text-yellow-500" />
                          <span>To Advance</span>
                        </Button>
                        <Link
                          href={`/campaigns/${c.id}/analytics`}
                          className="inline-flex items-center justify-center gap-1 w-full md:w-auto rounded-md border border-foreground bg-background px-3 py-1.5 md:py-1 text-xs font-medium hover:bg-foreground hover:text-background transition-colors"
                        >
                          <ChartNoAxesCombined size={13} />
                          View Analytics
                        </Link>
                        <Button
                          variant="outline"
                          className="py-1.5 md:py-1 px-3 md:px-2 text-red-600 border-red-600/40 hover:bg-red-600 hover:text-white hover:border-red-600 w-full md:w-auto"
                          onClick={() => handleDeleteCampaign(c)}
                          title={`Delete ${c.name}`}
                        >
                          <Trash2 size={14} className="md:w-3.5 md:h-3.5 hidden md:block" />
                          <span className="md:hidden ml-1">Delete</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
      {showMasterLinkModal && (
        <MasterLinkModal onClose={() => setShowMasterLinkModal(false)} />
      )}

      <SendTestModal
        isOpen={Boolean(testModalCampaign)}
        onClose={() => setTestModalCampaign(null)}
        campaignId={testModalCampaign?.id ?? null}
        campaignName={testModalCampaign?.name ?? ''}
      />
    </div>
  );
}

function MasterLinkModal({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState('');
  const [isActive, setIsActive] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiClient.get('/api/v1/master-link/settings/').then(res => {
      setToken(res.token);
      setIsActive(res.is_active);
      setHasPassword(res.has_password);
      setPassword(res.current_password || '');
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load master link settings', err);
      setLoading(false);
    });
  }, []);

  const handleToggle = async () => {
    try {
      const res = await apiClient.post('/api/v1/master-link/settings/', { is_active: !isActive });
      setIsActive(res.is_active);
      setHasPassword(res.has_password);
    } catch (err) {
      console.error('Failed to update master link settings', err);
    }
  };

  const handleSavePassword = async () => {
    setSavingPassword(true);
    try {
      const res = await apiClient.post('/api/v1/master-link/settings/', { password: passwordInput });
      setHasPassword(res.has_password);
      setPassword(res.current_password || passwordInput);
      setPasswordInput('');
    } catch (err) {
      console.error('Failed to save password', err);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRemovePassword = async () => {
    setSavingPassword(true);
    try {
      const res = await apiClient.post('/api/v1/master-link/settings/', { password: '' });
      setHasPassword(res.has_password);
      setPassword('');
      setPasswordInput('');
    } catch (err) {
      console.error('Failed to remove password', err);
    } finally {
      setSavingPassword(false);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/public/master/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border p-6 rounded-lg shadow-lg max-w-md w-full relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-foreground/50 hover:text-foreground">
          <X size={20} />
        </button>
        <h2 className="text-xl font-bold mb-6">Master Link Settings</h2>
        {loading ? (
          <p className="text-foreground/50">Loading...</p>
        ) : (
          <div className="space-y-6">
            {/* Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Enable Master Link</div>
                <div className="text-xs text-foreground/50 mt-1">Allow anyone with the link to view analytics for all campaigns.</div>
              </div>
              <button 
                onClick={handleToggle}
                className={`w-11 h-6 rounded-full transition-colors ${isActive ? 'bg-foreground' : 'bg-foreground/20'} relative flex-shrink-0`}
              >
                <div className={`w-4 h-4 bg-background rounded-full absolute top-1 transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Password Protection */}
            <div className="space-y-2 border-t border-border pt-5">
              <div className="font-medium text-sm">Password Protection</div>
              <div className="text-xs text-foreground/50 mb-3">Visitors must enter this password before they can view the master link.</div>
              {hasPassword && (
                <div className="flex items-center justify-between gap-2 mb-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-md">
                  <div className="text-xs text-green-700 dark:text-green-400">
                    <span className="font-semibold">✓ Password:</span>{' '}
                    {password ? (
                      <code className="bg-green-500/20 px-1.5 py-0.5 rounded font-mono font-bold text-foreground">
                        {password}
                      </code>
                    ) : (
                      <span>Active</span>
                    )}
                  </div>
                  <button
                    onClick={handleRemovePassword}
                    disabled={savingPassword}
                    className="text-xs text-red-500 hover:text-red-700 underline font-medium"
                  >
                    Remove
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  placeholder={hasPassword ? 'Enter new password to change...' : 'Set a password (optional)...'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && passwordInput && handleSavePassword()}
                  className="flex-1 bg-foreground/5 border border-border p-2 rounded-md text-sm outline-none focus:border-foreground/30"
                />
                <Button
                  onClick={handleSavePassword}
                  disabled={!passwordInput || savingPassword}
                  variant="outline"
                  className="px-3 whitespace-nowrap"
                >
                  {savingPassword ? 'Saving...' : 'Set'}
                </Button>
              </div>
            </div>
            
            {/* Public URL */}
            {isActive && (
              <div className="space-y-2 border-t border-border pt-5">
                <div className="text-sm font-medium">Public URL</div>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={`${window.location.origin}/public/master/${token}`} 
                    className="flex-1 bg-foreground/5 border border-border p-2 rounded-md text-sm outline-none" 
                  />
                  <Button onClick={copyLink} variant="outline" className="px-4">
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
