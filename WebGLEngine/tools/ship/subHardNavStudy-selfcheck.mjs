// WebGLEngine/tools/ship/subHardNavStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subHardNavStudy-selfcheck.mjs      (~10 s)
//
// THE STUDY OF THE HARDER NAVIGATION TEST (tools/ship/subHardNavStudy.mjs), held to its word before HELD4 is flown (registration and Amendment 1: "FOLLOW-UP 3" of brain/SUB_FIELD_NAV_WIP.md):
//   1  THE STATISTICS  median (odd, even, empty, unsorted, input untouched); pathRatio (arm A over arm B, only the scenarios both reached, one kind)
//   2  THE SUMMARY     counts by status, rate, medians (clearance over all flights, path/chord and time over the arrivals only), the margin rungs, replans, the paired path against `any`, any over any-blind, the gap/ship/current splits at their boundaries
//   3  THE VERDICT     each kind's bar on its designated arm (islands also the collision ceiling), the verdict rule over the combinations of bars, H1 to H8 each at its boundary
//   4  THE TEXT        the table (a line a kind and arm, the splits) and the verdict block
//   5  THE COMMAND     bad arguments (exit 2, named), a small DEV run end to end (the pilot is the PD autopilot, the scenarios are the set's), --write goes with held4 only and puts one JSON line a flight in brain/subHardNavHeld4.jsonl
//
// SABOTAGE LOG -- 88 mutants of tools/ship/subHardNavStudy.mjs, each run against a copy of this gate, 2 to 3 at a time. 87 RED BY NAME, 1 DEAD CODE REMOVED:
//   T01-T05 the five thresholds; T06 the output file; T07-T11 median (even, odd, empty, in place, numeric sort); T12 pathRatio's kind filter on B; T13-T16 pathRatio (A reached, direction, B reached, NaN for none); T18 tally; T19-T24 the cell (rate,
//   collided, left, timeout, other, noRoute); T25-T29 the medians (clearance over all, path/chord and time over arrivals, replans over all); T30-T31 the margin rungs; T32-T34 vsAny and anyOverBlind (the exclusion, both directions); T35-T41 the
//   splits (ship speed boundaries both sides, current boundaries both sides, gap width, the two kinds); T42 an empty cell skipped; T43-T48 the bars (islands' collision ceiling, inclusive, designated arm, the verdict rule, the other kinds); T49-T66
//   H1 to H8 each at its boundary and each `every` against `some`; T67 a missing gap width; T68-T72 the text (percent digits, the gap heading, the collided column, the bar printed, the verdict in capitals); T73-T81 the command (the --write
//   guard, whole seeds, the set guard, the seeds slice, the tag, the first line, all scenarios flown, the unknown-argument message); T82-T85 the summary's field names and sources; T86-T87 the output path and its line; T88 the default set.
//   T17 (pathRatio's kind filter on arm A) is DEAD CODE and was REMOVED: the pairing key already carries the kind, so a run of another kind can never match, and only B's filter does any work (T12 is red).
//   ON THE FIRST RUN FIFTEEN WENT 0 RED and the gate grew what separated them: T20, T21, T22 (the status counts) had one flight of each status, so swapping two counts changed nothing (the test data now has 2 collided, 3 timed out, 1 left); T29 had no flight
//   that was not an arrival among those with replans; T36, T40, T41 and T82 died of a thrown error in a row that read a cell that was not there (those rows are guarded now); T67 had no gap width without flights; T70 had no row on the table's columns;
//   T72 only matched the word VERDICT; T79 flew four scenarios and a four-scenario slice looked the same; T80 gave the pilot a zero current, which it ignores; T12 and T17 were redundant filters (above).
"use strict";
import * as St from "./subHardNavStudy.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (kind, seed, arm, o = {}) => ({ kind, seed, arm, status: "reached", reached: true, t: 100, path: 400, chord: 380, minClearance: 10, margin: 12, noRoute: false, replans: 0, gap: null, shipSpeed: 0, currentMean: 0, ...o });
const lose = (status, o = {}) => ({ status, reached: false, t: null, ...o });
console.log("subHardNavStudy-selfcheck -- the study of the harder navigation test\n");

console.log("1. THE STATISTICS");
{
    const xs = [5, 1, 3];
    ok("!! median: the middle of an odd count (5, 1, 3 -> 3), the mean of the middle two of an even one (1, 2, 3, 10 -> 2.5), NaN for none; the input is not sorted in place", St.median(xs) === 3 && same(xs, [5, 1, 3]) && St.median([10, 3, 1, 2]) === 2.5 && Number.isNaN(St.median([])) && St.median([7]) === 7);
    const runs = [run("hard-islands", 1, "any", { path: 400 }), run("hard-islands", 1, "any-blind", { path: 440 }), run("hard-islands", 2, "any", { path: 300 }), run("hard-islands", 2, "any-blind", { path: 450 }),
        run("hard-islands", 3, "any", { path: 300, ...lose("collided") }), run("hard-islands", 3, "any-blind", { path: 330 }), run("hard-gaps", 1, "any", { path: 10 }), run("hard-gaps", 1, "any-blind", { path: 100 })];
    const r = St.pathRatio(runs, "hard-islands", "any-blind", "any");
    ok("!! pathRatio(A, B): the median of A's path over B's on the scenarios of the kind that BOTH reached (440/400 = 1.1 and 450/300 = 1.5: median 1.3, 2 pairs; seed 3, where `any` collided, and the other kind's seed 1 are not paired)", near(r.ratio, 1.3) && r.pairs === 2);
    const q = St.pathRatio(runs, "hard-islands", "any", "any-blind");
    ok("!! the ratio is A over B, not B over A (any over any-blind: 400/440 and 300/450: median 0.788), and a kind with no pair gives NaN and 0 pairs", near(q.ratio, (400 / 440 + 300 / 450) / 2, 1e-9) && q.pairs === 2 && Number.isNaN(St.pathRatio(runs, "hard-traffic", "any", "any-blind").ratio) && St.pathRatio(runs, "hard-traffic", "any", "any-blind").pairs === 0);
}

console.log("\n2. THE SUMMARY");
{
    const runs = [
        run("hard-islands", 1, "any", { minClearance: 10, t: 100, path: 380 * 1.1, replans: 0, margin: 12 }), run("hard-islands", 2, "any", { minClearance: 20, t: 120, path: 380 * 1.3, margin: 8 }),
        run("hard-islands", 3, "any", { minClearance: -0.1, ...lose("collided"), margin: 12 }), run("hard-islands", 4, "any", { minClearance: -0.2, ...lose("collided"), margin: 12 }),
        run("hard-islands", 5, "any", { minClearance: 2, ...lose("timeout"), margin: 6 }), run("hard-islands", 6, "any", { minClearance: 3, ...lose("timeout"), margin: 6 }), run("hard-islands", 7, "any", { minClearance: 3.5, ...lose("timeout"), margin: 3 }),
        run("hard-islands", 8, "any", { minClearance: 4, ...lose("left"), margin: 3, noRoute: true }), run("hard-islands", 9, "any", { minClearance: 6, ...lose("broached"), margin: 12 }),
        run("hard-islands", 1, "any-blind", { path: 380 * 1.21 }), run("hard-islands", 2, "any-blind", { path: 380 * 1.3 }), run("hard-islands", 1, "straight", { margin: null, path: 380 }),
        run("hard-traffic", 1, "any+replan", { replans: 40 }), run("hard-traffic", 2, "any+replan", { replans: 50 }), run("hard-traffic", 3, "any+replan", { replans: 60 }), run("hard-traffic", 4, "any+replan", { replans: 100, ...lose("collided") }),
    ];
    const sum = safe(() => St.summarize(runs)), x = sum && sum.cells["hard-islands"].any;
    ok("!! a cell counts flights by status: of nine `any` flights in hard-islands 2 reached, 2 collided, 3 timed out, 1 left, 1 'other' (broached), 1 with no route, and the rate is reached/n (2 of 9)", !!x && x.n === 9 && x.reached === 2 && x.collided === 2 && x.timeout === 3 && x.left === 1 && x.other === 1 && near(x.rate, 2 / 9) && x.noRoute === 1);
    ok("!! the median clearance is over ALL the flights (-0.2, -0.1, 2, 3, 3.5, 4, 6, 10, 20: 3.5), the median path/chord and time over the ARRIVALS only (1.1 and 1.3: 1.2; 100 and 120 s: 110)", !!x && near(x.medianClearance, 3.5) && near(x.medianChord, 1.2, 1e-9) && near(x.medianTime, 110));
    ok("!! the margin rungs count the first plan's margin per flight (of the nine: four at 12, one at 8, two at 6, two at 3), a straight flight has none, the median replans over ALL flights (40, 50, 60, 100 -> 55; the arrivals alone would say 50)", !!x && same(x.margins, { 12: 4, 8: 1, 6: 2, 3: 2 }) && same(sum.cells["hard-islands"].straight.margins, { 12: 0, 8: 0, 6: 0, 3: 0 }) && sum.cells["hard-traffic"]["any+replan"].medianReplans === 55);
    ok("!! only the arms a kind flies get a cell, and only when they have flights (no hard-gaps cell, no `any+predict` in hard-traffic here); vsAny has no entry for `any` itself, and the others' ratio to it is the paired median (any-blind: 1.21 against 1.0 for seed 1 and 1.0 for seed 2 -> 1.105)",
        !!sum && sum.cells["hard-gaps"].any === undefined && sum.cells["hard-traffic"]["any+predict"] === undefined && sum.vsAny["hard-islands"].any === undefined && !!sum.vsAny["hard-islands"]["any-blind"] && sum.vsAny["hard-islands"]["any-blind"].pairs === 2 && near(sum.vsAny["hard-islands"]["any-blind"].ratio, (1.21 * 380 / 418 + 1.3 * 380 / (380 * 1.3)) / 2, 1e-6));
    ok("!! anyOverBlind is any's path over any-blind's in hard-islands (the reverse of vsAny's entry): 418/459.8 = 0.909 and 494/494 = 1.0: median 0.955, 2 pairs", safe(() => sum.anyOverBlind.pairs === 2 && near(sum.anyOverBlind.ratio, (418 / (380 * 1.21) + 1) / 2, 1e-6), false));
    const splitRuns = [
        run("hard-gaps", 1, "any", { gap: 24 }), run("hard-gaps", 2, "any", { gap: 24, ...lose("collided") }), run("hard-gaps", 3, "any", { gap: 32 }), run("hard-gaps", 4, "any", { gap: 40 }), run("hard-gaps", 5, "any", { gap: 40 }),
        run("hard-traffic", 1, "any", { shipSpeed: 2 }), run("hard-traffic", 2, "any", { shipSpeed: 2.01, ...lose("collided") }), run("hard-traffic", 3, "any", { shipSpeed: 3 }),
        run("hard-current", 1, "any", { currentMean: 1.0 }), run("hard-current", 2, "any", { currentMean: 1.01, ...lose("collided") }), run("hard-current", 3, "any", { currentMean: 0.2 }),
        run("hard-traffic", 4, "any", { currentMean: 1.5, shipSpeed: 2 }), run("hard-current", 4, "any", { shipSpeed: 3, currentMean: 0.1 }), run("hard-gaps", 6, "any", { shipSpeed: 3, currentMean: 2, gap: 24 }),
    ], sp = safe(() => St.summarize(splitRuns));
    ok("!! the gap split is by width (24 m: 2 of 3 and 1 hit; 32 m: 1 of 1; 40 m: 2 of 2)", safe(() => sp.gaps[24].any.reached === 2 && sp.gaps[24].any.n === 3 && sp.gaps[24].any.collided === 1 && sp.gaps[32].any.n === 1 && sp.gaps[40].any.reached === 2, false));
    ok("!! the ship split: a ship speed of exactly 2.0 is SLOW, above it fast (fast: 2 flights, 1 reached, 1 hit; slow: 2); it reads hard-traffic only (a gap or current flight with a ship speed is not counted)", safe(() => sp.ships.fast.any.n === 2 && sp.ships.fast.any.reached === 1 && sp.ships.fast.any.collided === 1 && sp.ships.slow.any.n === 2, false));
    ok("!! the current split: a mean of exactly 1.0 m/s is WEAK, above it strong (strong: 1 flight, hit; weak: 3 flights, all reached); it reads hard-current only", safe(() => sp.current.strong.any.n === 1 && sp.current.strong.any.collided === 1 && sp.current.weak.any.n === 3 && sp.current.weak.any.reached === 3, false));
}

console.log("\n3. THE VERDICT");
{
    const cell = (n, reached, o = {}) => ({ n, reached, rate: reached / n, collided: 0, left: 0, timeout: 0, other: 0, noRoute: 0, medianClearance: 5, medianChord: 1.05, medianTime: 120, medianReplans: 0, margins: { 12: n, 8: 0, 6: 0, 3: 0 }, ...o });
    const base = () => ({
        cells: {
            "hard-islands": { straight: cell(60, 10), "smooth+approach": cell(60, 55), any: cell(60, 57, { collided: 2 }), "any-blind": cell(60, 57, { collided: 1 }) },
            "hard-gaps": { straight: cell(60, 5), "smooth+approach": cell(60, 40), any: cell(60, 52) },
            "hard-traffic": { straight: cell(60, 3), "smooth+approach": cell(60, 30), any: cell(60, 32), "any+replan": cell(60, 40, { collided: 15 }), "any+predict": cell(60, 50, { collided: 8 }) },
            "hard-current": { straight: cell(60, 10), "smooth+approach": cell(60, 50), any: cell(60, 52), "any-blind": cell(60, 52) },
        },
        vsAny: {}, anyOverBlind: { ratio: 0.97, pairs: 50 },
        gaps: { 24: { any: { n: 20, reached: 15, collided: 5 } }, 32: { any: { n: 20, reached: 17, collided: 3 } }, 40: { any: { n: 20, reached: 20, collided: 0 } } }, ships: {}, current: {},
    });
    const jb = safe(() => St.judge(base()));
    ok("!! the base case passes every bar and every prediction: SUPPORTED, bars held in all four kinds, H1 to H8 held", !!jb && jb.verdict === "SUPPORTED" && jb.barsHeld.length === 4 && [jb.h1, jb.h2, jb.h3, jb.h4, jb.h5, jb.h6, jb.h7, jb.h8].every((v) => v === true));
    const mod = (f) => { const b = base(); f(b); return safe(() => St.judge(b)); };
    ok("!! the islands bar: 54 of 60 reached with 3 collisions HOLDS (the bar is inclusive); 53 of 60 fails; 54 with 4 collisions fails", mod((b) => { b.cells["hard-islands"].any = cell(60, 54, { collided: 3 }); }).bars["hard-islands"].pass === true && mod((b) => { b.cells["hard-islands"].any = cell(60, 53, { collided: 3 }); }).bars["hard-islands"].pass === false && mod((b) => { b.cells["hard-islands"].any = cell(60, 54, { collided: 4 }); }).bars["hard-islands"].pass === false);
    ok("!! the other bars are 80%: 48 of 60 holds in gaps, traffic and current; 47 fails -- each on its DESIGNATED arm (traffic: `any+predict`; a good `any+replan` does not rescue it)",
        mod((b) => { b.cells["hard-gaps"].any = cell(60, 48); }).bars["hard-gaps"].pass && !mod((b) => { b.cells["hard-gaps"].any = cell(60, 47); }).bars["hard-gaps"].pass && mod((b) => { b.cells["hard-traffic"]["any+predict"] = cell(60, 48); }).bars["hard-traffic"].pass && !mod((b) => { b.cells["hard-traffic"]["any+predict"] = cell(60, 47); b.cells["hard-traffic"]["any+replan"] = cell(60, 60); }).bars["hard-traffic"].pass &&
        mod((b) => { b.cells["hard-current"].any = cell(60, 48); }).bars["hard-current"].pass && !mod((b) => { b.cells["hard-current"].any = cell(60, 47); }).bars["hard-current"].pass);
    const fail = (kind, arm) => (b) => { b.cells[kind][arm] = cell(60, 20); };
    ok("!! the verdict rule: all four bars SUPPORTED; islands + at least one other PARTLY (islands + gaps only; islands + current only); islands alone NOT; islands failing with the other three passing NOT; none NOT",
        mod(() => {}).verdict === "SUPPORTED" && mod((b) => { fail("hard-traffic", "any+predict")(b); }).verdict === "PARTLY SUPPORTED" && mod((b) => { fail("hard-traffic", "any+predict")(b); fail("hard-current", "any")(b); }).verdict === "PARTLY SUPPORTED" && mod((b) => { fail("hard-traffic", "any+predict")(b); fail("hard-gaps", "any")(b); }).verdict === "PARTLY SUPPORTED" &&
        mod((b) => { fail("hard-traffic", "any+predict")(b); fail("hard-gaps", "any")(b); fail("hard-current", "any")(b); }).verdict === "NOT SUPPORTED" && mod(fail("hard-islands", "any")).verdict === "NOT SUPPORTED" && mod((b) => { for (const [k, a] of Object.entries(H.DESIGNATED)) fail(k, a)(b); }).verdict === "NOT SUPPORTED");
    ok("!! the barsHeld list names the kinds that held (in kind order)", same(mod(fail("hard-gaps", "any")).barsHeld, ["hard-islands", "hard-traffic", "hard-current"]));
    ok("!! a missing designated arm is a failed bar, not a crash (no `any+predict` cell: traffic fails, the others are read)", (() => { const j = mod((b) => { delete b.cells["hard-traffic"]["any+predict"]; }); return !!j && j.bars["hard-traffic"].pass === false && j.bars["hard-islands"].pass === true && j.verdict === "PARTLY SUPPORTED"; })());
    ok("!! H1: straight at most 30% in EVERY kind (18 of 60 holds, 19 fails, in any one kind)", mod((b) => { b.cells["hard-gaps"].straight = cell(60, 18); }).h1 === true && mod((b) => { b.cells["hard-gaps"].straight = cell(60, 19); }).h1 === false && mod((b) => { b.cells["hard-current"].straight = cell(60, 19); }).h1 === false && mod((b) => { b.cells["hard-islands"].straight = cell(60, 19); }).h1 === false && mod((b) => { b.cells["hard-traffic"].straight = cell(60, 19); }).h1 === false);
    ok("!! H2: `any` reaches at least as many as smooth+approach in EVERY kind (equal holds; one fewer in one kind fails)", mod((b) => { b.cells["hard-gaps"]["smooth+approach"] = cell(60, 52); }).h2 === true && mod((b) => { b.cells["hard-gaps"]["smooth+approach"] = cell(60, 53); }).h2 === false && mod((b) => { b.cells["hard-traffic"]["smooth+approach"] = cell(60, 33); }).h2 === false && mod((b) => { b.cells["hard-traffic"]["smooth+approach"] = cell(60, 32); }).h2 === true && mod((b) => { b.cells["hard-current"]["smooth+approach"] = cell(60, 53); }).h2 === false && mod((b) => { b.cells["hard-islands"]["smooth+approach"] = cell(60, 58); }).h2 === false);
    ok("!! H3: any's path over any-blind's at most 1.00 (1.00 holds, 1.01 fails, NaN fails) AND at most 2 more collisions than any-blind (2 more holds, 3 more fails)", mod((b) => { b.anyOverBlind = { ratio: 1.0, pairs: 5 }; }).h3 === true && mod((b) => { b.anyOverBlind = { ratio: 1.01, pairs: 5 }; }).h3 === false && mod((b) => { b.anyOverBlind = { ratio: NaN, pairs: 0 }; }).h3 === false &&
        mod((b) => { b.cells["hard-islands"].any = cell(60, 57, { collided: 3 }); }).h3 === true && mod((b) => { b.cells["hard-islands"].any = cell(60, 57, { collided: 4 }); }).h3 === false);
    ok("!! H4 on missing data: a gap width with no flights reads NaN and the prediction is MISSED, never held on a zero (24 m absent: 32 and 40 alone do not make a monotone series)", mod((b) => { delete b.gaps[24]; }).h4 === false && mod((b) => { delete b.gaps[40]; }).h4 === false && mod((b) => { b.gaps[24] = {}; }).h4 === false);
    ok("!! H4: reach at 24 <= 32 <= 40 m and at least 90% at 40 m (equal steps hold; 24 above 32 fails; 32 above 40 fails; 17 of 20 at 40 fails)", mod((b) => { b.gaps[24].any = { n: 20, reached: 18, collided: 0 }; b.gaps[32].any = { n: 20, reached: 18, collided: 0 }; b.gaps[40].any = { n: 20, reached: 18, collided: 0 }; }).h4 === true && mod((b) => { b.gaps[24].any = { n: 20, reached: 19, collided: 0 }; }).h4 === false && mod((b) => { b.gaps[32].any = { n: 20, reached: 19, collided: 0 }; b.gaps[40].any = { n: 20, reached: 18, collided: 0 }; }).h4 === false &&
        mod((b) => { b.gaps[24].any = { n: 20, reached: 5, collided: 0 }; b.gaps[32].any = { n: 20, reached: 10, collided: 0 }; b.gaps[40].any = { n: 20, reached: 17, collided: 0 }; }).h4 === false && same(jb.gapRates, [0.75, 0.85, 1]));
    ok("!! H5: replan beats the frozen plan by at least 5 (40 against 35 holds, against 36 fails), predict at least replan (equal holds, one fewer fails), predict's collisions at most replan's (equal holds, one more fails)", mod((b) => { b.cells["hard-traffic"].any = cell(60, 35); }).h5 === true && mod((b) => { b.cells["hard-traffic"].any = cell(60, 36); }).h5 === false &&
        mod((b) => { b.cells["hard-traffic"]["any+predict"] = cell(60, 40, { collided: 15 }); }).h5 === true && mod((b) => { b.cells["hard-traffic"]["any+predict"] = cell(60, 39, { collided: 8 }); }).h5 === false && mod((b) => { b.cells["hard-traffic"]["any+predict"] = cell(60, 50, { collided: 16 }); }).h5 === false && mod((b) => { b.cells["hard-traffic"]["any+predict"] = cell(60, 50, { collided: 15 }); }).h5 === true);
    ok("!! H6: any reaches STRICTLY fewer in hard-current than in hard-islands (equal fails)", mod((b) => { b.cells["hard-current"].any = cell(60, 56); }).h6 === true && mod((b) => { b.cells["hard-current"].any = cell(60, 57); }).h6 === false);
    ok("!! H7: no field arm has more than 3 noRoute scenarios in any kind (3 holds, 4 fails; a straight arm is not a field arm and is not read)", mod((b) => { b.cells["hard-gaps"]["smooth+approach"] = cell(60, 40, { noRoute: 3 }); }).h7 === true && mod((b) => { b.cells["hard-gaps"]["smooth+approach"] = cell(60, 40, { noRoute: 4 }); }).h7 === false && mod((b) => { b.cells["hard-traffic"]["any+predict"] = cell(60, 50, { noRoute: 4 }); }).h7 === false && mod((b) => { b.cells["hard-gaps"].straight = cell(60, 5, { noRoute: 9 }); }).h7 === true);
    ok("!! H8: no field arm ever left the region (one `left` in any field arm of any kind fails; straight leaving is not read)", mod((b) => { b.cells["hard-current"]["any-blind"] = cell(60, 52, { left: 1 }); }).h8 === false && mod((b) => { b.cells["hard-traffic"]["any+replan"] = cell(60, 40, { left: 1 }); }).h8 === false && mod((b) => { b.cells["hard-gaps"].straight = cell(60, 5, { left: 3 }); }).h8 === true);
}

console.log("\n4. THE TEXT");
{
    const runs = [run("hard-islands", 1, "any"), run("hard-islands", 1, "straight", { margin: null, ...lose("collided") }), run("hard-gaps", 1, "any", { gap: 24 })];
    const sum = St.summarize(runs), txt = St.table(sum, "A TITLE");
    ok("!! the table prints the counts in their columns: collided, left, timeout, noRoute (2, 1, 3, 1 for the nine `any` flights of hard-islands), the median clearance 3.50 and the rungs 4/1/2/2", (() => { const rs2 = []; for (let i = 0; i < 2; i++) rs2.push(run("hard-islands", i + 1, "any")); for (let i = 0; i < 2; i++) rs2.push(run("hard-islands", 3 + i, "any", lose("collided"))); for (let i = 0; i < 3; i++) rs2.push(run("hard-islands", 5 + i, "any", lose("timeout"))); rs2.push(run("hard-islands", 8, "any", lose("left", { noRoute: true }))); rs2.push(run("hard-islands", 9, "any", lose("broached"))); const line = St.table(St.summarize(rs2), "T").split("\n").find((l) => /^hard-islands\s+\| any\s/.test(l)) || ""; return /\| 2\/9 22%\s+\|\s+2\s+1\s+3\s+1 \|/.test(line); })());
    ok("!! the table has the title first, a header, a line for each (kind, arm) that has flights, and the three splits", txt.split("\n")[0] === "A TITLE" && /^kind /.test(txt.split("\n")[1]) && /hard-islands\s+\| any\s+\| 1\/1 100%/.test(txt) && /hard-islands\s+\| straight\s+\| 0\/1 0%/.test(txt) && /hard-gaps\s+\| any/.test(txt) && !/hard-traffic\s+\|/.test(txt) && /hard-gaps by width/.test(txt) && /24 m: any 1\/1/.test(txt) && /hard-traffic by the fastest ship/.test(txt) && /hard-current by the mean current/.test(txt));
    const j = St.judge(sum), vt = St.verdictText(j);
    ok("!! the verdict line is in capitals: VERDICT: SUPPORTED, PARTLY SUPPORTED or NOT SUPPORTED, with the kinds that held", /^VERDICT: (SUPPORTED|PARTLY SUPPORTED|NOT SUPPORTED)/m.test(St.verdictText(St.judge(St.summarize(runs)))));
    ok("!! the verdict block names every kind with its designated arm, the bar and the result, H1 to H8 each HELD or MISSED, and ends on VERDICT with the kinds whose bars held", H_all(vt) && /^VERDICT: /m.test(vt) && /hard-islands: any reaches 100%/.test(vt) && /hard-traffic: any\+predict reaches n\/a/.test(vt) && /\(bar 90%, at most 3 collisions; it has 0\): HELD/.test(vt) && vt.split("\n").pop().startsWith("VERDICT: ") );
    function H_all(t) { return ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"].every((h) => new RegExp("^" + h + " .*: (HELD|MISSED)$", "m").test(t)); }
}

console.log("\n5. THE COMMAND");
{
    const call = (argv) => { const o = [], e = [], w = []; const code = safe(() => St.command(argv, { out: (m) => o.push(m), err: (m) => e.push(m), writeFile: (p, c) => w.push([p, c]) }), -1); return { code, out: o.join("\n"), err: e.join("\n"), w }; };
    ok("!! a bad argument is exit 2 with a message naming it: an unknown flag, --set with an unknown name, --seeds that is not a positive whole number (0, 2.5, none), and --write with the DEV set", call(["--bogus"]).code === 2 && /unknown argument "--bogus"/.test(call(["--bogus"]).err) && call(["--set", "held"]).code === 2 && /--set needs one of dev, held4/.test(call(["--set", "held"]).err) && call(["--seeds", "0"]).code === 2 && call(["--seeds", "2.5"]).code === 2 && call(["--seeds"]).code === 2 && /--seeds needs a positive whole number/.test(call(["--seeds", "0"]).err) && call(["--write"]).code === 2 && /--write goes with --set held4 only/.test(call(["--write"]).err) && call(["--set", "dev", "--write"]).code === 2);
    const d = call(["--set", "dev", "--seeds", "2"]);
    ok("!! a DEV run with two seeds per kind: exit 0, the first line names the set and the counts, ALL EIGHT scenarios are flown (the table says 2 flights of `any` in every kind), the table and the verdict block are printed, nothing is written", d.code === 0 && /^DEV set: 2 scenarios of each of 4 kinds/.test(d.out) && /hard-islands\s+\| any\s+\| \d\/2 / .test(d.out) && /hard-traffic\s+\| any\+predict\s+\| \d\/2 /.test(d.out) && /kind\s+\| arm/.test(d.out) && /VERDICT: /.test(d.out) && d.w.length === 0 && d.err === "");
    const w = call(["--set", "held4", "--seeds", "1", "--write"]);
    const lines = w.w.length ? w.w[0][1].trim().split("\n").map((l) => JSON.parse(l)) : [];
    ok("!! --write with held4 puts one JSON line a flight in brain/subHardNavHeld4.jsonl (16 flights for one seed of each kind: 4 + 3 + 5 + 4), each tagged set 'held4', seed 401, and says so", w.code === 0 && w.w.length === 1 && w.w[0][0].endsWith("brain/subHardNavHeld4.jsonl") && lines.length === 16 && lines.every((r) => r.set === "held4" && r.seed === 401) && /wrote 16 flights to brain\/subHardNavHeld4\.jsonl/.test(w.out) && H.HARD_KINDS.every((k) => lines.filter((r) => r.kind === k).length === H.ARMS_OF[k].length));
    const real = (() => { const sc = H.hardScenario(401, "hard-islands"), f = H.flyHard(St.pilot, sc, "any"); return lines.find((r) => r.kind === "hard-islands" && r.arm === "any" && r.seed === 401) && f; })();
    const rec = lines.find((r) => r.kind === "hard-islands" && r.arm === "any");
    ok("!! the flights in the file are the library's own flights of the HELD4 scenarios on the PD autopilot (hard-islands 401, any: the same status, ticks, time and path as a direct flyHard)", !!rec && !!real && rec.status === real.status && rec.ticks === real.ticks && near(rec.path, real.path, 1e-9) && (rec.t === real.t));
    ok("!! the study's pilot is the PD autopilot: for a state, a target and a CURRENT it returns what AP.decide returns (and the current matters to it)", (() => { const s = S.createState({ pos: [0, 0, -25], speed: 3, heading: 0, pitch: 0, bank: 0, gamma: 0, w: [0, 0, 0], model: S.createSubModel(Object.freeze({ ...S.EXPLORER, seabed: 1000 })) }), t = { depth: 30, heading: 0.3, speed: 3 }, c = [0.8, -0.6, 0.1]; return same(St.pilot(s, t, c), AP.decide(s, t, c)) && !same(St.pilot(s, t, c), AP.decide(s, t, [0, 0, 0])); })());
    ok("!! the output file is a constant: brain/subHardNavHeld4.jsonl; the thresholds are 0.3 straight, 5 for the replan gain, 3 noRoute, 0.9 at the widest gap, 2 extra collisions against blind", St.OUT === "brain/subHardNavHeld4.jsonl" && same(St.THRESH, { straightMax: 0.3, replanGain: 5, noRouteMax: 3, gapTop: 0.9, blindExtraCollisions: 2 }));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
