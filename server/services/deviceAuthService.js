const { hashToken, createDeviceSyncSession } = require('./authSessionService');
const {
  SYNC_DEVICE_STATUSES
} = require('../models/syncDeviceModel');
const {
  findSyncDeviceByNodeId,
  touchSyncDeviceLastSeen
} = require('../repositories/syncDeviceRepository');
const { createServerAuditLog } = require('../repositories/deviceSyncRepository');

function getRequestIpAddress(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.socket?.remoteAddress || '';
}

function createAuditId() {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
}

async function issueDeviceSyncToken(payload, req) {
  const nodeId = String(payload?.nodeId || '').trim();
  const apiKey = String(payload?.apiKey || '').trim();
  const requestIp = getRequestIpAddress(req);

  if (!nodeId || !apiKey) {
    const error = new Error('nodeId and apiKey are required.');
    error.statusCode = 400;
    throw error;
  }

  const syncDevice = await findSyncDeviceByNodeId(nodeId);

  if (!syncDevice || syncDevice.status !== SYNC_DEVICE_STATUSES.ACTIVE) {
    const error = new Error('Invalid device credentials.');
    error.statusCode = 401;
    throw error;
  }

  if (syncDevice.allowedIp && syncDevice.allowedIp !== requestIp) {
    const error = new Error('Device IP address is not allowed.');
    error.statusCode = 403;
    throw error;
  }

  if (syncDevice.apiKeyHash !== hashToken(apiKey)) {
    const error = new Error('Invalid device credentials.');
    error.statusCode = 401;
    throw error;
  }

  const session = await createDeviceSyncSession(syncDevice, req);
  const timestamp = new Date().toISOString();

  await touchSyncDeviceLastSeen(syncDevice.id, timestamp);
  await createServerAuditLog({
    originNodeId: syncDevice.nodeId,
    localAuditId: createAuditId(),
    action: 'device_sync_token_issued',
    targetType: 'sync_device',
    targetId: String(syncDevice.id),
    ipAddress: requestIp,
    eventTimestamp: timestamp,
    metadata: {
      clientType: 'device_sync'
    }
  });

  return {
    token: session.sessionToken,
    expiresAt: session.expiresAt,
    serverTime: timestamp,
    device: {
      id: syncDevice.id,
      nodeId: syncDevice.nodeId,
      nodeName: syncDevice.nodeName,
      status: syncDevice.status
    }
  };
}

module.exports = {
  issueDeviceSyncToken
};
