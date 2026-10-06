import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutStatusBadge } from "@/components/status-badge";
import { buttonClass, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import { checkoutCampuses, checkoutListParamsSchema, listCheckouts } from "@/lib/data/checkouts";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Check-outs" };

const views = [
  { value: "active", label: "Active" },
  { value: "closed", label: "Returned or cancelled" },
  { value: "all", label: "All" },
] as const;

export default async function CheckoutsPage({ searchParams }: PageProps<"/checkouts">) {
  const user = await requireUser();
  const params = checkoutListParamsSchema.parse(await searchParams);
  const view = params.status ?? "active";
  const { active } = await getCampusContext(user);
  const [checkouts, manageable] = await Promise.all([
    listCheckouts(user, params, active?.id ?? null),
    checkoutCampuses(user, "checkout:manage"),
  ]);

  return (
    <>
      <PageHeader title="Check-outs">
        {manageable.length > 0 ? (
          <Link href="/checkouts/new" className={buttonClass("primary")}>
            New check-out
          </Link>
        ) : null}
      </PageHeader>

      <nav aria-label="Check-out views" className="mb-3 flex flex-wrap gap-2">
        {views.map((option) => (
          <Link
            key={option.value}
            href={option.value === "active" ? "/checkouts" : `/checkouts?status=${option.value}`}
            aria-current={view === option.value ? "page" : undefined}
            className={buttonClass(view === option.value ? "primary" : "secondary")}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      <p className="text-muted mb-2" role="status">
        {checkouts.length === 0
          ? view === "active"
            ? "No active check-outs."
            : "No check-outs here."
          : `${checkouts.length} check-out${checkouts.length === 1 ? "" : "s"} · Showing ${active ? `${active.name} (${active.code})` : "all campuses"}`}
      </p>

      {checkouts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="rounded-theme border-border bg-surface w-full border-collapse border">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="p-2">Number</th>
                <th className="p-2">Guest group</th>
                <th className="p-2">Status</th>
                <th className="p-2">Out</th>
                <th className="p-2">Back</th>
                <th className="p-2">Items</th>
                <th className="hidden p-2 md:table-cell">Staff</th>
              </tr>
            </thead>
            <tbody>
              {checkouts.map((checkout) => (
                <tr key={checkout.id} className="border-border border-b last:border-0">
                  <td className="p-2 whitespace-nowrap">
                    #{checkout.number} <span className="text-muted">{checkout.campus.code}</span>
                  </td>
                  <td className="p-2">
                    <Link
                      href={`/checkouts/${checkout.id}`}
                      className="text-accent hover:underline"
                    >
                      {checkout.groupName}
                    </Link>
                  </td>
                  <td className="p-2">
                    <CheckoutStatusBadge status={checkout.status} />
                  </td>
                  <td className="p-2 whitespace-nowrap">{formatDate(checkout.dateOut)}</td>
                  <td className="p-2 whitespace-nowrap">{formatDate(checkout.dateDue)}</td>
                  <td className="p-2">{checkout._count.lines}</td>
                  <td className="hidden p-2 md:table-cell">
                    {checkout.staffRep?.displayName ?? "Nobody"}
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
