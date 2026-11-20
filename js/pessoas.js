// ========================================
// PEOPLE DIRECTORY
// ========================================

const PEOPLE_PAGE_SIZE = 18;
const peopleGrid = document.getElementById('people-grid');
const peopleCounter = document.getElementById('people-counter');
const peopleMoreButton = document.getElementById('people-more');
const peopleSearchInput = document.getElementById('people-search');

let peopleQuery = '';
let peopleOffset = 0;
let peopleRequestId = 0;
let peopleSearchTimer = null;

/**
 * Card for one person (everything coming from the API is escaped).
 * @param {{nick: string, name: string, bio: string, avatarUrl: string}} person
 * @returns {string}
 */
function renderPersonCard(person) {
  const bio = person.bio
    ? `<span class="person-bio">${escapeHtmlText(person.bio)}</span>`
    : '';
  return `
    <a class="person-card" href="${escapeHtmlText(userProfileUrl(person.nick))}">
      ${renderUserAvatar(person.avatarUrl, 56)}
      <span class="person-info">
        <span class="person-name">${escapeHtmlText(person.name)}</span>
        <span class="person-nick">@${escapeHtmlText(person.nick)}</span>
        ${bio}
      </span>
    </a>
  `;
}

/**
 * Loads one page of people. A new search discards answers of older requests.
 * @param {boolean} reset True to start over (new search).
 */
async function loadPeople(reset) {
  const requestId = ++peopleRequestId;
  if (reset) {
    peopleOffset = 0;
    peopleGrid.innerHTML = renderSkeleton('person', 6);
    peopleMoreButton.classList.add('hidden');
    peopleCounter.textContent = 'Carregando colaboradores...';
  }
  if (!reset) setButtonBusy(peopleMoreButton, true);

  try {
    const params = new URLSearchParams({ limit: String(PEOPLE_PAGE_SIZE), offset: String(peopleOffset) });
    if (peopleQuery) params.set('query', peopleQuery);
    const { users, hasMore } = await apiRequest(`/users?${params.toString()}`);
    if (requestId !== peopleRequestId) return;

    const cards = users.map(renderPersonCard).join('');
    if (reset) peopleGrid.innerHTML = cards;
    else peopleGrid.insertAdjacentHTML('beforeend', cards);
    peopleOffset += users.length;

    if (peopleOffset === 0) {
      peopleCounter.textContent = peopleQuery
        ? `Nenhum colaborador encontrado para "${peopleQuery}".`
        : 'Ainda não há colaboradores cadastrados.';
    } else {
      peopleCounter.textContent = `Exibindo ${peopleOffset} ${peopleOffset === 1 ? 'colaborador' : 'colaboradores'}${hasMore ? ' (há mais)' : ''}`;
    }
    peopleMoreButton.classList.toggle('hidden', !hasMore);
    setButtonBusy(peopleMoreButton, false);
  } catch (error) {
    if (requestId !== peopleRequestId) return;
    peopleCounter.textContent = error.message;
    if (reset) peopleGrid.innerHTML = '';
    setButtonBusy(peopleMoreButton, false);
  }
}

peopleSearchInput.addEventListener('input', () => {
  clearTimeout(peopleSearchTimer);
  peopleSearchTimer = setTimeout(() => {
    const next = peopleSearchInput.value.trim();
    if (next === peopleQuery) return;
    peopleQuery = next;
    loadPeople(true);
  }, 300);
});

peopleMoreButton.addEventListener('click', () => loadPeople(false));

loadPeople(true);
