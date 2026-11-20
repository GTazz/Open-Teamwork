// ========================================
// MY PROJECTS (pages/meus-projetos.html): list, create/edit, applications
// ========================================

const projectsList = document.getElementById('projects-list');
const projectModal = document.getElementById('create-project-modal');
const projectModalTitle = document.getElementById('create-project-title');
const newProjectButton = document.getElementById('btn-new-project');
const saveProjectButton = document.getElementById('save-project');
const projectForm = document.getElementById('project-form');
const qualificationRows = document.getElementById('qualifications-inputs');

/** Project being edited (null when creating a new one). */
let editingProjectId = null;
/** Last list returned by the API, used by the edit form and the applications panel. */
let myProjects = [];
/** Projects whose applications panel is open (kept open across re-renders). */
const openPanels = new Set();

const STATUS_LABELS = { pending: 'Pendente', accepted: 'Aprovada', rejected: 'Recusada' };

// ========================================
// LIST
// ========================================

/** @param {object} project */
function renderProjectCard(project) {
  const id = Number(project.id);
  const url = safeHttpUrl(project.url);
  return `
    <article class="project-card" data-project-id="${id}">
      <header class="project-card-header">
        <div class="project-card-heading">
          <h2 class="project-card-title">${escapeHtmlText(project.name)}</h2>
          ${url
            ? `<a href="${escapeHtmlText(url)}" class="project-card-url" target="_blank" rel="noopener noreferrer">${icon('link', 12)}<span>${escapeHtmlText(url)}</span></a>`
            : '<span class="project-card-url muted">Sem link</span>'}
        </div>
        <div class="project-card-actions">
          <button type="button" class="btn btn-secondary" data-action="applications" aria-expanded="${openPanels.has(id)}">Candidaturas</button>
          <button type="button" class="btn btn-icon" data-action="edit" aria-label="Editar projeto" title="Editar projeto">${icon('pencil')}</button>
          <button type="button" class="btn btn-icon btn-icon-danger" data-action="delete" aria-label="Excluir projeto" title="Excluir projeto">${icon('trash')}</button>
        </div>
      </header>
      <p class="project-card-description">${escapeHtmlText(project.description)}</p>
      <div class="chip-list">${(project.qualifications || []).map(renderQualificationChip).join('')}</div>
      ${(project.tags || []).length ? `<div class="chip-list">${project.tags.map(renderTag).join('')}</div>` : ''}
      <div class="applications-slot"></div>
    </article>`;
}

async function loadMyProjects() {
  if (!isUserAuthenticated()) {
    newProjectButton.classList.add('is-disabled');
    newProjectButton.title = 'Entre na sua conta para criar um projeto.';
    projectsList.innerHTML = `
      <div class="empty-state">
        <h3>Entre para ver seus projetos</h3>
        <p>Com uma conta você cria projetos e recebe candidaturas.</p>
        <a class="btn btn-primary" href="./perfil.html">Entrar ou criar conta</a>
      </div>`;
    return;
  }

  newProjectButton.classList.remove('is-disabled');
  newProjectButton.title = '';
  try {
    myProjects = (await apiRequest('/projects/mine')).projects;
  } catch (error) {
    projectsList.innerHTML = renderEmptyState('Não foi possível carregar seus projetos', error.message, true);
    return;
  }

  if (!myProjects.length) {
    projectsList.innerHTML = renderEmptyState('Você ainda não criou nenhum projeto', 'Toque em "Novo projeto" para começar.');
    return;
  }

  projectsList.innerHTML = myProjects.map(renderProjectCard).join('');
  await Promise.all([...openPanels].map(id => showApplications(id)));
}

// ========================================
// APPLICATIONS PANEL
// ========================================

/**
 * @param {object} application
 * @param {object} project
 */
function renderApplication(application, project) {
  const qualification = (project.qualifications || []).find(q => q.name === application.qualification);
  const isFull = qualification ? qualification.filled >= qualification.total : false;
  const person = application.nick
    ? `<a class="owner-link" href="${escapeHtmlText(userProfileUrl(application.nick))}">${escapeHtmlText(application.name)}<span class="applicant-nick">@${escapeHtmlText(application.nick)}</span></a>`
    : escapeHtmlText(application.name);
  const action = (status, label, className, disabled = false, title = '') => `
    <button type="button" class="btn btn-small ${className}" data-status="${status}" data-application-id="${Number(application.id)}"
      ${disabled ? 'disabled' : ''} ${title ? `title="${escapeHtmlText(title)}"` : ''}>${label}</button>`;

  return `
    <li class="application-item">
      <div class="application-info">
        <strong>${person}</strong>
        <span>${escapeHtmlText(application.qualification || 'Qualificação não informada')}</span>
        ${looksLikeEmail(application.email) ? `<a href="mailto:${escapeHtmlText(application.email)}">${escapeHtmlText(application.email)}</a>` : ''}
      </div>
      <div class="application-actions">
        <span class="status-badge status-${application.status}">${STATUS_LABELS[application.status] || application.status}</span>
        ${application.status === 'pending'
          ? action('rejected', 'Recusar', 'btn-danger-outline')
            + action('accepted', 'Aprovar', 'btn-success-outline', isFull, isFull ? 'Esta qualificação já está com as vagas preenchidas.' : '')
          : action('pending', 'Tornar pendente', 'btn-secondary')}
      </div>
    </li>`;
}

/** @param {number} projectId */
async function showApplications(projectId) {
  const card = projectsList.querySelector(`[data-project-id="${projectId}"]`);
  const project = myProjects.find(item => item.id === projectId);
  if (!card || !project) return;
  const slot = card.querySelector('.applications-slot');

  let applications;
  try {
    applications = (await apiRequest(`/projects/${projectId}/applications`)).applications;
  } catch (error) {
    slot.innerHTML = `<p class="applications-panel error">${escapeHtmlText(error.message)}</p>`;
    return;
  }

  const groups = [
    ['pending', 'Pendentes'],
    ['accepted', 'Aprovadas'],
    ['rejected', 'Recusadas'],
  ].map(([status, title]) => ({ title, items: applications.filter(a => a.status === status) }))
    .filter(group => group.items.length);

  slot.innerHTML = `
    <section class="applications-panel" aria-label="Candidaturas de ${escapeHtmlText(project.name)}">
      ${groups.length
        ? groups.map(group => `
            <h3>${group.title} <span class="counter">${group.items.length}</span></h3>
            <ul class="application-list">${group.items.map(a => renderApplication(a, project)).join('')}</ul>`).join('')
        : '<p class="muted">Nenhuma candidatura recebida ainda.</p>'}
    </section>`;
}

/** @param {number} projectId @param {HTMLButtonElement} button */
async function toggleApplications(projectId, button) {
  if (openPanels.has(projectId)) {
    openPanels.delete(projectId);
    button.setAttribute('aria-expanded', 'false');
    button.closest('.project-card').querySelector('.applications-slot').innerHTML = '';
    return;
  }
  openPanels.add(projectId);
  button.setAttribute('aria-expanded', 'true');
  await showApplications(projectId);
}

/** @param {number} projectId @param {HTMLButtonElement} button */
async function updateApplicationStatus(projectId, button) {
  button.disabled = true;
  try {
    await apiRequest(`/projects/${projectId}/applications/${button.dataset.applicationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: button.dataset.status }),
    });
    // Reload so the vacancy counters on the card match the new status.
    await loadMyProjects();
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
}

/** @param {number} projectId */
async function deleteProject(projectId) {
  if (!confirm('Excluir este projeto? As candidaturas recebidas também serão apagadas.')) return;
  try {
    await apiRequest(`/projects/${projectId}`, { method: 'DELETE' });
    openPanels.delete(projectId);
    await loadMyProjects();
  } catch (error) {
    alert(error.message);
  }
}

projectsList.addEventListener('click', event => {
  const button = event.target.closest('button');
  const card = event.target.closest('.project-card');
  if (!button || !card) return;
  const projectId = Number(card.dataset.projectId);

  if (button.dataset.status) updateApplicationStatus(projectId, button);
  else if (button.dataset.action === 'applications') toggleApplications(projectId, button);
  else if (button.dataset.action === 'edit') openProjectModal(myProjects.find(p => p.id === projectId));
  else if (button.dataset.action === 'delete') deleteProject(projectId);
});

// ========================================
// TAG INPUT (chips)
// ========================================

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const TAG_PLACEHOLDER = 'JavaScript, React, Node.js';
const tagBox = document.getElementById('project-tags-box');
const tagEntry = document.getElementById('project-tags-entry');
let currentTags = [];

/** @param {string} raw */
function normalizeTag(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
}

/** Draws one chip per tag (built with DOM APIs, so user text is never parsed as HTML). */
function renderTags() {
  tagBox.querySelectorAll('.tag-chip').forEach(chip => chip.remove());

  currentTags.forEach((tag, index) => {
    const chip = document.createElement('span');
    chip.className = 'topic-tag tag-chip';

    const label = document.createElement('span');
    label.className = 'tag-chip-label';
    label.textContent = tag;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'tag-chip-remove';
    removeButton.textContent = '×';
    removeButton.title = 'Remover tag';
    removeButton.setAttribute('aria-label', `Remover tag ${tag}`);
    removeButton.addEventListener('click', () => {
      currentTags.splice(index, 1);
      renderTags();
      tagEntry.focus();
    });

    chip.append(label, removeButton);
    tagBox.insertBefore(chip, tagEntry);
  });

  const isFull = currentTags.length >= MAX_TAGS;
  tagEntry.readOnly = isFull;
  tagEntry.placeholder = isFull ? 'Limite de tags atingido' : currentTags.length ? '' : TAG_PLACEHOLDER;
}

/** Adds tags, ignoring empty ones, duplicates (case-insensitive) and anything over the limit. */
function addTags(rawTags) {
  let changed = false;
  rawTags.forEach(raw => {
    const tag = normalizeTag(raw);
    if (!tag || currentTags.length >= MAX_TAGS) return;
    if (currentTags.some(existing => existing.toLowerCase() === tag.toLowerCase())) return;
    currentTags.push(tag);
    changed = true;
  });
  if (changed) renderTags();
}

/** Turns whatever is still typed in the field into a tag. */
function commitPendingTag() {
  if (tagEntry.value.trim()) addTags([tagEntry.value]);
  tagEntry.value = '';
}

// A comma ends the current tag; pasted text with several commas creates several tags.
tagEntry.addEventListener('input', event => {
  if (event.isComposing || !/[,，]/.test(tagEntry.value)) return;
  const parts = tagEntry.value.split(/[,，]/);
  const pending = parts.pop();
  addTags(parts);
  tagEntry.value = pending;
});

tagEntry.addEventListener('keydown', event => {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    commitPendingTag();
  } else if (event.key === 'Backspace' && !tagEntry.value && currentTags.length) {
    currentTags.pop();
    renderTags();
  }
});

tagEntry.addEventListener('blur', commitPendingTag);
tagBox.addEventListener('click', event => {
  if (event.target === tagBox) tagEntry.focus();
});

// ========================================
// CREATE / EDIT MODAL
// ========================================

/**
 * One "name + vacancies + remove" row (built with DOM APIs).
 * @param {{name?: string, total?: number}} qualification
 */
function addQualificationRow(qualification = {}) {
  const row = document.createElement('div');
  row.className = 'qualification-row';

  const name = document.createElement('input');
  name.type = 'text';
  name.className = 'input qual-name';
  name.placeholder = 'Ex: Desenvolvedor Frontend';
  name.required = true;
  name.maxLength = 80;
  name.value = qualification.name || '';
  name.setAttribute('aria-label', 'Nome da qualificação');

  const total = document.createElement('input');
  total.type = 'number';
  total.className = 'input qual-total';
  total.min = '1';
  total.max = '1000';
  total.required = true;
  total.value = String(qualification.total || 1);
  total.setAttribute('aria-label', 'Número de vagas');
  total.title = 'Número de vagas';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn-icon btn-icon-danger qual-remove';
  remove.innerHTML = icon('trash', 14);
  remove.setAttribute('aria-label', 'Remover qualificação');
  remove.title = 'Remover qualificação';

  row.append(name, total, remove);
  qualificationRows.appendChild(row);
  updateRemoveButtons();
  return row;
}

/** Keeps at least one qualification row. */
function updateRemoveButtons() {
  const buttons = qualificationRows.querySelectorAll('.qual-remove');
  buttons.forEach(button => {
    button.disabled = buttons.length === 1;
  });
}

/**
 * Opens the modal empty (new project) or filled with an existing project.
 * @param {object} [project]
 */
function openProjectModal(project) {
  editingProjectId = project ? project.id : null;
  projectModalTitle.textContent = project ? 'Editar projeto' : 'Novo projeto';
  saveProjectButton.textContent = project ? 'Salvar alterações' : 'Criar projeto';

  projectForm.reset();
  document.getElementById('project-name').value = project?.name || '';
  document.getElementById('project-description').value = project?.description || '';
  document.getElementById('project-url').value = project?.url || '';
  currentTags = [];
  tagEntry.value = '';
  addTags(project?.tags || []);
  renderTags();

  qualificationRows.innerHTML = '';
  const qualifications = project?.qualifications?.length ? project.qualifications : [{}];
  qualifications.forEach(addQualificationRow);

  openModal(projectModal);
}

async function saveProject() {
  if (!projectForm.reportValidity()) return;

  const qualifications = [...qualificationRows.querySelectorAll('.qualification-row')].map(row => ({
    name: row.querySelector('.qual-name').value.trim(),
    total: parseInt(row.querySelector('.qual-total').value, 10),
  }));
  if (qualifications.some(q => !q.name || !(q.total > 0))) {
    alert('Preencha o nome e o número de vagas de todas as qualificações.');
    return;
  }

  commitPendingTag();
  const body = {
    name: document.getElementById('project-name').value.trim(),
    description: document.getElementById('project-description').value.trim(),
    url: document.getElementById('project-url').value.trim(),
    qualifications,
    tags: [...currentTags],
  };

  saveProjectButton.disabled = true;
  try {
    await apiRequest(editingProjectId ? `/projects/${editingProjectId}` : '/projects', {
      method: editingProjectId ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    });
    closeModal(projectModal);
    await loadMyProjects();
  } catch (error) {
    alert(error.message);
  } finally {
    saveProjectButton.disabled = false;
  }
}

newProjectButton.addEventListener('click', () => {
  if (!isUserAuthenticated()) {
    redirectToLogin();
    return;
  }
  openProjectModal();
});

document.getElementById('btn-add-qual').addEventListener('click', () => {
  addQualificationRow().querySelector('.qual-name').focus();
});

qualificationRows.addEventListener('click', event => {
  const remove = event.target.closest('.qual-remove');
  if (!remove || remove.disabled) return;
  remove.closest('.qualification-row').remove();
  updateRemoveButtons();
});

saveProjectButton.addEventListener('click', saveProject);
projectForm.addEventListener('submit', event => {
  event.preventDefault();
  saveProject();
});

loadMyProjects();
