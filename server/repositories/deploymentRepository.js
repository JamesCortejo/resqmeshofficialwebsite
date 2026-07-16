const { all, get, run } = require('../database/sqlite');

function formatDeploymentCode(value) {
  return `DPL-${String(value).padStart(3, '0')}`;
}

async function generateDeploymentCode() {
  await run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const row = await get('SELECT last_value FROM deployment_code_sequence WHERE id = 1');
    const nextValue = row.last_value + 1;

    await run('UPDATE deployment_code_sequence SET last_value = ? WHERE id = 1', [nextValue]);
    await run('COMMIT');

    return formatDeploymentCode(nextValue);
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

function listDistressSignals() {
  return all(`
    SELECT
      m.id,
      m.distress_code AS distressCode,
      m.user_code AS userCode,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      m.node_id AS nodeId,
      m.origin_node_id AS originNodeId,
      COALESCE(n.node_name, m.node_id, m.origin_node_id) AS nodeName,
      m.origin_distress_id AS originDistressId,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.status AS distressStatus,
      m.priority,
      m.updated_at AS updatedAt,
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status AS deploymentStatus,
      d.created_at AS deploymentCreatedAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS deploymentUpdatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus,
      r.rescuer_code AS teamLeaderRescuerCode,
      r.first_name_enc AS leaderFirstNameEnc,
      r.middle_name_enc AS leaderMiddleNameEnc,
      r.last_name_enc AS leaderLastNameEnc
    FROM mesh_distress_signals m
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT dd.id
        FROM distress_deployments dd
        WHERE dd.mesh_distress_signal_id = m.id
        ORDER BY
          CASE WHEN dd.status = 'deployed' THEN 0 ELSE 1 END,
          COALESCE(dd.updated_at, dd.created_at) DESC,
          dd.id DESC
        LIMIT 1
      )
    LEFT JOIN mesh_nodes n ON n.node_id = m.origin_node_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    WHERE m.deleted = 0
    ORDER BY
      CASE
        WHEN d.status = 'deployed' THEN 0
        WHEN LOWER(COALESCE(m.status, '')) = 'active' THEN 1
        WHEN d.status = 'accomplished' THEN 2
        WHEN d.status = 'canceled' THEN 3
        WHEN LOWER(COALESCE(m.status, '')) IN ('canceled', 'cancelled') THEN 4
        ELSE 5
      END,
      COALESCE(d.updated_at, m.updated_at, m.timestamp) DESC,
      m.id DESC
  `);
}

function getDistressSignalById(id) {
  return get(`
    SELECT
      m.id,
      m.distress_code AS distressCode,
      m.user_code AS userCode,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      m.node_id AS nodeId,
      m.origin_node_id AS originNodeId,
      COALESCE(n.node_name, m.node_id, m.origin_node_id) AS nodeName,
      m.origin_distress_id AS originDistressId,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.status AS distressStatus,
      m.priority,
      m.updated_at AS updatedAt,
      d.id AS deploymentId,
      d.deployment_code AS deploymentCode,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status AS deploymentStatus,
      d.created_at AS deploymentCreatedAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS deploymentUpdatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus,
      r.rescuer_code AS teamLeaderRescuerCode,
      r.first_name_enc AS leaderFirstNameEnc,
      r.middle_name_enc AS leaderMiddleNameEnc,
      r.last_name_enc AS leaderLastNameEnc
    FROM mesh_distress_signals m
    LEFT JOIN distress_deployments d
      ON d.id = (
        SELECT dd.id
        FROM distress_deployments dd
        WHERE dd.mesh_distress_signal_id = m.id
        ORDER BY
          CASE WHEN dd.status = 'deployed' THEN 0 ELSE 1 END,
          COALESCE(dd.updated_at, dd.created_at) DESC,
          dd.id DESC
        LIMIT 1
      )
    LEFT JOIN mesh_nodes n ON n.node_id = m.origin_node_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    WHERE m.id = ?
      AND m.deleted = 0
    LIMIT 1
  `, [id]);
}

function getActiveDistressSignalById(id) {
  return get(`
    SELECT
      id,
      distress_code AS distressCode,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      blood_type AS bloodType,
      age,
      node_id AS nodeId,
      origin_node_id AS originNodeId,
      origin_distress_id AS originDistressId,
      reason,
      latitude,
      longitude,
      timestamp,
      status AS distressStatus,
      priority,
      updated_at AS updatedAt
    FROM mesh_distress_signals
    WHERE id = ?
      AND deleted = 0
      AND LOWER(COALESCE(status, '')) = 'active'
    LIMIT 1
  `, [id]);
}

function findActiveDeploymentByDistressSignalId(meshDistressSignalId) {
  return get(`
    SELECT
      id,
      deployment_code AS deploymentCode,
      mesh_distress_signal_id AS meshDistressSignalId,
      origin_node_id AS originNodeId,
      origin_distress_id AS originDistressId,
      team_id AS teamId,
      team_leader_rescuer_id AS teamLeaderRescuerId,
      created_by_admin_user_id AS createdByAdminUserId,
      status,
      created_at AS createdAt,
      deployed_at AS deployedAt,
      canceled_at AS canceledAt,
      accomplished_at AS accomplishedAt,
      updated_at AS updatedAt
    FROM distress_deployments
    WHERE mesh_distress_signal_id = ?
      AND status = 'deployed'
    LIMIT 1
  `, [meshDistressSignalId]);
}

function getDeploymentById(id) {
  return get(`
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.created_by_admin_user_id AS createdByAdminUserId,
      d.status,
      d.created_at AS createdAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus
    FROM distress_deployments d
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    WHERE d.id = ?
    LIMIT 1
  `, [id]);
}

function listDeploymentMembers(deploymentId) {
  return all(`
    SELECT
      m.id,
      m.deployment_id AS deploymentId,
      m.rescuer_id AS rescuerId,
      m.rescuer_code AS rescuerCode,
      m.created_at AS createdAt,
      r.first_name_enc AS firstNameEnc,
      r.middle_name_enc AS middleNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      r.team_id AS teamId
    FROM distress_deployment_members m
    LEFT JOIN rescuers r ON r.id = m.rescuer_id
    WHERE m.deployment_id = ?
    ORDER BY m.id ASC
  `, [deploymentId]);
}

async function createDeployment(deployment, members) {
  await run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const created = await run(`
      INSERT INTO distress_deployments (
        deployment_code,
        mesh_distress_signal_id,
        origin_node_id,
        origin_distress_id,
        team_id,
        team_leader_rescuer_id,
        created_by_admin_user_id,
        status,
        created_at,
        deployed_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      deployment.deploymentCode,
      deployment.meshDistressSignalId,
      deployment.originNodeId,
      deployment.originDistressId,
      deployment.teamId,
      deployment.teamLeaderRescuerId,
      deployment.createdByAdminUserId,
      deployment.status,
      deployment.createdAt,
      deployment.deployedAt,
      deployment.updatedAt
    ]);

    for (const member of members) {
      await run(`
        INSERT INTO distress_deployment_members (
          deployment_id,
          rescuer_id,
          rescuer_code,
          created_at
        ) VALUES (?, ?, ?, ?)
      `, [
        created.lastID,
        member.rescuerId,
        member.rescuerCode,
        deployment.createdAt
      ]);
    }

    await run('COMMIT');
    return created;
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

function updateDeploymentStatus(id, status, timestamp) {
  return run(`
    UPDATE distress_deployments
    SET
      status = ?,
      canceled_at = CASE WHEN ? = 'canceled' THEN ? ELSE canceled_at END,
      accomplished_at = CASE WHEN ? = 'accomplished' THEN ? ELSE accomplished_at END,
      updated_at = ?
    WHERE id = ?
  `, [status, status, timestamp, status, timestamp, timestamp, id]);
}

function upsertRescuerLocationCurrent(location) {
  return run(`
    INSERT INTO rescuer_locations_current (
      rescuer_id,
      deployment_id,
      team_id,
      latitude,
      longitude,
      accuracy_m,
      heading_deg,
      speed_mps,
      node_id,
      recorded_at,
      received_at,
      updated_at
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
    location.rescuerId,
    location.deploymentId,
    location.teamId,
    location.latitude,
    location.longitude,
    location.accuracyM,
    location.headingDeg,
    location.speedMps,
    location.nodeId,
    location.recordedAt,
    location.receivedAt,
    location.updatedAt
  ]);
}

function insertRescuerLocationHistory(location) {
  return run(`
    INSERT INTO rescuer_location_history (
      rescuer_id,
      deployment_id,
      team_id,
      latitude,
      longitude,
      accuracy_m,
      heading_deg,
      speed_mps,
      node_id,
      recorded_at,
      received_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    location.rescuerId,
    location.deploymentId,
    location.teamId,
    location.latitude,
    location.longitude,
    location.accuracyM,
    location.headingDeg,
    location.speedMps,
    location.nodeId,
    location.recordedAt,
    location.receivedAt
  ]);
}

function getRescuerLocationCurrentByRescuerId(rescuerId) {
  return get(`
    SELECT
      rescuer_id AS rescuerId,
      deployment_id AS deploymentId,
      team_id AS teamId,
      latitude,
      longitude,
      accuracy_m AS accuracyM,
      heading_deg AS headingDeg,
      speed_mps AS speedMps,
      node_id AS nodeId,
      recorded_at AS recordedAt,
      received_at AS receivedAt,
      updated_at AS updatedAt
    FROM rescuer_locations_current
    WHERE rescuer_id = ?
    LIMIT 1
  `, [rescuerId]);
}

function upsertDeploymentRouteSnapshot(snapshot) {
  return run(`
    INSERT INTO deployment_route_snapshots (
      deployment_id,
      leader_rescuer_id,
      leader_recorded_at,
      destination_latitude,
      destination_longitude,
      distance_m,
      duration_s,
      eta_minutes,
      geometry_json,
      provider,
      computed_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(deployment_id) DO UPDATE SET
      leader_rescuer_id = excluded.leader_rescuer_id,
      leader_recorded_at = excluded.leader_recorded_at,
      destination_latitude = excluded.destination_latitude,
      destination_longitude = excluded.destination_longitude,
      distance_m = excluded.distance_m,
      duration_s = excluded.duration_s,
      eta_minutes = excluded.eta_minutes,
      geometry_json = excluded.geometry_json,
      provider = excluded.provider,
      computed_at = excluded.computed_at,
      updated_at = excluded.updated_at
  `, [
    snapshot.deploymentId,
    snapshot.leaderRescuerId,
    snapshot.leaderRecordedAt,
    snapshot.destinationLatitude,
    snapshot.destinationLongitude,
    snapshot.distanceM,
    snapshot.durationS,
    snapshot.etaMinutes,
    snapshot.geometryJson,
    snapshot.provider,
    snapshot.computedAt,
    snapshot.updatedAt
  ]);
}

function getDeploymentRouteSnapshotByDeploymentId(deploymentId) {
  return get(`
    SELECT
      id,
      deployment_id AS deploymentId,
      leader_rescuer_id AS leaderRescuerId,
      leader_recorded_at AS leaderRecordedAt,
      destination_latitude AS destinationLatitude,
      destination_longitude AS destinationLongitude,
      distance_m AS distanceM,
      duration_s AS durationS,
      eta_minutes AS etaMinutes,
      geometry_json AS geometryJson,
      provider,
      computed_at AS computedAt,
      updated_at AS updatedAt
    FROM deployment_route_snapshots
    WHERE deployment_id = ?
    LIMIT 1
  `, [deploymentId]);
}

function listActiveAssignmentsForRescuer(rescuerId) {
  return all(`
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status,
      d.created_at AS createdAt,
      d.deployed_at AS deployedAt,
      d.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      m.distress_code AS distressCode,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.priority,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      n.node_id AS nodeId,
      n.node_name AS nodeName,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    LEFT JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    WHERE dm.rescuer_id = ?
      AND d.status = 'deployed'
      AND m.deleted = 0
    ORDER BY COALESCE(d.deployed_at, d.created_at) DESC, d.id DESC
  `, [rescuerId]);
}

function listAssignmentsForRescuer(rescuerId) {
  return all(`
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status,
      d.created_at AS createdAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      m.distress_code AS distressCode,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.priority,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      n.node_id AS nodeId,
      n.node_name AS nodeName,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    LEFT JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    WHERE dm.rescuer_id = ?
      AND d.status IN ('deployed', 'accomplished', 'canceled')
      AND m.deleted = 0
    ORDER BY COALESCE(d.updated_at, d.deployed_at, d.created_at) DESC, d.id DESC
  `, [rescuerId]);
}

function findActiveAssignmentForRescuer(rescuerId) {
  return get(`
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status,
      d.created_at AS createdAt,
      d.deployed_at AS deployedAt,
      d.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      m.distress_code AS distressCode,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.priority,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      n.node_id AS nodeId,
      n.node_name AS nodeName
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    WHERE dm.rescuer_id = ?
      AND d.status = 'deployed'
      AND m.deleted = 0
    ORDER BY COALESCE(d.deployed_at, d.created_at) DESC, d.id DESC
    LIMIT 1
  `, [rescuerId]);
}

function findActiveDeploymentByOrigin(originNodeId, originDistressId) {
  return get(`
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status,
      d.created_at AS createdAt,
      d.deployed_at AS deployedAt,
      d.updated_at AS updatedAt,
      m.distress_code AS distressCode,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.priority,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age
    FROM distress_deployments d
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    WHERE d.origin_node_id = ?
      AND d.origin_distress_id = ?
      AND d.status = 'deployed'
      AND m.deleted = 0
    ORDER BY COALESCE(d.deployed_at, d.created_at) DESC, d.id DESC
    LIMIT 1
  `, [originNodeId, originDistressId]);
}

function getLatestDeploymentByDistressSignalId(meshDistressSignalId) {
  return get(`
    SELECT
      id,
      deployment_code AS deploymentCode,
      mesh_distress_signal_id AS meshDistressSignalId,
      origin_node_id AS originNodeId,
      origin_distress_id AS originDistressId,
      team_id AS teamId,
      team_leader_rescuer_id AS teamLeaderRescuerId,
      status,
      created_at AS createdAt,
      deployed_at AS deployedAt,
      canceled_at AS canceledAt,
      accomplished_at AS accomplishedAt,
      updated_at AS updatedAt
    FROM distress_deployments
    WHERE mesh_distress_signal_id = ?
    ORDER BY COALESCE(updated_at, created_at) DESC, id DESC
    LIMIT 1
  `, [meshDistressSignalId]);
}

function getLatestDeployedAssignment() {
  return get(`
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status,
      d.created_at AS createdAt,
      d.deployed_at AS deployedAt,
      d.updated_at AS updatedAt,
      m.distress_code AS distressCode,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.priority,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      n.node_name AS nodeName
    FROM distress_deployments d
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    WHERE d.status = 'deployed'
      AND m.deleted = 0
    ORDER BY COALESCE(d.deployed_at, d.created_at) DESC, d.id DESC
    LIMIT 1
  `);
}

function listActiveDeployedAssignments() {
  return all(`
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.status,
      d.created_at AS createdAt,
      d.deployed_at AS deployedAt,
      d.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus,
      m.distress_code AS distressCode,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp,
      m.priority,
      m.first_name AS firstName,
      m.last_name AS lastName,
      m.phone,
      m.blood_type AS bloodType,
      m.age,
      n.node_id AS nodeId,
      n.node_name AS nodeName
    FROM distress_deployments d
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    WHERE d.status = 'deployed'
      AND m.deleted = 0
    ORDER BY COALESCE(d.deployed_at, d.created_at) DESC, d.id DESC
  `);
}

function listDeploymentsForSync(cursor, limit) {
  return all(`
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      d.team_leader_rescuer_id AS teamLeaderRescuerId,
      d.created_by_admin_user_id AS createdByAdminUserId,
      d.status,
      d.created_at AS createdAt,
      d.deployed_at AS deployedAt,
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS updatedAt,
      t.team_code AS teamCode,
      r.rescuer_code AS teamLeaderRescuerCode
    FROM distress_deployments d
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    WHERE d.updated_at > ?
       OR (d.updated_at = ? AND d.id > ?)
    ORDER BY d.updated_at ASC, d.id ASC
    LIMIT ?
  `, [
    cursor.updatedAt,
    cursor.updatedAt,
    cursor.id,
    limit
  ]);
}

function listDeploymentRouteSnapshotsForSync(cursor, limit) {
  return all(`
    SELECT
      s.id,
      s.deployment_id AS deploymentId,
      s.leader_rescuer_id AS leaderRescuerId,
      s.leader_recorded_at AS leaderRecordedAt,
      s.destination_latitude AS destinationLatitude,
      s.destination_longitude AS destinationLongitude,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.provider,
      s.computed_at AS computedAt,
      s.updated_at AS updatedAt,
      d.status AS deploymentStatus,
      d.origin_node_id AS originNodeId,
      d.origin_distress_id AS originDistressId,
      d.team_id AS teamId,
      r.rescuer_code AS leaderRescuerCode
    FROM deployment_route_snapshots s
    INNER JOIN distress_deployments d ON d.id = s.deployment_id
    LEFT JOIN rescuers r ON r.id = s.leader_rescuer_id
    WHERE d.status = 'deployed'
      AND (
        s.updated_at > ?
        OR (s.updated_at = ? AND s.id > ?)
      )
    ORDER BY s.updated_at ASC, s.id ASC
    LIMIT ?
  `, [
    cursor.updatedAt,
    cursor.updatedAt,
    cursor.id,
    limit
  ]);
}

function listDeploymentMemberCodes(deploymentIds) {
  if (!Array.isArray(deploymentIds) || deploymentIds.length === 0) {
    return Promise.resolve([]);
  }

  const placeholders = deploymentIds.map(() => '?').join(', ');

  return all(`
    SELECT
      deployment_id AS deploymentId,
      rescuer_id AS rescuerId,
      rescuer_code AS rescuerCode
    FROM distress_deployment_members
    WHERE deployment_id IN (${placeholders})
    ORDER BY id ASC
  `, deploymentIds);
}

function listPublicNodes() {
  return all(`
    SELECT
      n.node_id AS id,
      n.node_name AS name,
      n.latitude,
      n.longitude,
      n.status,
      n.last_seen_at AS lastSeen,
      n.users_connected AS users,
      CASE WHEN EXISTS (
        SELECT 1
        FROM mesh_distress_signals m
        WHERE m.origin_node_id = n.node_id
          AND m.deleted = 0
          AND LOWER(COALESCE(m.status, '')) = 'active'
      ) THEN 1 ELSE 0 END AS distress,
      (
        SELECT m.id
        FROM mesh_distress_signals m
        WHERE m.origin_node_id = n.node_id
          AND m.deleted = 0
          AND LOWER(COALESCE(m.status, '')) = 'active'
        ORDER BY COALESCE(m.updated_at, m.timestamp) DESC, m.id DESC
        LIMIT 1
      ) AS activeDistressId
    FROM mesh_nodes n
    WHERE n.deleted = 0
    ORDER BY COALESCE(n.updated_at, n.created_at) DESC, n.id DESC
  `);
}

function getNodeActiveDistress(nodeId) {
  return get(`
    SELECT
      id,
      distress_code AS distressCode,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      blood_type AS bloodType,
      age,
      origin_node_id AS originNodeId,
      origin_distress_id AS originDistressId,
      reason,
      latitude,
      longitude,
      timestamp,
      status,
      priority
    FROM mesh_distress_signals
    WHERE origin_node_id = ?
      AND deleted = 0
      AND LOWER(COALESCE(status, '')) = 'active'
    ORDER BY COALESCE(updated_at, timestamp) DESC, id DESC
    LIMIT 1
  `, [nodeId]);
}

module.exports = {
  generateDeploymentCode,
  listDistressSignals,
  getDistressSignalById,
  getActiveDistressSignalById,
  findActiveDeploymentByDistressSignalId,
  getDeploymentById,
  listDeploymentMembers,
  createDeployment,
  updateDeploymentStatus,
  upsertRescuerLocationCurrent,
  insertRescuerLocationHistory,
  getRescuerLocationCurrentByRescuerId,
  upsertDeploymentRouteSnapshot,
  getDeploymentRouteSnapshotByDeploymentId,
  listActiveAssignmentsForRescuer,
  listAssignmentsForRescuer,
  findActiveAssignmentForRescuer,
  findActiveDeploymentByOrigin,
  getLatestDeploymentByDistressSignalId,
  getLatestDeployedAssignment,
  listActiveDeployedAssignments,
  listDeploymentsForSync,
  listDeploymentRouteSnapshotsForSync,
  listDeploymentMemberCodes,
  listPublicNodes,
  getNodeActiveDistress
};
