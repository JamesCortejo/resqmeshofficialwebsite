const { all, get, run } = require('../database/postgres');

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
    clauses.push(`(
      admin_user_code ILIKE ?
      OR CAST(admin_user_id AS TEXT) = ?
    )`);
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
      admin_user_code ILIKE ?
      OR action ILIKE ?
      OR target_type ILIKE ?
      OR target_id ILIKE ?
      OR target_code ILIKE ?
      OR reason ILIKE ?
      OR ip_address ILIKE ?
      OR user_agent ILIKE ?
    )`);
    const search = `%${filters.search}%`;
    params.push(search, search, search, search, search, search, search, search);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params
  };
}

async function createAdminActionAuditLog(entry) {
  const result = await run(`
    INSERT INTO admin_action_audit_logs (
      admin_user_id,
      admin_user_code,
      action,
      target_type,
      target_id,
      target_code,
      result,
      status_code,
      reason,
      ip_address,
      user_agent,
      metadata_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), CURRENT_TIMESTAMP)
    RETURNING id
  `, [
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
    entry.metadataJson || null
  ]);

  return result.lastID;
}

async function listAdminActionAuditLogs({ filters = {}, limit = 50, offset = 0 } = {}) {
  const { whereSql, params } = buildAuditWhereClause(filters);

  return all(`
    SELECT
      id,
      admin_user_id AS adminUserId,
      admin_user_code AS adminUserCode,
      action,
      target_type AS targetType,
      target_id AS targetId,
      target_code AS targetCode,
      result,
      status_code AS statusCode,
      reason,
      ip_address AS ipAddress,
      user_agent AS userAgent,
      metadata_json AS metadata,
      created_at AS createdAt
    FROM admin_action_audit_logs
    ${whereSql}
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);
}

async function countAdminActionAuditLogs(filters = {}) {
  const { whereSql, params } = buildAuditWhereClause(filters);
  const row = await get(`
    SELECT COUNT(*) AS total
    FROM admin_action_audit_logs
    ${whereSql}
  `, params);

  return Number(row?.total || 0);
}

module.exports = {
  countAdminActionAuditLogs,
  createAdminActionAuditLog,
  listAdminActionAuditLogs
};