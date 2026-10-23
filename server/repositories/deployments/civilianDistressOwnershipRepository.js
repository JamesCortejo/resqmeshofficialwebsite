const { get, run } = require('../../database/postgres');

function lockCivilianDistressOwnership(userCode) {
  return get(`
    SELECT pg_advisory_xact_lock(hashtext(?)) AS locked
  `, [`civilian-distress:${String(userCode || '').trim()}`]);
}

function findActiveCivilianDistress(userId, userCode) {
  return get(`
    SELECT *
    FROM (
      SELECT
        o.id,
        'online' AS "sourceType",
        o.id AS "sourceId",
        NULL::TEXT AS "originNodeId",
        o.distress_code AS "distressCode",
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
        o.accuracy_m AS "accuracyM",
        o.recorded_at AS "recordedAt",
        o.status,
        o.updated_at AS "updatedAt",
        EXISTS (
          SELECT 1 FROM distress_deployments d
          WHERE d.online_distress_signal_id = o.id
            AND d.distress_source = 'online'
            AND d.status = 'deployed'
        ) AS "hasDeployment"
      FROM online_distress_signals o
      WHERE o.user_id = ? AND o.status = 'active' AND o.deleted = 0

      UNION ALL

      SELECT
        m.id,
        'mesh' AS "sourceType",
        m.id AS "sourceId",
        m.origin_node_id AS "originNodeId",
        m.distress_code AS "distressCode",
        m.user_code AS "userCode",
        m.first_name AS "firstName",
        m.last_name AS "lastName",
        m.phone,
        m.blood_type AS "bloodType",
        m.age,
        NULL::TEXT AS occupation,
        m.reason,
        m.latitude,
        m.longitude,
        NULL::DOUBLE PRECISION AS "accuracyM",
        m.timestamp AS "recordedAt",
        m.status,
        m.updated_at AS "updatedAt",
        EXISTS (
          SELECT 1 FROM distress_deployments d
          WHERE d.mesh_distress_signal_id = m.id
            AND d.distress_source = 'mesh'
            AND d.status = 'deployed'
        ) AS "hasDeployment"
      FROM mesh_distress_signals m
      WHERE m.user_code = ?
        AND LOWER(COALESCE(m.status, '')) = 'active'
        AND m.deleted = 0
    ) active
    ORDER BY "hasDeployment" DESC, "recordedAt" ASC NULLS LAST, "sourceType" ASC, id ASC
    LIMIT 1
  `, [userId, userCode]);
}

function findActiveMeshDistressByUserCode(userCode) {
  return get(`
    SELECT
      id,
      origin_node_id AS "originNodeId",
      origin_distress_id AS "originDistressId",
      distress_code AS "distressCode",
      user_code AS "userCode",
      first_name AS "firstName",
      last_name AS "lastName",
      phone,
      blood_type AS "bloodType",
      age,
      reason,
      latitude,
      longitude,
      timestamp AS "recordedAt",
      status,
      updated_at AS "updatedAt"
    FROM mesh_distress_signals
    WHERE user_code = ?
      AND LOWER(COALESCE(status, '')) = 'active'
      AND deleted = 0
    ORDER BY timestamp ASC NULLS LAST, id ASC
    LIMIT 1
  `, [userCode]);
}

function findMeshDistressByIdForUser(id, userCode) {
  return get(`
    SELECT
      id,
      origin_node_id AS "originNodeId",
      origin_distress_id AS "originDistressId",
      distress_code AS "distressCode",
      user_code AS "userCode",
      first_name AS "firstName",
      last_name AS "lastName",
      phone,
      blood_type AS "bloodType",
      age,
      reason,
      latitude,
      longitude,
      timestamp AS "recordedAt",
      status,
      updated_at AS "updatedAt",
      deleted
    FROM mesh_distress_signals
    WHERE id = ? AND user_code = ? AND deleted = 0
    LIMIT 1
  `, [id, userCode]);
}

function cancelActiveMeshDistressForUser(id, userCode, timestamp) {
  return run(`
    UPDATE mesh_distress_signals
    SET status = 'canceled', updated_at = ?
    WHERE id = ?
      AND user_code = ?
      AND LOWER(COALESCE(status, '')) = 'active'
      AND deleted = 0
  `, [timestamp, id, userCode]);
}

module.exports = {
  cancelActiveMeshDistressForUser,
  findActiveCivilianDistress,
  findActiveMeshDistressByUserCode,
  findMeshDistressByIdForUser,
  lockCivilianDistressOwnership
};
