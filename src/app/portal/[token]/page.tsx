import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { portalRequest } from "@/lib/data/portal";
import { formatDate } from "@/lib/format";
import { guestRequestStatusLabels } from "@/lib/portal/request-labels";
import { guestCanEdit } from "@/lib/portal/requests";
import { loadPortal, PortalShell, portalMetadata } from "./shell";

export async function generateMetadata({
  params,
}: PageProps<"/portal/[token]">): Promise<Metadata> {
  const { portal, branding } = await loadPortal((await params).token, "portal:view");
  return portalMetadata(portal.group.name, branding);
}

/** A guest group's page, reached by its private link with no account. */
export default async function PortalPage({ params }: PageProps<"/portal/[token]">) {
  const { token } = await params;
  const { portal, branding } = await loadPortal(token, "portal:view");
  const { group } = portal;
  const request = await portalRequest(portal.principal);
  const lastDay = new Date(`${portal.lastDay}T00:00:00Z`);
  const requested = request?.lines.reduce((sum, line) => sum + line.quantityRequested, 0) ?? 0;

  return (
    <PortalShell branding={branding}>
      <div>
        <p className="text-muted">Group page</p>
        <h1 className="text-2xl">{group.name}</h1>
      </div>
      <section className="rounded-theme border-border bg-surface border p-4">
        <h2 className="mb-3 text-base">Your visit</h2>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Where</dt>
            <dd>{group.campusName}</dd>
          </div>
          <div>
            <dt className="text-muted">When</dt>
            <dd>
              {formatDate(group.arrivalDate)} to {formatDate(group.departureDate)}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Group contact</dt>
            <dd>{group.repName}</dd>
          </div>
          <div>
            <dt className="text-muted">Your staff contact</dt>
            <dd>
              {group.staffContact ? (
                <>
                  {group.staffContact.name}
                  <a
                    href={`mailto:${group.staffContact.email}`}
                    className="text-accent block hover:underline"
                  >
                    {group.staffContact.email}
                  </a>
                </>
              ) : (
                "Ask the staff member who set up your visit."
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section className="rounded-theme border-border bg-surface border p-4">
        <h2 className="mb-2 text-base">Equipment</h2>
        <p className="mb-3">
          {request
            ? `Your request: ${guestRequestStatusLabels[request.status]}. ${requested} item${requested === 1 ? "" : "s"}.`
            : "Ask for the equipment you'd like ready for your visit. Staff review every request."}
        </p>
        <Link href={`/portal/${token}/equipment`} className={buttonClass("primary")}>
          {!request
            ? "Request equipment"
            : guestCanEdit(request.status)
              ? "See or change your request"
              : "See your request"}
        </Link>
      </section>
      <section className="rounded-theme border-border bg-surface border p-4">
        <h2 className="mb-2 text-base">Coming soon</h2>
        <p>
          Telling the audio team about your band will open on this page. Your staff contact will let
          you know.
        </p>
      </section>
      <p className="text-muted">
        This page is private to your group and works until {formatDate(lastDay)}. Anyone with the
        link can see it, so share it only with your team.
      </p>
    </PortalShell>
  );
}
