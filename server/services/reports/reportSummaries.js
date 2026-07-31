const {
  average,
  secondsBetween,
  formatReasonLabel,
  formatStatusLabel,
  formatSourceLabel,
  formatAgencyLabel,
  formatTeamStatusLabel,
  formatActionLabel,
  formatChatSenderLabel,
  formatModerationEventLabel,
  createPreviewText,
  resolveDisplayName
} = require('./reportShared');

function normalizeIncidentRows(rows) {
  return rows.map((row) => ({
    sourceType: row.sourceType,
    sourceLabel: formatSourceLabel(row.sourceType),
    distressCode: row.distressCode,
    reasonRaw: row.reason,
    reasonLabel: formatReasonLabel(row.reason),
    incidentStatus: row.incidentStatus,
    statusLabel: formatStatusLabel(row.incidentStatus),
    reportedAt: row.reportedAt,
    deployedAt: row.deployedAt || null,
    endedAt: row.endedAt || null,
    deploymentCode: row.deploymentCode || null,
    teamName: row.teamName || null,
    deploymentStatus: row.deploymentStatus || null,
    responseSeconds: secondsBetween(row.reportedAt, row.deployedAt),
    closureSeconds: secondsBetween(row.reportedAt, row.endedAt)
  }));
}

function buildIncidentSummary(rows) {
  const responseDurations = rows
    .map((row) => row.responseSeconds)
    .filter((value) => Number.isFinite(value));
  const closureDurations = rows
    .map((row) => row.closureSeconds)
    .filter((value) => Number.isFinite(value));

  const reasonCounts = new Map();
  rows.forEach((row) => {
    reasonCounts.set(row.reasonLabel, (reasonCounts.get(row.reasonLabel) || 0) + 1);
  });

  const reasonBreakdown = Array.from(reasonCounts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    })
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  return {
    totals: {
      totalIncidents: rows.length,
      deployedIncidents: rows.filter((row) => Boolean(row.deployedAt)).length,
      resolvedIncidents: rows.filter((row) => row.incidentStatus === 'accomplished' || row.incidentStatus === 'canceled').length
    },
    sources: {
      mesh: rows.filter((row) => row.sourceType === 'mesh').length,
      online: rows.filter((row) => row.sourceType === 'online').length
    },
    statuses: {
      active: rows.filter((row) => row.incidentStatus === 'active').length,
      canceled: rows.filter((row) => row.incidentStatus === 'canceled').length,
      accomplished: rows.filter((row) => row.incidentStatus === 'accomplished').length
    },
    responseTiming: {
      averageResponseSeconds: average(responseDurations),
      fastestResponseSeconds: responseDurations.length ? Math.min(...responseDurations) : null,
      slowestResponseSeconds: responseDurations.length ? Math.max(...responseDurations) : null,
      averageClosureSeconds: average(closureDurations),
      responseSampleCount: responseDurations.length,
      closureSampleCount: closureDurations.length
    },
    reasonBreakdown
  };
}

function normalizeAuditRows(rows) {
  return rows.map((row) => {
    const subjectName = row.subjectType === 'civilian'
      ? fullName(
          decryptText(row.civilianFirstNameEnc || ''),
          decryptText(row.civilianMiddleNameEnc || ''),
          decryptText(row.civilianLastNameEnc || '')
        )
      : fullName(
          decryptText(row.rescuerFirstNameEnc || ''),
          decryptText(row.rescuerMiddleNameEnc || ''),
          decryptText(row.rescuerLastNameEnc || '')
        );

    return {
      id: row.id,
      subjectType: row.subjectType,
      subjectTypeLabel: row.subjectType === 'rescuer' ? 'Rescuer' : 'Civilian',
      subjectCode: row.subjectCode || row.rescuerCode || 'Unknown',
      subjectName: subjectName || row.subjectCode || row.rescuerCode || 'Unknown',
      actionType: row.actionType,
      actionLabel: formatActionLabel(row.actionType),
      actorAdminCode: row.actorAdminCode || 'System',
      reasonText: row.reasonText || '',
      occurredAt: row.occurredAt
    };
  });
}

function normalizeRescuerAccessRoster(rows) {
  return rows.map((row) => ({
    rescuerCode: row.rescuerCode,
    fullName: fullName(
      decryptText(row.firstNameEnc || ''),
      decryptText(row.middleNameEnc || ''),
      decryptText(row.lastNameEnc || '')
    ) || row.rescuerCode,
    phone: decryptText(row.phoneEnc || ''),
    agency: formatAgencyLabel(row.agency),
    operationalStatus: formatTeamStatusLabel(row.status),
    accessStatus: formatTeamStatusLabel(row.accessStatus),
    teamName: row.teamName || 'Unassigned',
    teamCode: row.teamCode || '',
    archivedAt: row.archivedAt || null,
    createdAt: row.createdAt
  }));
}

function buildAccountsAccessAuditSummary({
  scope,
  intakeTotals,
  civilianSnapshot,
  rescuerSnapshot,
  actionTotals,
  sessionTotals,
  auditRows,
  rosterRows
}) {
  const filteredRosterRows = scope === 'civilian' ? [] : rosterRows;

  return {
    overview: {
      scope,
      civilianRegistrations: Number(intakeTotals?.civilianRegistrationCount || 0),
      rescuerProfilesCreated: Number(intakeTotals?.rescuerCreationCount || 0),
      auditEventCount: auditRows.length,
      rosterCount: filteredRosterRows.length
    },
    civilianStatus: {
      pending: Number(civilianSnapshot?.pendingCivilianCount || 0),
      approved: Number(civilianSnapshot?.approvedCivilianCount || 0),
      declined: Number(civilianSnapshot?.declinedCivilianCount || 0),
      suspended: Number(civilianSnapshot?.suspendedCivilianCount || 0)
    },
    rescuerStatus: {
      total: Number(rescuerSnapshot?.totalRescuerCount || 0),
      activeAccess: Number(rescuerSnapshot?.activeAccessCount || 0),
      archivedAccess: Number(rescuerSnapshot?.archivedAccessCount || 0),
      available: Number(rescuerSnapshot?.availableStatusCount || 0),
      dispatched: Number(rescuerSnapshot?.dispatchedStatusCount || 0),
      unavailable: Number(rescuerSnapshot?.unavailableStatusCount || 0)
    },
    adminActions: {
      approved: Number(actionTotals?.approvedCount || 0),
      declined: Number(actionTotals?.declinedCount || 0),
      suspended: Number(actionTotals?.suspendedCount || 0),
      reactivated: Number(actionTotals?.reactivatedCount || 0),
      rescuerCreated: Number(actionTotals?.rescuerCreatedCount || 0),
      rescuerArchived: Number(actionTotals?.rescuerArchivedCount || 0),
      accessStatusChanged: Number(actionTotals?.accessStatusChangedCount || 0),
      passwordChanged: Number(actionTotals?.passwordChangedCount || 0)
    },
    sessions: {
      civilianIssued: Number(sessionTotals?.civilianSessionIssuedCount || 0),
      rescuerIssued: Number(sessionTotals?.rescuerSessionIssuedCount || 0),
      civilianRevoked: Number(sessionTotals?.civilianSessionRevokedCount || 0),
      rescuerRevoked: Number(sessionTotals?.rescuerSessionRevokedCount || 0),
      liveMobileSessions: Number(sessionTotals?.liveMobileSessionCount || 0)
    },
    recentAuditRows: auditRows.slice(0, 24),
    rosterRows: filteredRosterRows.slice(0, 40)
  };
}

function normalizeMeshDeviceSyncRows(rows) {
  return rows.map((row) => {
    const latestSeenAt = row.deviceLastSeenAt || row.nodeLastSeenAt || null;
    const statusParts = [];

    if (row.isOfflineStale) {
      statusParts.push('Offline');
    } else if (row.isOnlineRecent) {
      statusParts.push('Online');
    } else {
      statusParts.push('Unknown');
    }

    if (row.deviceStatus) {
      statusParts.push(formatRescuerOrNodeStatus(row.deviceStatus));
    }

    return {
      deviceId: row.deviceId,
      nodeId: row.nodeId,
      nodeName: row.nodeName || row.nodeId,
      deviceStatus: String(row.deviceStatus || ''),
      deviceStatusLabel: formatRescuerOrNodeStatus(row.deviceStatus),
      nodeStatus: String(row.nodeStatus || ''),
      nodeStatusLabel: formatRescuerOrNodeStatus(row.nodeStatus),
      usersConnected: Number(row.usersConnected || 0),
      latestSeenAt,
      lastSyncAt: row.lastSyncAt || null,
      latestHealthRecordedAt: row.latestHealthRecordedAt || null,
      latestActivityAt: row.latestActivityAt || row.createdAt || null,
      healthLogRangeCount: Number(row.healthLogRangeCount || 0),
      pendingCommandCount: Number(row.pendingCommandCount || 0),
      processedCommandCount: Number(row.processedCommandCount || 0),
      cancelledCommandCount: Number(row.cancelledCommandCount || 0),
      commandRangeCount: Number(row.commandRangeCount || 0),
      stalePendingCommandCount: Number(row.stalePendingCommandCount || 0),
      oldestPendingAt: row.oldestPendingAt || null,
      latestCommandActivityAt: row.latestCommandActivityAt || null,
      batteryVoltage: row.batteryVoltage == null ? null : Number(row.batteryVoltage),
      signalStrength: row.signalStrength == null ? null : Number(row.signalStrength),
      gpsStatus: row.gpsStatus || '',
      cpuTemp: row.cpuTemp == null ? null : Number(row.cpuTemp),
      storageRemaining: row.storageRemaining == null ? null : Number(row.storageRemaining),
      ramUsage: row.ramUsage == null ? null : Number(row.ramUsage),
      isOnlineRecent: Boolean(row.isOnlineRecent),
      isOfflineStale: Boolean(row.isOfflineStale),
      isSyncStale: Boolean(row.isSyncStale),
      isHeartbeatMissing: Boolean(row.isHeartbeatMissing),
      isHealthMissing: Boolean(row.isHealthMissing),
      liveStateLabel: statusParts.join(' • ')
    };
  });
}

function buildMeshDeviceSyncHealthSummary(deviceRows, commandTypeRows) {
  const activeRows = deviceRows.filter((row) => row.deviceStatus === 'active');
  const revokedRows = deviceRows.filter((row) => row.deviceStatus === 'revoked');
  const onlineRows = deviceRows.filter((row) => row.isOnlineRecent);
  const offlineRows = deviceRows.filter((row) => row.isOfflineStale);
  const syncedRows = activeRows.filter((row) => !row.isSyncStale);
  const staleSyncRows = activeRows.filter((row) => row.isSyncStale);
  const neverSyncedRows = activeRows.filter((row) => !row.lastSyncAt);
  const missingHeartbeatRows = activeRows.filter((row) => row.isHeartbeatMissing);
  const missingHealthRows = activeRows.filter((row) => row.isHealthMissing);
  const stalePendingRows = deviceRows.filter((row) => row.stalePendingCommandCount > 0);

  const latestMeshSyncAt = deviceRows
    .map((row) => row.lastSyncAt)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || null;

  const queue = {
    pendingCount: deviceRows.reduce((sum, row) => sum + row.pendingCommandCount, 0),
    processedCount: deviceRows.reduce((sum, row) => sum + row.processedCommandCount, 0),
    cancelledCount: deviceRows.reduce((sum, row) => sum + row.cancelledCommandCount, 0),
    commandRangeCount: deviceRows.reduce((sum, row) => sum + row.commandRangeCount, 0),
    stalePendingCount: deviceRows.reduce((sum, row) => sum + row.stalePendingCommandCount, 0),
    oldestPendingAt: stalePendingRows
      .map((row) => row.oldestPendingAt)
      .filter(Boolean)
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] || null
  };

  const failureRows = deviceRows
    .filter((row) => row.isSyncStale || row.isHeartbeatMissing || row.isHealthMissing || row.stalePendingCommandCount > 0)
    .slice(0, 24)
    .map((row) => {
      const issues = [];
      if (row.isSyncStale) {
        issues.push('Sync stale');
      }
      if (row.isHeartbeatMissing) {
        issues.push('No recent heartbeat');
      }
      if (row.isHealthMissing) {
        issues.push('No recent health log');
      }
      if (row.stalePendingCommandCount > 0) {
        issues.push(`Pending >30m (${row.stalePendingCommandCount})`);
      }

      return {
        nodeId: row.nodeId,
        nodeName: row.nodeName,
        issueSummary: issues.join(', '),
        lastSyncAt: row.lastSyncAt,
        latestSeenAt: row.latestSeenAt
      };
    });

  return {
    overview: {
      registeredDevices: deviceRows.length,
      activeDevices: activeRows.length,
      revokedDevices: revokedRows.length,
      onlineRecentDevices: onlineRows.length,
      offlineStaleDevices: offlineRows.length
    },
    syncHealth: {
      syncedWithinWindow: syncedRows.length,
      staleSyncCount: staleSyncRows.length,
      neverSyncedCount: neverSyncedRows.length,
      missingHeartbeatCount: missingHeartbeatRows.length,
      latestMeshSyncAt
    },
    queue,
    telemetryRows: deviceRows.slice(0, 40),
    recentActivityRows: deviceRows.slice(0, 32),
    commandTypeRows: commandTypeRows.map((row) => ({
      commandType: row.commandType,
      totalCount: Number(row.totalCount || 0),
      pendingCount: Number(row.pendingCount || 0),
      processedCount: Number(row.processedCount || 0),
      cancelledCount: Number(row.cancelledCount || 0)
    })),
    failureSummary: {
      noRecentHealthCount: missingHealthRows.length,
      noRecentSyncCount: staleSyncRows.length,
      missingHeartbeatCount: missingHeartbeatRows.length,
      stalePendingCommandDeviceCount: stalePendingRows.length
    },
    failureRows
  };
}

function normalizeOnlineDepartmentActivityRows(rows) {
  return rows.map((row) => ({
    departmentId: row.departmentId,
    slug: row.slug,
    name: row.name,
    subtitle: row.subtitle || '',
    status: row.status,
    readOnly: Boolean(Number(row.readOnly || 0)),
    openConversationCount: Number(row.openConversationCount || 0),
    activeConversationCount: Number(row.activeConversationCount || 0),
    messageCount: Number(row.messageCount || 0),
    civilianMessageCount: Number(row.civilianMessageCount || 0),
    adminMessageCount: Number(row.adminMessageCount || 0),
    rescuerMessageCount: Number(row.rescuerMessageCount || 0),
    latestMessageAt: row.latestMessageAt || null
  }));
}

function normalizeTopConversationRows(rows) {
  return rows.map((row) => ({
    conversationId: row.conversationId,
    departmentName: row.departmentName,
    civilianCode: row.civilianCode || 'Unknown',
    civilianName: fullName(
      decryptText(row.civilianFirstNameEnc || ''),
      decryptText(row.civilianMiddleNameEnc || ''),
      decryptText(row.civilianLastNameEnc || '')
    ) || row.civilianCode || 'Unknown civilian',
    messageCount: Number(row.messageCount || 0),
    latestMessageAt: row.latestMessageAt || null
  }));
}

function normalizeRecentCommunicationEventRows(rows) {
  return rows.map((row) => {
    const senderType = String(row.senderType || '').toLowerCase();
    const senderLabel = formatChatSenderLabel(senderType);
    const senderDisplay = resolveDisplayName({
      civilianCode: row.civilianCode,
      civilianFirstNameEnc: row.civilianFirstNameEnc,
      civilianMiddleNameEnc: row.civilianMiddleNameEnc,
      civilianLastNameEnc: row.civilianLastNameEnc,
      adminCode: row.adminCode,
      adminFirstNameEnc: row.adminFirstNameEnc,
      adminMiddleNameEnc: row.adminMiddleNameEnc,
      adminLastNameEnc: row.adminLastNameEnc,
      rescuerCode: row.rescuerCode,
      rescuerFirstNameEnc: row.rescuerFirstNameEnc,
      rescuerMiddleNameEnc: row.rescuerMiddleNameEnc,
      rescuerLastNameEnc: row.rescuerLastNameEnc,
      senderType
    });

    const eventKind = String(row.eventKind || '');
    return {
      eventKind,
      eventKindLabel: eventKind === 'moderation'
        ? 'Moderation'
        : (eventKind === 'global-message' ? 'Global message' : 'Department message'),
      roomName: row.roomName || 'Unknown room',
      senderType,
      senderTypeLabel: senderLabel,
      senderDisplay,
      preview: createPreviewText(eventKind === 'moderation' ? row.reason || row.preview : row.preview),
      moderationReason: row.reason ? formatModerationEventLabel(row.reason) : '',
      eventAt: row.eventAt || null
    };
  });
}

function summarizeUnreadRows(rows) {
  return rows.reduce((accumulator, row) => {
    const readerType = String(row.readerType || '').toLowerCase();
    accumulator[readerType] = Number(row.count || 0);
    return accumulator;
  }, { admin: 0, civilian: 0, rescuer: 0 });
}

function buildOnlineCommunicationsModerationSummary({
  chatScope,
  departmentRows,
  globalSummary,
  conversationLoad,
  senderActivity,
  moderationSummary,
  recentEventRows
}) {
  const departmentSenderTotals = senderActivity.departmentSenderRows.reduce((accumulator, row) => {
    accumulator[String(row.senderType || '').toLowerCase()] = Number(row.count || 0);
    return accumulator;
  }, { civilian: 0, admin: 0, rescuer: 0, system: 0 });

  const globalSenderTotals = senderActivity.globalSenderRows.reduce((accumulator, row) => {
    accumulator[String(row.senderType || '').toLowerCase()] = Number(row.count || 0);
    return accumulator;
  }, { admin: 0, system: 0 });

  const moderationCounts = moderationSummary.eventRows.reduce((accumulator, row) => {
    const eventType = String(row.eventType || '').toLowerCase();
    accumulator[eventType] = (accumulator[eventType] || 0) + Number(row.totalCount || 0);
    return accumulator;
  }, {});

  const totalDepartmentMessages = departmentRows.reduce((sum, row) => sum + row.messageCount, 0);
  const totalDepartmentOpenConversations = departmentRows.reduce((sum, row) => sum + row.openConversationCount, 0);
  const totalDepartmentActiveConversations = departmentRows.reduce((sum, row) => sum + row.activeConversationCount, 0);
  const departmentUnread = summarizeUnreadRows(conversationLoad.departmentUnreadRows || []);
  const globalUnread = summarizeUnreadRows(conversationLoad.globalUnreadRows || []);

  return {
    overview: {
      chatScope,
      departmentRoomCount: departmentRows.length,
      departmentMessageCount: totalDepartmentMessages,
      globalMessageCount: Number(globalSummary?.messageCount || 0),
      openConversationCount: Number(conversationLoad.openConversationCount || 0),
      activeConversationCount: Number(conversationLoad.activeConversationCount || 0),
      moderationEventCount: moderationSummary.eventRows.reduce((sum, row) => sum + Number(row.totalCount || 0), 0)
    },
    departmentRows: departmentRows.slice(0, 16),
    globalActivity: {
      messageCount: Number(globalSummary?.messageCount || 0),
      adminMessageCount: Number(globalSummary?.adminMessageCount || 0),
      systemMessageCount: Number(globalSummary?.systemMessageCount || 0),
      latestMessageAt: globalSummary?.latestMessageAt || null,
      civilianReaderCount: Number(globalSummary?.civilianReaderCount || 0),
      rescuerReaderCount: Number(globalSummary?.rescuerReaderCount || 0),
      adminReaderCount: Number(globalSummary?.adminReaderCount || 0)
    },
    conversationLoad: {
      openConversationCount: Number(conversationLoad.openConversationCount || 0),
      activeConversationCount: Number(conversationLoad.activeConversationCount || 0),
      departmentUnread,
      globalUnread
    },
    senderActivity: {
      departmentSenderTotals,
      globalSenderTotals,
      topDepartmentRows: senderActivity.topDepartmentRows.map((row) => ({
        departmentId: row.departmentId,
        name: row.name,
        messageCount: Number(row.messageCount || 0)
      })).slice(0, 5),
      topConversationRows: normalizeTopConversationRows(senderActivity.topConversationRows).slice(0, 8)
    },
    moderation: {
      profanityBlockedCount: Number(moderationCounts.profanity_blocked || 0),
      linkBlockedCount: Number(moderationCounts.link_blocked || 0),
      duplicateBlockedCount: Number(moderationCounts.duplicate_message_blocked || 0),
      spamTimeoutCount: Number(moderationCounts.spam_timeout_triggered || 0),
      activeCivilianTimeoutCount: Number(moderationSummary.activeCivilianTimeoutCount || 0),
      activeRescuerTimeoutCount: Number(moderationSummary.activeRescuerTimeoutCount || 0),
      eventRows: moderationSummary.eventRows.map((row) => ({
        eventType: row.eventType,
        eventLabel: formatModerationEventLabel(row.eventType),
        reason: row.reason,
        reasonLabel: formatModerationEventLabel(row.reason),
        totalCount: Number(row.totalCount || 0),
        civilianCount: Number(row.civilianCount || 0),
        rescuerCount: Number(row.rescuerCount || 0),
        latestEventAt: row.latestEventAt || null
      })).slice(0, 12)
    },
    recentEventRows: normalizeRecentCommunicationEventRows(recentEventRows).slice(0, 32),
    totals: {
      totalDepartmentOpenConversations,
      totalDepartmentActiveConversations
    }
  };
}

function normalizeRescueTeamActivityRows(rows) {
  return rows.map((row) => ({
    deploymentId: row.deploymentId,
    deploymentCode: row.deploymentCode || `DPL-${row.deploymentId}`,
    deploymentStatus: String(row.deploymentStatus || '').toLowerCase() || 'unknown',
    statusLabel: formatStatusLabel(row.deploymentStatus),
    sourceType: String(row.sourceType || 'mesh').toLowerCase() === 'online' ? 'online' : 'mesh',
    sourceLabel: formatSourceLabel(row.sourceType),
    distressCode: row.distressCode || 'Unknown',
    reasonRaw: row.reason,
    reasonLabel: formatReasonLabel(row.reason),
    reportedAt: row.reportedAt || null,
    deployedAt: row.deployedAt || null,
    endedAt: row.endedAt || null,
    teamId: row.teamId,
    teamCode: row.teamCode || '',
    teamName: row.teamName || 'Unknown team',
    teamAgency: row.teamAgency || '',
    teamAgencyLabel: formatAgencyLabel(row.teamAgency),
    teamStatus: row.teamStatus || '',
    teamStatusLabel: formatTeamStatusLabel(row.teamStatus),
    leaderRescuerId: row.leaderRescuerId || null,
    leaderRescuerCode: row.leaderRescuerCode || '',
    leaderName: decryptLeaderName(row, 'leader') || row.teamCode || row.teamName || 'Unknown leader',
    responseSeconds: secondsBetween(row.reportedAt, row.deployedAt),
    deploymentDurationSeconds: secondsBetween(row.deployedAt, row.endedAt)
  }));
}

function normalizeRescueTeamRosterRows(rows) {
  return rows.map((row) => {
    const latestLeaderName = decryptLeaderName({
      leaderFirstNameEnc: row.latestLeaderFirstNameEnc,
      leaderMiddleNameEnc: row.latestLeaderMiddleNameEnc,
      leaderLastNameEnc: row.latestLeaderLastNameEnc
    }, 'leader');
    const fallbackLeaderName = decryptLeaderName({
      leaderFirstNameEnc: row.fallbackLeaderFirstNameEnc,
      leaderMiddleNameEnc: row.fallbackLeaderMiddleNameEnc,
      leaderLastNameEnc: row.fallbackLeaderLastNameEnc
    }, 'leader');

    return {
      teamId: row.teamId,
      teamCode: row.teamCode || '',
      teamName: row.teamName || 'Unknown team',
      teamAgency: row.teamAgency || '',
      teamAgencyLabel: formatAgencyLabel(row.teamAgency),
      teamStatus: row.teamStatus || '',
      teamStatusLabel: formatTeamStatusLabel(row.teamStatus),
      memberCount: Number(row.memberCount || 0),
      activeMemberCount: Number(row.activeMemberCount || 0),
      dispatchedMemberCount: Number(row.dispatchedMemberCount || 0),
      leaderRescuerCode: row.latestLeaderRescuerCode || row.fallbackLeaderRescuerCode || '',
      leaderName: latestLeaderName || fallbackLeaderName || 'Unassigned'
    };
  });
}

function buildRescueTeamActivitySummary(activityRows, rosterRows) {
  const teams = new Map();

  activityRows.forEach((row) => {
    if (!teams.has(row.teamId)) {
      teams.set(row.teamId, {
        teamId: row.teamId,
        teamCode: row.teamCode,
        teamName: row.teamName,
        teamAgency: row.teamAgency,
        teamAgencyLabel: row.teamAgencyLabel,
        teamStatusLabel: row.teamStatusLabel,
        latestLeaderName: row.leaderName,
        deploymentTotal: 0,
        activeDeploymentCount: 0,
        canceledDeploymentCount: 0,
        accomplishedDeploymentCount: 0,
        meshDeploymentCount: 0,
        onlineDeploymentCount: 0,
        responseDurations: [],
        deploymentDurations: [],
        reasonCounts: new Map(),
        recentDeployments: []
      });
    }

    const team = teams.get(row.teamId);
    team.deploymentTotal += 1;

    if (row.deploymentStatus === 'deployed') {
      team.activeDeploymentCount += 1;
    } else if (row.deploymentStatus === 'canceled') {
      team.canceledDeploymentCount += 1;
    } else if (row.deploymentStatus === 'accomplished') {
      team.accomplishedDeploymentCount += 1;
    }

    if (row.sourceType === 'online') {
      team.onlineDeploymentCount += 1;
    } else {
      team.meshDeploymentCount += 1;
    }

    if (Number.isFinite(row.responseSeconds)) {
      team.responseDurations.push(row.responseSeconds);
    }

    if (Number.isFinite(row.deploymentDurationSeconds)) {
      team.deploymentDurations.push(row.deploymentDurationSeconds);
    }

    team.reasonCounts.set(row.reasonLabel, (team.reasonCounts.get(row.reasonLabel) || 0) + 1);
    team.recentDeployments.push(row);
  });

  const rosterByTeamId = new Map(rosterRows.map((row) => [row.teamId, row]));
  const teamRows = Array.from(teams.values())
    .map((team) => {
      const roster = rosterByTeamId.get(team.teamId) || null;
      const topReasons = Array.from(team.reasonCounts.entries())
        .sort((left, right) => {
          if (right[1] !== left[1]) {
            return right[1] - left[1];
          }
          return left[0].localeCompare(right[0]);
        })
        .slice(0, 3)
        .map(([label, count]) => ({ label, count }));

      return {
        teamId: team.teamId,
        teamCode: team.teamCode,
        teamName: team.teamName,
        teamAgencyLabel: team.teamAgencyLabel,
        teamStatusLabel: roster?.teamStatusLabel || team.teamStatusLabel,
        leaderName: roster?.leaderName || team.latestLeaderName || 'Unassigned',
        leaderRescuerCode: roster?.leaderRescuerCode || '',
        memberCount: roster?.memberCount ?? 0,
        activeMemberCount: roster?.activeMemberCount ?? 0,
        dispatchedMemberCount: roster?.dispatchedMemberCount ?? 0,
        deploymentTotal: team.deploymentTotal,
        activeDeploymentCount: team.activeDeploymentCount,
        canceledDeploymentCount: team.canceledDeploymentCount,
        accomplishedDeploymentCount: team.accomplishedDeploymentCount,
        meshDeploymentCount: team.meshDeploymentCount,
        onlineDeploymentCount: team.onlineDeploymentCount,
        averageResponseSeconds: average(team.responseDurations),
        fastestResponseSeconds: team.responseDurations.length ? Math.min(...team.responseDurations) : null,
        slowestResponseSeconds: team.responseDurations.length ? Math.max(...team.responseDurations) : null,
        averageDeploymentDurationSeconds: average(team.deploymentDurations),
        responseSampleCount: team.responseDurations.length,
        deploymentDurationSampleCount: team.deploymentDurations.length,
        topReasons,
        topReasonSummary: topReasons.length
          ? topReasons.map((item) => `${item.label} (${item.count})`).join(', ')
          : 'No deployment reasons recorded'
      };
    })
    .sort((left, right) => {
      if (right.deploymentTotal !== left.deploymentTotal) {
        return right.deploymentTotal - left.deploymentTotal;
      }
      return left.teamName.localeCompare(right.teamName);
    });

  const recentActivity = activityRows
    .slice()
    .sort((left, right) => {
      const leftTime = new Date(left.deployedAt || left.reportedAt || 0).getTime();
      const rightTime = new Date(right.deployedAt || right.reportedAt || 0).getTime();
      return rightTime - leftTime;
    })
    .slice(0, 18);

  const totalDeployments = activityRows.length;
  const activeDeployments = activityRows.filter((row) => row.deploymentStatus === 'deployed').length;
  const closedDeployments = activityRows.filter((row) => row.deploymentStatus === 'canceled' || row.deploymentStatus === 'accomplished').length;

  return {
    overview: {
      teamCount: teamRows.length,
      rosterTeamCount: rosterRows.length,
      totalDeployments,
      activeDeployments,
      closedDeployments
    },
    teamRows,
    rosterRows,
    recentActivity
  };
}

module.exports = {
  normalizeIncidentRows,
  buildIncidentSummary,
  normalizeAuditRows,
  normalizeRescuerAccessRoster,
  buildAccountsAccessAuditSummary,
  normalizeMeshDeviceSyncRows,
  buildMeshDeviceSyncHealthSummary,
  normalizeOnlineDepartmentActivityRows,
  normalizeTopConversationRows,
  normalizeRecentCommunicationEventRows,
  summarizeUnreadRows,
  buildOnlineCommunicationsModerationSummary,
  normalizeRescueTeamActivityRows,
  normalizeRescueTeamRosterRows,
  buildRescueTeamActivitySummary
};
