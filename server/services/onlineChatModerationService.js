const crypto = require('crypto');
const profanityWords = require('../data/onlineChatProfanity');
const {
  getRescuerSenderGuard,
  getSenderGuard,
  insertModerationEvent,
  upsertRescuerSenderGuard,
  upsertSenderGuard,
} = require('../repositories/onlineChatRepository');

const WINDOW_SECONDS = 15;
const WINDOW_MESSAGE_LIMIT = 5;
const DUPLICATE_WINDOW_SECONDS = 8;
const STRIKE_RESET_SECONDS = 10 * 60;
const TIMEOUT_STEPS_SECONDS = [30, 120, 600, 1800];
const PREVIEW_LENGTH = 48;

const substitutionMap = new Map([
  ['0', 'o'],
  ['1', 'i'],
  ['3', 'e'],
  ['4', 'a'],
  ['5', 's'],
  ['7', 't'],
  ['@', 'a'],
  ['$', 's'],
]);

function appError(message, statusCode = 400, metadata = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, metadata);
  return error;
}

function normalizeCharacters(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split('')
    .map((character) => substitutionMap.get(character) || character)
    .join('');
}

function collapseRepeatedCharacters(value) {
  return value.replace(/([a-z])\1{2,}/g, '$1');
}

function normalizeForWordMatching(value) {
  return collapseRepeatedCharacters(
    normalizeCharacters(value)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function normalizeForCondensedMatching(value) {
  return collapseRepeatedCharacters(
    normalizeCharacters(value)
      .replace(/[^a-z0-9]/g, '')
  );
}

const wordEntries = Object.values(profanityWords)
  .flat()
  .map((word) => String(word).trim())
  .filter(Boolean)
  .map((word) => ({
    raw: word,
    spaced: normalizeForWordMatching(word),
    condensed: normalizeForCondensedMatching(word),
  }));

function containsProfanity(body) {
  const spaced = ` ${normalizeForWordMatching(body)} `;
  const condensed = normalizeForCondensedMatching(body);

  return wordEntries.some((entry) => {
    if (entry.spaced && spaced.includes(` ${entry.spaced} `)) {
      return true;
    }

    return Boolean(entry.condensed) && condensed.includes(entry.condensed);
  });
}

function containsBlockedLink(body) {
  const normalized = String(body || '').trim();
  if (!normalized) {
    return false;
  }

  const patterns = [
    /\bhttps?:\/\/[^\s]+/i,
    /\bwww\.[^\s]+/i,
    /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b(?:\/[^\s]*)?/i,
    /\b(?:bit\.ly|tinyurl\.com|t\.me|discord\.gg|goo\.gl|rb\.gy|lnk\.to)\/[^\s]+/i,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function createBodyHash(body) {
  return crypto
    .createHash('sha256')
    .update(normalizeForCondensedMatching(body))
    .digest('hex');
}

function createBodyPreview(body) {
  const preview = String(body || '').replace(/\s+/g, ' ').trim();
  if (!preview) {
    return null;
  }

  return preview.length > PREVIEW_LENGTH
    ? `${preview.slice(0, PREVIEW_LENGTH)}...`
    : preview;
}

function secondsRemaining(timeoutUntil, now) {
  return Math.max(1, Math.ceil((timeoutUntil.getTime() - now.getTime()) / 1000));
}

function buildTimeoutSeconds(strikeCount) {
  return TIMEOUT_STEPS_SECONDS[Math.min(Math.max(strikeCount - 1, 0), TIMEOUT_STEPS_SECONDS.length - 1)];
}

async function logModerationEvent({
  actorType = 'civilian',
  actorId = null,
  civilianUserId,
  rescuerId,
  departmentId,
  conversationId,
  eventType,
  reason,
  body,
  metadata,
}) {
  await insertModerationEvent({
    civilianUserId: actorType === 'civilian' ? (civilianUserId || actorId) : null,
    rescuerId: actorType === 'rescuer' ? (rescuerId || actorId) : null,
    departmentId,
    conversationId,
    eventType,
    reason,
    bodyPreview: createBodyPreview(body),
    metadataJson: metadata || actorType !== 'civilian'
      ? JSON.stringify({
          ...(metadata || {}),
          actorType,
        })
      : null,
  });
}

function getGuardAccessors(actorType) {
  if (actorType === 'rescuer') {
    return {
      getGuard: getRescuerSenderGuard,
      upsertGuard: upsertRescuerSenderGuard,
      idKey: 'rescuerId',
    };
  }

  return {
    getGuard: getSenderGuard,
    upsertGuard: upsertSenderGuard,
    idKey: 'civilianUserId',
  };
}

async function enforceActorMessageSecurity({
  actorType = 'civilian',
  actorId,
  departmentId,
  conversationId,
  body,
}) {
  const { getGuard, upsertGuard, idKey } = getGuardAccessors(actorType);
  const now = new Date();
  const senderGuard = await getGuard(actorId);
  const bodyHash = createBodyHash(body);
  const current = senderGuard || {
    [idKey]: actorId,
    windowStartedAt: null,
    messageCount: 0,
    strikeCount: 0,
    timeoutUntil: null,
    lastMessageAt: null,
    lastMessageBodyHash: null,
    lastViolationAt: null,
  };

  const timeoutUntil = current.timeoutUntil ? new Date(current.timeoutUntil) : null;
  if (timeoutUntil && timeoutUntil > now) {
    const remainingSeconds = secondsRemaining(timeoutUntil, now);
    throw appError(
      `You are temporarily timed out for spamming. Try again in ${remainingSeconds} seconds.`,
      429,
      { code: 'ONLINE_CHAT_TIMEOUT', retryAfterSeconds: remainingSeconds }
    );
  }

  const lastViolationAt = current.lastViolationAt ? new Date(current.lastViolationAt) : null;
  let strikeCount = Number(current.strikeCount || 0);
  if (!lastViolationAt || ((now.getTime() - lastViolationAt.getTime()) / 1000) > STRIKE_RESET_SECONDS) {
    strikeCount = 0;
  }

  const lastMessageAt = current.lastMessageAt ? new Date(current.lastMessageAt) : null;
  if (
    current.lastMessageBodyHash &&
    current.lastMessageBodyHash === bodyHash &&
    lastMessageAt &&
    ((now.getTime() - lastMessageAt.getTime()) / 1000) <= DUPLICATE_WINDOW_SECONDS
  ) {
    strikeCount += 1;
    const timeoutSeconds = buildTimeoutSeconds(strikeCount);
    const nextTimeoutUntil = new Date(now.getTime() + timeoutSeconds * 1000);

    await upsertGuard({
      [idKey]: actorId,
      windowStartedAt: now.toISOString(),
      messageCount: 0,
      strikeCount,
      timeoutUntil: nextTimeoutUntil.toISOString(),
      lastMessageAt: now.toISOString(),
      lastMessageBodyHash: bodyHash,
      lastViolationAt: now.toISOString(),
    });

    await logModerationEvent({
      actorType,
      actorId,
      departmentId,
      conversationId,
      eventType: 'duplicate_message_blocked',
      reason: 'rapid_duplicate',
      body,
      metadata: { timeoutSeconds, strikeCount },
    });

    throw appError(
      `You are temporarily timed out for spamming. Try again in ${timeoutSeconds} seconds.`,
      429,
      { code: 'ONLINE_CHAT_DUPLICATE', retryAfterSeconds: timeoutSeconds }
    );
  }

  if (containsBlockedLink(body)) {
    await logModerationEvent({
      actorType,
      actorId,
      departmentId,
      conversationId,
      eventType: 'link_blocked',
      reason: 'link_detected',
      body,
    });

    throw appError('Links are not allowed in online chat messages.', 422, {
      code: 'ONLINE_CHAT_LINK_BLOCKED',
    });
  }

  if (containsProfanity(body)) {
    await logModerationEvent({
      actorType,
      actorId,
      departmentId,
      conversationId,
      eventType: 'profanity_blocked',
      reason: 'prohibited_language',
      body,
    });

    throw appError('Message contains prohibited language.', 422, {
      code: 'ONLINE_CHAT_PROFANITY_BLOCKED',
    });
  }

  const windowStartedAt = current.windowStartedAt ? new Date(current.windowStartedAt) : null;
  const insideWindow = windowStartedAt && ((now.getTime() - windowStartedAt.getTime()) / 1000) <= WINDOW_SECONDS;
  const nextMessageCount = insideWindow ? Number(current.messageCount || 0) + 1 : 1;
  const nextWindowStartedAt = insideWindow ? windowStartedAt.toISOString() : now.toISOString();

  if (nextMessageCount > WINDOW_MESSAGE_LIMIT) {
    strikeCount += 1;
    const timeoutSeconds = buildTimeoutSeconds(strikeCount);
    const nextTimeoutUntil = new Date(now.getTime() + timeoutSeconds * 1000);

    await upsertGuard({
      [idKey]: actorId,
      windowStartedAt: now.toISOString(),
      messageCount: 0,
      strikeCount,
      timeoutUntil: nextTimeoutUntil.toISOString(),
      lastMessageAt: now.toISOString(),
      lastMessageBodyHash: bodyHash,
      lastViolationAt: now.toISOString(),
    });

    await logModerationEvent({
      actorType,
      actorId,
      departmentId,
      conversationId,
      eventType: 'spam_timeout_triggered',
      reason: 'burst_limit_exceeded',
      body,
      metadata: { timeoutSeconds, strikeCount, windowSeconds: WINDOW_SECONDS, limit: WINDOW_MESSAGE_LIMIT },
    });

    throw appError(
      `You are temporarily timed out for spamming. Try again in ${timeoutSeconds} seconds.`,
      429,
      { code: 'ONLINE_CHAT_SPAM_TIMEOUT', retryAfterSeconds: timeoutSeconds }
    );
  }

  await upsertGuard({
    [idKey]: actorId,
    windowStartedAt: nextWindowStartedAt,
    messageCount: nextMessageCount,
    strikeCount,
    timeoutUntil: null,
    lastMessageAt: now.toISOString(),
    lastMessageBodyHash: bodyHash,
    lastViolationAt: lastViolationAt ? lastViolationAt.toISOString() : null,
  });
}

async function enforceCivilianMessageSecurity({
  civilianUserId,
  departmentId,
  conversationId,
  body,
}) {
  return enforceActorMessageSecurity({
    actorType: 'civilian',
    actorId: civilianUserId,
    departmentId,
    conversationId,
    body,
  });
}

async function enforceRescuerMessageSecurity({
  rescuerId,
  departmentId,
  conversationId,
  body,
}) {
  return enforceActorMessageSecurity({
    actorType: 'rescuer',
    actorId: rescuerId,
    departmentId,
    conversationId,
    body,
  });
}

module.exports = {
  enforceActorMessageSecurity,
  enforceCivilianMessageSecurity,
  enforceRescuerMessageSecurity,
};
