const { all, get, run, transaction } = require('../../database/postgres');

function findActiveDeploymentByOnlineDistressSignalId(onlineDistressSignalId) {
  return get(`
    SELECT
      id,
      deployment_code AS deploymentCode,
      mesh_distress_signal_id AS meshDistressSignalId,
      online_distress_signal_id AS onlineDistressSignalId,
      distress_source AS distressSource,
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
    WHERE online_distress_signal_id = ?
      AND distress_source = 'online'
      AND status = 'deployed'
    LIMIT 1
  `, [onlineDistressSignalId]);
}

function findActiveDeploymentByDistressSignalId(meshDistressSignalId) {
  return get(`
    SELECT
      id,
      deployment_code AS deploymentCode,
      mesh_distress_signal_id AS meshDistressSignalId,
      online_distress_signal_id AS onlineDistressSignalId,
      distress_source AS distressSource,
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
      AND distress_source = 'mesh'
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
      d.online_distress_signal_id AS onlineDistressSignalId,
      d.distress_source AS distressSource,
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
  return transaction(async (trx) => {
    const existingActiveDeployment = await trx.get(`
      SELECT id
      FROM distress_deployments
      WHERE status = 'deployed'
        AND distress_source = ?
        AND (
          (? = 'online' AND online_distress_signal_id = ?)
          OR
          (? = 'mesh' AND mesh_distress_signal_id = ?)
        )
      LIMIT 1
    `, [
      deployment.distressSource || 'mesh',
      deployment.distressSource || 'mesh',
      deployment.onlineDistressSignalId ?? null,
      deployment.distressSource || 'mesh',
      deployment.meshDistressSignalId ?? null
    ]);

    if (existingActiveDeployment) {
      const error = new Error('This distress signal already has an active deployed team.');
      error.statusCode = 409;
      throw error;
    }

    const teamUpdate = await trx.run(`
      UPDATE rescue_teams
      SET
        status = 'dispatched',
        updated_at = ?
      WHERE id = ? AND status = 'active'
    `, [deployment.updatedAt, deployment.teamId]);

    if (!teamUpdate.changes) {
      const error = new Error('Selected rescue team is not currently deployable.');
      error.statusCode = 400;
      throw error;
    }

    const created = await trx.run(`
      INSERT INTO distress_deployments (
        deployment_code,
        mesh_distress_signal_id,
        online_distress_signal_id,
        distress_source,
        origin_node_id,
        origin_distress_id,
        team_id,
        team_leader_rescuer_id,
        created_by_admin_user_id,
        status,
        created_at,
        deployed_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [
      deployment.deploymentCode,
      deployment.meshDistressSignalId ?? null,
      deployment.onlineDistressSignalId ?? null,
      deployment.distressSource || 'mesh',
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
      await trx.run(`
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

    const memberIds = members.map((member) => member.rescuerId).filter(Boolean);

    if (memberIds.length > 0) {
      const placeholders = memberIds.map(() => '?').join(', ');
      await trx.run(`
        UPDATE rescuers
        SET
          status = 'dispatched',
          updated_at = ?
        WHERE access_status = 'active'
          AND id IN (${placeholders})
      `, [deployment.updatedAt, ...memberIds]);
    }

    return created;
  });
}

async function updateDeploymentStatus(id, status, timestamp) {
  return transaction(async (trx) => {
    const result = await trx.run(`
      UPDATE distress_deployments
      SET
        status = ?,
        canceled_at = CASE WHEN ? = 'canceled' THEN ? ELSE canceled_at END,
        accomplished_at = CASE WHEN ? = 'accomplished' THEN ? ELSE accomplished_at END,
        updated_at = ?
      WHERE id = ?
        AND status = 'deployed'
    `, [status, status, timestamp, status, timestamp, timestamp, id]);

    if (!result.changes) {
      return result;
    }

    const deployment = await trx.get(`
      SELECT team_id AS teamId
      FROM distress_deployments
      WHERE id = ?
      LIMIT 1
    `, [id]);

    if (deployment?.teamId) {
      await trx.run(`
        UPDATE rescue_teams
        SET
          status = 'active',
          updated_at = ?
        WHERE id = ?
          AND status = 'dispatched'
          AND NOT EXISTS (
            SELECT 1
            FROM distress_deployments
            WHERE team_id = ?
              AND status = 'deployed'
              AND id <> ?
          )
      `, [timestamp, deployment.teamId, deployment.teamId, id]);

      await trx.run(`
        UPDATE rescuers
        SET
          status = 'available',
          updated_at = ?
        WHERE access_status = 'active'
          AND status = 'dispatched'
          AND id IN (
            SELECT rescuer_id
            FROM distress_deployment_members
            WHERE deployment_id = ?
          )
          AND NOT EXISTS (
            SELECT 1
            FROM distress_deployment_members other_members
            INNER JOIN distress_deployments other_deployments
              ON other_deployments.id = other_members.deployment_id
            WHERE other_members.rescuer_id = rescuers.id
              AND other_deployments.status = 'deployed'
              AND other_deployments.id <> ?
          )
      `, [timestamp, id, id]);
    }

    return result;
  });
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
    SELECT *
    FROM (
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.online_distress_signal_id AS onlineDistressSignalId,
      d.distress_source AS distressSource,
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
      NULL AS occupation,
      n.node_id AS nodeId,
      n.node_name AS nodeName
    FROM distress_deployments d
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    WHERE d.status = 'deployed'
      AND d.distress_source = 'mesh'
      AND m.deleted = 0
    UNION ALL
    SELECT
      d.id,
      d.deployment_code AS deploymentCode,
      d.mesh_distress_signal_id AS meshDistressSignalId,
      d.online_distress_signal_id AS onlineDistressSignalId,
      d.distress_source AS distressSource,
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
      o.distress_code AS distressCode,
      o.reason,
      o.latitude,
      o.longitude,
      o.recorded_at AS timestamp,
      'high' AS priority,
      o.first_name AS firstName,
      o.last_name AS lastName,
      o.phone,
      o.blood_type AS bloodType,
      o.age,
      o.occupation,
      NULL AS nodeId,
      'Civilian online location' AS nodeName
    FROM distress_deployments d
    INNER JOIN online_distress_signals o ON o.id = d.online_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    WHERE d.status = 'deployed'
      AND d.distress_source = 'online'
      AND o.deleted = 0
      AND o.status = 'active'
    ) assignments
    ORDER BY COALESCE("deployedAt", "createdAt") DESC, id DESC
  `);
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

module.exports = {
  findActiveDeploymentByOnlineDistressSignalId,
  findActiveDeploymentByDistressSignalId,
  getDeploymentById,
  listDeploymentMembers,
  createDeployment,
  updateDeploymentStatus,
  findActiveDeploymentByOrigin,
  getLatestDeploymentByDistressSignalId,
  getLatestDeployedAssignment,
  listActiveDeployedAssignments,
  listDeploymentMemberCodes
};
