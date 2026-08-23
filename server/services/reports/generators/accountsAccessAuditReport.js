const { ACCOUNTS_ACCESS_AUDIT_REPORT } = require('../../../reports/catalog');
const { buildAccountsAccessAuditPdf } = require('../../../reports/builders/accountsAccessAuditPdfBuilder');
const { verifyAdminPassword } = require('../../adminAuthService');
const {
  createReportExport,
  updateReportExportStatus
} = require('../../../repositories/reportRepository');
const {
  listAccountAccessAuditRows,
  getAccountStatusSnapshot,
  getRescuerAccessSnapshot,
  getRegistrationIntakeTotals,
  getAdminActionTotals,
  getLoginSessionActivity,
  listRescuerAccessRosterRows
} = require('../../../repositories/accountAccessAuditRepository');
const {
  ACCOUNT_SCOPE_LABELS,
  OUTPUT_MODE_LABELS,
  appError,
  getUtcRange,
  normalizeSectionIds,
  formatDateRangeLabel,
  buildAccountsAccessAuditFilename
} = require('../reportShared');
const {
  normalizeAuditRows,
  normalizeRescuerAccessRoster,
  buildAccountsAccessAuditSummary
} = require('../reportSummaries');

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
  const { start, end } = getUtcRange(dateRangeKind, payload);
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

module.exports = {
  generateAccountsAccessAuditReport
};
