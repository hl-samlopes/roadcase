import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { can, requireUser } from "@/lib/authz";
import { allowedHomes, getItem, homeValue, itemFormOptions } from "@/lib/data/items";
import { updateItemAction } from "../../actions";
import { ItemForm } from "../../item-form";

export const metadata: Metadata = { title: "Edit item" };

export default async function EditItemPage({ params }: PageProps<"/items/[id]/edit">) {
  const user = await requireUser();
  const item = await getItem(user, (await params).id);
  if (!item || !can(user, "item:update", item)) notFound();

  const [homes, options] = await Promise.all([
    allowedHomes(user, "item:update"),
    itemFormOptions(user),
  ]);
  const currentHome = homeValue(item.locationId, item.departmentId);
  // Keep the current home and condition selectable even if since archived.
  const homeChoices = homes.some((home) => home.value === currentHome)
    ? homes
    : [
        {
          value: currentHome,
          label: `${item.location.name} · ${item.department.name} (current)`,
          campusLabel: `${item.campus.name} (${item.campus.code})`,
        },
        ...homes,
      ];
  const conditions = options.conditions.some((c) => c.id === item.conditionId)
    ? options.conditions
    : [
        { id: item.conditionId, label: `${item.condition.label} (archived)`, isDefault: false },
        ...options.conditions,
      ];

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/items/${item.id}`} className="text-accent hover:underline">
          Back to {item.code}
        </Link>
      </div>
      <PageHeader title={`Edit ${item.name}`} />
      <Card>
        <ItemForm
          action={updateItemAction.bind(null, item.id)}
          submitLabel="Save item"
          options={{ ...options, conditions, homes: homeChoices }}
          defaults={{
            name: item.name,
            home: currentHome,
            category: item.categoryId,
            subcategory: item.subcategoryId ?? "",
            condition: item.conditionId,
            price: item.price?.toFixed(2) ?? "",
            notes: item.notes ?? "",
            customFields: (item.customFields ?? {}) as Record<string, unknown>,
          }}
        />
      </Card>
    </div>
  );
}
