const {
  listReportCatalog,
  INCIDENT_SUMMARY_REPORT,
  RESCUE_TEAM_ACTIVITY_REPORT
} = require('../reports/catalog');
const { buildIncidentSummaryPdf } = require('../reports/builders/incidentSummaryPdfBuilder');
const { buildRescueTeamActivityPdf } = require('../reports/builders/rescueTeamActivityPdfBuilder');
const { verifyAdminPassword } = require('./adminAuthService');
const { decryptText } = require('./encryptionService');
const {
  listIncidentSummaryRows,
  listRescueTeamActivityRows,
  listRescueTeamRosterRows,
  createReportExport,
  updateReportExportStatus,
  listRecentReportExports,
  getAdminExportCount
} = require('../repositories/reportRepository');

const DATE_RANGE_LABELS = Object.freeze({
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month'
});

const SOURCE_SCOPE_LABELS = Object.freeze({
  all: 'All sources',
  mesh: 'Mesh only',
  online: 'Online only'
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

function getUtcRange(dateRangeKind) {
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

function normalizeIncidentRows(rows) {
  return rows.map((row) => ({
    sourceType: row.sourceType,
    sourceLabel: formatSourceLabel(row.sourceType),
    distressCode: row.distressCode,
    reasonRaw: row.reason,
    reasonLabel: formatReasonLabel(row.reason),
    incidentStatus: row.incidentStatus,
    statusLabel: formatStatusLabel(row.incidentStatus),
    reportedAt: row.reportedAt,
    deployedAt: row.deployedAt || null,
    endedAt: row.endedAt || null,
    deploymentCode: row.deploymentCode || null,
    teamName: row.teamName || null,
    deploymentStatus: row.deploymentStatus || null,
    responseSeconds: secondsBetween(row.reportedAt, row.deployedAt),
    closureSeconds: secondsBetween(row.reportedAt, row.endedAt)
  }));
}

function buildIncidentSummary(rows) {
  const responseDurations = rows
    .map((row) => row.responseSeconds)
    .filter((value) => Number.isFinite(value));
  const closureDurations = rows
    .map((row) => row.closureSeconds)
    .filter((value) => Number.isFinite(value));

  const reasonCounts = new Map();
  rows.forEach((row) => {
    reasonCounts.set(row.reasonLabel, (reasonCounts.get(row.reasonLabel) || 0) + 1);
  });

  const reasonBreakdown = Array.from(reasonCounts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  return {
    totals: {
      totalIncidents: rows.length,
      deployedIncidents: rows.filter((row) => Boolean(row.deployedAt)).length,
      resolvedIncidents: rows.filter((row) => row.incidentStatus === 'accomplished' || row.incidentStatus === 'canceled').length
    },
    sources: {
      mesh: rows.filter((row) => row.sourceType === 'mesh').length,
      online: rows.filter((row) => row.sourceType === 'online').length
    },
    statuses: {
      active: rows.filter((row) => row.incidentStatus === 'active').length,
      canceled: rows.filter((row) => row.incidentStatus === 'canceled').length,
      accomplished: rows.filter((row) => row.incidentStatus === 'accomplished').length
    },
    responseTiming: {
      averageResponseSeconds: average(responseDurations),
      fastestResponseSeconds: responseDurations.length ? Math.min(...responseDurations) : null,
      slowestResponseSeconds: responseDurations.length ? Math.max(...responseDurations) : null,
      averageClosureSeconds: average(closureDurations),
      responseSampleCount: responseDurations.length,
      closureSampleCount: closureDurations.length
    },
    reasonBreakdown
  };
}

function formatDateRangeLabel(dateRangeKind, rangeStartIso, rangeEndIso) {
  const baseLabel = DATE_RANGE_LABELS[dateRangeKind];
  if (!baseLabel) {
    return 'Selected range';
  }

  if (dateRangeKind !== 'month') {
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
    supportedDateRanges: report.supportedDateRanges || [],
    supportedSourceScopes: report.supportedSourceScopes || [],
    supportedOutputModes: report.supportedOutputModes || [],
    include: Array.isArray(report.include) ? report.include : []
  };
}

async function getAdminReportCatalog() {
  const exportsCountRow = await getAdminExportCount();

  return {
    generatedAt: new Date().toISOString(),
    reports: listReportCatalog().map(shapeCatalogReport),
    totals: {
      exportsGenerated: Number(exportsCountRow?.count || 0)
    },
    supportedDateRanges: DATE_RANGE_LABELS,
    supportedSourceScopes: SOURCE_SCOPE_LABELS,
    supportedOutputModes: OUTPUT_MODE_LABELS
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
    sourceScopeLabel: SOURCE_SCOPE_LABELS[row.sourceScope] || row.sourceScope,
    dateRangeKind: row.dateRangeKind,
    dateRangeLabel: DATE_RANGE_LABELS[row.dateRangeKind] || row.dateRangeKind,
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

async function listAdminReportExports() {
  const rows = await listRecentReportExports(5);
  return rows.map(shapeExportRow);
}

async function generateIncidentSummaryReport(adminUserId, payload = {}) {
  const reportDefinition = INCIDENT_SUMMARY_REPORT;
  const dateRangeKind = String(payload.dateRange || '7d').trim();
  const sourceScope = String(payload.sourceScope || 'all').trim();
  const outputMode = String(payload.outputMode || 'briefing').trim();
  const confirmPassword = String(payload.confirmPassword || '');

  if (!confirmPassword) {
    throw appError('Confirm your admin password before generating a PDF.', 400);
  }

  const passwordIsValid = await verifyAdminPassword(adminUserId, confirmPassword);
  if (!passwordIsValid) {
    throw appError('Admin password confirmation failed.', 403);
  }

  if (!reportDefinition.supportedDateRanges.includes(dateRangeKind)) {
    throw appError('Unsupported date range for incident summary report.');
  }

  if (!reportDefinition.supportedSourceScopes.includes(sourceScope)) {
    throw appError('Unsupported source scope for incident summary report.');
  }

  if (!reportDefinition.supportedOutputModes.includes(outputMode)) {
    throw appError('Unsupported output mode for incident summary report.');
  }

  const sectionIds = normalizeSectionIds(reportDefinition, payload.includeSections);
  const { start, end } = getUtcRange(dateRangeKind);
  const rangeStartIso = start.toISOString();
  const rangeEndIso = end.toISOString();
  const filename = buildFilename(dateRangeKind, sourceScope);
  const exportInsert = await createReportExport({
    reportType: reportDefinition.id,
    sourceScope,
    dateRangeKind,
    rangeStartAt: rangeStartIso,
    rangeEndAt: rangeEndIso,
    outputMode,
    selectedSectionIdsJson: JSON.stringify(sectionIds),
    generatedByAdminUserId: adminUserId,
    status: 'started',
    filename,
    byteSize: null,
    summaryMetadataJson: JSON.stringify({
      reportName: reportDefinition.name
    }),
    errorMessage: null
  });
  const exportId = exportInsert.lastID;

  try {
    const rawRows = await listIncidentSummaryRows({
      sourceScope,
      rangeStartIso,
      rangeEndIso
    });
    const incidents = normalizeIncidentRows(rawRows);
    const summary = buildIncidentSummary(incidents);
    const pdfPayload = {
      reportName: reportDefinition.name,
      generatedAt: new Date().toISOString(),
      filters: {
        dateRangeKind,
        dateRangeLabel: formatDateRangeLabel(dateRangeKind, rangeStartIso, rangeEndIso),
        sourceScope,
        sourceScopeLabel: SOURCE_SCOPE_LABELS[sourceScope] || sourceScope,
        outputMode,
        outputModeLabel: OUTPUT_MODE_LABELS[outputMode] || outputMode
      },
      sectionIds,
      summary,
      reasonBreakdown: summary.reasonBreakdown || [],
      recentIncidents: incidents.slice(0, 18)
    };

    const pdfBuffer = await buildIncidentSummaryPdf(pdfPayload);
    const summaryMetadata = {
      reportName: reportDefinition.name,
      totalIncidents: summary.totals.totalIncidents,
      sourceScope,
      dateRangeKind,
      sectionCount: sectionIds.length
    };

    await updateReportExportStatus(exportId, {
      status: 'generated',
      filename,
      byteSize: pdfBuffer.length,
      summaryMetadataJson: JSON.stringify(summaryMetadata),
      errorMessage: null
    });

    return {
      exportId,
      filename,
      contentType: 'application/pdf',
      buffer: pdfBuffer,
      summary: summaryMetadata
    };
  } catch (error) {
    await updateReportExportStatus(exportId, {
      status: 'failed',
      filename,
      byteSize: null,
      summaryMetadataJson: JSON.stringify({
        reportName: reportDefinition.name
      }),
      errorMessage: error.message || 'Incident summary export failed.'
    });
    throw error;
  }
}

function normalizeRescueTeamActivityRows(rows) {
  return rows.map((row) => ({
    deploymentId: row.deploymentId,
    deploymentCode: row.deploymentCode || `DPL-${row.deploymentId}`,
    deploymentStatus: String(row.deploymentStatus || '').toLowerCase() || 'unknown',
    statusLabel: formatStatusLabel(row.deploymentStatus),
    sourceType: String(row.sourceType || 'mesh').toLowerCase() === 'online' ? 'online' : 'mesh',
    sourceLabel: formatSourceLabel(row.sourceType),
    distressCode: row.distressCode || 'Unknown',
    reasonRaw: row.reason,
    reasonLabel: formatReasonLabel(row.reason),
    reportedAt: row.reportedAt || null,
    deployedAt: row.deployedAt || null,
    endedAt: row.endedAt || null,
    teamId: row.teamId,
    teamCode: row.teamCode || '',
    teamName: row.teamName || 'Unknown team',
    teamAgency: row.teamAgency || '',
    teamAgencyLabel: formatAgencyLabel(row.teamAgency),
    teamStatus: row.teamStatus || '',
    teamStatusLabel: formatTeamStatusLabel(row.teamStatus),
    leaderRescuerId: row.leaderRescuerId || null,
    leaderRescuerCode: row.leaderRescuerCode || '',
    leaderName: decryptLeaderName(row, 'leader') || row.teamCode || row.teamName || 'Unknown leader',
    responseSeconds: secondsBetween(row.reportedAt, row.deployedAt),
    deploymentDurationSeconds: secondsBetween(row.deployedAt, row.endedAt)
  }));
}

function normalizeRescueTeamRosterRows(rows) {
  return rows.map((row) => {
    const latestLeaderName = decryptLeaderName({
      leaderFirstNameEnc: row.latestLeaderFirstNameEnc,
      leaderMiddleNameEnc: row.latestLeaderMiddleNameEnc,
      leaderLastNameEnc: row.latestLeaderLastNameEnc
    }, 'leader');
    const fallbackLeaderName = decryptLeaderName({
      leaderFirstNameEnc: row.fallbackLeaderFirstNameEnc,
      leaderMiddleNameEnc: row.fallbackLeaderMiddleNameEnc,
      leaderLastNameEnc: row.fallbackLeaderLastNameEnc
    }, 'leader');

    return {
      teamId: row.teamId,
      teamCode: row.teamCode || '',
      teamName: row.teamName || 'Unknown team',
      teamAgency: row.teamAgency || '',
      teamAgencyLabel: formatAgencyLabel(row.teamAgency),
      teamStatus: row.teamStatus || '',
      teamStatusLabel: formatTeamStatusLabel(row.teamStatus),
      memberCount: Number(row.memberCount || 0),
      activeMemberCount: Number(row.activeMemberCount || 0),
      dispatchedMemberCount: Number(row.dispatchedMemberCount || 0),
      leaderRescuerCode: row.latestLeaderRescuerCode || row.fallbackLeaderRescuerCode || '',
      leaderName: latestLeaderName || fallbackLeaderName || 'Unassigned'
    };
  });
}

function buildRescueTeamActivitySummary(activityRows, rosterRows) {
  const teams = new Map();

  activityRows.forEach((row) => {
    if (!teams.has(row.teamId)) {
      teams.set(row.teamId, {
        teamId: row.teamId,
        teamCode: row.teamCode,
        teamName: row.teamName,
        teamAgency: row.teamAgency,
        teamAgencyLabel: row.teamAgencyLabel,
        teamStatusLabel: row.teamStatusLabel,
        latestLeaderName: row.leaderName,
        deploymentTotal: 0,
        activeDeploymentCount: 0,
        canceledDeploymentCount: 0,
        accomplishedDeploymentCount: 0,
        meshDeploymentCount: 0,
        onlineDeploymentCount: 0,
        responseDurations: [],
        deploymentDurations: [],
        reasonCounts: new Map(),
        recentDeployments: []
      });
    }

    const team = teams.get(row.teamId);
    team.deploymentTotal += 1;

    if (row.deploymentStatus === 'deployed') {
      team.activeDeploymentCount += 1;
    } else if (row.deploymentStatus === 'canceled') {
      team.canceledDeploymentCount += 1;
    } else if (row.deploymentStatus === 'accomplished') {
      team.accomplishedDeploymentCount += 1;
    }

    if (row.sourceType === 'online') {
      team.onlineDeploymentCount += 1;
    } else {
      team.meshDeploymentCount += 1;
    }

    if (Number.isFinite(row.responseSeconds)) {
      team.responseDurations.push(row.responseSeconds);
    }

    if (Number.isFinite(row.deploymentDurationSeconds)) {
      team.deploymentDurations.push(row.deploymentDurationSeconds);
    }

    team.reasonCounts.set(row.reasonLabel, (team.reasonCounts.get(row.reasonLabel) || 0) + 1);
    team.recentDeployments.push(row);
  });

  const rosterByTeamId = new Map(rosterRows.map((row) => [row.teamId, row]));
  const teamRows = Array.from(teams.values())
    .map((team) => {
      const roster = rosterByTeamId.get(team.teamId) || null;
      const topReasons = Array.from(team.reasonCounts.entries())
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }
          return left[0].localeCompare(right[0]);
        })
        .slice(0, 3)
        .map(([label, count]) => ({ label, count }));

      return {
        teamId: team.teamId,
        teamCode: team.teamCode,
        teamName: team.teamName,
        teamAgencyLabel: team.teamAgencyLabel,
        teamStatusLabel: roster?.teamStatusLabel || team.teamStatusLabel,
        leaderName: roster?.leaderName || team.latestLeaderName || 'Unassigned',
        leaderRescuerCode: roster?.leaderRescuerCode || '',
        memberCount: roster?.memberCount ?? 0,
        activeMemberCount: roster?.activeMemberCount ?? 0,
        dispatchedMemberCount: roster?.dispatchedMemberCount ?? 0,
        deploymentTotal: team.deploymentTotal,
        activeDeploymentCount: team.activeDeploymentCount,
        canceledDeploymentCount: team.canceledDeploymentCount,
        accomplishedDeploymentCount: team.accomplishedDeploymentCount,
        meshDeploymentCount: team.meshDeploymentCount,
        onlineDeploymentCount: team.onlineDeploymentCount,
        averageResponseSeconds: average(team.responseDurations),
        fastestResponseSeconds: team.responseDurations.length ? Math.min(...team.responseDurations) : null,
        slowestResponseSeconds: team.responseDurations.length ? Math.max(...team.responseDurations) : null,
        averageDeploymentDurationSeconds: average(team.deploymentDurations),
        responseSampleCount: team.responseDurations.length,
        deploymentDurationSampleCount: team.deploymentDurations.length,
        topReasons,
        topReasonSummary: topReasons.length
          ? topReasons.map((item) => `${item.label} (${item.count})`).join(', ')
          : 'No deployment reasons recorded'
      };
    })
    .sort((left, right) => {
      if (right.deploymentTotal !== left.deploymentTotal) {
        return right.deploymentTotal - left.deploymentTotal;
      }
      return left.teamName.localeCompare(right.teamName);
    });

  const recentActivity = activityRows
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.deployedAt || left.reportedAt || 0).getTime();
      const rightTime = new Date(right.deployedAt || right.reportedAt || 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 18);

  const totalDeployments = activityRows.length;
  const activeDeployments = activityRows.filter((row) => row.deploymentStatus === 'deployed').length;
  const closedDeployments = activityRows.filter((row) => row.deploymentStatus === 'canceled' || row.deploymentStatus === 'accomplished').length;

  return {
    overview: {
      teamCount: teamRows.length,
      rosterTeamCount: rosterRows.length,
      totalDeployments,
      activeDeployments,
      closedDeployments
    },
    teamRows,
    rosterRows,
    recentActivity
  };
}

async function generateRescueTeamActivityReport(adminUserId, payload = {}) {
  const reportDefinition = RESCUE_TEAM_ACTIVITY_REPORT;
  const dateRangeKind = String(payload.dateRange || '7d').trim();
  const sourceScope = String(payload.sourceScope || 'all').trim();
  const outputMode = String(payload.outputMode || 'briefing').trim();
  const confirmPassword = String(payload.confirmPassword || '');

  if (!confirmPassword) {
    throw appError('Confirm your admin password before generating a PDF.', 400);
  }

  const passwordIsValid = await verifyAdminPassword(adminUserId, confirmPassword);
  if (!passwordIsValid) {
    throw appError('Admin password confirmation failed.', 403);
  }

  if (!reportDefinition.supportedDateRanges.includes(dateRangeKind)) {
    throw appError('Unsupported date range for rescue team activity report.');
  }

  if (!reportDefinition.supportedSourceScopes.includes(sourceScope)) {
    throw appError('Unsupported source scope for rescue team activity report.');
  }

  if (!reportDefinition.supportedOutputModes.includes(outputMode)) {
    throw appError('Unsupported output mode for rescue team activity report.');
  }

  const sectionIds = normalizeSectionIds(reportDefinition, payload.includeSections);
  const { start, end } = getUtcRange(dateRangeKind);
  const rangeStartIso = start.toISOString();
  const rangeEndIso = end.toISOString();
  const filename = buildRescueTeamActivityFilename(dateRangeKind, sourceScope);
  const exportInsert = await createReportExport({
    reportType: reportDefinition.id,
    sourceScope,
    dateRangeKind,
    rangeStartAt: rangeStartIso,
    rangeEndAt: rangeEndIso,
    outputMode,
    selectedSectionIdsJson: JSON.stringify(sectionIds),
    generatedByAdminUserId: adminUserId,
    status: 'started',
    filename,
    byteSize: null,
    summaryMetadataJson: JSON.stringify({
      reportName: reportDefinition.name
    }),
    errorMessage: null
  });
  const exportId = exportInsert.lastID;

  try {
    const [rawActivityRows, rawRosterRows] = await Promise.all([
      listRescueTeamActivityRows({
        sourceScope,
        rangeStartIso,
        rangeEndIso
      }),
      listRescueTeamRosterRows()
    ]);

    const activityRows = normalizeRescueTeamActivityRows(rawActivityRows);
    const rosterRows = normalizeRescueTeamRosterRows(rawRosterRows);
    const summary = buildRescueTeamActivitySummary(activityRows, rosterRows);
    const pdfPayload = {
      reportName: reportDefinition.name,
      generatedAt: new Date().toISOString(),
      filters: {
        dateRangeKind,
        dateRangeLabel: formatDateRangeLabel(dateRangeKind, rangeStartIso, rangeEndIso),
        sourceScope,
        sourceScopeLabel: SOURCE_SCOPE_LABELS[sourceScope] || sourceScope,
        outputMode,
        outputModeLabel: OUTPUT_MODE_LABELS[outputMode] || outputMode
      },
      sectionIds,
      summary
    };

    const pdfBuffer = await buildRescueTeamActivityPdf(pdfPayload);
    const summaryMetadata = {
      reportName: reportDefinition.name,
      totalDeployments: summary.overview.totalDeployments,
      teamCount: summary.overview.teamCount,
      sourceScope,
      dateRangeKind,
      sectionCount: sectionIds.length
    };

    await updateReportExportStatus(exportId, {
      status: 'generated',
      filename,
      byteSize: pdfBuffer.length,
      summaryMetadataJson: JSON.stringify(summaryMetadata),
      errorMessage: null
    });

    return {
      exportId,
      filename,
      contentType: 'application/pdf',
      buffer: pdfBuffer,
      summary: summaryMetadata
    };
  } catch (error) {
    await updateReportExportStatus(exportId, {
      status: 'failed',
      filename,
      byteSize: null,
      summaryMetadataJson: JSON.stringify({
        reportName: reportDefinition.name
      }),
      errorMessage: error.message || 'Rescue team activity export failed.'
    });
    throw error;
  }
}

module.exports = {
  getAdminReportCatalog,
  listAdminReportExports,
  generateIncidentSummaryReport,
  generateRescueTeamActivityReport
};
