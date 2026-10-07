// One-time script to create the first Admin account, since there's no
// registration flow for admins by design (CTMO provisions this manually).
// Run once with: npx tsx seed-admin.js

require('dotenv').config();
const bcrypt = require('bcrypt');
const { prisma } = require('./src/lib/prisma');

async function seed() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('NOTE: SEED_ADMIN_PASSWORD is not set — using the documented dev default. Set a strong value in backend/.env for real use.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.admin.findUnique({ where: { username } });
  if (existing) {
    console.log('Admin account already existed:');
  } else {
    await prisma.admin.create({
      data: {
        firstName: 'System',
        lastName: 'Admin',
        username,
        passwordHash,
      },
    });
    console.log('Admin account created:');
  }
  console.log(`  username: ${username}`);
  console.log('  (Change this password immediately after first login.)');

  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
