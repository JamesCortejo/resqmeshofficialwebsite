const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/env');

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });

const db = new sqlite3.Database(config.databasePath);
db.configure('busyTimeout', 5000);

function nowAsIso() {
  return new Date().toISOString();
}

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

async function listLegacyUserTables() {
  return all(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name LIKE 'users_legacy%'
    ORDER BY name
  `);
}

async function warnAboutLegacyUserTables() {
  const legacyTables = await listLegacyUserTables();

  if (legacyTables.length === 0) {
    return;
  }

  console.warn(
    `Legacy user migration tables found and ignored by the app: ${legacyTables.map((table) => table.name).join(', ')}`
  );
}

async function ensureAllowedUserStatuses() {
  const usersTableSql = await getTableSql('users');

  if (usersTableSql.includes("'admin'") && usersTableSql.includes("'suspended'")) {
    return;
  }

  const blockingLegacyTable = await getTableSql('users_legacy_status');

  if (blockingLegacyTable) {
    throw new Error(
      'Cannot rebuild users status constraint because users_legacy_status already exists. Run npm run audit:users and review the legacy table before restarting.'
    );
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
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'suspended', 'admin')),
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

async function ensureAllowedRescueTeamStatuses() {
  const rescueTeamsTableSql = await getTableSql('rescue_teams');

  if (rescueTeamsTableSql.includes("'dispatched'")) {
    return;
  }

  const blockingLegacyTable = await getTableSql('rescue_teams_legacy_status');

  if (blockingLegacyTable) {
    throw new Error(
      'Cannot rebuild rescue team status constraint because rescue_teams_legacy_status already exists. Review the legacy table before restarting.'
    );
  }

  await exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN TRANSACTION;

    ALTER TABLE rescue_teams RENAME TO rescue_teams_legacy_status;

    CREATE TABLE rescue_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      agency TEXT NOT NULL CHECK (agency IN ('cdrrmo', 'fire-department', 'police-department')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dispatched')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO rescue_teams (
      id,
      team_code,
      name,
      agency,
      status,
      created_at,
      updated_at
    )
    SELECT
      id,
      team_code,
      name,
      COALESCE(NULLIF(TRIM(agency), ''), 'cdrrmo'),
      status,
      created_at,
      updated_at
    FROM rescue_teams_legacy_status;

    DROP TABLE rescue_teams_legacy_status;

    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

async function ensureBootstrapSyncDevice() {
  const bootstrapConfig = config.deviceSync && config.deviceSync.bootstrapDevice
    ? config.deviceSync.bootstrapDevice
    : null;

  if (!bootstrapConfig || !bootstrapConfig.nodeId || !bootstrapConfig.apiKey) {
    return;
  }

  const crypto = require('crypto');
  const timestamp = nowAsIso();
  const apiKeyHash = crypto.createHash('sha256').update(String(bootstrapConfig.apiKey)).digest('hex');

  const existing = await get(`
    SELECT id, api_key_hash AS apiKeyHash
    FROM sync_devices
    WHERE node_id = ?
    LIMIT 1
  `, [bootstrapConfig.nodeId]);

  if (!existing) {
    await run(`
      INSERT INTO sync_devices (
        node_id,
        node_name,
        status,
        api_key_hash,
        allowed_ip,
        created_at,
        updated_at
      ) VALUES (?, ?, 'active', ?, ?, ?, ?)
    `, [
      bootstrapConfig.nodeId,
      bootstrapConfig.nodeName || bootstrapConfig.nodeId,
      apiKeyHash,
      bootstrapConfig.allowedIp || null,
      timestamp,
      timestamp
    ]);
    return;
  }

  if (existing.apiKeyHash !== apiKeyHash) {
    await run(`
      UPDATE sync_devices
      SET
        node_name = ?,
        status = 'active',
        api_key_hash = ?,
        allowed_ip = ?,
        updated_at = ?
      WHERE id = ?
    `, [
      bootstrapConfig.nodeName || bootstrapConfig.nodeId,
      apiKeyHash,
      bootstrapConfig.allowedIp || null,
      timestamp,
      existing.id
    ]);
  }
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

    CREATE TABLE IF NOT EXISTS rescuer_code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO rescuer_code_sequence (id, last_value)
    VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS rescue_team_code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO rescue_team_code_sequence (id, last_value)
    VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS deployment_code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO deployment_code_sequence (id, last_value)
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
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'suspended', 'admin')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

    CREATE TABLE IF NOT EXISTS rescue_teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      agency TEXT NOT NULL CHECK (agency IN ('cdrrmo', 'fire-department', 'police-department')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dispatched')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rescuers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rescuer_code TEXT NOT NULL UNIQUE,
      first_name_enc TEXT NOT NULL,
      middle_name_enc TEXT,
      last_name_enc TEXT NOT NULL,
      birth_date_enc TEXT NOT NULL,
      phone_enc TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      phone_lookup_hash TEXT NOT NULL UNIQUE,
      agency TEXT NOT NULL CHECK (agency IN ('cdrrmo', 'fire-department', 'police-department')),
      status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'dispatched', 'unavailable')),
      access_status TEXT NOT NULL DEFAULT 'active' CHECK (access_status IN ('active', 'archived')),
      archived_at TEXT,
      team_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (team_id) REFERENCES rescue_teams(id)
    );

    CREATE INDEX IF NOT EXISTS idx_rescuers_status ON rescuers (status);
    CREATE INDEX IF NOT EXISTS idx_rescuers_created_at ON rescuers (created_at);
    CREATE INDEX IF NOT EXISTS idx_rescuers_team_id ON rescuers (team_id);
    CREATE INDEX IF NOT EXISTS idx_rescue_teams_status ON rescue_teams (status);
    CREATE INDEX IF NOT EXISTS idx_rescue_teams_name ON rescue_teams (name);

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

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      principal_type TEXT NOT NULL,
      principal_id INTEGER NOT NULL,
      client_type TEXT NOT NULL,
      session_token_hash TEXT NOT NULL UNIQUE,
      csrf_secret TEXT,
      expires_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions (session_token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_principal ON auth_sessions (principal_type, principal_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at ON auth_sessions (revoked_at);

    CREATE TABLE IF NOT EXISTS sync_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL UNIQUE,
      node_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
      api_key_hash TEXT NOT NULL,
      allowed_ip TEXT,
      last_seen_at TEXT,
      last_sync_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sync_devices_status ON sync_devices (status);
    CREATE INDEX IF NOT EXISTS idx_sync_devices_last_sync ON sync_devices (last_sync_at);

    CREATE TABLE IF NOT EXISTS mesh_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL UNIQUE,
      node_name TEXT,
      latitude REAL,
      longitude REAL,
      status TEXT,
      last_seen_at TEXT,
      users_connected INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mesh_node_health_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL,
      battery_voltage REAL,
      signal_strength INTEGER,
      gps_status TEXT,
      cpu_temp REAL,
      storage_remaining INTEGER,
      ram_usage REAL,
      recorded_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (node_id, recorded_at)
    );

    CREATE TABLE IF NOT EXISTS mesh_distress_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin_node_id TEXT NOT NULL,
      origin_distress_id INTEGER NOT NULL,
      distress_code TEXT,
      user_code TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      blood_type TEXT,
      age INTEGER,
      node_id TEXT,
      reason TEXT,
      latitude REAL,
      longitude REAL,
      timestamp TEXT,
      status TEXT,
      priority TEXT,
      ack_received INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (origin_node_id, origin_distress_id)
    );

    CREATE TABLE IF NOT EXISTS distress_deployments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_code TEXT NOT NULL UNIQUE,
      mesh_distress_signal_id INTEGER NOT NULL,
      origin_node_id TEXT NOT NULL,
      origin_distress_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL,
      team_leader_rescuer_id INTEGER NOT NULL,
      created_by_admin_user_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('deployed', 'canceled', 'accomplished')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deployed_at TEXT,
      canceled_at TEXT,
      accomplished_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mesh_distress_signal_id) REFERENCES mesh_distress_signals(id),
      FOREIGN KEY (team_id) REFERENCES rescue_teams(id),
      FOREIGN KEY (team_leader_rescuer_id) REFERENCES rescuers(id),
      FOREIGN KEY (created_by_admin_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS distress_deployment_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id INTEGER NOT NULL,
      rescuer_id INTEGER NOT NULL,
      rescuer_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deployment_id) REFERENCES distress_deployments(id) ON DELETE CASCADE,
      FOREIGN KEY (rescuer_id) REFERENCES rescuers(id)
    );

    CREATE TABLE IF NOT EXISTS rescuer_locations_current (
      rescuer_id INTEGER PRIMARY KEY,
      deployment_id INTEGER,
      team_id INTEGER,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy_m REAL,
      heading_deg REAL,
      speed_mps REAL,
      node_id TEXT,
      recorded_at TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rescuer_id) REFERENCES rescuers(id),
      FOREIGN KEY (deployment_id) REFERENCES distress_deployments(id),
      FOREIGN KEY (team_id) REFERENCES rescue_teams(id)
    );

    CREATE TABLE IF NOT EXISTS rescuer_location_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rescuer_id INTEGER NOT NULL,
      deployment_id INTEGER,
      team_id INTEGER,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy_m REAL,
      heading_deg REAL,
      speed_mps REAL,
      node_id TEXT,
      recorded_at TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rescuer_id) REFERENCES rescuers(id),
      FOREIGN KEY (deployment_id) REFERENCES distress_deployments(id),
      FOREIGN KEY (team_id) REFERENCES rescue_teams(id)
    );

    CREATE TABLE IF NOT EXISTS deployment_route_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deployment_id INTEGER NOT NULL UNIQUE,
      leader_rescuer_id INTEGER NOT NULL,
      leader_recorded_at TEXT,
      destination_latitude REAL,
      destination_longitude REAL,
      distance_m REAL,
      duration_s REAL,
      eta_minutes INTEGER,
      geometry_json TEXT,
      provider TEXT NOT NULL DEFAULT 'openrouteservice',
      computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deployment_id) REFERENCES distress_deployments(id) ON DELETE CASCADE,
      FOREIGN KEY (leader_rescuer_id) REFERENCES rescuers(id)
    );

    CREATE TABLE IF NOT EXISTS mesh_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin_node_id TEXT NOT NULL,
      local_message_id INTEGER NOT NULL,
      message_code TEXT,
      msg_type TEXT,
      source_node_id TEXT,
      destination_node_id TEXT,
      conversation_node_id TEXT,
      sender_local_user_id INTEGER,
      sender_code TEXT,
      sender_first_name TEXT,
      sender_last_name TEXT,
      sender_role TEXT,
      content TEXT,
      status TEXT,
      priority TEXT,
      message_timestamp TEXT,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (origin_node_id, local_message_id)
    );

    CREATE TABLE IF NOT EXISTS mesh_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin_node_id TEXT NOT NULL,
      local_audit_id INTEGER NOT NULL,
      local_user_id INTEGER,
      user_code TEXT,
      user_role TEXT,
      user_first_name TEXT,
      user_last_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ip_address TEXT,
      event_timestamp TEXT,
      metadata_json TEXT,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (origin_node_id, local_audit_id)
    );

    CREATE TABLE IF NOT EXISTS mesh_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_node_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_mesh_nodes_updated_at ON mesh_nodes (updated_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_node_health_logs_recorded_at ON mesh_node_health_logs (recorded_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_distress_signals_updated_at ON mesh_distress_signals (updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_distress_deployments_active_unique
      ON distress_deployments(mesh_distress_signal_id)
      WHERE status = 'deployed';
    CREATE INDEX IF NOT EXISTS idx_distress_deployments_status ON distress_deployments (status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_distress_deployments_origin ON distress_deployments (origin_node_id, origin_distress_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_distress_deployment_members_deployment_id ON distress_deployment_members (deployment_id);
    CREATE INDEX IF NOT EXISTS idx_rescuer_locations_current_deployment_id ON rescuer_locations_current (deployment_id);
    CREATE INDEX IF NOT EXISTS idx_rescuer_locations_current_team_id ON rescuer_locations_current (team_id);
    CREATE INDEX IF NOT EXISTS idx_rescuer_location_history_rescuer_id ON rescuer_location_history (rescuer_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_deployment_route_snapshots_updated_at ON deployment_route_snapshots (updated_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_messages_timestamp ON mesh_messages (message_timestamp);
    CREATE INDEX IF NOT EXISTS idx_mesh_audit_logs_event_timestamp ON mesh_audit_logs (event_timestamp);
    CREATE INDEX IF NOT EXISTS idx_mesh_commands_target_status ON mesh_commands (target_node_id, status);
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

  await run(`
    INSERT OR IGNORE INTO rescue_team_code_sequence (id, last_value)
    VALUES (1, 0)
  `);

  await run(`
    INSERT OR IGNORE INTO deployment_code_sequence (id, last_value)
    VALUES (1, 0)
  `);

  if (!(await columnExists('rescuers', 'access_status'))) {
    await run("ALTER TABLE rescuers ADD COLUMN access_status TEXT NOT NULL DEFAULT 'active'");
    await run("UPDATE rescuers SET access_status = 'active' WHERE access_status IS NULL OR access_status = ''");
  }

  if (!(await columnExists('rescuers', 'archived_at'))) {
    await run('ALTER TABLE rescuers ADD COLUMN archived_at TEXT');
  }

  if (!(await columnExists('rescuers', 'password_hash'))) {
    await run('ALTER TABLE rescuers ADD COLUMN password_hash TEXT');
  }

  if (!(await columnExists('rescue_teams', 'agency'))) {
    await run('ALTER TABLE rescue_teams ADD COLUMN agency TEXT');
  }

  if (!(await columnExists('mesh_nodes', 'node_name')) && (await getTableSql('mesh_nodes'))) {
    await run('ALTER TABLE mesh_nodes ADD COLUMN node_name TEXT');
  }

  await run(`
    UPDATE mesh_distress_signals
    SET status = 'canceled'
    WHERE LOWER(COALESCE(status, '')) = 'cancelled'
  `);

  await run(`
    UPDATE rescue_teams
    SET agency = 'cdrrmo'
    WHERE agency IS NULL OR TRIM(agency) = ''
  `);

  await ensureAllowedUserStatuses();
  await ensureAllowedRescueTeamStatuses();
  await warnAboutLegacyUserTables();

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_number_lookup_hash
    ON users (id_number_lookup_hash);
    CREATE INDEX IF NOT EXISTS idx_rescuers_status ON rescuers (status);
    CREATE INDEX IF NOT EXISTS idx_rescuers_access_status ON rescuers (access_status);
    CREATE INDEX IF NOT EXISTS idx_rescuers_created_at ON rescuers (created_at);
    CREATE INDEX IF NOT EXISTS idx_rescuers_team_id ON rescuers (team_id);
    CREATE INDEX IF NOT EXISTS idx_rescue_teams_status ON rescue_teams (status);
    CREATE INDEX IF NOT EXISTS idx_rescue_teams_name ON rescue_teams (name);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications (read_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_hidden_at ON notifications (hidden_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions (session_token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_principal ON auth_sessions (principal_type, principal_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at ON auth_sessions (revoked_at);
    CREATE INDEX IF NOT EXISTS idx_sync_devices_status ON sync_devices (status);
    CREATE INDEX IF NOT EXISTS idx_sync_devices_last_sync ON sync_devices (last_sync_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_nodes_updated_at ON mesh_nodes (updated_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_node_health_logs_recorded_at ON mesh_node_health_logs (recorded_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_distress_signals_updated_at ON mesh_distress_signals (updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_distress_deployments_active_unique
      ON distress_deployments(mesh_distress_signal_id)
      WHERE status = 'deployed';
    CREATE INDEX IF NOT EXISTS idx_distress_deployments_status ON distress_deployments (status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_distress_deployments_origin ON distress_deployments (origin_node_id, origin_distress_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_distress_deployment_members_deployment_id ON distress_deployment_members (deployment_id);
    CREATE INDEX IF NOT EXISTS idx_rescuer_locations_current_deployment_id ON rescuer_locations_current (deployment_id);
    CREATE INDEX IF NOT EXISTS idx_rescuer_locations_current_team_id ON rescuer_locations_current (team_id);
    CREATE INDEX IF NOT EXISTS idx_rescuer_location_history_rescuer_id ON rescuer_location_history (rescuer_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_deployment_route_snapshots_updated_at ON deployment_route_snapshots (updated_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_messages_timestamp ON mesh_messages (message_timestamp);
    CREATE INDEX IF NOT EXISTS idx_mesh_audit_logs_event_timestamp ON mesh_audit_logs (event_timestamp);
    CREATE INDEX IF NOT EXISTS idx_mesh_commands_target_status ON mesh_commands (target_node_id, status);
  `);

  await ensureBootstrapSyncDevice();
}

module.exports = {
  db,
  run,
  get,
  all,
  exec,
  initializeDatabase
};
