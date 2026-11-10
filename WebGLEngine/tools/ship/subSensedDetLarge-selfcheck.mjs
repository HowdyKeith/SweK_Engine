// WebGLEngine/tools/ship/subSensedDetLarge-selfcheck.mjs -- UNNUMBERED. The gate of tools/ship/subSensedDetLarge.mjs, which reads the three sets of follow-up 60 together (brain/SENSED_NAV_WIP.md, "FOLLOW-UP 60" and its SECOND REGISTRATION).
//
// WHAT IT CHECKS: every number is HAND-DERIVED on made-up flights (the arithmetic is written beside the row). The three real files do not exist when this gate is written (they are flown after it and its sabotage are logged), so nothing here reads them; the fixture is 22 arms x 180 flights x 3 files built in memory with the counts each row needs.
//   1  the constants and the feature table      2  the exact sign test       3  the files: readLarge's checks, one for each way a file can be wrong
//   4  the three sets pooled: the bar, the verdict and the eight predictions BH1 to BH8, each at its edge and one flight inside it, on counts that are the pooled ones and not any one set's
//   5  the paired differences      6  the report      7  the command
//
// SABOTAGE LOG (2026-11-04; each mutant is ONE change to ONE site of tools/ship/subSensedDetLarge.mjs, made by a script from the same 21 rules as the pooled-reading module's -- every === !== >= > <= < && || + - * / Math.max Math.min Math.abs true false, a negation, `.sort()`, every numeric literal up and down by one -- on every code line (the header comment, doc comments and the import lines left out), run through this gate in a scratch copy of the tree; RED is a gate row that failed by name, THREW is a section that threw, which the section guard turns into a named FAIL; a mutant that ends the gate without `all checks pass` (a module that runs its command on import) is a red by the exit handler at the top):
//   FIRST PASS, 105 mutants: 84 RED, 11 THREW, 10 ZERO-RED. Read one by one: HOLES IN THE GATE, closed (a positive effect of +1 printed without its plus, the text of the POST HOC line, the exact message of a failed read and a thrown value that is not an Error, the command run as a script with no flag, which passed because the one flag test had a flag), REDUNDANT CODE removed (the sign test's `n === 0` guard: with no discordant scenario the one term is 1, twice it is 2 and the cap makes it 1), and two equivalents.
//   SECOND PASS (the module and the gate as they stand), 101 mutants: 88 RED, 11 THREW, 2 ZERO-RED, BOTH EQUIVALENT, said plainly: P0056 `p < 0.0001` made `<=` in the print of a p value (a p of exactly 0.0001 cannot happen: every p is a whole number over a power of two); P0063 the first of the three specs made the second (STUDIES[0] to STUDIES[1]: the three specs have the same arms, bar and predictions, which section 1 checks, so the report is the same).
//   NOT RE-RUN, and said: nothing after the second pass; the gate as a whole passes in about 3 seconds. The three files it reads are built in memory; the real ones do not exist when it is written.
"use strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Sp from "./subSensedDetSpecs.mjs";
import * as St from "./subSensedDetStudy.mjs";

let fails = 0, finished = false;   // an import that ends the process (a module that runs its command on import) must not look like a pass
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! the gate did not run to its end (the module under test ended the process)"); process.exitCode = 1; } });
const L = await import("./subSensedDetLarge.mjs");
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const guard = (n, f) => { try { f(); } catch (e) { fails++; console.log(`  FAIL  !! section ${n} ran to the end (THE GATE THREW: ${String((e && e.message) || e).slice(0, 200)})`); } };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re.test(String(e && e.message)); } };
const ONLY = process.env.SWEK_GATE_SECTIONS ? process.env.SWEK_GATE_SECTIONS.split(",") : null, want = (n) => !ONLY || ONLY.includes(String(n));
console.log("subSensedDetLarge-selfcheck -- the larger set of follow-up 60, read together\n");

const KINDS = ["hard-islands", "hard-gaps", "hard-current"], GAPS = [24, 32, 40];
const SPECS3 = L.STUDIES.map((n) => Sp.SPECS[n]), ARMS = SPECS3[0].arms, ROOT = "/x";
const fileOf = (i) => path.join(ROOT, SPECS3[i].out);
/** The rows of one file: totalOf(arm) is the arm's POOLED count over the 9 cells (3 kinds x 3 sets), spread over the cells as evenly as whole numbers allow (the first T mod 9 cells get one more); exactK(s) is exact's and the clean map's count of each cell of set s (0 to 60). */
function build(totalOf, exactK = () => 60) {
    return SPECS3.map((spec, s) => {
        const rows = [];
        for (const arm of ARMS) {
            const T = arm === "exact" || arm === "long+fix+forget" ? null : totalOf(arm);
            KINDS.forEach((kind, k) => {
                const idx = s * 3 + k, K = T === null ? exactK(s) : Math.floor(T / 9) + (idx < T % 9 ? 1 : 0);
                for (let i = 0; i < 60; i++) rows.push({ study: spec.name, set: spec.held, arm, kind, seed: (64 + s) * 100 + 1 + i, gap: kind === "hard-gaps" ? GAPS[i % 3] : null, status: i < K ? "reached" : "collided", reached: i < K, t: 100, path: 400, chord: 380, minClearance: 10, plans: 100, ensonified: 0.8, offsetEnd: 1 });
            });
        }
        return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    });
}
const reader = (files) => (p) => { const i = [0, 1, 2].find((j) => fileOf(j) === p); if (i === undefined || files[i] === null) throw new Error("ENOENT " + p); return files[i]; };
const read3 = (files) => L.readLarge(ROOT, reader(files));
// every detector arm at 360 of 540, so that nothing differs from anything
const FLAT = () => 360;
// the case in which every prediction holds AT ITS EDGE (hand-set; each total is the pooled count of 540): see section 4
const EDGE = { "m23e30@D30": 369, "inc@D30": 360, "m23e30@R3D30": 378, "m23re30@R3D30": 360, "m23e30@WD30L": 381, "m23re30@WD30L": 360, "rm23e30@R3D30": 366, "rm23e30@WD30L": 351, "m33e30@R3D30": 366, "m33e30@WD30L": 351, "m23e30k@R3D30": 393, "m23e30k@WD30L": 366, "m23e30@P": 375, "inc@P": 360 };
const totalsOf = (over = {}) => (arm) => ({ ...EDGE, ...over })[arm] ?? 360;
const judged = (files) => { const lg = read3(files); const spec = SPECS3[0]; return St.judge(St.summarize(lg.runs, spec), spec); };

guard(1, () => { if (!want(1)) return;
    console.log("1  THE CONSTANTS AND THE FEATURE TABLE");
    ok("the three studies are large-set-a, large-set-b and large-set-c, follow-up 60, in HELD64, HELD65, HELD66; a set is 180 flights of an arm", same([...L.STUDIES], ["large-set-a", "large-set-b", "large-set-c"]) && SPECS3.every((s, i) => s.followUp === 60 && s.held === `held${64 + i}`) && L.PER_ARM === 180);
    ok("the three specs have the same twenty-two arms and the same eight predictions and the same bar", SPECS3.every((s) => s.arms.length === 22 && same(s.arms, SPECS3[0].arms) && same(s.preds, SPECS3[0].preds) && same(s.bar, SPECS3[0].bar)));
    ok("!! the features are these five, the arm WITH the feature first (hold: m23e30 minus inc under D30, R3D30, WD30L and P; gate: m23re30 minus m23e30; near mark: rm23e30 minus m23e30; run of three: m33e30 minus m23e30; confirmed clear: m23e30k minus m23e30; the last four under R3D30, WD30L and P), frozen", same(L.FEATURES.map((f) => [...f]), [["the evidence hold (F8)", "m23e30", "inc", ["D30", "R3D30", "WD30L", "P"]], ["the gate on the hold (F4)", "m23re30", "m23e30", ["R3D30", "WD30L", "P"]], ["the first-reading near mark (F6)", "rm23e30", "m23e30", ["R3D30", "WD30L", "P"]], ["the run of three (F7)", "m33e30", "m23e30", ["R3D30", "WD30L", "P"]], ["the confirmed clear (F3)", "m23e30k", "m23e30", ["R3D30", "WD30L", "P"]]]) && Object.isFrozen(L.FEATURES) && L.FEATURES.every((f) => Object.isFrozen(f)) && Object.isFrozen(L.STUDIES));
    ok("every arm a feature names is flown in the sea it names (so that no paired row is empty)", L.FEATURES.every(([, w, wo, seas]) => seas.every((sea) => ARMS.includes(`${w}@${sea}`) && ARMS.includes(`${wo}@${sea}`))));
});

guard(2, () => { if (!want(2)) return;
    console.log("\n2  THE EXACT SIGN TEST (two-sided, 2 x P(X <= min) for X binomial (g + l, 1/2), at most 1)");
    // by hand: n = 3, g = 3: P(X <= 0) = 1/8, p = 0.25. n = 12, g = 10, l = 2: P(X <= 2) = (1 + 12 + 66) / 4096 = 79 / 4096, p = 158 / 4096 = 0.0385742. n = 25, g = 20, l = 5: P(X <= 5) = (1 + 25 + 300 + 2300 + 12650 + 53130) / 33554432 = 68406 / 33554432, p = 0.00407743. n = 8, g = 3, l = 5: P(X <= 3) = (1 + 8 + 28 + 56) / 256 = 93 / 256, p = 0.7265625.
    ok("!! signP(3, 0) = 0.25; signP(10, 2) = 158 / 4096 = 0.0385742; signP(20, 5) = 2 x 68406 / 33554432 = 0.00407743; signP(3, 5) = 186 / 256 = 0.7265625", near(L.signP(3, 0), 0.25) && near(L.signP(10, 2), 158 / 4096, 1e-12) && near(L.signP(20, 5), 2 * 68406 / 33554432, 1e-12) && near(L.signP(3, 5), 186 / 256, 1e-12));
    ok("it is symmetric in g and l (2, 10 and 10, 2; 5, 20 and 20, 5)", L.signP(2, 10) === L.signP(10, 2) && L.signP(5, 20) === L.signP(20, 5));
    ok("no discordant scenario gives 1; equal g and l give 1; (1, 0) gives min(1, 2 x 1/2) = 1; (0, 2) gives 2 x 1/4 = 0.5", L.signP(0, 0) === 1 && L.signP(6, 6) === 1 && L.signP(1, 0) === 1 && L.signP(0, 1) === 1 && L.signP(0, 2) === 0.5 && L.signP(2, 0) === 0.5);
    ok("it never exceeds 1 (g = l + 1: (4, 3) gives 2 x 64 / 128 = 1)", L.signP(4, 3) === 1 && L.signP(7, 6) === 1);
    ok("a large imbalance is tiny: (60, 0) = 2 / 2^60 and (200, 0) is not NaN", near(L.signP(60, 0), 2 / Math.pow(2, 60), 1e-25) && L.signP(200, 0) > 0 && L.signP(200, 0) < 1e-50);
});

guard(3, () => { if (!want(3)) return;
    console.log("\n3  THE FILES");
    const good = build(FLAT);
    const lg = read3(good);
    ok("!! three good files are read: 3 sets of the right names, files and sets, 3 x 3,960 = 11,880 flights in the order of the sets", lg.sets.length === 3 && same(lg.sets.map((s) => [s.study, s.held, s.file]), SPECS3.map((s) => [s.name, s.held, s.out])) && lg.runs.length === 11880 && lg.sets.every((s) => s.rows.length === 3960) && lg.runs[0].set === "held64" && lg.runs[3960].set === "held65" && lg.runs[7920].set === "held66");
    ok("a missing file is an error that names it and says none is read until all are flown (each of the three in turn)", [0, 1, 2].every((i) => throws(() => read3(good.map((t, j) => (j === i ? null : t))), new RegExp(`${SPECS3[i].out.replace(/\./g, "\\.")} is missing: the three sets are read together, so none is read until all are flown`))));
    ok("a file with one flight too few or too many is an error that names it and the count (3,959; 3,961)", throws(() => read3([good[0].split("\n").slice(0, -2).join("\n") + "\n", good[1], good[2]]), /subSensedDetLargeSetAHeld64\.jsonl has 3959 flights, not 22 arms x 180/) && throws(() => read3([good[0], good[1], good[2] + good[2].split("\n")[0] + "\n"]), /subSensedDetLargeSetCHeld66\.jsonl has 3961 flights/));
    ok("a row of another study or another set is an error that names both (a row of large-set-b in the file of large-set-a; a row of held99 in the file of large-set-c)", throws(() => read3([good[0].replace('"study":"large-set-a"', '"study":"large-set-b"'), good[1], good[2]]), /has a row of study large-set-b set held64, not large-set-a held64/) && throws(() => read3([good[0], good[1], good[2].replace('"set":"held66"', '"set":"held99"')]), /has a row of study large-set-c set held99, not large-set-c held66/));
    ok("an arm with 179 flights and another with 181 (the total right) is an error that names the arm", throws(() => { const rows = good[1].split("\n").filter(Boolean); const i = rows.findIndex((r) => JSON.parse(r).arm === "inc@D30"), j = rows.findIndex((r) => JSON.parse(r).arm === "m23e30@D30"); rows[i] = rows[j]; return read3([good[0], rows.join("\n") + "\n", good[2]]); }, /subSensedDetLargeSetBHeld65\.jsonl has 179 flights of inc@D30, not 180/));
    ok("blank lines in a file are skipped (a trailing blank line and a blank line in the middle change nothing)", read3([good[0] + "\n\n", good[1].replace("\n", "\n\n"), good[2]]).runs.length === 11880);
    ok("the root is joined to the spec's file name: the reader is asked for /x/brain/subSensedDetLargeSetAHeld64.jsonl, ...BHeld65.jsonl, ...CHeld66.jsonl, in that order, once each", (() => { const asked = []; L.readLarge(ROOT, (p) => { asked.push(p.replace(/\\/g, "/")); return good[asked.length - 1]; }); return same(asked, ["/x/brain/subSensedDetLargeSetAHeld64.jsonl", "/x/brain/subSensedDetLargeSetBHeld65.jsonl", "/x/brain/subSensedDetLargeSetCHeld66.jsonl"]); })());
});

guard(4, () => { if (!want(4)) return;
    console.log("\n4  THE THREE SETS POOLED: THE BAR, THE VERDICT AND THE EIGHT PREDICTIONS");
    const lg = read3(build(totalsOf()));
    const spec = SPECS3[0], sum = St.summarize(lg.runs, spec);
    ok("!! an arm's pooled count is its reached flights over the 540 scenarios: m23e30@D30 = 369, inc@D30 = 360 (3 kinds x 3 sets, 180 flights a kind), each cell 540 / 3 kinds = 180 flights", sum.pooled["m23e30@D30"].reached === 369 && sum.pooled["inc@D30"].reached === 360 && sum.pooled["m23e30@D30"].n === 540 && KINDS.every((k) => sum.cells[k]["m23e30@D30"].n === 180));
    ok("the count of each kind is the sum of the three sets' cells: 369 over the nine cells is 41 in the first nine / 9 x ... (the first 369 mod 9 = 0 cells get one more): every cell 41, so each kind has 123", KINDS.every((k) => sum.cells[k]["m23e30@D30"].reached === 123));
    const j = St.judge(sum, spec);
    ok("!! with every total at its edge, all eight predictions HOLD: BH1 369 - 360 = 9; BH2 378 - 360 = 18; BH3 381 - 360 = 21; BH4 378 - 366 = 12 and 381 - 351 = 30; BH5 378 - 366 = 12; BH6 381 - 351 = 30; BH7 |393 - 378| = 15 and |366 - 381| = 15; BH8 |375 - 360| = 15", same(Object.values(j.preds), [true, true, true, true, true, true, true, true]) && same(Object.keys(j.preds), ["BH1", "BH2", "BH3", "BH4", "BH5", "BH6", "BH7", "BH8"]));
    // one flight inside each edge: exactly the prediction that owns the arm is missed
    const cases = [["BH1", { "m23e30@D30": 368 }], ["BH2", { "m23re30@R3D30": 361 }], ["BH3", { "m23re30@WD30L": 361 }], ["BH4", { "rm23e30@R3D30": 367 }], ["BH4", { "rm23e30@WD30L": 352 }], ["BH5", { "m33e30@R3D30": 367 }], ["BH6", { "m33e30@WD30L": 352 }], ["BH7", { "m23e30k@R3D30": 394 }], ["BH7", { "m23e30k@WD30L": 365 }], ["BH8", { "inc@P": 359 }]];
    ok("!! one flight inside its edge, exactly one prediction is missed and it is the right one (BH1: 368; BH2: m23re30 361; BH3: 361; BH4: rm23e30 367 or 352; BH5: m33e30 367; BH6: 352; BH7: m23e30k 394 or 365; BH8: inc@P 359), the other seven still hold", cases.every(([id, over]) => { const r = judged(build(totalsOf(over))); return Object.entries(r.preds).every(([k, v]) => v === (k !== id)); }));
    ok("the other side of each `within` edge holds too: m23e30k 363 (|363 - 378| = 15, 363 - 381 is not the pair: R3D30 pairs 363 with 378) holds BH7; 392 and 367 hold; and inc@P 361 holds BH8", (() => { const h = (over) => judged(build(totalsOf(over))).preds; return h({ "m23e30k@R3D30": 363 }).BH7 && h({ "m23e30k@R3D30": 392 }).BH7 && h({ "m23e30k@WD30L": 367 }).BH7 && h({ "inc@P": 361 }).BH8 && !h({ "m23e30k@R3D30": 362 }).BH7 && !h({ "inc@P": 374 }).BH8 === false; })());
    ok("!! the counts are the POOLED ones: in the edge case BH2's difference is 18 pooled and only 6 in each set (a reading on one set could never hold it): the first set's own m23e30@R3D30 minus m23re30@R3D30 is 6", (() => { const s0 = lg.sets[0].rows, c = (arm) => s0.filter((r) => r.arm === arm && r.reached).length; return c("m23e30@R3D30") - c("m23re30@R3D30") === 6; })());
    // the bar: exact 60 / 50 / 40 of 60 in the three sets (pooled 150 a kind, 80% = 120); the designated 40 a kind in every set (pooled 120)
    const barRun = (dTot, ex) => St.judge(St.summarize(read3(build((arm) => (arm.startsWith("m23e30@") ? dTot : 360), ex)).runs, spec), spec);
    const ex = (s) => [60, 50, 40][s];
    ok("!! the bar is on the pooled counts: exact 150 a kind (60 + 50 + 40 over the sets), 80% of it is 120; the designated at 120 a kind (1080 over nine cells... 360 over the nine: 40 a cell) reaches it in every kind, under R3D30 and under WD30L: SUPPORTED, 6 of 6 (set a alone would need 48 of its 60 and miss)", (() => { const r = barRun(360, ex); return r.cellsHeld === 6 && r.verdict === "SUPPORTED" && KINDS.every((k) => r.cells.R3D30[k] && r.cells.WD30L[k]); })());
    ok("one flight below (the designated at 359 of 360: a kind at 119 or 120): the kinds that lose one are missed; at 357 all three kinds are at 119, 6 cells are missed: NOT SUPPORTED", (() => { const r1 = barRun(359, ex), r3 = barRun(357, ex); return r1.cellsHeld === 4 && r1.verdict === "PARTLY SUPPORTED" && r3.cellsHeld === 0 && r3.verdict === "NOT SUPPORTED"; })());
    ok("the bar is the designated m23e30's, under R3D30 and WD30L: raising only m23e30@WD30L's count moves only the WD30L cells (the designated at 363 under R3D30: 121 a kind held; under WD30L at 351: 117 a kind, missed: 3 of 6 cells... as 3 cells are held, NOT SUPPORTED)", (() => { const run = (a, b) => St.judge(St.summarize(read3(build((arm) => (arm === "m23e30@R3D30" ? a : arm === "m23e30@WD30L" ? b : 360), ex)).runs, spec), spec); const r = run(363, 351); return r.cellsHeld === 3 && KINDS.every((k) => r.cells.R3D30[k] && !r.cells.WD30L[k]) && r.verdict === "NOT SUPPORTED"; })());
});

guard(5, () => { if (!want(5)) return;
    console.log("\n5  THE PAIRED DIFFERENCES");
    const mk = (arm, kind, seeds, reachedSeeds) => seeds.map((seed) => ({ arm, kind, seed, reached: reachedSeeds.includes(seed) }));
    const seq = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const set1 = [...mk("x", "hard-islands", seq(1, 10), seq(1, 6)), ...mk("y", "hard-islands", seq(1, 10), seq(4, 8)), ...mk("x", "hard-gaps", [1], [1]), ...mk("y", "hard-gaps", [1], [1]), ...mk("x", "hard-current", [99], [99])];
    const set2 = [...mk("x", "hard-islands", seq(1, 10), seq(1, 4)), ...mk("y", "hard-islands", seq(1, 10), seq(1, 4))];
    const set3 = [...mk("x", "hard-islands", seq(1, 10), seq(1, 2)), ...mk("y", "hard-islands", seq(1, 10), seq(1, 5))];
    // set 1: islands 1-10: x reached 1-6, y reached 4-8: x only 1, 2, 3 (g = 3), y only 7, 8 (l = 2); both 4, 5, 6; gaps seed 1 both reached (a different scenario from islands seed 1); x alone flew current seed 99 (not paired, not counted). effect = reached x - reached y over the scenarios both flew = (6 + 1) - (5 + 1) = +1.
    // set 2: both reach 1-4: g = l = 0, effect 0. set 3: x reaches 1-2, y reaches 1-5: g = 0, l = 3, effect 2 - 5 = -3. pooled: effect -2, g = 3, l = 5, p = 186 / 256 = 0.7265625.
    const r = L.paired([{ rows: set1 }, { rows: set2 }, { rows: set3 }], "x", "y");
    ok("!! x against y over three sets: per set +1, 0, -3 (g 3 l 2; g 0 l 0; g 0 l 3), pooled effect -2, g 3, l 5, p 0.7265625", same(r.per, [{ effect: 1, g: 3, l: 2 }, { effect: 0, g: 0, l: 0 }, { effect: -3, g: 0, l: 3 }]) && r.pooled.effect === -2 && r.pooled.g === 3 && r.pooled.l === 5 && near(r.pooled.p, 186 / 256, 1e-12));
    const q = L.paired([{ rows: set1 }, { rows: set2 }, { rows: set3 }], "y", "x");
    ok("reversed (y against x) the effect and the discordant counts swap: per set -1, 0, +3, pooled +2, g 5, l 3, and the same p", same(q.per, [{ effect: -1, g: 2, l: 3 }, { effect: 0, g: 0, l: 0 }, { effect: 3, g: 3, l: 0 }]) && q.pooled.effect === 2 && q.pooled.g === 5 && q.pooled.l === 3 && q.pooled.p === r.pooled.p);
    ok("a scenario is a kind AND a seed: islands seed 1 (x only) and gaps seed 1 (both) are two scenarios, so g in set 1 is 3 and not 2", r.per[0].g === 3);
    ok("only reached === true counts (a 1 or \"true\" is not a reach)", (() => { const rows = [{ arm: "x", kind: "hard-islands", seed: 1, reached: 1 }, { arm: "y", kind: "hard-islands", seed: 1, reached: false }, { arm: "x", kind: "hard-islands", seed: 2, reached: "true" }, { arm: "y", kind: "hard-islands", seed: 2, reached: false }, { arm: "x", kind: "hard-islands", seed: 3, reached: true }, { arm: "y", kind: "hard-islands", seed: 3, reached: false }]; const z = L.paired([{ rows }], "x", "y"); return z.pooled.effect === 1 && z.pooled.g === 1 && z.pooled.l === 0; })());
    ok("an arm that is not in the file gives no pairs: effect 0, g 0, l 0, p 1", (() => { const z = L.paired([{ rows: set2 }], "x", "nobody"); return z.pooled.effect === 0 && z.pooled.g === 0 && z.pooled.l === 0 && z.pooled.p === 1; })());
    ok("rows of other arms in the set do not enter (a third arm z reaching everything changes nothing)", (() => { const z = L.paired([{ rows: [...set1, ...mk("z", "hard-islands", seq(1, 10), seq(1, 10))] }], "x", "y"); return z.pooled.effect === 1 && z.pooled.g === 3 && z.pooled.l === 2; })());
});

guard(6, () => { if (!want(6)) return;
    console.log("\n6  THE REPORT");
    const lg = read3(build(totalsOf()));
    const text = L.report(lg), lines = text.split("\n");
    const spec = SPECS3[0], sum = St.summarize(lg.runs, spec), jj = St.judge(sum, spec);
    ok("!! the first line names the follow-up, the three sets, the 540 scenarios of each arm, the 22 arms and says READ TOGETHER", lines[0] === "LARGER SET (follow-up 60): 3 sets (held64, held65, held66), 540 scenarios of each arm, 22 arms, READ TOGETHER");
    ok("the report holds the engine's own table of the pooled counts, verbatim, and the engine's own verdict text (the bar's cells, BH1 to BH8, VERDICT:)", text.includes(St.table(sum, spec, "the three sets pooled (the three kinds, 60 seeds of each in each set)")) && text.includes(St.verdictText(jj, spec)) && /VERDICT: (SUPPORTED|PARTLY SUPPORTED|NOT SUPPORTED)\n/.test(text));
    ok("the verdict text lists the eight predictions as HELD (the edge case): `BH1 ... : HELD` through `BH8 ... : HELD`", ["BH1", "BH2", "BH3", "BH4", "BH5", "BH6", "BH7", "BH8"].every((id) => new RegExp(`\\n${id} [^\\n]*: HELD\\n`).test(text)));
    const at = lines.indexOf("feature | sea | with minus without | pooled | HELD64 / HELD65 / HELD66 | g / l | p");
    ok("!! the paired block follows a line that says it is POST HOC and what g and l are, then a header, then sixteen rows (the hold under four seas, the other four features under three each)", at > 2 && lines[at - 1] === "POST HOC (nothing here is a registered prediction): the arm WITH the feature minus the arm without it, pooled over the 540 paired scenarios, and in each set; discordant scenarios g (with reached, without not) / l; the exact two-sided sign test, no correction for the number of tests" && lines.length - 1 - (at + 1) === 16 && lines[lines.length - 1] === "");
    // the confirmed clear under R3D30: m23e30k 393, m23e30 378 -> +15 pooled; each cell of the nested outcomes differs by the same: per set 393 -> cells (44,44,44 | 44,44,44 | 44,44,44 + remainder) ... checked by the exact text below
    const row = (label, sea) => lines.find((l) => l.startsWith(`${label} | ${sea} | `));
    ok("!! a row is `feature | sea | with minus without | pooled | per set | g / l | p`: the gate under R3D30 is m23re30 (360) minus m23e30 (378) = -18 pooled, -6 / -6 / -6 in the sets, g 0 / l 18, p 2 / 2^18 = <0.0001", row("the gate on the hold (F4)", "R3D30") === "the gate on the hold (F4) | R3D30 | m23re30 minus m23e30 | -18 | -6 / -6 / -6 | 0 / 18 | <0.0001");
    ok("!! the hold under D30 is m23e30 (369: 41 in each of the nine cells) minus inc (360: 40 a cell) = +9, +3 / +3 / +3, g 9 / l 0, p 2 / 2^9 = 0.0039; under P 375 (42 in the first six cells, 41 in the last three) minus 360 = +15, +6 / +6 / +3, g 15, p <0.0001; under R3D30 378 (42 a cell) - 360 = +18, +6 / +6 / +6; a positive effect is printed with a +", row("the evidence hold (F8)", "D30") === "the evidence hold (F8) | D30 | m23e30 minus inc | +9 | +3 / +3 / +3 | 9 / 0 | 0.0039" && row("the evidence hold (F8)", "P") === "the evidence hold (F8) | P | m23e30 minus inc | +15 | +6 / +6 / +3 | 15 / 0 | <0.0001" && row("the evidence hold (F8)", "R3D30") === "the evidence hold (F8) | R3D30 | m23e30 minus inc | +18 | +6 / +6 / +6 | 18 / 0 | <0.0001");
    ok("!! the totals do not spread evenly and the rows show where: the near mark under R3D30 is rm23e30 366 (41 in the first six cells, 40 in the last three) minus m23e30 378 (42 a cell) = -12, -3 / -3 / -6, g 0 / l 12, p 2 / 2^12 = 0.0005; the confirmed clear under WD30L is m23e30k 366 minus m23e30 381 (43 in the first three cells, 42 in the rest) = -15, -6 / -3 / -6, p <0.0001", row("the first-reading near mark (F6)", "R3D30") === "the first-reading near mark (F6) | R3D30 | rm23e30 minus m23e30 | -12 | -3 / -3 / -6 | 0 / 12 | 0.0005" && row("the confirmed clear (F3)", "WD30L") === "the confirmed clear (F3) | WD30L | m23e30k minus m23e30 | -15 | -6 / -3 / -6 | 0 / 15 | <0.0001");
    const flat = L.report(read3(build(FLAT))).split("\n");
    ok("in the flat case (every detector arm at 360) every paired row is `0 | 0 / 0 / 0 | 0 / 0 | 1.0000`: no sign on a zero", flat.filter((l) => /^the .* \| \S+ minus \S+ \| /.test(l)).length === 16 && flat.filter((l) => /^the .* \| \S+ minus \S+ \| /.test(l)).every((l) => /\| 0 \| 0 \/ 0 \/ 0 \| 0 \/ 0 \| 1\.0000$/.test(l)));
    ok("!! an effect of +1 is printed with its plus and of -1 with its minus: m23e30@D30 at 361 (41 in the first cell, 40 in the rest) against inc 360 is `+1 | +1 / 0 / 0 | 1 / 0 | 1.0000`; at 359 (39 in the last cell) it is `-1 | 0 / 0 / -1 | 0 / 1 | 1.0000`", (() => { const r = (v) => L.report(read3(build(totalsOf({ "m23e30@D30": v })))).split("\n").find((l) => l.startsWith("the evidence hold (F8) | D30 | ")); return r(361) === "the evidence hold (F8) | D30 | m23e30 minus inc | +1 | +1 / 0 / 0 | 1 / 0 | 1.0000" && r(359) === "the evidence hold (F8) | D30 | m23e30 minus inc | -1 | 0 / 0 / -1 | 0 / 1 | 1.0000"; })());
    ok("the report ends with one newline", text.endsWith("\n") && !text.endsWith("\n\n"));
});

guard(7, () => { if (!want(7)) return;
    console.log("\n7  THE COMMAND");
    const io = (o = {}) => { const log = []; return { log, o: { out: "/tmp/x/brain/subSensedDetLarge.txt", exists: () => false, writeFile: (f, t) => log.push(["write", f, t]), log: (m) => log.push(["log", m]), err: (m) => log.push(["err", m]), print: (t) => log.push(["print", t]), run: () => "TABLE\n", ...o } }; };
    const a = io(); const rc1 = L.main([], a.o);
    ok("main with no flag prints the report and writes nothing", rc1 === 0 && same(a.log, [["print", "TABLE\n"]]));
    const b = io(); const rc2 = L.main(["--write"], b.o);
    ok("main --write writes the report to the file and says its name, once", rc2 === 0 && same(b.log, [["write", "/tmp/x/brain/subSensedDetLarge.txt", "TABLE\n"], ["log", "wrote subSensedDetLarge.txt"]]));
    const c = io({ exists: () => true }); const rc3 = L.main(["--write"], c.o);
    ok("!! main --write REFUSES to overwrite a table that exists: exit 2, an error naming the file, nothing written and the files never read", rc3 === 2 && c.log.length === 1 && c.log[0][0] === "err" && /subSensedDetLarge\.txt exists; the table is read once and is not overwritten/.test(c.log[0][1]));
    const d = io({ exists: () => true }); const rc4 = L.main([], d.o);
    ok("main without --write does not care that the file exists (it only prints)", rc4 === 0 && d.log[0][0] === "print");
    const e = io(); const rc5 = L.main(["--wirte"], e.o);
    ok("!! a flag it does not know is a usage error: exit 1, a message naming the flag, nothing run, nothing written", rc5 === 1 && e.log.length === 1 && e.log[0][1] === "usage: node tools/ship/subSensedDetLarge.mjs [--write]   (not understood: --wirte)");
    const f = io({ run: () => { throw new Error("subSensedDetLarge: brain/x.jsonl is missing: the three sets are read together, so none is read until all are flown"); } }); const rc6 = L.main(["--write"], f.o);
    ok("!! a missing or malformed file is exit 2 with the message, and nothing is written (the report is not made from part of the flights)", rc6 === 2 && f.log.length === 1 && f.log[0][0] === "err" && f.log[0][1] === "subSensedDetLarge: brain/x.jsonl is missing: the three sets are read together, so none is read until all are flown");
    const f2 = io({ run: () => { throw "plain failure"; } }); const rc7 = L.main([], f2.o);
    ok("a thrown value that is not an Error is printed as it is: exit 2, `plain failure`", rc7 === 2 && same(f2.log, [["err", "plain failure"]]));
    const here = fileURLToPath(new URL("./subSensedDetLarge.mjs", import.meta.url));
    const cp = spawnSync(process.execPath, [here, "--bogus"], { encoding: "utf8" });
    ok("!! run as a script with a flag it does not know (so that nothing is read): status 1, the usage message on stderr, nothing on stdout (the guard and the arguments after the script)", cp.status === 1 && cp.stderr.trim() === "usage: node tools/ship/subSensedDetLarge.mjs [--write]   (not understood: --bogus)" && cp.stdout === "", `status ${cp.status}`);
    const cp2 = spawnSync(process.execPath, [here], { encoding: "utf8", maxBuffer: 1 << 26 });
    ok("!! run as a script with no flag it does the command (whatever the state of the three files: the missing-file error and exit 2 before they are flown, the report and exit 0 after): it is NOT silent", (cp2.status === 2 && /is missing: the three sets are read together, so none is read until all are flown/.test(cp2.stderr) && cp2.stdout === "") || (cp2.status === 0 && cp2.stdout.startsWith("LARGER SET (follow-up 60): 3 sets (held64, held65, held66)")), `status ${cp2.status}`);
    const cp3 = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(new URL("./subSensedDetLarge.mjs", import.meta.url).href)}).then(() => console.log("imported"))`], { encoding: "utf8" });
    ok("importing the module (here from `node -e`, which has no script path) runs nothing: it imports and ends normally", cp3.status === 0 && cp3.stdout === "imported\n" && cp3.stderr === "", cp3.stderr.slice(0, 120));
});

finished = true;
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
