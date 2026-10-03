import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { parseSeedEnv } from "./seed/env.ts";
import { seed } from "./seed/run.ts";

try {
  process.loadEnvFile();
} catch {}

const env = parseSeedEnv(process.env);
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

try {
  await seed(prisma, env, (message) => console.log(`  ${message}`));
  console.log("Seed complete.");
} finally {
  await prisma.$disconnect();
}
