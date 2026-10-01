const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const authenticate = require('./middleware/auth');
const allowRoles = require('./middleware/role');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Restrict browser origins via CORS_ORIGIN (comma-separated). Mobile apps
// don't send an Origin header, so they are unaffected by this setting.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Evidence photos stay publicly readable at
// http://<host>:5000/uploads/evidence/<filename> — referenced by the
// imagePath stored on each Evidence record (admin, driver, enforcer UIs).
app.use('/uploads/evidence', express.static(path.join(__dirname, '..', 'uploads', 'evidence')));

// Driver license photos contain personal information — same URLs as before
// (/uploads/licenses/<filename>) but served only to authenticated admins
// via the existing JWT + role middleware. No second auth system.
app.use('/uploads/licenses', authenticate, allowRoles('admin'), express.static(path.join(__dirname, '..', 'uploads', 'licenses')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/v1', routes);

// 404 for unmatched routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
