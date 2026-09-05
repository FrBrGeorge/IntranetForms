import React, { useState } from 'react';
import { FormConfig } from '../types';
import { useUserSession } from '../hooks/useUserSession';
import { 
  CheckCircle2, 
  Loader2, 
  AlertCircle, 
  Copy, 
  Check, 
  RotateCcw, 
  KeyRound, 
  ShieldCheck, 
  HelpCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface UserFormViewProps {
  formConfig: FormConfig;
  onNavigateToAdmin: () => void;
  basePath: string;
  userSession?: ReturnType<typeof useUserSession>;
}

export const UserFormView: React.FC<UserFormViewProps> = ({ 
  formConfig, 
  onNavigateToAdmin, 
  basePath,
  userSession: externalUserSession
}) => {
  const fallbackSession = useUserSession();
  const session = externalUserSession || fallbackSession;

  const {
    sessionKey,
    fullName,
    answers,
    loading,
    saveStatus,
    lastSaved,
    sessionInvalidatedNotice,
    dismissInvalidatedNotice,
    errorMessage,
    handleFullNameChange,
    handleAnswerChange,
    handleBlur,
    handleResetSession,
    triggerManualSave,
  } = session;

  const [copiedKey, setCopiedKey] = useState(false);
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const copySessionKey = () => {
    navigator.clipboard.writeText(sessionKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const tasks = formConfig.tasks || [];
  const totalTasks = tasks.length;
  const answeredTasksCount = tasks.filter(t => (answers[t.id] || '').trim().length > 0).length;
  const hasFullName = (fullName || '').trim().length > 0;
  const completionPercentage = totalTasks > 0 ? Math.round(((answeredTasksCount + (hasFullName ? 1 : 0)) / (totalTasks + 1)) * 100) : 100;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] py-16" id="loading-state">
        <Loader2 className="w-8 h-8 text-slate-500 animate-spin mb-4" />
        <p className="text-slate-500 font-medium text-sm">Loading your session and form...</p>
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-12 max-w-3xl mx-auto w-full" id="user-form-container">
      {/* Session Invalidated Banner */}
      {sessionInvalidatedNotice && (
        <div 
          id="session-invalidated-alert"
          className="mb-8 p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 flex items-start justify-between shadow-sm transition-all"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Session Reset by Administrator</p>
              <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                Your previous session key was invalidated. A fresh anonymous session has started for this browser, allowing you to edit anew.
              </p>
            </div>
          </div>
          <button
            id="dismiss-invalidated-banner"
            onClick={dismissInvalidatedNotice}
            className="text-xs text-amber-700 hover:text-amber-900 font-medium ml-4 underline underline-offset-2 shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Form Title & Overview */}
      <div className="mb-10 pb-8 border-b border-slate-200" id="form-overview-section">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Intranet Report
            </span>
            {basePath && (
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-mono text-slate-500 bg-slate-100">
                {basePath}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Focus-leave auto-save active</span>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-3" id="form-title">
          {formConfig.title}
        </h1>

        {formConfig.description && (
          <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line mb-6" id="form-description">
            {formConfig.description}
          </p>
        )}

        {/* Progress bar & Session Key Link */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
            <span className="font-medium text-slate-700">{completionPercentage}% completed</span>
            <span className="text-slate-300">•</span>
            <span>{answeredTasksCount} of {totalTasks} answered</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="toggle-session-details"
              onClick={() => setShowSessionDetails(!showSessionDetails)}
              className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
            >
              <KeyRound className="w-3 h-3" />
              {showSessionDetails ? 'Hide Session Info' : 'Session Info'}
            </button>
          </div>
        </div>

        {/* Session details drawer */}
        {showSessionDetails && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-2.5" id="session-details-drawer">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Client Session Key:</span>
                <code className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800 font-mono text-[11px] select-all">
                  {sessionKey}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="copy-session-key-btn"
                  onClick={copySessionKey}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer text-[11px] shadow-xs"
                >
                  {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  {copiedKey ? 'Copied' : 'Copy Key'}
                </button>
                <button
                  id="user-reset-session-btn"
                  onClick={() => setResetConfirmOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-600 hover:text-red-600 font-medium cursor-pointer text-[11px] shadow-xs"
                  title="Wipe local session and start a fresh form"
                >
                  <RotateCcw className="w-3 h-3" />
                  New Session
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-normal">
              Responses are tied to your local browser session. Edits save to remote storage directly whenever you move between fields.
            </p>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Reset Session */}
      {resetConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4" id="reset-confirm-modal">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-2">Start a Fresh Session?</h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              Resetting this browser's session will discard the local session key and start a new blank form. Your previous responses remain saved in the database under the previous session key.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                id="cancel-reset-btn"
                onClick={() => setResetConfirmOpen(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-reset-btn"
                onClick={() => {
                  setResetConfirmOpen(false);
                  handleResetSession();
                }}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium cursor-pointer shadow-sm"
              >
                Reset & Start New
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field 1: User Full Name */}
      <div className="mb-10" id="field-full-name-block">
        <label htmlFor="user-full-name" className="block text-sm font-semibold text-slate-700 mb-2">
          {formConfig.fullNameLabel || 'Full Name'}
          <span className="text-red-500 ml-1 font-bold">*</span>
        </label>
        <input
          type="text"
          id="user-full-name"
          name="fullName"
          value={fullName}
          onChange={(e) => handleFullNameChange(e.target.value)}
          onBlur={(e) => handleBlur('fullName', e.target.value)}
          placeholder="e.g. Jane Doe"
          autoComplete="name"
          className="w-full px-4 py-3 text-lg border-b-2 border-slate-200 focus:border-blue-500 outline-none transition-colors text-slate-900 placeholder:text-slate-400 bg-transparent font-sans"
        />
        <p className="text-xs text-slate-400 mt-2 italic">
          Responses are tied to your local browser session.
        </p>
      </div>

      {/* Tasks Sequence */}
      <div className="space-y-10" id="form-tasks-sequence">
        {tasks.map((task, index) => {
          const answerValue = answers[task.id] || '';
          const stepNumber = String(index + 1).padStart(2, '0');

          return (
            <section key={task.id} id={`task-section-${task.id}`}>
              <div className="flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-500 font-mono">
                  {stepNumber}
                </span>
                <div className="flex-1">
                  <h3 className="text-base font-medium text-slate-800 mb-2">
                    {task.title}
                    {task.required && <span className="text-red-500 ml-1 font-bold">*</span>}
                  </h3>

                  {task.description && (
                    <p className="text-xs text-slate-500 leading-relaxed mb-3 whitespace-pre-line">
                      {task.description}
                    </p>
                  )}

                  <textarea
                    id={`task-input-${task.id}`}
                    rows={4}
                    value={answerValue}
                    onChange={(e) => handleAnswerChange(task.id, e.target.value)}
                    onBlur={(e) => handleBlur(`task:${task.id}`, e.target.value)}
                    placeholder={task.placeholder || 'Type your response here...'}
                    className="w-full min-h-32 p-4 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all resize-y text-slate-900 placeholder:text-slate-400 leading-relaxed font-sans"
                  />

                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                    <span>Auto-saved on blur</span>
                    <span>{answerValue.length} characters</span>
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* Bottom Info & Admin Link */}
      <div className="mt-12 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500" id="form-footer-nav">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>Real-time persistence enabled. You can safely close or refresh this tab.</span>
        </div>

        <button
          id="go-to-admin-btn"
          onClick={onNavigateToAdmin}
          className="text-blue-600 hover:text-blue-800 font-medium underline underline-offset-4 cursor-pointer"
        >
          Admin Interface & Exports &rarr;
        </button>
      </div>
    </div>
  );
};
