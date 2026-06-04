const { get } = require('../database/sqlite');

function findAdminCandidateByUsernameHash(usernameLookupHash) {
  return get(`
    SELECT
      id,
      user_code AS userCode,
      username_lookup_hash AS usernameLookupHash,
      password_hash AS passwordHash,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    WHERE username_lookup_hash = ?
    LIMIT 1
  `, [usernameLookupHash]);
}

module.exports = {
  findAdminCandidateByUsernameHash
};
