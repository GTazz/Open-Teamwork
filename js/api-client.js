// ---------------------------------------------------------------------------
// Where the API lives
//  - website:      same address as the page ("/api")
//  - mobile app:   the page is served from inside the app (capacitor://localhost or
//                  https://localhost), so the API must be reached at its public address.
//                  Change PRODUCTION_API_URL to the address of your deployed server.
// ---------------------------------------------------------------------------
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

// Remove legacy prototype data that used localStorage as a database.
['myProjects', 'appliedQualifications', 'openTeamworkAccounts', 'openTeamworkSession']
  .forEach(key => localStorage.removeItem(key));

function getApiToken() {
  return localStorage.getItem(API_TOKEN_KEY) || '';
}

function setApiToken(token) {
  localStorage.setItem(API_TOKEN_KEY, token);
}

function clearApiToken() {
  localStorage.removeItem(API_TOKEN_KEY);
}

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
// SHARED HELPERS (used by several pages)
// ========================================

/**
 * Escapes text before it is placed inside HTML.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Accepts only image data URLs and http(s) URLs as profile pictures.
 * @param {string} value
 * @returns {boolean}
 */
function isSafeAvatarUrl(value) {
  return /^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/|\/api\/users\/[a-z0-9_]{3,20}\/avatar(\?|$))/i
    .test(String(value || ''));
}

/**
 * Builds a round avatar: the user's photo or the default profile icon.
 * @param {string} avatarUrl
 * @param {number} size Size in pixels.
 * @returns {string}
 */
function renderUserAvatar(avatarUrl, size = 20) {
  const dimension = Number(size) || 20;
  // Pictures served by the API come as "/api/users/<nick>/avatar?v=..." (relative to the server).
  const source = String(avatarUrl || '').startsWith('/api/') ? `${API_ORIGIN}${avatarUrl}` : avatarUrl;
  const content = isSafeAvatarUrl(avatarUrl)
    ? `<img src="${escapeHtmlText(source)}" alt="" loading="lazy" />`
    : `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path></svg>`;
  return `<span class="user-avatar" style="--avatar-size: ${dimension}px">${content}</span>`;
}

/**
 * Returns the URL only when it is a valid http(s) address; otherwise ''.
 * Blocks javascript:, data:, vbscript: and any other scheme.
 * @param {unknown} value
 * @returns {string}
 */
function safeHttpUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

// ========================================
// PEOPLE / PUBLIC PROFILES
// ========================================

/**
 * Link to a person's public profile (works from index.html and from /pages/).
 * @param {string} nick
 * @returns {string}
 */
function userProfileUrl(nick) {
  const page = window.location.pathname.includes('/pages/')
    ? './usuario.html'
    : './pages/usuario.html';
  return `${page}?nick=${encodeURIComponent(nick)}`;
}

/**
 * Avatar + name of a person, linked to their public profile when the nick is known.
 * @param {string} nick
 * @param {string} name
 * @param {string} avatarUrl
 * @param {number} size Avatar size in pixels.
 * @returns {string}
 */
function renderOwnerChip(nick, name, avatarUrl, size) {
  const content = `${renderUserAvatar(avatarUrl, size)}<span>${escapeHtmlText(name)}</span>`;
  if (!nick) return `<span class="owner-link">${content}</span>`;
  return `<a class="owner-link" href="${escapeHtmlText(userProfileUrl(nick))}" title="Ver perfil de @${escapeHtmlText(nick)}">${content}</a>`;
}

// ========================================
// INSTALLABLE APP (PWA)
// ========================================
if ('serviceWorker' in navigator && !IS_NATIVE_APP && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
