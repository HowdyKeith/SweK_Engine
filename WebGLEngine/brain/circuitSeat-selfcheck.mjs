// WebGLEngine/brain/circuitSeat-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/circuitSeat-selfcheck.mjs      (about 10 s)
//
// THE GATE OF brain/circuitSeat.mjs: the decision circuit re-based on the seat's own rule, registered in brain/DECISION_CIRCUIT_VS_TWIN_WIP.md (decision D1) before it was written. Nothing is trained here; this holds the code the training will use.
//   1  CONSTANTS   the module takes the survey seat's constants (alpha 0.001, low 0.3204, high 0.6894, ramp 20, cap 0.8861) and the wide bounds, and the 21 / 7 / 30 of Round 3; the plain net's width is the nearest to the reservoir's weight count (84 hidden: 2,443 against 2,452).
//   2  THE DECODE  with the input weights zeroed the outputs are the output bias, so every branch is driven by a chosen residual: the surfacing score 10 (threshold(depth) - FILTERED charge) + o0, with the filter advanced on EVERY call (alpha 0.001) and not the raw gauge; the station argmax of -distance / 200 + o_k
//                  (k < 3) among the feasible unvisited, ties to the first; the cap clamp(0.8861 + 0.05 o4, 0.6, 0.95); the pump and the repair at the rule value + 2 o either way, the charge floor read through the FILTER; the fixed last call; and that the seat never reads the true state.
//   3  THE CADENCE the circuit steps on calls 0, 30, 60 ... and the outputs are held in between; the filter moves on all of them; the seat has `outputs` and `steps`.
//   4  THE PLAIN NET layout [ W1 H x 21 ][ b1 H ][ W2 7 x H ][ b2 7 ], the readout and its bias start at ZERO, the relu hidden layer, the outputs clamped to [-1, 1], mutate changes 1 to 4 numbers and leaves its argument alone, an unusable width refused, and no recurrence (two identical steps give identical outputs).
//   5  THE START   with every output at zero, each of the three families (cx, nostate, plain) IS brain/tunedRule.mjs tunedSeat(SURVEY_CONSTANTS, WIDE_BOUNDS): fingerprint and score equal on dives of every kind, with and without the noisy gauge (24 dives).
// NOT CHECKED, said plainly: that a trained circuit does anything useful (that is the experiment); the reservoir's agreement with brain/pilotNeedsCircuit.mjs beyond the structure shared (that gate holds it).
//
// SABOTAGE LOG (2026-11-07), 191 mutants of brain/circuitSeat.mjs -- 160 mechanical (every comparison, sign, arithmetic operator, constant +-1 and boolean of every code line, one at a time) and 31 by hand (the filter advanced only on stepping calls or reset on every step, the raw gauge read instead of the filter in the surfacing test, the pump and the repair,
// the surfacing gain, ties to the last, visited stations allowed, the last call or the no-station surfacing dropped, the residuals on the wrong outputs or with the wrong sign, the station scale, the distance in x only, the residual indexed from 0, a step every call or on the second call, the plain net's relu dropped, its output unclamped, its readout started nonzero, its step returning the shared array,
// the width floored, the count missing the bias, the policy kind wrong, withheld ignored in either policy, persist true on the plain net), each applied to an isolated tree and this gate run; the file restored (sha256 identical before and after).
//   FIRST PASS: 53 of the 160 mechanical mutants went 0 red. The rows written because of them: the pump and the repair AT THEIR EDGES (o = -0.4999, -0.5, -0.75 with the rule true and 0.4999, 0.5, 0.5001, 0.75 with it false -- the base of +-1 and the doubled residual were unpinned; the strict tests on a flood of exactly 0.001, a charge of exactly 0.1, a damage of exactly 0,
//   the return depth), the surfacing test strict at zero, the fourth station taking no residual (an arrangement in which borrowing o4 changes the choice), the feasibility limit to the equal sign (an exact edge found by search), makeSeat's own options (withheld default, params, bounds) through a spy stepper, the plain net's numerics (a worked pass with every index distinct, the relu, a NaN output reading 0, createPlainPolicy(1),
//   the refusal text, the first layer's mean, sd and tails, every first-layer weight nonzero, the init bias reaching the hidden biases and nowhere else, mutate's 1-to-4 changes, its reach over the weights and its step size).
//   SECOND PASS (191 mutants, the 31 by hand added): 14 went 0 red. Closed by rows: the first layer drawn from the SAME stream as the reservoir's input weights (the first 200 weights equal to the last bit -- three mutants of the Gaussian that leave its distribution unchanged, a cosine over a different number of periods, survived every statistical row), the input gain multiplying the first layer
//   (the registered gain is 1, so a division was invisible), the width rounding rather than flooring (82 -> 3, 64 -> 2), the WITHHELD plain policy.
//   THE 8 THAT REMAIN ARE EQUIVALENT, each argued: the clamp's two ties (v > hi and v < lo give the bound either way), the two digits inside the doc comment of makeSeat, the first layer's loop one weight too long (the bias loop overwrites that weight), the relu's tie at zero, and the two loops one past the end of a typed array (a write there is ignored).
//   TWO REGISTERED CLIPS ARE UNREACHABLE and are not claimed: the cap residual cannot reach 0.6 or 0.95 from 0.8861 +- 0.05 (the same finding as pilotNeedsCircuit-selfcheck's).
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./needsTask.mjs";
import * as P from "./pilotNeedsCircuit.mjs";
import * as U from "./tunedRule.mjs";
import * as SV from "./surveySeat.mjs";
import * as CS from "./circuitSeat.mjs";
import * as L from "../tools/ship/trainSubState.mjs";
import { STATE_INIT } from "./pilotSubCircuitState.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished, which is a failure of whatever it was asking: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const near = (a, b, tol) => Math.abs(a - b) <= tol, J = JSON.stringify;
console.log("circuitSeat-selfcheck -- the decision circuit re-based on the seat's own rule\n");

const M = T.model(), cx = L.loadCircuit();
const cell = (i, nt = "Exc") => ({ id: i, layer: i, nt });
const FIXC = { neurons: [0, 1, 2, 3, 4, 5].map((i) => cell(i)), edges: [[0, 1, 3, 1], [1, 2, 4, 1], [2, 3, 2, 1], [3, 4, 5, 1], [4, 5, 1, 1]], io: { inputs: [0, 1], outputs: [0, 5] } };
const ctxOf = () => ({ model: M, read: () => { throw new Error("the seat must not read the true state"); } });
const stateAt = (x, y, depth, heading = 0) => { const s = S.createState({ depth, speed: 2, heading, model: M }); s.pos[0] = x; s.pos[1] = y; return { ...s, tank: S.initialTank(M) }; };
const q = (x, y, depth, visited = false) => ({ x, y, depth, visited });
const obsOf = (o = {}) => ({ t: 0, stations: [q(50, 0, 20)], ...o, r: { frac: 0.8, depth: 20, flood: 0, damage: 0, collapseDepth: 60, ...(o.r || {}) } });
const Q = U.normalise(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS);

sec("1. THE CONSTANTS");
ok("!! the base parameters are the survey seat's own (alpha 0.001, low 0.3204, high 0.6894, ramp 20, cap 0.8861) and the bounds the wide ones", CS.BASE_PARAMS === SV.SURVEY_CONSTANTS && CS.BASE_BOUNDS === U.WIDE_BOUNDS && near(Q.alpha, 0.001, 1e-12) && near(Q.low, 0.3203560726, 1e-9) && near(Q.high, 0.6893848975, 1e-9) && Q.ramp === 20 && near(Q.cap, 0.8861494767, 1e-9));
ok("!! 21 features, 7 outputs, one step every 30 ticks (the Round 3 decode, imported and not copied)", CS.FEATURES === 21 && CS.OUTPUTS === 7 && CS.STEP_TICKS === 30 && CS.FEATURES === P.FEATURES && CS.OUTPUTS === P.OUTPUTS && CS.STEP_TICKS === P.STEP_TICKS);
ok("!! the plain net's width is the nearest to the reservoir's weight count: H = round((count - 7) / 29), 2,452 -> 84 and a plain net of 84 has 2,443 weights; 7 -> 1, 36 -> 1 and 37 -> 1, 65 -> 2, and it ROUNDS (82 -> 2.59 -> 3, 64 -> 1.97 -> 2, 50 -> 1.48 -> 1), never below 1", CS.matchedHidden(2452) === 84 && CS.plainCount(84) === 2443 && CS.matchedHidden(7) === 1 && CS.matchedHidden(36) === 1 && CS.matchedHidden(65) === 2 && CS.plainCount(1) === 36 && CS.plainCount(2) === 65 && CS.matchedHidden(82) === 3 && CS.matchedHidden(64) === 2 && CS.matchedHidden(50) === 1 && CS.matchedHidden(0) === 1);
{
    const f = CS.familiesOf(cx);
    ok("!! the three families: cx (persist, 2,452 weights), nostate (the same circuit, no state), plain (84 hidden, 2,443 weights)", f.cx.kind === "reservoir" && f.cx.persist === true && f.cx.WEIGHT_COUNT === 2452 && f.nostate.kind === "reservoir" && f.nostate.persist === false && f.nostate.WEIGHT_COUNT === 2452 && f.plain.kind === "plain" && f.plain.hidden === 84 && f.plain.WEIGHT_COUNT === 2443);
}

sec("2. THE DECODE (input weights zeroed: the outputs are the output bias exactly)");
{
    const pol = CS.createReservoirPolicy(FIXC, "fix"), mk = (y) => { const w = pol.handWeights(); for (let i = 0; i < pol.offsets.B; i++) w[i] = 0; for (let o = 0; o < 7; o++) w[pol.offsets.B2 + o] = y[o] || 0; return pol.seatFor(w)(ctxOf()); };
    const st = stateAt(0, 0, 20), sf = (y, o) => mk(y)(st, obsOf(o));
    ok("!! the surfacing threshold is the TUNED rule's: at 20 m (low 0.3204) a charge of 0.31 surfaces and 0.33 does not; at 0 m (high 0.6894) 0.68 surfaces and 0.70 does not; at 10 m (0.5049) 0.50 surfaces and 0.51 does not", sf([], { r: { frac: 0.31 } }).surface === true && sf([], { r: { frac: 0.33 } }).surface === false && sf([], { r: { frac: 0.68, depth: 0 } }).surface === true && sf([], { r: { frac: 0.70, depth: 0 } }).surface === false && sf([], { r: { frac: 0.50, depth: 10 } }).surface === true && sf([], { r: { frac: 0.51, depth: 10 } }).surface === false);
    ok("!! the surfacing score is 10 (threshold - filtered charge) + o0: at 20 m a charge of 0.33 stays down alone, o0 = +1 surfaces it (10 x -0.0096 + 1 > 0), o0 = +0.05 does not (-0.046), and a charge of 0.25 with o0 = -1 does NOT surface (0.7 - 1 < 0)", sf([], { r: { frac: 0.33 } }).surface === false && sf([1], { r: { frac: 0.33 } }).surface === true && sf([0.05], { r: { frac: 0.33 } }).surface === false && sf([-1], { r: { frac: 0.25 } }).surface === false && sf([-0.6], { r: { frac: 0.25 } }).surface === true);
    // the filter: the first call sets it to the gauge, later calls move it by alpha x (gauge - filter): a spike of the raw gauge must not trip the rule, and a long low run does
    const seat = mk([]), s20 = stateAt(0, 0, 20), a0 = seat(s20, obsOf({ r: { frac: 0.9 } })), a1 = seat(s20, obsOf({ r: { frac: 0.0 } })), a2 = seat(s20, obsOf({ r: { frac: 0.0 } }));
    ok("!! the rule reads the FILTERED charge, not the gauge: after a first reading of 0.9 a reading of 0.0 moves the filter by only 0.001 x 0.9 (0.8991), so the seat does NOT surface on a spike to zero", a0.surface === false && a1.surface === false && a2.surface === false);
    const seat2 = mk([]), s2 = stateAt(0, 0, 20); let first = null, n = 0; seat2(s2, obsOf({ r: { frac: 0.9 } }));
    for (; n < 4000; n++) { if (seat2(s2, obsOf({ r: { frac: 0.1 } })).surface) { first = n; break; } }
    // ema_n = 0.1 + 0.8 (1 - alpha)^(n + 1) after the first call; it is under 0.3204 when (0.999)^(n+1) < 0.2755, n + 1 > 1.289 / 0.0010005 = 1288.5
    ok("!! the filter is advanced on EVERY call with alpha 0.001: held at a gauge of 0.1 after a first reading of 0.9, the seat surfaces on the 1,289th later call (the filtered charge crosses 0.3204 between calls 1,288 and 1,289)", first !== null && Math.abs(first - 1288) <= 1, `first surface at later call ${first}`);
    const A = q(50, 0, 20), B = q(100, 0, 20), C = q(5, 0, 58), V = q(1, 1, 20, true);
    ok("!! the station is the argmax of -distance/200 + o_k: the nearer wins at zero residual; o2 = +0.5 makes the farther one (-0.5 + 0.5 = 0 against -0.25) win; o1 = +1 on the nearer keeps it", sf([], { stations: [A, B] }).station === A && sf([0, 0, 0.5], { stations: [A, B] }).station === B && sf([0, 1, 0.5], { stations: [A, B] }).station === A);
    ok("!! only the first three stations take a residual: o1 .. o3 for stations 0, 1, 2, none for the fourth (o4 is the cap's and never reaches the fourth station: +1 on it leaves the nearest, the fourth at 250 m, the choice)", sf([0, 0, 0, 1], { stations: [q(50, 0, 20), q(120, 0, 20), q(150, 0, 20)] }).station.x === 150 && sf([0, 0, 0, 0, 0, 0, 0], { stations: [q(300, 0, 20), q(400, 0, 20), q(500, 0, 20), q(5, 0, 20)] }).station.x === 5 && sf([0, 1, 1, 1], { stations: [q(300, 0, 20), q(400, 0, 20), q(500, 0, 20), q(5, 0, 20)] }).station.x === 5 && sf([0, 0, 0, 0, 1], { stations: [q(300, 0, 20), q(400, 0, 20), q(500, 0, 20), q(250, 0, 20)] }).station.x === 250);
    ok("!! an infeasible station (58 m on a collapse at 60) and a visited one are never chosen, whatever the residual; none left -> no station and the decision is to surface", sf([0, 1, 1, 1], { stations: [C, V] }).station === null && sf([0, 1, 1, 1], { stations: [C, V] }).surface === true && sf([0, 1, 1, 1], { stations: [C, A] }).station === A);
    ok("!! ties go to the first: two stations at the same score choose the first listed", sf([], { stations: [q(0, 60, 20), q(60, 0, 20)] }).station.y === 60 && sf([], { stations: [q(60, 0, 20), q(0, 60, 20)] }).station.x === 60);
    ok("!! the cap is the rule's 0.8861 + 0.05 o4, clamped to [0.6, 0.95]: 0.8861 at zero, 0.9361 at +1, 0.8361 at -1", near(sf([], {}).cap, Q.cap, 1e-12) && near(sf([0, 0, 0, 0, 1], {}).cap, Q.cap + 0.05, 1e-12) && near(sf([0, 0, 0, 0, -1], {}).cap, Q.cap - 0.05, 1e-12));
    ok("!! the pump is the rule (flood over 0.001 and FILTERED charge over 0.1) plus 2 o5 either way: off with no flood, ON with no flood at o5 = +1, ON with flood at zero, OFF with flood at o5 = -1, and the charge floor holds (a first reading of 0.05 with flood: OFF)", sf([], {}).pump === false && sf([0, 0, 0, 0, 0, 1], {}).pump === true && sf([], { r: { flood: 0.01 } }).pump === true && sf([0, 0, 0, 0, 0, -1], { r: { flood: 0.01 } }).pump === false && sf([], { r: { flood: 0.01, frac: 0.05 } }).pump === false);
    const surf = stateAt(0, 0, 1), rp = (y, o) => mk(y)(surf, obsOf({ r: { depth: 1, ...o } })).repair;
    ok("!! the repair is the rule (at the surface, damaged, filtered charge over 0.1) plus 2 o6 either way: ON when damaged at the surface, OFF at o6 = -1, OFF at depth, ON at depth at o6 = +1, OFF at the surface undamaged, OFF when the charge is under 0.1", rp([], { damage: 0.2 }) === true && rp([0, 0, 0, 0, 0, 0, -1], { damage: 0.2 }) === false && mk([])(stateAt(0, 0, 30), obsOf({ r: { damage: 0.2 } })).repair === false && mk([0, 0, 0, 0, 0, 0, 1])(stateAt(0, 0, 30), obsOf({ r: { damage: 0.2 } })).repair === true && rp([], { damage: 0 }) === false && rp([], { damage: 0.2, frac: 0.05 }) === false);
    ok("!! the fixed last call forces the surface whatever the outputs (t 590 at 0.5 m): o0 = -1 does not stop it", mk([-1])(stateAt(0, 0, 0.5), obsOf({ t: 590, r: { depth: 0.5, frac: 0.9 }, stations: [A] })).surface === true);
    const pump2 = (() => { const sd = mk([]); sd(stateAt(0, 0, 20), obsOf({ r: { frac: 0.9 } })); let last; for (let i = 0; i < 2500; i++) last = sd(stateAt(0, 0, 20), obsOf({ r: { frac: 0.0, flood: 0.01 } })); return last.pump; })();
    ok("!! the pump's charge floor reads the FILTER too: after a first reading of 0.9 and 2,500 readings of 0.0 the filter is still 0.07 + ... above 0.1 only until it decays (0.9 x 0.999^2500 = 0.074): the pump is OFF", pump2 === false);
    // the pump and the repair at their edges: the rule's base is +1 or -1, the residual counts twice, and every comparison is strict
    const pumpAt = (o5, over = {}) => { const y = [0, 0, 0, 0, 0, o5]; return mk(y)(stateAt(0, 0, 20), obsOf({ r: { frac: 0.8, ...over } })).pump; };
    ok("!! the pump with the rule TRUE (flooding, charge over 0.1) stays on until o5 reaches -0.5: o5 = -0.4999 ON, -0.5 OFF (the sum is exactly 0 and the test is strict), -0.75 OFF; with the rule FALSE it needs o5 over +0.5: 0.4999 OFF, 0.5 OFF, 0.5001 ON, 0.75 ON", pumpAt(-0.4999, { flood: 0.01 }) === true && pumpAt(-0.5, { flood: 0.01 }) === false && pumpAt(-0.75, { flood: 0.01 }) === false && pumpAt(0.4999) === false && pumpAt(0.5) === false && pumpAt(0.5001) === true && pumpAt(0.75) === true);
    ok("!! the rule's own edges: a flood of exactly 0.001 does not trip the pump (0.0011 does), and a filtered charge of exactly 0.1 does not either (0.1001 does)", pumpAt(0, { flood: 0.001 }) === false && pumpAt(0, { flood: 0.0011 }) === true && pumpAt(0, { flood: 0.01, frac: 0.1 }) === false && pumpAt(0, { flood: 0.01, frac: 0.1001 }) === true);
    const repAt = (o6, over = {}, depth = 1) => { const y = [0, 0, 0, 0, 0, 0, o6]; return mk(y)(stateAt(0, 0, depth), obsOf({ r: { frac: 0.8, depth, damage: 0.2, ...over } })).repair; };
    ok("!! the repair with the rule TRUE (at the surface, damaged, charge over 0.1) stays on until o6 reaches -0.5: -0.4999 ON, -0.5 OFF, -0.75 OFF; with the rule FALSE (at depth) it needs o6 over +0.5: 0.4999 OFF, 0.5 OFF, 0.5001 ON, 0.75 ON", repAt(-0.4999) === true && repAt(-0.5) === false && repAt(-0.75) === false && repAt(0.4999, {}, 30) === false && repAt(0.5, {}, 30) === false && repAt(0.5001, {}, 30) === true && repAt(0.75, {}, 30) === true);
    ok("!! the rule's own edges for the repair: damage of exactly 0 does not trip it (1e-9 does), a filtered charge of exactly 0.1 does not (0.1001 does), and the surface is STRICTLY above the return depth (at 3.0 m it is not at the surface, at 2.99 m it is)", repAt(0, { damage: 0 }) === false && repAt(0, { damage: 1e-9 }) === true && repAt(0, { frac: 0.1 }) === false && repAt(0, { frac: 0.1001 }) === true && repAt(0, {}, T.RETURN_DEPTH) === false && repAt(0, {}, T.RETURN_DEPTH - 0.01) === true);
    ok("!! the surfacing test is strict at zero: a filtered charge exactly at the threshold (the first reading sets the filter; 20 m, the low trip point) does NOT surface (score 0, not above 0); a hair under does", sf([], { r: { frac: Q.low } }).surface === false && sf([], { r: { frac: Q.low - 1e-9 } }).surface === true);
    // the station slots: o1 .. o3 belong to stations 0 .. 2 and the fourth has none (o4 is the cap's)
    ok("!! a station past the third gets no residual: stations at 100, 200, 300 and 150 m (the fourth) with o4 = +1 (the cap's output, which the fourth station must not borrow) still choose the nearest (100 m)", sf([0, 0, 0, 0, 1], { stations: [q(100, 0, 20), q(200, 0, 20), q(300, 0, 20), q(150, 0, 20)] }).station.x === 100);
    // the feasibility test is brain/needsTask.mjs's own, to the equal sign
    let edge = null; for (let cd = 40; cd <= 80 && !edge; cd += 0.5) { const lim = T.HULL_DEPTH * cd, d = lim + T.CAPTURE.depth - 0.5; if (d - T.CAPTURE.depth + 0.5 === lim) edge = { cd, d }; }
    const eobs = (d) => obsOf({ r: { collapseDepth: edge.cd }, stations: [q(50, 0, d)] });
    ok("!! a station exactly at the feasibility limit is feasible (depth - capture depth + 0.5 equal to hull fraction x collapse depth), as T.nearestFeasible says; a hair deeper is not", edge !== null && mk([])(st, eobs(edge.d)).station !== null && T.nearestFeasible(st, eobs(edge.d)) !== null && mk([])(st, eobs(edge.d + 0.01)).station === null && T.nearestFeasible(st, eobs(edge.d + 0.01)) === null, edge ? `limit at collapse depth ${edge.cd}, station depth ${edge.d}` : "no exact edge found");
    // makeSeat's own options, with a stub stepper that remembers what it was fed
    const spy = () => { const o = { xs: [] }; o.sp = { step(x) { o.xs.push(Array.from(x)); return new Float64Array(7); } }; return o; };
    const sp1 = spy(), sp2 = spy(), sp3 = spy(), sp4 = spy();
    CS.makeSeat(sp1.sp)(st, obsOf({ r: { frac: 0.5, flood: 0.02, damage: 0.3 } })); CS.makeSeat(sp2.sp, { withheld: true })(st, obsOf({ r: { frac: 0.5, flood: 0.02, damage: 0.3 } }));
    ok("!! makeSeat feeds the circuit the features of the observation: by default the charge, strain, damage and flood are NOT withheld (feature 0 reads 0.5), with { withheld: true } the first four read 0", sp1.xs.length === 1 && sp1.xs[0].length === 21 && sp1.xs[0][0] === 0.5 && sp1.xs[0][2] === 0.3 && sp2.xs[0].slice(0, 4).every((v) => v === 0) && sp2.xs[0][4] !== 0);
    const tight = { ...SV.SURVEY_CONSTANTS, low: 0.5 }, lowB = { alpha: [0.0001, 0.02], low: [0.4, 0.6], high: [0.35, 0.95], ramp: [2, 60], cap: [0.6, 0.9] };
    const dflt = CS.makeSeat(sp3.sp)(st, obsOf({ r: { frac: 0.45 } })), own = CS.makeSeat(sp3.sp, { params: tight })(st, obsOf({ r: { frac: 0.45 } })), clamped = CS.makeSeat(sp4.sp, { params: SV.SURVEY_CONSTANTS, bounds: lowB })(st, obsOf({ r: { frac: 0.38 } }));
    ok("!! makeSeat takes its constants and bounds from its options: at 20 m a charge of 0.45 stays down at the survey seat's low 0.3204 and surfaces at a low of 0.5; a low of 0.3204 under bounds of [0.4, 0.6] is clamped to 0.4 and surfaces 0.38", dflt.surface === false && own.surface === true && clamped.surface === true);
}

sec("3. THE CADENCE");
{
    const pol = CS.createReservoirPolicy(FIXC, "fix"), W = pol.handWeights(), clean = () => { const w = Float32Array.from(W); for (let i = 0; i < pol.offsets.B; i++) w[i] = 0; for (let i = 0; i < 6; i++) w[pol.offsets.B + i] = 0; return w; };
    const w = clean(); w[0 * 21 + 0] = 1; w[pol.offsets.W2 + 0 * 2 + 0] = 1; w[pol.offsets.SIGMA] = 1;
    const seat = pol.seatFor(w)(ctxOf()), st = stateAt(0, 0, 20), ys = [], steps = [];
    for (let i = 0; i < 61; i++) { seat(st, obsOf({ r: { frac: i < 30 ? 0.2 : i < 60 ? 0.4 : 0.9 } })); ys.push(seat.outputs[0]); steps.push(seat.steps); }
    ok("!! the circuit steps on calls 0, 30 and 60 and the outputs are HELD in between: o0 reads the charge of the first call (0.2) for 30 calls, the 31st (0.4) for the next 30, the 61st (0.9); three steps in 61 calls", near(ys[0], 0.2, 1e-6) && ys.slice(0, 30).every((v) => v === ys[0]) && near(ys[30], 0.4, 1e-6) && ys.slice(30, 60).every((v) => v === ys[30]) && near(ys[60], 0.9, 1e-6) && steps[0] === 1 && steps[29] === 1 && steps[30] === 2 && steps[59] === 2 && steps[60] === 3);
    const a = pol.seatFor(w)(ctxOf()), b = pol.seatFor(w)(ctxOf()); a(st, obsOf({ r: { frac: 0.9 } }));
    b(st, obsOf({ r: { frac: 0.9 } }));
    ok("!! the filter is fresh for every dive and the state starts at zero: two seats built from the same weights and fed the same first reading agree, whatever the first has seen since", a.outputs[0] === b.outputs[0] && a.steps === 1 && b.steps === 1);
    const f1 = pol.seatFor(w)(ctxOf()), f2 = pol.seatFor(w)(ctxOf());
    for (let i = 0; i < 3000; i++) f1(st, obsOf({ r: { frac: 0.9 } }));
    // f1's filter is long dead at 0.9; a fresh seat that sees 0.1 first is at 0.1 and surfaces, while f1 given 0.1 stays at ~0.9 and does not: the filter is per seat
    const s2 = f2(st, obsOf({ r: { frac: 0.1 } })), s1 = f1(st, obsOf({ r: { frac: 0.1 } }));
    ok("!! the filter belongs to the seat: a fresh seat's first reading IS its filtered charge (0.1: it surfaces), an old seat's filter stays near 0.9 (it does not)", s2.surface === true && s1.surface === false);
    const wh = P.featuresOf(st, obsOf({ r: { frac: 0.5 } }), undefined, { withheld: true });
    const ww = clean(); ww[0 * 21 + 0] = 1; ww[pol.offsets.W2 + 0 * 2 + 0] = 1;
    const pw = CS.createReservoirPolicy(FIXC, "fix", { withheld: true }), sw = pw.seatFor(ww)(ctxOf()); sw(st, obsOf({ r: { frac: 0.5 } }));
    ok("!! the WITHHELD reservoir policy is blind to the charge (feature 0 reads 0 so o0 stays 0) while the rule still reads it through its filter", sw.outputs[0] === 0 && wh[0] === 0 && sw(st, obsOf({ r: { frac: 0.1 } })).surface === false);
}

sec("4. THE PLAIN NET");
{
    const H = 3, pl = CS.createPlainPolicy(H, "pl"), w0 = pl.handWeights();
    ok("!! the layout [ W1 H x 21 ][ b1 H ][ W2 7 x H ][ b2 7 ]: 3 x 29 + 7 = 94 weights, B1 at 63, W2 at 66, B2 at 87; the hand weights start the readout (W2 and b2) at ZERO and every first-layer weight random and not zero", pl.WEIGHT_COUNT === 94 && pl.offsets.B1 === 63 && pl.offsets.W2 === 66 && pl.offsets.B2 === 87 && w0.length === 94 && [...w0.slice(66)].every((v) => v === 0) && [...w0.slice(0, 63)].every((v) => v !== 0) && pl.hidden === 3 && pl.kind === "plain" && pl.persist === false && CS.createPlainPolicy(1).WEIGHT_COUNT === 36 && CS.createPlainPolicy(1).hidden === 1);
    const big = CS.createPlainPolicy(84, "big").handWeights(), a = Array.from(big.slice(0, 84 * 21)), mean = a.reduce((x, v) => x + v, 0) / a.length, sd = Math.sqrt(a.reduce((x, v) => x + (v - mean) ** 2, 0) / a.length);
    ok("!! the first layer is N(0, inScale x inputGain = 0.2): over the 1,764 weights of the matched net the mean is within 0.015 of 0, the sd within 5% of 0.2, 68% to 71% within one sd and 94% to 97% within two, every weight finite", a.every(Number.isFinite) && Math.abs(mean) < 0.015 && Math.abs(sd - 0.2) < 0.01 && a.filter((v) => Math.abs(v - mean) < sd).length / a.length > 0.66 && a.filter((v) => Math.abs(v - mean) < sd).length / a.length < 0.72 && a.filter((v) => Math.abs(v - mean) < 2 * sd).length / a.length > 0.94 && a.filter((v) => Math.abs(v - mean) < 2 * sd).length / a.length < 0.975, `mean ${mean.toFixed(4)} sd ${sd.toFixed(4)}`);
    ok("!! the hand weights are deterministic (the same on two calls) and follow the seed (another seed: other weights) and the input scale (inScale 0.4: twice the spread)", J([...pl.handWeights()]) === J([...w0]) && J([...CS.createPlainPolicy(H, "p", {}, { ...STATE_INIT, seed: 5 }).handWeights()]) !== J([...w0]) && (() => { const t = CS.createPlainPolicy(84, "t", {}, { ...STATE_INIT, inScale: 0.4 }).handWeights(), b = Array.from(t.slice(0, 1764)), m = b.reduce((x, v) => x + v, 0) / b.length; return Math.abs(Math.sqrt(b.reduce((x, v) => x + (v - m) ** 2, 0) / b.length) - 0.4) < 0.02; })());
    const cxw = CS.familiesOf(cx).cx.handWeights(), plw = CS.createPlainPolicy(84, "big").handWeights();
    ok("!! the plain net's first layer is drawn from the SAME stream as the reservoir's input weights (seed 4711, the same Gaussian): the first 200 weights of the matched net equal the first 200 of the reservoir's, to the last bit -- so the two start from one initialisation, not two lookalikes", J([...plw.slice(0, 200)]) === J([...cxw.slice(0, 200)]));
    ok("!! the input gain multiplies the first layer (inputGain 2 doubles the sd to about 0.4; the registered gain is 1)", (() => { const t = CS.createPlainPolicy(84, "t", {}, { ...STATE_INIT, inputGain: 2 }).handWeights(), b = Array.from(t.slice(0, 1764)), m = b.reduce((x, v) => x + v, 0) / b.length; return Math.abs(Math.sqrt(b.reduce((x, v) => x + (v - m) ** 2, 0) / b.length) - 0.4) < 0.02; })());
    const pb = CS.createPlainPolicy(H, "pb", {}, { ...STATE_INIT, bias: 0.07 }).handWeights();
    ok("!! the registered init bias goes to the hidden biases and nowhere else: with a bias of 0.07 the three hidden biases read 0.07, the first-layer weights are unchanged and the readout is still ZERO", [...pb.slice(63, 66)].every((v) => Math.abs(v - 0.07) < 1e-7) && J([...pb.slice(0, 63)]) === J([...w0.slice(0, 63)]) && [...pb.slice(66)].every((v) => v === 0));
    // a worked forward pass with distinct numbers everywhere, so that a mis-indexed row, bias or sign cannot cancel
    const w = new Float32Array(94);
    w[0] = 2; w[3] = 4; w[63] = 0.5;                       // hidden 0 = relu(2 x 0.5 + 4 x 0.25 + 0.5) = 2.5
    w[21] = 1; w[24] = 0.2; w[64] = 0.3;                   // hidden 1 = relu(1 x 0.5 + 0.2 x 0.25 + 0.3) = 0.85
    w[42] = -3; w[65] = 0.1;                               // hidden 2 = relu(-3 x 0.5 + 0.1) = relu(-1.4) = 0
    w[66 + 0] = 0.1; w[66 + 1] = 0.2; w[66 + 2] = 0.3; w[87 + 0] = 0.01;                    // o0 = 0.1 x 2.5 + 0.2 x 0.85 + 0.3 x 0 + 0.01 = 0.43
    w[66 + 3 + 0] = -0.1; w[66 + 3 + 1] = 0.3; w[66 + 3 + 2] = 1.0; w[87 + 1] = 0.02;       // o1 = -0.25 + 0.255 + 0 + 0.02 = 0.025
    w[66 + 6 + 1] = 0.4; w[66 + 6 + 2] = 5; w[87 + 2] = -0.5;                               // o2 = 0.34 + 0 - 0.5 = -0.16
    w[87 + 3] = -0.4;                                                                          // o3 = -0.4
    w[66 + 12 + 0] = 1; w[66 + 15 + 0] = -1;                                                  // o4 = 2.5 -> 1, o5 = -2.5 -> -1 (clamped); o6 = 0
    const sp = pl.stepper(w), x = new Float64Array(21); x[0] = 0.5; x[3] = 0.25;
    const y = sp.step(x), want = [0.43, 0.025, -0.16, -0.4, 1, -1, 0];
    ok("!! the net is relu(W1 x + b1) then W2 h + b2 with every index distinct: the worked pass reads 0.43, 0.025, -0.16, -0.4, +1 (clamped), -1 (clamped), 0 -- the second hidden unit's bias, the third unit's relu, each row of W2 and each b2 entry matter", y.length === 7 && want.every((v, i) => near(y[i], v, 1e-6)), [...y].map((v) => v.toFixed(4)).join(" "));
    const y2 = sp.step(x), y3 = sp.step(x);
    ok("!! no recurrence: two more steps on the same input give the same outputs, and the outputs are fresh arrays", J([...y2]) === J([...y]) && J([...y3]) === J([...y]) && y2 !== y3 && y !== y2);
    const wf = new Float32Array(94); wf[66] = Infinity;      // Infinity x 0 = NaN: an output that is not a number reads 0, not 1 and not NaN
    const yf = pl.stepper(wf).step(new Float64Array(21));
    ok("!! an output that comes out as NaN or infinite reads 0 (not clamped to a rail): a readout of Infinity on a silent unit gives o0 = 0", yf[0] === 0 && Number.isFinite(yf[0]) && [...yf].every((v) => v === 0));
    const rng = (() => { let s = 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })(), a0 = Float32Array.from(w0), counts = [], hit = new Set(), deltas = [];
    for (let i = 0; i < 800; i++) { const m = pl.mutate(a0, 0.3, rng); let c = 0; for (let k = 0; k < m.length; k++) if (m[k] !== a0[k]) { c++; hit.add(k); deltas.push(m[k] - a0[k]); } counts.push(c); }
    const dm = deltas.reduce((x, v) => x + v, 0) / deltas.length, dsd = Math.sqrt(deltas.reduce((x, v) => x + (v - dm) ** 2, 0) / deltas.length);
    ok("!! mutate (default maxK) changes 1 to 4 numbers a child: never 0, never 5, and all of 1, 2, 3, 4 happen over 800 children; it reaches most of the 94 weights; the change is gauss x sigma (sd within 12% of 0.3); its argument is left alone and the result is a Float32Array", Math.min(...counts) === 1 && Math.max(...counts) === 4 && [1, 2, 3, 4].every((k) => counts.includes(k)) && hit.size >= 85 && Math.abs(dsd - 0.3) < 0.036 && J([...a0]) === J([...pl.handWeights()]) && pl.mutate(a0, 0.3, rng) instanceof Float32Array && pl.mutate(a0, 0.3, rng).length === 94, `counts ${[1, 2, 3, 4].map((k) => counts.filter((c) => c === k).length).join("/")}, ${hit.size} of 94 reached, delta sd ${dsd.toFixed(3)}`);
    const c2 = []; for (let i = 0; i < 300; i++) { const m = pl.mutate(a0, 0.3, rng, 2); c2.push([...m].filter((v, k) => v !== a0[k]).length); }
    ok("!! mutate honours maxK (2: children of 1 or 2 numbers only)", Math.min(...c2) === 1 && Math.max(...c2) === 2);
    let threw = 0; for (const bad of [0, -1, 2.5, "3", NaN, null]) { try { CS.createPlainPolicy(bad); } catch (e) { if (/hidden must be a whole number of at least 1, got/.test(e.message)) threw++; } }
    ok("!! a hidden width that is not a whole number of at least 1 is refused by name (0, -1, 2.5, a string, NaN, null); 1 is allowed", threw === 6 && (() => { try { CS.createPlainPolicy(1); return true; } catch { return false; } })());
    const wd = new Float32Array(94); wd[66 + 0] = 1; const sw = pl.seatFor(wd)(ctxOf()); sw(stateAt(0, 0, 20), obsOf({ r: { frac: 0.5 } }));
    ok("!! a plain-net seat makes the same decode: the seat steps once and holds (steps 1, outputs of length 7)", sw.steps === 1 && sw.outputs.length === 7);
    const wc = new Float32Array(94); wc[0] = 1; wc[66] = 1;   // hidden 0 reads the charge feature, output 0 reads hidden 0
    const nm = pl.seatFor(wc)(ctxOf()), wh = CS.createPlainPolicy(H, "pl", { withheld: true }).seatFor(wc)(ctxOf()); nm(stateAt(0, 0, 20), obsOf({ r: { frac: 0.5 } })); wh(stateAt(0, 0, 20), obsOf({ r: { frac: 0.5 } }));
    ok("!! the WITHHELD plain policy is blind to the charge (o0 = 0.5 for the normal net, 0 for the withheld one) and says so (withheld true)", near(nm.outputs[0], 0.5, 1e-6) && wh.outputs[0] === 0 && CS.createPlainPolicy(H, "pl", { withheld: true }).withheld === true && pl.withheld === false);
}

sec("5. THE START: ALL OUTPUTS ZERO IS rule-low06");
{
    const fam = CS.familiesOf(cx), rule = T.flyDecision(U.tunedSeat(SV.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), kinds = ["plain", "deep", "far", "both"], bad = [];
    let n = 0;
    for (const name of ["cx", "nostate", "plain"]) {
        const pol = fam[name], pilot = pol.pilotFor(pol.handWeights());
        for (const kind of kinds) for (const seed of [501, 502]) for (const gauge of [null, T.GAUGE]) {
            if (name !== "cx" && !(seed === 501 && gauge)) continue;   // the two reservoir/plain variants on one noisy dive of each kind; cx on all 16
            const c = T.scenario(seed, kind), a = T.fly(pilot, c, { gauge }), b = T.fly(rule, c, { gauge }); n++;
            if (a.fingerprint !== b.fingerprint || a.score !== b.score) bad.push(`${name}:${kind}${seed}${gauge ? "+gauge" : ""}`);
        }
    }
    ok(`!! the untrained cx, nostate and plain pilots ARE rule-low06 (tunedSeat at SURVEY_CONSTANTS and the wide bounds): fingerprints and scores equal on ${n} dives of every kind, with and without the noisy gauge`, bad.length === 0 && n === 16 + 4 + 4, bad.join(", "));
    const pol = fam.cx, w = pol.handWeights(); w[pol.offsets.B2 + 0] = 1;
    const a = T.fly(pol.pilotFor(w), T.scenario(501, "far"), { gauge: T.GAUGE }), b = T.fly(rule, T.scenario(501, "far"), { gauge: T.GAUGE });
    ok("!! a circuit with o0 pushed to +1 is NOT the rule (the comparison above can tell them apart): it surfaces early and flies another dive", a.fingerprint !== b.fingerprint);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exit(fails ? 1 : 0);
