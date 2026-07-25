const { decryptText } = require('./encryptionService');
const {
  cancelActiveOnlineDistressForUser,
  createOnlineDistressSignal,
  findActiveDeploymentByOnlineDistressSignalId,
  findActiveOnlineDistressByUserId,
  generateOnlineDistressCode,
  listActiveOnlineDistressSignals
} = require('../repositories/deploymentRepository');
const { cancelDeployment } = require('./distressDeploymentService');
const {
  notifyOnlineDistressSignalActive,
  notifyOnlineDistressSignalCanceled
} = require('./notificationService');

const VALID_REASONS = new Set(['flooding', 'fire', 'medical', 'landslide', 'earthquake', 'accident', 'other']);

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

async function getActiveCivilianOnlineDistress(civilian) {
  return normalizeOnlineDistress(await findActiveOnlineDistressByUserId(civilian.id));
}

async function createCivilianOnlineDistress(civilian, payload) {
  const existing = await findActiveOnlineDistressByUserId(civilian.id);
  if (existing) {
    const error = new Error('You already have an active online distress signal.');
    error.statusCode = 409;
    throw error;
  }

  const reason = normalizeReason(payload.reason);
  if (!reason) {
    const error = new Error('Distress reason is required.');
    error.statusCode = 400;
    throw error;
  }

  const latitude = ensureCoordinate(payload.latitude, 'Latitude');
  const longitude = ensureCoordinate(payload.longitude, 'Longitude');
  const accuracyM = payload.accuracy_m ?? payload.accuracyM ?? payload.accuracy ?? null;
  const timestamp = new Date().toISOString();
  const snapshot = profileSnapshot(civilian);
  const distressCode = await generateOnlineDistressCode();

  const result = await createOnlineDistressSignal({
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

  const distress = await getActiveCivilianOnlineDistress({ id: civilian.id });
  await notifyOnlineDistressSignalActive(distress);
  return distress;
}

async function cancelCivilianOnlineDistress(civilian, id) {
  const distressId = Number.parseInt(String(id || ''), 10);
  if (!Number.isInteger(distressId) || distressId <= 0) {
    const error = new Error('Invalid online distress id.');
    error.statusCode = 400;
    throw error;
  }

  const timestamp = new Date().toISOString();
  const activeDistress = await findActiveOnlineDistressByUserId(civilian.id);

  if (!activeDistress || Number(activeDistress.id) !== distressId) {
    const error = new Error('Active online distress signal not found.');
    error.statusCode = 404;
    throw error;
  }

  const activeDeployment = await findActiveDeploymentByOnlineDistressSignalId(distressId);
  if (activeDeployment?.id) {
    await cancelDeployment(activeDeployment.id);
    await notifyOnlineDistressSignalCanceled(normalizeOnlineDistress(activeDistress));
    return { id: distressId, status: 'canceled', canceledAt: timestamp };
  }

  const result = await cancelActiveOnlineDistressForUser(distressId, civilian.id, timestamp);
  if (!result.changes) {
    const error = new Error('Active online distress signal not found.');
    error.statusCode = 404;
    throw error;
  }

  await notifyOnlineDistressSignalCanceled(normalizeOnlineDistress(activeDistress));
  return { id: distressId, status: 'canceled', canceledAt: timestamp };
}

async function listPublicOnlineDistressSignals() {
  const rows = await listActiveOnlineDistressSignals();
  return rows.map(normalizeOnlineDistress);
}

module.exports = {
  createCivilianOnlineDistress,
  getActiveCivilianOnlineDistress,
  cancelCivilianOnlineDistress,
  listPublicOnlineDistressSignals
};
