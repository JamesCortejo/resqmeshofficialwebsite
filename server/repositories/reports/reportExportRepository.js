const { all, get, run } = require('../../database/postgres');

async function createReportExport(entry) {
  return run(`
    INSERT INTO report_exports (
      report_type,
      source_scope,
      date_range_kind,
      range_start_at,
      range_end_at,
      output_mode,
      selected_section_ids_json,
      generated_by_admin_user_id,
      status,
      filename,
      byte_size,
      summary_metadata_json,
      error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [
    entry.reportType,
    entry.sourceScope,
    entry.dateRangeKind,
    entry.rangeStartAt,
    entry.rangeEndAt,
    entry.outputMode,
    entry.selectedSectionIdsJson,
    entry.generatedByAdminUserId,
    entry.status,
    entry.filename,
    entry.byteSize,
    entry.summaryMetadataJson,
    entry.errorMessage
  ]);
}

async function updateReportExportStatus(id, entry) {
  return run(`
    UPDATE report_exports
    SET
      status = ?,
      filename = ?,
      byte_size = ?,
      summary_metadata_json = ?,
      error_message = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    entry.status,
    entry.filename,
    entry.byteSize,
    entry.summaryMetadataJson,
    entry.errorMessage,
    id
  ]);
}

async function listRecentReportExports(limit = 5) {
  return all(`
    SELECT
      re.id,
      re.report_type AS "reportType",
      re.source_scope AS "sourceScope",
      re.date_range_kind AS "dateRangeKind",
      re.range_start_at AS "rangeStartAt",
      re.range_end_at AS "rangeEndAt",
      re.output_mode AS "outputMode",
      re.selected_section_ids_json AS "selectedSectionIdsJson",
      re.generated_by_admin_user_id AS "generatedByAdminUserId",
      re.status,
      re.filename,
      re.byte_size AS "byteSize",
      re.summary_metadata_json AS "summaryMetadataJson",
      re.error_message AS "errorMessage",
      re.created_at AS "createdAt",
      re.updated_at AS "updatedAt",
      u.user_code AS "adminUserCode"
    FROM report_exports re
    LEFT JOIN users u ON u.id = re.generated_by_admin_user_id
    ORDER BY re.created_at DESC, re.id DESC
    LIMIT ?
  `, [limit]);
}

async function getAdminExportCount() {
  return get(`
    SELECT COUNT(*)::int AS count
    FROM report_exports
  `);
}

module.exports = {
  createReportExport,
  updateReportExportStatus,
  listRecentReportExports,
  getAdminExportCount
};
