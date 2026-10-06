import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { portalCan, resolvePortal } from "@/lib/authz";
import { brandingAssetUrl, displayName, getBranding, logoUrls } from "@/lib/branding";
import { formatDate } from "@/lib/format";
import { resolveTheme, themeCss } from "@/lib/theme/resolve";

/**
 * A guest group's page, reached by its private link with no account. Every
 * failure is the same 404, so a link can't be told apart from a guess.
 */
async function load(token: string) {
  const portal = await resolvePortal(token);
  if (!portal || !portalCan(portal.principal, "portal:view", portal.principal)) notFound();
  const branding = await getBranding(portal.principal.organizationId);
  return { portal, branding };
}

export async function generateMetadata({
  params,
}: PageProps<"/portal/[token]">): Promise<Metadata> {
  const { portal, branding } = await load((await params).token);
  const favicon = brandingAssetUrl(branding?.faviconKey);
  return {
    title: { absolute: `${portal.group.name} · ${displayName(branding)}` },
    robots: { index: false, follow: false },
    referrer: "no-referrer",
    ...(favicon ? { icons: { icon: favicon } } : {}),
  };
}

export default async function PortalPage({ params }: PageProps<"/portal/[token]">) {
  const { portal, branding } = await load((await params).token);
  const { group } = portal;
  const name = displayName(branding);
  const logos = logoUrls(branding);
  const background = brandingAssetUrl(branding?.appBackgroundKey);
  const dim = Math.min(100, Math.max(0, branding?.appBackgroundDim ?? 60)) / 100;
  const lastDay = new Date(`${portal.lastDay}T00:00:00Z`);

  return (
    <div className="flex flex-1 flex-col">
      {/* The group's organization branding, whatever address the link was opened on. */}
      <style dangerouslySetInnerHTML={{ __html: themeCss(resolveTheme(branding, null)) }} />
      {background ? (
        <div aria-hidden="true" className="fixed inset-0 -z-10">
          {/* eslint-disable-next-line @next/next/no-img-element -- branding image from storage */}
          <img src={background} alt="" className="h-full w-full object-cover" />
          <div className="bg-bg absolute inset-0" style={{ opacity: dim }} />
        </div>
      ) : null}
      <header className="border-border bg-surface border-b px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center">
          {logos.light ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- branding images come from storage at runtime */}
              <img src={logos.light} alt={name} className="logo-light max-h-8 w-auto" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logos.dark ?? logos.light}
                alt={name}
                className="logo-dark max-h-8 w-auto"
              />
            </>
          ) : (
            <span className="font-heading text-base font-bold">{name}</span>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-4">
        <div>
          <p className="text-muted">Group page</p>
          <h1 className="text-2xl">{group.name}</h1>
        </div>
        <section className="rounded-theme border-border bg-surface border p-4">
          <h2 className="mb-3 text-base">Your visit</h2>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted">Where</dt>
              <dd>{group.campusName}</dd>
            </div>
            <div>
              <dt className="text-muted">When</dt>
              <dd>
                {formatDate(group.arrivalDate)} to {formatDate(group.departureDate)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Group contact</dt>
              <dd>{group.repName}</dd>
            </div>
            <div>
              <dt className="text-muted">Your staff contact</dt>
              <dd>
                {group.staffContact ? (
                  <>
                    {group.staffContact.name}
                    <a
                      href={`mailto:${group.staffContact.email}`}
                      className="text-accent block hover:underline"
                    >
                      {group.staffContact.email}
                    </a>
                  </>
                ) : (
                  "Ask the staff member who set up your visit."
                )}
              </dd>
            </div>
          </dl>
        </section>
        <section className="rounded-theme border-border bg-surface border p-4">
          <h2 className="mb-2 text-base">Coming soon</h2>
          <p>
            Requesting equipment ahead of your visit, and telling the audio team about your band,
            will open on this page. Your staff contact will let you know.
          </p>
        </section>
        <p className="text-muted">
          This page is private to your group and works until {formatDate(lastDay)}. Anyone with the
          link can see it, so share it only with your team.
        </p>
      </main>
    </div>
  );
}
