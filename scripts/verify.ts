import { readFileSync } from "node:fs";
import { verifyEvidence } from "../src/core/replay";
try {
  console.log(
    JSON.stringify(
      verifyEvidence(
        JSON.parse(
          readFileSync(
            process.argv[2] ?? "artifacts/quiet-relay-evidence.json",
            "utf8",
          ),
        ),
      ),
      null,
      2,
    ),
  );
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
