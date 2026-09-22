# QuietRelay — actual-interaction film plan

**Target: 3 minutes 50 seconds, English. Required final duration: 3–5 minutes.** This follows the organizer's September 21 clarification and BOSS Battle participant handbook. The film was recorded on September 22 and runs **3:33** (213.1 s); see [Recorded film](#recorded-film) below. The README carries its link near the top.

Run `npm run dev` and, in another terminal, `npm run relay`. Open http://127.0.0.1:4326/ and restore public fixtures. Capture actual interactions at about 1440×1000. Do not show private tabs, mail, accounts or keys. Preserve enough time for the viewer to inspect each result; no fabricated terminal/UI footage.

| Time | Actual interaction | Suggested narration |
|---|---|---|
| 0:00–0:25 | Show workbench, select the second/location-bearing event, inspect authenticity and exposure. | A valid signature is only the beginning. This note is genuinely signed, but its tags expose a location, a relationship and a relay destination. QuietRelay helps a Nostr relay operator understand that boundary before changing a live service. These are public synthetic fixtures, not somebody's private messages. |
| 0:25–0:55 | Inspect the event JSON and tags. Choose Open, then Quiet. Keep the same selected event. | The signature and input stay exactly the same. Under Open policy the note is admitted. Under Quiet it is held, and never enters the subscriber feed. We are changing a visible policy, not rewriting evidence to force a result. Holding a note is a local relay decision; it is not a claim that the wider network has forgotten it. |
| 0:55–1:25 | Open Policy diff, inspect changed rows and counts, return to Quiet. | The full traffic fixture runs independently against each policy. Compare admitted, held and rejected events before choosing the tradeoff. Limits on tags, time, bytes and arrivals are explicit. An authentic message can still fall outside the contract. The comparison begins from an empty rehearsal each time, so changing a setting does not silently publish held traffic. |
| 1:25–1:55 | Open composer, sign an experiment, deliberately tamper with its content and evaluate. Show the resulting integrity failure. | Signing uses real BIP-340 Schnorr signatures with deliberately reproducible demo identities. They must never become real accounts or custody keys. When I change the content after signing, the canonical event hash no longer matches. The authenticity check fails before any policy can admit the message. An independent specification-vector test suite checks that boundary. |
| 1:55–2:30 | Restore fixtures. Wire log → Test live relay. Show actual frames, acknowledgements and verified comparison. | Now the real wire: a separate loopback WebSocket relay receives Nostr EVENT and REQ messages. These are captured responses from that process. Its acknowledgements match the sandbox's predicted decisions. Under the restored Quiet fixture, eleven events are admitted and seven records remain for a new subscriber. Replacements and ephemeral events explain why those counts differ. |
| 2:30–3:00 | Inspect retained records, own deletion request and rejected foreign deletion. | The author can ask this local relay to withdraw their own eligible note. Another signer cannot erase it. The deletion request and local tombstone preserve the decision. Ephemeral traffic can reach a live subscriber without becoming stored history. None of this promises erasure from another relay or from a reader who kept a copy. |
| 3:00–3:30 | Export actual evidence; import the downloaded file and run verification. Show the recomputed outcome. | The evidence file contains inputs, arrival times, policy and outcomes, without signing keys. Re-importing checks its digest and reruns the decisions. A digest alone is not an outside attestation: someone can make another consistent file. Replay establishes that this file's stated outputs follow from its stated inputs. |
| 3:30–3:50 | Open Method, pause on scope/limits, end on workbench. | QuietRelay is a usable policy laboratory, with a bounded local relay and reproducible tests. It does not scan every kind of private information or implement every Nostr extension. No wallet, no inference API and no upstream publication. The goal is simple: make what gets through understandable. |

These time ranges are editing targets, not claims about existing footage. Let actual network operations finish; shorten spoken text or extend within the five-minute limit if necessary. Preserve the resulting state visibly before transitioning. Never substitute sandbox predictions for a failed live-relay result.

Three screenshot targets:

1. Quiet policy with the held location event and exposure panel.
2. Policy diff showing different outcomes for the same signed inputs.
3. Successful actual loopback exchange with the verified comparison and retained count.

The public static sandbox can run without a server; the live transport scene requires the separate relay on the presenter device. If capture is remote-only, demonstrate the local command and its actual captured results with truthful labeling. Check the final runtime is **at least 180 and no more than 300 seconds**, and keep the film link near the top of README as the organizer requires.

## Recorded film

`media/quietrelay-demo.mp4` (1920×1080 H.264/AAC, 3:33, not committed; `*.mp4` is ignored) with captions in `media/quietrelay-demo.en.srt` and upload copy in [media/YOUTUBE.md](../media/YOUTUBE.md).

- **UI footage** is one continuous Playwright `recordVideo` capture of the running dev server at 1280×720, upscaled to 1080p. Every click is a real interaction; a small dot overlay shows where the automated pointer is. Pauses are the idle app, not frozen or edited frames.
- **Terminal segments** run real commands in the repository (`npm run relay`, `curl …/health`, `npm run verify` on the evidence file exported moments earlier in the film, `npm test`) and stream their actual stdout into a terminal-styled page. The relay started there is the one the browser's live test talks to.
- **Narration** is an ElevenLabs stock synthetic voice reading a script written for this film.
- Differences from the plan: 3:33 instead of 3:50, and the two terminal segments are added before the live relay test and after the evidence import.

| Chapter | Content |
|---|---|
| 0:00 | Signed note that still exposes a location |
| 0:22 | Same event under Open and Quiet |
| 0:43 | Policy diff across presets |
| 1:05 | Signing and tampering experiment |
| 1:28 | Starting the loopback relay |
| 1:41 | Live WebSocket exchange |
| 2:09 | Withdrawal, foreign deletion, ephemeral delivery |
| 2:33 | Export and re-import evidence |
| 2:47 | CLI verification and tests |
| 3:10 | Scope and limits |
