import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { schnorr } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { finalizeEvent, verifyEvent } from "nostr-tools/pure";
import {
  FIXTURE_CLOCK as NOW,
  makeFixtures,
  type Case,
} from "../src/core/fixtures";
import {
  address,
  canonical,
  digest,
  eventHash,
  inspectEvent,
  parseFilters,
  query,
  signFixture,
  type NostrEvent,
} from "../src/core/protocol";
import {
  emptyState,
  evaluate,
  parsePolicy,
  presets,
  stateSummary,
} from "../src/core/policy";
import {
  evidence,
  parseCases,
  replay,
  verifyEvidence,
} from "../src/core/replay";
const permissive = () => parsePolicy({ ...presets.open, burstLimit: 500 });
const sign = (
  content = "hello",
  name = "test",
  kind = 1,
  tags: string[][] = [],
  at = NOW,
) => signFixture({ content, kind, tags, created_at: at }, name);
const sample = (event: unknown, i = 0): Case => ({
  label: `case ${i}`,
  note: "synthetic",
  event,
  receivedAt: NOW + i,
});
const accepted = (e: NostrEvent) => {
  const state = emptyState();
  assert.equal(evaluate(e, permissive(), state, NOW).verdict, "admit");
  return state;
};

test("all official BIP-340 vectors: valid signatures, invalid points/scalars and variable messages", () => {
  const lines = readFileSync(
    new URL("./fixtures/bip340-test-vectors.csv", import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/)
    .slice(1);
  assert.ok(lines.length >= 19);
  for (const line of lines) {
    const fields = line.split(",");
    const index = fields[0];
    let result = false;
    try {
      result = schnorr.verify(
        hexToBytes(fields[3]),
        hexToBytes(fields[2]),
        hexToBytes(fields[1]),
      );
    } catch {}
    assert.equal(
      result,
      fields[4] === "TRUE",
      `BIP-340 vector ${index}: ${fields[5]}`,
    );
  }
});
test("NIP-01 serialization matches independent Node SHA-256 and nostr-tools interoperability", () => {
  const event = sign(
    'Escapes: " \\ \n \r \t \b \f and 🌱 日本語',
    ["independent"][0],
    1,
    [["t", "unicode"]],
  );
  const bytes = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ]);
  assert.equal(canonical(event), bytes);
  assert.equal(
    event.id,
    createHash("sha256").update(bytes, "utf8").digest("hex"),
  );
  assert.equal(verifyEvent(structuredClone(event)), true);
  const key = Uint8Array.from({ length: 32 }, (_, i) => (i === 31 ? 9 : 0));
  const theirs = finalizeEvent(
    {
      created_at: NOW,
      kind: 1,
      tags: [["t", "interop"]],
      content: "from nostr-tools",
    },
    key,
  );
  assert.ok(inspectEvent(JSON.parse(JSON.stringify(theirs))).event);
});
test("every signed field is authenticated; no cached validity bypass", () => {
  const event = sign();
  assert.ok(inspectEvent(event).event);
  const mutations = [
    { content: "edited" },
    { created_at: NOW + 1 },
    { kind: 7 },
    { tags: [["p", "00".repeat(32)]] },
    { pubkey: "01".repeat(32) },
    { id: "00".repeat(32) },
    { sig: "00".repeat(64) },
  ];
  for (const patch of mutations)
    assert.ok(inspectEvent({ ...event, ...patch }).error);
  const state = accepted(event);
  assert.equal(
    evaluate(
      { ...event, content: "tamper after acceptance" },
      permissive(),
      state,
      NOW + 1,
    ).verdict,
    "reject",
  );
  assert.equal(state.events.size, 1);
});
test("shape checks reject annotations, secret fields, uppercase keys, fractional times and malformed tags", () => {
  const event = sign();
  for (const value of [
    null,
    [],
    { ...event, secretKey: "not-a-real-key" },
    { ...event, id: event.id.toUpperCase() },
    { ...event, created_at: 1.5 },
    { ...event, kind: 65536 },
    { ...event, tags: [[]] },
    { ...event, tags: [["x", null]] },
    { ...event, tags: Array(257).fill(["x"]) },
  ])
    assert.ok(inspectEvent(value).error);
  assert.equal(
    inspectEvent({ ...event, content: "x".repeat(65536) }).code,
    "wire-limit",
  );
});
test("signature check rejects a valid hash paired with an invalid curve point", () => {
  const e = { ...sign(), pubkey: "ff".repeat(32) };
  e.id = eventHash(e);
  assert.equal(inspectEvent(e).code, "signature");
});
test("UTF-8 budgets count bytes and accept the exact boundary", () => {
  const policy = parsePolicy({ ...presets.quiet, maxContentBytes: 4 });
  assert.equal(
    evaluate(sign("🌱"), policy, emptyState(), NOW).verdict,
    "admit",
  );
  assert.equal(
    evaluate(sign("🌱x"), policy, emptyState(), NOW).verdict,
    "reject",
  );
});
test("quarantine is explicit and absent from retained storage; a changed policy admits the same signature", () => {
  const cases = makeFixtures();
  const e = cases[1].event;
  const quiet = emptyState(),
    open = emptyState();
  assert.equal(evaluate(e, presets.quiet, quiet, NOW).verdict, "quarantine");
  assert.equal(quiet.events.size, 0);
  assert.equal(quiet.admitted.size, 0);
  assert.equal(evaluate(e, presets.open, open, NOW).verdict, "admit");
  assert.equal(open.events.size, 1);
});
test("duplicate deliveries do not spend accepted-event quota or create a second copy", () => {
  const state = emptyState(),
    policy = parsePolicy({ ...presets.quiet, burstLimit: 1 }),
    e = sign();
  assert.equal(evaluate(e, policy, state, NOW).verdict, "admit");
  assert.equal(evaluate(e, policy, state, NOW + 1).verdict, "duplicate");
  assert.equal(state.attempts.get(e.pubkey)!.length, 1);
  assert.equal(state.events.size, 1);
  assert.equal(
    evaluate(
      sign("new but backdated", "test", 1, [], NOW - 30),
      policy,
      state,
      NOW + 2,
    ).verdict,
    "reject",
  );
  assert.equal(
    evaluate(sign("exact rolling boundary", "test"), policy, state, NOW + 60)
      .verdict,
    "admit",
  );
});
test("timestamp bounds are inclusive; author timestamps cannot move the replay clock", () => {
  const p = parsePolicy({
    ...presets.quiet,
    maxAgeSeconds: 10,
    futureSkewSeconds: 2,
  });
  for (const offset of [-10, 2])
    assert.equal(
      evaluate(sign("x", "test", 1, [], NOW + offset), p, emptyState(), NOW)
        .verdict,
      "admit",
    );
  for (const offset of [-11, 3])
    assert.equal(
      evaluate(sign("x", "test", 1, [], NOW + offset), p, emptyState(), NOW)
        .verdict,
      "reject",
    );
  assert.throws(
    () => replay([sample(sign(), 1), sample(sign(), 0)], p),
    /arrival/,
  );
});
test("replaceable tie breaking is stable under either arrival order", () => {
  const a = sign("first", "m", 0),
    b = sign("second", "m", 0),
    winner = a.id < b.id ? a : b;
  for (const values of [
    [a, b],
    [b, a],
  ]) {
    const r = replay(values.map(sample), permissive());
    assert.deepEqual([...r.state.events.keys()], [winner.id]);
  }
  const old = sign("old", "m", 0, [], NOW - 1),
    r = replay([a, old].map(sample), permissive());
  assert.equal(r.decisions[1].effect, "superseded");
  assert.deepEqual([...r.state.events.keys()], [a.id]);
});
test("addressable documents isolate d tags and publishers; ephemeral events are never retained", () => {
  const first = sign("v1", "p", 30023, [["d", "one"]], NOW - 5),
    second = sign("v2", "p", 30023, [["d", "one"]]),
    other = sign("v1", "p", 30023, [["d", "two"]]);
  const r = replay(
    [first, second, other, sign("typing", "s", 20001)].map(sample),
    permissive(),
  );
  assert.deepEqual(
    new Set(r.state.events.keys()),
    new Set([second.id, other.id]),
  );
  assert.equal(r.decisions[3].effect, "ephemeral");
  assert.equal(address(first), address(second));
});
test("foreign deletion is atomically rejected; signer-owned deletion is retained and withdraws only local copies", () => {
  const note = sign("owner content", "owner");
  const foreign = sign("erase", "attacker", 5, [["e", note.id]]);
  const own = sign("withdraw", "owner", 5, [
    ["e", note.id],
    ["k", "1"],
  ]);
  const r = replay([note, foreign, own].map(sample), permissive());
  assert.equal(r.decisions[1].verdict, "reject");
  assert.equal(r.decisions[2].effect, "withdrawal");
  assert.deepEqual([...r.state.events.keys()], [own.id]);
  assert.equal(r.state.admitted.get(note.id)!.content, "owner content");
});
test("deletion-before-arrival tombstones cannot erase another signer or allow resurrection", () => {
  const note = sign("future arrival", "owner");
  const foreign = sign("pretend deletion", "other", 5, [["e", note.id]]),
    own = sign("withdraw", "owner", 5, [["e", note.id]]);
  const r = replay([foreign, note].map(sample), permissive());
  assert.equal(r.decisions[1].verdict, "admit");
  const ownRun = replay([own, note].map(sample), permissive());
  assert.equal(ownRun.decisions[1].verdict, "reject");
  assert.equal(ownRun.state.events.size, 1);
});
test("address deletion cutoff preserves newer editions; deleting a deletion request has no effect", () => {
  const old = sign("old", "owner", 30023, [["d", "a"]], NOW - 10),
    fresh = sign("fresh", "owner", 30023, [["d", "a"]], NOW + 1),
    del = sign("withdraw to cutoff", "owner", 5, [["a", address(old)!]], NOW);
  const r = replay(
    [
      old,
      del,
      fresh,
      sign("undo deletion", "owner", 5, [["e", del.id]], NOW + 2),
    ].map(sample),
    permissive(),
  );
  assert.ok(r.state.events.has(fresh.id));
  assert.ok(r.state.events.has(del.id));
  assert.ok(!r.state.events.has(old.id));
});
test("filters: exact ids, AND within filter, OR across filters, tag first value, newest tie order and limit zero", () => {
  const a = sign("a", "p", 1, [["t", "one", "two"]], NOW - 1),
    b = sign("b", "p", 7, [["t", "two"]]),
    c = sign("c", "q", 1, [["t", "three"]]);
  const events = [a, b, c];
  assert.deepEqual(
    query(events, parseFilters([{ authors: [a.pubkey], kinds: [1] }])),
    [a],
  );
  assert.deepEqual(query(events, parseFilters([{ "#t": ["two"] }])), [b]);
  assert.equal(
    query(events, parseFilters([{ ids: [a.id] }, { ids: [c.id] }])).length,
    2,
  );
  assert.equal(query(events, parseFilters([{ limit: 0 }])).length, 0);
  assert.deepEqual(
    query(events, parseFilters([{ since: NOW, until: NOW, limit: 1 }])),
    [b, c].sort((x, y) => (x.id < y.id ? -1 : 1)).slice(0, 1),
  );
  for (const f of [
    { ids: [a.id.slice(0, 8)] },
    { "#p": ["x"] },
    { limit: -1 },
    { unknown: [] },
    { kinds: [] },
  ])
    assert.throws(() => parseFilters([f]));
});
test("complete policies enforce every boundary, reject malformed values and cannot disable signatures", () => {
  for (const patch of [
    { futureSkewSeconds: -1 },
    { maxTags: 257 },
    { burstLimit: 0 },
    { quarantineLocation: "false" },
    { allowedKinds: [] },
    { blockedAuthors: ["bad"] },
    { verifySignatures: false },
  ])
    assert.throws(() => parsePolicy({ ...presets.quiet, ...patch }));
  const event = sign("test", "p", 1, [["e", "11".repeat(32)]]);
  for (const patch of [
    { blockedAuthors: [event.pubkey] },
    { maxTags: 0 },
    { maxReferences: 0 },
    { allowedKinds: [7] },
  ])
    assert.equal(
      evaluate(
        event,
        parsePolicy({ ...presets.quiet, ...patch }),
        emptyState(),
        NOW,
      ).verdict,
      "reject",
    );
});
test("evidence survives JSON/key reordering, catches byte changes and catches forged decisions with recomputed hashes", () => {
  const file = evidence(makeFixtures(), presets.quiet);
  assert.equal(verifyEvidence(JSON.parse(JSON.stringify(file))).ok, true);
  assert.deepEqual(replay(makeFixtures(), presets.quiet).counts, {
    admit: 11,
    quarantine: 1,
    reject: 7,
    duplicate: 1,
  });
  const changed = structuredClone(file);
  changed.cases[0].label = "Changed";
  assert.throws(() => verifyEvidence(changed), /digest mismatch/);
  const forged = structuredClone(file);
  forged.decisions[0].verdict = "reject";
  const { digest: _, ...payload } = forged;
  forged.digest = digest(payload);
  assert.throws(() => verifyEvidence(forged), /Replay mismatch/);
  assert.equal(file.finalState.stored.length, 7);
  assert.ok(!JSON.stringify(file).includes("secretKey"));
});
test("import forbids secret annotations and invalid arrival order; replay is bounded and inputs remain unchanged", () => {
  const e = sign(),
    rows = [sample(e)];
  assert.throws(() => parseCases([{ ...rows[0], secret: "x" }]));
  assert.throws(() => parseCases([sample({ ...e, secretKey: "x" })]));
  assert.throws(() => parseCases([sample(e, 2), sample(e, 1)]));
  assert.throws(
    () =>
      replay(
        Array.from({ length: 501 }, (_, i) => sample(e, i)),
        permissive(),
      ),
    /500/,
  );
  const before = JSON.stringify(rows);
  replay(rows, permissive());
  assert.equal(JSON.stringify(rows), before);
  const a = replay(rows, permissive()),
    b = replay(rows, permissive());
  assert.equal(digest(stateSummary(a.state)), digest(stateSummary(b.state)));
});
