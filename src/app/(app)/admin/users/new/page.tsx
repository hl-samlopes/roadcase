import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { GrantFields, grantFieldLabels } from "@/components/scope-fields";
import { Card, PageHeader, TextField } from "@/components/ui";
import { manageableScopeOptions } from "@/lib/admin/scopes";
import { isAnyAdmin, requireUser } from "@/lib/authz";
import { createUserAction } from "../actions";

export const metadata: Metadata = { title: "New user · Roadcase" };

export default async function NewUserPage() {
  const actor = await requireUser();
  if (!isAnyAdmin(actor)) notFound();
  const scopeOptions = await manageableScopeOptions(actor);

  return (
    <div className="max-w-lg">
      <PageHeader title="New user" />
      <Card>
        <ActionForm
          action={createUserAction}
          submitLabel="Create user"
          pendingLabel="Creating…"
          fieldLabels={{
            username: "Username",
            displayName: "Display name",
            email: "Email",
            role: "Role",
            password: "Password",
            ...grantFieldLabels,
          }}
        >
          <TextField
            label="Username"
            name="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            hint="Letters, numbers, dots, dashes and underscores. Used to sign in."
            required
          />
          <TextField label="Display name" name="displayName" autoComplete="off" required />
          <TextField label="Email" name="email" type="email" autoComplete="off" required />
          <TextField
            label="Role"
            name="role"
            autoComplete="off"
            hint="Job title, for example Audio lead. Optional."
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            hint="At least 12 characters. Share it with the user privately."
            required
          />
          <h2 className="mt-2 text-base">Access</h2>
          <GrantFields scopeOptions={scopeOptions} />
        </ActionForm>
      </Card>
    </div>
  );
}
