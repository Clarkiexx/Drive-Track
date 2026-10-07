import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma 7 project config (Phase A — Neon migration scaffold).
 *
 * The Express/Sequelize app is completely unaware of this file: it only
 * drives `prisma generate` / `prisma db push` and the migration scripts.
 *
 * Paths below are resolved relative to this config file (backend/).
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',

  // CLI + migration commands ALWAYS talk to the DIRECT (unpooled) Neon
  // endpoint. Never run DDL through the pooler — pooled connections do not
  // support transactions the way `db push` expects.
  datasource: {
    url: env('DATABASE_URL_UNPOOLED'),
  },

  migrations: {
    path: 'prisma/migrations',
  },
});
