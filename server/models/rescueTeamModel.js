const RESCUE_TEAM_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DISPATCHED: 'dispatched'
};

const RESCUE_TEAM_AGENCIES = {
  CDRRMO: 'cdrrmo',
  FIRE_DEPARTMENT: 'fire-department',
  POLICE_DEPARTMENT: 'police-department'
};

const MAX_RESCUERS_PER_TEAM = 5;

const REQUIRED_RESCUE_TEAM_FIELDS = [
  'name',
  'agency',
  'status'
];

module.exports = {
  RESCUE_TEAM_STATUSES,
  RESCUE_TEAM_AGENCIES,
  MAX_RESCUERS_PER_TEAM,
  REQUIRED_RESCUE_TEAM_FIELDS
};
