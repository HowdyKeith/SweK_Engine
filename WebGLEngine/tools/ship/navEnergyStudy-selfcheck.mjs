// WebGLEngine/tools/ship/navEnergyStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/navEnergyStudy-selfcheck.mjs      (a second or two)
//
// THE GATE OF tools/ship/navEnergyStudy.mjs (PART 1 of brain/NAV_MISSIONS_WIP.md):
//   1 THE SETS      HELD80 (7701-7760) shares no seed with any navigation set spent before it.
//   2 THE READING   pairing only flights BOTH arms reached; the median paired extra of any+predict over any+replan as a share of a battery: COSTS at 3% or more, CHEAP at 1% or
//                   less (a negative median is CHEAP), IN BETWEEN otherwise, exactly at the bars.
//   3 THE CHECKS    each fails on its own break; a failure prints NOT WEIGHED.
//   4 THE COMMAND   --write only with held80; held80 writes every flight; DEV says it is not a result.
//   5 THE SOURCE    no clock, no Math.random; the registered numbers.
// SABOTAGE LOG (2026-11-17; 8 mutants of tools/ship/navEnergyStudy.mjs, each alone, restored byte-identical; Q6 is logged in brain/navEnergy-selfcheck.mjs): Q1 COSTS
//   exclusive at 3% (1 red), Q2 CHEAP exclusive at 1% (1), Q3 pairs where only any+predict reached (1), Q4 the pairing reversed (2), Q5 ENOUGH PAIRS always true (1), Q7 --write
//   allowed on DEV (1), Q8 a failed check still read (1).
"use strict";
import fs from "node:fs";
import * as T from "./navEnergyStudy.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as P from "../../brain/subNavPlus.mjs";
import * as SN from "../../brain/subSensedNav.mjs";
import * as G from "../../brain/subGiveWay.mjs";
import * as W from "../../brain/subTurnSweep.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("navEnergyStudy-selfcheck -- the price of a detour\n");

sec("1. THE SETS");
{
    const spent = new Set([...Object.values(H.HARD_SETS).flat(), ...H.HELD5, ...Object.values(SN.SENSE_SETS).flat(), ...Object.values(P.PLUS_SETS).flat(), ...G.HELD78, ...W.HELD79]);
    for (let s = 9001; s <= 9040; s++) spent.add(s);
    ok("!! HELD80 is 7701-7820 (Amendment 1: widened on DEV from 7701-7760) and no seed of it was spent before (HELD4, HELD5, the sensed and plus sets, HELD73, HELD77, HELD78, HELD79); DEV is 1-30", T.SETS.held80.length === 120 && T.SETS.held80[0] === 7701 && T.SETS.held80[119] === 7820 && T.SETS.held80.every((s) => !spent.has(s)) && T.SETS.dev.length === 30 && T.SETS.dev[0] === 1);
}

// records: per arm over seeds 1..n; `e(arm, seed)` the energy (J), `r(arm, seed)` reached
const resOf = (n, e, r = () => true) => Object.fromEntries(T.ARMS.map((a) => [a, Array.from({ length: n }, (_, i) => ({ arm: a, seed: i + 1, kind: T.KIND, reached: r(a, i + 1), status: r(a, i + 1) ? "reached" : "collided", energy: e(a, i + 1), path: 300 + (a === "any+predict" ? 50 : 0), battery: e(a, i + 1) / 3e6, jPerM: 2700 }))]));
sec("2. THE READING");
{
    const at = (extra) => T.verdictOf(resOf(21, (a, s) => 600000 + (a === "any+predict" ? extra : 0)));
    ok("!! the bars, exactly: 90 kJ extra (3.0%) COSTS, 89.9 kJ IN BETWEEN, 30 kJ (1.0%) CHEAP, 30.1 kJ IN BETWEEN, a negative median CHEAP",
        at(90000).verdict === "THE DETOUR COSTS" && at(89900).verdict === "IN BETWEEN" && at(30000).verdict === "THE DETOUR IS CHEAP" && at(30100).verdict === "IN BETWEEN" && at(-50000).verdict === "THE DETOUR IS CHEAP", J([at(90000).share, at(30000).share]));
    const only = T.verdictOf(resOf(21, (a, s) => 600000 + (a === "any+predict" ? (s <= 10 ? 500000 : 0) : 0), (a, s) => !(a === "any+replan" && s <= 10)));
    ok("!! only flights BOTH arms reached are paired: the ten seeds where any+replan failed (and any+predict paid 500 kJ more) are not read: 11 pairs, median 0, CHEAP", only.pairs === 11 && only.medianJ === 0 && only.verdict === "THE DETOUR IS CHEAP", J(only));
    ok("  the median of an even count is the mean of the middle two; pairing on different seeds throws", T.median([1, 2, 3, 10]) === 2.5 && T.median([]) === null && (() => { try { T.pairedExtra([{ seed: 1 }], [{ seed: 2 }]); return false; } catch (e) { return /not on the same seeds/.test(e.message); } })());
}

sec("3. THE CHECKS");
{
    const res = resOf(21, () => 600000), bad = (o, r = res) => T.checksOf(r, { meter: true, n: 21, ...o }).filter((c) => !c.ok).map((c) => c.name);
    const shifted = { ...res, "any+predict+edge+yield": res["any+predict+edge+yield"].map((r) => ({ ...r, seed: r.seed + 1 })) }, few = resOf(21, () => 600000, (a, s) => s <= 19);
    ok("!! each check fails on its own break: the meter -> THE METER IS THE MODEL'S; a shifted arm -> SAME SCENARIOS; 19 pairs -> ENOUGH PAIRS; all pass otherwise",
        bad({}).length === 0 && J(bad({ meter: false })) === J(["THE METER IS THE MODEL'S"]) && J(bad({}, shifted)) === J(["SAME SCENARIOS"]) && J(bad({}, few)) === J(["ENOUGH PAIRS"]));
    const nan = { ...res, "any+replan": res["any+replan"].map((r, i) => (i === 3 ? { ...r, energy: NaN } : r)) };
    ok("  a flight with no energy fails SAME SCENARIOS (every flight must carry one)", J(bad({}, nan)) === J(["SAME SCENARIOS"]));
    ok("!! a failed check prints NOT WEIGHED and no table", /READING: NOT WEIGHED/.test(T.report(res, { meter: false, n: 21, set: "held80" }).join("\n")) && !/median path/.test(T.report(res, { meter: false, n: 21, set: "held80" }).join("\n")));
}
{
    const m = T.meterMatchesNeeds(), off = T.meterMatchesNeeds(900, { bias: 1.001 });
    ok("!! meterMatchesNeeds: on the scripted run the metered pilot's trajectory is stepNeeds's and the meter equals the energy drop to 1e-6; a meter 0.1 percent high fails", m.ok && m.same && m.drop > 0 && Math.abs(m.joules - m.drop) / m.drop < 1e-6 && !off.ok && off.same, J([m.joules, m.drop]));
    ok("!! meterLeavesFlight: on DEV seed 1 every arm's metered flight has the unmetered flight's status, ticks and path", T.meterLeavesFlight() === true);
}

sec("4. THE COMMAND");
{
    const run = (argv) => { const out = [], errs = [], files = [], sets = []; const code = T.command(argv, { out: (m) => out.push(m), err: (m) => errs.push(m), writeFile: (f, t) => files.push([f, t]), flySet: (seeds) => { sets.push(seeds.length + ":" + seeds[0]); return resOf(seeds.length, (a) => 600000 + (a === "any+predict" ? 100000 : 0)); }, meterOk: () => true }); return { code, out: out.join("\n"), errs, files, sets }; };
    const d = run(["--set", "dev"]), dw = run(["--set", "dev", "--write"]), h = run(["--set", "held80", "--write"]), none = run([]);
    ok("!! DEV flies 1-30, says it is not a result and writes nothing; --write with DEV is refused (exit 2); no set prints the usage", d.code === 0 && d.sets[0] === "30:1" && /not a result/.test(d.out) && d.files.length === 0 && dw.code === 2 && dw.sets.length === 0 && none.code === 2);
    ok("!! held80 flies 7701-7820 once and writes brain/navEnergyHeld80.jsonl with all 360 flights, each carrying set held80; the reading is printed", h.code === 0 && J(h.sets) === J(["120:7701"]) && h.files[0][0].replace(/\\/g, "/").endsWith("brain/navEnergyHeld80.jsonl") && h.files[0][1].trim().split("\n").length === 360 && JSON.parse(h.files[0][1].split("\n")[0]).set === "held80" && /READING: THE DETOUR COSTS/.test(h.out));
}

sec("5. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./navEnergyStudy.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers: 3% and 1% of a battery, 20 pairs, the three arms, the file", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && T.COSTS === 0.03 && T.CHEAP === 0.01 && T.MIN_PAIRS === 20 && J(T.ARMS) === J(["any+replan", "any+predict", "any+predict+edge+yield"]) && T.OUT_FILE === "brain/navEnergyHeld80.jsonl" && T.KIND === "hard-traffic");
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
