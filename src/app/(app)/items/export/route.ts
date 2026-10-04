import { getCurrentUser } from "@/lib/authz";
import { getCampusContext } from "@/lib/data/campuses";
import { activeFields, buildItemWhere, itemOrderBy, parseListParams } from "@/lib/data/items";
import { db } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { formatCustomFieldValue } from "@/lib/items/custom-fields";

const MAX_ROWS = 10_000;

/** CSV of the items the user can see, with the same filters as the list. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in to export inventory.", { status: 401 });

  const params = parseListParams(Object.fromEntries(new URL(request.url).searchParams));
  const { active } = await getCampusContext(user);
  const where = buildItemWhere(user, params, active?.id ?? null);
  const [items, fields] = await Promise.all([
    where
      ? db.item.findMany({
          where,
          orderBy: itemOrderBy(params),
          take: MAX_ROWS,
          select: {
            code: true,
            name: true,
            price: true,
            notes: true,
            customFields: true,
            updatedAt: true,
            campus: { select: { code: true } },
            location: { select: { name: true } },
            department: { select: { name: true } },
            category: { select: { name: true } },
            subcategory: { select: { name: true } },
            condition: { select: { label: true } },
          },
        })
      : [],
    activeFields(user.organizationId),
  ]);

  const header = [
    "Code",
    "Name",
    "Category",
    "Subcategory",
    "Campus",
    "Location",
    "Department",
    "Condition",
    "Price",
    "Notes",
    ...fields.map((field) => field.label),
    "Last updated",
  ];
  const rows = items.map((item) => {
    const custom = (item.customFields ?? {}) as Record<string, unknown>;
    return [
      item.code,
      item.name,
      item.category.name,
      item.subcategory?.name ?? "",
      item.campus.code,
      item.location.name,
      item.department.name,
      item.condition.label,
      item.price?.toFixed(2) ?? "",
      item.notes ?? "",
      ...fields.map((field) => formatCustomFieldValue(field, custom[field.key])),
      item.updatedAt.toISOString(),
    ];
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(toCsv([header, ...rows]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
