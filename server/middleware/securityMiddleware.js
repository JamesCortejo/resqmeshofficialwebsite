const helmet = require('helmet');
const config = require('../config/env');

const ADMIN_HTML_REDIRECTS = Object.freeze({
  'login.html': '/resqmeshadmin',
  'overview.html': '/resqmeshadmin/overview',
  'accounts.html': '/resqmeshadmin/accounts',
  'devices.html': '/resqmeshadmin/devices',
  'device-map.html': '/resqmeshadmin/device-map',
  'distress-signals.html': '/resqmeshadmin/distress-signals',
  'reports.html': '/resqmeshadmin/reports',
  'messages.html': '/resqmeshadmin/messages',
  'department-chats.html': '/resqmeshadmin/department-chats',
  'rescuers.html': '/resqmeshadmin/rescuers',
  'rescue-teams.html': '/resqmeshadmin/rescue-teams'
});

function isSecureRequest(req) {
  return Boolean(req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https');
}

function requireHttps(req, res, next) {
  if (!config.security?.requireHttps || isSecureRequest(req)) {
    next();
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    return;
  }

  res.status(403).json({
    success: false,
    message: 'HTTPS is required.'
  });
}

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://www.google.com', 'https://www.gstatic.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://unpkg.com'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        frameSrc: ["'self'", 'https://www.google.com', 'https://recaptcha.google.com'],
        connectSrc: ["'self'", 'https://www.google.com', 'https://www.gstatic.com'],
        upgradeInsecureRequests: null
      }
    },
    crossOriginEmbedderPolicy: false,
    frameguard: {
      action: 'deny'
    },
    hsts: config.security?.enableHsts
      ? {
          maxAge: 15552000,
          includeSubDomains: false,
          preload: false
        }
      : false,
    noSniff: true,
    referrerPolicy: {
      policy: 'strict-origin-when-cross-origin'
    }
  });
}

function handleDirectAdminHtmlAccess(req, res, next) {
  const match = /^\/admin\/([^/]+\.html)$/i.exec(req.path);

  if (!match) {
    next();
    return;
  }

  const page = match[1].toLowerCase();
  const target = ADMIN_HTML_REDIRECTS[page];

  if (!target) {
    res.status(404).send('Admin page not found.');
    return;
  }

  res.redirect(302, target);
}

module.exports = {
  handleDirectAdminHtmlAccess,
  requireHttps,
  securityHeaders
};
