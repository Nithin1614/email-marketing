const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

function getToken(): string | null {
  if (typeof window !== 'undefined') {
    const match = document.cookie.match(new RegExp('(^| )auth_token=([^;]+)'));
    if (match && match[2] && match[2] !== 'preview_token') return match[2];
    const local = localStorage.getItem('auth_token');
    if (local && local !== 'preview_token') return local;
  }
  return null;
}

function handleUnauthorized(response: Response) {
  if (response.status === 401 && typeof window !== 'undefined') {
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/public/')) {
      document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
  }
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }
  return headers;
}

export const apiClient = {
  get: async (endpoint: string) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: getHeaders(),
      cache: 'no-store',
    });
    handleUnauthorized(response);
    if (!response.ok) {
      throw new Error(`GET ${endpoint} failed: ${response.statusText}`);
    }
    return response.json();
  },

  post: async (endpoint: string, data: unknown) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: getHeaders(),
      cache: 'no-store',
      body: JSON.stringify(data),
    });
    handleUnauthorized(response);
    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const errData = await response.json();
        if (errData.error) errorMsg = errData.error;
        else if (errData.detail) errorMsg = errData.detail;
      } catch (e) {}
      throw new Error(errorMsg || `POST ${endpoint} failed: ${response.statusText}`);
    }
    return response.json();
  },

  patch: async (endpoint: string, data: unknown) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PATCH',
      headers: getHeaders(),
      cache: 'no-store',
      body: JSON.stringify(data),
    });
    handleUnauthorized(response);
    if (!response.ok) {
      throw new Error(`PATCH ${endpoint} failed: ${response.statusText}`);
    }
    return response.json();
  },

  delete: async (endpoint: string) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: getHeaders(),
      cache: 'no-store',
    });
    handleUnauthorized(response);
    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const errData = await response.json();
        if (errData.error) errorMsg = errData.error;
      } catch (e) {}
      throw new Error(errorMsg || `DELETE ${endpoint} failed`);
    }
  },

  download: async (endpoint: string, filename: string) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: getHeaders(),
    });
    handleUnauthorized(response);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  },

  login: async (username: string, password: string): Promise<string> => {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      throw new Error('Login failed. Check your credentials.');
    }
    const data = await response.json();
    if (typeof window !== 'undefined') {
      document.cookie = `auth_token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
      localStorage.setItem('auth_token', data.token);
    }
    return data.token;
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      document.cookie = 'auth_token=; path=/; max-age=0; SameSite=Lax';
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
  },
};
