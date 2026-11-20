'use strict';

/**
 * Database access with ONE async interface and two drivers:
 *
 *  - local SQLite file (better-sqlite3): used for development and tests;
 *  - Turso / libSQL over the network (@libsql/client): used in production,
 *    because free web hosts have an ephemeral disk (a local file would be
 *    erased on every restart) and Turso's free plan is a persistent
 *    SQLite-compatible database.
 *
 * The driver is chosen by the environment: when TURSO_DATABASE_URL is set the
 * app uses Turso, otherwise it uses the local file in DATABASE_FILE.
 *
 * Interface (every method returns a Promise):
 *   get(sql, args)      -> first row or undefined
 *   all(sql, args)      -> array of rows
 *   run(sql, args)      -> { changes, lastInsertRowid }
 *   transaction(fn)     -> fn(tx) where tx has get/all/run; commits or rolls back
 *   init()              -> creates / upgrades the schema
 */

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_FILE = path.join(__dirname, '..', 'db', 'schema.sql');

/**
 * Splits a .sql file into single statements (schema.sql has no triggers).
 * @param {string} sql
 * @returns {string[]}
 */
function splitStatements(sql) {
  return sql
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;[ \t]*(?:\r?\n|$)/)
    .map(statement => statement.trim())
    .filter(Boolean);
}

/**
 * Unique index + validation/immutability triggers for the nick. They live here,
 * not in schema.sql, because splitStatements() cannot split trigger bodies.
 * @param {object} db Any driver of this module.
 */
async function ensureNickConstraints(db) {
  await db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_user_nick ON user(nick)');
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS user_nick_valid_insert
    BEFORE INSERT ON user
    WHEN NEW.nick IS NULL
      OR length(NEW.nick) < 3
      OR length(NEW.nick) > 20
      OR NEW.nick GLOB '*[^a-z0-9_]*'
    BEGIN
      SELECT RAISE(ABORT, 'invalid nick');
    END
  `);
  await db.run(`
    CREATE TRIGGER IF NOT EXISTS user_nick_immutable
    BEFORE UPDATE OF nick ON user
    WHEN OLD.nick IS NOT NULL AND NEW.nick IS NOT OLD.nick
    BEGIN
      SELECT RAISE(ABORT, 'nick is immutable');
    END
  `);
}

/**
 * Adds user.email_verified_at to databases created before e-mail verification
 * existed. Accounts that already existed are marked as verified, once: the
 * column is only added (and filled) when it is missing.
 * @param {object} db Any driver of this module.
 */
async function ensureEmailVerification(db) {
  const columns = await db.all('PRAGMA table_info(user)');
  if (columns.some(column => column.name === 'email_verified_at')) return;
  await db.run('ALTER TABLE user ADD COLUMN email_verified_at TEXT');
  await db.run('UPDATE user SET email_verified_at = CURRENT_TIMESTAMP');
}

// ---------------------------------------------------------------------------
// Driver 1: local SQLite file
// ---------------------------------------------------------------------------
function createLocalDb({ rootDir, env }) {
  const Database = require('better-sqlite3');
  const file = path.resolve(rootDir, env.DATABASE_FILE || './data/open-teamwork.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const raw = new Database(file);
  raw.pragma('foreign_keys = ON');

  // Transactions never overlap: the next one waits for the previous to finish.
  let queue = Promise.resolve();

  const db = {
    kind: 'sqlite',

    async get(sql, args = []) {
      return raw.prepare(sql).get(...args);
    },
    async all(sql, args = []) {
      return raw.prepare(sql).all(...args);
    },
    async run(sql, args = []) {
      const result = raw.prepare(sql).run(...args);
      return { changes: result.changes, lastInsertRowid: Number(result.lastInsertRowid) };
    },
    transaction(fn) {
      const result = queue.then(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const value = await fn(db);
          raw.exec('COMMIT');
          return value;
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      });
      queue = result.catch(() => {});
      return result;
    },

    async init() {
      raw.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
      await ensureNickConstraints(db);
      await ensureEmailVerification(db);
    },

    async close() {
      raw.close();
    },
  };
  return db;
}

// ---------------------------------------------------------------------------
// Driver 2: Turso / libSQL (persistent, free plan, no credit card)
// ---------------------------------------------------------------------------
function createTursoDb({ env }) {
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  const toObject = (result, row) => {
    const object = {};
    result.columns.forEach((column, index) => {
      const value = row[index];
      object[column] = typeof value === 'bigint' ? Number(value) : value;
    });
    return object;
  };

  /** Builds get/all/run on top of a client or of an open transaction. */
  const bind = executor => {
    const all = async (sql, args = []) => {
      const result = await executor.execute({ sql, args });
      return result.rows.map(row => toObject(result, row));
    };
    return {
      all,
      async get(sql, args = []) {
        return (await all(sql, args))[0];
      },
      async run(sql, args = []) {
        const result = await executor.execute({ sql, args });
        return {
          changes: result.rowsAffected,
          lastInsertRowid: result.lastInsertRowid == null ? 0 : Number(result.lastInsertRowid),
        };
      },
    };
  };

  const db = {
    kind: 'turso',
    ...bind(client),

    async transaction(fn) {
      const tx = await client.transaction('write');
      try {
        const value = await fn(bind(tx));
        await tx.commit();
        return value;
      } catch (error) {
        try {
          await tx.rollback();
        } catch {
          // The original error is the one that matters.
        }
        throw error;
      } finally {
        tx.close();
      }
    },

    async init() {
      const statements = splitStatements(fs.readFileSync(SCHEMA_FILE, 'utf8'))
        // Connections are created per request: PRAGMA would not persist.
        .filter(statement => !/^PRAGMA/i.test(statement));
      await client.batch(statements, 'write');
      await ensureNickConstraints(db);
      await ensureEmailVerification(db);
    },

    async close() {
      client.close();
    },
  };
  return db;
}

/**
 * @param {{ rootDir: string, env?: NodeJS.ProcessEnv }} options
 */
function createDb({ rootDir, env = process.env }) {
  return env.TURSO_DATABASE_URL ? createTursoDb({ env }) : createLocalDb({ rootDir, env });
}

module.exports = { createDb, splitStatements };
