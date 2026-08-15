const sharp = require('sharp');

const ALLOWED_IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp', 'heif']);
const MAX_IMAGE_PIXELS = 8000 * 8000;

function appError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function startsWith(buffer, signature) {
  if (!Buffer.isBuffer(buffer) || buffer.length < signature.length) {
    return false;
  }

  return signature.every((byte, index) => buffer[index] === byte);
}

function detectImageSignature(buffer) {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return 'jpeg';
  }

  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }

  if (
    Buffer.isBuffer(buffer)
    && buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  if (Buffer.isBuffer(buffer) && buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return 'heif';
    }
  }

  return null;
}

async function validateImageUpload(file, options = {}) {
  const label = options.label || 'Uploaded image';
  const maxBytes = options.maxBytes || (5 * 1024 * 1024);

  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw appError(`${label} is required.`);
  }

  if (file.buffer.length <= 0) {
    throw appError(`${label} is empty.`);
  }

  if (file.buffer.length > maxBytes || Number(file.size || 0) > maxBytes) {
    throw appError(`${label} is too large.`);
  }

  const signatureFormat = detectImageSignature(file.buffer);

  if (!signatureFormat || !ALLOWED_IMAGE_FORMATS.has(signatureFormat)) {
    throw appError(`${label} must be a valid JPG, PNG, WebP, or HEIC image.`);
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, { failOn: 'error' }).metadata();
  } catch (error) {
    throw appError(`${label} could not be read as a valid image.`);
  }

  const sharpFormat = metadata.format === 'heif' ? 'heif' : metadata.format;

  if (!ALLOWED_IMAGE_FORMATS.has(sharpFormat) || sharpFormat !== signatureFormat) {
    throw appError(`${label} file type does not match its image content.`);
  }

  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    throw appError(`${label} dimensions are too large.`);
  }

  return {
    format: sharpFormat,
    width: metadata.width,
    height: metadata.height
  };
}

module.exports = {
  validateImageUpload
};
