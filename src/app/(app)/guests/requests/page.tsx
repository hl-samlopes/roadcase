import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { appTimeZone } from "@/lib/checkouts/overdue";
import { getCampusContext } from "@/lib/data/campuses";
import { listRequests, requestListParamsSchema } from "@/lib/data/requests";
import { formatDate } from "@/lib/format";
import { RequestStatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Equipment requests" };

const views = [
  { value: "waiting", label: "Waiting for review" },
  { value: "decided", label: "Decided" },
  { value: "all", label: "All sent" },
] as const;

export default async function RequestsPage({ searchParams }: PageProps<"/guests/requests">) {
  const user = await requireUser();
  const params = requestListParamsSchema.parse(await searchParams);
  const view = params.view ?? "waiting";
  const { active } = await getCampusContext(user);
  const requests = await listRequests(user, params, active?.id ?? null);

  return (
    <>
      <div className="mb-2">
        <Link href="/guests" className="text-accent hover:underline">
          Back to guest groups
        </Link>
      </div>
      <PageHeader title="Equipment requests" />
      <nav aria-label="Request views" className="mb-3 flex flex-wrap gap-2">
        {views.map((option) => (
          <Link
            key={option.value}
            href={
              option.value === "waiting"
                ? "/guests/requests"
                : `/guests/requests?view=${option.value}`
            }
            aria-current={view === option.value ? "page" : undefined}
            className={buttonClass(view === option.value ? "primary" : "secondary")}
          >
            {option.label}
          </Link>
        ))}
      </nav>
      <p className="text-muted mb-2" role="status">
        {requests.length === 0
          ? view === "waiting"
            ? "Nothing is waiting for review."
            : "No requests here."
          : `${requests.length} request${requests.length === 1 ? "" : "s"} · Showing ${active ? `${active.name} (${active.code})` : "all campuses"}`}
      </p>
      {requests.length > 0 ? (
        <div className="overflow-x-auto">
          <table
            aria-label="Equipment requests"
            className="rounded-theme border-border bg-surface w-full border-collapse border"
          >
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="p-2">Group</th>
                <th className="p-2">Campus</th>
                <th className="p-2">Visit</th>
                <th className="p-2">Status</th>
                <th className="p-2">Items</th>
                <th className="hidden p-2 md:table-cell">Sent</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr key={request.id} className="border-border border-b last:border-0">
                  <td className="p-2">
                    <Link
                      href={`/guests/${request.guestGroup.id}/request`}
                      className="text-accent hover:underline"
                    >
                      {request.guestGroup.name}
                    </Link>
                  </td>
                  <td className="p-2">{request.guestGroup.campus.code}</td>
                  <td className="p-2 whitespace-nowrap">
                    {formatDate(request.guestGroup.arrivalDate)} to{" "}
                    {formatDate(request.guestGroup.departureDate)}
                  </td>
                  <td className="p-2">
                    <RequestStatusBadge status={request.status} />
                    {request.checkoutId ? (
                      <span className="text-muted block">Check-out made</span>
                    ) : null}
                  </td>
                  <td className="p-2">
                    {request.lines.reduce((sum, line) => sum + line.quantityRequested, 0)}
                  </td>
                  <td className="hidden p-2 md:table-cell">
                    {request.submittedAt?.toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: appTimeZone(),
                    })}
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
