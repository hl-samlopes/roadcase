import { hash } from "argon2";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { campuses, categories, organization } from "./data.ts";
import type { SeedEnv } from "./env.ts";

/**
 * Creates the first organization, its campuses, an admin account and the
 * default categories. Safe to run repeatedly: existing rows are left as they
 * are (including the admin's password), and only missing rows are created.
 */
export async function seed(prisma: PrismaClient, env: SeedEnv, log: (message: string) => void) {
  const passwordHash = await hash(env.SEED_ADMIN_PASSWORD);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.upsert({
      where: { slug: organization.slug },
      create: organization,
      update: {},
    });

    await tx.organizationBranding.upsert({
      where: { organizationId: org.id },
      create: { organizationId: org.id },
      update: {},
    });

    for (const campus of campuses) {
      await tx.campus.upsert({
        where: { organizationId_code: { organizationId: org.id, code: campus.code } },
        create: { ...campus, organizationId: org.id },
        update: {},
      });
    }

    const admin = await tx.user.upsert({
      where: {
        organizationId_username: { organizationId: org.id, username: env.SEED_ADMIN_USERNAME },
      },
      create: {
        organizationId: org.id,
        username: env.SEED_ADMIN_USERNAME,
        passwordHash,
        displayName: env.SEED_ADMIN_DISPLAY_NAME,
        email: env.SEED_ADMIN_EMAIL,
        role: "Administrator",
        preference: { create: {} },
      },
      update: {},
    });

    const adminGrant = await tx.permissionGrant.findFirst({
      where: { userId: admin.id, level: "ADMIN", scopeType: "ORGANIZATION" },
    });
    if (!adminGrant) {
      await tx.permissionGrant.create({
        data: {
          organizationId: org.id,
          userId: admin.id,
          level: "ADMIN",
          scopeType: "ORGANIZATION",
        },
      });
    }

    for (const [categoryIndex, category] of categories.entries()) {
      const row = await tx.category.upsert({
        where: { organizationId_name: { organizationId: org.id, name: category.name } },
        create: { organizationId: org.id, name: category.name, position: categoryIndex },
        update: {},
      });
      for (const [subIndex, name] of category.subcategories.entries()) {
        await tx.subcategory.upsert({
          where: { categoryId_name: { categoryId: row.id, name } },
          create: { categoryId: row.id, name, position: subIndex },
          update: {},
        });
      }
    }

    log(`Organization "${org.name}" (${org.slug})`);
    log(`Campuses: ${campuses.map((c) => c.code).join(", ")}`);
    log(`Admin user: ${admin.username} (organization-wide admin)`);
    log(`Categories: ${categories.map((c) => c.name).join(", ")}`);
  });
}
