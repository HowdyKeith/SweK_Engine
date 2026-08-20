// WebGLEngine/physics/box3d-sync-compare-selfcheck.mjs — v2273
//   run: node physics/box3d-sync-compare-selfcheck.mjs

import { compareSyncReports } from "./box3dSyncCompare.js";

let pass = 0, total = 0;
const ok = (n, c, d = "") => { total++; if (c) { pass++; console.log(`  ok   ${n}`); } else { console.log(`  FAIL ${n}${d ? "  -- " + d : ""}`); } };

console.log("box3d-sync-compare-selfcheck");
{
    const r = compareSyncReports({ Galaxina: { hash: "abc", checkpoints: ["11", "22", "33"], mode: "wasm" }, StellarAtlas: { hash: "abc", checkpoints: ["11", "22", "33"], mode: "wasm" } });
    ok("two matching wasm reports -> synchronized, no divergence", r.synchronized && r.divergedAt === null && r.count === 2);
    ok("not flagged as mixed modes", !r.mixedModes);
}
{
    const r = compareSyncReports({ Galaxina: { hash: "aaa", checkpoints: ["11", "22", "33"], mode: "wasm" }, StellarAtlas: { hash: "bbb", checkpoints: ["11", "22", "99"], mode: "wasm" } });
    ok("differing final hash -> not synchronized", !r.synchronized);
    ok("pinpoints the FIRST diverging checkpoint (index 2)", r.divergedAt === 2, "divergedAt=" + r.divergedAt);
}
{
    const r = compareSyncReports({ A: { hash: "x", checkpoints: ["9", "1"], mode: "wasm" }, B: { hash: "y", checkpoints: ["8", "1"], mode: "wasm" } });
    ok("early divergence at checkpoint 0 is caught", !r.synchronized && r.divergedAt === 0);
}
{
    const r = compareSyncReports({ only: { hash: "abc", checkpoints: ["1"], mode: "wasm" } });
    ok("a single report is not a verdict (need 2+)", !r.synchronized && r.count === 1);
}
{
    const r = compareSyncReports({ A: { hash: "abc", checkpoints: [], mode: "wasm" }, B: { hash: "abc", checkpoints: [], mode: "fallback" } });
    ok("matching hash but mixed wasm/fallback is flagged (meaningless match)", r.synchronized && r.mixedModes);
}

console.log(`\nbox3d-sync-compare-selfcheck: ${pass}/${total} passed`);
if (pass !== total && typeof process !== "undefined" && process.exit) process.exit(1);
