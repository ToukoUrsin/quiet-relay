import { signFixture, type NostrEvent } from "./protocol";
export const FIXTURE_CLOCK = Date.UTC(2026, 8, 21, 18, 0, 0) / 1000;
export type Case = {
  label: string;
  note: string;
  event: unknown;
  receivedAt: number;
};
export const identities = [
  "Moss",
  "Nila",
  "Burst",
  "Drift",
  "Pip",
  "Signal",
  "Ivo",
  "Slate",
] as const;
export const fixtureAuthor = (name: string) =>
  signFixture(
    {
      created_at: FIXTURE_CLOCK,
      kind: 1,
      tags: [],
      content: "PUBLIC FIXTURE IDENTITY",
    },
    name,
  ).pubkey;
export const authorNames = Object.fromEntries(
  identities.map((name) => [fixtureAuthor(name), name]),
);
export function makeFixtures(): Case[] {
  const rows: Case[] = [];
  const sign = (
    name: string,
    content: string,
    kind = 1,
    tags: string[][] = [],
    offset = -30,
  ) =>
    signFixture(
      { kind, content, tags, created_at: FIXTURE_CLOCK + offset },
      name,
    );
  const add = (label: string, note: string, event: unknown) =>
    rows.push({ label, note, event, receivedAt: FIXTURE_CLOCK + rows.length });
  const moss = sign("Moss", "The community garden opens at ten. Bring a mug.");
  add(
    "A small, ordinary note",
    "A signed baseline. Nothing is hidden in its tags.",
    moss,
  );
  add(
    "A location hidden in plain sight",
    "Valid signing does not make coordinates or relationship metadata private.",
    sign("Nila", "Meet by the north gate.", 1, [
      ["g", "9q8yyk8"],
      ["p", moss.pubkey, "wss://relay.example.org"],
    ]),
  );
  add(
    "One word changed after signing",
    "Content tampering keeps the original id and signature.",
    { ...moss, content: "The community garden opens at midnight." },
  );
  add(
    "Delivered twice",
    "A retry must not create a second delivery or consume the budget.",
    structuredClone(moss),
  );
  for (let i = 1; i <= 4; i++)
    add(
      `Burst ${i} of 4`,
      i === 4
        ? "Arrival-based rate limiting catches the fourth unique event."
        : "Same author, distinct correctly signed content.",
      sign("Burst", `Sensor update ${i}: the room is quiet.`, 1, [], -i),
    );
  add(
    "Tomorrow, today",
    "Author-controlled clocks cannot bypass the permitted time window.",
    sign("Drift", "A note dated one hour in the future.", 1, [], 3600),
  );
  add(
    "A profile, first edition",
    "Kind 0 is replaceable by the same public key.",
    sign(
      "Moss",
      JSON.stringify({
        name: "Moss",
        about: "Community gardener · synthetic identity",
      }),
      0,
      [],
      -90,
    ),
  );
  add(
    "A profile, revised",
    "Only the latest version should be returned to a new subscriber.",
    sign(
      "Moss",
      JSON.stringify({
        name: "Moss",
        about: "Community gardener and seed librarian · synthetic identity",
      }),
      0,
      [],
      -10,
    ),
  );
  add(
    "Field guide, revision one",
    "An addressable document is keyed by author, kind and d tag.",
    sign(
      "Pip",
      "# Seed library\nOpen on Saturdays.",
      30023,
      [["d", "seed-library"]],
      -80,
    ),
  );
  add(
    "Field guide, revision two",
    "The stable address survives; the content id changes.",
    sign(
      "Pip",
      "# Seed library\nOpen on Saturdays and Wednesdays.",
      30023,
      [["d", "seed-library"]],
      -5,
    ),
  );
  add(
    "A passing signal",
    "Ephemeral kind 20001 is delivered live without retention.",
    sign("Signal", "typing", 20001),
  );
  const ivo = sign("Ivo", "A rehearsal notice to withdraw locally.");
  add(
    "A note to withdraw",
    "This event will be accepted before its author requests removal.",
    ivo,
  );
  add(
    "Its author changes their mind",
    "NIP-09 withdraws a local copy; it cannot erase somebody else’s copy.",
    sign(
      "Ivo",
      "Please withdraw my earlier rehearsal notice.",
      5,
      [
        ["e", ivo.id],
        ["k", "1"],
      ],
      -1,
    ),
  );
  add(
    "Someone else tries to erase a note",
    "A valid signature cannot grant authority over another author.",
    sign("Slate", "Delete Moss’s note.", 5, [
      ["e", moss.id],
      ["k", "1"],
    ]),
  );
  add(
    "Small in characters, large in bytes",
    "Four-byte characters exercise the actual UTF-8 budget.",
    sign("Drift", "🌱".repeat(400)),
  );
  const badsig = sign("Slate", "The id is authentic; the signature is not.");
  add(
    "A signature-shaped forgery",
    "Syntactically valid hex is not a cryptographic proof.",
    { ...badsig, sig: "00".repeat(64) },
  );
  add(
    "A kind outside the contract",
    "An authentic event can still be outside this relay’s supported kinds.",
    sign("Slate", "Unsupported rehearsal event.", 443),
  );
  return rows;
}
export const fixtureEvent = (row: Case) => row.event as NostrEvent;
