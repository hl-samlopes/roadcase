import "server-only";
import { z } from "zod";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import type { EmailContent } from "@/lib/email/layout";
import { formatDate } from "@/lib/format";
import { bandNeeds } from "./needs";

const data = z.object({ setupId: z.uuid(), submittedAt: z.iso.datetime() });

/** To the audio team: a group sent (or changed) its band setup. */
export async function bandSentEmail(
  organizationId: string,
  raw: Record<string, string>,
): Promise<
  { content: EmailContent; place: { organizationId: string; campusId: string } } | { skip: string }
> {
  const parsed = data.safeParse(raw);
  if (!parsed.success) return { skip: "not a band email" };
  const setup = await db.bandSetup.findFirst({
    where: { id: parsed.data.setupId, organizationId },
    select: {
      organizationId: true,
      campusId: true,
      status: true,
      submittedAt: true,
      inEarMonitors: true,
      clickTrack: true,
      expectedChannels: true,
      notes: true,
      members: {
        orderBy: { order: "asc" },
        select: { label: true, position: { select: { name: true } } },
      },
      guestGroup: {
        select: {
          id: true,
          name: true,
          arrivalDate: true,
          departureDate: true,
          archivedAt: true,
          campus: { select: { name: true } },
        },
      },
    },
  });
  if (!setup || setup.guestGroup.archivedAt) return { skip: "band setup no longer exists" };
  if (
    setup.status !== "SUBMITTED" ||
    setup.submittedAt?.toISOString() !== parsed.data.submittedAt
  ) {
    return { skip: "a newer version was sent" };
  }
  const group = setup.guestGroup;
  return {
    place: { organizationId: setup.organizationId, campusId: setup.campusId },
    content: {
      subject: `Band setup from ${group.name}`,
      heading: `${group.name} sent its band setup`,
      paragraphs: [
        `For ${group.campus.name}, ${formatDate(group.arrivalDate)} to ${formatDate(group.departureDate)}:`,
        ...setup.members.map((member) =>
          member.label ? `${member.position.name}: ${member.label}` : member.position.name,
        ),
        ...bandNeeds(setup).map((need) => `Also: ${need}`),
      ],
      action: { label: "See the input list", url: appUrl(`/guests/${group.id}/band`) },
      footer:
        "You're getting this because you run check-outs at this campus. Turn these emails off in Preferences.",
    },
  };
}
