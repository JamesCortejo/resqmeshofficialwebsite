const {
  enforceCivilianMessageSecurity,
  enforceRescuerMessageSecurity,
} = require('./onlineChatModerationService');
const {
  markOnlineChatConversationNotificationsRead,
  notifyOnlineChatMessageReceived
} = require('./notificationService');
const {
  pushGlobalAnnouncementNotification,
  pushOnlineChatMessageNotification,
} = require('./mobilePushService');
const {
  archiveDepartment,
  createDepartment,
  getActiveDepartmentByRescuerAgency,
  getAdminDepartmentUnreadSummary,
  getCivilianDepartmentUnreadSummary,
  getCivilianGlobalUnreadSummary,
  getConversationById,
  getDepartmentById,
  getDepartmentBySlug,
  getGlobalMessageById,
  getMessageByIdWithVoice,
  getOrCreateConversation,
  getRescuerDepartmentUnreadSummary,
  getRescuerGlobalUnreadSummary,
  insertGlobalMessage,
  insertMessage,
  listAdminConversations,
  listDepartments,
  listGlobalMessages,
  listMessages,
  listRescuerConversations,
  markGlobalRead,
  markConversationRead,
  updateDepartment
} = require('../repositories/onlineChatRepository');
const {
  COLOR_VALUES,
  MAX_MESSAGE_LENGTH,
  RESCUER_AGENCY_VALUES,
  STATUS_VALUES,
  SYSTEM_GLOBAL_DEPARTMENT
} = require('./onlineChat/constants');
const {
  appError,
  normalizeAgency,
  normalizeFlag,
  normalizeInteger,
  normalizeString,
  resolveRescuerAgency,
  slugify
} = require('./onlineChat/utils');
const {
  formatCivilian,
  formatConversation,
  formatDepartment,
  formatDepartmentFromConversation,
  formatMessage
} = require('./onlineChat/formatters');
const { saveDepartmentIcon } = require('./onlineChat/departmentIconStorage');
const {
  readVoiceClipBase64,
  removeFileIfWritten,
  saveOnlineVoiceClip
} = require('./onlineChat/voiceStorage');

async function ensureSystemGlobalDepartment() {
  const existing = await getDepartmentBySlug(SYSTEM_GLOBAL_DEPARTMENT.slug);

  if (existing) {
    return existing;
  }

  const created = await createDepartment({
    ...SYSTEM_GLOBAL_DEPARTMENT,
    iconPath: null,
    iconUrl: null
  });

  return getDepartmentById(created.lastID);
}

function isSystemGlobalDepartment(department) {
  return department?.slug === SYSTEM_GLOBAL_DEPARTMENT.slug;
}

function buildGlobalConversation(departmentId, civilianUserId = 0) {
  return {
    id: 0,
    departmentId,
    civilianUserId,
    status: 'open',
    lastMessageId: null,
    lastMessageAt: null
  };
}

function normalizeDepartmentPayload(payload, existing = null, icon = {}) {
  const name = normalizeString(payload.name, 60);
  const subtitle = normalizeString(payload.subtitle, 120);
  const status = normalizeString(payload.status || existing?.status || 'active', 20);
  const colorTag = normalizeString(payload.colorTag || payload.color || existing?.colorTag || 'red', 20);
  const rescuerAgency = normalizeAgency(payload.rescuerAgency || existing?.rescuerAgency || '');

  if (!name) {
    throw appError('Department chat name is required.');
  }

  if (!subtitle) {
    throw appError('Department chat subtitle is required.');
  }

  if (!STATUS_VALUES.has(status)) {
    throw appError('Invalid department chat status.');
  }

  if (!COLOR_VALUES.has(colorTag)) {
    throw appError('Invalid department chat color tag.');
  }

  if (!rescuerAgency || !RESCUER_AGENCY_VALUES.has(rescuerAgency)) {
    throw appError('Rescuer agency is required for department chats.');
  }

  return {
    slug: slugify(payload.slug || name),
    name,
    subtitle,
    status,
    colorTag,
    rescuerAgency,
    iconPath: icon.iconPath || null,
    iconUrl: icon.iconUrl || null,
    sortOrder: normalizeInteger(payload.sortOrder ?? existing?.sortOrder, existing?.sortOrder || 100),
    readOnly: normalizeFlag(payload.readOnly ?? existing?.readOnly ?? 0)
  };
}

async function getAdminDepartments(adminUserId, options = {}) {
  const includeSystem = options.includeSystem === true;
  const [departments, unreadRows] = await Promise.all([
    listDepartments({ includeArchived: true }),
    getAdminDepartmentUnreadSummary(adminUserId)
  ]);
  const unreadByDepartment = new Map(unreadRows.map((row) => [row.departmentId, row.unreadCount]));
  const visibleDepartments = includeSystem
    ? [await ensureSystemGlobalDepartment(), ...departments.filter((department) => department.slug !== SYSTEM_GLOBAL_DEPARTMENT.slug)]
    : departments.filter((department) => department.slug !== SYSTEM_GLOBAL_DEPARTMENT.slug);

  return visibleDepartments.map((department) => formatDepartment(
    department,
    unreadByDepartment.get(department.id) || 0
  ));
}

async function getCivilianDepartments(civilianUserId) {
  const systemDepartment = await ensureSystemGlobalDepartment();
  const [departments, unreadRows, globalUnreadRow] = await Promise.all([
    listDepartments({ includeArchived: false }),
    getCivilianDepartmentUnreadSummary(civilianUserId),
    getCivilianGlobalUnreadSummary(civilianUserId, systemDepartment.id)
  ]);
  const unreadByDepartment = new Map(unreadRows.map((row) => [row.departmentId, row.unreadCount]));
  unreadByDepartment.set(systemDepartment.id, Number(globalUnreadRow?.unreadCount || 0));
  const visibleDepartments = [
    systemDepartment,
    ...departments.filter((department) => department.slug !== SYSTEM_GLOBAL_DEPARTMENT.slug)
  ];

  return visibleDepartments.map((department) => formatDepartment(
    department,
    unreadByDepartment.get(department.id) || 0
  ));
}

async function getRescuerDepartments(rescuer) {
  const systemDepartment = await ensureSystemGlobalDepartment();
  const [departments, unreadRows, globalUnreadRow] = await Promise.all([
    listDepartments({ includeArchived: false }),
    getRescuerDepartmentUnreadSummary(rescuer.id),
    getRescuerGlobalUnreadSummary(rescuer.id, systemDepartment.id)
  ]);
  const unreadByDepartment = new Map(unreadRows.map((row) => [row.departmentId, row.unreadCount]));
  unreadByDepartment.set(systemDepartment.id, Number(globalUnreadRow?.unreadCount || 0));
  const visibleDepartments = [
    systemDepartment,
    ...departments.filter((department) => (
      department.slug !== SYSTEM_GLOBAL_DEPARTMENT.slug
      && department.status === 'active'
      && resolveRescuerAgency(department.rescuerAgency, department.slug, department.name) === rescuer.agency
    ))
  ];

  return visibleDepartments.map((department) => formatDepartment(
    department,
    unreadByDepartment.get(department.id) || 0
  ));
}

async function createDepartmentChat(payload, file) {
  const icon = await saveDepartmentIcon(file);
  const room = normalizeDepartmentPayload(payload, null, icon);

  if (room.slug === SYSTEM_GLOBAL_DEPARTMENT.slug) {
    throw appError('Global Announcements is a built-in system room.', 409);
  }

  const existing = await getDepartmentBySlug(room.slug);

  if (existing) {
    throw appError('A department chat with this name already exists.', 409);
  }

  if (room.status === 'active') {
    const activeAgencyRoom = await getActiveDepartmentByRescuerAgency(room.rescuerAgency);
    if (activeAgencyRoom) {
      throw appError('This rescuer agency already has an active department chat.', 409);
    }
  }

  const result = await createDepartment(room);
  return formatDepartment(await getDepartmentById(result.lastID));
}

async function updateDepartmentChat(id, payload, file) {
  const existing = await getDepartmentById(id);

  if (!existing) {
    throw appError('Department chat not found.', 404);
  }

  if (existing.slug === SYSTEM_GLOBAL_DEPARTMENT.slug) {
    throw appError('Global Announcements is managed by the system.', 403);
  }

  const icon = await saveDepartmentIcon(file);
  const room = normalizeDepartmentPayload(payload, existing, icon);
  const duplicate = await getDepartmentBySlug(room.slug);

  if (duplicate && duplicate.id !== existing.id) {
    throw appError('A department chat with this name already exists.', 409);
  }

  if (room.status === 'active') {
    const activeAgencyRoom = await getActiveDepartmentByRescuerAgency(room.rescuerAgency);
    if (activeAgencyRoom && activeAgencyRoom.id !== existing.id) {
      throw appError('This rescuer agency already has an active department chat.', 409);
    }
  }

  await updateDepartment(id, room);
  return formatDepartment(await getDepartmentById(id));
}

async function archiveDepartmentChat(id) {
  const existing = await getDepartmentById(id);

  if (!existing) {
    throw appError('Department chat not found.', 404);
  }

  if (existing.slug === SYSTEM_GLOBAL_DEPARTMENT.slug) {
    throw appError('Global Announcements cannot be archived.', 403);
  }

  await archiveDepartment(id);
  return formatDepartment(await getDepartmentById(id));
}

async function getAdminConversations(departmentId, adminUserId, options = {}) {
  const department = await getDepartmentById(departmentId);

  if (!department) {
    throw appError('Department chat not found.', 404);
  }

  const rows = await listAdminConversations(departmentId, adminUserId, options);
  return {
    department: formatDepartment(department),
    conversations: rows.map(formatConversation)
  };
}

async function getRescuerConversations(departmentId, rescuer, options = {}) {
  const department = await getDepartmentById(departmentId);
  const departmentAgency = department
    ? resolveRescuerAgency(department.rescuerAgency, department.slug, department.name)
    : null;

  if (!department || department.status !== 'active' || isSystemGlobalDepartment(department)) {
    throw appError('Department chat not found.', 404);
  }

  if (departmentAgency !== rescuer.agency) {
    throw appError('Department chat not found.', 404);
  }

  const limit = Math.max(1, Math.min(Number(options.limit) || 12, 30));
  const rows = await listRescuerConversations(departmentId, rescuer.id, {
    search: options.search,
    beforeId: options.beforeId,
    limit,
  });
  const hasMore = rows.length > limit;
  const visibleRows = hasMore ? rows.slice(0, limit) : rows;

  return {
    department: formatDepartment(department),
    conversations: visibleRows.map(formatConversation),
    hasMore,
    nextBeforeId: hasMore ? visibleRows[visibleRows.length - 1]?.id || null : null,
  };
}

async function openCivilianConversation(departmentId, civilianUserId) {
  const department = await getDepartmentById(departmentId);

  if (!department || department.status !== 'active') {
    throw appError('Department chat is not available.', 404);
  }

  if (isSystemGlobalDepartment(department)) {
    return {
      department: formatDepartment(department),
      conversation: buildGlobalConversation(department.id, civilianUserId)
    };
  }

  const conversation = await getOrCreateConversation(departmentId, civilianUserId);
  return {
    department: formatDepartment(department),
    conversation
  };
}

async function getGlobalMessages(actor, options = {}) {
  const department = await ensureSystemGlobalDepartment();
  const messages = await listGlobalMessages(department.id, options);

  return {
    conversation: buildGlobalConversation(
      department.id,
      actor.type === 'civilian' ? actor.id : 0
    ),
    department: formatDepartment(department),
    messages: messages.map(formatMessage)
  };
}

async function getConversationMessages(conversationId, actor, options = {}) {
  const conversation = await getConversationById(conversationId);

  if (!conversation) {
    throw appError('Conversation not found.', 404);
  }

  if (actor.type === 'civilian' && conversation.civilianUserId !== actor.id) {
    throw appError('Conversation not found.', 404);
  }

  if (actor.type === 'rescuer') {
    const departmentAgency = resolveRescuerAgency(
      conversation.departmentRescuerAgency,
      conversation.departmentSlug,
      conversation.departmentName
    );
    if (conversation.departmentStatus !== 'active' || departmentAgency !== actor.agency) {
      throw appError('Conversation not found.', 404);
    }
  }

  const messages = await listMessages(conversationId, options);

  return {
    conversation: formatConversation(conversation),
    department: formatDepartment({
      id: conversation.departmentId,
      slug: conversation.departmentSlug,
      name: conversation.departmentName,
      subtitle: conversation.departmentSubtitle,
      status: conversation.departmentStatus,
      colorTag: conversation.departmentColorTag,
      rescuerAgency: conversation.departmentRescuerAgency,
      iconUrl: conversation.departmentIconUrl,
      sortOrder: conversation.departmentSortOrder,
      readOnly: conversation.departmentReadOnly,
      archivedAt: conversation.departmentArchivedAt,
      createdAt: conversation.departmentCreatedAt,
      updatedAt: conversation.departmentUpdatedAt
    }),
    messages: messages.map(formatMessage)
  };
}

function assertVoiceConversationAccess(conversation, actor) {
  if (!conversation) {
    throw appError('Conversation not found.', 404);
  }

  if (Number(conversation.departmentReadOnly) === 1 || isSystemGlobalDepartment({ slug: conversation.departmentSlug })) {
    throw appError('Voice messages are not available in this room.', 403);
  }

  if (actor.type === 'civilian' && conversation.civilianUserId !== actor.id) {
    throw appError('Conversation not found.', 404);
  }

  if (actor.type === 'rescuer') {
    const departmentAgency = resolveRescuerAgency(
      conversation.departmentRescuerAgency,
      conversation.departmentSlug,
      conversation.departmentName
    );
    if (conversation.departmentStatus !== 'active' || departmentAgency !== actor.agency) {
      throw appError('Conversation not found.', 404);
    }
  }
}

async function sendOnlineVoiceMessage(conversationId, actor, payload) {
  const conversation = await getConversationById(conversationId);
  assertVoiceConversationAccess(conversation, actor);

  const voiceClip = await saveOnlineVoiceClip(payload);

  try {
    const message = await insertMessage({
      conversationId,
      departmentId: conversation.departmentId,
      civilianUserId: conversation.civilianUserId,
      senderType: actor.type,
      senderId: actor.id,
      messageType: 'voice',
      body: 'Voice message',
      voiceClip
    });

    await markConversationRead(conversationId, actor.type, actor.id);

    if (actor.type === 'civilian') {
      await notifyOnlineChatMessageReceived({
        conversationId,
        department: {
          id: conversation.departmentId,
          name: conversation.departmentName
        },
        civilian: formatCivilian(conversation),
        message
      });
    }

    const formattedMessage = formatMessage(message);
    const formattedConversation = formatConversation(conversation);
    const formattedDepartment = formatDepartmentFromConversation(conversation);

    await pushOnlineChatMessageNotification({
      conversation: formattedConversation,
      department: formattedDepartment,
      civilian: formattedConversation.civilian,
      message: formattedMessage,
    });

    return formattedMessage;
  } catch (error) {
    await removeFileIfWritten(voiceClip.filePath);
    throw error;
  }
}

async function getOnlineVoiceClip(messageId, actor) {
  const row = await getMessageByIdWithVoice(messageId);

  if (!row || row.messageType !== 'voice' || !row.voiceClipId || !row.voiceFilePath) {
    throw appError('Voice clip not found.', 404);
  }

  assertVoiceConversationAccess(row, actor.type === 'admin'
    ? { type: 'admin', id: actor.id }
    : actor);

  const content = await readVoiceClipBase64(row.voiceFilePath);

  if (!content) {
    throw appError('Voice clip file is unavailable.', 404);
  }

  return {
    id: row.voiceClipId,
    messageId: row.id,
    mimeType: row.voiceMimeType,
    durationSeconds: Number(row.voiceDurationSeconds || 0),
    sizeBytes: Number(row.voiceSizeBytes || 0),
    content
  };
}

async function sendAdminMessage(conversationId, adminUserId, bodyValue) {
  const conversation = await getConversationById(conversationId);

  if (!conversation) {
    throw appError('Conversation not found.', 404);
  }

  const body = normalizeString(bodyValue, MAX_MESSAGE_LENGTH);

  if (!body) {
    throw appError('Message cannot be empty.');
  }

  const message = await insertMessage({
    conversationId,
    departmentId: conversation.departmentId,
    civilianUserId: conversation.civilianUserId,
    senderType: 'admin',
    senderId: adminUserId,
    body
  });

  await markConversationRead(conversationId, 'admin', adminUserId);
  const formattedMessage = formatMessage(message);
  const formattedConversation = formatConversation(conversation);
  const formattedDepartment = formatDepartment({
    id: conversation.departmentId,
    slug: conversation.departmentSlug,
    name: conversation.departmentName,
    subtitle: conversation.departmentSubtitle,
    status: conversation.departmentStatus,
    colorTag: conversation.departmentColorTag,
    rescuerAgency: conversation.departmentRescuerAgency,
    iconUrl: conversation.departmentIconUrl,
    sortOrder: conversation.departmentSortOrder,
    readOnly: conversation.departmentReadOnly,
    archivedAt: conversation.departmentArchivedAt,
    createdAt: conversation.departmentCreatedAt,
    updatedAt: conversation.departmentUpdatedAt
  });

  await pushOnlineChatMessageNotification({
    conversation: formattedConversation,
    department: formattedDepartment,
    civilian: formattedConversation.civilian,
    message: formattedMessage,
  });

  return formattedMessage;
}

async function sendCivilianMessage(conversationId, civilianUserId, bodyValue) {
  const conversation = await getConversationById(conversationId);

  if (!conversation || conversation.civilianUserId !== civilianUserId) {
    throw appError('Conversation not found.', 404);
  }

  if (Number(conversation.departmentReadOnly) === 1) {
    throw appError('This department chat is read-only.', 403);
  }

  const body = normalizeString(bodyValue, MAX_MESSAGE_LENGTH);

  if (!body) {
    throw appError('Message cannot be empty.');
  }

  await enforceCivilianMessageSecurity({
    civilianUserId,
    departmentId: conversation.departmentId,
    conversationId,
    body,
  });

  const message = await insertMessage({
    conversationId,
    departmentId: conversation.departmentId,
    civilianUserId,
    senderType: 'civilian',
    senderId: civilianUserId,
    body
  });

  await markConversationRead(conversationId, 'civilian', civilianUserId);
  await notifyOnlineChatMessageReceived({
    conversationId,
    department: {
      id: conversation.departmentId,
      name: conversation.departmentName
    },
    civilian: formatCivilian(conversation),
    message
  });
  const formattedMessage = formatMessage(message);
  const formattedConversation = formatConversation(conversation);
  const formattedDepartment = formatDepartment({
    id: conversation.departmentId,
    slug: conversation.departmentSlug,
    name: conversation.departmentName,
    subtitle: conversation.departmentSubtitle,
    status: conversation.departmentStatus,
    colorTag: conversation.departmentColorTag,
    rescuerAgency: conversation.departmentRescuerAgency,
    iconUrl: conversation.departmentIconUrl,
    sortOrder: conversation.departmentSortOrder,
    readOnly: conversation.departmentReadOnly,
    archivedAt: conversation.departmentArchivedAt,
    createdAt: conversation.departmentCreatedAt,
    updatedAt: conversation.departmentUpdatedAt
  });

  await pushOnlineChatMessageNotification({
    conversation: formattedConversation,
    department: formattedDepartment,
    civilian: formattedConversation.civilian,
    message: formattedMessage,
  });

  return formattedMessage;
}

async function sendRescuerMessage(conversationId, rescuer, bodyValue) {
  const conversation = await getConversationById(conversationId);
  const departmentAgency = conversation
    ? resolveRescuerAgency(
        conversation.departmentRescuerAgency,
        conversation.departmentSlug,
        conversation.departmentName
      )
    : null;

  if (!conversation
    || conversation.departmentStatus !== 'active'
    || isSystemGlobalDepartment({ slug: conversation.departmentSlug })
    || departmentAgency !== rescuer.agency) {
    throw appError('Conversation not found.', 404);
  }

  const body = normalizeString(bodyValue, MAX_MESSAGE_LENGTH);

  if (!body) {
    throw appError('Message cannot be empty.');
  }

  await enforceRescuerMessageSecurity({
    rescuerId: rescuer.id,
    departmentId: conversation.departmentId,
    conversationId,
    body,
  });

  const message = await insertMessage({
    conversationId,
    departmentId: conversation.departmentId,
    civilianUserId: conversation.civilianUserId,
    senderType: 'rescuer',
    senderId: rescuer.id,
    body
  });

  await markConversationRead(conversationId, 'rescuer', rescuer.id);
  const formattedMessage = formatMessage(message);
  const formattedConversation = formatConversation(conversation);
  const formattedDepartment = formatDepartment({
    id: conversation.departmentId,
    slug: conversation.departmentSlug,
    name: conversation.departmentName,
    subtitle: conversation.departmentSubtitle,
    status: conversation.departmentStatus,
    colorTag: conversation.departmentColorTag,
    rescuerAgency: conversation.departmentRescuerAgency,
    iconUrl: conversation.departmentIconUrl,
    sortOrder: conversation.departmentSortOrder,
    readOnly: conversation.departmentReadOnly,
    archivedAt: conversation.departmentArchivedAt,
    createdAt: conversation.departmentCreatedAt,
    updatedAt: conversation.departmentUpdatedAt
  });

  await pushOnlineChatMessageNotification({
    conversation: formattedConversation,
    department: formattedDepartment,
    civilian: formattedConversation.civilian,
    message: formattedMessage,
  });

  return formattedMessage;
}

async function sendCivilianVoiceMessage(conversationId, civilianUserId, payload) {
  return sendOnlineVoiceMessage(conversationId, {
    type: 'civilian',
    id: civilianUserId
  }, payload);
}

async function sendRescuerVoiceMessage(conversationId, rescuer, payload) {
  return sendOnlineVoiceMessage(conversationId, {
    type: 'rescuer',
    id: rescuer.id,
    agency: rescuer.agency
  }, payload);
}

async function sendGlobalAnnouncement(adminUserId, bodyValue) {
  const department = await ensureSystemGlobalDepartment();
  const body = normalizeString(bodyValue, MAX_MESSAGE_LENGTH);

  if (!body) {
    throw appError('Message cannot be empty.');
  }

  const result = await insertGlobalMessage({
    departmentId: department.id,
    senderType: 'admin',
    senderId: adminUserId,
    body
  });

  await markGlobalRead(department.id, 'admin', adminUserId);
  const formattedMessage = formatMessage(await getGlobalMessageById(result.lastID));
  await pushGlobalAnnouncementNotification({
    department: formatDepartment(department),
    message: formattedMessage,
  });
  return formattedMessage;
}

async function markRead(conversationId, actor) {
  const conversation = await getConversationById(conversationId);

  if (!conversation) {
    throw appError('Conversation not found.', 404);
  }

  if (actor.type === 'civilian' && conversation.civilianUserId !== actor.id) {
    throw appError('Conversation not found.', 404);
  }

  if (actor.type === 'rescuer') {
    const departmentAgency = resolveRescuerAgency(
      conversation.departmentRescuerAgency,
      conversation.departmentSlug,
      conversation.departmentName
    );
    if (conversation.departmentStatus !== 'active' || departmentAgency !== actor.agency) {
      throw appError('Conversation not found.', 404);
    }
  }

  await markConversationRead(conversationId, actor.type, actor.id);
  if (actor.type === 'admin') {
    await markOnlineChatConversationNotificationsRead(conversationId);
  }
  return { conversationId };
}

async function markGlobalAnnouncementsRead(actor) {
  const department = await ensureSystemGlobalDepartment();
  await markGlobalRead(department.id, actor.type, actor.id);
  return { departmentId: department.id };
}

module.exports = {
  archiveDepartmentChat,
  createDepartmentChat,
  getAdminConversations,
  getAdminDepartments,
  getCivilianDepartments,
  getOnlineVoiceClip,
  getRescuerConversations,
  getRescuerDepartments,
  getConversationMessages,
  getGlobalMessages,
  markRead,
  markGlobalAnnouncementsRead,
  openCivilianConversation,
  sendAdminMessage,
  sendGlobalAnnouncement,
  sendCivilianMessage,
  sendCivilianVoiceMessage,
  sendRescuerMessage,
  sendRescuerVoiceMessage,
  updateDepartmentChat
};
