import { FormConfig, UserResponse, AdminStatus } from '../types';

function getInitialApiPrefix(): string {
  if (typeof window !== 'undefined') {
    if (window.location.pathname.startsWith('/form')) {
      return '/form/api';
    }
  }
  return '/api';
}

let activeApiPrefix = getInitialApiPrefix();

export function getActiveApiPrefix(): string {
  return activeApiPrefix;
}

export function setActiveApiPrefix(prefix: string) {
  activeApiPrefix = prefix.replace(/\/+$/, '');
}

/**
 * Robust fetch wrapper with automatic fallback between /form/api and /api
 */
async function apiFetch(endpoint: string, options?: RequestInit): Promise<Response> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const primaryUrl = `${activeApiPrefix}${cleanEndpoint}`;

  try {
    const res = await fetch(primaryUrl, options);
    const contentType = res.headers.get('content-type') || '';
    const isHtmlFallback = contentType.includes('text/html');

    // If 404 or an HTML SPA fallback was returned for an API endpoint, try the alternate prefix
    if (res.status === 404 || isHtmlFallback) {
      const altPrefix = activeApiPrefix.startsWith('/form') ? '/api' : '/form/api';
      const altUrl = `${altPrefix}${cleanEndpoint}`;
      try {
        const altRes = await fetch(altUrl, options);
        const altContentType = altRes.headers.get('content-type') || '';
        const altIsHtml = altContentType.includes('text/html');
        if (!altIsHtml && (altRes.ok || [400, 401, 403].includes(altRes.status))) {
          activeApiPrefix = altPrefix;
          return altRes;
        }
      } catch {}
    }
    return res;
  } catch (err) {
    const altPrefix = activeApiPrefix.startsWith('/form') ? '/api' : '/form/api';
    const altUrl = `${altPrefix}${cleanEndpoint}`;
    try {
      const altRes = await fetch(altUrl, options);
      const altContentType = altRes.headers.get('content-type') || '';
      const altIsHtml = altContentType.includes('text/html');
      if (!altIsHtml && (altRes.ok || [400, 401, 403].includes(altRes.status))) {
        activeApiPrefix = altPrefix;
        return altRes;
      }
    } catch {}
    throw err;
  }
}

export async function fetchServerConfig(): Promise<{ basePath: string; configuredPassphraseProtected: boolean }> {
  try {
    const res = await apiFetch('/config');
    if (res.ok) {
      const data = await res.json();
      if (data.basePath) {
        // synchronize if needed
        if (typeof window !== 'undefined' && window.location.pathname.startsWith(data.basePath)) {
          activeApiPrefix = `${data.basePath}/api`;
        }
      }
      return data;
    }
  } catch (e) {
    console.warn('Failed to fetch server config, using defaults:', e);
  }
  return { basePath: '/form', configuredPassphraseProtected: true };
}

export async function fetchFormConfig(): Promise<FormConfig> {
  const res = await apiFetch('/form');
  if (!res.ok) throw new Error('Failed to fetch form definition');
  return res.json();
}

export async function updateFormConfig(form: Partial<FormConfig>, adminToken: string): Promise<FormConfig> {
  const res = await apiFetch('/form', {
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
  const res = await apiFetch(`/response?sessionKey=${encodeURIComponent(sessionKey)}`);
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
  const res = await apiFetch('/response', {
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
  await apiFetch(`/response?sessionKey=${encodeURIComponent(sessionKey)}`, {
    method: 'DELETE',
  });
}

// Admin API
export async function getAdminStatus(token?: string | null): Promise<AdminStatus> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await apiFetch('/admin/status', { headers });
  if (!res.ok) throw new Error('Failed to check admin status');
  return res.json();
}

export async function claimFirstAdmin(): Promise<{ success: boolean; token: string }> {
  const res = await apiFetch('/admin/claim-first', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Failed to claim initial admin rights');
  }
  return res.json();
}

export async function claimForceAdmin(passphrase: string): Promise<{ success: boolean; token: string }> {
  const res = await apiFetch('/admin/claim-force', {
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
  const res = await apiFetch('/admin/regenerate-token', {
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
  const res = await apiFetch('/admin/responses', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load responses');
  return res.json();
}

export async function invalidateUserSession(sessionKey: string, token: string): Promise<void> {
  const res = await apiFetch('/admin/invalidate-user', {
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
  const res = await apiFetch('/admin/reactivate-user', {
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
  const res = await apiFetch('/admin/invalidate-all-users', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to invalidate all sessions');
  const data = await res.json();
  return data.count;
}

export async function deleteUserResponse(sessionKey: string, token: string): Promise<void> {
  const res = await apiFetch(`/admin/responses/${encodeURIComponent(sessionKey)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to delete response');
}

export function getExportUrl(format: 'csv' | 'json', token: string): string {
  return `${activeApiPrefix}/admin/export?format=${format}&token=${encodeURIComponent(token)}`;
}
