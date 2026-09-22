import { digest, isRecord, validInt } from "./protocol";
import { type Case } from "./fixtures";
import {
  emptyState,
  evaluate,
  parsePolicy,
  stateSummary,
  type Policy,
} from "./policy";
export const ENGINE_VERSION = "quiet-relay/0.1.0";
export function replay(cases: Case[], rawPolicy: Policy) {
  if (cases.length > 500)
    throw new Error("At most 500 input records per rehearsal.");
  const policy = parsePolicy(rawPolicy),
    state = emptyState();
  const decisions = cases.map((c) =>
    evaluate(c.event, policy, state, c.receivedAt),
  );
  const counts = { admit: 0, quarantine: 0, reject: 0, duplicate: 0 };
  decisions.forEach((d) => counts[d.verdict]++);
  return { policy, state, decisions, counts };
}
export function evidence(cases: Case[], rawPolicy: Policy) {
  const run = replay(cases, rawPolicy);
  const payload = {
    schema: "quiet-relay/evidence-v1",
    engine: ENGINE_VERSION,
    scope:
      "Local rehearsal. No external relay publication. Public fixture identities are not account keys.",
    policy: run.policy,
    cases: structuredClone(cases),
    decisions: run.decisions.map(({ event, ...d }) => d),
    finalState: stateSummary(run.state),
  };
  return { ...payload, digest: digest(payload) };
}
export function verifyEvidence(input: unknown) {
  if (
    !isRecord(input) ||
    input.schema !== "quiet-relay/evidence-v1" ||
    input.engine !== ENGINE_VERSION ||
    typeof input.digest !== "string"
  )
    throw new Error("Unsupported evidence format or engine.");
  const { digest: claimed, ...payload } = input;
  if (digest(payload) !== claimed)
    throw new Error("Evidence digest mismatch. The file changed.");
  const cases = parseCases(input.cases);
  const computed = evidence(cases, parsePolicy(input.policy));
  if (computed.digest !== claimed)
    throw new Error(
      "Replay mismatch. Decisions or final state do not follow from these inputs.",
    );
  return {
    ok: true as const,
    digest: computed.digest,
    events: cases.length,
    stored: computed.finalState.stored.length,
  };
}
export function parseCases(value: unknown): Case[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500)
    throw new Error("Import needs 1–500 rehearsal records.");
  let clock = 0;
  return value.map((row, i) => {
    if (
      !isRecord(row) ||
      Object.keys(row).sort().join("|") !== "event|label|note|receivedAt" ||
      typeof row.label !== "string" ||
      row.label.length > 100 ||
      typeof row.note !== "string" ||
      row.note.length > 500 ||
      !validInt(row.receivedAt) ||
      row.receivedAt < clock
    )
      throw new Error(`Record ${i + 1} has an invalid schema or arrival time.`);
    clock = row.receivedAt;
    if (
      !isRecord(row.event) ||
      Object.keys(row.event).some(
        (k) =>
          ![
            "id",
            "pubkey",
            "created_at",
            "kind",
            "tags",
            "content",
            "sig",
          ].includes(k),
      )
    )
      throw new Error(
        `Record ${i + 1}: import wire fields only, no keys or annotations.`,
      );
    return {
      label: row.label,
      note: row.note,
      receivedAt: row.receivedAt,
      event: structuredClone(row.event),
    };
  });
}
