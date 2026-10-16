// WebGLEngine/brain/flightTask-selfcheck.mjs
//
// Run: node brain/flightTask-selfcheck.mjs      (~2.7 s)
//
// THE SIBLING GATE OF brain/flightTask.mjs (v4867): the job every real-flight pilot is graded on. A score is only worth training on if it means what it says, so each row here is a thing the score is SUPPOSED to do, asked of it with a
// pilot whose answer is known:
//
//   1  scenarios: a kind and a seed always make the same one (bit for bit), different seeds and kinds make different ones, each kind stays inside the ranges the header promises, an unknown kind is refused by name, the
//      wind is a pure function of time and null for the still-air kinds
//   2  THE SCORE: a pilot that is already on its targets in trim scores 0 (to 0.01) and is not charged for time; a flight that ends early is charged the worst tick (7.5) for every tick it did not fly, exactly; a pilot that outputs
//      nothing crashes in every scenario and scores close to the worst; the three error terms are the three the header says, each capped at its own 3; the score is minus the weighted sum over 1,200 ticks
//   3  THE SETS: the four sets hold disjoint (kind, seed) pairs, hold the sizes the header says, and evaluate() is arithmetic over fly(); v4868's three more (TRAIN_WIDE 40, HELD_OUT_WIDE 30, AUDIT2 36) are disjoint from each other, from BASELINE and from the spent AUDIT_SET
//   4  THE BASELINE, FROZEN: the PD autopilot's score on each set and each kind, and the fingerprint of a flight, are pinned -- a change to the flight model, the autopilot or the task moves them, and this is where it is said
//   5  determinism: a second evaluation is bit-identical; fly() does not mutate its scenario
//
// SABOTAGE LOG -- each applied to brain/flightTask.mjs in a scratch worktree, the gate run, the worktree restored:
//   22 sabotages, every one red by name (the number is how many rows went red):
//   T1 altitude divisor 50 -> 100 2 | T2 airspeed weight 0.5 -> 1 3 | T3 unflown ticks not charged 2 | T4 unflown ticks charged half 2 | T5 altitude cap removed 1 | T6 speed cap removed 1 | T7 heading error not wrapped 1 | T23 heading weight doubled 2 |
//   T8 wind mean ignored 3 | T9 wind sign flipped 3 | T10 the kind not mixed into the seed 4 | T11 recovery bank range cut 4 | T12 gusty has no wind 4 | T13 scenarios not frozen 1 | T14 an unknown kind accepted 1 | T15 TRAIN and HELD_OUT overlap 2 |
//   T16 fly ignores the model's mass 1 | T17 the tick step 1/30 -> 1/60 5 | T19 `crashed` counts nothing 1 | T20 versus() swaps better and worse 1 | T21 the fingerprint sampled every 31 ticks 1 | T22 a crash does not end the flight 1
//   v4868, EIGHT MORE (the trainer's sets: TRAIN_WIDE 40, HELD_OUT_WIDE 30, AUDIT3 36, SAFETY_POOL 500, SAFETY_AUDIT 500; rows in sections 3 and 4), every one red by name:
//   S1 TRAIN_WIDE's second recovery range overlaps HELD_OUT_WIDE 3 | S2 AUDIT3 nominal overlaps the spent AUDIT2 2 | S3 SAFETY_AUDIT recovery is the pool's seeds 1 | S4 HELD_OUT_WIDE nominal one short 2 | S5 SAFETY_POOL nominal half size 1 |
//   S6 AUDIT3 gusty one short 2 | S7 HELD_OUT_WIDE nominal runs into the spent AUDIT_SET 3 | S8 SAFETY_AUDIT gusty runs into the pool 1.
//   T7 FIRST WENT 0 RED: no scenario ever crossed +-pi, so the wrap was never exercised; the 3.0 -> -3.0 row exists because of it. A NaN guard on the score (T18) could not be reached -- the flight model reads a bad control as neutral and ends the
//   flight on a non-finite state before an error is summed -- and was REMOVED rather than kept as dead code that a sabotage cannot see.
//   fly() flew every model at the TRAINER's mass until T16 found it: createState defaulted the state's mass, and a lighter airframe flew the same flight.
"use strict";
import * as T from "./flightTask.mjs";
import * as AF from "./autopilotFlight.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const autopilot = (s, t, w) => AF.pilot(s, t, w);
const zero = () => ({ pitch: 0, roll: 0, yaw: 0, throttle: 0 });

console.log("flightTask-selfcheck -- the job every real-flight pilot is graded on\n");

console.log("1. SCENARIOS");
{
    const a = T.scenario(7, "gusty"), b = T.scenario(7, "gusty");
    ok("!! a kind and a seed always make the same scenario, bit for bit (start, target and wind)", JSON.stringify(a) === JSON.stringify(b));
    ok("!! a different seed makes a different one, and so does a different kind at the same seed", JSON.stringify(T.scenario(8, "gusty")) !== JSON.stringify(a) && JSON.stringify(T.scenario(7, "nominal")) !== JSON.stringify(T.scenario(7, "recovery")) && T.scenario(7, "nominal").target.altitude !== T.scenario(7, "recovery").target.altitude);
    ok("!! DT is 1/30 and SECONDS is 40: a flight is 1,200 ticks, and fly() flies SECONDS / DT of them by default", T.DT === 1 / 30 && T.SECONDS === 40 && T.fly(autopilot, T.scenario(1, "nominal")).ticks === T.SECONDS / T.DT);
    ok("a scenario is frozen (a pilot cannot edit the job it is given)", Object.isFrozen(a) && Object.isFrozen(a.start) && Object.isFrozen(a.target) && Object.isFrozen(a.wind));
    let threw = ""; try { T.scenario(1, "stormy"); } catch (e) { threw = String(e.message); }
    ok("!! an unknown kind is refused BY NAME and says what the kinds are", /unknown kind "stormy"/.test(threw) && /nominal, recovery, gusty/.test(threw), threw);
    const inRange = (kind, seeds, f) => seeds.every((s) => f(T.scenario(s, kind)));
    const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
    ok("!! NOMINAL stays inside its ranges over 60 seeds: speed 40..50, pitch -0.08..0.12, bank +-0.45, spin under 0.2 rad/s, altitude 220..380, heading +-2, airspeed 41..49, still air", inRange("nominal", seeds, (c) => c.start.speed >= 40 && c.start.speed <= 50 && c.start.pitch >= -0.08 && c.start.pitch <= 0.12 && Math.abs(c.start.bank) <= 0.45 && c.start.w.every((v) => Math.abs(v) <= 0.2) && c.target.altitude >= 220 && c.target.altitude <= 380 && Math.abs(c.target.heading) <= 2 && c.target.airspeed >= 41 && c.target.airspeed <= 49 && c.wind === null));
    ok("!! RECOVERY stays inside its ranges: speed 33..56, pitch +-0.45, bank +-1.2 (70 degrees), spin under 0.8 rad/s, still air -- and over 60 seeds really reaches past 60 degrees of bank", inRange("recovery", seeds, (c) => c.start.speed >= 33 && c.start.speed <= 56 && Math.abs(c.start.pitch) <= 0.45 && Math.abs(c.start.bank) <= 1.2 && c.start.w.every((v) => Math.abs(v) <= 0.8) && c.wind === null) && seeds.some((s) => Math.abs(T.scenario(s, "recovery").start.bank) > 60 * D2R));
    ok("!! GUSTY has a wind inside its ranges (mean up to 9 m/s on each horizontal axis, gusts of 1.5-3 m/s) and a start half as banked as nominal's", inRange("gusty", seeds, (c) => c.wind && c.wind.mean.slice(0, 2).every((v) => Math.abs(v) <= 9) && c.wind.amp.slice(0, 2).every((v) => v >= 1.5 && v <= 3) && Math.abs(c.start.bank) <= 0.225));
    const wd = T.scenario(3, "gusty").wind;
    const w0 = T.windAt(wd, 12.5), w1 = T.windAt(wd, 12.5);
    ok("!! the wind is a pure function of time (the same instant blows the same twice), changes with time, is never NaN, and stays within mean +- amp", JSON.stringify(w0) === JSON.stringify(w1) && JSON.stringify(T.windAt(wd, 13)) !== JSON.stringify(w0) && Array.from({ length: 400 }, (_, i) => T.windAt(wd, i * 0.1)).every((v) => v.every((x, k) => Number.isFinite(x) && Math.abs(x - wd.mean[k]) <= wd.amp[k] + 1e-9)));
    ok("still air is exactly [0, 0, 0]", JSON.stringify(T.windAt(null, 5)) === "[0,0,0]");
}

console.log("\n2. THE SCORE");
{
    // a scenario whose start IS its target, in trim: the autopilot has nothing to do
    const trim = F.trim(F.createFlightModel(), 45), onTarget = Object.freeze({ seed: 0, kind: "nominal", start: { speed: 45, pitch: trim.pitchAttitude, bank: 0, heading: 0, gamma: 0, w: [0, 0, 0] }, target: { altitude: 300, heading: 0, airspeed: 45 }, wind: null });
    const calm = T.fly(autopilot, onTarget);
    ok("!! a pilot already on its targets in trim scores 0 (to 0.01) and flies all 1,200 ticks", calm.score > -0.01 && calm.score <= 0 && calm.ticks === 1200 && calm.status === "airborne", `${calm.score.toFixed(5)}`);
    const off = Object.freeze({ ...onTarget, target: { altitude: 300, heading: 0, airspeed: 45 + 5 } }), noThrottle = T.fly(() => ({ pitch: trim.pitch, roll: 0, yaw: 0, throttle: trim.throttle }), off, { seconds: 10 });
    ok("!! the score is minus the mean tracking error: a pilot holding trim controls 5 m/s below an airspeed target (and nothing else off) over 10 s scores about -0.5 * (5/10) = -0.25", near(noThrottle.score, -0.25, 0.02) && near(noThrottle.eSpd, 0.5, 0.02) && noThrottle.eAlt < 0.01 && noThrottle.eHdg < 0.01, `score ${noThrottle.score.toFixed(4)}, eSpd ${noThrottle.eSpd.toFixed(4)}`);
    // the three error terms and their caps, each with the other two on target
    const alt = T.fly(() => ({ pitch: trim.pitch, roll: 0, yaw: 0, throttle: trim.throttle }), Object.freeze({ ...onTarget, target: { altitude: 300 + 25, heading: 0, airspeed: 45 } }), { seconds: 5 });
    const hdg = T.fly(() => ({ pitch: trim.pitch, roll: 0, yaw: 0, throttle: trim.throttle }), Object.freeze({ ...onTarget, target: { altitude: 300, heading: 0.5, airspeed: 45 } }), { seconds: 5 });
    ok("!! the ALTITUDE term is |error| / 50 m (25 m low is 0.5 a tick) and the HEADING term is |error| in radians (0.5 rad is 0.5 a tick)", near(alt.eAlt, 0.5, 0.01) && near(hdg.eHdg, 0.5, 0.01) && alt.eHdg < 0.01 && hdg.eAlt < 0.01, `eAlt ${alt.eAlt.toFixed(3)}, eHdg ${hdg.eHdg.toFixed(3)}`);
    const across = T.fly(() => ({ pitch: trim.pitch, roll: 0, yaw: 0, throttle: trim.throttle }), Object.freeze({ ...onTarget, start: { ...onTarget.start, heading: 3.0 }, target: { altitude: 300, heading: -3.0, airspeed: 45 } }), { seconds: 3 });
    ok("!! the heading error is the SHORT way round: flying heading 3.0 with a target of -3.0 is 0.283 rad off, not 6.0 (and so not capped at 3)", near(across.eHdg, 2 * Math.PI - 6.0, 0.01), `${across.eHdg.toFixed(4)}`);
    const far = T.fly(() => ({ pitch: trim.pitch, roll: 0, yaw: 0, throttle: trim.throttle }), Object.freeze({ ...onTarget, target: { altitude: 300 + 900, heading: 3, airspeed: 45 + 60 } }), { seconds: 3 });
    ok("!! each term is CAPPED at 3 a tick (altitude 900 m low, heading 3 rad, airspeed 60 m/s low: 3 + 3 + 0.5 * 3 would be the worst tick, 7.5) -- the cap holds for altitude and speed, and heading error (at most pi) is under it", near(far.eAlt, 3, 1e-9) && near(far.eSpd, 3, 1e-9) && near(far.eHdg, 3, 0.01) && T.WORST_TICK === 7.5, `eAlt ${far.eAlt}, eHdg ${far.eHdg.toFixed(3)}, eSpd ${far.eSpd}`);
    const z = T.fly(zero, T.scenario(1, "nominal"));
    ok("!! A PILOT THAT OUTPUTS NOTHING CRASHES: it ends the flight early in all 18 baseline scenarios, and scores between -7.5 and -5", T.evaluate(zero, T.BASELINE_SET).crashed === 18 && z.status !== "airborne" && z.score < -5 && z.score >= -7.5, `${z.status} after ${z.ticks} ticks, score ${z.score.toFixed(3)}`);
    // exact charge: a flight that stops at tick n is charged the worst tick for the rest
    const stop = T.fly(zero, T.scenario(1, "nominal")), total = 1200, expect = -((stop.eAlt + stop.eHdg + 0.5 * stop.eSpd) * stop.ticks + T.WORST_TICK * (total - stop.ticks)) / total;
    ok("!! a flight that ends early is charged the worst tick, 7.5, for EVERY tick it did not fly, exactly: score = -(sum of the errors flown + 7.5 * ticks unflown) / 1,200", near(stop.score, expect, 1e-9) && stop.ticks < 600, `${stop.score.toFixed(5)} vs ${expect.toFixed(5)} (${stop.ticks} flown)`);
    ok("...so ending a flight is never a way to stop being graded: the same crash a second sooner scores worse", (() => { const hard = (sc) => T.fly(zero, sc); const a = hard(T.scenario(1, "nominal")), b = hard(T.scenario(2, "nominal")); return (a.ticks < b.ticks) === (a.score < b.score) || near(a.ticks, b.ticks, 40); })());
    ok("a non-finite pilot answer cannot make a NaN score (the flight model reads it as neutral and the score stays finite)", Number.isFinite(T.fly(() => ({ pitch: NaN, roll: Infinity, yaw: -Infinity, throttle: NaN }), T.scenario(2, "nominal")).score));
}

console.log("\n3. THE SETS");
{
    const keyOf = (s) => `${s.kind}:${s.seed}`, sets = { TRAIN: T.TRAIN_SET, HELD_OUT: T.HELD_OUT_SET, AUDIT: T.AUDIT_SET, BASELINE: T.BASELINE_SET };
    const all = Object.values(sets).flatMap((s) => s.map(keyOf));
    ok("!! the four sets hold 12, 12, 18 and 18 scenarios, four or six of each kind", T.TRAIN_SET.length === 12 && T.HELD_OUT_SET.length === 12 && T.AUDIT_SET.length === 18 && T.BASELINE_SET.length === 18 && T.KINDS.every((k) => T.TRAIN_SET.filter((s) => s.kind === k).length === 4 && T.AUDIT_SET.filter((s) => s.kind === k).length === 6));
    ok("!! the four sets are DISJOINT: no (kind, seed) pair appears in two of them, or twice in one", new Set(all).size === all.length, `${new Set(all).size} distinct of ${all.length}`);
    ok("the sets are frozen, and each scenario in them is the scenario() of its own kind and seed", Object.values(sets).every((s) => Object.isFrozen(s) && s.every((c) => JSON.stringify(c) === JSON.stringify(T.scenario(c.seed, c.kind)))));
    // v4868 -- the three sets the TRAINER uses (tools/ship/trainFlightPilot.mjs), and why: see the header of brain/flightTask.mjs
    const wide = { TRAIN_WIDE: T.TRAIN_WIDE_SET, HELD_OUT_WIDE: T.HELD_OUT_WIDE_SET, AUDIT2: T.AUDIT2_SET }, wk = Object.values(wide).flatMap((x) => x.map(keyOf)), kindsIn = (set, n) => T.KINDS.map((k) => set.filter((c) => c.kind === k).length).join(",") === n;
    ok("!! the trainer's three sets hold 40 (10 nominal, 20 RECOVERY, 10 gusty), 30 (10 of each) and 36 (12 of each) scenarios, frozen, each the scenario() of its own kind and seed", T.TRAIN_WIDE_SET.length === 40 && kindsIn(T.TRAIN_WIDE_SET, "10,20,10") && T.HELD_OUT_WIDE_SET.length === 30 && kindsIn(T.HELD_OUT_WIDE_SET, "10,10,10") && T.AUDIT2_SET.length === 36 && kindsIn(T.AUDIT2_SET, "12,12,12") &&
        Object.values(wide).every((x) => Object.isFrozen(x) && x.every((c) => JSON.stringify(c) === JSON.stringify(T.scenario(c.seed, c.kind)))));
    ok("!! the trainer's three sets and BASELINE share no scenario with each other, and AUDIT_SET -- SPENT by the first champion (see the header) -- is in none of them", new Set([...wk, ...T.BASELINE_SET.map(keyOf)]).size === wk.length + 18 && !T.AUDIT_SET.some((c) => wk.includes(keyOf(c))));
    const more = { AUDIT3: T.AUDIT3_SET, SAFETY_POOL: T.SAFETY_POOL_SET, SAFETY_AUDIT: T.SAFETY_AUDIT_SET }, mk2 = Object.values(more).flatMap((x) => x.map(keyOf));
    ok("!! AUDIT3 holds 36 scenarios (12 of each kind) and the two SAFETY sets 500 each (100 nominal, 300 RECOVERY, 100 gusty), frozen, each the scenario() of its own kind and seed", T.AUDIT3_SET.length === 36 && kindsIn(T.AUDIT3_SET, "12,12,12") && T.SAFETY_POOL_SET.length === 500 && kindsIn(T.SAFETY_POOL_SET, "100,300,100") && T.SAFETY_AUDIT_SET.length === 500 && kindsIn(T.SAFETY_AUDIT_SET, "100,300,100") &&
        Object.values(more).every((x) => Object.isFrozen(x) && x.every((c) => JSON.stringify(c) === JSON.stringify(T.scenario(c.seed, c.kind)))));
    ok("!! the three share no scenario with each other, with the trainer's other sets or with BASELINE, and AUDIT_SET and AUDIT2_SET -- SPENT as evidence for a trained pilot -- are in none of the newer ones", new Set([...mk2, ...wk, ...T.BASELINE_SET.map(keyOf)]).size === mk2.length + wk.length + 18 && !T.AUDIT2_SET.some((c) => mk2.includes(keyOf(c))) && !T.AUDIT_SET.some((c) => mk2.includes(keyOf(c))) && T.AUDIT2_SET.length === 36);
    ok("the pinned sets sit inside the wide ones: TRAIN_SET is in TRAIN_WIDE_SET and HELD_OUT_SET is in HELD_OUT_WIDE_SET, the same scenarios", T.TRAIN_SET.every((c) => T.TRAIN_WIDE_SET.some((d) => keyOf(d) === keyOf(c))) && T.HELD_OUT_SET.every((c) => T.HELD_OUT_WIDE_SET.some((d) => keyOf(d) === keyOf(c))));
    const r = T.evaluate(autopilot, T.TRAIN_SET), mean = r.runs.reduce((a, x) => a + x.score, 0) / r.runs.length;
    ok("!! evaluate() is the arithmetic over fly(): the score is the mean of the runs, each kind's score is the mean of its own, and `crashed` counts the flights that ended early", near(r.score, mean, 1e-12) && T.KINDS.every((k) => near(r.byKind[k], r.runs.filter((x) => x.kind === k).reduce((a, x) => a + x.score, 0) / 4, 1e-12)) && r.crashed === 0 && r.runs.every((x, i) => JSON.stringify(x) === JSON.stringify(T.fly(autopilot, T.TRAIN_SET[i]))));
    const z = T.evaluate(zero, T.TRAIN_SET), v = T.versus(r, z);
    ok("!! versus() counts scenario by scenario: the autopilot beats the zero pilot in all 12 and loses to it in none", v.better === 12 && v.worse === 0 && v.same === 0 && T.versus(r, r).same === 12, JSON.stringify(v));
    ok("describeEval prints the score and every kind and the number that ended early", /^-0\.\d{4} \(nominal -0\.\d{3}, recovery -0\.\d{3}, gusty -0\.\d{3}; 0 ended early\)$/.test(T.describeEval(r)), T.describeEval(r));
}

console.log("\n4. THE BASELINE, FROZEN");
{
    const rows = { TRAIN: T.TRAIN_SET, HELD_OUT: T.HELD_OUT_SET, AUDIT: T.AUDIT_SET, BASELINE: T.BASELINE_SET }, got = {};
    for (const [k, set] of Object.entries(rows)) got[k] = T.evaluate(autopilot, set);
    for (const [k, r] of Object.entries(got)) report(`the PD autopilot on ${k}`, T.describeEval(r));
    const pin = (r, score, nominal, recovery, gusty) => near(r.score, score, 6e-5) && near(r.byKind.nominal, nominal, 6e-4) && near(r.byKind.recovery, recovery, 6e-4) && near(r.byKind.gusty, gusty, 6e-4) && r.crashed === 0;
    ok("!! THE BASELINE IS PINNED: the PD autopilot scores -0.4529 on TRAIN, -0.5030 on HELD_OUT, -0.4171 on AUDIT and -0.3577 on BASELINE, none ending early (a change to the flight model, the autopilot or this task moves these, and this is where that is said)", pin(got.TRAIN, -0.4529, -0.470, -0.316, -0.573) && pin(got.HELD_OUT, -0.5030, -0.395, -0.444, -0.670) && pin(got.AUDIT, -0.4171, -0.499, -0.315, -0.438) && pin(got.BASELINE, -0.3577, -0.218, -0.363, -0.492), Object.entries(got).map(([k, r]) => `${k} ${r.score.toFixed(4)}`).join(" "));
    const a3 = T.evaluate(autopilot, T.AUDIT3_SET);
    report("the PD autopilot on AUDIT3", T.describeEval(a3));
    ok("!! AND ON THE LAST AUDIT: the PD autopilot scores -0.4223 on AUDIT3 (nominal -0.4661, recovery -0.3459, gusty -0.4548), none ending early. (The two SAFETY sets are 500 starts each, 17 s apiece: their pins -- the autopilot ends 2 early, brushes the stall in 55 and 72, goes past the full-stall angle in 16 and 30 -- are held by tools/ship/trainFlightPilot-selfcheck.mjs, which flies them for the shipped file's numbers anyway.)", pin(a3, -0.4223, -0.4661, -0.3459, -0.4548));
    const wideGot = { TRAIN_WIDE: T.evaluate(autopilot, T.TRAIN_WIDE_SET), HELD_OUT_WIDE: T.evaluate(autopilot, T.HELD_OUT_WIDE_SET), AUDIT2: T.evaluate(autopilot, T.AUDIT2_SET) };
    for (const [k, r] of Object.entries(wideGot)) report(`the PD autopilot on ${k}`, T.describeEval(r));
    ok("!! AND ON THE TRAINER'S SETS: the PD autopilot scores -0.4655 on TRAIN_WIDE, -0.4851 on HELD_OUT_WIDE and -0.3623 on AUDIT2, none ending early (the numbers a trained pilot has to beat)", pin(wideGot.TRAIN_WIDE, -0.4655, -0.4201, -0.4728, -0.4962) && pin(wideGot.HELD_OUT_WIDE, -0.4851, -0.3819, -0.4810, -0.5924) && pin(wideGot.AUDIT2, -0.3623, -0.3747, -0.3298, -0.3825), Object.entries(wideGot).map(([k, r]) => `${k} ${r.score.toFixed(4)}`).join(", "));
    ok("!! a flight's fingerprint is pinned too: baseline nominal 501 is 72f8f325, recovery 504 is 4d5c592e, gusty 505 is 01ac7d0f", got.BASELINE.runs.find((x) => x.kind === "nominal" && x.seed === 501).fingerprint === "72f8f325" && got.BASELINE.runs.find((x) => x.kind === "recovery" && x.seed === 504).fingerprint === "4d5c592e" && got.BASELINE.runs.find((x) => x.kind === "gusty" && x.seed === 505).fingerprint === "01ac7d0f");
    const flights = Object.values(got).flatMap((r) => r.runs), brush = flights.filter((x) => x.maxAlpha > 13 * D2R);
    ok("!! THE TASK BRUSHES THE STALL AND DOES NOT ASK FOR ONE, SAID: the autopilot's lowest airspeed over the 60 scenarios is 34 m/s (8 above the stall speed); only five flights, all of them RECOVERY starts (a large bank or a nose-high slow start), take the angle of attack past 13 degrees (the wing's 15-degree stall less its 2 of incidence), the highest 15.4 (recovery 3, at the edge of the stall); the other 55 stay under it", flights.every((x) => x.minV > 33 && x.maxAlpha < 16 * D2R) && brush.length === 5 && brush.every((x) => x.kind === "recovery") && Math.max(...brush.map((x) => x.maxAlpha)) > 15 * D2R, `lowest ${Math.min(...flights.map((x) => x.minV)).toFixed(1)} m/s; over 13 degrees: ${brush.map((x) => `${x.kind} ${x.seed} ${(x.maxAlpha * R2D).toFixed(1)}`).join(", ")}`);
}

console.log("\n5. DETERMINISM");
{
    const a = T.evaluate(autopilot, T.HELD_OUT_SET), b = T.evaluate(autopilot, T.HELD_OUT_SET), sc = T.scenario(3, "gusty"), before = JSON.stringify(sc);
    T.fly(autopilot, sc);
    ok("!! a second evaluation is bit-identical (every score, every fingerprint), and fly() does not mutate the scenario it is given", JSON.stringify(a.runs) === JSON.stringify(b.runs) && JSON.stringify(sc) === before);
    ok("fly() takes its own model and horizon: 10 s flies 300 ticks, and a lighter airframe flies a different flight", T.fly(autopilot, T.scenario(1, "nominal"), { seconds: 10 }).ticks === 300 && T.fly(autopilot, T.scenario(1, "nominal"), { model: F.createFlightModel({ ...F.TRAINER, mass: 900 }) }).fingerprint !== T.fly(autopilot, T.scenario(1, "nominal")).fingerprint);
}

console.log(fails ? `\nflightTask-selfcheck: ${fails} FAILED` : "\nflightTask-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
