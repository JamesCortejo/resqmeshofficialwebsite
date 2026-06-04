const crypto = require('crypto');

const ITERATIONS = 310000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);

  return `pbkdf2:${DIGEST}:${ITERATIONS}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, digest, iterations, saltBase64, hashBase64] = storedHash.split(':');

  if (scheme !== 'pbkdf2') {
    return false;
  }

  const salt = Buffer.from(saltBase64, 'base64');
  const expected = Buffer.from(hashBase64, 'base64');
  const actual = crypto.pbkdf2Sync(password, salt, Number(iterations), expected.length, digest);

  return crypto.timingSafeEqual(actual, expected);
}

module.exports = {
  hashPassword,
  verifyPassword
};
