const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config/env');
const { all, close, get, transaction } = require('../database/postgres');
const { encryptText, lookupHash } = require('../services/encryptionService');
const { hashPassword } = require('../services/passwordService');
const { buildTransientRoute } = require('../services/deploymentRouteService');

const STATE_VERSION = 1;
const REFRESH_INTERVAL_MS = 15000;
const DATA_DIR = path.join(config.appRoot, 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'demo-map-history');
const STATE_PATH = path.join(DATA_DIR, 'demo-map-state.json');
const LOCK_PATH = path.join(DATA_DIR, 'demo-map.lock');

const NODE_LOCATIONS = [
  { nodeId: 'MN00001', label: 'Central Sayre Highway', latitude: 7.92491, longitude: 125.0946 },
  { nodeId: 'MN00002', label: 'Robinsons Valencia', latitude: 7.9343, longitude: 125.10034 },
  { nodeId: 'MN00003', label: 'Valencia City Hall', latitude: 7.90293, longitude: 125.08931 }
];

const INCIDENTS = [
  {
    key: 'medical',
    distressCode: 'DEMO-ODS-VAL-001',
    deploymentCode: 'DEMO-DPL-VAL-001',
    userCode: 'RMU002',
    teamCode: 'RST-001',
    leaderCode: 'RSC-001',
    firstName: 'Demo',
    lastName: 'Civilian One',
    phone: '09000000001',
    bloodType: 'O+',
    age: 32,
    occupation: 'Resident',
    reason: 'MEDICAL EMERGENCY',
    latitude: 7.90293,
    longitude: 125.08931,
    accuracyM: 8
  },
  {
    key: 'road-accident',
    distressCode: 'DEMO-ODS-VAL-002',
    deploymentCode: 'DEMO-DPL-VAL-002',
    userCode: 'RMU004',
    teamCode: 'RST-002',
    leaderCode: 'RSC-002',
    firstName: 'Demo',
    lastName: 'Civilian Two',
    phone: '09000000002',
    bloodType: 'A+',
    age: 41,
    occupation: 'Driver',
    reason: 'ROAD ACCIDENT',
    latitude: 7.9186,
    longitude: 125.0933,
    accuracyM: 7
  }
];

const RESPONDER_LOCATIONS = [
  { rescuerCode: 'RSC-001', latitude: 7.9122, longitude: 125.092, accuracyM: 8, headingDeg: 190, speedMps: 4.1 },
  { rescuerCode: 'RSC-002', latitude: 7.9272, longitude: 125.0971, accuracyM: 7, headingDeg: 205, speedMps: 5.2 },
  { rescuerCode: 'RSC-003', latitude: 7.9079, longitude: 125.091, accuracyM: 9, headingDeg: 15, speedMps: 0.8 },
  { rescuerCode: 'DEMO-RSC-004', latitude: 7.922, longitude: 125.094, accuracyM: 8, headingDeg: 30, speedMps: 2.4 },
  { rescuerCode: 'DEMO-RSC-005', latitude: 7.936, longitude: 125.1011, accuracyM: 7, headingDeg: 180, speedMps: 3.6 }
];

const TEMP_RESPONDERS = [
  {
    rescuerCode: 'DEMO-RSC-004',
    firstName: 'Demo',
    lastName: 'Responder Four',
    birthDate: '1990-04-14',
    phone: '09990000004',
    agency: 'police-department',
    teamCode: 'RST-003'
  },
  {
    rescuerCode: 'DEMO-RSC-005',
    firstName: 'Demo',
    lastName: 'Responder Five',
    birthDate: '1988-05-15',
    phone: '09990000005',
    agency: 'police-department',
    teamCode: 'RST-003'
  }
];

function nowIso() {
  return new Date().toISOString();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function by(rows, property) {
  return new Map(rows.map((row) => [row[property], row]));
}

function sameNumber(left, right) {
  if (left == null || right == null) {
    return left == null && right == null;
  }
  return Math.abs(Number(left) - Number(right)) < 1e-8;
}

function sameTimestamp(left, right) {
  if (!left && !right) {
    return true;
  }
  return Date.parse(left || '') === Date.parse(right || '');
}

async function ensureRuntimeDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(HISTORY_DIR, { recursive: true, mode: 0o700 });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporaryPath, filePath);
  await fs.chmod(filePath, 0o600);
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function acquireLock(action) {
  await ensureRuntimeDirectories();
  try {
    const handle = await fs.open(LOCK_PATH, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, action, startedAt: nowIso() })}\n`);
    await handle.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let lock = null;
    try {
      lock = await readJson(LOCK_PATH);
    } catch (readError) {
      // Malformed locks are stale.
    }
    if (lock && processAlive(Number(lock.pid))) {
      throw new Error(`Demo command '${lock.action || 'unknown'}' is already running with PID ${lock.pid}.`);
    }
    await fs.rm(LOCK_PATH, { force: true });
    return acquireLock(action);
  }

  return async () => {
    try {
      const lock = await readJson(LOCK_PATH);
      if (Number(lock.pid) === process.pid) await fs.rm(LOCK_PATH, { force: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
}

async function loadState(required = true) {
  if (!(await exists(STATE_PATH))) {
    if (required) throw new Error('No active demo-map state exists. Run install first.');
    return null;
  }
  const state = await readJson(STATE_PATH);
  if (state.version !== STATE_VERSION || !state.runId) {
    throw new Error('The demo-map state file is unsupported or invalid.');
  }
  return state;
}

async function findRequiredData() {
  const users = await all(`
    SELECT id, user_code AS "userCode", status
    FROM users
    WHERE user_code IN ('RMU001', 'RMU002', 'RMU004')
    ORDER BY user_code
  `);
  const teams = await all(`
    SELECT id, team_code AS "teamCode", name, agency, status,
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM rescue_teams
    WHERE team_code IN ('RST-001', 'RST-002', 'RST-003')
    ORDER BY team_code
  `);
  const rescuers = await all(`
    SELECT id, rescuer_code AS "rescuerCode", agency, status,
           access_status AS "accessStatus", archived_at AS "archivedAt",
           team_id AS "teamId", previous_team_id AS "previousTeamId",
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM rescuers
    WHERE rescuer_code IN ('RSC-001', 'RSC-002', 'RSC-003')
    ORDER BY rescuer_code
  `);
  const nodes = await all(`
    SELECT id, node_id AS "nodeId", node_name AS "nodeName", latitude, longitude,
           status, last_seen_at AS "lastSeenAt", users_connected AS "usersConnected",
           deleted, created_at AS "createdAt", updated_at AS "updatedAt",
           battery_percent AS "batteryPercent", battery_voltage AS "batteryVoltage"
    FROM mesh_nodes
    WHERE node_id IN ('MN00001', 'MN00002', 'MN00003')
    ORDER BY node_id
  `);
  const locations = await all(`
    SELECT rescuer_id AS "rescuerId", deployment_id AS "deploymentId", team_id AS "teamId",
           latitude, longitude, accuracy_m AS "accuracyM", heading_deg AS "headingDeg",
           speed_mps AS "speedMps", node_id AS "nodeId", recorded_at AS "recordedAt",
           received_at AS "receivedAt", updated_at AS "updatedAt"
    FROM rescuer_locations_current
    WHERE rescuer_id IN (
      SELECT id FROM rescuers WHERE rescuer_code IN ('RSC-001', 'RSC-002', 'RSC-003')
    )
    ORDER BY rescuer_id
  `);
  const sharingSettings = await all(`
    SELECT rescuer_id AS "rescuerId", sharing_enabled AS "sharingEnabled",
           enabled_at AS "enabledAt", disabled_at AS "disabledAt",
           updated_at AS "updatedAt", created_at AS "createdAt"
    FROM rescuer_location_sharing_settings
    WHERE rescuer_id IN (
      SELECT id FROM rescuers WHERE rescuer_code IN ('RSC-001', 'RSC-002', 'RSC-003')
    )
    ORDER BY rescuer_id
  `);
  return { users, teams, rescuers, nodes, locations, sharingSettings };
}

async function preflight() {
  const required = await findRequiredData();
  const issues = [];
  const users = by(required.users, 'userCode');
  const teams = by(required.teams, 'teamCode');
  const rescuers = by(required.rescuers, 'rescuerCode');
  const nodes = by(required.nodes, 'nodeId');

  for (const code of ['RMU001', 'RMU002', 'RMU004']) {
    if (!users.has(code)) issues.push(`Required user ${code} does not exist.`);
  }
  if (users.get('RMU001')?.status !== 'admin') issues.push('RMU001 must be an admin user.');
  for (const code of ['RMU002', 'RMU004']) {
    if (users.get(code)?.status !== 'approved') issues.push(`${code} must be approved.`);
  }
  for (const code of ['RST-001', 'RST-002', 'RST-003']) {
    if (!teams.has(code)) issues.push(`Required rescue team ${code} does not exist.`);
  }
  for (const code of ['RST-001', 'RST-002']) {
    if (teams.get(code)?.status !== 'active') issues.push(`${code} must be active.`);
  }
  for (const code of ['RSC-001', 'RSC-002', 'RSC-003']) {
    const rescuer = rescuers.get(code);
    if (!rescuer) issues.push(`Required rescuer ${code} does not exist.`);
    else if (rescuer.accessStatus !== 'active') issues.push(`${code} must have active access.`);
  }
  for (const incident of INCIDENTS) {
    const leader = rescuers.get(incident.leaderCode);
    const team = teams.get(incident.teamCode);
    if (leader && team && leader.teamId !== team.id) {
      issues.push(`${incident.leaderCode} must belong to ${incident.teamCode}.`);
    }
    if (leader?.status !== 'available') issues.push(`${incident.leaderCode} must be available.`);
  }
  for (const node of NODE_LOCATIONS) {
    if (!nodes.has(node.nodeId)) issues.push(`Required mesh node ${node.nodeId} does not exist.`);
  }

  const conflicts = await get(`
    SELECT
      (SELECT COUNT(*)::int FROM rescuers WHERE rescuer_code LIKE 'DEMO-RSC-%') AS "demoRescuers",
      (SELECT COUNT(*)::int FROM online_distress_signals WHERE distress_code LIKE 'DEMO-ODS-%') AS "demoDistress",
      (SELECT COUNT(*)::int FROM distress_deployments WHERE deployment_code LIKE 'DEMO-DPL-%') AS "demoDeployments",
      (SELECT COUNT(*)::int FROM online_distress_signals
       WHERE user_id IN (SELECT id FROM users WHERE user_code IN ('RMU002', 'RMU004'))
         AND deleted = 0 AND status = 'active') AS "activeCivilianDistress",
      (SELECT COUNT(*)::int FROM distress_deployments
       WHERE team_id IN (SELECT id FROM rescue_teams WHERE team_code IN ('RST-001', 'RST-002'))
         AND status = 'deployed') AS "activeTeamDeployments"
  `);
  if (conflicts.demoRescuers || conflicts.demoDistress || conflicts.demoDeployments) {
    issues.push('Reserved DEMO records already exist.');
  }
  if (conflicts.activeCivilianDistress) issues.push('RMU002 or RMU004 already has an active distress signal.');
  if (conflicts.activeTeamDeployments) issues.push('RST-001 or RST-002 already has an active deployment.');
  if (!config.openRouteServiceApiKey) issues.push('OPENROUTESERVICE_API_KEY is not configured.');
  return { required, issues };
}

function printPreflight(result) {
  console.log('Demo map preflight');
  console.log(`- Users: ${result.required.users.length}/3`);
  console.log(`- Teams: ${result.required.teams.length}/3`);
  console.log(`- Existing rescuers: ${result.required.rescuers.length}/3`);
  console.log(`- Mesh nodes: ${result.required.nodes.length}/3`);
  console.log(`- ORS configured: ${config.openRouteServiceApiKey ? 'yes' : 'no'}`);
  if (result.issues.length) {
    console.log('- Result: blocked');
    result.issues.forEach((issue) => console.log(`  - ${issue}`));
  } else {
    console.log('- Result: ready');
  }
}

async function fetchRoutes() {
  const locations = by(RESPONDER_LOCATIONS, 'rescuerCode');
  const routes = {};
  for (const incident of INCIDENTS) {
    const origin = locations.get(incident.leaderCode);
    console.log(`Requesting ORS route for ${incident.deploymentCode}...`);
    routes[incident.key] = await buildTransientRoute(
      { latitude: origin.latitude, longitude: origin.longitude },
      { latitude: incident.latitude, longitude: incident.longitude }
    );
    if (!Array.isArray(routes[incident.key].coordinates) || routes[incident.key].coordinates.length < 2) {
      throw new Error(`ORS returned invalid geometry for ${incident.deploymentCode}.`);
    }
  }
  return routes;
}

function preparedState(required) {
  const runId = crypto.randomUUID();
  return {
    version: STATE_VERSION,
    runId,
    phase: 'prepared',
    preparedAt: nowIso(),
    installedAt: null,
    installStartedAt: null,
    lastRefreshAt: null,
    lastDemoWriteAt: null,
    locationTag: `DEMO-MAP:${runId}`,
    demo: {
      nodes: NODE_LOCATIONS,
      incidents: INCIDENTS.map(({ key, distressCode, deploymentCode, userCode, teamCode, leaderCode, latitude, longitude }) => ({
        key, distressCode, deploymentCode, userCode, teamCode, leaderCode, latitude, longitude
      })),
      responders: RESPONDER_LOCATIONS,
      temporaryResponderCodes: TEMP_RESPONDERS.map((item) => item.rescuerCode)
    },
    original: {
      nodes: required.nodes,
      teams: required.teams,
      rescuers: required.rescuers,
      locations: required.locations,
      sharingSettings: required.sharingSettings
    },
    generated: { responderIds: {}, distressIds: {}, deploymentIds: {}, routeSnapshotIds: {} }
  };
}

async function insertTemporaryResponder(trx, profile, team, timestamp) {
  const password = crypto.randomBytes(48).toString('base64url');
  return trx.get(`
    INSERT INTO rescuers (
      rescuer_code, first_name_enc, middle_name_enc, last_name_enc, birth_date_enc,
      phone_enc, password_hash, phone_lookup_hash, agency, status, access_status,
      team_id, created_at, updated_at
    ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'available', 'active', ?, ?, ?)
    RETURNING id
  `, [
    profile.rescuerCode,
    encryptText(profile.firstName),
    encryptText(profile.lastName),
    encryptText(profile.birthDate),
    encryptText(profile.phone),
    hashPassword(password),
    lookupHash(profile.phone),
    profile.agency,
    team.id,
    timestamp,
    timestamp
  ]);
}

async function insertOnlineDistress(trx, incident, user, timestamp) {
  return trx.get(`
    INSERT INTO online_distress_signals (
      distress_code, user_id, user_code, first_name, last_name, phone, blood_type,
      age, occupation, reason, latitude, longitude, accuracy_m, recorded_at,
      status, canceled_at, accomplished_at, updated_at, deleted, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, NULL, ?, 0, ?)
    RETURNING id
  `, [
    incident.distressCode,
    user.id,
    incident.userCode,
    incident.firstName,
    incident.lastName,
    incident.phone,
    incident.bloodType,
    incident.age,
    incident.occupation,
    incident.reason,
    incident.latitude,
    incident.longitude,
    incident.accuracyM,
    timestamp,
    timestamp,
    timestamp
  ]);
}

async function insertDeployment(trx, incident, distressId, team, leader, admin, timestamp) {
  const deployment = await trx.get(`
    INSERT INTO distress_deployments (
      deployment_code, mesh_distress_signal_id, online_distress_signal_id,
      distress_source, origin_node_id, origin_distress_id, team_id,
      team_leader_rescuer_id, created_by_admin_user_id, status, created_at,
      deployed_at, canceled_at, accomplished_at, updated_at
    ) VALUES (?, NULL, ?, 'online', ?, ?, ?, ?, ?, 'deployed', ?, ?, NULL, NULL, ?)
    RETURNING id
  `, [
    incident.deploymentCode,
    distressId,
    `ONLINE-${distressId}`,
    distressId,
    team.id,
    leader.id,
    admin.id,
    timestamp,
    timestamp,
    timestamp
  ]);
  await trx.run(`
    INSERT INTO distress_deployment_members (deployment_id, rescuer_id, rescuer_code, created_at)
    VALUES (?, ?, ?, ?)
  `, [deployment.id, leader.id, leader.rescuerCode, timestamp]);
  return deployment;
}

async function upsertDemoLocation(trx, rescuer, location, deploymentId, tag, timestamp) {
  await trx.run(`
    INSERT INTO rescuer_locations_current (
      rescuer_id, deployment_id, team_id, latitude, longitude, accuracy_m,
      heading_deg, speed_mps, node_id, recorded_at, received_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(rescuer_id) DO UPDATE SET
      deployment_id = excluded.deployment_id,
      team_id = excluded.team_id,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      accuracy_m = excluded.accuracy_m,
      heading_deg = excluded.heading_deg,
      speed_mps = excluded.speed_mps,
      node_id = excluded.node_id,
      recorded_at = excluded.recorded_at,
      received_at = excluded.received_at,
      updated_at = excluded.updated_at
  `, [
    rescuer.id, deploymentId, rescuer.teamId, location.latitude, location.longitude,
    location.accuracyM, location.headingDeg, location.speedMps, tag,
    timestamp, timestamp, timestamp
  ]);
  await trx.run(`
    INSERT INTO rescuer_location_sharing_settings (
      rescuer_id, sharing_enabled, enabled_at, disabled_at, updated_at, created_at
    ) VALUES (?, TRUE, ?, NULL, ?, ?)
    ON CONFLICT(rescuer_id) DO UPDATE SET
      sharing_enabled = TRUE,
      enabled_at = excluded.enabled_at,
      disabled_at = NULL,
      updated_at = excluded.updated_at
  `, [rescuer.id, timestamp, timestamp, timestamp]);
}

async function insertRoute(trx, deployment, leader, incident, route, timestamp) {
  return trx.get(`
    INSERT INTO deployment_route_snapshots (
      deployment_id, leader_rescuer_id, leader_recorded_at, destination_latitude,
      destination_longitude, distance_m, duration_s, eta_minutes, geometry_json,
      provider, computed_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [
    deployment.id,
    leader.id,
    timestamp,
    incident.latitude,
    incident.longitude,
    route.distance_m,
    route.duration_s,
    route.eta_minutes,
    JSON.stringify(route.coordinates),
    route.provider,
    timestamp,
    timestamp
  ]);
}

async function installDemo() {
  if (await exists(STATE_PATH)) {
    throw new Error('An active demo-map state exists. Run status or rollback first.');
  }
  const result = await preflight();
  printPreflight(result);
  if (result.issues.length) {
    throw new Error(`Preflight failed:\n- ${result.issues.join('\n- ')}`);
  }

  const routes = await fetchRoutes();
  const timestamp = nowIso();
  const state = preparedState(result.required);
  state.installStartedAt = timestamp;
  await writeJsonAtomic(STATE_PATH, state);
  const users = by(result.required.users, 'userCode');
  const teams = by(result.required.teams, 'teamCode');
  const existingRescuers = by(result.required.rescuers, 'rescuerCode');
  let committed = false;

  try {
    const generated = await transaction(async (trx) => {
      const concurrent = await trx.get(`
        SELECT
          (SELECT COUNT(*)::int FROM online_distress_signals
           WHERE user_id IN (SELECT id FROM users WHERE user_code IN ('RMU002', 'RMU004'))
             AND deleted = 0 AND status = 'active') AS "activeCivilianDistress",
          (SELECT COUNT(*)::int FROM distress_deployments
           WHERE team_id IN (SELECT id FROM rescue_teams WHERE team_code IN ('RST-001', 'RST-002'))
             AND status = 'deployed') AS "activeTeamDeployments"
      `);
      if (concurrent.activeCivilianDistress || concurrent.activeTeamDeployments) {
        throw new Error('Civilian or rescue-team availability changed after preflight.');
      }

      const responders = new Map(existingRescuers);
      const responderIds = {};
      const distressIds = {};
      const deploymentIds = {};
      const routeSnapshotIds = {};

      for (const profile of TEMP_RESPONDERS) {
        const created = await insertTemporaryResponder(trx, profile, teams.get(profile.teamCode), timestamp);
        const responder = {
          id: created.id,
          rescuerCode: profile.rescuerCode,
          teamId: teams.get(profile.teamCode).id
        };
        responders.set(profile.rescuerCode, responder);
        responderIds[profile.rescuerCode] = created.id;
      }

      for (const incident of INCIDENTS) {
        const distress = await insertOnlineDistress(trx, incident, users.get(incident.userCode), timestamp);
        const leader = responders.get(incident.leaderCode);
        const deployment = await insertDeployment(
          trx,
          incident,
          distress.id,
          teams.get(incident.teamCode),
          leader,
          users.get('RMU001'),
          timestamp
        );
        const route = await insertRoute(trx, deployment, leader, incident, routes[incident.key], timestamp);
        distressIds[incident.distressCode] = distress.id;
        deploymentIds[incident.deploymentCode] = deployment.id;
        routeSnapshotIds[incident.deploymentCode] = route.id;
      }

      for (const incident of INCIDENTS) {
        const team = teams.get(incident.teamCode);
        const leader = responders.get(incident.leaderCode);
        const teamUpdate = await trx.run(`
          UPDATE rescue_teams SET status = 'dispatched', updated_at = ?
          WHERE id = ? AND status = 'active'
        `, [timestamp, team.id]);
        const leaderUpdate = await trx.run(`
          UPDATE rescuers SET status = 'dispatched', updated_at = ?
          WHERE id = ? AND team_id = ? AND status = 'available' AND access_status = 'active'
        `, [timestamp, leader.id, team.id]);
        if (teamUpdate.changes !== 1 || leaderUpdate.changes !== 1) {
          throw new Error(`${incident.teamCode} or ${incident.leaderCode} changed after preflight.`);
        }
      }

      for (const location of RESPONDER_LOCATIONS) {
        const responder = responders.get(location.rescuerCode);
        const incident = INCIDENTS.find((item) => item.leaderCode === location.rescuerCode);
        const deploymentId = incident ? deploymentIds[incident.deploymentCode] : null;
        await upsertDemoLocation(trx, responder, location, deploymentId, state.locationTag, timestamp);
      }

      for (const node of NODE_LOCATIONS) {
        const update = await trx.run(`
          UPDATE mesh_nodes SET latitude = ?, longitude = ?, updated_at = ? WHERE node_id = ?
        `, [node.latitude, node.longitude, timestamp, node.nodeId]);
        if (update.changes !== 1) throw new Error(`Unable to update ${node.nodeId}.`);
      }
      return { responderIds, distressIds, deploymentIds, routeSnapshotIds };
    });

    committed = true;
    state.phase = 'installed';
    state.installedAt = timestamp;
    state.lastRefreshAt = timestamp;
    state.lastDemoWriteAt = timestamp;
    state.generated = generated;
    await writeJsonAtomic(STATE_PATH, state);
  } catch (error) {
    if (!committed) {
      await fs.rm(STATE_PATH, { force: true });
    }
    throw error;
  }

  console.log(`Demo map installed with run ID ${state.runId}.`);
  console.log('Run `npm run demo:map -- watch` while capturing screenshots.');
  console.log('Stop the watcher with Ctrl+C before rollback.');
}

async function resolveDemoResponders() {
  return all(`
    SELECT id, rescuer_code AS "rescuerCode", team_id AS "teamId"
    FROM rescuers
    WHERE rescuer_code IN (
      'RSC-001', 'RSC-002', 'RSC-003', 'DEMO-RSC-004', 'DEMO-RSC-005'
    )
    ORDER BY rescuer_code
  `);
}

async function refreshDemo(state) {
  const timestamp = nowIso();
  const responders = await resolveDemoResponders();
  if (responders.length !== RESPONDER_LOCATIONS.length) {
    throw new Error(`Expected five demo responders, found ${responders.length}.`);
  }
  const active = await get(`
    SELECT
      (SELECT COUNT(*)::int FROM online_distress_signals
       WHERE distress_code IN ('DEMO-ODS-VAL-001', 'DEMO-ODS-VAL-002')
         AND status = 'active' AND deleted = 0) AS "distressCount",
      (SELECT COUNT(*)::int FROM distress_deployments
       WHERE deployment_code IN ('DEMO-DPL-VAL-001', 'DEMO-DPL-VAL-002')
         AND status = 'deployed') AS "deploymentCount"
  `);
  if (active.distressCount !== 2 || active.deploymentCount !== 2) {
    throw new Error('Demo distress or deployment state changed; refresh stopped.');
  }

  await transaction(async (trx) => {
    for (const responder of responders) {
      const update = await trx.run(`
        UPDATE rescuer_locations_current
        SET recorded_at = ?, received_at = ?, updated_at = ?
        WHERE rescuer_id = ? AND node_id = ?
      `, [timestamp, timestamp, timestamp, responder.id, state.locationTag]);
      if (update.changes !== 1) {
        throw new Error(`${responder.rescuerCode} location is no longer owned by this demo.`);
      }
    }
    for (const node of NODE_LOCATIONS) {
      const update = await trx.run(`
        UPDATE mesh_nodes SET latitude = ?, longitude = ?, updated_at = ? WHERE node_id = ?
      `, [node.latitude, node.longitude, timestamp, node.nodeId]);
      if (update.changes !== 1) throw new Error(`${node.nodeId} is missing.`);
    }
  });

  state.lastRefreshAt = timestamp;
  state.lastDemoWriteAt = timestamp;
  await writeJsonAtomic(STATE_PATH, state);
  return timestamp;
}

async function watchDemo() {
  const state = await loadState();
  if (state.phase !== 'installed') {
    throw new Error(`Cannot watch demo state in phase '${state.phase}'.`);
  }
  let stopping = false;
  process.once('SIGINT', () => { stopping = true; });
  process.once('SIGTERM', () => { stopping = true; });
  console.log(`Refreshing demo run ${state.runId} every 15 seconds.`);
  console.log('Press Ctrl+C to stop before rollback.');

  while (!stopping) {
    console.log(`Refreshed demo markers at ${await refreshDemo(state)}.`);
    for (let elapsed = 0; elapsed < REFRESH_INTERVAL_MS && !stopping; elapsed += 250) {
      await sleep(Math.min(250, REFRESH_INTERVAL_MS - elapsed));
    }
  }
}

function sameLocation(current, original) {
  if (!current || !original) return current === original;
  return current.deploymentId === original.deploymentId
    && current.teamId === original.teamId
    && sameNumber(current.latitude, original.latitude)
    && sameNumber(current.longitude, original.longitude)
    && sameNumber(current.accuracyM, original.accuracyM)
    && sameNumber(current.headingDeg, original.headingDeg)
    && sameNumber(current.speedMps, original.speedMps)
    && current.nodeId === original.nodeId
    && sameTimestamp(current.recordedAt, original.recordedAt)
    && sameTimestamp(current.receivedAt, original.receivedAt)
    && sameTimestamp(current.updatedAt, original.updatedAt);
}

function sameSharing(current, original) {
  if (!current || !original) return current === original;
  return current.sharingEnabled === original.sharingEnabled
    && sameTimestamp(current.enabledAt, original.enabledAt)
    && sameTimestamp(current.disabledAt, original.disabledAt)
    && sameTimestamp(current.updatedAt, original.updatedAt)
    && sameTimestamp(current.createdAt, original.createdAt);
}

async function rollbackConflicts(state) {
  const current = await findRequiredData();
  const conflicts = [];
  const originals = by(state.original.nodes, 'nodeId');
  const demos = by(state.demo.nodes, 'nodeId');

  for (const node of current.nodes) {
    const demo = demos.get(node.nodeId);
    const original = originals.get(node.nodeId);
    const atDemo = sameNumber(node.latitude, demo.latitude) && sameNumber(node.longitude, demo.longitude);
    const atOriginal = sameNumber(node.latitude, original.latitude) && sameNumber(node.longitude, original.longitude);
    if (!atDemo && !atOriginal) conflicts.push(`${node.nodeId} coordinates changed outside the watcher.`);
  }

  const currentLocations = by(current.locations, 'rescuerId');
  const originalLocations = by(state.original.locations, 'rescuerId');
  for (const rescuer of state.original.rescuers) {
    const active = currentLocations.get(rescuer.id) || null;
    const original = originalLocations.get(rescuer.id) || null;
    if (active?.nodeId === state.locationTag) continue;
    if (!sameLocation(active, original)) conflicts.push(`${rescuer.rescuerCode} location changed during the demo.`);
  }

  const currentSharing = by(current.sharingSettings, 'rescuerId');
  const originalSharing = by(state.original.sharingSettings, 'rescuerId');
  for (const rescuer of state.original.rescuers) {
    const active = currentSharing.get(rescuer.id) || null;
    const original = originalSharing.get(rescuer.id) || null;
    const demoSetting = active?.sharingEnabled === true
      && !active.disabledAt
      && sameTimestamp(active.enabledAt, state.installedAt || state.installStartedAt);
    if (!demoSetting && !sameSharing(active, original)) {
      conflicts.push(`${rescuer.rescuerCode} sharing setting changed during the demo.`);
    }
  }

  const currentTeams = by(current.teams, 'teamCode');
  for (const original of state.original.teams.filter((item) => ['RST-001', 'RST-002'].includes(item.teamCode))) {
    const active = currentTeams.get(original.teamCode);
    if (active && !['dispatched', original.status].includes(active.status)) {
      conflicts.push(`${original.teamCode} status changed to ${active.status}.`);
    }
  }
  const currentRescuers = by(current.rescuers, 'rescuerCode');
  for (const original of state.original.rescuers.filter((item) => ['RSC-001', 'RSC-002'].includes(item.rescuerCode))) {
    const active = currentRescuers.get(original.rescuerCode);
    if (active && !['dispatched', original.status].includes(active.status)) {
      conflicts.push(`${original.rescuerCode} status changed to ${active.status}.`);
    }
  }
  return conflicts;
}

async function restoreLocation(trx, item) {
  await trx.run(`
    INSERT INTO rescuer_locations_current (
      rescuer_id, deployment_id, team_id, latitude, longitude, accuracy_m,
      heading_deg, speed_mps, node_id, recorded_at, received_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(rescuer_id) DO UPDATE SET
      deployment_id = excluded.deployment_id,
      team_id = excluded.team_id,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      accuracy_m = excluded.accuracy_m,
      heading_deg = excluded.heading_deg,
      speed_mps = excluded.speed_mps,
      node_id = excluded.node_id,
      recorded_at = excluded.recorded_at,
      received_at = excluded.received_at,
      updated_at = excluded.updated_at
  `, [
    item.rescuerId, item.deploymentId, item.teamId, item.latitude, item.longitude,
    item.accuracyM, item.headingDeg, item.speedMps, item.nodeId,
    item.recordedAt, item.receivedAt, item.updatedAt
  ]);
}

async function restoreSharing(trx, item) {
  await trx.run(`
    INSERT INTO rescuer_location_sharing_settings (
      rescuer_id, sharing_enabled, enabled_at, disabled_at, updated_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(rescuer_id) DO UPDATE SET
      sharing_enabled = excluded.sharing_enabled,
      enabled_at = excluded.enabled_at,
      disabled_at = excluded.disabled_at,
      updated_at = excluded.updated_at,
      created_at = excluded.created_at
  `, [
    item.rescuerId, item.sharingEnabled, item.enabledAt,
    item.disabledAt, item.updatedAt, item.createdAt
  ]);
}

async function rollbackDemo(force) {
  const state = await loadState(false);
  if (!state) {
    const orphan = await get(`
      SELECT
        (SELECT COUNT(*)::int FROM rescuers WHERE rescuer_code LIKE 'DEMO-RSC-%')
        + (SELECT COUNT(*)::int FROM online_distress_signals WHERE distress_code LIKE 'DEMO-ODS-%')
        + (SELECT COUNT(*)::int FROM distress_deployments WHERE deployment_code LIKE 'DEMO-DPL-%') AS count
    `);
    if (orphan.count) throw new Error('DEMO records exist without a state file; refusing unsafe cleanup.');
    console.log('No active demo-map run exists. Nothing to roll back.');
    return;
  }

  const conflicts = await rollbackConflicts(state);
  if (conflicts.length && !force) {
    throw new Error(`Rollback conflicts detected:\n- ${conflicts.join('\n- ')}\nUse --force only if overwriting them is intentional.`);
  }
  if (conflicts.length) console.warn(`Forcing rollback across ${conflicts.length} conflict(s).`);

  await transaction(async (trx) => {
    await trx.run(`
      DELETE FROM deployment_route_snapshots
      WHERE deployment_id IN (
        SELECT id FROM distress_deployments
        WHERE deployment_code IN ('DEMO-DPL-VAL-001', 'DEMO-DPL-VAL-002')
      )
    `);
    await trx.run(`
      DELETE FROM distress_deployment_members
      WHERE deployment_id IN (
        SELECT id FROM distress_deployments
        WHERE deployment_code IN ('DEMO-DPL-VAL-001', 'DEMO-DPL-VAL-002')
      )
    `);
    await trx.run(`
      UPDATE rescuer_locations_current
      SET deployment_id = NULL
      WHERE deployment_id IN (
        SELECT id FROM distress_deployments
        WHERE deployment_code IN ('DEMO-DPL-VAL-001', 'DEMO-DPL-VAL-002')
      )
        AND node_id = ?
    `, [state.locationTag]);
    await trx.run(`
      DELETE FROM distress_deployments
      WHERE deployment_code IN ('DEMO-DPL-VAL-001', 'DEMO-DPL-VAL-002')
    `);
    await trx.run(`
      DELETE FROM online_distress_signals
      WHERE distress_code IN ('DEMO-ODS-VAL-001', 'DEMO-ODS-VAL-002')
    `);

    const originalLocations = by(state.original.locations, 'rescuerId');
    const originalSharing = by(state.original.sharingSettings, 'rescuerId');
    for (const rescuer of state.original.rescuers) {
      if (originalLocations.has(rescuer.id)) await restoreLocation(trx, originalLocations.get(rescuer.id));
      else await trx.run(`DELETE FROM rescuer_locations_current WHERE rescuer_id = ?`, [rescuer.id]);

      if (originalSharing.has(rescuer.id)) await restoreSharing(trx, originalSharing.get(rescuer.id));
      else await trx.run(`DELETE FROM rescuer_location_sharing_settings WHERE rescuer_id = ?`, [rescuer.id]);
    }

    await trx.run(`
      DELETE FROM rescuer_locations_current
      WHERE rescuer_id IN (
        SELECT id FROM rescuers WHERE rescuer_code IN ('DEMO-RSC-004', 'DEMO-RSC-005')
      )
    `);
    await trx.run(`
      DELETE FROM rescuer_location_sharing_settings
      WHERE rescuer_id IN (
        SELECT id FROM rescuers WHERE rescuer_code IN ('DEMO-RSC-004', 'DEMO-RSC-005')
      )
    `);
    await trx.run(`DELETE FROM rescuers WHERE rescuer_code IN ('DEMO-RSC-004', 'DEMO-RSC-005')`);

    for (const team of state.original.teams.filter((item) => ['RST-001', 'RST-002'].includes(item.teamCode))) {
      await trx.run(`
        UPDATE rescue_teams SET status = ?, updated_at = ? WHERE id = ?
      `, [team.status, team.updatedAt, team.id]);
    }
    for (const rescuer of state.original.rescuers.filter((item) => ['RSC-001', 'RSC-002'].includes(item.rescuerCode))) {
      await trx.run(`
        UPDATE rescuers
        SET status = ?, access_status = ?, archived_at = ?, team_id = ?,
            previous_team_id = ?, updated_at = ?
        WHERE id = ?
      `, [
        rescuer.status, rescuer.accessStatus, rescuer.archivedAt,
        rescuer.teamId, rescuer.previousTeamId, rescuer.updatedAt, rescuer.id
      ]);
    }
    for (const node of state.original.nodes) {
      await trx.run(`
        UPDATE mesh_nodes SET latitude = ?, longitude = ?, updated_at = ? WHERE id = ?
      `, [node.latitude, node.longitude, node.updatedAt, node.id]);
    }
  });

  state.phase = 'rolled_back';
  state.rolledBackAt = nowIso();
  state.rollbackForced = Boolean(force);
  state.rollbackConflicts = conflicts;
  const archivePath = path.join(HISTORY_DIR, `${state.runId}.json`);
  await writeJsonAtomic(archivePath, state);
  await fs.rm(STATE_PATH, { force: true });
  console.log(`Demo run ${state.runId} rolled back successfully.`);
  console.log(`Manifest archived at ${path.relative(config.appRoot, archivePath)}.`);
}

async function showStatus() {
  const state = await loadState(false);
  const counts = await get(`
    SELECT
      (SELECT COUNT(*)::int FROM rescuers WHERE rescuer_code LIKE 'DEMO-RSC-%') AS "demoRescuers",
      (SELECT COUNT(*)::int FROM online_distress_signals WHERE distress_code LIKE 'DEMO-ODS-%') AS "demoDistress",
      (SELECT COUNT(*)::int FROM distress_deployments WHERE deployment_code LIKE 'DEMO-DPL-%') AS "demoDeployments",
      (SELECT COUNT(*)::int FROM deployment_route_snapshots s
       INNER JOIN distress_deployments d ON d.id = s.deployment_id
       WHERE d.deployment_code LIKE 'DEMO-DPL-%') AS "demoRoutes",
      (SELECT COUNT(*)::int FROM rescuer_locations_current
       WHERE node_id LIKE 'DEMO-MAP:%') AS "demoLocations"
  `);

  if (!state) {
    console.log('Demo map status: inactive');
    console.log(JSON.stringify(counts, null, 2));
    if (Object.values(counts).some((value) => Number(value) > 0)) {
      console.warn('Warning: orphaned DEMO records exist without an active state file.');
    }
    return;
  }

  const locations = await all(`
    SELECT r.rescuer_code AS "rescuerCode", l.latitude, l.longitude,
           l.node_id AS "nodeId", l.recorded_at AS "recordedAt",
           CURRENT_TIMESTAMP - l.recorded_at AS age
    FROM rescuer_locations_current l
    INNER JOIN rescuers r ON r.id = l.rescuer_id
    WHERE l.node_id = ?
    ORDER BY r.rescuer_code
  `, [state.locationTag]);
  const routes = await all(`
    SELECT d.deployment_code AS "deploymentCode", s.distance_m AS "distanceM",
           s.duration_s AS "durationS", s.eta_minutes AS "etaMinutes",
           s.provider, LENGTH(s.geometry_json) AS "geometryCharacters"
    FROM deployment_route_snapshots s
    INNER JOIN distress_deployments d ON d.id = s.deployment_id
    WHERE d.deployment_code IN ('DEMO-DPL-VAL-001', 'DEMO-DPL-VAL-002')
    ORDER BY d.deployment_code
  `);
  console.log('Demo map status: active');
  console.log(JSON.stringify({
    runId: state.runId,
    phase: state.phase,
    installedAt: state.installedAt,
    lastRefreshAt: state.lastRefreshAt,
    counts,
    locations,
    routes
  }, null, 2));
}

async function runCheck() {
  if (await exists(STATE_PATH)) {
    const state = await loadState();
    console.log(`Demo run ${state.runId} is already ${state.phase}.`);
    process.exitCode = 1;
    return;
  }
  const result = await preflight();
  printPreflight(result);
  if (result.issues.length) process.exitCode = 1;
}

function parseCommand() {
  const command = String(process.argv[2] || '').trim().toLowerCase();
  if (!['check', 'install', 'watch', 'status', 'rollback'].includes(command)) {
    throw new Error('Usage: npm run demo:map -- <check|install|watch|status|rollback> [--force]');
  }
  return { command, force: process.argv.includes('--force') };
}

async function main() {
  const { command, force } = parseCommand();
  await ensureRuntimeDirectories();

  if (command === 'check') {
    await runCheck();
    return;
  }
  if (command === 'status') {
    await showStatus();
    return;
  }

  const release = await acquireLock(command);
  try {
    if (command === 'install') await installDemo();
    else if (command === 'watch') await watchDemo();
    else if (command === 'rollback') await rollbackDemo(force);
  } finally {
    await release();
  }
}

main()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`Demo map command failed: ${error.message}`);
  })
  .finally(async () => {
    await close();
  });

