# Attribution

QuietRelay is an original September 2026 prototype developed with substantial AI coding assistance under Touko Ursin's direction. No runtime generative model is invoked. Synthetic event narratives and UI copy are original AI-assisted work; the dataset contains no personal messages or company data.

Dependencies retain their own licenses: React, Vite, Lucide, ws, TypeScript, tsx, noble-curves, noble-hashes and nostr-tools. Resolved versions and integrity hashes are in `package-lock.json`. No third-party photo, generated raster artwork, stock audio or remote font is included. Icons are Lucide; the logo and protocol-flow diagram are original vector/CSS artwork.

`tests/fixtures/bip340-test-vectors.csv` is derived from the [official Bitcoin BIP-340 test vectors](https://github.com/bitcoin/bips/blob/master/bip-0340/test-vectors.csv). BIP-340 declares BSD-2-Clause for prose and BSD-2-Clause OR MIT OR CC0-1.0 for code; this derived verification fixture uses the CC0-1.0 code option. Only index, public key, message, signature, verification result and comment columns are retained. Secret-key and auxiliary-randomness columns are intentionally omitted. See the [BIP-340 license declarations](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki).

Public fixture signing seeds are clearly named and reproducible from this source. They are not secure identities or account keys. Exported evidence and wire transcripts do not contain signing-key fields.
