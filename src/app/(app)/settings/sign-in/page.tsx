import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Card, CheckboxField, PageHeader, TextAreaField } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { googleConfigured } from "@/lib/auth/google";
import { db } from "@/lib/db";
import { saveSignInSettingsAction } from "./actions";

export const metadata: Metadata = { title: "Sign-in" };

export default async function SignInSettingsPage() {
  const actor = await requireUser();
  if (!can(actor, "settings:manage", { organizationId: actor.organizationId })) notFound();

  const organization = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { googleAllowedDomains: true, passwordSignIn: true, adminPasswordSignIn: true },
  });
  const configured = googleConfigured();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/settings" className="text-accent hover:underline">
          Back to settings
        </Link>
      </div>
      <PageHeader title="Sign-in" />
      <p className="text-muted">
        Google sign-in lets people use their work Google account. It signs in an existing account
        whose email matches; it never creates accounts, so add people in{" "}
        <Link href="/settings/users" className="text-accent hover:underline">
          Users
        </Link>{" "}
        first.
      </p>
      {configured ? null : (
        <p role="status" className="rounded-theme border-border bg-surface border p-2">
          Google sign-in isn&apos;t set up on this server yet, so only passwords work. Whoever hosts
          Roadcase adds the Google client ID and secret (see docs/DEPLOY.md).
        </p>
      )}
      <Card>
        <ActionForm
          action={saveSignInSettingsAction}
          submitLabel="Save sign-in settings"
          fieldLabels={{ googleAllowedDomains: "Allowed Google domains" }}
        >
          <TextAreaField
            label="Allowed Google domains"
            name="googleAllowedDomains"
            defaultValue={organization.googleAllowedDomains.join("\n")}
            placeholder="hume.org"
            hint="One per line. Only verified Google Workspace accounts in these domains can sign in. Leave empty to turn Google sign-in off."
            rows={3}
            autoCapitalize="none"
            spellCheck={false}
          />
          <CheckboxField
            label="Everyone can sign in with a username and password"
            name="passwordSignIn"
            defaultChecked={organization.passwordSignIn}
            hint="Turn off to make Google the only way in. Passwords always work while Google sign-in is off."
          />
          <CheckboxField
            label="Organization admins can always use a password"
            name="adminPasswordSignIn"
            defaultChecked={organization.adminPasswordSignIn}
            hint="A way back in if Google is unavailable. Recommended."
          />
        </ActionForm>
      </Card>
    </div>
  );
}
