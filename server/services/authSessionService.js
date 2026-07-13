const crypto = require('crypto');
const {
  ADMIN_CSRF_HEADER_NAME,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_HOURS,
  SAFE_HTTP_METHODS,
  SESSION_CLIENT_TYPES,
  SESSION_PRINCIPAL_TYPES
} = require('../models/authSessionModel');
const {
  createAuthSession,
  findAuthSessionByTokenHash,
  revokeAuthSessionById,
  updateAuthSessionLastSeen
} = require('../repositories/authSessionRepository');
const { findAdminById } = require('../repositories/adminRepository');

const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function nowAsIso() {
  return new Date().toISOString();
}

function addHours(date, hours) {
  return new Date(date.getTime() + (hours * 60 * 60 * 1000));
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf('=');

      if (separatorIndex === -1) {
        return cookies;
      }

      const name = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();

      if (!name) {
        return cookies;
      }

      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  parts.push(`Path=${options.path || '/'}`);

  if (options.httpOnly) {
    parts.push('HttpOnly');
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function isSecureRequest(req) {
  return Boolean(req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https');
}

function getRequestIpAddress(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.socket?.remoteAddress || '';
}

function buildSessionCookie(token, req) {
  const secure = isSecureRequest(req);

  return serializeCookie(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: ADMIN_SESSION_TTL_HOURS * 60 * 60
  });
}

function buildClearedSessionCookie(req) {
  const secure = isSecureRequest(req);

  return serializeCookie(ADMIN_SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });
}

function readSessionTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[ADMIN_SESSION_COOKIE_NAME] || '';
}

function shouldTouchLastSeen(lastSeenAt) {
  const lastSeenTime = new Date(lastSeenAt).getTime();

  if (!Number.isFinite(lastSeenTime)) {
    return true;
  }

  return Date.now() - lastSeenTime >= SESSION_TOUCH_INTERVAL_MS;
}

async function createAdminWebSession(adminUser, req) {
  const issuedAt = new Date();
  const expiresAt = addHours(issuedAt, ADMIN_SESSION_TTL_HOURS);
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const csrfSecret = crypto.randomBytes(24).toString('hex');
  const timestamp = issuedAt.toISOString();

  const result = await createAuthSession({
    principalType: SESSION_PRINCIPAL_TYPES.ADMIN_USER,
    principalId: adminUser.id,
    clientType: SESSION_CLIENT_TYPES.ADMIN_WEB,
    sessionTokenHash: hashToken(sessionToken),
    csrfSecret,
    expiresAt: expiresAt.toISOString(),
    lastSeenAt: timestamp,
    revokedAt: null,
    ipAddress: getRequestIpAddress(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    createdAt: timestamp
  });

  return {
    sessionId: result.lastID,
    sessionToken,
    csrfSecret,
    expiresAt: expiresAt.toISOString()
  };
}

async function validateAdminWebSession(req) {
  const sessionToken = readSessionTokenFromRequest(req);

  if (!sessionToken) {
    return null;
  }

  const session = await findAuthSessionByTokenHash(hashToken(sessionToken));

  if (!session) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(session.expiresAt);

  if (
    session.revokedAt
    || session.principalType !== SESSION_PRINCIPAL_TYPES.ADMIN_USER
    || session.clientType !== SESSION_CLIENT_TYPES.ADMIN_WEB
    || Number.isNaN(expiresAt.getTime())
    || expiresAt.getTime() <= now.getTime()
  ) {
    return null;
  }

  const adminUser = await findAdminById(session.principalId);

  if (!adminUser) {
    return null;
  }

  if (shouldTouchLastSeen(session.lastSeenAt)) {
    const nextLastSeenAt = nowAsIso();
    await updateAuthSessionLastSeen(session.id, nextLastSeenAt);
    session.lastSeenAt = nextLastSeenAt;
  }

  return {
    session,
    principal: adminUser,
    csrfToken: session.csrfSecret
  };
}

async function revokeAuthenticatedSession(sessionId) {
  if (!sessionId) {
    return;
  }

  await revokeAuthSessionById(sessionId, nowAsIso());
}

function isSafeMethod(method) {
  return SAFE_HTTP_METHODS.has(String(method || 'GET').toUpperCase());
}

function getCsrfTokenFromRequest(req) {
  return String(req.headers[ADMIN_CSRF_HEADER_NAME] || '').trim();
}

function hasValidCsrfToken(req) {
  if (isSafeMethod(req.method)) {
    return true;
  }

  const providedToken = getCsrfTokenFromRequest(req);
  const expectedToken = req.adminSession?.csrfToken || '';

  if (!providedToken || !expectedToken) {
    return false;
  }

  if (providedToken.length !== expectedToken.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(providedToken),
    Buffer.from(expectedToken)
  );
}

module.exports = {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_CSRF_HEADER_NAME,
  buildSessionCookie,
  buildClearedSessionCookie,
  createAdminWebSession,
  getCsrfTokenFromRequest,
  hasValidCsrfToken,
  isSafeMethod,
  readSessionTokenFromRequest,
  revokeAuthenticatedSession,
  validateAdminWebSession
};
