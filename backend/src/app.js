require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const authenticate = require('./middleware/auth');
const allowRoles = require('./middleware/role');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Restrict browser origins via CORS_ORIGIN (comma-separated). The native Expo
// apps don't send an Origin header, so they are unaffected by this setting —
// but both BROWSER clients are: the Next.js PWA on :3000 and the Vite admin
// dashboard on :5173. Both defaults are listed so a fresh checkout works without
// editing .env; a real deployment should set CORS_ORIGIN explicitly.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
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

// Profile avatars are user-chosen display images (unlike license photos,
// they carry no verification evidentiary value). New uploads live in
// Cloudinary (drivetrack/avatars, public) and profilePhotoPath stores the
// secure_url directly; this legacy local mount keeps pre-Cloudinary rows
// rendering without a migration.
app.use('/uploads/avatars', express.static(path.join(__dirname, '..', 'uploads', 'avatars')));

// Driver license photos contain personal information. New photos are stored
// as Cloudinary "authenticated" assets and served through the admin-only
// /api/v1/media/license-photo proxy. This local mount keeps legacy rows
// (/uploads/licenses/<filename>) working, still guarded by authenticate +
// admin role.
app.use('/uploads/licenses', authenticate, allowRoles('admin'), express.static(path.join(__dirname, '..', 'uploads', 'licenses')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/v1', routes);

// 404 for unmatched routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;
