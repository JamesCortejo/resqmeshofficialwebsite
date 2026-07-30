const { all, get, run } = require('../database/postgres');

function buildIncidentUnionSql(sourceScope) {
  const parts = [];

  if (sourceScope === 'all' || sourceScope === 'mesh') {
    parts.push(`
      SELECT
        'mesh' AS "sourceType",
        m.id AS "incidentId",
        COALESCE(NULLIF(m.distress_code, ''), CONCAT('MDS-', m.id)) AS "distressCode",
        COALESCE(NULLIF(TRIM(m.reason), ''), 'Unknown') AS reason,
        CASE
          WHEN LOWER(COALESCE(d.status, '')) = 'accomplished' THEN 'accomplished'
          WHEN LOWER(COALESCE(d.status, '')) IN ('canceled', 'cancelled') THEN 'canceled'
          WHEN LOWER(COALESCE(m.status, 'active')) = 'accomplished' THEN 'accomplished'
          WHEN LOWER(COALESCE(m.status, 'active')) IN ('canceled', 'cancelled') THEN 'canceled'
          ELSE 'active'
        END AS "incidentStatus",
        m.timestamp AS "reportedAt",
        d.deployed_at AS "deployedAt",
        COALESCE(d.accomplished_at, d.canceled_at) AS "endedAt",
        d.deployment_code AS "deploymentCode",
        rt.name AS "teamName",
        d.status AS "deploymentStatus"
      FROM mesh_distress_signals m
      LEFT JOIN LATERAL (
        SELECT dd.*
        FROM distress_deployments dd
        WHERE dd.mesh_distress_signal_id = m.id
        ORDER BY COALESCE(dd.updated_at, dd.created_at) DESC, dd.id DESC
        LIMIT 1
      ) d ON TRUE
      LEFT JOIN rescue_teams rt ON rt.id = d.team_id
      WHERE m.deleted = 0
        AND m.timestamp IS NOT NULL
        AND m.timestamp >= ?
        AND m.timestamp < ?
    `);
  }

  if (sourceScope === 'all' || sourceScope === 'online') {
    parts.push(`
      SELECT
        'online' AS "sourceType",
        o.id AS "incidentId",
        o.distress_code AS "distressCode",
        COALESCE(NULLIF(TRIM(o.reason), ''), 'Unknown') AS reason,
        CASE
          WHEN LOWER(COALESCE(d.status, '')) = 'accomplished' THEN 'accomplished'
          WHEN LOWER(COALESCE(d.status, '')) IN ('canceled', 'cancelled') THEN 'canceled'
          WHEN LOWER(COALESCE(o.status, 'active')) = 'accomplished' THEN 'accomplished'
          WHEN LOWER(COALESCE(o.status, 'active')) IN ('canceled', 'cancelled') THEN 'canceled'
          ELSE 'active'
        END AS "incidentStatus",
        o.recorded_at AS "reportedAt",
        d.deployed_at AS "deployedAt",
        COALESCE(d.accomplished_at, d.canceled_at, o.accomplished_at, o.canceled_at) AS "endedAt",
        d.deployment_code AS "deploymentCode",
        rt.name AS "teamName",
        d.status AS "deploymentStatus"
      FROM online_distress_signals o
      LEFT JOIN LATERAL (
        SELECT dd.*
        FROM distress_deployments dd
        WHERE dd.online_distress_signal_id = o.id
        ORDER BY COALESCE(dd.updated_at, dd.created_at) DESC, dd.id DESC
        LIMIT 1
      ) d ON TRUE
      LEFT JOIN rescue_teams rt ON rt.id = d.team_id
      WHERE o.deleted = 0
        AND o.recorded_at >= ?
        AND o.recorded_at < ?
    `);
  }

  return parts.join('\nUNION ALL\n');
}

async function listIncidentSummaryRows({ sourceScope, rangeStartIso, rangeEndIso }) {
  const sql = buildIncidentUnionSql(sourceScope);

  if (!sql) {
    return [];
  }

  const params = [];
  if (sourceScope === 'all' || sourceScope === 'mesh') {
    params.push(rangeStartIso, rangeEndIso);
  }
  if (sourceScope === 'all' || sourceScope === 'online') {
    params.push(rangeStartIso, rangeEndIso);
  }

  return all(`
    WITH incidents AS (
      ${sql}
    )
    SELECT *
    FROM incidents
    ORDER BY "reportedAt" DESC, "distressCode" DESC
  `, params);
}

async function listRescueTeamActivityRows({ sourceScope, rangeStartIso, rangeEndIso }) {
  const params = [rangeStartIso, rangeEndIso];
  let sourceFilterSql = '';

  if (sourceScope === 'mesh') {
    sourceFilterSql = `AND COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'mesh'`;
  } else if (sourceScope === 'online') {
    sourceFilterSql = `AND COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'`;
  }

  return all(`
    SELECT
      d.id AS "deploymentId",
      d.deployment_code AS "deploymentCode",
      d.status AS "deploymentStatus",
      d.created_at AS "createdAt",
      d.deployed_at AS "deployedAt",
      COALESCE(d.accomplished_at, d.canceled_at) AS "endedAt",
      t.id AS "teamId",
      t.team_code AS "teamCode",
      t.name AS "teamName",
      t.agency AS "teamAgency",
      t.status AS "teamStatus",
      r.id AS "leaderRescuerId",
      r.rescuer_code AS "leaderRescuerCode",
      r.first_name_enc AS "leaderFirstNameEnc",
      r.middle_name_enc AS "leaderMiddleNameEnc",
      r.last_name_enc AS "leaderLastNameEnc",
      CASE
        WHEN COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'
          THEN 'online'
        ELSE 'mesh'
      END AS "sourceType",
      CASE
        WHEN COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'
          THEN o.distress_code
        ELSE COALESCE(NULLIF(m.distress_code, ''), CONCAT('MDS-', m.id))
      END AS "distressCode",
      CASE
        WHEN COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'
          THEN COALESCE(NULLIF(TRIM(o.reason), ''), 'Unknown')
        ELSE COALESCE(NULLIF(TRIM(m.reason), ''), 'Unknown')
      END AS reason,
      CASE
        WHEN COALESCE(NULLIF(LOWER(d.distress_source), ''), CASE WHEN d.online_distress_signal_id IS NOT NULL THEN 'online' ELSE 'mesh' END) = 'online'
          THEN o.recorded_at
        ELSE m.timestamp
      END AS "reportedAt"
    FROM distress_deployments d
    INNER JOIN rescue_teams t ON t.id = d.team_id
    LEFT JOIN rescuers r ON r.id = d.team_leader_rescuer_id
    LEFT JOIN mesh_distress_signals m ON m.id = d.mesh_distress_signal_id
    LEFT JOIN online_distress_signals o ON o.id = d.online_distress_signal_id
    WHERE COALESCE(d.deployed_at, d.created_at) >= ?
      AND COALESCE(d.deployed_at, d.created_at) < ?
      ${sourceFilterSql}
    ORDER BY COALESCE(d.deployed_at, d.created_at) DESC, d.id DESC
  `, params);
}

async function listRescueTeamRosterRows() {
  return all(`
    SELECT
      t.id AS "teamId",
      t.team_code AS "teamCode",
      t.name AS "teamName",
      t.agency AS "teamAgency",
      t.status AS "teamStatus",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt",
      COUNT(rm.id) AS "memberCount",
      COUNT(rm.id) FILTER (WHERE rm.access_status = 'active') AS "activeMemberCount",
      COUNT(rm.id) FILTER (WHERE rm.access_status = 'active' AND LOWER(COALESCE(rm.status, '')) = 'dispatched') AS "dispatchedMemberCount",
      latest_leader.rescuerCode AS "latestLeaderRescuerCode",
      latest_leader.firstNameEnc AS "latestLeaderFirstNameEnc",
      latest_leader.middleNameEnc AS "latestLeaderMiddleNameEnc",
      latest_leader.lastNameEnc AS "latestLeaderLastNameEnc",
      fallback_leader.rescuerCode AS "fallbackLeaderRescuerCode",
      fallback_leader.firstNameEnc AS "fallbackLeaderFirstNameEnc",
      fallback_leader.middleNameEnc AS "fallbackLeaderMiddleNameEnc",
      fallback_leader.lastNameEnc AS "fallbackLeaderLastNameEnc"
    FROM rescue_teams t
    LEFT JOIN rescuers rm ON rm.team_id = t.id
    LEFT JOIN LATERAL (
      SELECT
        r.rescuer_code AS "rescuerCode",
        r.first_name_enc AS "firstNameEnc",
        r.middle_name_enc AS "middleNameEnc",
        r.last_name_enc AS "lastNameEnc"
      FROM distress_deployments d
      INNER JOIN rescuers r ON r.id = d.team_leader_rescuer_id
      WHERE d.team_id = t.id
      ORDER BY COALESCE(d.deployed_at, d.updated_at, d.created_at) DESC, d.id DESC
      LIMIT 1
    ) latest_leader ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        r.rescuer_code AS "rescuerCode",
        r.first_name_enc AS "firstNameEnc",
        r.middle_name_enc AS "middleNameEnc",
        r.last_name_enc AS "lastNameEnc"
      FROM rescuers r
      WHERE r.team_id = t.id
      ORDER BY
        CASE WHEN r.access_status = 'active' THEN 0 ELSE 1 END,
        r.created_at ASC,
        r.id ASC
      LIMIT 1
    ) fallback_leader ON TRUE
    GROUP BY
      t.id,
      t.team_code,
      t.name,
      t.agency,
      t.status,
      t.created_at,
      t.updated_at,
      latest_leader.rescuerCode,
      latest_leader.firstNameEnc,
      latest_leader.middleNameEnc,
      latest_leader.lastNameEnc,
      fallback_leader.rescuerCode,
      fallback_leader.firstNameEnc,
      fallback_leader.middleNameEnc,
      fallback_leader.lastNameEnc
    ORDER BY t.name ASC, t.id ASC
  `);
}

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
  listIncidentSummaryRows,
  listRescueTeamActivityRows,
  listRescueTeamRosterRows,
  createReportExport,
  updateReportExportStatus,
  listRecentReportExports,
  getAdminExportCount
};
