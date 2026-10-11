// WebGLEngine/tools/ship/poolWatch-selfcheck.mjs -- v4832
//
// THE GATES THE QUICK SWEEP DOES NOT RUN CAN CARRY A RED, AND NOTHING SAID SO. tools/ship/poolWatch.mjs reads the timing record for the over-budget pool and names three things: a recorded RED (a real nonzero
// exit), a CAPPED reading (124 or "timeout/signal": no verdict), and how old the pool's readings are. This gate holds that module's classification on records built here, holds the COMMITTED record to the
// rule (no skipped gate carries a recorded red that no register names), and holds verify.mjs to calling it -- so the rule cannot be removed by deleting one call.
//
// WHY IT EXISTS (v4832): at v4830 the rotation returned gfx/frontDoor-selfcheck.mjs red, a gate over the 3,000 ms budget that no ship-time step runs, red since at least 6 October (four modules reached from
// main.js that its arrivals list did not name). tools/ship/definitionGates-selfcheck.mjs had sat over its ceilings for two ships the same way. Both were found because the rotation visited them and a person read
// its log. v4460 measured the same class (314 over-budget entries carrying a stale code 0, 22 of them red when run alone). MEASURED AT v4831: 444 of the 449 over-budget gates have no recorded input set
// (tools/ship/inputSets.mjs), so "skip a gate whose inputs are unchanged" cannot tell a still-true pool reading from a stale one; the age census is what can be said, and it is said.
//
// SABOTAGES (each broken in place, the gate run, the file restored and diffed, 2026-10-11):
//   A  kindOfCode: a real nonzero exit read as "capped"                 -> RED (the classification row, the recorded-red row, the unregistered row, the live row's synthetic twin)
//   B  census: the register ignored (every recorded red "unregistered") -> RED (the registered-red row)
//   C  census: the budget test dropped (under-budget gates in the pool) -> RED (the pool-membership row)
//   D  census: the enumerated filter dropped                            -> RED (the dropped-gate row)
//   E  census: 124 read as a red                                        -> RED (the capped row)
//   F  verify.mjs: the call to poolWatch removed                        -> RED (the wiring row). FIRST TRY WENT 0 RED: the row matched /poolWatch\.mjs/, and verify.mjs's own comment spells that name; it now matches the import() call itself
//   G  the committed record given an unregistered exit 1 on an over-budget gate -> RED (the live row, naming the gate and the command that re-runs it)
//   H  describe(): the unregistered count left out                      -> RED (the one-line row)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PW from "./poolWatch.mjs";
import { enumerateGates } from "./gateSweep.mjs";
import { redRegister } from "./quickSweep.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const J = (x) => JSON.stringify(x);

// ---- 1. the classification ------------------------------------------------------------------------------------------------
console.log("1. what a recorded exit code means");
ok("a real nonzero exit is a RED; 0 is ok; 124 and \"timeout/signal\" are CAPPED (no verdict); anything else is unknown",
    [1, 2, 137, 255].every((c) => PW.kindOfCode(c) === "red") && PW.kindOfCode(0) === "ok" && PW.kindOfCode(124) === "capped" && PW.kindOfCode("timeout/signal") === "capped" &&
    [null, undefined, "x", NaN, {}].every((c) => PW.kindOfCode(c) === "unknown"),
    "1, 2, 137, 255 -> red; 0 -> ok; 124, \"timeout/signal\" -> capped; null, undefined, \"x\", NaN, {} -> unknown");

// ---- 2. the census on a record built here ---------------------------------------------------------------------------------
console.log("2. the census, on a record whose every case is known");
const NOW = Date.parse("2026-10-11T12:00:00.000Z"), ago = (ms) => new Date(NOW - ms).toISOString(), D = 86400000;
const rec = {
    budgetMs: 3000,
    timings: { "a-selfcheck.mjs": 5000, "b-selfcheck.mjs": 5000, "c-selfcheck.mjs": 5000, "d-selfcheck.mjs": 5000, "e-selfcheck.mjs": 200, "f-selfcheck.mjs": 7000 },
    codes: { "a-selfcheck.mjs": 1, "b-selfcheck.mjs": 1, "c-selfcheck.mjs": 124, "d-selfcheck.mjs": 0, "e-selfcheck.mjs": 1, "f-selfcheck.mjs": 1 },
    at: { "a-selfcheck.mjs": ago(2 * 3600000), "b-selfcheck.mjs": ago(3 * D), "c-selfcheck.mjs": ago(10 * D), "d-selfcheck.mjs": ago(100 * D), "e-selfcheck.mjs": ago(0), "f-selfcheck.mjs": ago(0) },
};
const enumerated = ["a", "b", "c", "d", "e"].map((x) => x + "-selfcheck.mjs"), register = new Map([["b-selfcheck.mjs", "redCensus.TEST"]]);
const c = PW.census(rec, { enumerated, register, now: NOW });
ok("the pool is the over-budget gates the tree still has: a, b, c, d (e is under the budget, so the sweep RUNS it; f is not a gate the tree has)", J(c.pool) === J(["a-selfcheck.mjs", "b-selfcheck.mjs", "c-selfcheck.mjs", "d-selfcheck.mjs"]), J(c.pool));
ok("a skipped gate with a real nonzero exit is a RECORDED RED, with its code", c.recordedRed.length === 2 && c.recordedRed.every((r) => r.code === 1), c.recordedRed.map((r) => r.gate).join(", "));
ok("...and one the register names is not UNREGISTERED: only a is the finding", J(c.unregisteredRed.map((r) => r.gate)) === J(["a-selfcheck.mjs"]) && c.recordedRed.find((r) => r.gate === "b-selfcheck.mjs").record === "redCensus.TEST", J(c.unregisteredRed.map((r) => r.gate)));
ok("exit 124 is CAPPED, not red: no verdict is not a failure and not a pass", J(c.capped) === J(["c-selfcheck.mjs"]) && !c.recordedRed.some((r) => r.gate === "c-selfcheck.mjs"), J(c.capped));
ok("a gate with exit 1 UNDER the budget is not in the pool (the sweep runs it and reconciles it itself)", !c.pool.includes("e-selfcheck.mjs") && !c.recordedRed.some((r) => r.gate === "e-selfcheck.mjs"));
ok("a gate the tree no longer enumerates is ignored even when the record carries its exit 1 (the record keeps fixtures and dropped names)", !c.pool.includes("f-selfcheck.mjs") && !c.recordedRed.some((r) => r.gate === "f-selfcheck.mjs"));
ok("the age census buckets each reading: 2 h and 3 d and 10 d and 100 d -> a day, a week, a month, older; the oldest is d at 100 days",
    c.ages["within a day"] === 1 && c.ages["within a week"] === 1 && c.ages["within a month"] === 1 && c.ages.older === 1 && c.ages["no date"] === 0 && c.oldest && c.oldest.gate === "d-selfcheck.mjs" && c.oldest.days === 100,
    J(c.ages) + " oldest " + J(c.oldest));
const undated = PW.census({ budgetMs: 3000, timings: { "g-selfcheck.mjs": 9000 }, codes: { "g-selfcheck.mjs": 0 }, at: {} }, { now: NOW });
ok("a reading with no date is counted as such, not given an age it does not have", undated.ages["no date"] === 1 && undated.oldest === null);
ok("with no `enumerated` list the whole record is the pool (a caller that cannot name the live gates is not silently narrowed)", PW.census(rec, { now: NOW }).pool.includes("f-selfcheck.mjs"));
const line = PW.describe(c);
ok("the one line says the pool size, the recorded reds, how many no register names, the capped, and the oldest reading",
    /4 over-budget gates were NOT run/.test(line) && /2 carry a recorded red \(1 no register names\)/.test(line) && /1 were capped/.test(line) && /oldest is d-selfcheck\.mjs, 100 day/.test(line), line);
const adv = PW.advice(c.unregisteredRed[0]);
ok("the advice names the gate, its exit, the command that re-runs it alone, and refuses the register", /a-selfcheck\.mjs \(exit 1/.test(adv) && /sweepRotation\.mjs --gate a-selfcheck\.mjs --cap-s 300 --write/.test(adv) && /do not register it/.test(adv), adv);

// ---- 3. the COMMITTED record -----------------------------------------------------------------------------------------------
console.log("3. the committed timing record");
let live = null, liveErr = null;
try { live = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "sweep-timings.json"), "utf8")); } catch (e) { liveErr = e.message; }
const gates = enumerateGates(ENG), lc = live ? PW.census(live, { enumerated: gates, register: redRegister() }) : null;
ok("the committed record is read, and the pool it describes is not empty (a census of nothing would pass for the wrong reason)", !!lc && lc.pool.length > 50, lc ? `${lc.pool.length} over-budget gates of ${gates.length}` : liveErr);
ok("*** no gate the sweep skipped carries a recorded red that no register names ***", !!lc && lc.unregisteredRed.length === 0,
    lc ? (lc.unregisteredRed.length ? lc.unregisteredRed.map(PW.advice).join(" | ") : PW.describe(lc)) : liveErr);

// ---- 4. the wiring ---------------------------------------------------------------------------------------------------------
console.log("4. verify.mjs calls it");
const verifySrc = fs.readFileSync(path.join(ENG, "tools", "ship", "verify.mjs"), "utf8");
ok("verify.mjs imports poolWatch and fails the ship on an unregistered recorded red in the skipped pool", /await import\("\.\/poolWatch\.mjs"\)/.test(verifySrc) && /PW\.census\(/.test(verifySrc) && /check\("quick sweep: no skipped gate carries a recorded red/.test(verifySrc),
    "the import, the census() call and the check's name are all in verify.mjs");

console.log(fails ? `\npoolWatch-selfcheck: ${fails} FAILED` : "\npoolWatch-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
