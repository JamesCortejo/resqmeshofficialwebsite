const express = require('express');
const path = require('path');
const config = require('./server/config/env');
const userRoutes = require('./server/routes/userRoutes');
const contactRoutes = require('./server/routes/contactRoutes');
const downloadRoutes = require('./server/routes/downloadRoutes');
const adminRoutes = require('./server/routes/adminRoutes');
const deviceSyncRoutes = require('./server/routes/deviceSyncRoutes');
const mobileRoutes = require('./server/routes/mobileRoutes');
const { initializeDatabase } = require('./server/database/postgres');
const {
  redirectAuthenticatedAdmin,
  requireAdminPageSession
} = require('./server/middleware/adminSessionMiddleware');
const {
  handleDirectAdminHtmlAccess,
  requireHttps,
  securityHeaders
} = require('./server/middleware/securityMiddleware');
const {
  handleBodyParserErrors,
  requestBodyParser
} = require('./server/middleware/requestLimitMiddleware');
const {
  errorHandler,
  notFoundHandler
} = require('./server/middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(securityHeaders());
app.use(requireHttps);

// Body Parser Middleware
app.use(requestBodyParser);
app.use(handleBodyParserErrors);

app.get('/downloads/:filename', require('./server/controllers/downloadController').serveProtectedDownload);

app.use(handleDirectAdminHtmlAccess);

// Serve static frontend files (CSS, JS, images) while HTML pages are routed below.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/api/public-config', (req, res) => {
  res.json({
    success: true,
    recaptchaSiteKey: config.recaptcha.siteKey || ''
  });
});

// MVC API Routes
app.use('/api/users', userRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', deviceSyncRoutes);
app.use('/', mobileRoutes);

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'resqmesh-website',
    serverTime: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    service: 'resqmesh-website',
    serverTime: new Date().toISOString()
  });
});

// Route for specific pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site', 'index.html'));
});
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site', 'about.html'));
});
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site', 'contact.html'));
});
app.get('/download', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site', 'download.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site', 'register.html'));
});
app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site', 'forgot-password.html'));
});
app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site', 'privacy-policy.html'));
});
app.get('/resqmeshadmin', redirectAuthenticatedAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});
app.get('/resqmeshadmin/overview', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'overview.html'));
});
app.get('/resqmeshadmin/accounts', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'accounts.html'));
});
app.get('/resqmeshadmin/devices', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'devices.html'));
});
app.get('/resqmeshadmin/device-map', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'device-map.html'));
});
app.get('/resqmeshadmin/distress-signals', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'distress-signals.html'));
});
app.get('/resqmeshadmin/reports', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'reports.html'));
});
app.get('/resqmeshadmin/messages', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'messages.html'));
});
app.get('/resqmeshadmin/department-chats', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'department-chats.html'));
});
app.get('/resqmeshadmin/rescuers', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'rescuers.html'));
});
app.get('/resqmeshadmin/rescue-teams', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'rescue-teams.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

// Start Server
async function startServer() {
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`ResQMesh Server running at: http://localhost:${PORT}`);
    console.log(`Valencia City, Bukidnon Emergency Mesh Portal`);
    console.log(`==================================================`);
  });
}

startServer().catch((error) => {
  console.error('Unable to start ResQMesh server:', error.message);
  process.exit(1);
});
