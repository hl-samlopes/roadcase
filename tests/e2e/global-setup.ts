import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, openSync, writeSync } from "node:fs";
import { createServer } from "node:http";
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "argon2";
import pg from "pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { seed } from "../../prisma/seed/run.ts";
import { placeholderTemplate } from "../../src/lib/contracts/placeholder.ts";
import {
  accounts,
  appearanceOrganization,
  brandedOrganization,
  BULK_ITEM_COUNT,
  E2E_ADMIN_EMAIL,
  E2E_BUCKET,
  E2E_DATABASE_URL,
  E2E_SECRETS_KEY,
  FAKE_SLACK_URL,
  MAILPIT_URL,
  notifyOrganization,
  existingTicket,
  ids,
  items,
  serialField,
} from "./fixtures.ts";

/**
 * Rebuilds the e2e database: create it if needed, apply migrations, wipe all
 * rows and queued jobs, then load the standard seed plus a few locations,
 * items and users. Then starts a background worker on that database, and
 * returns the teardown that stops it.
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

  await resetBucket();

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
    // pg-boss recreates its schema when the worker starts.
    await prisma.$executeRawUnsafe("drop schema if exists pgboss cascade");

    await seed(
      prisma,
      {
        SEED_ADMIN_USERNAME: accounts.admin.username,
        SEED_ADMIN_PASSWORD: accounts.admin.password,
        SEED_ADMIN_EMAIL: E2E_ADMIN_EMAIL,
        SEED_ADMIN_DISPLAY_NAME: "E2E Admin",
      },
      () => {},
    );
    await loadFixtures(prisma);
    await loadNotifyOrganization(prisma);
  } finally {
    await prisma.$disconnect();
  }

  const stopSlack = await startFakeSlack();
  const stopWorker = await startWorker();
  return async () => {
    await stopWorker();
    await stopSlack();
  };
}

/**
 * Records what the worker posts to Slack webhooks. GET /__posts returns them
 * as [{ path, body }]; a path containing "fail" answers 500 like a broken webhook.
 */
async function startFakeSlack() {
  const posts: { path: string; body: unknown }[] = [];
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/__posts") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(posts));
      return;
    }
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    request.on("end", () => {
      const path = request.url ?? "/";
      if (path.includes("fail")) {
        response.statusCode = 500;
        response.end("internal_error");
        return;
      }
      posts.push({ path, body: JSON.parse(raw || "null") });
      response.end("ok");
    });
  });
  const { port } = new URL(FAKE_SLACK_URL);
  await new Promise<void>((resolve) => server.listen(Number(port), resolve));
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}

/**
 * Runs `npm run worker`'s command against the e2e database, with the test-only
 * queue enabled. Its output goes to test-results/e2e-worker.log.
 */
async function startWorker() {
  mkdirSync("test-results", { recursive: true });
  const log = openSync("test-results/e2e-worker.log", "w");
  const worker = spawn(
    process.execPath,
    ["--import", "./src/worker/resolve-hooks.ts", "src/worker/main.ts"],
    {
      env: {
        ...process.env,
        DATABASE_URL: E2E_DATABASE_URL,
        JOBS_TEST_QUEUE: "1",
        EMAIL_PROVIDER: "mailpit",
        MAILPIT_URL,
        APP_URL: "http://localhost:3100",
        SECRETS_ENCRYPTION_KEY: E2E_SECRETS_KEY,
        SLACK_WEBHOOK_TEST_ORIGINS: FAKE_SLACK_URL,
        S3_BUCKET: E2E_BUCKET,
        S3_PUBLIC_BASE_URL: `http://localhost:9000/${E2E_BUCKET}`,
      },
      stdio: ["ignore", "pipe", log],
    },
  );
  const output = worker.stdout;
  if (!output) throw new Error("The e2e worker has no output stream");
  output.on("data", (chunk: Buffer) => writeSync(log, chunk));

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The e2e worker didn't start; see test-results/e2e-worker.log")),
      30_000,
    );
    worker.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`The e2e worker exited (${code}); see test-results/e2e-worker.log`));
    });
    output.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("[worker] Ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return async () => {
    if (worker.exitCode !== null) return;
    const exited = new Promise((resolve) => worker.once("exit", resolve));
    worker.kill("SIGTERM");
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 25_000))]);
    if (worker.exitCode === null) worker.kill("SIGKILL");
  };
}

/** Creates or empties the e2e bucket; its branding/ prefix is public like in dev. */
async function resetBucket() {
  try {
    process.loadEnvFile();
  } catch {}
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "roadcase",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "roadcase-dev-secret",
    },
  });
  const exists = await s3
    .send(new HeadBucketCommand({ Bucket: E2E_BUCKET }))
    .then(() => true)
    .catch(() => false);
  if (!exists) await s3.send(new CreateBucketCommand({ Bucket: E2E_BUCKET }));
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: E2E_BUCKET,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${E2E_BUCKET}/branding/*`],
          },
        ],
      }),
    }),
  );
  for (;;) {
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: E2E_BUCKET }));
    const keys = (listed.Contents ?? []).flatMap((object) =>
      object.Key ? [{ Key: object.Key }] : [],
    );
    if (keys.length === 0) break;
    await s3.send(new DeleteObjectsCommand({ Bucket: E2E_BUCKET, Delete: { Objects: keys } }));
  }
}

async function loadFixtures(prisma: PrismaClient) {
  const org = await prisma.organization.findFirstOrThrow({ where: { slug: "hume" } });
  const hlk = await prisma.campus.findFirstOrThrow({ where: { code: "HLK" } });
  const hne = await prisma.campus.findFirstOrThrow({ where: { code: "HNE" } });
  const hsc = await prisma.campus.findFirstOrThrow({ where: { code: "HSC" } });
  const audio = await prisma.category.findFirstOrThrow({ where: { name: "Audio" } });
  const lighting = await prisma.category.findFirstOrThrow({ where: { name: "Lighting" } });
  const good = await prisma.itemCondition.findFirstOrThrow({
    where: { organizationId: org.id, isDefault: true },
  });
  const organizationId = org.id;

  await prisma.location.createMany({
    data: [
      { id: ids.meadowRanch, organizationId, campusId: hlk.id, name: "Meadow Ranch", code: "MR" },
      { id: ids.hneMain, organizationId, campusId: hne.id, name: "Main Auditorium" },
      { id: ids.hscWarehouse, organizationId, campusId: hsc.id, name: "Warehouse" },
    ],
  });
  await prisma.department.create({
    data: {
      id: ids.production,
      organizationId,
      name: "Production",
      locations: {
        create: [
          { locationId: ids.meadowRanch },
          { locationId: ids.hneMain },
          { locationId: ids.hscWarehouse },
        ],
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
        conditionId: good.id,
      },
      {
        ...items.hne,
        organizationId,
        campusId: hne.id,
        locationId: ids.hneMain,
        departmentId: ids.production,
        categoryId: audio.id,
        conditionId: good.id,
      },
      {
        ...items.speaker,
        organizationId,
        campusId: hlk.id,
        locationId: ids.meadowRanch,
        departmentId: ids.production,
        categoryId: audio.id,
        conditionId: good.id,
      },
      {
        ...items.desk,
        organizationId,
        campusId: hne.id,
        locationId: ids.hneMain,
        departmentId: ids.production,
        categoryId: lighting.id,
        conditionId: good.id,
      },
    ],
  });
  const cabling = await prisma.category.findFirstOrThrow({ where: { name: "Cabling" } });
  await prisma.item.createMany({
    data: Array.from({ length: BULK_ITEM_COUNT }, (_, index) => ({
      code: `HSC-${String(index + 1).padStart(6, "0")}`,
      name: `XLR cable ${String(index + 1).padStart(3, "0")}`,
      organizationId,
      campusId: hsc.id,
      locationId: ids.hscWarehouse,
      departmentId: ids.production,
      categoryId: cabling.id,
      conditionId: good.id,
    })),
  });
  await prisma.campus.updateMany({
    where: { id: { in: [hlk.id, hne.id] } },
    data: { itemSequence: 2 },
  });
  await prisma.campus.update({ where: { id: hsc.id }, data: { itemSequence: BULK_ITEM_COUNT } });
  await prisma.fieldDefinition.create({
    data: { organizationId, key: serialField.key, label: serialField.label, type: "TEXT" },
  });

  const user = async (
    account: { username: string; password: string },
    displayName: string,
    grant: {
      level: "VIEWER" | "COMMENTER" | "EDITOR";
      scopeType: "ORGANIZATION" | "LOCATION" | "DEPARTMENT";
      locationId?: string;
      departmentId?: string;
      canSubmitTickets?: boolean;
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
  await user(accounts.toRename, "Jordan Smith", {
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

  await user(accounts.ticketSubmitter, "Food Service Manager", {
    level: "VIEWER",
    scopeType: "DEPARTMENT",
    departmentId: ids.production,
    canSubmitTickets: true,
  });
  await user(accounts.lockout, "Lockout Tester", {
    level: "VIEWER",
    scopeType: "ORGANIZATION",
  });
  await user(accounts.commenter, "Casey Commenter", {
    level: "COMMENTER",
    scopeType: "ORGANIZATION",
  });

  const admin = await prisma.user.findFirstOrThrow({
    where: { organizationId, username: accounts.admin.username },
  });
  await prisma.organization.update({
    where: { id: organizationId },
    data: { ticketSequence: existingTicket.number },
  });
  await prisma.serviceTicket.create({
    data: {
      id: existingTicket.id,
      number: existingTicket.number,
      title: existingTicket.title,
      organizationId,
      campusId: hne.id,
      locationId: ids.hneMain,
      departmentId: ids.production,
      itemId: items.hne.id,
      reporterId: admin.id,
      events: { create: { type: "CREATED", actorId: admin.id, toStatus: "OPEN" } },
    },
  });

  const fieldhouse = await prisma.organization.create({
    data: {
      slug: appearanceOrganization.slug,
      name: appearanceOrganization.name,
      branding: { create: {} },
      campuses: { create: { code: appearanceOrganization.campusCode, name: "Fieldhouse" } },
    },
    include: { campuses: true },
  });
  for (const [account, displayName, level] of [
    [appearanceOrganization.admin, "Fieldhouse Admin", "ADMIN"],
    [appearanceOrganization.viewer, "Fieldhouse Viewer", "VIEWER"],
  ] as const) {
    await prisma.user.create({
      data: {
        organizationId: fieldhouse.id,
        username: account.username,
        passwordHash: await hash(account.password),
        displayName,
        email: `${account.username}@example.com`,
        grants: {
          create: { organizationId: fieldhouse.id, level, scopeType: "ORGANIZATION" },
        },
      },
    });
  }
  await prisma.user.create({
    data: {
      organizationId: fieldhouse.id,
      username: appearanceOrganization.campusAdmin.username,
      passwordHash: await hash(appearanceOrganization.campusAdmin.password),
      displayName: "Fieldhouse Campus Admin",
      email: `${appearanceOrganization.campusAdmin.username}@example.com`,
      grants: {
        create: {
          organizationId: fieldhouse.id,
          level: "ADMIN",
          scopeType: "CAMPUS",
          campusId: fieldhouse.campuses[0].id,
        },
      },
    },
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

/** Signal Camps: two campuses, one item, and people who should and shouldn't hear about it. */
async function loadNotifyOrganization(prisma: PrismaClient) {
  const o = notifyOrganization;
  const org = await prisma.organization.create({
    data: {
      slug: o.slug,
      name: o.name,
      branding: { create: {} },
      campuses: {
        create: [
          { id: o.north.id, code: o.north.code, name: o.north.name, itemSequence: 4 },
          { id: o.south.id, code: o.south.code, name: o.south.name, itemSequence: 1 },
        ],
      },
      categories: { create: { name: "Audio" } },
      itemConditions: {
        create: [
          { label: "Good", isDefault: true, availableForCheckout: true, position: 0 },
          { label: "Poor", position: 1 },
        ],
      },
    },
    include: { categories: true, itemConditions: { orderBy: { position: "asc" } } },
  });
  const [good, poor] = org.itemConditions;
  const organizationId = org.id;
  await prisma.location.createMany({
    data: [
      { id: o.locationId, organizationId, campusId: o.north.id, name: "North Hall" },
      { id: o.southLocationId, organizationId, campusId: o.south.id, name: "South Hall" },
    ],
  });
  await prisma.department.create({
    data: {
      id: o.departmentId,
      organizationId,
      name: "Production",
      locations: { create: [{ locationId: o.locationId }, { locationId: o.southLocationId }] },
    },
  });
  const north = { campusId: o.north.id, locationId: o.locationId };
  const south = { campusId: o.south.id, locationId: o.southLocationId };
  await prisma.item.createMany({
    data: [
      { ...o.item, ...north, conditionId: good.id },
      { ...o.micStand, ...north, conditionId: good.id },
      { ...o.oldDiBox, ...north, conditionId: poor.id },
      { ...o.southMixer, ...south, conditionId: good.id },
      { ...o.bandCamp.item, ...north, conditionId: good.id },
    ].map((item) => ({
      ...item,
      organizationId,
      departmentId: o.departmentId,
      categoryId: org.categories[0].id,
    })),
  });

  const people = [
    [o.admin, "Signal Admin", { level: "ADMIN", scopeType: "ORGANIZATION" }],
    [o.editor, "Signal Editor", { level: "EDITOR", scopeType: "CAMPUS", campusId: o.north.id }],
    [o.optedOut, "Quiet Editor", { level: "EDITOR", scopeType: "CAMPUS", campusId: o.north.id }],
    [
      o.reporter,
      "Signal Reporter",
      { level: "COMMENTER", scopeType: "CAMPUS", campusId: o.north.id },
    ],
    [o.southEditor, "South Editor", { level: "EDITOR", scopeType: "CAMPUS", campusId: o.south.id }],
  ] as const;
  for (const [account, displayName, grant] of people) {
    await prisma.user.create({
      data: {
        organizationId,
        username: account.username,
        passwordHash: await hash(account.password),
        displayName,
        email: `${account.username}@example.com`,
        grants: { create: { organizationId, ...grant } },
        ...(account === o.optedOut ? { preference: { create: { emailTicketOpened: false } } } : {}),
      },
    });
  }

  // A draft check-out for contract previews. Its number is far from the
  // sequence the check-out tests use (#1, #2), which stays at 0 here.
  const admin = await prisma.user.findFirstOrThrow({
    where: { organizationId, username: o.admin.username },
  });
  const speaker = await prisma.item.findFirstOrThrow({
    where: { organizationId, code: o.bandCamp.item.code },
  });
  await prisma.checkout.create({
    data: {
      id: o.bandCamp.id,
      organizationId,
      campusId: o.north.id,
      number: o.bandCamp.number,
      groupName: o.bandCamp.group,
      guestRepName: "Riley Band",
      guestRepEmail: "riley@example.com",
      guestRepPhone: "(555) 222-3333",
      staffRepId: admin.id,
      dateOut: new Date("2030-03-01T00:00:00Z"),
      dateDue: new Date("2030-03-05T00:00:00Z"),
      lines: {
        create: { organizationId, itemId: speaker.id, fee: o.bandCamp.fee, addedById: admin.id },
      },
    },
  });

  // South has a template (the placeholder) and a draft to prepare and sign.
  const southEditor = await prisma.user.findFirstOrThrow({
    where: { organizationId, username: o.southEditor.username },
  });
  const mixer = await prisma.item.findFirstOrThrow({
    where: { organizationId, code: o.southMixer.code },
  });
  await prisma.contractTemplateVersion.create({
    data: {
      organizationId,
      campusId: o.south.id,
      version: 1,
      content: placeholderTemplate,
      createdById: admin.id,
    },
  });
  await prisma.checkout.create({
    data: {
      id: o.choir.id,
      organizationId,
      campusId: o.south.id,
      number: o.choir.number,
      groupName: o.choir.group,
      guestRepName: o.choir.guestName,
      guestRepEmail: o.choir.guestEmail,
      guestRepPhone: "(555) 444-5555",
      staffRepId: southEditor.id,
      dateOut: new Date("2030-04-01T00:00:00Z"),
      dateDue: new Date("2030-04-03T00:00:00Z"),
      lines: {
        create: { organizationId, itemId: mixer.id, fee: o.choir.fee, addedById: southEditor.id },
      },
    },
  });
}
