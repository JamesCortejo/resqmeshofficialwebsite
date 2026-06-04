const USER_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined'
};

const REQUIRED_REGISTRATION_FIELDS = [
  'firstName',
  'lastName',
  'username',
  'streetAddress',
  'barangay',
  'occupation',
  'bloodType',
  'email',
  'phone',
  'password',
  'idType',
  'idNumber'
];

module.exports = {
  USER_STATUSES,
  REQUIRED_REGISTRATION_FIELDS
};
