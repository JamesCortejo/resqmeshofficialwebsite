const {
  createNotification,
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications
} = require('../repositories/notificationRepository');

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

async function getNotifications() {
  const notifications = await listNotifications();
  return notifications.map(normalizeNotification);
}

async function getUnreadNotificationCount() {
  const row = await countUnreadNotifications();
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
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications
};
