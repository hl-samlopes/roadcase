import Link from "next/link";
import { CampusSwitcher } from "@/components/shell/campus-switcher";
import { SidebarNav, type NavItem } from "@/components/shell/sidebar-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { isAnyAdmin, requireUser } from "@/lib/authz";
import { displayName, getBranding, logoUrls } from "@/lib/branding";
import { getCampusContext } from "@/lib/data/campuses";

/**
 * Signed-in shell (Concept A): 220px sidebar, campus switcher and user menu.
 * Navigation visibility is a convenience; each page still checks access.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [branding, { campuses, active }] = await Promise.all([
    getBranding(user.organizationId),
    getCampusContext(user),
  ]);
  const name = displayName(branding);
  const logos = logoUrls(branding);

  const nav: NavItem[] = [
    { href: "/items", label: "Inventory" },
    { href: "/tickets", label: "Service tickets" },
    { href: "/service-log", label: "Service log" },
    { href: "/checkouts", label: "Check-outs" },
    { href: "/portal", label: "Guest portal" },
    ...(isAnyAdmin(user) ? [{ href: "/settings", label: "Settings" }] : []),
  ];

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <a
        href="#main"
        className="bg-accent text-surface rounded-theme sr-only px-3 py-1.5 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to content
      </a>
      <aside className="border-border bg-surface flex shrink-0 print:hidden flex-col gap-4 border-b p-3 md:w-[220px] md:border-r md:border-b-0">
        <Link href="/items" className="font-heading block px-3 py-1 text-base font-bold">
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
            name
          )}
        </Link>
        <SidebarNav items={nav} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border bg-surface flex flex-wrap print:hidden items-center justify-between gap-2 border-b px-4 py-2">
          <CampusSwitcher campuses={campuses} active={active} />
          <div className="ml-auto">
            <UserMenu displayName={user.displayName} username={user.username} />
          </div>
        </header>
        <main id="main" className="flex-1 p-4 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
}
