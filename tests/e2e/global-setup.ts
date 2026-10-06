import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { createServer } from "node:http";
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "argon2";
import pg from "pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { addDefaultBandPositions, seed } from "../../prisma/seed/run.ts";
import { appTimeZone, dateInZone } from "../../src/lib/checkouts/overdue.ts";
import { placeholderTemplate } from "../../src/lib/contracts/placeholder.ts";
import { hashPortalToken } from "../../src/lib/portal/token.ts";
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
  harborOrganization,
  MAILPIT_URL,
  notifyOrganization,
  portalOrganization,
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
    await loadHarborOrganization(prisma);
    await loadPortalOrganization(prisma);
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
function s3Client() {
  try {
    process.loadEnvFile();
  } catch {}
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "roadcase",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "roadcase-dev-secret",
    },
  });
}

async function resetBucket() {
  const s3 = s3Client();
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

/** Harbor Camps: two check-outs that are out, one to check in and one overdue. */
async function loadHarborOrganization(prisma: PrismaClient) {
  const o = harborOrganization;
  const org = await prisma.organization.create({
    data: {
      slug: o.slug,
      name: o.name,
      checkoutSequence: 2,
      branding: { create: {} },
      campuses: {
        create: { id: o.campus.id, code: o.campus.code, name: o.campus.name, itemSequence: 4 },
      },
      categories: { create: { name: "Audio" } },
      itemConditions: {
        create: [
          { label: "Good", isDefault: true, availableForCheckout: true, position: 0 },
          { label: "Needs repair", startsRepairTicket: true, position: 1 },
        ],
      },
    },
    include: { categories: true, itemConditions: { orderBy: { position: "asc" } } },
  });
  const organizationId = org.id;
  const [good] = org.itemConditions;
  await prisma.location.create({
    data: { id: o.locationId, organizationId, campusId: o.campus.id, name: "Boathouse" },
  });
  await prisma.department.create({
    data: {
      id: o.departmentId,
      organizationId,
      name: "Production",
      locations: { create: { locationId: o.locationId } },
    },
  });
  const editor = await prisma.user.create({
    data: {
      organizationId,
      username: o.editor.username,
      passwordHash: await hash(o.editor.password),
      displayName: "Harbor Editor",
      email: `${o.editor.username}@example.com`,
      grants: {
        create: { organizationId, level: "EDITOR", scopeType: "CAMPUS", campusId: o.campus.id },
      },
    },
  });
  const item = (fields: { code: string; name: string }) =>
    prisma.item.create({
      data: {
        ...fields,
        organizationId,
        campusId: o.campus.id,
        locationId: o.locationId,
        departmentId: o.departmentId,
        categoryId: org.categories[0].id,
        conditionId: good.id,
      },
    });
  const [mic, amp, pa] = [await item(o.mic), await item(o.amp), await item(o.pa)];
  await item(o.spare);

  // "Yesterday" where the organization is, so the worker's first scan sees it overdue.
  const today = dateInZone(new Date(), appTimeZone());
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000);
  const out = (
    fields: { id: string; number: number; group: string },
    dateDue: Date,
    items: { id: string }[],
  ) =>
    prisma.checkout.create({
      data: {
        id: fields.id,
        organizationId,
        campusId: o.campus.id,
        number: fields.number,
        status: "OUT",
        groupName: fields.group,
        guestRepName: "Casey Harbor",
        guestRepEmail: "casey@example.com",
        guestRepPhone: "(555) 777-8888",
        staffRepId: editor.id,
        createdById: editor.id,
        dateOut: new Date(yesterday.getTime() - 3 * 86_400_000),
        dateDue,
        lines: {
          create: items.map((i) => ({ organizationId, itemId: i.id, addedById: editor.id })),
        },
      },
    });
  await out(o.band, new Date("2030-06-01T00:00:00Z"), [mic, amp]);
  await out(o.sailing, yesterday, [pa]);
}

/** Lakeside Camps: the guest portal catalog (see portalOrganization in fixtures.ts). */
async function loadPortalOrganization(prisma: PrismaClient) {
  const o = portalOrganization;
  const org = await prisma.organization.create({
    data: {
      slug: o.slug,
      name: o.name,
      checkoutSequence: 1,
      branding: { create: {} },
      campuses: {
        create: [
          { id: o.campus.id, code: o.campus.code, name: o.campus.name, itemSequence: 20 },
          { id: o.north.id, code: o.north.code, name: o.north.name, itemSequence: 5 },
        ],
      },
      categories: {
        create: [
          {
            name: "Microphones",
            position: 0,
            showInPortal: true,
            portalDescription: o.micsDescription,
          },
          { name: "Cables", position: 1, showInPortal: true },
          { name: "Lighting", position: 2 },
          { name: "Staging", position: 3 },
        ],
      },
      itemConditions: {
        create: [
          { label: "Good", isDefault: true, availableForCheckout: true, position: 0 },
          { label: "Needs repair", startsRepairTicket: true, position: 1 },
        ],
      },
    },
    include: { categories: true, itemConditions: { orderBy: { position: "asc" } } },
  });
  const organizationId = org.id;
  const [good, repair] = org.itemConditions;
  const category = (name: string) => org.categories.find((c) => c.name === name)!.id;
  await prisma.location.createMany({
    data: [
      { id: o.locationId, organizationId, campusId: o.campus.id, name: "Lodge" },
      { id: o.northLocationId, organizationId, campusId: o.north.id, name: "North barn" },
    ],
  });
  await prisma.department.create({
    data: {
      id: o.departmentId,
      organizationId,
      name: "Production",
      locations: { create: [{ locationId: o.locationId }, { locationId: o.northLocationId }] },
    },
  });
  const admin = await prisma.user.create({
    data: {
      organizationId,
      username: o.admin.username,
      passwordHash: await hash(o.admin.password),
      displayName: "Lakeside Admin",
      email: `${o.admin.username}@example.com`,
      grants: { create: { organizationId, level: "ADMIN", scopeType: "ORGANIZATION" } },
    },
  });

  await prisma.user.create({
    data: {
      organizationId,
      username: o.quietEditor.username,
      passwordHash: await hash(o.quietEditor.password),
      displayName: "Quiet Editor",
      email: `${o.quietEditor.username}@example.com`,
      grants: {
        create: { organizationId, level: "EDITOR", scopeType: "CAMPUS", campusId: o.campus.id },
      },
      preference: { create: { emailRequestSent: false } },
    },
  });
  await prisma.user.create({
    data: {
      organizationId,
      username: o.northEditor.username,
      passwordHash: await hash(o.northEditor.password),
      displayName: "North Editor",
      email: `${o.northEditor.username}@example.com`,
      grants: {
        create: { organizationId, level: "EDITOR", scopeType: "CAMPUS", campusId: o.north.id },
      },
    },
  });

  const sequence = { [o.campus.id]: 0, [o.north.id]: 0 };
  const item = (
    name: string,
    categoryName: string,
    options: { north?: boolean; repair?: boolean } = {},
  ) => {
    const campus = options.north ? o.north : o.campus;
    sequence[campus.id] += 1;
    return prisma.item.create({
      data: {
        organizationId,
        campusId: campus.id,
        locationId: options.north ? o.northLocationId : o.locationId,
        departmentId: o.departmentId,
        code: `${campus.code}-${String(sequence[campus.id]).padStart(6, "0")}`,
        name,
        categoryId: category(categoryName),
        conditionId: options.repair ? repair.id : good.id,
      },
    });
  };
  const sm58s = [];
  for (let i = 0; i < 4; i++) sm58s.push(await item("SM58", "Microphones"));
  await item("SM58", "Microphones", { repair: true });
  await item("SM58", "Microphones", { north: true });
  const betas = [await item("Beta 58", "Microphones"), await item("Beta 58", "Microphones")];
  await item("XLR cable", "Cables", { repair: true });
  const parCan = await item("Par can", "Lighting");
  await item("Riser", "Staging");

  // Main photos: one SM58's (shown in the portal) and the Par can's (never shown).
  const png = readFileSync("tests/e2e/files/speaker.png");
  const s3 = s3Client();
  for (const [id, itemId] of [
    [o.sm58PhotoId, sm58s[0].id],
    [o.hiddenPhotoId, parCan.id],
  ]) {
    const storageKey = `items/${itemId}/${id}.png`;
    await s3.send(
      new PutObjectCommand({
        Bucket: E2E_BUCKET,
        Key: storageKey,
        Body: png,
        ContentType: "image/png",
      }),
    );
    await prisma.attachment.create({
      data: {
        id,
        organizationId,
        kind: "PHOTO",
        storageKey,
        fileName: "photo.png",
        contentType: "image/png",
        sizeBytes: png.length,
        itemId,
      },
    });
    await prisma.item.update({ where: { id: itemId }, data: { primaryPhotoId: id } });
  }

  const today = Date.parse(`${dateInZone(new Date(), appTimeZone())}T00:00:00Z`);
  const day = (offset: number) => new Date(today + offset * 86_400_000);
  await addDefaultBandPositions(prisma, organizationId, o.campus.id);
  for (const group of [o.youth, o.choir, o.retreat, o.band, o.campers, o.worship]) {
    await prisma.guestGroup.create({
      data: {
        id: group.id,
        organizationId,
        campusId: o.campus.id,
        name: group.name,
        repName: `${group.name} lead`,
        repEmail: group.email,
        repPhone: "(555) 222-3333",
        arrivalDate: day(group.days[0]),
        departureDate: day(group.days[1]),
        staffContactId: admin.id,
        portalLinks: {
          create: {
            organizationId,
            tokenHash: hashPortalToken(group.token),
            createdById: admin.id,
          },
        },
      },
    });
  }
  // The retreat was approved for one SM58, which the youth's overlapping dates can't use.
  await prisma.equipmentRequest.create({
    data: {
      organizationId,
      campusId: o.campus.id,
      guestGroupId: o.retreat.id,
      status: "APPROVED",
      submittedAt: new Date(),
      lines: {
        create: {
          categoryId: category("Microphones"),
          kindKey: "sm58",
          name: "SM58",
          quantityRequested: 1,
          quantityApproved: 1,
        },
      },
    },
  });
  // A draft check-out over the youth's dates holds one Beta 58.
  await prisma.checkout.create({
    data: {
      organizationId,
      campusId: o.campus.id,
      number: 1,
      groupName: "Lodge rental",
      guestRepName: "Pat Lodge",
      guestRepEmail: "pat@example.com",
      guestRepPhone: "(555) 999-0000",
      staffRepId: admin.id,
      createdById: admin.id,
      dateOut: day(10),
      dateDue: day(12),
      lines: { create: { organizationId, itemId: betas[0].id, addedById: admin.id } },
    },
  });
}
