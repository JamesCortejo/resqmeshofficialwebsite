const { MESH_DEVICE_SYNC_HEALTH_REPORT } = require('../../../reports/catalog');
const { buildMeshDeviceSyncHealthPdf } = require('../../../reports/builders/meshDeviceSyncHealthPdfBuilder');
const { verifyAdminPassword } = require('../../adminAuthService');
const {
  listMeshDeviceSyncHealthRows,
  listMeshCommandTypeRows,
  createReportExport,
  updateReportExportStatus
} = require('../../../repositories/reportRepository');
const {
  NODE_SCOPE_LABELS,
  OUTPUT_MODE_LABELS,
  appError,
  getUtcRange,
  normalizeSectionIds,
  formatDateRangeLabel,
  buildMeshDeviceSyncHealthFilename
} = require('../reportShared');
const {
  normalizeMeshDeviceSyncRows,
  buildMeshDeviceSyncHealthSummary
} = require('../reportSummaries');

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
  const { start, end } = getUtcRange(dateRangeKind, payload);
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

module.exports = {
  generateMeshDeviceSyncHealthReport
};
