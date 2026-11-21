// ========================================
// PUBLIC PROFILE (pages/usuario.html?nick=...)
// ========================================

const userView = document.getElementById('user-view');

/** @returns {string} Nick requested in the address bar (lowercase). */
function getRequestedNick() {
  return (new URLSearchParams(window.location.search).get('nick') || '').trim().toLowerCase();
}

/** @param {string} message @param {boolean} isError */
function showUserState(message, isError) {
  userView.innerHTML = `<p class="user-state${isError ? ' error' : ''}">${escapeHtmlText(message)}</p>`;
}

/**
 * "novembro de 2026" from a SQLite UTC timestamp.
 * @param {string} createdAt
 */
function formatMemberSince(createdAt) {
  const date = new Date(`${String(createdAt).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

/** External link pill, only for valid http(s) addresses. */
function renderLinkPill(label, url) {
  const safe = safeHttpUrl(url);
  if (!safe) return '';
  return `<a class="user-link" href="${escapeHtmlText(safe)}" target="_blank" rel="noopener noreferrer nofollow">${label}${icon('external', 12)}</a>`;
}

/** Contact card: only signed-in people receive e-mail/phone from the API. */
function renderContactCard(user) {
  if (!user.contactVisible) {
    return `
      <section class="card user-section">
        <h2>Contato</h2>
        <p class="muted">
          Os dados de contato ficam visíveis apenas para pessoas logadas.
          <a href="./perfil.html">Entrar ou criar conta</a>
        </p>
      </section>`;
  }

  const email = String(user.contact?.email || '');
  const phone = String(user.contact?.phone || '');
  const rows = [];
  if (email) {
    rows.push(`<li><span class="contact-label">E-mail</span>${looksLikeEmail(email)
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
    <section class="card user-section">
      <h2>Contato</h2>
      ${rows.length
        ? `<ul class="contact-list">${rows.join('')}</ul>`
        : '<p class="muted">Esta pessoa não informou dados de contato.</p>'}
    </section>`;
}

/** Draws the whole public profile. */
function renderUserProfile(user) {
  document.title = `${user.name} (@${user.nick}) · Open Teamwork`;
  const since = formatMemberSince(user.createdAt);
  const links = [
    renderLinkPill('GitHub', user.githubUrl),
    renderLinkPill('LinkedIn', user.linkedinUrl),
    renderLinkPill('Site pessoal', user.websiteUrl),
  ].join('');
  const projects = user.projects || [];
  projectsData = projects; // used by the shared cards (project-cards.js)

  userView.innerHTML = `
    <section class="card user-hero-card">
      <div class="user-hero">
        ${renderUserAvatar(user.avatarUrl, 112)}
        <div class="user-hero-info">
          <h1 class="user-name">${escapeHtmlText(user.name)}</h1>
          <p class="user-nick">@${escapeHtmlText(user.nick)}</p>
          ${since ? `<p class="user-since">Membro desde ${escapeHtmlText(since)}</p>` : ''}
          ${links ? `<div class="user-links">${links}</div>` : ''}
        </div>
        ${user.isOwner ? `<a class="btn btn-secondary user-edit-link" href="./perfil.html">${icon('pencil', 14)}<span>Editar perfil</span></a>` : ''}
      </div>
      <p class="user-bio${user.bio ? '' : ' muted'}">${user.bio
        ? escapeHtmlText(user.bio)
        : 'Esta pessoa ainda não escreveu uma descrição.'}</p>
    </section>

    ${renderContactCard(user)}

    <section class="user-section">
      <h2>Projetos <span class="counter">${projects.length}</span></h2>
      ${projects.length
        ? `<div class="repo-grid">${projects.map(createProjectCard).join('')}</div>`
        : '<p class="muted">Esta pessoa ainda não criou projetos.</p>'}
    </section>`;
}

(async function loadUserProfile() {
  const nick = getRequestedNick();
  if (!nick) {
    showUserState('Nenhuma pessoa selecionada. Escolha alguém na lista de membros.', true);
    return;
  }
  userView.innerHTML = `<div class="skeleton-user">${renderSkeleton('profile')}<div class="repo-grid">${renderSkeleton('repo', 2)}</div></div>`;
  try {
    renderUserProfile((await apiRequest(`/users/${encodeURIComponent(nick)}`)).user);
  } catch (error) {
    document.title = 'Perfil não encontrado · Open Teamwork';
    showUserState(error.message, true);
  }
})();
