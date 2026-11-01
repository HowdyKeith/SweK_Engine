// WebGLEngine/tools/ship/tankNavRun-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/tankNavRun-selfcheck.mjs      (~10 s)
//
// THE DESCRIPTIVE RUN OF THE TANK'S NAVIGATION SCENE (tools/ship/tankNavRun.mjs), held to its word before the registered run is made ("FOLLOW-UP 4" of brain/SUB_FIELD_NAV_WIP.md; the run is DESCRIPTIVE, not a test of the study):
//   1  THE CONSTANTS   the file, 12 seas, 600 s, the navigator seed, the 10-sea bar, the start, the arm order
//   2  THE COURIER     flyCourier is the tank's per-sub loop (the navigator's target, the PD autopilot, the nominal hull): a function of its inputs, the record's fields, the seconds taken, the start; GOLDEN counts
//   3  THE TOTALS      summarize adds arrivals, hits, plans and distance per arm, counts the seas with an arrival and the subs lost
//   4  T1 TO T3        judge at each boundary (the 10-sea bar, the hit order with ties, the arrivals of any+predict against the others)
//   5  THE COMMAND     bad arguments (exit 2, named), a short run end to end, the table and the verdict, --write puts one JSON line a sub in brain/tankNavRun.jsonl
//
// SABOTAGE LOG -- (filled in below after the mutants have been run)
"use strict";
import * as R from "./tankNavRun.mjs";
import * as TN from "../../brain/subTankNav.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, e = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= e;
const safe = (f, d = null) => { try { return f(); } catch { return d; } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = (seed, arm, o = {}) => ({ seed, arm, arrivals: 0, hits: 0, replans: 0, travel: 0, noRoute: false, lost: null, ...o });
console.log("tankNavRun-selfcheck -- the descriptive run of the tank's navigation scene\n");

console.log("1. THE CONSTANTS");
{
    ok("!! the output file is brain/tankNavRun.jsonl; 12 seas of 600 tank-seconds; the navigator's seed 5; the bar for T1 is 10 seas", R.OUT === "brain/tankNavRun.jsonl" && R.SEEDS === 12 && R.SECONDS === 600 && R.NAV_SEED === 5 && R.MIN_SEAS === 10);
    ok("!! every courier starts at (100, 150) at 25 m, 2 m/s, heading east; the arms are straight, any, any+replan, any+predict (the tank's, in the order T2 reads them), frozen", same(R.START, { x: 100, y: 150, depth: 25, speed: 2, heading: 0 }) && same(R.ORDER, ["straight", "any", "any+replan", "any+predict"]) && same(R.ORDER, TN.TANK_ARMS) && Object.isFrozen(R.ORDER) && Object.isFrozen(R.START));
}

console.log("\n2. THE COURIER");
{
    const a = safe(() => R.flyCourier(1, "any", { seconds: 120 })), b = safe(() => R.flyCourier(1, "any", { seconds: 120 }));
    ok("!! flyCourier returns { seed, arm, arrivals, hits, replans, travel, noRoute, lost } and is a function of its inputs (twice, identical)", !!a && Object.keys(a).sort().join() === "arm,arrivals,hits,lost,noRoute,replans,seed,travel" && same(a, b) && a.seed === 1 && a.arm === "any" && a.lost === null);
    const short = safe(() => R.flyCourier(1, "straight", { seconds: 10 })), longer = safe(() => R.flyCourier(1, "straight", { seconds: 60 }));
    ok("!! it flies for the seconds it is given and from the start: 10 s of a vessel starting at 2 m/s sails 15 to 35 m, 60 s 120 to 200 m, and the longer flight has sailed farther", !!short && !!longer && short.travel > 15 && short.travel < 35 && longer.travel > 120 && longer.travel < 200 && longer.travel > short.travel);
    const sea1 = safe(() => R.flyCourier(1, "any", { seconds: 300 })), sea2 = safe(() => R.flyCourier(2, "any", { seconds: 300 })), dflt = safe(() => R.flyCourier(1, "straight"));
    ok("!! the sea is the seed's: seas 1 and 2 give different flights; the default length is 600 s (the default straight flight sails about twice 300 s's distance)", !!sea1 && !!sea2 && !same(sea1, sea2) && !!dflt && dflt.travel > 1500 && dflt.travel < 1900);
    const sunk = safe(() => R.flyCourier(1, "straight", { seconds: 200, pilot: () => ({ ballast: 1, thrust: 0 }) }));
    ok("!! a vessel the sea itself ends is reported: a pilot that floods its tank until it grounds gives lost = the vessel's own word (not null) and the flight stops there (it sails far less than 200 s of a swimming vessel would)", !!sunk && sunk.lost !== null && typeof sunk.lost === "string" && sunk.travel < 150);
    const c1 = safe(() => R.flyCourier(1, "any+predict", { seconds: 300 })), c2 = safe(() => R.flyCourier(1, "straight", { seconds: 300 }));
    ok("!! GOLDEN (sea 1, 300 s): `any` 3 arrivals, 2 hits, 4 plans; `any+predict` 3, 1, 102; straight 3, 2, 0 -- the same counts the navigator's own gate pins, because it is the same loop", !!sea1 && sea1.arrivals === 3 && sea1.hits === 2 && sea1.replans === 4 && !!c1 && c1.arrivals === 3 && c1.hits === 1 && c1.replans === 102 && !!c2 && c2.arrivals === 3 && c2.hits === 2 && c2.replans === 0 && c1.noRoute === false);
}

console.log("\n3. THE TOTALS");
{
    const runs = [run(1, "straight", { arrivals: 2, hits: 3, replans: 0, travel: 800 }), run(2, "straight", { arrivals: 0, hits: 1, travel: 300, lost: "broached" }), run(3, "straight", { arrivals: 1, hits: 0, travel: 500 }),
        run(1, "any", { arrivals: 1, hits: 2, replans: 4, travel: 700 }), run(2, "any", { arrivals: 3, hits: 0, replans: 5, travel: 900 }),
        run(1, "any+replan", { arrivals: 2, hits: 1, replans: 100, travel: 650 }), run(1, "any+predict", { arrivals: 0, hits: 0, replans: 99, travel: 400 })];
    const by = safe(() => R.summarize(runs)), x = by && by.straight;
    ok("!! per arm: subs, arrivals, hits, plans and travel are SUMS (straight: 3 subs, 3 arrivals, 4 hits, 1,600 m), the seas with an arrival count subs with at least one (2 of 3), and a lost sub is counted", !!x && x.subs === 3 && x.arrivals === 3 && x.hits === 4 && x.replans === 0 && x.travel === 1600 && x.seasWithArrival === 2 && x.lost === 1);
    ok("!! the other arms are summed by themselves (any: 2 subs, 4 arrivals, 2 hits, 9 plans, 1,600 m; any+replan 1, 2, 1, 100; any+predict 1, 0, 0, 99, 0 seas with an arrival), keys in the arm order", !!by && Object.keys(by).join() === R.ORDER.join() && by.any.subs === 2 && by.any.arrivals === 4 && by.any.hits === 2 && by.any.replans === 9 && by.any.travel === 1600 && by.any.seasWithArrival === 2 && by["any+replan"].arrivals === 2 && by["any+replan"].hits === 1 && by["any+replan"].replans === 100 && by["any+predict"].seasWithArrival === 0 && by["any+predict"].lost === 0);
}

console.log("\n4. T1 TO T3");
{
    const mk = (o = {}) => { const by = {}; for (const arm of R.ORDER) by[arm] = { subs: 12, arrivals: 20, hits: 10, replans: 0, travel: 0, seasWithArrival: 11, lost: 0, ...(o[arm] || {}) }; return by; };
    const base = mk({ straight: { hits: 30 }, any: { hits: 20 }, "any+replan": { hits: 12 }, "any+predict": { hits: 8, arrivals: 25 } }), j = safe(() => R.judge(base));
    ok("!! the base case holds all three: every arm arrives in 11 seas, hits fall 30 > 20 > 12 > 8, any+predict arrives most", !!j && j.t1 === true && j.t2 === true && j.t3 === true);
    const J = (o) => safe(() => R.judge(mk(o)));
    ok("!! T1 reads EVERY arm's seas with an arrival against the bar of 10: all at 10 holds, one arm at 9 fails (each arm in turn)", J({ straight: { seasWithArrival: 10 }, any: { seasWithArrival: 10 }, "any+replan": { seasWithArrival: 10 }, "any+predict": { seasWithArrival: 10 } }).t1 === true && R.ORDER.every((arm) => J({ [arm]: { seasWithArrival: 9 } }).t1 === false));
    ok("!! T2 is an order with ties allowed: equal hits hold (all 10), each link of the chain breaks it (straight below any; any below replan; replan below predict)", J({}).t2 === true && J({ straight: { hits: 9 } }).t2 === false && J({ any: { hits: 11 } }).t2 === false && J({ "any+replan": { hits: 11 } }).t2 === false && J({ straight: { hits: 11 }, any: { hits: 10 }, "any+replan": { hits: 9 }, "any+predict": { hits: 9 } }).t2 === true);
    ok("!! T3: any+predict's arrivals at least those of any AND of any+replan (equal holds; one fewer than either fails); straight is not compared", J({}).t3 === true && J({ any: { arrivals: 21 } }).t3 === false && J({ "any+replan": { arrivals: 21 } }).t3 === false && J({ straight: { arrivals: 99 } }).t3 === true);
    ok("!! a missing arm is a miss and not a crash (no any+predict entry: T1 and T3 are false, T2 false)", (() => { const by = mk(); delete by["any+predict"]; const q = safe(() => R.judge(by)); return !!q && q.t1 === false && q.t2 === false && q.t3 === false; })());
    const half = safe(() => R.verdictText({ t1: true, t2: false, t3: true })), half2 = safe(() => R.verdictText({ t1: false, t2: true, t3: false }));
    ok("!! each verdict line is its own prediction: with T1 held, T2 missed, T3 held the T2 line says MISSED and the others HELD; the reverse is the reverse", !!half && /^T1 .*: HELD$/m.test(half) && /^T2 .*: MISSED$/m.test(half) && /^T3 .*: HELD$/m.test(half) && !!half2 && /^T1 .*: MISSED$/m.test(half2) && /^T2 .*: HELD$/m.test(half2) && /^T3 .*: MISSED$/m.test(half2));
    const txt = safe(() => R.verdictText(base && j)), tbl = safe(() => R.table(base));
    ok("!! the verdict block names T1 to T3 with HELD or MISSED; the table has a line a arm with its totals", !!txt && /^T1 .*: HELD$/m.test(txt) && /^T2 .*: HELD$/m.test(txt) && /^T3 .*: HELD$/m.test(txt) && /MISSED/.test(R.verdictText({ t1: false, t2: true, t3: true })) && !!tbl && R.ORDER.every((arm) => tbl.includes(arm)) && /any\+predict\s+\|\s+12 \|\s+25 \|\s+8 \|/.test(tbl) && tbl.split("\n").length === 5 && tbl.split("\n")[0] === "arm          | subs | arrivals | hits | seas with an arrival | plans | sailed (km) | lost" && /^any\+predict\s+\|\s+12 \|\s+25 \|\s+8 \|\s+11 \|\s+0 \|\s+0\.0 \|\s+0$/m.test(tbl) && /\|\s+1\.6 \|/.test(R.table({ ...base, any: { ...base.any, travel: 1600 } })));
}

console.log("\n5. THE COMMAND");
{
    const call = (argv) => { const o = [], e = [], w = []; const code = safe(() => R.command(argv, { out: (m) => o.push(m), err: (m) => e.push(m), writeFile: (p, c) => w.push([p, c]) }), -1); return { code, out: o.join("\n"), err: e.join("\n"), w }; };
    ok("!! a bad argument is exit 2 with a message naming it: an unknown flag, --seeds or --seconds that is not a positive whole number (0, 2.5, none)", call(["--bogus"]).code === 2 && /unknown argument "--bogus"/.test(call(["--bogus"]).err) && call(["--seeds", "0"]).code === 2 && call(["--seconds", "2.5"]).code === 2 && call(["--seeds"]).code === 2 && /--seeds needs a positive whole number/.test(call(["--seeds", "0"]).err) && /--seconds needs a positive whole number/.test(call(["--seconds", "x"]).err));
    const d = call(["--seeds", "2", "--seconds", "30"]);
    ok("!! a short run: exit 0, the first line says 2 seas x 4 arms and the seconds, the table has the 4 arms with 2 subs each, the verdict block follows, nothing is written", d.code === 0 && /^2 seas x 4 arms, 30 tank-seconds each/.test(d.out) && R.ORDER.every((arm) => new RegExp(arm.replace("+", "\\+") + "\\s+\\|\\s+2 \\|").test(d.out)) && /^T1 /m.test(d.out) && /^T3 /m.test(d.out) && d.w.length === 0 && d.err === "");
    const w = call(["--seeds", "1", "--seconds", "20", "--write"]), lines = w.w.length ? w.w[0][1].trim().split("\n").map((l) => JSON.parse(l)) : [];
    ok("!! --write puts one JSON line a sub in brain/tankNavRun.jsonl (4 for one sea), each the courier's record, and says so", w.code === 0 && w.w.length === 1 && w.w[0][0].endsWith("brain/tankNavRun.jsonl") && lines.length === 4 && same(lines.map((r) => r.arm), R.ORDER) && lines.every((r) => r.seed === 1) && /wrote 4 subs to brain\/tankNavRun\.jsonl/.test(w.out) && same(lines[1], R.flyCourier(1, "any", { seconds: 20 })));
    const dry = call(["--dry"]), dry2 = call(["--dry", "--seeds", "3", "--seconds", "40"]);
    ok("!! --dry says what would be flown and flies nothing: with no arguments the registered run (12 seas x 4 arms, 600 tank-seconds each), with arguments theirs; no table, no verdict, nothing written", dry.code === 0 && /^12 seas x 4 arms, 600 tank-seconds each/.test(dry.out) && !/T1/.test(dry.out) && dry.w.length === 0 && /^3 seas x 4 arms, 40 tank-seconds each/.test(dry2.out) && dry2.out.split("\n").length === 1);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
