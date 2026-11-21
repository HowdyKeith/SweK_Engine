// WebGLEngine/tools/ship/runFlyWiredGates.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// ONE COMMAND FOR THE FLY-WIRED LINE'S GATES. The fly-wired gunner and helm work, the duel page's buttons and their studies (2026-11-16 to 2026-11-20) own about forty gates. This runs every one of them, a few at a time, prints one line each and the time it
// took, and exits 1 if any did not pass. Keith: "then 4" (a single runner, so the publish is quicker and harder to get wrong).
//
//   node tools/ship/runFlyWiredGates.mjs [--workers n] [--only <substring>]
//
// THE LIST is written out (GATES), not found by a pattern: a gate of another line that happens to share a name (tools/ship/takeEvadeLadder-selfcheck.mjs) is not this line's. tools/ship/runFlyWiredGates-selfcheck.mjs holds that every listed file
// exists and that every study gate this line wrote is listed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "..", "..");
const MODULES = ["brain/flyTracking-selfcheck.mjs", "brain/flySteering-selfcheck.mjs", "brain/helmSteerCannon-selfcheck.mjs", "brain/seatTurretGunner-selfcheck.mjs", "brain/battleshipDuel-selfcheck.mjs", "brain/peerFleet-selfcheck.mjs", "render/spaceDuelCore-selfcheck.mjs", "tools/ship/spaceDuelPage-selfcheck.mjs", "tools/ship/todo-selfcheck.mjs", "tools/ship/runFlyWiredGates-selfcheck.mjs"];
const STUDIES = ["takeFlyWiredHelm", "takeFlyWiredGunner", "takePlacesControl", "takeFlyWiredNext", "takeFlyWiredHelmFix", "takeFlyWiredFights", "takeFlyWiredGunnerFix", "takeFlyWiredGunnerShips", "takeFlyWiredPilot",
    "takeFlyWiredGunnerMixed", "takeFlyWiredGunnerHold", "takeFlyWiredGunnerSees", "takeFlyWiredGunnerHoldSees", "takeFlyWiredGunnerNear", "takeFlyWiredGunnerVsPilot", "takeFlyWiredGunnerTune", "takeFlyWiredGunnerControl", "takeFlyWiredGunnerTrigger",
    "takeFlyWiredHelmTune", "takeFlyWiredHelmControl", "takeFlyWiredOneWindow", "takeBestShipLoadout", "takeBestShipLoadout2", "takeBestShipLoadout3", "takeBySizeLoadout", "takeBySightLoadout", "takePresetsHard", "takeButtonUntried", "takeButtonOneHard",
    "takeButtonLast", "takeLadder", "takeHelmLadder", "takeSineTwins", "takeSteerCannon", "trainTurretSeatBig", "trainTurretSeatToday", "takeCarToday", "takeCarTodayEscorts", "trainTurretSeatFleet", "takeSineHelmNoCannon", "takeButtonNoCannon", "takeFlyWiredHelmOneAxis", "takeFlyWiredHelmNoCannon", "takeFlyWiredHelmAxes", "trainTurretSeatFleet2", "takeCarTodayNoCannon", "takeFlyVsSine", "takeButtonHardToday", "takeButtonHarder", "takeSineHelmBest", "takeSplitHelm", "takeSplitHelmFleet", "takeCarTodayRations"].map((s) => `tools/ship/${s}-selfcheck.mjs`);
export const GATES = Object.freeze([...MODULES, ...STUDIES]);
/** What a gate's output says: "pass", "fail" (with the failing rows' names) or "threw". Pure. */
export function verdictOf(out, code) {
    const fails = out.split("\n").filter((l) => l.startsWith("  FAIL")).map((l) => l.slice(8, 90));
    if (fails.length) return { verdict: "fail", fails };
    if (code === 0 && /ALL PASS|all checks pass/.test(out)) return { verdict: "pass", fails: [] };
    return { verdict: "threw", fails: [(out.trim().split("\n").filter((l) => /Error/.test(l))[0] || `exit ${code}`).slice(0, 120)] };
}
/** Run the gates, `workers` at a time. `run(gate)` -> Promise of { out, code } (spawns node by default). */
export async function runAll(gates = GATES, { workers = 4, run = runOne, log = console.log } = {}) {
    const results = new Array(gates.length); let next = 0;
    await Promise.all(Array.from({ length: Math.max(1, workers) }, async () => { while (next < gates.length) { const i = next++, t0 = Date.now(), r = await run(gates[i]), v = verdictOf(r.out, r.code); results[i] = { gate: gates[i], ...v, seconds: (Date.now() - t0) / 1000 }; log(`${v.verdict === "pass" ? "PASS " : v.verdict === "fail" ? "FAIL " : "THREW"}  ${gates[i]}  (${results[i].seconds.toFixed(0)} s)${v.fails.length ? "  " + v.fails.join(" | ") : ""}`); } }));
    const bad = results.filter((r) => r.verdict !== "pass");
    log(bad.length ? `${bad.length} OF ${gates.length} GATES DID NOT PASS` : `ALL ${gates.length} GATES PASS`);
    return { results, ok: bad.length === 0 };
}
function runOne(gate) { return new Promise((res) => { let out = ""; const p = spawn("node", [path.join(ROOT, gate)], { cwd: ROOT }); p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d)); p.on("close", (code) => res({ out, code })); }); }

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "only"].includes(x.slice(2)));
    if (bad.length) { console.error(`runFlyWiredGates: unknown option ${bad.join(", ")}`); process.exit(2); }
    const only = arg("only"), list = only ? GATES.filter((g) => g.includes(only)) : GATES;
    if (!list.length) { console.error(`runFlyWiredGates: no gate matches "${only}"`); process.exit(2); }
    const r = await runAll(list, { workers: Number(arg("workers") || 4) });
    process.exit(r.ok ? 0 : 1);
}
