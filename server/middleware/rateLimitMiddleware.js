const DEFAULT_MESSAGE = 'Too many requests. Please retry shortly.';
const buckets = new Map();
let requestsSinceCleanup = 0;

function normalizePart(value, fallback = 'unknown') {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized || fallback;
}

function getClientIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
}

function pickBodyValue(req, fields) {
  for (const field of fields) {
    const value = req.body && req.body[field];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function getPrincipalKey(req) {
  const candidates = [
    req.civilianSession && `civilian-session:${req.civilianSession.id}`,
    req.rescuerSession && `rescuer-session:${req.rescuerSession.id}`,
    req.mobileSession && `mobile-session:${req.mobileSession.id}`,
    req.adminSession && `admin-session:${req.adminSession.session?.id || req.adminSession.id}`,
    req.syncSession && `sync-session:${req.syncSession.id}`,
    req.civilian && `civilian:${req.civilian.id || req.civilian.userCode}`,
    req.rescuer && `rescuer:${req.rescuer.id || req.rescuer.rescuerCode}`,
    req.mobilePrincipal && `mobile:${req.mobilePrincipal.id || req.mobilePrincipal.userCode || req.mobilePrincipal.rescuerCode}`,
    req.adminUser && `admin:${req.adminUser.id || req.adminUser.adminCode}`,
    req.syncDevice && `device:${req.syncDevice.id || req.syncDevice.nodeId}`
  ];

  return candidates.find(Boolean) || `ip:${getClientIp(req)}`;
}

function identityFromBody(fields) {
  return function buildIdentityKey(req) {
    const identifier = pickBodyValue(req, fields);
    return `${getClientIp(req)}:${normalizePart(identifier, 'anonymous')}`;
  };
}

function ipKey(req) {
  return getClientIp(req);
}

function authenticatedKey(req) {
  return getPrincipalKey(req);
}

function deviceKey(req) {
  const nodeId = req.body?.nodeId || req.query?.nodeId || req.syncDevice?.nodeId || '';
  return `${getClientIp(req)}:${normalizePart(nodeId, 'anonymous')}`;
}

function pruneBucket(bucket, windowStart) {
  while (bucket.length > 0 && bucket[0] < windowStart) {
    bucket.shift();
  }
}

function cleanupExpiredBuckets(now) {
  for (const [key, entry] of buckets.entries()) {
    if (!entry || now - entry.lastSeenAt > entry.windowMs * 2) {
      buckets.delete(key);
    }
  }
}

function createRateLimiter(options) {
  const {
    name,
    maxRequests,
    windowMs,
    keyGenerator = ipKey,
    message = DEFAULT_MESSAGE
  } = options || {};

  if (!name || !Number.isFinite(maxRequests) || !Number.isFinite(windowMs)) {
    throw new Error('Rate limiter requires name, maxRequests, and windowMs.');
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const keyValue = normalizePart(keyGenerator(req), 'unknown');
    const bucketKey = `${name}:${keyValue}`;
    const entry = buckets.get(bucketKey) || { hits: [], windowMs, lastSeenAt: now };

    entry.windowMs = windowMs;
    entry.lastSeenAt = now;
    pruneBucket(entry.hits, windowStart);

    if (entry.hits.length >= maxRequests) {
      const ipAddress = getClientIp(req);
      console.warn('Rate limit exceeded:', {
        limiter: name,
        method: req.method,
        path: req.originalUrl || req.path,
        ipAddress
      });

      return res.status(429).json({
        success: false,
        message
      });
    }

    entry.hits.push(now);
    buckets.set(bucketKey, entry);

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 500) {
      requestsSinceCleanup = 0;
      cleanupExpiredBuckets(now);
    }

    return next();
  };
}

const rateLimiters = Object.freeze({
  adminLogin: createRateLimiter({
    name: 'admin-login',
    maxRequests: 10,
    windowMs: 5 * 60 * 1000,
    keyGenerator: identityFromBody(['username'])
  }),
  mobileLogin: createRateLimiter({
    name: 'mobile-login',
    maxRequests: 20,
    windowMs: 5 * 60 * 1000,
    keyGenerator: identityFromBody(['phone', 'code', 'username'])
  }),
  passwordResetRequest: createRateLimiter({
    name: 'password-reset-request',
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    keyGenerator: identityFromBody(['email', 'phone', 'identifier'])
  }),
  passwordResetConfirm: createRateLimiter({
    name: 'password-reset-confirm',
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
    keyGenerator: identityFromBody(['email', 'phone', 'identifier'])
  }),
  registration: createRateLimiter({
    name: 'registration',
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
    keyGenerator: ipKey
  }),
  contact: createRateLimiter({
    name: 'contact',
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    keyGenerator: ipKey
  }),
  downloadRequest: createRateLimiter({
    name: 'download-request',
    maxRequests: 20,
    windowMs: 15 * 60 * 1000,
    keyGenerator: ipKey
  }),
  publicMap: createRateLimiter({
    name: 'public-map',
    maxRequests: 300,
    windowMs: 60 * 1000,
    keyGenerator: ipKey
  }),
  publicEta: createRateLimiter({
    name: 'public-eta',
    maxRequests: 120,
    windowMs: 60 * 1000,
    keyGenerator: ipKey
  }),
  authenticatedMobileWrite: createRateLimiter({
    name: 'authenticated-mobile-write',
    maxRequests: 60,
    windowMs: 60 * 1000,
    keyGenerator: authenticatedKey
  }),
  locationUpdate: createRateLimiter({
    name: 'rescuer-location-update',
    maxRequests: 90,
    windowMs: 60 * 1000,
    keyGenerator: authenticatedKey
  }),
  onlineChatSend: createRateLimiter({
    name: 'online-chat-send',
    maxRequests: 40,
    windowMs: 60 * 1000,
    keyGenerator: authenticatedKey
  }),
  deviceAuth: createRateLimiter({
    name: 'device-auth',
    maxRequests: 20,
    windowMs: 60 * 1000,
    keyGenerator: deviceKey
  }),
  deviceSync: createRateLimiter({
    name: 'device-sync',
    maxRequests: 180,
    windowMs: 60 * 1000,
    keyGenerator: deviceKey
  }),
  deviceSyncAuthenticated: createRateLimiter({
    name: 'device-sync-authenticated',
    maxRequests: 180,
    windowMs: 60 * 1000,
    keyGenerator: authenticatedKey
  })
});

module.exports = {
  createRateLimiter,
  getClientIp,
  rateLimiters
};