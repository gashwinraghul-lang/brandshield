let csrfToken = null;

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function setCsrfToken(token) {
  csrfToken = token || null;
}

export function getCsrfToken() {
  return csrfToken;
}

async function request(path, { method = 'GET', body, formData, signal } = {}) {
  const headers = { accept: 'application/json' };
  if (csrfToken && method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = csrfToken;
  const options = { method, headers, credentials: 'same-origin', signal };
  if (formData) {
    options.body = formData;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('brandshield:unauthorized'));
  }
  const contentType = response.headers.get('content-type') || '';
  let payload = null;
  if (contentType.includes('application/json')) {
    payload = await response.json().catch(() => null);
  } else {
    payload = await response.text().catch(() => '');
  }
  if (!response.ok) {
    const message = payload?.error || (typeof payload === 'string' && payload) || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload?.details);
  }
  return payload;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  postForm: (path, formData, options) => request(path, { ...options, method: 'POST', formData }),
};

export async function downloadFile(path, fallbackName = 'brandshield-download') {
  const response = await fetch(path, { credentials: 'same-origin' });
  if (!response.ok) {
    let message = 'Download failed';
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function timeAgo(value) {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

export function titleCase(value = '') {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
