import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ActionForm } from "@/components/action-form";
import { GrantFields, grantFieldLabels } from "@/components/scope-fields";
import { Card, PageHeader, TextField } from "@/components/ui";
import {
  describeScope,
  grantDetailSelect,
  manageableScopeOptions,
  toGrantScope,
} from "@/lib/admin/scopes";
import { canManageGrantScope, canManageUser, requireUser } from "@/lib/authz";
import { db } from "@/lib/db";
import { levelLabels } from "@/lib/labels";
import {
  addGrantAction,
  removeGrantAction,
  resetPasswordAction,
  setActiveAction,
  updateProfileAction,
} from "../actions";

export const metadata: Metadata = { title: "Manage user" };

export default async function ManageUserPage({
  params,
  searchParams,
}: PageProps<"/settings/users/[id]">) {
  const actor = await requireUser();
  const { id } = await params;
  const { created } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await db.user.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: {
      id: true,
      organizationId: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      isActive: true,
      lastSignInAt: true,
      grants: { select: grantDetailSelect, orderBy: { createdAt: "asc" } },
    },
  });
  if (
    !user ||
    !canManageUser(actor, {
      organizationId: user.organizationId,
      grants: user.grants.map(toGrantScope),
    })
  ) {
    notFound();
  }

  const scopeOptions = await manageableScopeOptions(actor);
  const isSelf = user.id === actor.id;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <Link href="/settings/users" className="text-accent hover:underline">
          Back to users
        </Link>
      </div>
      <PageHeader title={user.displayName} />
      {created === "1" ? (
        <p role="status" className="rounded-theme border-border bg-surface border p-2">
          Done: account created.
        </p>
      ) : null}
      <p className="text-muted">
        Username <span className="text-text font-mono">{user.username}</span> · Status{" "}
        <span className="text-text">{user.isActive ? "Active" : "Deactivated"}</span> · Last sign-in{" "}
        <span className="text-text">{user.lastSignInAt?.toLocaleString("en-US") ?? "Never"}</span>
      </p>

      <Card title="Profile">
        <ActionForm
          action={updateProfileAction.bind(null, user.id)}
          submitLabel="Save profile"
          fieldLabels={{
            username: "Username",
            displayName: "Display name",
            email: "Email",
            role: "Role",
          }}
        >
          <TextField
            label="Username"
            name="username"
            defaultValue={user.username}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            hint="Used to sign in. If you change it, tell the user their new username."
            required
          />
          <TextField
            label="Display name"
            name="displayName"
            defaultValue={user.displayName}
            required
          />
          <TextField label="Email" name="email" type="email" defaultValue={user.email} required />
          <TextField
            label="Role"
            name="role"
            defaultValue={user.role ?? ""}
            hint="Optional job title."
          />
        </ActionForm>
      </Card>

      <Card title="Access">
        {user.grants.length === 0 ? (
          <p className="text-muted mb-3">No access yet.</p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {user.grants.map((grant) => (
              <li
                key={grant.id}
                className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
              >
                <span>
                  <span className="font-semibold">{levelLabels[grant.level]}</span>:{" "}
                  {describeScope(grant)}
                  {grant.canSubmitTickets ? ", can submit tickets" : ""}
                </span>
                {canManageGrantScope(actor, toGrantScope(grant)) ? (
                  <ActionForm
                    action={removeGrantAction.bind(null, user.id, grant.id)}
                    submitLabel={`Remove ${levelLabels[grant.level]} access`}
                    pendingLabel="Removing…"
                    variant="danger"
                    className="flex flex-col items-end gap-1"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <h3 className="mb-2 font-semibold">Add or change access</h3>
        <ActionForm
          action={addGrantAction.bind(null, user.id)}
          submitLabel="Save access"
          fieldLabels={grantFieldLabels}
        >
          <GrantFields scopeOptions={scopeOptions} />
        </ActionForm>
      </Card>

      <Card title="Reset password">
        <ActionForm
          action={resetPasswordAction.bind(null, user.id)}
          submitLabel="Reset password"
          fieldLabels={{ password: "New password" }}
        >
          <TextField
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            hint="Signs the user out on every device."
            required
          />
        </ActionForm>
      </Card>

      {isSelf ? null : (
        <Card title="Account status">
          <ActionForm
            action={setActiveAction.bind(null, user.id, !user.isActive)}
            submitLabel={user.isActive ? "Deactivate account" : "Reactivate account"}
            variant={user.isActive ? "danger" : "secondary"}
          >
            <p className="text-muted">
              {user.isActive
                ? "Deactivated users can't sign in and are signed out right away."
                : "Reactivated users can sign in with their existing password."}
            </p>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
