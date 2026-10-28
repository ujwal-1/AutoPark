/**
 * AutoPark Frontend Configuration Module
 * Centralizes API and WebSocket base URLs across all pages and components.
 */

export function getBackendHost(): string {
  if (typeof window !== 'undefined') {
    return window.location.hostname || 'localhost';
  }
  return 'localhost';
}

export function getApiBaseUrl(): string {
  // Respect environment variable if provided at build/runtime
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  const host = getBackendHost();
  return `http://${host}:8000`;
}

export function getWsUrl(): string {
  // Respect environment variable if provided at build/runtime
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  const host = getBackendHost();
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${host}:8000/ws/parking`;
}
