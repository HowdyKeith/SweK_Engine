// WebGLEngine/render/subAquariumEvents-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/subAquariumEvents-selfcheck.mjs      (~1 s)
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
    ok("the names are pinned: flood, sink, surface, dropout, navigator, the two estimators and needs (the compass ones are held by render/compassView-selfcheck.mjs and section 9); the leak is 6%; the rescue blows at 2 m and drops the weight at 4 m", A.EVENTS.join() === "flood,sink,surface,dropout,navigator,fly-estimator,er-estimator,needs" && A.ESTIMATORS.join() === "fly-estimator,er-estimator" && A.LEAK === 0.06 && A.RESCUE.blowDepth === 2 && A.RESCUE.releaseDepth === 4 && Object.isFrozen(A.EVENTS) && Object.isFrozen(A.RESCUE));
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

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
