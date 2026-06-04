const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/env');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new sqlite3.Database(config.databasePath);

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
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
  `);

  if (!(await columnExists('users', 'id_number_lookup_hash'))) {
    await run('ALTER TABLE users ADD COLUMN id_number_lookup_hash TEXT');
    await run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_number_lookup_hash
      ON users (id_number_lookup_hash)
      WHERE id_number_lookup_hash IS NOT NULL
    `);
  }
}

module.exports = {
  db,
  run,
  get,
  all,
  exec,
  initializeDatabase
};
