// WebGLEngine/tools/ship/multigrid3dTiming-selfcheck.mjs -- v3355
// *** THE HARNESS IS GATED ON ITS REFUSALS, NOT ON ITS NUMBERS. *** A benchmark that always produces a ranking
// is measuring something; whether it is the code or the machine is the only question that matters.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { timeConfig, timeConfigs, collect, separated, compare, domain, usable, UNUSABLE_SPREAD } from "../multigrid3dTiming.mjs";
import { noComments, prose } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const src = fs.readFileSync(path.join(ENG, "tools", "multigrid3dTiming.mjs"), "utf8");

// ---- 1. THE SEPARATION RULE, ON SYNTHETIC BANDS WHERE THE ANSWER IS KNOWN ----------------------------------
const band = (min, p95) => ({ min, p95 });
// Bands kept INSIDE the usability rule on purpose: my first draft used 100..200 and 200..300, which span 2.0x
// and 1.5x, and the new refusal rejected them as unusable -- correctly. A synthetic fixture that could not occur
// in a real run is not a test of the real rule.
ok("!! *** overlapping bands are INDISTINGUISHABLE, which is a first-class answer ***",
    separated(band(100, 120), band(110, 130)) === null && separated(band(100, 120), band(119, 140)) === null,
    "a harness that always ranks is measuring its own noise. NULL IS A RESULT HERE, not a failure to produce one");

ok("...and non-overlapping bands ARE separated, in the right direction",
    separated(band(100, 120), band(200, 230)).faster === "a" &&
    separated(band(200, 230), band(100, 120)).faster === "b",
    "both directions driven -- a detector that fires on everything and one that fires on nothing look the same " +
    "until you try both");

// ---- 2. THE NULL TEST, DRIVEN FOR REAL. THIS IS THE ANSWER KEY. ---------------------------------------------
const n = 16;
const [a, b] = timeConfigs(n, [{ opts: { pre: 2, post: 2 } }, { opts: { pre: 2, post: 2 } }], { trials: 5, warm: 2 });   // v4899: interleaved -- see below
say("null test at " + n + "^3: A [" + a.min + ".." + a.p95 + "] B [" + b.min + ".." + b.p95 + "]  -> " +
    (separated(a, b) ? "SEPARATED" : "indistinguishable"));
ok("!! *** the SAME config under two labels comes out indistinguishable ***",
    separated(a, b) === null,
    "THE ANSWER KEY, and the thing almost no benchmark has. If this ever separates, the harness is resolving " +
    "machine noise and every verdict it prints is suspect -- which is exactly what happened at v3354 when one " +
    "cold trial per config ranked five of them and produced an impossible row");

// ---- 2b. v4899 -- THE MACHINE'S DRIFT MUST LAND ON BOTH CONFIGS, AND THE OLD ORDER FAILED THE NULL TEST WHEN IT DIDN'T -------------
// The null test above timed A's five trials and then B's five. On a box running other gates at once, or a CPU the gate was not written on, the speed STEPS between the two blocks: both bands are tight, they land at
// different heights, and the same config under two labels is "SEPARATED" -- the rig's 12-core box under the 8-wide sweep read this red once and 3.6 s green alone. Driven here on a runner whose speed steps by 25% at the boundary
// between the two configs' blocks (call 9: after A's last trial, before B's first -- and in the interleaved order it falls in the middle of both bands) (no real solve, so no real noise): the sequential order separates the SAME config from itself, and the interleaved order does not.
{
    const mkRunner = (calls, base = 100) => (k) => { const c = calls.n++; return { ms: Math.round(base * (c < calls.at ? 1 : 1.25) + (c % 3)), iters: 7, res: 1e-9 }; };
    const seqCalls = { n: 0, at: 9 }, ilCalls = { n: 0, at: 9 };
    const spec = { opts: { pre: 2, post: 2 } };
    const [sa, sb] = collect(16, [spec, spec], { trials: 5, warm: 2, order: "sequential", runner: mkRunner(seqCalls) });
    const [ia, ib] = collect(16, [spec, spec], { trials: 5, warm: 2, order: "interleaved", runner: mkRunner(ilCalls) });
    ok("!! *** under a 25% step in the machine's speed the SEQUENTIAL order calls the same config under two labels SEPARATED (the defect), and the INTERLEAVED order does not (the repair) ***",
        separated(sa, sb) !== null && separated(ia, ib) === null,
        `sequential A [${sa.min}..${sa.p95}] B [${sb.min}..${sb.p95}] -> ${separated(sa, sb) ? "SEPARATED" : "indistinguishable"}; interleaved A [${ia.min}..${ia.p95}] B [${ib.min}..${ib.p95}] -> ${separated(ia, ib) ? "SEPARATED" : "indistinguishable"}`);
    ok("  ...and the interleaved order still separates configs that really differ (B always 2x A, through the same 25% step), so the repair is not a way of seeing nothing",
        (() => { const c = { n: 0, at: 9 }; const r = (k) => { const m = c.n++ < c.at ? 1 : 1.25; return { ms: Math.round((k === 0 ? 100 : 200) * m), iters: 7, res: 1e-9 }; };
                 const [ra, rb] = collect(16, [spec, spec], { trials: 5, warm: 2, order: "interleaved", runner: r }); const sp = separated(ra, rb); return !!sp && sp.faster === "a"; })(),
        "a harness that can only say indistinguishable is the other way to be useless");
    ok("  and the library holds both orders, the tool and the null test use the interleaved one",
        /order = "interleaved"/.test(src) && /timeConfigs\(n, cfgs\.map/.test(src) && !/timeConfig\(n, o, s/.test(src) && /timeConfigs\(n, \[\{ opts: \{ pre: 2, post: 2 \} \}/.test(src),
        "timeConfig keeps its signature (one config) and is collect() over one spec");
}

// SABOTAGED (v4899, each alone, restored): the default order made sequential -> 1 red; the interleaved branch looping a config's trials in a block -> 0 red AT FIRST (the step landed inside A's block and the two bands touched), so the step moved to the block boundary -> red;
// the tool's main back on a timeConfig loop -> 0 red at first, so the source row now refuses `timeConfig(n, o, s` -> red; usable() always true -> 1.
// ---- 3. WARM-UP IS DISCARDED **AND REPORTED** ---------------------------------------------------------------
ok("!! warm-up runs are discarded AND the count is returned",
    a.warm === 2 && a.trials === 5 && Array.isArray(a.runs) && a.runs.length === 5,
    "a discarded warm-up that is not reported is indistinguishable from no warm-up at all. multigrid.html " +
    "learned this on the 2D side: one cold pair made the gather path look 1.45x faster than scatter");

// ---- 4. ITERATIONS ARE NOT WORK, AND THE HARNESS SAYS SO ------------------------------------------------------
ok("!! *** it prints iterations and ranks only TIME ***",
    // MY OWN RECURRING SLIP, AGAIN: this sentence is printed by the tool, so it lives in a STRING. prose()
    // extracts COMMENTS and could never have seen it -- noComments keeps strings and is the right view.
    noComments(src).includes("ITERATIONS ARE NOT WORK") && /only the TIME is ranked/.test(noComments(src)),
    "v3354 measured pcCycles:2 taking 30% FEWER iterations and MORE wall time. A harness ranking the iteration " +
    "column would have recommended the slower config, which is the error the multigrid3d gate already pins");

// ---- 4b. A BAND TOO WIDE TO MEAN ANYTHING SEPARATES FROM NOTHING -------------------------------------------
const wide = { min: 147, p95: 247 }, tight = { min: 139, p95: 142 };
ok("!! *** a run whose own spread exceeds " + UNUSABLE_SPREAD + "x is UNUSABLE and ranks nothing ***",
    usable(tight) && !usable(wide) && separated(wide, tight) === null && separated(tight, wide) === null,
    "THESE ARE THE REAL NUMBERS FROM THE RUN THAT FAILED THIS GATE at v3355: the null test reported the same " +
    "config separated from itself because one side caught a GC outlier and spanned 1.68x. Re-measured, 0 of 3 " +
    "attempts separated across five warm-up/trial/size settings -- SO IT WAS NOT INSUFFICIENT WARM-UP, AND " +
    "BUMPING THE COUNT WOULD HAVE BEEN TUNING UNTIL GREEN. An intermittently failing gate teaches people to re-run");

// ---- 5. IT REUSES stats() RATHER THAN RE-DERIVING A MEDIAN -----------------------------------------------------
ok("!! the median comes from brain/bench.mjs, not a second implementation",
    /from "\.\.\/brain\/bench\.mjs"/.test(noComments(src)),
    "a second median is a second truth, and this tree has spent rounds on exactly that shape");

// ---- 6. FRONT DOOR: it PRINTS AND EXITS ZERO, so it is a report and not a gate ---------------------------------
const reg = fs.readFileSync(path.join(ENG, "tools", "ship", "reportingTools.mjs"), "utf8");
ok("!! it is registered as a REPORTING tool and names itself in its output",
    /multigrid3dTiming\.mjs/.test(noComments(reg)) && /\[multigrid3dTiming\]/.test(noComments(src)),
    "a measurement is not a pass or a fail, and dressing one up as a gate invites tuning the threshold until " +
    "it goes green");

console.log(failed ? "multigrid3dTiming-selfcheck: " + failed + " FAILED" : "multigrid3dTiming-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
