const { USER_STATUSES } = require('../models/userModel');
const { lookupHash } = require('./encryptionService');
const { verifyPassword } = require('./passwordService');
const { findAdminCandidateByUsernameHash, findAdminCredentialById } = require('../repositories/adminRepository');

async function authenticateAdmin(username, password) {
  const usernameLookupHash = lookupHash(username);
  const user = await findAdminCandidateByUsernameHash(usernameLookupHash);

  if (!user) {
    return null;
  }

  const passwordMatches = verifyPassword(password, user.passwordHash);

  if (!passwordMatches || user.status !== USER_STATUSES.ADMIN) {
    return null;
  }

  return {
    id: user.id,
    userCode: user.userCode,
    status: user.status
  };
}

function toAdminSessionPayload(admin) {
  if (!admin) {
    return null;
  }

  return {
    id: admin.id,
    userCode: admin.userCode,
    status: admin.status
  };
}

module.exports = {
  authenticateAdmin,
  toAdminSessionPayload,
  verifyAdminPassword: async function verifyAdminPassword(adminUserId, password) {
    const normalizedPassword = String(password || '');
    const normalizedAdminUserId = Number.parseInt(String(adminUserId || ''), 10);

    if (!Number.isInteger(normalizedAdminUserId) || normalizedAdminUserId <= 0) {
      return false;
    }

    if (!normalizedPassword) {
      return false;
    }

    const admin = await findAdminCredentialById(normalizedAdminUserId);
    if (!admin || admin.status !== USER_STATUSES.ADMIN) {
      return false;
    }

    return verifyPassword(normalizedPassword, admin.passwordHash);
  }
};
