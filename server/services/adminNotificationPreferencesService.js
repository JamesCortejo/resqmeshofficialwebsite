const {
  findAdminNotificationPreferences,
  upsertAdminNotificationPreferences
} = require('../repositories/adminNotificationPreferencesRepository');

const DEFAULT_ADMIN_NOTIFICATION_PREFERENCES = Object.freeze({
  communicationHeadsUp: true,
  accountsHeadsUp: true,
  respondersHeadsUp: true,
  teamsHeadsUp: true,
  deploymentsHeadsUp: true,
  systemHeadsUp: true,
  soundEnabled: false,
  soundVolume: 60
});

function toResponse(preferences) {
  const values = preferences || DEFAULT_ADMIN_NOTIFICATION_PREFERENCES;

  return {
    headsUp: {
      emergency: true,
      communication: values.communicationHeadsUp,
      accounts: values.accountsHeadsUp,
      responders: values.respondersHeadsUp,
      teams: values.teamsHeadsUp,
      deployments: values.deploymentsHeadsUp,
      system: values.systemHeadsUp
    },
    sound: {
      enabled: values.soundEnabled,
      volume: values.soundVolume
    },
    updatedAt: preferences?.updatedAt || null
  };
}

async function getAdminNotificationPreferences(adminUserId) {
  const preferences = await findAdminNotificationPreferences(adminUserId);
  return toResponse(preferences);
}

async function saveAdminNotificationPreferences(adminUserId, input) {
  const saved = await upsertAdminNotificationPreferences(adminUserId, {
    communicationHeadsUp: input.headsUp.communication,
    accountsHeadsUp: input.headsUp.accounts,
    respondersHeadsUp: input.headsUp.responders,
    teamsHeadsUp: input.headsUp.teams,
    deploymentsHeadsUp: input.headsUp.deployments,
    systemHeadsUp: input.headsUp.system,
    soundEnabled: input.sound.enabled,
    soundVolume: input.sound.volume
  });

  return toResponse(saved);
}

module.exports = {
  DEFAULT_ADMIN_NOTIFICATION_PREFERENCES,
  getAdminNotificationPreferences,
  saveAdminNotificationPreferences
};
