import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, PageHeader, SelectField, TextField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import { listFilterOptions } from "@/lib/data/items";
import {
  activeDepartments,
  listServiceLogs,
  PAGE_SIZE,
  parseLogListParams,
  type LogListParams,
} from "@/lib/data/tickets";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Service log" };

function logHref(
  params: LogListParams,
  changes: Partial<Record<keyof LogListParams, string | number | undefined>>,
) {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    if (value !== undefined && value !== "") merged[key] = String(value);
  }
  const query = new URLSearchParams(merged).toString();
  return query ? `/service-log?${query}` : "/service-log";
}

export default async function ServiceLogPage({ searchParams }: PageProps<"/service-log">) {
  const user = await requireUser();
  const params = parseLogListParams(await searchParams);
  const { active } = await getCampusContext(user);
  const [{ logs, total, totalCost, page, pageCount }, filters, departments] = await Promise.all([
    listServiceLogs(user, params, active?.id ?? null),
    listFilterOptions(user, active?.id ?? null),
    activeDepartments(user.organizationId),
  ]);
  const filtered = Boolean(
    params.from || params.to || params.type || params.location || params.department,
  );

  return (
    <>
      <PageHeader title="Service log" />
      <form
        key={JSON.stringify([
          params.from,
          params.to,
          params.type,
          params.location,
          params.department,
        ])}
        method="get"
        className="rounded-theme border-border bg-surface mb-4 flex flex-wrap items-end gap-3 border p-3"
      >
        <TextField
          label="From"
          name="from"
          id="log-from"
          type="date"
          defaultValue={params.from ?? ""}
        />
        <TextField label="To" name="to" id="log-to" type="date" defaultValue={params.to ?? ""} />
        <TextField
          label="Service type"
          name="type"
          id="log-type"
          defaultValue={params.type ?? ""}
        />
        <SelectField
          label="Location"
          name="location"
          id="log-location"
          defaultValue={params.location ?? ""}
        >
          <option value="">All locations</option>
          {filters.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.campus.code})
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Department"
          name="department"
          id="log-department"
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
        {filtered ? (
          <Link href="/service-log" className="text-accent self-center hover:underline">
            Clear filters
          </Link>
        ) : null}
      </form>

      <p className="mb-2" role="status">
        {total === 0 ? (
          "No service records match."
        ) : (
          <>
            {total} record{total === 1 ? "" : "s"} ·{" "}
            <span className="font-semibold">Total cost {formatMoney(totalCost ?? 0)}</span>
            <span className="text-muted">
              {" "}
              · Showing {active ? `${active.name} (${active.code})` : "all campuses"}
            </span>
          </>
        )}
      </p>

      {logs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="rounded-theme border-border bg-surface w-full border-collapse border">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="p-2">Date</th>
                <th className="p-2">Item</th>
                <th className="p-2">Type</th>
                <th className="p-2">Cost</th>
                <th className="p-2">Notes</th>
                <th className="p-2">Where</th>
                <th className="p-2">Ticket</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-border border-b align-top last:border-0">
                  <td className="p-2 whitespace-nowrap">{formatDate(log.serviceDate)}</td>
                  <td className="p-2">
                    <Link href={`/items/${log.item.id}`} className="text-accent hover:underline">
                      <span className="font-mono">{log.item.code}</span> {log.item.name}
                    </Link>
                  </td>
                  <td className="p-2">{log.serviceType}</td>
                  <td className="p-2 whitespace-nowrap">{formatMoney(log.cost)}</td>
                  <td className="p-2">{log.notes}</td>
                  <td className="p-2">
                    {log.location.name} ({log.campus.code}) · {log.department.name}
                  </td>
                  <td className="p-2">
                    {log.ticket ? (
                      <Link
                        href={`/tickets/${log.ticket.id}`}
                        className="text-accent hover:underline"
                      >
                        #{log.ticket.number}
                      </Link>
                    ) : null}
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
              href={logHref(params, { page: page - 1 })}
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
              href={logHref(params, { page: page + 1 })}
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
