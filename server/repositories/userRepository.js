const { run, get, all, transaction } = require('../database/postgres');

function formatUserCode(value) {
  return `RMU${String(value).padStart(3, '0')}`;
}

async function generateUserCode() {
  return transaction(async (trx) => {
    const row = await trx.get('SELECT last_value FROM code_sequence WHERE id = 1 FOR UPDATE');
    const nextValue = row.last_value + 1;

    await trx.run('UPDATE code_sequence SET last_value = ? WHERE id = 1', [nextValue]);

    return formatUserCode(nextValue);
  });
}

async function createUser(user) {
  const result = await run(`
    INSERT INTO users (
      user_code,
      first_name_enc,
      middle_name_enc,
      last_name_enc,
      birth_date_enc,
      username_enc,
      username_lookup_hash,
      street_address_enc,
      barangay_enc,
      occupation_enc,
      blood_type_enc,
      medical_complications_enc,
      allergies_enc,
      email_enc,
      email_lookup_hash,
      phone_enc,
      password_hash,
      id_type_enc,
      id_number_enc,
      id_number_lookup_hash,
      front_id_image_path,
      front_id_original_name,
      front_id_mime_type,
      front_id_original_size,
      front_id_encrypted_size,
      back_id_image_path,
      back_id_original_name,
      back_id_mime_type,
      back_id_original_size,
      back_id_encrypted_size,
      status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `, [
    user.userCode,
    user.firstNameEnc,
    user.middleNameEnc,
    user.lastNameEnc,
    user.birthDateEnc,
    user.usernameEnc,
    user.usernameLookupHash,
    user.streetAddressEnc,
    user.barangayEnc,
    user.occupationEnc,
    user.bloodTypeEnc,
    user.medicalComplicationsEnc,
    user.allergiesEnc,
    user.emailEnc,
    user.emailLookupHash,
    user.phoneEnc,
    user.passwordHash,
    user.idTypeEnc,
    user.idNumberEnc,
    user.idNumberLookupHash,
    user.frontIdImage.path,
    user.frontIdImage.originalName,
    user.frontIdImage.mimeType,
    user.frontIdImage.originalSize,
    user.frontIdImage.encryptedSize,
    user.backIdImage.path,
    user.backIdImage.originalName,
    user.backIdImage.mimeType,
    user.backIdImage.originalSize,
    user.backIdImage.encryptedSize,
    'pending'
  ]);

  return getUserSummaryById(result.lastID);
}

function findByLookupHashes(usernameLookupHash, emailLookupHash, idNumberLookupHash) {
  return get(`
    SELECT
      id,
      user_code AS userCode,
      username_lookup_hash AS usernameLookupHash,
      email_lookup_hash AS emailLookupHash,
      id_number_lookup_hash AS idNumberLookupHash
    FROM users
    WHERE username_lookup_hash = ? OR email_lookup_hash = ? OR id_number_lookup_hash = ?
    LIMIT 1
  `, [usernameLookupHash, emailLookupHash, idNumberLookupHash]);
}

function getUserSummaryById(id) {
  return get(`
    SELECT id, user_code AS userCode, status, created_at AS createdAt, updated_at AS updatedAt
    FROM users
    WHERE id = ?
  `, [id]);
}

function listUserSummaries() {
  return all(`
    SELECT id, user_code AS userCode, status, created_at AS createdAt, updated_at AS updatedAt
    FROM users
    ORDER BY created_at DESC
  `);
}

module.exports = {
  generateUserCode,
  createUser,
  findByLookupHashes,
  listUserSummaries
};
