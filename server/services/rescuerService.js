const { encryptText, decryptText, lookupHash } = require('./encryptionService');
const { hashPassword } = require('./passwordService');
const { verifyAdminPassword } = require('./adminAuthService');
const {
  notifyRescuerCreated,
  notifyRescuerAccessChanged,
  notifyRescuerStatusChanged,
  notifyRescuerPasswordReset
} = require('./notificationService');
const {
  RESCUER_STATUSES,
  RESCUER_ACCESS_STATUSES,
  RESCUER_AGENCIES,
  REQUIRED_RESCUER_FIELDS
} = require('../models/rescuerModel');
const {
  generateRescuerCode,
  createRescuer,
  findRescuerByPhoneLookupHash,
  getRescuerById,
  listRescuers,
  archiveRescuerAccess,
  activateRescuerAccess,
  updateRescuerStatus,
  updateRescuerPassword,
  listRescueTeams,
  getRescueTeamById
} = require('../repositories/rescuerRepository');
const {
  countRescuersForTeam
} = require('../repositories/rescueTeamRepository');
const {
  createAccountAccessAuditLog
} = require('../repositories/accountAccessAuditRepository');

const ALLOWED_STATUSES = new Set(Object.values(RESCUER_STATUSES));
const ALLOWED_AGENCIES = new Set(Object.values(RESCUER_AGENCIES));
const ALLOWED_ACCESS_STATUSES = new Set(Object.values(RESCUER_ACCESS_STATUSES));
const MANUAL_RESCUER_STATUSES = new Set([
  RESCUER_STATUSES.AVAILABLE,
  RESCUER_STATUSES.UNAVAILABLE
]);

function missingFields(body) {
  return REQUIRED_RESCUER_FIELDS.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

function isValidPhone(phone) {
  return /^(09|\+639)\d{9}$/.test(phone);
}

function parseBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    return null;
  }

  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function fullName(row) {
  return [
    decryptText(row.firstNameEnc),
    decryptText(row.middleNameEnc),
    decryptText(row.lastNameEnc)
  ]
    .filter(Boolean)
    .join(' ');
}

function teamResponse(row) {
  if (!row || !row.teamId) {
    return null;
  }

  return {
    id: row.teamId,
    teamCode: row.teamCode || '',
    name: row.teamName || '',
    status: row.teamStatus || ''
  };
}

function accessStatusLabel(value) {
  return String(value || '').toLowerCase() === RESCUER_ACCESS_STATUSES.ARCHIVED
    ? 'Archived'
    : 'Active';
}

function rescuerResponse(row) {
  return {
    id: row.id,
    rescuerCode: row.rescuerCode,
    firstName: decryptText(row.firstNameEnc),
    middleName: decryptText(row.middleNameEnc),
    lastName: decryptText(row.lastNameEnc),
    fullName: fullName(row),
    birthDate: decryptText(row.birthDateEnc),
    phone: decryptText(row.phoneEnc),
    agency: row.agency,
    status: row.status,
    accessStatus: row.accessStatus || RESCUER_ACCESS_STATUSES.ACTIVE,
    accessStatusLabel: accessStatusLabel(row.accessStatus),
    archivedAt: row.archivedAt || null,
    previousTeamId: row.previousTeamId || null,
    team: teamResponse(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function rescuerDetailResponse(row) {
  const summary = rescuerResponse(row);

  return {
    ...summary,
    profile: {
      rescuerCode: summary.rescuerCode,
      fullName: summary.fullName,
      firstName: summary.firstName,
      middleName: summary.middleName,
      lastName: summary.lastName,
      birthDate: summary.birthDate
    },
    assignment: {
      agency: summary.agency,
      status: summary.status,
      team: summary.team
    },
    contact: {
      phone: summary.phone
    },
    meta: {
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
      archivedAt: summary.archivedAt,
      accessStatus: summary.accessStatus
    }
  };
}

function normalizeOptionalString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeRequiredString(value) {
  return String(value || '').trim();
}

function validatePasswordFields(passwordValue, confirmPasswordValue) {
  const password = String(passwordValue || '');
  const confirmPassword = String(confirmPasswordValue || '');

  if (!password) {
    const error = new Error('Password is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!confirmPassword) {
    const error = new Error('Confirm password is required.');
    error.statusCode = 400;
    throw error;
  }

  if (password.length < 8) {
    const error = new Error('Password must be at least 8 characters long.');
    error.statusCode = 400;
    throw error;
  }

  if (password !== confirmPassword) {
    const error = new Error('Password and confirm password do not match.');
    error.statusCode = 400;
    throw error;
  }

  return password;
}

async function recordRescuerAudit(rescuer, actionType, actorAdminUserId, metadata = null) {
  await createAccountAccessAuditLog({
    subjectType: 'rescuer',
    subjectId: rescuer.id,
    subjectCode: rescuer.rescuerCode,
    actionType,
    actorAdminId: actorAdminUserId || null,
    reasonText: null,
    metadataJson: metadata ? JSON.stringify(metadata) : null,
    occurredAt: new Date().toISOString()
  });
}

async function createRescuerProfile(payload, actorAdminUserId = null) {
  const missing = missingFields(payload);

  if (missing.length > 0) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  const firstName = normalizeRequiredString(payload.firstName);
  const middleName = normalizeOptionalString(payload.middleName);
  const lastName = normalizeRequiredString(payload.lastName);
  const birthDate = normalizeRequiredString(payload.birthDate);
  const agency = normalizeRequiredString(payload.agency).toLowerCase();
  const status = normalizeRequiredString(payload.status).toLowerCase();
  const phone = normalizeRequiredString(payload.phone);
  const rawTeamId = payload.teamId;
  const password = validatePasswordFields(payload.password, payload.confirmPassword);

  if (!isValidPhone(phone)) {
    const error = new Error('Please provide a valid Philippine mobile number.');
    error.statusCode = 400;
    throw error;
  }

  const parsedBirthDate = parseBirthDate(birthDate);

  if (!parsedBirthDate) {
    const error = new Error('Please provide a valid birthdate.');
    error.statusCode = 400;
    throw error;
  }

  if (parsedBirthDate > new Date()) {
    const error = new Error('Birthdate cannot be in the future.');
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_AGENCIES.has(agency)) {
    const error = new Error('Unsupported rescuer agency.');
    error.statusCode = 400;
    throw error;
  }

  if (!MANUAL_RESCUER_STATUSES.has(status)) {
    const error = new Error('Unsupported rescuer status.');
    error.statusCode = 400;
    throw error;
  }

  const phoneLookupHash = lookupHash(phone);
  const existing = await findRescuerByPhoneLookupHash(phoneLookupHash);

  if (existing) {
    const error = new Error('A rescuer with this phone number already exists.');
    error.statusCode = 409;
    throw error;
  }

  let teamId = null;
  if (rawTeamId !== undefined && rawTeamId !== null && String(rawTeamId).trim() !== '') {
    const parsedTeamId = Number.parseInt(String(rawTeamId), 10);
    if (!Number.isInteger(parsedTeamId) || parsedTeamId <= 0) {
      const error = new Error('Invalid rescue team id.');
      error.statusCode = 400;
      throw error;
    }

    const team = await getRescueTeamById(parsedTeamId);
    if (!team) {
      const error = new Error('Selected rescue team does not exist.');
      error.statusCode = 400;
      throw error;
    }

    if (String(team.status || '').toLowerCase() !== 'active') {
      const error = new Error('Selected rescue team is not currently available for assignment.');
      error.statusCode = 400;
      throw error;
    }

    const teamMemberCount = await countRescuersForTeam(parsedTeamId);
    if (Number(teamMemberCount?.count || 0) >= 5) {
      const error = new Error('Selected rescue team already has the maximum of 5 rescuers.');
      error.statusCode = 400;
      throw error;
    }

    teamId = parsedTeamId;
  }

  const rescuerCode = await generateRescuerCode();
  const result = await createRescuer({
    rescuerCode,
    firstNameEnc: encryptText(firstName),
    middleNameEnc: encryptText(middleName),
    lastNameEnc: encryptText(lastName),
    birthDateEnc: encryptText(birthDate),
    phoneEnc: encryptText(phone),
    passwordHash: hashPassword(password),
    phoneLookupHash,
    agency,
    status,
    teamId
  });

  const created = await getRescuerById(result.lastID);
  const response = rescuerResponse(created);
  await recordRescuerAudit(response, 'rescuer_created', actorAdminUserId, {
    agency: response.agency,
    status: response.status,
    accessStatus: response.accessStatus,
    teamId: response.team?.id || null
  });
  notifyRescuerCreated(response);
  return response;
}

async function getRescuerSummaries() {
  const rows = await listRescuers();
  return rows.map(rescuerResponse);
}

async function getRescuerDetails(id) {
  const row = await getRescuerById(id);

  if (!row) {
    return null;
  }

  return rescuerDetailResponse(row);
}

async function setRescuerAccessStatus(id, nextStatus, actorAdminUserId = null) {
  const payload = typeof nextStatus === 'object' && nextStatus !== null ? nextStatus : { status: nextStatus };
  const adminPassword = String(payload.adminPassword || '');
  const requestedStatus = payload.status;
  const normalizedStatus = String(requestedStatus || '').trim().toLowerCase();

  if (!ALLOWED_ACCESS_STATUSES.has(normalizedStatus)) {
    const error = new Error('Status must be active or archived.');
    error.statusCode = 400;
    throw error;
  }

  if (!adminPassword) {
    const error = new Error('Confirm your admin password before changing rescuer access.');
    error.statusCode = 400;
    throw error;
  }

  const passwordIsValid = await verifyAdminPassword(actorAdminUserId, adminPassword);
  if (!passwordIsValid) {
    const error = new Error('Admin password confirmation failed.');
    error.statusCode = 403;
    throw error;
  }

  const existing = await getRescuerById(id);

  if (!existing) {
    const error = new Error('Rescuer not found.');
    error.statusCode = 404;
    throw error;
  }

  const currentStatus = existing.accessStatus || RESCUER_ACCESS_STATUSES.ACTIVE;
  const currentOperationalStatus = String(existing.status || '').trim().toLowerCase();

  if (currentStatus === normalizedStatus) {
    const error = new Error(
      normalizedStatus === RESCUER_ACCESS_STATUSES.ARCHIVED
        ? 'Rescuer is already archived.'
        : 'Rescuer is already active.'
    );
    error.statusCode = 409;
    throw error;
  }

  if (normalizedStatus === RESCUER_ACCESS_STATUSES.ARCHIVED && currentOperationalStatus === RESCUER_STATUSES.DISPATCHED) {
    const error = new Error('Archive is unavailable while this rescuer is dispatched.');
    error.statusCode = 409;
    throw error;
  }

  const result = normalizedStatus === RESCUER_ACCESS_STATUSES.ARCHIVED
    ? await archiveRescuerAccess(id, new Date().toISOString(), currentStatus)
    : await activateRescuerAccess(id, currentStatus, 5);

  if (result.changes === 0) {
    const error = new Error('Rescuer access status could not be updated.');
    error.statusCode = 409;
    throw error;
  }

  const updated = await getRescuerById(id);
  const response = rescuerDetailResponse(updated);
  await recordRescuerAudit(
    response,
    normalizedStatus === RESCUER_ACCESS_STATUSES.ARCHIVED ? 'rescuer_archived' : 'access_status_changed',
    actorAdminUserId,
    {
      previousAccessStatus: currentStatus,
      nextAccessStatus: normalizedStatus,
      previousTeamId: result.previousTeamId || null,
      restoredTeamId: result.restoredTeamId || null,
      teamRestoreSkipped: Boolean(result.restoreSkipped)
    }
  );
  notifyRescuerAccessChanged(response, normalizedStatus);

  const activationRestoreWarning = normalizedStatus === RESCUER_ACCESS_STATUSES.ACTIVE && result.restoreSkipped
    ? 'Previous team is already full, so assign this rescuer to a team manually.'
    : '';

  return {
    message: normalizedStatus === RESCUER_ACCESS_STATUSES.ARCHIVED
      ? `Rescuer ${response.rescuerCode} archived successfully.`
      : `Rescuer ${response.rescuerCode} activated successfully.${activationRestoreWarning ? ` ${activationRestoreWarning}` : ''}`,
    warning: activationRestoreWarning,
    rescuer: response
  };
}

async function updateRescuerOperationalStatus(id, nextStatus) {
  const normalizedStatus = String(nextStatus || '').trim().toLowerCase();

  if (!MANUAL_RESCUER_STATUSES.has(normalizedStatus)) {
    const error = new Error('Unsupported rescuer status.');
    error.statusCode = 400;
    throw error;
  }

  const existing = await getRescuerById(id);

  if (!existing) {
    const error = new Error('Rescuer not found.');
    error.statusCode = 404;
    throw error;
  }

  const currentStatus = existing.status;
  const currentAccessStatus = existing.accessStatus || RESCUER_ACCESS_STATUSES.ACTIVE;

  if (currentAccessStatus === RESCUER_ACCESS_STATUSES.ARCHIVED) {
    const error = new Error('Activate this rescuer before changing operational status.');
    error.statusCode = 409;
    throw error;
  }

  if (String(currentStatus || '').trim().toLowerCase() === RESCUER_STATUSES.DISPATCHED) {
    const error = new Error('Operational status is locked while this rescuer is dispatched.');
    error.statusCode = 409;
    throw error;
  }

  if (currentStatus === normalizedStatus) {
    const updated = rescuerDetailResponse(existing);
    return {
      message: `Rescuer ${updated.rescuerCode} is already marked as ${normalizedStatus}.`,
      rescuer: updated
    };
  }

  const result = await updateRescuerStatus(id, normalizedStatus, currentStatus);

  if (result.changes === 0) {
    const error = new Error('Rescuer operational status could not be updated.');
    error.statusCode = 409;
    throw error;
  }

  const updated = await getRescuerById(id);
  const response = rescuerDetailResponse(updated);
  notifyRescuerStatusChanged(response);

  return {
    message: `Rescuer ${response.rescuerCode} status updated to ${normalizedStatus}.`,
    rescuer: response
  };
}

async function resetRescuerPassword(id, payload, actorAdminUserId = null) {
  const existing = await getRescuerById(id);

  if (!existing) {
    const error = new Error('Rescuer not found.');
    error.statusCode = 404;
    throw error;
  }

  if ((existing.accessStatus || RESCUER_ACCESS_STATUSES.ACTIVE) === RESCUER_ACCESS_STATUSES.ARCHIVED) {
    const error = new Error('Activate this rescuer before resetting the password.');
    error.statusCode = 409;
    throw error;
  }

  if (String(existing.status || '').trim().toLowerCase() === RESCUER_STATUSES.DISPATCHED) {
    const error = new Error('Password reset is locked while this rescuer is dispatched.');
    error.statusCode = 409;
    throw error;
  }

  const adminPassword = String(payload.adminPassword || '');

  if (!adminPassword) {
    const error = new Error('Confirm your admin password before resetting the password.');
    error.statusCode = 400;
    throw error;
  }

  const passwordIsValid = await verifyAdminPassword(actorAdminUserId, adminPassword);
  if (!passwordIsValid) {
    const error = new Error('Admin password confirmation failed.');
    error.statusCode = 403;
    throw error;
  }

  const password = validatePasswordFields(payload.password, payload.confirmPassword);
  const result = await updateRescuerPassword(id, hashPassword(password));

  if (result.changes === 0) {
    const error = new Error('Rescuer password could not be updated.');
    error.statusCode = 409;
    throw error;
  }

  const updated = await getRescuerById(id);
  const response = rescuerDetailResponse(updated);
  await recordRescuerAudit(response, 'password_changed', actorAdminUserId, {
    resetByAdmin: true
  });
  notifyRescuerPasswordReset(response);

  return {
    message: `Password reset for ${response.rescuerCode} completed successfully.`,
    rescuer: response
  };
}

async function getRescueTeamSummaries() {
  const rows = await listRescueTeams();

  return rows.map((row) => ({
    id: row.id,
    teamCode: row.teamCode,
    name: row.name,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
}

module.exports = {
  createRescuerProfile,
  getRescuerSummaries,
  getRescuerDetails,
  setRescuerAccessStatus,
  updateRescuerOperationalStatus,
  resetRescuerPassword,
  getRescueTeamSummaries
};
