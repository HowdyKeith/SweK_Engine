// WebGLEngine/brain/droneTask-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/droneTask-selfcheck.mjs      (~30 s: it flies the eight sets, 324 flights)
//
// THE SIBLING GATE OF brain/droneTask.mjs: the job every quadrotor pilot -- the hand pilot, the fruit fly's network, the GPU network -- is given and graded on. A score is only worth training on if it means what it says, so each row is a thing the score is SUPPOSED
// to do, asked of it with a pilot whose answer is known (brain/rotorTask-selfcheck.mjs is the helicopter's, and the discipline is the same):
//
//   1  SCENARIOS   a kind and a seed always make the same one (bit for bit), different seeds and kinds make different ones, each of the four kinds stays inside the ranges the header promises over 60 seeds and really reaches both ends of them, an unknown kind is
//                  refused by name, a scenario is frozen, the flight starts from the scenario's start
//   2  THE WIND    a pure function of time, null for still air, within mean +- amp, and the SAME wind is blown on the model and handed to the pilot
//   3  THE SCORE   a pilot already on its targets scores 0; a flight that ends early is charged the worst tick (9) for every tick it did not fly, to the last digit; the three error terms are the three the header says, each capped at its own 3, the heading error
//                  is wrapped; THE MOTOR FLIGHT: the failure takes effect on the tick the scenario says and on the motor it names, the landing cost is the header's formula on flights stepped independently here, a crash costs 3 + 4 x min(1, speed / 25), a flight that
//                  never touches down costs 7, a flight stops four seconds after its first contact
//   4  THE SETS    disjoint (kind, seed) pairs across the eight sets (TRAIN, HELD_OUT, two AUDITs, the reserve, three SAFETY sets), the sizes and the per-kind sizes the header says, TRAIN's recovery has twelve seeds, evaluate() is arithmetic over fly()
//   5  THE BASELINE, FROZEN   the hand pilot's score on each of the eight sets and each kind, the not-standing counts, the tails by name (it ends no hover, recovery or goto early and it lands NO motor flight), and the fingerprint of a flight of each kind
//   6  DETERMINISM a second evaluation is bit-identical; fly() does not mutate its scenario; versus() and describeEval() say what they say; a pilot that returns NaN does not break the task
//
// SABOTAGE LOG: (filled in below once run)
"use strict";
import * as DT from "./droneTask.mjs";
import * as AD from "./autopilotDrone.mjs";
import * as Q from "../physics/mechanics/multirotorModel6dof.mjs";

let fails = 0;
// A THROW IS A RED ROW BY NAME, NOT A STACK TRACE (the first sabotage run crashed this gate with a TypeError on T48, a hover with no wind, and the harness counted it 0 red): whatever throws, the gate says so as a failed row and exits 1
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const f = (v, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const attempt = (fn, fallback = null) => { try { return fn(); } catch (e) { return fallback; } };
const hand = (s, t, w, c) => AD.pilot(s, t, w, c);
const model = AD.defaultModel(), TRIM = AD.trimOf(model);
const custom = (o) => Object.freeze({ seed: 0, kind: "hover", wind: null, failure: null, ...o });
const SCORING = Math.floor(Math.round(DT.SECONDS / DT.DT) / DT.TICKS_PER_SCORE);   // 400 scoring ticks in a 20 s flight
const FLOWN = Math.round(DT.SECONDS / DT.DT);   // 2400 ticks
// the hover that holds the point it starts at (no position target: the loops brake to rest), at a height and heading asked for
const holder = (alt, heading = 0) => (s, t, w, c) => AD.pilot(s, { altitude: alt, heading }, w, c);

console.log("droneTask-selfcheck -- the job every quadrotor pilot is graded on\n");

console.log("1. SCENARIOS");
{
    const a = DT.scenario(7, "hover"), b = DT.scenario(7, "hover");
    ok("!! a kind and a seed always make the same scenario, bit for bit (start, target, wind and failure), for every kind", DT.KINDS.every((k) => JSON.stringify(DT.scenario(7, k)) === JSON.stringify(DT.scenario(7, k))) && JSON.stringify(a) === JSON.stringify(b));
    ok("!! a different seed makes a different one, and so does a different kind at the same seed", DT.KINDS.every((k) => JSON.stringify(DT.scenario(8, k)) !== JSON.stringify(DT.scenario(7, k))) && new Set(DT.KINDS.map((k) => JSON.stringify(DT.scenario(7, k)))).size === 4);
    ok("!! the kinds are hover, recovery, motor, goto; the model steps at 1/120 s; a flight is 20 s of it, scored every sixth tick (20 Hz), and the worst tick is 3 + 3 + 3 = 9",
        JSON.stringify(DT.KINDS) === '["hover","recovery","motor","goto"]' && DT.DT === 1 / 120 && DT.DT === Q.DT && DT.SECONDS === 20 && DT.TICKS_PER_SCORE === 6 && DT.WORST_TICK === 9 && SCORING === 400 && Object.isFrozen(DT.KINDS));
    ok("!! the landing and crash constants are the header's: a landing costs 0.4 x min(1, sink / 6) + 0.4 x min(5, gs / 5), a crash 3 + 4 x min(1, speed / 25), a flight that never lands 7",
        DT.SINK_LIMIT === 6 && DT.LANDING_GS === 5 && DT.LANDING_GS_CAP === 5 && DT.CRASH_SCALE === 25 && DT.NEVER_LANDS === 7);
    const d0 = (kind, s) => { const c = DT.scenario(s, kind); return Math.hypot(c.target.pos[0], c.target.pos[1]); };
    ok("!! THE KINDS DRAW FROM THEIR OWN STREAMS (the kind is mixed into the seed): hover and recovery draw their distance first, so with one shared stream the unit draws behind (d - 5) / 20 and (d - 5) / 15 would be equal -- over 20 seeds they are never equal",
        Array.from({ length: 20 }, (_, i) => i + 1).every((s) => (d0("hover", s) - 5) / 20 !== (d0("recovery", s) - 5) / 15));
    ok("a scenario is frozen (a pilot cannot edit the job it is given): the scenario, its start, its target, its wind and its failure", Object.isFrozen(a) && Object.isFrozen(a.start) && Object.isFrozen(a.target) && Object.isFrozen(a.wind) && Object.isFrozen(DT.scenario(7, "motor").failure));
    let threw = ""; try { DT.scenario(1, "stormy"); } catch (e) { threw = String(e.message); }
    ok("!! an unknown kind is refused BY NAME and says what the kinds are", /unknown kind "stormy"/.test(threw) && /hover, recovery, motor, goto/.test(threw), threw);
    const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
    const all = (kind, fn) => seeds.every((s) => fn(DT.scenario(s, kind)));
    const col = (kind, fn) => seeds.map((s) => fn(DT.scenario(s, kind)));
    const within = (v, lo, hi) => v >= lo && v <= hi;
    const dist = (c) => Math.hypot(c.target.pos[0], c.target.pos[1]);
    const lowAndHigh = (kind, fn, lo, hi) => Math.min(...col(kind, fn)) < lo && Math.max(...col(kind, fn)) > hi;
    ok("!! HOVER stays inside its ranges over 60 seeds: 30..50 m up, within 0.1 rad of level, 2 m/s horizontally and 1 m/s vertically of rest, a point 5..25 m away, a height within 8 m of the start's, a heading within 1.5 rad, a wind mean of up to 5 m/s a side (0.3 up) with gusts of 0.5..2 m/s a side",
        all("hover", (c) => within(c.start.pos[2], 30, 50) && Math.abs(c.start.pitch) <= 0.1 && Math.abs(c.start.bank) <= 0.1 && Math.abs(c.start.velocity[0]) <= 2 && Math.abs(c.start.velocity[1]) <= 2 && Math.abs(c.start.velocity[2]) <= 1
            && within(dist(c), 5, 25) && Math.abs(c.target.altitude - c.start.pos[2]) <= 8 && Math.abs(c.target.heading) <= 1.5 && c.failure === null
            && c.wind && Math.abs(c.wind.mean[0]) <= 5 && Math.abs(c.wind.mean[1]) <= 5 && Math.abs(c.wind.mean[2]) <= 0.3 && within(c.wind.amp[0], 0.5, 2) && within(c.wind.amp[1], 0.5, 2) && within(c.wind.amp[2], 0.2, 0.6)));
    ok("!! ...and really reaches the ends of them over 60 seeds (starts under 32 m and over 48, points under 8 m away and over 22, wind means past 4 m/s)",
        lowAndHigh("hover", (c) => c.start.pos[2], 32, 48) && lowAndHigh("hover", dist, 8, 22) && Math.max(...col("hover", (c) => (c.wind ? Math.abs(c.wind.mean[0]) : 0))) > 4 && Math.max(...col("hover", (c) => (c.wind ? c.wind.amp[0] : 0))) > 1.8);
    ok("!! RECOVERY stays inside its ranges: 35..55 m up, banked within 2.2 rad (126 degrees) and pitched within 0.8, 6 m/s horizontally and 8 vertically, turning at up to 3 rad/s (2 yawing), a point 5..20 m away, still air -- and over 60 seeds really reaches past 2.0 rad of bank, 7 m/s of fall or climb and 0.7 of pitch",
        all("recovery", (c) => within(c.start.pos[2], 35, 55) && Math.abs(c.start.pitch) <= 0.8 && Math.abs(c.start.bank) <= 2.2 && Math.abs(c.start.velocity[0]) <= 6 && Math.abs(c.start.velocity[1]) <= 6 && Math.abs(c.start.velocity[2]) <= 8
            && Math.abs(c.start.w[0]) <= 3 && Math.abs(c.start.w[1]) <= 3 && Math.abs(c.start.w[2]) <= 2 && within(dist(c), 5, 20) && Math.abs(c.target.altitude - c.start.pos[2]) <= 8 && Math.abs(c.target.heading) <= 1.5 && c.wind === null && c.failure === null)
        && Math.max(...col("recovery", (c) => Math.abs(c.start.bank))) > 2.0 && Math.max(...col("recovery", (c) => Math.abs(c.start.velocity[2]))) > 7 && Math.max(...col("recovery", (c) => Math.abs(c.start.pitch))) > 0.7);
    ok("!! MOTOR starts a quadrotor 15..120 m up at 0..8 m/s forward (heading 0, level, no sideways or vertical speed), still air, with the height it starts at as its target, and a failure of motor 0..3 at 0.5..2.5 s -- over 60 seeds reaching both ends of every range and all four motors",
        all("motor", (c) => within(c.start.pos[2], 15, 120) && within(c.start.velocity[0], 0, 8) && c.start.velocity[1] === 0 && c.start.velocity[2] === 0 && c.start.heading === 0 && c.start.pitch === undefined && c.start.bank === undefined
            && c.target.altitude === c.start.pos[2] && c.wind === null && Number.isInteger(c.failure.motor) && within(c.failure.motor, 0, 3) && within(c.failure.at, 0.5, 2.5))
        && lowAndHigh("motor", (c) => c.start.pos[2], 25, 110) && lowAndHigh("motor", (c) => c.start.velocity[0], 1, 7) && lowAndHigh("motor", (c) => c.failure.at, 0.7, 2.3) && new Set(col("motor", (c) => c.failure.motor)).size === 4);
    ok("!! GOTO starts a quadrotor near a hover 20..40 m up (within 0.05 rad of level, 1 m/s of rest horizontally, 0.5 vertically) in a mild wind (a mean of up to 4 m/s a side, gusts of 0.3..1) and asks for a point 40..90 m away at a height of 15..60 m and a heading within 1.5 rad -- and over 60 seeds reaches both ends of the distance and the height, and asks for a height 15 m or more above the start and 15 m or more below it",
        all("goto", (c) => within(c.start.pos[2], 20, 40) && Math.abs(c.start.pitch) <= 0.05 && Math.abs(c.start.bank) <= 0.05 && Math.abs(c.start.velocity[0]) <= 1 && Math.abs(c.start.velocity[1]) <= 1 && Math.abs(c.start.velocity[2]) <= 0.5 && Math.abs(c.start.w[0]) <= 0.1
            && within(dist(c), 40, 90) && within(c.target.altitude, 15, 60) && Math.abs(c.target.heading) <= 1.5 && c.failure === null && c.wind && Math.abs(c.wind.mean[0]) <= 4 && Math.abs(c.wind.mean[1]) <= 4 && within(c.wind.amp[0], 0.3, 1) && within(c.wind.amp[1], 0.3, 1))
        && lowAndHigh("goto", dist, 45, 85) && lowAndHigh("goto", (c) => c.target.altitude, 20, 55) && Math.max(...col("goto", (c) => c.target.altitude - c.start.pos[2])) > 15 && Math.min(...col("goto", (c) => c.target.altitude - c.start.pos[2])) < -15);
    ok("!! HOVER AND GOTO BLOW A WIND AND RECOVERY AND MOTOR DO NOT: over 20 seeds every hover and goto scenario has a wind (a mean, an amplitude, two frequencies and two phases an axis) and every recovery and motor scenario has none (null: still air), by name of kind",
        Array.from({ length: 20 }, (_, i) => i + 1).every((sd) => ["hover", "goto"].every((k) => { const w = DT.scenario(sd, k).wind; return w && w.mean.length === 3 && w.amp.length === 3 && w.freq.every((q) => q.length === 2) && w.phase.every((q) => q.length === 2); }) && ["recovery", "motor"].every((k) => DT.scenario(sd, k).wind === null)));
    // the flight starts from the scenario's start: the first state the pilot is shown is createState(start)
    const rec = DT.scenario(8, "recovery"); let first = null;
    DT.fly((s) => { if (!first) first = s; return { thrust: 0.4, pitch: 0, roll: 0, yaw: 0 }; }, rec);
    const ref = Q.createState(model, { ...rec.start });
    ok("!! THE FLIGHT STARTS FROM THE SCENARIO'S START: the first state the pilot is shown is Q.createState of the scenario's start (position, velocity, attitude, body rates, rotors), to the last digit, for a recovery start banked and spinning",
        first && JSON.stringify(first) === JSON.stringify(ref) && Math.abs(rec.start.bank) > 2 && Math.abs(rec.start.w[0]) > 2 && first.w[0] === rec.start.w[0] && first.vel[2] === rec.start.velocity[2] && first.pos[2] === rec.start.pos[2]);
}

console.log("\n2. THE WIND");
{
    const wd = DT.scenario(3, "hover").wind, w0 = DT.windAt(wd, 12.5);
    ok("!! the wind is a pure function of time (the same instant blows the same twice), changes with time, is never NaN, and stays within mean +- amp",
        JSON.stringify(w0) === JSON.stringify(DT.windAt(wd, 12.5)) && JSON.stringify(DT.windAt(wd, 13)) !== JSON.stringify(w0)
        && Array.from({ length: 200 }, (_, i) => DT.windAt(wd, i * 0.37)).every((w) => w.every((v, k) => Number.isFinite(v) && Math.abs(v - wd.mean[k]) <= wd.amp[k] + 1e-9)));
    ok("!! a null wind is still air, [0, 0, 0], at every time", JSON.stringify(DT.windAt(null, 5)) === "[0,0,0]" && JSON.stringify(DT.windAt(undefined, 0)) === "[0,0,0]");
    ok("!! the wind's mean is the mean: averaged over a long time it is within 0.15 m/s of `mean` on each axis (the gusts are zero-mean sums of sines)",
        (() => { let s = [0, 0, 0]; const n = 40000; for (let i = 0; i < n; i++) { const w = DT.windAt(wd, i * 0.05); s = s.map((v, k) => v + w[k]); } return s.every((v, k) => Math.abs(v / n - wd.mean[k]) < 0.15); })());
    // the wind the model is stepped in is the wind the pilot is handed, tick by tick
    const sc = DT.scenario(4, "hover"), seen = []; let i0 = 0;
    DT.fly((s, t, w) => { if (i0 % 97 === 0) seen.push([i0, w]); i0++; return AD.pilot(s, t, w); }, sc);
    ok("!! THE PILOT IS HANDED THE WIND THE MODEL BLOWS: at every ninety-seventh tick of a hover flight the third argument is windAt(wind, i / 120), to the last digit", seen.length > 20 && seen.every(([i, w]) => JSON.stringify(w) === JSON.stringify(DT.windAt(sc.wind, i * DT.DT))));
    // a flight in a wind that pushes: the hover pilot that holds nothing but its height drifts downwind, so the model feels the same wind it is told about
    const push = custom({ start: { pos: [0, 0, 40] }, target: { pos: [0, 0], altitude: 40, heading: 0 }, wind: { mean: [6, 0, 0], amp: [0, 0, 0], freq: [[1, 2], [1, 2], [1, 2]], phase: [[0, 0], [0, 0], [0, 0]] } });
    const still = DT.fly(holder(40), push), calm = DT.fly(holder(40), custom({ start: { pos: [0, 0, 40] }, target: { pos: [0, 0], altitude: 40, heading: 0 } }));
    ok("!! THE MODEL IS STEPPED IN THE WIND: a quadrotor holding a hover (no position loop, only the velocity loop that brakes it to rest) in a 6 m/s wind is pushed off its point and a calm one is not -- ePos over 0.5 against under 0.02", still.ePos > 0.5 && calm.ePos < 0.02, `ePos ${f(still.ePos, 3)} vs ${f(calm.ePos, 5)}`);
}

console.log("\n3. THE SCORE");
{
    const onTarget = custom({ start: { pos: [0, 0, 40] }, target: { pos: [0, 0], altitude: 40, heading: 0 } });
    const r0 = DT.fly(hand, onTarget);
    ok("!! A PILOT ALREADY ON ITS TARGETS IN TRIM SCORES 0 (to 0.02) AND IS NOT CHARGED FOR TIME: the hand pilot started at rest at the point, 40 m up, heading 0, flies all 2,400 ticks 'airborne' with every error under 0.02",
        Math.abs(r0.score) < 0.02 && r0.status === "airborne" && r0.ticks === FLOWN && r0.ePos < 0.02 && r0.eAlt < 0.02 && r0.eHdg < 0.02, `score ${f(r0.score, 5)}, ePos ${f(r0.ePos, 5)} eAlt ${f(r0.eAlt, 5)} eHdg ${f(r0.eHdg, 5)}`);
    const ground = custom({ start: { pos: [0, 0, TRIM.legDrop] }, target: { pos: [0, 0], altitude: 40, heading: 0 } });
    const rg = DT.fly(() => ({ thrust: 0, pitch: 0, roll: 0, yaw: 0 }), ground);
    ok("!! A FLIGHT THAT ENDS ON ITS FIRST TICK IS CHARGED THE WORST TICK FOR EVERY ONE, EXACTLY: a quadrotor at rest on its legs with the thrust at zero (it 'landed') ends at once and scores -9 to the last digit, 0 ticks flown -- landing is not a way to stop being graded",
        rg.score === -9 && rg.status !== "airborne" && rg.ticks === 0 && rg.ePos === 0 && rg.eAlt === 0 && rg.eHdg === 0, `score ${rg.score} ${rg.status} ticks ${rg.ticks}`);
    const falling = custom({ start: { pos: [0, 0, 30] }, target: { pos: [0, 0], altitude: 40, heading: 0 } });
    const rf = DT.fly(() => ({ thrust: 0, pitch: 0, roll: 0, yaw: 0 }), falling), scored = Math.ceil(rf.ticks / DT.TICKS_PER_SCORE);
    ok("!! A FLIGHT THAT ENDS EARLY IS CHARGED 9 FOR EVERY SCORING TICK IT DID NOT FLY, AND THE ONES IT FLEW BY THEIR ERRORS: a drop from 30 m with no thrust crashes part-way; the score is minus (the mean error x the ticks scored + 9 x the rest) over all 400, recomputed here from the flight's own tick count",
        rf.status !== "airborne" && rf.ticks > 0 && rf.ticks < FLOWN && near(rf.score, -((rf.ePos + rf.eAlt + rf.eHdg) * scored + 9 * (SCORING - scored)) / SCORING, 1e-12) && rf.score < -8 && rf.eAlt > 1, `score ${f(rf.score, 6)} after ${rf.ticks} ticks (${scored} scored of ${SCORING}), ${rf.status}: ${rf.why}`);
    const far = custom({ start: { pos: [0, 0, 40] }, target: { pos: [1000, 0], altitude: 240, heading: 2.0 } });
    const rc = DT.fly(holder(40), far);
    ok("!! THE THREE TERMS ARE POSITION OVER 5 m, HEIGHT OVER 5 m AND HEADING IN RADIANS, EACH CAPPED AT 3: a quadrotor that holds its hover while the target is 1,000 m away, 200 m higher and 2 rad off scores ePos 3 and eAlt 3 exactly (the caps) and eHdg 2.0, and a score of -8.0",
        near(rc.ePos, 3, 1e-9) && near(rc.eAlt, 3, 1e-9) && near(rc.eHdg, 2.0, 0.01) && near(rc.score, -8, 0.01), `ePos ${f(rc.ePos, 6)} eAlt ${f(rc.eAlt, 6)} eHdg ${f(rc.eHdg, 4)} score ${f(rc.score, 4)}`);
    const rn = DT.fly(holder(40), custom({ start: { pos: [0, 0, 40] }, target: { pos: [1.5, 0], altitude: 40, heading: 0 } }));
    ok("!! BELOW THE CAP THE POSITION TERM IS DISTANCE OVER 5 m: holding the hover with the point 1.5 m away (not reached) is 0.3 a tick", near(rn.ePos, 0.3, 0.01), `ePos ${f(rn.ePos, 5)}`);
    const ra = DT.fly(holder(40), custom({ start: { pos: [0, 0, 40] }, target: { pos: [0, 0], altitude: 42.5, heading: 0 } }));
    ok("!! AND THE HEIGHT TERM IS THE HEIGHT ERROR OVER 5 m: holding 40 m with 42.5 m asked is 0.5 a tick", near(ra.eAlt, 0.5, 0.01), `eAlt ${f(ra.eAlt, 5)}`);
    const rb = DT.fly(holder(40), custom({ start: { pos: [0, 0, 40] }, target: { pos: [0, 0], altitude: 37.5, heading: 0 } }));
    ok("!! THE HEIGHT ERROR IS THE MAGNITUDE (a target below is the same distance as a target above): holding 40 m with 37.5 m asked is 0.5 a tick too", near(rb.eAlt, 0.5, 0.01) && rb.eAlt > 0, `eAlt ${f(rb.eAlt, 5)}`);
    const rw = DT.fly(holder(40, -3.0), custom({ start: { pos: [0, 0, 40], heading: -3.0 }, target: { pos: [0, 0], altitude: 40, heading: 3.0 } }));
    ok("!! THE HEADING ERROR IS WRAPPED: holding -3.0 rad when 3.0 is asked is an error of 2 x pi - 6 = 0.283 rad, not 6.0 (and not capped at 3)", near(rw.eHdg, 2 * Math.PI - 6, 0.01), `eHdg ${f(rw.eHdg, 5)}`);
    const rcap = DT.fly(holder(40), custom({ start: { pos: [0, 0, 40] }, target: { pos: [0, 0], altitude: 40, heading: Math.PI - 0.01 } }));
    ok("!! THE HEADING TERM IS CAPPED AT 3 TOO (a wrapped error can reach pi, and the cap binds between 3 and pi): holding heading 0 when pi - 0.01 is asked is a heading error of 3.0 a tick, not 3.13", near(rcap.eHdg, 3, 1e-6), `eHdg ${f(rcap.eHdg, 6)}`);
    const rnh = DT.fly(holder(40, 1.0), custom({ start: { pos: [0, 0, 40], heading: 1.0 }, target: { pos: [0, 0], altitude: 40 } }));
    ok("!! A TARGET WITHOUT A HEADING HAS NO HEADING TERM: the same hover held at heading 1.0 with no heading asked has eHdg exactly 0", rnh.eHdg === 0, `eHdg ${rnh.eHdg}`);
    // the pilot is handed the scenario's own target and no options
    let tgt = null, opt = null; const sc = DT.scenario(2, "goto");
    DT.fly((s, t, w, c) => { if (!tgt) { tgt = t; opt = c; } return AD.pilot(s, t, w); }, sc);
    let tgtM = null, optM = null, windM = null; const scM = DT.scenario(2, "motor");
    DT.fly((s, t, w, c) => { if (!tgtM) { tgtM = t; optM = c; windM = w; } return AD.pilot(s, t, w); }, scM);
    ok("!! THE PILOT IS HANDED THE SCENARIO'S TARGET (the object itself) AND AN EMPTY OPTIONS OBJECT, in a goto flight and in a motor flight alike (the first sabotage run found the motor flight's options going 0 red) -- the job is the same for every pilot; and a motor flight is flown in still air, [0, 0, 0]", tgt === sc.target && opt && Object.keys(opt).length === 0 && tgtM === scM.target && optM && Object.keys(optM).length === 0 && JSON.stringify(windM) === "[0,0,0]");

    // ---- the motor flight
    const mflight = (sc, pilot = hand) => DT.fly(pilot, sc);
    // the failure takes effect on the tick the scenario says, on the motor it names, and only there
    const fc = custom({ kind: "motor", start: { pos: [0, 0, 60], velocity: [3, 0, 0] }, target: { altitude: 60 }, failure: { motor: 2, at: 1.0125 } });
    const healths = []; DT.fly((s, t, w, c) => { healths.push(s.health.slice()); return AD.pilot(s, t, w, c); }, fc);
    const firstOut = healths.findIndex((h) => h[2] === 0);
    ok("!! A MOTOR FAILURE TAKES EFFECT ON THE TICK THE SCENARIO SAYS AND ON THE MOTOR IT NAMES: motor 2 at 1.0125 s (tick 122 at 120 Hz) -- every health before it is 1,1,1,1, from it on 1,1,0,1, and no other motor is touched",
        firstOut === 122 && healths.slice(0, 122).every((h) => h.join() === "1,1,1,1") && healths.slice(122).every((h) => h.join() === "1,1,0,1"), `first tick with motor 2 out: ${firstOut}`);
    const fe = custom({ kind: "motor", start: { pos: [0, 0, 60], velocity: [3, 0, 0] }, target: { altitude: 60 }, failure: { motor: 1, at: 1.0 } });
    const hs = []; DT.fly((s, t, w, c) => { hs.push(s.health[1]); return AD.pilot(s, t, w, c); }, fe);
    ok("!! A FAILURE AT AN EXACT TICK TAKES EFFECT ON THAT TICK, NOT THE NEXT (the comparison is >=): motor 1 at 1.0 s is out at tick 120 (120 x 1/120 is exactly 1) and healthy at tick 119", hs[119] === 1 && hs[120] === 0, `health at 119: ${hs[119]}, at 120: ${hs[120]}`);
    const fc0 = custom({ kind: "motor", start: { pos: [0, 0, 60], velocity: [3, 0, 0] }, target: { altitude: 60 }, failure: { motor: 0, at: 0.5 } });
    let seenOut = null; DT.fly((s, t, w, c) => { if (!seenOut && s.health[0] === 0) seenOut = s.health.slice(); return AD.pilot(s, t, w, c); }, fc0);
    ok("!! ...and motor 0 is motor 0 (the index is the model's, not shifted): a failure of motor 0 reads 0,1,1,1", seenOut && seenOut.join() === "0,1,1,1", seenOut && seenOut.join());
    let minHealth = 1; for (const kind of ["hover", "recovery", "goto"]) DT.fly((s, t, w, c) => { minHealth = Math.min(minHealth, ...s.health); return AD.pilot(s, t, w, c); }, DT.scenario(2, kind));
    ok("!! A HOVER, RECOVERY OR GOTO FLIGHT HAS NO MOTOR FAILURE (every motor at health 1 throughout)", minHealth === 1);
    // a controlled landing: the hand pilot lands from 6 m in still air (the failure is set so far away that it never happens)
    const landScenario = (extra = {}) => custom({ kind: "motor", start: { pos: [0, 0, 6], velocity: [0, 0, 0] }, target: { altitude: 6, land: true }, failure: { motor: 0, at: 1e9 }, ...extra });
    const lander = (vel) => (s, t, w, c) => AD.pilot(s, { altitude: 6, land: true, ...(vel ? { velocity: vel } : {}) }, w, c);
    // independent: step the model to first contact with the same pilot and read what the contact was
    const contact = (pilot, sc) => {
        let s = Q.createState(model, { ...sc.start });
        for (let i = 0; i < 4800; i++) {
            if (i * DT.DT >= sc.failure.at) s = { ...s, health: s.health.map((x, k) => (k === sc.failure.motor ? 0 : x)) };
            const o = Q.stepMultirotor(model, s, pilot(s, sc.target, [0, 0, 0], {}), DT.DT, [0, 0, 0]); s = o.state;
            if (o.status !== "airborne") return { i, status: o.status, sink: o.sink || 0, gs: Math.hypot(s.vel[0], s.vel[1]), speed: Math.hypot(s.vel[0], s.vel[1], s.vel[2]) };
        }
        return null;
    };
    const land0 = mflight(landScenario(), lander(null)), land1 = mflight(landScenario({ start: { pos: [0, 0, 6], velocity: [3, 0, 0] } }), lander([3, 0]));
    const c0 = contact(lander(null), landScenario()), c1 = contact(lander([3, 0]), landScenario({ start: { pos: [0, 0, 6], velocity: [3, 0, 0] } }));
    ok("!! A WALKED-AWAY LANDING COSTS 0.4 x min(1, sink / 6) + 0.4 x min(5, gs / 5), ON FLIGHTS STEPPED INDEPENDENTLY HERE: the hand pilot lands from 6 m, once at rest and once drifting at 3 m/s; each flight's sink, ground speed and speed are the model's at the first contact (read by a loop that does not use the task), its cost is the formula's, and it is 'landed' and 'settled'",
        [[land0, c0], [land1, c1]].every(([r, c]) => c && r.touchdown === "landed" && r.settled && r.status === "landed" && r.sink === c.sink && r.gs === c.gs && r.speed === c.speed && near(r.score, -(0.4 * Math.min(1, c.sink / 6) + 0.4 * Math.min(5, c.gs / 5)), 1e-12))
        && land0.gs < 0.05 && land1.gs > 2 && land1.score < land0.score, `at rest: sink ${f(land0.sink, 3)} gs ${f(land0.gs, 3)} cost ${f(-land0.score, 5)}; drifting: sink ${f(land1.sink, 3)} gs ${f(land1.gs, 3)} cost ${f(-land1.score, 5)}`);
    ok("!! A FLIGHT STOPS FOUR SECONDS (480 TICKS) AFTER ITS FIRST CONTACT: the task's flight ends exactly 480 + 1 ticks after the tick the independent loop sees touch down", c0 && land0.ticks === c0.i + 480 + 1 && c1 && land1.ticks === c1.i + 480 + 1, `first contact at tick ${c0 && c0.i}, flight ${land0.ticks} ticks`);
    const grid = [[0, 0], [6, 0], [0, 5], [3, 2], [6, 5], [12, 5], [0, 25], [3, 25], [6, 25], [6, 40], [100, 1000]];
    ok("!! THE LANDING COST IS ITS FORMULA, CORNERS INCLUDED (no flight reaches the cap, so it is asked directly): 0.4 x min(1, sink / 6) + 0.4 x min(5, gs / 5) at eleven (sink, gs) points -- free at rest, 0.4 at the sink limit, 0.4 more at 5 m/s over the ground, rising to 2.0 at 25 m/s and no further, so the worst landing costs 2.4",
        grid.every(([sk, g]) => near(DT.landingCost(sk, g), 0.4 * Math.min(1, sk / 6) + 0.4 * Math.min(5, g / 5), 1e-12)) && DT.landingCost(0, 0) === 0 && near(DT.landingCost(6, 0), 0.4, 1e-12) && near(DT.landingCost(0, 5), 0.4, 1e-12) && near(DT.landingCost(100, 1000), 2.4, 1e-12) && near(DT.landingCost(6, 25), DT.landingCost(6, 40), 1e-12));
    ok("!! COMING DOWN SLOWER IS ALWAYS BETTER, AND THE WORST LANDING STILL BEATS THE BEST CRASH: the landing cost never falls as the sink or the ground speed rises (a grid of 20 x 20), and its largest value, 2.4, is below the least a crash costs, 3",
        (() => { let good = true; for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20; b++) { const c = DT.landingCost(a * 0.5, b * 3); if (b > 0 && c < DT.landingCost(a * 0.5, (b - 1) * 3) - 1e-12) good = false; if (a > 0 && c < DT.landingCost((a - 1) * 0.5, b * 3) - 1e-12) good = false; if (c > 2.4 + 1e-12) good = false; } return good; })() && DT.landingCost(1e6, 1e6) < DT.crashCost(0));
    const cgrid = [0, 1, 5, 10, 12.5, 20, 25, 30, 100];
    ok("!! THE CRASH COST IS 3 + 4 x min(1, speed / 25): 3 for a crash at no speed, 5 at 12.5 m/s, 7 at 25 and no more beyond (a negative speed is read as none)",
        cgrid.every((v) => near(DT.crashCost(v), 3 + 4 * Math.min(1, v / 25), 1e-12)) && DT.crashCost(0) === 3 && near(DT.crashCost(12.5), 5, 1e-12) && near(DT.crashCost(25), 7, 1e-12) && DT.crashCost(1e6) === 7 && DT.crashCost(-5) === 3);
    // a crash in the middle of the range: a drop from 10 m with no thrust
    const drop = custom({ kind: "motor", start: { pos: [0, 0, 10], velocity: [0, 0, 0] }, target: { altitude: 10 }, failure: { motor: 0, at: 1e9 } });
    const zero = () => ({ thrust: 0, pitch: 0, roll: 0, yaw: 0 }), rd = mflight(drop, zero), cd = contact(zero, drop);
    ok("!! A CRASH COSTS 3 + 4 x min(1, speed / 25) OF THE SPEED AT FIRST CONTACT, ON A FLIGHT BELOW THE CAP: the drop from 10 m with no thrust hits the ground at the speed the independent loop reads (about 14 m/s), 'crashed', not settled, and is charged exactly 3 + 4 x speed / 25 = a number between 5 and 5.5",
        cd && rd.touchdown === "crashed" && rd.status === "crashed" && !rd.settled && rd.speed === cd.speed && cd.speed > 10 && cd.speed < 20 && near(rd.score, -(3 + 4 * cd.speed / 25), 1e-12) && rd.score < -5 && rd.score > -5.5, `speed ${f(rd.speed, 3)} cost ${f(-rd.score, 5)} ${rd.why}`);
    // a touchdown that is walked away from at first and not after: the hand pilot lands from 6 m, then (a second after) the controls go to full thrust and full roll -- it takes off, flips and ends crashed
    let tick = 0; const flipper = (s, t, w, c) => { tick++; return tick > c0.i + 60 ? { thrust: 1, pitch: 0, roll: 1, yaw: 0 } : AD.pilot(s, { altitude: 6, land: true }, w, c); };
    const rfl = mflight(landScenario(), flipper);
    ok("!! A TOUCHDOWN THAT IS NOT STANDING FOUR SECONDS LATER IS CHARGED AS A CRASH OF THE SPEED AT FIRST CONTACT (not as the soft landing it began as): the landing at 0.75 m/s followed, a second later, by full thrust and full roll ends 'crashed', touchdown 'landed', not settled, charged exactly 3 + 4 x 0.75 / 25",
        rfl.touchdown === "landed" && rfl.status === "crashed" && !rfl.settled && rfl.speed === c0.speed && near(rfl.score, -DT.crashCost(c0.speed), 1e-12) && rfl.score < -3 && rfl.score > -3.2, `${rfl.touchdown} ${rfl.status} ${f(rfl.score, 5)} (${rfl.why})`);
    const never = custom({ kind: "motor", start: { pos: [0, 0, 5000] }, target: { altitude: 5000 }, failure: { motor: 0, at: 1e9 } });
    const rnv = mflight(never, holder(5000));
    ok("!! A FLIGHT THAT NEVER TOUCHES DOWN IN ITS 40 SECONDS COSTS 7 (it is not a landing and it is not free): a hover at 5,000 m scores -7, 'airborne', no touchdown, and runs the 40 s ceiling, 4,800 ticks",
        rnv.score === -7 && rnv.status === "airborne" && rnv.touchdown === null && rnv.ticks === 4800 && !rnv.settled, `${rnv.score} ${rnv.status} ${rnv.touchdown} ${rnv.ticks}`);
    // the training motor flights: the cost is the formula on the flight's own fields
    const mot = DT.TRAIN_SET.filter((c) => c.kind === "motor").map((c) => mflight(c));
    const cost = (r) => (r.touchdown === "landed" && r.settled ? -DT.landingCost(r.sink, r.gs) : r.touchdown ? -DT.crashCost(r.speed) : -7);
    ok("!! THE MOTOR FLIGHT'S COST IS THE HEADER'S FORMULA, ON ALL TWELVE TRAINING MOTOR FLIGHTS: recomputed here from each flight's own touchdown, sink, ground speed and speed (the hand pilot loses all twelve, at 20 to 42 m/s)",
        mot.length === 12 && mot.every((r) => near(r.score, cost(r), 1e-12)) && mot.every((r) => r.touchdown === "crashed" && !r.settled && r.speed > 20 && r.speed < 43), mot.map((r) => f(r.speed, 1)).join(" "));
    ok("!! and a faster crash is worse than a slower one: over the twelve training crashes every score falls as the speed at contact rises", (() => { const cr = [...mot].sort((a, b) => a.speed - b.speed); return cr.length > 1 && cr.every((r, i) => i === 0 || r.score <= cr[i - 1].score + 1e-12); })());
    ok("!! A CRASHED FLIGHT ENDS AT THE CRASH (no flying on through the wreck): each training motor flight stops at the tick of its first contact -- the independent loop sees it on the same tick the flight ends", DT.TRAIN_SET.filter((c) => c.kind === "motor").every((c, i) => { const k = contact(hand, c); return k && k.status === "crashed" && mot[i].ticks === k.i + 1; }));
}

console.log("\n4. THE SETS");
{
    const key = (c) => c.kind + ":" + c.seed, S = { TRAIN: DT.TRAIN_SET, HELD_OUT: DT.HELD_OUT_SET, AUDIT: DT.AUDIT_SET, AUDIT2: DT.AUDIT2_SET, BASELINE: DT.BASELINE_SET, SAFETY_POOL: DT.SAFETY_POOL_SET, SAFETY_AUDIT: DT.SAFETY_AUDIT_SET, SAFETY_AUDIT2: DT.SAFETY_AUDIT2_SET };
    const names = Object.keys(S), sizes = { TRAIN: [6, 12, 12, 4], HELD_OUT: [6, 6, 12, 4], AUDIT: [8, 8, 20, 6], AUDIT2: [8, 8, 20, 6], BASELINE: [4, 4, 8, 4], SAFETY_POOL: [10, 10, 30, 10], SAFETY_AUDIT: [10, 10, 30, 10], SAFETY_AUDIT2: [10, 10, 30, 10] };
    ok("!! THE SETS HOLD THE SIZES THE HEADER SAYS, PER KIND (hover, recovery, motor, goto): TRAIN 6/12/12/4 and HELD_OUT 6/6/12/4, the two AUDITs 8/8/20/6, BASELINE 4/4/8/4, the three SAFETY sets 10/10/30/10",
        names.every((n) => DT.KINDS.every((k, i) => S[n].filter((c) => c.kind === k).length === sizes[n][i])), names.map((n) => `${n} ${S[n].length}`).join(", "));
    ok("!! NO (kind, seed) PAIR IS IN TWO SETS, AND NONE IS REPEATED WITHIN ONE (a pilot trained on TRAIN is chosen on HELD_OUT and graded once on an AUDIT: a pair in two of them is a pilot graded on what it was taught)",
        (() => { const seen = new Map(); for (const n of names) for (const c of S[n]) { const k = key(c); if (seen.has(k)) return false; seen.set(k, n); } return seen.size === names.reduce((a, n) => a + S[n].length, 0); })(), `${names.reduce((a, n) => a + S[n].length, 0)} distinct pairs`);
    const tr = DT.TRAIN_SET.filter((c) => c.kind === "recovery").map((c) => c.seed);
    ok("!! TRAIN'S RECOVERY HAS TWELVE SEEDS, 1..6 AND 61..66 (the helicopter's first GPU champion beat the hand pilot on the six recovery scenarios it trained on and lost on the ones it had not seen), and the other kinds' TRAIN seeds are hover 1..6, motor 1..12, goto 1..4",
        tr.join() === "1,2,3,4,5,6,61,62,63,64,65,66" && DT.TRAIN_SET.filter((c) => c.kind === "hover").map((c) => c.seed).join() === "1,2,3,4,5,6" && DT.TRAIN_SET.filter((c) => c.kind === "motor").map((c) => c.seed).join() === "1,2,3,4,5,6,7,8,9,10,11,12" && DT.TRAIN_SET.filter((c) => c.kind === "goto").map((c) => c.seed).join() === "1,2,3,4");
    ok("!! every scenario in a set is the scenario its (kind, seed) makes", names.every((n) => S[n].every((c) => JSON.stringify(c) === JSON.stringify(DT.scenario(c.seed, c.kind)))));
    ok("!! the sets are frozen", names.every((n) => Object.isFrozen(S[n])));
    const small = DT.TRAIN_SET.filter((c, i) => i % 5 === 0), ev = DT.evaluate(hand, small), runs = small.map((c) => DT.fly(hand, c));
    ok("!! evaluate() IS ARITHMETIC OVER fly(): the score is the plain mean of the runs' scores, byKind the mean within each kind (and no entry for a kind the set does not hold), `crashed` the motor flights that did not end standing plus the other flights that did not stay airborne",
        near(ev.score, runs.reduce((a, r) => a + r.score, 0) / runs.length, 1e-12) && DT.KINDS.every((k) => { const rs = runs.filter((r) => r.kind === k); return rs.length === 0 ? !(k in ev.byKind) : near(ev.byKind[k], rs.reduce((a, r) => a + r.score, 0) / rs.length, 1e-12); })
        && ev.crashed === runs.filter((r) => (r.kind === "motor" ? !r.settled : r.status !== "airborne")).length && ev.runs.length === small.length && DT.KINDS.every((k) => runs.some((r) => r.kind === k)) && !("hover" in DT.evaluate(hand, small.filter((c) => c.kind === "goto")).byKind));
}

console.log("\n5. THE BASELINE, FROZEN");
{
    const FROZEN = {
        TRAIN: { score: -2.925885, crashed: 12, byKind: { hover: -0.543845, recovery: -0.493872, motor: -6.913485, goto: -1.832183 } },
        HELD_OUT: { score: -3.351786, crashed: 12, byKind: { hover: -0.589228, recovery: -0.405431, motor: -6.766836, goto: -1.670005 } },
        AUDIT: { score: -3.685561, crashed: 20, byKind: { hover: -0.477144, recovery: -0.607648, motor: -6.719882, goto: -1.952929 } },
        AUDIT2: { score: -3.624811, crashed: 20, byKind: { hover: -0.411788, recovery: -0.41607, motor: -6.70978, goto: -1.903937 } },
        BASELINE: { score: -3.125261, crashed: 8, byKind: { hover: -0.402905, recovery: -0.406429, motor: -6.540753, goto: -1.735464 } },
        SAFETY_POOL: { score: -3.822847, crashed: 30, byKind: { hover: -0.502927, recovery: -0.49233, motor: -6.774467, goto: -1.618423 } },
        SAFETY_AUDIT: { score: -4.015044, crashed: 30, byKind: { hover: -0.55319, recovery: -0.578463, motor: -6.940888, goto: -2.135947 } },
        SAFETY_AUDIT2: { score: -3.880909, crashed: 30, byKind: { hover: -0.471657, recovery: -0.496164, motor: -6.797178, goto: -1.9261 } },
    };
    const S = { TRAIN: DT.TRAIN_SET, HELD_OUT: DT.HELD_OUT_SET, AUDIT: DT.AUDIT_SET, AUDIT2: DT.AUDIT2_SET, BASELINE: DT.BASELINE_SET, SAFETY_POOL: DT.SAFETY_POOL_SET, SAFETY_AUDIT: DT.SAFETY_AUDIT_SET, SAFETY_AUDIT2: DT.SAFETY_AUDIT2_SET }, got = {};
    for (const n of Object.keys(S)) {
        const r = DT.evaluate(hand, S[n]); got[n] = r;
        const fz = FROZEN[n];
        ok(`!! THE HAND PILOT ON ${n} IS PINNED: ${f(fz.score, 6)} (${DT.KINDS.map((k) => `${k} ${f(fz.byKind[k], 6)}`).join(", ")}; ${fz.crashed} not standing of ${S[n].length}) -- a change to the model, the pilot or the task moves it, and this row is where that is said`,
            near(r.score, fz.score, 5e-6) && DT.KINDS.every((k) => near(r.byKind[k], fz.byKind[k], 5e-6)) && r.crashed === fz.crashed, DT.describeEval(r));
    }
    const ended = (n) => got[n].runs.filter((x) => (x.kind === "motor" ? !x.settled : x.status !== "airborne"));
    ok("!! THE HAND PILOT'S TAILS ARE PINNED BY KIND: on every one of the eight sets it ends no hover, recovery or goto flight early (the 232 of them are flown to the end) and it LANDS NO MOTOR FLIGHT -- every one of the 162 ends crashed, at 13.6 to 41.9 m/s: the dead man's curve, and the only place a learned pilot can be worse or better",
        Object.keys(S).every((n) => ended(n).length === got[n].runs.filter((x) => x.kind === "motor").length && ended(n).every((x) => x.kind === "motor" && x.touchdown === "crashed" && x.speed > 13)
            && got[n].runs.filter((x) => x.kind !== "motor").every((x) => x.status === "airborne" && x.ticks === FLOWN)), `not standing: ${Object.keys(S).map((n) => `${n} ${ended(n).length}`).join(", ")}`);
    ok("!! THE MOTOR KIND IS WHERE THE HAND PILOT LOSES, SAID IN THE TASK'S OWN NUMBERS: on every set the motor kind is the worst of the four kinds by more than 4.5 (its mean is between -7 and -6.5 -- the crashes are charged 6.3 to 7), and the recovery kind is not worse than the hover's by more than 0.2",
        Object.values(got).every((r) => r.byKind.motor < -6.5 && r.byKind.motor >= -7 && DT.KINDS.every((k) => k === "motor" || r.byKind[k] - r.byKind.motor > 4.5) && r.byKind.recovery > r.byKind.hover - 0.2), Object.entries(got).map(([n, r]) => `${n} ${f(r.byKind.motor, 3)}`).join(", "));
    const fp = [["hover", 1, "a6bae5f5", 2400], ["recovery", 1, "cc8fa0ab", 2400], ["motor", 1, "89b1e019", 848], ["goto", 1, "5dd507fa", 2400]];
    ok("!! A FLIGHT OF EACH KIND HAS ITS FINGERPRINT PINNED (the sampled states folded to millimetres) and its tick count: hover a6bae5f5, recovery cc8fa0ab, motor 89b1e019 (848 ticks to the crash), goto 5dd507fa",
        fp.every(([k, s, h, n]) => { const r = DT.fly(hand, DT.scenario(s, k)); return r.fingerprint === h && r.ticks === n; }), fp.map(([k, s]) => `${k} ${DT.fly(hand, DT.scenario(s, k)).fingerprint}`).join(" "));
}

console.log("\n6. DETERMINISM, AND THE REPORTING");
{
    const set = DT.TRAIN_SET.filter((c, i) => i % 4 === 1), a = DT.evaluate(hand, set), b = DT.evaluate(hand, set);
    ok("!! a second evaluation is bit-identical: every flight's score, fingerprint and tick count", a.runs.every((r, i) => r.score === b.runs[i].score && r.fingerprint === b.runs[i].fingerprint && r.ticks === b.runs[i].ticks) && a.score === b.score);
    const sc = DT.scenario(5, "motor"), before = JSON.stringify(sc); DT.fly(hand, sc); DT.fly(hand, DT.scenario(5, "hover"));
    ok("!! fly() does not mutate its scenario (the start, the target, the failure)", JSON.stringify(sc) === before && Object.isFrozen(sc));
    const ref = DT.evaluate(hand, set), worse = { runs: ref.runs.map((r, i) => ({ ...r, score: r.score - (i === 0 ? 0.5 : i === 1 ? 0.005 : i === 2 || i === 3 ? -0.5 : 0) })) };
    const v = DT.versus(worse, ref);
    ok("!! versus() counts the scenarios one pilot flew better and worse than the other by more than eps (0.01): one worse by 0.5, TWO better by 0.5 (the counts differ, so a swap of the two is seen), one within eps, the rest the same", v.better === 2 && v.worse === 1 && v.same === set.length - 3, JSON.stringify(v));
    const line = DT.describeEval(ref);
    ok("!! describeEval() is one line: the mean to four places, each kind's mean to three, and the count not standing", /^-?\d+\.\d{4} \(hover -?\d+\.\d{3}, recovery -?\d+\.\d{3}, motor -?\d+\.\d{3}, goto -?\d+\.\d{3}; \d+ not standing\)$/.test(line), line);
    ok("!! a pilot that returns NaN controls does not break the task: the model reads a bad control as neutral, and fly() returns a finite score within the task's bounds for a hover and a motor flight",
        (() => { const nan = () => ({ thrust: NaN, pitch: NaN, roll: NaN, yaw: NaN }); const r1 = DT.fly(nan, DT.scenario(1, "hover")), r2 = DT.fly(nan, DT.scenario(1, "motor")); return Number.isFinite(r1.score) && r1.score >= -9 - 1e-9 && r1.score <= 0 && Number.isFinite(r2.score) && r2.score >= -7 - 1e-9 && r2.score <= 0; })());
    ok("!! a pilot that THROWS is not hidden: the task lets the exception out (a pilot with a bug is not a pilot that crashed)", attempt(() => { DT.fly(() => { throw new Error("boom"); }, DT.scenario(1, "hover")); return false; }, true));
}

console.log(fails ? `\ndroneTask-selfcheck: ${fails} FAILED` : "\ndroneTask-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
