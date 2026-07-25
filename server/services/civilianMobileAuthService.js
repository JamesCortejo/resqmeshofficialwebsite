const { decryptText, lookupHash } = require('./encryptionService');
const { verifyPassword } = require('./passwordService');
const { createMobileAppSession } = require('./authSessionService');
const { SESSION_PRINCIPAL_TYPES } = require('../models/authSessionModel');
const {
  findUserAuthCandidateByPhoneLookupHash
} = require('../repositories/userRepository');

function fullNameParts(...values) {
  return values.filter(Boolean).join(' ');
}

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

function buildCivilianPayload(user) {
  const firstName = decryptText(user.firstNameEnc);
  const middleName = decryptText(user.middleNameEnc) || null;
  const lastName = decryptText(user.lastNameEnc);
  const { birthDate, age } = parseBirthDate(user.birthDateEnc);
  const streetAddress = decryptText(user.streetAddressEnc);
  const barangay = decryptText(user.barangayEnc);

  return {
    id: user.id,
    code: user.userCode,
    user_code: user.userCode,
    first_name: firstName,
    firstName,
    middle_name: middleName,
    middleName,
    last_name: lastName,
    lastName,
    full_name: fullNameParts(firstName, middleName, lastName),
    birth_date: birthDate,
    age,
    phone: decryptText(user.phoneEnc),
    email: decryptText(user.emailEnc),
    address: [streetAddress, barangay].filter(Boolean).join(', ') || null,
    street_address: streetAddress,
    barangay,
    occupation: decryptText(user.occupationEnc),
    blood_type: decryptText(user.bloodTypeEnc),
    medical_complications: decryptText(user.medicalComplicationsEnc),
    allergies: decryptText(user.allergiesEnc),
    role: 'civilian',
    status: user.status,
    account_status: user.status,
    sourceSystem: 'website_user',
    source_system: 'website_user',
    sourceUpdatedAt: user.updatedAt,
    source_updated_at: user.updatedAt,
    password_hash: user.passwordHash,
    passwordHash: user.passwordHash
  };
}

async function loginCivilian(phone, password, req) {
  const user = await findUserAuthCandidateByPhoneLookupHash(lookupHash(phone));

  if (!user) {
    const error = new Error('Invalid civilian credentials.');
    error.statusCode = 401;
    throw error;
  }

  if (user.status !== 'approved') {
    const error = new Error('Civilian account access is disabled.');
    error.statusCode = 403;
    throw error;
  }

  if (!verifyPassword(password, user.passwordHash)) {
    const error = new Error('Invalid civilian credentials.');
    error.statusCode = 401;
    throw error;
  }

  const session = await createMobileAppSession(user, req, SESSION_PRINCIPAL_TYPES.USER);

  return {
    accessToken: session.sessionToken,
    expiresAt: session.expiresAt,
    user: buildCivilianPayload(user)
  };
}

module.exports = {
  buildCivilianPayload,
  loginCivilian
};
