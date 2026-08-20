const { all } = require('../../database/postgres');

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

module.exports = {
  listRescueTeamActivityRows,
  listRescueTeamRosterRows
};
