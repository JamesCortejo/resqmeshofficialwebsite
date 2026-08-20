const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const config = require('../../config/env');
const {
  MAX_ONLINE_VOICE_SECONDS,
  MAX_ONLINE_VOICE_SIZE_BYTES,
  ONLINE_VOICE_MIME_TYPES
} = require('./constants');
const { appError, normalizeString } = require('./utils');

const VOICE_UPLOAD_DIR = path.join(config.appRoot, 'storage', 'online-chat-voice');

function normalizeVoiceMimeType(value) {
  const normalized = normalizeString(value || 'audio/mp4', 80).toLowerCase();
  return ONLINE_VOICE_MIME_TYPES.has(normalized) ? normalized : null;
}

function decodeVoiceBase64(value) {
  const raw = String(value || '').trim();
  const content = raw.includes(',') ? raw.split(',').pop() : raw;

  if (!content || !/^[A-Za-z0-9+/=\r\n]+$/.test(content)) {
    throw appError('Voice clip content is invalid.');
  }

  return Buffer.from(content.replace(/\s+/g, ''), 'base64');
}

async function saveOnlineVoiceClip(payload = {}) {
  const mimeType = normalizeVoiceMimeType(payload.mimeType);
  const durationSeconds = Math.ceil(Number(payload.durationSeconds || payload.duration || 0));

  if (!mimeType) {
    throw appError('Unsupported voice clip format.');
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > MAX_ONLINE_VOICE_SECONDS) {
    throw appError(`Voice clips must be ${MAX_ONLINE_VOICE_SECONDS} seconds or shorter.`);
  }

  const buffer = decodeVoiceBase64(payload.content || payload.base64Audio || payload.audio);

  if (buffer.length <= 0 || buffer.length > MAX_ONLINE_VOICE_SIZE_BYTES) {
    throw appError('Voice clip file is too large.');
  }

  await fs.mkdir(VOICE_UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(10).toString('hex')}.m4a`;
  const filePath = path.join(VOICE_UPLOAD_DIR, filename);
  await fs.writeFile(filePath, buffer);

  return {
    filePath,
    mimeType,
    durationSeconds,
    sizeBytes: buffer.length
  };
}

async function removeFileIfWritten(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Best-effort cleanup only; the DB transaction remains the source of truth.
  }
}

async function readVoiceClipBase64(filePath) {
  return fs.readFile(filePath, 'base64').catch(() => null);
}

module.exports = {
  readVoiceClipBase64,
  removeFileIfWritten,
  saveOnlineVoiceClip
};
