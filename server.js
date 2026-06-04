const express = require('express');
const path = require('path');
const userRoutes = require('./server/routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// MVC API Routes
app.use('/api/users', userRoutes);

// Route for specific pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'about.html'));
});
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`ResQMesh Server running at: http://localhost:${PORT}`);
  console.log(`Valencia City, Bukidnon Emergency Mesh Portal`);
  console.log(`==================================================`);
});
