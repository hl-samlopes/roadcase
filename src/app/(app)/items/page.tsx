import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, PageHeader, SelectField, TextField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import {
  allowedHomes,
  listFilterOptions,
  listItems,
  parseListParams,
  PAGE_SIZE,
  type ListParams,
  type SortKey,
} from "@/lib/data/items";

export const metadata: Metadata = { title: "Inventory" };

/** Query string for the list with some parameters changed. */
function listHref(
  params: ListParams,
  changes: Partial<Record<keyof ListParams, string | number | undefined>>,
) {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...params, ...changes })) {
    if (value !== undefined && value !== "") merged[key] = String(value);
  }
  const query = new URLSearchParams(merged).toString();
  return query ? `/items?${query}` : "/items";
}

// Campus and department are on the item page, so phones skip them to keep rows readable.
const columns: { key: SortKey | null; label: string; wide?: boolean }[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "category", label: "Category" },
  { key: null, label: "Campus", wide: true },
  { key: "location", label: "Location" },
  { key: null, label: "Department", wide: true },
  { key: "condition", label: "Condition" },
];

export default async function ItemsPage({ searchParams }: PageProps<"/items">) {
  const user = await requireUser();
  const params = parseListParams(await searchParams);
  const { active } = await getCampusContext(user);
  const [{ items, total, page, pageCount }, filters, homes] = await Promise.all([
    listItems(user, params, active?.id ?? null),
    listFilterOptions(user, active?.id ?? null),
    allowedHomes(user, "item:create"),
  ]);
  const sort = params.sort ?? "code";
  const dir = params.dir ?? (sort === "updated" ? "desc" : "asc");
  const filtered = Boolean(params.q || params.category || params.location || params.condition);
  const exportQuery = new URLSearchParams(
    Object.entries({
      q: params.q,
      category: params.category,
      location: params.location,
      condition: params.condition,
    }).filter((entry): entry is [string, string] => Boolean(entry[1])),
  ).toString();

  return (
    <>
      <PageHeader title="Inventory">
        <div className="flex flex-wrap items-center gap-2">
          {homes.length > 0 ? (
            <Link href="/items/new" className={buttonClass("primary")}>
              New item
            </Link>
          ) : null}
          <a
            href={`/items/export${exportQuery ? `?${exportQuery}` : ""}`}
            className={buttonClass("secondary")}
          >
            Export CSV
          </a>
        </div>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3">
        {/* Barcode scanners type the code and press Enter, which submits this form. */}
        <form action="/items/scan" method="get" className="flex flex-wrap items-end gap-2">
          <TextField
            label="Scan or enter an item code"
            name="code"
            id="scan-code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="HNE-000123"
          />
          <button type="submit" className={buttonClass("secondary")}>
            Open item
          </button>
        </form>

        {/* Keyed on the filters so its fields reset when they change (e.g. Clear filters). */}
        <form
          key={JSON.stringify([params.q, params.category, params.location, params.condition])}
          method="get"
          className="rounded-theme border-border bg-surface flex flex-wrap items-end gap-3 border p-3"
        >
          <TextField
            label="Search"
            name="q"
            id="filter-q"
            type="search"
            defaultValue={params.q ?? ""}
            hint="Name, code or notes"
          />
          <SelectField
            label="Category"
            name="category"
            id="filter-category"
            defaultValue={params.category ?? ""}
          >
            <option value="">All categories</option>
            {filters.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Location"
            name="location"
            id="filter-location"
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
            label="Condition"
            name="condition"
            id="filter-condition"
            defaultValue={params.condition ?? ""}
          >
            <option value="">All conditions</option>
            {filters.conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </SelectField>
          {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
          {params.dir ? <input type="hidden" name="dir" value={params.dir} /> : null}
          <button type="submit" className={buttonClass("secondary")}>
            Apply filters
          </button>
          {filtered ? (
            <Link
              href={listHref({}, { sort: params.sort, dir: params.dir })}
              className="text-accent self-center hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </form>
      </div>

      <p className="text-muted mb-2" role="status">
        {total === 0
          ? "No items match."
          : `${total} item${total === 1 ? "" : "s"} · Showing ${active ? `${active.name} (${active.code})` : "all campuses"}`}
      </p>

      {items.length > 0 ? (
        <>
          <form id="labels-form" action="/items/labels" method="get" />
          <div className="relative overflow-x-auto">
            <table className="rounded-theme border-border bg-surface w-full border-collapse border">
              <thead>
                <tr className="border-border text-muted border-b text-left">
                  <th className="p-2">
                    <span className="sr-only">Select for labels</span>
                  </th>
                  {columns.map((column) => {
                    const current = column.key === sort;
                    return (
                      <th
                        key={column.label}
                        className={`p-2 ${column.wide ? "hidden md:table-cell" : ""}`}
                        aria-sort={
                          current ? (dir === "asc" ? "ascending" : "descending") : undefined
                        }
                      >
                        {column.key ? (
                          <Link
                            href={listHref(params, {
                              sort: column.key,
                              dir: current && dir === "asc" ? "desc" : "asc",
                              page: undefined,
                            })}
                            className={`hover:underline ${current ? "text-text font-semibold" : ""}`}
                          >
                            {column.label}
                            {current ? (
                              <span aria-hidden="true">{dir === "asc" ? " ▲" : " ▼"}</span>
                            ) : null}
                            <span className="sr-only">
                              {current
                                ? `, sorted ${dir === "asc" ? "ascending" : "descending"}`
                                : ", sort"}
                            </span>
                          </Link>
                        ) : (
                          column.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-border border-b last:border-0">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        name="id"
                        value={item.id}
                        form="labels-form"
                        aria-label={`Select ${item.code} for labels`}
                        className="accent-accent"
                      />
                    </td>
                    <td className="p-2 font-mono whitespace-nowrap">{item.code}</td>
                    <td className="p-2">
                      <Link href={`/items/${item.id}`} className="text-accent hover:underline">
                        {item.name}
                      </Link>
                    </td>
                    <td className="p-2">
                      {item.category.name}
                      {item.subcategory ? (
                        <span className="text-muted"> / {item.subcategory.name}</span>
                      ) : null}
                    </td>
                    <td className="hidden p-2 md:table-cell">{item.campus.code}</td>
                    <td className="p-2">{item.location.name}</td>
                    <td className="hidden p-2 md:table-cell">{item.department.name}</td>
                    <td className="p-2">{item.condition.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button type="submit" form="labels-form" className={buttonClass("secondary")}>
              Print labels for selected
            </button>
            {pageCount > 1 ? (
              <nav aria-label="Pages" className="flex items-center gap-3">
                {page > 1 ? (
                  <Link
                    href={listHref(params, { page: page - 1 })}
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
                    href={listHref(params, { page: page + 1 })}
                    className="text-accent hover:underline"
                  >
                    Next page
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );
}
