const { validateDeviceSyncSession } = require('../services/authSessionService');

const rateLimitBuckets = new Map();

function buildRateLimitKey(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ipAddress = forwardedFor || req.socket?.remoteAddress || 'unknown';
  const nodeId = String(req.body?.nodeId || req.query?.nodeId || '').trim();
  return `${ipAddress}:${nodeId || 'anonymous'}`;
}

function pruneOldBucketEntries(bucket, windowStart) {
  while (bucket.length > 0 && bucket[0] < windowStart) {
    bucket.shift();
  }
}

function createRateLimiter(maxRequests, windowMs) {
  return function rateLimit(req, res, next) {
    const key = buildRateLimitKey(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    const bucket = rateLimitBuckets.get(key) || [];

    pruneOldBucketEntries(bucket, windowStart);

    if (bucket.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many device sync requests. Please retry shortly.'
      });
    }

    bucket.push(now);
    rateLimitBuckets.set(key, bucket);
    return next();
  };
}

async function requireDeviceSyncSession(req, res, next) {
  try {
    const authenticatedSession = await validateDeviceSyncSession(req);

    if (!authenticatedSession) {
      return res.status(401).json({
        success: false,
        message: 'Valid device sync authentication is required.'
      });
    }

    req.syncSession = authenticatedSession.session;
    req.syncDevice = authenticatedSession.principal;
    return next();
  } catch (error) {
    console.error('Device sync session validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Unable to validate device sync session.'
    });
  }
}

module.exports = {
  createRateLimiter,
  requireDeviceSyncSession
};
