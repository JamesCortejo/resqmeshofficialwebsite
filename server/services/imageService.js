const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const config = require('../config/env');
const { encryptBuffer } = require('./encryptionService');
const { validateImageUpload } = require('./uploadValidationService');

function sanitizeName(value) {
  return value.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

async function convertAndEncryptIdImage(file, userCode, side) {
  await validateImageUpload(file, {
    label: side === 'front' ? 'Front ID image' : 'Back ID image',
    maxBytes: 5 * 1024 * 1024
  });

  const webpBuffer = await sharp(file.buffer)
    .rotate()
    .webp({ quality: 82 })
    .toBuffer();

  const encryptedBuffer = encryptBuffer(webpBuffer);
  const filename = `${sanitizeName(userCode)}-${side}-${Date.now()}.webp.enc`;
  const targetPath = path.join(config.encryptedUploadDir, filename);

  await fs.mkdir(config.encryptedUploadDir, { recursive: true });
  await fs.writeFile(targetPath, encryptedBuffer);

  return {
    path: path.relative(config.appRoot, targetPath).replace(/\\/g, '/'),
    originalName: file.originalname,
    mimeType: file.mimetype,
    originalSize: file.size,
    encryptedSize: encryptedBuffer.length
  };
}

module.exports = {
  convertAndEncryptIdImage
};
