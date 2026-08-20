const { ONLINE_COMMUNICATIONS_MODERATION_REPORT } = require('../../../reports/catalog');
const { buildOnlineCommunicationsModerationPdf } = require('../../../reports/builders/onlineCommunicationsModerationPdfBuilder');
const { verifyAdminPassword } = require('../../adminAuthService');
const {
  listOnlineDepartmentActivityRows,
  getOnlineGlobalAnnouncementSummary,
  getOnlineConversationLoadSummary,
  getOnlineSenderActivitySummary,
  getOnlineModerationSummary,
  listRecentOnlineCommunicationEventRows,
  createReportExport,
  updateReportExportStatus
} = require('../../../repositories/reportRepository');
const {
  CHAT_SCOPE_LABELS,
  OUTPUT_MODE_LABELS,
  appError,
  getUtcRange,
  normalizeSectionIds,
  formatDateRangeLabel,
  buildOnlineCommunicationsModerationFilename
} = require('../reportShared');
const {
  normalizeOnlineDepartmentActivityRows,
  buildOnlineCommunicationsModerationSummary
} = require('../reportSummaries');

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

module.exports = {
  generateOnlineCommunicationsModerationReport
};
