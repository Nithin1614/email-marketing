'use client';

import React, { useEffect, useState } from 'react';
import Card from '../components/Card';
import { Users, Mail, BarChart2, TrendingUp, Zap } from 'lucide-react';
import Link from 'next/link';
import { apiClient } from '../services/apiClient';
import { Campaign, ContactList } from '../types';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    contacts: '—',
    campaigns: '—',
    templates: '—',
    openRate: '—',
  });
  const [dailyQuota, setDailyQuota] = useState({
    used: 0,
    limit: 300,
    remaining: 300,
    percentage: 0,
    resets_at: '00:00 UTC',
  });
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);
  const [listsMap, setListsMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Instant Cache: Load cached data immediately from sessionStorage (0ms render)
    try {
      const cached = sessionStorage.getItem('dashboard_summary');
      if (cached) {
        const data = JSON.parse(cached);
        if (data && data.stats) {
          setStats(data.stats);
          if (data.dailyQuota) setDailyQuota(data.dailyQuota);
          setRecentCampaigns(data.recentCampaigns || []);
          setListsMap(data.listsMap || {});
          setLoading(false);
        }
      }
    } catch (e) {}

    // 2. Fetch fresh data via single consolidated endpoint in <100ms
    async function loadDashboardData() {
      try {
        const res = await apiClient.get('/api/v1/dashboard/summary/');
        const newStats = {
          contacts: (res.total_contacts ?? 0).toLocaleString(),
          campaigns: (res.total_campaigns ?? 0).toLocaleString(),
          templates: (res.total_templates ?? 0).toLocaleString(),
          openRate: res.avg_open_rate || '0%',
        };
        const quota = res.daily_quota || {
          used: 0,
          limit: 300,
          remaining: 300,
          percentage: 0,
          resets_at: '00:00 UTC',
        };
        const campaigns = res.recent_campaigns || [];
        const lists = res.lists_map || {};

        setStats(newStats);
        setDailyQuota(quota);
        setRecentCampaigns(campaigns);
        setListsMap(lists);

        try {
          sessionStorage.setItem('dashboard_summary', JSON.stringify({
            stats: newStats,
            dailyQuota: quota,
            recentCampaigns: campaigns,
            listsMap: lists,
          }));
        } catch (e) {}
      } catch (err) {
        console.error('Failed to load dashboard summary:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  const statsItems = [
    { label: 'Total Contacts', value: stats.contacts, icon: Users, href: '/contacts' },
    { label: 'Total Campaigns', value: stats.campaigns, icon: Mail, href: '/campaigns' },
    { label: 'Templates', value: stats.templates, icon: BarChart2, href: '/templates' },
    { label: 'Avg. Open Rate', value: stats.openRate, icon: TrendingUp, href: null },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-foreground/50 mt-1 text-sm">Overview of your email marketing activity.</p>
      </div>

      {/* Daily Sending Quota (Brevo Free Tier Limit) */}
      <div className="mb-8 rounded-xl border border-border bg-card p-5 shadow-xs transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 flex-shrink-0">
              <Zap size={18} className="fill-yellow-500/20" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-foreground">Today's Sending Quota</span>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full border border-border bg-foreground/5 text-foreground/70">
                  Brevo Free Tier
                </span>
              </div>
              <p className="text-xs text-foreground/50 mt-0.5">
                Resets daily at 00:00 UTC • Tracks all live campaign blasts and test sends
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            <div className="text-left sm:text-right">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-foreground">{loading ? '...' : dailyQuota.used}</span>
                <span className="text-xs text-foreground/40 font-medium">/ {dailyQuota.limit} sent</span>
              </div>
            </div>
            <div className={`text-xs font-semibold px-2.5 py-1 rounded-md border flex items-center gap-1 ${
              dailyQuota.remaining > 50
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : dailyQuota.remaining > 0
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              <span>{loading ? '...' : dailyQuota.remaining} remaining</span>
            </div>
          </div>
        </div>

        {/* Progress Bar with indicator */}
        <div className="space-y-1.5 pt-1">
          <div className="w-full bg-foreground/10 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                dailyQuota.percentage < 70
                  ? 'bg-emerald-500'
                  : dailyQuota.percentage < 90
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${Math.max(dailyQuota.percentage, dailyQuota.used > 0 ? 3 : 0)}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-foreground/40 font-medium">
            <span>
              {loading ? '...' : `${dailyQuota.percentage}% used today`}
              {!loading && (dailyQuota as any).test_sent ? ` • ${(dailyQuota as any).campaign_sent || 0} blasts, ${(dailyQuota as any).test_sent} test sends` : ''}
            </span>
            <span>{loading ? '...' : `${dailyQuota.remaining} available`}</span>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        {statsItems.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-widest text-foreground/50">{stat.label}</span>
              <stat.icon size={16} className="text-foreground/30" />
            </div>
            <div className="text-4xl font-bold">{loading ? '...' : stat.value}</div>
            {stat.href && (
              <Link href={stat.href} className="text-xs text-foreground/40 mt-3 inline-block hover:text-foreground transition-colors">
                View all →
              </Link>
            )}
          </Card>
        ))}
      </div>

      {/* Recent Campaigns */}
      <Card title="Recent Campaigns">
        <div className="border-t border-border pt-4">
          <div className="hidden md:grid grid-cols-4 text-xs font-medium uppercase tracking-widest text-foreground/40 pb-3 border-b border-border">
            <span>Name</span>
            <span>Status</span>
            <span>Target List</span>
            <span>Sent / Scheduled</span>
          </div>
          {loading ? (
            <div className="text-sm text-foreground/40 py-6 text-center">Loading recent campaigns...</div>
          ) : recentCampaigns.length === 0 ? (
            <div className="text-sm text-foreground/40 py-6 text-center">
              No campaigns yet. <Link href="/campaigns" className="underline hover:text-foreground transition-colors">Create one →</Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentCampaigns.map((campaign) => {
                const isScheduled = campaign.status === 'scheduled';
                const dateObj = isScheduled && campaign.scheduled_at
                  ? new Date(campaign.scheduled_at)
                  : campaign.sent_at ? new Date(campaign.sent_at) : null;
                const dateStr = dateObj ? `${dateObj.getDate()}-${dateObj.getMonth() + 1}-${dateObj.getFullYear().toString().slice(-2)}` : '—';
                
                return (
                  <div key={campaign.id} className="flex flex-col md:grid md:grid-cols-4 gap-2 md:gap-0 py-3 md:py-3 text-sm md:items-center border-b border-border last:border-0 md:border-0 hover:bg-foreground/5 md:hover:bg-transparent rounded-md px-2 md:px-0 -mx-2 md:mx-0 transition-colors">
                    {/* Mobile: Name & Status Group */}
                    <div className="flex justify-between items-start md:contents">
                      <div className="flex flex-col md:block md:col-span-1">
                        <span className="font-medium text-foreground">{campaign.name}</span>
                      </div>
                      <div className="flex flex-col md:block md:col-span-1 md:mt-0">
                        <span className={`capitalize text-xs font-semibold px-2.5 py-0.5 rounded-full inline-block border ${
                          campaign.status === 'sent' ? 'border-foreground text-foreground' :
                          campaign.status === 'scheduled' ? 'border-indigo-500/30 text-indigo-400 bg-indigo-500/10' :
                          'border-border text-foreground/70 bg-background/50'
                        }`}>{campaign.status}</span>
                      </div>
                    </div>
                    
                    {/* Mobile: Target List & Date Group */}
                    <div className="flex justify-between items-center md:contents mt-1 md:mt-0">
                      <div className="flex flex-col md:block md:col-span-1 text-foreground/70">
                        <span className="md:hidden text-[10px] uppercase font-bold text-foreground/40 mb-0.5">List</span>
                        <span>{listsMap[campaign.target_list] || `List #${campaign.target_list}`}</span>
                      </div>
                      <div className="flex flex-col md:block md:col-span-1 text-foreground/70 text-right md:text-left">
                        <span className="md:hidden text-[10px] uppercase font-bold text-foreground/40 mb-0.5">
                          {isScheduled ? 'Scheduled For' : 'Sent / Scheduled'}
                        </span>
                        {isScheduled && campaign.scheduled_at ? (
                          <span className="text-indigo-400 font-medium text-xs">
                            {new Date(campaign.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}{' '}
                            {new Date(campaign.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span>{dateStr}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Quick Links */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/contacts" className="border border-border rounded-lg p-5 hover:bg-foreground hover:text-background transition-colors group">
          <Users size={20} className="mb-3 text-foreground/40 group-hover:text-background transition-colors" />
          <h3 className="font-semibold">Manage Contacts</h3>
          <p className="text-xs text-foreground/50 group-hover:text-background/60 mt-1 transition-colors">Add or organize your subscriber lists.</p>
        </Link>
        <Link href="/campaigns" className="border border-border rounded-lg p-5 hover:bg-foreground hover:text-background transition-colors group">
          <Mail size={20} className="mb-3 text-foreground/40 group-hover:text-background transition-colors" />
          <h3 className="font-semibold">New Campaign</h3>
          <p className="text-xs text-foreground/50 group-hover:text-background/60 mt-1 transition-colors">Launch a new email campaign to your audience.</p>
        </Link>
        <Link href="/templates" className="border border-border rounded-lg p-5 hover:bg-foreground hover:text-background transition-colors group">
          <BarChart2 size={20} className="mb-3 text-foreground/40 group-hover:text-background transition-colors" />
          <h3 className="font-semibold">Email Templates</h3>
          <p className="text-xs text-foreground/50 group-hover:text-background/60 mt-1 transition-colors">Design and save reusable email templates.</p>
        </Link>
      </div>
    </div>
  );
}
