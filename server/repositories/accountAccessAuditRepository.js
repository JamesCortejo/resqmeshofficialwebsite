const { all, get, run } = require('../database/postgres');

function createAccountAccessAuditLog(entry) {
  return run(`
    INSERT INTO account_access_audit_logs (
      subject_type,
      subject_id,
      subject_code,
      action_type,
      actor_admin_id,
      reason_text,
      metadata_json,
      occurred_at,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    RETURNING id
  `, [
    entry.subjectType,
    entry.subjectId,
    entry.subjectCode || null,
    entry.actionType,
    entry.actorAdminId || null,
    entry.reasonText || null,
    entry.metadataJson || null,
    entry.occurredAt
  ]);
}

function listAccountAccessAuditRows({ scope, rangeStartIso, rangeEndIso, limit = 40 }) {
  const params = [rangeStartIso, rangeEndIso];
  let scopeSql = '';

  if (scope === 'civilian') {
    scopeSql = `AND aal.subject_type = 'civilian'`;
  } else if (scope === 'rescuer') {
    scopeSql = `AND aal.subject_type = 'rescuer'`;
  }

  return all(`
    SELECT
      aal.id,
      aal.subject_type AS "subjectType",
      aal.subject_id AS "subjectId",
      aal.subject_code AS "subjectCode",
      aal.action_type AS "actionType",
      aal.actor_admin_id AS "actorAdminId",
      aal.reason_text AS "reasonText",
      aal.metadata_json AS "metadataJson",
      aal.occurred_at AS "occurredAt",
      actor.user_code AS "actorAdminCode",
      cu.first_name_enc AS "civilianFirstNameEnc",
      cu.middle_name_enc AS "civilianMiddleNameEnc",
      cu.last_name_enc AS "civilianLastNameEnc",
      ru.rescuer_code AS "rescuerCode",
      ru.first_name_enc AS "rescuerFirstNameEnc",
      ru.middle_name_enc AS "rescuerMiddleNameEnc",
      ru.last_name_enc AS "rescuerLastNameEnc"
    FROM account_access_audit_logs aal
    LEFT JOIN users actor ON actor.id = aal.actor_admin_id
    LEFT JOIN users cu ON aal.subject_type = 'civilian' AND cu.id = aal.subject_id
    LEFT JOIN rescuers ru ON aal.subject_type = 'rescuer' AND ru.id = aal.subject_id
    WHERE aal.occurred_at >= ?
      AND aal.occurred_at < ?
      ${scopeSql}
    ORDER BY aal.occurred_at DESC, aal.id DESC
    LIMIT ?
  `, [...params, limit]);
}

function getAccountStatusSnapshot() {
  return get(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending')::int AS "pendingCivilianCount",
      COUNT(*) FILTER (WHERE status = 'approved')::int AS "approvedCivilianCount",
      COUNT(*) FILTER (WHERE status = 'declined')::int AS "declinedCivilianCount",
      COUNT(*) FILTER (WHERE status = 'suspended')::int AS "suspendedCivilianCount"
    FROM users
    WHERE status <> 'admin'
  `);
}

function getRescuerAccessSnapshot() {
  return get(`
    SELECT
      COUNT(*)::int AS "totalRescuerCount",
      COUNT(*) FILTER (WHERE access_status = 'active')::int AS "activeAccessCount",
      COUNT(*) FILTER (WHERE access_status = 'archived')::int AS "archivedAccessCount",
      COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'available')::int AS "availableStatusCount",
      COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'dispatched')::int AS "dispatchedStatusCount",
      COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'unavailable')::int AS "unavailableStatusCount"
    FROM rescuers
  `);
}

function getRegistrationIntakeTotals({ scope, rangeStartIso, rangeEndIso }) {
  const params = [rangeStartIso, rangeEndIso];
  let scopeSql = '';

  if (scope === 'civilian') {
    scopeSql = `AND subject_type = 'civilian'`;
  } else if (scope === 'rescuer') {
    scopeSql = `AND subject_type = 'rescuer'`;
  }

  return get(`
    SELECT
      COUNT(*) FILTER (WHERE action_type = 'registered')::int AS "civilianRegistrationCount",
      COUNT(*) FILTER (WHERE action_type = 'rescuer_created')::int AS "rescuerCreationCount"
    FROM account_access_audit_logs
    WHERE occurred_at >= ?
      AND occurred_at < ?
      AND action_type IN ('registered', 'rescuer_created')
      ${scopeSql}
  `, params);
}

function getAdminActionTotals({ scope, rangeStartIso, rangeEndIso }) {
  const params = [rangeStartIso, rangeEndIso];
  let scopeSql = '';

  if (scope === 'civilian') {
    scopeSql = `AND subject_type = 'civilian'`;
  } else if (scope === 'rescuer') {
    scopeSql = `AND subject_type = 'rescuer'`;
  }

  return get(`
    SELECT
      COUNT(*) FILTER (WHERE action_type = 'approved')::int AS "approvedCount",
      COUNT(*) FILTER (WHERE action_type = 'declined')::int AS "declinedCount",
      COUNT(*) FILTER (WHERE action_type = 'suspended')::int AS "suspendedCount",
      COUNT(*) FILTER (WHERE action_type = 'reactivated')::int AS "reactivatedCount",
      COUNT(*) FILTER (WHERE action_type = 'rescuer_created')::int AS "rescuerCreatedCount",
      COUNT(*) FILTER (WHERE action_type = 'rescuer_archived')::int AS "rescuerArchivedCount",
      COUNT(*) FILTER (WHERE action_type = 'access_status_changed')::int AS "accessStatusChangedCount",
      COUNT(*) FILTER (WHERE action_type = 'password_changed')::int AS "passwordChangedCount"
    FROM account_access_audit_logs
    WHERE occurred_at >= ?
      AND occurred_at < ?
      AND action_type IN (
        'approved',
        'declined',
        'suspended',
        'reactivated',
        'rescuer_created',
        'rescuer_archived',
        'access_status_changed',
        'password_changed'
      )
      ${scopeSql}
  `, params);
}

function getLoginSessionActivity({ scope, rangeStartIso, rangeEndIso }) {
  const params = [rangeStartIso, rangeEndIso];
  let scopeSql = `AND principal_type IN ('user', 'rescuer')`;

  if (scope === 'civilian') {
    scopeSql = `AND principal_type = 'user'`;
  } else if (scope === 'rescuer') {
    scopeSql = `AND principal_type = 'rescuer'`;
  }

  return get(`
    SELECT
      COUNT(*) FILTER (
        WHERE created_at >= ?
          AND created_at < ?
          AND principal_type = 'user'
          AND client_type = 'mobile_app'
      )::int AS "civilianSessionIssuedCount",
      COUNT(*) FILTER (
        WHERE created_at >= ?
          AND created_at < ?
          AND principal_type = 'rescuer'
          AND client_type = 'mobile_app'
      )::int AS "rescuerSessionIssuedCount",
      COUNT(*) FILTER (
        WHERE revoked_at IS NOT NULL
          AND revoked_at >= ?
          AND revoked_at < ?
          AND principal_type = 'user'
          AND client_type = 'mobile_app'
      )::int AS "civilianSessionRevokedCount",
      COUNT(*) FILTER (
        WHERE revoked_at IS NOT NULL
          AND revoked_at >= ?
          AND revoked_at < ?
          AND principal_type = 'rescuer'
          AND client_type = 'mobile_app'
      )::int AS "rescuerSessionRevokedCount",
      COUNT(*) FILTER (
        WHERE revoked_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
          AND client_type = 'mobile_app'
          ${scope === 'civilian' ? "AND principal_type = 'user'" : scope === 'rescuer' ? "AND principal_type = 'rescuer'" : "AND principal_type IN ('user', 'rescuer')"}
      )::int AS "liveMobileSessionCount"
    FROM auth_sessions
    WHERE client_type = 'mobile_app'
      ${scopeSql}
  `, [
    ...params,
    ...params,
    ...params,
    ...params
  ]);
}

function listRescuerAccessRosterRows() {
  return all(`
    SELECT
      r.id,
      r.rescuer_code AS "rescuerCode",
      r.first_name_enc AS "firstNameEnc",
      r.middle_name_enc AS "middleNameEnc",
      r.last_name_enc AS "lastNameEnc",
      r.phone_enc AS "phoneEnc",
      r.agency,
      r.status,
      r.access_status AS "accessStatus",
      r.archived_at AS "archivedAt",
      r.created_at AS "createdAt",
      rt.team_code AS "teamCode",
      rt.name AS "teamName"
    FROM rescuers r
    LEFT JOIN rescue_teams rt ON rt.id = r.team_id
    ORDER BY r.created_at DESC, r.id DESC
  `);
}

module.exports = {
  createAccountAccessAuditLog,
  listAccountAccessAuditRows,
  getAccountStatusSnapshot,
  getRescuerAccessSnapshot,
  getRegistrationIntakeTotals,
  getAdminActionTotals,
  getLoginSessionActivity,
  listRescuerAccessRosterRows
};
