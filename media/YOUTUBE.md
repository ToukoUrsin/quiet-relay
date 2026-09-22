# YouTube upload copy

File: `media/quietrelay-demo.mp4` · 1920×1080 H.264/AAC · 3:33 · captions `media/quietrelay-demo.en.srt` (English).

## Title

QuietRelay: a Nostr relay policy workbench (BOSS Battle demo)

## Description

QuietRelay is a local workbench for Nostr relay operators. It shows why a correctly signed event can still expose a location, fall outside a relay's contract or try to erase someone else's note, and it checks those decisions against a real loopback WebSocket relay.

In this 3:33 walkthrough:

- a genuinely signed note whose tags expose a location, a relationship and a relay hint
- the same event admitted under Open and held under Quiet, without rewriting evidence
- a policy diff across three presets
- signing an experiment, changing it after signing, and watching the integrity check fail
- a live EVENT/REQ exchange with a local relay whose OK replies match every prediction
- author-scoped withdrawal, a rejected foreign deletion and live-only ephemeral delivery
- exporting evidence, re-importing it, and verifying it from the command line

Source, setup and design notes: https://github.com/ToukoUrsin/quiet-relay
MIT license. Built for BOSS Battle 2026 (Freedom Stack: Nostr).

Chapters
0:00 Signed note that still exposes a location
0:22 Same event under Open and Quiet
0:43 Policy diff across presets
1:05 Signing and tampering experiment
1:28 Starting the loopback relay
1:41 Live WebSocket exchange
2:09 Withdrawal, foreign deletion, ephemeral delivery
2:33 Export and re-import evidence
2:47 CLI verification and tests
3:10 Scope and limits

Scope: local rehearsal only. Signing identities are public, disposable test fixtures. No wallet, no inference API, no upstream relay publication, no full NIP conformance claim and no global erasure promise.

Disclosure: AI coding assistants helped build QuietRelay. The narration is an ElevenLabs stock synthetic voice. All footage is actual: the running app driven by browser automation (a dot marks the pointer) and real terminal commands with their real output.

## Links

- Repository: https://github.com/ToukoUrsin/quiet-relay
- Event: https://boss-battle.devfolio.co/

## Settings

- Visibility: public or unlisted, as the submission requires
- Not made for kids
- Altered or synthetic content: the voice is synthetic; the footage is not altered
- Captions: upload `quietrelay-demo.en.srt` as English
