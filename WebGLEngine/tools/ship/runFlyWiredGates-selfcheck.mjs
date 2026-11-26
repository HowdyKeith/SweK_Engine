// WebGLEngine/tools/ship/runFlyWiredGates-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/runFlyWiredGates-selfcheck.mjs      (a few seconds; nothing here runs the gates themselves)
//
// THE GATE RUNNER, HELD. tools/ship/runFlyWiredGates.mjs runs the fly-wired line's gates. This holds: every listed gate exists; every study this line wrote (a tools/ship/take*.mjs whose header names the fly-wired work or the duel page's buttons) has its
// gate listed; how an output is read (a FAIL row, a pass, a throw); that the runner runs each gate once and fails when one fails; and the command's refusals.
// SABOTAGE LOG: 8 mutants of tools/ship/runFlyWiredGates.mjs, each a copy with this gate pointed at it: ALL 8 RED (a study gate dropped, the page gate dropped, a FAIL read as a pass, the exit code ignored, the backlog's line unread,
//   the run always passing, an unknown option and an empty --only let through).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as R from "./runFlyWiredGates.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), CMD = fileURLToPath(new URL("./runFlyWiredGates.mjs", import.meta.url));
console.log("runFlyWiredGates-selfcheck -- one command for the fly-wired line's gates\n");

const missing = R.GATES.filter((g) => !fs.existsSync(path.join(ROOT, g)));
const mine = fs.readdirSync(path.join(ROOT, "tools/ship")).filter((f) => /^take.*\.mjs$/.test(f) && !f.includes("-selfcheck")).filter((f) => { const h = fs.readFileSync(path.join(ROOT, "tools/ship", f), "utf8").slice(0, 3000); return /fly-wired|best-ship|by-size|by-the-fight|seatFlyWired|helmFlyWired/i.test(h); }).map((f) => `tools/ship/${f.replace(/\.mjs$/, "-selfcheck.mjs")}`).filter((g) => fs.existsSync(path.join(ROOT, g)));
const unlisted = mine.filter((g) => !R.GATES.includes(g));
ok("!! every listed gate exists, the module gates first (tracking, steering, the seat gunner, the duel, the peer fleet, the page's core and the page, the backlog), and every study gate this line wrote is listed (found by its header)", missing.length === 0 && unlisted.length === 0 && R.GATES[0] === "brain/flyTracking-selfcheck.mjs" && R.GATES.includes("tools/ship/spaceDuelPage-selfcheck.mjs") && R.GATES.length >= 40 && new Set(R.GATES).size === R.GATES.length && !R.GATES.includes("tools/ship/takeEvadeLadder-selfcheck.mjs"), `${missing.join(" ")} | ${unlisted.join(" ")} | ${R.GATES.length} gates, ${mine.length} studies found`);
ok("!! HOW AN OUTPUT IS READ: a FAIL row is a fail with its name; ALL PASS (or the backlog's 'all checks pass') with exit 0 a pass; anything else a throw", R.verdictOf("  PASS  a\n  FAIL  !! the row\nALL PASS", 1).verdict === "fail" && R.verdictOf("  PASS  a\n  FAIL  !! the row", 1).fails[0] === "!! the row" && R.verdictOf("  PASS  a\nALL PASS", 0).verdict === "pass" && R.verdictOf("todo-selfcheck: all checks pass", 0).verdict === "pass" && R.verdictOf("ALL PASS", 1).verdict === "threw" && R.verdictOf("TypeError: x", 1).verdict === "threw" && /TypeError/.test(R.verdictOf("TypeError: x", 1).fails[0]));
const calls = [], quiet = () => {};
const r1 = await R.runAll(["a", "b", "c"], { workers: 2, run: async (g) => { calls.push(g); return { out: "ALL PASS", code: 0 }; }, log: quiet }), r2 = await R.runAll(["a", "b"], { workers: 1, run: async (g) => (g === "b" ? { out: "  FAIL  !! x", code: 1 } : { out: "ALL PASS", code: 0 }), log: quiet });
ok("!! THE RUNNER runs each gate once and passes when all pass; one failing gate fails the run", calls.slice().sort().join() === "a,b,c" && r1.ok && r1.results.every((x) => x.verdict === "pass") && !r2.ok && r2.results[1].verdict === "fail");
const bad = spawnSync("node", [CMD, "--speed", "1"], { encoding: "utf8" }), none = spawnSync("node", [CMD, "--only", "no-such-gate"], { encoding: "utf8" });
ok("!! THE COMMAND REFUSES an option it does not know and an --only that matches no gate, before running anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && none.status === 2 && /no gate matches/.test(none.stderr));
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
