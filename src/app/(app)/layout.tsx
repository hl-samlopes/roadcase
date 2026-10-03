import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { isAnyAdmin, requireUser } from "@/lib/authz";
import { signOutAction } from "./actions";

/**
 * Temporary signed-in frame. Step 3 replaces it with the Concept A sidebar,
 * campus switcher and branded header. Pages still check access themselves.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-border bg-surface flex flex-wrap items-center gap-4 border-b px-4 py-2">
        <span className="font-heading font-bold">Roadcase</span>
        <nav aria-label="Main" className="flex flex-1 flex-wrap gap-3">
          <Link href="/items" className="text-accent underline-offset-2 hover:underline">
            Inventory
          </Link>
          {isAnyAdmin(user) ? (
            <Link href="/admin/users" className="text-accent underline-offset-2 hover:underline">
              Users
            </Link>
          ) : null}
          <Link href="/account/password" className="text-accent underline-offset-2 hover:underline">
            Change password
          </Link>
        </nav>
        <span className="text-muted">Signed in as {user.displayName}</span>
        <form action={signOutAction}>
          <button type="submit" className={buttonClass("secondary")}>
            Sign out
          </button>
        </form>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
