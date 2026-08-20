const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const config = require('../../config/env');
const { validateImageUpload } = require('../uploadValidationService');
const { MAX_ICON_SIZE_BYTES } = require('./constants');

const ICON_UPLOAD_DIR = path.join(config.appRoot, 'public', 'uploads', 'department-chat-icons');
const ICON_PUBLIC_BASE = '/uploads/department-chat-icons';

async function saveDepartmentIcon(file) {
  if (!file) {
    return {};
  }

  await validateImageUpload(file, {
    label: 'Department logo',
    maxBytes: MAX_ICON_SIZE_BYTES
  });

  await fs.mkdir(ICON_UPLOAD_DIR, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.webp`;
  const iconPath = path.join(ICON_UPLOAD_DIR, filename);

  await sharp(file.buffer)
    .resize(160, 160, { fit: 'cover' })
    .webp({ quality: 82 })
    .toFile(iconPath);

  return {
    iconPath,
    iconUrl: `${ICON_PUBLIC_BASE}/${filename}`
  };
}

module.exports = {
  saveDepartmentIcon
};
