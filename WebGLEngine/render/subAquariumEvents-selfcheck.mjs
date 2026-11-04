// WebGLEngine/render/subAquariumEvents-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumEvents-selfcheck.mjs      (~0.8 s)
//
// A SUB IN THE TANK CAN BE FLOODED OR TOLD TO SURFACE. render/subAquariumSim.mjs gained setEvent(id, "flood" | "sink" | "surface" | null) in v4901; this gate holds it:
//   1  OFF BY DEFAULT   a tank where setEvent was never called, and one where it was called and undone before the first tick, swim to the bit; no event means `event` and `tank` are null in the snapshot
//   2  THE CALL         it answers the event now running; an unknown name throws and changes nothing; an unknown id returns null; null, undefined and "" end an event; the names are pinned
//   3  FLOOD            a 6% leak from 40 s in: the boat blows, drops its weight, and HOLDS its depth for two minutes (never lost, within 8 m of where it was) -- in each of three tanks with different ids
//   4  SINK             the same leak with no rescue: the boat grounds, is counted lost, and comes back with the event cleared
//   5  SURFACE          from wherever it was, the boat comes up and rides: depth under 1 m, speed under 0.5 m/s, tank blown to the stop with air left, never lost
//   6  ENDING           ending a surface puts the boat back to wandering (it is below 5 m again within a minute) with no tank state; swapping flood -> surface keeps the dropped weight
//   8  THE HIGH RIDER  surfacing on the hull with a 25% ballast range floats at its own 0.3 m; a 6% flood on it is trimmed out by the tank with no weight dropped
//   7  THE REST         an event on one sub leaves the others in the tank bit-identical to a tank where nothing happened; setHull clears every event
//
// SABOTAGE LOG -- SEVENTEEN, each applied to render/subAquariumSim.mjs in place, the gate run, the file restored; every one red by name (rows red in brackets):
//   V1 an unknown event name not refused 1 | V2 ending an event leaves the tank 1 | V3 the leak 0 6 | V4 flood flown with no rescue 4 | V5 the rescue at the flood task's 5 m / 10 m (too late for a 40 m boat in a 50 m tank) 5 | V6 surface flown with the plain pilot 2
//   V7 the surface flag not in the target 2 | V8 the held depth not used 3 | V9 a loss leaves the event on 1 | V10 setHull leaves events 1 | V11 sink given the rescue 1 | V12 the tank model never used 5 | V13 the weight error not applied 5
//   V14 the snapshot's tank always false 6 | V15 an unknown id throws 1 | V16 a swap keeps the old clock 1 | V17 the tank starts at 0, not the commanded level 1
// First runs crashed with no FAIL line (V2, V4, V12, V15: a row read s.tank.air on a null tank; the snapshot read eventModel.spec on a cleared event) -- a crash is red but not red BY NAME, so the snapshot is now defensive and the rows say "no tank".
// SECTION 10 (steering, v4904), SIX more, each in place on render/subAquariumSim.mjs and restored: T1 the steered weights never flown 1 | T2 the probe showing the original weights 1 | T3 clearing leaving the steered pilot 1 (0 THE FIRST TIME: nothing compared the pilot after the clear; the row now asks both pilots for one state) | T4 a steer allowed during an event 1 |
//   T5 a sub with no network steered 1 (0 THE FIRST TIME: a null weights array threw a TypeError that the row counted as the refusal; it now wants the message) | T6 the snapshot without `steer` 2 (+ a crash in the first row, and the snapshot row of subAquariumSim-selfcheck).
// SECTION 9 (v4904), SIX more, each applied to render/subAquariumSim.mjs in place and restored: E1 EVENTS without the two names 1 (the pinned names; the section then CRASHES on the unknown event, red but not red by name) | E2 an estimator with no builder not refused 1 | E3 `seen` the held heading, not the autopilot's read 2 |
//   E4 the lit phase's `seen` the true heading, not the read 1 | E5 registerEstimator accepting any name 1 | E6 the builder handed the sub's own pilot, not the spy 3.
// SECTION 11 (needs and limits in the tank, v4904): TEN on render/subAquariumSim.mjs, each in place and restored (rows red, this gate and subAquariumSim-selfcheck together): Q1 EVENTS without needs 1 | Q2 a bad class silently replaced by the default 1 | Q3 injure with no needs not refused 1 | Q4 the snapshot without `needs` 5 (a CRASH the first
//   time: the rows read `.needs.frac` of a null; they now read `(... || {})`) | Q5 the needs never advanced 2 | Q6 no refill trip, the plain pilot 1 | Q7 ending an event leaving the needs 2 | Q8 injure not applied 1 | Q9 the tank-scale crush depth ignored 3 | Q10 the chosen class never used (the default battery) 1 (0 THE FIRST TIME:
//   every row used the default; the air-independent row now asks for its class by name). THE LIST LINE (render/needsView.mjs): V1 the charge not rounded 1 | V2 the exposed flag dropped 1 | V3 the trip never shown 1 | V4 a row with no needs given a line 1 | V5 unlimited shown as a percentage 1. THE PAGE: G1 the menu always starting a battery 1 |
//   G2 injure hurting nothing 2 (this gate and the live row of brainPanel-selfcheck section 13) | G3 needsLine never written 2.
// SECTION 12 (the pump and the repair, v4905), FOURTEEN, each in place on render/subAquariumSim.mjs, render/needsView.mjs or sub-aquarium.html and restored, every one red BY NAME: S1 setAux not clamped | S2 NaN kept | S3 no throw without needs (those three share the clamping row) | S4 aux not passed to stepNeeds 2 | S5 aux kept when the needs restart 1 | S6 snapshot pump always 0 1 | S7 `repairing` ignoring the depth 1 | S8 ignoring the speed 1 | S14 snapshot repair always 0 1 |
// SECTION 13 (the advisor, v4908), TWENTY-NINE mutants of brain/needsAdvisor.mjs, render/subAquariumSim.mjs, render/needsView.mjs and sub-aquarium.html, each in place and restored, every one red BY NAME, identity 0 red: A1-A11 (pump charge floor, flood floor, surface margin, refills gate, repair depth, repair damage, threshold depth, null advice, surface flag to the inner pilot, refilling getter, advice getter) | S1-S10 (dispatcher inverted, aux pump, aux repair, setAdvisor answer, no throw, clearEvent reset, event-start reset, snapshot flag, refilling getter, off clears aux) | V1-V2 (line text, line only when on) | P1-P3 (page handler, boxes disabled, box follows the snapshot). FIRST PASS: A1, S3, S6, S7, S10 and P3 read 0 red and A3 did not match its own pattern -- ROWS ADDED (pump at 15% charge; repair and pump from the advice; both switch-offs; the page box line) and the pattern fixed; an eleventh of them (the advisor test in the aux line) was dead code and was cut.
//   S9 the line without the pump 1 | S10 the line always waiting 1 | S11 the page boxes inverted 1 | S12 the page never disabling them 1 | S13 the page boxes not following the snapshot 1. Four went 0 red the first time and each became a row: S7 and S8 (the wandering boat is fast AND deep, so each leg of the conjunction hid the other: the rows now set the state by hand), S14 (nothing read the repair back) and S5 (the clear in clearEvent and the one in setEvent each hid the other; the clearEvent one is deleted as unobservable, since a sub with no needs has no aux to see).
// V16 and V17 went 0 red the first time: no row looked at the clock or at the starting level; the two rows in section 6 now do.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./subAquariumSim.mjs";
import { turnWorld } from "../tools/subDropout.mjs";
import { mlpLayerCpu as mlpRef } from "./brainTsl.mjs";
import * as PSN from "../brain/pilotSubPolicy.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const entry = (id, extra = {}) => ({ id, name: "Sub " + id, hue: 100, pilot: "autopilot", from: "x", local: true, weights: null, ...extra });
const run = (tank, seconds) => { for (let i = 0; i < Math.round(seconds * 30); i++) tank.step(1 / 30); };
const one = (id = "a", pre = 40) => { const t = A.createTank(); t.sync([entry(id)]); run(t, pre); return t; };
const snap = (t, i = 0) => t.snapshot()[i];
const bits = (t) => JSON.stringify(t.snapshot().map((s) => [s.x, s.y, s.depth, s.heading, s.pitch, s.speed, s.cmd.ballast]));

console.log("subAquariumEvents-selfcheck -- a flood, a sinking and a surfacing in the tank\n");

console.log("1. OFF BY DEFAULT");
{
    const a = A.createTank(), b = A.createTank(); a.sync([entry("a"), entry("b")]); b.sync([entry("a"), entry("b")]);
    b.setEvent("a", "flood"); b.setEvent("a", null);
    run(a, 120); run(b, 120);
    ok("!! a tank where an event was started and ended before the first tick swims to the bit like one where none was", bits(a) === bits(b));
    const s = snap(a);
    ok("no event: the snapshot says event null and tank null, and the pilot's command has exactly four keys", s.event === null && s.tank === null && Object.keys(s.cmd).sort().join() === "ballast,pitch,thrust,yaw");
}

console.log("\n2. THE CALL");
{
    const t = one();
    ok("the names are pinned: flood, sink, surface, dropout, navigator, the two estimators, needs and survey (the compass ones are held by render/compassView-selfcheck.mjs and section 9); the leak is 6%; the rescue blows at 2 m and drops the weight at 4 m", A.EVENTS.join() === "flood,sink,surface,dropout,navigator,fly-estimator,er-estimator,needs,survey" && A.ESTIMATORS.join() === "fly-estimator,er-estimator" && A.LEAK === 0.06 && A.RESCUE.blowDepth === 2 && A.RESCUE.releaseDepth === 4 && Object.isFrozen(A.EVENTS) && Object.isFrozen(A.RESCUE));
    ok("!! setEvent answers the event now running, and the snapshot carries it with a tank at level and air", t.setEvent("a", "flood") === "flood" && snap(t).event === "flood" && snap(t).tank && snap(t).tank.airMax === 1.5 && snap(t).tank.released === false);
    let threw = false; try { t.setEvent("a", "capsize"); } catch (e) { threw = /unknown event "capsize"/.test(e.message); }
    ok("!! an unknown event throws by name and changes nothing (the flood is still running)", threw && snap(t).event === "flood");
    ok("an unknown id answers null and starts nothing", (() => { try { return t.setEvent("nobody", "flood") === null && t.snapshot().length === 1; } catch { return false; } })());
    ok("!! null, undefined and \"\" each end the event: tank and event are null again", [null, undefined, ""].every((v) => { t.setEvent("a", "flood"); const r = t.setEvent("a", v); return r === null && snap(t).event === null && snap(t).tank === null; }));
}

console.log("\n3. FLOOD");
for (const id of ["a", "b", "c"]) {
    const t = one(id), d0 = snap(t).depth; t.setEvent(id, "flood");
    let worst = 0, lostBefore = snap(t).lost;
    for (let k = 0; k < 24; k++) { run(t, 5); worst = Math.max(worst, Math.abs(snap(t).depth - d0)); }
    const s = snap(t);
    ok(`!! tank ${id}: a 6% leak at ${d0.toFixed(1)} m, 120 s on -- never lost, the weight dropped, within 8 m of where it was at its worst`, s.lost === lostBefore && !!s.tank && s.tank.released && worst < 8 && s.event === "flood", `worst ${worst.toFixed(2)} m, lost ${s.lost}, tank ${s.tank ? "air " + s.tank.air.toFixed(2) : "none"}`);
}

console.log("\n4. SINK");
{
    const t = one("a"); t.setEvent("a", "sink");
    let lostAt = null; for (let k = 0; k < 24 && lostAt === null; k++) { run(t, 5); if (snap(t).lost > 0) lostAt = (k + 1) * 5; }
    const s = snap(t);
    ok("!! the same leak with no rescue grounds the boat within two minutes, counts it lost, and puts it back with the event cleared", lostAt !== null && s.lost === 1 && s.event === null && s.tank === null, `lost at ${lostAt} s`);
}

console.log("\n5. SURFACE");
{
    const t = one("a"); t.setEvent("a", "surface"); run(t, 200);
    const s = snap(t);
    ok("!! 200 s after being told to surface the boat rides: depth under 1 m, speed under 0.5 m/s, never lost", s.depth < 1 && s.speed < 0.5 && s.lost === 0, `depth ${s.depth.toFixed(3)} m, speed ${s.speed.toFixed(2)} m/s, status ${s.status}`);
    ok("!! its tank is blown to the stop (level under -0.99) with air left (over 0.3 of 1.5)", !!s.tank && s.tank.level < -0.99 && s.tank.air > 0.3, s.tank ? `level ${s.tank.level.toFixed(3)}, air ${s.tank.air.toFixed(2)}` : "no tank");
}

console.log("\n6. ENDING");
{
    const t = one("a"); t.setEvent("a", "surface"); run(t, 200); t.setEvent("a", null); run(t, 60);
    const s = snap(t);
    ok("!! ending a surface puts the boat back to wandering: below 5 m within a minute, no tank state, no event", s.depth > 5 && s.tank === null && s.event === null, `${s.depth.toFixed(1)} m`);
    const u = one("a"); u.setEvent("a", "flood"); run(u, 60); const rel = !!snap(u).tank && snap(u).tank.released; u.setEvent("a", "surface");
    ok("!! swapping flood for surface keeps the tank: a dropped weight stays dropped", rel && !!snap(u).tank && snap(u).tank.released && snap(u).event === "surface");
    ok("!! and the swap restarts the event's clock (the leak ramp begins again)", u.subs.get("a").eventT === 0 && (run(u, 1), u.subs.get("a").eventT > 0.9 && u.subs.get("a").eventT < 1.1));
    const w = one("a"), c = Math.max(-1, Math.min(1, w.subs.get("a").cmd.ballast)); w.setEvent("a", "flood");
    ok("!! starting an event hands the tank the level the pilot had commanded (no jump in the boat's weight)", snap(w).tank.level === c && c !== 0, `commanded ${c.toFixed(4)}, tank ${snap(w).tank.level.toFixed(4)}`);
}

console.log("\n7. THE REST");
{
    const a = A.createTank(), b = A.createTank(); a.sync([entry("a"), entry("b")]); b.sync([entry("a"), entry("b")]);
    run(a, 30); run(b, 30); b.setEvent("a", "flood"); run(a, 90); run(b, 90);
    const ra = a.snapshot().find((s) => s.id === "b"), rb = b.snapshot().find((s) => s.id === "b");
    ok("!! a flood on sub a leaves sub b swimming to the bit like the tank where nothing happened", JSON.stringify([ra.x, ra.y, ra.depth, ra.heading]) === JSON.stringify([rb.x, rb.y, rb.depth, rb.heading]));
    b.setEvent("a", "surface"); b.setHull("munk3");
    ok("!! setHull clears every event and every tank", b.snapshot().every((s) => s.event === null && s.tank === null));
}

console.log("\n8. THE HIGH RIDER (a hull with a 25% main ballast, picked from the hull list)");
{
    const t = A.createTank({ hull: "highRider" }); t.sync([entry("a")]); run(t, 40); t.setEvent("a", "surface"); run(t, 260);
    const s = snap(t);
    ok("!! told to surface on the high rider, the boat rides with its centre 0.3 m down (0.2..0.4 m), not the EXPLORER's 0.564, nearly stopped, never lost", s.depth > 0.2 && s.depth < 0.4 && s.speed < 0.6 && s.lost === 0, `${s.depth.toFixed(3)} m, ${s.speed.toFixed(2)} m/s, lost ${s.lost}`);
    const u = A.createTank({ hull: "highRider" }); u.sync([entry("a")]); run(u, 40); const d0 = snap(u).depth; u.setEvent("a", "flood"); let worst = 0; for (let k = 0; k < 24; k++) { run(u, 5); worst = Math.max(worst, Math.abs(snap(u).depth - d0)); }
    ok("!! a 6% flood on the high rider is within what its tank trims out: it holds its depth to 8 m, is never lost and does NOT drop its weight (the EXPLORER's tank cannot do that)", worst < 8 && snap(u).lost === 0 && snap(u).tank && snap(u).tank.released === false, `worst ${worst.toFixed(2)} m, released ${snap(u).tank && snap(u).tank.released}`);
}

console.log("\n9. THE TWO ESTIMATOR EVENTS (v4904, ported from the tank-wide compass): a page's pilot, the autopilot's own read in the snapshot");
{
    const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));
    const t0 = A.createTank(); t0.sync([entry("a"), entry("b")]); run(t0, 40);
    let threw = 0; try { t0.setEvent("a", "fly-estimator"); } catch { threw++; }
    ok("!! an estimator event with no builder registered throws and changes nothing (no event, no compass in the snapshot), and an unknown id with none registered throws too", threw === 1 && snap(t0).event === null && snap(t0).compass === null && (() => { try { t0.setEvent("zz", "er-estimator"); return false; } catch { return true; } })());
    let bad = 0; for (const [ev, b] of [["navigator", () => 0], ["fly-estimator", null], ["fly-estimator", "x"], [null, () => 0]]) { try { t0.registerEstimator(ev, b); } catch { bad++; } }
    ok("  registerEstimator refuses a name that is not an estimator event (navigator, null) and a builder that is not a function", bad === 4);
    // an estimator that LIES: it shows the autopilot a world turned 0.5 rad, so the heading the autopilot reads is the true one plus 0.5 in the light and in the dark -- which neither the held heading nor the true one is
    const calls = { n: 0 };
    const lying = (inner) => (st, t, c, aux) => { calls.n++; const w = turnWorld(st, c, 0.5); return inner(w.state, t, w.current, aux); };
    const t1 = A.createTank(), base = A.createTank(); for (const t of [t1, base]) { t.sync([entry("a"), entry("b")]); run(t, 40); }
    t1.registerEstimator("fly-estimator", lying); ok("  a registered builder is accepted and the event starts: it answers the event now running", t1.setEvent("a", "fly-estimator") === "fly-estimator" && snap(t1).event === "fly-estimator");
    run(t1, 4); const lit = snap(t1);
    ok("!! in the light the snapshot's `seen` is what the AUTOPILOT read (the true heading plus the estimator's 0.5 rad), not the true heading, and `error` is that difference wrapped; the compass is valid", lit.compass && lit.compass.valid === true && Math.abs(wrapA(lit.compass.seen - lit.heading) - 0.5) < 0.02 && Math.abs(lit.compass.error - 0.5) < 0.02, lit.compass ? `seen - true = ${wrapA(lit.compass.seen - lit.heading).toFixed(3)}, error ${lit.compass.error.toFixed(3)}` : "no compass");
    run(t1, 6); const h10 = snap(t1).heading;   // event time 10 s: the last lit heading the dark window will freeze
    run(t1, 6);
    const dark = snap(t1);
    ok("!! at event time 16 s the compass is dark (10..26 s): not valid, and `seen` is the autopilot's own read of the FROZEN world (the heading at 10 s plus the estimator's 0.5 rad), not the true heading plus 0.5; error is seen less true, wrapped", dark.compass && dark.compass.valid === false && Math.abs(wrapA(dark.compass.seen - (h10 + 0.5))) < 0.05 && Math.abs(dark.compass.error - wrapA(dark.compass.seen - dark.heading)) < 0.02 && Math.abs(wrapA(dark.heading - h10)) > 0.02,
        dark.compass ? `seen ${dark.compass.seen.toFixed(3)}, frozen heading + 0.5 = ${wrapA(h10 + 0.5).toFixed(3)}, true ${dark.heading.toFixed(3)}, error ${dark.compass.error.toFixed(3)}` : "no compass");
    ok("  the builder's pilot was called every tick of the event (the spy inner is the sub's own pilot)", calls.n >= 16 * 30 - 2 && calls.n <= 16 * 30 + 2, `${calls.n} calls in 16 s`);
    ok("!! the OTHER sub is bit-identical to a tank where nothing happened, and the first sub's event ends clean: compass null, event null", (() => { run(base, 16); const same = JSON.stringify(snap(t1, 1)) === JSON.stringify(snap(base, 1)); t1.setEvent("a", null); return same && snap(t1).event === null && snap(t1).compass === null; })());
    // the same through the second estimator: its own builder, its own event, the same machinery
    const t2 = A.createTank(); t2.sync([entry("a")]); run(t2, 40); t2.registerEstimator("er-estimator", lying); t2.setEvent("a", "er-estimator"); run(t2, 10); const g10 = snap(t2).heading; run(t2, 6);
    ok("  the random-wiring event runs the same way through its own builder (dark at 16 s, the read the frozen heading plus 0.5 rad)", snap(t2).event === "er-estimator" && snap(t2).compass.valid === false && Math.abs(wrapA(snap(t2).compass.seen - (g10 + 0.5))) < 0.05);
}

console.log("\n10. STEERING A HIDDEN NEURON (v4904): the sub flies on a copy of its weights whose output biases moved, and the probe says so");
{
    const PS = await import("../brain/pilotSubPolicy.mjs"), BL = await import("./brainLens.mjs");
    const W = Float32Array.from(PS.handWeights()), net = (id, extra = {}) => entry(id, { weights: Array.from(W), ...extra });
    const t0 = A.createTank(); t0.sync([entry("plain"), net("net")]); run(t0, 20);
    let e1 = 0; try { t0.setSteer("plain", 3, 1); } catch (e) { if (/only a sub flown by a network/.test(String(e.message))) e1++; }
    ok("!! a sub with no network has no neuron to steer: setSteer throws and changes nothing; an unknown id answers null; a bad neuron and a NaN delta throw", e1 === 1 && t0.setSteer("nobody", 3, 1) === null && (() => { let n = 0; for (const [i, d] of [[999, 1], [-1, 1], [3, NaN]]) { try { t0.setSteer("net", i, d); } catch { n++; } } return n === 3 && snap(t0, 1).steer === null; })());
    const base = A.createTank(), st = A.createTank(); for (const t of [base, st]) { t.sync([net("net")]); run(t, 20); }
    const lens = BL.steerLens(PS.layersOf(W), (() => { const p = st.probe("net"); return B_act(p); })(), PS.OUTPUT_NAMES), top = lens.rows[0].i;
    function B_act(p) { let h = PS.features(p.state, p.target, [0, 0, 0]); for (const l of PS.layersOf(p.weights).slice(0, -1)) h = mlpRef(l, h, 1); return h; }
    const r = st.setSteer("net", top, 8 * lens.scale);
    ok("!! setSteer answers { neuron, delta }, the snapshot says so, and the probe's weights are a COPY (the original untouched) whose output biases moved by W x delta; the panel's weights are what the sub flies on", r && r.neuron === top && r.delta === 8 * lens.scale && snap(st).steer.neuron === top && (() => { const p = st.probe("net"); const O0 = PS.layersOf(W).at(-1), O1 = PS.layersOf(p.weights).at(-1); return p.weights !== W && p.steer.neuron === top && PS.OUTPUT_NAMES.every((_, j) => Math.abs(O1.b[j] - O0.b[j] - O0.W[j * O0.nIn + top] * r.delta) < 1e-4); })());
    run(base, 20); run(st, 20);
    const a = snap(base), b = snap(st);
    ok("!! a steered sub flies differently from the same sub unsteered (its position after 20 s is not the same to a metre), and clearing the steer restores the original pilot (the probe's weights are the original again, the snapshot's steer null, and the pilot's command for one and the same state is the unsteered pilot's again and was NOT before)", Math.hypot(a.x - b.x, a.y - b.y, a.depth - b.depth) > 1 && (() => { const q = st.subs.get("net"), bq = base.subs.get("net"), states = [], cmds = (pl) => states.map((x) => JSON.stringify(pl(x, q.target, [0, 0, 0]))); for (let k = 0; k < 6; k++) { run(st, 3); states.push(q.state); } const steered = cmds(q.pilot).some((c, k) => c !== cmds(bq.pilot)[k]); st.setSteer("net", null); return steered && cmds(q.pilot).every((c, k) => c === cmds(bq.pilot)[k]); })() && snap(st).steer === null && st.probe("net").weights.every((v, k) => v === W[k]) && st.probe("net").steer === null, `${Math.hypot(a.x - b.x, a.y - b.y, a.depth - b.depth).toFixed(1)} m apart`);
    let e2 = 0; st.setSteer("net", top, 1); try { st.setEvent("net", "flood"); } catch { e2++; } st.setSteer("net", null); st.setEvent("net", "flood"); let e3 = 0; try { st.setSteer("net", top, 1); } catch { e3++; }
    ok("!! an event and a steer do not mix (each wraps or replaces the pilot): starting an event on a steered sub and steering a sub with an event both throw, and clearing first works", e2 === 1 && e3 === 1 && snap(st).event === "flood" && snap(st).steer === null);
}

console.log("\n11. NEEDS AND LIMITS IN THE TANK (v4904): a charge only the surface refills, a hull that feels the pressure");
{
    const N = await import("../physics/mechanics/subNeeds.mjs");
    const t0 = A.createTank(); t0.sync([entry("a"), entry("b")]); run(t0, 20);
    let e1 = 0, e2 = 0, e3 = 0; try { t0.setNeeds("a", "diesel"); } catch { e1++; } try { t0.setNeeds("a", "battery", { crushDepth: -3 }); } catch { e2++; } try { t0.injure("a", 0.2); } catch (e) { if (/no needs/.test(String(e.message))) e3++; }
    ok("!! a bad class or crush depth throws and changes nothing (no event, needs null), an injure with no needs throws, and an unknown id answers null for both", e1 === 1 && e2 === 1 && e3 === 1 && snap(t0).event === null && snap(t0).needs === null && t0.setNeeds("nobody", "battery") === null && t0.injure("nobody", 0.1) === null);
    const base = A.createTank(); base.sync([entry("a"), entry("b")]); run(base, 20);
    ok("!! setNeeds starts the needs event and answers it; the snapshot carries the readings (class, charge fraction, capacity, strain, damage, flood, collapse depth, refilling, charging, watts); the default hull is the tank-scale 60 m", t0.setNeeds("a", "battery") === "needs" && snap(t0).event === "needs" && (() => { const n = snap(t0).needs || {}; return n.cls === "battery" && n.frac === 1 && n.capacity === 3e6 && n.damage === 0 && n.flood === 0 && n.collapseDepth === 60 && A.NEEDS_CRUSH === 60 && n.refilling === false && "watts" in n && "strain" in n && "charging" in n; })());
    run(t0, 60); run(base, 60);
    ok("!! the charge is drained by the swim (under 100% and over 90% after a minute at the tank's speeds), and the OTHER sub is bit-identical to a tank where nothing was called", (snap(t0).needs || {}).frac < 1 && (snap(t0).needs || {}).frac > 0.9 && JSON.stringify(snap(t0, 1)) === JSON.stringify(snap(base, 1)), `${((snap(t0).needs || {}).frac * 100).toFixed(1)}%`);
    ok("!! injure hurts the hull (answers the damage, clamps at 1, ignores NaN and negatives) and the collapse depth falls with it (60 m sound, 30 m at 1)", t0.injure("a", 0.4) === 0.4 && t0.injure("a", NaN) === 0.4 && t0.injure("a", -1) === 0.4 && (snap(t0).needs || {}).collapseDepth === 60 * (1 - 0.5 * 0.4) && t0.injure("a", 5) === 1 && (snap(t0).needs || {}).collapseDepth === 30);
    // the trip: a boat at 25% climbs to the surface, charges, and goes back to wandering
    const t1 = A.createTank(); t1.sync([entry("a")]); run(t1, 20); t1.setNeeds("a", "battery"); t1.subs.get("a").needs.energy = 0.25 * 3e6;
    let minD = 99, top = 0, lost0 = snap(t1).lost; for (let i = 0; i < 700 * 30; i++) { t1.step(1 / 30); const q = snap(t1); if (!q.needs) break; minD = Math.min(minD, q.depth); top = Math.max(top, q.needs.frac); }
    ok("!! a battery boat at 25% takes the refill trip on its own: its centre comes up under 1 m, the charge rises past 90%, and it is not lost on the way", minD < 1 && top > 0.9 && snap(t1).lost === lost0, `shallowest ${minD.toFixed(2)} m, peak ${(top * 100).toFixed(0)}%`);
    // running dry and the hull's limit
    const t2 = A.createTank(); t2.sync([entry("a")]); run(t2, 20); t2.setNeeds("a", "airIndependent"); t2.subs.get("a").needs.energy = 0; const sp0 = snap(t2).speed; run(t2, 40);
    ok("!! an air-independent boat (the class asked for, not the default) with no charge never refills and has no screw: its speed falls (it coasts) and its charge stays at 0", (snap(t2).needs || {}).cls === "airIndependent" && (snap(t2).needs || {}).capacity === 12e6 && (snap(t2).needs || {}).energy === 0 && snap(t2).speed < sp0 * 0.6 && (snap(t2).needs || {}).charging === false, `${sp0.toFixed(2)} -> ${snap(t2).speed.toFixed(2)} m/s`);
    const t3 = A.createTank(); t3.sync([entry("a")]); run(t3, 20); t3.setNeeds("a", "unlimited"); t3.injure("a", 1); let crushed = false; const l3 = snap(t3).lost; for (let i = 0; i < 900 * 30; i++) { t3.step(1 / 30); if (snap(t3).lost > l3) { crushed = true; break; } }
    ok("!! a boat with its hull injured to the limit (collapse depth 30 m) is crushed when its wandering takes it deeper, is counted lost and comes back with the event cleared", crushed && snap(t3).event === null && snap(t3).needs === null);
    const t4 = A.createTank(); t4.sync([entry("a")]); t4.setNeeds("a", "battery"); t4.setEvent("a", null); const cleared = snap(t4).needs === null && snap(t4).event === null; t4.setNeeds("a", "battery"); t4.setHull("highRider");
    ok("  ending the event, or changing the hull, clears the needs", cleared && snap(t4).needs === null && snap(t4).event === null);
    // the list line (render/needsView.mjs) and the page
    const V = await import("./needsView.mjs"), aqSrc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sub-aquarium.html"), "utf8");
    const row = (o = {}) => ({ needs: { cls: "battery", frac: 0.944, watts: 2518, refilling: false, charging: false, exposed: false, strain: 0.4217, damage: 0.2, flood: 0.0123, collapseDepth: 54, ...o } });
    ok("!! needsLine names the class, the charge (whole percent), the draw in kW, the trip and the charging state ((exposed) on a snorkel), the strain against the collapse depth, the damage and the flooding; a row with no needs has no line; the unlimited class says so", V.needsLine(row()) === "battery · charge 94% · 2.5 kW · hull 0.42 of 54 m · damage 20% · flood 1.2%" && V.needsLine(row({ refilling: true, charging: true, exposed: true, cls: "snorkel" })) === "battery + snorkel · charge 94% · 2.5 kW · REFILLING · charging (exposed) · hull 0.42 of 54 m · damage 20% · flood 1.2%" && V.needsLine({ needs: null }) === "" && V.needsLine(null) === "" && /charge unlimited/.test(V.needsLine(row({ cls: "unlimited", frac: 1 }))), V.needsLine(row()));
    ok("!! the page has the needs menu (off, battery, battery + snorkel, air-independent, unlimited), the injure button, starts the event with tank.setNeeds, hurts with tank.injure(selected, 0.2), and writes needsLine(s) before the other list lines", /id="needsSel"/.test(aqSrc) && /value="airIndependent"/.test(aqSrc) && /id="injureBtn"/.test(aqSrc) && /tank\.setNeeds\(selected, v\)/.test(aqSrc) && /tank\.injure\(selected, 0\.2\)/.test(aqSrc) && /needsLine\(s\) \|\| readout\(s\) \|\| lineFor\(s\)/.test(aqSrc) && /import \{ needsLine \} from "\/render\/needsView\.mjs"/.test(aqSrc) && /import \{ CLASSES as NEEDS_CLASSES \} from "\/physics\/mechanics\/subNeeds\.mjs"/.test(aqSrc) && /hasOwnProperty\.call\(NEEDS_CLASSES, v\)/.test(aqSrc));
    const t5 = A.createTank(); t5.sync([entry("a", { weights: Array.from(PSN.handWeights()) })]); t5.setSteer("a", 3, 1); let e5 = 0; try { t5.setNeeds("a", "battery"); } catch { e5++; }
    ok("  a steered sub is refused the needs (the event wraps the pilot it was started with), and nothing is left pending", e5 === 1 && snap(t5).event === null && snap(t5).needs === null && (t5.setSteer("a", null, 0), t5.setNeeds("a", "battery") === "needs"));
}

console.log("\n12. THE PUMP AND THE REPAIR (v4905): two numbers a page works on a sub that has needs");
{
    const N = await import("../physics/mechanics/subNeeds.mjs");
    const mk = () => { const t = A.createTank(); t.sync([entry("a")]); run(t, 20); t.setNeeds("a", "battery"); return t; };
    const t0 = mk(), n0 = snap(t0).needs;
    ok("!! off by default: a fresh needs event has pump 0, repair 0 and repairing false in the snapshot", n0.pump === 0 && n0.repair === 0 && n0.repairing === false);
    const r1 = t0.setAux("a", { pump: 7, repair: 0.5 }), r2 = t0.setAux("a", { pump: NaN, repair: -1 }), r3 = t0.setAux("a", null);
    let e1 = 0; const tn = A.createTank(); tn.sync([entry("a")]); try { tn.setAux("a", { pump: 1 }); } catch (e) { if (/no needs/.test(String(e.message))) e1++; }
    ok("!! setAux answers the clamped pair (7 -> 1, 0.5 stays; NaN and -1 -> 0; null -> 0, 0), an unknown id answers null, and a sub with no needs throws", r1.pump === 1 && r1.repair === 0.5 && r2.pump === 0 && r2.repair === 0 && r3.pump === 0 && r3.repair === 0 && t0.setAux("nobody", { pump: 1 }) === null && e1 === 1);
    t0.setAux("a", { pump: 1, repair: 0 }); const sn = snap(t0).needs;
    ok("  the snapshot carries what was asked (pump 1, repair 0)", sn.pump === 1 && sn.repair === 0);
    // the pump bails and costs: two identical tanks, 3% flooding and a sound hull, one pumped for 20 s
    const tp = mk(), tq = mk(); for (const t of [tp, tq]) { t.subs.get("a").needs.flood = 0.03; t.subs.get("a").needs.damage = 0; } tp.setAux("a", { pump: 1, repair: 0 }); run(tp, 20); run(tq, 20);
    const fp = snap(tp).needs.flood, fq = snap(tq).needs.flood, ep = tp.subs.get("a").needs.energy, eq = tq.subs.get("a").needs.energy;
    ok("!! the pump bails the flood and draws power: after 20 s a sound hull pumped from 3% flooding is below 0.5% while the unpumped twin still holds 3%, and the pumped boat has spent over 20 kJ more", fp < 0.005 && fq > 0.0299 && eq - ep > 20e3, `flood ${fp.toFixed(4)} against ${fq.toFixed(4)}, ${((eq - ep) / 1e3).toFixed(1)} kJ more`);
    // the repair waits for the surface: while the boat is deeper than 1.5 m the damage never falls and the snapshot says it is not repairing
    const tr = mk(); tr.injure("a", 0.1); tr.setAux("a", { pump: 0, repair: 1 }); let fell = 0, said = 0, seen = 0, prev = snap(tr).needs.damage;
    for (let i = 0; i < 30 * 30; i++) { tr.step(1 / 30); const q = snap(tr), d = q.needs.damage; if (q.depth > 1.5) { seen++; if (d < prev - 1e-12) fell++; if (q.needs.repairing) said++; } prev = d; }
    ok("!! the repair does nothing below a metre: over 30 s with the repair asked for, whenever the boat is deeper than 1.5 m the damage never falls and `repairing` is false", seen > 100 && fell === 0 && said === 0, `${seen} ticks deeper than 1.5 m`);
    // ... and mends at the surface: the boat put at 0.3 m, stopped, loses REPAIR.rate x dt of damage in one tick
    const ts = mk(); ts.injure("a", 0.5); ts.setAux("a", { pump: 0, repair: 1 }); const sb = ts.subs.get("a"); sb.state.pos[2] = -0.3; sb.state.vel[0] = sb.state.vel[1] = sb.state.vel[2] = 0; const d0 = sb.needs.damage, repairingNow = snap(ts).needs.repairing; ts.step(1 / 30);
    const drop = d0 - sb.needs.damage;
    ok("!! at 0.3 m and stopped the repair mends: `repairing` is true and one tick takes off about REPAIR.rate x dt (0.004 x 1/30) of the damage", repairingNow === true && drop > 0.5 * N.REPAIR.rate / 30 && drop < 1.5 * N.REPAIR.rate / 30, `${repairingNow} ${(drop * 1e6).toFixed(0)} per million, expected ${(N.REPAIR.rate / 30 * 1e6).toFixed(0)}`);
    // `repairing` is the conjunction the model uses: within a metre AND nearly still. Each leg alone is not enough (the state is set and the snapshot read before any tick)
    const tg = mk(); tg.setAux("a", { pump: 0, repair: 0.5 }); const gb = tg.subs.get("a"), rep = (z, v) => { gb.state.pos[2] = z; gb.state.vel[0] = v; gb.state.vel[1] = gb.state.vel[2] = 0; return snap(tg).needs.repairing; };
    ok("!! `repairing` needs the surface AND a near stop: 0.3 m and still is true; 5 m and still is false; 0.3 m at 2 m/s is false; and the snapshot carries the repair asked for (0.5)", rep(-0.3, 0) === true && rep(-5, 0) === false && rep(-0.3, 2) === false && rep(-0.3, 0.4) === true && snap(tg).needs.repair === 0.5);
    // starting the needs again (a restart, or after ending the event) finds them off
    tp.setNeeds("a", "battery");
    ok("  starting the needs again on a sub that had the pump and the repair on finds them off", snap(tp).needs.pump === 0 && snap(tp).needs.repair === 0 && tp.subs.get("a").aux === null);
    // the list line and the page
    const V = await import("./needsView.mjs"), pg = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sub-aquarium.html"), "utf8");
    const rw = (o) => ({ needs: { cls: "battery", frac: 0.5, watts: 1000, refilling: false, charging: false, exposed: false, strain: 0.1, damage: 0, flood: 0, collapseDepth: 60, ...o } });
    ok("!! the list line adds ' · pump 100%' and ' · repair 50% (waits for the surface)' only when asked for, and drops the wait once the repair can work", /damage 0% · flood 0\.0% · pump 100% · repair 50% \(waits for the surface\)$/.test(V.needsLine(rw({ pump: 1, repair: 0.5, repairing: false }))) && /· repair 50%$/.test(V.needsLine(rw({ repair: 0.5, repairing: true }))) && !/pump|repair/.test(V.needsLine(rw({ pump: 0, repair: 0 }))));
    ok("!! the page has a pump box and a repair box that call tank.setAux(selected, ...) and follow the selected sub's own state from the snapshot, disabled when it has no needs", /id="pumpChk"/.test(pg) && /id="repairChk"/.test(pg) && /tank\.setAux\(selected, \{ pump: \$\("pumpChk"\)\.checked \? 1 : 0, repair: \$\("repairChk"\)\.checked \? 1 : 0 \}\)/.test(pg) && /me\.needs\.pump > 0/.test(pg) && /me\.needs\.repair > 0/.test(pg) && /\.disabled = !on/.test(pg));
}

// ---- 13. THE ADVISOR (v4908): the Round 4 rule seated on a sub of the needs event, switched from the page
{
    const throws = (f) => { try { f(); return false; } catch (e) { return true; } }, mk = () => { const t = A.createTank(); t.sync([entry("a")]); run(t, 20); t.setNeeds("a", "battery"); return t; }, J = JSON.stringify, AV = await import("../brain/needsAdvisor.mjs"), NT = await import("../brain/needsTask.mjs"), V2 = await import("./needsView.mjs");
    const rd = (o) => ({ refills: true, frac: 0.5, depth: 20, flood: 0, damage: 0, ...o });
    ok("!! the advice is the registered rule read off the sources: the surface threshold is brain/needsTask.mjs's obsThreshold of the depth (0.6 at the surface, 0.3 from 6 m down), surface only for a hull that refills and only under the threshold, the pump when there is flooding over 0.001 and charge over 10%, the repair at under 3 m with damage and charge over 10%, and a null reading advises nothing", AV.adviceOf(rd({ depth: 0, frac: 0.59 })).surface === true && AV.adviceOf(rd({ depth: 0, frac: 0.61 })).surface === false && AV.adviceOf(rd({ depth: 20, frac: 0.29 })).surface === true && AV.adviceOf(rd({ depth: 20, frac: 0.31 })).surface === false && [0, 1, 3, 6, 20].every((d) => AV.adviceOf(rd({ depth: d })).threshold === NT.obsThreshold(d)) && AV.adviceOf(rd({ refills: false, frac: 0.01 })).surface === false && AV.adviceOf(rd({ flood: 0.002 })).pump === true && AV.adviceOf(rd({ flood: 0.0005 })).pump === false && AV.adviceOf(rd({ flood: 0.1, frac: 0.09 })).pump === false && AV.adviceOf(rd({ flood: 0.1, frac: 0.15 })).pump === true && AV.adviceOf(rd({ depth: 2, damage: 0.1 })).repair === true && AV.adviceOf(rd({ depth: 4, damage: 0.1 })).repair === false && AV.adviceOf(rd({ depth: 2, damage: 0 })).repair === false && AV.adviceOf(rd({ depth: 2, damage: 0.1, frac: 0.05 })).repair === false && J(AV.adviceOf(null)) === J({ surface: false, pump: false, repair: false, threshold: 0 }));
    ok("!! the advisor's numbers and its wrapper: the pump needs flooding over FLOOD_MIN (0.001) and charge over PUMP_MIN_CHARGE (0.1); wrap() refuses a missing pilot or a missing read(), and its pilot carries `advice` and `refilling`", AV.PUMP_MIN_CHARGE === 0.1 && AV.FLOOD_MIN === 0.001 && throws(() => AV.wrap(null, { read: () => null })) && throws(() => AV.wrap(() => ({}), {})) && (() => { const w = AV.wrap(() => ({ ok: 1 }), { read: () => rd({ frac: 0.1, depth: 20 }) }); w({}, { depth: 20 }); return w.advice.surface === true && w.refilling === true; })());
    const ta = mk(); let none = 0; try { ta.setAdvisor("a", true); } catch (e) { none++; }
    ok("!! setAdvisor answers the state now (true, false), an unknown id answers null, and a sub with no needs throws; the snapshot carries { on } and the advice when on", (() => { const t = mk(); t.setNeeds("a", "battery"); return t.setAdvisor("a", true) === true && snap(t).needs.advisor.on === true && snap(t).needs.advisor.threshold !== undefined && t.setAdvisor("a", 0) === false && snap(t).needs.advisor.on === false; })() && ta.setAdvisor("zz", true) === null);
    ok("!! a sub with no needs throws on setAdvisor (start them with setNeeds)", none === 1 || (() => { const t = A.createTank(); t.sync([entry("a")]); try { t.setAdvisor("a", true); return false; } catch (e) { return /no needs/.test(String(e.message)); } })());
    // the advisor works the pump itself: flooding 3% on a sound hull with charge, advisor on, nothing asked of the boxes; the twin with it off keeps the flood
    const tp2 = mk(), tq2 = mk(); for (const t of [tp2, tq2]) { t.subs.get("a").needs.flood = 0.03; t.subs.get("a").needs.damage = 0; } tp2.setAdvisor("a", true); run(tp2, 1); run(tq2, 1); const pumpAt1 = snap(tp2).needs.pump, twinAt1 = snap(tq2).needs.pump; run(tp2, 19); run(tq2, 19);
    ok("!! with the advisor on the pump is worked by the rule: the snapshot shows pump 100% in the first second (flooding 3% advised), 20 s on a sound hull bails it below 0.5% while the twin with the advisor off (pump 0 throughout) still holds over 2%, and the pump stands down once the flood is gone (pump 0 at 20 s)", pumpAt1 === 1 && twinAt1 === 0 && snap(tp2).needs.flood < 0.005 && snap(tq2).needs.flood > 0.02 && snap(tp2).needs.pump === 0);
    // the advisor's trip: low charge under the threshold at depth -> advice.surface, REFILLING, the boat rises
    const tr2 = mk(), sb2 = tr2.subs.get("a"), cap = snap(tr2).needs.capacity; sb2.needs.energy = 0.2 * cap; tr2.setAdvisor("a", true); run(tr2, 2); const a0 = snap(tr2); run(tr2, 60);
    ok("!! with the advisor on and the charge at 20% the rule advises the surface (refilling is true, advice.surface is true, the threshold at that depth is shown) and the boat rises: more than 10 m shallower a minute later", a0.needs.advisor.on && a0.needs.advisor.surface === true && a0.needs.refilling === true && a0.needs.advisor.threshold === 0.3 && snap(tr2).depth < a0.depth - 10);
    // OFF is the old tank: a tank where the advisor was switched on and off before the first tick swims the bit for bit as one that never heard of it
    const tb1 = mk(), tb2 = mk(); tb2.setAdvisor("a", true); tb2.setAdvisor("a", false); run(tb1, 30); run(tb2, 30);
    ok("!! switching the advisor on and off before the first tick changes nothing: after 30 s the two tanks' positions, headings and needs are identical", J(snap(tb1).x) === J(snap(tb2).x) && snap(tb1).y === snap(tb2).y && snap(tb1).depth === snap(tb2).depth && snap(tb1).needs.energy === snap(tb2).needs.energy);
    // the advisor works the repair: hurt boat put at the surface and stopped, advisor on and nothing asked of the boxes -> repair 100% in the snapshot, damage falls; switched off, the repair stops at once and the pump too
    const th = mk(), hb = th.subs.get("a"); th.injure("a", 0.3); hb.needs.flood = 0.03; hb.state.pos[2] = -0.3; hb.state.vel[0] = hb.state.vel[1] = hb.state.vel[2] = 0; th.setAdvisor("a", true); th.step(1 / 30); const rp = snap(th).needs, dmg0 = hb.needs.damage; th.step(1 / 30);
    th.setAdvisor("a", false); const off = snap(th).needs;
    ok("!! the advisor works the repair and the pump together: a hurt, flooded boat at 0.3 m and stopped shows repair 100% and pump 100% after one tick and its damage falls; switching the advisor off puts both at 0 at once (the boxes were never touched)", rp.repair === 1 && rp.pump === 1 && hb.needs.damage < dmg0 + 1e-12 && off.repair === 0 && off.pump === 0 && hb.aux === null);
    // starting another event on a sub with the advisor on switches it off, and so does ending the event
    const tf = mk(); tf.setAdvisor("a", true); tf.setEvent("a", "flood"); const tg2 = mk(); tg2.setAdvisor("a", true); tg2.setEvent("a", null);
    ok("!! starting another event on a sub with the advisor on (flood) and ending the event both switch the advisor off", tf.subs.get("a").advisor === false && tg2.subs.get("a").advisor === false);
    // ending the event, or starting another, switches it off; the list line says so; the page has the box
    const te = mk(); te.setAdvisor("a", true); te.setEvent("a", null); te.setNeeds("a", "battery");
    ok("!! ending the needs event and starting them again finds the advisor off", snap(te).needs.advisor.on === false && te.subs.get("a").advisor === false);
    const pg2 = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sub-aquarium.html"), "utf8");
    ok("!! the list line adds ' · ADVISOR (surfaces under 45%)' only when the advisor is on, from the advice's threshold, and the page has the advisor box: it calls tank.setAdvisor(selected, ...), follows the snapshot and disables the pump and repair boxes while it is on", /ADVISOR \(surfaces under 45%\)/.test(V2.needsLine({ needs: { cls: "battery", frac: 0.5, watts: 1000, refilling: false, charging: false, exposed: false, strain: 0.1, damage: 0, flood: 0, collapseDepth: 60, advisor: { on: true, threshold: 0.45 } } })) && !/ADVISOR/.test(V2.needsLine({ needs: { cls: "battery", frac: 0.5, watts: 1000, strain: 0.1, damage: 0, flood: 0, collapseDepth: 60, advisor: { on: false } } })) && /id="advChk"/.test(pg2) && /tank\.setAdvisor\(selected, \$\("advChk"\)\.checked\)/.test(pg2) && /me\.needs\.advisor/.test(pg2) && /\$\("advChk"\)\.checked = adv;/.test(pg2) && /\$\("pumpChk"\)\.disabled = \$\("repairChk"\)\.disabled = !on \|\| adv/.test(pg2));
}

console.log("14. THE SURVEY (v4912, brain/surveySeat.mjs in the tank)");
{
    const V = await import("./needsView.mjs"), T = await import("../brain/needsTask.mjs"), SS = await import("../brain/surveySeat.mjs"), thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    const mk = () => { const t = A.createTank(); t.sync([entry("a")]); run(t, 20); return t; }, st3 = [{ x: 150, y: 120, depth: 20 }, { x: 330, y: 160, depth: 25 }, { x: 250, y: 220, depth: 15 }];
    ok("!! the stations are drawn from the seed, pure: the same seed gives the same stations, another seed other ones; every station is inside the steering box at 8 to 35 m; a count outside 1..6 is refused with this function's message", (() => { const a = A.surveyStations(7), b = A.surveyStations(7), c = A.surveyStations(8); return JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) !== JSON.stringify(c) && a.length === 3 && a.every((q) => A.insideBox(q.x, q.y) && q.depth >= 8 && q.depth <= 35) && A.surveyStations(1, 6).length === 6 && /surveyStations: the station count must be an integer from 1 to 6, got 7/.test(thr(() => A.surveyStations(1, 7))) && thr(() => A.surveyStations(1, 0)) && thr(() => A.surveyStations(1, 2.5)); })());
    ok("!! SURVEY pins the defaults: 600 s, 3 stations, a 60 percent charge, gauge noise 0.1 (the measured condition), depths 8 to 35 m, at most 6 stations; frozen", A.SURVEY.seconds === 600 && A.SURVEY.count === 3 && A.SURVEY.charge === 0.6 && A.SURVEY.gaugeSd === 0.1 && A.SURVEY.minDepth === 8 && A.SURVEY.maxDepth === 35 && A.SURVEY.maxStations === 6 && Object.isFrozen(A.SURVEY));
    const t = mk(), r = t.setSurvey("a", { stations: st3, charge: 0.5, seconds: 120 }), s0 = snap(t);
    ok("!! setSurvey answers 'survey', puts the sub on the event with a battery hull at the asked charge and the stations unvisited, on the tank model (it has a tank)", r === "survey" && s0.event === "survey" && s0.needs.cls === "battery" && Math.abs(s0.needs.frac - 0.5) < 0.01 && s0.tank !== null && s0.survey.total === 3 && s0.survey.visited === 0 && s0.survey.done === false && s0.survey.profile === "standard" && s0.survey.seconds === 120 && s0.survey.stations.every((q, i) => q.x === st3[i].x && q.depth === st3[i].depth && q.visited === false));
    ok("!! an unknown id answers null; a bad option throws with its own message and changes nothing (profile, charge 0 and 2, damage 0.9, gauge -1, seconds 0, no stations, 7 stations, a station too shallow or too deep)", A.createTank().setSurvey("zz", {}) === null && (() => { const u = mk(); const msgs = [thr(() => u.setSurvey("a", { profile: "x" })), thr(() => u.setSurvey("a", { charge: 0 })), thr(() => u.setSurvey("a", { charge: 2 })), thr(() => u.setSurvey("a", { damage: 0.9 })), thr(() => u.setSurvey("a", { gaugeSd: -1 })), thr(() => u.setSurvey("a", { seconds: 0 })), thr(() => u.setSurvey("a", { stations: [] })), thr(() => u.setSurvey("a", { stations: A.surveyStations(1, 6).concat([{ x: 1, y: 1, depth: 10 }]) })), thr(() => u.setSurvey("a", { stations: [{ x: 100, y: 100, depth: 1 }] })), thr(() => u.setSurvey("a", { stations: [{ x: 100, y: 100, depth: 58 }] }))]; return msgs.every((m) => /setSurvey|unknown profile/.test(m)) && /unknown profile "x"/.test(msgs[0]) && /charge must be in \(0, 1\], got 0/.test(msgs[1]) && /damage must be in \[0, 0.8\], got 0.9/.test(msgs[3]) && /survey length must be positive/.test(msgs[5]) && snap(u).event === null && snap(u).survey === null; })());
    run(t, 60); const s1 = snap(t);
    ok("!! while it runs the snapshot says so: t counts the event clock, the seat has planned (plans >= 1 and scheduled rollout seconds > 0), the charge falls or the boat charges, the sub is still alive", s1.survey.t > 55 && s1.survey.t < 61 && s1.survey.plans >= 1 && s1.survey.rolloutSeconds > 0 && s1.needs !== null && s1.lost === 0 && s1.event === "survey");
    run(t, 100); const s2 = snap(t);
    ok("!! at the end of the survey seconds it is DONE with a score in [0, 1] (0.45 per stations visited share + 0.45 home + 0.1 hull), a status, and the boat holds the surface (shallower than 3 m a little later)", s2.survey.done === true && s2.survey.score >= 0 && s2.survey.score <= 1 && s2.survey.status === "submerged" && typeof s2.survey.returned === "boolean" && (run(t, 40), snap(t).depth < 12));
    const u = A.createTank(); u.sync([entry("a")]); run(u, 20); u.setSurvey("a", { stations: [{ x: 250, y: 150, depth: 12 }], seconds: 60 }); const u0 = u.subs.get("a").state; u.subs.get("a").state = { ...u0, pos: [250, 150, -12] }; run(u, 2);
    ok("!! a station is visited when the boat is within 8 m across and 4 m of its depth, and not before: a boat placed on it marks it, and the visited count and the green flag follow", snap(u).survey.visited === 1 && snap(u).survey.stations[0].visited === true);
    const w = A.createTank(); w.sync([entry("a")]); run(w, 20); w.setSurvey("a", { stations: [{ x: 250, y: 150, depth: 12 }], seconds: 60 }); w.subs.get("a").state = { ...w.subs.get("a").state, pos: [250 + 9, 150, -12] }; run(w, 0.2); const far9 = snap(w).survey.visited;
    const w2 = A.createTank(); w2.sync([entry("a")]); run(w2, 20); w2.setSurvey("a", { stations: [{ x: 250, y: 150, depth: 12 }], seconds: 60 }); w2.subs.get("a").state = { ...w2.subs.get("a").state, pos: [250, 150, -12 - 5] }; run(w2, 0.2);
    ok("!! 9 m off across or 5 m off in depth is not a visit (the capture box is 8 m across and 4 m deep)", far9 === 0 && snap(w2).survey.visited === 0);
    const x = mk(); x.setSurvey("a", { stations: st3, seconds: 120 }); x.setEvent("a", null);
    ok("!! restoring ends the survey: the event, the needs and the survey are gone from the snapshot, and nothing of a finished survey remains", snap(x).event === null && snap(x).needs === null && snap(x).survey === null);
    const y = mk(); y.setSurvey("a", { stations: st3, seconds: 5 }); run(y, 8); const done = snap(y).survey; y.setEvent("a", null);
    ok("!! a survey that ended keeps its result in the snapshot ('finished') until the next one starts, and a new survey clears it", done.done === true && snap(y).survey !== null && snap(y).survey.finished === true && snap(y).survey.score === done.score && (y.setSurvey("a", { stations: st3 }), snap(y).survey.finished === undefined && snap(y).survey.done === false));
    const z = mk(); z.setSurvey("a", { stations: st3, seconds: 300, charge: 0.05 }); z.subs.get("a").needs = { ...z.subs.get("a").needs, damage: 0.9 }; let crushed = false; for (let i = 0; i < 30 * 200 && !crushed; i++) { z.step(1 / 30); crushed = snap(z).lost > 0; }
    ok("!! a boat lost in a survey ends it with the loss: it respawns without needs, and its row carries the survey result (done, a status that is not 'submerged', a score of 0 when crushed)", crushed && snap(z).event === null && snap(z).needs === null && snap(z).survey !== null && snap(z).survey.done === true && snap(z).survey.finished === true && snap(z).survey.status !== "submerged" && (snap(z).survey.status !== "crushed" || snap(z).survey.score === 0));
    const g1 = mk(), g2 = mk(); g1.setSurvey("a", { stations: st3, seconds: 120, gaugeSd: 0, charge: 0.4 }); g2.setSurvey("a", { stations: st3, seconds: 120, gaugeSd: 0.3, charge: 0.4 }); run(g1, 100); run(g2, 100);
    ok("!! the gauge noise reaches the seat: the same survey with sd 0 and sd 0.3 does not fly the same path (the seat reads a different charge)", JSON.stringify([snap(g1).x, snap(g1).y, snap(g1).depth]) !== JSON.stringify([snap(g2).x, snap(g2).y, snap(g2).depth]));
    const p1 = mk(), p2 = mk(); p1.setSurvey("a", { stations: st3, seconds: 300, profile: "standard" }); p2.setSurvey("a", { stations: st3, seconds: 300, profile: "events" }); run(p1, 260); run(p2, 260);
    ok("!! the profile reaches the seat: standard replans on the clock and events does not (fewer plans in the same 260 s), and the snapshot names the profile", snap(p2).survey.profile === "events" && snap(p1).survey.profile === "standard" && snap(p2).survey.plans < snap(p1).survey.plans);
    const d1 = mk(), d2 = mk(); d1.setSurvey("a", { stations: st3, seconds: 100 }); d2.setSurvey("a", { stations: st3, seconds: 100 }); run(d1, 90); run(d2, 90);
    ok("!! the survey is deterministic: two tanks given the same survey fly the same dive to the bit", JSON.stringify(d1.snapshot().map((q) => [q.x, q.y, q.depth, q.survey.visited, q.survey.plans])) === JSON.stringify(d2.snapshot().map((q) => [q.x, q.y, q.depth, q.survey.visited, q.survey.plans])));
    const e1 = mk(); e1.subs.get("a").weights = null; let e = 0; try { e1.setSteer("a", 1, 1); } catch { e = 1; }
    const f1 = A.createTank(); f1.sync([entry("a", { weights: Array.from(PSN.handWeights()) })]); f1.setSteer("a", 3, 1);
    ok("!! a sub with a steer is refused a survey with the same message as the other events (clear the steer first)", /clear the sub's steer first/.test(thr(() => f1.setSurvey("a", { stations: st3 }))) && snap(f1).event === null);
    ok("!! two hundred seeds of stations all lie inside the steering box at 8 to 35 m (not only seed 7), and the three coordinates of one seed differ", (() => { for (let s = 0; s < 200; s++) { const a = A.surveyStations(s * 977 + 3, 3); if (!a.every((q) => A.insideBox(q.x, q.y) && q.depth >= 8 && q.depth <= 35)) return false; } const q = A.surveyStations(5, 3); return q[0].x !== q[1].x && q[0].depth !== q[1].depth; })());
    { const d = mk(); d.setSurvey("a", { stations: st3, damage: 0.3 });
      const d0 = mk(); d0.setSurvey("a", { stations: st3 });
      ok("!! the damage option reaches the hull: a survey started at damage 0.3 has a hull at 30 percent damage, and the default has none", Math.abs(snap(d).needs.damage - 0.3) < 1e-9 && Math.abs(snap(d0).needs.damage) < 1e-9);
      function mkSnap() { return null; } }
    { const c = mk(); c.setSurvey("a", { stations: st3, seconds: 5 }); run(c, 8); c.setSurvey("a", { stations: st3 }); c.setEvent("a", null);
      ok("!! a new survey clears the old result for good: after a second survey is ended the row carries no survey at all (the first result does not come back)", snap(c).survey === null); }
    { const h = mk(); h.setSurvey("a", { stations: [{ x: 100, y: 100, depth: 30 }, { x: 400, y: 200, depth: 30 }], seconds: 20 }); run(h, 20); const d0 = snap(h).depth; run(h, 100);
      ok("!! after the survey ends the boat holds the surface instead of going on to the stations: it is more than 10 m shallower 100 s after the end than at the end (29.7 m to 11 m on this boat)", snap(h).survey.done === true && snap(h).depth < d0 - 10 && snap(h).tank !== null, `${d0.toFixed(1)} -> ${snap(h).depth.toFixed(1)}`); }
    { const d = mk(), d0 = snap(d).depth; d.setSurvey("a", { stations: [{ x: 100, y: 100, depth: 30 }], seconds: 5, gaugeSd: 0 }); run(d, 6);
      const e2 = mk(); e2.setSurvey("a", { stations: [{ x: 100, y: 100, depth: 30 }], seconds: 5 }); e2.injure("a", 0.25); run(e2, 6);
      ok("!! the score is the task's: a boat still deep at the end is not home (returned false, no 0.45) and an unhurt hull scores 0.1; hurt by 0.25 the hull term is 0.5 and the score 0.05", d0 > 10 && snap(d).survey.returned === false && Math.abs(snap(d).survey.score - 0.1) < 1e-9 && Math.abs(snap(e2).survey.score - 0.05) < 1e-9); }
    { const r = mk(); r.setSurvey("a", { stations: [{ x: 100, y: 100, depth: 30 }], damage: 0.4, charge: 0.9, seconds: 300 }); let rep = 0; for (let i = 0; i < 30 * 200; i++) { r.step(1 / 30); const sn = snap(r); if (sn.needs) rep = Math.max(rep, sn.needs.repair); }
      ok("!! the seat works the repair itself (the survey's aux comes from its decisions): a damaged boat at the surface has the repair asked for at some tick (needs.repair reaches 1)", rep === 1); }
    { const v = mk(), s0 = snap(v); v.setSurvey("a", { stations: [{ x: s0.x, y: s0.y, depth: s0.depth }, { x: 450, y: 250, depth: 20 }], seconds: 200, gaugeSd: 0 }); run(v, 80); const s = snap(v), moved = Math.hypot(s.x - s0.x, s.y - s0.y);
      ok("!! the seat is told which stations are done: with the first station under the boat (visited at once) it leaves for the second, 100 m or more away in 80 s", s.survey.visited >= 1 && s.survey.stations[0].visited === true && moved > 100, `${moved.toFixed(0)} m`); }
    { const a = mk(), b = mk(); a.setSurvey("a", { stations: [{ x: 200, y: 100, depth: 20 }], seconds: 60 }); b.setSurvey("a", { stations: [{ x: 200, y: 100, depth: 20 }] }); run(a, 5); run(b, 5);
      ok("!! a shortened survey plans for its own length: the first plan of a 60 s survey schedules a tenth of the rollout seconds of a 600 s survey's (60 against 600 for one station)", snap(a).survey.rolloutSeconds * 5 < snap(b).survey.rolloutSeconds, `${snap(a).survey.rolloutSeconds} / ${snap(b).survey.rolloutSeconds}`); }
    ok("!! stations that are not a list are refused with this method's message (a number, a string), and a refused call leaves nothing pending on the sub", (() => { const q = mk(); const m1 = thr(() => q.setSurvey("a", { stations: 5 })), m2 = thr(() => q.setSurvey("a", { stations: "abc" })); return /setSurvey: stations must be 1 to 6 points/.test(m1) && /setSurvey: stations must be 1 to 6 points/.test(m2) && q.subs.get("a").pendingSurvey == null && q.subs.get("a").pendingNeeds == null; })());
    ok("!! a refused start (a steer) leaves no pending survey or needs on the sub, so a later needs event is the plain default", (() => { const q = A.createTank(); q.sync([entry("a", { weights: Array.from(PSN.handWeights()) })]); q.setSteer("a", 3, 1); const m = thr(() => q.setSurvey("a", { stations: st3 })); return /clear the sub's steer first/.test(m) && q.subs.get("a").pendingSurvey === null && q.subs.get("a").pendingNeeds === null; })());
    ok("!! the survey's total is the number of stations it was given: 2, 3 and 5 stations say 2, 3 and 5", [2, 3, 5].every((n) => { const q = mk(); q.setSurvey("a", { stations: A.surveyStations(11, n) }); return snap(q).survey.total === n && snap(q).survey.stations.length === n; }));
    { const q = mk(); q.setSurvey("a", { stations: st3, seconds: 300, charge: 0.05 }); q.subs.get("a").survey.stations[0].visited = true; q.subs.get("a").needs = { ...q.subs.get("a").needs, damage: 0.9 }; for (let i = 0; i < 30 * 30 && snap(q).lost === 0; i++) q.step(1 / 30);
      ok("!! a crushed boat scores 0 whatever it had visited: one station marked visited, the hull crushed at once, the result says crushed and score 0 (and the hull term is 0 too: 0.9 against 0.5)", snap(q).lost > 0 && snap(q).survey.status === "crushed" && snap(q).survey.score === 0 && snap(q).survey.visited === 1); }
    const dd = A.createTank(); dd.sync([entry("a")]); run(dd, 10); dd.setEvent("a", "survey");
    ok("!! setEvent('survey') with no setSurvey starts a default survey (three stations from the sub's name, the standard profile), so the event name is usable on its own", snap(dd).event === "survey" && snap(dd).survey.total === 3 && snap(dd).survey.profile === "standard" && snap(dd).needs !== null);
    ok("!! the list line adds the survey after the needs ('SURVEY 1/3 stations · 40/600 s · events'), says DONE with the score and the status when it is over, and a row with a survey and no needs (a lost boat) is the survey line alone; a row with neither is ''", V.needsLine({ survey: { visited: 1, total: 3, t: 40.4, seconds: 600, profile: "events", done: false } }) === "SURVEY 1/3 stations · 40/600 s · events" && V.needsLine({ survey: { visited: 3, total: 3, t: 600, seconds: 600, profile: "standard", done: true, score: 0.95, status: "submerged" } }) === "SURVEY 3/3 stations · 600/600 s · standard · DONE score 0.95" && V.needsLine({ survey: { visited: 2, total: 3, t: 99, seconds: 600, profile: "wide", done: true, score: 0, status: "crushed" } }).endsWith("DONE score 0.00 (crushed)") && V.needsLine({}) === "" && /^battery · charge 50% .*· damage 0% · flood 0\.0% · SURVEY 0\/3 stations/.test(V.needsLine(snap((() => { const q = mk(); q.setSurvey("a", { stations: st3, charge: 0.5 }); return q; })()))));
    const pg = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sub-aquarium.html"), "utf8");
    ok("!! the page has the survey button and the profile menu (standard, events, wide, ensemble), calls tank.setSurvey(selected, { profile }), and draws the survey's stations on the plan and the side view (amber, green once visited) from the snapshot", /id="surveyBtn"/.test(pg) && /id="surveyProf"/.test(pg) && /value="events"/.test(pg) && /value="wide"/.test(pg) && /value="ensemble"/.test(pg) && /tank\.setSurvey\(selected, \{ profile: \$\("surveyProf"\)\.value \}\)/.test(pg) && /s\.survey && !s\.survey\.finished/.test(pg) && /#5be37d/.test(pg) && /#ffc94d/.test(pg));
    ok("!! the survey stands on the shipped survey seat: the sim calls brain/surveySeat.mjs with the profile and wraps it in needsTask.flyDecision, the planner's constants are the Round 8 ones, and SS.planOf refuses an unknown profile (the profile menu cannot name one the seat does not have)", /SS\.surveySeat\(/.test(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "subAquariumSim.mjs"), "utf8")) && /T\.flyDecision\(/.test(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "subAquariumSim.mjs"), "utf8")) && SS.SURVEY_CONSTANTS.low === 0.3803560726214647 && /unknown profile/.test(thr(() => SS.planOf("x"))) && T.SECONDS === 600);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
