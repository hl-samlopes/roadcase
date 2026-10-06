"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { touchTarget } from "@/components/ui";

export interface NavItem {
  href: string;
  label: string;
}

/** Main navigation; the current section is marked by weight and a bar, not color alone. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {items.map((item) => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`${touchTarget} rounded-theme flex items-center border-l-4 px-3 py-1.5 ${
                  current
                    ? "border-accent bg-bg text-text font-semibold"
                    : "text-muted hover:bg-bg hover:text-text border-transparent"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
