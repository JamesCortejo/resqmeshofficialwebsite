const {
  countAdminActionAuditLogs,
  createAdminActionAuditLog,
  listAdminActionAuditLogs
} = require('../repositories/adminActionAuditRepository');

const ADMIN_ACTIONS = Object.freeze({
  CIVILIAN_ACCOUNT_SUSPENDED: 'civilian_account_suspended',
  CIVILIAN_ACCOUNT_ACTIVATED: 'civilian_account_activated',
  RESCUER_ARCHIVED: 'rescuer_archived',
  RESCUER_ACTIVATED: 'rescuer_activated',
  RESCUER_PASSWORD_RESET: 'rescuer_password_reset',
  REPORT_EXPORT_GENERATED: 'report_export_generated',
  DEPLOYMENT_CANCELED: 'deployment_canceled',
  DEPLOYMENT_ACCOMPLISHED: 'deployment_accomplished',
  DEPARTMENT_CHAT_CREATED: 'department_chat_created',
  DEPARTMENT_CHAT_UPDATED: 'department_chat_updated',
  DEPARTMENT_CHAT_ARCHIVED: 'department_chat_archived',
  RESCUE_TEAM_CREATED: 'rescue_team_created',
  RESCUE_TEAM_UPDATED: 'rescue_team_updated',
  RESCUER_OPERATIONAL_STATUS_CHANGED: 'rescuer_operational_status_changed',
  ADMIN_SESSION_REQUIRED_FAILED: 'admin_session_required_failed',
  ADMIN_CSRF_FAILED: 'admin_csrf_failed'
});

const AUDIT_RESULTS = Object.freeze({
  SUCCESS: 'success',
  FAILURE: 'failure'
});

const SENSITIVE_KEY_PATTERN = /(password|adminpassword|confirmpassword|token|csrf|recaptcha|secret|credential|authorization|cookie|apikey|api_key|session|raw|buffer|file)/i;
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_LENGTH = 25;
const MAX_OBJECT_KEYS = 50;
const MAX_DEPTH = 5;

function cleanString(value, maxLength = MAX_STRING_LENGTH) {
  const text = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function sanitizeMetadata(value, depth = 0) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return cleanString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (depth >= MAX_DEPTH) {
    return '[truncated]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_LENGTH).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === 'object') {
    const sanitized = {};
    const entries = Object.entries(value).slice(0, MAX_OBJECT_KEYS);

    for (const [key, nestedValue] of entries) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = '[redacted]';
      } else {
        sanitized[key] = sanitizeMetadata(nestedValue, depth + 1);
      }
    }

    return sanitized;
  }

  return cleanString(value);
}

function getRequestIpAddress(req) {
  const forwardedFor = req.headers && req.headers['x-forwarded-for'];

  if (forwardedFor) {
    return cleanString(String(forwardedFor).split(',')[0], 128);
  }

  return cleanString(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '', 128) || null;
}

function getAdminUserCode(adminUser) {
  return adminUser?.userCode || adminUser?.user_code || adminUser?.code || adminUser?.username || null;
}

function normalizeStatusCode(statusCode) {
  const parsed = Number.parseInt(statusCode, 10);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599 ? parsed : null;
}

function normalizeResult(result) {
  return result === AUDIT_RESULTS.SUCCESS ? AUDIT_RESULTS.SUCCESS : AUDIT_RESULTS.FAILURE;
}

function appError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseBoundedInteger(value, fallback, { min = 1, max = 100 } = {}) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw appError(`Value must be between ${min} and ${max}.`);
  }

  return parsed;
}

function normalizeFilterValue(value, maxLength = 120) {
  const normalized = cleanString(value, maxLength);
  return normalized || '';
}

function parseDateFilter(value, fieldName, endOfDay = false) {
  const normalized = normalizeFilterValue(value, 40);

  if (!normalized) {
    return '';
  }

  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  const date = new Date(dateOnly && endOfDay ? `${normalized}T23:59:59.999Z` : normalized);

  if (Number.isNaN(date.getTime())) {
    throw appError(`${fieldName} must be a valid date.`);
  }

  return date.toISOString();
}

function normalizeAuditListQuery(query = {}) {
  const page = parseBoundedInteger(query.page, 1, { min: 1, max: 100000 });
  const limit = parseBoundedInteger(query.limit, 50, { min: 1, max: 100 });
  const result = normalizeFilterValue(query.result, 20).toLowerCase();
  const dateFrom = parseDateFilter(query.dateFrom, 'dateFrom');
  const dateTo = parseDateFilter(query.dateTo, 'dateTo', true);

  if (result && !Object.values(AUDIT_RESULTS).includes(result)) {
    throw appError('Result must be success or failure.');
  }

  if (dateFrom && dateTo && Date.parse(dateFrom) > Date.parse(dateTo)) {
    throw appError('dateFrom cannot be later than dateTo.');
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    filters: {
      action: normalizeFilterValue(query.action, 120),
      result,
      targetType: normalizeFilterValue(query.targetType, 80),
      admin: normalizeFilterValue(query.admin, 120),
      dateFrom,
      dateTo,
      search: normalizeFilterValue(query.search, 160)
    }
  };
}

function parseMetadataValue(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function auditLogResponse(row) {
  return {
    id: Number(row.id),
    adminUserId: row.adminUserId === null || row.adminUserId === undefined ? null : Number(row.adminUserId),
    adminUserCode: row.adminUserCode || null,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId || null,
    targetCode: row.targetCode || null,
    result: row.result,
    statusCode: row.statusCode === null || row.statusCode === undefined ? null : Number(row.statusCode),
    reason: row.reason || null,
    ipAddress: row.ipAddress || null,
    userAgent: row.userAgent || null,
    metadata: parseMetadataValue(row.metadata),
    createdAt: row.createdAt
  };
}

async function getAdminActionAuditLogPage(query = {}) {
  const normalized = normalizeAuditListQuery(query);
  const [rows, total] = await Promise.all([
    listAdminActionAuditLogs(normalized),
    countAdminActionAuditLogs(normalized.filters)
  ]);
  const totalPages = Math.max(1, Math.ceil(total / normalized.limit));

  return {
    count: rows.length,
    total,
    page: normalized.page,
    limit: normalized.limit,
    totalPages,
    data: rows.map(auditLogResponse)
  };
}
async function logAdminAction(req, details) {
  try {
    if (!details || !details.action || !details.targetType) {
      return null;
    }

    const adminUser = req.adminUser || {};
    const metadata = details.metadata === undefined ? null : sanitizeMetadata(details.metadata);

    return await createAdminActionAuditLog({
      adminUserId: details.adminUserId || adminUser.id || null,
      adminUserCode: cleanString(details.adminUserCode || getAdminUserCode(adminUser), 120) || null,
      action: cleanString(details.action, 120),
      targetType: cleanString(details.targetType, 80),
      targetId: details.targetId === undefined || details.targetId === null ? null : cleanString(details.targetId, 120),
      targetCode: details.targetCode === undefined || details.targetCode === null ? null : cleanString(details.targetCode, 120),
      result: normalizeResult(details.result),
      statusCode: normalizeStatusCode(details.statusCode),
      reason: details.reason ? cleanString(details.reason, 500) : null,
      ipAddress: getRequestIpAddress(req),
      userAgent: cleanString(req.headers?.['user-agent'] || '', 500) || null,
      metadataJson: metadata === null ? null : JSON.stringify(metadata)
    });
  } catch (error) {
    console.error('Unable to write admin action audit log:', error);
    return null;
  }
}

function getErrorStatusCode(error) {
  return normalizeStatusCode(error?.statusCode) || 500;
}

module.exports = {
  ADMIN_ACTIONS,
  AUDIT_RESULTS,
  getAdminActionAuditLogPage,
  getErrorStatusCode,
  logAdminAction,
  sanitizeMetadata
};
