const multer = require('multer');

// License photos are streamed straight to Cloudinary (authenticated type) by
// the controllers, so the file only needs to live in memory for the request.
// 8MB cap and the image-type filter are unchanged from the old disk storage.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, or WEBP images are allowed'));
  }
}

const uploadLicensePhoto = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB, single photo
});

module.exports = uploadLicensePhoto;
