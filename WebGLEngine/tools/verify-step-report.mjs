// tools/verify-step-report.mjs -- v62: the report smoke as a SHIP
// step. No liveness gate needed -- the smoke is self-contained (shim,
// fixtures, no bridge) -- so this is the v61 pattern minus the probe:
// run it, propagate the verdict. The rig's verify.mjs wires it:
//     execSync("node tools/verify-step-report.mjs", {stdio:"inherit"});
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
// v63 -- --quiet: machines want the verdict line; humans debugging a
// RED want the story -- so quiet captures, and dumps ONLY on failure.
const quiet = process.argv.includes("--quiet");
try {
  const out = execSync(`node "${join(here, "smoke-report.mjs")}"`, { stdio: quiet ? "pipe" : "inherit" });
  console.log("[verify:report] PASS");
} catch (e) {
  if (quiet && e.stdout) process.stderr.write(e.stdout);
  console.error("[verify:report] FAIL -- the report smoke went RED");
  process.exit(1);
}
