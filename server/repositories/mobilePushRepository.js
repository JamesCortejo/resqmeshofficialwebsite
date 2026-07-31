const { run, all } = require('../database/postgres');

function upsertMobilePushRegistration(registration) {
  return run(`
    INSERT INTO mobile_push_registrations (
      actor_type,
      actor_id,
      push_token,
      platform,
      app_version,
      app_build,
      enabled,
      last_seen_at,
      disabled_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (actor_type, actor_id, push_token) DO UPDATE SET
      platform = excluded.platform,
      app_version = excluded.app_version,
      app_build = excluded.app_build,
      enabled = TRUE,
      last_seen_at = excluded.last_seen_at,
      disabled_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `, [
    registration.actorType,
    registration.actorId,
    registration.pushToken,
    registration.platform,
    registration.appVersion || null,
    registration.appBuild || null,
    registration.lastSeenAt,
  ]);
}

function disableMobilePushRegistrationsForActor(actorType, actorId) {
  return run(`
    UPDATE mobile_push_registrations
    SET enabled = FALSE,
        disabled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE actor_type = ?
      AND actor_id = ?
      AND enabled = TRUE
  `, [actorType, actorId]);
}

function disableMobilePushRegistrationByToken(actorType, actorId, pushToken) {
  return run(`
    UPDATE mobile_push_registrations
    SET enabled = FALSE,
        disabled_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE actor_type = ?
      AND actor_id = ?
      AND push_token = ?
      AND enabled = TRUE
  `, [actorType, actorId, pushToken]);
}

function listCivilianPushRegistrationsByIds(civilianIds = []) {
  if (!Array.isArray(civilianIds) || civilianIds.length === 0) {
    return Promise.resolve([]);
  }

  return all(`
    SELECT
      r.id,
      r.actor_type AS "actorType",
      r.actor_id AS "actorId",
      r.push_token AS "pushToken",
      r.platform,
      r.app_version AS "appVersion",
      r.app_build AS "appBuild",
      r.enabled,
      r.last_seen_at AS "lastSeenAt"
    FROM mobile_push_registrations r
    INNER JOIN users u ON u.id = r.actor_id
    WHERE r.actor_type = 'civilian'
      AND r.enabled = TRUE
      AND u.status = 'approved'
      AND r.actor_id = ANY(?)
    ORDER BY r.updated_at DESC
  `, [civilianIds]);
}

function listRescuerPushRegistrationsByIds(rescuerIds = []) {
  if (!Array.isArray(rescuerIds) || rescuerIds.length === 0) {
    return Promise.resolve([]);
  }

  return all(`
    SELECT
      r.id,
      r.actor_type AS "actorType",
      r.actor_id AS "actorId",
      r.push_token AS "pushToken",
      r.platform,
      r.app_version AS "appVersion",
      r.app_build AS "appBuild",
      r.enabled,
      r.last_seen_at AS "lastSeenAt"
    FROM mobile_push_registrations r
    INNER JOIN rescuers s ON s.id = r.actor_id
    WHERE r.actor_type = 'rescuer'
      AND r.enabled = TRUE
      AND s.access_status = 'active'
      AND r.actor_id = ANY(?)
    ORDER BY r.updated_at DESC
  `, [rescuerIds]);
}

function listRescuerPushRegistrationsByAgency(agency) {
  return all(`
    SELECT
      r.id,
      r.actor_type AS "actorType",
      r.actor_id AS "actorId",
      r.push_token AS "pushToken",
      r.platform,
      r.app_version AS "appVersion",
      r.app_build AS "appBuild",
      r.enabled,
      r.last_seen_at AS "lastSeenAt"
    FROM mobile_push_registrations r
    INNER JOIN rescuers s ON s.id = r.actor_id
    WHERE r.actor_type = 'rescuer'
      AND r.enabled = TRUE
      AND s.access_status = 'active'
      AND s.agency = ?
    ORDER BY r.updated_at DESC
  `, [agency]);
}

function listAllActiveMobilePushRegistrations() {
  return all(`
    SELECT
      r.id,
      r.actor_type AS "actorType",
      r.actor_id AS "actorId",
      r.push_token AS "pushToken",
      r.platform,
      r.app_version AS "appVersion",
      r.app_build AS "appBuild",
      r.enabled,
      r.last_seen_at AS "lastSeenAt"
    FROM mobile_push_registrations r
    LEFT JOIN users u
      ON u.id = r.actor_id
     AND r.actor_type = 'civilian'
    LEFT JOIN rescuers s
      ON s.id = r.actor_id
     AND r.actor_type = 'rescuer'
    WHERE r.enabled = TRUE
      AND (
        (r.actor_type = 'civilian' AND u.status = 'approved')
        OR (r.actor_type = 'rescuer' AND s.access_status = 'active')
      )
    ORDER BY r.updated_at DESC
  `);
}

module.exports = {
  upsertMobilePushRegistration,
  disableMobilePushRegistrationsForActor,
  disableMobilePushRegistrationByToken,
  listCivilianPushRegistrationsByIds,
  listRescuerPushRegistrationsByIds,
  listRescuerPushRegistrationsByAgency,
  listAllActiveMobilePushRegistrations,
};
