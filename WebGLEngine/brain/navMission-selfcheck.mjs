// WebGLEngine/brain/navMission-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/navMission-selfcheck.mjs      (about 20 s: the copy checks fly 10 legs three ways, and two missions fly)
//
// THE GATE OF brain/navMission.mjs AND tools/ship/navMissionStudy.mjs (PART 2 of brain/NAV_MISSIONS_WIP.md, registered before either, with its Amendment 1):
//   1 THE CONSTANTS  three legs, ECO 2.0 m/s, the leg caps (260 s; eco 390 s: the same 780 m budget), HELD83 7941-8000 (no seed spent before), the arms.
//   2 THE MISSION    W1 is the scenario's goal; W2 x 40-120; W3 x 280-400 on the side of y opposite W1; every waypoint r + 40 from every static obstacle and 40 from the one before;
//                    the same seed gives the same mission; the generator is seeded apart from the scenario's.
//   3 ONE LEG        a one-waypoint mission is flyHard's flight (status, ticks, path) and its energy PART 1's flyMetered's, each copied arm, on five DEV seeds.
//   4 THE LEGS       a mission switches waypoint on arrival and replans for the next on the next tick; legs counted; a completed mission reached all three in order.
//   5 THE BATTERY    a mission ends FLAT the tick its metered energy reaches the battery (a small battery, here), and the meter keeps running across legs.
//   6 ECO            only the commanded speed changes, only down, to ECO_SPEED.
//   7 THE VERDICT    SUPPORTED at net >= 5 and p <= 0.10; PARTLY at 3 or 4; NOT otherwise; HARMFUL at -5 or worse.
//   8 THE CHECKS AND THE COMMAND   each check fails on its own break; NOT WEIGHED on a failure; --write only with held83; a seed with no mission is skipped and reported.
//   9 THE SOURCE     no clock, no Math.random.
// SABOTAGE LOG (2026-11-17; 16 mutants of the module and the study, each alone, restored byte-identical): N1 W2 drawn to x 200 (1 red), N2 W3 on either side (1), N3 waypoints only
//   r clear of obstacles (1), N4 the leg clock never restarted (2), N6 no FLAT (1), N7 eco forcing 2 m/s even when slower (1), N8 eco's cap left at 260 s (1), N9 the first leg's
//   minDepth not flyHard's (2), N10 completed one leg early (1), N11 eco not applied (1), N13 PARTLY only at 5 (1), N15 --write allowed on DEV (1). FOUR READ 0 RED FIRST and got a row
//   each, then 1: N5 the plan not rebuilt for the next waypoint on arrival (the arm's 3 s replan hid it: a row now reads the target on leg 2's first tick), N12 the p bar dropped (the
//   first pattern did not match; re-run), N14 the energy check loosened to 10 percent (a 0.1 percent bias row), N16 skipped seeds never reported (a row hands flySet a generator
//   that fails one seed).
"use strict";
import fs from "node:fs";
import * as M from "./navMission.mjs";
import * as E from "./navEnergy.mjs";
import * as H from "./subHardNav.mjs";
import * as NP from "./subNavPlus.mjs";
import * as SN from "./subSensedNav.mjs";
import * as G from "./subGiveWay.mjs";
import * as W from "./subTurnSweep.mjs";
import * as D from "./subTrafficDive.mjs";
import * as P from "./subDeepTransit.mjs";
import * as MT from "./missionTask.mjs";
import * as AP from "./autopilotSub.mjs";
import * as T from "../tools/ship/navMissionStudy.mjs";
import * as NS from "../tools/ship/navEnergyStudy.mjs";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
console.log("navMission-selfcheck -- three-leg missions on one battery\n");

sec("1. THE CONSTANTS");
{
    const spent = new Set([...Object.values(H.HARD_SETS).flat(), ...H.HELD5, ...Object.values(SN.SENSE_SETS).flat(), ...Object.values(NP.PLUS_SETS).flat(), ...G.HELD78, ...W.HELD79, ...NS.SETS.held80, ...D.HELD81, ...P.HELD82]);
    for (let s = 9001; s <= 9040; s++) spent.add(s);
    ok("!! three legs, ECO_SPEED 2.0, legs of 260 s and eco's 390 s (Amendment 1: 260 x 3 / 2, the same distance budget); HELD83 7941-8000 spent by no set before (through HELD82); the arms",
        M.LEGS === 3 && M.ECO_SPEED === 2.0 && M.LEG_S === 260 && M.legSecondsOf("eco") === 390 && M.legSecondsOf(M.REFERENCE) === 260 && M.legSecondsOf("any+predict") === 260 && MT.CRUISE === 3 && M.HELD83.length === 60 && M.HELD83[0] === 7941 && M.HELD83[59] === 8000 && M.HELD83.every((s) => !spent.has(s))
        && M.REFERENCE === "any+predict+edge+yield" && M.DESIGNATED === "eco" && J(M.ARMS) === J({ "any+predict+edge+yield": { arm: "any+predict+edge+yield", eco: false }, "any+predict": { arm: "any+predict", eco: false }, eco: { arm: "any+predict+edge+yield", eco: true } }));
}

sec("2. THE MISSION");
{
    let shape = true, clear = true, built = 0;
    for (let s = 1; s <= 30; s++) {
        const m = M.missionOf(s); if (!m) continue; built++;
        const [w1, w2, w3] = m.waypoints, statics = m.sc.obstacles.filter((o) => !o.vx && !o.vy);
        shape = shape && J(w1) === J(m.sc.goal) && w2.x >= 40 && w2.x <= 120 && w3.x >= 280 && w3.x <= 400 && Math.abs(w2.y) <= 80 && (w1.y >= 0 ? w3.y <= 0 : w3.y >= 0) && [w2, w3].every((p) => p.depth >= 15 && p.depth <= 40);
        clear = clear && [w2, w3].every((p) => statics.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= o.r + 40)) && Math.hypot(w2.x - w1.x, w2.y - w1.y) >= 40 && Math.hypot(w3.x - w2.x, w3.y - w2.y) >= 40;
    }
    ok("!! on DEV's 30 seeds: W1 is the scenario's own goal, W2 at x 40-120, W3 at x 280-400 on the side of y opposite W1's, depths 15-40", shape && built >= 28, `${built} of 30 built`);
    ok("!! every drawn waypoint stands r + 40 m from every static obstacle and 40 m from the waypoint before it", clear);
    ok("  the same seed gives the same mission, and two seeds give different ones", J(M.missionOf(7).waypoints) === J(M.missionOf(7).waypoints) && J(M.missionOf(7).waypoints) !== J(M.missionOf(8).waypoints));
}

sec("3. ONE LEG");
{
    const cc = T.copyChecks();
    ok("!! a one-waypoint mission is flyHard's flight (status, ticks, path) on DEV seeds 1-5, for the reference and any+predict", cc.leg);
    ok("!! and its energy is PART 1's flyMetered's (1e-6 relative)", cc.meter);
    ok("!! the energy check is tight: the same missions with their energy 0.1 percent high fail it", T.copyChecks({ bias: 1.001 }).meter === false);
}

sec("4. THE LEGS AND 5. THE BATTERY");
{
    const m = M.missionOf(3), r = M.flyMission(m, "eco");
    ok("!! a completed mission reached all three waypoints in order: legs 3, three leg times summing to its time", r.status === "completed" && r.legs === 3 && r.legTimes.length === 3 && Math.abs(r.legTimes.reduce((a, b) => a + b, 0) - r.t) < 1e-6, `${r.status}, ${r.legTimes.map((x) => x.toFixed(0)).join("/")} s`);
    const two = M.flyMission(m, "eco", { waypoints: m.waypoints.slice(0, 2) });
    ok("!! the meter runs ACROSS legs: two waypoints use less energy than three, and a mission's energy grows with its legs", two.status === "completed" && two.legs === 2 && two.energy < r.energy && two.ticks < r.ticks);
    const small = M.flyMission(m, "eco", { battery: 0.25 * r.energy });
    ok("!! a battery a quarter of what the mission needs ends it FLAT, before it completes, with the battery at 0 and the energy just over the capacity (one tick's worth)", small.status === "flat" && !small.completed && small.battery === 0 && small.energy >= 0.25 * r.energy && small.energy < 0.25 * r.energy + 20000, `${small.status}, legs ${small.legs}`);
    // on arrival the plan is rebuilt for the NEXT waypoint at once: the target on the tick after W1 is reached points toward W2, not back at W1
    let leg1Done = false, after = null; const spy = (q, tg) => { if (leg1Done && after === null) after = { x: q.pos[0], y: q.pos[1], h: tg.heading }; if (!leg1Done && MT.reached(q, m.waypoints[0])) leg1Done = true; return { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }; };
    const rv = M.flyMission(m, "eco");   // the real flight, for where W1 is reached
    const spyMission = M.flyMission(m, "eco", { base: (q, tg, c) => { spy(q, tg); return AP.decide(q, tg, c); } });
    const toW2 = after ? Math.atan2(-(m.waypoints[1].y - after.y), m.waypoints[1].x - after.x) : null, off = after ? Math.abs(Math.atan2(Math.sin(after.h - toW2), Math.cos(after.h - toW2))) : null;
    ok("!! the plan is rebuilt for the next waypoint on arrival: on the first tick of leg 2 the target heads toward W2 (within 90 degrees of its bearing), not back to W1", after !== null && off < Math.PI / 2 && spyMission.legs >= 2 && rv.legs === 3, after ? `${((off * 180) / Math.PI).toFixed(0)} degrees off W2's bearing` : "no leg 2");
    let thrown = ""; try { M.flyMission(m, "nope"); } catch (e) { thrown = e.message; }
    ok("  an unknown arm throws by name", /unknown arm "nope"/.test(thrown));
}

sec("6. ECO");
{
    const seen = [], base = (s, t) => { seen.push(t); return "cmd"; }, p = M.ecoPilot(base), t3 = { heading: 1, depth: 20, speed: 3 }, t1 = { heading: 1, depth: 20, speed: 1.5 };
    p(null, t3); p(null, t1);
    ok("!! eco caps ONLY the speed, ONLY down: 3 -> 2.0, heading and depth kept; 1.5 passes untouched", J(seen[0]) === J({ heading: 1, depth: 20, speed: 2 }) && seen[1] === t1);
}

const rec = (arm, seed, status, legs = status === "completed" ? 3 : 1) => ({ arm, seed, kind: M.KIND, status, completed: status === "completed", legs, legTimes: [], t: null, path: 1, energy: 1e6, battery: 0.5, ticks: 100 });
const ref = (s) => (s <= 10 ? "completed" : "flat");
const resOf = (fn, n = 20) => Object.fromEntries(M.ARM_NAMES.map((a) => [a, Array.from({ length: n }, (_, i) => rec(a, i + 1, a === M.DESIGNATED ? fn(i + 1) : ref(i + 1)))]));
sec("7. THE VERDICT");
{
    const v = (fn) => T.verdictOf(resOf(fn));
    // split(a, b): a missions only eco completes, b only the reference; no others completed -- the paired split is exactly a to b
    const split = (a, b) => Object.fromEntries(M.ARM_NAMES.map((arm) => [arm, Array.from({ length: a + b }, (_, k) => rec(arm, k + 1, (arm === M.DESIGNATED ? k < a : arm === M.REFERENCE ? k >= a : false) ? "completed" : "flat"))]));
    ok("!! SUPPORTED at net 6 of 6 (p 0.0312); net 6 as 10 to 4 (p 0.18) misses the p and is PARTLY SUPPORTED; 9 to 4 (net 5, p 0.27) is PARTLY too", v((s) => (s <= 16 ? "completed" : "flat")).verdict === "SUPPORTED" && T.verdictOf(split(10, 4)).verdict === "PARTLY SUPPORTED" && T.verdictOf(split(10, 4)).pair.p > 0.1 && T.verdictOf(split(9, 4)).verdict === "PARTLY SUPPORTED");
    ok("!! net 3 or 4: PARTLY SUPPORTED; net 2: NOT SUPPORTED; net -6: NOT SUPPORTED and HARMFUL", v((s) => (s <= 13 ? "completed" : "flat")).verdict === "PARTLY SUPPORTED" && v((s) => (s <= 14 ? "completed" : "flat")).verdict === "PARTLY SUPPORTED" && v((s) => (s <= 12 ? "completed" : "flat")).verdict === "NOT SUPPORTED" && v((s) => (s <= 4 ? "completed" : "flat")).harmful && !v((s) => (s <= 6 ? "completed" : "flat")).harmful);
}

sec("8. THE CHECKS AND THE COMMAND");
{
    const res = resOf((s) => (s <= 12 ? "completed" : "flat")), bad = (o, r = res) => T.checksOf(r, { leg: true, meter: true, n: 20, ...o }).filter((c) => !c.ok).map((c) => c.name);
    const shifted = { ...res, "any+predict": res["any+predict"].map((r) => ({ ...r, seed: r.seed + 1 })) }, idle = { ...res, eco: res[M.REFERENCE].map((r) => ({ ...r, arm: "eco" })) };
    ok("!! each check fails on its own break; all pass otherwise; a failure prints NOT WEIGHED", bad({}).length === 0 && J(bad({ leg: false })) === J(["ONE LEG IS flyHard"]) && J(bad({ meter: false })) === J(["THE METER IS PART 1's"]) && J(bad({}, shifted)) === J(["SAME SCENARIOS"]) && J(bad({}, idle)) === J(["ECO BITES"]) && /VERDICT: NOT WEIGHED/.test(T.report({ res, skipped: [] }, { leg: false, meter: true, set: "held83" }).join("\n")));
    const run = (argv) => { const out = [], errs = [], files = [], sets = []; const code = T.command(argv, { out: (m) => out.push(m), err: (m) => errs.push(m), writeFile: (f, t) => files.push([f, t]), flySet: (seeds) => { sets.push(seeds.length + ":" + seeds[0]); return { res: resOf((s) => (s <= 12 ? "completed" : "flat"), seeds.length - 1), skipped: [seeds[3]] }; }, copyChecks: () => ({ leg: true, meter: true }) }); return { code, out: out.join("\n"), errs, files, sets }; };
    const d = run(["--set", "dev", "--write"]), h = run(["--set", "held83", "--write"]);
    ok("!! --write with DEV is refused (exit 2, nothing flown); held83 flies 7941-8000 once and writes brain/navMissionHeld83.jsonl with every mission (3 x 59), each carrying set held83; a skipped seed is reported by number",
        d.code === 2 && d.sets.length === 0 && h.code === 0 && J(h.sets) === J(["60:7941"]) && h.files[0][0].endsWith("brain/navMissionHeld83.jsonl") && h.files[0][1].trim().split("\n").length === 177 && JSON.parse(h.files[0][1].split("\n")[0]).set === "held83" && /1 seed\(s\) with no mission, skipped: 7944/.test(h.out));
    const fs3 = T.flySet([1, 2, 3], { fly: (m, a) => ({ seed: m.seed, arm: a }), missionOf: (sd) => (sd === 2 ? null : M.missionOf(sd)) });
    ok("!! a seed whose waypoints cannot be placed is skipped for EVERY arm and reported by number", J(fs3.skipped) === J([2]) && M.ARM_NAMES.every((a) => J(fs3.res[a].map((r) => r.seed)) === J([1, 3])));
    const fs2 = T.flySet([1, 2], { fly: (m, a) => ({ seed: m.seed, arm: a }) });
    ok("  flySet builds each seed's mission once and flies every arm on it, in seed order", J(fs2.res.eco.map((r) => r.seed)) === J([1, 2]) && fs2.skipped.length === 0 && Object.keys(fs2.res).length === 3);
}

sec("9. THE SOURCE");
{
    const code = [new URL("./navMission.mjs", import.meta.url), new URL("../tools/ship/navMissionStudy.mjs", import.meta.url)].map((u) => fs.readFileSync(u, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")).join("\n");
    ok("!! no clock and no Math.random; the registered numbers (gain 5, partly 3, harmful -5, p 0.10, the file)", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && T.GAIN === 5 && T.PARTLY === 3 && T.HARMFUL === -5 && T.P_LEVEL === 0.10 && T.OUT_FILE === "brain/navMissionHeld83.jsonl" && E.BATTERY_J === 3e6);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exitCode = fails ? 1 : 0;
