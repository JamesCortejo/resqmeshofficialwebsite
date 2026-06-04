const express = require('express');
const path = require('path');
const userRoutes = require('./server/routes/userRoutes');
const adminRoutes = require('./server/routes/adminRoutes');
const { initializeDatabase } = require('./server/database/sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (CSS, JS, images) while HTML pages are routed below.
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// MVC API Routes
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

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
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'site', 'register.html'));
});
app.get('/resqmeshadmin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});
app.get('/resqmeshadmin/overview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'overview.html'));
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
