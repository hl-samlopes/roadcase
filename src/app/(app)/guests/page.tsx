import type { Metadata } from "next";
import Link from "next/link";
import { PortalLinkBadge } from "@/components/status-badge";
import { buttonClass, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import { checkoutCampuses } from "@/lib/data/checkouts";
import { guestGroupListParamsSchema, listGuestGroups } from "@/lib/data/guest-groups";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Guest portal" };

const views = [
  { value: "upcoming", label: "Upcoming and here now" },
  { value: "past", label: "Past" },
  { value: "archived", label: "Archived" },
] as const;

export default async function GuestGroupsPage({ searchParams }: PageProps<"/guests">) {
  const user = await requireUser();
  const params = guestGroupListParamsSchema.parse(await searchParams);
  const view = params.view ?? "upcoming";
  const { active } = await getCampusContext(user);
  const [groups, manageable] = await Promise.all([
    listGuestGroups(user, params, active?.id ?? null),
    checkoutCampuses(user, "checkout:manage"),
  ]);

  return (
    <>
      <PageHeader title="Guest portal">
        <Link href="/guests/requests" className={buttonClass("secondary")}>
          Equipment requests
        </Link>
        {manageable.length > 0 ? (
          <Link href="/guests/new" className={buttonClass("primary")}>
            New guest group
          </Link>
        ) : null}
      </PageHeader>
      <p className="text-muted mb-3 max-w-2xl">
        Each guest group gets a private link to its own page, with no account needed. Equipment
        requests and the band builder open there in later updates.
      </p>

      <nav aria-label="Guest group views" className="mb-3 flex flex-wrap gap-2">
        {views.map((option) => (
          <Link
            key={option.value}
            href={option.value === "upcoming" ? "/guests" : `/guests?view=${option.value}`}
            aria-current={view === option.value ? "page" : undefined}
            className={buttonClass(view === option.value ? "primary" : "secondary")}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <p className="text-muted mb-2" role="status">
        {groups.length === 0
          ? view === "upcoming"
            ? "No upcoming guest groups."
            : "No guest groups here."
          : `${groups.length} group${groups.length === 1 ? "" : "s"} · Showing ${active ? `${active.name} (${active.code})` : "all campuses"}`}
      </p>

      {groups.length > 0 ? (
        <div className="overflow-x-auto">
          <table
            aria-label="Guest groups"
            className="rounded-theme border-border bg-surface w-full border-collapse border"
          >
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="p-2">Group</th>
                <th className="p-2">Campus</th>
                <th className="p-2">Arrives</th>
                <th className="p-2">Leaves</th>
                <th className="p-2">Portal</th>
                <th className="hidden p-2 md:table-cell">Representative</th>
                <th className="hidden p-2 md:table-cell">Staff contact</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id} className="border-border border-b last:border-0">
                  <td className="p-2">
                    <Link href={`/guests/${group.id}`} className="text-accent hover:underline">
                      {group.name}
                    </Link>
                  </td>
                  <td className="p-2">{group.campus.code}</td>
                  <td className="p-2 whitespace-nowrap">{formatDate(group.arrivalDate)}</td>
                  <td className="p-2 whitespace-nowrap">{formatDate(group.departureDate)}</td>
                  <td className="p-2">
                    <PortalLinkBadge status={group.archivedAt ? "archived" : group.linkStatus} />
                  </td>
                  <td className="hidden p-2 md:table-cell">{group.repName}</td>
                  <td className="hidden p-2 md:table-cell">
                    {group.staffContact?.displayName ?? "Nobody"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
