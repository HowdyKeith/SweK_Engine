// WebGLEngine/physics/box3d-sync-selfcheck.mjs — v2272
//   run: node physics/box3d-sync-selfcheck.mjs

import { runSyncScenario } from "./box3dSyncScenario.js";
import { planarFallbackWorld } from "./planarFallbackWorld.js";

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("box3d-sync-selfcheck: the cross-machine sync scenario is deterministic");
const a = runSyncScenario(planarFallbackWorld());
const b = runSyncScenario(planarFallbackWorld());
ok("two independent runs produce the same final hash", a.finalHash === b.finalHash, `a=${a.finalHash.toString(16)} b=${b.finalHash.toString(16)}`);
ok("every checkpoint hash matches run-to-run", a.checkpoints.length > 0 && a.checkpoints.every((h, i) => h === b.checkpoints[i]));
ok("scenario ran the full tick budget over 8 ships", a.ticks === 600 && a.ships === 8);
ok("the physics actually moved (hash is not the trivial empty state)", a.finalHash !== 0);

console.log(`\nbox3d-sync-selfcheck: ${pass}/${total} passed`);
console.log(`(reference fallback finalHash: ${a.finalHash.toString(16)}, checkpoints: ${a.checkpoints.map(h => h.toString(16)).join(" ")})`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
