const config = require('../config/env');

async function ensureSequenceTables(db) {
  await db.exec(`
    INSERT INTO code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO rescuer_code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO rescue_team_code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO deployment_code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO online_distress_code_sequence (id, last_value) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function cleanupLegacySeededOnlineChatDepartments(db) {
  const defaults = [
    'global-announcements',
    'cdrrmo',
    'police-station',
    'fire-department',
    'admin-support'
  ];

  const [departmentRows, conversationCountRow, messageCountRow] = await Promise.all([
    db.all(`
      SELECT id, slug
      FROM online_chat_departments
      ORDER BY id ASC
    `),
    db.get('SELECT COUNT(*) AS count FROM online_chat_conversations'),
    db.get('SELECT COUNT(*) AS count FROM online_chat_messages')
  ]);

  const conversationCount = Number(conversationCountRow?.count || 0);
  const messageCount = Number(messageCountRow?.count || 0);

  if (conversationCount > 0 || messageCount > 0) {
    return;
  }

  if (!departmentRows.length || departmentRows.length > defaults.length) {
    return;
  }

  const slugs = departmentRows.map((row) => row.slug);
  const onlyLegacyDefaults = slugs.every((slug) => defaults.includes(slug));

  if (!onlyLegacyDefaults) {
    return;
  }

  await db.run(`
    DELETE FROM online_chat_departments
    WHERE slug IN (?, ?, ?, ?, ?)
  `, defaults);
}

async function ensureBootstrapSyncDevice(db, hashApiKey) {
  const device = config.deviceSync.bootstrapDevice;

  if (!device.nodeId || !device.nodeName || !device.apiKey) {
    return;
  }

  await db.run(`
    INSERT INTO sync_devices (
      node_id,
      node_name,
      status,
      api_key_hash,
      allowed_ip,
      created_at,
      updated_at
    ) VALUES (?, ?, 'active', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(node_id) DO UPDATE SET
      node_name = excluded.node_name,
      allowed_ip = excluded.allowed_ip,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `, [
    device.nodeId,
    device.nodeName,
    hashApiKey(device.apiKey),
    device.allowedIp
  ]);
}

async function reconcileDeploymentOperationalStatuses(db) {
  await db.exec(`
    UPDATE rescue_teams
    SET status = 'dispatched',
        updated_at = CURRENT_TIMESTAMP
    WHERE EXISTS (
      SELECT 1
      FROM distress_deployments d
      WHERE d.team_id = rescue_teams.id
        AND d.status = 'deployed'
    )
      AND status <> 'dispatched';

    UPDATE rescue_teams
    SET status = 'active',
        updated_at = CURRENT_TIMESTAMP
    WHERE status = 'dispatched'
      AND NOT EXISTS (
        SELECT 1
        FROM distress_deployments d
        WHERE d.team_id = rescue_teams.id
          AND d.status = 'deployed'
      );

    UPDATE rescuers
    SET status = 'dispatched',
        updated_at = CURRENT_TIMESTAMP
    WHERE access_status = 'active'
      AND status <> 'dispatched'
      AND EXISTS (
        SELECT 1
        FROM distress_deployment_members dm
        INNER JOIN distress_deployments d ON d.id = dm.deployment_id
        WHERE dm.rescuer_id = rescuers.id
          AND d.status = 'deployed'
      );

    UPDATE rescuers
    SET status = 'available',
        updated_at = CURRENT_TIMESTAMP
    WHERE access_status = 'active'
      AND status = 'dispatched'
      AND NOT EXISTS (
        SELECT 1
        FROM distress_deployment_members dm
        INNER JOIN distress_deployments d ON d.id = dm.deployment_id
        WHERE dm.rescuer_id = rescuers.id
          AND d.status = 'deployed'
      );
  `);
}

module.exports = {
  ensureSequenceTables,
  cleanupLegacySeededOnlineChatDepartments,
  ensureBootstrapSyncDevice,
  reconcileDeploymentOperationalStatuses
};
