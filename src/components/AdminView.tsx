import React, { useState, useEffect } from 'react';
import { FormConfig, UserResponse, TaskItem } from '../types';
import { 
  getAdminStatus, 
  claimFirstAdmin, 
  claimForceAdmin, 
  regenerateAdminToken, 
  fetchAdminResponses, 
  updateFormConfig, 
  invalidateUserSession, 
  reactivateUserSession, 
  invalidateAllUserSessions,
  deleteUserResponse,
  getExportUrl
} from '../lib/api';
import { 
  ShieldAlert, 
  ShieldCheck, 
  KeyRound, 
  Download, 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  Copy, 
  RefreshCw, 
  Search, 
  FileSpreadsheet, 
  FileCode2, 
  Ban, 
  Eye, 
  CheckCircle2, 
  X, 
  AlertTriangle,
  Server,
  Settings2,
  FileText,
  Users
} from 'lucide-react';

const ADMIN_TOKEN_KEY = 'intranet_admin_session_token';

interface AdminViewProps {
  formConfig: FormConfig;
  onFormUpdated: (form: FormConfig) => void;
  onNavigateToForm: () => void;
  basePath: string;
}

export const AdminView: React.FC<AdminViewProps> = ({ 
  formConfig: initialFormConfig, 
  onFormUpdated, 
  onNavigateToForm,
  basePath
}) => {
  const [adminToken, setAdminToken] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem(ADMIN_TOKEN_KEY) : null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'responses' | 'editor' | 'server'>('responses');

  // Force takeover state
  const [passphraseInput, setPassphraseInput] = useState<string>('');
  const [passphraseError, setPassphraseError] = useState<string | null>(null);
  const [passphraseLoading, setPassphraseLoading] = useState<boolean>(false);

  // Responses state
  const [responses, setResponses] = useState<UserResponse[]>([]);
  const [loadingResponses, setLoadingResponses] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedResponse, setSelectedResponse] = useState<UserResponse | null>(null);

  // Form Editor state
  const [formConfig, setFormConfig] = useState<FormConfig>(initialFormConfig);
  const [savingForm, setSavingForm] = useState<boolean>(false);
  const [formSavedSuccess, setFormSavedSuccess] = useState<boolean>(false);

  // Copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [adminActionNotice, setAdminActionNotice] = useState<string | null>(null);

  // Modal confirmations
  const [invalidateAllModalOpen, setInvalidateAllModalOpen] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    checkAdminAccess();
  }, [adminToken]);

  const checkAdminAccess = async () => {
    setCheckingAuth(true);
    try {
      const status = await getAdminStatus(adminToken);

      if (status.isAdminAuthenticated) {
        setIsAuthenticated(true);
        loadResponses(adminToken!);
      } else if (status.isFirstAdminAvailable) {
        // No admin exists yet! First visitor automatically claims rights
        const claimed = await claimFirstAdmin();
        if (claimed.token) {
          localStorage.setItem(ADMIN_TOKEN_KEY, claimed.token);
          setAdminToken(claimed.token);
          setIsAuthenticated(true);
          showNotice('Admin rights automatically granted on first access.');
          loadResponses(claimed.token);
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (err) {
      console.error('Error checking admin status:', err);
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  const showNotice = (msg: string) => {
    setAdminActionNotice(msg);
    setTimeout(() => setAdminActionNotice(null), 4000);
  };

  const loadResponses = async (token: string) => {
    setLoadingResponses(true);
    try {
      const data = await fetchAdminResponses(token);
      setResponses(data.responses || []);
      if (data.form) {
        setFormConfig(data.form);
      }
    } catch (err) {
      console.error('Failed to load responses:', err);
    } finally {
      setLoadingResponses(false);
    }
  };

  // Forcefully acquire admin rights using passphrase
  const handleForceClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphraseInput.trim()) return;

    setPassphraseLoading(true);
    setPassphraseError(null);

    try {
      const res = await claimForceAdmin(passphraseInput.trim());
      if (res.token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
        setAdminToken(res.token);
        setIsAuthenticated(true);
        setPassphraseInput('');
        showNotice('Admin rights forcefully acquired and session key regenerated!');
        loadResponses(res.token);
      }
    } catch (err: any) {
      setPassphraseError(err.message || 'Incorrect passphrase. Access denied.');
    } finally {
      setPassphraseLoading(false);
    }
  };

  // Invalidate a specific user session key
  const handleInvalidateUser = async (sessionKey: string) => {
    if (!adminToken) return;
    try {
      await invalidateUserSession(sessionKey, adminToken);
      showNotice(`User session ${sessionKey.substring(0, 10)}... has been invalidated.`);
      loadResponses(adminToken);
    } catch (err) {
      console.error('Failed to invalidate user:', err);
    }
  };

  // Reactivate user session
  const handleReactivateUser = async (sessionKey: string) => {
    if (!adminToken) return;
    try {
      await reactivateUserSession(sessionKey, adminToken);
      showNotice(`User session ${sessionKey.substring(0, 10)}... reactivated.`);
      loadResponses(adminToken);
    } catch (err) {
      console.error('Failed to reactivate user:', err);
    }
  };

  // Invalidate all user sessions
  const handleInvalidateAll = async () => {
    if (!adminToken) return;
    try {
      const count = await invalidateAllUserSessions(adminToken);
      setInvalidateAllModalOpen(false);
      showNotice(`All ${count} user session keys have been invalidated.`);
      loadResponses(adminToken);
    } catch (err) {
      console.error('Failed to invalidate all users:', err);
    }
  };

  // Delete a response
  const handleDeleteResponse = async (sessionKey: string) => {
    if (!adminToken || !window.confirm('Delete this submission record permanently?')) return;
    try {
      await deleteUserResponse(sessionKey, adminToken);
      showNotice('Response record deleted.');
      if (selectedResponse?.sessionKey === sessionKey) setSelectedResponse(null);
      loadResponses(adminToken);
    } catch (err) {
      console.error('Failed to delete response:', err);
    }
  };

  // Regenerate admin token
  const handleRegenerateAdminToken = async () => {
    if (!adminToken || !window.confirm('Regenerate admin session key? Other devices using the old key will lose access.')) return;
    try {
      const res = await regenerateAdminToken(adminToken);
      localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
      setAdminToken(res.token);
      showNotice('Admin session key regenerated.');
    } catch (err) {
      console.error('Failed to regenerate admin token:', err);
    }
  };

  // Save Form Editor Changes
  const handleSaveForm = async () => {
    if (!adminToken) return;
    setSavingForm(true);
    setFormSavedSuccess(false);
    try {
      const updated = await updateFormConfig(formConfig, adminToken);
      setFormConfig(updated);
      onFormUpdated(updated);
      setFormSavedSuccess(true);
      showNotice('Form configuration successfully saved!');
      setTimeout(() => setFormSavedSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to save form:', err);
      alert('Failed to save form changes.');
    } finally {
      setSavingForm(false);
    }
  };

  // Form task manipulation
  const handleAddTask = () => {
    const newId = `task_${Date.now().toString(36)}`;
    const newTask: TaskItem = {
      id: newId,
      title: `Task ${formConfig.tasks.length + 1}: Description`,
      description: 'Explain what is expected for this task.',
      placeholder: 'Paste your answer here...',
      required: false,
    };
    setFormConfig({
      ...formConfig,
      tasks: [...formConfig.tasks, newTask],
    });
  };

  const handleUpdateTask = (id: string, updates: Partial<TaskItem>) => {
    setFormConfig({
      ...formConfig,
      tasks: formConfig.tasks.map(t => t.id === id ? { ...t, ...updates } : t),
    });
  };

  const handleRemoveTask = (id: string) => {
    if (formConfig.tasks.length <= 1) {
      alert('The form must contain at least one task.');
      return;
    }
    setFormConfig({
      ...formConfig,
      tasks: formConfig.tasks.filter(t => t.id !== id),
    });
  };

  const handleMoveTask = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= formConfig.tasks.length) return;

    const list = [...formConfig.tasks];
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);

    setFormConfig({
      ...formConfig,
      tasks: list,
    });
  };

  // Copy helper
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Filter responses
  const filteredResponses = responses.filter(r => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    if (r.fullName?.toLowerCase().includes(q)) return true;
    if (r.sessionKey.toLowerCase().includes(q)) return true;
    // Search answers
    return Object.values(r.answers || {}).some(ans => String(ans || '').toLowerCase().includes(q));
  });

  const activeSessionsCount = responses.filter(r => r.isValid !== false).length;
  const invalidatedSessionsCount = responses.filter(r => r.isValid === false).length;

  // 1. Loading screen
  if (checkingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] py-16" id="admin-auth-loading">
        <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mb-3" />
        <p className="text-slate-500 text-sm font-medium">Verifying admin rights...</p>
      </div>
    );
  }

  // 2. Unauthenticated: Forceful Takeover Passphrase Screen
  if (!isAuthenticated) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12" id="admin-login-screen">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 mb-5">
            <ShieldAlert className="w-6 h-6" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-2">Admin Rights Claimed</h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            Another browser or device currently holds active administrative access. Because no credentials are required for the first visitor, you may <strong>forcefully take admin rights</strong> and regenerate the session key by entering the pre-configured system passphrase below.
          </p>

          <form onSubmit={handleForceClaim} className="space-y-4">
            <div>
              <label htmlFor="admin-passphrase-input" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pre-configured Passphrase
              </label>
              <div className="relative">
                <input
                  type="password"
                  id="admin-passphrase-input"
                  value={passphraseInput}
                  onChange={(e) => setPassphraseInput(e.target.value)}
                  placeholder="Enter administrator passphrase..."
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all text-slate-900 bg-white"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                Configured via <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600 font-mono">ADMIN_PASSPHRASE</code> (default: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600 font-mono">admin-secret-passphrase</code>)
              </p>
            </div>

            {passphraseError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{passphraseError}</span>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                type="button"
                id="back-to-form-btn"
                onClick={onNavigateToForm}
                className="text-xs text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
              >
                &larr; Return to Form
              </button>

              <button
                type="submit"
                id="force-claim-admin-btn"
                disabled={passphraseLoading}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {passphraseLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Take Admin Rights Forcefully
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 3. Authenticated Admin Dashboard
  return (
    <div className="max-w-6xl mx-auto px-4 py-8" id="admin-dashboard-container">
      {/* Admin Action Notice */}
      {adminActionNotice && (
        <div 
          id="admin-toast-notice"
          className="fixed bottom-6 right-6 z-50 p-3.5 rounded-xl border border-slate-900 bg-slate-900 text-white text-xs flex items-center gap-2.5 shadow-lg animate-in fade-in slide-in-from-bottom-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{adminActionNotice}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200" id="admin-header">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Administrator Mode
            </span>
            <span className="text-xs text-slate-400">Authenticated session active</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Form & Response Administration
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="view-public-form-btn"
            onClick={onNavigateToForm}
            className="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs bg-white"
          >
            <Eye className="w-3.5 h-3.5 text-slate-500" />
            Open User Form
          </button>

          <button
            id="regenerate-admin-key-btn"
            onClick={handleRegenerateAdminToken}
            title="Regenerate admin key and revoke access from any other browser"
            className="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs bg-white"
          >
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            Regenerate Admin Key
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-6 pb-px text-xs font-medium" id="admin-tabs-nav">
        <button
          id="tab-responses-btn"
          onClick={() => setActiveTab('responses')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'responses'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Responses & Sessions ({responses.length})
        </button>

        <button
          id="tab-editor-btn"
          onClick={() => setActiveTab('editor')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'editor'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          Edit Form Structure ({formConfig.tasks.length} Tasks)
        </button>

        <button
          id="tab-server-btn"
          onClick={() => setActiveTab('server')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'server'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          Server & Reverse Proxy Config
        </button>
      </div>

      {/* TAB 1: RESPONSES & SESSION MANAGEMENT */}
      {activeTab === 'responses' && (
        <div className="space-y-6" id="responses-tab-content">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500">Total Submissions</span>
              <p className="text-2xl font-bold text-slate-900 mt-1">{responses.length}</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500">Active User Sessions</span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{activeSessionsCount}</p>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500">Invalidated Sessions</span>
              <p className="text-2xl font-bold text-amber-600 mt-1">{invalidatedSessionsCount}</p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                id="search-responses-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by full name, session key, or answer text..."
                className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-slate-900 bg-white"
              />
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <button
                id="refresh-responses-btn"
                onClick={() => adminToken && loadResponses(adminToken)}
                disabled={loadingResponses}
                className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 cursor-pointer bg-white"
                title="Refresh responses"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingResponses ? 'animate-spin' : ''}`} />
              </button>

              {/* CSV Export */}
              <a
                id="download-csv-btn"
                href={adminToken ? getExportUrl('csv', adminToken) : '#'}
                download
                className="px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                Download CSV
              </a>

              {/* JSON Export */}
              <a
                id="download-json-btn"
                href={adminToken ? getExportUrl('json', adminToken) : '#'}
                download
                className="px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileCode2 className="w-3.5 h-3.5 text-blue-600" />
                Download JSON
              </a>

              {/* Invalidate all */}
              <button
                id="invalidate-all-users-btn"
                onClick={() => setInvalidateAllModalOpen(true)}
                className="px-3 py-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Ban className="w-3.5 h-3.5 text-red-600" />
                Invalidate All Sessions
              </button>
            </div>
          </div>

          {/* Submissions Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden" id="responses-table-container">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-700 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Full Name</th>
                    <th className="py-3 px-4">Session Key</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Tasks Answered</th>
                    <th className="py-3 px-4">Last Updated</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredResponses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                        {searchQuery ? 'No responses match your search.' : 'No form submissions received yet.'}
                      </td>
                    </tr>
                  ) : (
                    filteredResponses.map((resp) => {
                      const isValid = resp.isValid !== false;
                      const answeredCount = formConfig.tasks.filter(t => (resp.answers?.[t.id] || '').trim().length > 0).length;

                      return (
                        <tr key={resp.sessionKey} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {resp.fullName ? resp.fullName : <span className="text-slate-400 italic">Anonymous / Not entered</span>}
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span>{resp.sessionKey.substring(0, 16)}...</span>
                              <button
                                onClick={() => handleCopyText(resp.sessionKey, resp.sessionKey)}
                                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                                title="Copy session key"
                              >
                                {copiedKey === resp.sessionKey ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {isValid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                Invalidated
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-medium text-slate-800">
                              {answeredCount} of {formConfig.tasks.length}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                            {resp.updatedAt ? new Date(resp.updatedAt).toLocaleString() : 'N/A'}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedResponse(resp)}
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 cursor-pointer"
                                title="Inspect user response"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Button to invalidate common user's session key */}
                              {isValid ? (
                                <button
                                  id={`invalidate-btn-${resp.sessionKey}`}
                                  onClick={() => handleInvalidateUser(resp.sessionKey)}
                                  className="px-2.5 py-1 rounded-md bg-white hover:bg-red-50 border border-red-200 text-red-600 text-[11px] font-semibold cursor-pointer shadow-xs"
                                  title="Invalidate session key so user browser starts a new session"
                                >
                                  Invalidate Session
                                </button>
                              ) : (
                                <button
                                  id={`reactivate-btn-${resp.sessionKey}`}
                                  onClick={() => handleReactivateUser(resp.sessionKey)}
                                  className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-semibold cursor-pointer shadow-xs"
                                  title="Reactivate session key"
                                >
                                  Reactivate
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteResponse(resp.sessionKey)}
                                className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 cursor-pointer"
                                title="Delete response permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FORM EDITOR */}
      {activeTab === 'editor' && (
        <div className="space-y-6" id="editor-tab-content">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Form Header & Settings</h2>
                <p className="text-xs text-slate-500">Configure title, instructions, and name field label</p>
              </div>

              <button
                id="save-form-config-btn"
                onClick={handleSaveForm}
                disabled={savingForm}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {savingForm ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {formSavedSuccess ? 'Changes Saved!' : 'Save Form Changes'}
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Form Title
                </label>
                <input
                  type="text"
                  id="edit-form-title"
                  value={formConfig.title}
                  onChange={(e) => setFormConfig({ ...formConfig, title: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-slate-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Form Instructions / Context Description
                </label>
                <textarea
                  id="edit-form-description"
                  rows={3}
                  value={formConfig.description}
                  onChange={(e) => setFormConfig({ ...formConfig, description: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-slate-900 leading-relaxed bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  First Field Label (Full Name)
                </label>
                <input
                  type="text"
                  id="edit-fullname-label"
                  value={formConfig.fullNameLabel || 'Full Name'}
                  onChange={(e) => setFormConfig({ ...formConfig, fullNameLabel: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-slate-900 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Tasks Sequence Editor */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Task Sequence & Textareas</h3>
                <p className="text-xs text-slate-500">Order of tasks presented to users to paste their answers into</p>
              </div>

              <button
                id="add-task-btn"
                onClick={handleAddTask}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs bg-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Task
              </button>
            </div>

            {formConfig.tasks.map((task, index) => (
              <div 
                key={task.id} 
                className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-3"
                id={`edit-task-item-${task.id}`}
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center font-mono">
                      {index + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">Task Identifier: {task.id}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMoveTask(index, 'up')}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30 cursor-pointer"
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveTask(index, 'down')}
                      disabled={index === formConfig.tasks.length - 1}
                      className="p-1 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-30 cursor-pointer"
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemoveTask(task.id)}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 cursor-pointer ml-1"
                      title="Remove task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Task Title / Heading
                    </label>
                    <input
                      type="text"
                      value={task.title}
                      onChange={(e) => handleUpdateTask(task.id, { title: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-slate-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Textarea Placeholder
                    </label>
                    <input
                      type="text"
                      value={task.placeholder || ''}
                      onChange={(e) => handleUpdateTask(task.id, { placeholder: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-slate-900 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Task Instructions / Prompt Details
                  </label>
                  <textarea
                    rows={2}
                    value={task.description || ''}
                    onChange={(e) => handleUpdateTask(task.id, { description: e.target.value })}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 text-slate-900 leading-relaxed bg-white"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id={`task-req-${task.id}`}
                    checked={Boolean(task.required)}
                    onChange={(e) => handleUpdateTask(task.id, { required: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor={`task-req-${task.id}`} className="text-xs text-slate-600 cursor-pointer">
                    Mark as required field
                  </label>
                </div>
              </div>
            ))}

            <div className="pt-2 flex justify-end">
              <button
                id="save-form-config-bottom-btn"
                onClick={handleSaveForm}
                disabled={savingForm}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {savingForm ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {formSavedSuccess ? 'Changes Saved!' : 'Save Form Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SERVER & REVERSE PROXY CONFIG */}
      {activeTab === 'server' && (
        <div className="space-y-6" id="server-tab-content">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">Standalone Server & Reverse Proxy Support</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configured with leading path support for multi-application reverse proxy setups (e.g. Nginx, Caddy, HAProxy).
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">Configured Base Leading Path:</span>
                <code className="bg-white px-2.5 py-1 rounded border border-slate-200 font-mono text-xs font-bold text-slate-900">
                  {basePath || '/form'}
                </code>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                The server listens to both <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono text-[11px]">{basePath}/api/*</code> and <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono text-[11px]">/api/*</code>. When hosting multiple tools behind an intranet reverse proxy, you can route all requests for <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono text-[11px]">{basePath}</code> straight to this server without path-stripping errors.
              </p>
            </div>

            {/* Python standalone script info */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-semibold text-slate-800">Standalone Python Server (Bottle / Stdlib)</span>
              <p className="text-xs text-slate-600 leading-relaxed">
                As requested, a self-contained <code className="bg-white px-1 py-0.5 rounded border border-slate-200 font-mono text-[11px]">server.py</code> is available in the root directory. To run directly on any standalone server without Node:
              </p>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
{`# Run standalone with Python (supports Bottle or standard library)
PORT=3000 BASE_PATH="${basePath}" ADMIN_PASSPHRASE="admin-secret-passphrase" python3 server.py`}
              </pre>
            </div>

            {/* Nginx configuration example */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <span className="text-xs font-semibold text-slate-800">Sample Reverse Proxy Configuration (Nginx)</span>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
{`# Multi-application reverse proxy snippet:
location ${basePath}/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}`}
              </pre>
            </div>

            {/* Forceful Takeover Passphrase info */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-semibold text-slate-900">Admin Session Token & Passphrase</h3>
              <p className="text-xs text-slate-600">
                Your current admin token is stored in this browser. If you access from a different machine or wish to forcefully take over admin rights, use the pre-configured passphrase.
              </p>
              <div className="flex items-center gap-2">
                <button
                  id="regenerate-token-settings-btn"
                  onClick={handleRegenerateAdminToken}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer bg-white shadow-xs"
                >
                  Regenerate Admin Session Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: View Single Submission Details */}
      {selectedResponse && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4" id="view-response-modal">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedResponse.fullName || 'Anonymous User'}
                </h3>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  Session: {selectedResponse.sessionKey}
                </p>
              </div>
              <button
                onClick={() => setSelectedResponse(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800">Status: </span>
                  {selectedResponse.isValid !== false ? (
                    <span className="text-emerald-700 font-semibold">Active Session</span>
                  ) : (
                    <span className="text-amber-700 font-semibold">Invalidated</span>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Updated: </span>
                  {selectedResponse.updatedAt ? new Date(selectedResponse.updatedAt).toLocaleString() : 'N/A'}
                </div>
              </div>

              <div className="space-y-4">
                {formConfig.tasks.map((task, idx) => {
                  const val = selectedResponse.answers?.[task.id] || '';
                  return (
                    <div key={task.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="w-5 h-5 rounded bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                        <h4 className="font-semibold text-slate-900">{task.title}</h4>
                      </div>
                      {val ? (
                        <pre className="p-3 bg-white rounded-lg border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap break-words leading-relaxed">
                          {val}
                        </pre>
                      ) : (
                        <p className="text-slate-400 italic text-xs">No response provided</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              {selectedResponse.isValid !== false ? (
                <button
                  onClick={() => {
                    handleInvalidateUser(selectedResponse.sessionKey);
                    setSelectedResponse({ ...selectedResponse, isValid: false });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-red-50 border border-red-200 text-red-600 text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Invalidate Session Key
                </button>
              ) : (
                <button
                  onClick={() => {
                    handleReactivateUser(selectedResponse.sessionKey);
                    setSelectedResponse({ ...selectedResponse, isValid: true });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-semibold cursor-pointer shadow-xs"
                >
                  Reactivate Session Key
                </button>
              )}

              <button
                onClick={() => setSelectedResponse(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Invalidate All Sessions */}
      {invalidateAllModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4" id="invalidate-all-modal">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
              <Ban className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Invalidate All User Sessions?</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              This will immediately invalidate the session keys of all common users. When users next access or refresh the intranet form on their browsers, their old session will be replaced with a fresh blank session. Existing saved answers will be retained in your export records.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                id="cancel-invalidate-all-btn"
                onClick={() => setInvalidateAllModalOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-invalidate-all-btn"
                onClick={handleInvalidateAll}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-sm"
              >
                Invalidate All Sessions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
