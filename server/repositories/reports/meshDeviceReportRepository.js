const { all } = require('../../database/postgres');

function meshDeviceScopeWhereClause(nodeScope) {
  if (nodeScope === 'active') {
    return `WHERE db."deviceStatus" = 'active' AND db."isOnlineRecent" = TRUE`;
  }

  if (nodeScope === 'offline') {
    return `WHERE db."deviceStatus" = 'active' AND db."isOfflineStale" = TRUE`;
  }

  return '';
}

function buildMeshDeviceBaseSql() {
  return `
    WITH device_base AS (
      SELECT
        sd.id AS "deviceId",
        sd.node_id AS "nodeId",
        sd.node_name AS "nodeName",
        sd.status AS "deviceStatus",
        sd.allowed_ip AS "allowedIp",
        sd.last_seen_at AS "deviceLastSeenAt",
        sd.last_sync_at AS "lastSyncAt",
        sd.created_at AS "createdAt",
        sd.updated_at AS "updatedAt",
        mn.status AS "nodeStatus",
        mn.last_seen_at AS "nodeLastSeenAt",
        mn.users_connected AS "usersConnected",
        lh.battery_voltage AS "batteryVoltage",
        lh.signal_strength AS "signalStrength",
        lh.gps_status AS "gpsStatus",
        lh.cpu_temp AS "cpuTemp",
        lh.storage_remaining AS "storageRemaining",
        lh.ram_usage AS "ramUsage",
        lh.recorded_at AS "latestHealthRecordedAt",
        COALESCE(hr."healthLogRangeCount", 0)::int AS "healthLogRangeCount",
        COALESCE(cq."pendingCommandCount", 0)::int AS "pendingCommandCount",
        COALESCE(cq."processedCommandCount", 0)::int AS "processedCommandCount",
        COALESCE(cq."cancelledCommandCount", 0)::int AS "cancelledCommandCount",
        COALESCE(cq."commandRangeCount", 0)::int AS "commandRangeCount",
        COALESCE(cq."stalePendingCommandCount", 0)::int AS "stalePendingCommandCount",
        cq."oldestPendingAt",
        cq."latestCommandActivityAt",
        activity."latestObservedAt",
        COALESCE(activity."latestObservedAt", sd.created_at) AS "latestActivityAt",
        (activity."latestObservedAt" IS NOT NULL AND activity."latestObservedAt" >= NOW() - INTERVAL '1 day') AS "isOnlineRecent",
        (sd.status = 'active' AND (activity."latestObservedAt" IS NULL OR activity."latestObservedAt" < NOW() - INTERVAL '1 day')) AS "isOfflineStale",
        (sd.status = 'active' AND (sd.last_sync_at IS NULL OR sd.last_sync_at < NOW() - INTERVAL '1 day')) AS "isSyncStale",
        (sd.status = 'active' AND (COALESCE(sd.last_seen_at, mn.last_seen_at) IS NULL OR COALESCE(sd.last_seen_at, mn.last_seen_at) < NOW() - INTERVAL '1 day')) AS "isHeartbeatMissing",
        (sd.status = 'active' AND (lh.recorded_at IS NULL OR lh.recorded_at < NOW() - INTERVAL '1 day')) AS "isHealthMissing"
      FROM sync_devices sd
      LEFT JOIN mesh_nodes mn ON mn.node_id = sd.node_id
      LEFT JOIN LATERAL (
        SELECT
          h.battery_voltage,
          h.signal_strength,
          h.gps_status,
          h.cpu_temp,
          h.storage_remaining,
          h.ram_usage,
          h.recorded_at
        FROM mesh_node_health_logs h
        WHERE h.node_id = sd.node_id
        ORDER BY h.recorded_at DESC, h.id DESC
        LIMIT 1
      ) lh ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE h.recorded_at >= ? AND h.recorded_at < ?) AS "healthLogRangeCount"
        FROM mesh_node_health_logs h
        WHERE h.node_id = sd.node_id
      ) hr ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE mc.status = 'pending') AS "pendingCommandCount",
          COUNT(*) FILTER (WHERE mc.status = 'processed') AS "processedCommandCount",
          COUNT(*) FILTER (WHERE mc.status = 'cancelled') AS "cancelledCommandCount",
          COUNT(*) FILTER (WHERE mc.created_at >= ? AND mc.created_at < ?) AS "commandRangeCount",
          COUNT(*) FILTER (WHERE mc.status = 'pending' AND mc.created_at < NOW() - INTERVAL '30 minutes') AS "stalePendingCommandCount",
          MIN(mc.created_at) FILTER (WHERE mc.status = 'pending') AS "oldestPendingAt",
          MAX(COALESCE(mc.processed_at, mc.updated_at, mc.created_at)) AS "latestCommandActivityAt"
        FROM mesh_commands mc
        WHERE mc.target_node_id = sd.node_id
      ) cq ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          MAX(ts) AS "latestObservedAt"
        FROM (
          VALUES
            (sd.last_sync_at),
            (sd.last_seen_at),
            (mn.last_seen_at),
            (lh.recorded_at)
        ) observed(ts)
      ) activity ON TRUE
    )
  `;
}

async function listMeshDeviceSyncHealthRows({ nodeScope, rangeStartIso, rangeEndIso }) {
  const scopeSql = meshDeviceScopeWhereClause(nodeScope);
  return all(`
    ${buildMeshDeviceBaseSql()}
    SELECT *
    FROM device_base db
    ${scopeSql}
    ORDER BY db."latestActivityAt" DESC, db."deviceId" DESC
  `, [
    rangeStartIso,
    rangeEndIso,
    rangeStartIso,
    rangeEndIso
  ]);
}

async function listMeshCommandTypeRows({ nodeScope, rangeStartIso, rangeEndIso }) {
  const scopeSql = meshDeviceScopeWhereClause(nodeScope);
  return all(`
    ${buildMeshDeviceBaseSql()},
    filtered_devices AS (
      SELECT db."nodeId"
      FROM device_base db
      ${scopeSql}
    )
    SELECT
      COALESCE(NULLIF(mc.command_type, ''), 'unknown') AS "commandType",
      COUNT(*)::int AS "totalCount",
      COUNT(*) FILTER (WHERE mc.status = 'pending')::int AS "pendingCount",
      COUNT(*) FILTER (WHERE mc.status = 'processed')::int AS "processedCount",
      COUNT(*) FILTER (WHERE mc.status = 'cancelled')::int AS "cancelledCount"
    FROM mesh_commands mc
    INNER JOIN filtered_devices fd ON fd."nodeId" = mc.target_node_id
    WHERE mc.created_at >= ?
      AND mc.created_at < ?
    GROUP BY COALESCE(NULLIF(mc.command_type, ''), 'unknown')
    ORDER BY "totalCount" DESC, "commandType" ASC
  `, [
    rangeStartIso,
    rangeEndIso,
    rangeStartIso,
    rangeEndIso,
    rangeStartIso,
    rangeEndIso
  ]);
}

module.exports = {
  listMeshDeviceSyncHealthRows,
  listMeshCommandTypeRows
};
