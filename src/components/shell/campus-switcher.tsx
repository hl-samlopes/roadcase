import { setActiveCampusAction } from "@/app/(app)/actions";
import { touchTarget } from "@/components/ui";
import { Disclosure } from "./disclosure";

interface Campus {
  id: string;
  code: string;
  name: string;
}

const optionClass = `${touchTarget} w-full rounded-theme px-3 py-1.5 text-left hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent`;

export function CampusSwitcher({
  campuses,
  active,
}: {
  campuses: Campus[];
  active: Campus | null;
}) {
  if (campuses.length === 0) return null;
  const options = [{ id: "all", code: "", name: "All campuses" }, ...campuses];
  const currentId = active?.id ?? "all";

  return (
    <Disclosure
      summaryClassName={`${touchTarget} rounded-theme border-border bg-surface flex cursor-pointer list-none items-center border px-3 py-1.5`}
      panelClassName="rounded-theme border-border bg-surface absolute left-0 z-20 mt-1 min-w-56 border p-1 shadow-sm"
      summary={
        <span>
          <span className="text-muted">Campus: </span>
          <span className="font-semibold">
            {active ? `${active.name} (${active.code})` : "All campuses"}
          </span>
          <span aria-hidden="true"> ▾</span>
        </span>
      }
    >
      <form action={setActiveCampusAction}>
        <ul aria-label="Switch campus">
          {options.map((campus) => {
            const current = campus.id === currentId;
            return (
              <li key={campus.id}>
                <button
                  type="submit"
                  name="campusId"
                  value={campus.id}
                  aria-current={current ? "true" : undefined}
                  className={`${optionClass} ${current ? "font-semibold" : ""}`}
                >
                  {campus.code ? `${campus.name} (${campus.code})` : campus.name}
                  {current ? <span className="text-muted"> (current)</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </form>
    </Disclosure>
  );
}
