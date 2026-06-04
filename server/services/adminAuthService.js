const { USER_STATUSES } = require('../models/userModel');
const { lookupHash } = require('./encryptionService');
const { verifyPassword } = require('./passwordService');
const { findAdminCandidateByUsernameHash } = require('../repositories/adminRepository');

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

module.exports = {
  authenticateAdmin
};
