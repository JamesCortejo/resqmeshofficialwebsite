const { decryptText } = require('./encryptionService');
const {
  notifyRescueTeamCreated,
  notifyRescueTeamUpdated,
  notifyRescueTeamRosterChanged
} = require('./notificationService');
const {
  RESCUE_TEAM_STATUSES,
  RESCUE_TEAM_AGENCIES,
  MAX_RESCUERS_PER_TEAM,
  REQUIRED_RESCUE_TEAM_FIELDS
} = require('../models/rescueTeamModel');
const {
  generateRescueTeamCode,
  findRescueTeamByName,
  createRescueTeam,
  updateRescueTeam,
  getRescueTeamById,
  getRescueTeamSummaryById,
  listRescueTeams,
  getRescueTeamMembers,
  listAssignableRescuers,
  listRescuersByIds,
  unassignRemovedRescuers,
  assignRescuersToTeam
} = require('../repositories/rescueTeamRepository');

const ALLOWED_TEAM_STATUSES = new Set(Object.values(RESCUE_TEAM_STATUSES));
const ALLOWED_TEAM_AGENCIES = new Set(Object.values(RESCUE_TEAM_AGENCIES));

function normalizeRequiredString(value) {
  return String(value || '').trim();
}

function missingFields(body) {
  return REQUIRED_RESCUE_TEAM_FIELDS.filter((field) => {
    const value = body[field];
    return value === undefined || value === null || String(value).trim() === '';
  });
}

function fullName(row) {
  return [
    decryptText(row.firstNameEnc),
    decryptText(row.middleNameEnc),
    decryptText(row.lastNameEnc)
  ]
    .filter(Boolean)
    .join(' ');
}

function teamRef(row) {
  if (!row || !row.teamId) {
    return null;
  }

  return {
    id: row.teamId,
    teamCode: row.teamCode || '',
    name: row.teamName || '',
    status: row.teamStatus || ''
  };
}

function rescuerRosterResponse(row) {
  return {
    id: row.id,
    rescuerCode: row.rescuerCode,
    fullName: fullName(row),
    phone: decryptText(row.phoneEnc),
    agency: row.agency,
    status: row.status,
    accessStatus: row.accessStatus,
    team: teamRef(row)
  };
}

function teamSummaryResponse(row) {
  return {
    id: row.id,
    teamCode: row.teamCode,
    name: row.name,
    agency: row.agency,
    status: row.status,
    memberCount: Number(row.memberCount || 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function teamDetailResponse(row, members) {
  const summary = teamSummaryResponse(row);

  return {
    ...summary,
    members,
    roster: {
      memberCount: summary.memberCount,
      maxMembers: MAX_RESCUERS_PER_TEAM
    }
  };
}

function normalizeRescuerIds(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  input.forEach((value) => {
    const parsed = Number.parseInt(String(value), 10);

    if (!Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) {
      return;
    }

    seen.add(parsed);
    normalized.push(parsed);
  });

  return normalized;
}

function sortedIds(values) {
  return [...values].sort((left, right) => left - right);
}

function idsChanged(previousIds, nextIds) {
  const previous = sortedIds(previousIds);
  const next = sortedIds(nextIds);

  if (previous.length !== next.length) {
    return true;
  }

  return previous.some((value, index) => value !== next[index]);
}

async function validateTeamPayload(payload, existingTeamId = null) {
  const missing = missingFields(payload);

  if (missing.length > 0) {
    const error = new Error(`Missing required fields: ${missing.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  const name = normalizeRequiredString(payload.name);
  const agency = normalizeRequiredString(payload.agency).toLowerCase();
  const status = normalizeRequiredString(payload.status).toLowerCase();
  const rescuerIds = normalizeRescuerIds(payload.rescuerIds);

  if (!name) {
    const error = new Error('Rescue team name is required.');
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_TEAM_AGENCIES.has(agency)) {
    const error = new Error('Unsupported rescue team agency.');
    error.statusCode = 400;
    throw error;
  }

  if (!ALLOWED_TEAM_STATUSES.has(status)) {
    const error = new Error('Unsupported rescue team status.');
    error.statusCode = 400;
    throw error;
  }

  if (rescuerIds.length > MAX_RESCUERS_PER_TEAM) {
    const error = new Error(`A rescue team can only have up to ${MAX_RESCUERS_PER_TEAM} rescuers.`);
    error.statusCode = 400;
    throw error;
  }

  const existingByName = await findRescueTeamByName(name);
  if (existingByName && existingByName.id !== existingTeamId) {
    const error = new Error('A rescue team with this name already exists.');
    error.statusCode = 409;
    throw error;
  }

  const selectedRescuers = await listRescuersByIds(rescuerIds);

  if (selectedRescuers.length !== rescuerIds.length) {
    const error = new Error('One or more selected rescuers could not be found.');
    error.statusCode = 400;
    throw error;
  }

  selectedRescuers.forEach((rescuer) => {
    const allowedBecauseAlreadyOnTeam = existingTeamId && rescuer.teamId === existingTeamId;

    if (rescuer.accessStatus !== 'active' && !allowedBecauseAlreadyOnTeam) {
      const error = new Error(`Rescuer ${rescuer.rescuerCode} is not active and cannot be assigned to a team.`);
      error.statusCode = 400;
      throw error;
    }

    if (rescuer.teamId && !allowedBecauseAlreadyOnTeam) {
      const error = new Error(`Rescuer ${rescuer.rescuerCode} is already assigned to another team.`);
      error.statusCode = 400;
      throw error;
    }
  });

  return {
    name,
    agency,
    status,
    rescuerIds,
    selectedRescuers
  };
}

async function fetchTeamDetail(id) {
  const row = await getRescueTeamSummaryById(id);

  if (!row) {
    return null;
  }

  const members = (await getRescueTeamMembers(id)).map(rescuerRosterResponse);
  return teamDetailResponse(row, members);
}

async function createRescueTeamProfile(payload) {
  const validated = await validateTeamPayload(payload);
  const teamCode = await generateRescueTeamCode();
  const result = await createRescueTeam({
    teamCode,
    name: validated.name,
    agency: validated.agency,
    status: validated.status
  });

  if (validated.rescuerIds.length > 0) {
    await assignRescuersToTeam(result.lastID, validated.rescuerIds);
  }

  const response = await fetchTeamDetail(result.lastID);
  notifyRescueTeamCreated(response);

  return response;
}

async function getRescueTeamSummaries() {
  const rows = await listRescueTeams();
  return rows.map(teamSummaryResponse);
}

async function getRescueTeamDetails(id) {
  return fetchTeamDetail(id);
}

async function updateRescueTeamProfile(id, payload) {
  const existing = await getRescueTeamById(id);

  if (!existing) {
    const error = new Error('Rescue team not found.');
    error.statusCode = 404;
    throw error;
  }

  const currentMembers = await getRescueTeamMembers(id);
  const currentMemberIds = currentMembers.map((member) => member.id);
  const validated = await validateTeamPayload(payload, id);

  await updateRescueTeam(id, {
    name: validated.name,
    agency: validated.agency,
    status: validated.status
  });

  await unassignRemovedRescuers(id, validated.rescuerIds);
  await assignRescuersToTeam(id, validated.rescuerIds);

  const response = await fetchTeamDetail(id);
  const rosterChanged = idsChanged(currentMemberIds, validated.rescuerIds);

  notifyRescueTeamUpdated(response);
  notifyRescueTeamRosterChanged(response, rosterChanged);

  return {
    message: `Rescue team ${response.teamCode} updated successfully.`,
    team: response
  };
}

async function getAssignableRescuerSummaries() {
  const rows = await listAssignableRescuers();
  return rows.map(rescuerRosterResponse);
}

module.exports = {
  createRescueTeamProfile,
  getRescueTeamSummaries,
  getRescueTeamDetails,
  updateRescueTeamProfile,
  getAssignableRescuerSummaries
};
