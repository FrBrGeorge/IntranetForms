import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchUserResponse, saveUserResponse, resetUserSession } from '../lib/api';
import { UserResponse } from '../types';

const STORAGE_KEY = 'intranet_user_session_key';

function generateNewSessionKey(): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `usr_${time}_${rand}`;
}

export function useUserSession() {
  const [sessionKey, setSessionKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
      const created = generateNewSessionKey();
      localStorage.setItem(STORAGE_KEY, created);
      return created;
    }
    return generateNewSessionKey();
  });

  const [fullName, setFullName] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'invalidated'>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [sessionInvalidatedNotice, setSessionInvalidatedNotice] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestDataRef = useRef({ fullName: '', answers: {} as Record<string, string> });

  // Update ref
  latestDataRef.current = { fullName, answers };

  // Load existing submission on mount or sessionKey change
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchUserResponse(sessionKey)
      .then((data: UserResponse) => {
        if (!isMounted) return;
        setFullName(data.fullName || '');
        setAnswers(data.answers || {});
        if (data.updatedAt) {
          setLastSaved(new Date(data.updatedAt));
          setSaveStatus('saved');
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err.message === 'SESSION_INVALIDATED' || (err as any).code === 'SESSION_INVALIDATED') {
          // Admin invalidated this session key!
          handleSessionInvalidated();
        } else {
          console.error('Failed to load response:', err);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sessionKey]);

  // Handle session invalidation
  const handleSessionInvalidated = useCallback(() => {
    const newKey = generateNewSessionKey();
    localStorage.setItem(STORAGE_KEY, newKey);
    setSessionKey(newKey);
    setFullName('');
    setAnswers({});
    setSaveStatus('invalidated');
    setSessionInvalidatedNotice(true);
    setLoading(false);
  }, []);

  // Save specific field or full form
  const performSave = useCallback(
    async (field?: string, value?: string) => {
      setSaveStatus('saving');
      setErrorMessage(null);

      try {
        const payload: {
          sessionKey: string;
          fullName: string;
          answers: Record<string, string>;
          field?: string;
          value?: string;
        } = {
          sessionKey,
          fullName: latestDataRef.current.fullName,
          answers: latestDataRef.current.answers,
        };

        if (field && value !== undefined) {
          payload.field = field;
          payload.value = value;
        }

        const res = await saveUserResponse(payload);
        setSaveStatus('saved');
        setLastSaved(new Date(res.savedAt));
      } catch (err: any) {
        if (err.message === 'SESSION_INVALIDATED' || err.code === 'SESSION_INVALIDATED') {
          handleSessionInvalidated();
        } else {
          console.error('Error auto-saving:', err);
          setSaveStatus('error');
          setErrorMessage('Unable to auto-save to remote server. Check connection.');
        }
      }
    },
    [sessionKey, handleSessionInvalidated]
  );

  // Field change handlers
  const handleFullNameChange = (val: string) => {
    setFullName(val);
    setSaveStatus('saving');

    // Debounce save in background while typing
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      performSave('fullName', val);
    }, 1200);
  };

  const handleAnswerChange = (taskId: string, val: string) => {
    setAnswers((prev) => ({ ...prev, [taskId]: val }));
    setSaveStatus('saving');

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      performSave(`task:${taskId}`, val);
    }, 1200);
  };

  // Focus leave (blur) handler: immediately save to remote storage
  const handleBlur = (field: string, value: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    performSave(field, value);
  };

  // User manually resets their own browser session
  const handleResetSession = async () => {
    try {
      await resetUserSession(sessionKey);
    } catch {}
    const newKey = generateNewSessionKey();
    localStorage.setItem(STORAGE_KEY, newKey);
    setSessionKey(newKey);
    setFullName('');
    setAnswers({});
    setSaveStatus('idle');
    setLastSaved(null);
    setSessionInvalidatedNotice(false);
  };

  return {
    sessionKey,
    fullName,
    answers,
    loading,
    saveStatus,
    lastSaved,
    sessionInvalidatedNotice,
    dismissInvalidatedNotice: () => setSessionInvalidatedNotice(false),
    errorMessage,
    handleFullNameChange,
    handleAnswerChange,
    handleBlur,
    handleResetSession,
    triggerManualSave: () => performSave(),
  };
}
