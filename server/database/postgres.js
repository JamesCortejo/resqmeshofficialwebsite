const crypto = require('crypto');
const { Pool, types } = require('pg');
const config = require('../config/env');

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

function quoteCamelCaseAliases(sql) {
  return sql.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, (match, alias) => {
    return /[A-Z]/.test(alias) ? `AS "${alias}"` : match;
  });
}

function quoteCamelCaseQualifiedReferences(sql) {
  return sql.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g, '$1."$2"');
}

function convertPlaceholders(sql) {
  let output = '';
  let index = 1;
  let quote = null;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        output += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        output += char;
      }
      continue;
    }

    if (quote) {
      output += char;

      if (char === quote) {
        if (quote === "'" && next === "'") {
          output += next;
          i += 1;
        } else {
          quote = null;
        }
      }

      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      output += char;
      continue;
    }

    if (char === '$') {
      const tagMatch = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (tagMatch) {
        dollarTag = tagMatch[0];
        output += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (char === '?') {
      output += `$${index}`;
      index += 1;
    } else {
      output += char;
    }
  }

  return output;
}

function splitTopLevelArguments(value) {
  const args = [];
  let current = '';
  let depth = 0;
  let quote = null;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];

    if (quote) {
      current += char;
      if (char === quote) {
        if (quote === "'" && next === "'") {
          current += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() || value.trim() === '') {
    args.push(current.trim());
  }

  return args;
}

function convertSqliteDateCall(functionName, body) {
  const args = splitTopLevelArguments(body);
  const first = args[0] || '';
  const modifier = args[1] || '';
  const cast = functionName.toLowerCase() === 'date' ? '::date' : '';

  if (/^'now'$/i.test(first)) {
    if (/^'-\d+\s+day'$/i.test(modifier)) {
      const days = modifier.match(/\d+/)[0];
      return `(CURRENT_DATE - INTERVAL '${days} days')${cast}`;
    }

    if (/^'\+\d+\s+day'$/i.test(modifier)) {
      const days = modifier.match(/\d+/)[0];
      return `(CURRENT_DATE + INTERVAL '${days} days')${cast}`;
    }

    return functionName.toLowerCase() === 'date' ? 'CURRENT_DATE' : 'CURRENT_TIMESTAMP';
  }

  if (/^'\+\d+\s+day'$/i.test(modifier)) {
    const days = modifier.match(/\d+/)[0];
    return `(${first} + INTERVAL '${days} days')${cast}`;
  }

  if (/^'-\d+\s+day'$/i.test(modifier)) {
    const days = modifier.match(/\d+/)[0];
    return `(${first} - INTERVAL '${days} days')${cast}`;
  }

  return `(${body})${cast}`;
}

function convertSqliteDateFunctions(sql) {
  let output = '';
  let index = 0;

  while (index < sql.length) {
    const match = sql.slice(index).match(/\b(datetime|date)\s*\(/i);

    if (!match) {
      output += sql.slice(index);
      break;
    }

    const functionStart = index + match.index;
    const functionName = match[1];
    const openParenIndex = functionStart + match[0].lastIndexOf('(');

    output += sql.slice(index, functionStart);

    let depth = 0;
    let quote = null;
    let closeParenIndex = -1;

    for (let i = openParenIndex; i < sql.length; i += 1) {
      const char = sql[i];
      const next = sql[i + 1];

      if (quote) {
        if (char === quote) {
          if (quote === "'" && next === "'") {
            i += 1;
          } else {
            quote = null;
          }
        }
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }

      if (char === '(') {
        depth += 1;
        continue;
      }

      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          closeParenIndex = i;
          break;
        }
      }
    }

    if (closeParenIndex === -1) {
      output += sql.slice(functionStart);
      break;
    }

    const body = sql.slice(openParenIndex + 1, closeParenIndex);
    output += convertSqliteDateCall(functionName, body);
    index = closeParenIndex + 1;
  }

  return output;
}

function prepareSql(sql) {
  return convertPlaceholders(
    convertSqliteDateFunctions(
      quoteCamelCaseQualifiedReferences(quoteCamelCaseAliases(sql))
    )
  );
}

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

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
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
  `);
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
      api_key_hash = excluded.api_key_hash,
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

    CREATE TABLE IF NOT EXISTS distress_deployments (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      deployment_code TEXT NOT NULL UNIQUE,
      mesh_distress_signal_id INTEGER NOT NULL REFERENCES mesh_distress_signals(id),
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

    CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
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
    CREATE INDEX IF NOT EXISTS idx_mesh_node_links_neighbor ON mesh_node_links (neighbor_node_id, last_seen_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_node_links_reporting ON mesh_node_links (reporting_node_id, last_seen_at);
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
    CREATE INDEX IF NOT EXISTS idx_deployment_isochrone_snapshots_updated_at ON deployment_isochrone_snapshots (updated_at);
    CREATE INDEX IF NOT EXISTS idx_mesh_messages_timestamp ON mesh_messages (message_timestamp);
    CREATE INDEX IF NOT EXISTS idx_mesh_audit_logs_event_timestamp ON mesh_audit_logs (event_timestamp);
    CREATE INDEX IF NOT EXISTS idx_mesh_commands_target_status ON mesh_commands (target_node_id, status);
  `);

  await ensurePostgresColumnTypes();
  await ensureSequenceTables();
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
  initializeDatabase,
  close,
  pool
};
