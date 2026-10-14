const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Profile-avatar uploads for My Profile (drivers + enforcers self-service).
// Mirrors uploadLicense.js exactly — same types, same 8MB cap — but lands in
// uploads/avatars/, which app.js serves publicly like evidence photos.
// License photos stay in uploads/licenses/ behind admin-only auth: they are
// verification documents, while avatars are user-chosen display images.
const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    // Derive the stored extension from the validated mimetype — never from
    // the client-supplied original filename (which can spoof .svg/.html).
    const extByMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    cb(null, `${uniqueSuffix}${extByMime[file.mimetype] || '.jpg'}`);
  },
});

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
