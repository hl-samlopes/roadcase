"use client";

import { useEffect, useRef } from "react";
import { TextField } from "./ui";

/** Today's date in the browser's time zone, as YYYY-MM-DD. */
function localToday() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A date field that starts at today's date where the user is. The server
 * can't know that (it may run in UTC), so the default is filled in the browser.
 */
export function LocalDateField(props: {
  label: string;
  name: string;
  id?: string;
  required?: boolean;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const input = wrapper.current?.querySelector("input");
    if (input && !input.value) input.value = localToday();
  }, []);
  return (
    <div ref={wrapper}>
      <TextField type="date" {...props} />
    </div>
  );
}
