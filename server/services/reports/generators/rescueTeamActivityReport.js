const { RESCUE_TEAM_ACTIVITY_REPORT } = require('../../../reports/catalog');
const { buildRescueTeamActivityPdf } = require('../../../reports/builders/rescueTeamActivityPdfBuilder');
const { verifyAdminPassword } = require('../../adminAuthService');
const {
  listRescueTeamActivityRows,
  listRescueTeamRosterRows,
  createReportExport,
  updateReportExportStatus
} = require('../../../repositories/reportRepository');
const {
  SOURCE_SCOPE_LABELS,
  OUTPUT_MODE_LABELS,
  appError,
  getUtcRange,
  normalizeSectionIds,
  formatDateRangeLabel,
  buildRescueTeamActivityFilename
} = require('../reportShared');
const {
  normalizeRescueTeamActivityRows,
  normalizeRescueTeamRosterRows,
  buildRescueTeamActivitySummary
} = require('../reportSummaries');

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
  generateRescueTeamActivityReport
};
