// tools/verify-step-shipmd.mjs -- v75: the SHIP.md freshness gate,
// finally RUN by something. Liveness-gated like the console step:
// SHIP.md absent (pre-first-write, or a rig that does not keep one)
// -> SKIP, exit 0; present -> gen-ship-section --check propagates.
// Target: repo-root SHIP.md by default; BRIDGE_SHIPMD overrides.
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
const here = dirname(fileURLToPath(import.meta.url));
const target = process.env.BRIDGE_SHIPMD || join(here, "../SHIP.md");
if (!fs.existsSync(target)) {
  console.log(`[verify:shipmd] SKIP -- no ${target} (liveness-gated; not a failure)`);
  process.exit(0);
}
try {
  execSync(`node "${join(here, "gen-ship-section.mjs")}" --check "${target}"`, { stdio: "inherit" });
  console.log("[verify:shipmd] PASS");
} catch {
  console.error("[verify:shipmd] FAIL -- SHIP.md's quoted section is stale; rerun gen-ship-section --write");
  process.exit(1);
}
