const {
  getAdminNotificationPreferences,
  saveAdminNotificationPreferences
} = require('../services/adminNotificationPreferencesService');

const OPTIONAL_CATEGORIES = Object.freeze([
  'communication',
  'accounts',
  'responders',
  'teams',
  'deployments',
  'system'
]);

function validatePayload(body) {
  const headsUp = body?.headsUp;
  const sound = body?.sound;

  if (!headsUp || typeof headsUp !== 'object' || Array.isArray(headsUp)) {
    return 'Heads-up alert settings are required.';
  }

  if (Object.prototype.hasOwnProperty.call(headsUp, 'emergency') && headsUp.emergency !== true) {
    return 'Emergency heads-up alerts are required and cannot be disabled.';
  }

  for (const category of OPTIONAL_CATEGORIES) {
    if (typeof headsUp[category] !== 'boolean') {
      return `${category} heads-up preference must be true or false.`;
    }
  }

  if (!sound || typeof sound !== 'object' || Array.isArray(sound)) {
    return 'Sound settings are required.';
  }

  if (typeof sound.enabled !== 'boolean') {
    return 'Sound enabled preference must be true or false.';
  }

  if (!Number.isInteger(sound.volume) || sound.volume < 0 || sound.volume > 100) {
    return 'Sound volume must be a whole number from 0 to 100.';
  }

  return null;
}

exports.getNotificationSettings = async (req, res) => {
  try {
    const preferences = await getAdminNotificationPreferences(req.adminUser.id);
    return res.json({ success: true, data: preferences });
  } catch (error) {
    console.error('Unable to load admin notification settings.', error);
    return res.status(500).json({ success: false, message: 'Unable to load notification settings.' });
  }
};

exports.updateNotificationSettings = async (req, res) => {
  const validationMessage = validatePayload(req.body);

  if (validationMessage) {
    return res.status(400).json({ success: false, message: validationMessage });
  }

  try {
    const preferences = await saveAdminNotificationPreferences(req.adminUser.id, req.body);
    return res.json({
      success: true,
      message: 'Notification settings saved.',
      data: preferences
    });
  } catch (error) {
    console.error('Unable to save admin notification settings.', error);
    return res.status(500).json({ success: false, message: 'Unable to save notification settings.' });
  }
};
