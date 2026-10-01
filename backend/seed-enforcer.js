// One-time script to create a test Enforcer account, since the Admin's
// "Add Enforcer" screen doesn't exist yet (that's a later module).
// Run this once with: node seed-enforcer.js
// Safe to run again later with different values if you need another test account.

require('dotenv').config();
const bcrypt = require('bcrypt');
const { sequelize, Enforcer } = require('./src/models');

async function seed() {
  await sequelize.authenticate();

  const username = process.env.SEED_ENFORCER_USERNAME || 'jsantos';
  const password = process.env.SEED_ENFORCER_PASSWORD || 'password123';
  if (!process.env.SEED_ENFORCER_PASSWORD) {
    console.log('NOTE: SEED_ENFORCER_PASSWORD is not set — using the documented dev default. Set a strong value in backend/.env for real use.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [enforcer, created] = await Enforcer.findOrCreate({
    where: { username },
    defaults: {
      firstName: 'Juan',
      lastName: 'Santos',
      employeeId: 'ENF-2024-001',
      badgeNumber: 'B-4592',
      station: 'Cordova Station',
      username,
      passwordHash,
      status: 'active',
    },
  });

  if (created) {
    console.log('Test enforcer created:');
  } else {
    console.log('Test enforcer already existed:');
  }
  console.log(`  username: ${username}`);
  console.log('  (Change this password immediately after first login.)');

  await sequelize.close();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
