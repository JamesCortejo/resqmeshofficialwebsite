const { all, get } = require('../../database/postgres');

function listActiveMeshIncidentsForVisibility(rescuerId = null) {
  return all(`
    SELECT
      m.id,
      m.distress_code AS "distressCode",
      m.user_code AS "userCode",
      m.first_name AS "firstName",
      m.last_name AS "lastName",
      m.phone,
      m.blood_type AS "bloodType",
      m.age,
      m.reason,
      m.latitude,
      m.longitude,
      m.timestamp AS "recordedAt",
      m.priority,
      m.origin_node_id AS "originNodeId",
      d.id AS "deploymentId",
      EXISTS (
        SELECT 1
        FROM distress_deployment_members dm
        WHERE dm.deployment_id = d.id AND dm.rescuer_id = ?
      ) AS "isAssignedMember"
    FROM mesh_distress_signals m
    LEFT JOIN distress_deployments d
      ON d.mesh_distress_signal_id = m.id
      AND d.distress_source = 'mesh'
      AND d.status = 'deployed'
    WHERE m.deleted = 0
      AND LOWER(COALESCE(m.status, '')) = 'active'
    ORDER BY COALESCE(m.updated_at, m.timestamp) DESC, m.id DESC
  `, [rescuerId]);
}

function listActiveOnlineIncidentsForVisibility(rescuerId = null) {
  return all(`
    SELECT
      o.id,
      o.distress_code AS "distressCode",
      o.user_id AS "userId",
      o.user_code AS "userCode",
      o.first_name AS "firstName",
      o.last_name AS "lastName",
      o.phone,
      o.blood_type AS "bloodType",
      o.age,
      o.occupation,
      o.reason,
      o.latitude,
      o.longitude,
      o.recorded_at AS "recordedAt",
      d.id AS "deploymentId",
      EXISTS (
        SELECT 1
        FROM distress_deployment_members dm
        WHERE dm.deployment_id = d.id AND dm.rescuer_id = ?
      ) AS "isAssignedMember"
    FROM online_distress_signals o
    LEFT JOIN distress_deployments d
      ON d.online_distress_signal_id = o.id
      AND d.distress_source = 'online'
      AND d.status = 'deployed'
    WHERE o.deleted = 0
      AND o.status = 'active'
    ORDER BY o.recorded_at DESC, o.id DESC
  `, [rescuerId]);
}

function findActiveAssignmentForCivilian(userId, userCode) {
  return get(`
    SELECT * FROM (
      SELECT
        d.id,
        d.deployment_code AS "deploymentCode",
        d.mesh_distress_signal_id AS "meshDistressSignalId",
        d.online_distress_signal_id AS "onlineDistressSignalId",
        d.distress_source AS "distressSource",
        d.origin_node_id AS "originNodeId",
        d.origin_distress_id AS "originDistressId",
        d.team_id AS "teamId",
        d.team_leader_rescuer_id AS "teamLeaderRescuerId",
        d.status,
        d.created_at AS "createdAt",
        d.deployed_at AS "deployedAt",
        d.updated_at AS "updatedAt",
        t.team_code AS "teamCode",
        t.name AS "teamName",
        t.status AS "teamStatus",
        m.distress_code AS "distressCode",
        m.reason,
        m.latitude,
        m.longitude,
        m.timestamp,
        m.priority,
        m.first_name AS "firstName",
        m.last_name AS "lastName",
        m.phone,
        m.blood_type AS "bloodType",
        m.age,
        NULL AS occupation,
        n.node_id AS "nodeId",
        n.node_name AS "nodeName"
      FROM distress_deployments d
      INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
      LEFT JOIN rescue_teams t ON t.id = d.team_id
      LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
      WHERE d.status = 'deployed'
        AND d.distress_source = 'mesh'
        AND m.deleted = 0
        AND LOWER(COALESCE(m.status, '')) = 'active'
        AND m.user_code = ?
      UNION ALL
      SELECT
        d.id,
        d.deployment_code AS "deploymentCode",
        d.mesh_distress_signal_id AS "meshDistressSignalId",
        d.online_distress_signal_id AS "onlineDistressSignalId",
        d.distress_source AS "distressSource",
        d.origin_node_id AS "originNodeId",
        d.origin_distress_id AS "originDistressId",
        d.team_id AS "teamId",
        d.team_leader_rescuer_id AS "teamLeaderRescuerId",
        d.status,
        d.created_at AS "createdAt",
        d.deployed_at AS "deployedAt",
        d.updated_at AS "updatedAt",
        t.team_code AS "teamCode",
        t.name AS "teamName",
        t.status AS "teamStatus",
        o.distress_code AS "distressCode",
        o.reason,
        o.latitude,
        o.longitude,
        o.recorded_at AS timestamp,
        'high' AS priority,
        o.first_name AS "firstName",
        o.last_name AS "lastName",
        o.phone,
        o.blood_type AS "bloodType",
        o.age,
        o.occupation,
        NULL AS "nodeId",
        'Civilian online location' AS "nodeName"
      FROM distress_deployments d
      INNER JOIN online_distress_signals o ON o.id = d.online_distress_signal_id
      LEFT JOIN rescue_teams t ON t.id = d.team_id
      WHERE d.status = 'deployed'
        AND d.distress_source = 'online'
        AND o.deleted = 0
        AND o.status = 'active'
        AND o.user_id = ?
    ) owned
    ORDER BY COALESCE("deployedAt", "createdAt") DESC, id DESC
    LIMIT 1
  `, [userCode, userId]);
}

module.exports = {
  findActiveAssignmentForCivilian,
  listActiveMeshIncidentsForVisibility,
  listActiveOnlineIncidentsForVisibility
};
