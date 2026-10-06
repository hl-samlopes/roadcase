/**
 * A check-out's history, assembled from what's already recorded: the
 * check-out, its contracts and signatures, each line's return, and tickets
 * opened on return. Pure, so it's easy to test; the loader is in
 * src/lib/data/checkout-history.ts.
 */

const signerLabels = { GUEST: "guest representative", STAFF: "staff representative" } as const;

export interface HistorySource {
  createdAt: Date;
  createdBy: string | null;
  cancelledAt: Date | null;
  returnedAt: Date | null;
  contracts: {
    preparedAt: Date;
    preparedBy: string | null;
    voidedAt: Date | null;
    signedAt: Date | null;
    signatures: { role: "GUEST" | "STAFF"; printedName: string; signedAt: Date }[];
  }[];
  returns: {
    returnedAt: Date;
    returnedBy: string | null;
    code: string;
    name: string;
    condition: string;
    notes: string | null;
  }[];
  tickets: { createdAt: Date; number: number; code: string; title: string }[];
}

export interface HistoryEntry {
  at: Date;
  text: string;
  /** Details shown under the entry, such as each returned item. */
  details: string[];
}

/**
 * The order things happen in. Some times come from the app's clock and some
 * from the database's, a few milliseconds apart, so within the same second
 * this decides the order (a check-in, then its ticket, then "everything back").
 */
const rank = {
  created: 0,
  prepared: 1,
  signed: 2,
  voided: 3,
  out: 4,
  checkedIn: 5,
  ticket: 6,
  back: 7,
  cancelled: 8,
} as const;

type Ranked = HistoryEntry & { rank: number };

const who = (name: string | null) => name ?? "a former user";

export function buildHistory(source: HistorySource): HistoryEntry[] {
  const entries: Ranked[] = [
    {
      at: source.createdAt,
      text: `Created by ${who(source.createdBy)}`,
      details: [],
      rank: rank.created,
    },
  ];

  for (const contract of source.contracts) {
    entries.push({
      at: contract.preparedAt,
      text: `Contract prepared by ${who(contract.preparedBy)}`,
      details: [],
      rank: rank.prepared,
    });
    for (const signature of contract.signatures) {
      entries.push({
        at: signature.signedAt,
        text: `Signed by ${signature.printedName} (${signerLabels[signature.role]})`,
        details: [],
        rank: rank.signed,
      });
    }
    if (contract.voidedAt) {
      entries.push({
        at: contract.voidedAt,
        text: "Returned to draft; that contract was set aside",
        details: [],
        rank: rank.voided,
      });
    }
    if (contract.signedAt) {
      entries.push({
        at: contract.signedAt,
        text: "Contract signed; equipment out",
        details: [],
        rank: rank.out,
      });
    }
  }

  // Items checked in together share a timestamp and person: one entry each time.
  const batches = new Map<string, Ranked>();
  for (const line of source.returns) {
    const key = `${line.returnedAt.toISOString()}|${line.returnedBy ?? ""}`;
    const batch = batches.get(key) ?? {
      at: line.returnedAt,
      text: `Checked in by ${who(line.returnedBy)}`,
      details: [],
      rank: rank.checkedIn,
    };
    batch.details.push(
      `${line.code} ${line.name}: ${line.condition}${line.notes ? `. ${line.notes}` : ""}`,
    );
    batches.set(key, batch);
  }
  for (const batch of batches.values()) {
    const count = batch.details.length;
    batch.text = `${batch.text}: ${count} item${count === 1 ? "" : "s"}`;
    entries.push(batch);
  }

  for (const ticket of source.tickets) {
    entries.push({
      at: ticket.createdAt,
      text: `Ticket #${ticket.number} opened for ${ticket.code}: ${ticket.title}`,
      details: [],
      rank: rank.ticket,
    });
  }
  if (source.returnedAt) {
    entries.push({
      at: source.returnedAt,
      text: "Everything is back",
      details: [],
      rank: rank.back,
    });
  }
  if (source.cancelledAt) {
    entries.push({ at: source.cancelledAt, text: "Cancelled", details: [], rank: rank.cancelled });
  }

  // Oldest first, by the second; then by what happens first; then as added.
  const second = (date: Date) => Math.floor(date.getTime() / 1000);
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        second(a.entry.at) - second(b.entry.at) || a.entry.rank - b.entry.rank || a.index - b.index,
    )
    .map(({ entry: { rank: _rank, ...entry } }) => entry);
}
