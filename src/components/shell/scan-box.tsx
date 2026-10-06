"use client";

import { useEffect, useRef } from "react";
import { buttonClass, controlClass } from "@/components/ui";

/** Whether a key press is going into a field, so the "/" shortcut leaves it alone. */
function typingInField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Item code field in the top bar, on every signed-in page. Barcode scanners
 * type the code and press Enter, which submits it; "/" focuses it. Works as a
 * plain GET form without JavaScript.
 */
export function ScanBox({ className = "" }: { className?: string }) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (typingInField(event.target)) return;
      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    };
    document.addEventListener("keydown", focus);
    return () => document.removeEventListener("keydown", focus);
  }, []);

  return (
    <form
      action="/items/scan"
      method="get"
      role="search"
      aria-label="Find item by code"
      className={`flex items-center gap-2 ${className}`}
    >
      <label htmlFor="scan-code" className="sr-only">
        Scan or enter an item code
      </label>
      <input
        ref={input}
        id="scan-code"
        name="code"
        type="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="Scan or enter a code"
        title="Press / to jump here"
        aria-keyshortcuts="/"
        className={`${controlClass} min-w-0 flex-1`}
      />
      <button type="submit" className={buttonClass("secondary")}>
        Open item
      </button>
    </form>
  );
}
