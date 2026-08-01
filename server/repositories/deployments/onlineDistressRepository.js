const { all, get, run } = require('../../database/postgres');

function findActiveOnlineDistressByUserId(userId) {
  return get(`
    SELECT
      id,
      distress_code AS distressCode,
      user_id AS userId,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      blood_type AS bloodType,
      age,
      occupation,
      reason,
      latitude,
      longitude,
      accuracy_m AS accuracyM,
      recorded_at AS recordedAt,
      status,
      canceled_at AS canceledAt,
      accomplished_at AS accomplishedAt,
      updated_at AS updatedAt,
      created_at AS createdAt
    FROM online_distress_signals
    WHERE user_id = ?
      AND status = 'active'
      AND deleted = 0
    ORDER BY recorded_at DESC, id DESC
    LIMIT 1
  `, [userId]);
}

function findOnlineDistressByIdForUser(id, userId) {
  return get(`
    SELECT
      id,
      distress_code AS distressCode,
      user_id AS userId,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      blood_type AS bloodType,
      age,
      occupation,
      reason,
      latitude,
      longitude,
      accuracy_m AS accuracyM,
      recorded_at AS recordedAt,
      status,
      canceled_at AS canceledAt,
      accomplished_at AS accomplishedAt,
      updated_at AS updatedAt,
      created_at AS createdAt
    FROM online_distress_signals
    WHERE id = ?
      AND user_id = ?
      AND deleted = 0
    LIMIT 1
  `, [id, userId]);
}

function createOnlineDistressSignal(distress) {
  return run(`
    INSERT INTO online_distress_signals (
      distress_code,
      user_id,
      user_code,
      first_name,
      last_name,
      phone,
      blood_type,
      age,
      occupation,
      reason,
      latitude,
      longitude,
      accuracy_m,
      recorded_at,
      status,
      updated_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    RETURNING id
  `, [
    distress.distressCode,
    distress.userId,
    distress.userCode,
    distress.firstName,
    distress.lastName,
    distress.phone,
    distress.bloodType,
    distress.age,
    distress.occupation,
    distress.reason,
    distress.latitude,
    distress.longitude,
    distress.accuracyM,
    distress.recordedAt,
    distress.updatedAt,
    distress.createdAt
  ]);
}

function updateOnlineDistressStatus(id, status, timestamp) {
  return run(`
    UPDATE online_distress_signals
    SET
      status = ?,
      canceled_at = CASE WHEN ? = 'canceled' THEN ? ELSE canceled_at END,
      accomplished_at = CASE WHEN ? = 'accomplished' THEN ? ELSE accomplished_at END,
      updated_at = ?
    WHERE id = ?
      AND deleted = 0
  `, [status, status, timestamp, status, timestamp, timestamp, id]);
}

function cancelActiveOnlineDistressForUser(id, userId, timestamp) {
  return run(`
    UPDATE online_distress_signals
    SET
      status = 'canceled',
      canceled_at = ?,
      updated_at = ?
    WHERE id = ?
      AND user_id = ?
      AND status = 'active'
      AND deleted = 0
  `, [timestamp, timestamp, id, userId]);
}

function listActiveOnlineDistressSignals() {
  return all(`
    SELECT
      id,
      distress_code AS distressCode,
      user_id AS userId,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      phone,
      blood_type AS bloodType,
      age,
      occupation,
      reason,
      latitude,
      longitude,
      accuracy_m AS accuracyM,
      recorded_at AS recordedAt,
      status,
      updated_at AS updatedAt
    FROM online_distress_signals
    WHERE status = 'active'
      AND deleted = 0
    ORDER BY recorded_at DESC, id DESC
  `);
}

module.exports = {
  findActiveOnlineDistressByUserId,
  findOnlineDistressByIdForUser,
  createOnlineDistressSignal,
  updateOnlineDistressStatus,
  cancelActiveOnlineDistressForUser,
  listActiveOnlineDistressSignals
};
