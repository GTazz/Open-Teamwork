// ========================================
// LOGIN / SIGN-UP / PROFILE (pages/perfil.html)
// ========================================

const $ = selector => document.querySelector(selector);

const authPanel = $('[data-auth-panel]');
const profilePanel = $('[data-profile-panel]');
const authMessage = $('[data-auth-message]');
const profileMessage = $('[data-profile-message]');
const pageTitle = $('[data-page-title]');
const pageLead = $('[data-page-lead]');
const authTabs = [...document.querySelectorAll('[data-auth-tab]')];
const authForms = [...document.querySelectorAll('[data-auth-form]')];
const loginForm = $('[data-auth-form="login"]');
const signupForm = $('[data-auth-form="signup"]');
const profileForm = $('[data-profile-form]');
const profileActions = $('[data-profile-actions]');
const avatarPreview = $('[data-avatar-preview]');
const avatarInput = $('#profile-avatar');
const avatarUploadButton = $('[data-avatar-upload]');
const avatarRemoveButton = $('[data-avatar-remove]');
const nickInput = $('#signup-nick');
const nickStatus = $('#signup-nick-status');

const fields = {
  name: $('#profile-name'),
  bio: $('#profile-bio'),
  contactEmail: $('#profile-email'),
  phone: $('#profile-phone'),
  github: $('#profile-github'),
  linkedin: $('#profile-linkedin'),
  website: $('#profile-website'),
};

const SOCIAL_PREFIXES = {
  github: 'https://github.com/',
  linkedin: 'https://www.linkedin.com/in/',
};

const NICK_RULES_TEXT = 'O nick deve ter de 3 a 20 caracteres, usando apenas letras, números e _.';
const NICK_DEFAULT_HINT = nickStatus ? nickStatus.innerHTML : '';

/** Signed-in user as returned by the API. */
let currentUser = null;
/** Profile photo being edited (data URL, API URL or ''). */
let avatarValue = '';
/** Snapshot of the form when it was filled, to detect unsaved changes. */
let savedFormState = '';

// ========================================
// HELPERS
// ========================================

/**
 * Website field: "seusite.com" becomes "https://seusite.com"; other schemes are refused.
 * @param {string} value
 */
function normalizeWebsite(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return safeHttpUrl(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
}

/**
 * Part of a GitHub/LinkedIn URL after the fixed prefix ("https://github.com/ana" -> "ana").
 * Also accepts a full URL pasted into the field.
 * @param {string} value
 * @param {string} prefix
 */
function socialSuffix(value, prefix) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith(prefix.toLowerCase())) return raw.slice(prefix.length).replace(/^\/+|\/+$/g, '');
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname.replace(/^\/+|\/+$/g, '');
    return prefix === SOCIAL_PREFIXES.linkedin && path.toLowerCase().startsWith('in/') ? path.slice(3) : path;
  } catch {
    return raw.replace(/^\/+|\/+$/g, '');
  }
}

/** @param {string} value @param {string} prefix */
function socialUrl(value, prefix) {
  const suffix = socialSuffix(value, prefix);
  return suffix ? prefix + suffix : '';
}

/** Values that would be sent to the API. */
function readForm() {
  return {
    name: fields.name.value.trim(),
    contactEmail: fields.contactEmail.value.trim().toLowerCase(),
    phone: fields.phone.value.trim(),
    bio: fields.bio.value.trim(),
    avatarUrl: avatarValue,
    githubUrl: socialUrl(fields.github.value, SOCIAL_PREFIXES.github),
    linkedinUrl: socialUrl(fields.linkedin.value, SOCIAL_PREFIXES.linkedin),
    websiteUrl: normalizeWebsite(fields.website.value),
  };
}

/**
 * Reads an image file, crops it to a square and shrinks it so it fits in the database.
 * @param {File} file
 * @param {number} maxSize
 * @returns {Promise<string>} JPEG data URL
 */
function resizeImageToDataUrl(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const target = Math.min(maxSize, side);
      const canvas = document.createElement('canvas');
      canvas.width = target;
      canvas.height = target;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, target, target);
      context.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        target,
        target
      );
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Não foi possível ler essa imagem.'));
    };
    image.src = objectUrl;
  });
}

/**
 * @param {HTMLElement} element
 * @param {string} message
 * @param {'success' | 'error'} type
 */
function showMessage(element, message, type) {
  element.textContent = message;
  element.className = `form-message ${type}`;
}

/** @param {HTMLElement} element */
function clearMessage(element) {
  element.textContent = '';
  element.className = 'form-message hidden';
}

// ========================================
// VIEWS
// ========================================

/** @param {'login' | 'signup'} mode */
function setAuthTab(mode) {
  authTabs.forEach(tab => {
    const isActive = tab.dataset.authTab === mode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
  authForms.forEach(form => form.classList.toggle('hidden', form.dataset.authForm !== mode));
  clearMessage(authMessage);
}

function renderAvatarPreview() {
  avatarPreview.innerHTML = avatarValue
    ? renderUserAvatar(avatarValue, 128)
    : `<span class="avatar-empty">${icon('person', 48)}<span>Sem foto</span></span>`;
  avatarRemoveButton.classList.toggle('hidden', !avatarValue);
  avatarUploadButton.textContent = avatarValue ? 'Trocar foto' : 'Enviar foto';
}

function updateUnsavedState() {
  const changed = Boolean(currentUser) && JSON.stringify(readForm()) !== savedFormState;
  profileActions.classList.toggle('hidden', !changed);
}

function showLoginView() {
  currentUser = null;
  document.title = 'Entrar · Open Teamwork';
  pageTitle.textContent = 'Entrar';
  pageLead.textContent = 'Entre na sua conta ou crie uma nova para fazer parte da comunidade.';
  pageLead.classList.remove('hidden');
  authPanel.classList.remove('hidden');
  profilePanel.classList.add('hidden');
  setAuthTab('login');
}

/** @param {any} user */
function showProfileView(user) {
  currentUser = user;
  const profile = user.profile || {};
  document.title = 'Perfil · Open Teamwork';
  pageTitle.textContent = 'Meu perfil';
  pageLead.classList.add('hidden');
  authPanel.classList.add('hidden');
  profilePanel.classList.remove('hidden');

  $('[data-profile-header-avatar]').innerHTML = renderUserAvatar(profile.avatar_url || '', 64);
  $('[data-profile-name-display]').textContent = profile.name || user.name || 'Perfil';
  $('[data-profile-email-display]').textContent = user.email || '';
  const publicLink = $('[data-profile-public-link]');
  publicLink.textContent = user.nick ? `@${user.nick}` : '';
  publicLink.href = user.nick ? `./usuario.html?nick=${encodeURIComponent(user.nick)}` : './pessoas.html';

  fields.name.value = profile.name || user.name || '';
  fields.bio.value = profile.bio || '';
  fields.contactEmail.value = profile.contact_email || user.email || '';
  fields.phone.value = profile.phone || '';
  fields.github.value = socialSuffix(profile.github_url, SOCIAL_PREFIXES.github);
  fields.linkedin.value = socialSuffix(profile.linkedin_url, SOCIAL_PREFIXES.linkedin);
  fields.website.value = profile.website_url || '';
  avatarValue = profile.avatar_url || '';
  avatarInput.value = '';

  renderAvatarPreview();
  savedFormState = JSON.stringify(readForm());
  updateUnsavedState();
}

// ========================================
// AUTHENTICATION
// ========================================

/** @param {string} path @param {object} body @param {HTMLFormElement} form */
async function authenticate(path, body, form) {
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const result = await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
    setApiToken(result.token);
    form.reset();
    clearMessage(authMessage);
    showProfileView(result.user);
  } catch (error) {
    showMessage(authMessage, error.message, 'error');
  } finally {
    submit.disabled = false;
  }
}

loginForm.addEventListener('submit', event => {
  event.preventDefault();
  const email = $('#login-email').value.trim().toLowerCase();
  const password = $('#login-password').value;
  if (!email || !password) {
    showMessage(authMessage, 'Preencha e-mail e senha para entrar.', 'error');
    return;
  }
  authenticate('/auth/login', { email, password }, loginForm);
});

signupForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = $('#signup-name').value.trim();
  const nick = nickInput.value.trim().toLowerCase().replace(/^@/, '');
  const email = $('#signup-email').value.trim().toLowerCase();
  const password = $('#signup-password').value;
  const confirmPassword = $('#signup-confirm-password').value;

  let error = '';
  if (!name || !nick || !email || !password || !confirmPassword) error = 'Preencha todos os campos para criar a conta.';
  else if (!/^[a-z0-9_]{3,20}$/.test(nick)) error = NICK_RULES_TEXT;
  else if (password.length < 6) error = 'A senha deve ter pelo menos 6 caracteres.';
  else if (password !== confirmPassword) error = 'A confirmação de senha não confere.';
  if (error) {
    showMessage(authMessage, error, 'error');
    return;
  }
  authenticate('/auth/register', { name, nick, email, password }, signupForm);
});

// While typing, tell the person whether the nick is free.
let nickCheckTimer = null;
let nickCheckId = 0;
nickInput.addEventListener('input', () => {
  clearTimeout(nickCheckTimer);
  const nick = nickInput.value.trim().toLowerCase().replace(/^@/, '');
  nickStatus.className = 'input-hint';

  if (!nick) {
    nickStatus.innerHTML = NICK_DEFAULT_HINT;
    return;
  }
  if (!/^[a-z0-9_]{3,20}$/.test(nick)) {
    nickStatus.textContent = NICK_RULES_TEXT;
    nickStatus.classList.add('is-bad');
    return;
  }

  nickStatus.textContent = 'Verificando...';
  const checkId = ++nickCheckId;
  nickCheckTimer = setTimeout(async () => {
    try {
      const result = await apiRequest(`/nicks/${encodeURIComponent(nick)}`);
      if (checkId !== nickCheckId) return;
      nickStatus.textContent = result.available ? `@${nick} está disponível.` : result.message;
      nickStatus.classList.add(result.available ? 'is-good' : 'is-bad');
    } catch {
      if (checkId === nickCheckId) nickStatus.innerHTML = NICK_DEFAULT_HINT;
    }
  }, 400);
});

authTabs.forEach(tab => tab.addEventListener('click', () => setAuthTab(tab.dataset.authTab)));

// ========================================
// PROFILE
// ========================================

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showMessage(profileMessage, 'Escolha um arquivo de imagem.', 'error');
    return;
  }
  try {
    avatarValue = await resizeImageToDataUrl(file);
    clearMessage(profileMessage);
    renderAvatarPreview();
    updateUnsavedState();
  } catch (error) {
    showMessage(profileMessage, error.message, 'error');
  }
});

// The file input is hidden, so the label also works with the keyboard.
avatarUploadButton.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  avatarInput.click();
});

avatarRemoveButton.addEventListener('click', () => {
  avatarValue = '';
  avatarInput.value = '';
  renderAvatarPreview();
  updateUnsavedState();
});

fields.name.addEventListener('input', () => {
  $('[data-profile-name-display]').textContent = fields.name.value.trim() || 'Perfil';
});

profileForm.addEventListener('input', updateUnsavedState);
profileForm.addEventListener('change', updateUnsavedState);

$('[data-profile-reset]').addEventListener('click', () => {
  if (currentUser) showProfileView(currentUser);
  clearMessage(profileMessage);
});

profileForm.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage(profileMessage);
  const values = readForm();
  if (!values.name || !values.contactEmail) {
    showMessage(profileMessage, 'Nome e e-mail de contato são obrigatórios.', 'error');
    return;
  }
  const submit = profileForm.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const result = await apiRequest('/auth/me', { method: 'PUT', body: JSON.stringify(values) });
    showProfileView(result.user);
    showMessage(profileMessage, 'Perfil atualizado com sucesso.', 'success');
  } catch (error) {
    showMessage(profileMessage, error.message, 'error');
  } finally {
    submit.disabled = false;
  }
});

$('[data-logout-button]').addEventListener('click', () => {
  clearApiToken();
  profileForm.reset();
  clearMessage(profileMessage);
  showLoginView();
});

// Warn before leaving with unsaved changes.
window.addEventListener('beforeunload', event => {
  if (!profileActions.classList.contains('hidden')) event.preventDefault();
});

// ========================================
// START
// ========================================

(async function start() {
  if (!getApiToken()) {
    showLoginView();
    return;
  }
  try {
    showProfileView((await apiRequest('/auth/me')).user);
  } catch {
    clearApiToken();
    showLoginView();
  }
})();
