const { all } = require('../../database/postgres');

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

module.exports = {
  listIncidentSummaryRows
};
