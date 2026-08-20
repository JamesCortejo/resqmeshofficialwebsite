const { run, get } = require('../../database/postgres');

function getSenderGuard(civilianUserId) {
  return get(`
    SELECT
      civilian_user_id AS civilianUserId,
      window_started_at AS windowStartedAt,
      message_count AS messageCount,
      strike_count AS strikeCount,
      timeout_until AS timeoutUntil,
      last_message_at AS lastMessageAt,
      last_message_body_hash AS lastMessageBodyHash,
      last_violation_at AS lastViolationAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM online_chat_sender_guards
    WHERE civilian_user_id = ?
    LIMIT 1
  `, [civilianUserId]);
}

function getRescuerSenderGuard(rescuerId) {
  return get(`
    SELECT
      rescuer_id AS rescuerId,
      window_started_at AS windowStartedAt,
      message_count AS messageCount,
      strike_count AS strikeCount,
      timeout_until AS timeoutUntil,
      last_message_at AS lastMessageAt,
      last_message_body_hash AS lastMessageBodyHash,
      last_violation_at AS lastViolationAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM online_chat_rescuer_sender_guards
    WHERE rescuer_id = ?
    LIMIT 1
  `, [rescuerId]);
}

function upsertSenderGuard(guard) {
  return run(`
    INSERT INTO online_chat_sender_guards (
      civilian_user_id,
      window_started_at,
      message_count,
      strike_count,
      timeout_until,
      last_message_at,
      last_message_body_hash,
      last_violation_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(civilian_user_id) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      message_count = excluded.message_count,
      strike_count = excluded.strike_count,
      timeout_until = excluded.timeout_until,
      last_message_at = excluded.last_message_at,
      last_message_body_hash = excluded.last_message_body_hash,
      last_violation_at = excluded.last_violation_at,
      updated_at = CURRENT_TIMESTAMP
  `, [
    guard.civilianUserId,
    guard.windowStartedAt || null,
    guard.messageCount || 0,
    guard.strikeCount || 0,
    guard.timeoutUntil || null,
    guard.lastMessageAt || null,
    guard.lastMessageBodyHash || null,
    guard.lastViolationAt || null,
  ]);
}

function upsertRescuerSenderGuard(guard) {
  return run(`
    INSERT INTO online_chat_rescuer_sender_guards (
      rescuer_id,
      window_started_at,
      message_count,
      strike_count,
      timeout_until,
      last_message_at,
      last_message_body_hash,
      last_violation_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(rescuer_id) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      message_count = excluded.message_count,
      strike_count = excluded.strike_count,
      timeout_until = excluded.timeout_until,
      last_message_at = excluded.last_message_at,
      last_message_body_hash = excluded.last_message_body_hash,
      last_violation_at = excluded.last_violation_at,
      updated_at = CURRENT_TIMESTAMP
  `, [
    guard.rescuerId,
    guard.windowStartedAt || null,
    guard.messageCount || 0,
    guard.strikeCount || 0,
    guard.timeoutUntil || null,
    guard.lastMessageAt || null,
    guard.lastMessageBodyHash || null,
    guard.lastViolationAt || null,
  ]);
}

function insertModerationEvent(event) {
  return run(`
    INSERT INTO online_chat_moderation_events (
      civilian_user_id,
      rescuer_id,
      department_id,
      conversation_id,
      event_type,
      reason,
      body_preview,
      metadata_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [
    event.civilianUserId,
    event.rescuerId || null,
    event.departmentId || null,
    event.conversationId || null,
    event.eventType,
    event.reason,
    event.bodyPreview || null,
    event.metadataJson || null,
  ]);
}

module.exports = {
  getRescuerSenderGuard,
  getSenderGuard,
  insertModerationEvent,
  upsertRescuerSenderGuard,
  upsertSenderGuard
};
