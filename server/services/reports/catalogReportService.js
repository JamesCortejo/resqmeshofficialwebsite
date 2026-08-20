const {
  listReportCatalog,
  DATE_RANGE_LABELS,
  SOURCE_SCOPE_LABELS,
  ACCOUNT_SCOPE_LABELS,
  OUTPUT_MODE_LABELS
} = require('../../reports/catalog');
const {
  getAdminExportCount,
  listRecentReportExports
} = require('../../repositories/reportRepository');
const {
  shapeCatalogReport,
  shapeExportRow
} = require('./reportShared');

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

module.exports = {
  getAdminReportCatalog,
  listAdminReportExports
};
