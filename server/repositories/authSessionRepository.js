const { get, run } = require('../database/sqlite');

function createAuthSession(session) {
  return run(`
    INSERT INTO auth_sessions (
      principal_type,
      principal_id,
      client_type,
      session_token_hash,
      csrf_secret,
      expires_at,
      last_seen_at,
      revoked_at,
      ip_address,
      user_agent,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    session.principalType,
    session.principalId,
    session.clientType,
    session.sessionTokenHash,
    session.csrfSecret || null,
    session.expiresAt,
    session.lastSeenAt,
    session.revokedAt || null,
    session.ipAddress || null,
    session.userAgent || null,
    session.createdAt
  ]);
}

function findAuthSessionByTokenHash(sessionTokenHash) {
  return get(`
    SELECT
      id,
      principal_type AS principalType,
      principal_id AS principalId,
      client_type AS clientType,
      session_token_hash AS sessionTokenHash,
      csrf_secret AS csrfSecret,
      expires_at AS expiresAt,
      last_seen_at AS lastSeenAt,
      revoked_at AS revokedAt,
      ip_address AS ipAddress,
      user_agent AS userAgent,
      created_at AS createdAt
    FROM auth_sessions
    WHERE session_token_hash = ?
    LIMIT 1
  `, [sessionTokenHash]);
}

function updateAuthSessionLastSeen(id, lastSeenAt) {
  return run(`
    UPDATE auth_sessions
    SET last_seen_at = ?
    WHERE id = ?
  `, [lastSeenAt, id]);
}

function revokeAuthSessionById(id, revokedAt) {
  return run(`
    UPDATE auth_sessions
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `, [revokedAt, id]);
}

function revokeAuthSessionsForPrincipal(principalType, principalId, clientType, revokedAt) {
  return run(`
    UPDATE auth_sessions
    SET revoked_at = ?
    WHERE principal_type = ?
      AND principal_id = ?
      AND client_type = ?
      AND revoked_at IS NULL
  `, [revokedAt, principalType, principalId, clientType]);
}

module.exports = {
  createAuthSession,
  findAuthSessionByTokenHash,
  updateAuthSessionLastSeen,
  revokeAuthSessionById,
  revokeAuthSessionsForPrincipal
};
