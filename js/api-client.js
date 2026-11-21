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

/**
 * Website only: links in the HTML point to "page.html" (needed by the app,
 * which has no server). Clicks go straight to the clean address ("/pages/perfil",
 * "/") instead of taking the server's redirect.
 */
if (!IS_NATIVE_APP && window.location.protocol !== 'file:') {
  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link || link.target === '_blank' || event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.endsWith('.html')) return;
    url.pathname = url.pathname.endsWith('/index.html') ? url.pathname.slice(0, -'index.html'.length) : url.pathname.slice(0, -5);
    event.preventDefault();
    window.location.href = url.toString();
  });
}
const API_TOKEN_KEY = 'openTeamworkApiToken';

/** Expiry (Unix seconds) written inside the session token, or 0 when unreadable. */
function readTokenExpiry(token) {
  try {
    const json = atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
    return Number(JSON.parse(json).exp) || 0;
  } catch {
    return 0;
  }
}

/**
 * Saved session token. An expired one is dropped here: the server would ignore
 * it, so keeping it would make the screen look signed in (no e-mails on cards,
 * "Candidatar-se" failing) while the API treats the person as a visitor.
 */
function getApiToken() {
  const token = localStorage.getItem(API_TOKEN_KEY) || '';
  if (token && readTokenExpiry(token) * 1000 <= Date.now()) {
    localStorage.removeItem(API_TOKEN_KEY);
    return '';
  }
  return token;
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

  trackSlowRequest(1);
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique sua internet e tente de novo.');
  } finally {
    trackSlowRequest(-1);
  }
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // The server refused the saved session (expired, or signed with an old key):
    // forget it so the screen stops pretending the person is signed in.
    if (response.status === 401 && token) clearApiToken();
    const error = new Error(body.error || 'Não foi possível concluir a operação.');
    error.status = response.status;
    error.body = body; // extra fields, e.g. { verificationRequired, email }
    throw error;
  }
  return body;
}

// ========================================
// SLOW SERVER NOTICE
// The free server sleeps when idle and takes up to a minute to wake up. When a
// request takes longer than a few seconds, a small notice explains the wait.
// ========================================
const SLOW_REQUEST_MS = 3500;
let pendingRequests = 0;
let slowTimer = null;

/** @param {1|-1} change */
function trackSlowRequest(change) {
  pendingRequests += change;
  if (pendingRequests > 0 && !slowTimer) {
    slowTimer = setTimeout(() => toggleSlowNotice(true), SLOW_REQUEST_MS);
  } else if (pendingRequests === 0) {
    clearTimeout(slowTimer);
    slowTimer = null;
    toggleSlowNotice(false);
  }
}

/** @param {boolean} visible */
function toggleSlowNotice(visible) {
  let notice = document.getElementById('slow-notice');
  if (!notice && !visible) return;
  if (!notice) {
    notice = document.createElement('div');
    notice.id = 'slow-notice';
    notice.className = 'slow-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<span class="spinner" aria-hidden="true"></span>'
      + '<span><strong>Conectando ao servidor…</strong> Quando ele está em repouso, '
      + 'a primeira visita pode levar até um minuto.</span>';
    document.body.appendChild(notice);
  }
  notice.classList.toggle('visible', visible);
}

// ========================================
// INSTALLABLE APP (PWA)
// ========================================
if ('serviceWorker' in navigator && !IS_NATIVE_APP && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
