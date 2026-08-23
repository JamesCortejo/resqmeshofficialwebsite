const { INCIDENT_SUMMARY_REPORT } = require('../../../reports/catalog');
const { buildIncidentSummaryPdf } = require('../../../reports/builders/incidentSummaryPdfBuilder');
const { verifyAdminPassword } = require('../../adminAuthService');
const {
  listIncidentSummaryRows,
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
  buildFilename
} = require('../reportShared');
const {
  normalizeIncidentRows,
  buildIncidentSummary
} = require('../reportSummaries');

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
  const { start, end } = getUtcRange(dateRangeKind, payload);
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

module.exports = {
  generateIncidentSummaryReport
};
