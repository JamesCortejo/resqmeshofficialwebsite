const { all } = require('../../database/postgres');

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
    WHERE d.distress_source = 'mesh'
      AND (
        d.updated_at > ?
        OR (d.updated_at = ? AND d.id > ?)
      )
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
      AND d.distress_source = 'mesh'
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

module.exports = {
  listDeploymentsForSync,
  listDeploymentRouteSnapshotsForSync
};
