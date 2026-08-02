const { get, run } = require('../database/postgres');

function countRecentResetRequests({ emailLookupHash, sinceIso }) {
  return get(`
    SELECT COUNT(*)::int AS count
    FROM civilian_password_reset_codes
    WHERE email_lookup_hash = ?
      AND created_at >= ?
  `, [emailLookupHash, sinceIso]);
}

function findLatestOpenResetCode(emailLookupHash) {
  return get(`
    SELECT
      id,
      user_id AS userId,
      email_lookup_hash AS emailLookupHash,
      code_hash AS codeHash,
      attempt_count AS attemptCount,
      expires_at AS expiresAt,
      verified_at AS verifiedAt,
      used_at AS usedAt,
      created_at AS createdAt
    FROM civilian_password_reset_codes
    WHERE email_lookup_hash = ?
      AND used_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `, [emailLookupHash]);
}

function findVerifiedResetByTokenHash(resetTokenHash) {
  return get(`
    SELECT
      id,
      user_id AS userId,
      email_lookup_hash AS emailLookupHash,
      reset_token_hash AS resetTokenHash,
      reset_token_expires_at AS resetTokenExpiresAt,
      used_at AS usedAt
    FROM civilian_password_reset_codes
    WHERE reset_token_hash = ?
      AND verified_at IS NOT NULL
      AND used_at IS NULL
      AND reset_token_expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `, [resetTokenHash]);
}

function invalidateOpenResetCodesForUser(userId, usedAt) {
  return run(`
    UPDATE civilian_password_reset_codes
    SET used_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
      AND used_at IS NULL
  `, [usedAt, userId]);
}

function createResetCode(entry) {
  return run(`
    INSERT INTO civilian_password_reset_codes (
      user_id,
      email_lookup_hash,
      code_hash,
      attempt_count,
      expires_at,
      request_ip,
      user_agent,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
    RETURNING id
  `, [
    entry.userId,
    entry.emailLookupHash,
    entry.codeHash,
    entry.expiresAt,
    entry.requestIp || null,
    entry.userAgent || null,
    entry.createdAt,
    entry.createdAt
  ]);
}

function incrementResetAttempt(id) {
  return run(`
    UPDATE civilian_password_reset_codes
    SET attempt_count = attempt_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [id]);
}

function markResetCodeVerified(id, { resetTokenHash, verifiedAt, resetTokenExpiresAt }) {
  return run(`
    UPDATE civilian_password_reset_codes
    SET verified_at = ?,
        reset_token_hash = ?,
        reset_token_expires_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND used_at IS NULL
  `, [verifiedAt, resetTokenHash, resetTokenExpiresAt, id]);
}

function markResetCodeUsed(id, usedAt) {
  return run(`
    UPDATE civilian_password_reset_codes
    SET used_at = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND used_at IS NULL
  `, [usedAt, id]);
}

module.exports = {
  countRecentResetRequests,
  findLatestOpenResetCode,
  findVerifiedResetByTokenHash,
  invalidateOpenResetCodesForUser,
  createResetCode,
  incrementResetAttempt,
  markResetCodeVerified,
  markResetCodeUsed
};
