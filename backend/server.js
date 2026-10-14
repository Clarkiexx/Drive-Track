require('dotenv').config();
const app = require('./src/app');
const { prisma } = require('./src/lib/prisma');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // Cheap round-trip proves the pooled Neon connection works before we
    // accept traffic (replaces the old sequelize.authenticate()).
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection established.');

    // Schema is no longer managed here: `sequelize.sync({ alter })` /
    // DB_SYNC_ALTER are gone. The Postgres schema is owned by Prisma —
    // apply changes with `npm run db:push` (see Docs/NEON_CUTOVER.md).

    app.listen(PORT, () => {
      console.log(`DriveTrack backend running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Unable to start server:', err);
    process.exit(1);
  }
}

start();
