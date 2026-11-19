// WebGLEngine/tools/ship/subTurnSweepStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subTurnSweepStudy-selfcheck.mjs      (a few seconds: check 1 flies ten stored flights)
//
// THE GATE OF tools/ship/subTurnSweepStudy.mjs (FOLLOW-UP 7 of brain/SUB_FIELD_NAV_WIP.md):
//   1 THE SETS      HELD79 (7601-7660) shares no seed with any navigation set spent before it; DEV is FOLLOW-UP 6's; HELD78 is the post hoc set.
//   2 THE VERDICT   SUPPORTED needs no exit, net gain >= 5 at p <= 0.10 and no more ship collisions than ref; PARTLY is no exit without the gain; an exit is NOT SUPPORTED.
//   3 THE CHECKS    each fails on its own break, and any failure prints NOT WEIGHED; check 1 flown on FOLLOW-UP 6's stored HELD78 flights, and a stored flight off by a tick caught;
//                   check 2 on the real table, and a stretched table caught.
//   4 THE COMMAND   --write only with held79 (DEV and HELD78 refused, exit 2), held79 writes every flight with its set, held78 is labelled POST HOC and "not a result".
//   5 THE SOURCE    no clock, no Math.random; the registered numbers.
// SABOTAGE LOG (2026-11-17; 9 mutants of tools/ship/subTurnSweepStudy.mjs, each alone, restored byte-identical; every one 1 red): Q1 an exit allowed in SUPPORTED, Q2 the ship
//   bar dropped, Q3 the p bar dropped, Q4 the copy check by status only, Q5 the table's 90-degree bound dropped, Q6 --write allowed on HELD78, Q7 a failed check still weighed,
//   Q8 THE SWEEP BITES always true, Q9 the POST HOC label dropped from HELD78. (Mutants T2 and T13 of the module also reach this gate.)
"use strict";
import fs from "node:fs";
import * as T from "./subTurnSweepStudy.mjs";
import * as W from "../../brain/subTurnSweep.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as P from "../../brain/subNavPlus.mjs";
import * as SN from "../../brain/subSensedNav.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("subTurnSweepStudy-selfcheck -- FOLLOW-UP 7's study\n");

sec("1. THE SETS");
{
    const spent = new Set([...Object.values(H.HARD_SETS).flat(), ...H.HELD5, ...Object.values(SN.SENSE_SETS).flat(), ...Object.values(P.PLUS_SETS).flat(), ...W.HELD78, ...W.DEV]);
    for (let s = 9001; s <= 9040; s++) spent.add(s);   // HELD77 of brain/subNav3d.mjs
    ok("!! HELD79 is 7601-7660 and no seed of it was spent by a navigation set before (HELD4, HELD5, the sensed sets, the plus sets incl. HELD73, HELD77, HELD78, DEV)", T.SETS.held79 === W.HELD79 && W.HELD79.every((s) => !spent.has(s)) && W.HELD79.length === 60);
    ok("  DEV and HELD78 are FOLLOW-UP 6's own", T.SETS.dev.length === 30 && T.SETS.dev[0] === 1 && T.SETS.held78[0] === 7501 && T.SETS.held78.length === 60);
}

// fixtures: per arm, records over seeds 1..n with a status per seed
const rec = (arm, seed, status, extra = {}) => ({ arm, seed, kind: W.KIND, status, reached: status === "reached", hit: status === "collided" ? "ship" : null, ticks: 100, path: 1, sweepTicks: arm.includes("sweep") ? 3 : 0, sweepTurns: arm.includes("sweep") ? 1 : 0, ...extra });
const resOf = (fn, n = 20) => Object.fromEntries(W.ARM_NAMES.map((a) => [a, Array.from({ length: n }, (_, i) => rec(a, i + 1, fn(a, i + 1)))]));
sec("2. THE VERDICT");
{
    const sup = T.verdictOf(resOf((a, s) => (a === W.DESIGNATED ? (s <= 18 ? "reached" : "timeout") : s <= 12 ? "reached" : "timeout")));
    ok("!! SUPPORTED: no exit, net 6 of 6 discordant (p 0.0312), ship collisions 0 against 0", sup.verdict === "SUPPORTED" && sup.pair.net === 6 && sup.bars.noExit && sup.bars.ships, J(sup));
    const exit = T.verdictOf(resOf((a, s) => (a === W.DESIGNATED ? (s <= 18 ? "reached" : s === 19 ? "left" : "timeout") : s <= 12 ? "reached" : "timeout")));
    ok("!! one exit makes it NOT SUPPORTED, whatever the gain", exit.verdict === "NOT SUPPORTED" && exit.pair.net === 6);
    const part = T.verdictOf(resOf((a, s) => (a === W.DESIGNATED ? (s <= 14 ? "reached" : "timeout") : s <= 12 ? "reached" : "timeout")));
    ok("!! no exit and net 2: PARTLY SUPPORTED", part.verdict === "PARTLY SUPPORTED" && part.pair.net === 2);
    const ships = T.verdictOf(resOf((a, s) => (a === W.DESIGNATED ? (s <= 18 ? "reached" : "collided") : s <= 12 ? "reached" : "timeout")));
    ok("!! no exit and the gain, but MORE ship collisions than ref (2 against 0): PARTLY SUPPORTED, not SUPPORTED", ships.verdict === "PARTLY SUPPORTED" && !ships.bars.ships);
    const p10 = T.verdictOf(resOf((a, s) => (a === W.DESIGNATED ? (s <= 17 || s === 20 ? "reached" : "timeout") : s <= 12 || s === 18 || s === 19 ? "reached" : "timeout"), 20));
    ok("!! the gain bar: a split of 6 to 2 (net 4) misses it before p is read: PARTLY SUPPORTED", p10.pair.net === 4 && !p10.bars.gain && p10.verdict === "PARTLY SUPPORTED", J(p10.pair));
    const big = T.verdictOf(resOf((a, s) => (a === W.DESIGNATED ? (s <= 30 ? "reached" : "timeout") : s <= 20 || (s > 30 && s <= 34) ? "reached" : "timeout"), 40));
    ok("!! net 6 as 10 to 4 (p 0.1796) misses the p bar: PARTLY SUPPORTED", big.pair.net === 6 && big.pair.p > 0.10 && !big.bars.gain && big.verdict === "PARTLY SUPPORTED", J(big.pair));
}

sec("3. THE CHECKS");
{
    const res = resOf((a, s) => (s <= 12 ? "reached" : "timeout")), good = T.checksOf(res, { copy: true, table: true, n: 20 });
    ok("!! all four pass on aligned arms with a sweep that overrode a tick", good.every((c) => c.ok), J(good.map((c) => c.ok)));
    const bad = (o, r = res) => T.checksOf(r, { copy: true, table: true, n: 20, ...o }).filter((c) => !c.ok).map((c) => c.name);
    const shifted = { ...res, ref: res.ref.map((r) => ({ ...r, seed: r.seed + 1 })) }, idle = Object.fromEntries(Object.entries(res).map(([a, rs]) => [a, rs.map((r) => ({ ...r, sweepTicks: 0 }))]));
    ok("!! each check fails on its own break: copy false -> THE COPY; table false -> THE TABLE IS THE MODEL'S; a shifted arm -> SAME SCENARIOS; no override -> THE SWEEP BITES",
        J(bad({ copy: false })) === J(["THE COPY"]) && J(bad({ table: false })) === J(["THE TABLE IS THE MODEL'S"]) && J(bad({}, shifted)) === J(["SAME SCENARIOS"]) && J(bad({}, idle)) === J(["THE SWEEP BITES"]));
    ok("!! a failed check prints NOT WEIGHED and no table", /VERDICT: NOT WEIGHED/.test(T.report(res, { copy: false, table: true, n: 20, set: "held79" }).join("\n")) && !/reached  collided/.test(T.report(res, { copy: false, table: true, n: 20, set: "held79" }).join("\n")));
    const stored = fs.readFileSync(new URL("../../brain/subGiveWayHeld78.jsonl", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const real = T.copySame(stored), off = T.copySame(stored.map((r) => (r.arm === "ref+free+giveway" && r.seed === 7503 ? { ...r, ticks: r.ticks + 1 } : r)));
    ok("!! FLOWN: ref and ref+free+giveway reproduce FOLLOW-UP 6's stored HELD78 flights on its first 5 seeds, and a stored flight off by one tick is caught", real === true && off === false, J([real, off]));
    const tb = W.turnTable(), stretched = tb.map((p) => ({ ...p, dx: p.dx * 1.5 }));
    ok("!! the real table passes check 2; a table stretched 1.5x in advance fails it (47 m at 90 degrees)", T.tableOk(tb) === true && T.tableOk(stretched) === false);
}

sec("4. THE COMMAND");
{
    const run = (argv) => { const out = [], errs = [], files = [], sets = []; const code = T.command(argv, { out: (m) => out.push(m), err: (m) => errs.push(m), writeFile: (f, t) => files.push([f, t]), flySet: (seeds) => { sets.push(seeds.length + ":" + seeds[0]); return resOf((a, s) => (s <= 12 ? "reached" : "timeout"), seeds.length); }, copySame: () => true, tableOk: () => true }); return { code, out: out.join("\n"), errs, files, sets }; };
    const d = run(["--set", "dev", "--write"]), p = run(["--set", "held78", "--write"]), h = run(["--set", "held79", "--write"]), q = run(["--set", "held78"]), none = run([]);
    ok("!! --write with DEV or HELD78 is refused (exit 2, nothing flown); no set prints the usage (exit 2)", d.code === 2 && d.sets.length === 0 && p.code === 2 && p.sets.length === 0 && none.code === 2 && /usage/.test(none.errs.join("")));
    ok("!! held79 flies 7601-7660 once and writes brain/subTurnSweepHeld79.jsonl with all 240 flights, each carrying set held79", h.code === 0 && J(h.sets) === J(["60:7601"]) && h.files.length === 1 && h.files[0][0].replace(/\\/g, "/").endsWith("brain/subTurnSweepHeld79.jsonl") && h.files[0][1].trim().split("\n").length === 240 && JSON.parse(h.files[0][1].split("\n")[0]).set === "held79");
    ok("!! held78 is labelled POST HOC and its verdict 'not a result', and nothing is written", q.code === 0 && /POST HOC: this set's exits chose the fix; NOT a result/.test(q.out) && /VERDICT: .*\(not a result\)/.test(q.out) && q.files.length === 0);
}

sec("5. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./subTurnSweepStudy.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers: gain 5, p 0.10, five copy seeds, the files", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && T.GAIN === 5 && T.P_LEVEL === 0.10 && T.COPY_SEEDS === 5 && T.OUT_FILE === "brain/subTurnSweepHeld79.jsonl" && T.STORED_78 === "brain/subGiveWayHeld78.jsonl");
    ok("  signTest is FOLLOW-UP 6's (re-exported): 6 of 6 -> 0.03125", Math.abs(T.signTest(6, 6) - 0.03125) < 1e-12 && Math.abs(T.signTest(10, 14) - 0.1795654296875) < 1e-12);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
