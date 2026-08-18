const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || '').trim();

const API_BASE = configuredApiBase.replace(/\/+$/, '');

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!API_BASE || API_BASE === '/') {
    return normalizedPath;
  }

  if (API_BASE.endsWith('/api') && normalizedPath.startsWith('/api/')) {
    return `${API_BASE}${normalizedPath.slice('/api'.length)}`;
  }

  return `${API_BASE}${normalizedPath}`;
}
