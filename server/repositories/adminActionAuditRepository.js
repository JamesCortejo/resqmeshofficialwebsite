const { all, get, run, transaction } = require('../database/postgres');

const ACCOUNT_ACTION_SQL = `CASE aal.action_type
  WHEN 'approved' THEN 'civilian_account_approved'
  WHEN 'declined' THEN 'civilian_account_declined'
  WHEN 'suspended' THEN 'civilian_account_suspended'
  WHEN 'reactivated' THEN 'civilian_account_activated'
  WHEN 'rescuer_created' THEN 'rescuer_created'
  WHEN 'rescuer_archived' THEN 'rescuer_archived'
  WHEN 'access_status_changed' THEN 'rescuer_activated'
  WHEN 'password_changed' THEN 'rescuer_password_reset'
  ELSE aal.action_type
END`;

function buildUnifiedAuditCte() {
  return `
    WITH legacy_account_events AS (
      SELECT
        aal.id,
        aal.actor_admin_id AS admin_user_id,
        actor.user_code AS admin_user_code,
        ${ACCOUNT_ACTION_SQL} AS action,
        CASE aal.subject_type WHEN 'civilian' THEN 'civilian_account' ELSE 'rescuer' END AS target_type,
        aal.subject_id::text AS target_id,
        aal.subject_code AS target_code,
        'success'::text AS result,
        200::integer AS status_code,
        aal.reason_text AS reason,
        NULL::text AS ip_address,
        NULL::text AS user_agent,
        CASE
          WHEN aal.metadata_json IS NULL OR aal.metadata_json = '' THEN NULL::jsonb
          ELSE aal.metadata_json::jsonb
        END AS metadata,
        aal.occurred_at AS created_at,
        'account_access'::text AS source,
        'recorded'::text AS persistence_status,
        'account:' || aal.id::text AS event_key,
        'account_access'::text AS source_type,
        aal.id::text AS source_id
      FROM account_access_audit_logs aal
      LEFT JOIN users actor ON actor.id = aal.actor_admin_id
      WHERE aal.actor_admin_id IS NOT NULL
        AND aal.action_type <> 'registered'
    ),
    canonical_events AS (
      SELECT
        a.id,
        a.admin_user_id,
        a.admin_user_code,
        a.action,
        a.target_type,
        a.target_id,
        a.target_code,
        a.result,
        a.status_code,
        a.reason,
        a.ip_address,
        a.user_agent,
        a.metadata_json AS metadata,
        a.created_at,
        'action'::text AS source,
        'recorded'::text AS persistence_status,
        COALESCE('action:' || a.event_uuid::text, 'action-id:' || a.id::text) AS event_key,
        a.source_type,
        a.source_id
      FROM admin_action_audit_logs a
      WHERE NOT (
        a.result = 'success'
        AND a.source_type IS NULL
        AND EXISTS (
          SELECT 1
          FROM legacy_account_events legacy
          WHERE legacy.action = a.action
            AND legacy.admin_user_id IS NOT DISTINCT FROM a.admin_user_id
            AND legacy.target_id = a.target_id
            AND legacy.created_at BETWEEN a.created_at - INTERVAL '2 minutes' AND a.created_at + INTERVAL '2 minutes'
        )
      )
    ),
    pending_events AS (
      SELECT
        NULL::bigint AS id,
        o.admin_user_id,
        o.admin_user_code,
        o.action,
        o.target_type,
        o.target_id,
        o.target_code,
        o.result,
        o.status_code,
        o.reason,
        o.ip_address,
        o.user_agent,
        o.metadata_json AS metadata,
        o.created_at,
        'outbox'::text AS source,
        'pending'::text AS persistence_status,
        'outbox:' || o.event_uuid::text AS event_key,
        o.source_type,
        o.source_id
      FROM admin_audit_outbox o
      WHERE NOT EXISTS (
        SELECT 1 FROM admin_action_audit_logs a WHERE a.event_uuid = o.event_uuid
      )
      AND NOT (
        o.result = 'success'
        AND EXISTS (
          SELECT 1 FROM legacy_account_events legacy
          WHERE legacy.action = o.action
            AND legacy.admin_user_id IS NOT DISTINCT FROM o.admin_user_id
            AND legacy.target_id = o.target_id
            AND legacy.created_at BETWEEN o.created_at - INTERVAL '2 minutes' AND o.created_at + INTERVAL '2 minutes'
        )
      )
    ),
    unified_events AS (
      SELECT * FROM canonical_events
      UNION ALL
      SELECT * FROM pending_events
      UNION ALL
      SELECT legacy.*
      FROM legacy_account_events legacy
      WHERE NOT EXISTS (
        SELECT 1 FROM admin_action_audit_logs a
        WHERE a.source_type = legacy.source_type AND a.source_id = legacy.source_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM admin_audit_outbox o
        WHERE o.source_type = legacy.source_type AND o.source_id = legacy.source_id
      )
    )
  `;
}

function buildAuditWhereClause(filters = {}) {
  const clauses = [];
  const params = [];

  if (filters.action) {
    clauses.push('action = ?');
    params.push(filters.action);
  }
  if (filters.result) {
    clauses.push('result = ?');
    params.push(filters.result);
  }
  if (filters.targetType) {
    clauses.push('target_type = ?');
    params.push(filters.targetType);
  }
  if (filters.admin) {
    clauses.push('(admin_user_code ILIKE ? OR CAST(admin_user_id AS TEXT) = ?)');
    params.push(`%${filters.admin}%`, filters.admin);
  }
  if (filters.dateFrom) {
    clauses.push('created_at >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push('created_at <= ?');
    params.push(filters.dateTo);
  }
  if (filters.search) {
    clauses.push(`(
      admin_user_code ILIKE ? OR action ILIKE ? OR target_type ILIKE ?
      OR target_id ILIKE ? OR target_code ILIKE ? OR reason ILIKE ?
      OR ip_address ILIKE ? OR user_agent ILIKE ?
    )`);
    const search = `%${filters.search}%`;
    params.push(search, search, search, search, search, search, search, search);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

async function enqueueAdminAuditEvent(entry, executor = { run }) {
  await executor.run(`
    INSERT INTO admin_audit_outbox (
      event_uuid, admin_user_id, admin_user_code, action, target_type,
      target_id, target_code, result, status_code, reason, ip_address,
      user_agent, metadata_json, source_type, source_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?)
    ON CONFLICT (event_uuid) DO NOTHING
  `, [
    entry.eventUuid,
    entry.adminUserId || null,
    entry.adminUserCode || null,
    entry.action,
    entry.targetType,
    entry.targetId || null,
    entry.targetCode || null,
    entry.result,
    entry.statusCode || null,
    entry.reason || null,
    entry.ipAddress || null,
    entry.userAgent || null,
    entry.metadataJson || null,
    entry.sourceType || null,
    entry.sourceId || null,
    entry.createdAt
  ]);

  return entry.eventUuid;
}

async function promoteAdminAuditOutboxBatch(limit = 100) {
  return transaction(async (trx) => {
    const rows = await trx.all(`
      SELECT *
      FROM admin_audit_outbox
      WHERE next_attempt_at <= CURRENT_TIMESTAMP
      ORDER BY created_at, event_uuid
      LIMIT ?
      FOR UPDATE SKIP LOCKED
    `, [limit]);

    for (const row of rows) {
      await trx.run(`
        INSERT INTO admin_action_audit_logs (
          admin_user_id, admin_user_code, action, target_type, target_id,
          target_code, result, status_code, reason, ip_address, user_agent,
          metadata_json, event_uuid, source_type, source_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `, [
        row.admin_user_id,
        row.admin_user_code,
        row.action,
        row.target_type,
        row.target_id,
        row.target_code,
        row.result,
        row.status_code,
        row.reason,
        row.ip_address,
        row.user_agent,
        row.metadata_json ? JSON.stringify(row.metadata_json) : null,
        row.event_uuid,
        row.source_type,
        row.source_id,
        row.created_at
      ]);
      await trx.run('DELETE FROM admin_audit_outbox WHERE event_uuid = ?', [row.event_uuid]);
    }

    return rows.length;
  });
}

async function deferAdminAuditOutbox(limit, error) {
  const message = String(error?.message || error || 'Unknown promotion error').slice(0, 1000);
  return run(`
    UPDATE admin_audit_outbox
    SET attempts = attempts + 1,
        last_error = ?,
        next_attempt_at = CURRENT_TIMESTAMP
          + (LEAST(300, POWER(2, LEAST(attempts, 8))) * INTERVAL '1 second')
    WHERE event_uuid IN (
      SELECT event_uuid FROM admin_audit_outbox
      WHERE next_attempt_at <= CURRENT_TIMESTAMP
      ORDER BY created_at, event_uuid
      LIMIT ?
    )
  `, [message, limit]);
}

async function listAdminActionAuditLogs({ filters = {}, limit = 50, offset = 0 } = {}) {
  const { whereSql, params } = buildAuditWhereClause(filters);
  return all(`
    ${buildUnifiedAuditCte()}
    SELECT
      id,
      admin_user_id AS "adminUserId",
      admin_user_code AS "adminUserCode",
      action,
      target_type AS "targetType",
      target_id AS "targetId",
      target_code AS "targetCode",
      result,
      status_code AS "statusCode",
      reason,
      ip_address AS "ipAddress",
      user_agent AS "userAgent",
      metadata,
      created_at AS "createdAt",
      source,
      persistence_status AS "persistenceStatus",
      event_key AS "eventKey"
    FROM unified_events
    ${whereSql}
    ORDER BY created_at DESC, event_key DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);
}

async function countAdminActionAuditLogs(filters = {}) {
  const { whereSql, params } = buildAuditWhereClause(filters);
  const row = await get(`
    ${buildUnifiedAuditCte()}
    SELECT COUNT(*) AS total FROM unified_events ${whereSql}
  `, params);
  return Number(row?.total || 0);
}

module.exports = {
  countAdminActionAuditLogs,
  deferAdminAuditOutbox,
  enqueueAdminAuditEvent,
  listAdminActionAuditLogs,
  promoteAdminAuditOutboxBatch
};