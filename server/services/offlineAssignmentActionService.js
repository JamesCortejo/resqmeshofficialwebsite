const {
  getDeploymentById,
  listDeploymentMembers
} = require('../repositories/deploymentRepository');
const {
  createOfflineAssignmentAction,
  getOfflineAssignmentAction
} = require('../repositories/offlineAssignmentActionRepository');
const { accomplishDeployment } = require('./distressDeploymentService');
const { touchSyncDeviceLastSync } = require('../repositories/syncDeviceRepository');
const { createServerAuditLog } = require('../repositories/deviceSyncRepository');


const ACTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function text(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}


function positiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}


function occurredAt(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}


async function storeResult(item, syncDevice, result, reason) {
  const insertResult = await createOfflineAssignmentAction({
    actionId: item.actionId,
    syncDeviceId: syncDevice.id,
    sourceNodeId: syncDevice.nodeId,
    deploymentId: item.deploymentId,
    originNodeId: item.originNodeId,
    originDistressId: item.originDistressId,
    rescuerCode: item.rescuerCode,
    occurredAt: item.occurredAt,
    result,
    reason
  });

  if (!insertResult?.changes) {
    const existing = await getOfflineAssignmentAction(item.actionId);
    if (existing) {
      return {
        actionId: item.actionId,
        status: existing.result === 'accepted' ? 'already_applied' : existing.result,
        message: existing.reason || null
      };
    }
  }

  return { actionId: item.actionId, status: result, message: reason || null };
}


async function processAction(rawItem, syncDevice) {
  const item = {
    actionId: text(rawItem?.actionId),
    actionType: text(rawItem?.actionType),
    deploymentId: positiveInteger(rawItem?.deploymentId),
    originNodeId: text(rawItem?.originNodeId),
    originDistressId: positiveInteger(rawItem?.originDistressId),
    rescuerCode: text(rawItem?.rescuerCode),
    occurredAt: occurredAt(rawItem?.occurredAt)
  };

  if (!item.actionId || !ACTION_ID_PATTERN.test(item.actionId)) {
    return { actionId: item.actionId, status: 'rejected', message: 'Invalid actionId.' };
  }

  const existing = await getOfflineAssignmentAction(item.actionId);
  if (existing) {
    return {
      actionId: item.actionId,
      status: existing.result === 'accepted' ? 'already_applied' : existing.result,
      message: existing.reason || null
    };
  }

  if (
    item.actionType !== 'accomplish_assignment'
    || !item.deploymentId
    || !item.originNodeId
    || !item.originDistressId
    || !item.rescuerCode
    || !item.occurredAt
  ) {
    return { actionId: item.actionId, status: 'rejected', message: 'Offline assignment action is incomplete.' };
  }

  const deployment = await getDeploymentById(item.deploymentId);
  if (!deployment || deployment.distressSource !== 'mesh') {
    return { actionId: item.actionId, status: 'rejected', message: 'Mesh deployment not found.' };
  }
  if (
    deployment.originNodeId !== item.originNodeId
    || Number(deployment.originDistressId) !== item.originDistressId
  ) {
    return storeResult(item, syncDevice, 'rejected', 'Deployment distress identity does not match.');
  }

  const members = await listDeploymentMembers(item.deploymentId);
  const actor = members.find((member) => (
    String(member.rescuerCode || '').toLowerCase() === item.rescuerCode.toLowerCase()
  ));
  if (!actor || actor.accessStatus !== 'active') {
    return storeResult(item, syncDevice, 'rejected', 'Rescuer is not an active member of this deployment.');
  }

  if (deployment.status === 'accomplished') {
    return storeResult(item, syncDevice, 'already_applied', 'Deployment was already accomplished.');
  }
  if (deployment.status !== 'deployed') {
    return storeResult(item, syncDevice, 'conflict', `Deployment is already ${deployment.status}.`);
  }

  try {
    await accomplishDeployment(item.deploymentId, { suppressMeshCommand: true });
    return storeResult(item, syncDevice, 'accepted', null);
  } catch (error) {
    if (error.statusCode === 409) {
      const latest = await getDeploymentById(item.deploymentId);
      if (latest?.status === 'accomplished') {
        return storeResult(item, syncDevice, 'already_applied', 'Deployment was already accomplished.');
      }
      return storeResult(item, syncDevice, 'conflict', error.message);
    }
    throw error;
  }
}


async function syncOfflineAssignmentActions(payload, syncDevice, requestIp) {
  if (!Array.isArray(payload?.items)) {
    const error = new Error('Request body must include an items array.');
    error.statusCode = 400;
    throw error;
  }

  const results = [];
  for (const item of payload.items.slice(0, 50)) {
    try {
      results.push(await processAction(item, syncDevice));
    } catch (error) {
      if (!error.statusCode || error.statusCode >= 500) {
        throw error;
      }
      results.push({
        actionId: text(item?.actionId),
        status: 'rejected',
        message: error.message
      });
    }
  }

  const timestamp = new Date().toISOString();
  await touchSyncDeviceLastSync(syncDevice.id, timestamp);
  await createServerAuditLog({
    originNodeId: syncDevice.nodeId,
    localAuditId: Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`),
    action: 'device_sync_offline_assignment_actions',
    targetType: 'sync_device',
    targetId: String(syncDevice.id),
    ipAddress: requestIp,
    eventTimestamp: timestamp,
    metadata: {
      acceptedCount: results.filter((item) => ['accepted', 'already_applied'].includes(item.status)).length,
      conflictCount: results.filter((item) => item.status === 'conflict').length,
      rejectedCount: results.filter((item) => item.status === 'rejected').length
    }
  });

  return { results };
}


module.exports = { syncOfflineAssignmentActions };
