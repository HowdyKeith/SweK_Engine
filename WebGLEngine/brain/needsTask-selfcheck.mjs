// WebGLEngine/brain/needsTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/needsTask-selfcheck.mjs      (~13.5s -- measured 13.4-13.7 s alone at v4905)
//
// THE SURVEY RUN (brain/needsTask.mjs; the task, the baselines and the validity rows were written first, in brain/NEEDS_AND_LIMITS.md "Round 2"). This gate holds the MECHANICS and the first half of the task-validity rows (kinds plain and deep);
// brain/needsTaskValidity-selfcheck.mjs holds the second half (far and both). NO PILOT IS LEARNED: the baselines are rules. The audit set is NOT read here or anywhere (it is piece 4's).
//   1  SCENARIOS   a kind and a seed always make the same one; an unknown kind throws; the first station is always within reach; `unreachable` follows the stated rule (depth - 4 m over 0.9 of the damaged collapse depth)
//   2  THE RUN     deterministic bytes; the capture window is 8 m across and 4 m of depth; the score is the stated formula and a crushed boat is 0; a run of a pilot sent past the collapse depth ends crushed with score 0
//   3  V2 PLAIN    when nothing is in conflict DIRECT, TRIP, HULLONLY and GUARDED visit 3 of 3 and score over 0.95; the SAFE HARBOUR (SPIN) scores 0.55 +- 0.05 and visits none
//   4  V3 DEEP     the hull is a need: DIRECT is crushed in at least 3 of 8, HULLONLY beats it by more than max(0.03, 2 se), GUARDED is crushed in none
//   5  V7          a pilot is not charged for a station the damaged hull cannot take: `visited / reachable` ignores the unreachable ones
// HOW THIS WAS CALIBRATED, SAID PLAINLY: the scenario ranges (the station radii, the start charge, the score weights) and the baselines were adjusted over five runs of BASELINE_SET (seeds 501-508) until the rows below held; each change and its reason is in
// NEEDS_AND_LIMITS.md. So these rows say the task has the intended shape ON THOSE SEEDS; they are not evidence that it generalises, and the TRAIN, HELD_OUT and AUDIT sets (other seeds) have not been read by anything.
//
// SABOTAGE LOG (each applied in place to brain/needsTask.mjs, BOTH needsTask gates run, the file restored md5-identical; reds in brackets as gate 1 / gate 2): capture across 8 -> 80 [2 / 5] | capture depth 4 -> 40 [3 / 0] | return depth 3 -> 30 [1 / 1] |
// visited weight doubled [1 / 3] | a crushed boat not zeroed [2 / 0] | `unreachable` never set [2 / 0] | HULL_DEPTH 0.9 -> 1.5 [3 / 2] | GUARDED without the pump [3 / 5] | GUARDED without repair [1 / 0] | GUARDED without the trip [1 / 6] | SPIN without the pump [0 / 1] |
// the first station not clamped into reach [1 / 1] | `stranded` never true [0 / 1] | RISE_RATE 0.4 -> 4 [1 / 4] | the plain kind not on a full charge [2 / 0] | TRIP back to needsPilot's 0.9 [0 / 1] | GUARDED farthest first [4 / 2] | DIRECT taking the stations last-first [1 / 0] | the hull term ignored [1 / 0].
// FIRST RUNS WENT 0 RED for three, and the rows were written because of them: `returned` at 30 m (nothing tested the 3 m line: the order / returned rows), DIRECT's station order (the means did not care: the order row), and the hull term (SPIN repairs to full so hull was 1 whatever the formula: the no-repair row). A fourth 0 was a mutant that never applied (the string was not in the file) and was re-run.
"use strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as T from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as AS from "./autopilotSub.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t) => Math.abs(a - b) <= t, J = JSON.stringify;
const M = T.model();
console.log("needsTask-selfcheck -- the survey run: scenarios, the run, and the first half of the task's validity\n");

console.log("1. SCENARIOS");
{
    const a = JSON.stringify(T.scenario(7, "both")), b = JSON.stringify(T.scenario(7, "both"));
    ok("!! a kind and a seed always make the same scenario, and a different seed or kind makes a different one", a === b && a !== JSON.stringify(T.scenario(8, "both")) && a !== JSON.stringify(T.scenario(7, "deep")));
    ok("!! an unknown kind throws, a scenario is frozen with three stations, and the four kinds are the four stated", (() => { try { T.scenario(1, "nope"); return false; } catch { return true; } })() && Object.isFrozen(T.scenario(1, "plain")) && T.scenario(1, "plain").stations.length === 3 && T.KINDS.join() === "plain,deep,far,both");
    let first = true, rule = true, plainSound = true, ranges = true;
    for (const k of T.KINDS) for (let s = 1; s <= 60; s++) {
        const sc = T.scenario(s, k), cd = N.collapseDepth(M, sc.damage0, T.CRUSH);
        if (sc.stations[0].unreachable) first = false;
        for (const q of sc.stations) if (q.unreachable !== (q.depth - T.CAPTURE.depth > T.HULL_DEPTH * cd)) rule = false;
        if (k === "plain" && (sc.damage0 !== 0 || sc.frac0 !== 1)) plainSound = false;
        if ((k === "deep" || k === "both") !== (sc.damage0 >= 0.2 && sc.damage0 <= 0.5)) ranges = false;
    }
    ok("!! over 240 scenarios the first station is always within reach, `unreachable` is exactly depth - 4 over 0.9 of the damaged collapse depth, `plain` is a sound hull on a full charge, and only deep and both are damaged (0.2 to 0.5)", first && rule && plainSound && ranges);
}

console.log("\n2. THE RUN");
{
    const sc = T.scenario(501, "plain"), r1 = T.fly(T.GUARDED, sc), r2 = T.fly(T.GUARDED, sc);
    ok("!! a run is deterministic: the same pilot on the same scenario gives the same fingerprint and score, and a different pilot a different one", r1.fingerprint === r2.fingerprint && r1.score === r2.score && r1.fingerprint !== T.fly(T.SPIN, sc).fingerprint, `${r1.fingerprint}`);
    // the capture window, on custom scenarios and a pilot that does nothing for 3 s (the boat starts at the origin, 2 m/s along +x, at depth0)
    const idle = () => () => ({ pitch: 0, yaw: 0, thrust: 0, ballast: 0 }), hold = (stations) => T.fly(idle, { seed: 0, kind: "plain", depth0: 15, damage0: 0, frac0: 1, stations }, { seconds: 3 });
    const st = (x, y, depth) => Object.freeze({ x, y, depth, unreachable: false });
    ok("!! the capture window is 8 m across and 4 m of depth: a station 7.5 m to the side and 3.5 m deeper is visited, 9 m to the side is not, 5 m deeper is not", hold([st(0, 7.5, 18.5)]).visited === 1 && hold([st(0, 9, 15)]).visited === 0 && hold([st(0, 0, 20)]).visited === 0, `${hold([st(0, 7.5, 18.5)]).visited}/${hold([st(0, 9, 15)]).visited}/${hold([st(0, 0, 20)]).visited}`);
    const f = (o) => T.scoreOf({ seen: 3, reachable: 3, returned: true, hull: 1, crushed: false, ...o });
    ok("!! the score is 0.45 x visited/reachable + 0.45 x returned + 0.1 x hull: 1 for a perfect run, 0.55 for none visited but home, 0.45 for all visited and lost, and 0 for a crushed boat whatever it did", near(f({}), 1, 1e-12) && near(f({ seen: 0 }), 0.55, 1e-12) && near(f({ returned: false }), 0.55, 1e-12) && near(f({ seen: 0, returned: false }), 0.1, 1e-12) && f({ crushed: true }) === 0 && near(f({ hull: 0 }), 0.9, 1e-12) && near(f({ seen: 0, reachable: 0 }), 1, 1e-12));
    const dive = () => { const p = AS.pilot({ model: M }); return (s, o, c) => p(s, { depth: 90, heading: 0, speed: 2.5 }, c); }, d = T.fly(dive, T.scenario(501, "both"));
    ok("!! a pilot sent past the collapse depth ends crushed, scores 0, and is not counted as stranded", d.crushed && d.status === "crushed" && d.score === 0 && !d.stranded && d.tEnd < T.SECONDS, `${d.status} at ${d.tEnd.toFixed(0)} s, strain ${d.maxStrain.toFixed(2)}`);
    // the order the pilots take the stations in: DIRECT as listed (even when another is nearer), GUARDED nearest first
    { const sq = (x, y, d) => Object.freeze({ x, y, depth: d, unreachable: false }), two = { seed: 0, kind: "plain", depth0: 15, damage0: 0, frac0: 1, stations: Object.freeze([sq(0, 120, 20), sq(60, 0, 20)]) };
      const order = (f) => { const seen = []; T.fly(f, two, { seconds: 200, onTick: (t, st, nd, c, v) => { v.forEach((x, i) => { if (x && !seen.includes(i)) seen.push(i); }); } }); return seen.join(); };
      ok("!! DIRECT takes the stations in the order listed (the far one first even with a nearer one beside it) and GUARDED takes the nearest first", order(T.DIRECT) === "0,1" && order(T.GUARDED) === "1,0", `DIRECT ${order(T.DIRECT)}, GUARDED ${order(T.GUARDED)}`); }
    // `returned` means centre under 3 m at the end: a pilot that holds 10 m has not returned, one that goes up has
    { const hold10 = () => { const p = AS.pilot({ model: M }); return (s, o, c) => p(s, { depth: 10, heading: 0, speed: 2.5 }, c); }, a = T.fly(hold10, T.scenario(501, "plain"), { seconds: 120 }), b = T.fly(T.SPIN, T.scenario(501, "plain"));
      ok("!! `returned` is a centre under 3 m at the end: holding 10 m is not home, the safe harbour is", !a.returned && b.returned && a.score < 0.5 && b.score > 0.5, `hold ${a.score.toFixed(2)}, SPIN ${b.score.toFixed(2)}`); }
    // the hull term is the damage the RUN caused: a pilot that works the deep stations without ever repairing ends with damage over where it began, and the score says so
    { const noRepair = (ctx) => { const p = T.GUARDED(ctx); return (s, o, c) => ({ ...p(s, o, c), repair: 0 }); }, sc = T.scenario(502, "deep"), q = T.fly(noRepair, sc);
      ok("!! the hull term is 1 - (damage at the end - damage at the start)/0.5: a GUARDED that never repairs ends more damaged than it began and its hull term is under 1, equal to that formula", q.damageEnd > q.damage0 + 0.01 && q.hull < 1 && Math.abs(q.hull - Math.max(0, Math.min(1, 1 - (q.damageEnd - q.damage0) / 0.5))) < 1e-12, `damage ${q.damage0.toFixed(3)} -> ${q.damageEnd.toFixed(3)}, hull ${q.hull.toFixed(3)}`); }
    ok("!! a run reports its parts: the charge never leaves [0, 1], the damage is the hull's, and a boat that never dived is home at the end", r1.energyEnd >= 0 && r1.energyEnd <= 1 && r1.minEnergy <= r1.energyEnd + 1e-9 && r1.damage0 === 0 && r1.returned && r1.hull === 1);
}

// the exports a gate has to NAME (the definition census): the constants and the sets, each of the stated shape
{
    const { DT, SECONDS, CAPTURE, STATIONS, CLASS, RETURN_DEPTH, SPEED, TRIP_AT, HULL_DEPTH, RISE_RATE, RISE_MARGIN, KINDS, SPEC, PILOTS, TRAIN_SET, HELD_OUT_SET, AUDIT_SET, BASELINE_SET, evaluate, paired, setOf, model } = T;
    const sets = [TRAIN_SET, HELD_OUT_SET, AUDIT_SET, BASELINE_SET], seeds = (set) => new Set(set.map((x) => x.seed)), over = (a, b) => [...seeds(a)].some((x) => seeds(b).has(x));
    ok("!! the constants are the stated ones: 30 ticks a second, 600 s, 3 stations, a battery hull with a 60 m crush, 2.5 m/s, the trip at 0.3 / 0.6, strain 0.9, a rise of 0.4 m/s with 20 s slack, a six-level bottle", DT === 1 / 30 && SECONDS === 600 && STATIONS === 3 && CLASS === "battery" && SPEED === 2.5 && TRIP_AT.low === 0.3 && TRIP_AT.high === 0.6 && HULL_DEPTH === 0.9 && RISE_RATE === 0.4 && RISE_MARGIN === 20 && RETURN_DEPTH === 3 && CAPTURE.across === 8 && CAPTURE.depth === 4 && SPEC.airMax === 6 && SPEC.seabed === 400 && Object.isFrozen(SPEC) && T.CRUSH === 60 && model() === model());
    ok("!! the pilots are the five stated, the kinds the four, and evaluate / paired / setOf are functions", Object.keys(PILOTS).join() === "SPIN,DIRECT,TRIP,HULLONLY,GUARDED" && Object.isFrozen(PILOTS) && KINDS.length === 4 && [evaluate, paired, setOf].every((f) => typeof f === "function"));
    ok("!! the four sets are of four kinds each, frozen, and on DISJOINT seeds (so the audit set can stay unread): train 1-10, held-out 11-20, audit 51-62, baseline 501-508", sets.every((x) => Object.isFrozen(x) && x.length % 4 === 0) && !over(TRAIN_SET, HELD_OUT_SET) && !over(TRAIN_SET, AUDIT_SET) && !over(TRAIN_SET, BASELINE_SET) && !over(HELD_OUT_SET, AUDIT_SET) && !over(HELD_OUT_SET, BASELINE_SET) && !over(AUDIT_SET, BASELINE_SET) && TRAIN_SET.length === 40 && HELD_OUT_SET.length === 40 && AUDIT_SET.length === 48 && BASELINE_SET.length === 32);
}

const plain = T.setOf(["plain"], 501, 508), deep = T.setOf(["deep"], 501, 508);
const E = (f, set) => T.evaluate(f, set), se2 = (p) => Math.max(0.03, 2 * p.se);
const res = {}; for (const n of Object.keys(T.PILOTS)) { res[n] = { plain: E(T.PILOTS[n], plain), deep: E(T.PILOTS[n], deep) }; }

console.log("\n3. V2 -- PLAIN: nothing in conflict, the job is doable");
{
    const all3 = ["DIRECT", "TRIP", "HULLONLY", "GUARDED"].every((n) => res[n].plain.runs.every((r) => r.visited === 3 && r.score > 0.95));
    ok("!! DIRECT, TRIP, HULLONLY and GUARDED visit 3 of 3 and score over 0.95 in every plain run", all3, ["DIRECT", "TRIP", "HULLONLY", "GUARDED"].map((n) => n + " " + res[n].plain.score.toFixed(3)).join(", "));
    ok("!! the safe harbour (SPIN) visits none and scores 0.55 +- 0.05: home, unhurt, and having done nothing", res.SPIN.plain.runs.every((r) => r.visited === 0 && r.returned) && near(res.SPIN.plain.score, 0.55, 0.05), `${res.SPIN.plain.score.toFixed(3)}`);
}

console.log("\n4. V3 -- DEEP: the hull is a need");
{
    const dc = res.DIRECT.deep.crashed, p = T.paired(res.HULLONLY.deep, res.DIRECT.deep);
    ok("!! DIRECT (hull-blind) is crushed in at least 3 of the 8 deep runs", dc >= 3, `${dc} of 8 crushed, mean ${res.DIRECT.deep.score.toFixed(3)}`);
    ok("!! HULLONLY beats DIRECT by more than max(0.03, 2 se)", p.diff > se2(p), `${p.diff.toFixed(3)} against ${se2(p).toFixed(3)} (se ${p.se.toFixed(3)})`);
    ok("!! GUARDED is crushed in none of the deep runs, and beats the safe harbour by more than max(0.03, 2 se)", res.GUARDED.deep.crashed === 0 && (() => { const q = T.paired(res.GUARDED.deep, res.SPIN.deep); return q.diff > se2(q); })(), `${res.GUARDED.deep.crashed} crushed, mean ${res.GUARDED.deep.score.toFixed(3)} against SPIN ${res.SPIN.deep.score.toFixed(3)}`);
}

console.log("\n5. V7 -- the impossible is not charged");
{
    const sc = T.scenario(501, "both"), un = sc.stations.filter((q) => q.unreachable).length, r = T.fly(T.GUARDED, sc);
    ok("!! a scenario with stations the damaged hull cannot take counts only the reachable ones: `reachable` is 3 minus the unreachable ones, and `visited` never exceeds it", un >= 1 && r.reachable === 3 - un && r.visited <= r.reachable, `${un} unreachable, reachable ${r.reachable}, visited ${r.visited}`);
    ok("!! GUARDED's pump kept the hull afloat and its repair put the hull right: no flood-sinking, the damage ends at or under where it started", [501, 502, 503, 504].every((s) => { const q = T.fly(T.GUARDED, T.scenario(s, "both")); return !q.crushed && q.damageEnd <= q.damage0 + 1e-6; }));
}

console.log("\n9. THE SEAT INTERFACE, THE REFERENCE RULES, THE GAUGE AND THE EXTRA SETS (piece 4; registered in NEEDS_AND_LIMITS.md Round 3 and Amendment 1)");
{
    const q = (x, y, depth, visited = false) => ({ x, y, depth, visited }), at = (depth) => ({ pos: [0, 0, -depth] });
    const obsOf = (t, stations, r) => ({ t, stations, r: { frac: 0.8, depth: 20, flood: 0, damage: 0, collapseDepth: 60, ...r } });
    const nf = T.nearestFeasible(at(20), obsOf(0, [q(100, 0, 20), q(30, 40, 20), q(10, 0, 20, true), q(5, 0, 58)], {}));
    ok("!! nearestFeasible: the nearest UNVISITED station whose depth the hull allows (depth - 3.5 within 0.9 of the collapse depth): the 50 m one, not the visited one at 10 m, not the 58 m one at 5 m (too deep for 60), not the 100 m one", nf && nf.x === 30 && nf.y === 40 && T.nearestFeasible(at(20), obsOf(0, [q(5, 0, 58), q(1, 1, 20, true)], {})) === null && T.nearestFeasible(at(20), obsOf(0, [q(5, 0, 58)], { collapseDepth: 70 })) !== null);
    ok("!! lastCall: the boat must be on its way up when t >= 600 - 20 - depth/0.4 (at the surface from 580 s; from 20 m from 530 s), and not a tick before", T.lastCall(obsOf(580, [], { depth: 0 })) === true && T.lastCall(obsOf(579.9, [], { depth: 0 })) === false && T.lastCall(obsOf(530, [], { depth: 20 })) === true && T.lastCall(obsOf(529.9, [], { depth: 20 })) === false);
    ok("!! obsThreshold: 0.6 at the surface, 0.45 at 3 m, 0.3 at 6 m and at any depth below, linear between; the rule's constants are frozen", T.obsThreshold(0) === 0.6 && near(T.obsThreshold(3), 0.45, 1e-12) && near(T.obsThreshold(6), 0.3, 1e-12) && T.obsThreshold(40) === 0.3 && T.obsThreshold(-5) === 0.6 && Object.isFrozen(T.OBS_RULE) && Object.isFrozen(T.TRIP_1T) && T.TRIP_1T.low === 0.45 && T.OBS_RULE.low === 0.3 && T.OBS_RULE.high === 0.6 && T.OBS_RULE.ramp === 6);
    const run = (trip, steps, opts) => { const seat = T.ruleSeat(trip, opts)({}); return steps.map(([depth, frac, t = 0]) => seat(at(depth), obsOf(t, [q(50, 0, 20)], { depth, frac })).surface); };
    ok("!! the hysteresis rule (GUARDED): 0.5 stays down, 0.25 surfaces, 0.5 STILL surfaced (the memory), 0.65 goes back down", J(run("hyst", [[20, 0.5], [20, 0.25], [20, 0.5], [20, 0.65]])) === J([false, true, true, false]));
    ok("!! the single-threshold rule (GUARDED-1T) has no memory: 0.5 down, 0.40 up, 0.46 down again, 0.44 up (it chatters)", J(run("single", [[20, 0.5], [20, 0.40], [20, 0.46], [20, 0.44]])) === J([false, true, false, true]));
    ok("!! the stateless observation rule (GUARDED-OBS) reads the depth: 20 m at 0.5 down, 20 m at 0.25 up, 1 m at 0.5 UP (charging at the surface), 1 m at 0.65 down, 4 m at 0.5 down (no turning back on the way down), 20 m at 0.5 down again", J(run("obs", [[20, 0.5], [20, 0.25], [1, 0.5], [1, 0.65], [4, 0.5], [20, 0.5]])) === J([false, true, true, false, false, false]));
    ok("!! the crude observation rule (GUARDED-OBS0): up under 0.3, or under 3 m while under 0.6: 20 m at 0.5 down, 2 m at 0.5 up, 4 m at 0.5 down, 2 m at 0.65 down; HULLONLY never trips (0.05 down)", J(run("obs0", [[20, 0.5], [2, 0.5], [4, 0.5], [2, 0.65]])) === J([false, true, false, false]) && J(run("none", [[20, 0.05]])) === J([false]));
    const late = T.ruleSeat("hyst")({}), seatState = (steps) => steps.map(([depth, frac, t]) => late(at(depth), obsOf(t, [q(50, 0, 20)], { depth, frac })).surface);
    ok("!! the fixed last call (and no feasible station) force the surface WITHOUT touching the trip's memory: a late tick at 0.2 surfaces, and the next normal tick at 0.5 is still down (a trip that had registered the 0.2 would stay up under 0.6)", J(seatState([[20, 0.5, 0], [20, 0.2, 590], [20, 0.5, 0]])) === J([false, true, false]) && T.ruleSeat("hyst")({})(at(20), obsOf(0, [q(5, 0, 58)], {})).surface === true);
    const dec = T.ruleSeat("hyst")({})(at(1), obsOf(0, [q(50, 0, 20)], { depth: 1, frac: 0.5, flood: 0.01, damage: 0.2 }));
    ok("!! a decision carries the cap 0.9, the pump (flood over 0.001 and charge over 0.1), the repair (at the surface, damaged, charge over 0.1) and the station", dec.cap === 0.9 && dec.pump === true && dec.repair === true && dec.station.x === 50 && T.ruleSeat("hyst")({})(at(20), obsOf(0, [q(50, 0, 20)], { depth: 20, frac: 0.5, flood: 0, damage: 0.2 })).repair === false && T.ruleSeat("hyst")({})(at(1), obsOf(0, [q(50, 0, 20)], { depth: 1, frac: 0.05, flood: 0.01, damage: 0.2 })).pump === false);
    // flyDecision: the decision is exposed, pump and repair become 1 / 0
    const ctx = { model: M, read: () => ({}) }, seatFixed = (d) => () => () => d, st0 = (() => { const S = T; return null; })();
    const fixed = T.flyDecision(seatFixed({ surface: true, station: null, cap: 0.9, pump: true, repair: false }))(ctx), state = { pos: [0, 0, -20], vel: [2, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0], tank: { level: 0, air: 6, released: false } };
    const c1 = fixed(state, obsOf(0, [], {}), [0, 0, 0]);
    ok("!! flyDecision: the pilot exposes the last decision, turns pump/repair into 1/0 and flies the surfacing wrapper when the decision says surface", fixed.decision.surface === true && c1.pump === 1 && c1.repair === 0 && Number.isFinite(c1.thrust) && Number.isFinite(c1.pitch));
    const FP = { "GUARDED:plain:501": "41871ff4", "GUARDED:deep:502": "e236feaf", "GUARDED:far:503": "68e9eaf4", "GUARDED:both:501": "88d9f230", "HULLONLY:far:503": "24762f28", "HULLONLY:both:501": "88d9f230", "GUARDED_1T:far:503": "42dc47c7", "GUARDED_1T:both:501": "4ffbbf35", "GUARDED_OBS:far:503": "b07528c7", "GUARDED_OBS:both:501": "af5fe1ca", "GUARDED_OBS0:deep:502": "de923513", "GUARDED_OBS0:far:503": "60c67bd7", "GUARDED_FILTER:far:503": "9b4fe799", "GUARDED_FILTER:both:501": "9074cedf" };
    const table = { GUARDED: T.GUARDED, HULLONLY: T.HULLONLY, GUARDED_1T: T.GUARDED_1T, GUARDED_OBS: T.GUARDED_OBS, GUARDED_OBS0: T.GUARDED_OBS0, GUARDED_FILTER: T.GUARDED_FILTER };
    const bad = Object.entries(FP).filter(([k, v]) => { const [n, kind, seed] = k.split(":"); return T.fly(table[n], T.scenario(+seed, kind)).fingerprint !== v; }).map(([k]) => k);
    ok("!! the rule pilots' runs are PINNED (14 fingerprints): GUARDED and HULLONLY are bit for bit what they were before the seat refactor (the same 60 fingerprints), and the three reference rules and the filter have their registered behaviour", bad.length === 0, bad.join(", "));
    ok("!! the references are exported and frozen: GUARDED_1T, GUARDED_OBS, GUARDED_OBS0, GUARDED_FILTER; the filter's alpha is 0.005", Object.keys(T.REFERENCES).join() === "GUARDED_1T,GUARDED_OBS,GUARDED_OBS0,GUARDED_FILTER" && Object.isFrozen(T.REFERENCES) && T.FILTER_ALPHA === 0.005);
    // the gauge
    const sc = T.scenario(503, "far"), g1 = T.gaugeOf(sc), g2 = T.gaugeOf(sc), g3 = T.gaugeOf(T.scenario(504, "far")), a = [], b = [], c = [];
    for (let i = 0; i < 3000; i++) { a.push(g1(i, 0.5)); b.push(g2(i, 0.5)); c.push(g3(i, 0.5)); }
    const held = a.every((x, i) => i % 30 === 0 || x === a[i - 1]), changes = a.filter((x, i) => i % 30 === 0 && i > 0 && x !== a[i - 30]).length, samples = a.filter((x, i) => i % 30 === 0), mean = samples.reduce((x, y) => x + y, 0) / samples.length, sd = Math.sqrt(samples.reduce((x, y) => x + (y - mean) ** 2, 0) / samples.length);
    ok("!! the gauge: deterministic per scenario (same seed, same series), different for another seed, held for 30 ticks between refreshes and refreshed at every 30th, with mean 0.5 and sd 0.1 over 100 samples (within 0.03 and 0.03)", J(a) === J(b) && J(a) !== J(c) && held && changes > 90 && near(mean, 0.5, 0.03) && near(sd, 0.1, 0.03), `mean ${mean.toFixed(3)}, sd ${sd.toFixed(3)}`);
    const lo = T.gaugeOf(sc, { sd: 5, hz: 1 }), clipped = Array.from({ length: 600 }, (_, i) => lo(i, 0.5));
    ok("!! the gauge is clipped to [0, 1] (sd 5 reaches both ends and never leaves them), and its refresh rate is the registered one: hz 2 refreshes every 15 ticks", clipped.every((x) => x >= 0 && x <= 1) && clipped.includes(0) && clipped.includes(1) && T.GAUGE.sd === 0.1 && T.GAUGE.hz === 1 && Object.isFrozen(T.GAUGE) && (() => { const g = T.gaugeOf(sc, { sd: 0.1, hz: 2 }), v = Array.from({ length: 90 }, (_, i) => g(i, 0.5)); return v[14] === v[0] && v[15] !== v[0] && v[29] === v[15]; })());
    const seen = [], probe = () => (st, obs) => { seen.push([obs.r.frac, obs.r.energy / 3e6]); return { pitch: 0, yaw: 0, thrust: 0, ballast: 0 }; };
    T.fly(probe, T.scenario(501, "plain"), { seconds: 5, gauge: T.GAUGE }); const g0 = seen.slice(); seen.length = 0; T.fly(probe, T.scenario(501, "plain"), { seconds: 5 });
    ok("!! with the gauge a pilot's charge reading is the noisy one and its other readings are the true ones; without the gauge it is the true reading: the same scenario, the first 5 s", g0.some(([f, e]) => Math.abs(f - e) > 1e-6) && seen.every(([f, e]) => Math.abs(f - e) < 1e-9), `${g0[0][0].toFixed(3)} against ${g0[0][1].toFixed(3)}`);
    const keyOf = (set) => new Set(set.map((x) => x.kind + x.seed)), disj = (x, y) => [...keyOf(x)].every((k) => !keyOf(y).has(k));
    const SETS = { TRAIN: T.TRAIN_SET, HELD: T.HELD_OUT_SET, POOL: T.POOL_SET, AUDIT: T.AUDIT_SET, AUDIT2: T.AUDIT2_SET, RESERVE: T.RESERVE_SET, BASE: T.BASELINE_SET }, names = Object.keys(SETS);
    ok("!! the sets of piece 4: TRAIN_SMALL 16 (seeds 1-4, a subset of TRAIN), POOL 48 (21-32), AUDIT2 48 (71-82), RESERVE 48 (91-102); every set frozen; the seven sets TRAIN, HELD_OUT, POOL, AUDIT, AUDIT2, RESERVE, BASELINE pairwise disjoint (21 pairs)", T.TRAIN_SMALL_SET.length === 16 && T.POOL_SET.length === 48 && T.AUDIT2_SET.length === 48 && T.RESERVE_SET.length === 48 && [...keyOf(T.TRAIN_SMALL_SET)].every((k) => keyOf(T.TRAIN_SET).has(k)) && Math.max(...T.TRAIN_SMALL_SET.map((x) => x.seed)) === 4 && Math.min(...T.POOL_SET.map((x) => x.seed)) === 21 && Math.max(...T.POOL_SET.map((x) => x.seed)) === 32 && Math.min(...T.AUDIT2_SET.map((x) => x.seed)) === 71 && Math.max(...T.RESERVE_SET.map((x) => x.seed)) === 102 && [T.TRAIN_SMALL_SET, T.POOL_SET, T.AUDIT2_SET, T.RESERVE_SET].every(Object.isFrozen) && names.every((x, i) => names.slice(i + 1).every((y) => disj(SETS[x], SETS[y]))));
}

// the library's caller that is not a gate: an export-free command that prints the table, and refuses the audit set (piece 4's) unless told to read it
{
    const cmd = fs.readFileSync(new URL("../tools/ship/takeNeedsTask.mjs", import.meta.url), "utf8"), r = spawnSync(process.execPath, [fileURLToPath(new URL("../tools/ship/takeNeedsTask.mjs", import.meta.url)), "--set", "audit"], { encoding: "utf8" });
    ok("!! tools/ship/takeNeedsTask.mjs has no exports (it is the library's caller that is not a gate) and refuses the audit set without --read-audit-once (exit 2, nothing printed on stdout)", !/^export /m.test(cmd) && /from "\.\.\/\.\.\/brain\/needsTask\.mjs"/.test(cmd) && r.status === 2 && r.stdout === "" && /read-audit-once/.test(r.stderr), `exit ${r.status}`);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
