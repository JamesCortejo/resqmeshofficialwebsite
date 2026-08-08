const { run, get, all, transaction } = require('../database/postgres');

function formatRescuerCode(value) {
  return `RSC-${String(value).padStart(3, '0')}`;
}

async function generateRescuerCode() {
  return transaction(async (trx) => {
    const row = await trx.get('SELECT last_value FROM rescuer_code_sequence WHERE id = 1 FOR UPDATE');
    const nextValue = row.last_value + 1;

    await trx.run('UPDATE rescuer_code_sequence SET last_value = ? WHERE id = 1', [nextValue]);

    return formatRescuerCode(nextValue);
  });
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
    RETURNING id
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
      r.previous_team_id AS previousTeamId,
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
      r.previous_team_id AS previousTeamId,
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
      r.previous_team_id AS previousTeamId,
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
      r.previous_team_id AS previousTeamId,
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

async function archiveRescuerAccess(id, archivedAt, expectedCurrentStatus) {
  return transaction(async (trx) => {
    const current = await trx.get(`
      SELECT
        id,
        team_id AS "teamId"
      FROM rescuers
      WHERE id = ? AND access_status = ?
      FOR UPDATE
    `, [id, expectedCurrentStatus]);

    if (!current) {
      return { changes: 0, previousTeamId: null };
    }

    const previousTeamId = current.teamId || null;
    const result = await trx.run(`
      UPDATE rescuers
      SET
        access_status = 'archived',
        archived_at = ?,
        status = 'unavailable',
        previous_team_id = COALESCE(team_id, previous_team_id),
        team_id = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND access_status = ?
    `, [archivedAt, id, expectedCurrentStatus]);

    return {
      changes: result.changes,
      previousTeamId
    };
  });
}

async function activateRescuerAccess(id, expectedCurrentStatus, maxTeamMembers = 5) {
  return transaction(async (trx) => {
    const current = await trx.get(`
      SELECT
        id,
        previous_team_id AS "previousTeamId"
      FROM rescuers
      WHERE id = ? AND access_status = ?
      FOR UPDATE
    `, [id, expectedCurrentStatus]);

    if (!current) {
      return {
        changes: 0,
        previousTeamId: null,
        restoredTeamId: null,
        restoreSkipped: false
      };
    }

    let restoredTeamId = null;
    let restoreSkipped = false;

    if (current.previousTeamId) {
      const teamCount = await trx.get(`
        SELECT COUNT(*) AS count
        FROM rescuers
        WHERE team_id = ? AND access_status = 'active'
      `, [current.previousTeamId]);

      if (Number(teamCount?.count || 0) < maxTeamMembers) {
        restoredTeamId = current.previousTeamId;
      } else {
        restoreSkipped = true;
      }
    }

    const result = restoredTeamId
      ? await trx.run(`
        UPDATE rescuers
        SET
          access_status = 'active',
          archived_at = NULL,
          status = 'available',
          team_id = ?,
          previous_team_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND access_status = ?
      `, [restoredTeamId, id, expectedCurrentStatus])
      : await trx.run(`
        UPDATE rescuers
        SET
          access_status = 'active',
          archived_at = NULL,
          status = 'available',
          team_id = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND access_status = ?
      `, [id, expectedCurrentStatus]);

    return {
      changes: result.changes,
      previousTeamId: current.previousTeamId || null,
      restoredTeamId,
      restoreSkipped
    };
  });
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
    WHERE status = 'active'
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
  archiveRescuerAccess,
  activateRescuerAccess,
  updateRescuerStatus,
  updateRescuerPassword,
  listRescueTeams,
  getRescueTeamById
};
