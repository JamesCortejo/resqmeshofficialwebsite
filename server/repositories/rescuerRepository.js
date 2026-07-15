const { run, get, all } = require('../database/sqlite');

function formatRescuerCode(value) {
  return `RSC-${String(value).padStart(3, '0')}`;
}

async function generateRescuerCode() {
  await run('BEGIN IMMEDIATE TRANSACTION');

  try {
    const row = await get('SELECT last_value FROM rescuer_code_sequence WHERE id = 1');
    const nextValue = row.last_value + 1;

    await run('UPDATE rescuer_code_sequence SET last_value = ? WHERE id = 1', [nextValue]);
    await run('COMMIT');

    return formatRescuerCode(nextValue);
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

function createRescuer(rescuer) {
  return run(`
    INSERT INTO rescuers (
      rescuer_code,
      first_name_enc,
      middle_name_enc,
      last_name_enc,
      birth_date_enc,
      phone_enc,
      password_hash,
      phone_lookup_hash,
      agency,
      status,
      team_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    rescuer.rescuerCode,
    rescuer.firstNameEnc,
    rescuer.middleNameEnc,
    rescuer.lastNameEnc,
    rescuer.birthDateEnc,
    rescuer.phoneEnc,
    rescuer.passwordHash,
    rescuer.phoneLookupHash,
    rescuer.agency,
    rescuer.status,
    rescuer.teamId
  ]);
}

function findRescuerByPhoneLookupHash(phoneLookupHash) {
  return get(`
    SELECT
      id,
      rescuer_code AS rescuerCode,
      phone_lookup_hash AS phoneLookupHash
    FROM rescuers
    WHERE phone_lookup_hash = ?
    LIMIT 1
  `, [phoneLookupHash]);
}

function findRescuerAuthCandidateByCode(rescuerCode) {
  return get(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.middle_name_enc AS middleNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.birth_date_enc AS birthDateEnc,
      r.phone_enc AS phoneEnc,
      r.password_hash AS passwordHash,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      r.archived_at AS archivedAt,
      r.team_id AS teamId,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus
    FROM rescuers r
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    WHERE UPPER(r.rescuer_code) = UPPER(?)
    LIMIT 1
  `, [rescuerCode]);
}

function findRescuerSessionPrincipalById(id) {
  return get(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.middle_name_enc AS middleNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.birth_date_enc AS birthDateEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      r.archived_at AS archivedAt,
      r.team_id AS teamId,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus
    FROM rescuers r
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    WHERE r.id = ?
    LIMIT 1
  `, [id]);
}

function getRescuerById(id) {
  return get(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.middle_name_enc AS middleNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.birth_date_enc AS birthDateEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      r.archived_at AS archivedAt,
      r.team_id AS teamId,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus
    FROM rescuers r
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    WHERE r.id = ?
    LIMIT 1
  `, [id]);
}

function listRescuers() {
  return all(`
    SELECT
      r.id,
      r.rescuer_code AS rescuerCode,
      r.first_name_enc AS firstNameEnc,
      r.middle_name_enc AS middleNameEnc,
      r.last_name_enc AS lastNameEnc,
      r.birth_date_enc AS birthDateEnc,
      r.phone_enc AS phoneEnc,
      r.agency,
      r.status,
      r.access_status AS accessStatus,
      r.archived_at AS archivedAt,
      r.team_id AS teamId,
      r.created_at AS createdAt,
      r.updated_at AS updatedAt,
      t.team_code AS teamCode,
      t.name AS teamName,
      t.status AS teamStatus
    FROM rescuers r
    LEFT JOIN rescue_teams t ON t.id = r.team_id
    ORDER BY r.created_at DESC, r.id DESC
  `);
}

function updateRescuerAccessStatus(id, accessStatus, archivedAt, expectedCurrentStatus) {
  return run(`
    UPDATE rescuers
    SET
      access_status = ?,
      archived_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND access_status = ?
  `, [accessStatus, archivedAt, id, expectedCurrentStatus]);
}

function updateRescuerStatus(id, status, expectedCurrentStatus) {
  return run(`
    UPDATE rescuers
    SET
      status = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
  `, [status, id, expectedCurrentStatus]);
}

function updateRescuerPassword(id, passwordHash) {
  return run(`
    UPDATE rescuers
    SET
      password_hash = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [passwordHash, id]);
}

function listRescueTeams() {
  return all(`
    SELECT
      id,
      team_code AS teamCode,
      name,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM rescue_teams
    ORDER BY name ASC, id ASC
  `);
}

function getRescueTeamById(id) {
  return get(`
    SELECT
      id,
      team_code AS teamCode,
      name,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM rescue_teams
    WHERE id = ?
    LIMIT 1
  `, [id]);
}

module.exports = {
  generateRescuerCode,
  createRescuer,
  findRescuerByPhoneLookupHash,
  findRescuerAuthCandidateByCode,
  findRescuerSessionPrincipalById,
  getRescuerById,
  listRescuers,
  updateRescuerAccessStatus,
  updateRescuerStatus,
  updateRescuerPassword,
  listRescueTeams,
  getRescueTeamById
};
