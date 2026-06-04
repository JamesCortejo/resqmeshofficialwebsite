const crypto = require('crypto');
const config = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, config.encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]);
}

function decryptBuffer(payload) {
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, config.encryptionKey, iv);

  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function encryptText(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return encryptBuffer(Buffer.from(String(value), 'utf8')).toString('base64');
}

function decryptText(value) {
  if (!value) {
    return '';
  }

  return decryptBuffer(Buffer.from(value, 'base64')).toString('utf8');
}

function lookupHash(value) {
  return crypto
    .createHmac('sha256', config.encryptionKey)
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

module.exports = {
  encryptBuffer,
  decryptBuffer,
  encryptText,
  decryptText,
  lookupHash
};
