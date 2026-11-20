// ========================================
// PROJECT CARDS (shared by Explorar and the public profile)
// Card markup, "Saiba mais" details modal and the application modal.
// Pages that use it fill `projectsData` and include the two modals.
// ========================================

/** Qualifications shown on each card; the rest are counted in a "+N" chip. */
const CARD_QUALIFICATIONS = 3;

let projectsData = [];
let applyingProjectId = null;

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
  const full = {
    label: 'Vagas preenchidas', iconName: 'lock', className: 'full', disabled: true,
    title: 'Todas as vagas deste projeto já foram preenchidas.',
  };
  if (!isUserAuthenticated()) {
    if (isProjectFull(project)) return full;
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
      return isProjectFull(project)
        ? full
        : { label: 'Candidatar-se', iconName: 'plus', className: '', title: '' };
  }
}

/** True when every qualification of the project has all its slots filled. */
function isProjectFull(project) {
  const qualifications = project.qualifications || [];
  return qualifications.length > 0 && qualifications.every(q => q.filled >= q.total);
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
  button.disabled = Boolean(state.disabled);
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
        <button type="button" class="btn btn-primary apply-button ${state.className}" data-action="apply" title="${escapeHtmlText(state.title)}"${state.disabled ? ' disabled' : ''}>
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

/**
 * @param {number} projectId
 * @param {HTMLButtonElement} [trigger] Button that shows a spinner while loading.
 */
async function openApplyModal(projectId, trigger) {
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
  setButtonBusy(trigger, true);
  try {
    application = (await apiRequest(`/projects/${projectId}/my-application`)).application;
  } catch (error) {
    alert(error.message);
    return;
  } finally {
    setButtonBusy(trigger, false);
  }
  if (!detailsModal.classList.contains('hidden')) closeModal(detailsModal);

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
  setButtonBusy(confirmButton, true);
  try {
    await apiRequest(`/projects/${applyingProjectId}/applications`, {
      method: 'POST',
      body: JSON.stringify({ qualificationIds }),
    });
  } catch (error) {
    alert(error.message);
    return;
  } finally {
    setButtonBusy(confirmButton, false);
  }

  const project = findProject(applyingProjectId);
  if (project) {
    // Same rules as the server: approved/declined answers stay, the pending
    // set is replaced by what was just sent, and a pending one wins the button.
    const statuses = new Set((project.myApplicationStatuses || []).filter(status => status !== 'pending'));
    if (qualificationIds.length) statuses.add('pending');
    project.myApplicationStatuses = [...statuses].sort();
    project.myApplicationStatus = ['pending', 'accepted', 'rejected'].find(status => statuses.has(status)) || null;
  }
  const card = document.querySelector(`.repo-card[data-project-id="${applyingProjectId}"]`);
  if (card && project) card.outerHTML = createProjectCard(project);
  closeModal(applyModal);
  // Lets the page react (e.g. Explorar re-applies its filter and counters).
  document.dispatchEvent(new CustomEvent('project:updated', { detail: { projectId: applyingProjectId } }));
}

// ========================================
// EVENTS
// ========================================

document.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  const card = event.target.closest('.repo-card');
  if (!button || !card) return;
  const projectId = Number(card.dataset.projectId);
  if (button.dataset.action === 'details') openDetailsModal(projectId);
  else openApplyModal(projectId, button);
});

document.getElementById('details-apply').addEventListener('click', event => {
  openApplyModal(Number(event.currentTarget.dataset.projectId), event.currentTarget);
});

document.getElementById('confirm-apply').addEventListener('click', confirmApply);
