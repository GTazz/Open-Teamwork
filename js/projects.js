// ========================================
// EXPLORE (index.html): project list and search (cards: project-cards.js)
// ========================================

let projectSearchQuery = '';

const repoGrid = document.getElementById('repo-grid');
const repoCounter = document.getElementById('repo-counter');
const searchInput = document.getElementById('project-search');
const filterToggle = document.getElementById('filter-toggle');
const filterPanel = document.getElementById('filter-panel');

// ========================================
// FILTERS
// Filters add up (a project has to pass every active one). An option that
// would contradict an active one is disabled instead of giving an empty list.
// The active filters live in the address (?filtros=a,b) so they survive a
// reload and can be shared. "personal" filters need a signed-in person.
// ========================================

const hasStatus = (project, status) => (project.myApplicationStatuses || []).includes(status);
const isOwnProject = project => project.ownerId === getCurrentUserId();

const PROJECT_FILTERS = [
  { value: 'com-vagas', group: 'Vagas', label: 'Com vagas abertas', test: project => !isProjectFull(project) },
  {
    value: 'nao-candidatei', group: 'Minha participação', label: 'Ainda não me candidatei', personal: true,
    conflicts: ['pendentes', 'participando', 'recusadas', 'meus'],
    test: project => !isOwnProject(project) && !(project.myApplicationStatuses || []).length,
  },
  {
    value: 'pendentes', group: 'Minha participação', label: 'Candidatura pendente', personal: true,
    conflicts: ['nao-candidatei', 'meus'], test: project => hasStatus(project, 'pending'),
  },
  {
    value: 'participando', group: 'Minha participação', label: 'Participando', personal: true,
    conflicts: ['nao-candidatei', 'meus'], test: project => hasStatus(project, 'accepted'),
  },
  {
    value: 'recusadas', group: 'Minha participação', label: 'Candidatura recusada', personal: true,
    conflicts: ['nao-candidatei', 'meus'], test: project => hasStatus(project, 'rejected'),
  },
  {
    value: 'meus', group: 'Minha participação', label: 'Meus projetos', personal: true,
    conflicts: ['nao-candidatei', 'pendentes', 'participando', 'recusadas'], test: isOwnProject,
  },
];

const activeFilters = new Set(readFiltersFromUrl());

/** Valid, non-contradicting filters from the address. */
function readFiltersFromUrl() {
  const requested = (new URLSearchParams(window.location.search).get('filtros') || '').split(',');
  const chosen = [];
  requested.forEach(value => {
    const filter = PROJECT_FILTERS.find(item => item.value === value);
    if (!filter || chosen.includes(value) || (filter.personal && !isUserAuthenticated())) return;
    if (chosen.some(other => (filter.conflicts || []).includes(other))) return;
    chosen.push(value);
  });
  return chosen;
}

function writeFiltersToUrl() {
  const url = new URL(window.location.href);
  if (activeFilters.size) url.searchParams.set('filtros', [...activeFilters].join(','));
  else url.searchParams.delete('filtros');
  history.replaceState(null, '', url.href.replace(/%2C/gi, ','));
}

/** @param {object} filter @returns {boolean} True when it clashes with an active filter. */
function contradictsActive(filter) {
  return (filter.conflicts || []).some(value => activeFilters.has(value));
}

function passesFilters(project) {
  return PROJECT_FILTERS.every(filter => !activeFilters.has(filter.value) || filter.test(project));
}

function renderFilterPanel() {
  const signedIn = isUserAuthenticated();
  const groups = [...new Set(PROJECT_FILTERS.map(filter => filter.group))];
  filterPanel.innerHTML = groups.map(group => {
    const inGroup = PROJECT_FILTERS.filter(filter => filter.group === group);
    const options = inGroup.map(filter => {
      const checked = activeFilters.has(filter.value);
      const disabled = !checked && ((filter.personal && !signedIn) || contradictsActive(filter));
      return `
        <label class="filter-option${disabled ? ' is-disabled' : ''}">
          <input type="checkbox" value="${filter.value}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} />
          <span>${escapeHtmlText(filter.label)}</span>
        </label>`;
    }).join('');
    const needsLogin = !signedIn && inGroup.some(filter => filter.personal);
    return `
      <div class="filter-group">
        <p class="filter-group-title">${escapeHtmlText(group)}</p>
        ${options}
        ${needsLogin ? '<p class="filter-note">Entre na sua conta para usar estes filtros.</p>' : ''}
      </div>`;
  }).join('')
    + (activeFilters.size ? '<button type="button" class="btn btn-small btn-outline filter-clear" data-filter-clear>Limpar filtros</button>' : '');
  filterToggle.classList.toggle('is-active', activeFilters.size > 0);
}

/** @param {boolean} open */
function setFilterPanelOpen(open) {
  filterPanel.classList.toggle('hidden', !open);
  filterToggle.setAttribute('aria-expanded', String(open));
}

filterToggle.addEventListener('click', () => setFilterPanelOpen(filterPanel.classList.contains('hidden')));

filterPanel.addEventListener('change', event => {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input) return;
  if (input.checked) activeFilters.add(input.value);
  else activeFilters.delete(input.value);
  writeFiltersToUrl();
  renderProjects();
  filterPanel.querySelector(`input[value="${input.value}"]`)?.focus();
});

filterPanel.addEventListener('click', event => {
  if (!event.target.closest('[data-filter-clear]')) return;
  activeFilters.clear();
  writeFiltersToUrl();
  renderProjects();
  filterToggle.focus();
});

// Closes on a click outside the menu or on Esc.
document.addEventListener('click', event => {
  if (!event.target.closest('[data-filter-menu]')) setFilterPanelOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !filterPanel.classList.contains('hidden')) {
    setFilterPanelOpen(false);
    filterToggle.focus();
  }
});

// After an application the card may no longer match the filters.
document.addEventListener('project:updated', () => renderProjects());

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
  const filtered = projectsData.filter(passesFilters);
  const terms = normalizeSearchText(projectSearchQuery).split(/\s+/).filter(Boolean);
  if (!terms.length) return filtered;
  return filtered
    .map((project, index) => ({ project, index, score: scoreProject(project, terms) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.project);
}

function renderProjects() {
  renderFilterPanel();
  const matches = getVisibleProjects();
  const query = projectSearchQuery.trim();
  const total = projectsData.length;
  const filtering = activeFilters.size > 0;

  if (!total) {
    repoGrid.innerHTML = renderEmptyState('Nenhum projeto ainda', 'Crie o primeiro em "Meus Projetos".');
  } else if (!matches.length) {
    repoGrid.innerHTML = renderEmptyState(
      'Nenhum projeto encontrado',
      query
        ? 'Tente buscar pelo nome do projeto, por quem criou, por uma qualificação ou por uma tag.'
          + (filtering ? ' Os filtros também estão ativos.' : '')
        : 'Nenhum projeto atende a todos os filtros escolhidos. Tente desmarcar algum.'
    );
  } else {
    repoGrid.innerHTML = matches.map(createProjectCard).join('');
  }

  const noun = total === 1 ? 'projeto' : 'projetos';
  repoCounter.textContent = !query && !filtering
    ? `${total} ${noun}`
    : `${matches.length} de ${total} ${noun}${query ? ` para "${query}"` : ''}`;
}

// ========================================
// INITIALIZATION
// ========================================

async function loadProjects() {
  repoGrid.innerHTML = renderSkeleton('repo', 6);
  try {
    projectsData = (await apiRequest('/projects')).projects;
    renderProjects();
  } catch (error) {
    repoCounter.textContent = '';
    repoGrid.innerHTML = renderEmptyState('Erro ao carregar projetos', 'Tente novamente em instantes.', true);
  }
}

let searchTimer = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    projectSearchQuery = searchInput.value;
    renderProjects();
  }, 150);
});

loadProjects();
