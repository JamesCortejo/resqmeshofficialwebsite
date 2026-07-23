const path = require('path');
const dotenv = require('dotenv');

const appRoot = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(appRoot, '.env') });

function required(name) {
  const value = process.env[name];

  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.join(appRoot, value);
}

function parseEncryptionKey(value) {
  const base64Key = Buffer.from(value, 'base64');

  if (base64Key.length === 32) {
    return base64Key;
  }

  const hexKey = Buffer.from(value, 'hex');

  if (hexKey.length === 32) {
    return hexKey;
  }

  throw new Error('APP_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex value.');
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a valid positive number.');
  }

  return port;
}

function parseBoolean(value, name) {
  const normalized = String(value).trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be true or false.`);
}

function optional(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a valid positive integer.`);
  }

  return parsed;
}

const config = {
  appRoot,
  databaseUrl: required('DATABASE_URL'),
  encryptedUploadDir: resolveFromRoot(required('ENCRYPTED_UPLOAD_DIR')),
  encryptionKey: parseEncryptionKey(required('APP_ENCRYPTION_KEY')),
  recaptcha: {
    siteKey: optional(process.env.RECAPTCHA_SITE_KEY),
    secretKey: optional(process.env.RECAPTCHA_SECRET_KEY)
  },
  openRouteServiceApiKey: optional(process.env.OPENROUTESERVICE_API_KEY),
  routeSync: {
    snapshotMaxAgeSeconds: parsePositiveInteger(process.env.ROUTE_SNAPSHOT_MAX_AGE_SECONDS, 10, 'ROUTE_SNAPSHOT_MAX_AGE_SECONDS'),
    movementThresholdMeters: parsePositiveInteger(process.env.ROUTE_MOVEMENT_THRESHOLD_METERS, 25, 'ROUTE_MOVEMENT_THRESHOLD_METERS')
  },
  deviceSync: {
    tokenTtlMinutes: parsePositiveInteger(process.env.DEVICE_SYNC_TOKEN_TTL_MINUTES, 30, 'DEVICE_SYNC_TOKEN_TTL_MINUTES'),
    defaultPageLimit: parsePositiveInteger(process.env.DEVICE_SYNC_DEFAULT_PAGE_LIMIT, 100, 'DEVICE_SYNC_DEFAULT_PAGE_LIMIT'),
    maxPageLimit: parsePositiveInteger(process.env.DEVICE_SYNC_MAX_PAGE_LIMIT, 250, 'DEVICE_SYNC_MAX_PAGE_LIMIT'),
    bootstrapDevice: {
      nodeId: optional(process.env.SYNC_BOOTSTRAP_NODE_ID),
      nodeName: optional(process.env.SYNC_BOOTSTRAP_NODE_NAME),
      apiKey: optional(process.env.SYNC_BOOTSTRAP_API_KEY),
      allowedIp: optional(process.env.SYNC_BOOTSTRAP_ALLOWED_IP)
    }
  },
  smtp: {
    host: required('SMTP_HOST'),
    port: parsePort(required('SMTP_PORT')),
    secure: parseBoolean(required('SMTP_SECURE'), 'SMTP_SECURE'),
    user: required('SMTP_USER'),
    pass: required('SMTP_PASS'),
    fromEmail: required('SMTP_FROM_EMAIL'),
    fromName: required('SMTP_FROM_NAME')
  }
};

module.exports = config;
