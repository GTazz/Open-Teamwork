'use strict';

/**
 * One-off upgrades for SQLite files created by OLD versions of the prototype
 * (Portuguese table names, composite keys, name moved to the profile table).
 *
 * They only run for the local SQLite driver. A brand-new database (for example
 * the free Turso database used in production) is created directly from
 * db/schema.sql and never needs them.
 *
 * @param {import('better-sqlite3').Database} db
 */
function runLegacyMigrations(db) {
  function migrateProfileNameSchema() {
    const userColumns = db.prepare('PRAGMA table_info(user)').all();
    if (!userColumns.some(column => column.name === 'name')) return;

    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        ALTER TABLE profile ADD COLUMN name TEXT NOT NULL DEFAULT '';
        UPDATE profile
        SET name = (
          SELECT u.name FROM user u WHERE u.id = profile.id
        )
        WHERE EXISTS (SELECT 1 FROM user u WHERE u.id = profile.id);
        ALTER TABLE user RENAME TO user_legacy;
        CREATE TABLE user (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO user (id, email, password_hash, created_at)
        SELECT id, email, password_hash, created_at FROM user_legacy;
        DROP TABLE user_legacy;
      `);
    })();
    db.pragma('foreign_keys = ON');
  }


  function migrateCompositeKeysSchema() {
    const qualificationColumns = db.prepare('PRAGMA table_info(project_qualification)').all();
    const qualificationIsComposite = qualificationColumns.some(
      column => column.name === 'project_id' && column.pk > 0
    ) && qualificationColumns.some(column => column.name === 'id' && column.pk > 1);
    const applicationColumns = db.prepare('PRAGMA table_info(application)').all();
    const applicationIsComposite = applicationColumns.some(
      column => column.name === 'project_id' && column.pk > 0
    ) && applicationColumns.some(column => column.name === 'id' && column.pk > 1);
    if (qualificationIsComposite && applicationIsComposite) return;

    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      const legacyQualifications = db.prepare(`
        SELECT id, project_id, name, total_slots, filled_slots
        FROM project_qualification
        ORDER BY project_id, id
      `).all();
      const qualificationMap = new Map();
      const counters = new Map();
      legacyQualifications.forEach(q => {
        const nextId = (counters.get(q.project_id) || 0) + 1;
        counters.set(q.project_id, nextId);
        qualificationMap.set(`${q.project_id}:${q.id}`, {
          id: nextId,
          projectId: q.project_id,
          name: q.name,
          totalSlots: q.total_slots,
          filledSlots: q.filled_slots,
        });
      });

      if (!qualificationIsComposite) {
        db.exec('ALTER TABLE project_qualification RENAME TO project_qualification_legacy');
        db.exec(`
          CREATE TABLE project_qualification (
            id INTEGER NOT NULL,
            project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            total_slots INTEGER NOT NULL CHECK (total_slots > 0),
            filled_slots INTEGER NOT NULL DEFAULT 0 CHECK (filled_slots >= 0),
            PRIMARY KEY (project_id, id),
            UNIQUE (project_id, name)
          )
        `);
        const insertQualification = db.prepare(`
          INSERT INTO project_qualification
            (id, project_id, name, total_slots, filled_slots)
          VALUES (?, ?, ?, ?, ?)
        `);
        qualificationMap.forEach(q => {
          insertQualification.run(q.id, q.projectId, q.name, q.totalSlots, q.filledSlots);
        });
        db.exec('DROP TABLE project_qualification_legacy');
      }

      if (!applicationIsComposite) {
        const legacyJoinTable = db.prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'application_qualification'"
        ).get();
        let legacyApplications;
        if (legacyJoinTable) {
          legacyApplications = db.prepare(`
            SELECT a.id, a.project_id, a.user_id, aq.qualification_id,
              a.status, a.created_at
            FROM application a
            JOIN application_qualification aq ON aq.application_id = a.id
            ORDER BY a.project_id, a.id
          `).all();
        } else {
          legacyApplications = db.prepare(`
            SELECT id, project_id, user_id, qualification_id, status, created_at
            FROM application
            ORDER BY project_id, id
          `).all();
        }

        db.exec('ALTER TABLE application RENAME TO application_legacy');
        db.exec(`
          CREATE TABLE application (
            project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
            id INTEGER NOT NULL,
            user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
            qualification_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (project_id, id),
            UNIQUE (project_id, user_id, qualification_id),
            FOREIGN KEY (project_id, qualification_id)
              REFERENCES project_qualification(project_id, id) ON DELETE CASCADE
          )
        `);
        const applicationCounters = new Map();
        const seen = new Set();
        const insertApplication = db.prepare(`
          INSERT INTO application
            (project_id, id, user_id, qualification_id, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        legacyApplications.forEach(application => {
          const qualification = qualificationMap.get(
            `${application.project_id}:${application.qualification_id}`
          );
          if (!qualification) return;
          const key = `${application.project_id}:${application.user_id}:${qualification.id}`;
          if (seen.has(key)) return;
          seen.add(key);
          const nextId = (applicationCounters.get(application.project_id) || 0) + 1;
          applicationCounters.set(application.project_id, nextId);
          insertApplication.run(
            application.project_id,
            nextId,
            application.user_id,
            qualification.id,
            application.status,
            application.created_at
          );
        });
        db.exec('DROP TABLE application_legacy');
        if (legacyJoinTable) db.exec('DROP TABLE application_qualification');
      }
    })();
    db.pragma('foreign_keys = ON');
  }


  function migrateLegacySchema() {
    const legacyUserTable = db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usuario'"
    ).get();
    if (!legacyUserTable) return;

    db.pragma('foreign_keys = OFF');
    db.transaction(() => {
      db.exec(`
        INSERT OR IGNORE INTO user (id, email, password_hash, created_at)
        SELECT id, email, senha_hash, created_at FROM usuario
        WHERE id NOT IN (SELECT id FROM user);

        INSERT OR IGNORE INTO profile
          (id, name, contact_email, phone, bio, avatar_url, github_url, linkedin_url, website_url)
        SELECT id, nome, email_contato, telefone, bio, avatar_url, github_url, linkedin_url, website_url
        FROM perfil;

        INSERT OR IGNORE INTO project
          (id, user_id, name, description, url, tags, created_at)
        SELECT id, user_id, nome, descricao, url, tags, created_at FROM projeto;

        INSERT OR IGNORE INTO project_qualification
          (id, project_id, name, total_slots, filled_slots)
        SELECT (
          SELECT COALESCE(MAX(pq.id), 0) + 1
          FROM project_qualification pq
          WHERE pq.project_id = vaga_qualificacao.project_id
        ), project_id, nome_qualificacao, total_vagas, vagas_preenchidas
        FROM vaga_qualificacao;

        INSERT OR IGNORE INTO application
          (project_id, id, user_id, qualification_id, status, created_at)
        SELECT DISTINCT ins.project_id,
          (
            SELECT COALESCE(MAX(a.id), 0) + 1
            FROM application a
            WHERE a.project_id = ins.project_id
          ),
          ins.user_id, iq.qualificacao_id,
          CASE ins.status
            WHEN 'aceita' THEN 'accepted'
            WHEN 'recusada' THEN 'rejected'
            ELSE 'pending'
          END,
          ins.created_at
        FROM inscricao ins
        JOIN inscricao_qualificacao iq ON iq.inscricao_id = ins.id;
      `);
    })();
    db.pragma('foreign_keys = ON');
  }

  migrateProfileNameSchema();
  migrateCompositeKeysSchema();
  migrateLegacySchema();
}

module.exports = { runLegacyMigrations };
