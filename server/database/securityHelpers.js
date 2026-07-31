const crypto = require('crypto');
const config = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function decryptText(value) {
  if (!value) {
    return '';
  }

  const payload = Buffer.from(value, 'base64');
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, config.encryptionKey, iv);

  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function lookupHash(value) {
  return crypto
    .createHmac('sha256', config.encryptionKey)
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

module.exports = {
  hashApiKey,
  decryptText,
  lookupHash
};
