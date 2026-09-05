import React, { useState, useEffect } from 'react';
import { FormConfig } from './types';
import { fetchFormConfig, fetchServerConfig, claimForceAdmin, getExportUrl } from './lib/api';
import { UserFormView } from './components/UserFormView';
import { AdminView } from './components/AdminView';
import { useUserSession } from './hooks/useUserSession';
import { 
  Shield, 
  Loader2, 
  Copy, 
  Check, 
  Menu, 
  X,
  FileSpreadsheet,
  Ban,
  ArrowRight,
  ExternalLink
} from 'lucide-react';

const DEFAULT_FORM: FormConfig = {
  id: 'default',
  title: 'Weekly Project Progress Report',
  description: 'Please describe the core progress made on Project Atlas this week. All inputs auto-save in real-time on focus leave.',
  fullNameLabel: 'Full Name',
  tasks: [
    {
      id: 'task_1',
      title: 'Summary of Accomplishments & Milestones',
      description: 'Please describe the core progress made on your assigned modules this week.',
      placeholder: 'Type your response here...',
      required: true,
    },
    {
      id: 'task_2',
      title: 'Code Snippets, Technical Logs or Diagnostic Details',
      description: 'Detail the exact procedure, configuration changes, or technical logs associated with this task.',
      placeholder: 'Paste output logs, terminal commands, or diagnostic details...',
      required: false,
    },
    {
      id: 'task_3',
      title: 'Blockers, Dependencies & Next Steps',
      description: 'Describe any blocking issues encountered and what follow-up actions are planned for next week.',
      placeholder: 'Paste verification notes or next action items...',
      required: false,
    },
  ],
  updatedAt: new Date().toISOString(),
};

export default function App() {
  const [currentView, setCurrentView] = useState<'form' | 'admin'>(() => {
    if (typeof window !== 'undefined') {
      if (window.location.hash === '#admin' || window.location.pathname.endsWith('/admin')) {
        return 'admin';
      }
    }
    return 'form';
  });

  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_FORM);
  const [basePath, setBasePath] = useState<string>('/form');
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // User session hook initialized at root level for global status and sidebar
  const userSession = useUserSession();
  const [copiedSessionId, setCopiedSessionId] = useState<boolean>(false);

  // Sidebar Force Admin Claim
  const [sidebarPassphrase, setSidebarPassphrase] = useState('');
  const [sidebarPassphraseLoading, setSidebarPassphraseLoading] = useState(false);
  const [sidebarPassphraseMsg, setSidebarPassphraseMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync hash routing
  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#admin') {
        setCurrentView('admin');
      } else {
        setCurrentView('form');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigateToView = (view: 'form' | 'admin') => {
    setCurrentView(view);
    setSidebarOpen(false);
    if (view === 'admin') {
      window.location.hash = '#admin';
    } else {
      window.location.hash = '';
    }
  };

  const copySessionSnippet = () => {
    if (userSession.sessionKey) {
      navigator.clipboard.writeText(userSession.sessionKey);
      setCopiedSessionId(true);
      setTimeout(() => setCopiedSessionId(false), 2000);
    }
  };

  const handleSidebarDownload = () => {
    const adminToken = localStorage.getItem('intranet_admin_token') || '';
    const url = getExportUrl('csv', adminToken);
    window.open(url, '_blank');
  };

  const handleSidebarInvalidateNav = () => {
    navigateToView('admin');
  };

  const handleSidebarForceClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sidebarPassphrase.trim()) return;
    setSidebarPassphraseLoading(true);
    setSidebarPassphraseMsg(null);
    try {
      const res = await claimForceAdmin(sidebarPassphrase.trim());
      if (res.token) {
        localStorage.setItem('intranet_admin_token', res.token);
        setSidebarPassphraseMsg({ type: 'success', text: 'Admin rights acquired!' });
        setSidebarPassphrase('');
        setTimeout(() => {
          navigateToView('admin');
        }, 600);
      } else {
        setSidebarPassphraseMsg({ type: 'error', text: 'Failed to claim admin rights' });
      }
    } catch (err: any) {
      setSidebarPassphraseMsg({ type: 'error', text: err.message || 'Incorrect passphrase' });
    } finally {
      setSidebarPassphraseLoading(false);
    }
  };

  // Initial fetch of form and server config
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const [form, cfg] = await Promise.allSettled([
          fetchFormConfig(),
          fetchServerConfig(),
        ]);

        if (!isMounted) return;

        if (form.status === 'fulfilled') {
          setFormConfig(form.value);
        }
        if (cfg.status === 'fulfilled') {
          setBasePath(cfg.value.basePath || '/form');
        }
      } catch (err: any) {
        console.error('Initialization error:', err);
        if (isMounted) setFetchError(err.message || 'Failed to initialize application');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-500 tracking-wider uppercase">Loading Intranet Forms...</p>
      </div>
    );
  }

  const sessionSnippet = userSession.sessionKey 
    ? `${userSession.sessionKey.substring(0, 8)}...`
    : 'session-loading';

  return (
    <div className="min-h-screen w-full bg-slate-50 flex flex-col lg:flex-row font-sans text-slate-900 antialiased">
      {/* Mobile Top Header */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-sm">
            F
          </div>
          <span className="font-bold text-slate-900 text-sm">IntranetForms</span>
          <span className="text-[10px] font-mono text-slate-400">v1.0</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateToView(currentView === 'form' ? 'admin' : 'form')}
            className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50"
          >
            {currentView === 'form' ? 'Admin' : 'Form'}
          </button>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-100"
            aria-label="Toggle navigation menu"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Sidebar Backdrop on mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar (Professional Polish Layout) */}
      <aside 
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 lg:min-h-screen lg:h-screen lg:sticky lg:top-0 lg:overflow-y-auto ${
          sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand & Main Nav */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-sm">
                F
              </div>
              <div className="flex items-baseline gap-1.5">
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">IntranetForms</h1>
                <span className="text-[10px] font-mono text-slate-400">v1.0</span>
              </div>
            </div>

            <button 
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="space-y-1" id="sidebar-nav">
            <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Form Session
            </div>

            {/* Active Session Tab */}
            <button
              id="sidebar-nav-user-form"
              onClick={() => navigateToView('form')}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer text-left ${
                currentView === 'form'
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <svg className="w-4 h-4 shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Active Session</span>
            </button>

            {/* Session ID snippet */}
            <div className="px-3 py-1.5 text-xs text-slate-500 font-mono flex items-center justify-between group">
              <span className="truncate" title={userSession.sessionKey}>
                ID: {sessionSnippet}
              </span>
              <button
                onClick={copySessionSnippet}
                className="text-slate-400 hover:text-slate-700 opacity-80 group-hover:opacity-100 transition-opacity cursor-pointer p-0.5"
                title="Copy local session key"
              >
                {copiedSessionId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Admin Controls Link */}
            <div className="pt-2">
              <button
                id="sidebar-nav-admin"
                onClick={() => navigateToView('admin')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer text-left ${
                  currentView === 'admin'
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>Admin Controls</span>
              </button>
            </div>
          </nav>
        </div>

        {/* Quick Actions & Admin Force Takeover */}
        <div className="mt-auto p-6 bg-slate-50 border-t border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Actions</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Server active"></span>
          </div>

          <div className="space-y-2">
            <button
              id="sidebar-download-btn"
              onClick={handleSidebarDownload}
              className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-md border border-slate-300 bg-white shadow-xs font-medium transition-colors cursor-pointer flex items-center justify-between"
            >
              <span>Download Responses</span>
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            </button>

            <button
              id="sidebar-invalidate-btn"
              onClick={handleSidebarInvalidateNav}
              className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-md border border-red-200 bg-white shadow-xs font-medium transition-colors cursor-pointer flex items-center justify-between"
            >
              <span>Invalidate Sessions</span>
              <Ban className="w-3.5 h-3.5 text-red-600" />
            </button>
          </div>

          {/* Force Admin Access Form */}
          <div className="mt-5 pt-4 border-t border-slate-200">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Force Admin Access
            </label>
            <form onSubmit={handleSidebarForceClaim} className="flex gap-1.5">
              <input
                type="password"
                placeholder="Passphrase..."
                value={sidebarPassphrase}
                onChange={(e) => setSidebarPassphrase(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white text-slate-900 placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={sidebarPassphraseLoading}
                className="px-2.5 py-1.5 text-xs bg-slate-200 hover:bg-slate-300 rounded text-slate-700 font-medium cursor-pointer transition-colors shrink-0 disabled:opacity-50"
                title="Claim administrator rights"
              >
                {sidebarPassphraseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </form>
            {sidebarPassphraseMsg && (
              <p className={`text-[10px] mt-1 font-medium ${sidebarPassphraseMsg.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                {sidebarPassphraseMsg.text}
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 flex flex-col bg-white min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-slate-200 flex items-center justify-between px-6 sm:px-10 shrink-0 bg-white sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm text-slate-500 italic hidden sm:inline">Autosaving to</span>
            <code className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-700 font-mono">
              {basePath}/api/response
            </code>
          </div>

          <div className="flex items-center gap-2">
            {userSession.saveStatus === 'saving' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-blue-600 font-medium">Autosaving...</span>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
              </div>
            ) : userSession.saveStatus === 'error' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">Save error</span>
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-600 font-medium">All changes saved</span>
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
              </div>
            )}
          </div>
        </header>

        {/* View Component */}
        <div className="flex-1 overflow-y-auto">
          {currentView === 'form' ? (
            <UserFormView
              formConfig={formConfig}
              onNavigateToAdmin={() => navigateToView('admin')}
              basePath={basePath}
              userSession={userSession}
            />
          ) : (
            <AdminView
              formConfig={formConfig}
              onFormUpdated={(updated) => setFormConfig(updated)}
              onNavigateToForm={() => navigateToView('form')}
              basePath={basePath}
            />
          )}
        </div>

        {/* Footer Bar */}
        <footer className="h-12 border-t border-slate-100 flex items-center px-6 sm:px-10 justify-between text-[11px] text-slate-400 shrink-0 bg-white">
          <div>Session active &bull; Auto-saving enabled</div>
          <div className="flex gap-4">
            <span>Server: Python / Node.js</span>
            <span className="hidden sm:inline">Proxy: {basePath}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

