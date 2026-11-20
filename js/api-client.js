// ========================================
// API CLIENT
// - website:     same address as the page ("/api")
// - mobile app:  the page is served from inside the app (capacitor://localhost
//                or https://localhost), so the API is reached at its public address.
// ========================================
const PRODUCTION_API_URL = 'https://open-teamwork.onrender.com';
const IS_NATIVE_APP =
  window.location.protocol === 'capacitor:' ||
  (window.location.hostname === 'localhost' && window.location.protocol === 'https:') ||
  Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const API_ORIGIN = IS_NATIVE_APP
  ? PRODUCTION_API_URL
  : window.location.protocol === 'file:'
    ? 'http://localhost:3000'
    : '';
const API_BASE_URL = `${API_ORIGIN}/api`;
const API_TOKEN_KEY = 'openTeamworkApiToken';

function getApiToken() {
  return localStorage.getItem(API_TOKEN_KEY) || '';
}

function setApiToken(token) {
  localStorage.setItem(API_TOKEN_KEY, token);
}

function clearApiToken() {
  localStorage.removeItem(API_TOKEN_KEY);
}

/** @returns {boolean} True when there is a saved session. */
function isUserAuthenticated() {
  return Boolean(getApiToken());
}

/**
 * Id of the signed-in person, read from the session token (only to adapt the
 * screen, e.g. "your project"; the server checks every permission itself).
 * @returns {number|null}
 */
function getCurrentUserId() {
  try {
    const payload = getApiToken().split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return Number(JSON.parse(json).sub) || null;
  } catch {
    return null;
  }
}

/**
 * Calls the API and returns the JSON body. Errors carry the server message.
 * @param {string} path For example "/projects".
 * @param {RequestInit} options
 */
async function apiRequest(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getApiToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

// ========================================
// INSTALLABLE APP (PWA)
// ========================================
if ('serviceWorker' in navigator && !IS_NATIVE_APP && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
