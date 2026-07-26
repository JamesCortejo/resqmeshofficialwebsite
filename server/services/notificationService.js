const {
  createNotification,
  listNotifications,
  countUnreadNotifications,
  countUnreadNotificationsByType,
  markNotificationRead,
  markAllNotificationsRead,
  markNotificationsReadByEntity,
  deleteNotification,
  clearNotifications
} = require('../repositories/notificationRepository');

const ONLINE_CHAT_MESSAGE_NOTIFICATION_TYPE = 'online-chat.message.received';
const ONLINE_CHAT_CONVERSATION_ENTITY = 'online-chat-conversation';

function normalizeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    relatedEntityCode: row.relatedEntityCode,
    metadata: row.metadataJson ? JSON.parse(row.metadataJson) : null,
    readAt: row.readAt,
    hiddenAt: row.hiddenAt,
    createdAt: row.createdAt,
    isRead: Boolean(row.readAt)
  };
}

async function safeCreateNotification(notification) {
  try {
    await createNotification(notification);
  } catch (error) {
    console.error('Notification creation failed:', error);
  }
}

function notifyPendingRegistrationCreated(user) {
  return safeCreateNotification({
    type: 'registration.pending',
    title: 'New pending registration',
    message: `Registration ${user.userCode} is waiting for admin review.`,
    relatedEntityType: 'user',
    relatedEntityId: user.id,
    relatedEntityCode: user.userCode,
    metadata: { status: user.status }
  });
}

function notifyRegistrationReviewed(user, status) {
  const approved = status === 'approved';

  return safeCreateNotification({
    type: approved ? 'registration.approved' : 'registration.declined',
    title: approved ? 'Registration approved' : 'Registration declined',
    message: `Registration ${user.userCode} was ${status}.`,
    relatedEntityType: 'user',
    relatedEntityId: user.id,
    relatedEntityCode: user.userCode,
    metadata: { status }
  });
}

function notifyAccountSuspended(user) {
  return safeCreateNotification({
    type: 'account.suspended',
    title: 'Account suspended',
    message: `Account ${user.userCode} was suspended.`,
    relatedEntityType: 'user',
    relatedEntityId: user.id,
    relatedEntityCode: user.userCode,
    metadata: { status: 'suspended' }
  });
}

function notifyAccountActivated(user) {
  return safeCreateNotification({
    type: 'account.activated',
    title: 'Account activated',
    message: `Account ${user.userCode} was activated.`,
    relatedEntityType: 'user',
    relatedEntityId: user.id,
    relatedEntityCode: user.userCode,
    metadata: { status: 'approved' }
  });
}

function notifyRescuerCreated(rescuer) {
  return safeCreateNotification({
    type: 'rescuer.created',
    title: 'Rescuer created',
    message: `Rescuer ${rescuer.rescuerCode} was added to the roster.`,
    relatedEntityType: 'rescuer',
    relatedEntityId: rescuer.id,
    relatedEntityCode: rescuer.rescuerCode,
    metadata: {
      status: rescuer.status,
      accessStatus: rescuer.accessStatus
    }
  });
}

function notifyRescuerAccessChanged(rescuer, accessStatus) {
  const archived = accessStatus === 'archived';

  return safeCreateNotification({
    type: archived ? 'rescuer.archived' : 'rescuer.activated',
    title: archived ? 'Rescuer archived' : 'Rescuer activated',
    message: `Rescuer ${rescuer.rescuerCode} was ${archived ? 'archived' : 'activated'}.`,
    relatedEntityType: 'rescuer',
    relatedEntityId: rescuer.id,
    relatedEntityCode: rescuer.rescuerCode,
    metadata: {
      accessStatus,
      status: rescuer.status
    }
  });
}

function notifyRescuerStatusChanged(rescuer) {
  return safeCreateNotification({
    type: 'rescuer.status.changed',
    title: 'Rescuer status changed',
    message: `Rescuer ${rescuer.rescuerCode} is now ${rescuer.status}.`,
    relatedEntityType: 'rescuer',
    relatedEntityId: rescuer.id,
    relatedEntityCode: rescuer.rescuerCode,
    metadata: {
      status: rescuer.status,
      accessStatus: rescuer.accessStatus
    }
  });
}

function notifyRescuerPasswordReset(rescuer) {
  return safeCreateNotification({
    type: 'rescuer.password.reset',
    title: 'Rescuer password reset',
    message: `Password for rescuer ${rescuer.rescuerCode} was reset by an administrator.`,
    relatedEntityType: 'rescuer',
    relatedEntityId: rescuer.id,
    relatedEntityCode: rescuer.rescuerCode,
    metadata: {
      accessStatus: rescuer.accessStatus,
      status: rescuer.status
    }
  });
}

function notifyRescueTeamCreated(team) {
  return safeCreateNotification({
    type: 'rescue-team.created',
    title: 'Rescue team created',
    message: `Rescue team ${team.teamCode} (${team.name}) was created with ${team.memberCount}/5 members.`,
    relatedEntityType: 'rescue-team',
    relatedEntityId: team.id,
    relatedEntityCode: team.teamCode,
    metadata: {
      agency: team.agency,
      status: team.status,
      memberCount: team.memberCount
    }
  });
}

function notifyRescueTeamUpdated(team) {
  return safeCreateNotification({
    type: 'rescue-team.updated',
    title: 'Rescue team updated',
    message: `Rescue team ${team.teamCode} (${team.name}) was updated.`,
    relatedEntityType: 'rescue-team',
    relatedEntityId: team.id,
    relatedEntityCode: team.teamCode,
    metadata: {
      agency: team.agency,
      status: team.status,
      memberCount: team.memberCount
    }
  });
}

function notifyRescueTeamRosterChanged(team, rosterChanged) {
  if (!rosterChanged) {
    return Promise.resolve();
  }

  return safeCreateNotification({
    type: 'rescue-team.roster.changed',
    title: 'Rescue team roster changed',
    message: `Roster for team ${team.teamCode} (${team.name}) now has ${team.memberCount}/5 members.`,
    relatedEntityType: 'rescue-team',
    relatedEntityId: team.id,
    relatedEntityCode: team.teamCode,
    metadata: {
      agency: team.agency,
      status: team.status,
      memberCount: team.memberCount
    }
  });
}

function notifyDeploymentCreated(deployment) {
  return safeCreateNotification({
    type: 'deployment.created',
    title: 'Rescue team deployed',
    message: `Deployment ${deployment.deploymentCode} sent team ${deployment.teamCode} (${deployment.teamName}).`,
    relatedEntityType: 'deployment',
    relatedEntityId: deployment.id,
    relatedEntityCode: deployment.deploymentCode,
    metadata: {
      status: deployment.status,
      teamId: deployment.teamId,
      teamCode: deployment.teamCode,
      teamName: deployment.teamName
    }
  });
}

function notifyDeploymentCanceled(deployment) {
  return safeCreateNotification({
    type: 'deployment.canceled',
    title: 'Deployment canceled',
    message: `Deployment ${deployment.deploymentCode} was canceled.`,
    relatedEntityType: 'deployment',
    relatedEntityId: deployment.id,
    relatedEntityCode: deployment.deploymentCode,
    metadata: {
      status: deployment.status,
      teamId: deployment.teamId,
      teamCode: deployment.teamCode,
      teamName: deployment.teamName
    }
  });
}

function notifyDeploymentAccomplished(deployment) {
  return safeCreateNotification({
    type: 'deployment.accomplished',
    title: 'Deployment accomplished',
    message: `Deployment ${deployment.deploymentCode} was marked as accomplished.`,
    relatedEntityType: 'deployment',
    relatedEntityId: deployment.id,
    relatedEntityCode: deployment.deploymentCode,
    metadata: {
      status: deployment.status,
      teamId: deployment.teamId,
      teamCode: deployment.teamCode,
      teamName: deployment.teamName
    }
  });
}

function notifyDistressSignalActive(distress) {
  return safeCreateNotification({
    type: 'distress.active',
    title: 'New emergency reported',
    message: `Emergency ${distress.distressCode} is active on mesh node ${distress.originNodeId}.`,
    relatedEntityType: 'mesh-distress-signal',
    relatedEntityId: distress.id,
    relatedEntityCode: distress.distressCode,
    metadata: {
      status: 'active',
      originNodeId: distress.originNodeId,
      originDistressId: distress.originDistressId,
      reason: distress.reason || null,
      priority: distress.priority || null
    }
  });
}

function notifyOnlineDistressSignalActive(distress) {
  return safeCreateNotification({
    type: 'distress.active',
    title: 'New online emergency reported',
    message: `Online emergency ${distress.distressCode} was activated by ${distress.user?.firstName || 'a civilian'}.`,
    relatedEntityType: 'online-distress-signal',
    relatedEntityId: distress.id,
    relatedEntityCode: distress.distressCode,
    metadata: {
      status: 'active',
      sourceType: 'online',
      reason: distress.reason || null,
      latitude: distress.latitude ?? null,
      longitude: distress.longitude ?? null,
      userCode: distress.userCode || null
    }
  });
}

function notifyDistressSignalCanceled(distress) {
  return safeCreateNotification({
    type: 'distress.canceled',
    title: 'Emergency canceled',
    message: `Emergency ${distress.distressCode} on mesh node ${distress.originNodeId} was canceled.`,
    relatedEntityType: 'mesh-distress-signal',
    relatedEntityId: distress.id,
    relatedEntityCode: distress.distressCode,
    metadata: {
      status: 'canceled',
      originNodeId: distress.originNodeId,
      originDistressId: distress.originDistressId,
      reason: distress.reason || null,
      priority: distress.priority || null
    }
  });
}

function notifyOnlineDistressSignalCanceled(distress) {
  return safeCreateNotification({
    type: 'distress.canceled',
    title: 'Online emergency canceled',
    message: `Online emergency ${distress.distressCode} was canceled.`,
    relatedEntityType: 'online-distress-signal',
    relatedEntityId: distress.id,
    relatedEntityCode: distress.distressCode,
    metadata: {
      status: 'canceled',
      sourceType: 'online',
      reason: distress.reason || null,
      latitude: distress.latitude ?? null,
      longitude: distress.longitude ?? null,
      userCode: distress.userCode || null
    }
  });
}

function notifyOnlineChatMessageReceived({
  conversationId,
  department,
  civilian,
  message
}) {
  return safeCreateNotification({
    type: ONLINE_CHAT_MESSAGE_NOTIFICATION_TYPE,
    title: `New message in ${department?.name || 'Department Chat'}`,
    message: `${civilian?.fullName || civilian?.code || 'Civilian'} sent a new message.`,
    relatedEntityType: ONLINE_CHAT_CONVERSATION_ENTITY,
    relatedEntityId: conversationId,
    relatedEntityCode: civilian?.code || null,
    metadata: {
      departmentId: department?.id || null,
      departmentName: department?.name || null,
      conversationId,
      civilianUserId: civilian?.id || null,
      civilianCode: civilian?.code || null,
      messageId: message?.id || null,
      messageScope: 'department'
    }
  });
}

function markOnlineChatConversationNotificationsRead(conversationId) {
  return markNotificationsReadByEntity(
    ONLINE_CHAT_MESSAGE_NOTIFICATION_TYPE,
    ONLINE_CHAT_CONVERSATION_ENTITY,
    conversationId
  );
}

async function getNotifications() {
  const notifications = await listNotifications();
  return notifications.map(normalizeNotification);
}

async function getUnreadNotificationCount() {
  const row = await countUnreadNotifications();
  return row ? row.count : 0;
}

async function getUnreadOnlineChatNotificationCount() {
  const row = await countUnreadNotificationsByType(ONLINE_CHAT_MESSAGE_NOTIFICATION_TYPE);
  return row ? row.count : 0;
}

module.exports = {
  notifyPendingRegistrationCreated,
  notifyRegistrationReviewed,
  notifyAccountSuspended,
  notifyAccountActivated,
  notifyRescuerCreated,
  notifyRescuerAccessChanged,
  notifyRescuerStatusChanged,
  notifyRescuerPasswordReset,
  notifyRescueTeamCreated,
  notifyRescueTeamUpdated,
  notifyRescueTeamRosterChanged,
  notifyDeploymentCreated,
  notifyDeploymentCanceled,
  notifyDeploymentAccomplished,
  notifyDistressSignalActive,
  notifyOnlineDistressSignalActive,
  notifyDistressSignalCanceled,
  notifyOnlineDistressSignalCanceled,
  notifyOnlineChatMessageReceived,
  getNotifications,
  getUnreadNotificationCount,
  getUnreadOnlineChatNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  markOnlineChatConversationNotificationsRead,
  deleteNotification,
  clearNotifications
};
