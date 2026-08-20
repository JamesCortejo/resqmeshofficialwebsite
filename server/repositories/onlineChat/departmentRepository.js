const { run, get, all } = require('../../database/postgres');
const { selectDepartmentColumns } = require('./selectors');

function listDepartments({ includeArchived = true } = {}) {
  const statusClause = includeArchived ? '' : "WHERE status = 'active'";

  return all(`
    SELECT ${selectDepartmentColumns('d')}
    FROM online_chat_departments d
    ${statusClause}
    ORDER BY d.sort_order ASC, d.created_at ASC, d.id ASC
  `);
}

function getDepartmentById(id) {
  return get(`
    SELECT ${selectDepartmentColumns('d')}
    FROM online_chat_departments d
    WHERE d.id = ?
    LIMIT 1
  `, [id]);
}

function getDepartmentBySlug(slug) {
  return get(`
    SELECT ${selectDepartmentColumns('d')}
    FROM online_chat_departments d
    WHERE d.slug = ?
    LIMIT 1
  `, [slug]);
}

function getActiveDepartmentByRescuerAgency(rescuerAgency) {
  return get(`
    SELECT ${selectDepartmentColumns('d')}
    FROM online_chat_departments d
    WHERE d.rescuer_agency = ?
      AND d.status = 'active'
    ORDER BY d.sort_order ASC, d.created_at ASC, d.id ASC
    LIMIT 1
  `, [rescuerAgency]);
}

function createDepartment(room) {
  return run(`
    INSERT INTO online_chat_departments (
      slug,
      name,
      subtitle,
      status,
      color_tag,
      rescuer_agency,
      icon_path,
      icon_url,
      sort_order,
      read_only,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id
  `, [
    room.slug,
    room.name,
    room.subtitle,
    room.status,
    room.colorTag,
    room.rescuerAgency,
    room.iconPath,
    room.iconUrl,
    room.sortOrder,
    room.readOnly
  ]);
}

function updateDepartment(id, room) {
  return run(`
    UPDATE online_chat_departments
    SET
      slug = ?,
      name = ?,
      subtitle = ?,
      status = ?,
      color_tag = ?,
      rescuer_agency = ?,
      icon_path = COALESCE(?, icon_path),
      icon_url = COALESCE(?, icon_url),
      sort_order = ?,
      read_only = ?,
      archived_at = CASE WHEN ? = 'archived' AND archived_at IS NULL THEN CURRENT_TIMESTAMP ELSE archived_at END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    room.slug,
    room.name,
    room.subtitle,
    room.status,
    room.colorTag,
    room.rescuerAgency,
    room.iconPath,
    room.iconUrl,
    room.sortOrder,
    room.readOnly,
    room.status,
    id
  ]);
}

function archiveDepartment(id) {
  return run(`
    UPDATE online_chat_departments
    SET
      status = 'archived',
      archived_at = COALESCE(archived_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [id]);
}

function getCivilianById(id) {
  return get(`
    SELECT
      id,
      user_code AS userCode,
      first_name_enc AS firstNameEnc,
      middle_name_enc AS middleNameEnc,
      last_name_enc AS lastNameEnc,
      birth_date_enc AS birthDateEnc,
      phone_enc AS phoneEnc,
      email_enc AS emailEnc,
      occupation_enc AS occupationEnc,
      blood_type_enc AS bloodTypeEnc,
      medical_complications_enc AS medicalComplicationsEnc,
      allergies_enc AS allergiesEnc,
      status
    FROM users
    WHERE id = ?
    LIMIT 1
  `, [id]);
}

module.exports = {
  archiveDepartment,
  createDepartment,
  getActiveDepartmentByRescuerAgency,
  getCivilianById,
  getDepartmentById,
  getDepartmentBySlug,
  listDepartments,
  updateDepartment
};
