import {
  address,
  byteLength,
  digest,
  HEX,
  inspectEvent,
  isEphemeral,
  isRecord,
  newestFirst,
  type NostrEvent,
  validInt,
} from "./protocol";

export interface Policy {
  name: string;
  allowedKinds: number[];
  maxContentBytes: number;
  maxTags: number;
  maxReferences: number;
  maxAgeSeconds: number;
  futureSkewSeconds: number;
  burstLimit: number;
  burstWindowSeconds: number;
  quarantineLocation: boolean;
  quarantineRelayHints: boolean;
  quarantineMentions: boolean;
  blockedAuthors: string[];
}
export const presets: Record<string, Policy> = {
  quiet: {
    name: "Quiet",
    allowedKinds: [0, 1, 3, 5, 7, 10002, 20001, 30023],
    maxContentBytes: 1200,
    maxTags: 24,
    maxReferences: 6,
    maxAgeSeconds: 86400,
    futureSkewSeconds: 300,
    burstLimit: 3,
    burstWindowSeconds: 60,
    quarantineLocation: true,
    quarantineRelayHints: true,
    quarantineMentions: false,
    blockedAuthors: [],
  },
  open: {
    name: "Open",
    allowedKinds: [0, 1, 3, 5, 7, 10002, 20001, 30023],
    maxContentBytes: 12000,
    maxTags: 100,
    maxReferences: 30,
    maxAgeSeconds: 604800,
    futureSkewSeconds: 3600,
    burstLimit: 20,
    burstWindowSeconds: 60,
    quarantineLocation: false,
    quarantineRelayHints: false,
    quarantineMentions: false,
    blockedAuthors: [],
  },
  strict: {
    name: "Strict",
    allowedKinds: [1, 5, 7],
    maxContentBytes: 600,
    maxTags: 8,
    maxReferences: 2,
    maxAgeSeconds: 3600,
    futureSkewSeconds: 60,
    burstLimit: 2,
    burstWindowSeconds: 60,
    quarantineLocation: true,
    quarantineRelayHints: true,
    quarantineMentions: true,
    blockedAuthors: [],
  },
};
export function parsePolicy(input: unknown): Policy {
  if (
    !isRecord(input) ||
    Object.keys(input).sort().join("|") !==
      Object.keys(presets.quiet).sort().join("|")
  )
    throw new Error("Policy fields do not match schema v1.");
  if (
    typeof input.name !== "string" ||
    input.name.length < 1 ||
    input.name.length > 40
  )
    throw new Error("Policy name needs 1–40 characters.");
  const ranges: Record<string, [number, number]> = {
    maxContentBytes: [1, 60000],
    maxTags: [0, 256],
    maxReferences: [0, 256],
    maxAgeSeconds: [0, 315360000],
    futureSkewSeconds: [0, 86400],
    burstLimit: [1, 500],
    burstWindowSeconds: [1, 86400],
  };
  for (const [key, [min, max]] of Object.entries(ranges))
    if (
      !validInt(input[key]) ||
      Number(input[key]) < min ||
      Number(input[key]) > max
    )
      throw new Error(`${key} must be an integer from ${min} to ${max}.`);
  if (
    !Array.isArray(input.allowedKinds) ||
    !input.allowedKinds.length ||
    input.allowedKinds.length > 100 ||
    input.allowedKinds.some((x) => !validInt(x) || x > 65535)
  )
    throw new Error("Allowed kinds need 1–100 valid kind numbers.");
  if (
    !Array.isArray(input.blockedAuthors) ||
    input.blockedAuthors.length > 100 ||
    input.blockedAuthors.some((x) => typeof x !== "string" || !HEX.test(x))
  )
    throw new Error("Blocked authors must be exact public keys, at most 100.");
  for (const key of [
    "quarantineLocation",
    "quarantineRelayHints",
    "quarantineMentions",
  ])
    if (typeof input[key] !== "boolean")
      throw new Error(`${key} must be boolean.`);
  return {
    ...input,
    allowedKinds: [...new Set(input.allowedKinds)].sort((a, b) => a - b),
    blockedAuthors: [...new Set(input.blockedAuthors)].sort(),
  } as Policy;
}
export type Verdict = "admit" | "quarantine" | "reject" | "duplicate";
export type Check = {
  code: string;
  label: string;
  detail: string;
  result: "pass" | "fail" | "hold" | "info";
};
export type Exposure = {
  type: "location" | "relay" | "mention" | "link" | "address";
  label: string;
  value: string;
  field: string;
};
export type Decision = {
  id: string;
  verdict: Verdict;
  summary: string;
  checks: Check[];
  exposures: Exposure[];
  event?: NostrEvent;
  effect: string;
  removed: string[];
  receivedAt: number;
  ok: [string, string, boolean, string];
};
export interface RelayState {
  events: Map<string, NostrEvent>;
  admitted: Map<string, NostrEvent>;
  attempts: Map<string, number[]>;
  deletedIds: Set<string>;
  deletedAddresses: Map<string, number>;
  clock: number;
  processed: number;
}
export const emptyState = (): RelayState => ({
  events: new Map(),
  admitted: new Map(),
  attempts: new Map(),
  deletedIds: new Set(),
  deletedAddresses: new Map(),
  clock: 0,
  processed: 0,
});
export function exposures(e: NostrEvent): Exposure[] {
  const out: Exposure[] = [];
  e.tags.forEach((tag, i) => {
    if (["g", "location"].includes(tag[0]) && tag[1])
      out.push({
        type: "location",
        label: "Location is public",
        value: tag[1],
        field: `tags[${i}][1]`,
      });
    if (tag[0] === "p" && tag[1])
      out.push({
        type: "mention",
        label: "An identity link is public",
        value: tag[1],
        field: `tags[${i}][1]`,
      });
    if (tag[0] === "d" && tag[1])
      out.push({
        type: "address",
        label: "Stable document identifier",
        value: tag[1],
        field: `tags[${i}][1]`,
      });
    tag.forEach((value, j) => {
      if (/^wss?:\/\//i.test(value))
        out.push({
          type: "relay",
          label: "A relay hint is public",
          value,
          field: `tags[${i}][${j}]`,
        });
    });
  });
  for (const match of e.content.matchAll(/https?:\/\/[^\s<>"']+/gi))
    out.push({
      type: "link",
      label: "A content link is public",
      value: match[0],
      field: "content",
    });
  return out;
}

export function evaluate(
  input: unknown,
  policy: Policy,
  state: RelayState,
  receivedAt: number,
): Decision {
  if (!validInt(receivedAt) || receivedAt < state.clock)
    throw new Error(
      "Replay arrival times must be nonnegative and nondecreasing.",
    );
  state.clock = receivedAt;
  state.processed++;
  let id =
    isRecord(input) && typeof input.id === "string" && HEX.test(input.id)
      ? input.id
      : "";
  const checks: Check[] = [],
    seenExposures: Exposure[] = [];
  let event: NostrEvent | undefined;
  const finish = (
    verdict: Verdict,
    summary: string,
    effect = "none",
    removed: string[] = [],
  ): Decision => ({
    id,
    verdict,
    summary,
    checks,
    exposures: seenExposures,
    event,
    effect,
    removed,
    receivedAt,
    ok: [
      "OK",
      id,
      verdict === "admit" || verdict === "duplicate",
      verdict === "admit"
        ? ""
        : verdict === "duplicate"
          ? "duplicate: already accepted"
          : `${checks.find((c) => c.result === "fail")?.code === "burst" ? "rate-limited" : verdict === "quarantine" ? "restricted" : "invalid"}: ${summary}`,
    ],
  });
  if (state.processed > 500) {
    checks.push({
      code: "capacity",
      label: "Run ceiling",
      detail: "A rehearsal accepts at most 500 input records.",
      result: "fail",
    });
    return finish("reject", "Rehearsal capacity reached");
  }
  const inspection = inspectEvent(input);
  if (!inspection.event) {
    checks.push({
      code: inspection.code!,
      label: "Event integrity",
      detail: inspection.error!,
      result: "fail",
    });
    return finish("reject", inspection.error!);
  }
  event = inspection.event;
  id = event.id;
  checks.push({
    code: "signature",
    label: "Signature + content hash",
    detail:
      "Fresh Schnorr verification passed over the canonical NIP-01 event hash.",
    result: "pass",
  });
  seenExposures.push(...exposures(event));
  if (state.admitted.has(id)) {
    checks.push({
      code: "duplicate",
      label: "Duplicate event",
      detail:
        "Already accepted in this run. Acknowledged without storage, rebroadcast or budget use.",
      result: "info",
    });
    return finish(
      "duplicate",
      "Already accepted; no second delivery",
      "duplicate",
    );
  }
  const add = (code: string, label: string, pass: boolean, detail: string) =>
    checks.push({ code, label, detail, result: pass ? "pass" : "fail" });
  add(
    "author",
    "Author policy",
    !policy.blockedAuthors.includes(event.pubkey),
    policy.blockedAuthors.includes(event.pubkey)
      ? "This exact public key is blocked."
      : "This public key is not blocked.",
  );
  add(
    "kind",
    "Event kind",
    policy.allowedKinds.includes(event.kind),
    `Kind ${event.kind}; allowed: ${policy.allowedKinds.join(", ")}.`,
  );
  add(
    "content-bytes",
    "UTF-8 content size",
    byteLength(event.content) <= policy.maxContentBytes,
    `${byteLength(event.content)} bytes / ${policy.maxContentBytes} permitted.`,
  );
  add(
    "tags",
    "Tag budget",
    event.tags.length <= policy.maxTags,
    `${event.tags.length} tags / ${policy.maxTags} permitted.`,
  );
  const references = event.tags.filter((t) =>
    ["p", "e", "a"].includes(t[0]),
  ).length;
  add(
    "references",
    "Reference budget",
    references <= policy.maxReferences,
    `${references} references / ${policy.maxReferences} permitted.`,
  );
  add(
    "age",
    "Timestamp window",
    event.created_at >= receivedAt - policy.maxAgeSeconds &&
      event.created_at <= receivedAt + policy.futureSkewSeconds,
    `${receivedAt - event.created_at} seconds old; oldest ${policy.maxAgeSeconds}, future skew ${policy.futureSkewSeconds}.`,
  );
  const prior = (state.attempts.get(event.pubkey) ?? []).filter(
    (t) => t > receivedAt - policy.burstWindowSeconds,
  );
  add(
    "burst",
    "Accepted-event rate",
    prior.length < policy.burstLimit,
    `${prior.length} accepted / ${policy.burstLimit} allowed in the preceding ${policy.burstWindowSeconds} seconds; arrival clock, not author timestamp.`,
  );
  const addr = address(event);
  const tombstoned =
    event.kind !== 5 &&
    (state.deletedIds.has(`${event.pubkey}:${event.id}`) ||
      (addr !== undefined &&
        event.created_at <= (state.deletedAddresses.get(addr) ?? -1)));
  add(
    "withdrawn",
    "Local withdrawal history",
    !tombstoned,
    tombstoned
      ? "An authenticated deletion request covers this event."
      : "No matching local deletion tombstone.",
  );
  if (event.kind === 5) {
    const targets = event.tags.filter((t) => t[0] === "e");
    const addresses = event.tags.filter((t) => t[0] === "a");
    const invalidTarget =
      targets.some((t) => !HEX.test(t[1] ?? "")) ||
      addresses.some((t) => !/^\d+:[0-9a-f]{64}:/.test(t[1] ?? ""));
    const foreign =
      targets.some((t) => {
        const target = state.admitted.get(t[1]);
        return target && target.pubkey !== event!.pubkey;
      }) || addresses.some((t) => t[1].split(":")[1] !== event!.pubkey);
    add(
      "deletion-author",
      "Deletion authority",
      !foreign && !invalidTarget && targets.length + addresses.length > 0,
      foreign
        ? "A referenced event belongs to another author; nothing will be withdrawn."
        : invalidTarget
          ? "Deletion target is malformed."
          : targets.length + addresses.length === 0
            ? "A deletion request needs an e or a target."
            : "Targets are scoped to the signer; unknown ids only create signer-scoped tombstones.",
    );
  }
  if (checks.some((c) => c.result === "fail"))
    return finish("reject", checks.find((c) => c.result === "fail")!.detail);
  const holds = seenExposures.filter(
    (e) =>
      (e.type === "location" && policy.quarantineLocation) ||
      (e.type === "relay" && policy.quarantineRelayHints) ||
      (e.type === "mention" && policy.quarantineMentions),
  );
  checks.push({
    code: "exposure",
    label: "Public metadata review",
    detail: holds.length
      ? `${holds.length} exposed fields need policy review. Quarantine is not published or returned to subscribers.`
      : "No exposed field triggers this policy. Content remains public to subscribers if admitted.",
    result: holds.length ? "hold" : "pass",
  });
  if (holds.length)
    return finish(
      "quarantine",
      "Valid signature. Public metadata needs review.",
      "held",
    );
  state.admitted.set(id, event);
  state.attempts.set(event.pubkey, [...prior, receivedAt]);
  const removed: string[] = [];
  if (event.kind === 5) {
    for (const tag of event.tags) {
      if (tag[0] === "e") {
        const target = state.admitted.get(tag[1]);
        if (target?.kind === 5) continue;
        state.deletedIds.add(`${event.pubkey}:${tag[1]}`);
        if (target?.pubkey === event.pubkey && state.events.delete(tag[1]))
          removed.push(tag[1]);
      }
      if (tag[0] === "a") {
        state.deletedAddresses.set(
          tag[1],
          Math.max(state.deletedAddresses.get(tag[1]) ?? -1, event.created_at),
        );
        for (const target of state.events.values())
          if (
            target.kind !== 5 &&
            address(target) === tag[1] &&
            target.pubkey === event.pubkey &&
            target.created_at <= event.created_at
          ) {
            state.events.delete(target.id);
            removed.push(target.id);
          }
      }
    }
    state.events.set(id, event);
    return finish(
      "admit",
      `Deletion request retained; ${removed.length} local event${removed.length === 1 ? "" : "s"} withdrawn.`,
      "withdrawal",
      removed,
    );
  }
  if (isEphemeral(event))
    return finish(
      "admit",
      "Delivered to live subscribers; never stored.",
      "ephemeral",
    );
  if (addr) {
    const existing = [...state.events.values()].find(
      (e) => address(e) === addr,
    );
    if (existing && newestFirst(existing, event) <= 0)
      return finish(
        "admit",
        "An equal/newer replacement already exists; history stays unchanged.",
        "superseded",
      );
    if (existing) {
      state.events.delete(existing.id);
      removed.push(existing.id);
    }
  }
  state.events.set(id, event);
  return finish(
    "admit",
    removed.length
      ? "New revision replaced the previous local document."
      : "Accepted into the local relay store.",
    removed.length ? "replacement" : "stored",
    removed,
  );
}
export function stateSummary(state: RelayState) {
  return {
    stored: [...state.events.values()].sort((a, b) => a.id.localeCompare(b.id)),
    acceptedIds: [...state.admitted.keys()].sort(),
    deletedIds: [...state.deletedIds].sort(),
    deletedAddresses: [...state.deletedAddresses].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  };
}
export const policyHash = (p: Policy) => digest(parsePolicy(p));
