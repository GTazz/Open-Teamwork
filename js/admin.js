// ========================================
// ADMIN (pages/admin.html)
// Lists people and projects and deletes them. The admin session is separate
// from the normal one and lives only in this tab (sessionStorage).
// ========================================
const ADMIN_TOKEN_KEY = 'openTeamworkAdminToken';

const loginSection = document.getElementById('admin-login');
const loginForm = document.getElementById('admin-login-form');
const loginMessage = document.getElementById('admin-login-message');
const panel = document.getElementById('admin-panel');
const logoutButton = document.getElementById('admin-logout');
const searchInput = document.getElementById('admin-search');
const counter = document.getElementById('admin-counter');
const list = document.getElementById('admin-list');
const tabs = [...document.querySelectorAll('[data-admin-tab]')];

let currentTab = 'users';
let rows = [];

function escapeAdminText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

function getAdminToken() {
  try { return sessionStorage.getItem(ADMIN_TOKEN_KEY) || ''; } catch { return ''; }
}

function setAdminToken(token) {
  try {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch { /* private mode: the session simply is not kept */ }
}

/** Calls the admin API with the admin token (not the normal session). */
async function adminRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAdminToken()}` },
  });
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    setAdminToken('');
    showLogin('Sessão encerrada. Entre novamente.');
    throw new Error(body.error || 'Sessão encerrada.');
  }
  if (!response.ok) throw new Error(body.error || 'Não foi possível concluir a operação.');
  return body;
}

function showLogin(message = '') {
  panel.classList.add('hidden');
  logoutButton.classList.add('hidden');
  loginSection.classList.remove('hidden');
  loginMessage.textContent = message;
  loginMessage.classList.toggle('hidden', !message);
}

function showPanel() {
  loginSection.classList.add('hidden');
  panel.classList.remove('hidden');
  logoutButton.classList.remove('hidden');
  loadTab(currentTab);
}

function formatDate(value) {
  const date = new Date(String(value).replace(' ', 'T') + 'Z');
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

function renderRow(row) {
  if (currentTab === 'users') {
    return `
      <li class="admin-row">
        <div class="admin-row-info">
          <strong>${escapeAdminText(row.name || '(sem nome)')}</strong>
          <span>@${escapeAdminText(row.nick)} · ${escapeAdminText(row.email)}</span>
          <span>${row.projects} projeto(s) · ${row.applications} candidatura(s) · desde ${formatDate(row.createdAt)}</span>
        </div>
        <button type="button" class="btn btn-danger btn-small" data-delete="${row.id}">Excluir</button>
      </li>`;
  }
  return `
    <li class="admin-row">
      <div class="admin-row-info">
        <strong>${escapeAdminText(row.name)}</strong>
        <span>de ${escapeAdminText(row.owner)} (@${escapeAdminText(row.ownerNick)})</span>
        <span>${row.applications} candidatura(s) · criado em ${formatDate(row.createdAt)}</span>
      </div>
      <button type="button" class="btn btn-danger btn-small" data-delete="${row.id}">Excluir</button>
    </li>`;
}

function renderList() {
  const query = searchInput.value.trim().toLowerCase().replace(/^@/, '');
  const visible = rows.filter(row => !query || [row.name, row.nick, row.email, row.owner, row.ownerNick]
    .some(value => String(value || '').toLowerCase().includes(query)));
  const noun = currentTab === 'users' ? 'perfil(is)' : 'projeto(s)';
  counter.textContent = `${visible.length} ${noun}`;
  list.innerHTML = visible.map(renderRow).join('') || '<li class="admin-empty">Nada encontrado.</li>';
}

async function loadTab(tab) {
  currentTab = tab;
  tabs.forEach(button => {
    const active = button.dataset.adminTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  counter.textContent = 'Carregando...';
  list.innerHTML = '';
  try {
    const body = await adminRequest(tab === 'users' ? '/admin/users' : '/admin/projects');
    rows = tab === 'users' ? body.users : body.projects;
    renderList();
  } catch (error) {
    counter.textContent = error.message;
  }
}

async function deleteRow(id, button) {
  const row = rows.find(item => String(item.id) === String(id));
  if (!row) return;
  const question = currentTab === 'users'
    ? `Excluir o perfil de ${row.name || '@' + row.nick} (@${row.nick})?\n\nIsso apaga a conta, os ${row.projects} projeto(s) dele com as candidaturas recebidas e as ${row.applications} candidatura(s) que ele fez (vagas aprovadas voltam a ficar livres). Não dá para desfazer.`
    : `Excluir o projeto "${row.name}"?\n\nIsso apaga o projeto, as vagas e as ${row.applications} candidatura(s). Não dá para desfazer.`;
  if (!window.confirm(question)) return;

  button.disabled = true;
  try {
    await adminRequest(`/admin/${currentTab === 'users' ? 'users' : 'projects'}/${id}`, { method: 'DELETE' });
    rows = rows.filter(item => item !== row);
    renderList();
  } catch (error) {
    button.disabled = false;
    window.alert(error.message);
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submit = loginForm.querySelector('button[type=submit]');
  submit.disabled = true;
  try {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: document.getElementById('admin-user').value,
        password: document.getElementById('admin-password').value,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Não foi possível entrar.');
    setAdminToken(body.token);
    loginForm.reset();
    showPanel();
  } catch (error) {
    showLogin(error.message);
  } finally {
    submit.disabled = false;
  }
});

logoutButton.addEventListener('click', () => {
  setAdminToken('');
  showLogin();
});

tabs.forEach(button => button.addEventListener('click', () => {
  searchInput.value = '';
  loadTab(button.dataset.adminTab);
}));

searchInput.addEventListener('input', renderList);

list.addEventListener('click', event => {
  const button = event.target.closest('[data-delete]');
  if (button) deleteRow(button.dataset.delete, button);
});

if (getAdminToken()) showPanel();
else showLogin();
