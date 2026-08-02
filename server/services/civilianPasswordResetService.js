const crypto = require('crypto');
const config = require('../config/env');
const { lookupHash, decryptText } = require('./encryptionService');
const { hashPassword } = require('./passwordService');
const { verifyRecaptcha } = require('./recaptchaService');
const { sendCivilianPasswordResetCodeEmail } = require('./emailService');
const {
  SESSION_CLIENT_TYPES,
  SESSION_PRINCIPAL_TYPES
} = require('../models/authSessionModel');
const { revokeAuthSessionsForPrincipal } = require('../repositories/authSessionRepository');
const { createAccountAccessAuditLog } = require('../repositories/accountAccessAuditRepository');
const {
  findApprovedCivilianByEmailLookupHash,
  updateUserPasswordHash
} = require('../repositories/userRepository');
const {
  countRecentResetRequests,
  findLatestOpenResetCode,
  findVerifiedResetByTokenHash,
  invalidateOpenResetCodesForUser,
  createResetCode,
  incrementResetAttempt,
  markResetCodeVerified,
  markResetCodeUsed
} = require('../repositories/civilianPasswordResetRepository');

const CODE_TTL_MINUTES = 10;
const RESET_TOKEN_TTL_MINUTES = 10;
const REQUEST_WINDOW_MINUTES = 15;
const MAX_REQUESTS_PER_WINDOW = 3;
const MAX_CODE_ATTEMPTS = 5;
const GENERIC_REQUEST_MESSAGE = 'If this email belongs to an approved civilian account, a reset code has been sent.';
const INVALID_CODE_MESSAGE = 'Invalid or expired reset code.';

function publicError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function hashResetSecret(value) {
  return crypto
    .createHmac('sha256', config.encryptionKey)
    .update(String(value))
    .digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function resetCodeHash(emailLookupHash, code) {
  return hashResetSecret(`${emailLookupHash}:${code}`);
}

function safeFullName(user) {
  const parts = [
    decryptText(user.firstNameEnc),
    decryptText(user.middleNameEnc),
    decryptText(user.lastNameEnc)
  ].filter(Boolean);

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function getRequestIp(req) {
  return String(req.ip || req.headers['x-forwarded-for'] || '').slice(0, 120);
}

function getUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 500);
}

function genericRequestResponse() {
  return {
    success: true,
    message: GENERIC_REQUEST_MESSAGE
  };
}

async function requestCivilianPasswordReset(body, req) {
  await verifyRecaptcha(body.recaptchaToken, 'password_reset', {
    remoteIp: req.ip,
    hostname: req.hostname
  });

  const email = normalizeEmail(body.email);

  if (!isValidEmail(email) || email.length > 254) {
    throw publicError('Please provide a valid email address.');
  }

  const emailLookupHash = lookupHash(email);
  const user = await findApprovedCivilianByEmailLookupHash(emailLookupHash);

  if (!user) {
    return genericRequestResponse();
  }

  const now = new Date();
  const windowStart = addMinutes(now, -REQUEST_WINDOW_MINUTES);
  const recent = await countRecentResetRequests({
    emailLookupHash,
    sinceIso: windowStart.toISOString()
  });

  if ((recent && Number(recent.count)) >= MAX_REQUESTS_PER_WINDOW) {
    return genericRequestResponse();
  }

  const code = generateCode();
  const timestamp = now.toISOString();

  await invalidateOpenResetCodesForUser(user.id, timestamp);
  await createResetCode({
    userId: user.id,
    emailLookupHash,
    codeHash: resetCodeHash(emailLookupHash, code),
    expiresAt: addMinutes(now, CODE_TTL_MINUTES).toISOString(),
    requestIp: getRequestIp(req),
    userAgent: getUserAgent(req),
    createdAt: timestamp
  });

  await sendCivilianPasswordResetCodeEmail({
    email: decryptText(user.emailEnc),
    fullName: safeFullName(user),
    userCode: user.userCode
  }, code);

  return genericRequestResponse();
}

async function verifyCivilianPasswordResetCode(body) {
  const email = normalizeEmail(body.email);
  const code = normalizeCode(body.code);

  if (!isValidEmail(email) || code.length !== 6) {
    throw publicError(INVALID_CODE_MESSAGE);
  }

  const emailLookupHash = lookupHash(email);
  const row = await findLatestOpenResetCode(emailLookupHash);

  if (!row || Number(row.attemptCount || 0) >= MAX_CODE_ATTEMPTS) {
    throw publicError(INVALID_CODE_MESSAGE);
  }

  if (row.codeHash !== resetCodeHash(emailLookupHash, code)) {
    await incrementResetAttempt(row.id);

    if (Number(row.attemptCount || 0) + 1 >= MAX_CODE_ATTEMPTS) {
      await markResetCodeUsed(row.id, new Date().toISOString());
    }

    throw publicError(INVALID_CODE_MESSAGE);
  }

  const now = new Date();
  const resetToken = crypto.randomBytes(32).toString('hex');

  await markResetCodeVerified(row.id, {
    resetTokenHash: hashResetSecret(resetToken),
    verifiedAt: now.toISOString(),
    resetTokenExpiresAt: addMinutes(now, RESET_TOKEN_TTL_MINUTES).toISOString()
  });

  return {
    success: true,
    message: 'Code verified. You can now set a new password.',
    resetToken
  };
}

async function completeCivilianPasswordReset(body) {
  const resetToken = String(body.resetToken || '').trim();
  const newPassword = String(body.newPassword || '');
  const confirmPassword = String(body.confirmPassword || '');

  if (!resetToken) {
    throw publicError('Password reset session expired. Please request a new code.');
  }

  if (newPassword.length < 8) {
    throw publicError('Password must be at least 8 characters long.');
  }

  if (newPassword !== confirmPassword) {
    throw publicError('Passwords do not match.');
  }

  const row = await findVerifiedResetByTokenHash(hashResetSecret(resetToken));

  if (!row) {
    throw publicError('Password reset session expired. Please request a new code.');
  }

  const user = await findApprovedCivilianByEmailLookupHash(row.emailLookupHash);

  if (!user || user.id !== row.userId) {
    throw publicError('Password reset session expired. Please request a new code.');
  }

  const timestamp = new Date().toISOString();

  await updateUserPasswordHash(user.id, hashPassword(newPassword));
  await markResetCodeUsed(row.id, timestamp);
  await revokeAuthSessionsForPrincipal(
    SESSION_PRINCIPAL_TYPES.USER,
    user.id,
    SESSION_CLIENT_TYPES.MOBILE_APP,
    timestamp
  );
  await createAccountAccessAuditLog({
    subjectType: 'civilian',
    subjectId: user.id,
    subjectCode: user.userCode,
    actionType: 'password_changed',
    actorAdminId: null,
    reasonText: 'Civilian self-service password reset',
    metadataJson: JSON.stringify({ source: 'public_password_reset' }),
    occurredAt: timestamp
  });

  return {
    success: true,
    message: 'Password updated. Please return to the app and log in again.'
  };
}

module.exports = {
  requestCivilianPasswordReset,
  verifyCivilianPasswordResetCode,
  completeCivilianPasswordReset
};
