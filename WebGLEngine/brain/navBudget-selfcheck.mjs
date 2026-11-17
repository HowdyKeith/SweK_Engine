// WebGLEngine/brain/navBudget-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/navBudget-selfcheck.mjs      (about 20 s: the table is re-measured and a few missions fly)
//
// THE GATE OF PART 3 of brain/NAV_MISSIONS_WIP.md (registered before the code): brain/navMission.mjs's `budget` arm and tools/ship/navBudgetStudy.mjs.
//   1 THE CONSTANTS  speeds 3.0 / 2.5 / 2.0 / 1.5, the measured table, DETOUR 1.35, budget's leg cap 520 s, HELD84 8001-8060 (no seed spent before), PART 2's arms unchanged.
//   2 THE CHOICE     distanceToGo is the straight line to the current waypoint plus the legs after it; budgetSpeed is the FASTEST speed whose J/m x distance x DETOUR fits, at the
//                    boundary exactly, else the slowest.
//   3 THE FLIGHT     budget only caps the speed (never raises it); it decides at the start, at every replan and at every new leg, from the energy LEFT; eco and the reference are untouched.
//   4 THE VERDICT    SUPPORTED needs not worse by more than 2 AND 10 percent faster on the missions both complete; PARTLY one; NOT neither.
//   5 THE CHECKS AND THE COMMAND   the table re-measured within 2 percent; each check fails on its own break; --write only with held84.
//   6 THE SOURCE     no clock, no Math.random.
// SABOTAGE LOG (2026-11-17; 14 mutants of brain/navMission.mjs and tools/ship/navBudgetStudy.mjs, each alone, restored byte-identical): B1 DETOUR dropped (1 red), B2 the boundary
//   exclusive (1), B3 the fallback the fastest (2), B4 a leg left out of the distance to go (1), B6 the battery taken as full every time (1), B7 no decision at a replan (2), B8 budget's leg
//   cap 260 s (1), B9 not worse by 0 (3), B10 any speed-up counts (1), B11 the time over budget's completions only (1), B12 the table never checked (1), B14 --write on DEV (1).
//   TWO READ 0 RED FIRST and got a row each, then 1: B5 the cap RAISING a slower target to it (a row: a battery so rich that 3 m/s always fits makes budget the reference exactly),
//   B13 the copy check not filtering by arm (it held only because eco's lines come last in the file: a row now reverses the file).
"use strict";
import fs from "node:fs";
import * as M from "./navMission.mjs";
import * as H from "./subHardNav.mjs";
import * as NP from "./subNavPlus.mjs";
import * as SN from "./subSensedNav.mjs";
import * as G from "./subGiveWay.mjs";
import * as W from "./subTurnSweep.mjs";
import * as D from "./subTrafficDive.mjs";
import * as P from "./subDeepTransit.mjs";
import * as AP from "./autopilotSub.mjs";
import * as T from "../tools/ship/navBudgetStudy.mjs";
import * as NS from "../tools/ship/navEnergyStudy.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("navBudget-selfcheck -- a speed chosen from the battery\n");

sec("1. THE CONSTANTS");
{
    const spent = new Set([...Object.values(H.HARD_SETS).flat(), ...H.HELD5, ...Object.values(SN.SENSE_SETS).flat(), ...Object.values(NP.PLUS_SETS).flat(), ...G.HELD78, ...W.HELD79, ...NS.SETS.held80, ...D.HELD81, ...P.HELD82, ...M.HELD83]);
    for (let s = 9001; s <= 9040; s++) spent.add(s);
    ok("!! the speeds (fastest first), the measured table, DETOUR 1.35, budget's leg cap 520 s (260 x 3 / 1.5); HELD84 8001-8060 spent by no set before (through HELD83)",
        J(M.BUDGET_SPEEDS) === J([3, 2.5, 2, 1.5]) && J(M.BUDGET_JPM) === J({ 2: 1259, 3: 2675, 2.5: 1891, 1.5: 785 }) && M.DETOUR === 1.35 && M.legSecondsOf("budget") === 520 && T.SETS.held84.length === 60 && T.SETS.held84[0] === 8001 && T.SETS.held84[59] === 8060 && T.SETS.held84.every((s) => !spent.has(s)));
    ok("!! PART 2's arms are untouched (budget is NOT among them, so PART 2's study flies what it registered); flyMission takes budget by name", J(M.ARM_NAMES) === J(["any+predict+edge+yield", "any+predict", "eco"]) && J(M.ALL_ARMS.budget) === J({ arm: "any+predict+edge+yield", eco: false, budget: true }) && M.legSecondsOf("eco") === 390 && M.legSecondsOf("any+predict") === 260);
}

sec("2. THE CHOICE");
{
    const wps = [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    ok("!! distanceToGo: the straight line to the current waypoint plus the legs after it (from the origin on leg 0: 100 + 100 + 100; on leg 2: 100 from (0, 0))", M.distanceToGo(0, 0, wps, 0) === 300 && M.distanceToGo(0, 0, wps, 2) === 100 && M.distanceToGo(100, 0, wps, 1) === 200);
    const need = (v, d) => M.BUDGET_JPM[v] * d * M.DETOUR;
    ok("!! budgetSpeed is the FASTEST that fits: exactly enough for 3.0 at 1,000 m gives 3.0; a joule less gives 2.5; exactly enough for 1.5 gives 1.5; nothing fits gives 1.5",
        M.budgetSpeed(need(3, 1000), 1000) === 3 && M.budgetSpeed(need(3, 1000) - 1, 1000) === 2.5 && M.budgetSpeed(need(2, 1000), 1000) === 2 && M.budgetSpeed(need(1.5, 1000), 1000) === 1.5 && M.budgetSpeed(10, 1000) === 1.5 && M.budgetSpeed(3e6, 0) === 3);
}

sec("3. THE FLIGHT");
{
    const m = M.missionOf(3), seen = [], base = (s, t, c) => { seen.push(t.speed); return AP.decide(s, t, c); };
    const b = M.flyMission(m, "budget", { base }), e = M.flyMission(m, "eco"), r = M.flyMission(m, "any+predict+edge+yield");
    ok("!! budget only ever caps the speed: every commanded speed is at most the cruise of 3 m/s and at least 1.5 (the slowest it may choose), and it decided more than once", seen.every((v) => v <= 3 + 1e-12 && v >= 1.5 - 1e-12) && b.speeds.length > 3 && b.speeds.every((v) => M.BUDGET_SPEEDS.includes(v)), `${b.speeds.length} decisions: ${[...new Set(b.speeds)].join(", ")}`);
    const toGo0 = M.distanceToGo(m.sc.start.x, m.sc.start.y, m.waypoints, 0);
    ok("!! its first decision is from a full battery and the whole route: budgetSpeed(3 MJ, the distance to go from the start)", b.speeds[0] === M.budgetSpeed(3e6, toGo0), `${b.speeds[0]} m/s for ${toGo0.toFixed(0)} m`);
    const ticksPerReplan = Math.round(H.REPLAN_S / (1 / 30)), legsDone = b.legs;
    ok("!! it decides at the start, at every replan and at every new leg (decisions = 1 + replans + new legs, give or take the last partial replan)", Math.abs(b.speeds.length - (1 + Math.floor((b.ticks - legsDone) / ticksPerReplan) + Math.min(legsDone, 2))) <= 3, `${b.speeds.length} decisions over ${b.ticks} ticks, ${legsDone} legs`);
    const e2 = M.flyMission(m, "eco"), r2 = M.flyMission(m, "any+predict+edge+yield");
    ok("!! eco and the reference are untouched by the budget arm's existence (each flies the same twice; neither carries speeds)", J(e) === J(e2) && J(r) === J(r2) && e.speeds === undefined && r.speeds === undefined);
    const rich = M.flyMission(m, "budget", { battery: 1e12 }), ref = M.flyMission(m, "any+predict+edge+yield", { battery: 1e12, legSeconds: 520 });
    ok("!! with a battery so large that 3 m/s always fits, budget IS the reference (status, ticks, path): it never raises a slower target (the yield's 2 m/s) to its cap", rich.status === ref.status && rich.ticks === ref.ticks && rich.path === ref.path && rich.speeds.every((v) => v === 3), `${rich.status} ${rich.ticks} / ${ref.status} ${ref.ticks}`);
    const poor = M.flyMission(m, "budget", { battery: 0.6e6 });
    ok("!! a poor battery makes it choose slowly: with 0.6 MJ every decision is 1.5 m/s (no speed's budget fits)", poor.speeds.every((v) => v === 1.5), `${[...new Set(poor.speeds)].join(", ")}`);
}

const rec = (arm, seed, status, t = 600) => ({ arm, seed, status, completed: status === "completed", legs: status === "completed" ? 3 : 1, t: status === "completed" ? t : null, path: 1, energy: 1e6, battery: 0.3, ticks: 100 });
const resOf = (fb, fe, n = 20) => ({ "any+predict+edge+yield": Array.from({ length: n }, (_, i) => rec("r", i + 1, "flat")), eco: Array.from({ length: n }, (_, i) => rec("eco", i + 1, ...fe(i + 1))), budget: Array.from({ length: n }, (_, i) => rec("budget", i + 1, ...fb(i + 1))) });
sec("4. THE VERDICT");
{
    const V = (fb, fe) => T.verdictOf(resOf(fb, fe));
    const eco = (s) => (s <= 15 ? ["completed", 600] : ["flat"]);
    ok("!! SUPPORTED: budget completes 14 against eco's 15 (not worse by more than 2) and in 540 s against 600 (exactly 10 percent faster)", V((s) => (s <= 14 ? ["completed", 540] : ["flat"]), eco).verdict === "SUPPORTED");
    ok("!! PARTLY: 13 against 15 at 541 s (not worse, not 10 percent faster); or 12 against 15 at 400 s (faster, but 3 worse)", V((s) => (s <= 13 ? ["completed", 541] : ["flat"]), eco).verdict === "PARTLY SUPPORTED" && V((s) => (s <= 12 ? ["completed", 400] : ["flat"]), eco).verdict === "PARTLY SUPPORTED");
    ok("!! NOT: 12 against 15 and no faster", V((s) => (s <= 12 ? ["completed", 600] : ["flat"]), eco).verdict === "NOT SUPPORTED");
    ok("  the time is compared only on the missions BOTH complete: budget's extra completions do not lower its median", (() => { const v = V((s) => (s <= 20 ? ["completed", s <= 15 ? 600 : 100] : ["flat"]), eco); return v.both === 15 && v.tb === 600 && !v.faster; })());
}

sec("5. THE CHECKS AND THE COMMAND");
{
    const mt = T.measureTable();
    ok("!! THE TABLE IS THE MODEL'S: re-measured, each J/m within 2 percent; a table 3 percent off fails", T.tableOk(mt) && !T.tableOk({ ...mt, 2: mt[2] * 1.03 }), J(Object.fromEntries(Object.entries(mt).map(([k, v]) => [k, Math.round(v)]))));
    const res = resOf((s) => (s <= 14 ? ["completed", 540] : ["flat"]), (s) => (s <= 15 ? ["completed", 600] : ["flat"])), bad = (o, r = res) => T.checksOf(r, { copy: true, table: true, n: 20, ...o }).filter((c) => !c.ok).map((c) => c.name);
    const idle = { ...res, budget: res.eco.map((r) => ({ ...r, arm: "budget" })) }, shifted = { ...res, eco: res.eco.map((r) => ({ ...r, seed: r.seed + 1 })) };
    ok("!! each check fails on its own break; NOT WEIGHED on a failure", bad({}).length === 0 && J(bad({ copy: false })) === J(["THE COPY"]) && J(bad({ table: false })) === J(["THE TABLE IS THE MODEL'S"]) && J(bad({}, shifted)) === J(["SAME SCENARIOS"]) && J(bad({}, idle)) === J(["BUDGET BITES"]) && /VERDICT: NOT WEIGHED/.test(T.report({ res, skipped: [] }, { copy: false, table: true, set: "held84" }).join("\n")));
    const stored = fs.readFileSync(new URL("./navMissionHeld83.jsonl", import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    ok("!! FLOWN: eco reproduces PART 2's stored HELD83 eco missions on its first 5 seeds, whatever order the file is in; one off by a tick fails it", T.copySame(stored) === true && T.copySame(stored.slice().reverse()) === true && T.copySame(stored.map((r) => (r.arm === "eco" && r.seed === 7942 ? { ...r, ticks: r.ticks + 1 } : r))) === false);
    const run = (argv) => { const out = [], files = [], sets = []; const code = T.command(argv, { out: (m) => out.push(m), err: () => {}, writeFile: (f, t) => files.push([f, t]), flySet: (seeds) => { sets.push(seeds.length + ":" + seeds[0]); return { res: resOf((s) => (s <= 14 ? ["completed", 540] : ["flat"]), (s) => (s <= 15 ? ["completed", 600] : ["flat"]), seeds.length), skipped: [] }; }, copySame: () => true, tableOk: () => true }); return { code, out: out.join("\n"), files, sets }; };
    const d = run(["--set", "dev", "--write"]), h = run(["--set", "held84", "--write"]);
    ok("!! --write with DEV is refused (exit 2, nothing flown); held84 flies 8001-8060 once and writes brain/navBudgetHeld84.jsonl with all 180 missions", d.code === 2 && d.sets.length === 0 && h.code === 0 && J(h.sets) === J(["60:8001"]) && h.files[0][0].endsWith("brain/navBudgetHeld84.jsonl") && h.files[0][1].trim().split("\n").length === 180 && /VERDICT: SUPPORTED/.test(h.out));
    const fs3 = T.flySet([1, 2, 3], { fly: (m, a) => ({ seed: m.seed, arm: a }), missionOf: (sd) => (sd === 2 ? null : M.missionOf(sd)) });
    ok("  a seed with no mission is skipped for every arm and reported", J(fs3.skipped) === J([2]) && T.ARMS.every((a) => J(fs3.res[a].map((r) => r.seed)) === J([1, 3])));
}

sec("6. THE SOURCE");
{
    const code = [new URL("./navMission.mjs", import.meta.url), new URL("../tools/ship/navBudgetStudy.mjs", import.meta.url)].map((u) => fs.readFileSync(u, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers (not worse by 2, 10 percent faster, 2 percent table, the files)", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && T.NOT_WORSE === 2 && T.FASTER === 0.10 && T.TABLE_TOL === 0.02 && T.OUT_FILE === "brain/navBudgetHeld84.jsonl" && T.STORED_83 === "brain/navMissionHeld83.jsonl");
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
