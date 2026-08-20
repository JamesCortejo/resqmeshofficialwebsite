const MAX_MESSAGE_LENGTH = 1000;
const MAX_ICON_SIZE_BYTES = 1024 * 1024;
const MAX_ONLINE_VOICE_SECONDS = 40;
const MAX_ONLINE_VOICE_SIZE_BYTES = 2 * 1024 * 1024;
const STATUS_VALUES = new Set(['active', 'inactive', 'archived']);
const COLOR_VALUES = new Set(['red', 'blue', 'amber', 'orange', 'slate']);
const RESCUER_AGENCY_VALUES = new Set(['cdrrmo', 'fire-department', 'police-department']);
const ONLINE_VOICE_MIME_TYPES = new Set(['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac']);
const SYSTEM_GLOBAL_DEPARTMENT = Object.freeze({
  slug: 'global-announcements',
  name: 'Global Announcements',
  subtitle: 'Admin-only broadcast lane',
  status: 'active',
  colorTag: 'slate',
  rescuerAgency: null,
  sortOrder: 0,
  readOnly: 1
});

module.exports = {
  COLOR_VALUES,
  MAX_ICON_SIZE_BYTES,
  MAX_MESSAGE_LENGTH,
  MAX_ONLINE_VOICE_SECONDS,
  MAX_ONLINE_VOICE_SIZE_BYTES,
  ONLINE_VOICE_MIME_TYPES,
  RESCUER_AGENCY_VALUES,
  STATUS_VALUES,
  SYSTEM_GLOBAL_DEPARTMENT
};
