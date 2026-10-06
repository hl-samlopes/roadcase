import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { buttonClass, PageHeader, SelectField, TextField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import {
  activeDepartments,
  assigneeLabel,
  listTickets,
  PAGE_SIZE,
  parseTicketListParams,
  type TicketListParams,
} from "@/lib/data/tickets";
import { ticketStatusLabels } from "@/lib/labels";

export const metadata: Metadata = { title: "Service tickets" };

function queueHref(
  params: TicketListParams,
  changes: Partial<Record<keyof TicketListParams, string | number | undefined>>,
) {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    if (value !== undefined && value !== "") merged[key] = String(value);
  }
  const query = new URLSearchParams(merged).toString();
  return query ? `/tickets?${query}` : "/tickets";
}

/** What an empty list says, so "no tickets at all" isn't worded like a failed search. */
function emptyMessage(params: TicketListParams) {
  if (params.q || params.department) return "No tickets match these filters.";
  const status = params.status ?? "open";
  if (status === "open") return "No open tickets.";
  if (status === "all") return "No tickets yet.";
  return "No tickets match these filters.";
}

export default async function TicketsPage({ searchParams }: PageProps<"/tickets">) {
  const user = await requireUser();
  const params = parseTicketListParams(await searchParams);
  const { active } = await getCampusContext(user);
  const [{ tickets, total, page, pageCount }, departments] = await Promise.all([
    listTickets(user, params, active?.id ?? null),
    activeDepartments(user.organizationId),
  ]);

  return (
    <>
      <PageHeader title="Service tickets">
        <Link href="/tickets/new" className={buttonClass("primary")}>
          Report a problem
        </Link>
      </PageHeader>

      <form
        key={JSON.stringify([params.status, params.department, params.q])}
        method="get"
        className="rounded-theme border-border bg-surface mb-4 flex flex-wrap items-end gap-3 border p-3"
      >
        <TextField
          label="Search"
          name="q"
          id="ticket-q"
          type="search"
          defaultValue={params.q ?? ""}
          hint="Title, ticket number or item"
        />
        <SelectField
          label="Status"
          name="status"
          id="ticket-status"
          defaultValue={params.status ?? "open"}
        >
          <option value="open">All open</option>
          <option value="closed">All closed</option>
          <option value="all">Any status</option>
          {Object.entries(ticketStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Department"
          name="department"
          id="ticket-department"
          defaultValue={params.department ?? ""}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </SelectField>
        <button type="submit" className={buttonClass("secondary")}>
          Apply filters
        </button>
      </form>

      <p className="text-muted mb-2" role="status">
        {total === 0
          ? emptyMessage(params)
          : `${total} ticket${total === 1 ? "" : "s"} · Showing ${active ? `${active.name} (${active.code})` : "all campuses"}`}
      </p>

      {tickets.length > 0 ? (
        <div className="relative overflow-x-auto">
          <table className="rounded-theme border-border bg-surface w-full border-collapse border">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="p-2">Ticket</th>
                <th className="p-2">Problem</th>
                <th className="p-2">Item</th>
                <th className="p-2">Status</th>
                <th className="p-2">Assigned to</th>
                <th className="hidden p-2 md:table-cell">Campus</th>
                <th className="hidden p-2 md:table-cell">Department</th>
                <th className="hidden p-2 md:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-border border-b align-top last:border-0">
                  <td className="p-2 font-mono">#{ticket.number}</td>
                  <td className="p-2">
                    <Link href={`/tickets/${ticket.id}`} className="text-accent hover:underline">
                      {ticket.title}
                    </Link>
                  </td>
                  <td className="p-2">
                    <span className="font-mono">{ticket.item.code}</span> {ticket.item.name}
                  </td>
                  <td className="p-2">
                    <StatusBadge status={ticket.status} />
                  </td>
                  <td className="p-2">{assigneeLabel(ticket) ?? "Nobody yet"}</td>
                  <td className="hidden p-2 md:table-cell">{ticket.campus.code}</td>
                  <td className="hidden p-2 md:table-cell">{ticket.department.name}</td>
                  <td className="hidden p-2 whitespace-nowrap md:table-cell">
                    {ticket.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {pageCount > 1 ? (
        <nav aria-label="Pages" className="mt-3 flex items-center gap-3">
          {page > 1 ? (
            <Link
              href={queueHref(params, { page: page - 1 })}
              className="text-accent hover:underline"
            >
              Previous page
            </Link>
          ) : null}
          <span>
            Page {page} of {pageCount} ({PAGE_SIZE} per page)
          </span>
          {page < pageCount ? (
            <Link
              href={queueHref(params, { page: page + 1 })}
              className="text-accent hover:underline"
            >
              Next page
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
