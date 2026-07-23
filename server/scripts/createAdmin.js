const { initializeDatabase, run, close } = require('../database/postgres');
const { encryptText, lookupHash } = require('../services/encryptionService');
const { hashPassword } = require('../services/passwordService');
const { generateUserCode } = require('../repositories/userRepository');
const { findAdminCandidateByUsernameHash } = require('../repositories/adminRepository');

function parseArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : null;
}

function requiredValue(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing ${name}. Use --${name}=... or the matching ADMIN_BOOTSTRAP_* env value.`);
  }

  return String(value).trim();
}

async function createAdmin() {
  await initializeDatabase();

  const username = requiredValue(
    parseArg('username') || process.env.ADMIN_BOOTSTRAP_USERNAME,
    'username'
  );
  const password = requiredValue(
    parseArg('password') || process.env.ADMIN_BOOTSTRAP_PASSWORD,
    'password'
  );
  const usernameLookupHash = lookupHash(username);
  const existing = await findAdminCandidateByUsernameHash(usernameLookupHash);

  if (existing) {
    if (existing.status !== 'admin') {
      throw new Error(`A non-admin account already uses username "${username}".`);
    }

    console.log(`Admin account already exists: ${existing.userCode}`);
    return;
  }

  const userCode = await generateUserCode();
  const now = new Date().toISOString();
  const email = parseArg('email') || process.env.ADMIN_BOOTSTRAP_EMAIL || `${username}@resqmesh.local`;
  const idNumber = `ADMIN-${userCode}`;

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
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin', ?, ?)
    RETURNING id
  `, [
    userCode,
    encryptText('Admin'),
    null,
    encryptText('User'),
    encryptText('1970-01-01'),
    encryptText(username),
    usernameLookupHash,
    encryptText('ResQMesh Admin Office'),
    encryptText('Poblacion'),
    encryptText('Administrator'),
    encryptText('N/A'),
    null,
    null,
    encryptText(email),
    lookupHash(email),
    encryptText('00000000000'),
    hashPassword(password),
    encryptText('System Bootstrap'),
    encryptText(idNumber),
    lookupHash(idNumber),
    'admin/bootstrap-front-placeholder',
    'bootstrap-front-placeholder.txt',
    'text/plain',
    0,
    0,
    'admin/bootstrap-back-placeholder',
    'bootstrap-back-placeholder.txt',
    'text/plain',
    0,
    0,
    now,
    now
  ]);

  console.log(`Created admin account ${userCode} with id ${result.lastID}.`);
}

createAdmin()
  .catch((error) => {
    process.exitCode = 1;
    console.error(`Unable to create admin account: ${error.message}`);
  })
  .finally(async () => {
    await close();
  });
