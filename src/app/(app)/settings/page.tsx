import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { can, isAnyAdmin, requireUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Settings" };

const sections = [
  {
    href: "/settings/users",
    title: "Users",
    description: "Accounts, access levels and scopes.",
    organizationAdminOnly: false,
  },
  {
    href: "/settings/locations",
    title: "Locations and departments",
    description: "Camps and venues on each campus, and where each department keeps equipment.",
    organizationAdminOnly: false,
  },
  {
    href: "/settings/fields",
    title: "Inventory fields",
    description: "Custom fields on every item, such as serial number or wattage.",
    organizationAdminOnly: true,
  },
  {
    href: "/settings/categories",
    title: "Categories",
    description: "The categories and subcategories items are sorted into.",
    organizationAdminOnly: true,
  },
  {
    href: "/settings/conditions",
    title: "Item conditions",
    description:
      "The conditions equipment can be in, which start repair tickets, and which can go out on check-outs.",
    organizationAdminOnly: true,
  },
  {
    href: "/settings/contracts",
    title: "Contract templates",
    description: "Each campus's check-out contract, with merge fields and saved versions.",
    organizationAdminOnly: false,
  },
  {
    href: "/settings/notifications",
    title: "Notifications",
    description: "Slack channels for ticket alerts, test email, and background jobs that failed.",
    organizationAdminOnly: false,
  },
  {
    href: "/settings/appearance",
    title: "Appearance",
    description: "Organization colors, fonts, logos and sign-in page.",
    organizationAdminOnly: true,
  },
];

export default async function SettingsPage() {
  const user = await requireUser();
  if (!isAnyAdmin(user)) notFound();
  const organizationAdmin = can(user, "settings:manage", { organizationId: user.organizationId });
  const visible = sections.filter((s) => organizationAdmin || !s.organizationAdminOnly);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((section) => (
          <Card key={section.href}>
            <h2 className="text-base">
              <Link href={section.href} className="text-accent hover:underline">
                {section.title}
              </Link>
            </h2>
            <p className="text-muted mt-1">{section.description}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
