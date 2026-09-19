const { get, run } = require('../database/postgres');


function getOfflineAssignmentAction(actionId) {
  return get(`
    SELECT
      action_id AS "actionId",
      result,
      reason
    FROM device_offline_assignment_actions
    WHERE action_id = ?
    LIMIT 1
  `, [actionId]);
}


function createOfflineAssignmentAction(entry) {
  return run(`
    INSERT INTO device_offline_assignment_actions (
      action_id,
      sync_device_id,
      source_node_id,
      deployment_id,
      origin_node_id,
      origin_distress_id,
      rescuer_code,
      occurred_at,
      result,
      reason,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (action_id) DO NOTHING
  `, [
    entry.actionId,
    entry.syncDeviceId,
    entry.sourceNodeId,
    entry.deploymentId,
    entry.originNodeId,
    entry.originDistressId,
    entry.rescuerCode,
    entry.occurredAt,
    entry.result,
    entry.reason || null
  ]);
}


module.exports = {
  createOfflineAssignmentAction,
  getOfflineAssignmentAction
};
