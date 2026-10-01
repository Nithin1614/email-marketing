'use client';

import Link from 'next/link';
import { Home, Mail, Users, FileText, ChevronLeft, ChevronRight, MailWarning, LogOut, X, Library, LayoutTemplate, BarChart3, Activity, Wrench } from 'lucide-react';
import { apiClient } from '@/services/apiClient';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function Sidebar({ mobileMenuOpen, setMobileMenuOpen }: { mobileMenuOpen?: boolean, setMobileMenuOpen?: (v: boolean) => void }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    if (setMobileMenuOpen) setMobileMenuOpen(false);
  }, [pathname, setMobileMenuOpen]);

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-30 transition-opacity"
          onClick={() => setMobileMenuOpen?.(false)}
        />
      )}

      <div className={`
        fixed md:sticky top-0 h-screen bg-surface border-r border-border p-6 flex flex-col transition-all duration-300 z-40
        ${mobileMenuOpen ? 'left-0 translate-x-0' : '-translate-x-full md:translate-x-0'}
        ${isCollapsed ? 'w-20 items-center px-4' : 'w-64'}
      `}>
        {/* Desktop Collapse Button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          className="hidden md:block absolute -right-3 top-8 bg-background border border-border rounded-full p-1 hover:bg-foreground/5 z-10 text-foreground"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Mobile Close Button */}
        <button 
          onClick={() => setMobileMenuOpen?.(false)} 
          className="md:hidden absolute right-4 top-6 text-foreground/70 hover:text-foreground"
        >
          <X size={20} />
        </button>

      <div className={`text-xl font-bold mb-10 tracking-tight flex items-center h-8 ${isCollapsed ? 'justify-center text-sm' : ''}`}>
        {isCollapsed ? (
          <img src="/mass-mailing-logo.svg" alt="Logo" className="w-8 h-8 object-contain" />
        ) : (
          <img src="/mass-mailing-logo.svg" alt="Logo" className="h-8 w-auto object-contain" />
        )}
      </div>
      <nav className={`flex-1 space-y-2 ${isCollapsed ? 'w-full' : ''}`}>
        <Link href="/" title="Dashboard" className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <Home size={18} />
          {!isCollapsed && <span>Dashboard</span>}
        </Link>
        <Link href="/campaigns" title="Campaigns" className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <Mail size={18} />
          {!isCollapsed && <span>Campaigns</span>}
        </Link>
        <Link href="/advance-campaigns" title="Advanced Campaigns" className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <LayoutTemplate size={18} />
          {!isCollapsed && <span>Adv. Campaigns</span>}
        </Link>
        <Link href="/analytics" title="Centralized Analytics" className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <BarChart3 size={18} />
          {!isCollapsed && <span>Analytics</span>}
        </Link>
        <Link href="/templates" title="Templates" className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <FileText size={18} />
          {!isCollapsed && <span>Templates</span>}
        </Link>

        <Link href="/directory" title="User Directory" className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <Users size={18} />
          {!isCollapsed && <span>User Directory</span>}
        </Link>
        <Link href="/contacts" title="Contacts" className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <Users size={18} />
          {!isCollapsed && <span>Contacts</span>}
        </Link>

        <Link href="/bounces" title="Bounced Mails" className={`flex items-center p-2 hover:bg-red-600 hover:text-white text-red-500 rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
          <MailWarning size={18} />
          {!isCollapsed && <span>Bounced Mails</span>}
        </Link>

        <div className="pt-2 border-t border-border/50 my-1" />

        <Link 
          href="/system-health" 
          title="System Health" 
          className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${pathname === '/system-health' ? 'bg-hover-bg text-emerald-400 font-semibold' : ''} ${isCollapsed ? 'justify-center' : 'space-x-3'}`}
        >
          <Activity size={18} className="text-emerald-500 shrink-0" />
          {!isCollapsed && <span>System Health</span>}
        </Link>

        <Link 
          href="/toolkit" 
          title="Toolkit" 
          className={`flex items-center p-2 hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${pathname === '/toolkit' ? 'bg-hover-bg text-blue-400 font-semibold' : ''} ${isCollapsed ? 'justify-center' : 'space-x-3'}`}
        >
          <Wrench size={18} className="text-blue-400 shrink-0" />
          {!isCollapsed && <span>Toolkit</span>}
        </Link>

        <button 
          onClick={apiClient.logout}
          title="Logout" 
          className={`flex items-center p-2 w-full mt-auto hover:bg-hover-bg hover:text-foreground rounded-md transition-colors font-medium ${isCollapsed ? 'justify-center' : 'space-x-3'}`}
        >
          <LogOut size={18} />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </nav>
      </div>
    </>
  );
}
