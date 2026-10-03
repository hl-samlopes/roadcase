import { execFileSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "argon2";
import pg from "pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { seed } from "../../prisma/seed/run.ts";
import { accounts, brandedOrganization, E2E_DATABASE_URL, ids, items } from "./fixtures.ts";

/**
 * Rebuilds the e2e database: create it if needed, apply migrations, wipe all
 * rows, then load the standard seed plus a few locations, items and users.
 */
export default async function globalSetup() {
  const url = new URL(E2E_DATABASE_URL);
  const databaseName = url.pathname.slice(1);
  if (!databaseName.endsWith("_e2e")) {
    throw new Error(`Refusing to reset "${databaseName}": e2e database names must end in _e2e.`);
  }

  const admin = new pg.Client({ connectionString: new URL("/postgres", url).toString() });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [databaseName]);
  if (exists.rowCount === 0) await admin.query(`create database "${databaseName}"`);
  await admin.end();

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: "ignore",
  });

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: E2E_DATABASE_URL }),
  });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `truncate table ${tables.map((t) => `"${t.tablename}"`).join(", ")} cascade`,
    );

    await seed(
      prisma,
      {
        SEED_ADMIN_USERNAME: accounts.admin.username,
        SEED_ADMIN_PASSWORD: accounts.admin.password,
        SEED_ADMIN_EMAIL: "e2e-admin@example.com",
        SEED_ADMIN_DISPLAY_NAME: "E2E Admin",
      },
      () => {},
    );
    await loadFixtures(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

async function loadFixtures(prisma: PrismaClient) {
  const org = await prisma.organization.findFirstOrThrow({ where: { slug: "hume" } });
  const hlk = await prisma.campus.findFirstOrThrow({ where: { code: "HLK" } });
  const hne = await prisma.campus.findFirstOrThrow({ where: { code: "HNE" } });
  const audio = await prisma.category.findFirstOrThrow({ where: { name: "Audio" } });
  const organizationId = org.id;

  await prisma.location.createMany({
    data: [
      { id: ids.meadowRanch, organizationId, campusId: hlk.id, name: "Meadow Ranch", code: "MR" },
      { id: ids.hneMain, organizationId, campusId: hne.id, name: "Main Auditorium" },
    ],
  });
  await prisma.department.create({
    data: {
      id: ids.production,
      organizationId,
      name: "Production",
      locations: {
        create: [{ locationId: ids.meadowRanch }, { locationId: ids.hneMain }],
      },
    },
  });
  await prisma.item.createMany({
    data: [
      {
        ...items.hlk,
        organizationId,
        campusId: hlk.id,
        locationId: ids.meadowRanch,
        departmentId: ids.production,
        categoryId: audio.id,
      },
      {
        ...items.hne,
        organizationId,
        campusId: hne.id,
        locationId: ids.hneMain,
        departmentId: ids.production,
        categoryId: audio.id,
      },
    ],
  });
  await prisma.campus.updateMany({
    where: { id: { in: [hlk.id, hne.id] } },
    data: { itemSequence: 1 },
  });

  const user = async (
    account: { username: string; password: string },
    displayName: string,
    grant: {
      level: "VIEWER" | "EDITOR";
      scopeType: "ORGANIZATION" | "LOCATION";
      locationId?: string;
    },
  ) =>
    prisma.user.create({
      data: {
        organizationId,
        username: account.username,
        passwordHash: await hash(account.password),
        displayName,
        email: `${account.username}@example.com`,
        grants: { create: { organizationId, ...grant } },
      },
    });

  await user(accounts.meadowRanchEditor, "Meadow Ranch Editor", {
    level: "EDITOR",
    scopeType: "LOCATION",
    locationId: ids.meadowRanch,
  });
  await user(accounts.passwordChanger, "Password Changer", {
    level: "VIEWER",
    scopeType: "ORGANIZATION",
  });
  await user(accounts.toDeactivate, "Soon Deactivated", {
    level: "VIEWER",
    scopeType: "ORGANIZATION",
  });
  await user(accounts.preferences, "Preference Tester", {
    level: "VIEWER",
    scopeType: "ORGANIZATION",
  });
  await user(accounts.textSize, "Text Size Tester", {
    level: "VIEWER",
    scopeType: "ORGANIZATION",
  });
  await user(accounts.campusSwitcher, "Campus Switcher", {
    level: "VIEWER",
    scopeType: "ORGANIZATION",
  });

  await prisma.organization.create({
    data: {
      slug: brandedOrganization.slug,
      name: brandedOrganization.name,
      branding: {
        create: {
          displayName: brandedOrganization.displayName,
          signInHeadline: brandedOrganization.signInHeadline,
          signInMessage: brandedOrganization.signInMessage,
          lightTokens: { accent: brandedOrganization.lightAccent },
        },
      },
    },
  });
}
