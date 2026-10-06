import "server-only";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { portalCan, resolvePortal, type PortalAction } from "@/lib/authz";
import {
  brandingAssetUrl,
  displayName,
  getBranding,
  logoUrls,
  type Branding,
} from "@/lib/branding";
import { resolveTheme, themeCss } from "@/lib/theme/resolve";

/**
 * The portal for a token, allowed to do `action`, with its organization's
 * branding. Every failure is the same 404, so a link can't be told apart
 * from a guess.
 */
export async function loadPortal(token: string, action: PortalAction) {
  const portal = await resolvePortal(token);
  if (!portal || !portalCan(portal.principal, action, portal.principal)) notFound();
  const branding = await getBranding(portal.principal.organizationId);
  return { portal, branding };
}

/** Page chrome for the guest portal: the organization's logo or name, and its theme. */
export function PortalShell({
  branding,
  children,
}: {
  branding: Branding | null;
  children: ReactNode;
}) {
  const name = displayName(branding);
  const logos = logoUrls(branding);
  const background = brandingAssetUrl(branding?.appBackgroundKey);
  const dim = Math.min(100, Math.max(0, branding?.appBackgroundDim ?? 60)) / 100;
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
        {children}
      </main>
    </div>
  );
}

export function portalMetadata(title: string, branding: Branding | null) {
  const favicon = brandingAssetUrl(branding?.faviconKey);
  return {
    title: { absolute: `${title} · ${displayName(branding)}` },
    robots: { index: false, follow: false },
    referrer: "no-referrer" as const,
    ...(favicon ? { icons: { icon: favicon } } : {}),
  };
}
