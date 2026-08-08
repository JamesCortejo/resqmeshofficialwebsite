const { Pool, types } = require('pg');
const config = require('../config/env');
const { prepareSql } = require('./sqlCompat');
const { hashApiKey, decryptText, lookupHash } = require('./securityHelpers');

types.setTypeParser(1082, (value) => value);
types.setTypeParser(1114, (value) => new Date(`${value}Z`).toISOString());
types.setTypeParser(1184, (value) => new Date(value).toISOString());
types.setTypeParser(20, (value) => Number(value));

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'UTC'").catch((error) => {
    console.error('Failed to set PostgreSQL timezone:', error);
  });
});

function createHelpers(client) {
  async function run(sql, params = []) {
    const result = await client.query(prepareSql(sql), params);
    const firstRow = result.rows && result.rows[0] ? result.rows[0] : null;

    return {
      lastID: firstRow ? firstRow.id || firstRow.lastID || firstRow.lastid : undefined,
      changes: result.rowCount,
      rows: result.rows
    };
  }

  async function get(sql, params = []) {
    const result = await client.query(prepareSql(sql), params);
    return result.rows[0];
  }

  async function all(sql, params = []) {
    const result = await client.query(prepareSql(sql), params);
    return result.rows;
  }

  async function exec(sql) {
    await client.query(sql);
  }

  return { run, get, all, exec };
}

async function withClient(callback) {
  const client = await pool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

async function run(sql, params = []) {
  return withClient((client) => createHelpers(client).run(sql, params));
}

async function get(sql, params = []) {
  return withClient((client) => createHelpers(client).get(sql, params));
}

async function all(sql, params = []) {
  return withClient((client) => createHelpers(client).all(sql, params));
}

async function exec(sql) {
  return withClient((client) => createHelpers(client).exec(sql));
}

async function transaction(callback) {
  return withClient(async (client) => {
    const helpers = createHelpers(client);

    await client.query('BEGIN');

    try {
      const result = await callback(helpers);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}



async function ensureSequenceTables() {
  await exec(`
    INSERT INTO code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO rescuer_code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO rescue_team_code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO deployment_code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO online_distress_code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function cleanupLegacySeededOnlineChatDepartments() {
  const defaults = [
    'global-announcements',
    'cdrrmo',
    'police-station',
    'fire-department',
    'admin-support'
  ];

  const [departmentRows, conversationCountRow, messageCountRow] = await Promise.all([
    all(`
      SELECT id, slug
      FROM online_chat_departments
      ORDER BY id ASC
    `),
    get('SELECT COUNT(*) AS count FROM online_chat_conversations'),
    get('SELECT COUNT(*) AS count FROM online_chat_messages')
  ]);

  const conversationCount = Number(conversationCountRow?.count || 0);
  const messageCount = Number(messageCountRow?.count || 0);

  if (conversationCount > 0 || messageCount > 0) {
    return;
  }

  if (!departmentRows.length || departmentRows.length > defaults.length) {
    return;
  }

  const slugs = departmentRows.map((row) => row.slug);
  const onlyLegacyDefaults = slugs.every((slug) => defaults.includes(slug));

  if (!onlyLegacyDefaults) {
    return;
  }

  await run(`
    DELETE FROM online_chat_departments
    WHERE slug IN (?, ?, ?, ?, ?)
  `, defaults);
}

async function ensureBootstrapSyncDevice() {
  const device = config.deviceSync.bootstrapDevice;

  if (!device.nodeId || !device.nodeName || !device.apiKey) {
    return;
  }

  await run(`
    INSERT INTO sync_devices (
      node_id,
      node_name,
      status,
      api_key_hash,
      allowed_ip,
      created_at,
      updated_at
    ) VALUES (?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(node_id) DO UPDATE SET
      node_name = excluded.node_name,
      allowed_ip = excluded.allowed_ip,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `, [
    device.nodeId,
    device.nodeName,
    hashApiKey(device.apiKey),
    device.allowedIp
  ]);
}

async function reconcileDeploymentOperationalStatuses() {
  await exec(`
    UPDATE rescue_teams
    SET status = 'dispatched',
        updated_at = CURRENT_TIMESTAMP
    WHERE EXISTS (
      SELECT 1
      FROM distress_deployments d
      WHERE d.team_id = rescue_teams.id
        AND d.status = 'deployed'
    )
      AND status <> 'dispatched';

    UPDATE rescue_teams
    SET status = 'active',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'dispatched'
      AND NOT EXISTS (
        SELECT 1
        FROM distress_deployments d
        WHERE d.team_id = rescue_teams.id
          AND d.status = 'deployed'
      );

    UPDATE rescuers
    SET status = 'dispatched',
        updated_at = CURRENT_TIMESTAMP
    WHERE access_status = 'active'
      AND status <> 'dispatched'
      AND EXISTS (
        SELECT 1
        FROM distress_deployment_members dm
        INNER JOIN distress_deployments d ON d.id = dm.deployment_id
        WHERE dm.rescuer_id = rescuers.id
          AND d.status = 'deployed'
      );

    UPDATE rescuers
    SET status = 'available',
        updated_at = CURRENT_TIMESTAMP
    WHERE access_status = 'active'
      AND status = 'dispatched'
      AND NOT EXISTS (
        SELECT 1
        FROM distress_deployment_members dm
        INNER JOIN distress_deployments d ON d.id = dm.deployment_id
        WHERE dm.rescuer_id = rescuers.id
          AND d.status = 'deployed'
      );
  `);
}

async function ensurePostgresColumnTypes() {
  await exec(`
    ALTER TABLE mesh_audit_logs
      ALTER COLUMN local_audit_id TYPE BIGINT;
  `);
}

async function ensureUserPhoneLookupHashes() {
  await exec(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS phone_lookup_hash TEXT;
  `);

  const rows = await all(`
    SELECT id, phone_enc AS "phoneEnc"
    FROM users
    WHERE phone_lookup_hash IS NULL OR phone_lookup_hash = ''
  `);

  for (const row of rows) {
    const phone = decryptText(row.phoneEnc);

    if (!phone) {
      continue;
    }

    await run(`
      UPDATE users
      SET phone_lookup_hash = ?
      WHERE id = ?
    `, [lookupHash(phone), row.id]);
  }

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_users_phone_lookup_hash
      ON users (phone_lookup_hash);
  `);
}

async function ensureAccountAccessAuditBaseline() {
  await run(`
    INSERT INTO account_access_audit_logs (
      subject_type,
      subject_id,
      subject_code,
      action_type,
      actor_admin_id,
      reason_text,
      metadata_json,
      occurred_at,
      created_at
    )
    SELECT
      'civilian',
      u.id,
      u.user_code,
      'registered',
      NULL,
      NULL,
      json_build_object('seededBaseline', true)::text,
      u.created_at,
      CURRENT_TIMESTAMP
    FROM users u
    WHERE u.status <> 'admin'
      AND NOT EXISTS (
        SELECT 1
        FROM account_access_audit_logs aal
        WHERE aal.subject_type = 'civilian'
          AND aal.subject_id = u.id
          AND aal.action_type = 'registered'
      )
  `);

  await run(`
    INSERT INTO account_access_audit_logs (
      subject_type,
      subject_id,
      subject_code,
      action_type,
      actor_admin_id,
      reason_text,
      metadata_json,
      occurred_at,
      created_at
    )
    SELECT
      'rescuer',
      r.id,
      r.rescuer_code,
      'rescuer_created',
      NULL,
      NULL,
      json_build_object('seededBaseline', true)::text,
      r.created_at,
      CURRENT_TIMESTAMP
    FROM rescuers r
    WHERE NOT EXISTS (
      SELECT 1
      FROM account_access_audit_logs aal
      WHERE aal.subject_type = 'rescuer'
        AND aal.subject_id = r.id
        AND aal.action_type = 'rescuer_created'
    )
  `);
}

async function initializeDatabase() {
  await exec(`
    CREATE TABLE IF NOT EXISTS code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rescuer_code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rescue_team_code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deployment_code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS online_distress_code_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_value INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
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
      phone_lookup_hash TEXT,
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
      reviewed_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'suspended', 'admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rescue_teams (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      team_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      agency TEXT NOT NULL CHECK (agency IN ('cdrrmo', 'fire-department', 'police-department')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dispatched')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rescuers (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
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
      archived_at TIMESTAMPTZ,
      team_id INTEGER REFERENCES rescue_teams(id),
      previous_team_id INTEGER REFERENCES rescue_teams(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      related_entity_type TEXT,
      related_entity_id INTEGER,
      related_entity_code TEXT,
      metadata_json TEXT,
      read_at TIMESTAMPTZ,
      hidden_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      principal_type TEXT NOT NULL,
      principal_id INTEGER NOT NULL,
      client_type TEXT NOT NULL,
      session_token_hash TEXT NOT NULL UNIQUE,
      csrf_secret TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TIMESTAMPTZ,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS civilian_password_reset_codes (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      email_lookup_hash TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      verified_at TIMESTAMPTZ,
      reset_token_hash TEXT,
      reset_token_expires_at TIMESTAMPTZ,
      used_at TIMESTAMPTZ,
      request_ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mobile_push_registrations (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('civilian', 'rescuer')),
      actor_id INTEGER NOT NULL,
      push_token TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'unknown',
      app_version TEXT,
      app_build TEXT,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      disabled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (actor_type, actor_id, push_token)
    );

    CREATE TABLE IF NOT EXISTS sync_devices (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      node_id TEXT NOT NULL UNIQUE,
      node_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
      api_key_hash TEXT NOT NULL,
      allowed_ip TEXT,
      last_seen_at TIMESTAMPTZ,
      last_sync_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mesh_nodes (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      node_id TEXT NOT NULL UNIQUE,
      node_name TEXT,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      status TEXT,
      last_seen_at TIMESTAMPTZ,
      users_connected INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mesh_node_health_logs (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      node_id TEXT NOT NULL,
      battery_voltage DOUBLE PRECISION,
      signal_strength INTEGER,
      gps_status TEXT,
      cpu_temp DOUBLE PRECISION,
      storage_remaining INTEGER,
      ram_usage DOUBLE PRECISION,
      recorded_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (node_id, recorded_at)
    );

    CREATE TABLE IF NOT EXISTS mesh_node_links (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      reporting_node_id TEXT NOT NULL,
      neighbor_node_id TEXT NOT NULL,
      rssi INTEGER,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (reporting_node_id, neighbor_node_id)
    );

    CREATE TABLE IF NOT EXISTS mesh_distress_signals (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
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
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      timestamp TIMESTAMPTZ,
      status TEXT,
      priority TEXT,
      ack_received INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (origin_node_id, origin_distress_id)
    );

    CREATE TABLE IF NOT EXISTS online_distress_signals (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      distress_code TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      user_code TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      blood_type TEXT,
      age INTEGER,
      occupation TEXT,
      reason TEXT NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      accuracy_m DOUBLE PRECISION,
      recorded_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'accomplished')),
      canceled_at TIMESTAMPTZ,
      accomplished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distress_deployments (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      deployment_code TEXT NOT NULL UNIQUE,
      mesh_distress_signal_id INTEGER NOT NULL REFERENCES mesh_distress_signals(id),
      distress_source TEXT NOT NULL DEFAULT 'mesh' CHECK (distress_source IN ('mesh', 'online')),
      online_distress_signal_id INTEGER REFERENCES online_distress_signals(id),
      origin_node_id TEXT NOT NULL,
      origin_distress_id INTEGER NOT NULL,
      team_id INTEGER NOT NULL REFERENCES rescue_teams(id),
      team_leader_rescuer_id INTEGER NOT NULL REFERENCES rescuers(id),
      created_by_admin_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('deployed', 'canceled', 'accomplished')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      deployed_at TIMESTAMPTZ,
      canceled_at TIMESTAMPTZ,
      accomplished_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distress_deployment_members (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      deployment_id INTEGER NOT NULL REFERENCES distress_deployments(id) ON DELETE CASCADE,
      rescuer_id INTEGER NOT NULL REFERENCES rescuers(id),
      rescuer_code TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

      CREATE TABLE IF NOT EXISTS rescuer_locations_current (
        rescuer_id INTEGER PRIMARY KEY REFERENCES rescuers(id),
        deployment_id INTEGER REFERENCES distress_deployments(id),
        team_id INTEGER REFERENCES rescue_teams(id),
        latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      accuracy_m DOUBLE PRECISION,
      heading_deg DOUBLE PRECISION,
      speed_mps DOUBLE PRECISION,
      node_id TEXT,
      recorded_at TIMESTAMPTZ NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rescuer_location_sharing_settings (
        rescuer_id INTEGER PRIMARY KEY REFERENCES rescuers(id) ON DELETE CASCADE,
        sharing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        enabled_at TIMESTAMPTZ,
        disabled_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rescuer_location_history (
        id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        rescuer_id INTEGER NOT NULL REFERENCES rescuers(id),
        deployment_id INTEGER REFERENCES distress_deployments(id),
      team_id INTEGER REFERENCES rescue_teams(id),
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      accuracy_m DOUBLE PRECISION,
      heading_deg DOUBLE PRECISION,
      speed_mps DOUBLE PRECISION,
      node_id TEXT,
      recorded_at TIMESTAMPTZ NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deployment_route_snapshots (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      deployment_id INTEGER NOT NULL UNIQUE REFERENCES distress_deployments(id) ON DELETE CASCADE,
      leader_rescuer_id INTEGER NOT NULL REFERENCES rescuers(id),
      leader_recorded_at TIMESTAMPTZ,
      destination_latitude DOUBLE PRECISION,
      destination_longitude DOUBLE PRECISION,
      distance_m DOUBLE PRECISION,
      duration_s DOUBLE PRECISION,
      eta_minutes INTEGER,
      geometry_json TEXT,
      provider TEXT NOT NULL DEFAULT 'openrouteservice',
      computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deployment_isochrone_snapshots (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      deployment_id INTEGER NOT NULL UNIQUE REFERENCES distress_deployments(id) ON DELETE CASCADE,
      leader_rescuer_id INTEGER NOT NULL REFERENCES rescuers(id),
      leader_recorded_at TIMESTAMPTZ,
      origin_latitude DOUBLE PRECISION,
      origin_longitude DOUBLE PRECISION,
      range_values_json TEXT NOT NULL,
      feature_collection_json TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'openrouteservice',
      computed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mesh_messages (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
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
      message_timestamp TIMESTAMPTZ,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (origin_node_id, local_message_id)
    );

    CREATE TABLE IF NOT EXISTS online_chat_departments (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      subtitle TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
      color_tag TEXT NOT NULL DEFAULT 'red',
      rescuer_agency TEXT CHECK (rescuer_agency IN ('cdrrmo', 'fire-department', 'police-department')),
      icon_path TEXT,
      icon_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 100,
      read_only INTEGER NOT NULL DEFAULT 0,
      archived_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS online_chat_conversations (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES online_chat_departments(id),
      civilian_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
      last_message_id INTEGER,
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (department_id, civilian_user_id)
    );

    CREATE TABLE IF NOT EXISTS online_chat_messages (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES online_chat_conversations(id) ON DELETE CASCADE,
      department_id INTEGER NOT NULL REFERENCES online_chat_departments(id),
      civilian_user_id INTEGER NOT NULL REFERENCES users(id),
      sender_type TEXT NOT NULL CHECK (sender_type IN ('civilian', 'admin', 'rescuer', 'system')),
      sender_id INTEGER,
      body TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS online_chat_global_messages (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES online_chat_departments(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL CHECK (sender_type IN ('admin', 'system')),
      sender_id INTEGER,
      body TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS online_chat_read_states (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES online_chat_conversations(id) ON DELETE CASCADE,
      reader_type TEXT NOT NULL CHECK (reader_type IN ('civilian', 'admin', 'rescuer')),
      reader_id INTEGER NOT NULL DEFAULT 0,
      last_read_message_id INTEGER,
      last_read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (conversation_id, reader_type, reader_id)
    );

    CREATE TABLE IF NOT EXISTS online_chat_global_read_states (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      department_id INTEGER NOT NULL REFERENCES online_chat_departments(id) ON DELETE CASCADE,
      reader_type TEXT NOT NULL CHECK (reader_type IN ('civilian', 'admin', 'rescuer')),
      reader_id INTEGER NOT NULL DEFAULT 0,
      last_read_message_id INTEGER,
      last_read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (department_id, reader_type, reader_id)
    );

    CREATE TABLE IF NOT EXISTS online_chat_sender_guards (
      civilian_user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      window_started_at TIMESTAMPTZ,
      message_count INTEGER NOT NULL DEFAULT 0,
      strike_count INTEGER NOT NULL DEFAULT 0,
      timeout_until TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ,
      last_message_body_hash TEXT,
      last_violation_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS online_chat_rescuer_sender_guards (
      rescuer_id INTEGER PRIMARY KEY REFERENCES rescuers(id) ON DELETE CASCADE,
      window_started_at TIMESTAMPTZ,
      message_count INTEGER NOT NULL DEFAULT 0,
      strike_count INTEGER NOT NULL DEFAULT 0,
      timeout_until TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ,
      last_message_body_hash TEXT,
      last_violation_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS online_chat_moderation_events (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      civilian_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rescuer_id INTEGER REFERENCES rescuers(id) ON DELETE SET NULL,
      department_id INTEGER REFERENCES online_chat_departments(id) ON DELETE SET NULL,
      conversation_id INTEGER REFERENCES online_chat_conversations(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      body_preview TEXT,
      metadata_json TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS report_exports (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      report_type TEXT NOT NULL,
      source_scope TEXT NOT NULL,
      date_range_kind TEXT NOT NULL,
      range_start_at TIMESTAMPTZ,
      range_end_at TIMESTAMPTZ,
      output_mode TEXT NOT NULL,
      selected_section_ids_json TEXT NOT NULL,
      generated_by_admin_user_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (status IN ('started', 'generated', 'failed')),
      filename TEXT,
      byte_size INTEGER,
      summary_metadata_json TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS account_access_audit_logs (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('civilian', 'rescuer')),
      subject_id INTEGER NOT NULL,
      subject_code TEXT,
      action_type TEXT NOT NULL CHECK (
        action_type IN (
          'registered',
          'approved',
          'declined',
          'suspended',
          'reactivated',
          'rescuer_created',
          'rescuer_archived',
          'access_status_changed',
          'password_changed'
        )
      ),
      actor_admin_id INTEGER REFERENCES users(id),
      reason_text TEXT,
      metadata_json TEXT,
      occurred_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mesh_audit_logs (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      origin_node_id TEXT NOT NULL,
      local_audit_id BIGINT NOT NULL,
      local_user_id INTEGER,
      user_code TEXT,
      user_role TEXT,
      user_first_name TEXT,
      user_last_name TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ip_address TEXT,
      event_timestamp TIMESTAMPTZ,
      metadata_json TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (origin_node_id, local_audit_id)
    );

    CREATE TABLE IF NOT EXISTS mesh_commands (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      target_node_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE distress_deployments
      ADD COLUMN IF NOT EXISTS distress_source TEXT NOT NULL DEFAULT 'mesh';
    ALTER TABLE distress_deployments
      ADD COLUMN IF NOT EXISTS online_distress_signal_id INTEGER REFERENCES online_distress_signals(id);
    ALTER TABLE distress_deployments
      ALTER COLUMN mesh_distress_signal_id DROP NOT NULL;
    ALTER TABLE online_chat_departments
      ADD COLUMN IF NOT EXISTS rescuer_agency TEXT;
    ALTER TABLE online_chat_departments
      DROP CONSTRAINT IF EXISTS online_chat_departments_rescuer_agency_check;
    ALTER TABLE online_chat_departments
      ADD CONSTRAINT online_chat_departments_rescuer_agency_check
      CHECK (rescuer_agency IN ('cdrrmo', 'fire-department', 'police-department') OR rescuer_agency IS NULL);
    ALTER TABLE online_chat_messages
      DROP CONSTRAINT IF EXISTS online_chat_messages_sender_type_check;
    ALTER TABLE online_chat_messages
      ADD CONSTRAINT online_chat_messages_sender_type_check
      CHECK (sender_type IN ('civilian', 'admin', 'rescuer', 'system'));
    ALTER TABLE online_chat_read_states
      DROP CONSTRAINT IF EXISTS online_chat_read_states_reader_type_check;
    ALTER TABLE online_chat_read_states
      ADD CONSTRAINT online_chat_read_states_reader_type_check
      CHECK (reader_type IN ('civilian', 'admin', 'rescuer'));
    ALTER TABLE online_chat_global_read_states
      DROP CONSTRAINT IF EXISTS online_chat_global_read_states_reader_type_check;
    ALTER TABLE online_chat_global_read_states
      ADD CONSTRAINT online_chat_global_read_states_reader_type_check
      CHECK (reader_type IN ('civilian', 'admin', 'rescuer'));
    ALTER TABLE online_chat_moderation_events
      ADD COLUMN IF NOT EXISTS rescuer_id INTEGER REFERENCES rescuers(id) ON DELETE SET NULL;
    ALTER TABLE rescuers
      ADD COLUMN IF NOT EXISTS previous_team_id INTEGER REFERENCES rescue_teams(id) ON DELETE SET NULL;
    UPDATE rescuers
    SET
      previous_team_id = COALESCE(previous_team_id, team_id),
      team_id = NULL,
      status = 'unavailable',
      updated_at = CURRENT_TIMESTAMP
    WHERE access_status = 'archived' AND team_id IS NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
    CREATE INDEX IF NOT EXISTS idx_rescuers_status ON rescuers (status);
    CREATE INDEX IF NOT EXISTS idx_rescuers_access_status ON rescuers (access_status);
    CREATE INDEX IF NOT EXISTS idx_rescuers_created_at ON rescuers (created_at);
    CREATE INDEX IF NOT EXISTS idx_rescuers_team_id ON rescuers (team_id);
    CREATE INDEX IF NOT EXISTS idx_rescuers_previous_team_id ON rescuers (previous_team_id);
    CREATE INDEX IF NOT EXISTS idx_rescue_teams_status ON rescue_teams (status);
    CREATE INDEX IF NOT EXISTS idx_rescue_teams_name ON rescue_teams (name);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications (created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON notifications (read_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_hidden_at ON notifications (hidden_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions (session_token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_principal ON auth_sessions (principal_type, principal_id);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_revoked_at ON auth_sessions (revoked_at);
    CREATE INDEX IF NOT EXISTS idx_civilian_password_reset_email
      ON civilian_password_reset_codes (email_lookup_hash, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_civilian_password_reset_user
      ON civilian_password_reset_codes (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_civilian_password_reset_token
      ON civilian_password_reset_codes (reset_token_hash);
    CREATE INDEX IF NOT EXISTS idx_civilian_password_reset_expires
      ON civilian_password_reset_codes (expires_at);
    CREATE INDEX IF NOT EXISTS idx_mobile_push_registrations_actor
      ON mobile_push_registrations (actor_type, actor_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_mobile_push_registrations_last_seen
      ON mobile_push_registrations (last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sync_devices_status ON sync_devices (status);
    CREATE INDEX IF NOT EXISTS idx_sync_devices_last_sync ON sync_devices (last_sync_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_nodes_updated_at ON mesh_nodes (updated_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_node_health_logs_recorded_at ON mesh_node_health_logs (recorded_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_node_links_neighbor ON mesh_node_links (neighbor_node_id, last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_node_links_reporting ON mesh_node_links (reporting_node_id, last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_distress_signals_updated_at ON mesh_distress_signals (updated_at);
    CREATE INDEX IF NOT EXISTS idx_online_distress_signals_updated_at ON online_distress_signals (updated_at);
    CREATE INDEX IF NOT EXISTS idx_online_distress_signals_status ON online_distress_signals (status, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_online_distress_signals_one_active_per_user
      ON online_distress_signals(user_id)
      WHERE status = 'active' AND deleted = 0;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_distress_deployments_active_unique
      ON distress_deployments(mesh_distress_signal_id)
      WHERE status = 'deployed' AND distress_source = 'mesh';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_distress_deployments_online_active_unique
      ON distress_deployments(online_distress_signal_id)
      WHERE status = 'deployed' AND distress_source = 'online';
    CREATE INDEX IF NOT EXISTS idx_distress_deployments_status ON distress_deployments (status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_distress_deployments_origin ON distress_deployments (origin_node_id, origin_distress_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_distress_deployments_source ON distress_deployments (distress_source, status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_distress_deployment_members_deployment_id ON distress_deployment_members (deployment_id);
      CREATE INDEX IF NOT EXISTS idx_rescuer_locations_current_deployment_id ON rescuer_locations_current (deployment_id);
      CREATE INDEX IF NOT EXISTS idx_rescuer_locations_current_team_id ON rescuer_locations_current (team_id);
      CREATE INDEX IF NOT EXISTS idx_rescuer_location_sharing_settings_enabled
        ON rescuer_location_sharing_settings (sharing_enabled, updated_at);
      CREATE INDEX IF NOT EXISTS idx_rescuer_location_history_rescuer_id ON rescuer_location_history (rescuer_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_deployment_route_snapshots_updated_at ON deployment_route_snapshots (updated_at);
    CREATE INDEX IF NOT EXISTS idx_deployment_isochrone_snapshots_updated_at ON deployment_isochrone_snapshots (updated_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_messages_timestamp ON mesh_messages (message_timestamp);
    CREATE INDEX IF NOT EXISTS idx_online_chat_departments_status ON online_chat_departments (status, sort_order);
    CREATE INDEX IF NOT EXISTS idx_online_chat_departments_rescuer_agency ON online_chat_departments (rescuer_agency, status, sort_order);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_online_chat_departments_rescuer_agency_active_unique
      ON online_chat_departments (rescuer_agency)
      WHERE rescuer_agency IS NOT NULL AND status = 'active';
    CREATE INDEX IF NOT EXISTS idx_online_chat_conversations_department ON online_chat_conversations (department_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_online_chat_conversations_civilian ON online_chat_conversations (civilian_user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_online_chat_messages_conversation ON online_chat_messages (conversation_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_online_chat_messages_department ON online_chat_messages (department_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_online_chat_global_messages_department ON online_chat_global_messages (department_id, created_at, id);
    CREATE INDEX IF NOT EXISTS idx_online_chat_read_states_reader ON online_chat_read_states (reader_type, reader_id);
    CREATE INDEX IF NOT EXISTS idx_online_chat_global_read_states_reader ON online_chat_global_read_states (department_id, reader_type, reader_id);
    CREATE INDEX IF NOT EXISTS idx_online_chat_sender_guards_timeout ON online_chat_sender_guards (timeout_until, last_violation_at);
    CREATE INDEX IF NOT EXISTS idx_online_chat_rescuer_sender_guards_timeout ON online_chat_rescuer_sender_guards (timeout_until, last_violation_at);
    CREATE INDEX IF NOT EXISTS idx_online_chat_moderation_events_civilian ON online_chat_moderation_events (civilian_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_online_chat_moderation_events_rescuer ON online_chat_moderation_events (rescuer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_online_chat_moderation_events_department ON online_chat_moderation_events (department_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_exports_report_type ON report_exports (report_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_exports_created_at ON report_exports (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_report_exports_admin_user ON report_exports (generated_by_admin_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_account_access_audit_subject ON account_access_audit_logs (subject_type, subject_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_account_access_audit_action ON account_access_audit_logs (action_type, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_account_access_audit_actor ON account_access_audit_logs (actor_admin_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_account_access_audit_occurred_at ON account_access_audit_logs (occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mesh_audit_logs_event_timestamp ON mesh_audit_logs (event_timestamp);
    CREATE INDEX IF NOT EXISTS idx_mesh_commands_target_status ON mesh_commands (target_node_id, status);
  `);

  await ensurePostgresColumnTypes();
  await ensureAccountAccessAuditBaseline();
  await exec(`
    ALTER TABLE distress_deployments
      ADD COLUMN IF NOT EXISTS distress_source TEXT NOT NULL DEFAULT 'mesh';
    ALTER TABLE distress_deployments
      ADD COLUMN IF NOT EXISTS online_distress_signal_id INTEGER REFERENCES online_distress_signals(id);
    ALTER TABLE distress_deployments
      ALTER COLUMN mesh_distress_signal_id DROP NOT NULL;
    ALTER TABLE online_chat_departments
      ADD COLUMN IF NOT EXISTS rescuer_agency TEXT;
    ALTER TABLE online_chat_departments
      DROP CONSTRAINT IF EXISTS online_chat_departments_rescuer_agency_check;
    ALTER TABLE online_chat_departments
      ADD CONSTRAINT online_chat_departments_rescuer_agency_check
      CHECK (rescuer_agency IN ('cdrrmo', 'fire-department', 'police-department') OR rescuer_agency IS NULL);
    ALTER TABLE online_chat_messages
      DROP CONSTRAINT IF EXISTS online_chat_messages_sender_type_check;
    ALTER TABLE online_chat_messages
      ADD CONSTRAINT online_chat_messages_sender_type_check
      CHECK (sender_type IN ('civilian', 'admin', 'rescuer', 'system'));
    ALTER TABLE online_chat_read_states
      DROP CONSTRAINT IF EXISTS online_chat_read_states_reader_type_check;
    ALTER TABLE online_chat_read_states
      ADD CONSTRAINT online_chat_read_states_reader_type_check
      CHECK (reader_type IN ('civilian', 'admin', 'rescuer'));
    ALTER TABLE online_chat_global_read_states
      DROP CONSTRAINT IF EXISTS online_chat_global_read_states_reader_type_check;
    ALTER TABLE online_chat_global_read_states
      ADD CONSTRAINT online_chat_global_read_states_reader_type_check
      CHECK (reader_type IN ('civilian', 'admin', 'rescuer'));
  `);
  await ensureUserPhoneLookupHashes();
  await ensureSequenceTables();
  await cleanupLegacySeededOnlineChatDepartments();
  await run(`
    UPDATE mesh_distress_signals
    SET status = 'canceled'
    WHERE LOWER(COALESCE(status, '')) = 'cancelled'
  `);
  await ensureBootstrapSyncDevice();
  await reconcileDeploymentOperationalStatuses();
}

async function close() {
  await pool.end();
}

module.exports = {
  run,
  get,
  all,
  exec,
  transaction,
  hashApiKey,
  decryptText,
  lookupHash,
  initializeDatabase,
  close,
  pool
};
