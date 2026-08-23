const {
  listReportCatalog,
  ACCOUNTS_ACCESS_AUDIT_REPORT,
  MESH_DEVICE_SYNC_HEALTH_REPORT,
  ONLINE_COMMUNICATIONS_MODERATION_REPORT
} = require('../../reports/catalog');
const { decryptText } = require('../encryptionService');

const DATE_RANGE_LABELS = Object.freeze({
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
  custom: 'Custom range'
});

const SOURCE_SCOPE_LABELS = Object.freeze({
  all: 'All sources',
  mesh: 'Mesh only',
  online: 'Online only'
});

const ACCOUNT_SCOPE_LABELS = Object.freeze({
  all: 'All accounts',
  civilian: 'Civilian only',
  rescuer: 'Rescuer only'
});

const NODE_SCOPE_LABELS = Object.freeze({
  all: 'All nodes',
  active: 'Active nodes',
  offline: 'Offline nodes'
});

const CHAT_SCOPE_LABELS = Object.freeze({
  all: 'All chat activity',
  department: 'Department chats only',
  global: 'Global announcements only'
});

const AGENCY_LABELS = Object.freeze({
  cdrrmo: 'CDRRMO',
  'fire-department': 'Fire Department',
  'police-department': 'Police Department'
});

const OUTPUT_MODE_LABELS = Object.freeze({
  briefing: 'Briefing copy',
  archive: 'Archive copy',
  field: 'Field handoff'
});

function appError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatReasonLabel(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return 'Unknown';
  }

  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function formatStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return 'Unknown';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatSourceLabel(value) {
  return String(value || '').toLowerCase() === 'online' ? 'Online' : 'Mesh';
}

function formatAgencyLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return AGENCY_LABELS[normalized] || 'Unknown';
}

function formatTeamStatusLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return 'Unknown';
  }

  return normalized
    .split(/[_-\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatActionLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const labels = {
    registered: 'Registered',
    approved: 'Approved',
    declined: 'Declined',
    suspended: 'Suspended',
    reactivated: 'Reactivated',
    rescuer_created: 'Rescuer created',
    rescuer_archived: 'Rescuer archived',
    access_status_changed: 'Access activated',
    password_changed: 'Password reset'
  };

  return labels[normalized] || formatStatusLabel(normalized);
}

function fullName(...parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function decryptLeaderName(row, prefix = 'leader') {
  return fullName(
    decryptText(row[`${prefix}FirstNameEnc`] || ''),
    decryptText(row[`${prefix}MiddleNameEnc`] || ''),
    decryptText(row[`${prefix}LastNameEnc`] || '')
  );
}

function parseCustomDateOnly(value, fieldName) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw appError(`${fieldName} is required for custom date range.`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw appError(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const [year, month, day] = normalized.split('-').map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw appError(`${fieldName} must be a valid calendar date.`);
  }

  return date;
}

function getCustomUtcRange(options = {}) {
  const start = parseCustomDateOnly(options.customDateFrom || options.dateFrom || options.rangeStart, 'Custom start date');
  const endStart = parseCustomDateOnly(options.customDateTo || options.dateTo || options.rangeEnd, 'Custom end date');
  const end = new Date(Date.UTC(
    endStart.getUTCFullYear(),
    endStart.getUTCMonth(),
    endStart.getUTCDate() + 1,
    0,
    0,
    0,
    0
  ));

  if (start.getTime() >= end.getTime()) {
    throw appError('Custom start date cannot be later than custom end date.');
  }

  return { start, end };
}
function getUtcRange(dateRangeKind, options = {}) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();

  switch (dateRangeKind) {
    case 'today': {
      const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
      return { start, end };
    }
    case '7d': {
      const start = new Date(Date.UTC(year, month, day - 6, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
      return { start, end };
    }
    case '30d': {
      const start = new Date(Date.UTC(year, month, day - 29, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
      return { start, end };
    }
    case 'month': {
      const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
      return { start, end };
    }
    case 'custom':
      return getCustomUtcRange(options);
    default:
      throw appError('Unsupported date range for this report.');
  }
}

function normalizeSectionIds(reportDefinition, selectedSectionIds) {
  const allowedIds = new Set(reportDefinition.include.map((item) => item.id));
  const provided = Array.isArray(selectedSectionIds) ? selectedSectionIds : null;

  if (provided && provided.length === 0) {
    throw appError('Select at least one PDF section.');
  }

  const filtered = (provided || []).filter((id) => allowedIds.has(id));

  if (filtered.length > 0) {
    return filtered;
  }

  if (provided) {
    throw appError('Select at least one valid PDF section.');
  }

  return reportDefinition.include
    .filter((item) => item.defaultSelected)
    .map((item) => item.id);
}

function secondsBetween(startValue, endValue) {
  if (!startValue || !endValue) {
    return null;
  }

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  const seconds = (end.getTime() - start.getTime()) / 1000;
  return seconds >= 0 ? seconds : null;
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDateRangeLabel(dateRangeKind, rangeStartIso, rangeEndIso) {
  const baseLabel = DATE_RANGE_LABELS[dateRangeKind];
  if (!baseLabel) {
    return 'Selected range';
  }

  if (dateRangeKind !== 'month' && dateRangeKind !== 'custom') {
    return baseLabel;
  }

  const start = new Date(rangeStartIso);
  const end = new Date(rangeEndIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return baseLabel;
  }

  return `${baseLabel} (${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} to ${new Date(end.getTime() - 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })})`;
}

function buildFilename(dateRangeKind, sourceScope) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `resqmesh-incident-summary-${sourceScope}-${dateRangeKind}-${dateStamp}.pdf`;
}

function buildRescueTeamActivityFilename(dateRangeKind, sourceScope) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `resqmesh-rescue-team-activity-${sourceScope}-${dateRangeKind}-${dateStamp}.pdf`;
}

function buildAccountsAccessAuditFilename(dateRangeKind, scope) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `resqmesh-accounts-access-audit-${scope}-${dateRangeKind}-${dateStamp}.pdf`;
}

function buildMeshDeviceSyncHealthFilename(dateRangeKind, scope) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `resqmesh-mesh-device-sync-health-${scope}-${dateRangeKind}-${dateStamp}.pdf`;
}

function buildOnlineCommunicationsModerationFilename(dateRangeKind, scope) {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `resqmesh-online-communications-moderation-${scope}-${dateRangeKind}-${dateStamp}.pdf`;
}

function scopeLabelsForReport(reportType) {
  if (reportType === ACCOUNTS_ACCESS_AUDIT_REPORT.id) {
    return ACCOUNT_SCOPE_LABELS;
  }

  if (reportType === MESH_DEVICE_SYNC_HEALTH_REPORT.id) {
    return NODE_SCOPE_LABELS;
  }

  if (reportType === ONLINE_COMMUNICATIONS_MODERATION_REPORT.id) {
    return CHAT_SCOPE_LABELS;
  }

  return SOURCE_SCOPE_LABELS;
}

function formatChatSenderLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const labels = {
    civilian: 'Civilian',
    admin: 'Admin',
    rescuer: 'Rescuer',
    system: 'System'
  };

  return labels[normalized] || formatStatusLabel(normalized);
}

function formatModerationEventLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const labels = {
    profanity_blocked: 'Profanity blocked',
    link_blocked: 'Link blocked',
    duplicate_message_blocked: 'Duplicate blocked',
    spam_timeout_triggered: 'Spam timeout'
  };

  return labels[normalized] || formatStatusLabel(normalized.replace(/_/g, ' '));
}

function createPreviewText(value, maxLength = 72) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return 'Not available';
  }

  return text.length > maxLength
    ? `${text.slice(0, maxLength)}...`
    : text;
}

function resolveDisplayName({ civilianCode, civilianFirstNameEnc, civilianMiddleNameEnc, civilianLastNameEnc, adminCode, adminFirstNameEnc, adminMiddleNameEnc, adminLastNameEnc, rescuerCode, rescuerFirstNameEnc, rescuerMiddleNameEnc, rescuerLastNameEnc, senderType }) {
  if (senderType === 'civilian') {
    return fullName(
      decryptText(civilianFirstNameEnc || ''),
      decryptText(civilianMiddleNameEnc || ''),
      decryptText(civilianLastNameEnc || '')
    ) || civilianCode || 'Civilian';
  }

  if (senderType === 'admin') {
    return fullName(
      decryptText(adminFirstNameEnc || ''),
      decryptText(adminMiddleNameEnc || ''),
      decryptText(adminLastNameEnc || '')
    ) || adminCode || 'Admin';
  }

  if (senderType === 'rescuer') {
    return fullName(
      decryptText(rescuerFirstNameEnc || ''),
      decryptText(rescuerMiddleNameEnc || ''),
      decryptText(rescuerLastNameEnc || '')
    ) || rescuerCode || 'Rescuer';
  }

  return 'System';
}

function shapeCatalogReport(report) {
  return {
    id: report.id,
    name: report.name,
    icon: report.icon,
    description: report.description,
    audience: report.audience,
    range: report.range,
    available: Boolean(report.available),
    pendingMessage: report.pendingMessage || null,
    scopeLabel: report.scopeLabel || 'Source scope',
    supportedDateRanges: report.supportedDateRanges || [],
    supportedSourceScopes: report.supportedSourceScopes || [],
    supportedOutputModes: report.supportedOutputModes || [],
    include: Array.isArray(report.include) ? report.include : []
  };
}

function shapeExportRow(row) {
  const reportDefinition = listReportCatalog().find((report) => report.id === row.reportType) || null;
  let summaryMetadata = {};
  let selectedSectionIds = [];

  try {
    summaryMetadata = row.summaryMetadataJson ? JSON.parse(row.summaryMetadataJson) : {};
  } catch (error) {
    summaryMetadata = {};
  }

  try {
    selectedSectionIds = row.selectedSectionIdsJson ? JSON.parse(row.selectedSectionIdsJson) : [];
  } catch (error) {
    selectedSectionIds = [];
  }

  return {
    id: row.id,
    reportType: row.reportType,
    reportName: summaryMetadata.reportName || reportDefinition?.name || 'ResQMesh Report',
    sourceScope: row.sourceScope,
    sourceScopeLabel: scopeLabelsForReport(row.reportType)[row.sourceScope] || row.sourceScope,
    dateRangeKind: row.dateRangeKind,
    dateRangeLabel: formatDateRangeLabel(row.dateRangeKind, row.rangeStartAt, row.rangeEndAt),
    outputMode: row.outputMode,
    outputModeLabel: OUTPUT_MODE_LABELS[row.outputMode] || row.outputMode,
    selectedSectionIds,
    generatedByAdminUserId: row.generatedByAdminUserId,
    adminUserCode: row.adminUserCode || null,
    status: row.status,
    filename: row.filename || null,
    byteSize: Number(row.byteSize || 0),
    totalIncidents: Number(summaryMetadata.totalIncidents || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    errorMessage: row.errorMessage || null
  };
}

function formatRescuerOrNodeStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return 'Unknown';
  }

  return normalized
    .split(/[_-\s]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

module.exports = {
  DATE_RANGE_LABELS,
  SOURCE_SCOPE_LABELS,
  ACCOUNT_SCOPE_LABELS,
  NODE_SCOPE_LABELS,
  CHAT_SCOPE_LABELS,
  AGENCY_LABELS,
  OUTPUT_MODE_LABELS,
  appError,
  formatReasonLabel,
  formatStatusLabel,
  formatSourceLabel,
  formatAgencyLabel,
  formatTeamStatusLabel,
  formatActionLabel,
  fullName,
  decryptLeaderName,
  getUtcRange,
  normalizeSectionIds,
  secondsBetween,
  average,
  formatDateRangeLabel,
  buildFilename,
  buildRescueTeamActivityFilename,
  buildAccountsAccessAuditFilename,
  buildMeshDeviceSyncHealthFilename,
  buildOnlineCommunicationsModerationFilename,
  scopeLabelsForReport,
  formatChatSenderLabel,
  formatModerationEventLabel,
  createPreviewText,
  resolveDisplayName,
  shapeCatalogReport,
  shapeExportRow,
  formatRescuerOrNodeStatus
};
