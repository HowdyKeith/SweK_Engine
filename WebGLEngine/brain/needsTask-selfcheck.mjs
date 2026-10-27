// WebGLEngine/brain/needsTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/needsTask-selfcheck.mjs      (~11s -- measured 10.9 s alone at v4905 WIP, to be restated at ship)
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
import * as T from "./needsTask.mjs";
import * as N from "../physics/mechanics/subNeeds.mjs";
import * as AS from "./autopilotSub.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t) => Math.abs(a - b) <= t;
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

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
