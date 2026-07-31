const { all, get, run } = require('../../database/postgres');

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

function getRescuerLocationSharingSettingByRescuerId(rescuerId) {
  return get(`
    SELECT
      rescuer_id AS rescuerId,
      sharing_enabled AS sharingEnabled,
      enabled_at AS enabledAt,
      disabled_at AS disabledAt,
      updated_at AS updatedAt,
      created_at AS createdAt
    FROM rescuer_location_sharing_settings
    WHERE rescuer_id = ?
    LIMIT 1
  `, [rescuerId]);
}

function upsertRescuerLocationSharingSetting(setting) {
  return run(`
    INSERT INTO rescuer_location_sharing_settings (
      rescuer_id,
      sharing_enabled,
      enabled_at,
      disabled_at,
      updated_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, COALESCE((
      SELECT created_at
      FROM rescuer_location_sharing_settings
      WHERE rescuer_id = ?
    ), ?))
    ON CONFLICT(rescuer_id) DO UPDATE SET
      sharing_enabled = excluded.sharing_enabled,
      enabled_at = excluded.enabled_at,
      disabled_at = excluded.disabled_at,
      updated_at = excluded.updated_at
  `, [
    setting.rescuerId,
    setting.sharingEnabled,
    setting.enabledAt,
    setting.disabledAt,
    setting.updatedAt,
    setting.rescuerId,
    setting.createdAt || setting.updatedAt
  ]);
}

function disableRescuerLocationSharingByRescuerId(rescuerId, timestamp) {
  return run(`
    INSERT INTO rescuer_location_sharing_settings (
      rescuer_id,
      sharing_enabled,
      enabled_at,
      disabled_at,
      updated_at,
      created_at
    ) VALUES (?, FALSE, NULL, ?, ?, ?)
    ON CONFLICT(rescuer_id) DO UPDATE SET
      sharing_enabled = FALSE,
      enabled_at = NULL,
      disabled_at = excluded.disabled_at,
      updated_at = excluded.updated_at
  `, [rescuerId, timestamp, timestamp, timestamp]);
}

function listPublicSharedRescuers(cutoffTimestamp) {
  return all(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      t.id AS teamId,
      t.team_code AS teamCode,
      t.name AS teamName,
      l.latitude,
      l.longitude,
      l.accuracy_m AS accuracyM,
      l.heading_deg AS headingDeg,
      l.speed_mps AS speedMps,
      l.node_id AS nodeId,
      l.recorded_at AS recordedAt,
      l.updated_at AS updatedAt
    FROM rescuer_location_sharing_settings s
    INNER JOIN rescuers r ON r.id = s.rescuer_id
    INNER JOIN rescuer_locations_current l ON l.rescuer_id = r.id
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    WHERE s.sharing_enabled = TRUE
      AND r.access_status = 'active'
      AND l.recorded_at >= ?
    ORDER BY l.recorded_at DESC, r.id ASC
  `, [cutoffTimestamp]);
}

module.exports = {
  upsertRescuerLocationCurrent,
  insertRescuerLocationHistory,
  getRescuerLocationCurrentByRescuerId,
  getRescuerLocationSharingSettingByRescuerId,
  upsertRescuerLocationSharingSetting,
  disableRescuerLocationSharingByRescuerId,
  listPublicSharedRescuers
};
