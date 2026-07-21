const express = require('express');
const path = require('path');
const config = require('./server/config/env');
const userRoutes = require('./server/routes/userRoutes');
const contactRoutes = require('./server/routes/contactRoutes');
const adminRoutes = require('./server/routes/adminRoutes');
const deviceSyncRoutes = require('./server/routes/deviceSyncRoutes');
const mobileRoutes = require('./server/routes/mobileRoutes');
const { initializeDatabase } = require('./server/database/sqlite');
const {
  redirectAuthenticatedAdmin,
  requireAdminPageSession
} = require('./server/middleware/adminSessionMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.get('/resqmeshadmin/rescuers', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'rescuers.html'));
});
app.get('/resqmeshadmin/rescue-teams', requireAdminPageSession, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'rescue-teams.html'));
});

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
