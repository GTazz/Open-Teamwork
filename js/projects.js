// ========================================
// EXPLORE (index.html): project list, search, details and applications
// ========================================

/** Qualifications shown on each card; the rest are counted in a "+N" chip. */
const CARD_QUALIFICATIONS = 3;

let projectsData = [];
let projectSearchQuery = '';
let applyingProjectId = null;

const repoGrid = document.getElementById('repo-grid');
const repoCounter = document.getElementById('repo-counter');
const searchInput = document.getElementById('project-search');
const applyModal = document.getElementById('apply-modal');
const detailsModal = document.getElementById('details-modal');

/** @param {number} id */
function findProject(id) {
  return projectsData.find(project => project.id === id);
}

/**
 * Open qualifications first, full ones last.
 * @param {{filled:number,total:number}[]} qualifications
 */
function sortQualifications(qualifications) {
  return [...(qualifications || [])].sort((a, b) => Number(a.filled >= a.total) - Number(b.filled >= b.total));
}

/**
 * Owner's contact e-mail as a mailto link. The API only sends it to people
 * who are signed in, so for visitors this renders nothing.
 * @param {string} email
 */
function renderOwnerEmail(email) {
  if (!looksLikeEmail(email)) return '';
  const value = String(email).trim();
  return `
    <a class="owner-email" href="mailto:${escapeHtmlText(value)}" title="Enviar e-mail para o dono do projeto">
      ${icon('mail', 13)}<span>${escapeHtmlText(value)}</span>
    </a>`;
}

/**
 * Label and style of the apply button for the signed-in person's status.
 * @param {object} project
 */
function applyButtonState(project) {
  if (!isUserAuthenticated()) {
    return { label: 'Candidatar-se', iconName: 'plus', className: 'is-disabled', title: 'Entre na sua conta para se candidatar.' };
  }
  if (project.ownerId === getCurrentUserId()) {
    return { label: 'Seu projeto', iconName: 'repo', className: 'own', title: 'Gerencie este projeto em "Meus Projetos".' };
  }
  switch (project.myApplicationStatus) {
    case 'pending':
      return { label: 'Ver candidatura', iconName: 'pencil', className: 'applied', title: 'Candidatura enviada. Você pode alterá-la.' };
    case 'accepted':
      return { label: 'Você participa', iconName: 'check', className: 'accepted', title: 'Sua candidatura foi aprovada.' };
    default:
      return { label: 'Candidatar-se', iconName: 'plus', className: '', title: '' };
  }
}

/** @param {object} project */
function renderApplyButtonContent(project) {
  const state = applyButtonState(project);
  return `${icon(state.iconName, 14)}<span>${state.label}</span>`;
}

/** @param {HTMLButtonElement} button @param {object} project */
function updateApplyButton(button, project) {
  const state = applyButtonState(project);
  button.className = `btn btn-primary apply-button ${state.className}`.trim();
  button.title = state.title;
  button.innerHTML = renderApplyButtonContent(project);
}

/**
 * Card shown in the project grid.
 * @param {object} project
 */
function createProjectCard(project) {
  const url = safeHttpUrl(project.url);
  const name = escapeHtmlText(project.name);
  const state = applyButtonState(project);
  const qualifications = sortQualifications(project.qualifications);
  const hidden = qualifications.length - CARD_QUALIFICATIONS;

  return `
    <article class="repo-card" data-project-id="${Number(project.id)}">
      <header class="repo-header">
        ${icon('repo', 16, 'repo-icon')}
        ${url
          ? `<a href="${escapeHtmlText(url)}" class="repo-name" target="_blank" rel="noopener noreferrer">${name}</a>`
          : `<span class="repo-name">${name}</span>`}
      </header>
      <div class="repo-owner">
        ${renderOwnerChip(project.ownerNick, project.owner, project.ownerAvatarUrl, 20)}
        ${renderOwnerEmail(project.ownerEmail)}
      </div>
      <p class="repo-description">${escapeHtmlText(project.description)}</p>
      <div class="chip-list repo-qualifications">
        ${qualifications.slice(0, CARD_QUALIFICATIONS).map(renderQualificationChip).join('')}
        ${hidden > 0 ? `<span class="more-chip" title="Veja todas em &quot;Saiba mais&quot;">+${hidden}</span>` : ''}
      </div>
      <footer class="repo-footer">
        <button type="button" class="btn btn-outline" data-action="details">${icon('info', 14)}<span>Saiba mais</span></button>
        <button type="button" class="btn btn-primary apply-button ${state.className}" data-action="apply" title="${escapeHtmlText(state.title)}">
          ${renderApplyButtonContent(project)}
        </button>
      </footer>
    </article>`;
}

// ========================================
// DETAILS MODAL
// ========================================

/** @param {number} projectId */
function openDetailsModal(projectId) {
  const project = findProject(projectId);
  if (!project) return;

  const url = safeHttpUrl(project.url);
  document.getElementById('details-modal-title').innerHTML =
    `${icon('repo', 20, 'repo-icon')}<span>${escapeHtmlText(project.name)}</span>`;
  document.getElementById('details-content').innerHTML = `
    <div class="details-header">
      <div class="details-owner">
        ${renderOwnerChip(project.ownerNick, project.owner, project.ownerAvatarUrl, 24)}
        ${renderOwnerEmail(project.ownerEmail)}
      </div>
      ${url ? `<a href="${escapeHtmlText(url)}" class="details-link" target="_blank" rel="noopener noreferrer">Abrir projeto ${icon('external', 14)}</a>` : ''}
    </div>
    <section class="details-section">
      <h3>Descrição</h3>
      <p class="details-description">${escapeHtmlText(project.description)}</p>
    </section>
    <section class="details-section">
      <h3>Qualificações necessárias</h3>
      <div class="chip-list">${sortQualifications(project.qualifications).map(renderQualificationChip).join('')}</div>
    </section>
    ${(project.tags || []).length ? `
      <section class="details-section">
        <h3>Tags</h3>
        <div class="chip-list">${project.tags.map(renderTag).join('')}</div>
      </section>` : ''}`;

  const applyButton = document.getElementById('details-apply');
  applyButton.dataset.projectId = String(project.id);
  updateApplyButton(applyButton, project);
  openModal(detailsModal);
}

// ========================================
// APPLY MODAL
// ========================================

/** @param {number} projectId */
async function openApplyModal(projectId) {
  if (!isUserAuthenticated()) {
    redirectToLogin();
    return;
  }
  const project = findProject(projectId);
  if (!project) return;
  if (project.ownerId === getCurrentUserId()) {
    window.location.href = pageUrl('meus-projetos');
    return;
  }

  let application;
  try {
    application = (await apiRequest(`/projects/${projectId}/my-application`)).application;
  } catch (error) {
    alert(error.message);
    return;
  }

  applyingProjectId = projectId;
  const pending = new Set(application?.qualificationIds || []);
  const rejected = new Set(application?.rejectedQualificationIds || []);
  const accepted = new Set(application?.acceptedQualificationIds || []);

  document.getElementById('apply-modal-repo').textContent = `${project.owner} / ${project.name}`;
  document.getElementById('qualifications-container').innerHTML = project.qualifications.map(q => {
    const isFull = q.filled >= q.total;
    const isRejected = rejected.has(q.id);
    const isAccepted = accepted.has(q.id);
    const locked = isFull || isRejected || isAccepted;
    const note = isAccepted ? '<span class="qualification-note accepted">Aprovada</span>'
      : isRejected ? '<span class="qualification-note rejected">Recusada</span>'
        : isFull ? '<span class="qualification-note">Sem vagas</span>' : '';
    return `
      <label class="qualification-option${locked ? ' locked' : ''}${isRejected ? ' rejected' : ''}${isAccepted ? ' accepted' : ''}">
        <input type="checkbox" data-qualification-id="${Number(q.id)}"
          ${!isRejected && !isAccepted && pending.has(q.id) ? 'checked' : ''} ${locked ? 'disabled' : ''} />
        ${icon('person', 14, 'person-icon')}
        <span class="qualification-name">${escapeHtmlText(q.name)}</span>
        ${note}
        <span class="qualification-count">${Number(q.filled) || 0}/${Number(q.total) || 0}</span>
      </label>`;
  }).join('');

  openModal(applyModal);
}

async function confirmApply() {
  if (applyingProjectId == null) return;
  const qualificationIds = [...document.querySelectorAll('#qualifications-container input:checked')]
    .map(input => Number(input.dataset.qualificationId));

  const confirmButton = document.getElementById('confirm-apply');
  confirmButton.disabled = true;
  try {
    await apiRequest(`/projects/${applyingProjectId}/applications`, {
      method: 'POST',
      body: JSON.stringify({ qualificationIds }),
    });
  } catch (error) {
    alert(error.message);
    return;
  } finally {
    confirmButton.disabled = false;
  }

  const project = findProject(applyingProjectId);
  if (project && project.myApplicationStatus !== 'accepted') {
    project.myApplicationStatus = qualificationIds.length ? 'pending' : null;
  }
  const card = repoGrid.querySelector(`[data-project-id="${applyingProjectId}"]`);
  if (card && project) card.outerHTML = createProjectCard(project);
  closeModal(applyModal);
}

// ========================================
// SEARCH
// ========================================

// Each tier is worth more than any match in the tiers below it, so a project
// whose name matches always ranks above one that only matches by tag.
// "host" covers the owner's name, @nick and contact e-mail (the e-mail is only
// present for signed-in people).
const SEARCH_WEIGHTS = { name: 1000, host: 100, qualification: 10, tag: 1 };

/**
 * Lowercases and strips accents so "programacao" finds "Programação".
 * @param {string} text
 */
function normalizeSearchText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Score of one term inside one field: a word that starts with the term counts
 * a bit more than a match in the middle of a word.
 */
function scoreField(field, term, weight) {
  const index = field.indexOf(term);
  if (index === -1) return 0;
  const startsWord = index === 0 || /[^a-z0-9]/.test(field[index - 1]);
  return startsWord ? weight * 1.5 : weight;
}

/**
 * Relevance of a project for the query; 0 means no match. Every word of the
 * query has to match somewhere.
 * @param {object} project
 * @param {string[]} terms
 */
function scoreProject(project, terms) {
  const name = normalizeSearchText(project.name);
  const host = normalizeSearchText(`${project.owner} ${project.ownerNick} @${project.ownerNick} ${project.ownerEmail || ''}`);
  const qualifications = (project.qualifications || []).map(q => normalizeSearchText(q.name));
  const tags = (project.tags || []).map(normalizeSearchText);

  let total = 0;
  for (const term of terms) {
    const best = Math.max(
      scoreField(name, term, SEARCH_WEIGHTS.name),
      scoreField(host, term, SEARCH_WEIGHTS.host),
      ...qualifications.map(q => scoreField(q, term, SEARCH_WEIGHTS.qualification)),
      ...tags.map(tag => scoreField(tag, term, SEARCH_WEIGHTS.tag)),
      0
    );
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

/** Projects that match the search, most relevant first (newest first without a search). */
function getVisibleProjects() {
  const terms = normalizeSearchText(projectSearchQuery).split(/\s+/).filter(Boolean);
  if (!terms.length) return projectsData;
  return projectsData
    .map((project, index) => ({ project, index, score: scoreProject(project, terms) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.project);
}

function renderProjects() {
  const matches = getVisibleProjects();
  const query = projectSearchQuery.trim();
  const total = projectsData.length;

  if (!total) {
    repoGrid.innerHTML = renderEmptyState('Nenhum projeto ainda', 'Crie o primeiro em "Meus Projetos".');
  } else if (!matches.length) {
    repoGrid.innerHTML = renderEmptyState(
      'Nenhum projeto encontrado',
      'Tente buscar pelo nome do projeto, por quem criou, por uma qualificação ou por uma tag.'
    );
  } else {
    repoGrid.innerHTML = matches.map(createProjectCard).join('');
  }

  repoCounter.textContent = query
    ? (matches.length
      ? `${matches.length} de ${total} ${total === 1 ? 'projeto' : 'projetos'} para "${query}"`
      : `Nenhum projeto encontrado para "${query}".`)
    : `${total} ${total === 1 ? 'projeto' : 'projetos'}`;
}

// ========================================
// INITIALIZATION
// ========================================

async function loadProjects() {
  try {
    projectsData = (await apiRequest('/projects')).projects;
    renderProjects();
  } catch (error) {
    repoCounter.textContent = '';
    repoGrid.innerHTML = renderEmptyState('Erro ao carregar projetos', 'Tente novamente em instantes.', true);
  }
}

repoGrid.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  const card = event.target.closest('.repo-card');
  if (!button || !card) return;
  const projectId = Number(card.dataset.projectId);
  if (button.dataset.action === 'details') openDetailsModal(projectId);
  else openApplyModal(projectId);
});

document.getElementById('details-apply').addEventListener('click', event => {
  const projectId = Number(event.currentTarget.dataset.projectId);
  closeModal(detailsModal);
  openApplyModal(projectId);
});

document.getElementById('confirm-apply').addEventListener('click', confirmApply);

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    projectSearchQuery = searchInput.value;
    renderProjects();
  }, 150);
});

loadProjects();
