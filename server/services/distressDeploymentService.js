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
  getDistressSignalById,
  getActiveDistressSignalById,
  findActiveDeploymentByDistressSignalId,
  getDeploymentById,
  listDeploymentMembers,
  createDeployment,
  updateDeploymentStatus
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
  return row.deploymentStatus || 'unassigned';
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
    distressCode: row.distressCode,
    civilianName: fullName(row.firstName, null, row.lastName),
    civilianPhone: row.phone || '',
    age: row.age,
    bloodType: row.bloodType || '',
    reason: row.reason || '',
    priority: row.priority || 'high',
    nodeId: row.originNodeId || row.nodeId || '',
    nodeName: row.nodeName || row.originNodeId || row.nodeId || 'Unknown mesh node',
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
      assignable: team.status === 'active' || team.status === 'dispatched'
    };
  }));
}

async function getDistressSignalSummaries() {
  const rows = await listDistressSignals();
  return rows.map(distressSummary);
}

async function getDistressSignalDetails(id) {
  const row = await getDistressSignalById(id);

  if (!row) {
    return null;
  }

  const teams = await buildTeamChoices();
  const summary = distressSummary(row);
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
      age: row.age
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
  const distress = await getActiveDistressSignalById(id);

  if (!distress) {
    const error = new Error('Active distress signal not found.');
    error.statusCode = 404;
    throw error;
  }

  const existing = await findActiveDeploymentByDistressSignalId(distress.id);

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

  if (!['active', 'dispatched'].includes(team.status)) {
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
    meshDistressSignalId: distress.id,
    originNodeId: distress.originNodeId,
    originDistressId: distress.originDistressId,
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
  return getDistressSignalDetails(id);
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
  await updateDeploymentStatus(id, status, timestamp);
  const updated = await getDeploymentById(id);

  if (status === DEPLOYMENT_STATUSES.CANCELED) {
    await notifyDeploymentCanceled(updated);
  } else if (status === DEPLOYMENT_STATUSES.ACCOMPLISHED) {
    await enqueueDistressCancelCommand(updated);
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
  getDistressSignalDetails,
  deployDistressSignal,
  cancelDeployment,
  accomplishDeployment
};
