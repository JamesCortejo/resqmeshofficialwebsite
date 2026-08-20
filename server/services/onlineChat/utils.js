const { RESCUER_AGENCY_VALUES } = require('./constants');

function appError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeString(value, maxLength) {
  const normalized = String(value ?? '').trim();
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

function slugify(value) {
  const slug = normalizeString(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `department-${Date.now()}`;
}

function normalizeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function normalizeFlag(value) {
  if (value === true || value === 1 || value === '1') {
    return 1;
  }

  if (String(value).toLowerCase() === 'true') {
    return 1;
  }

  return 0;
}

function normalizeAgency(value) {
  const normalized = normalizeString(value, 40).toLowerCase();
  return normalized || null;
}

function resolveRescuerAgency(value, fallbackSlug = '', fallbackName = '') {
  const direct = normalizeAgency(value);
  if (direct && RESCUER_AGENCY_VALUES.has(direct)) {
    return direct;
  }

  const source = `${fallbackSlug} ${fallbackName}`.toLowerCase();
  if (source.includes('cdrrmo')) {
    return 'cdrrmo';
  }
  if (source.includes('fire')) {
    return 'fire-department';
  }
  if (source.includes('police')) {
    return 'police-department';
  }

  return null;
}

function calculateAge(birthDateValue) {
  if (!birthDateValue) {
    return null;
  }

  const parsed = new Date(`${birthDateValue}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDiff = today.getUTCMonth() - parsed.getUTCMonth();
  const dayDiff = today.getUTCDate() - parsed.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return Math.max(age, 0);
}

function fullName(...parts) {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

module.exports = {
  appError,
  calculateAge,
  fullName,
  normalizeAgency,
  normalizeFlag,
  normalizeInteger,
  normalizeString,
  resolveRescuerAgency,
  slugify
};
