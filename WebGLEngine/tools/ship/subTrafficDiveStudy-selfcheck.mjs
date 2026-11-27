// WebGLEngine/tools/ship/subTrafficDiveStudy-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subTrafficDiveStudy-selfcheck.mjs      (a few seconds: check 1 flies five stored flights)
//
// THE GATE OF tools/ship/subTrafficDiveStudy.mjs (FOLLOW-UP 8 of brain/SUB_FIELD_NAV_WIP.md):
//   1 THE SETS      HELD81 (7821-7880) shares no seed with any navigation set spent before it.
//   2 THE VERDICT   SUPPORTED needs ship collisions at most half the reference's, net gain >= 5 at p <= 0.10 and no exit; PARTLY is no exit and exactly one of the other two; else NOT.
//   3 THE CHECKS    each fails on its own break; any failure prints NOT WEIGHED; check 1 flown against FOLLOW-UP 7's stored flights, and a stored flight off by a tick caught.
//   4 THE COMMAND   --write only with held81; held81 writes every flight; held79 is labelled POST HOC.
//   5 THE SOURCE    no clock, no Math.random; the registered numbers.
// SABOTAGE LOG (2026-11-17; 5 mutants of tools/ship/subTrafficDiveStudy.mjs, each alone, restored byte-identical): Q1 the ship bar "no more" instead of "half" (3 red),
//   Q3 the copy check reading every arm's stored flights (1), Q4 NO CRUSH always true (1), Q5 --write allowed on HELD79 (1); Q2 PARTLY on "either" instead of "exactly one" is
//   EQUIVALENT (when both bars hold the verdict is SUPPORTED before PARTLY is asked).
"use strict";
import fs from "node:fs";
import * as T from "./subTrafficDiveStudy.mjs";
import * as D from "../../brain/subTrafficDive.mjs";
import * as H from "../../brain/subHardNav.mjs";
import * as P from "../../brain/subNavPlus.mjs";
import * as SN from "../../brain/subSensedNav.mjs";
import * as G from "../../brain/subGiveWay.mjs";
import * as W from "../../brain/subTurnSweep.mjs";
import * as NS from "./navEnergyStudy.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("subTrafficDiveStudy-selfcheck -- FOLLOW-UP 8's study\n");

sec("1. THE SETS");
{
    const spent = new Set([...Object.values(H.HARD_SETS).flat(), ...H.HELD5, ...Object.values(SN.SENSE_SETS).flat(), ...Object.values(P.PLUS_SETS).flat(), ...G.HELD78, ...W.HELD79, ...NS.SETS.held80]);
    for (let s = 9001; s <= 9040; s++) spent.add(s);
    ok("!! HELD81 is 7821-7880 and no seed of it was spent before (HELD4, HELD5, the sensed and plus sets, HELD73, HELD77, HELD78, HELD79, HELD80 after its amendment)", T.SETS.held81 === D.HELD81 && D.HELD81.every((s) => !spent.has(s)) && NS.SETS.held80.at(-1) === 7820);
    ok("  DEV and HELD79 are the earlier rounds' own", T.SETS.dev === D.DEV && T.SETS.held79 === W.HELD79);
}

const rec = (arm, seed, status, extra = {}) => ({ arm, seed, kind: D.KIND, status, reached: status === "reached", hit: status === "collided" ? "ship" : null, ticks: 100, path: 1, leastbadTicks: 0, diveTicks: 0, deepest: 20, ...extra });
// fn(arm, seed) -> status; `n` seeds
const resOf = (fn, n = 20) => Object.fromEntries(D.ARM_NAMES.map((a) => [a, Array.from({ length: n }, (_, i) => rec(a, i + 1, fn(a, i + 1)))]));
const ref = (s) => (s <= 10 ? "reached" : s <= 14 ? "collided" : "timeout");   // the reference: 10 reached, 4 ship collisions
sec("2. THE VERDICT");
{
    const v = (fn) => T.verdictOf(resOf((a, s) => (a === D.DESIGNATED ? fn(s) : ref(s))));
    const sup = v((s) => (s <= 16 ? "reached" : s <= 18 ? "collided" : "timeout"));   // net 6 of 6 (p 0.0312), 2 ship collisions of 4
    ok("!! SUPPORTED: net 6 (p 0.0312), ship collisions 2 against 4 (half), no exit", sup.verdict === "SUPPORTED" && sup.pair.net === 6 && sup.bars.ships && sup.bars.noExit, J(sup));
    const shipsOnly = v((s) => (s <= 12 ? "reached" : s <= 14 ? "collided" : "timeout"));   // net 2, collisions 2
    ok("!! no exit, collisions halved, gain missed: PARTLY SUPPORTED", shipsOnly.verdict === "PARTLY SUPPORTED" && shipsOnly.bars.ships && !shipsOnly.bars.gain);
    const gainOnly = v((s) => (s <= 16 ? "reached" : "collided"));   // net 6, collisions 4
    ok("!! no exit, the gain met, collisions not halved (4 against 4): PARTLY SUPPORTED", gainOnly.verdict === "PARTLY SUPPORTED" && gainOnly.bars.gain && !gainOnly.bars.ships);
    const exit = v((s) => (s <= 16 ? "reached" : s === 17 ? "left" : "timeout"));
    ok("!! one exit: NOT SUPPORTED whatever else holds", exit.verdict === "NOT SUPPORTED" && exit.bars.gain && exit.bars.ships);
    const neither = v((s) => ref(s));
    ok("!! no exit but neither bar (the reference's own flights): NOT SUPPORTED", neither.verdict === "NOT SUPPORTED" && !neither.bars.gain && !neither.bars.ships);
    const three = v((s) => (s <= 16 ? "reached" : s <= 19 ? "collided" : "timeout"));
    ok("  the ship bar is exactly half: 3 against 4 misses it (2 x 3 > 4), 2 against 4 meets it", !three.bars.ships && sup.bars.ships);
}

sec("3. THE CHECKS");
{
    const res = resOf((a, s) => (a === "sweep+leastbad" && s === 3 ? "collided" : a === "sweep+dive" && s === 4 ? "collided" : ref(s)));
    const bad = (o, r = res) => T.checksOf(r, { copy: true, n: 20, ...o }).filter((c) => !c.ok).map((c) => c.name);
    const shifted = { ...res, "sweep+dive": res["sweep+dive"].map((r) => ({ ...r, seed: r.seed + 1 })) }, idle = { ...res, "sweep+dive": res[D.REFERENCE].map((r) => ({ ...r, arm: "sweep+dive" })) }, crushed = { ...res, [D.DESIGNATED]: res[D.DESIGNATED].map((r, i) => (i === 5 ? { ...r, status: "crushed" } : r)) };
    ok("!! each check fails on its own break: copy -> THE COPY; a shifted arm -> SAME SCENARIOS; an option that changes nothing -> EACH OPTION BITES; a crushed flight -> NO CRUSH; all pass otherwise",
        bad({}).length === 0 && J(bad({ copy: false })) === J(["THE COPY"]) && J(bad({}, shifted)) === J(["SAME SCENARIOS"]) && J(bad({}, idle)) === J(["EACH OPTION BITES"]) && J(bad({}, crushed)) === J(["NO CRUSH"]));
    ok("!! a failed check prints NOT WEIGHED and no table", /VERDICT: NOT WEIGHED/.test(T.report(res, { copy: false, n: 20, set: "held81" }).join("\n")) && !/reached  collided/.test(T.report(res, { copy: false, n: 20, set: "held81" }).join("\n")));
    const stored = fs.readFileSync(new URL("../../brain/subTurnSweepHeld79.jsonl", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const real = T.copySame(stored), off = T.copySame(stored.map((r) => (r.arm === D.BASE && r.seed === 7603 ? { ...r, ticks: r.ticks + 1 } : r))), wrongArm = T.copySame(stored.map((r) => (r.arm === D.BASE ? { ...r, arm: "x" } : r.arm === "ref" ? { ...r, arm: D.BASE } : r)));
    ok("!! FLOWN: the reference reproduces FOLLOW-UP 7's stored designated flights on HELD79's first 5 seeds; a stored flight off by a tick, or another arm's flights, fail it", real === true && off === false && wrongArm === false, J([real, off, wrongArm]));
}

sec("4. THE COMMAND");
{
    const run = (argv) => { const out = [], errs = [], files = [], sets = []; const code = T.command(argv, { out: (m) => out.push(m), err: (m) => errs.push(m), writeFile: (f, t) => files.push([f, t]), flySet: (seeds) => { sets.push(seeds.length + ":" + seeds[0]); return resOf((a, s) => (a === "sweep+leastbad" && s === 3 ? "collided" : a === "sweep+dive" && s === 4 ? "collided" : ref(s)), seeds.length); }, copySame: () => true }); return { code, out: out.join("\n"), errs, files, sets }; };
    const d = run(["--set", "dev", "--write"]), p = run(["--set", "held79", "--write"]), h = run(["--set", "held81", "--write"]), q = run(["--set", "held79"]), none = run([]);
    ok("!! --write with DEV or HELD79 is refused (exit 2, nothing flown); no set prints the usage", d.code === 2 && d.sets.length === 0 && p.code === 2 && p.sets.length === 0 && none.code === 2 && /usage/.test(none.errs.join("")));
    ok("!! held81 flies 7821-7880 once and writes brain/subTrafficDiveHeld81.jsonl with all 240 flights, each carrying set held81", h.code === 0 && J(h.sets) === J(["60:7821"]) && h.files[0][0].replace(/\\/g, "/").endsWith("brain/subTrafficDiveHeld81.jsonl") && h.files[0][1].trim().split("\n").length === 240 && JSON.parse(h.files[0][1].split("\n")[0]).set === "held81");
    ok("!! held79 is labelled POST HOC and its verdict 'not a result', and nothing is written", q.code === 0 && /POST HOC: this set's collisions chose the fix; NOT a result/.test(q.out) && /VERDICT: .*\(not a result\)/.test(q.out) && q.files.length === 0);
}

sec("5. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./subTrafficDiveStudy.mjs", import.meta.url), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers: gain 5, p 0.10, five copy seeds, the files", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && T.GAIN === 5 && T.P_LEVEL === 0.10 && T.COPY_SEEDS === 5 && T.OUT_FILE === "brain/subTrafficDiveHeld81.jsonl" && T.STORED_79 === "brain/subTurnSweepHeld79.jsonl");
    ok("  signTest is FOLLOW-UP 6's (re-exported)", Math.abs(T.signTest(6, 6) - 0.03125) < 1e-12);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
