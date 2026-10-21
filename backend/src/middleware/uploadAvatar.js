const multer = require('multer');

// Profile-avatar uploads for My Profile (drivers + enforcers self-service).
// Mirrors uploadLicense.js — same types, same 8MB cap — but the controller
// uploads the buffer to Cloudinary's public drivetrack/avatars folder.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
  }
}

const uploadAvatar = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB, single photo
});

module.exports = uploadAvatar;
