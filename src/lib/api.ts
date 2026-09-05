import { FormConfig, UserResponse, AdminStatus } from '../types';

// Detect whether to use /form/api or /api based on current window location or fallback
function getApiPrefix(): string {
  if (typeof window !== 'undefined') {
    if (window.location.pathname.startsWith('/form')) {
      return '/form/api';
    }
  }
  return '/api';
}

const API_BASE = getApiPrefix();

export async function fetchServerConfig(): Promise<{ basePath: string; configuredPassphraseProtected: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/config`);
    if (res.ok) return await res.json();
  } catch (e) {
    // fallback to /api if /form/api failed or vice-versa
    try {
      const fallback = API_BASE === '/api' ? '/form/api' : '/api';
      const res2 = await fetch(`${fallback}/config`);
      if (res2.ok) return await res2.json();
    } catch {}
  }
  return { basePath: '/form', configuredPassphraseProtected: true };
}

export async function fetchFormConfig(): Promise<FormConfig> {
  const res = await fetch(`${API_BASE}/form`);
  if (!res.ok) throw new Error('Failed to fetch form definition');
  return res.json();
}

export async function updateFormConfig(form: Partial<FormConfig>, adminToken: string): Promise<FormConfig> {
  const res = await fetch(`${API_BASE}/form`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(form),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to update form');
  }
  const data = await res.json();
  return data.form;
}

export async function fetchUserResponse(sessionKey: string): Promise<UserResponse> {
  const res = await fetch(`${API_BASE}/response?sessionKey=${encodeURIComponent(sessionKey)}`);
  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    if (data.error === 'SESSION_INVALIDATED') {
      const err = new Error('SESSION_INVALIDATED');
      (err as any).code = 'SESSION_INVALIDATED';
      throw err;
    }
  }
  if (!res.ok) throw new Error('Failed to load user response');
  return res.json();
}

export async function saveUserResponse(payload: {
  sessionKey: string;
  fullName?: string;
  answers?: Record<string, string>;
  field?: string;
  value?: string;
}): Promise<{ success: boolean; response: UserResponse; savedAt: string }> {
  const res = await fetch(`${API_BASE}/response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    if (data.error === 'SESSION_INVALIDATED') {
      const err = new Error('SESSION_INVALIDATED');
      (err as any).code = 'SESSION_INVALIDATED';
      throw err;
    }
  }

  if (!res.ok) {
    throw new Error('Failed to save response');
  }
  return res.json();
}

export async function resetUserSession(sessionKey: string): Promise<void> {
  await fetch(`${API_BASE}/response?sessionKey=${encodeURIComponent(sessionKey)}`, {
    method: 'DELETE',
  });
}

// Admin API
export async function getAdminStatus(token?: string | null): Promise<AdminStatus> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/admin/status`, { headers });
  if (!res.ok) throw new Error('Failed to check admin status');
  return res.json();
}

export async function claimFirstAdmin(): Promise<{ success: boolean; token: string }> {
  const res = await fetch(`${API_BASE}/admin/claim-first`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to claim initial admin rights');
  }
  return res.json();
}

export async function claimForceAdmin(passphrase: string): Promise<{ success: boolean; token: string }> {
  const res = await fetch(`${API_BASE}/admin/claim-force`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ passphrase }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Incorrect passphrase');
  }
  return res.json();
}

export async function regenerateAdminToken(token: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/admin/regenerate-token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to regenerate token');
  return res.json();
}

export async function fetchAdminResponses(token: string): Promise<{
  responses: UserResponse[];
  total: number;
  form: FormConfig;
}> {
  const res = await fetch(`${API_BASE}/admin/responses`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load responses');
  return res.json();
}

export async function invalidateUserSession(sessionKey: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/invalidate-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionKey }),
  });
  if (!res.ok) throw new Error('Failed to invalidate session');
}

export async function reactivateUserSession(sessionKey: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/reactivate-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sessionKey }),
  });
  if (!res.ok) throw new Error('Failed to reactivate session');
}

export async function invalidateAllUserSessions(token: string): Promise<number> {
  const res = await fetch(`${API_BASE}/admin/invalidate-all-users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to invalidate all sessions');
  const data = await res.json();
  return data.count;
}

export async function deleteUserResponse(sessionKey: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/responses/${encodeURIComponent(sessionKey)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to delete response');
}

export function getExportUrl(format: 'csv' | 'json', token: string): string {
  return `${API_BASE}/admin/export?format=${format}&token=${encodeURIComponent(token)}`;
}
