// ========================================
// CONSTANTS AND REFERENCES
// ========================================

const profileApp = document.querySelector('[data-profile-app]');
const authPanel = document.querySelector('[data-auth-panel]');
const profilePanel = document.querySelector('[data-profile-panel]');
const authMessage = document.querySelector('[data-auth-message]');
const profileMessage = document.querySelector('[data-profile-message]');
const loginHero = document.querySelector('[data-login-hero]');
const profileHero = document.querySelector('[data-profile-hero]');
const profileNameDisplay = document.querySelector('[data-profile-name-display]');
const profileEmailDisplay = document.querySelector('[data-profile-email-display]');
const avatarPreview = document.querySelector('[data-avatar-preview]');
const profileHeaderAvatar = document.querySelector('[data-profile-header-avatar]');
const logoutButton = document.querySelector('[data-logout-button]');
const avatarRemoveButton = document.querySelector('[data-avatar-remove]');
const avatarUploadButton = document.querySelector('[data-avatar-upload]');
const profileResetButton = document.querySelector('[data-profile-reset]');
const profileForm = document.querySelector('[data-profile-form]');
const profileActions = document.querySelector('[data-profile-actions]');
const authTabs = [...document.querySelectorAll('[data-auth-tab]')];
const authForms = [...document.querySelectorAll('[data-auth-form]')];
const loginForm = document.querySelector('[data-auth-form="login"]');
const signupForm = document.querySelector('[data-auth-form="signup"]');
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const signupNameInput = document.getElementById('signup-name');
const signupNickInput = document.getElementById('signup-nick');
const signupNickStatus = document.getElementById('signup-nick-status');
const profilePublicLink = document.querySelector('[data-profile-public-link]');
const signupEmailInput = document.getElementById('signup-email');
const signupPasswordInput = document.getElementById('signup-password');
const signupConfirmPasswordInput = document.getElementById('signup-confirm-password');
const profileAvatarInput = document.getElementById('profile-avatar');
const profileNameInput = document.getElementById('profile-name');
const profileEmailInput = document.getElementById('profile-email');
const profilePhoneInput = document.getElementById('profile-phone');
const profileLocationInput = document.getElementById('profile-location');
const profileBioInput = document.getElementById('profile-bio');
const profileGithubInput = document.getElementById('profile-github');
const profileLinkedinInput = document.getElementById('profile-linkedin');
const profileXInput = document.getElementById('profile-x');
const profileWebsiteInput = document.getElementById('profile-website');

const DEFAULT_PROFILE = {
  avatarUrl: '',
  bio: '',
  contact: {
    email: '',
    phone: '',
    location: '',
  },
  socials: {
    github: '',
    linkedin: '',
    x: '',
    website: '',
  },
};

const SOCIAL_PREFIXES = {
  github: 'https://github.com/',
  linkedin: 'https://www.linkedin.com/in/',
};

let activeAuthTab = 'login';
let activeAvatarDataUrl = '';
let activeSessionEmail = '';
let initialProfileFormState = null;
let activeAccount = null;

// ========================================
// UTILITIES
// ========================================

/**
 * Normalizes an email for comparison and storage.
 * @param {string} value
 * @returns {string}
 */
function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Trims free text.
 * @param {string} value
 * @returns {string}
 */
function normalizeText(value) {
  return String(value || '').trim();
}

/**
 * Sanitizes a URL and allows only HTTP and HTTPS protocols.
 * @param {string} value
 * @returns {string}
 */
function sanitizeUrl(value) {
  const rawValue = normalizeText(value);
  if (!rawValue) return '';

  // "seusite.com" (sem protocolo) vira "https://seusite.com".
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(rawValue) ? rawValue : `https://${rawValue}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch (_) {
    return '';
  }

  return '';
}

/**
 * Extracts the editable portion of a social URL after its fixed prefix.
 * @param {string} value
 * @param {string} prefix
 * @returns {string}
 */
function getSocialSuffix(value, prefix) {
  const rawValue = normalizeText(value);
  if (!rawValue) return '';

  const normalizedPrefix = prefix.toLowerCase();
  if (rawValue.toLowerCase().startsWith(normalizedPrefix)) {
    return rawValue.slice(prefix.length).replace(/^\/+|\/+$/g, '');
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }

    if (prefix === SOCIAL_PREFIXES.linkedin) {
      const pathname = parsed.pathname.replace(/^\/+|\/+$/g, '');
      if (pathname.toLowerCase().startsWith('in/')) {
        return pathname.slice(3).replace(/^\/+|\/+$/g, '');
      }
      return pathname;
    }

    return parsed.pathname.replace(/^\/+|\/+$/g, '');
  } catch (_) {
    return rawValue.replace(/^\/+|\/+$/g, '');
  }
}

/**
 * Builds a complete social URL from the editable portion.
 * @param {string} suffix
 * @param {string} prefix
 * @returns {string}
 */
function buildSocialUrl(suffix, prefix) {
  const normalizedSuffix = normalizeText(suffix).replace(/^\/+|\/+$/g, '');
  if (!normalizedSuffix) return '';
  return `${prefix}${normalizedSuffix}`;
}

/**
 * Builds a normalized form state to detect changes.
 * @param {any} account
 * @returns {string}
 */
function getProfileFormState(account) {
  return JSON.stringify({
    name: normalizeText(profileNameInput?.value),
    contactEmail: normalizeEmail(profileEmailInput?.value),
    phone: normalizeText(profilePhoneInput?.value),
    // Removed field: preserve the existing value to avoid false change detection.
    location: normalizeText(account?.profile?.contact?.location || ''),
    bio: normalizeText(profileBioInput?.value),
    github: buildSocialUrl(getSocialSuffix(profileGithubInput?.value || '', SOCIAL_PREFIXES.github), SOCIAL_PREFIXES.github),
    linkedin: buildSocialUrl(getSocialSuffix(profileLinkedinInput?.value || '', SOCIAL_PREFIXES.linkedin), SOCIAL_PREFIXES.linkedin),
    website: sanitizeUrl(profileWebsiteInput?.value || ''),
    avatarUrl: activeAvatarDataUrl,
  });
}

/**
 * Shows or hides save/discard actions based on form changes.
 */
function updateProfileActionsVisibility() {
  if (!profileActions) return;

  const account = getAccount(activeSessionEmail);
  if (!account || !initialProfileFormState) {
    profileActions.classList.add('hidden');
    return;
  }

  const hasChanges = getProfileFormState(account) !== initialProfileFormState;
  profileActions.classList.toggle('hidden', !hasChanges);
}

/** Returns the active account kept in memory during the session. */
function getAccounts() {
  return activeAccount
    ? { [normalizeEmail(activeAccount.email)]: activeAccount }
    : {};
}

/** Updates the active account in memory. */
function saveAccounts(accounts) {
  const account = accounts[normalizeEmail(activeSessionEmail)];
  if (account) activeAccount = account;
}

/**
 * Recupera o e-mail autenticado atual.
 * @returns {string}
 */
function getSessionEmail() {
  return normalizeEmail(activeSessionEmail);
}

/**
 * Saves the current session.
 * @param {string} email
 */
function setSessionEmail(email) {
  activeSessionEmail = normalizeEmail(email);
}

/**
 * Removes the current session.
 */
function clearSession() {
  activeSessionEmail = '';
  activeAccount = null;
  clearApiToken();
}

/**
 * Creates an empty profile structure.
 * @returns {{avatarUrl: string, bio: string, contact: {phone: string, location: string}, socials: {github: string, linkedin: string, x: string, website: string}}}
 */
function createEmptyProfile() {
  return {
    avatarUrl: DEFAULT_PROFILE.avatarUrl,
    bio: DEFAULT_PROFILE.bio,
    contact: {
      email: DEFAULT_PROFILE.contact.email,
      phone: DEFAULT_PROFILE.contact.phone,
      location: DEFAULT_PROFILE.contact.location,
    },
    socials: {
      github: DEFAULT_PROFILE.socials.github,
      linkedin: DEFAULT_PROFILE.socials.linkedin,
      x: DEFAULT_PROFILE.socials.x,
      website: DEFAULT_PROFILE.socials.website,
    },
  };
}

/**
 * Creates an account structure.
 * @param {{name: string, email: string, password: string}} payload
 * @returns {{name: string, email: string, password: string, profile: ReturnType<typeof createEmptyProfile>}}
 */
function createAccount(payload) {
  return {
    name: normalizeText(payload.name),
    email: normalizeEmail(payload.email),
    password: String(payload.password || ''),
    profile: createEmptyProfile(),
  };
}

/**
 * Converts the API user (name, profile.contact_email, profile.phone...) into
 * the account structure used by this screen.
 * @param {any} user
 * @returns {ReturnType<typeof createAccount>}
 */
function accountFromApiUser(user) {
  const profile = user.profile || {};
  const account = createAccount({
    name: profile.name || user.name,
    email: user.email,
    password: '',
  });
  account.id = user.id;
  account.nick = user.nick || '';
  account.profile = {
    avatarUrl: profile.avatar_url || '',
    bio: profile.bio || '',
    contact: {
      email: profile.contact_email || user.email,
      phone: profile.phone || '',
      location: '',
    },
    socials: {
      github: profile.github_url || '',
      linkedin: profile.linkedin_url || '',
      x: '',
      website: profile.website_url || '',
    },
  };
  return account;
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
 * Retrieves an account by email.
 * @param {string} email
 * @returns {any}
 */
function getAccount(email) {
  const accounts = getAccounts();
  return accounts[normalizeEmail(email)] || null;
}

/**
 * Saves an account and updates the index if the email changed.
 * @param {any} account
 * @param {string} previousEmail
 */
function saveAccount(account, previousEmail) {
  const accounts = getAccounts();
  const normalizedPrevious = normalizeEmail(previousEmail || account.email);
  const normalizedCurrent = normalizeEmail(account.email);

  if (normalizedPrevious && normalizedPrevious !== normalizedCurrent) {
    delete accounts[normalizedPrevious];
  }

  accounts[normalizedCurrent] = account;
  saveAccounts(accounts);

  if (getSessionEmail() === normalizedPrevious) {
    setSessionEmail(normalizedCurrent);
  }
}

/**
 * Returns fallback avatar initials.
 * @param {string} name
 * @param {string} email
 * @returns {string}
 */
function getInitials(name, email) {
  const source = normalizeText(name) || normalizeEmail(email);
  if (!source) return 'OT';

  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/**
 * Displays a feedback message.
 * @param {HTMLElement | null} element
 * @param {string} message
 * @param {'success' | 'error'} type
 */
function showMessage(element, message, type) {
  if (!element) return;

  element.textContent = message;
  element.classList.remove('hidden', 'success', 'error');
  element.classList.add(type);
}

/**
 * Clears and hides a feedback message.
 * @param {HTMLElement | null} element
 */
function clearMessage(element) {
  if (!element) return;

  element.textContent = '';
  element.classList.add('hidden');
  element.classList.remove('success', 'error');
}

/**
 * Switches the hero between login and profile mode.
 * @param {'login' | 'profile'} mode
 */
function setHeroMode(mode) {
  const isLoginMode = mode === 'login';
  document.title = `${isLoginMode ? 'Login' : 'Perfil'} · Open Teamwork`;

  loginHero?.classList.toggle('hidden', !isLoginMode);
  profileHero?.classList.toggle('hidden', isLoginMode);
}

/**
 * Switches the displayed authentication form.
 * @param {'login' | 'signup'} mode
 */
function setAuthTab(mode) {
  activeAuthTab = mode;

  authTabs.forEach(tab => {
    const isActive = tab.dataset.authTab === mode;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });

  authForms.forEach(form => {
    const isVisible = form.dataset.authForm === mode;
    form.classList.toggle('hidden', !isVisible);
  });

  clearMessage(authMessage);
}

/**
 * Updates the avatar preview.
 * @param {string} dataUrl
 * @param {string} name
 * @param {string} email
 */
function renderAvatarPreview(dataUrl, name, email) {
  if (!avatarPreview) return;

  if (dataUrl) {
    avatarPreview.innerHTML = `
      <img src="${escapeHtmlText(dataUrl)}" alt="Foto de perfil atual" />
    `;
    avatarRemoveButton?.classList.remove('hidden');
    if (avatarUploadButton) {
      avatarUploadButton.textContent = 'Trocar imagem';
    }
    return;
  }

  avatarPreview.innerHTML = `
    <div class="avatar-fallback">
      <svg viewBox="0 0 16 16" width="14" height="14" class="person-icon" aria-hidden="true" focusable="false">
        <path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path>
      </svg>
      <span>Sem foto</span>
    </div>
  `;
  avatarRemoveButton?.classList.add('hidden');
  if (avatarUploadButton) {
    avatarUploadButton.textContent = 'Enviar imagem';
  }
}

/**
 * Populates the profile form with user data.
 * @param {any} account
 */
function populateProfileForm(account) {
  const profile = account.profile || createEmptyProfile();
  activeAvatarDataUrl = profile.avatarUrl || '';

  if (profileAvatarInput) profileAvatarInput.value = '';
  if (profileNameInput) profileNameInput.value = account.name || '';
  if (profileEmailInput) profileEmailInput.value = profile.contact?.email || '';
  if (profilePhoneInput) profilePhoneInput.value = profile.contact?.phone || '';
  if (profileLocationInput) profileLocationInput.value = profile.contact?.location || '';
  if (profileBioInput) profileBioInput.value = profile.bio || '';
  if (profileGithubInput) {
    profileGithubInput.value = getSocialSuffix(profile.socials?.github || '', SOCIAL_PREFIXES.github);
  }
  if (profileLinkedinInput) {
    profileLinkedinInput.value = getSocialSuffix(profile.socials?.linkedin || '', SOCIAL_PREFIXES.linkedin);
  }
  if (profileXInput) profileXInput.value = profile.socials?.x || '';
  if (profileWebsiteInput) profileWebsiteInput.value = profile.socials?.website || '';

  renderAvatarPreview(activeAvatarDataUrl, account.name, account.email);
  initialProfileFormState = getProfileFormState(account);
  updateProfileActionsVisibility();
}

/**
 * Updates the profile header and state.
 * @param {any} account
 */
function populateProfileSummary(account) {
  if (profileNameDisplay) profileNameDisplay.textContent = account.name || 'Perfil';
  if (profileEmailDisplay) profileEmailDisplay.textContent = account.email || '';
  if (profilePublicLink) {
    profilePublicLink.textContent = account.nick ? `@${account.nick}` : '';
    if (account.nick) profilePublicLink.href = `./usuario.html?nick=${encodeURIComponent(account.nick)}`;
  }
  // Same avatar that other users see next to the project owner's name.
  if (profileHeaderAvatar) {
    profileHeaderAvatar.innerHTML = renderUserAvatar(account.profile?.avatarUrl || '', 64);
  }
}

/**
 * Displays the login area.
 */
function showLoginView() {
  activeAuthTab = 'login';
  authPanel?.classList.remove('hidden');
  profilePanel?.classList.add('hidden');
  profileActions?.classList.add('hidden');
  initialProfileFormState = null;
  setHeroMode('login');
  setAuthTab('login');
}

/**
 * Displays the profile area.
 * @param {any} account
 */
function showProfileView(account) {
  authPanel?.classList.add('hidden');
  profilePanel?.classList.remove('hidden');
  setHeroMode('profile');
  populateProfileSummary(account);
  populateProfileForm(account);
  clearMessage(profileMessage);
}

// ========================================
// AUTHENTICATION HANDLERS
// ========================================

/**
 * Processes the login form submission.
 * @param {SubmitEvent} event
 */
async function handleLoginSubmit(event) {
  event.preventDefault();
  clearMessage(authMessage);

  const email = normalizeEmail(loginEmailInput?.value);
  const password = String(loginPasswordInput?.value || '');

  if (!email || !password) {
    showMessage(authMessage, 'Preencha e-mail e senha para entrar.', 'error');
    return;
  }

  try {
    const result = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setApiToken(result.token);
    activeAccount = accountFromApiUser(result.user);
    setSessionEmail(activeAccount.email);
    loginForm?.reset();
    showProfileView(activeAccount);
  } catch (error) {
    showMessage(authMessage, error.message, 'error');
  }
}

const NICK_RULES_TEXT =
  'O nick deve ter de 3 a 20 caracteres, usando apenas letras, números e _.';
const NICK_DEFAULT_HINT =
  '3 a 20 caracteres: letras, números e _. É único e não poderá ser alterado depois.';
let nickCheckTimer = null;
let nickCheckId = 0;

/**
 * Tells the person, while typing, whether the nick is free.
 */
function scheduleNickCheck() {
  if (!signupNickInput || !signupNickStatus) return;
  clearTimeout(nickCheckTimer);
  const nick = signupNickInput.value.trim().toLowerCase().replace(/^@/, '');
  signupNickStatus.className = 'input-hint';

  if (!nick) {
    signupNickStatus.textContent = NICK_DEFAULT_HINT;
    return;
  }
  if (!/^[a-z0-9_]{3,20}$/.test(nick)) {
    signupNickStatus.textContent = NICK_RULES_TEXT;
    signupNickStatus.classList.add('nick-bad');
    return;
  }

  signupNickStatus.textContent = 'Verificando...';
  const checkId = ++nickCheckId;
  nickCheckTimer = setTimeout(async () => {
    try {
      const result = await apiRequest(`/nicks/${encodeURIComponent(nick)}`);
      if (checkId !== nickCheckId) return;
      signupNickStatus.textContent = result.available ? `@${nick} está disponível.` : result.message;
      signupNickStatus.classList.add(result.available ? 'nick-ok' : 'nick-bad');
    } catch {
      if (checkId === nickCheckId) signupNickStatus.textContent = NICK_DEFAULT_HINT;
    }
  }, 400);
}

/**
 * Processes the registration form submission.
 * @param {SubmitEvent} event
 */
async function handleSignupSubmit(event) {
  event.preventDefault();
  clearMessage(authMessage);

  const name = normalizeText(signupNameInput?.value);
  const nick = String(signupNickInput?.value || '').trim().toLowerCase().replace(/^@/, '');
  const email = normalizeEmail(signupEmailInput?.value);
  const password = String(signupPasswordInput?.value || '');
  const confirmPassword = String(signupConfirmPasswordInput?.value || '');

  if (!name || !nick || !email || !password || !confirmPassword) {
    showMessage(authMessage, 'Preencha todos os campos para criar a conta.', 'error');
    return;
  }

  if (!/^[a-z0-9_]{3,20}$/.test(nick)) {
    showMessage(authMessage, NICK_RULES_TEXT, 'error');
    return;
  }

  if (password.length < 6) {
    showMessage(authMessage, 'A senha deve ter pelo menos 6 caracteres.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showMessage(authMessage, 'A confirmação de senha não confere.', 'error');
    return;
  }

  try {
    const result = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, nick, email, password }),
    });
    setApiToken(result.token);
    activeAccount = accountFromApiUser(result.user);
    setSessionEmail(activeAccount.email);
    signupForm?.reset();
    showProfileView(activeAccount);
  } catch (error) {
    showMessage(authMessage, error.message, 'error');
  }
}

// ========================================
// PROFILE HANDLERS
// ========================================

/**
 * Updates the profile photo from the selected file.
 * @param {Event} event
 */
async function handleAvatarChange(event) {
  const input = /** @type {HTMLInputElement | null} */ (event.target);
  const file = input?.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showMessage(profileMessage, 'Escolha um arquivo de imagem.', 'error');
    return;
  }

  try {
    activeAvatarDataUrl = await resizeImageToDataUrl(file);
    clearMessage(profileMessage);
    renderAvatarPreview(
      activeAvatarDataUrl,
      profileNameInput?.value || '',
      profileEmailInput?.value || '',
    );
    updateProfileActionsVisibility();
  } catch (error) {
    showMessage(profileMessage, error.message, 'error');
  }
}

/**
 * Removes the current profile photo.
 */
function handleAvatarRemove() {
  activeAvatarDataUrl = '';
  if (profileAvatarInput) profileAvatarInput.value = '';
  renderAvatarPreview(
    activeAvatarDataUrl,
    profileNameInput?.value || '',
    profileEmailInput?.value || '',
  );
  updateProfileActionsVisibility();
}

/**
 * Resets the profile form from the active account.
 */
function handleProfileReset() {
  const account = getAccount(activeSessionEmail);
  if (!account) {
    renderApp();
    return;
  }

  populateProfileSummary(account);
  populateProfileForm(account);
  clearMessage(profileMessage);
}

/**
 * Logs out the current user.
 */
function handleLogout() {
  clearApiToken();
  clearSession();
  activeSessionEmail = '';
  activeAvatarDataUrl = '';
  activeAuthTab = 'login';
  if (profileForm) profileForm.reset();
  clearMessage(profileMessage);
  renderApp();
}

/**
 * Saves profile changes.
 * @param {SubmitEvent} event
 */
async function handleProfileSubmit(event) {
  event.preventDefault();
  clearMessage(profileMessage);

  const currentAccount = getAccount(activeSessionEmail);
  if (!currentAccount) {
    handleLogout();
    return;
  }

  const name = normalizeText(profileNameInput?.value);
  const contactEmail = normalizeEmail(profileEmailInput?.value);
  const phone = normalizeText(profilePhoneInput?.value);
  const location = normalizeText(profileLocationInput?.value || currentAccount.profile?.contact?.location || '');
  const bio = normalizeText(profileBioInput?.value);
  const githubSuffix = getSocialSuffix(profileGithubInput?.value || '', SOCIAL_PREFIXES.github);
  const linkedinSuffix = getSocialSuffix(profileLinkedinInput?.value || '', SOCIAL_PREFIXES.linkedin);
  const github = buildSocialUrl(githubSuffix, SOCIAL_PREFIXES.github);
  const linkedin = buildSocialUrl(linkedinSuffix, SOCIAL_PREFIXES.linkedin);
  const x = sanitizeUrl(profileXInput?.value || '');
  const website = sanitizeUrl(profileWebsiteInput?.value || '');

  if (!name || !contactEmail) {
    showMessage(profileMessage, 'Nome e e-mail de contato são obrigatórios.', 'error');
    return;
  }

  try {
    const result = await apiRequest('/auth/me', {
      method: 'PUT',
      body: JSON.stringify({
        name,
        contactEmail,
        phone,
        bio,
        avatarUrl: activeAvatarDataUrl,
        githubUrl: github,
        linkedinUrl: linkedin,
        websiteUrl: website,
      }),
    });
    activeAccount = accountFromApiUser(result.user);
    setSessionEmail(activeAccount.email);
    showProfileView(activeAccount);
    showMessage(profileMessage, 'Perfil atualizado com sucesso.', 'success');
  } catch (error) {
    showMessage(profileMessage, error.message, 'error');
  }
}

// ========================================
// INITIALIZATION
// ========================================

/**
 * Renders the correct screen for the current session.
 */
async function renderApp() {
  if (!getApiToken()) {
    clearSession();
    showLoginView();
    return;
  }

  try {
    const result = await apiRequest('/auth/me');
    activeAccount = accountFromApiUser(result.user);
    setSessionEmail(activeAccount.email);
    showProfileView(activeAccount);
  } catch (_) {
    clearSession();
    showLoginView();
  }
}

/**
 * Registers profile screen events.
 */
function bindEvents() {
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      setAuthTab(/** @type {'login' | 'signup'} */ (tab.dataset.authTab || 'login'));
    });
  });

  loginForm?.addEventListener('submit', handleLoginSubmit);
  signupForm?.addEventListener('submit', handleSignupSubmit);
  signupNickInput?.addEventListener('input', scheduleNickCheck);
  profileForm?.addEventListener('submit', handleProfileSubmit);
  logoutButton?.addEventListener('click', handleLogout);
  avatarRemoveButton?.addEventListener('click', handleAvatarRemove);
  // The file input is hidden, so let the label work with the keyboard too.
  avatarUploadButton?.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    profileAvatarInput?.click();
  });
  profileResetButton?.addEventListener('click', handleProfileReset);
  profileAvatarInput?.addEventListener('change', handleAvatarChange);
  profileForm?.addEventListener('input', updateProfileActionsVisibility);
  profileForm?.addEventListener('change', updateProfileActionsVisibility);

  profileNameInput?.addEventListener('input', () => {
    renderAvatarPreview(activeAvatarDataUrl, profileNameInput.value, profileEmailInput?.value || '');
    if (profileNameDisplay) profileNameDisplay.textContent = normalizeText(profileNameInput.value) || 'Perfil';
  });

  profileEmailInput?.addEventListener('input', () => {
    renderAvatarPreview(activeAvatarDataUrl, profileNameInput?.value || '', profileEmailInput.value);
    if (profileEmailDisplay) {
      const account = getAccount(activeSessionEmail);
      profileEmailDisplay.textContent = account?.email || '';
    }
  });
}

if (profileApp) {
  bindEvents();
  renderApp();
}
