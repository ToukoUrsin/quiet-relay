import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
const changes = execFileSync("git", ["status", "--porcelain"], {
  encoding: "utf8",
}).trim();
if (changes)
  throw new Error(
    "Commit reviewed source first; packaging requires a clean worktree.",
  );
execFileSync("npm", ["run", "build"], { stdio: "inherit" });
mkdirSync("artifacts", { recursive: true });
execFileSync("git", [
  "archive",
  "--format=zip",
  "--prefix=quiet-relay/",
  "HEAD",
  "-o",
  "artifacts/quiet-relay-source.zip",
]);
rmSync("artifacts/quiet-relay-browser.zip", { force: true });
execFileSync(
  "/usr/bin/zip",
  ["-q", "-r", "../artifacts/quiet-relay-browser.zip", "."],
  { cwd: "dist" },
);
const files = ["quiet-relay-source.zip", "quiet-relay-browser.zip"];
const manifest = {
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  scope:
    "Source and static sandbox. Optional relay runs from source; no upstream service.",
  files: files.map((file) => {
    const bytes = readFileSync(`artifacts/${file}`);
    return {
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }),
};
writeFileSync(
  "artifacts/package-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(JSON.stringify(manifest, null, 2));
