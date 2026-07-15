const { decryptText } = require('./encryptionService');
const { verifyPassword } = require('./passwordService');
const { createMobileAppSession } = require('./authSessionService');
const {
  findRescuerAuthCandidateByCode
} = require('../repositories/rescuerRepository');

function parseBirthDate(value) {
  const birthDate = decryptText(value);

  if (!birthDate) {
    return { birthDate: null, age: null };
  }

  const parsed = new Date(`${birthDate}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return { birthDate, age: null };
  }

  const now = new Date();
  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - parsed.getUTCMonth();
  const dayDiff = now.getUTCDate() - parsed.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return {
    birthDate,
    age: Math.max(age, 0)
  };
}

function buildRescuerPayload(rescuer) {
  const { birthDate, age } = parseBirthDate(rescuer.birthDateEnc);

  return {
    id: rescuer.id,
    code: rescuer.rescuerCode,
    first_name: decryptText(rescuer.firstNameEnc),
    middle_name: decryptText(rescuer.middleNameEnc) || null,
    last_name: decryptText(rescuer.lastNameEnc),
    phone: decryptText(rescuer.phoneEnc),
    birth_date: birthDate,
    age,
    role: 'rescuer',
    agency: rescuer.agency,
    status: rescuer.status,
    access_status: rescuer.accessStatus,
    team_id: rescuer.teamId || null,
    team: rescuer.teamId ? {
      id: rescuer.teamId,
      code: rescuer.teamCode || '',
      name: rescuer.teamName || '',
      status: rescuer.teamStatus || ''
    } : null,
    password_hash: rescuer.passwordHash
  };
}

async function loginRescuer(code, password, req) {
  const rescuer = await findRescuerAuthCandidateByCode(code);

  if (!rescuer) {
    const error = new Error('Invalid rescuer credentials.');
    error.statusCode = 401;
    throw error;
  }

  if (rescuer.accessStatus !== 'active') {
    const error = new Error('Rescuer access is disabled.');
    error.statusCode = 403;
    throw error;
  }

  if (!verifyPassword(password, rescuer.passwordHash)) {
    const error = new Error('Invalid rescuer credentials.');
    error.statusCode = 401;
    throw error;
  }

  const session = await createMobileAppSession(rescuer, req);

  return {
    accessToken: session.sessionToken,
    expiresAt: session.expiresAt,
    user: buildRescuerPayload(rescuer)
  };
}

module.exports = {
  buildRescuerPayload,
  loginRescuer
};
