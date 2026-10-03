import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { isAnyAdmin, requireUser } from "@/lib/authz";

export const metadata: Metadata = { title: "Settings" };

const sections = [
  { href: "/settings/users", title: "Users", description: "Accounts, access levels and scopes." },
  {
    href: "/settings/appearance",
    title: "Appearance",
    description: "Organization colors, fonts, logos and sign-in page.",
  },
];

export default async function SettingsPage() {
  const user = await requireUser();
  if (!isAnyAdmin(user)) notFound();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-3 md:grid-cols-2">
        {sections.map((section) => (
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
