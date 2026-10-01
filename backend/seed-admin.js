// One-time script to create the first Admin account, since there's no
// registration flow for admins by design (CTMO provisions this manually).
// Run once with: node seed-admin.js

require('dotenv').config();
const bcrypt = require('bcrypt');
const { sequelize, Admin } = require('./src/models');

async function seed() {
  await sequelize.authenticate();

  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('NOTE: SEED_ADMIN_PASSWORD is not set — using the documented dev default. Set a strong value in backend/.env for real use.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [admin, created] = await Admin.findOrCreate({
    where: { username },
    defaults: {
      firstName: 'System',
      lastName: 'Admin',
      username,
      passwordHash,
    },
  });

  if (created) {
    console.log('Admin account created:');
  } else {
    console.log('Admin account already existed:');
  }
  console.log(`  username: ${username}`);
  console.log('  (Change this password immediately after first login.)');

  await sequelize.close();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
