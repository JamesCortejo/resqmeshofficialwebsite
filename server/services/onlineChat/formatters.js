const { decryptText } = require('../encryptionService');
const { calculateAge, fullName, resolveRescuerAgency } = require('./utils');

function safeDecrypt(value) {
  try {
    return decryptText(value);
  } catch (error) {
    return '';
  }
}

function formatCivilian(row) {
  const firstName = safeDecrypt(row.firstNameEnc);
  const middleName = safeDecrypt(row.middleNameEnc);
  const lastName = safeDecrypt(row.lastNameEnc);
  const birthDate = safeDecrypt(row.birthDateEnc);

  return {
    id: row.civilianUserId || row.id,
    code: row.userCode,
    firstName,
    middleName: middleName || null,
    lastName,
    fullName: [firstName, middleName, lastName].filter(Boolean).join(' ') || row.userCode || 'Civilian',
    phone: safeDecrypt(row.phoneEnc),
    email: safeDecrypt(row.emailEnc),
    occupation: safeDecrypt(row.occupationEnc),
    bloodType: safeDecrypt(row.bloodTypeEnc),
    allergies: safeDecrypt(row.allergiesEnc),
    medicalComplications: safeDecrypt(row.medicalComplicationsEnc),
    birthDate: birthDate || null,
    age: calculateAge(birthDate)
  };
}

function formatDepartment(row, unreadCount = 0) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle || '',
    status: row.status,
    colorTag: row.colorTag,
    rescuerAgency: resolveRescuerAgency(row.rescuerAgency, row.slug, row.name),
    iconUrl: row.iconUrl || null,
    sortOrder: row.sortOrder,
    readOnly: Number(row.readOnly) === 1,
    unreadCount: Number(unreadCount || 0),
    archivedAt: row.archivedAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function formatMessage(row) {
  const senderType = row.senderType;
  const messageType = row.messageType || 'text';
  const civilianSenderName = fullName(
    safeDecrypt(row.civilianSenderFirstNameEnc),
    safeDecrypt(row.civilianSenderMiddleNameEnc),
    safeDecrypt(row.civilianSenderLastNameEnc)
  );
  const rescuerSenderName = fullName(
    safeDecrypt(row.rescuerSenderFirstNameEnc),
    safeDecrypt(row.rescuerSenderMiddleNameEnc),
    safeDecrypt(row.rescuerSenderLastNameEnc)
  );
  const senderDisplayName = senderType === 'civilian'
    ? civilianSenderName || 'Civilian'
    : senderType === 'admin'
      ? 'Admin'
      : senderType === 'rescuer'
        ? rescuerSenderName || 'Rescuer'
        : 'System';
  const senderRoleLabel = senderType === 'civilian'
    ? 'Civilian'
    : senderType === 'admin'
      ? 'Admin'
      : senderType === 'rescuer'
        ? 'Rescuer'
        : 'System';

  return {
    id: row.id,
    conversationId: row.conversationId || 0,
    departmentId: row.departmentId,
    civilianUserId: row.civilianUserId || 0,
    senderType,
    senderId: row.senderId,
    senderDisplayName,
    senderRoleLabel,
    messageType,
    body: row.body || (messageType === 'voice' ? 'Voice message' : ''),
    voiceClip: row.voiceClipId
      ? {
          id: row.voiceClipId,
          durationSeconds: Number(row.voiceDurationSeconds || 0),
          sizeBytes: Number(row.voiceSizeBytes || 0),
          mimeType: row.voiceMimeType || null,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function formatConversation(row) {
  return {
    id: row.id,
    departmentId: row.departmentId,
    civilianUserId: row.civilianUserId,
    status: row.status,
    lastMessageId: row.lastMessageId || null,
    lastMessageAt: row.lastMessageAt || null,
    lastMessage: row.lastMessageBody
      ? {
          body: row.lastMessageBody,
          senderType: row.lastMessageSenderType,
          createdAt: row.lastMessageAt || row.updatedAt
        }
      : null,
    unreadCount: Number(row.unreadCount || 0),
    hasActiveOnlineDistress: Number(row.hasActiveOnlineDistress || 0) === 1,
    activeOnlineDistress: Number(row.hasActiveOnlineDistress || 0) === 1
      ? {
          id: row.activeOnlineDistressId || null,
          code: row.distressCode || null,
          reason: row.distressReason || null,
          recordedAt: row.distressRecordedAt || null
        }
      : null,
    civilian: formatCivilian(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function formatDepartmentFromConversation(conversation) {
  return formatDepartment({
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
}

module.exports = {
  formatCivilian,
  formatConversation,
  formatDepartment,
  formatDepartmentFromConversation,
  formatMessage,
  safeDecrypt
};
