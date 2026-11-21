// ========================================
// SHARED UI HELPERS (used by every page)
// ========================================

/** Octicons (16px, filled) used across the pages. */
const ICONS = {
  person: '<path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path>',
  repo: '<path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"></path>',
  info: '<path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75zM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"></path>',
  plus: '<path fill-rule="evenodd" d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z"></path>',
  pencil: '<path fill-rule="evenodd" d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064l6.286-6.286z"></path>',
  trash: '<path fill-rule="evenodd" d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19c.9 0 1.652-.681 1.741-1.576l.66-6.6a.75.75 0 00-1.492-.149l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"></path>',
  link: '<path fill-rule="evenodd" d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path>',
  external: '<path fill-rule="evenodd" d="M10.604 1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1zM3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"></path>',
  mail: '<path fill-rule="evenodd" d="M1.75 2A1.75 1.75 0 000 3.75v.736a.75.75 0 000 .027v7.737C0 13.216.784 14 1.75 14h12.5A1.75 1.75 0 0016 12.25v-8.5A1.75 1.75 0 0014.25 2H1.75zM14.5 4.07v-.32a.25.25 0 00-.25-.25H1.75a.25.25 0 00-.25.25v.32L8 7.88l6.5-3.81zm-13 1.74v6.441c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V5.809L8.38 9.397a.75.75 0 01-.76 0L1.5 5.809z"></path>',
  check: '<path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"></path>',
  lock: '<path fill-rule="evenodd" d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2Z"></path>',
};

/**
 * Inline SVG for one of the ICONS.
 * @param {keyof typeof ICONS} name
 * @param {number} size
 * @param {string} className
 */
function icon(name, size = 16, className = '') {
  return `<svg${className ? ` class="${className}"` : ''} viewBox="0 0 16 16" width="${size}" height="${size}" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

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

/** @param {unknown} value */
function looksLikeEmail(value) {
  return /^[^\s@<>"']+@[^\s@<>"']+$/.test(String(value || '').trim());
}

/** Path to another page, from index.html or from /pages/. */
function pageUrl(page) {
  // Website: every page lives at its own name ("/perfil", "/" for Explorar).
  if (!IS_NATIVE_APP) return page === 'index' ? '/' : `/${page}`;
  // App bundle (no server): real files, index.html at the root and the rest in pages/.
  const inPages = window.location.pathname.includes('/pages/');
  if (page === 'index') return inPages ? '../index.html' : './index.html';
  return inPages ? `./${page}.html` : `./pages/${page}.html`;
}

/** @param {string} nick */
function userProfileUrl(nick) {
  return `${pageUrl('usuario')}?nick=${encodeURIComponent(nick)}`;
}

/** Sends the visitor to the login screen. */
function redirectToLogin() {
  window.location.href = pageUrl('perfil');
}

/**
 * Accepts only image data URLs, http(s) URLs and avatars served by the API.
 * @param {string} value
 */
function isSafeAvatarUrl(value) {
  return /^(data:image\/(png|jpe?g|webp|gif);base64,|https?:\/\/|\/api\/users\/[a-z0-9_]{3,20}\/avatar(\?|$))/i
    .test(String(value || ''));
}

/**
 * Round avatar: the user's photo or the default profile icon.
 * @param {string} avatarUrl
 * @param {number} size Size in pixels.
 */
function renderUserAvatar(avatarUrl, size = 20) {
  const dimension = Number(size) || 20;
  // Pictures served by the API come as "/api/users/<nick>/avatar?v=..." (relative to the server).
  const source = String(avatarUrl || '').startsWith('/api/') ? `${API_ORIGIN}${avatarUrl}` : avatarUrl;
  const content = isSafeAvatarUrl(avatarUrl)
    ? `<img src="${escapeHtmlText(source)}" alt="" loading="lazy" />`
    : icon('person', 16);
  return `<span class="user-avatar" style="--avatar-size: ${dimension}px">${content}</span>`;
}

/**
 * Avatar + name of a person, linked to their public profile when the nick is known.
 * @param {string} nick
 * @param {string} name
 * @param {string} avatarUrl
 * @param {number} size Avatar size in pixels.
 */
function renderOwnerChip(nick, name, avatarUrl, size) {
  const content = `${renderUserAvatar(avatarUrl, size)}<span>${escapeHtmlText(name)}</span>`;
  if (!nick) return `<span class="owner-link">${content}</span>`;
  return `<a class="owner-link" href="${escapeHtmlText(userProfileUrl(nick))}" title="Ver perfil de @${escapeHtmlText(nick)}">${content}</a>`;
}

/**
 * Read-only chip for a qualification: "Name 1/3" (crossed out when full).
 * @param {{name: string, filled: number, total: number}} qualification
 */
function renderQualificationChip(qualification) {
  const filled = Number(qualification.filled) || 0;
  const total = Number(qualification.total) || 0;
  const isFull = total > 0 && filled >= total;
  return `
    <span class="qualification-chip${isFull ? ' full' : ''}" title="${isFull ? 'Vagas preenchidas' : `${total - filled} vaga(s) disponível(is)`}">
      ${icon('person', 12, 'person-icon')}
      <span class="qualification-name">${escapeHtmlText(qualification.name)}</span>
      <span class="qualification-count">${filled}/${total}</span>
    </span>`;
}

/** @param {string} tag */
function renderTag(tag) {
  return `<span class="topic-tag">${escapeHtmlText(tag)}</span>`;
}

/**
 * Empty or error message that spans the whole grid/list.
 * @param {string} title
 * @param {string} text
 * @param {boolean} isError
 */
function renderEmptyState(title, text = '', isError = false) {
  return `
    <div class="empty-state${isError ? ' error' : ''}">
      <h3>${escapeHtmlText(title)}</h3>
      ${text ? `<p>${escapeHtmlText(text)}</p>` : ''}
    </div>`;
}

// ========================================
// LOADING STATES (skeletons and busy buttons)
// ========================================

const SKELETON_LINE = (width, className = '') =>
  `<span class="skeleton skeleton-line ${className}" style="width:${width}"></span>`;
const SKELETON_CIRCLE = size =>
  `<span class="skeleton skeleton-circle" style="width:${size}px;height:${size}px"></span>`;

/** Placeholder shapes that mimic each kind of card while the data loads. */
const SKELETONS = {
  repo: () => `
    <div class="repo-card skeleton-card">
      ${SKELETON_LINE('55%', 'skeleton-title')}
      <div class="skeleton-row">${SKELETON_CIRCLE(20)}${SKELETON_LINE('40%')}</div>
      ${SKELETON_LINE('100%')}${SKELETON_LINE('80%')}
      <div class="skeleton-row">${SKELETON_LINE('42%', 'skeleton-chip')}${SKELETON_LINE('30%', 'skeleton-chip')}</div>
      <div class="skeleton-row skeleton-footer">${SKELETON_LINE('96px', 'skeleton-button')}${SKELETON_LINE('124px', 'skeleton-button')}</div>
    </div>`,
  person: () => `
    <div class="person-card skeleton-card">
      ${SKELETON_CIRCLE(56)}
      <div class="skeleton-stack">${SKELETON_LINE('60%', 'skeleton-title')}${SKELETON_LINE('35%')}${SKELETON_LINE('90%')}</div>
    </div>`,
  project: () => `
    <div class="project-card skeleton-card">
      ${SKELETON_LINE('40%', 'skeleton-title')}
      ${SKELETON_LINE('90%')}${SKELETON_LINE('65%')}
      <div class="skeleton-row">${SKELETON_LINE('120px', 'skeleton-chip')}${SKELETON_LINE('90px', 'skeleton-chip')}</div>
    </div>`,
  profile: () => `
    <div class="card skeleton-card">
      <div class="skeleton-row skeleton-hero">
        ${SKELETON_CIRCLE(96)}
        <div class="skeleton-stack">${SKELETON_LINE('45%', 'skeleton-heading')}${SKELETON_LINE('25%')}${SKELETON_LINE('35%')}</div>
      </div>
      ${SKELETON_LINE('100%')}${SKELETON_LINE('75%')}
    </div>
    <div class="card skeleton-card">${SKELETON_LINE('20%', 'skeleton-title')}${SKELETON_LINE('50%')}${SKELETON_LINE('40%')}</div>`,
  panel: () => `
    <div class="skeleton-card skeleton-panel">${SKELETON_LINE('30%', 'skeleton-title')}${SKELETON_LINE('85%')}${SKELETON_LINE('70%')}</div>`,
};

/**
 * Markup for a loading placeholder. Screen readers hear "Carregando…" once.
 * @param {keyof SKELETONS} kind
 * @param {number} count
 */
function renderSkeleton(kind, count = 1) {
  return `<span class="visually-hidden" role="status">Carregando…</span>`
    + `<div class="skeleton-group" aria-hidden="true" style="display:contents">${Array.from({ length: count }, SKELETONS[kind]).join('')}</div>`;
}

/**
 * Shows a spinner on a button while a request runs, and blocks double clicks.
 * @param {HTMLButtonElement} button
 * @param {boolean} busy
 */
function setButtonBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('is-busy', busy);
  button.setAttribute('aria-busy', String(busy));
}

// ========================================
// MODALS (shared open/close behaviour)
// ========================================

let openModalElement = null;
let modalReturnFocus = null;

/**
 * Opens a modal: closes on Esc, on a click outside the box and on any
 * [data-modal-close] button. Focus moves into the modal and comes back after.
 * @param {HTMLElement} modal
 */
function openModal(modal) {
  if (openModalElement && openModalElement !== modal) closeModal(openModalElement);
  modalReturnFocus = document.activeElement;
  openModalElement = modal;
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  const focusTarget = modal.querySelector('[data-autofocus]') || modal.querySelector('.modal-content');
  focusTarget?.focus({ preventScroll: true });
}

/** @param {HTMLElement} modal */
function closeModal(modal = openModalElement) {
  if (!modal) return;
  modal.classList.add('hidden');
  if (openModalElement === modal) openModalElement = null;
  if (!openModalElement) document.body.classList.remove('modal-open');
  if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus({ preventScroll: true });
  modalReturnFocus = null;
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && openModalElement) closeModal();
});

document.addEventListener('click', event => {
  if (!openModalElement) return;
  if (event.target === openModalElement || event.target.closest('[data-modal-close]')) closeModal();
});
