import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, Card, PageHeader, TextField } from "@/components/ui";
import { requireUser } from "@/lib/authz";
import { findItemByCode } from "@/lib/data/items";

export const metadata: Metadata = { title: "Find item by code" };

/** Opens the item whose label was scanned (scanners type the code and press Enter). */
export default async function ScanPage({ searchParams }: PageProps<"/items/scan">) {
  const user = await requireUser();
  const raw = (await searchParams).code;
  const code = typeof raw === "string" ? raw.trim() : "";
  if (code) {
    const item = await findItemByCode(user, code);
    if (item) redirect(`/items/${item.id}`);
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div>
        <Link href="/items" className="text-accent hover:underline">
          Back to inventory
        </Link>
      </div>
      <PageHeader title="Find item by code" />
      <Card>
        {code ? (
          <p role="alert" className="mb-3">
            No item you can see has the code <span className="font-mono">{code.toUpperCase()}</span>
            .
          </p>
        ) : null}
        <form method="get" className="flex flex-wrap items-end gap-2">
          <TextField
            label="Item code"
            name="code"
            id="find-code"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="HNE-000123"
          />
          <button type="submit" className={buttonClass("secondary")}>
            Open item
          </button>
        </form>
      </Card>
    </div>
  );
}
