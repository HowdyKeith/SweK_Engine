// WebGLEngine/brain/pilotLateness-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/pilotLateness-selfcheck.mjs      (a few seconds; it flies TRAINING dives only, never the registered auditSets(90000))
//
// THE GATE OF brain/pilotLateness.mjs AND tools/ship/latenessStudy.mjs (PART A of "A TANK PILOT TYPE ON THE DEVICE, ONE TICK LATE", brain/RESERVOIR_GPU_WIP.md, registered first):
//   1 THE DELAY     k must be a whole number >= 0; k = 0 is the inner pilot call for call; k = 2 returns the PD autopilot for two ticks, then the inner pilot's output from two ticks
//                   before; the inner pilot runs EVERY tick; a new target object (a new dive) starts again.
//   2 THE READING   paired by dive: the 2 se interval inside +-0.01 is COSTS NOTHING THAT MATTERS, wholly below -0.01 is COSTS, else UNDECIDED; arms on different dives throw.
//   3 THE CHECKS    on training dives: delayed(0) is the tank's own fly type bit for bit; the delay is exact on recorded states; each check fails on its own break.
//   4 THE COMMAND   the readings printed; NOT WEIGHED on a failed check; --write puts every dive's four scores in the file.
//   5 THE SOURCE    no clock, no Math.random; the registered numbers.
// SABOTAGE LOG (each broken, run, restored; red = failing rows):
//   A1  the buffer keeps k ticks, not k + 1 (returns tick n - k + 1)                 3 red
//   A2  a new target does not reset the count or the buffer                         1 red
//   A3  the inner pilot skipped on the fallback ticks                               3 red
//   A4  the fallback ticks return the inner pilot's on-time output, not the PD      3 red
//   A5  k = 1.5 and '1' accepted (only k < 0 refused)                               1 red
//   A6  COSTS NOTHING judged on the mean, not the whole interval                    1 red
//   A7  COSTS judged on the mean, not the interval's upper end                      0 red at first; the -0.012 straddle row added; then 1 red
//   A8  the interval is 1 se, not 2                                                 1 red
//   A9  ON TIME always true                                                         0 red at first (rows only asserted the true case); the break row added; then 1 red
//   A10 THE DELAY check always true                                                 0 red at first, same reason; same row; then 1 red
//   A11 the base moved to 40000                                                     1 red
"use strict";
import fs from "node:fs";
import * as L from "./pilotLateness.mjs";
import * as T from "./subTask.mjs";
import * as AP from "./autopilotSub.mjs";
import * as S from "./../physics/mechanics/subModel6dof.mjs";
import * as Y from "../tools/ship/latenessStudy.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
console.log("pilotLateness-selfcheck -- a pilot k ticks late, exactly\n");

sec("1. THE DELAY");
{
    ok("!! k must be a whole number of ticks, 0 or more: -1, 1.5 and '1' are refused by name", [-1, 1.5, "1"].every((k) => /k must be a whole number of ticks/.test(thr(() => L.delayedPilot(() => 0, k)))));
    let n = 0; const inner = () => ({ n: n++ }), fb = () => "AP", tA = {}, tB = {};
    const p0 = L.delayedPilot(inner, 0, { fallback: fb }), o0 = [p0(null, tA), p0(null, tA), p0(null, tA)];
    ok("!! k = 0 is the inner pilot call for call (its own outputs, in order, no fallback)", J(o0) === J([{ n: 0 }, { n: 1 }, { n: 2 }]) && p0.stats.fallback === 0);
    n = 0; const p2 = L.delayedPilot(inner, 2, { fallback: fb }), o2 = [0, 1, 2, 3, 4].map(() => p2(null, tA));
    ok("!! k = 2: the fallback for ticks 0 and 1, then the inner output of tick n - 2; the inner pilot ran on all five ticks", J(o2) === J(["AP", "AP", { n: 0 }, { n: 1 }, { n: 2 }]) && n === 5 && p2.stats.ticks === 5 && p2.stats.fallback === 2);
    const o2b = [0, 1, 2].map(() => p2(null, tB));
    ok("!! a new target object (a new dive) starts again: two fallbacks, then the first output of the new dive", J(o2b) === J(["AP", "AP", { n: 5 }]));
    ok("  the default fallback is the PD autopilot for that tick (state, target, current)", (() => { const s = S.createState({ ...T.TRAIN_SET[0].start, model: S.createSubModel(S.EXPLORER) }), t = T.TRAIN_SET[0].target, p = L.delayedPilot(() => ({ pitch: 9 }), 1); return J(p(s, t, [0, 0, 0])) === J(AP.decide(s, t, [0, 0, 0])); })());
}

sec("2. THE READING");
{
    const run = (scores) => ({ runs: scores.map((sc, i) => ({ seed: i, kind: "nominal", score: sc })) });
    const base = run(Array.from({ length: 100 }, (_, i) => -0.4 + 0.001 * (i % 7)));
    const shift = (d, jitter = 0) => run(base.runs.map((r, i) => r.score + d + jitter * ((i % 2) * 2 - 1)));
    ok("!! a paired shift of -0.002 with a small spread: the interval inside +-0.01, COSTS NOTHING THAT MATTERS", Y.readingOf(base, shift(-0.002, 0.001)).reading === "COSTS NOTHING THAT MATTERS");
    ok("!! a paired shift of -0.03: the interval wholly below -0.01, COSTS", Y.readingOf(base, shift(-0.03, 0.001)).reading === "COSTS");
    const strad = Y.readingOf(base, shift(-0.012, 0.03));
    ok("!! a mean of -0.012 whose interval still reaches above -0.01 is UNDECIDED, not COSTS: the WHOLE interval must be below", strad.mean < -0.01 && strad.hi > -0.01 && strad.reading === "UNDECIDED", `${strad.lo.toFixed(4)} to ${strad.hi.toFixed(4)}`);
    ok("!! a shift of -0.009 with a wide spread straddles -0.01: UNDECIDED; +0.009 with the same spread straddles +0.01: UNDECIDED", Y.readingOf(base, shift(-0.009, 0.03)).reading === "UNDECIDED" && Y.readingOf(base, shift(0.009, 0.03)).reading === "UNDECIDED");
    const v = Y.readingOf(base, shift(-0.002, 0.001));
    ok("  the interval is the mean +- 2 se of the paired differences", Math.abs(v.mean + 0.002) < 1e-12 && Math.abs(v.hi - v.lo - 4 * v.se) < 1e-12);
    ok("!! arms on different dives throw", /not on the same dives/.test(thr(() => Y.readingOf(base, run([1, 2])))));
}

sec("3. THE CHECKS");
{
    const dives = T.TRAIN_SET.slice(0, 12);
    ok("!! on training dives, delayed(0) flies bit for bit as the tank's own fly type", Y.onTimeIsThePilot(dives) === true);
    ok("!! the delay is exact on a training dive's recorded states (k = 1, 2, 4)", Y.delayIsExact(dives[1]) === true);
    ok("!! and each catches a break: a pilot one tick late where on time was asked fails ON TIME; a pilot one tick later than asked fails THE DELAY", Y.onTimeIsThePilot(dives, undefined, undefined, (k, C, w) => Y.pilotOf(k + 1, C, w)) === false && Y.delayIsExact(dives[1], undefined, undefined, (k, C, w) => Y.pilotOf(k === 0 ? 0 : k + 1, C, w)) === false);
    const res = Object.fromEntries(Y.KS.map((k) => [k, { runs: dives.map((d, i) => ({ seed: d.seed, kind: d.kind, score: -0.4 })) }]));
    const bad = (o, r = res) => Y.checksOf(r, { onTime: true, exact: true, ...o }).filter((c) => !c.ok).map((c) => c.name), shifted = { ...res, 2: { runs: res[2].runs.map((r) => ({ ...r, seed: r.seed + 1 })) } };
    ok("!! each check fails on its own break", bad({}).length === 0 && J(bad({ onTime: false })) === J(["ON TIME IS THE PILOT"]) && J(bad({ exact: false })) === J(["THE DELAY IS EXACT"]) && J(bad({}, shifted)) === J(["SAME DIVES"]));
}

sec("4. THE COMMAND");
{
    const dives = T.TRAIN_SET.slice(0, 6), mk = (d) => ({ score: -0.4 + d, crashed: 0, byKind: { nominal: -0.4 }, runs: dives.map((x, i) => ({ seed: x.seed, kind: x.kind, score: -0.4 + d + 0.0001 * (i % 2), status: "submerged" })) });
    const run = (argv, o = {}) => { const out = [], files = []; Y.command(argv, { out: (m) => out.push(m), writeFile: (f, t) => files.push([f, t]), dives: () => dives, flyAll: () => ({ 0: mk(0), 1: mk(-0.001), 2: mk(-0.002), 4: mk(-0.05) }), onTime: () => true, exact: () => true, ...o }); return { out: out.join("\n"), files }; };
    const r = run(["--write"]), nw = run([], { exact: () => false });
    ok("!! the readings are printed for one and four ticks, by the rule (here: one tick costs nothing, four cost)", /READING \(ONE TICK\): ONE TICK COSTS NOTHING THAT MATTERS/.test(r.out) && /READING \(FOUR TICKS\): FOUR TICKS COST$/m.test(r.out), r.out.split("\n").slice(-2).join(" | "));
    ok("!! --write puts every dive's four scores in brain/rig-results/lateness-90000.json", r.files.length === 1 && r.files[0][0].endsWith("brain/rig-results/lateness-90000.json") && JSON.parse(r.files[0][1]).dives.length === 6 && JSON.parse(r.files[0][1]).dives[0].scores.length === 4);
    ok("!! a failed check prints NOT WEIGHED and no reading", /READING: NOT WEIGHED/.test(nw.out) && !/ONE TICK COSTS/.test(nw.out));
}

sec("5. THE SOURCE");
{
    const code = [new URL("./pilotLateness.mjs", import.meta.url), new URL("../tools/ship/latenessStudy.mjs", import.meta.url)].map((u) => fs.readFileSync(u, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers (base 90000, k 0 1 2 4, the designated 1 and 4, margin 0.01, 10 copy dives)", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && Y.BASE === 90000 && J(Y.KS) === J([0, 1, 2, 4]) && J(Y.DESIGNATED) === J([1, 4]) && Y.MARGIN === 0.01 && Y.COPY_DIVES === 10 && Y.divesOf().length === 500);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
