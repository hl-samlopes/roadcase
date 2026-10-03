import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { listItems } from "@/lib/data/items";
import { conditionLabels } from "@/lib/labels";

export const metadata: Metadata = { title: "Inventory · Roadcase" };

export default async function ItemsPage() {
  const user = await requireUser();
  const items = await listItems(user);

  return (
    <>
      <PageHeader title="Inventory" />
      {items.length === 0 ? (
        <p className="text-muted">No equipment you have access to yet.</p>
      ) : (
        <table className="rounded-theme border-border bg-surface w-full border-collapse border">
          <thead>
            <tr className="border-border text-muted border-b text-left">
              <th className="p-2">Code</th>
              <th className="p-2">Name</th>
              <th className="p-2">Campus</th>
              <th className="p-2">Location</th>
              <th className="p-2">Department</th>
              <th className="p-2">Condition</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-border border-b last:border-0">
                <td className="p-2 font-mono">{item.code}</td>
                <td className="p-2">
                  <Link href={`/items/${item.id}`} className="text-accent hover:underline">
                    {item.name}
                  </Link>
                </td>
                <td className="p-2">{item.campus.code}</td>
                <td className="p-2">{item.location.name}</td>
                <td className="p-2">{item.department.name}</td>
                <td className="p-2">{conditionLabels[item.condition]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
