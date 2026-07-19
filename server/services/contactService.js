const { sendContactEmail } = require('./emailService');
const { verifyRecaptcha } = require('./recaptchaService');

const SUBJECT_LABELS = {
  'registration-help': 'Civilian Registration Help',
  'account-approval': 'Account Approval Status',
  'app-access': 'Mobile App Access Problem',
  'mesh-connection': 'Mesh Device Connection Help',
  'emergency-guidance': 'Emergency Use Guidance',
  other: 'Other Civilian Concern'
};

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitBuckets = new Map();

function normalizeString(value) {
  return String(value || '').trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getRateLimitBucket(ipAddress, now) {
  const existing = rateLimitBuckets.get(ipAddress);

  if (existing && now - existing.windowStartedAt < RATE_LIMIT_WINDOW_MS) {
    return existing;
  }

  const next = {
    count: 0,
    windowStartedAt: now
  };

  rateLimitBuckets.set(ipAddress, next);
  return next;
}

function assertRateLimit(ipAddress) {
  const now = Date.now();
  const bucket = getRateLimitBucket(ipAddress || 'unknown', now);

  if (bucket.count >= RATE_LIMIT_MAX) {
    const error = new Error('Too many contact submissions. Please wait a few minutes before trying again.');
    error.statusCode = 429;
    throw error;
  }

  bucket.count += 1;
}

function validateContactPayload(body) {
  const name = normalizeString(body.name);
  const email = normalizeString(body.email).toLowerCase();
  const subject = normalizeString(body.subject) || 'other';
  const message = normalizeString(body.message);

  if (!name || !email || !message) {
    const error = new Error('Please provide your name, email address, and message.');
    error.statusCode = 400;
    throw error;
  }

  if (name.length > 120) {
    const error = new Error('Name must be 120 characters or fewer.');
    error.statusCode = 400;
    throw error;
  }

  if (!isValidEmail(email) || email.length > 254) {
    const error = new Error('Please provide a valid email address.');
    error.statusCode = 400;
    throw error;
  }

  if (!Object.prototype.hasOwnProperty.call(SUBJECT_LABELS, subject)) {
    const error = new Error('Please choose a valid contact subject.');
    error.statusCode = 400;
    throw error;
  }

  if (message.length > 4000) {
    const error = new Error('Message must be 4000 characters or fewer.');
    error.statusCode = 400;
    throw error;
  }

  return {
    name,
    email,
    subject,
    subjectLabel: SUBJECT_LABELS[subject],
    message
  };
}

async function submitContactMessage(body, requestMeta = {}) {
  const contact = validateContactPayload(body);
  const ipAddress = requestMeta.ipAddress || 'unknown';

  assertRateLimit(ipAddress);
  await verifyRecaptcha(body.recaptchaToken, 'contact', {
    remoteIp: ipAddress,
    hostname: requestMeta.hostname
  });

  await sendContactEmail({
    ...contact,
    ipAddress,
    submittedAt: new Date().toISOString()
  });
}

module.exports = {
  submitContactMessage
};
