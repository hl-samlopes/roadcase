import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { getItem } from "@/lib/data/items";
import { conditionLabels } from "@/lib/labels";

export const metadata: Metadata = { title: "Item" };

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const item = await getItem(user, id);
  if (!item) notFound();

  const rows: [string, string][] = [
    ["Code", item.code],
    [
      "Category",
      item.subcategory ? `${item.category.name} / ${item.subcategory.name}` : item.category.name,
    ],
    ["Campus", `${item.campus.name} (${item.campus.code})`],
    ["Location", item.location.name],
    ["Department", item.department.name],
    ["Condition", conditionLabels[item.condition]],
    ["Notes", item.notes ?? "None"],
  ];

  return (
    <>
      <PageHeader title={item.name} />
      <Card>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
