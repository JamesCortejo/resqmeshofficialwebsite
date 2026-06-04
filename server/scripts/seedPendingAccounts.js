const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const config = require('../config/env');
const { db, initializeDatabase } = require('../database/sqlite');
const { encryptBuffer, encryptText, lookupHash } = require('../services/encryptionService');
const { hashPassword } = require('../services/passwordService');
const { createUser, generateUserCode, findByLookupHashes } = require('../repositories/userRepository');

const COUNT = 50;
const BARANGAYS = [
  'Bagontaas',
  'Banlag',
  'Batangan',
  'Laligan',
  'Poblacion',
  'San Carlos',
  'Sinayawan',
  'Vintar'
];
const FIRST_NAMES = ['Alex', 'Bianca', 'Carlo', 'Diana', 'Emanuel', 'Fatima', 'Gabriel', 'Hannah', 'Ivan', 'Julia'];
const LAST_NAMES = ['Santos', 'Reyes', 'Dela Cruz', 'Garcia', 'Mendoza', 'Flores', 'Ramos', 'Bautista', 'Torres', 'Castillo'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'O+', 'O-'];

function sanitizeName(value) {
  return value.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

function pick(list, index) {
  return list[index % list.length];
}

function seedTag() {
  return Date.now().toString(36);
}

async function createEncryptedPlaceholderImage(userCode, side, displayName) {
  const svg = `
    <svg width="900" height="560" xmlns="http://www.w3.org/2000/svg">
      <rect width="900" height="560" fill="#f8fafc"/>
      <rect x="36" y="36" width="828" height="488" rx="28" fill="#fff3ef" stroke="#e74b32" stroke-width="6"/>
      <text x="70" y="130" fill="#17212b" font-family="Arial" font-size="46" font-weight="700">ResQMesh Test ID</text>
      <text x="70" y="210" fill="#e74b32" font-family="Arial" font-size="34" font-weight="700">${side.toUpperCase()} SIDE</text>
      <text x="70" y="300" fill="#17212b" font-family="Arial" font-size="32">${userCode}</text>
      <text x="70" y="365" fill="#64717f" font-family="Arial" font-size="28">${displayName}</text>
      <text x="70" y="445" fill="#64717f" font-family="Arial" font-size="24">Development placeholder image</text>
    </svg>
  `;
  const webpBuffer = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  const encryptedBuffer = encryptBuffer(webpBuffer);
  const filename = `${sanitizeName(userCode)}-${side}-seed-${Date.now()}.webp.enc`;
  const targetPath = path.join(config.encryptedUploadDir, filename);

  await fs.mkdir(config.encryptedUploadDir, { recursive: true });
  await fs.writeFile(targetPath, encryptedBuffer);

  return {
    path: path.relative(config.appRoot, targetPath).replace(/\\/g, '/'),
    originalName: `${userCode}-${side}-placeholder.webp`,
    mimeType: 'image/webp',
    originalSize: webpBuffer.length,
    encryptedSize: encryptedBuffer.length
  };
}

function birthDateFor(index) {
  const year = 1970 + (index % 30);
  const month = String((index % 12) + 1).padStart(2, '0');
  const day = String((index % 27) + 1).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function createPendingUser(index, tag) {
  const sequence = String(index + 1).padStart(2, '0');
  const firstName = pick(FIRST_NAMES, index);
  const middleName = pick(['Lopez', 'Cruz', 'Rivera', 'Diaz'], index);
  const lastName = pick(LAST_NAMES, index);
  const username = `seed_${tag}_${sequence}`;
  const email = `${username}@example.test`;
  const idNumber = `SEED-${tag.toUpperCase()}-${sequence}`;
  const usernameLookupHash = lookupHash(username);
  const emailLookupHash = lookupHash(email);
  const idNumberLookupHash = lookupHash(idNumber);
  const existing = await findByLookupHashes(usernameLookupHash, emailLookupHash, idNumberLookupHash);

  if (existing) {
    return null;
  }

  const userCode = await generateUserCode();
  const displayName = `${firstName} ${lastName}`;
  const [frontIdImage, backIdImage] = await Promise.all([
    createEncryptedPlaceholderImage(userCode, 'front', displayName),
    createEncryptedPlaceholderImage(userCode, 'back', displayName)
  ]);

  return createUser({
    userCode,
    firstNameEnc: encryptText(firstName),
    middleNameEnc: encryptText(middleName),
    lastNameEnc: encryptText(lastName),
    birthDateEnc: encryptText(birthDateFor(index)),
    usernameEnc: encryptText(username),
    usernameLookupHash,
    streetAddressEnc: encryptText(`Purok ${index + 1}, Seed Street`),
    barangayEnc: encryptText(pick(BARANGAYS, index)),
    occupationEnc: encryptText(pick(['Teacher', 'Farmer', 'Rescuer', 'Nurse', 'Driver'], index)),
    bloodTypeEnc: encryptText(pick(BLOOD_TYPES, index)),
    medicalComplicationsEnc: encryptText(index % 3 === 0 ? 'None reported' : ''),
    allergiesEnc: encryptText(index % 4 === 0 ? 'No known allergies' : ''),
    emailEnc: encryptText(email),
    emailLookupHash,
    phoneEnc: encryptText(`09${String(700000000 + index).padStart(9, '0')}`),
    passwordHash: hashPassword('SeedPassword123!'),
    idTypeEnc: encryptText('National ID'),
    idNumberEnc: encryptText(idNumber),
    idNumberLookupHash,
    frontIdImage,
    backIdImage
  });
}

async function main() {
  await initializeDatabase();

  const tag = seedTag();
  let created = 0;

  for (let index = 0; index < COUNT; index += 1) {
    const user = await createPendingUser(index, tag);

    if (user) {
      created += 1;
    }
  }

  console.log(`Created ${created} dummy pending accounts.`);
}

main()
  .catch((error) => {
    console.error('Unable to seed pending accounts:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
