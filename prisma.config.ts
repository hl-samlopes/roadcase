import { defineConfig } from "prisma/config";

// Prisma 7 no longer reads .env on its own; Node's built-in loader does it
// without adding a dependency. A missing .env is fine (CI sets real env vars).
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
