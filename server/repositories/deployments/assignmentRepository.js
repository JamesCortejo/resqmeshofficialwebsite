const { all, get } = require('../../database/postgres');

function listActiveAssignmentsForRescuer(rescuerId) {
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
      n.node_name AS nodeName,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.provider AS routeProvider,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    LEFT JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    WHERE dm.rescuer_id = ?
      AND d.status = 'deployed'
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
      'Civilian online location' AS nodeName,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.provider AS routeProvider,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN online_distress_signals o ON o.id = d.online_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    WHERE dm.rescuer_id = ?
      AND d.status = 'deployed'
      AND d.distress_source = 'online'
      AND o.deleted = 0
    ) assignments
    ORDER BY COALESCE("deployedAt", "createdAt") DESC, id DESC
  `, [rescuerId, rescuerId]);
}

function listAssignmentsForRescuer(rescuerId) {
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
      NULL AS occupation,
      n.node_id AS nodeId,
      n.node_name AS nodeName,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.provider AS routeProvider,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    LEFT JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    WHERE dm.rescuer_id = ?
      AND d.status IN ('deployed', 'accomplished', 'canceled')
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
      d.canceled_at AS canceledAt,
      d.accomplished_at AS accomplishedAt,
      d.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
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
      'Civilian online location' AS nodeName,
      s.distance_m AS distanceM,
      s.duration_s AS durationS,
      s.eta_minutes AS etaMinutes,
      s.geometry_json AS geometryJson,
      s.provider AS routeProvider,
      s.updated_at AS routeUpdatedAt
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN online_distress_signals o ON o.id = d.online_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN deployment_route_snapshots s ON s.deployment_id = d.id
    WHERE dm.rescuer_id = ?
      AND d.status IN ('deployed', 'accomplished', 'canceled')
      AND d.distress_source = 'online'
      AND o.deleted = 0
    ) assignments
    ORDER BY COALESCE("updatedAt", "deployedAt", "createdAt") DESC, id DESC
  `, [rescuerId, rescuerId]);
}

function findActiveAssignmentForRescuer(rescuerId) {
  return get(`
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
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN mesh_nodes n ON n.node_id = d.origin_node_id
    WHERE dm.rescuer_id = ?
      AND d.status = 'deployed'
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
    FROM distress_deployment_members dm
    INNER JOIN distress_deployments d ON d.id = dm.deployment_id
    INNER JOIN online_distress_signals o ON o.id = d.online_distress_signal_id
    LEFT JOIN rescue_teams t ON t.id = d.team_id
    WHERE dm.rescuer_id = ?
      AND d.status = 'deployed'
      AND d.distress_source = 'online'
      AND o.deleted = 0
      AND o.status = 'active'
    ) assignments
    ORDER BY COALESCE("deployedAt", "createdAt") DESC, id DESC
    LIMIT 1
  `, [rescuerId, rescuerId]);
}

module.exports = {
  listActiveAssignmentsForRescuer,
  listAssignmentsForRescuer,
  findActiveAssignmentForRescuer
};
