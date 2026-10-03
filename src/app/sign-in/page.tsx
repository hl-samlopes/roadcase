import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { TextField } from "@/components/ui";
import { getCurrentUser } from "@/lib/authz";
import { safeCallbackUrl } from "@/lib/auth/redirect";
import { resolveOrganization } from "@/lib/organization";
import { signInAction } from "./actions";

export const metadata: Metadata = { title: "Sign in · Roadcase" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { callbackUrl } = await searchParams;
  const destination = safeCallbackUrl(callbackUrl);
  if (await getCurrentUser()) redirect(destination);

  const organization = await resolveOrganization((await headers()).get("host"));

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <section className="rounded-theme border-border bg-surface w-full max-w-sm border p-6">
        <h1 className="mb-4 text-2xl">Sign in to Roadcase</h1>
        {organization ? (
          <ActionForm action={signInAction} submitLabel="Sign in" pendingLabel="Signing in…">
            <input type="hidden" name="organization" value={organization.slug} />
            <input type="hidden" name="callbackUrl" value={destination} />
            <TextField
              label="Username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <TextField
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </ActionForm>
        ) : (
          <p role="alert">
            No organization matches this address. Ask your administrator for the correct sign-in
            link.
          </p>
        )}
      </section>
    </main>
  );
}
