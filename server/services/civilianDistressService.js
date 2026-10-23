const { decryptText } = require('./encryptionService');
const {
  cancelActiveOnlineDistressForUser,
  cancelActiveMeshDistressForUser,
  createOnlineDistressSignal,
  findActiveCivilianDistress,
  findActiveDeploymentByOnlineDistressSignalId,
  findActiveDeploymentByDistressSignalId,
  findActiveOnlineDistressByUserId,
  findMeshDistressByIdForUser,
  findOnlineDistressByIdForUser,
  generateOnlineDistressCode,
  listActiveOnlineDistressSignals,
  lockCivilianDistressOwnership
} = require('../repositories/deploymentRepository');
const { createMeshCommand } = require('../repositories/deviceSyncRepository');
const { afterCommit, transaction } = require('../database/postgres');
const { cancelDeployment } = require('./distressDeploymentService');
const {
  notifyDistressSignalCanceled,
  notifyOnlineDistressSignalActive,
  notifyOnlineDistressSignalCanceled
} = require('./notificationService');
const { pushOnlineDistressNotification } = require('./mobilePushService');

const VALID_REASONS = new Set(['flooding', 'fire', 'medical', 'landslide', 'earthquake', 'accident', 'other']);
const REMOVED_REASONS = new Set(['missing_person', 'missing person', 'missing-person']);

function safeDecrypt(value) {
  try {
    return decryptText(value);
  } catch {
    return '';
  }
}

function normalizeReason(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_REASONS.has(normalized) ? normalized : normalized.slice(0, 80);
}

function isRemovedReason(value) {
  return REMOVED_REASONS.has(String(value || '').trim().toLowerCase());
}

function ensureCoordinate(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    const error = new Error(`${label} is required for online distress activation.`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

function calculateAge(birthDateValue) {
  const birthDate = new Date(birthDateValue);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function profileSnapshot(civilian) {
  const birthDate = safeDecrypt(civilian.birthDateEnc);
  return {
    userCode: civilian.userCode || '',
    firstName: safeDecrypt(civilian.firstNameEnc),
    lastName: safeDecrypt(civilian.lastNameEnc),
    phone: safeDecrypt(civilian.phoneEnc),
    bloodType: safeDecrypt(civilian.bloodTypeEnc),
    occupation: safeDecrypt(civilian.occupationEnc),
    age: calculateAge(birthDate)
  };
}

function normalizeOnlineDistress(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sourceId: row.id,
    sourceType: 'online',
    sourceLabel: 'ONLINE',
    distressCode: row.distressCode,
    userCode: row.userCode,
    reason: row.reason,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracyM ?? null,
    recordedAt: row.recordedAt,
    timestamp: row.recordedAt,
    status: row.status,
    originNodeId: null,
    cancellationSyncStatus: null,
    user: {
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      bloodType: row.bloodType,
      age: row.age,
      occupation: row.occupation
    }
  };
}

function normalizeOwnedDistress(row) {
  if (!row) return null;
  if (row.sourceType === 'online') return normalizeOnlineDistress(row);

  return {
    id: row.id,
    sourceId: row.sourceId ?? row.id,
    sourceType: 'mesh',
    sourceLabel: 'MESH',
    distressCode: row.distressCode,
    userCode: row.userCode,
    reason: row.reason,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: null,
    recordedAt: row.recordedAt,
    timestamp: row.recordedAt,
    status: row.status,
    originNodeId: row.originNodeId,
    cancellationSyncStatus: null,
    user: {
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      bloodType: row.bloodType,
      age: row.age,
      occupation: row.occupation || ''
    }
  };
}

async function getActiveCivilianOnlineDistress(civilian) {
  return normalizeOwnedDistress(
    await findActiveCivilianDistress(civilian.id, civilian.userCode)
  );
}

async function createCivilianOnlineDistress(civilian, payload) {
  const reason = normalizeReason(payload.reason);
  if (!reason) {
    const error = new Error('Distress reason is required.');
    error.statusCode = 400;
    throw error;
  }
  if (isRemovedReason(reason)) {
    const error = new Error('Missing Person is no longer available as a distress reason.');
    error.statusCode = 400;
    throw error;
  }

  const latitude = ensureCoordinate(payload.latitude, 'Latitude');
  const longitude = ensureCoordinate(payload.longitude, 'Longitude');
  const accuracyM = payload.accuracy_m ?? payload.accuracyM ?? payload.accuracy ?? null;
  const timestamp = new Date().toISOString();
  const snapshot = profileSnapshot(civilian);
  const distress = await transaction(async () => {
    await lockCivilianDistressOwnership(civilian.userCode);
    const existing = await findActiveCivilianDistress(civilian.id, civilian.userCode);
    if (existing) {
      const error = new Error('You already have an active distress signal.');
      error.statusCode = 409;
      error.conflict = 'user_active';
      error.activeSource = existing.sourceType;
      throw error;
    }

    const distressCode = await generateOnlineDistressCode();
    await createOnlineDistressSignal({
      distressCode,
      userId: civilian.id,
      ...snapshot,
      reason,
      latitude,
      longitude,
      accuracyM,
      recordedAt: payload.recorded_at || payload.recordedAt || timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const created = await getActiveCivilianOnlineDistress(civilian);
    await afterCommit(async () => {
      await notifyOnlineDistressSignalActive(created);
      await pushOnlineDistressNotification(created, civilian.id);
    });
    return created;
  });
  return distress;
}

async function cancelCivilianMeshDistress(civilian, id) {
  const distressId = Number.parseInt(String(id || ''), 10);
  if (!Number.isInteger(distressId) || distressId <= 0) {
    const error = new Error('Invalid mesh distress id.');
    error.statusCode = 400;
    throw error;
  }

  return transaction(async () => {
    await lockCivilianDistressOwnership(civilian.userCode);
    const distress = await findMeshDistressByIdForUser(distressId, civilian.userCode);
    if (!distress) {
      const error = new Error('Mesh distress signal not found.');
      error.statusCode = 404;
      throw error;
    }

    const status = String(distress.status || '').toLowerCase();
    if (status !== 'active') {
      return {
        id: distressId,
        sourceType: 'mesh',
        status: distress.status,
        cancellationSyncStatus: 'queued',
        message: 'Mesh distress signal is no longer active.'
      };
    }

    const timestamp = new Date().toISOString();
    const result = await cancelActiveMeshDistressForUser(
      distressId,
      civilian.userCode,
      timestamp
    );
    if (!result.changes) {
      const error = new Error('Active mesh distress signal not found.');
      error.statusCode = 404;
      throw error;
    }

    const deployment = await findActiveDeploymentByDistressSignalId(distressId);
    if (deployment?.id) {
      await cancelDeployment(deployment.id);
    } else {
      await createMeshCommand({
        targetNodeId: distress.originNodeId,
        commandType: 'cancel_distress',
        payloadJson: JSON.stringify({
          originNodeId: distress.originNodeId,
          originDistressId: distress.originDistressId,
          meshDistressSignalId: distress.id,
          deploymentId: null
        }),
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    await afterCommit(() => notifyDistressSignalCanceled(distress));
    return {
      id: distressId,
      sourceType: 'mesh',
      status: 'canceled',
      canceledAt: timestamp,
      cancellationSyncStatus: 'queued',
      message: 'Mesh distress canceled. The cancellation will sync to the mesh network when the origin node reconnects.'
    };
  });
}

async function cancelCivilianOnlineDistress(civilian, id) {
  const distressId = Number.parseInt(String(id || ''), 10);
  if (!Number.isInteger(distressId) || distressId <= 0) {
    const error = new Error('Invalid online distress id.');
    error.statusCode = 400;
    throw error;
  }

  return transaction(async () => {
    await lockCivilianDistressOwnership(civilian.userCode);
    const timestamp = new Date().toISOString();
    const activeDistress = await findActiveOnlineDistressByUserId(civilian.id);

    if (!activeDistress || Number(activeDistress.id) !== distressId) {
      const ownedDistress = await findOnlineDistressByIdForUser(distressId, civilian.id);
      const ownedStatus = String(ownedDistress?.status || '').toLowerCase();
      if (ownedDistress && ['canceled', 'cancelled', 'accomplished'].includes(ownedStatus)) {
        const accomplished = ownedStatus === 'accomplished';
        return {
          id: distressId,
          status: ownedDistress.status,
          canceledAt: ownedDistress.canceledAt || null,
          accomplishedAt: ownedDistress.accomplishedAt || null,
          message: accomplished
            ? 'Distress signal has already been accomplished by a rescuer.'
            : 'Distress signal has been canceled by admin.'
        };
      }

      const error = new Error('Active online distress signal not found.');
      error.statusCode = 404;
      throw error;
    }

    const activeDeployment = await findActiveDeploymentByOnlineDistressSignalId(distressId);
    if (activeDeployment?.id) {
      await cancelDeployment(activeDeployment.id);
      await afterCommit(() => notifyOnlineDistressSignalCanceled(normalizeOnlineDistress(activeDistress)));
      return {
        id: distressId,
        status: 'canceled',
        canceledAt: timestamp,
        message: 'Online distress signal canceled.'
      };
    }

    const result = await cancelActiveOnlineDistressForUser(distressId, civilian.id, timestamp);
    if (!result.changes) {
      const error = new Error('Active online distress signal not found.');
      error.statusCode = 404;
      throw error;
    }

    await afterCommit(() => notifyOnlineDistressSignalCanceled(normalizeOnlineDistress(activeDistress)));
    return {
      id: distressId,
      status: 'canceled',
      canceledAt: timestamp,
      message: 'Online distress signal canceled.'
    };
  });
}

async function cancelCivilianDistress(civilian, sourceType, id) {
  const source = String(sourceType || 'online').trim().toLowerCase();
  if (source === 'mesh') return cancelCivilianMeshDistress(civilian, id);
  if (source === 'online') return cancelCivilianOnlineDistress(civilian, id);

  const error = new Error('Invalid distress source.');
  error.statusCode = 400;
  throw error;
}

async function listPublicOnlineDistressSignals() {
  const rows = await listActiveOnlineDistressSignals();
  return rows.map(normalizeOnlineDistress);
}

module.exports = {
  createCivilianOnlineDistress,
  getActiveCivilianOnlineDistress,
  cancelCivilianDistress,
  cancelCivilianOnlineDistress,
  listPublicOnlineDistressSignals
};
