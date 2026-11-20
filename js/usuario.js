// ========================================
// PUBLIC PROFILE ("usuario.html?nick=...")
// ========================================

const userView = document.getElementById('user-view');

const PERSON_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" class="person-icon" aria-hidden="true"><path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path></svg>';
const EXTERNAL_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill-rule="evenodd" d="M10.604 1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1zM3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"></path></svg>';

/** @returns {string} Nick requested in the address bar (lowercase). */
function getRequestedNick() {
  return (new URLSearchParams(window.location.search).get('nick') || '').trim().toLowerCase();
}

/**
 * Shows a status message (loading, not found, error) instead of the profile.
 * @param {string} message
 * @param {boolean} isError
 */
function showUserState(message, isError) {
  userView.innerHTML = `<p class="user-state${isError ? ' error' : ''}">${escapeHtmlText(message)}</p>`;
}

/**
 * "novembro de 2026" from a SQLite UTC timestamp.
 * @param {string} createdAt
 * @returns {string}
 */
function formatMemberSince(createdAt) {
  const date = new Date(`${String(createdAt).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/**
 * External link pill, only for valid http(s) addresses.
 * @param {string} label
 * @param {string} url
 * @returns {string}
 */
function renderLinkPill(label, url) {
  const safe = safeHttpUrl(url);
  if (!safe) return '';
  return `<a class="user-link" href="${escapeHtmlText(safe)}" target="_blank" rel="noopener noreferrer nofollow">${label}${EXTERNAL_ICON}</a>`;
}

/**
 * Contact card: only signed-in people receive e-mail/phone from the API.
 * @param {any} user
 * @returns {string}
 */
function renderContactCard(user) {
  if (!user.contactVisible) {
    return `
      <section class="profile-card user-section">
        <h2>Contato</h2>
        <p class="user-muted">
          Os dados de contato ficam visíveis apenas para pessoas logadas.
          <a href="./perfil.html">Entrar ou criar conta</a>
        </p>
      </section>`;
  }

  const email = String((user.contact && user.contact.email) || '');
  const phone = String((user.contact && user.contact.phone) || '');
  const rows = [];
  if (email) {
    const looksValid = /^[^\s@<>"']+@[^\s@<>"']+$/.test(email);
    rows.push(`<li><span class="contact-label">E-mail</span>${looksValid
      ? `<a href="mailto:${escapeHtmlText(email)}">${escapeHtmlText(email)}</a>`
      : escapeHtmlText(email)}</li>`);
  }
  if (phone) {
    const digits = phone.replace(/[^\d+]/g, '');
    rows.push(`<li><span class="contact-label">Telefone</span>${digits
      ? `<a href="tel:${escapeHtmlText(digits)}">${escapeHtmlText(phone)}</a>`
      : escapeHtmlText(phone)}</li>`);
  }

  return `
    <section class="profile-card user-section">
      <h2>Contato</h2>
      ${rows.length
        ? `<ul class="contact-list">${rows.join('')}</ul>`
        : '<p class="user-muted">Esta pessoa não informou dados de contato.</p>'}
    </section>`;
}

/**
 * Card for one of the person's projects.
 * @param {any} project
 * @returns {string}
 */
function renderUserProject(project) {
  const url = safeHttpUrl(project.url);
  const title = url
    ? `<a href="${escapeHtmlText(url)}" target="_blank" rel="noopener noreferrer">${escapeHtmlText(project.name)}</a>`
    : escapeHtmlText(project.name);
  const qualifications = (project.qualifications || []).map(q => `
    <div class="qualification-item-card${q.filled >= q.total ? ' full' : ''}">
      ${PERSON_ICON}
      <span class="qualification-name">${escapeHtmlText(q.name)}</span>
      <span class="qualification-count">${Number(q.filled) || 0}/${Number(q.total) || 0}</span>
    </div>`).join('');
  const tags = (project.tags || []).map(tag => `<span class="topic-tag">${escapeHtmlText(tag)}</span>`).join('');

  return `
    <article class="project-card user-project">
      <h3 class="project-card-title">${title}</h3>
      <p class="project-card-description">${escapeHtmlText(project.description)}</p>
      <div class="project-card-qualifications">${qualifications}</div>
      ${tags ? `<div class="project-card-tags">${tags}</div>` : ''}
    </article>`;
}

/**
 * Draws the whole public profile.
 * @param {any} user
 */
function renderUserProfile(user) {
  document.title = `${user.name} (@${user.nick}) · Open Teamwork`;
  const since = formatMemberSince(user.createdAt);
  const links = [
    renderLinkPill('GitHub', user.githubUrl),
    renderLinkPill('LinkedIn', user.linkedinUrl),
    renderLinkPill('Site pessoal', user.websiteUrl),
  ].join('');
  const projects = user.projects || [];

  userView.innerHTML = `
    <section class="profile-panel user-hero-card">
      <div class="user-hero">
        ${renderUserAvatar(user.avatarUrl, 112)}
        <div class="user-hero-info">
          <h1 class="user-name">${escapeHtmlText(user.name)}</h1>
          <p class="user-nick">@${escapeHtmlText(user.nick)}</p>
          ${since ? `<p class="user-since">Membro desde ${escapeHtmlText(since)}</p>` : ''}
          ${links ? `<div class="user-links">${links}</div>` : ''}
        </div>
        ${user.isOwner ? '<a class="btn-secondary user-edit-link" href="./perfil.html">Editar meu perfil</a>' : ''}
      </div>
      <p class="user-bio${user.bio ? '' : ' user-muted'}">${user.bio
        ? escapeHtmlText(user.bio)
        : 'Esta pessoa ainda não escreveu uma descrição.'}</p>
    </section>

    ${renderContactCard(user)}

    <section class="user-section">
      <h2>Projetos (${projects.length})</h2>
      ${projects.length
        ? `<div class="user-projects">${projects.map(renderUserProject).join('')}</div>`
        : '<p class="user-muted">Esta pessoa ainda não criou projetos.</p>'}
    </section>`;
}

async function loadUserProfile() {
  const nick = getRequestedNick();
  if (!nick) {
    showUserState('Nenhuma pessoa selecionada. Escolha alguém na lista de colaboradores.', true);
    return;
  }
  try {
    const { user } = await apiRequest(`/users/${encodeURIComponent(nick)}`);
    renderUserProfile(user);
  } catch (error) {
    document.title = 'Perfil não encontrado · Open Teamwork';
    showUserState(error.message, true);
  }
}

loadUserProfile();
