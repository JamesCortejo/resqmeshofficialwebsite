const { get, run } = require('../database/postgres');

function findAdminNotificationPreferences(adminUserId) {
  return get(`
    SELECT
      admin_user_id AS "adminUserId",
      communication_heads_up AS "communicationHeadsUp",
      accounts_heads_up AS "accountsHeadsUp",
      responders_heads_up AS "respondersHeadsUp",
      teams_heads_up AS "teamsHeadsUp",
      deployments_heads_up AS "deploymentsHeadsUp",
      system_heads_up AS "systemHeadsUp",
      sound_enabled AS "soundEnabled",
      sound_volume AS "soundVolume",
      updated_at AS "updatedAt"
    FROM admin_notification_preferences
    WHERE admin_user_id = ?
  `, [adminUserId]);
}

async function upsertAdminNotificationPreferences(adminUserId, preferences) {
  await run(`
    INSERT INTO admin_notification_preferences (
      admin_user_id,
      communication_heads_up,
      accounts_heads_up,
      responders_heads_up,
      teams_heads_up,
      deployments_heads_up,
      system_heads_up,
      sound_enabled,
      sound_volume
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (admin_user_id) DO UPDATE SET
      communication_heads_up = EXCLUDED.communication_heads_up,
      accounts_heads_up = EXCLUDED.accounts_heads_up,
      responders_heads_up = EXCLUDED.responders_heads_up,
      teams_heads_up = EXCLUDED.teams_heads_up,
      deployments_heads_up = EXCLUDED.deployments_heads_up,
      system_heads_up = EXCLUDED.system_heads_up,
      sound_enabled = EXCLUDED.sound_enabled,
      sound_volume = EXCLUDED.sound_volume,
      updated_at = CURRENT_TIMESTAMP
  `, [
    adminUserId,
    preferences.communicationHeadsUp,
    preferences.accountsHeadsUp,
    preferences.respondersHeadsUp,
    preferences.teamsHeadsUp,
    preferences.deploymentsHeadsUp,
    preferences.systemHeadsUp,
    preferences.soundEnabled,
    preferences.soundVolume
  ]);

  return findAdminNotificationPreferences(adminUserId);
}

module.exports = {
  findAdminNotificationPreferences,
  upsertAdminNotificationPreferences
};
