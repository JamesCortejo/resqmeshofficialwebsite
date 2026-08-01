const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');
const { verifyRecaptcha } = require('./recaptchaService');

const DOWNLOAD_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DOWNLOAD_RATE_LIMIT_MAX = 12;
const DOWNLOAD_TOKEN_TTL_MS = 2 * 60 * 1000;
const APK_FILENAME = 'ResQMesh-V1.3.apk';
const downloadBuckets = new Map();

function getDownloadsRoot() {
  return path.join(config.appRoot, 'public', 'downloads');
}

function normalizeIp(ipAddress) {
  return String(ipAddress || 'unknown').trim() || 'unknown';
}

function normalizeFilename(filename) {
  return path.basename(String(filename || '').trim());
}

function assertAllowedFilename(filename) {
  const normalized = normalizeFilename(filename);

  if (normalized !== APK_FILENAME) {
    const error = new Error('Requested download is unavailable.');
    error.statusCode = 404;
    throw error;
  }

  return normalized;
}

function getRateLimitBucket(ipAddress, now) {
  const existing = downloadBuckets.get(ipAddress);

  if (existing && now - existing.windowStartedAt < DOWNLOAD_RATE_LIMIT_WINDOW_MS) {
    return existing;
  }

  const next = {
    count: 0,
    windowStartedAt: now
  };

  downloadBuckets.set(ipAddress, next);
  return next;
}

function assertRateLimit(ipAddress) {
  const now = Date.now();
  const bucket = getRateLimitBucket(ipAddress, now);

  if (bucket.count >= DOWNLOAD_RATE_LIMIT_MAX) {
    const error = new Error('Too many download attempts. Please wait a few minutes before trying again.');
    error.statusCode = 429;
    throw error;
  }

  bucket.count += 1;
}

function createSignature(payload) {
  return crypto
    .createHmac('sha256', config.encryptionKey)
    .update(payload)
    .digest('hex');
}

function encodeToken(parts) {
  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}

function decodeToken(token) {
  try {
    return JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
}

function issueDownloadToken(filename, ipAddress) {
  const safeFilename = assertAllowedFilename(filename);
  const safeIp = normalizeIp(ipAddress);
  const expiresAt = Date.now() + DOWNLOAD_TOKEN_TTL_MS;
  const payload = `${safeFilename}|${safeIp}|${expiresAt}`;
  const signature = createSignature(payload);

  return encodeToken({
    file: safeFilename,
    ip: safeIp,
    exp: expiresAt,
    sig: signature
  });
}

function verifyDownloadToken(token, ipAddress, filename) {
  const safeFilename = assertAllowedFilename(filename);
  const safeIp = normalizeIp(ipAddress);
  const parsed = decodeToken(token);

  if (!parsed || typeof parsed !== 'object') {
    const error = new Error('Download authorization is invalid. Please try again.');
    error.statusCode = 403;
    throw error;
  }

  if (parsed.file !== safeFilename || parsed.ip !== safeIp || !Number.isFinite(Number(parsed.exp))) {
    const error = new Error('Download authorization is invalid. Please try again.');
    error.statusCode = 403;
    throw error;
  }

  const expiresAt = Number(parsed.exp);

  if (Date.now() > expiresAt) {
    const error = new Error('Download authorization expired. Please verify again.');
    error.statusCode = 403;
    throw error;
  }

  const expectedPayload = `${safeFilename}|${safeIp}|${expiresAt}`;
  const expectedSignature = createSignature(expectedPayload);
  const providedSignature = String(parsed.sig || '');

  if (
    providedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(Buffer.from(providedSignature), Buffer.from(expectedSignature))
  ) {
    const error = new Error('Download authorization is invalid. Please try again.');
    error.statusCode = 403;
    throw error;
  }

  return {
    filename: safeFilename
  };
}

function resolveDownloadPath(filename) {
  const safeFilename = assertAllowedFilename(filename);
  const targetPath = path.join(getDownloadsRoot(), safeFilename);

  if (!fs.existsSync(targetPath)) {
    const error = new Error('Requested download file is not available on this server.');
    error.statusCode = 404;
    throw error;
  }

  return targetPath;
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'Unavailable';
  }

  const megabytes = bytes / (1024 * 1024);
  return `${Math.round(megabytes)} MB`;
}

function getApkVersion(filename) {
  const match = String(filename || '').match(/V(\d+(?:\.\d+)*)/i);
  return match ? `V${match[1]}` : 'Current';
}

function getDownloadInfo() {
  const filePath = path.join(getDownloadsRoot(), APK_FILENAME);
  const exists = fs.existsSync(filePath);
  const stats = exists ? fs.statSync(filePath) : null;

  return {
    filename: APK_FILENAME,
    version: getApkVersion(APK_FILENAME),
    sizeBytes: stats ? stats.size : null,
    sizeLabel: stats ? formatFileSize(stats.size) : 'Upload pending',
    available: exists
  };
}

async function createProtectedDownload(body, requestMeta = {}) {
  const filename = assertAllowedFilename(body && body.filename ? body.filename : APK_FILENAME);
  const ipAddress = normalizeIp(requestMeta.ipAddress);

  assertRateLimit(ipAddress);
  await verifyRecaptcha(body && body.recaptchaToken, 'download', {
    remoteIp: ipAddress,
    hostname: requestMeta.hostname
  });

  const token = issueDownloadToken(filename, ipAddress);

  return {
    filename,
    url: `/downloads/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`,
    expiresInSeconds: Math.floor(DOWNLOAD_TOKEN_TTL_MS / 1000)
  };
}

module.exports = {
  APK_FILENAME,
  createProtectedDownload,
  getDownloadInfo,
  resolveDownloadPath,
  verifyDownloadToken
};
