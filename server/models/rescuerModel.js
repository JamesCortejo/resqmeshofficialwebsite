const RESCUER_STATUSES = {
  AVAILABLE: 'available',
  DISPATCHED: 'dispatched',
  UNAVAILABLE: 'unavailable'
};

const RESCUER_ACCESS_STATUSES = {
  ACTIVE: 'active',
  ARCHIVED: 'archived'
};

const RESCUER_AGENCIES = {
  CDRRMO: 'cdrrmo',
  FIRE_DEPARTMENT: 'fire-department',
  POLICE_DEPARTMENT: 'police-department'
};

const REQUIRED_RESCUER_FIELDS = [
  'firstName',
  'lastName',
  'birthDate',
  'agency',
  'status',
  'phone'
];

module.exports = {
  RESCUER_STATUSES,
  RESCUER_ACCESS_STATUSES,
  RESCUER_AGENCIES,
  REQUIRED_RESCUER_FIELDS
};
