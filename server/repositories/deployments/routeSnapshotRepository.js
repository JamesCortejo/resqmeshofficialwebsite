const { get, run } = require('../../database/postgres');

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

module.exports = {
  upsertDeploymentRouteSnapshot,
  getDeploymentRouteSnapshotByDeploymentId
};
