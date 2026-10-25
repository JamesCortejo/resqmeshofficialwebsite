const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config/env');

const RELEASE_STATE_PATH = path.join(config.appRoot, 'data', 'mobile-app-release.json');
const DOWNLOADS_ROOT = path.join(config.appRoot, 'public', 'downloads');
const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const MAX_NOTES_LENGTH = 4000;

function releaseError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
}

function normalizeVersionName(value) {
  const versionName = String(value || '').trim();
  if (!/^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(versionName)) {
    throw releaseError('Version name must look like 1.16.0.', 400);
  }
  return versionName;
}

function normalizeVersionCode(value) {
  const normalized = String(value || '').trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw releaseError('Version code must be a positive integer.', 400);
  }
  const versionCode = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0) {
    throw releaseError('Version code must be a positive integer.', 400);
  }
  return versionCode;
}

function normalizeNotes(value) {
  const notes = String(value || '').trim();
  if (!notes) {
    throw releaseError('Release notes cannot be empty.', 400);
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    throw releaseError(`Release notes cannot exceed ${MAX_NOTES_LENGTH} characters.`, 400);
  }
  return notes;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const md5 = crypto.createHash('md5');
    const sha256 = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => {
      md5.update(chunk);
      sha256.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve({
      md5: md5.digest('hex'),
      sha256: sha256.digest('hex')
    }));
  });
}

function validateApkStructure(filePath) {
  const stats = fs.statSync(filePath);
  if (!stats.isFile() || stats.size < 1024) {
    throw releaseError('APK must be a non-empty regular file.', 400);
  }

  const descriptor = fs.openSync(filePath, 'r');
  try {
    const signature = Buffer.alloc(4);
    fs.readSync(descriptor, signature, 0, signature.length, 0);
    if (!signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      throw releaseError('APK does not have a valid ZIP file signature.', 400);
    }

    const tailLength = Math.min(stats.size, 8 * 1024 * 1024);
    const tail = Buffer.alloc(tailLength);
    fs.readSync(descriptor, tail, 0, tailLength, stats.size - tailLength);
    const directoryText = tail.toString('latin1');
    const hasManifest = directoryText.includes('AndroidManifest.xml');
    const hasV1Signature = /META-INF\/[A-Z0-9_.-]+\.(RSA|DSA|EC)/i.test(directoryText);
    const hasApkSigningBlock = directoryText.includes('APK Sig Block 42');

    if (!hasManifest || (!hasV1Signature && !hasApkSigningBlock)) {
      throw releaseError('APK is missing Android manifest or signing metadata.', 400);
    }
  } finally {
    fs.closeSync(descriptor);
  }

  return stats;
}

function validateReleaseRecord(record) {
  if (!record || record.platform !== 'android') {
    throw releaseError('Published mobile release metadata is invalid.');
  }
  const filename = path.basename(String(record.filename || ''));
  if (!filename || filename !== record.filename || !filename.toLowerCase().endsWith('.apk')) {
    throw releaseError('Published APK filename is invalid.');
  }

  const filePath = path.join(DOWNLOADS_ROOT, filename);
  if (!fs.existsSync(filePath)) {
    throw releaseError('Published APK is missing from the downloads directory.', 404);
  }

  const stats = fs.statSync(filePath);
  if (!stats.isFile() || stats.size !== Number(record.sizeBytes)) {
    throw releaseError('Published APK size does not match its release metadata.');
  }
  if (!/^[a-f0-9]{24}$/i.test(String(record.releaseId || ''))) {
    throw releaseError('Published release identifier is invalid.');
  }
  if (!/^[a-f0-9]{32}$/i.test(String(record.md5 || ''))) {
    throw releaseError('Published release MD5 checksum is invalid.');
  }
  if (!/^[a-f0-9]{64}$/i.test(String(record.sha256 || ''))) {
    throw releaseError('Published release SHA-256 checksum is invalid.');
  }
  if (Number.isNaN(Date.parse(String(record.publishedAt || '')))) {
    throw releaseError('Published release timestamp is invalid.');
  }

  return {
    ...record,
    filename,
    versionCode: normalizeVersionCode(record.versionCode),
    versionName: normalizeVersionName(record.versionName),
    releaseNotes: normalizeNotes(record.releaseNotes),
    sizeBytes: stats.size,
    filePath
  };
}

function getPublishedRelease({ required = false } = {}) {
  if (!fs.existsSync(RELEASE_STATE_PATH)) {
    if (required) throw releaseError('No Android app release is currently published.', 404);
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(RELEASE_STATE_PATH, 'utf8'));
    return validateReleaseRecord(parsed);
  } catch (error) {
    if (error.statusCode) throw error;
    throw releaseError('Unable to read published mobile release metadata.');
  }
}

function publicReleaseData(release) {
  if (!release) return null;
  return {
    releaseId: release.releaseId,
    platform: 'android',
    versionName: release.versionName,
    versionCode: release.versionCode,
    filename: release.filename,
    sizeBytes: release.sizeBytes,
    md5: release.md5,
    sha256: release.sha256,
    releaseNotes: release.releaseNotes,
    publishedAt: release.publishedAt,
    downloadUrl: `/api/mobile/releases/latest/apk?releaseId=${encodeURIComponent(release.releaseId)}`
  };
}

async function inspectRelease({ apkPath, versionName, versionCode, releaseNotes }) {
  const absoluteApkPath = path.resolve(String(apkPath || ''));
  if (!absoluteApkPath.toLowerCase().endsWith('.apk') || !fs.existsSync(absoluteApkPath)) {
    throw releaseError('APK path must reference an existing .apk file.', 400);
  }

  const normalizedVersionName = normalizeVersionName(versionName);
  const normalizedVersionCode = normalizeVersionCode(versionCode);
  const normalizedNotes = normalizeNotes(releaseNotes);
  const current = getPublishedRelease();
  if (current && normalizedVersionCode <= current.versionCode) {
    throw releaseError(`Version code must be greater than published build ${current.versionCode}.`, 409);
  }

  const stats = validateApkStructure(absoluteApkPath);
  const hashes = await hashFile(absoluteApkPath);
  const safeVersion = normalizedVersionName.replace(/[^0-9A-Za-z.-]/g, '-');
  const filename = `ResQMesh-V${safeVersion}-${normalizedVersionCode}.apk`;

  return {
    sourcePath: absoluteApkPath,
    filename,
    versionName: normalizedVersionName,
    versionCode: normalizedVersionCode,
    releaseNotes: normalizedNotes,
    sizeBytes: stats.size,
    ...hashes
  };
}

async function publishRelease(options) {
  const inspected = await inspectRelease(options);
  ensureDirectory(DOWNLOADS_ROOT);
  ensureDirectory(path.dirname(RELEASE_STATE_PATH));

  const targetPath = path.join(DOWNLOADS_ROOT, inspected.filename);
  const temporaryApkPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  const temporaryStatePath = `${RELEASE_STATE_PATH}.${process.pid}.${Date.now()}.tmp`;
  const publishedAt = new Date().toISOString();
  const releaseId = crypto
    .createHash('sha256')
    .update(`${inspected.versionCode}:${inspected.sha256}`)
    .digest('hex')
    .slice(0, 24);
  const record = {
    releaseId,
    platform: 'android',
    filename: inspected.filename,
    versionName: inspected.versionName,
    versionCode: inspected.versionCode,
    sizeBytes: inspected.sizeBytes,
    md5: inspected.md5,
    sha256: inspected.sha256,
    releaseNotes: inspected.releaseNotes,
    publishedAt
  };

  try {
    fs.copyFileSync(inspected.sourcePath, temporaryApkPath, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(temporaryApkPath, 0o640);
    fs.renameSync(temporaryApkPath, targetPath);
    fs.writeFileSync(temporaryStatePath, `${JSON.stringify(record, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    });
    fs.renameSync(temporaryStatePath, RELEASE_STATE_PATH);
    return validateReleaseRecord(record);
  } finally {
    for (const temporaryPath of [temporaryApkPath, temporaryStatePath]) {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    }
  }
}

function unpublishRelease() {
  if (!fs.existsSync(RELEASE_STATE_PATH)) return false;
  const removedPath = `${RELEASE_STATE_PATH}.unpublished-${Date.now()}`;
  fs.renameSync(RELEASE_STATE_PATH, removedPath);
  fs.chmodSync(removedPath, 0o600);
  return true;
}

module.exports = {
  APK_MIME_TYPE,
  DOWNLOADS_ROOT,
  RELEASE_STATE_PATH,
  getPublishedRelease,
  inspectRelease,
  publicReleaseData,
  publishRelease,
  unpublishRelease
};
