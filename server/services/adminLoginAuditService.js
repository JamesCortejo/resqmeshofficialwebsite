const fs = require('fs/promises');
const path = require('path');
const config = require('../config/env');

const AUDIT_DIR = path.join(config.appRoot, 'storage', 'security');
const AUDIT_FILE = path.join(AUDIT_DIR, 'admin-login-audit.log');

function normalizeValue(value, maxLength = 500) {
  return String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, maxLength);
}

function getRequestIpAddress(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.socket?.remoteAddress || '';
}

async function logAdminLoginAttempt(req, details = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    username: normalizeValue(details.username, 160),
    ipAddress: normalizeValue(getRequestIpAddress(req), 120),
    userAgent: normalizeValue(req.headers['user-agent'], 500),
    result: normalizeValue(details.result, 80),
    reason: normalizeValue(details.reason, 160)
  };

  try {
    await fs.mkdir(AUDIT_DIR, { recursive: true });
    await fs.appendFile(AUDIT_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    console.error('Unable to write admin login audit log:', error);
  }
}

module.exports = {
  logAdminLoginAttempt
};
