// WebGLEngine/tools/ship/subFieldNavStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subFieldNavStudy-selfcheck.mjs      (~20 s)
//
// THE STUDY COMMAND OF FLOW-FIELD WAYPOINTS FOR THE SUBMARINE (tools/ship/subFieldNavStudy.mjs), held to the registration (brain/SUB_FIELD_NAV_WIP.md and its Amendment 1) BEFORE the HELD set is flown. The verdict rule is the thing that must not be wrong:
// a study that reads its own result with an off-by-one threshold reports the wrong verdict in good faith.
//   1  THE MEDIAN      odd, even (the mean of the middle two), unsorted, empty (NaN), and the input list is not reordered
//   2  THE SUMMARY     counts by status (reached, collided, left, timeout, other), the no-route count, the median clearance, the median path ratio against the straight arm on the scenarios BOTH reach (null for the straight arm), and the straight arm's
//                      blocked / unblocked counts in still water
//   3  THE JUDGEMENT   R1 to R5 and the verdict from a summary: every threshold is inclusive and every one is tested on both sides (R2: 90% still and 80% current; R3: 1.10 smooth and 1.15 cell; R1: 25% and 90%), SUPPORTED / PARTLY SUPPORTED / NOT SUPPORTED
//                      each reached by a summary built to reach it, R4's NaN, R5 read as BOTH field arms
//   4  THE MARGIN      the sweep's rule: the highest mean success over the field arms; ties go to the smaller margin; the straight arm is not counted
//   5  THE TEXT        a line for every (kind, arm), n/a for a number that is not there, '-' for the straight arm's ratio, the verdict block names the arms
//   6  THE COMMAND     bad arguments (exit 2, named, nothing flown), the sweep, the dev set, the held set at the primary AND the registered margin (a margin of 6 asked for is ONE read), --write only with the held set and what it writes, the defaults
//
// SABOTAGE LOG -- NINETY-FIVE mutants of tools/ship/subFieldNavStudy.mjs, each run against a copy of this gate, 4 at a time. 91 RED BY NAME on the final run (rows in brackets), ONE EQUIVALENT (S85):
//   S01 primary margin [3]; S02 registered margin [3]; S03 out path [1]; S04 r2 still [1]; S05 r2 current [1]; S06 r1 blocked [1]; S07 r1 unblocked [1]; S08 r3 smooth [2]; S09 r3 cell [2]; S10 median even [2]; S11
//   median unsorted [3]; S12 median mutates [1]; S13 median empty [1]; S14 median lexicographic [1]; S16 summary key [2]; S17 straight by arm [5]; S18 pairs need straight reached [1]; S19 pairs need arm reached
//   [3]; S20 ratio inverted [4]; S21 ratio mean [1]; S22 ratio no pairs [3]; S23 straight ratio [2]; S24 other count [1]; S25 other includes timeout [1]; S26 noRoute count [1]; S27 clearance mean [2]; S28 collided
//   count [3]; S29 skip empty cell [2]; S30 blocked still only [3]; S31 blocked arm [3]; S32 blocked split [3]; S33 unblocked split [2]; S34 r1 null [2]; S35 r1 blocked inclusive [1]; S36 r1 unblocked inclusive
//   [1]; S37 r1 and to or [1]; S38 r2 still inclusive [1]; S39 r2 current inclusive [1]; S40 r2 current from still [2]; S41 r2 and to or [3]; S42 r3 bound swap [2]; S43 r3 inclusive [1]; S44 r3 nan [2]; S45 r3 kind
//   [5]; S46 verdict supported [3]; S47 verdict partly [3]; S48 both needs r3 [6]; S49 r2only [6]; S50 r4 direction [1]; S51 r4 strict [1]; S52 r4 one kind [1]; S54 r5 any [1]; S55 r5 direction [1]; S56 r5
//   inclusive [1]; S57 margin tie [2]; S58 margin order [1]; S59 margin counts straight [1]; S60 margin nan [1]; S61 margin lowest [1]; S63 f2 [2]; S64 table straight ratio [1]; S65 table pairs [1]; S66 table skips
//   [1]; S67 table blocked line [1]; S68 verdict text r1 null [1]; S69 verdict text bound [1]; S70 verdict text arms [1]; S71 arg set check [2]; S72 arg margin zero [2]; S73 arg seeds integer [1]; S74 arg unknown
//   [1]; S75 write guard [2]; S76 write guard held [1]; S77 seeds limit [4]; S78 sweep set [1]; S79 sweep arms [1]; S80 sweep margin [1]; S81 held two margins [2]; S82 held dedupe [1]; S83 dev secondary [1]; S84
//   role [1]; S86 title secondary [1]; S87 write count [1]; S88 write not done [1]; S89 write path [1]; S90 default set [1]; S91 default margin [3]; S92 pilot [3]; S93 exit code [2]; S94 header line [2]; S95 sweep
//   M star line [1]
//   S85 (the --write record's `set` field written as the constant 'held' instead of the option) is an EQUIVALENT MUTANT, left standing and said: --write is refused for every set but the held one, so the field is 'held' either way.
//   ON THE FIRST RUN SIXTEEN WENT 0 RED and the gate grew what separated them (three more were dead code and were cut: the empty-list guard of the rate, the NaN guard of R4 -- a NaN compares false, which IS a miss -- and the NaN guard of the percentage printer): S21 (the median against the mean) had two
//   path ratios whose median and mean agree, so the summary data has three that do not (1.2, 1.15, 1.5); S25 and S33 had no timeout counted 'other' and no blocked scenario the straight arm reached; S67 printed 'blocked 0/0, unblocked 1/1' which reads the same reversed; S70 had no row on the words after
//   the verdict; S71 and S76 died of a thrown error or were masked by another refusal (every command call is wrapped now, and --write with --sweep is also tried on the held set); S78, S79, S80 and S92 flew the wrong set, the wrong arms, the wrong margin or the wrong pilot and the rows compared the command with
//   the library under the command's OWN pilot (the gate keeps its own autopilot, evaluates the same scenarios itself and compares the sweep line for line); S89 wrote to a relative path (the row wants an absolute one).
"use strict";
import * as T from "./subFieldNavStudy.mjs";
import * as N from "../../brain/subFieldNav.mjs";
import * as AP from "../../brain/autopilotSub.mjs";
import path from "node:path";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
console.log("subFieldNavStudy-selfcheck -- the study command of flow-field waypoints\n");

console.log("1. THE MEDIAN");
{
    const xs = [5, 1, 3];
    ok("!! median: odd count is the middle (5,1,3 -> 3), even count the mean of the middle two (4,1,3,2 -> 2.5), one value is itself, empty is NaN, and the input list is NOT reordered", T.median(xs) === 3 && xs.join() === "5,1,3" && T.median([4, 1, 3, 2]) === 2.5 && T.median([7]) === 7 && Number.isNaN(T.median([])) && T.median([2, 2, 10, 10]) === 6);
}

console.log("\n2. THE SUMMARY");
const run = (kind, seed, arm, status, extra = {}) => ({ kind, seed, arm, status, reached: status === "reached", blocked: false, path: 300, minClearance: 10, noRoute: false, ...extra });
{
    const runs = [
        // nav: three scenarios. straight reaches 1 (seed 1, path 300), collides 2 (one blocked), reaches 3 (path 200)
        run("nav", 1, "straight", "reached", { path: 300 }), run("nav", 2, "straight", "collided", { blocked: true, minClearance: -1 }), run("nav", 3, "straight", "reached", { path: 200 }),
        run("nav", 1, "field-cell", "reached", { path: 330, minClearance: 8 }), run("nav", 2, "field-cell", "reached", { path: 400, minClearance: 6, blocked: true }), run("nav", 3, "field-cell", "timeout", { path: 250, minClearance: 12 }),
        run("nav", 1, "field-smooth", "reached", { path: 360, minClearance: 9 }), run("nav", 2, "field-smooth", "left", { blocked: true, minClearance: 20 }), run("nav", 3, "field-smooth", "reached", { path: 230, minClearance: 11 }),
        run("nav", 4, "straight", "reached", { path: 100 }), run("nav", 4, "field-cell", "timeout", { path: 90, minClearance: 12 }), run("nav", 4, "field-smooth", "reached", { path: 150, minClearance: 9 }),
        run("nav", 5, "straight", "reached", { path: 100, blocked: true }),
        run("nav-current", 1, "field-smooth", "broached", { noRoute: true }), run("nav-current", 2, "field-smooth", "reached"), run("nav-current", 1, "straight", "collided"),
    ];
    runs[1].blocked = true;
    const sum = T.summarize(runs), c = sum.cells;
    ok("!! straight in nav: 5 flights, 4 reached (rate 4/5), 1 collided, none left or timed out or other, no 'noRoute', the median clearance of its five (10, -1, 10, 10, 10 -> 10), and NO path ratio (null: it is the reference)", c.nav.straight.n === 5 && c.nav.straight.reached === 4 && near(c.nav.straight.rate, 4 / 5) && c.nav.straight.collided === 1 && c.nav.straight.left === 0 && c.nav.straight.timeout === 0 && c.nav.straight.other === 0 && c.nav.straight.noRoute === 0 && c.nav.straight.medianClearance === 10 && c.nav.straight.medianPathRatio === null && c.nav.straight.pairs === 0);
    ok("!! field-cell in nav: 2 of 4 reached, 2 timed out (and none counted as 'other'); the median path ratio is over the scenarios BOTH it and straight reached -- only seed 1 (330 / 300 = 1.1); seed 2 (straight collided) and seeds 3 and 4 (it timed out) do not count -- so 1.1 from 1 pair; median clearance of 8, 6, 12, 12 is 10", c.nav["field-cell"].n === 4 && c.nav["field-cell"].reached === 2 && c.nav["field-cell"].timeout === 2 && c.nav["field-cell"].other === 0 && near(c.nav["field-cell"].medianPathRatio, 1.1) && c.nav["field-cell"].pairs === 1 && c.nav["field-cell"].medianClearance === 10);
    ok("!! field-smooth in nav: reached seeds 1, 3 and 4 (all also reached by straight): the ratios are 360 / 300 = 1.2, 230 / 200 = 1.15 and 150 / 100 = 1.5, MEDIAN 1.2 (not their mean, 1.28) from 3 pairs; one 'left' is counted as left and not as reached or collided", c.nav["field-smooth"].reached === 3 && c.nav["field-smooth"].left === 1 && c.nav["field-smooth"].collided === 0 && near(c.nav["field-smooth"].medianPathRatio, 1.2) && c.nav["field-smooth"].pairs === 3);
    ok("!! a status that is none of the four (a vessel's own: 'broached') is counted as OTHER, a 'noRoute' flight is counted in noRoute, and a kind with a different arm set is summarised on its own (nav-current has no field-cell and its straight arm has no pair)", c["nav-current"]["field-smooth"].other === 1 && c["nav-current"]["field-smooth"].noRoute === 1 && c["nav-current"]["field-smooth"].reached === 1 && c["nav-current"]["field-cell"] === undefined && c["nav-current"].straight.collided === 1 && c["nav-current"]["field-smooth"].pairs === 0 && Number.isNaN(c["nav-current"]["field-smooth"].medianPathRatio));
    ok("!! the straight arm's blocked / unblocked counts are for STILL WATER only, and each side counts its own: blocked 2 flights (seed 2 collided, seed 5 reached: 1 reached), unblocked 3 (seeds 1, 3 and 4, all reached: 3); the current kind's straight flight is not in them", JSON.stringify(sum.straightBlocked.nav) === JSON.stringify({ blocked: { n: 2, reached: 1 }, unblocked: { n: 3, reached: 3 } }));
    ok("!! the table says it the right way round: 'blocked 1/2, unblocked 3/3' (reached over flights), and the text of a SUPPORTED judgement carries its arm", T.table(sum, "T").includes("straight in still water: blocked 1/2, unblocked 3/3"));
}

console.log("\n3. THE JUDGEMENT");
{
    // a summary built directly: spec = { nav: [rate, ratio, clearance], cur: [rate, clearance] } for each field arm
    const cell = (rate, ratio, clr, n = 100) => ({ n, reached: Math.round(rate * n), rate, collided: 0, left: 0, timeout: 0, other: 0, noRoute: 0, medianClearance: clr, medianPathRatio: ratio, pairs: 50 });
    const mk = (spec, sb = { blocked: { n: 10, reached: 2 }, unblocked: { n: 10, reached: 10 } }) => ({ cells: { nav: { "field-cell": cell(...spec.cellNav), "field-smooth": cell(...spec.smoothNav) }, "nav-current": { "field-cell": cell(...spec.cellCur), "field-smooth": cell(...spec.smoothCur) } }, straightBlocked: { nav: sb } });
    const good = { cellNav: [0.5, 1.5, 5], smoothNav: [0.95, 1.05, 8], cellCur: [0.5, null, 4], smoothCur: [0.9, null, 7] };
    let j = T.judge(mk(good));
    ok("!! SUPPORTED: field-smooth holds R2 (95% still, 90% current) and R3 (median ratio 1.05 <= 1.10); field-cell holds neither; the verdict names the arm that earned it", j.verdict === "SUPPORTED" && j.supportedBy.join() === "field-smooth" && j.arms["field-smooth"].r2 && j.arms["field-smooth"].r3 && !j.arms["field-cell"].r2 && j.r2by.join() === "field-smooth");
    j = T.judge(mk({ ...good, smoothNav: [0.95, 1.2, 8] }));
    ok("!! PARTLY SUPPORTED: R2 holds for field-smooth but its median ratio 1.2 is over 1.10 -- it gets there by a longer way than it should; and field-cell does not rescue it", j.verdict === "PARTLY SUPPORTED" && j.supportedBy.length === 0 && j.r2by.join() === "field-smooth" && !j.arms["field-smooth"].r3);
    j = T.judge(mk({ ...good, smoothNav: [0.85, 1.05, 8], smoothCur: [0.9, null, 7] }));
    ok("!! NOT SUPPORTED: 85% in still water misses R2 for both arms", j.verdict === "NOT SUPPORTED" && j.supportedBy.length === 0 && j.r2by.length === 0);
    const edge = (o) => T.judge(mk({ ...good, ...o }));
    ok("!! R2's thresholds are INCLUSIVE and each side is tested: exactly 90% still and 80% current holds; 89% still misses; 79% current misses", edge({ smoothNav: [0.9, 1.05, 8], smoothCur: [0.8, null, 7] }).arms["field-smooth"].r2 === true && edge({ smoothNav: [0.89, 1.05, 8] }).arms["field-smooth"].r2 === false && edge({ smoothCur: [0.79, null, 7] }).arms["field-smooth"].r2 === false);
    ok("!! R3's bounds are INCLUSIVE and DIFFER by arm: smooth 1.10 holds and 1.101 misses; cell 1.15 holds and 1.151 misses (and a cell at 1.12 misses as a SMOOTH arm would not)", edge({ smoothNav: [0.95, 1.1, 8] }).arms["field-smooth"].r3 === true && edge({ smoothNav: [0.95, 1.101, 8] }).arms["field-smooth"].r3 === false && edge({ cellNav: [0.95, 1.15, 5], cellCur: [0.9, null, 4] }).arms["field-cell"].r3 === true && edge({ cellNav: [0.95, 1.151, 5] }).arms["field-cell"].r3 === false && edge({ cellNav: [0.95, 1.12, 5], cellCur: [0.9, null, 4] }).arms["field-cell"].r3 === true && edge({ smoothNav: [0.95, 1.12, 8] }).arms["field-smooth"].r3 === false);
    ok("!! a missing ratio (NaN: no scenario both reached) FAILS R3, it is not a pass", edge({ smoothNav: [0.95, NaN, 8] }).arms["field-smooth"].r3 === false && edge({ smoothNav: [0.95, NaN, 8] }).verdict === "PARTLY SUPPORTED");
    ok("!! a verdict is by the arm that holds BOTH: field-cell with R2 and R3 supports it even when smooth has R2 only", (() => { const x = edge({ cellNav: [0.95, 1.1, 5], cellCur: [0.85, null, 4], smoothNav: [0.95, 1.3, 8] }); return x.verdict === "SUPPORTED" && x.supportedBy.join() === "field-cell" && x.r2by.join() === "field-cell,field-smooth"; })());
    const vtxt = (x) => T.verdictText(x);
    ok("!! the verdict line carries what earned it: 'VERDICT: SUPPORTED (by field-smooth)', 'VERDICT: PARTLY SUPPORTED (R2 held for field-smooth)', and 'VERDICT: NOT SUPPORTED' with nothing after it", /VERDICT: SUPPORTED \(by field-smooth\)$/.test(vtxt(T.judge(mk(good)))) && /VERDICT: PARTLY SUPPORTED \(R2 held for field-smooth\)$/.test(vtxt(T.judge(mk({ ...good, smoothNav: [0.95, 1.2, 8] })))) && /VERDICT: NOT SUPPORTED$/.test(vtxt(T.judge(mk({ ...good, smoothNav: [0.85, 1.05, 8] })))));
    ok("!! R1: straight fails the blocked and passes the unblocked at 2/10 and 10/10 (true); exactly 25% of the blocked (inclusive) holds; 30% misses; 80% of the unblocked misses, 90% holds (inclusive); no blocked or no unblocked scenario is null, not a pass", j.r1 === true && T.judge(mk(good, { blocked: { n: 8, reached: 2 }, unblocked: { n: 10, reached: 9 } })).r1 === true && T.judge(mk(good, { blocked: { n: 10, reached: 3 }, unblocked: { n: 10, reached: 10 } })).r1 === false && T.judge(mk(good, { blocked: { n: 10, reached: 2 }, unblocked: { n: 10, reached: 8 } })).r1 === false && T.judge(mk(good, { blocked: { n: 0, reached: 0 }, unblocked: { n: 10, reached: 10 } })).r1 === null && T.judge(mk(good, { blocked: { n: 10, reached: 2 }, unblocked: { n: 0, reached: 0 } })).r1 === null);
    ok("!! R4: smooth's median clearance at least cell's in BOTH kinds holds (8 vs 5 and 7 vs 4; equal is a hold); one kind the other way, or a missing clearance (NaN), misses", T.judge(mk(good)).r4 === true && edge({ smoothNav: [0.95, 1.05, 5], cellNav: [0.5, 1.5, 5] }).r4 === true && edge({ smoothCur: [0.9, null, 3] }).r4 === false && edge({ smoothNav: [0.95, 1.05, NaN] }).r4 === false);
    ok("!! R5 is read as BOTH field arms doing worse in current than in still water: here cell 0.5 -> 0.5 is NOT worse, so it misses; with both lower it holds; one arm better in current misses", T.judge(mk(good)).r5 === false && edge({ cellCur: [0.4, null, 4], smoothCur: [0.9, null, 7] }).r5 === true && edge({ cellCur: [0.4, null, 4], smoothCur: [0.99, null, 7] }).r5 === false);
}

console.log("\n4. THE MARGIN");
{
    const fr = (reached, n) => Array.from({ length: n }, (_, i) => ({ arm: i % 2 ? "field-cell" : "field-smooth", reached: i < reached }));
    const pick = T.chooseMargin({ 6: fr(5, 10), 12: fr(8, 10), 18: fr(8, 10), 24: fr(7, 10) });
    ok("!! the highest mean success wins and a TIE goes to the SMALLER margin (12 and 18 tie at 0.8: 12)", pick.margin === 12 && near(pick.means[12], 0.8) && near(pick.means[6], 0.5) && near(pick.means[24], 0.7));
    ok("!! the keys are read as numbers, not text (a margin of 6 against 12 against 30 is ordered 6, 12, 30; as text '30' would sort before '6')", T.chooseMargin({ 30: fr(9, 10), 6: fr(9, 10), 12: fr(9, 10) }).margin === 6);
    const mixed = [...fr(5, 10), { arm: "straight", reached: true }, { arm: "straight", reached: true }, { arm: "straight", reached: true }];
    ok("!! the STRAIGHT arm is not counted in a margin's mean (5 of 10 field flights is 0.5 whatever the straight arm did)", near(T.chooseMargin({ 6: mixed }).means[6], 0.5));
    ok("!! a margin with no field flights (NaN) is never picked", T.chooseMargin({ 6: [], 12: fr(1, 10) }).margin === 12 && T.chooseMargin({ 6: [] }).margin === null);
}

console.log("\n5. THE TEXT");
{
    const runs = [run("nav", 1, "straight", "reached"), run("nav", 1, "field-cell", "reached", { path: 330 }), run("nav", 1, "field-smooth", "collided", { minClearance: -0.5 }), run("nav-current", 1, "straight", "reached"), run("nav-current", 1, "field-cell", "timeout")];
    const txt = T.table(T.summarize(runs), "TITLE LINE"), lines = txt.split("\n");
    ok("!! the table starts with its title and a header, has a line for every (kind, arm) there is data for (5 here: nav x 3, nav-current x 2), the straight arm's ratio column is '-', the numbers are rounded (a ratio of 1.1 reads 1.10, a clearance of -0.5 reads -0.50), and a ratio that does not exist reads n/a", lines[0] === "TITLE LINE" && /^kind /.test(lines[1]) && lines.filter((l) => /^nav(-current)? +\| (straight|field)/.test(l)).length === 5 && /\| - +\|/.test(lines.find((l) => /^nav +\| straight/.test(l))) && /1\.10 \(1\)/.test(lines.find((l) => /^nav +\| field-cell/.test(l))) && /-0\.50$/.test(lines.find((l) => /^nav +\| field-smooth/.test(l))) && /n\/a \(0\)/.test(lines.find((l) => /^nav-current +\| field-cell/.test(l))) && /reached +\|/.test(lines[1]) && /straight in still water: blocked 0\/0, unblocked 1\/1/.test(txt));
    ok("the reached column reads 'count/n percent' (1/1 100%), and a rate with no flights reads n/a", /1\/1 100%/.test(txt) && T.table(T.summarize([]), "T").includes("straight in still water: blocked 0/0, unblocked 0/0"));
    const jt = T.verdictText(T.judge(T.summarize(runs)));
    ok("!! the verdict block has a line for R1, for each field arm (R2 and R3 with the number and the bound), R4, R5 and the VERDICT; it says MISSED where it missed and 'n/a (no blocked or no unblocked scenario)' where R1 cannot be read", /^R1 straight fails the blocked, passes the unblocked: n\/a/.test(jt) && /field-cell: R2 .*: MISSED; R3 \(median path ratio 1\.10 <= 1\.15\): HELD/.test(jt) && /field-smooth: R2 .*MISSED; R3 \(median path ratio n\/a <= 1\.1\): MISSED/.test(jt) && /^R4 /m.test(jt) && /^R5 /m.test(jt) && /VERDICT: NOT SUPPORTED$/m.test(jt));
}

console.log("\n6. THE COMMAND");
{
    const safe = (argv, io) => { try { return T.command(argv, io); } catch (e) { return "threw: " + String(e.message || e).slice(0, 80); } };
    const cap = () => { const o = { out: [], err: [], files: [] }; o.io = { out: (m) => o.out.push(m), err: (m) => o.err.push(m), writeFile: (p, c) => o.files.push({ p, c }) }; return o; };
    for (const [argv, why] of [[["--set", "test"], "--set test"], [["--set"], "--set with no value"], [["--margin", "0"], "--margin 0"], [["--margin", "x"], "--margin x"], [["--seeds", "1.5"], "--seeds 1.5"], [["--seeds", "0"], "--seeds 0"], [["--frobnicate"], "an unknown argument"], [["--write"], "--write with the default (dev) set"], [["--sweep", "--write"], "--write with --sweep"], [["--sweep", "--set", "held", "--write"], "--write with --sweep even on the held set"], [["--set", "dev", "--write"], "--write with the dev set"]]) {
        const c = cap(), code = safe(argv, c.io);
        ok(`!! ${why}: refused (exit 2), named on stderr, nothing printed on stdout, nothing written`, code === 2 && c.err.length === 1 && /^subFieldNavStudy:/.test(c.err[0]) && c.out.length === 0 && c.files.length === 0, c.err[0]);
    }
    const pilot = (s, t, c) => AP.decide(s, t, c), scs = N.KINDS.flatMap((k) => N.SETS.dev.slice(0, 2).map((s) => N.navScenario(s, k)));
    const sw = cap(), cs = safe(["--sweep", "--seeds", "2"], sw.io), swTxt = sw.out.join("\n");
    const FA = ["field-cell", "field-smooth"], want = {}, wantLines = []; for (const m of N.MARGINS) { want[m] = N.evaluate(pilot, scs, FA, { margin: m }); }
    const wp = T.chooseMargin(want); for (const m of N.MARGINS) wantLines.push(`  ${String(m).padStart(2)} m  ${(100 * wp.means[m]).toFixed(0)}%   noRoute ${want[m].filter((r) => r.noRoute).length}/${want[m].length}`);
    ok("!! --sweep flies the DEV set (4 scenarios at --seeds 2) with the two FIELD arms over the six margins, prints a line for each -- the success and the no-route count equal an independent evaluation of the same scenarios, line for line -- and the margin the rule picks (M* = ...)", cs === 0 && /DEV margin sweep \(4 scenarios, field arms/.test(swTxt) && wantLines.every((l) => swTxt.includes(l)) && swTxt.includes(`M* = ${wp.margin} m (the highest mean success; ties to the smaller)`));
    const dv = cap(), cd = safe(["--set", "dev", "--seeds", "2"], dv.io), dvTxt = dv.out.join("\n"), runs12 = N.evaluate(pilot, scs, N.ARMS, { margin: 12 }), tb12 = T.table(T.summarize(runs12), "margin 12 m -- PRIMARY");
    ok("!! --set dev at the default flies each kind's first 2 seeds with all three arms at the PRIMARY margin (12): the printed table is exactly the table of the library's own evaluation of the same scenarios, then the verdict block; no secondary read, nothing written", cd === 0 && /^DEV set: 2 scenarios of each kind, 3 arms/.test(dv.out[0]) && dvTxt.includes(tb12) && dvTxt.includes(T.verdictText(T.judge(T.summarize(runs12)))) && !/SECONDARY/.test(dvTxt) && dv.files.length === 0 && T.PRIMARY_MARGIN === 12);
    const hd = cap(), ch = safe(["--set", "held", "--seeds", "2", "--write"], hd.io), hdTxt = hd.out.join("\n"), heldScs = N.KINDS.flatMap((k) => N.SETS.held.slice(0, 2).map((s) => N.navScenario(s, k)));
    const h6 = T.table(T.summarize(N.evaluate(pilot, heldScs, N.ARMS, { margin: 6 })), "margin 6 m -- SECONDARY, as first registered (reads nothing into the verdict)");
    ok("!! --set held reads TWO ways: the PRIMARY margin 12 and the SECONDARY registered 6, the second labelled 'as first registered (reads nothing into the verdict)', its table equal to the library's own", ch === 0 && /margin 12 m -- PRIMARY/.test(hdTxt) && hdTxt.includes(h6) && (hdTxt.match(/VERDICT:/g) || []).length === 2 && /^HELD set: 2 scenarios of each kind/.test(hd.out[0]));
    const lines = hd.files.length === 1 ? hd.files[0].c.trim().split("\n").map((l) => JSON.parse(l)) : [];
    ok("!! --write puts down ONE file, brain/subFieldNavHeld.jsonl, with every flight of both reads (2 kinds x 2 seeds x 3 arms x 2 margins = 24 records), each marked with its set ('held'), its role ('primary' for 12, 'as-registered' for 6), arm, status and margin; and says so", hd.files.length === 1 && path.isAbsolute(hd.files[0].p) && /brain[\\/]subFieldNavHeld\.jsonl$/.test(hd.files[0].p) && T.OUT === "brain/subFieldNavHeld.jsonl" && lines.length === 24 && lines.every((r) => r.set === "held" && (r.role === "primary" ? (r.margin === 12 || r.margin === null) : r.role === "as-registered") && typeof r.status === "string") && lines.filter((r) => r.role === "primary").length === 12 && lines.filter((r) => r.role === "as-registered").length === 12 && lines.filter((r) => r.role === "primary" && r.arm !== "straight").every((r) => r.margin === 12) && lines.filter((r) => r.role === "as-registered" && r.arm !== "straight").every((r) => r.margin === 6) && /wrote 24 flights to brain\/subFieldNavHeld\.jsonl/.test(hdTxt));
    const m6 = cap(); T.command(["--set", "held", "--seeds", "1", "--margin", "6"], m6.io);
    ok("!! a margin of 6 asked for IS the registered one: ONE read (labelled PRIMARY), no duplicate secondary", (m6.out.join("\n").match(/VERDICT:/g) || []).length === 1 && !/SECONDARY/.test(m6.out.join("\n")) && /margin 6 m -- PRIMARY/.test(m6.out.join("\n")));
    const m18 = cap(); T.command(["--set", "dev", "--seeds", "1", "--margin", "18"], m18.io);
    ok("the --margin asked for reaches the field (18 here) and the title", /margin 18 m -- PRIMARY/.test(m18.out.join("\n")));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
