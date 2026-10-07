import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, TextField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { changePasswordAction } from "./actions";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage({ searchParams }: PageProps<"/account/password">) {
  const user = await requireUser();
  const { changed } = await searchParams;
  const google = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { googleEmail: true, googleLastSignInAt: true },
  });

  return (
    <div className="max-w-md">
      <PageHeader title="Change password" />
      {changed === "1" ? (
        <p role="status" className="rounded-theme border-border bg-surface mb-4 border p-2">
          Done: your password was changed. Other devices have been signed out.
        </p>
      ) : null}
      <Card>
        <ActionForm
          action={changePasswordAction}
          submitLabel="Change password"
          fieldLabels={{
            currentPassword: "Current password",
            newPassword: "New password",
            confirmPassword: "Confirm new password",
          }}
        >
          <TextField
            label="Current password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <TextField
            label="New password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            hint="At least 12 characters."
            required
          />
          <TextField
            label="Confirm new password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </ActionForm>
      </Card>
      {google.googleEmail ? (
        <div className="mt-4">
          <Card title="Google account">
            <p>
              You sign in with Google as <span className="font-semibold">{google.googleEmail}</span>
              , last on {google.googleLastSignInAt?.toLocaleString("en-US") ?? "an unknown date"}.
              To use a different Google account, ask an admin to unlink this one.
            </p>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
