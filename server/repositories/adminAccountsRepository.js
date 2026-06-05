const { all, get, run } = require('../database/sqlite');
const { USER_STATUSES } = require('../models/userModel');

const DETAIL_SELECT = `
  id,
  user_code AS userCode,
  first_name_enc AS firstNameEnc,
  middle_name_enc AS middleNameEnc,
  last_name_enc AS lastNameEnc,
  birth_date_enc AS birthDateEnc,
  username_enc AS usernameEnc,
  street_address_enc AS streetAddressEnc,
  barangay_enc AS barangayEnc,
  occupation_enc AS occupationEnc,
  blood_type_enc AS bloodTypeEnc,
  medical_complications_enc AS medicalComplicationsEnc,
  allergies_enc AS allergiesEnc,
  email_enc AS emailEnc,
  phone_enc AS phoneEnc,
  id_type_enc AS idTypeEnc,
  id_number_enc AS idNumberEnc,
  front_id_image_path AS frontIdImagePath,
  front_id_original_name AS frontIdOriginalName,
  front_id_mime_type AS frontIdMimeType,
  front_id_original_size AS frontIdOriginalSize,
  front_id_encrypted_size AS frontIdEncryptedSize,
  back_id_image_path AS backIdImagePath,
  back_id_original_name AS backIdOriginalName,
  back_id_mime_type AS backIdMimeType,
  back_id_original_size AS backIdOriginalSize,
  back_id_encrypted_size AS backIdEncryptedSize,
  review_reason_enc AS reviewReasonEnc,
  reviewed_at AS reviewedAt,
  status,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

function listPendingAccounts() {
  return all(`
    SELECT
      id,
      user_code AS userCode,
      first_name_enc AS firstNameEnc,
      middle_name_enc AS middleNameEnc,
      last_name_enc AS lastNameEnc,
      username_enc AS usernameEnc,
      email_enc AS emailEnc,
      phone_enc AS phoneEnc,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    WHERE status = ?
    ORDER BY created_at DESC
  `, [USER_STATUSES.PENDING]);
}

function listActiveAccounts() {
  return all(`
    SELECT
      id,
      user_code AS userCode,
      first_name_enc AS firstNameEnc,
      middle_name_enc AS middleNameEnc,
      last_name_enc AS lastNameEnc,
      username_enc AS usernameEnc,
      email_enc AS emailEnc,
      phone_enc AS phoneEnc,
      status,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    WHERE status IN (?, ?)
    ORDER BY created_at DESC
  `, [USER_STATUSES.APPROVED, USER_STATUSES.SUSPENDED]);
}

function getReviewableAccountById(id) {
  return get(`
    SELECT ${DETAIL_SELECT}
    FROM users
    WHERE id = ? AND status IN (?, ?, ?)
    LIMIT 1
  `, [id, USER_STATUSES.PENDING, USER_STATUSES.APPROVED, USER_STATUSES.SUSPENDED]);
}

function getPendingAccountById(id) {
  return get(`
    SELECT ${DETAIL_SELECT}
    FROM users
    WHERE id = ? AND status = ?
    LIMIT 1
  `, [id, USER_STATUSES.PENDING]);
}

function getAccountStatusById(id) {
  return get(`
    SELECT id, user_code AS userCode, status
    FROM users
    WHERE id = ?
    LIMIT 1
  `, [id]);
}

function updatePendingAccountStatus(id, status, reviewReasonEnc) {
  return run(`
    UPDATE users
    SET
      status = ?,
      review_reason_enc = ?,
      reviewed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
  `, [status, reviewReasonEnc, id, USER_STATUSES.PENDING]);
}

function updateAccountAccessStatus(id, status, reviewReasonEnc, currentStatus) {
  return run(`
    UPDATE users
    SET
      status = ?,
      review_reason_enc = ?,
      reviewed_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?
  `, [status, reviewReasonEnc, id, currentStatus]);
}

module.exports = {
  listPendingAccounts,
  listActiveAccounts,
  getReviewableAccountById,
  getPendingAccountById,
  getAccountStatusById,
  updatePendingAccountStatus,
  updateAccountAccessStatus
};
