import { mkdirSync, writeFileSync } from "node:fs";
import { makeFixtures } from "../src/core/fixtures";
import { presets } from "../src/core/policy";
import { evidence, replay } from "../src/core/replay";
const cases = makeFixtures(),
  run = replay(cases, presets.quiet);
mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/quiet-relay-evidence.json",
  JSON.stringify(evidence(cases, presets.quiet), null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      mode: "local synthetic fixture rehearsal",
      cases: cases.length,
      counts: run.counts,
      stored: run.state.events.size,
      evidence: "artifacts/quiet-relay-evidence.json",
    },
    null,
    2,
  ),
);
