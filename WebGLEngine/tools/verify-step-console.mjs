// tools/verify-step-console.mjs -- v61: the console smoke as a SHIP
// step, liveness-gated. verify.mjs lives engine-side (not in this
// bundle -- surveyed, like tools/ before v57), so this ships as a
// self-contained step it wires in ONE line:
//     execSync("node tools/verify-step-console.mjs", {stdio:"inherit"});
// Gate semantics, stated: bridge ALIVE -> the smoke runs and its
// verdict propagates (RED fails the ship); bridge DOWN -> SKIP, exit 0
// -- an offline bridge is a normal ship-time state, not a failure.
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const here = dirname(fileURLToPath(import.meta.url));
const HOST = process.env.BRIDGE_HOST || "127.0.0.1:8787";
let alive = false;
try {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 2000);
  const r = await fetch(`http://${HOST}/ai/brain/console`, { signal: ctl.signal });
  clearTimeout(to);
  alive = r.ok;
} catch {}
if (!alive) {
  console.log(`[verify:console] SKIP -- no bridge on ${HOST} (liveness-gated; not a failure)`);
  process.exit(0);
}
// v63 -- --quiet: verdict line only; captured story dumps on failure.
const quiet = process.argv.includes("--quiet");
try {
  execSync(`sh "${join(here, "smoke-console.sh")}" ${HOST}`, { stdio: quiet ? "pipe" : "inherit" });
  console.log("[verify:console] PASS");
} catch (e) {
  if (quiet && e.stdout) process.stderr.write(e.stdout);
  console.error("[verify:console] FAIL -- the live console smoke went RED");
  process.exit(1);
}
