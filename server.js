'use strict';

require('dotenv').config();

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createDb } = require('./lib/db');
const { NICK_PATTERN, checkNick } = require('./lib/nick');
const { securityHeaders, createRateLimiter, mountStaticFiles, mountNotFoundPage } = require('./lib/security');
const { createMailer } = require('./lib/mailer');
const { createEmailCodes } = require('./lib/email-codes');

const rootDir = __dirname;
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3000);

// ---------------------------------------------------------------------------
// Configuration checks
// ---------------------------------------------------------------------------
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  throw new Error('JWT_SECRET must contain at least 16 characters.');
}
if (isProduction && (jwtSecret.length < 32 || /troque|change-?me|example/i.test(jwtSecret))) {
  throw new Error('In production JWT_SECRET must be a random value with at least 32 characters.');
}

const db = createDb({ rootDir });
const ready = db.init();
const mailer = createMailer();
// EMAIL_LOGO_URL (optional): public address of the logo shown in e-mails.
const emailCodes = createEmailCodes({
  db,
  mailer,
  secret: jwtSecret,
  ...(process.env.EMAIL_LOGO_URL ? { logoUrl: process.env.EMAIL_LOGO_URL } : {}),
});
if (isProduction && mailer.kind !== 'brevo') {
  console.warn('BREVO_API_KEY/MAIL_FROM not set: sign-up and password reset e-mails will fail.');
}
ready.catch(() => {}); // Failures are reported by the middleware below and by start-up.

if (isProduction && db.kind === 'sqlite' && !process.env.ALLOW_LOCAL_DB) {
  console.warn(
    '[aviso] Rodando em produção com um arquivo SQLite local. Em hospedagens gratuitas o ' +
      'disco é apagado a cada reinício: configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN ' +
      '(veja DEPLOY.md).'
  );
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');

// Behind a hosting proxy (Render, ...) the real client IP comes from X-Forwarded-For.
const trustProxy = process.env.TRUST_PROXY ?? (isProduction ? '1' : '');
if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

app.use(securityHeaders({ isProduction }));

// Browser apps on other origins (the Capacitor mobile app) must be allow-listed.
const allowedOrigins = new Set([
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
  ...(process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean),
]);
app.use(
  '/api',
  cors({
    origin: (origin, callback) => callback(null, !isProduction || !origin || allowedOrigins.has(origin)),
    maxAge: 600,
  })
);

app.use(express.json({ limit: '1mb' }));

// Used by the host's health check and by keep-alive pings: does not touch the database.
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// Requests wait until the schema is ready (only relevant right after start-up).
app.use('/api', async (_req, res, next) => {
  try {
    await ready;
    next();
  } catch (error) {
    console.error('Database is not available:', error);
    res.status(503).json({ error: 'Banco de dados indisponível.' });
  }
});

// RATE_LIMIT_SCALE multiplies the per-IP limits (used by the automated tests).
const scale = Number(process.env.RATE_LIMIT_SCALE) || 1;
const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 300 * scale });
const registerLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10 * scale });
const loginIpLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30 * scale });
const nickLimiter = createRateLimiter({ windowMs: 60_000, max: 60 * scale });
const loginAccountLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10 });

app.use('/api', apiLimiter.middleware());
app.use('/api/auth/register', registerLimiter.middleware('Muitos cadastros deste endereço. Tente mais tarde.'));
app.use('/api/auth/login', loginIpLimiter.middleware('Muitas tentativas de login. Aguarde alguns minutos.'));
app.use('/api/nicks', nickLimiter.middleware());
const adminLoginLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 10 * scale });
app.use('/api/admin/login', adminLoginLimiter.middleware('Muitas tentativas. Aguarde alguns minutos.'));
// Codes: typing (verify/reset) and asking for new ones (resend/forgot).
const codeIpLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30 * scale });
const codeEmailLimiter = createRateLimiter({ windowMs: 60 * 60_000, max: 10 * scale });
app.use(
  ['/api/auth/verify-email', '/api/auth/reset-password', '/api/auth/resend-code', '/api/auth/forgot-password'],
  codeIpLimiter.middleware('Muitas tentativas. Aguarde alguns minutos.')
);

mountStaticFiles(app, rootDir);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Express 4 does not catch rejected promises: forward them to the error handler. */
const handle = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d' });
}

// Compared against when the e-mail does not exist, so response time does not reveal it.
const DUMMY_HASH = bcrypt.hashSync('senha-que-nunca-sera-usada', 10);

async function findSessionUser(token) {
  const payload = jwt.verify(token, jwtSecret);
  return db.get(
    `SELECT u.id, u.email, u.nick, p.name
     FROM user u
     JOIN profile p ON p.id = u.id
     WHERE u.id = ?`,
    [payload.sub]
  );
}

const authRequired = handle(async (req, res, next) => {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return sendError(res, 401, 'Faça login para continuar.');
  }

  let user;
  try {
    user = await findSessionUser(token);
  } catch {
    return sendError(res, 401, 'Sua sessão expirou. Entre novamente.');
  }
  if (!user) return sendError(res, 401, 'Sessão inválida. Entre novamente.');
  req.user = user;
  return next();
});

/** Identifies the visitor when a valid token is sent; otherwise continues as anonymous. */
const authOptional = handle(async (req, _res, next) => {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      const user = await findSessionUser(token);
      if (user) req.user = user;
    } catch {
      // Invalid/expired token: treated as a visitor.
    }
  }
  next();
});

// --- Profile pictures -------------------------------------------------------
const AVATAR_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const AVATAR_DATA_URL_PARTS = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/;
const MAX_AVATAR_LENGTH = 600 * 1024;

function normalizeAvatarUrl(value) {
  const avatar = String(value || '').trim();
  if (!avatar) return '';
  if (avatar.length > MAX_AVATAR_LENGTH) return null;
  if (AVATAR_DATA_URL.test(avatar)) return avatar;
  try {
    const parsed = new URL(avatar);
    if (parsed.protocol === 'https:') return parsed.href;
  } catch {
    return null;
  }
  return null;
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    // Keeps exactly what the person typed (href would add a trailing slash).
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Address the browser should use to display someone's picture. Pictures stored
 * as data URLs are served by GET /api/users/:nick/avatar (cacheable), so lists
 * of projects and people stay small instead of repeating ~30 KB of base64 per row.
 */
function publicAvatarUrl(nick, stored) {
  if (!stored || !nick) return '';
  if (!stored.startsWith('data:')) return stored;
  const version = crypto.createHash('sha1').update(stored).digest('hex').slice(0, 10);
  return `/api/users/${nick}/avatar?v=${version}`;
}

// --- Users ------------------------------------------------------------------
const PROFILE_LIMITS = { name: 80, contactEmail: 120, phone: 30, bio: 1000, url: 300, password: 100 };

async function getUserWithProfile(userId) {
  const row = await db.get(
    `SELECT u.id, u.email, u.nick, p.name, p.contact_email, p.phone, p.bio, p.avatar_url,
            p.github_url, p.linkedin_url, p.website_url
     FROM user u
     JOIN profile p ON p.id = u.id
     WHERE u.id = ?`,
    [userId]
  );
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    nick: row.nick,
    name: row.name,
    profile: {
      id: row.id,
      name: row.name,
      contact_email: row.contact_email,
      phone: row.phone,
      bio: row.bio,
      avatar_url: row.avatar_url,
      github_url: row.github_url,
      linkedin_url: row.linkedin_url,
      website_url: row.website_url,
    },
  };
}

// --- Projects ---------------------------------------------------------------
function parseTags(value) {
  try {
    const tags = JSON.parse(value || '[]');
    return Array.isArray(tags) ? tags : [];
  } catch {
    return [];
  }
}

// A pending application is what the person can still change, so it wins.
const APPLICATION_STATUS_PRIORITY = { pending: 0, accepted: 1, rejected: 2 };

/**
 * Projects plus their qualifications in a fixed number of queries (not 1 + N):
 * with a remote database every query is a network round trip.
 * @param {string} whereSql Condition on alias "p", e.g. "WHERE p.id = ?".
 * @param {unknown[]} args
 * @param {{includeOwnerContact?: boolean, viewerId?: number|null}} options
 *   viewerId adds "myApplicationStatus" (that person's status in each project).
 */
async function listProjects(whereSql = '', args = [], { includeOwnerContact = false, viewerId = null } = {}) {
  const projects = await db.all(
    `SELECT p.*, pr.name AS owner, pr.avatar_url AS owner_avatar, u.nick AS owner_nick,
            pr.contact_email AS owner_contact_email
     FROM project p
     JOIN profile pr ON pr.id = p.user_id
     JOIN user u ON u.id = p.user_id
     ${whereSql}
     ORDER BY p.created_at DESC, p.id DESC`,
    args
  );
  if (!projects.length) return [];

  const qualifications = await db.all(
    `SELECT project_id, id, name, filled_slots AS filled, total_slots AS total
     FROM project_qualification
     WHERE project_id IN (SELECT p.id FROM project p ${whereSql})
     ORDER BY project_id, id`,
    args
  );

  const viewerStatus = new Map();
  const viewerStatuses = new Map();
  if (viewerId) {
    const rows = await db.all('SELECT project_id, status FROM application WHERE user_id = ?', [viewerId]);
    rows.forEach(({ project_id: projectId, status }) => {
      const current = viewerStatus.get(projectId);
      if (!current || APPLICATION_STATUS_PRIORITY[status] < APPLICATION_STATUS_PRIORITY[current]) {
        viewerStatus.set(projectId, status);
      }
      if (!viewerStatuses.has(projectId)) viewerStatuses.set(projectId, new Set());
      viewerStatuses.get(projectId).add(status);
    });
  }

  const byProject = new Map();
  qualifications.forEach(({ project_id: projectId, ...qualification }) => {
    if (!byProject.has(projectId)) byProject.set(projectId, []);
    byProject.get(projectId).push(qualification);
  });

  return projects.map(project => ({
    id: project.id,
    name: project.name,
    owner: project.owner,
    ownerId: project.user_id,
    ownerAvatarUrl: publicAvatarUrl(project.owner_nick, project.owner_avatar),
    ownerNick: project.owner_nick || '',
    // Same rule as the public profile: contact details only for signed-in people.
    ...(includeOwnerContact ? { ownerEmail: project.owner_contact_email || '' } : {}),
    description: project.description,
    url: project.url || '',
    tags: parseTags(project.tags),
    qualifications: byProject.get(project.id) || [],
    // myApplicationStatus: the one status the apply button shows (pending wins).
    // myApplicationStatuses: every status the person has in the project (filters).
    ...(viewerId ? {
      myApplicationStatus: viewerStatus.get(project.id) || null,
      myApplicationStatuses: [...(viewerStatuses.get(project.id) || [])].sort(),
    } : {}),
  }));
}

async function getProject(id) {
  return (await listProjects('WHERE p.id = ?', [id]))[0] || null;
}

async function recalculateFilledSlots(executor, projectId) {
  await executor.run(
    `UPDATE project_qualification
     SET filled_slots = (
       SELECT COUNT(*)
       FROM application a
       WHERE a.qualification_id = project_qualification.id
         AND a.project_id = project_qualification.project_id
         AND a.status = 'accepted'
     )
     WHERE project_id = ?`,
    [projectId]
  );
}

const LIMITS = {
  name: 120,
  description: 5000,
  url: 2000,
  qualificationName: 80,
  qualifications: 30,
  slots: 1000,
  tags: 20,
  tag: 40,
};

function cleanTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter(tag => typeof tag === 'string')
    .map(tag => tag.trim())
    .filter(tag => tag && tag.length <= LIMITS.tag)
    .slice(0, LIMITS.tags);
}

function validateProjectInput(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!name || !description) {
    return 'Nome e descrição são obrigatórios.';
  }
  if (name.length > LIMITS.name || description.length > LIMITS.description) {
    return 'Nome ou descrição muito longos.';
  }

  const url = body.url == null ? '' : String(body.url).trim();
  if (url && (url.length > LIMITS.url || normalizeHttpUrl(url) === null)) {
    return 'A URL deve começar com http:// ou https://.';
  }

  const qualifications = Array.isArray(body.qualifications) ? body.qualifications : [];
  if (
    !qualifications.length ||
    qualifications.length > LIMITS.qualifications ||
    qualifications.some(q =>
      !q ||
      typeof q.name !== 'string' ||
      !q.name.trim() ||
      q.name.trim().length > LIMITS.qualificationName ||
      !Number.isInteger(Number(q.total)) ||
      Number(q.total) < 1 ||
      Number(q.total) > LIMITS.slots
    )
  ) {
    return 'Informe pelo menos uma qualificação válida.';
  }
  const names = qualifications.map(q => q.name.trim());
  if (new Set(names).size !== names.length) {
    return 'As qualificações devem ter nomes diferentes.';
  }
  return null;
}

const INSERT_QUALIFICATION = `
  INSERT INTO project_qualification (project_id, id, name, total_slots)
  VALUES (?, (
    SELECT COALESCE(MAX(id), 0) + 1
    FROM project_qualification
    WHERE project_id = ?
  ), ?, ?)`;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Removes sign-ups that never confirmed the e-mail (they own no projects or
 * applications yet). Dependent rows are deleted explicitly because the remote
 * database does not enforce ON DELETE CASCADE.
 * @param {string} condition SQL condition on table "user".
 * @param {unknown[]} args
 */
async function deleteUnverifiedUsers(condition, args = []) {
  const where = `id IN (SELECT id FROM user WHERE email_verified_at IS NULL AND (${condition}))`;
  await db.transaction(async tx => {
    await tx.run(`DELETE FROM email_code WHERE user_${where}`, args);
    await tx.run(`DELETE FROM profile WHERE ${where}`, args);
    await tx.run(`DELETE FROM user WHERE ${where}`, args);
  });
}

app.post('/api/auth/register', handle(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2 || !email.includes('@') || password.length < 6) {
    return sendError(res, 400, 'Informe nome, um e-mail válido e uma senha com pelo menos 6 caracteres.');
  }
  if (
    name.length > PROFILE_LIMITS.name ||
    email.length > PROFILE_LIMITS.contactEmail ||
    password.length > PROFILE_LIMITS.password
  ) {
    return sendError(res, 400, 'Nome, e-mail ou senha muito longos.');
  }

  const nickCheck = checkNick(req.body.nick);
  if (nickCheck.error) return sendError(res, 400, nickCheck.error);
  const { nick } = nickCheck;

  // Sign-ups never confirmed within a day are dropped, so they cannot hold an
  // e-mail or nick forever. An unconfirmed account with this same e-mail is
  // replaced: whoever owns the inbox can always start over.
  await deleteUnverifiedUsers("created_at < datetime('now', '-1 day')");
  const existing = await db.get('SELECT id, email_verified_at FROM user WHERE email = ?', [email]);
  if (existing && existing.email_verified_at) {
    return sendError(res, 409, 'Este e-mail já está cadastrado.');
  }
  if (existing) await deleteUnverifiedUsers('id = ?', [existing.id]);
  if (await db.get('SELECT 1 FROM user WHERE nick = ?', [nick])) {
    return sendError(res, 409, 'Este nick já está em uso.');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const userId = await db.transaction(async tx => {
      const result = await tx.run(
        'INSERT INTO user (email, nick, password_hash) VALUES (?, ?, ?)',
        [email, nick, passwordHash]
      );
      await tx.run(
        'INSERT INTO profile (id, name, contact_email) VALUES (?, ?, ?)',
        [result.lastInsertRowid, name, email]
      );
      return result.lastInsertRowid;
    });
    try {
      await emailCodes.send({ id: userId, email, name }, 'verify');
    } catch (error) {
      console.error('Verification e-mail failed:', error.message);
      await deleteUnverifiedUsers('id = ?', [userId]);
      return sendError(res, 502, 'Não foi possível enviar o e-mail de confirmação. Confira o endereço e tente novamente.');
    }
    return res.status(201).json({ verificationRequired: true, email });
  } catch (error) {
    // Two requests racing for the same e-mail/nick: the unique indexes decide.
    if (/UNIQUE/i.test(String(error.message)) || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return sendError(
        res,
        409,
        /nick/i.test(String(error.message)) ? 'Este nick já está em uso.' : 'Este e-mail já está cadastrado.'
      );
    }
    throw error;
  }
}));

app.post('/api/auth/login', handle(async (req, res) => {
  // "login" accepts the e-mail or the @nick ("email" is still read for older app builds).
  const identifier = String(req.body.login ?? req.body.email ?? '').trim().toLowerCase().slice(0, 200);
  const password = String(req.body.password || '');
  const byEmail = identifier.includes('@') && !identifier.startsWith('@');
  const nick = identifier.replace(/^@/, '');

  const user = byEmail || NICK_PATTERN.test(nick)
    ? await db.get(
        `SELECT u.id, u.email, u.password_hash, u.email_verified_at, p.name
         FROM user u
         JOIN profile p ON p.id = u.id
         WHERE ${byEmail ? 'u.email' : 'u.nick'} = ?`,
        [byEmail ? identifier : nick]
      )
    : null;

  // Per-account limit as well: stops password guessing even from many IP
  // addresses. Keyed by account, so the e-mail and the nick share one counter.
  const attempt = loginAccountLimiter.hit(user ? `user:${user.id}` : `login:${identifier}`);
  if (attempt.limited) {
    res.setHeader('Retry-After', String(attempt.retryAfter));
    return sendError(res, 429, 'Muitas tentativas de login para esta conta. Aguarde alguns minutos.');
  }

  const passwordMatches = await bcrypt.compare(password.slice(0, 200), user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordMatches) {
    return sendError(res, 401, 'Login ou senha incorretos.');
  }
  if (!user.email_verified_at) {
    // The password is right, so it is safe to say where the code goes.
    try {
      await emailCodes.send(user, 'verify');
    } catch (error) {
      console.error('Verification e-mail failed:', error.message);
    }
    return res.status(403).json({
      error: 'Confirme seu e-mail para entrar. Enviamos um código para ele.',
      verificationRequired: true,
      email: user.email,
    });
  }
  return res.json({ token: signToken(user), user: await getUserWithProfile(user.id) });
}));

/**
 * Account by e-mail or @nick (same rule as the login), or null.
 * @param {unknown} login
 */
async function findAccount(login) {
  const identifier = String(login || '').trim().toLowerCase().slice(0, 200);
  const byEmail = identifier.includes('@') && !identifier.startsWith('@');
  const nick = identifier.replace(/^@/, '');
  if (!byEmail && !NICK_PATTERN.test(nick)) return null;
  return db.get(
    `SELECT u.id, u.email, u.email_verified_at, p.name
     FROM user u
     JOIN profile p ON p.id = u.id
     WHERE ${byEmail ? 'u.email' : 'u.nick'} = ?`,
    [byEmail ? identifier : nick]
  );
}

/** Per-account limit for asking new codes, on top of the per-IP one. */
function tooManyCodeRequests(res, account) {
  const attempt = codeEmailLimiter.hit(`code:${account.id}`);
  if (!attempt.limited) return false;
  res.setHeader('Retry-After', String(attempt.retryAfter));
  sendError(res, 429, 'Muitos códigos pedidos para esta conta. Aguarde e tente de novo.');
  return true;
}

app.post('/api/auth/verify-email', handle(async (req, res) => {
  const account = await findAccount(req.body.email);
  const invalid = () => sendError(res, 400, 'Código inválido ou expirado. Confira o e-mail ou peça um novo código.');
  if (!account) return invalid();
  if (account.email_verified_at) return sendError(res, 409, 'Este e-mail já foi confirmado. Entre com sua senha.');
  if (!(await emailCodes.consume(account.id, 'verify', req.body.code))) return invalid();

  await db.run('UPDATE user SET email_verified_at = CURRENT_TIMESTAMP WHERE id = ?', [account.id]);
  return res.json({ token: signToken(account), user: await getUserWithProfile(account.id) });
}));

app.post('/api/auth/resend-code', handle(async (req, res) => {
  const account = await findAccount(req.body.email);
  // Same answer whether or not the account exists (does not reveal e-mails).
  if (!account || account.email_verified_at) return res.json({ ok: true, retryAfter: 60 });
  if (tooManyCodeRequests(res, account)) return undefined;
  try {
    const result = await emailCodes.send(account, 'verify');
    return res.json({ ok: true, retryAfter: result.retryAfter });
  } catch (error) {
    console.error('Verification e-mail failed:', error.message);
    return sendError(res, 502, 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.');
  }
}));

app.post('/api/auth/forgot-password', handle(async (req, res) => {
  const account = await findAccount(req.body.login);
  // Always the same answer, so the form cannot be used to find accounts.
  const answer = () => res.json({
    ok: true,
    message: 'Se existir uma conta com esses dados, enviamos um código para o e-mail dela.',
  });
  if (!account) return answer();
  if (tooManyCodeRequests(res, account)) return undefined;
  try {
    await emailCodes.send(account, 'reset');
  } catch (error) {
    console.error('Password reset e-mail failed:', error.message);
  }
  return answer();
}));

app.post('/api/auth/reset-password', handle(async (req, res) => {
  const password = String(req.body.password || '');
  if (password.length < 6 || password.length > PROFILE_LIMITS.password) {
    return sendError(res, 400, 'A nova senha precisa ter pelo menos 6 caracteres.');
  }
  const account = await findAccount(req.body.login);
  if (!account || !(await emailCodes.consume(account.id, 'reset', req.body.code))) {
    return sendError(res, 400, 'Código inválido ou expirado. Peça um novo código.');
  }
  const passwordHash = await bcrypt.hash(password, 10);
  // Receiving the code also proves the e-mail belongs to this person.
  await db.run(
    'UPDATE user SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP) WHERE id = ?',
    [passwordHash, account.id]
  );
  await db.run("DELETE FROM email_code WHERE user_id = ? AND purpose = 'verify'", [account.id]);
  return res.json({ token: signToken(account), user: await getUserWithProfile(account.id) });
}));

app.get('/api/auth/me', authRequired, handle(async (req, res) => {
  return res.json({ user: await getUserWithProfile(req.user.id) });
}));

app.put('/api/auth/me', authRequired, handle(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return sendError(res, 400, 'O nome é obrigatório.');
  if (name.length > PROFILE_LIMITS.name) return sendError(res, 400, 'O nome é muito longo.');

  if (req.body.nick !== undefined) {
    if (String(req.body.nick).trim().toLowerCase() !== String(req.user.nick).toLowerCase()) {
      return sendError(res, 400, 'O nick não pode ser alterado.');
    }
  }

  const contactEmail = String(req.body.contactEmail || req.user.email).trim();
  if (!contactEmail.includes('@') || contactEmail.length > PROFILE_LIMITS.contactEmail) {
    return sendError(res, 400, 'E-mail de contato inválido.');
  }

  const phone = String(req.body.phone || '').trim();
  const bio = String(req.body.bio || '').trim();
  if (phone.length > PROFILE_LIMITS.phone || bio.length > PROFILE_LIMITS.bio) {
    return sendError(res, 400, 'Telefone ou descrição muito longos.');
  }

  const avatarUrl = normalizeAvatarUrl(req.body.avatarUrl);
  if (avatarUrl === null) return sendError(res, 400, 'Foto de perfil inválida ou grande demais.');

  const githubUrl = normalizeHttpUrl(req.body.githubUrl);
  const linkedinUrl = normalizeHttpUrl(req.body.linkedinUrl);
  const websiteUrl = normalizeHttpUrl(req.body.websiteUrl);
  if (githubUrl === null || linkedinUrl === null || websiteUrl === null) {
    return sendError(res, 400, 'Há um link inválido no perfil.');
  }
  if ([githubUrl, linkedinUrl, websiteUrl].some(url => url.length > PROFILE_LIMITS.url)) {
    return sendError(res, 400, 'Um dos links do perfil é muito longo.');
  }

  await db.run(
    `UPDATE profile SET
       name = ?, contact_email = ?, phone = ?, bio = ?, avatar_url = ?,
       github_url = ?, linkedin_url = ?, website_url = ?
     WHERE id = ?`,
    [name, contactEmail, phone, bio, avatarUrl, githubUrl, linkedinUrl, websiteUrl, req.user.id]
  );

  return res.json({ user: await getUserWithProfile(req.user.id) });
}));

// ---------------------------------------------------------------------------
// People: nick availability, directory, public profile and picture
// ---------------------------------------------------------------------------
app.get('/api/nicks/:nick', handle(async (req, res) => {
  const check = checkNick(req.params.nick);
  if (check.error) return res.json({ valid: false, available: false, message: check.error });
  const taken = await db.get('SELECT 1 FROM user WHERE nick = ?', [check.nick]);
  return res.json({
    valid: true,
    available: !taken,
    nick: check.nick,
    message: taken ? 'Este nick já está em uso.' : 'Nick disponível.',
  });
}));

app.get('/api/users', handle(async (req, res) => {
  const query = String(req.query.query || '').trim().replace(/^@/, '').slice(0, 60);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 18, 1), 50);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;

  const rows = await db.all(
    `SELECT u.nick, p.name, p.bio, p.avatar_url
     FROM user u
     JOIN profile p ON p.id = u.id
     WHERE u.email_verified_at IS NOT NULL
       AND (? = '' OR u.nick LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')
     ORDER BY p.name COLLATE NOCASE, u.nick
     LIMIT ? OFFSET ?`,
    [query, pattern, pattern, limit + 1, offset]
  );

  return res.json({
    users: rows.slice(0, limit).map(row => ({
      nick: row.nick,
      name: row.name,
      bio: String(row.bio || '').slice(0, 160),
      avatarUrl: publicAvatarUrl(row.nick, row.avatar_url),
    })),
    hasMore: rows.length > limit,
  });
}));

app.get('/api/users/:nick/avatar', handle(async (req, res) => {
  const nick = String(req.params.nick || '').toLowerCase();
  const row = NICK_PATTERN.test(nick)
    ? await db.get(
        'SELECT p.avatar_url FROM user u JOIN profile p ON p.id = u.id WHERE u.nick = ?',
        [nick]
      )
    : null;
  if (!row || !row.avatar_url) return res.status(404).end();

  const parts = AVATAR_DATA_URL_PARTS.exec(row.avatar_url);
  if (!parts) {
    // Remote https picture: send the browser there.
    return res.redirect(302, row.avatar_url);
  }

  // The address carries a hash of the picture (?v=...), so a long cache is safe.
  res.set({
    'Content-Type': parts[1].replace('image/jpg', 'image/jpeg'),
    'Cache-Control': req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  return res.send(Buffer.from(parts[2], 'base64'));
}));

app.get('/api/users/:nick', authOptional, handle(async (req, res) => {
  const nick = String(req.params.nick || '').trim().toLowerCase();
  const row = NICK_PATTERN.test(nick)
    ? await db.get(
        `SELECT u.id, u.nick, u.created_at, p.name, p.bio, p.avatar_url, p.github_url,
                p.linkedin_url, p.website_url, p.contact_email, p.phone
         FROM user u
         JOIN profile p ON p.id = u.id
         WHERE u.nick = ? AND u.email_verified_at IS NOT NULL`,
        [nick]
      )
    : null;
  if (!row) return sendError(res, 404, 'Pessoa não encontrada.');

  // Same shape as GET /api/projects, so the profile can reuse the Explorar cards.
  const projects = await listProjects('WHERE p.user_id = ?', [row.id], {
    includeOwnerContact: Boolean(req.user),
    viewerId: req.user ? req.user.id : null,
  });

  // Contact details are only shown to signed-in people (limits scraping).
  const contactVisible = Boolean(req.user);
  return res.json({
    user: {
      nick: row.nick,
      name: row.name,
      bio: row.bio || '',
      avatarUrl: publicAvatarUrl(row.nick, row.avatar_url),
      githubUrl: row.github_url || '',
      linkedinUrl: row.linkedin_url || '',
      websiteUrl: row.website_url || '',
      createdAt: row.created_at,
      isOwner: Boolean(req.user && req.user.id === row.id),
      contactVisible,
      contact: contactVisible
        ? { email: row.contact_email || '', phone: row.phone || '' }
        : null,
      projects,
    },
  });
}));

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
app.get('/api/projects', authOptional, handle(async (req, res) => {
  return res.json({ projects: await listProjects('', [], {
    includeOwnerContact: Boolean(req.user),
    viewerId: req.user ? req.user.id : null,
  }) });
}));

app.get('/api/projects/mine', authRequired, handle(async (req, res) => {
  return res.json({ projects: await listProjects('WHERE p.user_id = ?', [req.user.id]) });
}));

app.post('/api/projects', authRequired, handle(async (req, res) => {
  const error = validateProjectInput(req.body);
  if (error) return sendError(res, 400, error);

  const projectId = await db.transaction(async tx => {
    const result = await tx.run(
      `INSERT INTO project (user_id, name, description, url, tags)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.body.name.trim(),
        req.body.description.trim(),
        String(req.body.url || '').trim() || null,
        JSON.stringify(cleanTags(req.body.tags)),
      ]
    );
    for (const q of req.body.qualifications) {
      await tx.run(INSERT_QUALIFICATION, [
        result.lastInsertRowid,
        result.lastInsertRowid,
        String(q.name).trim(),
        Number(q.total),
      ]);
    }
    return result.lastInsertRowid;
  });
  return res.status(201).json({ project: await getProject(projectId) });
}));

app.put('/api/projects/:id', authRequired, handle(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await db.get(
    'SELECT id FROM project WHERE id = ? AND user_id = ?',
    [projectId, req.user.id]
  );
  if (!project) return sendError(res, 404, 'Projeto não encontrado.');

  const error = validateProjectInput(req.body);
  if (error) return sendError(res, 400, error);

  await db.transaction(async tx => {
    await tx.run(
      'UPDATE project SET name = ?, description = ?, url = ?, tags = ? WHERE id = ?',
      [
        req.body.name.trim(),
        req.body.description.trim(),
        String(req.body.url || '').trim() || null,
        JSON.stringify(cleanTags(req.body.tags)),
        projectId,
      ]
    );

    // Qualifications are matched by name: the ones that stay keep their id and
    // their applications; removed ones are deleted together with their applications.
    const submitted = new Map(
      req.body.qualifications.map(q => [String(q.name).trim(), Number(q.total)])
    );
    const existing = await tx.all(
      'SELECT id, name FROM project_qualification WHERE project_id = ?',
      [projectId]
    );
    for (const qualification of existing) {
      if (submitted.has(qualification.name)) {
        await tx.run(
          'UPDATE project_qualification SET total_slots = ? WHERE project_id = ? AND id = ?',
          [submitted.get(qualification.name), projectId, qualification.id]
        );
        submitted.delete(qualification.name);
      } else {
        await tx.run(
          'DELETE FROM application WHERE project_id = ? AND qualification_id = ?',
          [projectId, qualification.id]
        );
        await tx.run(
          'DELETE FROM project_qualification WHERE project_id = ? AND id = ?',
          [projectId, qualification.id]
        );
      }
    }
    for (const [name, total] of submitted) {
      await tx.run(INSERT_QUALIFICATION, [projectId, projectId, name, total]);
    }
    await recalculateFilledSlots(tx, projectId);
  });
  return res.json({ project: await getProject(projectId) });
}));

app.delete('/api/projects/:id', authRequired, handle(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await db.get(
    'SELECT id FROM project WHERE id = ? AND user_id = ?',
    [projectId, req.user.id]
  );
  if (!project) return sendError(res, 404, 'Projeto não encontrado.');

  // Explicit deletes: does not depend on the database enforcing ON DELETE CASCADE.
  await db.transaction(async tx => {
    await tx.run('DELETE FROM application WHERE project_id = ?', [projectId]);
    await tx.run('DELETE FROM project_qualification WHERE project_id = ?', [projectId]);
    await tx.run('DELETE FROM project WHERE id = ?', [projectId]);
  });
  return res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Admin (pages/admin.html): only lists and deletes people and projects.
// Enabled when ADMIN_PASSWORD_HASH (bcrypt) is set; the user name comes from
// ADMIN_USER (default "admin"). Admin tokens carry aud "admin" and no "sub",
// so they never work as a normal session and normal sessions never work here.
// ---------------------------------------------------------------------------

const ADMIN_USER = String(process.env.ADMIN_USER || 'admin').trim().toLowerCase();
const ADMIN_PASSWORD_HASH = String(process.env.ADMIN_PASSWORD_HASH || '').trim();

const adminRequired = (req, res, next) => {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  try {
    if (scheme !== 'Bearer' || !token) throw new Error('missing');
    const payload = jwt.verify(token, jwtSecret, { audience: 'admin' });
    if (payload.role !== 'admin') throw new Error('role');
    return next();
  } catch {
    return sendError(res, 401, 'Sessão de administrador inválida. Entre novamente.');
  }
};

app.post('/api/admin/login', handle(async (req, res) => {
  if (!ADMIN_PASSWORD_HASH) return sendError(res, 503, 'Painel de administrador desativado neste servidor.');
  const user = String(req.body.user || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  // Always runs bcrypt, so a wrong user name answers as slowly as a wrong password.
  const passwordOk = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (user !== ADMIN_USER || !passwordOk) return sendError(res, 401, 'Usuário ou senha incorretos.');
  const token = jwt.sign({ role: 'admin' }, jwtSecret, { audience: 'admin', expiresIn: '2h' });
  return res.json({ token });
}));

app.get('/api/admin/users', adminRequired, handle(async (_req, res) => {
  const users = await db.all(
    `SELECT u.id, u.nick, u.email, p.name, u.created_at AS createdAt,
            (SELECT COUNT(*) FROM project x WHERE x.user_id = u.id) AS projects,
            (SELECT COUNT(*) FROM application a WHERE a.user_id = u.id) AS applications
     FROM user u
     JOIN profile p ON p.id = u.id
     ORDER BY u.id DESC`
  );
  return res.json({ users });
}));

app.get('/api/admin/projects', adminRequired, handle(async (_req, res) => {
  const projects = await db.all(
    `SELECT x.id, x.name, x.created_at AS createdAt, u.nick AS ownerNick, p.name AS owner,
            (SELECT COUNT(*) FROM application a WHERE a.project_id = x.id) AS applications
     FROM project x
     JOIN user u ON u.id = x.user_id
     JOIN profile p ON p.id = u.id
     ORDER BY x.id DESC`
  );
  return res.json({ projects });
}));

/** Deletes a project with its vacancies and every application to it. */
async function deleteProjectCascade(tx, projectId) {
  await tx.run('DELETE FROM application WHERE project_id = ?', [projectId]);
  await tx.run('DELETE FROM project_qualification WHERE project_id = ?', [projectId]);
  await tx.run('DELETE FROM project WHERE id = ?', [projectId]);
}

app.delete('/api/admin/projects/:id', adminRequired, handle(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await db.get('SELECT id FROM project WHERE id = ?', [projectId]);
  if (!project) return sendError(res, 404, 'Projeto não encontrado.');
  await db.transaction(tx => deleteProjectCascade(tx, projectId));
  return res.status(204).end();
}));

/**
 * Deletes a person and everything tied to them: their projects (with the
 * applications they received), their own applications to other projects
 * (accepted ones give the vacancy back), verification codes and profile.
 */
app.delete('/api/admin/users/:id', adminRequired, handle(async (req, res) => {
  const userId = Number(req.params.id);
  const user = await db.get('SELECT id FROM user WHERE id = ?', [userId]);
  if (!user) return sendError(res, 404, 'Pessoa não encontrada.');

  await db.transaction(async tx => {
    const ownProjects = await tx.all('SELECT id FROM project WHERE user_id = ?', [userId]);
    for (const { id } of ownProjects) await deleteProjectCascade(tx, id);

    const appliedTo = await tx.all('SELECT DISTINCT project_id FROM application WHERE user_id = ?', [userId]);
    await tx.run('DELETE FROM application WHERE user_id = ?', [userId]);
    for (const { project_id: projectId } of appliedTo) await recalculateFilledSlots(tx, projectId);

    await tx.run('DELETE FROM email_code WHERE user_id = ?', [userId]);
    await tx.run('DELETE FROM profile WHERE id = ?', [userId]);
    await tx.run('DELETE FROM user WHERE id = ?', [userId]);
  });
  return res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------
app.post('/api/projects/:id/applications', authRequired, handle(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await db.get('SELECT id, user_id FROM project WHERE id = ?', [projectId]);
  if (!project) return sendError(res, 404, 'Projeto não encontrado.');
  if (project.user_id === req.user.id) {
    return sendError(res, 400, 'Você não pode se candidatar ao seu próprio projeto.');
  }

  const selected = Array.isArray(req.body.qualificationIds)
    ? [...new Set(req.body.qualificationIds.map(Number))]
    : [];
  if (selected.length > LIMITS.qualifications || !selected.every(Number.isInteger)) {
    return sendError(res, 400, 'Qualificação inválida para este projeto.');
  }

  if (!selected.length) {
    await db.transaction(async tx => {
      await tx.run(
        `DELETE FROM application
         WHERE project_id = ? AND user_id = ? AND status = 'pending'`,
        [projectId, req.user.id]
      );
      await recalculateFilledSlots(tx, projectId);
    });
    return res.status(200).json({ applications: [] });
  }

  const placeholders = selected.map(() => '?').join(',');
  const qualifications = await db.all(
    `SELECT id FROM project_qualification
     WHERE project_id = ? AND id IN (${placeholders})`,
    [projectId, ...selected]
  );
  if (qualifications.length !== selected.length) {
    return sendError(res, 400, 'Qualificação inválida para este projeto.');
  }

  const blockedQualification = await db.get(
    `SELECT qualification_id
     FROM application
     WHERE project_id = ? AND user_id = ?
       AND status IN ('rejected', 'accepted')
       AND qualification_id IN (${placeholders})
     LIMIT 1`,
    [projectId, req.user.id, ...selected]
  );
  if (blockedQualification) {
    return sendError(res, 409, 'Você não pode se candidatar de novo a uma qualificação já aprovada ou recusada.');
  }

  const applications = await db.transaction(async tx => {
    const pendingApplications = await tx.all(
      `SELECT id, qualification_id
       FROM application
       WHERE project_id = ? AND user_id = ? AND status = 'pending'`,
      [projectId, req.user.id]
    );
    const selectedSet = new Set(selected);

    for (const application of pendingApplications) {
      if (!selectedSet.has(application.qualification_id)) {
        await tx.run('DELETE FROM application WHERE project_id = ? AND id = ?', [projectId, application.id]);
      }
    }

    for (const qualificationId of selected) {
      await tx.run(
        `INSERT OR IGNORE INTO application
           (project_id, id, user_id, qualification_id, status)
         VALUES (?, (
           SELECT COALESCE(MAX(id), 0) + 1
           FROM application
           WHERE project_id = ?
         ), ?, ?, 'pending')`,
        [projectId, projectId, req.user.id, qualificationId]
      );
    }

    return tx.all(
      `SELECT id, qualification_id
       FROM application
       WHERE project_id = ? AND user_id = ? AND status = 'pending'
         AND qualification_id IN (${placeholders})`,
      [projectId, req.user.id, ...selected]
    );
  });

  return res.status(201).json({ applications });
}));

app.get('/api/projects/:id/my-application', authRequired, handle(async (req, res) => {
  const projectId = Number(req.params.id);
  const rows = await db.all(
    `SELECT id, qualification_id, status
     FROM application
     WHERE project_id = ? AND user_id = ?`,
    [projectId, req.user.id]
  );
  const pendingQualifications = rows.filter(row => row.status === 'pending');
  const rejectedQualifications = rows.filter(row => row.status === 'rejected');
  const acceptedQualifications = rows.filter(row => row.status === 'accepted');
  const applicationStatus = pendingQualifications.length
    ? 'pending'
    : acceptedQualifications.length
      ? 'accepted'
      : rejectedQualifications.length
        ? 'rejected'
        : null;
  const unique = list => [...new Set(list.map(row => row.qualification_id))];
  return res.json({
    application: {
      id: pendingQualifications[0]?.id || null,
      status: applicationStatus,
      qualificationIds: pendingQualifications.map(row => row.qualification_id),
      rejectedQualificationIds: unique(rejectedQualifications),
      acceptedQualificationIds: unique(acceptedQualifications),
    },
  });
}));

app.get('/api/projects/:id/applications', authRequired, handle(async (req, res) => {
  const projectId = Number(req.params.id);
  const project = await db.get(
    'SELECT id FROM project WHERE id = ? AND user_id = ?',
    [projectId, req.user.id]
  );
  if (!project) return sendError(res, 404, 'Projeto não encontrado.');

  const applications = await db.all(
    `SELECT a.id, a.status, a.created_at, u.id AS user_id, u.nick, p.name, u.email,
            pq.name AS qualification
     FROM application a
     JOIN user u ON u.id = a.user_id
     JOIN profile p ON p.id = u.id
     JOIN project_qualification pq
       ON pq.project_id = a.project_id
       AND pq.id = a.qualification_id
     WHERE a.project_id = ?
     ORDER BY a.created_at DESC, a.id DESC`,
    [projectId]
  );
  return res.json({ applications });
}));

app.patch('/api/projects/:projectId/applications/:applicationId', authRequired, handle(async (req, res) => {
  const projectId = Number(req.params.projectId);
  const applicationId = Number(req.params.applicationId);
  const status = String(req.body.status || '').trim().toLowerCase();
  if (!['pending', 'accepted', 'rejected'].includes(status)) {
    return sendError(res, 400, 'Status inválido.');
  }

  const application = await db.get(
    `SELECT a.id, a.status
     FROM application a
     JOIN project p ON p.id = a.project_id
     WHERE a.id = ? AND a.project_id = ? AND p.user_id = ?`,
    [applicationId, projectId, req.user.id]
  );
  if (!application) return sendError(res, 404, 'Candidatura não encontrada.');
  if (application.status === 'rejected' && status !== 'pending') {
    return sendError(res, 409, 'Candidaturas recusadas só podem voltar para pendente.');
  }

  try {
    await db.transaction(async tx => {
      if (status === 'accepted') {
        const qualification = await tx.get(
          `SELECT pq.id, pq.total_slots,
             (SELECT COUNT(*)
              FROM application a
              WHERE a.qualification_id = pq.id
                AND a.project_id = pq.project_id
                AND a.status = 'accepted'
                AND (a.project_id != ? OR a.id != ?)) AS filled
           FROM application app
           JOIN project_qualification pq
             ON pq.project_id = app.project_id
             AND pq.id = app.qualification_id
           WHERE app.project_id = ? AND app.id = ?`,
          [projectId, applicationId, projectId, applicationId]
        );
        if (qualification && qualification.filled >= qualification.total_slots) {
          throw new Error('Esta qualificação não tem mais vagas.');
        }
      }
      await tx.run(
        'UPDATE application SET status = ? WHERE project_id = ? AND id = ?',
        [status, projectId, applicationId]
      );
      await recalculateFilledSlots(tx, projectId);
    });
  } catch (error) {
    if (error.message.includes('não tem mais vagas')) {
      return sendError(res, 409, error.message);
    }
    throw error;
  }
  return res.json({ application: { id: applicationId, status } });
}));

// ---------------------------------------------------------------------------
// Fallbacks
// ---------------------------------------------------------------------------
app.use('/api', (_req, res) => sendError(res, 404, 'Não encontrado.'));
mountNotFoundPage(app, rootDir);

app.use((error, _req, res, _next) => {
  if (error.type === 'entity.too.large') return sendError(res, 413, 'Requisição grande demais.');
  if (error.type === 'entity.parse.failed') return sendError(res, 400, 'Requisição inválida.');
  console.error(error);
  return sendError(res, 500, 'Erro interno do servidor. Tente novamente.');
});

if (require.main === module) {
  ready
    .then(() => {
      if (process.argv.includes('--migrate')) {
        console.log(`Banco pronto (${db.kind}).`);
        return db.close();
      }
      app.listen(port, () => {
        console.log(`Open Teamwork em http://localhost:${port} (banco: ${db.kind})`);
      });
      // Keeps the Brevo API key from expiring (it is disabled after 90 days unused).
      if (mailer.kind === 'brevo') {
        mailer.keepKeyAlive();
        setInterval(() => mailer.keepKeyAlive(), 24 * 60 * 60_000).unref();
      }
    })
    .catch(error => {
      console.error('Falha ao preparar o banco de dados:', error);
      process.exit(1);
    });
}

module.exports = { app, db, ready, mailer };
