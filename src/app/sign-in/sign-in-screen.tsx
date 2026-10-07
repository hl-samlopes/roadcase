import { ActionForm } from "@/components/action-form";
import { TextField } from "@/components/ui";
import { signInMethods, type SignInSettings } from "@/lib/auth/google";
import { brandingAssetUrl, displayName, logoUrls, type Branding } from "@/lib/branding";
import { resolveTheme, themeCss } from "@/lib/theme/resolve";
import { googleSignInAction, signInAction } from "./actions";

/**
 * Sign-in page in the organization's branding (logo, headline, message and
 * background), falling back to the Roadcase defaults. Offers Google, a
 * password, or both, as the organization's Settings > Sign-in allow.
 */
export function SignInScreen({
  organization,
  branding,
  callbackUrl,
  error,
}: {
  organization: ({ slug: string } & SignInSettings) | null;
  branding: Branding | null;
  callbackUrl: string;
  /** Auth.js's `error` parameter; "google" means a Google account was refused. */
  error?: string;
}) {
  const name = displayName(branding);
  const logos = logoUrls(branding);
  const placement = branding?.signInLogoPlacement ?? "TOP";
  const background = brandingAssetUrl(branding?.signInBackgroundKey);
  const dim = Math.min(100, Math.max(0, branding?.signInBackgroundDim ?? 60)) / 100;
  const headline = branding?.signInHeadline?.trim() || `Sign in to ${name}`;
  const message = branding?.signInMessage?.trim();
  const methods = organization ? signInMethods(organization) : null;

  const logo =
    logos.light && placement !== "HIDDEN" ? (
      <span className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- branding images come from storage at runtime */}
        <img src={logos.light} alt={name} className="logo-light max-h-12 w-auto" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logos.dark ?? logos.light} alt={name} className="logo-dark max-h-12 w-auto" />
      </span>
    ) : null;

  const passwordForm = organization ? (
    <ActionForm action={signInAction} submitLabel="Sign in" pendingLabel="Signing in…">
      <input type="hidden" name="organization" value={organization.slug} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
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
  ) : null;

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-6 p-6">
      {/* Page-specific branding, so /sign-in/<organization> shows the right look. */}
      <style dangerouslySetInnerHTML={{ __html: themeCss(resolveTheme(branding, null)) }} />
      {background ? (
        <div aria-hidden="true" className="absolute inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={background} alt="" className="h-full w-full object-cover" />
          <div className="bg-bg absolute inset-0" style={{ opacity: dim }} />
        </div>
      ) : null}

      {placement === "TOP" ? logo : null}

      <section className="rounded-theme border-border bg-surface w-full max-w-sm border p-6">
        {placement === "CENTER" ? <div className="mb-4">{logo}</div> : null}
        <h1 className="text-2xl">{headline}</h1>
        {message ? <p className="text-muted mt-2 whitespace-pre-line">{message}</p> : null}
        <div className="mt-4">
          {organization && methods ? (
            <div className="flex flex-col gap-4">
              {error ? (
                <p role="alert" className="text-bad">
                  {error === "google"
                    ? `This Google account isn't set up for ${name}. Use your work Google account, or ask your administrator.`
                    : "Sign-in didn't finish. Try again."}
                </p>
              ) : null}
              {methods.google ? (
                <ActionForm
                  action={googleSignInAction}
                  submitLabel="Sign in with Google"
                  pendingLabel="Opening Google…"
                  variant={methods.passwordSignIn ? "secondary" : "primary"}
                >
                  <input type="hidden" name="organization" value={organization.slug} />
                  <input type="hidden" name="callbackUrl" value={callbackUrl} />
                </ActionForm>
              ) : null}
              {methods.passwordSignIn ? (
                passwordForm
              ) : methods.adminPasswordSignIn ? (
                <details>
                  <summary className="text-accent cursor-pointer">
                    Organization admin? Sign in with a password
                  </summary>
                  <div className="mt-3">{passwordForm}</div>
                </details>
              ) : null}
            </div>
          ) : (
            <p role="alert">
              No organization matches this address. Ask your administrator for the correct sign-in
              link.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
