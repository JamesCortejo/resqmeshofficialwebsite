const SESSION_PRINCIPAL_TYPES = {
  ADMIN_USER: 'admin_user',
  USER: 'user',
  RESCUER: 'rescuer'
};

const SESSION_CLIENT_TYPES = {
  ADMIN_WEB: 'admin_web',
  MOBILE_APP: 'mobile_app'
};

const ADMIN_SESSION_COOKIE_NAME = 'resqmesh_admin_session';
const ADMIN_SESSION_TTL_HOURS = 8;
const ADMIN_CSRF_HEADER_NAME = 'x-csrf-token';
const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = {
  SESSION_PRINCIPAL_TYPES,
  SESSION_CLIENT_TYPES,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_HOURS,
  ADMIN_CSRF_HEADER_NAME,
  SAFE_HTTP_METHODS
};
