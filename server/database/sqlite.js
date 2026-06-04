const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/env');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new sqlite3.Database(config.databasePath);
db.configure('busyTimeout', 5000);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function columnExists(tableName, columnName) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  return columns.some((column) => column.name === columnName);
}

async function getTableSql(tableName) {
  const row = await get(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName]
  );

  return row && row.sql ? row.sql : '';
}

async function ensureAdminStatusAllowed() {
  const usersTableSql = await getTableSql('users');

  if (usersTableSql.includes("'admin'")) {
    return;
  }

  await exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE users RENAME TO users_legacy_status;

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_code TEXT NOT NULL UNIQUE,
      first_name_enc TEXT NOT NULL,
      middle_name_enc TEXT,
      last_name_enc TEXT NOT NULL,
      birth_date_enc TEXT,
      username_enc TEXT NOT NULL,
      username_lookup_hash TEXT NOT NULL UNIQUE,
      street_address_enc TEXT NOT NULL,
      barangay_enc TEXT NOT NULL,
      occupation_enc TEXT NOT NULL,
      blood_type_enc TEXT NOT NULL,
      medical_complications_enc TEXT,
      allergies_enc TEXT,
      email_enc TEXT NOT NULL,
      email_lookup_hash TEXT NOT NULL UNIQUE,
      phone_enc TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      id_type_enc TEXT NOT NULL,
      id_number_enc TEXT NOT NULL,
      id_number_lookup_hash TEXT NOT NULL UNIQUE,
      front_id_image_path TEXT NOT NULL,
      front_id_original_name TEXT NOT NULL,
      front_id_mime_type TEXT NOT NULL,
      front_id_original_size INTEGER NOT NULL,
      front_id_encrypted_size INTEGER NOT NULL,
      back_id_image_path TEXT NOT NULL,
      back_id_original_name TEXT NOT NULL,
      back_id_mime_type TEXT NOT NULL,
      back_id_original_size INTEGER NOT NULL,
      back_id_encrypted_size INTEGER NOT NULL,
      review_reason_enc TEXT,
      reviewed_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'admin')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO users (
      id,
      user_code,
      first_name_enc,
      middle_name_enc,
      last_name_enc,
      birth_date_enc,
      username_enc,
      username_lookup_hash,
      street_address_enc,
      barangay_enc,
      occupation_enc,
      blood_type_enc,
      medical_complications_enc,
      allergies_enc,
      email_enc,
      email_lookup_hash,
      phone_enc,
      password_hash,
      id_type_enc,
      id_number_enc,
      id_number_lookup_hash,
      front_id_image_path,
      front_id_original_name,
      front_id_mime_type,
      front_id_original_size,
      front_id_encrypted_size,
      back_id_image_path,
      back_id_original_name,
      back_id_mime_type,
      back_id_original_size,
      back_id_encrypted_size,
      review_reason_enc,
      reviewed_at,
      status,
      created_at,
      updated_at
    )
    SELECT
      id,
      user_code,
      first_name_enc,
      middle_name_enc,
      last_name_enc,
      birth_date_enc,
      username_enc,
      username_lookup_hash,
      street_address_enc,
      barangay_enc,
      occupation_enc,
      blood_type_enc,
      medical_complications_enc,
      allergies_enc,
      email_enc,
      email_lookup_hash,
      phone_enc,
      password_hash,
      id_type_enc,
      id_number_enc,
      id_number_lookup_hash,
      front_id_image_path,
      front_id_original_name,
      front_id_mime_type,
      front_id_original_size,
      front_id_encrypted_size,
      back_id_image_path,
      back_id_original_name,
      back_id_mime_type,
      back_id_original_size,
      back_id_encrypted_size,
      review_reason_enc,
      reviewed_at,
      status,
      created_at,
      updated_at
    FROM users_legacy_status;

    DROP TABLE users_legacy_status;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

async function initializeDatabase() {
  await exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO code_sequence (id, last_value)
    VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_code TEXT NOT NULL UNIQUE,
      first_name_enc TEXT NOT NULL,
      middle_name_enc TEXT,
      last_name_enc TEXT NOT NULL,
      birth_date_enc TEXT,
      username_enc TEXT NOT NULL,
      username_lookup_hash TEXT NOT NULL UNIQUE,
      street_address_enc TEXT NOT NULL,
      barangay_enc TEXT NOT NULL,
      occupation_enc TEXT NOT NULL,
      blood_type_enc TEXT NOT NULL,
      medical_complications_enc TEXT,
      allergies_enc TEXT,
      email_enc TEXT NOT NULL,
      email_lookup_hash TEXT NOT NULL UNIQUE,
      phone_enc TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      id_type_enc TEXT NOT NULL,
      id_number_enc TEXT NOT NULL,
      id_number_lookup_hash TEXT NOT NULL UNIQUE,
      front_id_image_path TEXT NOT NULL,
      front_id_original_name TEXT NOT NULL,
      front_id_mime_type TEXT NOT NULL,
      front_id_original_size INTEGER NOT NULL,
      front_id_encrypted_size INTEGER NOT NULL,
      back_id_image_path TEXT NOT NULL,
      back_id_original_name TEXT NOT NULL,
      back_id_mime_type TEXT NOT NULL,
      back_id_original_size INTEGER NOT NULL,
      back_id_encrypted_size INTEGER NOT NULL,
      review_reason_enc TEXT,
      reviewed_at TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'admin')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_entity_type TEXT,
      related_entity_id INTEGER,
      related_entity_code TEXT,
      metadata_json TEXT,
      read_at TEXT,
      hidden_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications (read_at);
  `);

  if (!(await columnExists('users', 'id_number_lookup_hash'))) {
    await run('ALTER TABLE users ADD COLUMN id_number_lookup_hash TEXT');
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_number_lookup_hash
      ON users (id_number_lookup_hash)
      WHERE id_number_lookup_hash IS NOT NULL
    `);
  }

  if (!(await columnExists('users', 'birth_date_enc'))) {
    await run('ALTER TABLE users ADD COLUMN birth_date_enc TEXT');
  }

  if (!(await columnExists('users', 'review_reason_enc'))) {
    await run('ALTER TABLE users ADD COLUMN review_reason_enc TEXT');
  }

  if (!(await columnExists('users', 'reviewed_at'))) {
    await run('ALTER TABLE users ADD COLUMN reviewed_at TEXT');
  }

  if (!(await columnExists('notifications', 'hidden_at'))) {
    await run('ALTER TABLE notifications ADD COLUMN hidden_at TEXT');
  }

  await ensureAdminStatusAllowed();

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_number_lookup_hash
    ON users (id_number_lookup_hash);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications (read_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_hidden_at ON notifications (hidden_at);
  `);
}

module.exports = {
  db,
  run,
  get,
  all,
  exec,
  initializeDatabase
};
