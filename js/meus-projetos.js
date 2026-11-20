// ========================================
// CONSTANTS AND GLOBAL VARIABLES
// ========================================

// Project ID currently being edited (null when creating a new project)
let editingProjectId = null;

// ========================================
// SECURITY AND SANITIZATION FUNCTIONS
// ========================================

/**
 * Escapes potentially unsafe HTML characters.
 * @param {string} str - User-controlled text
 * @returns {string} Safe text for innerHTML
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalizes URLs and blocks unsafe protocols (for example, javascript:).
 * Returns an empty string for invalid or prohibited URLs.
 * @param {string} url
 * @returns {string}
 */
function sanitizeURL(url) {
  if (!url) return '';
  try {
    const u = new URL(url, window.location.origin);
    const protocol = u.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:') {
      return u.href;
    }
  } catch (_) {
    // segue para retorno vazio
  }
  return '';
}

/**
 * Checks whether an authenticated session is active.
 * @returns {boolean}
 */
function isUserAuthenticated() {
  return Boolean(getApiToken());
}

/**
 * Redirects the user to the login/profile page.
 */
function redirectToLogin() {
  window.location.href = './perfil.html';
}

/**
 * Updates the new-project button state for unauthenticated users.
 * @param {boolean} isAuthenticated
 */
function updateCreateButtonState(isAuthenticated) {
  if (!btnNewProject) return;

  btnNewProject.classList.toggle('is-disabled', !isAuthenticated);
  btnNewProject.setAttribute('aria-disabled', String(!isAuthenticated));
  btnNewProject.title = isAuthenticated
    ? ''
    : 'Faça login para criar um novo projeto.';
}

/**
 * Renders the access-blocked state for unauthenticated visitors.
 */
function renderUnauthenticatedState() {
  const container = document.getElementById('projects-list');
  updateCreateButtonState(false);

  container.innerHTML = `
    <div class="empty-state">
      <p>Faça login para visualizar e gerenciar seus projetos.</p>
      <p class="hint">Clique em "Novo Projeto" para ir para a tela de login.</p>
    </div>
  `;
}

// ========================================
// RENDERING FUNCTIONS
// ========================================

/**
 * Renders the complete project list.
 * Displays an empty state when no projects exist.
 */
async function renderProjects() {
  if (!isUserAuthenticated()) {
    renderUnauthenticatedState();
    return;
  }

  updateCreateButtonState(true);
  const container = document.getElementById('projects-list');
  let projects;
  try {
    projects = (await apiRequest('/projects/mine')).projects;
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHTML(error.message)}</p></div>`;
    return;
  }
  // Display an empty state when no projects exist
  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Você ainda não criou nenhum projeto.</p>
        <p class="hint">Clique em "Novo Projeto" para começar!</p>
      </div>
    `;
    return;
  }

  // Render each project card with sanitized values
  container.innerHTML = projects.map(project => {
    const safeName = escapeHTML(project.name);
    const safeOwner = escapeHTML(project.owner);
    const safeDesc = escapeHTML(project.description);
    const safeUrl = sanitizeURL(project.url);
    const qualsHTML = (project.qualifications || []).map(q => `
          <div class="qualification-item-card">
            <svg viewBox="0 0 16 16" width="14" height="14" class="person-icon">
              <path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path>
            </svg>
            <span class="qualification-name">${escapeHTML(q.name)}</span>
            <span class="qualification-count">${Number(q.filled) || 0}/${Number(q.total) || 0}</span>
          </div>
        `).join('');
    const tagsHTML = (project.tags || []).map(tag => `<span class="topic-tag">${escapeHTML(tag)}</span>`).join('');
    const urlHTML = (safeUrl)
      ? `<a href="${safeUrl}" class="project-card-url" target="_blank" rel="noopener noreferrer">
                 <svg viewBox="0 0 16 16" width="12" height="12">
                   <path fill-rule="evenodd" d="M7.775 3.275a.75.75 0 001.06 1.06l1.25-1.25a2 2 0 112.83 2.83l-2.5 2.5a2 2 0 01-2.83 0 .75.75 0 00-1.06 1.06 3.5 3.5 0 004.95 0l2.5-2.5a3.5 3.5 0 00-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 010-2.83l2.5-2.5a2 2 0 012.83 0 .75.75 0 001.06-1.06 3.5 3.5 0 00-4.95 0l-2.5 2.5a3.5 3.5 0 004.95 4.95l1.25-1.25a.75.75 0 00-1.06-1.06l-1.25 1.25a2 2 0 01-2.83 0z"></path>
                 </svg>
                 ${escapeHTML(safeUrl)}
               </a>`
      : `<span class="project-card-url-na">URL: N/A</span>`;

    return `
    <div class="project-card" data-project-id="${Number(project.id) || ''}">
      <div class="project-card-header">
        <div>
          <h3 class="project-card-title">${safeName}</h3>
          <p class="project-card-owner">
            ${renderOwnerChip(project.ownerNick, project.owner, project.ownerAvatarUrl, 18)}
          </p>
          ${urlHTML}
        </div>
        <div class="project-card-actions">
          <button class="btn-secondary btn-view-applications" data-id="${Number(project.id) || ''}" type="button">
            Candidaturas
          </button>
          <button class="btn-edit-project" data-id="${Number(project.id) || ''}" aria-label="Editar projeto">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path fill-rule="evenodd" d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064l6.286-6.286z"></path>
            </svg>
          </button>
          <button class="btn-delete-project" data-id="${Number(project.id) || ''}" aria-label="Excluir projeto">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path fill-rule="evenodd" d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19c.9 0 1.652-.681 1.741-1.576l.66-6.6a.75.75 0 00-1.492-.149l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"></path>
            </svg>
          </button>
        </div>
      </div>
      <p class="project-card-description">${safeDesc}</p>
      <div class="project-card-qualifications">
        ${qualsHTML}
      </div>
      <div class="project-card-tags">
        ${tagsHTML}
      </div>
    </div>`;
  }).join('');

  // Add edit button events
  container.querySelectorAll('.btn-edit-project').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.getAttribute('data-id'));
      openEditModal(id);
    });
  });

  container.querySelectorAll('.btn-view-applications').forEach(btn => {
    btn.addEventListener('click', () => viewApplications(Number(btn.dataset.id), btn.closest('.project-card')));
  });

  // Add delete button events
  container.querySelectorAll('.btn-delete-project').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.getAttribute('data-id'));
      if (confirm('Tem certeza que deseja excluir este projeto?')) {
        deleteProject(id);
      }
    });
  });
}

async function viewApplications(projectId, card) {
  const existing = card.querySelector('.applications-panel');
  if (existing) {
    existing.remove();
    return;
  }

  try {
    const result = await apiRequest(`/projects/${projectId}/applications`);
    const panel = document.createElement('div');
    panel.className = 'applications-panel';
    const uniqueApplications = [...new Map(
      result.applications.map(application => [application.id, application]),
    ).values()];
    const pendingApplications = uniqueApplications.filter(
      application => application.status === 'pending',
    );
    const acceptedApplications = uniqueApplications.filter(
      application => application.status === 'accepted',
    );
    const rejectedApplications = uniqueApplications.filter(
      application => application.status === 'rejected',
    );
    const renderApplication = (application) => `
      <div class="application-item application-item-${application.status}">
        <div class="application-heading">
          <strong>${application.nick
            ? `<a class="owner-link applicant-link" href="${escapeHTML(userProfileUrl(application.nick))}" title="Ver perfil de @${escapeHTML(application.nick)}">${escapeHTML(application.name)} <span class="applicant-nick">@${escapeHTML(application.nick)}</span></a>`
            : escapeHTML(application.name)}</strong>
          <div class="application-actions">
            ${application.status === 'pending' ? `
              <button
                class="btn-application-action btn-application-reject"
                data-status="rejected"
                data-application-id="${application.id}"
                data-project-id="${projectId}"
                type="button"
              >Recusar</button>
              <button
                class="btn-application-action btn-application-accept"
                data-status="accepted"
                data-application-id="${application.id}"
                data-project-id="${projectId}"
                type="button"
              >Aprovar</button>
            ` : `
              <button
                class="btn-application-action btn-application-pending"
                data-status="pending"
                data-application-id="${application.id}"
                data-project-id="${projectId}"
                type="button"
              >Tornar pendente</button>
            `}
          </div>
        </div>
        <span>${escapeHTML(application.email)}</span>
        <span>Qualificação: ${escapeHTML(application.qualification || 'Não informado')}</span>
        <span class="application-status-badge application-status-${application.status}">
          ${application.status === 'pending' ? 'Pendente' : application.status === 'accepted' ? 'Aprovada' : 'Recusada'}
        </span>
      </div>
    `;
    panel.innerHTML = uniqueApplications.length
      ? `<h4>Candidaturas pendentes</h4>
        <div class="applications-pending">${pendingApplications.map(renderApplication).join('')}</div>
        ${acceptedApplications.length ? `
          <h4 class="applications-accepted-title">Candidaturas aprovadas</h4>
          <div class="applications-accepted">${acceptedApplications.map(renderApplication).join('')}</div>
        ` : ''}
        ${rejectedApplications.length ? `
          <h4 class="applications-rejected-title">Candidaturas recusadas</h4>
          <div class="applications-rejected">${rejectedApplications.map(renderApplication).join('')}</div>
        ` : ''}`
      : '<p>Nenhuma candidatura recebida ainda.</p>';
    card.appendChild(panel);
    panel.querySelectorAll('.btn-application-action').forEach(button => {
      button.addEventListener('click', () => updateApplicationStatus(button));
    });
  } catch (error) {
    alert(error.message);
  }
}

async function updateApplicationStatus(button) {
  const card = button.closest('.project-card');
  button.disabled = true;
  try {
    await apiRequest(`/projects/${button.dataset.projectId}/applications/${button.dataset.applicationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: button.dataset.status }),
    });
    card.querySelector('.applications-panel')?.remove();
    await viewApplications(Number(button.dataset.projectId), card);
  } catch (error) {
    alert(error.message);
  }
}

// ========================================
// PROJECT MANAGEMENT FUNCTIONS
// ========================================

/**
 * Deletes a project.
 * @param {number} id - Project ID
 */
async function deleteProject(id) {
  try {
    await apiRequest(`/projects/${id}`, { method: 'DELETE' });
    await renderProjects();
  } catch (error) {
    alert(error.message);
  }
}

// ========================================
// ELEMENTOS DO MODAL
// ========================================

// Elementos DOM do modal de criação/edição
const modal = document.getElementById('create-project-modal');
const modalTitle = document.getElementById('create-project-title');
const btnNewProject = document.getElementById('btn-new-project');
const btnClose = document.getElementById('close-create-project');
const btnCancel = document.getElementById('cancel-create-project');
const btnSave = document.getElementById('save-project');
const form = document.getElementById('project-form');

// ========================================
// TAG INPUT (chips)
// ========================================

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const TAG_PLACEHOLDER = 'JavaScript, React, Node.js';
const tagBox = document.getElementById('project-tags-box');
const tagEntry = document.getElementById('project-tags-entry');
let currentTags = [];

/**
 * Cleans a raw tag typed or pasted by the user.
 * @param {string} raw
 * @returns {string}
 */
function normalizeTag(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LENGTH);
}

/**
 * Draws one chip per tag (built with DOM APIs, so user text is never parsed as HTML).
 */
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
    removeButton.addEventListener('click', () => removeTag(index));

    chip.append(label, removeButton);
    tagBox.insertBefore(chip, tagEntry);
  });

  const isFull = currentTags.length >= MAX_TAGS;
  tagEntry.readOnly = isFull;
  tagEntry.placeholder = isFull
    ? 'Limite de tags atingido'
    : currentTags.length ? '' : TAG_PLACEHOLDER;
}

/**
 * Adds tags, ignoring empty ones, duplicates (case-insensitive) and anything over the limit.
 * @param {string[]} rawTags
 */
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

/**
 * Replaces all tags (used when opening the create/edit modal).
 * @param {string[]} tags
 */
function setTags(tags) {
  currentTags = [];
  tagEntry.value = '';
  addTags(Array.isArray(tags) ? tags : []);
  renderTags();
}

/** Turns whatever is still typed in the field into a tag. */
function commitPendingTag() {
  if (tagEntry.value.trim()) addTags([tagEntry.value]);
  tagEntry.value = '';
}

/**
 * Removes the tag at the given position.
 * @param {number} index
 */
function removeTag(index) {
  currentTags.splice(index, 1);
  renderTags();
  tagEntry.focus();
}

/** @returns {string[]} Tags to send to the API (includes the text still being typed). */
function getTags() {
  commitPendingTag();
  return [...currentTags];
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

// Clicking the empty area of the box focuses the field.
tagBox.addEventListener('click', event => {
  if (event.target === tagBox) tagEntry.focus();
});

// ========================================
// MODAL CONTROL FUNCTIONS
// ========================================

/**
 * Abre o modal para criar um novo projeto
 * Resets the form and settings.
 */
function openCreateModal() {
  editingProjectId = null;
  modalTitle.textContent = 'Criar Novo Projeto';
  btnSave.textContent = 'Criar Projeto';
  form.reset();
  setTags([]);
  // Reset qualifications to one row
  const container = document.getElementById('qualifications-inputs');
  container.innerHTML = `
    <div class="qualification-input-row">
      <input type="text" class="qual-name" placeholder="Ex: Frontend Developer" required />
      <input type="number" class="qual-total" placeholder="Total" min="1" value="1" required />
      <button type="button" class="btn-remove-qual" disabled>−</button>
    </div>
  `;
  modal.classList.remove('hidden');
}

/**
 * Abre o modal para editar um projeto existente
 * @param {number} projectId - ID do projeto a ser editado
 */
async function openEditModal(projectId) {
  editingProjectId = projectId;
  let projects;
  try {
    projects = (await apiRequest('/projects/mine')).projects;
  } catch (error) {
    alert(error.message);
    return;
  }
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  modalTitle.textContent = 'Editar Projeto';
  btnSave.textContent = 'Salvar Alterações';

  // Populate the form
  document.getElementById('project-name').value = project.name;
  document.getElementById('project-description').value = project.description;
  document.getElementById('project-url').value = project.url || '';
  setTags(project.tags || []);

  // Populate qualifications using DOM elements to avoid injection
  const container = document.getElementById('qualifications-inputs');
  container.innerHTML = '';
  (project.qualifications || []).forEach(q => {
    const row = document.createElement('div');
    row.className = 'qualification-input-row';

    const inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.className = 'qual-name';
    inputName.placeholder = 'Ex: Frontend Developer';
    inputName.required = true;
    inputName.value = q.name || '';

    const inputTotal = document.createElement('input');
    inputTotal.type = 'number';
    inputTotal.className = 'qual-total';
    inputTotal.placeholder = 'Total';
    inputTotal.min = '1';
    inputTotal.required = true;
    inputTotal.value = String(q.total || 1);

    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.className = 'btn-remove-qual';
    btnRemove.textContent = '−';

    row.appendChild(inputName);
    row.appendChild(inputTotal);
    row.appendChild(btnRemove);
    container.appendChild(row);
  });
  updateRemoveButtons();

  modal.classList.remove('hidden');
}

/**
 * Closes the create/edit modal.
 */
function closeCreateModal() {
  modal.classList.add('hidden');
}

/**
 * Updates remove-qualification button states.
 * Disables removal when only one qualification remains.
 */
function updateRemoveButtons() {
  const rows = document.querySelectorAll('.qualification-input-row');
  rows.forEach((row, index) => {
    const btn = row.querySelector('.btn-remove-qual');
    btn.disabled = rows.length === 1;
  });
}

// ========================================
// EVENT LISTENERS DO MODAL
// ========================================

// Abre modal ao clicar em "Novo Projeto"
btnNewProject.addEventListener('click', () => {
  if (!isUserAuthenticated()) {
    redirectToLogin();
    return;
  }

  openCreateModal();
});

// Fecha modal ao clicar no botão de fechar
btnClose.addEventListener('click', closeCreateModal);

// Fecha modal ao clicar em "Cancelar"
btnCancel.addEventListener('click', closeCreateModal);

// Fecha modal ao clicar fora dele
modal.addEventListener('click', (e) => {
  if (e.target === modal) closeCreateModal();
});

// ========================================
// QUALIFICATION MANAGEMENT
// ========================================

// Add a new qualification row
document.getElementById('btn-add-qual').addEventListener('click', () => {
  const container = document.getElementById('qualifications-inputs');
  const newRow = document.createElement('div');
  newRow.className = 'qualification-input-row';
  newRow.innerHTML = `
    <input type="text" class="qual-name" placeholder="Ex: Backend Developer" required />
    <input type="number" class="qual-total" placeholder="Total" min="1" value="1" required />
    <button type="button" class="btn-remove-qual">−</button>
  `;
  container.appendChild(newRow);
  updateRemoveButtons();
});

// Remove a qualification row
document.getElementById('qualifications-inputs').addEventListener('click', (e) => {
  if (e.target.classList.contains('btn-remove-qual')) {
    e.target.parentElement.remove();
    updateRemoveButtons();
  }
});

// ========================================
// SALVAMENTO DE PROJETOS
// ========================================

/**
 * Saves or updates a project.
 * Validates the data and sends it to the backend.
 */
btnSave.addEventListener('click', async () => {
  // Validate the form before continuing
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  // Collect basic form data
  const name = document.getElementById('project-name').value.trim();
  const description = document.getElementById('project-description').value.trim();
  const url = document.getElementById('project-url').value.trim() || '';
  const tags = getTags();

  // Validate and collect qualifications
  const qualRows = document.querySelectorAll('.qualification-input-row');
  const qualifications = [];
  let valid = true;

  qualRows.forEach(row => {
    const qName = row.querySelector('.qual-name').value.trim();
    const qTotal = parseInt(row.querySelector('.qual-total').value);
    if (qName && qTotal > 0) {
      qualifications.push({
        name: qName,
        filled: 0,
        total: qTotal
      });
    } else {
      valid = false;
    }
  });

  if (!valid || qualifications.length === 0) {
    alert('Preencha todas as qualificações corretamente.');
    return;
  }

  try {
    const endpoint = editingProjectId ? `/projects/${editingProjectId}` : '/projects';
    await apiRequest(endpoint, {
      method: editingProjectId ? 'PUT' : 'POST',
      body: JSON.stringify({ name, description, url, qualifications, tags }),
    });
    closeCreateModal();
    await renderProjects();
  } catch (error) {
    alert(error.message);
  }
});

// ========================================
// INITIALIZATION
// ========================================

// Carrega e renderiza os projetos quando a página é carregada
document.addEventListener('DOMContentLoaded', renderProjects);
