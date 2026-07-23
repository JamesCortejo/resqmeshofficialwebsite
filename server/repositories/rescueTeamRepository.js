const { run, get, all, transaction } = require('../database/postgres');

function formatRescueTeamCode(value) {
  return `RST-${String(value).padStart(3, '0')}`;
}

async function generateRescueTeamCode() {
  return transaction(async (trx) => {
    const row = await trx.get('SELECT last_value FROM rescue_team_code_sequence WHERE id = 1 FOR UPDATE');
    const nextValue = row.last_value + 1;

    await trx.run('UPDATE rescue_team_code_sequence SET last_value = ? WHERE id = 1', [nextValue]);

    return formatRescueTeamCode(nextValue);
  });
}

function findRescueTeamByName(name) {
  return get(`
    SELECT
      id,
      team_code AS teamCode,
      name,
      agency,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM rescue_teams
    WHERE LOWER(name) = LOWER(?)
    LIMIT 1
  `, [name]);
}

function createRescueTeam(team) {
  return run(`
    INSERT INTO rescue_teams (
      team_code,
      name,
      agency,
      status
    ) VALUES (?, ?, ?, ?)
    RETURNING id
  `, [
    team.teamCode,
    team.name,
    team.agency,
    team.status
  ]);
}

function updateRescueTeam(id, team) {
  return run(`
    UPDATE rescue_teams
    SET
      name = ?,
      agency = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    team.name,
    team.agency,
    team.status,
    id
  ]);
}

function getRescueTeamById(id) {
  return get(`
    SELECT
      id,
      team_code AS teamCode,
      name,
      agency,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM rescue_teams
    WHERE id = ?
    LIMIT 1
  `, [id]);
}

function getRescueTeamSummaryById(id) {
  return get(`
    SELECT
      t.id,
      t.team_code AS teamCode,
      t.name,
      t.agency,
      t.status,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt,
      COUNT(r.id) AS memberCount
    FROM rescue_teams t
    LEFT JOIN rescuers r ON r.team_id = t.id
    WHERE t.id = ?
    GROUP BY t.id, t.team_code, t.name, t.agency, t.status, t.created_at, t.updated_at
    LIMIT 1
  `, [id]);
}

function listRescueTeams() {
  return all(`
    SELECT
      t.id,
      t.team_code AS teamCode,
      t.name,
      t.agency,
      t.status,
      t.created_at AS createdAt,
      t.updated_at AS updatedAt,
      COUNT(r.id) AS memberCount
    FROM rescue_teams t
    LEFT JOIN rescuers r ON r.team_id = t.id
    GROUP BY t.id, t.team_code, t.name, t.agency, t.status, t.created_at, t.updated_at
    ORDER BY t.created_at DESC, t.id DESC
  `);
}

function getRescueTeamMembers(teamId) {
  return all(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.middle_name_enc AS middleNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      r.team_id AS teamId,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus
    FROM rescuers r
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    WHERE r.team_id = ?
    ORDER BY r.created_at ASC, r.id ASC
  `, [teamId]);
}

function listAssignableRescuers() {
  return all(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.middle_name_enc AS middleNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      r.team_id AS teamId,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus
    FROM rescuers r
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    WHERE r.access_status = 'active' AND r.team_id IS NULL
    ORDER BY r.created_at DESC, r.id DESC
  `);
}

function listRescuersByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return Promise.resolve([]);
  }

  const placeholders = ids.map(() => '?').join(', ');

  return all(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.middle_name_enc AS middleNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      r.team_id AS teamId,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus
    FROM rescuers r
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    WHERE r.id IN (${placeholders})
  `, ids);
}

function unassignRemovedRescuers(teamId, keepIds) {
  if (!Array.isArray(keepIds) || keepIds.length === 0) {
    return run(`
      UPDATE rescuers
      SET
        team_id = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE team_id = ?
    `, [teamId]);
  }

  const placeholders = keepIds.map(() => '?').join(', ');

  return run(`
    UPDATE rescuers
    SET
      team_id = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE team_id = ? AND id NOT IN (${placeholders})
  `, [teamId, ...keepIds]);
}

function assignRescuersToTeam(teamId, rescuerIds) {
  if (!Array.isArray(rescuerIds) || rescuerIds.length === 0) {
    return Promise.resolve({ changes: 0 });
  }

  const placeholders = rescuerIds.map(() => '?').join(', ');

  return run(`
    UPDATE rescuers
    SET
      team_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders})
  `, [teamId, ...rescuerIds]);
}

function countRescuersForTeam(teamId) {
  return get(`
    SELECT COUNT(*) AS count
    FROM rescuers
    WHERE team_id = ?
  `, [teamId]);
}

module.exports = {
  generateRescueTeamCode,
  findRescueTeamByName,
  createRescueTeam,
  updateRescueTeam,
  getRescueTeamById,
  getRescueTeamSummaryById,
  listRescueTeams,
  getRescueTeamMembers,
  listAssignableRescuers,
  listRescuersByIds,
  unassignRemovedRescuers,
  assignRescuersToTeam,
  countRescuersForTeam
};
