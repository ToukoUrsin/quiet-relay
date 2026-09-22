import { schnorr } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}
export type UnsignedEvent = Omit<NostrEvent, "id" | "sig" | "pubkey">;
export const HEX = /^[0-9a-f]{64}$/;
export const MAX_WIRE_BYTES = 65_536;
export const utf8 = (s: string) => new TextEncoder().encode(s);
export const byteLength = (s: string) => utf8(s).length;
const ordered = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(ordered)
    : isRecord(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, ordered(value[k])]),
        )
      : value;
export const digest = (value: unknown) =>
  bytesToHex(sha256(utf8(JSON.stringify(ordered(value)))));
export const canonical = (e: Omit<NostrEvent, "id" | "sig">) =>
  JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]);
export const eventHash = (e: Omit<NostrEvent, "id" | "sig">) =>
  bytesToHex(sha256(utf8(canonical(e))));
export const validInt = (n: unknown): n is number =>
  Number.isSafeInteger(n) && Number(n) >= 0;
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Fresh verification every time: no object flags or cached verifier results are trusted.
export function inspectEvent(value: unknown): {
  event?: NostrEvent;
  error?: string;
  code?: string;
} {
  if (!isRecord(value))
    return { code: "shape", error: "An event must be a JSON object." };
  const keys = ["id", "pubkey", "created_at", "kind", "tags", "content", "sig"];
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    return {
      code: "shape",
      error:
        "Only the seven NIP-01 wire fields are accepted. Remove local annotations or key material.",
    };
  if (
    typeof value.id !== "string" ||
    !HEX.test(value.id) ||
    typeof value.pubkey !== "string" ||
    !HEX.test(value.pubkey) ||
    typeof value.sig !== "string" ||
    !/^[0-9a-f]{128}$/.test(value.sig)
  )
    return {
      code: "shape",
      error:
        "Event id, public key and signature must have exact lowercase hexadecimal lengths.",
    };
  if (
    !validInt(value.created_at) ||
    !validInt(value.kind) ||
    value.kind > 65535 ||
    typeof value.content !== "string"
  )
    return {
      code: "shape",
      error:
        "Timestamp and kind must be nonnegative safe integers; kind is at most 65535. Content must be text.",
    };
  if (
    !Array.isArray(value.tags) ||
    value.tags.length > 256 ||
    value.tags.some(
      (t) =>
        !Array.isArray(t) ||
        t.length === 0 ||
        t.length > 16 ||
        t.some((v) => typeof v !== "string"),
    )
  )
    return {
      code: "shape",
      error:
        "Tags must be nonempty string arrays (hard caps: 256 tags, 16 fields per tag).",
    };
  if (byteLength(JSON.stringify(value)) > MAX_WIRE_BYTES)
    return {
      code: "wire-limit",
      error: "Event exceeds the 64 KiB safety ceiling.",
    };
  const e: NostrEvent = {
    id: value.id,
    pubkey: value.pubkey,
    created_at: value.created_at,
    kind: value.kind,
    tags: (value.tags as string[][]).map((t) => [...t]),
    content: value.content,
    sig: value.sig,
  };
  if (eventHash(e) !== e.id)
    return {
      code: "hash-mismatch",
      error:
        "Canonical content no longer hashes to this event id. It changed after signing.",
    };
  try {
    if (
      !schnorr.verify(hexToBytes(e.sig), hexToBytes(e.id), hexToBytes(e.pubkey))
    )
      return {
        code: "signature",
        error:
          "Schnorr verification failed. The signature does not authenticate this event.",
      };
  } catch {
    return {
      code: "signature",
      error: "Schnorr verification rejected the public key or signature.",
    };
  }
  return { event: e };
}

// Used only with disposable, publicly reproducible fixture identities, never account keys.
export function signFixture(body: UnsignedEvent, identity: string): NostrEvent {
  const secret = sha256(utf8(`QuietRelay / PUBLIC FIXTURE ONLY / ${identity}`));
  const event = {
    ...body,
    tags: body.tags.map((t) => [...t]),
    pubkey: bytesToHex(schnorr.getPublicKey(secret)),
  };
  const id = eventHash(event);
  const sig = bytesToHex(
    schnorr.sign(hexToBytes(id), secret, new Uint8Array(32)),
  );
  secret.fill(0);
  return { ...event, id, sig };
}

export function address(e: NostrEvent): string | undefined {
  if (e.kind === 0 || e.kind === 3 || (e.kind >= 10000 && e.kind < 20000))
    return `${e.kind}:${e.pubkey}:`;
  if (e.kind >= 30000 && e.kind < 40000)
    return `${e.kind}:${e.pubkey}:${e.tags.find((t) => t[0] === "d")?.[1] ?? ""}`;
}
export const isEphemeral = (e: NostrEvent) => e.kind >= 20000 && e.kind < 30000;
export const newestFirst = (a: NostrEvent, b: NostrEvent) =>
  b.created_at - a.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export type Filter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [tag: `#${string}`]: string[] | undefined;
};
export function parseFilters(values: unknown[]): Filter[] {
  if (!values.length || values.length > 8)
    throw new Error("One to eight filters are required.");
  return values.map((v) => {
    if (!isRecord(v)) throw new Error("Filter must be an object.");
    for (const [key, val] of Object.entries(v)) {
      if (["since", "until", "limit"].includes(key)) {
        if (!validInt(val))
          throw new Error(`${key} must be a nonnegative integer.`);
      } else if (
        ["ids", "authors", "kinds"].includes(key) ||
        /^#[a-zA-Z]$/.test(key)
      ) {
        if (!Array.isArray(val) || !val.length || val.length > 100)
          throw new Error("Filter lists need 1–100 values.");
        if (
          key === "kinds"
            ? val.some((x) => !validInt(x) || x > 65535)
            : val.some(
                (x) =>
                  typeof x !== "string" ||
                  (["ids", "authors", "#e", "#p"].includes(key) &&
                    !HEX.test(x)),
              )
        )
          throw new Error(
            "Malformed filter value; id/public-key lists require exact lowercase hexadecimal values.",
          );
      } else throw new Error(`Unsupported filter field: ${key}`);
    }
    return structuredClone(v) as Filter;
  });
}
export function matches(e: NostrEvent, f: Filter): boolean {
  return (
    (!f.ids || f.ids.includes(e.id)) &&
    (!f.authors || f.authors.includes(e.pubkey)) &&
    (!f.kinds || f.kinds.includes(e.kind)) &&
    (f.since === undefined || e.created_at >= f.since) &&
    (f.until === undefined || e.created_at <= f.until) &&
    Object.entries(f).every(
      ([key, values]) =>
        !key.startsWith("#") ||
        e.tags.some(
          (t) => t[0] === key.slice(1) && (values as string[]).includes(t[1]),
        ),
    )
  );
}
export function query(
  events: Iterable<NostrEvent>,
  filters: Filter[],
): NostrEvent[] {
  const sorted = [...events].sort(newestFirst),
    found = new Map<string, NostrEvent>();
  for (const filter of filters)
    for (const e of sorted
      .filter((e) => matches(e, filter))
      .slice(0, Math.min(filter.limit ?? 500, 500)))
      found.set(e.id, e);
  return [...found.values()].sort(newestFirst);
}
