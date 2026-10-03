"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A native <details> menu that also closes on navigation, Escape, or a click
 * outside. Works without JavaScript as a plain disclosure.
 */
export function Disclosure({
  summary,
  summaryClassName,
  panelClassName,
  children,
}: {
  summary: ReactNode;
  summaryClassName?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => {
      const details = ref.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        details.open = false;
        details.querySelector("summary")?.focus();
      } else if (!details.contains(event.target as Node)) {
        details.open = false;
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary className={summaryClassName}>{summary}</summary>
      <div className={panelClassName}>{children}</div>
    </details>
  );
}
