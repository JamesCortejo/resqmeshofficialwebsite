const {
  disableMobilePushRegistrationByToken,
  disableMobilePushRegistrationsForActor,
  listAllActiveMobilePushRegistrations,
  listCivilianPushRegistrationsByIds,
  listRescuerPushRegistrationsByAgency,
  upsertMobilePushRegistration,
} = require('../repositories/mobilePushRepository');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const ACTOR_TYPES = new Set(['civilian', 'rescuer']);
const PLATFORM_TYPES = new Set(['android', 'ios']);

function appError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeActorType(actorType) {
  const normalized = String(actorType || '').trim().toLowerCase();
  if (!ACTOR_TYPES.has(normalized)) {
    throw appError('Invalid mobile push actor type.', 400);
  }
  return normalized;
}

function normalizePushToken(value) {
  const token = String(value || '').trim();
  if (!token) {
    throw appError('Push token is required.', 400);
  }
  return token.slice(0, 300);
}

function normalizePlatform(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PLATFORM_TYPES.has(normalized) ? normalized : 'unknown';
}

function buildActorFromPrincipal(principal, fallbackRole = '') {
  const actorType = normalizeActorType(fallbackRole || principal?.role);
  const actorId = Number(principal?.id || 0);

  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw appError('Invalid mobile push actor.', 400);
  }

  return { actorType, actorId };
}

function uniqueRegistrations(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.actorType}:${row.actorId}:${row.pushToken}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}

async function registerMobilePushToken(principal, payload, fallbackRole = '') {
  const actor = buildActorFromPrincipal(principal, fallbackRole);
  const pushToken = normalizePushToken(payload?.pushToken || payload?.token);
  const lastSeenAt = new Date().toISOString();

  await upsertMobilePushRegistration({
    actorType: actor.actorType,
    actorId: actor.actorId,
    pushToken,
    platform: normalizePlatform(payload?.platform),
    appVersion: payload?.appVersion || payload?.version || null,
    appBuild: payload?.appBuild || payload?.build || null,
    lastSeenAt,
  });

  return {
    actorType: actor.actorType,
    actorId: actor.actorId,
    pushToken,
    enabled: true,
    lastSeenAt,
  };
}

async function unregisterMobilePushToken(principal, payload, fallbackRole = '') {
  const actor = buildActorFromPrincipal(principal, fallbackRole);
  const pushToken = String(payload?.pushToken || payload?.token || '').trim();

  if (pushToken) {
    await disableMobilePushRegistrationByToken(actor.actorType, actor.actorId, pushToken);
  } else {
    await disableMobilePushRegistrationsForActor(actor.actorType, actor.actorId);
  }

  return {
    actorType: actor.actorType,
    actorId: actor.actorId,
    pushToken: pushToken || null,
    enabled: false,
  };
}

async function disableActorMobilePushTokens(principal, fallbackRole = '') {
  const actor = buildActorFromPrincipal(principal, fallbackRole);
  await disableMobilePushRegistrationsForActor(actor.actorType, actor.actorId);
}

async function sendExpoPushMessages(registrations, payloadFactory) {
  const uniqueRows = uniqueRegistrations(
    (registrations || []).filter((row) => row && row.pushToken)
  );

  if (uniqueRows.length === 0) {
    return { delivered: 0, attempted: 0 };
  }

  const chunks = chunk(uniqueRows, 100);
  let delivered = 0;

  for (const group of chunks) {
    const messages = group.map((registration) => ({
      to: registration.pushToken,
      sound: 'default',
      priority: 'high',
      channelId: 'resqmesh-default',
      ...payloadFactory(registration),
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const json = await response.json().catch(() => null);

      if (!response.ok) {
        console.error('Expo push request failed:', response.status, json);
        continue;
      }

      const tickets = Array.isArray(json?.data) ? json.data : [];
      delivered += tickets.filter((ticket) => ticket?.status === 'ok').length;

      const failures = tickets.filter((ticket) => ticket?.status === 'error');
      if (failures.length > 0) {
        console.error('Expo push ticket errors:', failures);
      }
    } catch (error) {
      console.error('Expo push dispatch failed:', error);
    }
  }

  return {
    delivered,
    attempted: uniqueRows.length,
  };
}

async function pushOnlineChatMessageNotification({
  conversation,
  department,
  civilian,
  message,
}) {
  if (!conversation || !department || !message) {
    return;
  }

  let registrations = [];
  const trimmedBody = String(message.body || '').trim();
  const preview = trimmedBody.length > 120 ? `${trimmedBody.slice(0, 117)}...` : trimmedBody;
  const departmentName = department.name || 'Department chat';
  const civilianName = civilian?.fullName || civilian?.firstName || civilian?.code || 'Civilian';

  if (message.senderType === 'civilian' || message.senderType === 'admin') {
    if (department.rescuerAgency) {
      registrations = await listRescuerPushRegistrationsByAgency(department.rescuerAgency);
      await sendExpoPushMessages(registrations, () => ({
        title: `${departmentName}: New message`,
        body: preview || `${civilianName} sent a new message.`,
        data: {
          type: 'online-chat-message',
          mode: 'online',
          actorRole: 'rescuer',
          conversationId: conversation.id,
          departmentId: department.id,
          departmentName,
          readOnly: false,
          participantName: civilianName,
          participantCode: civilian?.code || null,
          senderType: message.senderType,
          messageId: message.id,
        },
      }));
    }

    if (message.senderType === 'civilian') {
      return;
    }
  }

  registrations = await listCivilianPushRegistrationsByIds([conversation.civilianUserId]);
  await sendExpoPushMessages(registrations, () => ({
    title: `${departmentName}: Reply received`,
    body: preview || 'You have a new message.',
    data: {
      type: 'online-chat-message',
      mode: 'online',
      actorRole: 'civilian',
      conversationId: conversation.id,
      departmentId: department.id,
      departmentName,
      readOnly: Boolean(department.readOnly),
      participantName: civilianName,
      participantCode: civilian?.code || null,
      senderType: message.senderType,
      messageId: message.id,
    },
  }));
}

async function pushGlobalAnnouncementNotification({ department, message }) {
  if (!department || !message) {
    return;
  }

  const registrations = await listAllActiveMobilePushRegistrations();
  const trimmedBody = String(message.body || '').trim();
  const preview = trimmedBody.length > 120 ? `${trimmedBody.slice(0, 117)}...` : trimmedBody;

  await sendExpoPushMessages(registrations, (registration) => ({
    title: 'Global announcement',
    body: preview || 'New global announcement from ResQMesh.',
    data: {
      type: 'online-chat-message',
      mode: 'online',
      actorRole: registration.actorType,
      departmentId: department.id,
      departmentName: department.name || 'Global Announcements',
      readOnly: true,
      senderType: message.senderType,
      messageId: message.id,
      global: true,
    },
  }));
}

async function pushOnlineDistressNotification(distress) {
  if (!distress?.id) {
    return;
  }

  const registrations = await listAllActiveMobilePushRegistrations();
  const distressCode = distress.distressCode || distress.code || 'Emergency';
  const reason = String(distress.reason || '').trim();
  const title = reason ? `${distressCode}: ${reason.toUpperCase()}` : `${distressCode}: New distress`;

  await sendExpoPushMessages(registrations, (registration) => ({
    title,
    body: 'New distress signal reported.',
    data: {
      type: 'distress-signal',
      mode: 'online',
      actorRole: registration.actorType,
      distressId: distress.id,
      distressCode,
      reason: reason || null,
      sourceType: 'online',
    },
  }));
}

module.exports = {
  registerMobilePushToken,
  unregisterMobilePushToken,
  disableActorMobilePushTokens,
  pushOnlineChatMessageNotification,
  pushGlobalAnnouncementNotification,
  pushOnlineDistressNotification,
};
