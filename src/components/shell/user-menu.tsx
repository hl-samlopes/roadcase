import Link from "next/link";
import { signOutAction } from "@/app/(app)/actions";
import { Disclosure } from "./disclosure";

const itemClass =
  "block w-full rounded-theme px-3 py-1.5 text-left hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent";

export function UserMenu({ displayName, username }: { displayName: string; username: string }) {
  return (
    <Disclosure
      summaryClassName="rounded-theme border-border bg-surface cursor-pointer list-none border px-3 py-1.5"
      panelClassName="rounded-theme border-border bg-surface absolute right-0 z-20 mt-1 min-w-52 border p-1 shadow-sm"
      summary={
        <>
          <span className="sr-only">Account menu for </span>
          <span className="font-semibold">{displayName}</span>
          <span aria-hidden="true"> ▾</span>
        </>
      }
    >
      <p className="text-muted px-3 py-1.5">
        Signed in as <span className="text-text font-mono">{username}</span>
      </p>
      <ul>
        <li>
          <Link href="/account/preferences" className={itemClass}>
            Preferences
          </Link>
        </li>
        <li>
          <Link href="/account/password" className={itemClass}>
            Change password
          </Link>
        </li>
        <li>
          <form action={signOutAction}>
            <button type="submit" className={itemClass}>
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </Disclosure>
  );
}
