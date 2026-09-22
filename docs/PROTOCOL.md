# Protocol choices, checked September 21, 2026

Primary references:

- [NIP-01 event structure, signatures, kind ranges and client/relay flow](https://github.com/nostr-protocol/nips/blob/master/01.md)
- [NIP-09 event deletion requests](https://github.com/nostr-protocol/nips/blob/master/09.md)
- [BIP-340 Schnorr specification](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki) and [official verification vectors](https://github.com/bitcoin/bips/blob/master/bip-0340/test-vectors.csv)
- [noble-curves documentation](https://github.com/paulmillr/noble-curves) and [nostr-tools documentation](https://github.com/nbd-wtf/nostr-tools)

The wire hash is SHA-256 of the canonical NIP-01 array `[0,pubkey,created_at,kind,tags,content]` serialized as UTF-8 JSON. Verification uses BIP-340 Schnorr over that hash; it never trusts an object-level cached-valid flag. Fixture signing uses deterministic auxiliary randomness solely for reproducible public fixtures. It is not an account-signing service.

The relay distinguishes ordinary, replaceable, addressable and ephemeral records. Replacement ties retain the lexically lower event id. Queries apply AND inside a filter and OR between filters; id/key filters require exact values. Initial results respect each filter's limit; live matching ignores that limit, including `limit: 0` subscriptions. Subscription ids are scoped per socket. Duplicate acknowledgements do not redeliver or consume quota.

NIP-09 requests are signer-scoped. Known foreign targets cause an atomic rejection. Unknown event ids create author-scoped tombstones, so another author cannot preemptively delete a future arrival. Address deletions have a creation-time cutoff. Deletion requests themselves cannot be withdrawn by another deletion request. Local input evidence intentionally persists.

## App-specific constraints

- Only seven wire fields accepted; local annotations/extra key fields are rejected. This is stricter than a general-purpose relay.
- Nonnegative safe-integer timestamps, bounded arrays and UTF-8 byte ceilings.
- Accepted unique messages spend the per-author burst budget. The budget uses recorded arrival time, not author-controlled creation time. Denied/held messages are separately bounded by the run/frame ceilings.
- Quarantine is a negative `OK` with an application reason; no nonstandard Nostr message type is emitted.
- The reset HTTP endpoint permits only allowed local browser origins; WebSocket upgrades are loopback-bound and accept `/` only. CLI clients without Origin work for tests. This is local development isolation, not a production authentication design.
- Fixed rehearsal clock increments one second per received EVENT. Imported live runs require that same consecutive arrival schedule. Pure replay supports arbitrary nondecreasing arrival times.

## Evidence v1

`quiet-relay/evidence-v1` includes engine version, scope, complete policy, labeled wire inputs with arrival times, decisions, and final state. Its SHA-256 digest uses recursive lexical object-key ordering and ordinary JavaScript JSON encoding; arrays retain their order. This is a project-specific deterministic encoding, not a claim of RFC 8785 compliance. The digest field is excluded from its own hash.

Verification checks the digest, validates the policy and input schema, recomputes all decisions and state, then compares the newly constructed evidence digest. It rejects fabricated outcomes even when an attacker recomputes the file digest. It does not certify the operator or source of imported data.

## Dependencies

Pinned runtime cryptography: `@noble/curves 2.4.0`, `@noble/hashes 2.4.0`. Transport: `ws 8.21.3`. UI: `react/react-dom 19.3.0`, `vite 8.3.0`, Lucide (exact resolved version in lockfile). Independent protocol interop test dependency: `nostr-tools 2.25.2`; it also uses noble internally, so those checks are not an independent cryptographic primitive audit. Official BIP-340 vectors and Node's SHA-256 provide additional external reference checks. `npm audit` reported zero known vulnerabilities on installation; this is not a security audit of QuietRelay.
