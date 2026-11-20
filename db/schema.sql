PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- Public, unique and immutable handle. Uniqueness (index) and immutability
  -- (trigger) are created by ensureNickConstraints() in lib/db.js.
  nick TEXT COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  -- NULL until the person types the code sent to the e-mail. Databases created
  -- before this column get it from ensureEmailVerification() in lib/db.js.
  email_verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One-time 6-digit codes sent by e-mail (account check or password reset).
-- Only a keyed hash of the code is stored. Times are Unix milliseconds.
CREATE TABLE IF NOT EXISTS email_code (
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, purpose)
);

CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  contact_email TEXT,
  phone TEXT,
  bio TEXT,
  avatar_url TEXT,
  github_url TEXT,
  linkedin_url TEXT,
  website_url TEXT
);

CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_qualification (
  id INTEGER NOT NULL,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_slots INTEGER NOT NULL CHECK (total_slots > 0),
  filled_slots INTEGER NOT NULL DEFAULT 0 CHECK (filled_slots >= 0),
  PRIMARY KEY (project_id, id),
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS application (
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
);

CREATE INDEX IF NOT EXISTS idx_project_user_id ON project(user_id);
CREATE INDEX IF NOT EXISTS idx_application_project_id ON application(project_id);
