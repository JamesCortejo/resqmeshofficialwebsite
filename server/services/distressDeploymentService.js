const { decryptText } = require('./encryptionService');
const {
  notifyDeploymentCreated,
  notifyDeploymentCanceled,
  notifyDeploymentAccomplished
} = require('./notificationService');
const { DEPLOYMENT_STATUSES } = require('../models/distressDeploymentModel');
const {
  generateDeploymentCode,
  listDistressSignals,
  countUnresolvedDistressSignals,
  getDistressSignalById,
  getActiveDistressSignalById,
  getOnlineDistressSignalById,
  getActiveOnlineDistressSignalById,
  findActiveDeploymentByDistressSignalId,
  findActiveDeploymentByOnlineDistressSignalId,
  getDeploymentById,
  listDeploymentMembers,
  createDeployment,
  updateDeploymentStatus,
  updateOnlineDistressStatus
} = require('../repositories/deploymentRepository');
const { createMeshCommand } = require('../repositories/deviceSyncRepository');
const {
  listRescueTeams,
  getRescueTeamMembers,
  getRescueTeamById
} = require('../repositories/rescueTeamRepository');

function fullName(firstName, middleName, lastName) {
  return [firstName, middleName, lastName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function leaderName(row) {
  return fullName(
    decryptText(row.leaderFirstNameEnc),
    decryptText(row.leaderMiddleNameEnc),
    decryptText(row.leaderLastNameEnc)
  );
}

function assignmentState(row) {
  if (row.deploymentStatus) {
    return row.deploymentStatus;
  }

  const distressStatus = String(row.distressStatus || '').toLowerCase();

  if (distressStatus === 'canceled' || distressStatus === 'cancelled') {
    return 'canceled';
  }

  return 'unassigned';
}

function assignmentLabel(value) {
  const normalized = String(value || '').toLowerCase();

  if (normalized === DEPLOYMENT_STATUSES.DEPLOYED) return 'Deployed';
  if (normalized === DEPLOYMENT_STATUSES.CANCELED) return 'Canceled';
  if (normalized === DEPLOYMENT_STATUSES.ACCOMPLISHED) return 'Accomplished';
  return 'Unassigned';
}

function teamSummary(row) {
  if (!row.teamId) {
    return null;
  }

  return {
    id: row.teamId,
    teamCode: row.teamCode || '',
    name: row.teamName || '',
    status: row.teamStatus || ''
  };
}

function parseTimestampMs(value) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function diffSeconds(startValue, endValue) {
  const startMs = parseTimestampMs(startValue);
  const endMs = parseTimestampMs(endValue);

  if (startMs === null || endMs === null || endMs < startMs) {
    return null;
  }

  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

function buildTiming(summary, row) {
  const reportedAt = summary.reportedAt || row.timestamp || null;
  const deployedAt = row.deployedAt || null;
  const canceledAt = row.canceledAt || null;
  const accomplishedAt = row.accomplishedAt || null;
  const endedAt = accomplishedAt || canceledAt || null;

  let currentPhase = 'unassigned';
  if (summary.accessState === DEPLOYMENT_STATUSES.ACCOMPLISHED) {
    currentPhase = 'accomplished';
  } else if (summary.accessState === DEPLOYMENT_STATUSES.CANCELED) {
    currentPhase = 'canceled';
  } else if (summary.accessState === DEPLOYMENT_STATUSES.DEPLOYED || deployedAt) {
    currentPhase = 'deployed';
  }

  return {
    reportedAt,
    deployedAt,
    canceledAt,
    accomplishedAt,
    endedAt,
    currentPhase,
    timeToDeploySeconds: diffSeconds(reportedAt, deployedAt),
    deploymentDurationSeconds: diffSeconds(deployedAt, endedAt),
    totalIncidentDurationSeconds: diffSeconds(reportedAt, endedAt)
  };
}

function parseDistressSourceKey(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(mesh|online):(\d+)$/i);

  if (match) {
    return {
      source: match[1].toLowerCase(),
      id: Number.parseInt(match[2], 10)
    };
  }

  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && id > 0
    ? { source: 'mesh', id }
    : { source: null, id: null };
}

async function enqueueDistressCancelCommand(deployment) {
  if (!deployment?.originNodeId || !deployment?.originDistressId) {
    return;
  }

  const timestamp = new Date().toISOString();

  await createMeshCommand({
    targetNodeId: deployment.originNodeId,
    commandType: 'cancel_distress',
    payloadJson: JSON.stringify({
      originNodeId: deployment.originNodeId,
      originDistressId: deployment.originDistressId,
      meshDistressSignalId: deployment.meshDistressSignalId || null,
      deploymentId: deployment.id
    }),
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

function distressSummary(row) {
  const state = assignmentState(row);

  return {
    id: row.id,
    sourceKey: row.sourceKey || `${row.distressSource || 'mesh'}:${row.id}`,
    sourceType: row.distressSource || 'mesh',
    sourceLabel: row.sourceLabel || (row.distressSource === 'online' ? 'ONLINE' : 'MESH'),
    distressCode: row.distressCode,
    civilianName: fullName(row.firstName, null, row.lastName),
    civilianPhone: row.phone || '',
    age: row.age,
    bloodType: row.bloodType || '',
    reason: row.reason || '',
    priority: row.priority || 'high',
    nodeId: row.originNodeId || row.nodeId || '',
    nodeName: row.nodeName || row.originNodeId || row.nodeId || (row.distressSource === 'online' ? 'Civilian online location' : 'Unknown mesh node'),
    latitude: row.latitude,
    longitude: row.longitude,
    reportedAt: row.timestamp,
    accessState: state,
    assignmentLabel: assignmentLabel(state),
    assignedTeamId: row.teamId || null,
    deploymentId: row.deploymentId || null,
    deploymentCode: row.deploymentCode || null,
    teamLeaderRescuerId: row.teamLeaderRescuerId || null,
    teamLeaderName: row.teamLeaderRescuerId ? leaderName(row) : null,
    team: teamSummary(row)
  };
}

async function buildTeamChoices() {
  const teams = await listRescueTeams();

  return Promise.all(teams.map(async (team) => {
    const members = await getRescueTeamMembers(team.id);
    const activeMembers = members
      .filter((member) => member.accessStatus === 'active')
      .map((member) => {
        const firstName = decryptText(member.firstNameEnc);
        const middleName = decryptText(member.middleNameEnc);
        const lastName = decryptText(member.lastNameEnc);

        return {
          id: member.id,
          rescuerCode: member.rescuerCode,
          fullName: fullName(firstName, middleName, lastName),
          agency: member.agency,
          status: member.status,
          accessStatus: member.accessStatus
        };
      });

    return {
      id: team.id,
      teamCode: team.teamCode,
      name: team.name,
      agency: team.agency,
      status: team.status,
      members: activeMembers,
      capacity: 5,
      memberCount: activeMembers.length,
      assignable: team.status === 'active'
    };
  }));
}

async function getDistressSignalSummaries() {
  const rows = await listDistressSignals();
  return rows.map(distressSummary);
}

async function getUnresolvedDistressSignalCount() {
  const row = await countUnresolvedDistressSignals();
  return Number(row?.count || 0);
}

async function getDistressSignalDetails(id) {
  const sourceKey = parseDistressSourceKey(id);
  const row = sourceKey.source === 'online'
    ? await getOnlineDistressSignalById(sourceKey.id)
    : await getDistressSignalById(sourceKey.id);

  if (!row) {
    return null;
  }

  const teams = await buildTeamChoices();
  const summary = distressSummary(row);
  const timing = buildTiming(summary, row);
  const deploymentMembers = row.deploymentId
    ? await listDeploymentMembers(row.deploymentId)
    : [];

  return {
    ...summary,
    civilian: {
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      bloodType: row.bloodType,
      age: row.age,
      occupation: row.occupation || ''
    },
    deployment: row.deploymentId ? {
      id: row.deploymentId,
      deploymentCode: row.deploymentCode,
      status: row.deploymentStatus,
      deployedAt: row.deployedAt,
      canceledAt: row.canceledAt,
      accomplishedAt: row.accomplishedAt,
      teamLeaderRescuerId: row.teamLeaderRescuerId,
      teamLeaderRescuerCode: row.teamLeaderRescuerCode || null,
      teamLeaderName: row.teamLeaderRescuerId ? leaderName(row) : null
    } : null,
    timing,
    deploymentMembers: deploymentMembers.map((member) => ({
      id: member.rescuerId,
      rescuerCode: member.rescuerCode,
      fullName: fullName(
        decryptText(member.firstNameEnc),
        decryptText(member.middleNameEnc),
        decryptText(member.lastNameEnc)
      ),
      status: member.status
    })),
    availableTeams: teams
  };
}

async function deployDistressSignal(id, payload, adminUser) {
  const sourceKey = parseDistressSourceKey(id);
  const isOnline = sourceKey.source === 'online';
  const distress = isOnline
    ? await getActiveOnlineDistressSignalById(sourceKey.id)
    : await getActiveDistressSignalById(sourceKey.id);

  if (!distress) {
    const error = new Error('Active distress signal not found.');
    error.statusCode = 404;
    throw error;
  }

  const existing = isOnline
    ? await findActiveDeploymentByOnlineDistressSignalId(distress.id)
    : await findActiveDeploymentByDistressSignalId(distress.id);

  if (existing) {
    const error = new Error('This distress signal already has an active deployed team.');
    error.statusCode = 409;
    throw error;
  }

  const teamId = Number.parseInt(String(payload.teamId || ''), 10);
  const teamLeaderRescuerId = Number.parseInt(String(payload.teamLeaderRescuerId || ''), 10);

  if (!Number.isInteger(teamId) || teamId <= 0) {
    const error = new Error('A rescue team must be selected before deployment.');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(teamLeaderRescuerId) || teamLeaderRescuerId <= 0) {
    const error = new Error('A team leader must be selected before deployment.');
    error.statusCode = 400;
    throw error;
  }

  const team = await getRescueTeamById(teamId);

  if (!team) {
    const error = new Error('Selected rescue team does not exist.');
    error.statusCode = 400;
    throw error;
  }

  if (team.status !== 'active') {
    const error = new Error('Selected rescue team is not currently deployable.');
    error.statusCode = 400;
    throw error;
  }

  const members = (await getRescueTeamMembers(teamId)).filter((member) => member.accessStatus === 'active');
  const leader = members.find((member) => member.id === teamLeaderRescuerId);

  if (!leader) {
    const error = new Error('Selected team leader is not an active member of the chosen rescue team.');
    error.statusCode = 400;
    throw error;
  }

  const deploymentCode = await generateDeploymentCode();
  const timestamp = new Date().toISOString();

  const result = await createDeployment({
    deploymentCode,
    distressSource: isOnline ? 'online' : 'mesh',
    meshDistressSignalId: isOnline ? null : distress.id,
    onlineDistressSignalId: isOnline ? distress.id : null,
    originNodeId: isOnline ? `ONLINE-${distress.id}` : distress.originNodeId,
    originDistressId: distress.originDistressId || distress.id,
    teamId,
    teamLeaderRescuerId,
    createdByAdminUserId: adminUser.id,
    status: DEPLOYMENT_STATUSES.DEPLOYED,
    createdAt: timestamp,
    deployedAt: timestamp,
    updatedAt: timestamp
  }, members.map((member) => ({
    rescuerId: member.id,
    rescuerCode: member.rescuerCode
  })));

  const created = await getDeploymentById(result.lastID);
  await notifyDeploymentCreated(created);
  return getDistressSignalDetails(isOnline ? `online:${distress.id}` : distress.id);
}

async function setDeploymentStatus(id, status) {
  const deployment = await getDeploymentById(id);

  if (!deployment) {
    const error = new Error('Deployment not found.');
    error.statusCode = 404;
    throw error;
  }

  if (deployment.status !== DEPLOYMENT_STATUSES.DEPLOYED) {
    const error = new Error(`Deployment is already ${deployment.status}.`);
    error.statusCode = 409;
    throw error;
  }

  const timestamp = new Date().toISOString();
  const updateResult = await updateDeploymentStatus(id, status, timestamp);

  if (!updateResult?.changes) {
    const latestDeployment = await getDeploymentById(id);
    const error = new Error(`Deployment is already ${latestDeployment?.status || 'closed'}.`);
    error.statusCode = 409;
    throw error;
  }

  const updated = await getDeploymentById(id);

  if (status === DEPLOYMENT_STATUSES.CANCELED) {
    if (updated.distressSource === 'online' && updated.onlineDistressSignalId) {
      await updateOnlineDistressStatus(updated.onlineDistressSignalId, DEPLOYMENT_STATUSES.CANCELED, timestamp);
    } else {
      await enqueueDistressCancelCommand(updated);
    }
    await notifyDeploymentCanceled(updated);
  } else if (status === DEPLOYMENT_STATUSES.ACCOMPLISHED) {
    if (updated.distressSource === 'online' && updated.onlineDistressSignalId) {
      await updateOnlineDistressStatus(updated.onlineDistressSignalId, DEPLOYMENT_STATUSES.ACCOMPLISHED, timestamp);
    } else {
      await enqueueDistressCancelCommand(updated);
    }
    await notifyDeploymentAccomplished(updated);
  }

  return updated;
}

async function cancelDeployment(id) {
  return setDeploymentStatus(id, DEPLOYMENT_STATUSES.CANCELED);
}

async function accomplishDeployment(id) {
  return setDeploymentStatus(id, DEPLOYMENT_STATUSES.ACCOMPLISHED);
}

module.exports = {
  getDistressSignalSummaries,
  getUnresolvedDistressSignalCount,
  getDistressSignalDetails,
  deployDistressSignal,
  cancelDeployment,
  accomplishDeployment
};
