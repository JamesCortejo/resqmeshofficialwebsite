const { get, run } = require('../database/postgres');

function findSyncDeviceByNodeId(nodeId) {
  return get(`
    SELECT
      id,
      node_id AS nodeId,
      node_name AS nodeName,
      status,
      api_key_hash AS apiKeyHash,
      allowed_ip AS allowedIp,
      last_seen_at AS lastSeenAt,
      last_sync_at AS lastSyncAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_devices
    WHERE node_id = ?
    LIMIT 1
  `, [nodeId]);
}

function findSyncDeviceById(id) {
  return get(`
    SELECT
      id,
      node_id AS nodeId,
      node_name AS nodeName,
      status,
      api_key_hash AS apiKeyHash,
      allowed_ip AS allowedIp,
      last_seen_at AS lastSeenAt,
      last_sync_at AS lastSyncAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM sync_devices
    WHERE id = ?
    LIMIT 1
  `, [id]);
}

function createSyncDevice(device) {
  return run(`
    INSERT INTO sync_devices (
      node_id,
      node_name,
      status,
      api_key_hash,
      allowed_ip,
      last_seen_at,
      last_sync_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))
    RETURNING id
  `, [
    device.nodeId,
    device.nodeName,
    device.status,
    device.apiKeyHash,
    device.allowedIp || null,
    device.lastSeenAt || null,
    device.lastSyncAt || null,
    device.createdAt || null,
    device.updatedAt || null
  ]);
}

function updateSyncDeviceBootstrap(id, device) {
  return run(`
    UPDATE sync_devices
    SET
      node_name = ?,
      status = ?,
      api_key_hash = ?,
      allowed_ip = ?,
      updated_at = ?
    WHERE id = ?
  `, [
    device.nodeName,
    device.status,
    device.apiKeyHash,
    device.allowedIp || null,
    device.updatedAt,
    id
  ]);
}

function touchSyncDeviceLastSeen(id, lastSeenAt) {
  return run(`
    UPDATE sync_devices
    SET
      last_seen_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [lastSeenAt, id]);
}

function touchSyncDeviceLastSync(id, lastSyncAt) {
  return run(`
    UPDATE sync_devices
    SET
      last_seen_at = COALESCE(?, last_seen_at),
      last_sync_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [lastSyncAt, lastSyncAt, id]);
}

module.exports = {
  findSyncDeviceByNodeId,
  findSyncDeviceById,
  createSyncDevice,
  updateSyncDeviceBootstrap,
  updateSyncDevice: updateSyncDeviceBootstrap,
  touchSyncDeviceLastSeen,
  touchSyncDeviceLastSync
};
