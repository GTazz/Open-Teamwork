// ========================================
// CONSTANTS AND CONFIGURATION
// ========================================

// Card display configuration
const CONFIG = {
  maxCards: null // null = no limit
};

// ========================================
// STATE
// ========================================

let projectsData = [];

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
  window.location.href = './pages/perfil.html';
}

// ========================================
// UTILITIES
// ========================================

/**
 * Formats large numbers (for example, 1200 -> 1.2k)
 */
function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

/**
 * Sorts qualifications by available, applied, and full status.
 * @param {{name:string, filled:number, total:number}[]} qualifications
 * @param {Set<string>} appliedSet
 * @returns {Array}
 */
function sortQualifications(qualifications, appliedSet) {
  return [...qualifications].sort((a, b) => {
    const aFull = a.filled >= a.total;
    const bFull = b.filled >= b.total;
    const aApplied = appliedSet.has(a.name);
    const bApplied = appliedSet.has(b.name);

    const getPriority = (isFull, isApplied) => {
      if (isFull) return 2;
      if (isApplied) return 1;
      return 0;
    };

    return getPriority(aFull, aApplied) - getPriority(bFull, bApplied);
  });
}

// ========================================
// CARD RENDERING
// ========================================

/**
 * Book icon used next to project names.
 * @param {number} size
 * @returns {string}
 */
function repoIconSvg(size) {
  return `<svg class="repo-icon" height="${size}" width="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"></path>
  </svg>`;
}

/**
 * Owner's contact e-mail as a mailto link. The API only sends it to people
 * who are signed in, so for visitors this renders nothing.
 * @param {string} email
 * @param {string} className
 * @returns {string}
 */
function renderOwnerEmail(email, className) {
  const value = String(email || '').trim();
  if (!/^[^\s@<>"']+@[^\s@<>"']+$/.test(value)) return '';
  return `
    <a class="owner-email ${className}" href="mailto:${escapeHtmlText(value)}" title="Enviar e-mail para o dono do projeto">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill-rule="evenodd" d="M1.75 2A1.75 1.75 0 000 3.75v.736a.75.75 0 000 .027v7.737C0 13.216.784 14 1.75 14h12.5A1.75 1.75 0 0016 12.25v-8.5A1.75 1.75 0 0014.25 2H1.75zM14.5 4.07v-.32a.25.25 0 00-.25-.25H1.75a.25.25 0 00-.25.25v.32L8 7.88l6.5-3.81zm-13 1.74v6.441c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V5.809L8.38 9.397a.75.75 0 01-.76 0L1.5 5.809z"></path></svg>
      <span>${escapeHtmlText(value)}</span>
    </a>
  `;
}

/**
 * Creates project card HTML.
 * @param {{id:number,name:string,owner:string,description:string,url:string,qualifications:Array,tags?:Array}} repo
 * @returns {string}
 */
function createRepoCard(repo) {
  const applied = new Set();
  const hasApplied = repo.applicationStatus
    ? repo.applicationStatus === 'pending'
    : applied.size > 0;
  const isAuthenticated = isUserAuthenticated();

  const sortedQualifications = sortQualifications(repo.qualifications, applied);
  const safeUrl = safeHttpUrl(repo.url);
  const safeName = escapeHtmlText(repo.name);
  const nameHtml = safeUrl
    ? `<a href="${escapeHtmlText(safeUrl)}" class="repo-name" rel="noopener noreferrer">${safeName}</a>`
    : `<span class="repo-name">${safeName}</span>`;

  return `
    <div class="repo-card" data-repo-id="${Number(repo.id)}">
      <div class="repo-header">
        <svg class="repo-icon" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
          <path fill-rule="evenodd" d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z"></path>
        </svg>
        ${nameHtml}
      </div>
      <div class="repo-owner">
        ${renderOwnerChip(repo.ownerNick, repo.owner, repo.ownerAvatarUrl, 18)}
      </div>
      ${renderOwnerEmail(repo.ownerEmail, 'repo-owner-email')}
      <div class="repo-description">
        ${escapeHtmlText(repo.description)}
      </div>
      <div class="repo-bottom">
        <div class="repo-qualifications">
          ${sortedQualifications.map(q => {
            const disabledClass = applied.has(q.name) ? ' disabled' : '';
            const isFull = q.filled >= q.total;
            const fullClass = isFull ? ' full' : '';
            return `
              <div class="qualification-item-card${disabledClass}${fullClass}">
                <svg viewBox="0 0 16 16" width="14" height="14" class="person-icon">
                  <path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path>
                </svg>
                <span class="qualification-name">${escapeHtmlText(q.name)}</span>
                <span class="qualification-count">${q.filled}/${q.total}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div class="repo-footer">
          <button class="saiba-mais-button" data-action="details">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75zM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"></path>
            </svg>
            Saiba mais
          </button>
          <button class="apply-button${hasApplied && isAuthenticated ? ' applied' : ''}${isAuthenticated ? '' : ' is-disabled'}" data-action="apply" aria-disabled="${String(!isAuthenticated)}" title="${isAuthenticated ? '' : 'Faça login para se candidatar.'}">
            ${isAuthenticated && hasApplied
              ? `<svg viewBox="0 0 16 16" width="16" height="16"><path fill-rule="evenodd" d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.25 0 00.108-.064l6.286-6.286z"></path></svg> Modificar Candidatura`
              : `<svg viewBox="0 0 16 16" width="16" height="16"><path fill-rule="evenodd" d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z"></path></svg> Candidatar-se`}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// ESTADO E MODAIS
// ========================================

let currentRepoId = null;
let currentDetailsRepoId = null;

/**
 * Abre o modal de detalhes de um projeto
 * @param {number} repoId
 */
function openDetailsModal(repoId) {
  currentDetailsRepoId = repoId;
  const repo = projectsData.find(r => r.id === repoId);
  if (!repo) return;

  const modal = document.getElementById('details-modal');
  const modalTitle = document.getElementById('details-modal-title');
  const detailsContent = document.getElementById('details-content');
  const applyBtn = document.getElementById('details-apply');

  modalTitle.innerHTML = `${repoIconSvg(20)}<span>${escapeHtmlText(repo.name)}</span>`;

  const applied = new Set();
  const hasApplied = repo.applicationStatus
    ? repo.applicationStatus === 'pending'
    : applied.size > 0;
  const sortedQualifications = sortQualifications(repo.qualifications, applied);
  const detailsUrl = safeHttpUrl(repo.url);

  detailsContent.innerHTML = `
    <div class="details-header">
      <div class="details-owner">
        ${renderOwnerChip(repo.ownerNick, repo.owner, repo.ownerAvatarUrl, 24)}
        ${renderOwnerEmail(repo.ownerEmail, 'details-owner-email')}
      </div>
      ${detailsUrl ? `<a href="${escapeHtmlText(detailsUrl)}" class="details-link" target="_blank" rel="noopener noreferrer">
        URL
        <svg viewBox="0 0 16 16" width="14" height="14">
          <path fill-rule="evenodd" d="M10.604 1h4.146a.25.25 0 01.25.25v4.146a.25.25 0 01-.427.177L13.03 4.03 9.28 7.78a.75.75 0 01-1.06-1.06l3.75-3.75-1.543-1.543A.25.25 0 0110.604 1zM3.75 2A1.75 1.75 0 002 3.75v8.5c0 .966.784 1.75 1.75 1.75h8.5A1.75 1.75 0 0014 12.25v-3.5a.75.75 0 00-1.5 0v3.5a.25.25 0 01-.25.25h-8.5a.25.25 0 01-.25-.25v-8.5a.25.25 0 01.25-.25h3.5a.75.75 0 000-1.5h-3.5z"></path>
        </svg>
      </a>` : ''}
    </div>

    <div class="details-section">
      <h3>Descrição</h3>
      <p class="details-description">${escapeHtmlText(repo.description)}</p>
    </div>

    <div class="details-section">
      <h3>Qualificações Necessárias</h3>
      <div class="details-qualifications">
        ${sortedQualifications.map(q => {
          const disabledClass = applied.has(q.name) ? ' disabled' : '';
          const isFull = q.filled >= q.total;
          const fullClass = isFull ? ' full' : '';
          return `
            <div class="qualification-item-card${disabledClass}${fullClass}">
              <svg viewBox="0 0 16 16" width="14" height="14" class="person-icon">
                <path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path>
              </svg>
              <span class="qualification-name">${escapeHtmlText(q.name)}</span>
              <span class="qualification-count">${q.filled}/${q.total}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="details-section">
      <h3>Tags</h3>
      <div class="details-qualifications">
        ${(repo.tags || []).map(tag => `<span class="topic-tag">${escapeHtmlText(tag)}</span>`).join('')}
      </div>
    </div>
  `;

  applyBtn.onclick = () => {
    closeDetailsModal();
    openApplyModal(repoId);
  };

  if (hasApplied && isUserAuthenticated()) {
    applyBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="16" height="16">
        <path fill-rule="evenodd" d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064l6.286-6.286z"></path>
      </svg>
      Modificar Candidatura
    `;
    applyBtn.classList.add('applied');
  } else {
    applyBtn.disabled = false;
    applyBtn.title = '';
    applyBtn.innerHTML = `
      <svg viewBox="0 0 16 16" width="16" height="16">
        <path fill-rule="evenodd" d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.75 4.75a.75.75 0 00-1.5 0v2.5h-2.5a.75.75 0 000 1.5h2.5v2.5a.75.75 0 001.5 0v-2.5h2.5a.75.75 0 000-1.5h-2.5v-2.5z"></path>
      </svg>
      Candidatar-se
    `;
    applyBtn.classList.remove('applied');
  }

  document.getElementById('close-details').onclick = closeDetailsModal;
  modal.onclick = (e) => { if (e.target === modal) closeDetailsModal(); };
  document.addEventListener('keydown', escCloseDetailsHandler);

  modal.classList.remove('hidden');
}

/**
 * Fecha modal de detalhes ao pressionar ESC
 * @param {KeyboardEvent} e
 */
function escCloseDetailsHandler(e) {
  if (e.key === 'Escape') closeDetailsModal();
}

/**
 * Fecha o modal de detalhes e limpa handlers/estado
 */
function closeDetailsModal() {
  const modal = document.getElementById('details-modal');
  modal.classList.add('hidden');
  document.removeEventListener('keydown', escCloseDetailsHandler);
  currentDetailsRepoId = null;
}

// ========================================
// MODAL DE CANDIDATURA
// ========================================

/**
 * Opens the application modal for a repository.
 * @param {number} repoId
 */
async function openApplyModal(repoId) {
  if (!isUserAuthenticated()) {
    redirectToLogin();
    return;
  }

  currentRepoId = repoId;
  const repo = projectsData.find(r => r.id === repoId);
  if (!repo) return;

  const modal = document.getElementById('apply-modal');
  const repoTitle = document.getElementById('apply-modal-repo');
  const container = document.getElementById('qualifications-container');
  const confirmBtn = document.getElementById('confirm-apply');

  repoTitle.textContent = `${repo.owner} / ${repo.name}`;

  let currentApplication = null;
  try {
    currentApplication = (await apiRequest(`/projects/${repoId}/my-application`)).application;
  } catch (error) {
    alert(error.message);
    return;
  }
  const alreadyApplied = new Set(currentApplication?.qualificationIds || []);
  const rejectedQualificationIds = new Set(currentApplication?.rejectedQualificationIds || []);
  const acceptedQualificationIds = new Set(currentApplication?.acceptedQualificationIds || []);
  repo.applicationStatus = currentApplication?.status || null;
  container.innerHTML = repo.qualifications.map(q => {
    const isFull = q.filled >= q.total;
    const isRejected = rejectedQualificationIds.has(q.id);
    const isAccepted = acceptedQualificationIds.has(q.id);
    const isBlocked = isRejected || isAccepted;
    const checkedAttr = !isBlocked && alreadyApplied.has(q.id) ? 'checked' : '';
    const disabledAttr = isFull || isBlocked ? 'disabled' : '';
    return `
      <label class="qualification-item${isFull ? ' full' : ''}${isRejected ? ' rejected' : ''}${isAccepted ? ' accepted' : ''}">
        <input type="checkbox" name="qualification" value="${escapeHtmlText(q.name)}" data-qualification-id="${Number(q.id)}" ${checkedAttr} ${disabledAttr} />
        <svg viewBox="0 0 16 16" width="14" height="14" class="person-icon">
          <path fill-rule="evenodd" d="M10.5 5a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm.061 3.073a4 4 0 10-5.123 0 6.004 6.004 0 00-3.431 5.142.75.75 0 001.498.07 4.5 4.5 0 018.99 0 .75.75 0 101.498-.07 6.005 6.005 0 00-3.432-5.142z"></path>
        </svg>
        <span class="qualification-name">${escapeHtmlText(q.name)}</span>
        <span class="qualification-count">${q.filled}/${q.total}</span>
        ${isRejected ? '<span class="qualification-rejected">Recusada</span>' : ''}
        ${isAccepted ? '<span class="qualification-accepted">Aprovada</span>' : ''}
      </label>
    `;
  }).join('');

  confirmBtn.disabled = false;
  confirmBtn.onclick = confirmApply;
  document.getElementById('cancel-apply').onclick = closeApplyModal;
  modal.onclick = (e) => { if (e.target === modal) closeApplyModal(); };
  document.addEventListener('keydown', escCloseHandler);

  modal.classList.remove('hidden');
}

/**
 * Fecha modal de candidatura ao pressionar ESC
 * @param {KeyboardEvent} e
 */
function escCloseHandler(e) {
  if (e.key === 'Escape') closeApplyModal();
}

/**
 * Fecha o modal de candidatura e limpa handlers/estado
 */
function closeApplyModal() {
  const modal = document.getElementById('apply-modal');
  modal.classList.add('hidden');
  document.removeEventListener('keydown', escCloseHandler);
  currentRepoId = null;
}

/**
 * Confirms the application and updates the UI and counters.
 */
async function confirmApply() {
  if (currentRepoId == null) return;
  const container = document.getElementById('qualifications-container');
  const selected = [...container.querySelectorAll('input[type="checkbox"]')]
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  const qualificationIds = [...container.querySelectorAll('input[type="checkbox"]')]
    .filter(cb => cb.checked)
    .map(cb => Number(cb.dataset.qualificationId));

  try {
    await apiRequest(`/projects/${currentRepoId}/applications`, {
      method: 'POST',
      body: JSON.stringify({ qualificationIds }),
    });
  } catch (error) {
    alert(error.message);
    return;
  }

  const repo = projectsData.find(r => r.id === currentRepoId);
  if (repo) repo.applicationStatus = qualificationIds.length ? 'pending' : null;
  const card = document.querySelector(`.repo-card[data-repo-id="${currentRepoId}"]`);
  if (card && repo) {
    const newCardHTML = createRepoCard(repo);
    card.outerHTML = newCardHTML;
  }

  closeApplyModal();
}

// ========================================
// SEARCH
// ========================================

// Each tier is worth more than any match in the tiers below it, so a project
// whose name matches always ranks above one that only matches by tag.
// "host" covers the owner's name, @nick and contact e-mail (the e-mail is only
// present for signed-in people).
const SEARCH_WEIGHTS = { name: 1000, host: 100, qualification: 10, tag: 1 };

let projectSearchQuery = '';

/**
 * Lowercases and strips accents so "programacao" finds "Programação".
 * @param {string} text
 * @returns {string}
 */
function normalizeSearchText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Score of one search term inside one field: a word that starts with the term
 * counts a bit more than a match in the middle of a word.
 * @param {string} field Already normalized.
 * @param {string} term Already normalized.
 * @param {number} weight
 * @returns {number}
 */
function scoreField(field, term, weight) {
  const index = field.indexOf(term);
  if (index === -1) return 0;
  const startsWord = index === 0 || /[^a-z0-9]/.test(field[index - 1]);
  return startsWord ? weight * 1.5 : weight;
}

/**
 * Relevance of a project for the query; 0 means it does not match.
 * Every word of the query has to match somewhere.
 * @param {object} repo
 * @param {string[]} terms Normalized words of the query.
 * @returns {number}
 */
function scoreProject(repo, terms) {
  const name = normalizeSearchText(repo.name);
  const host = normalizeSearchText(`${repo.owner} ${repo.ownerNick} @${repo.ownerNick} ${repo.ownerEmail || ''}`);
  const qualifications = (repo.qualifications || []).map(q => normalizeSearchText(q.name));
  const tags = (repo.tags || []).map(normalizeSearchText);

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

/**
 * Projects that match the current search, most relevant first. Without a
 * search the original order (newest first) is kept.
 * @returns {object[]}
 */
function getVisibleProjects() {
  const terms = normalizeSearchText(projectSearchQuery).split(/\s+/).filter(Boolean);
  if (!terms.length) return projectsData;
  return projectsData
    .map((repo, index) => ({ repo, index, score: scoreProject(repo, terms) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.repo);
}

/**
 * Draws the project grid and the counter for the current search.
 */
function renderProjects() {
  const matches = getVisibleProjects();
  const projectsToShow = CONFIG.maxCards ? matches.slice(0, CONFIG.maxCards) : matches;
  const projGrid = document.getElementById('repo-grid');
  const counter = document.getElementById('repo-counter');
  const query = projectSearchQuery.trim();

  if (!projectsToShow.length && query) {
    projGrid.innerHTML = `
      <div class="empty-state grid-span-all">
        <h3>Nenhum projeto encontrado</h3>
        <p>Tente buscar pelo nome do projeto, por quem criou, por uma qualificação ou por uma tag.</p>
      </div>
    `;
  } else {
    projGrid.innerHTML = projectsToShow.map(repo => createRepoCard(repo)).join('');
  }

  if (counter) {
    const total = projectsData.length;
    counter.textContent = query
      ? (projectsToShow.length
        ? `${projectsToShow.length} de ${total} ${total === 1 ? 'projeto' : 'projetos'} para "${query}"`
        : `Nenhum projeto encontrado para "${query}".`)
      : `Exibindo ${projectsToShow.length} de ${total} projetos`;
  }
}

// ========================================
// LOADING AND INITIALIZATION
// ========================================

/**
 * Carrega e renderiza os projetos
 */
async function loadProjects() {
  try {
    const response = await apiRequest('/projects');
    const projects = response.projects;
    if (isUserAuthenticated()) {
      await Promise.all(projects.map(async repo => {
        const result = await apiRequest(`/projects/${repo.id}/my-application`);
        repo.applicationStatus = result.application?.status || null;
      }));
    }
    projectsData = projects;
    renderProjects();

    const projGrid = document.getElementById('repo-grid');
    projGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('button.saiba-mais-button, button.apply-button');
      if (!btn) return;
      const card = e.target.closest('.repo-card');
      if (!card) return;
      const repoId = parseInt(card.getAttribute('data-repo-id'), 10);

      if (btn.classList.contains('saiba-mais-button')) {
        openDetailsModal(repoId);
      } else if (btn.classList.contains('apply-button')) {
        if (!isUserAuthenticated()) {
          redirectToLogin();
          return;
        }
        openApplyModal(repoId);
      }
    });

    const searchInput = document.getElementById('project-search');
    let searchTimer = null;
    searchInput?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        projectSearchQuery = searchInput.value;
        renderProjects();
      }, 150);
    });

    console.log(`✅ ${projects.length} projetos carregados com sucesso!`);
  } catch (error) {
    console.error('❌ Erro ao carregar projetos:', error);
    const repoGrid = document.getElementById('repo-grid');
    repoGrid.innerHTML = `
      <div class="empty-state error grid-span-all">
        <h3>Erro ao carregar projetos</h3>
        <p>Por favor, tente novamente mais tarde.</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', loadProjects);
