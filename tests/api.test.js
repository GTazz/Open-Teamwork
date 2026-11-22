'use strict';

// Run with:  npm test
// Uses a temporary SQLite file. If TURSO_DATABASE_URL is already set in the
// environment, the same tests run against that database instead.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otw-test-'));
process.env.JWT_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_SCALE = '20';
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASSWORD_HASH = require('bcryptjs').hashSync('senha-admin', 4);
if (!process.env.TURSO_DATABASE_URL) {
  process.env.DATABASE_FILE = path.join(tempDir, 'test.sqlite');
}

const { app, db, ready, mailer } = require('../server');

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let server;
let base;

test.before(async () => {
  await ready;
  await new Promise(resolve => {
    server = app.listen(0, resolve);
  });
  base = `http://localhost:${server.address().port}`;
});

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  await db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

async function api(pathname, { method = 'GET', body, token, raw } = {}) {
  const response = await fetch(base + pathname, {
    method,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return response;
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, body: json, headers: response.headers };
}

/** Last 6-digit code e-mailed to this address (tests keep e-mails in memory). */
function lastCodeSentTo(email) {
  const message = [...mailer.outbox].reverse().find(item => item.to === email.toLowerCase());
  assert.ok(message, `nenhum e-mail enviado para ${email}`);
  return message.text.match(/\b(\d{6})\b/)[1];
}

/** Signs up and confirms the e-mail with the code, like a real person. */
async function register(name, nick, email = `${nick}@teste.com`, password = 'senha123') {
  const result = await api('/api/auth/register', {
    method: 'POST',
    body: { name, nick, email, password },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.verificationRequired, true);
  assert.equal(result.body.token, undefined, 'sem token antes de confirmar o e-mail');
  const verified = await api('/api/auth/verify-email', {
    method: 'POST',
    body: { email, code: lastCodeSentTo(email) },
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { token: verified.body.token, user: verified.body.user };
}

const goodProject = {
  name: 'Projeto',
  description: 'Descrição',
  url: 'https://exemplo.com',
  tags: ['a', 'b'],
  qualifications: [{ name: 'Dev', total: 2 }, { name: 'Designer', total: 1 }],
};

let alice;
let bob;

// ---------------------------------------------------------------------------
test('nick: obrigatório, validado, único sem diferenciar maiúsculas', async () => {
  const noNick = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Sem Nick', email: 'sem@nick.com', password: 'senha123' },
  });
  assert.equal(noNick.status, 400);

  for (const bad of ['ab', 'Alice Dev', 'alice-dev', 'a'.repeat(21), 'admin', 'ação_x']) {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: { name: 'X Y', nick: bad, email: 'x@y.com', password: 'senha123' },
    });
    assert.equal(result.status, 400, `nick "${bad}" deveria ser recusado`);
  }

  alice = await register('Alice Souza', 'Alice_Dev', 'alice@teste.com');
  assert.equal(alice.user.nick, 'alice_dev', 'nick é guardado em minúsculas');

  const sameNick = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Outra', nick: 'ALICE_DEV', email: 'outra@teste.com', password: 'senha123' },
  });
  assert.equal(sameNick.status, 409);

  const sameEmail = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Outra', nick: 'outra_pessoa', email: 'ALICE@teste.com', password: 'senha123' },
  });
  assert.equal(sameEmail.status, 409);

  bob = await register('Bob Lima', 'bob_lima');
});

test('nick: verificação de disponibilidade', async () => {
  assert.deepEqual(
    (await api('/api/nicks/alice_dev')).body,
    { valid: true, available: false, nick: 'alice_dev', message: 'Este nick já está em uso.' }
  );
  assert.equal((await api('/api/nicks/livre123')).body.available, true);
  const invalid = (await api('/api/nicks/ab')).body;
  assert.equal(invalid.valid, false);
  assert.equal(invalid.available, false);
});

test('nick: imutável pela API e pelo próprio banco', async () => {
  const changed = await api('/api/auth/me', {
    method: 'PUT',
    token: alice.token,
    body: { name: 'Alice', nick: 'outro_nick' },
  });
  assert.equal(changed.status, 400);

  const same = await api('/api/auth/me', {
    method: 'PUT',
    token: alice.token,
    body: { name: 'Alice Souza', nick: 'ALICE_DEV' },
  });
  assert.equal(same.status, 200);
  assert.equal(same.body.user.nick, 'alice_dev');

  await assert.rejects(
    db.run('UPDATE user SET nick = ? WHERE id = ?', ['trocado_aqui', alice.user.id]),
    /immutable/i
  );
  const stored = await db.get('SELECT nick FROM user WHERE id = ?', [alice.user.id]);
  assert.equal(stored.nick, 'alice_dev');
});

test('perfil: salva, devolve e valida campos', async () => {
  const saved = await api('/api/auth/me', {
    method: 'PUT',
    token: alice.token,
    body: {
      name: 'Alice S.',
      contactEmail: 'contato@alice.com',
      phone: '(11) 99999-0000',
      bio: 'Dev',
      avatarUrl: PNG,
      githubUrl: 'https://github.com/alice',
      linkedinUrl: 'https://www.linkedin.com/in/alice',
      websiteUrl: 'https://alice.dev',
    },
  });
  assert.equal(saved.status, 200);
  const me = (await api('/api/auth/me', { token: alice.token })).body.user.profile;
  assert.equal(me.contact_email, 'contato@alice.com');
  assert.equal(me.website_url, 'https://alice.dev');
  assert.equal(me.avatar_url, PNG);

  for (const body of [
    { name: 'X', avatarUrl: 'javascript:alert(1)' },
    { name: 'X', avatarUrl: 'http://inseguro.com/a.png' },
    { name: 'X', avatarUrl: 'data:image/png;base64,' + 'A'.repeat(700 * 1024) },
    { name: 'X', websiteUrl: 'javascript:alert(1)' },
    { name: 'X'.repeat(81) },
    { name: 'X', bio: 'b'.repeat(1001) },
  ]) {
    assert.equal((await api('/api/auth/me', { method: 'PUT', token: alice.token, body })).status, 400);
  }
});

test('avatar: servido como imagem em cache e referenciado por endereço curto', async () => {
  const projects = (await api('/api/projects', { token: alice.token })).body.projects;
  assert.deepEqual(projects, []);

  const created = await api('/api/projects', { method: 'POST', token: alice.token, body: goodProject });
  assert.equal(created.status, 201);
  const { ownerAvatarUrl, ownerNick } = created.body.project;
  assert.equal(ownerNick, 'alice_dev');
  assert.match(ownerAvatarUrl, /^\/api\/users\/alice_dev\/avatar\?v=[0-9a-f]{10}$/);

  const image = await api(ownerAvatarUrl, { raw: true });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.match(image.headers.get('cache-control'), /immutable/);
  assert.equal(
    Buffer.from(await image.arrayBuffer()).toString('base64'),
    PNG.split(',')[1]
  );

  assert.equal((await api('/api/users/bob_lima/avatar', { raw: true })).status, 404);

  await api('/api/auth/me', {
    method: 'PUT',
    token: bob.token,
    body: { name: 'Bob Lima', avatarUrl: 'https://cdn.exemplo.com/bob.png' },
  });
  const remote = await api('/api/users/bob_lima/avatar', { raw: true });
  assert.equal(remote.status, 302);
  assert.equal(remote.headers.get('location'), 'https://cdn.exemplo.com/bob.png');
  await api('/api/auth/me', { method: 'PUT', token: bob.token, body: { name: 'Bob Lima', avatarUrl: '' } });
});

test('membros: lista, busca, paginação e escape de curingas', async () => {
  const all = (await api('/api/users')).body;
  assert.deepEqual(all.users.map(u => u.nick).sort(), ['alice_dev', 'bob_lima']);
  assert.equal(all.hasMore, false);
  assert.ok(all.users.every(u => !('email' in u) && !('contact' in u)));

  assert.deepEqual((await api('/api/users?query=ali')).body.users.map(u => u.nick), ['alice_dev']);
  assert.deepEqual((await api('/api/users?query=%40BOB')).body.users.map(u => u.nick), ['bob_lima']);
  assert.deepEqual((await api('/api/users?query=%25')).body.users, [], '% não vira curinga');
  assert.deepEqual((await api('/api/users?query=alice_de_')).body.users, [], '_ não vira curinga');
  assert.deepEqual((await api('/api/users?query=alice_de')).body.users.map(u => u.nick), ['alice_dev']);

  const page = (await api('/api/users?limit=1')).body;
  assert.equal(page.users.length, 1);
  assert.equal(page.hasMore, true);
  const next = (await api('/api/users?limit=1&offset=1')).body;
  assert.equal(next.users.length, 1);
  assert.equal(next.hasMore, false);
});

test('perfil público: contato só para pessoas logadas', async () => {
  const anonymous = await api('/api/users/alice_dev');
  assert.equal(anonymous.status, 200);
  const user = anonymous.body.user;
  assert.equal(user.nick, 'alice_dev');
  assert.equal(user.contactVisible, false);
  assert.equal(user.contact, null);
  assert.equal(user.isOwner, false);
  assert.ok(!JSON.stringify(anonymous.body).includes('99999-0000'), 'telefone não vaza');
  assert.ok(!JSON.stringify(anonymous.body).includes('contato@alice.com'), 'e-mail não vaza');
  assert.equal(user.projects.length, 1);
  // Same card data as GET /api/projects (the profile reuses the Explorar cards).
  assert.ok('ownerAvatarUrl' in user.projects[0]);
  assert.ok(!('myApplicationStatus' in user.projects[0]));

  const visitor = (await api('/api/users/alice_dev', { token: bob.token })).body.user;
  assert.equal(visitor.contactVisible, true);
  assert.equal(visitor.contact.phone, '(11) 99999-0000');
  assert.equal(visitor.isOwner, false);

  const owner = (await api('/api/users/alice_dev', { token: alice.token })).body.user;
  assert.equal(owner.isOwner, true);

  const invalidToken = (await api('/api/users/alice_dev', { token: 'lixo' })).body.user;
  assert.equal(invalidToken.contactVisible, false);

  assert.equal((await api('/api/users/ninguem_aqui')).status, 404);
  assert.equal((await api('/api/users/Inválido!')).status, 404);
});

test('projetos: e-mail de contato do dono só para pessoas logadas', async () => {
  const anonymous = await api('/api/projects');
  assert.equal(anonymous.status, 200);
  assert.ok(anonymous.body.projects.length > 0);
  assert.ok(anonymous.body.projects.every(project => !('ownerEmail' in project)));
  assert.ok(!JSON.stringify(anonymous.body).includes('contato@alice.com'), 'e-mail não vaza');

  const invalidToken = await api('/api/projects', { token: 'lixo' });
  assert.ok(invalidToken.body.projects.every(project => !('ownerEmail' in project)));

  const signedIn = await api('/api/projects', { token: bob.token });
  const aliceProject = signedIn.body.projects.find(project => project.ownerNick === 'alice_dev');
  assert.equal(aliceProject.ownerEmail, 'contato@alice.com');
});

test('projetos: validação de entrada', async () => {
  const bad = [
    { ...goodProject, url: 'javascript:alert(1)' },
    { ...goodProject, url: 'data:text/html,<script>alert(1)</script>' },
    { ...goodProject, name: { a: 1 } },
    { ...goodProject, description: 'x'.repeat(5001) },
    { ...goodProject, qualifications: [{ name: ['x'], total: 1 }] },
    { ...goodProject, qualifications: [null] },
    { ...goodProject, qualifications: [{ name: 'Dev', total: 1 }, { name: 'Dev', total: 2 }] },
  ];
  for (const body of bad) {
    const result = await api('/api/projects', { method: 'POST', token: alice.token, body });
    assert.equal(result.status, 400, JSON.stringify(body).slice(0, 80));
  }

  const tags = await api('/api/projects', {
    method: 'POST',
    token: alice.token,
    body: { ...goodProject, name: 'Com tags', tags: ['ok', { x: 1 }, '<img src=x onerror=1>', 'y'.repeat(41), 5] },
  });
  assert.equal(tags.status, 201);
  assert.deepEqual(tags.body.project.tags, ['ok', '<img src=x onerror=1>']);
  await api(`/api/projects/${tags.body.project.id}`, { method: 'DELETE', token: alice.token });
});

test('candidaturas: fluxo completo, vagas e permissões', async () => {
  const [project] = (await api('/api/projects/mine', { token: alice.token })).body.projects;
  const dev = project.qualifications.find(q => q.name === 'Dev');
  const designer = project.qualifications.find(q => q.name === 'Designer');

  const own = await api(`/api/projects/${project.id}/applications`, {
    method: 'POST', token: alice.token, body: { qualificationIds: [dev.id] },
  });
  assert.equal(own.status, 400, 'não pode se candidatar ao próprio projeto');

  const invalid = await api(`/api/projects/${project.id}/applications`, {
    method: 'POST', token: bob.token, body: { qualificationIds: ['x'] },
  });
  assert.equal(invalid.status, 400);

  const applied = await api(`/api/projects/${project.id}/applications`, {
    method: 'POST', token: bob.token, body: { qualificationIds: [dev.id, designer.id] },
  });
  assert.equal(applied.status, 201);
  assert.equal(applied.body.applications.length, 2);

  const mine = (await api(`/api/projects/${project.id}/my-application`, { token: bob.token })).body.application;
  assert.equal(mine.status, 'pending');

  // The project list carries the viewer's status, so the page needs no extra request per card.
  const listed = (await api('/api/projects', { token: bob.token })).body.projects;
  assert.equal(listed.find(p => p.id === project.id).myApplicationStatus, 'pending');
  assert.deepEqual(listed.find(p => p.id === project.id).myApplicationStatuses, ['pending']);
  assert.ok(listed.filter(p => p.id !== project.id).every(p => p.myApplicationStatus === null));
  assert.ok(listed.filter(p => p.id !== project.id).every(p => p.myApplicationStatuses.length === 0));
  const anonymousList = (await api('/api/projects')).body.projects;
  assert.ok(anonymousList.every(p => !('myApplicationStatus' in p)));
  assert.deepEqual(mine.qualificationIds.sort(), [dev.id, designer.id].sort());

  assert.equal((await api(`/api/projects/${project.id}/applications`, { token: bob.token })).status, 404);
  const received = (await api(`/api/projects/${project.id}/applications`, { token: alice.token })).body.applications;
  assert.equal(received.length, 2);
  assert.ok(received.every(a => a.nick === 'bob_lima' && a.name === 'Bob Lima'));

  const devApplication = received.find(a => a.qualification === 'Dev');
  const accepted = await api(`/api/projects/${project.id}/applications/${devApplication.id}`, {
    method: 'PATCH', token: alice.token, body: { status: 'accepted' },
  });
  assert.equal(accepted.status, 200);
  const afterAccept = (await api('/api/projects/mine', { token: alice.token })).body.projects[0];
  assert.equal(afterAccept.qualifications.find(q => q.name === 'Dev').filled, 1);

  const notOwner = await api(`/api/projects/${project.id}/applications/${devApplication.id}`, {
    method: 'PATCH', token: bob.token, body: { status: 'rejected' },
  });
  assert.equal(notOwner.status, 404);
});

test('projetos: editar mantém candidaturas das vagas que continuam', async () => {
  const [project] = (await api('/api/projects/mine', { token: alice.token })).body.projects;

  const edited = await api(`/api/projects/${project.id}`, {
    method: 'PUT',
    token: alice.token,
    body: {
      ...goodProject,
      description: 'Descrição nova',
      qualifications: [{ name: 'Dev', total: 3 }, { name: 'QA', total: 1 }],
    },
  });
  assert.equal(edited.status, 200);
  const names = edited.body.project.qualifications.map(q => `${q.name}:${q.total}:${q.filled}`);
  assert.deepEqual(names.sort(), ['Dev:3:1', 'QA:1:0']);

  const received = (await api(`/api/projects/${project.id}/applications`, { token: alice.token })).body.applications;
  assert.deepEqual(received.map(a => a.qualification), ['Dev'], 'só a vaga removida (Designer) perde candidaturas');
});

test('projetos: excluir apaga vagas e candidaturas', async () => {
  const [project] = (await api('/api/projects/mine', { token: alice.token })).body.projects;
  assert.equal((await api(`/api/projects/${project.id}`, { method: 'DELETE', token: bob.token })).status, 404);
  assert.equal((await api(`/api/projects/${project.id}`, { method: 'DELETE', token: alice.token })).status, 204);
  assert.equal((await db.get('SELECT COUNT(*) AS total FROM application')).total, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS total FROM project_qualification')).total, 0);
});

test('segurança: só arquivos do site são públicos, com cabeçalhos de proteção', async () => {
  const health = await api('/api/health');
  assert.equal(health.status, 200);
  assert.match(health.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-powered-by'), null);

  for (const [old, clean] of [['/index.html', '/'], ['/pages/membros.html?q=1', '/membros?q=1'], ['/pages/admin', '/admin'], ['/perfil.html', '/perfil']]) {
    const redirect = await api(old, { raw: true });
    assert.equal(redirect.status, 301, old);
    assert.equal(redirect.headers.get('location'), clean);
  }
  for (const allowed of ['/', '/assets/styles.css', '/membros', '/admin', '/perfil', '/js/api-client.js']) {
    assert.equal((await api(allowed, { raw: true })).status, 200, allowed);
  }
  for (const blocked of [
    '/server.js', '/package.json', '/package-lock.json', '/db/schema.sql', '/lib/db.js',
    '/data/open-teamwork.sqlite', '/data/projects.json', '/.env', '/.git/config',
    '/tests/api.test.js', '/node_modules/express/package.json',
    '/assets/OTW%20Logo.psd', '/assets/OTW%20Logo%2Epsd', '/pages/../server.js', '/js/..%2Fserver.js',
  ]) {
    const status = (await api(blocked, { raw: true })).status;
    assert.ok(status >= 400, `${blocked} não pode ser público (recebeu ${status})`);
  }
  assert.equal((await api('/api/rota-que-nao-existe')).status, 404);

  // Unknown pages: the 404 screen for browsers, an empty 404 for everything else.
  for (const missing of ['/pagina-que-nao-existe', '/pages/nada', '/um/dois', '/404.html']) {
    const page = await fetch(base + missing, { headers: { Accept: 'text/html' }, redirect: 'manual' });
    assert.equal(page.status, 404, missing);
    assert.match(await page.text(), /Página não encontrada/, missing);
  }
  const asset = await fetch(`${base}/assets/nao-existe.png`, { headers: { Accept: 'image/png' } });
  assert.equal(asset.status, 404);
  assert.equal(await asset.text(), '');
});

test('segurança: JSON inválido e limite de tentativas de login', async () => {
  const broken = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ quebrado',
  });
  assert.equal(broken.status, 400);

  let last;
  for (let attempt = 1; attempt <= 11; attempt += 1) {
    last = await api('/api/auth/login', {
      method: 'POST',
      body: { email: 'alvo@teste.com', password: 'errada' },
    });
    if (attempt <= 10) assert.equal(last.status, 401);
  }
  assert.equal(last.status, 429, 'a 11ª tentativa na mesma conta é bloqueada');
  assert.ok(Number(last.headers.get('retry-after')) > 0);

  const ok = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'bob_lima@teste.com', password: 'senha123' },
  });
  assert.equal(ok.status, 200, 'outras contas não são afetadas');
  assert.equal(ok.body.user.nick, 'bob_lima');
});

test('login: aceita e-mail ou nick (com ou sem @)', async () => {
  for (const login of ['bob_lima@teste.com', 'bob_lima', '@Bob_Lima']) {
    const result = await api('/api/auth/login', { method: 'POST', body: { login, password: 'senha123' } });
    assert.equal(result.status, 200, `login com "${login}"`);
    assert.equal(result.body.user.nick, 'bob_lima');
  }
  const wrong = await api('/api/auth/login', { method: 'POST', body: { login: 'bob_lima', password: 'errada' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'Login ou senha incorretos.');
  const invalid = await api('/api/auth/login', { method: 'POST', body: { login: 'nick inválido!', password: 'x' } });
  assert.equal(invalid.status, 401);
});

test('cadastro: o e-mail precisa ser confirmado com o código', async () => {
  const email = 'carla@teste.com';
  const signup = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Carla Dias', nick: 'carla_d', email, password: 'senha123' },
  });
  assert.equal(signup.status, 201);
  const code = lastCodeSentTo(email);
  assert.match(mailer.outbox.at(-1).subject, /\d{6}/);

  // Sem confirmar: não entra, não aparece na lista nem tem perfil público.
  const blocked = await api('/api/auth/login', { method: 'POST', body: { login: 'carla_d', password: 'senha123' } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.verificationRequired, true);
  assert.equal(blocked.body.email, email);
  const wrongPassword = await api('/api/auth/login', { method: 'POST', body: { login: email, password: 'errada' } });
  assert.equal(wrongPassword.status, 401, 'senha errada não revela que falta confirmar');
  assert.equal((await api('/api/users/carla_d')).status, 404);
  assert.ok(!(await api('/api/users?query=carla')).body.users.length);

  // O login pediu um código há pouco: o reenvio respeita o intervalo.
  assert.equal(lastCodeSentTo(email), code, 'não manda outro código antes de 1 minuto');

  // Código errado conta tentativa; o certo confirma e devolve a sessão.
  const wrong = await api('/api/auth/verify-email', { method: 'POST', body: { email, code: code === '000000' ? '111111' : '000000' } });
  assert.equal(wrong.status, 400);
  const ok = await api('/api/auth/verify-email', { method: 'POST', body: { email, code } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.nick, 'carla_d');

  const again = await api('/api/auth/verify-email', { method: 'POST', body: { email, code } });
  assert.equal(again.status, 409, 'código usado não vale de novo');
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { login: 'carla_d', password: 'senha123' } })).status, 200);
  assert.equal((await api('/api/users/carla_d')).status, 200);
});

test('cadastro: 5 códigos errados invalidam o código', async () => {
  const email = 'davi@teste.com';
  await api('/api/auth/register', { method: 'POST', body: { name: 'Davi Reis', nick: 'davi_r', email, password: 'senha123' } });
  const code = lastCodeSentTo(email);
  const wrongCode = code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await api('/api/auth/verify-email', { method: 'POST', body: { email, code: wrongCode } })).status, 400);
  }
  const late = await api('/api/auth/verify-email', { method: 'POST', body: { email, code } });
  assert.equal(late.status, 400, 'depois de 5 erros nem o código certo vale');
});

test('cadastro: e-mail não confirmado pode recomeçar o cadastro', async () => {
  const email = 'eva@teste.com';
  await api('/api/auth/register', { method: 'POST', body: { name: 'Eva', nick: 'eva_um', email, password: 'senha123' } });
  const redo = await api('/api/auth/register', { method: 'POST', body: { name: 'Eva Lima', nick: 'eva_dois', email, password: 'outra123' } });
  assert.equal(redo.status, 201, 'o cadastro não confirmado é substituído');
  const free = await api('/api/nicks/eva_um');
  assert.equal(free.body.available, true, 'o nick do cadastro antigo fica livre');
  const verified = await api('/api/auth/verify-email', { method: 'POST', body: { email, code: lastCodeSentTo(email) } });
  assert.equal(verified.body.user.nick, 'eva_dois');

  const taken = await api('/api/auth/register', { method: 'POST', body: { name: 'Outra', nick: 'eva_tres', email, password: 'senha123' } });
  assert.equal(taken.status, 409, 'e-mail confirmado não pode ser cadastrado de novo');
});

test('senha: recuperação por código no e-mail', async () => {
  const forgot = await api('/api/auth/forgot-password', { method: 'POST', body: { login: '@bob_lima' } });
  assert.equal(forgot.status, 200);
  const unknown = await api('/api/auth/forgot-password', { method: 'POST', body: { login: 'ninguem@teste.com' } });
  assert.deepEqual(unknown.body, forgot.body, 'mesma resposta para conta que não existe');

  const code = lastCodeSentTo('bob_lima@teste.com');
  assert.match(mailer.outbox.at(-1).subject, /redefinir/);
  const short = await api('/api/auth/reset-password', { method: 'POST', body: { login: 'bob_lima', code, password: '123' } });
  assert.equal(short.status, 400);
  const wrong = await api('/api/auth/reset-password', {
    method: 'POST', body: { login: 'bob_lima', code: code === '000000' ? '111111' : '000000', password: 'novaSenha1' },
  });
  assert.equal(wrong.status, 400);

  const reset = await api('/api/auth/reset-password', { method: 'POST', body: { login: 'bob_lima', code, password: 'novaSenha1' } });
  assert.equal(reset.status, 200);
  assert.ok(reset.body.token);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { login: 'bob_lima', password: 'senha123' } })).status, 401);
  assert.equal((await api('/api/auth/login', { method: 'POST', body: { login: 'bob_lima', password: 'novaSenha1' } })).status, 200);
  const reused = await api('/api/auth/reset-password', { method: 'POST', body: { login: 'bob_lima', code, password: 'outraSenha2' } });
  assert.equal(reused.status, 400, 'o código só vale uma vez');
});

// ---------------------------------------------------------------------------
test('admin: login separado e exclusão em cascata de perfis e projetos', async () => {
  const wrong = await api('/api/admin/login', { method: 'POST', body: { user: 'admin', password: 'errada' } });
  assert.equal(wrong.status, 401);
  const login = await api('/api/admin/login', { method: 'POST', body: { user: 'Admin', password: 'senha-admin' } });
  assert.equal(login.status, 200);
  const admin = login.body.token;

  const owner = await register('Dona Admin', 'dona_admin');
  const helper = await register('Ajudante Admin', 'ajudante_admin');
  // A normal session never opens the admin API, and the admin token is not a normal session.
  assert.equal((await api('/api/admin/users', { token: owner.token })).status, 401);
  assert.equal((await api('/api/auth/me', { token: admin })).status, 401);

  const created = await api('/api/projects', { method: 'POST', token: owner.token, body: goodProject });
  const project = created.body.project;
  const helperProject = (await api('/api/projects', { method: 'POST', token: helper.token, body: goodProject })).body.project;
  const dev = project.qualifications.find(q => q.name === 'Dev');
  await api(`/api/projects/${project.id}/applications`, { method: 'POST', token: helper.token, body: { qualificationIds: [dev.id] } });
  const helperDev = helperProject.qualifications.find(q => q.name === 'Dev');
  await api(`/api/projects/${helperProject.id}/applications`, { method: 'POST', token: owner.token, body: { qualificationIds: [helperDev.id] } });
  const [received] = (await api(`/api/projects/${helperProject.id}/applications`, { token: helper.token })).body.applications;
  await api(`/api/projects/${helperProject.id}/applications/${received.id}`, { method: 'PATCH', token: helper.token, body: { status: 'accepted' } });
  const filledBefore = await db.get('SELECT filled_slots AS f FROM project_qualification WHERE project_id = ? AND id = ?', [helperProject.id, helperDev.id]);
  assert.equal(filledBefore.f, 1);

  const users = (await api('/api/admin/users', { token: admin })).body.users;
  const ownerRow = users.find(u => u.nick === 'dona_admin');
  assert.equal(ownerRow.projects, 1);
  assert.equal(ownerRow.applications, 1);

  // Deleting the owner removes her project (with the helper's application to it),
  // her accepted application elsewhere (vacancy freed) and the account itself.
  assert.equal((await api(`/api/admin/users/${ownerRow.id}`, { method: 'DELETE', token: admin })).status, 204);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM project WHERE id = ?', [project.id])).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM application WHERE project_id = ? OR user_id = ?', [project.id, ownerRow.id])).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM user WHERE id = ?', [ownerRow.id])).n, 0);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM profile WHERE id = ?', [ownerRow.id])).n, 0);
  const filledAfter = await db.get('SELECT filled_slots AS f FROM project_qualification WHERE project_id = ? AND id = ?', [helperProject.id, helperDev.id]);
  assert.equal(filledAfter.f, 0, 'vaga aprovada volta a ficar livre');
  assert.equal((await api('/api/auth/me', { token: owner.token })).status, 401);

  assert.equal((await api(`/api/admin/projects/${helperProject.id}`, { method: 'DELETE', token: admin })).status, 204);
  assert.equal((await db.get('SELECT COUNT(*) AS n FROM project_qualification WHERE project_id = ?', [helperProject.id])).n, 0);
  assert.equal((await api(`/api/admin/projects/${helperProject.id}`, { method: 'DELETE', token: admin })).status, 404);
});

test('app Android: último APK e últimas páginas publicados no GitHub', async () => {
  const realFetch = globalThis.fetch;
  const checksum = 'a'.repeat(64);
  const responses = {
    'https://api.github.com/repos/GTazz/Open-Teamwork/releases/tags/android-latest': {
      name: 'Open Teamwork para Android (1.0.42)',
      assets: [{ name: 'open-teamwork.apk', state: 'uploaded', browser_download_url: 'https://example.com/open-teamwork.apk' }],
    },
    'https://api.github.com/repos/GTazz/Open-Teamwork/releases/tags/android-web': {
      assets: [
        { name: 'version.json', state: 'uploaded', browser_download_url: 'https://example.com/version.json' },
        { name: 'web-45.zip', state: 'uploaded', browser_download_url: 'https://example.com/web-45.zip' },
      ],
    },
    'https://example.com/version.json': { webBuild: 45, minNativeBuild: 42, checksum, file: 'web-45.zip' },
  };
  let githubCalls = 0;
  globalThis.fetch = (url, options) => {
    if (!(url in responses)) return realFetch(url, options);
    githubCalls += 1;
    return Promise.resolve(new Response(JSON.stringify(responses[url]), { status: 200 }));
  };
  try {
    const first = await api('/api/app/android');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, {
      apk: { build: 42, url: 'https://example.com/open-teamwork.apk' },
      web: { build: 45, minNativeBuild: 42, checksum, url: 'https://example.com/web-45.zip' },
    });
    await api('/api/app/android');
    assert.equal(githubCalls, 3, 'respostas do GitHub ficam em cache');
  } finally {
    globalThis.fetch = realFetch;
  }
});
