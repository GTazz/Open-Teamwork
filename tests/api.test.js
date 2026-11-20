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
if (!process.env.TURSO_DATABASE_URL) {
  process.env.DATABASE_FILE = path.join(tempDir, 'test.sqlite');
}

const { app, db, ready } = require('../server');

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

async function register(name, nick, email = `${nick}@teste.com`) {
  const result = await api('/api/auth/register', {
    method: 'POST',
    body: { name, nick, email, password: 'senha123' },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return { token: result.body.token, user: result.body.user };
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

test('pessoas: lista, busca, paginação e escape de curingas', async () => {
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
  assert.ok(!('ownerAvatarUrl' in user.projects[0]));

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

  for (const allowed of ['/', '/index.html', '/assets/styles.css', '/pages/pessoas.html', '/js/api-client.js']) {
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
