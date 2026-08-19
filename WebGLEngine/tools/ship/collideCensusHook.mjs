// WebGLEngine/tools/ship/collideCensusHook.mjs -- v3607
//
// Loaded with `node --import ./tools/ship/collideCensusHook.mjs <gate>`. It imports the SAME selfCollide
// module instance the gate will use (ESM modules are singletons per resolved path) and writes that instance's
// STATS on exit. THE HOOK DOES THE FILE I/O SO THE SOLVER NEVER HAS TO: physics/xpbd/selfCollide.js must stay
// importable in a browser, and a census that made a hot solver depend on node:fs would be a worse defect than
// the one it exists to measure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATS } from "../../physics/xpbd/selfCollide.js";

const OUT = process.env.SWEK_COLLIDE_CENSUS;
const LABEL = process.env.SWEK_COLLIDE_LABEL || path.basename(process.argv[1] || "unknown");
if (OUT) {
    process.on("exit", (code) => {
        try { fs.appendFileSync(OUT, JSON.stringify({ label: LABEL, code, ...STATS }) + "\n"); }
        catch { /* a census that crashed a gate would be worse than no census */ }
    });
}
export { STATS };
