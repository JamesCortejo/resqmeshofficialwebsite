const {
  listReportCatalog,
  INCIDENT_SUMMARY_REPORT,
  RESCUE_TEAM_ACTIVITY_REPORT,
  ACCOUNTS_ACCESS_AUDIT_REPORT,
  MESH_DEVICE_SYNC_HEALTH_REPORT,
  ONLINE_COMMUNICATIONS_MODERATION_REPORT
} = require('../reports/catalog');
const { buildIncidentSummaryPdf } = require('../reports/builders/incidentSummaryPdfBuilder');
const { buildRescueTeamActivityPdf } = require('../reports/builders/rescueTeamActivityPdfBuilder');
const { buildAccountsAccessAuditPdf } = require('../reports/builders/accountsAccessAuditPdfBuilder');
const { buildMeshDeviceSyncHealthPdf } = require('../reports/builders/meshDeviceSyncHealthPdfBuilder');
const { buildOnlineCommunicationsModerationPdf } = require('../reports/builders/onlineCommunicationsModerationPdfBuilder');
const { verifyAdminPassword } = require('./adminAuthService');
const { decryptText } = require('./encryptionService');
const {
  listIncidentSummaryRows,
  listRescueTeamActivityRows,
  listRescueTeamRosterRows,
  listMeshDeviceSyncHealthRows,
  listMeshCommandTypeRows,
  listOnlineDepartmentActivityRows,
  getOnlineGlobalAnnouncementSummary,
  getOnlineConversationLoadSummary,
  getOnlineSenderActivitySummary,
  getOnlineModerationSummary,
  listRecentOnlineCommunicationEventRows,
  createReportExport,
  updateReportExportStatus,
  listRecentReportExports,
  getAdminExportCount
} = require('../repositories/reportRepository');
const {
  listAccountAccessAuditRows,
  getAccountStatusSnapshot,
  getRescuerAccessSnapshot,
  getRegistrationIntakeTotals,
  getAdminActionTotals,
  getLoginSessionActivity,
  listRescuerAccessRosterRows
} = require('../repositories/accountAccessAuditRepository');
const {
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
} = require('./reports/reportShared');
const {
  normalizeIncidentRows,
  buildIncidentSummary,
  normalizeAuditRows,
  normalizeRescuerAccessRoster,
  buildAccountsAccessAuditSummary,
  normalizeMeshDeviceSyncRows,
  buildMeshDeviceSyncHealthSummary,
  normalizeOnlineDepartmentActivityRows,
  normalizeTopConversationRows,
  normalizeRecentCommunicationEventRows,
  summarizeUnreadRows,
  buildOnlineCommunicationsModerationSummary,
  normalizeRescueTeamActivityRows,
  normalizeRescueTeamRosterRows,
  buildRescueTeamActivitySummary
} = require('./reports/reportSummaries');

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
    supportedAccountScopes: ACCOUNT_SCOPE_LABELS,
    supportedOutputModes: OUTPUT_MODE_LABELS
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

async function generateAccountsAccessAuditReport(adminUserId, payload = {}) {
  const reportDefinition = ACCOUNTS_ACCESS_AUDIT_REPORT;
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
    throw appError('Unsupported date range for accounts and access audit report.');
  }

  if (!reportDefinition.supportedSourceScopes.includes(sourceScope)) {
    throw appError('Unsupported account scope for accounts and access audit report.');
  }

  if (!reportDefinition.supportedOutputModes.includes(outputMode)) {
    throw appError('Unsupported output mode for accounts and access audit report.');
  }

  const sectionIds = normalizeSectionIds(reportDefinition, payload.includeSections);
  const { start, end } = getUtcRange(dateRangeKind);
  const rangeStartIso = start.toISOString();
  const rangeEndIso = end.toISOString();
  const filename = buildAccountsAccessAuditFilename(dateRangeKind, sourceScope);
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
    const [intakeTotals, civilianSnapshot, rescuerSnapshot, actionTotals, sessionTotals, rawAuditRows, rawRosterRows] = await Promise.all([
      getRegistrationIntakeTotals({ scope: sourceScope, rangeStartIso, rangeEndIso }),
      sourceScope === 'rescuer' ? null : getAccountStatusSnapshot(),
      sourceScope === 'civilian' ? null : getRescuerAccessSnapshot(),
      getAdminActionTotals({ scope: sourceScope, rangeStartIso, rangeEndIso }),
      getLoginSessionActivity({ scope: sourceScope, rangeStartIso, rangeEndIso }),
      listAccountAccessAuditRows({ scope: sourceScope, rangeStartIso, rangeEndIso, limit: 80 }),
      sourceScope === 'civilian' ? [] : listRescuerAccessRosterRows()
    ]);

    const auditRows = normalizeAuditRows(rawAuditRows);
    const rosterRows = normalizeRescuerAccessRoster(rawRosterRows);
    const summary = buildAccountsAccessAuditSummary({
      scope: sourceScope,
      intakeTotals,
      civilianSnapshot,
      rescuerSnapshot,
      actionTotals,
      sessionTotals,
      auditRows,
      rosterRows
    });

    const pdfPayload = {
      reportName: reportDefinition.name,
      generatedAt: new Date().toISOString(),
      filters: {
        dateRangeKind,
        dateRangeLabel: formatDateRangeLabel(dateRangeKind, rangeStartIso, rangeEndIso),
        sourceScope,
        sourceScopeLabel: ACCOUNT_SCOPE_LABELS[sourceScope] || sourceScope,
        outputMode,
        outputModeLabel: OUTPUT_MODE_LABELS[outputMode] || outputMode
      },
      sectionIds,
      summary
    };

    const pdfBuffer = await buildAccountsAccessAuditPdf(pdfPayload);
    const summaryMetadata = {
      reportName: reportDefinition.name,
      auditEventCount: summary.recentAuditRows.length,
      rosterCount: summary.rosterRows.length,
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
      errorMessage: error.message || 'Accounts and access audit export failed.'
    });
    throw error;
  }
}

async function generateOnlineCommunicationsModerationReport(adminUserId, payload = {}) {
  const reportDefinition = ONLINE_COMMUNICATIONS_MODERATION_REPORT;
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
    throw appError('Unsupported date range for online communications and moderation report.');
  }

  if (!reportDefinition.supportedSourceScopes.includes(sourceScope)) {
    throw appError('Unsupported chat scope for online communications and moderation report.');
  }

  if (!reportDefinition.supportedOutputModes.includes(outputMode)) {
    throw appError('Unsupported output mode for online communications and moderation report.');
  }

  const sectionIds = normalizeSectionIds(reportDefinition, payload.includeSections);
  const { start, end } = getUtcRange(dateRangeKind);
  const rangeStartIso = start.toISOString();
  const rangeEndIso = end.toISOString();
  const filename = buildOnlineCommunicationsModerationFilename(dateRangeKind, sourceScope);
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
    const includeDepartments = sourceScope === 'all' || sourceScope === 'department';
    const includeGlobal = sourceScope === 'all' || sourceScope === 'global';

    const [rawDepartmentRows, globalSummary, conversationLoad, senderActivity, moderationSummary, recentEventRows] = await Promise.all([
      includeDepartments ? listOnlineDepartmentActivityRows({ rangeStartIso, rangeEndIso }) : [],
      includeGlobal ? getOnlineGlobalAnnouncementSummary({ rangeStartIso, rangeEndIso }) : null,
      getOnlineConversationLoadSummary({ chatScope: sourceScope, rangeStartIso, rangeEndIso }),
      getOnlineSenderActivitySummary({ chatScope: sourceScope, rangeStartIso, rangeEndIso }),
      sourceScope === 'global'
        ? Promise.resolve({ eventRows: [], activeCivilianTimeoutCount: 0, activeRescuerTimeoutCount: 0 })
        : getOnlineModerationSummary({ rangeStartIso, rangeEndIso }),
      listRecentOnlineCommunicationEventRows({ chatScope: sourceScope, rangeStartIso, rangeEndIso, limit: 60 })
    ]);

    const departmentRows = normalizeOnlineDepartmentActivityRows(rawDepartmentRows);
    const summary = buildOnlineCommunicationsModerationSummary({
      chatScope: sourceScope,
      departmentRows,
      globalSummary,
      conversationLoad,
      senderActivity,
      moderationSummary,
      recentEventRows
    });

    const pdfPayload = {
      reportName: reportDefinition.name,
      generatedAt: new Date().toISOString(),
      filters: {
        dateRangeKind,
        dateRangeLabel: formatDateRangeLabel(dateRangeKind, rangeStartIso, rangeEndIso),
        sourceScope,
        sourceScopeLabel: CHAT_SCOPE_LABELS[sourceScope] || sourceScope,
        outputMode,
        outputModeLabel: OUTPUT_MODE_LABELS[outputMode] || outputMode
      },
      sectionIds,
      summary
    };

    const pdfBuffer = await buildOnlineCommunicationsModerationPdf(pdfPayload);
    const summaryMetadata = {
      reportName: reportDefinition.name,
      departmentMessageCount: summary.overview.departmentMessageCount,
      globalMessageCount: summary.overview.globalMessageCount,
      moderationEventCount: summary.overview.moderationEventCount,
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
      errorMessage: error.message || 'Online communications and moderation export failed.'
    });
    throw error;
  }
}

async function generateMeshDeviceSyncHealthReport(adminUserId, payload = {}) {
  const reportDefinition = MESH_DEVICE_SYNC_HEALTH_REPORT;
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
    throw appError('Unsupported date range for mesh device and sync health report.');
  }

  if (!reportDefinition.supportedSourceScopes.includes(sourceScope)) {
    throw appError('Unsupported node scope for mesh device and sync health report.');
  }

  if (!reportDefinition.supportedOutputModes.includes(outputMode)) {
    throw appError('Unsupported output mode for mesh device and sync health report.');
  }

  const sectionIds = normalizeSectionIds(reportDefinition, payload.includeSections);
  const { start, end } = getUtcRange(dateRangeKind);
  const rangeStartIso = start.toISOString();
  const rangeEndIso = end.toISOString();
  const filename = buildMeshDeviceSyncHealthFilename(dateRangeKind, sourceScope);
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
    const [rawDeviceRows, commandTypeRows] = await Promise.all([
      listMeshDeviceSyncHealthRows({
        nodeScope: sourceScope,
        rangeStartIso,
        rangeEndIso
      }),
      listMeshCommandTypeRows({
        nodeScope: sourceScope,
        rangeStartIso,
        rangeEndIso
      })
    ]);

    const deviceRows = normalizeMeshDeviceSyncRows(rawDeviceRows);
    const summary = buildMeshDeviceSyncHealthSummary(deviceRows, commandTypeRows);
    const pdfPayload = {
      reportName: reportDefinition.name,
      generatedAt: new Date().toISOString(),
      filters: {
        dateRangeKind,
        dateRangeLabel: formatDateRangeLabel(dateRangeKind, rangeStartIso, rangeEndIso),
        sourceScope,
        sourceScopeLabel: NODE_SCOPE_LABELS[sourceScope] || sourceScope,
        outputMode,
        outputModeLabel: OUTPUT_MODE_LABELS[outputMode] || outputMode
      },
      sectionIds,
      summary
    };

    const pdfBuffer = await buildMeshDeviceSyncHealthPdf(pdfPayload);
    const summaryMetadata = {
      reportName: reportDefinition.name,
      registeredDevices: summary.overview.registeredDevices,
      pendingCommands: summary.queue.pendingCount,
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
      errorMessage: error.message || 'Mesh device and sync health export failed.'
    });
    throw error;
  }
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
  generateRescueTeamActivityReport,
  generateAccountsAccessAuditReport,
  generateMeshDeviceSyncHealthReport,
  generateOnlineCommunicationsModerationReport
};
