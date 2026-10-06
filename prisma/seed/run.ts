import { hash } from "argon2";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { campuses, categories, itemConditions, organization } from "./data.ts";
import type { SeedEnv } from "./env.ts";

/**
 * Creates the first organization, its campuses, an admin account, and the
 * default categories and item conditions. Safe to run repeatedly without
 * undoing edits made in the app:
 * - missing campuses are added; existing ones are left as they are;
 * - the admin is created only while the organization has no active
 *   organization-wide admin (so renaming the admin never creates a second one);
 * - default categories and conditions are added only to an organization that
 *   has none yet (so renamed or removed defaults stay that way).
 */
export async function seed(prisma: PrismaClient, env: SeedEnv, log: (message: string) => void) {
  const passwordHash = await hash(env.SEED_ADMIN_PASSWORD);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.upsert({
      where: { slug: organization.slug },
      create: organization,
      update: {},
    });
    log(`Organization "${org.name}" (${org.slug})`);

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
    log(`Campuses: ${campuses.map((c) => c.code).join(", ")}`);

    const hasAdmin = await tx.permissionGrant.count({
      where: {
        organizationId: org.id,
        level: "ADMIN",
        scopeType: "ORGANIZATION",
        user: { isActive: true },
      },
    });
    if (hasAdmin === 0) {
      const taken = await tx.user.findFirst({
        where: { organizationId: org.id, username: env.SEED_ADMIN_USERNAME },
        select: { id: true },
      });
      if (taken) {
        throw new Error(
          `The organization has no active admin, but username "${env.SEED_ADMIN_USERNAME}" is taken. Choose another SEED_ADMIN_USERNAME.`,
        );
      }
      await tx.user.create({
        data: {
          organizationId: org.id,
          username: env.SEED_ADMIN_USERNAME,
          passwordHash,
          displayName: env.SEED_ADMIN_DISPLAY_NAME,
          email: env.SEED_ADMIN_EMAIL,
          role: "Administrator",
          preference: { create: {} },
          grants: {
            create: { organizationId: org.id, level: "ADMIN", scopeType: "ORGANIZATION" },
          },
        },
      });
      log(`Admin user: ${env.SEED_ADMIN_USERNAME} (organization-wide admin)`);
    } else {
      log("Admin user: an organization admin already exists; none created");
    }

    if ((await tx.category.count({ where: { organizationId: org.id } })) === 0) {
      for (const [position, category] of categories.entries()) {
        await tx.category.create({
          data: {
            organizationId: org.id,
            name: category.name,
            position,
            subcategories: {
              create: category.subcategories.map((name, subPosition) => ({
                name,
                position: subPosition,
              })),
            },
          },
        });
      }
      log(`Categories: ${categories.map((c) => c.name).join(", ")}`);
    } else {
      log("Categories: already set up; left unchanged");
    }

    if ((await tx.itemCondition.count({ where: { organizationId: org.id } })) === 0) {
      await tx.itemCondition.createMany({
        data: itemConditions.map((condition, position) => ({
          organizationId: org.id,
          label: condition.label,
          position,
          isDefault: condition.isDefault ?? false,
          startsRepairTicket: condition.startsRepairTicket ?? false,
          availableForCheckout: condition.availableForCheckout ?? false,
        })),
      });
      log(`Item conditions: ${itemConditions.map((c) => c.label).join(", ")}`);
    } else {
      log("Item conditions: already set up; left unchanged");
    }
  });
}
