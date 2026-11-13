// WebGLEngine/brain/seatTurretGunner-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/seatTurretGunner-selfcheck.mjs      (about fifteen seconds: 74 fights)
//
// THE RACE CAR'S TURRET GUNNER IN A GUN SEAT, HELD TO WHAT ITS HEADER SAYS. brain/seatTurretGunner.mjs seats brain/gunnerPolicy.mjs's network -- the car's, weight for weight -- in a capital ship's gun seat, laying the gun by rates. Seven things hold it:
//
//   1  IT IS THE CAR'S NETWORK   the sizes, the names, forward(), layersOf(), the hand weights and the zero weights are brain/gunnerPolicy.mjs's own (the same functions), and the policy id is the car's
//   2  THE FEATURES              the eleven, on a seat and a target placed by hand: the errors still to turn, the range over half the reach, the closing and crossing speeds over 200, the sight's flag as `aligned`, and the four the seat holds constant
//   3  THE COMMAND               the outputs are RATES: a full output turns the laid gun by the seat's slew in a tick, inside the arc; the trigger is the third output; the car's drop and ignite change nothing; with no target the gun holds (or rests, when asked); the zero weights never move or fire
//   4  THE HAND'S ERROR          `sigma` shakes the command about where the gun is laid -- the stated size, no drift, not fed back into what the network is shown -- from a stream of the seat's own; with none the command is the laid gun exactly
//   5  THE TWO HALVES            decide is finish(prepare, forward); `net` is what a batch needs and its layers and post give forward's numbers
//   6  THE FINDINGS, PINNED      (twelve ship-against-ship pairs a row, seeds 1-3 of each kind) the car's hand weights against the seat's hand gunner behind regular and perfect sights WITH the hand's error, and behind regular sights WITHOUT it -- the lead that was a filter
//   7  THE FRONT DOOR            the car's brain file is seated by battleshipDuel.sideFromBrains under the car's own policy id; where the weights are; the export list; the report
//
// SABOTAGE LOG: (28 mutants, each applied to a COPY of brain/seatTurretGunner.mjs with a copy of this gate importing it, the copies deleted by name; the number is how many rows went red. ONE ROW IS RED IN EVERY COPY AND IS NOT COUNTED: section 7's seat row asks that the module battleshipDuel seats IS this file,
// and a copy is another module.)
//   T1 the bearing is over pi/2 5 | T2 the pitch error is the sight's pitch 5 | T3 the range is over the whole reach 2 | T4 the range is not capped 1 | T5 closing has the wrong sign 2 | T6 the ship's own velocity is not taken off 3 | T7 reachable is 0 1 | T8 aligned is always 1 5 | T9 the outputs are angles, not rates 7
//   T10 pitch turns at the yaw slew 4 | T11 the arc is not kept 3 | T12 the trigger is the drop output 6 | T13 the trigger is the sight's 1 | T14 with no target the seat rests 3 | T15 any idle is taken 1 | T16 the hand's error is fed back 4 | T17 the hand's error is half 3 | T18 the pitch error is the yaw error 2
//   T19 the shake does not depend on the tick 3 | T20 every seat shares one stream 3 | T21 every seat shares one sight 4 | T22 the network is asked with no target 2 (both are sections that THREW: red by the section's own row, not by a row that names the fault) | T23 post leaves the trigger unsquashed 1
//   T24 the synapses start one late 6 | T25 the output weights are indexed by unit first 1 | T26 the policy id is the seat's 2 | T27 the default tick is a tenth 7 | T28 the hand's error is on by default 4
// None went 0 red. NOT CHECKED: a gunner actually TRAINED on the race page and exported (none is in the tree: the page keeps them in the browser); brain/battleshipFight.mjs with this seat (it does not pass `sigma`, so the hand's error is off there: see the module's header); the GPU batch.
"use strict";
import * as ST from "./seatTurretGunner.mjs";
import * as GP from "./gunnerPolicy.mjs";
import * as D from "./battleshipDuel.mjs";
import * as PB from "./peerBrain.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const SHIP = CS.createCapitalShip(), PD = SHIP.seats.find((s) => s.id === "pd-p1"), MAIN = SHIP.seats.find((s) => s.id === "main-a"), BODY = { pos: [0, 0, 0], vel: [10, 0, 0], q: [1, 0, 0, 0], w: [0, 0, 0] };
const TG = { id: 9, pos: [0, 300, 0], vel: [10, -50, 40], radius: 6 }, near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const sightAt = (yaw, pitch, fire = false, target = 9) => () => ({ yaw, pitch, fire, target }), DT = 1 / 30;
const biasNet = (o, v) => { const w = ST.zeroWeights(); w[ST.biasAt(o)] = v; return w; };

console.log("seatTurretGunner-selfcheck -- the race car's turret gunner in a gun seat\n");

console.log("1. IT IS THE CAR'S NETWORK");
section(() => {
    ok("!! 11 features, 34 neurons, 313 synapses, 5 outputs, 896 weights, and the functions are brain/gunnerPolicy.mjs's own: forward, layersOf, handWeights, zeroWeights, perturb, the names", ST.FEATURES === 11 && ST.HIDDEN === 34 && ST.REC_EDGES === 313 && ST.OUTPUTS === 5 && ST.WEIGHT_COUNT === 896 && ST.WEIGHT_COUNT === GP.WEIGHT_COUNT && ST.forward === GP.forward && ST.layersOf === GP.layersOf && ST.handWeights === GP.handWeights && ST.zeroWeights === GP.zeroWeights && ST.perturb === GP.perturb && ST.FEATURE_NAMES === GP.FEATURE_NAMES && ST.OUTPUT_NAMES === GP.OUTPUT_NAMES);
    ok("the policy id is the car's (`gunnerPolicy`): a file from the race is a file for this seat; a seat reads outputs 0-2 and the features that vary in a seat are seven of the eleven", ST.POLICY_ID === "gunnerPolicy" && ST.READ_OUTPUTS.join() === "0,1,2" && ST.LIVE_FEATURES.join() === "0,1,2,3,4,5,8" && ST.REACH === 600 && ST.CLOSING === 200);
});

console.log("2. THE FEATURES");
section(() => {
    const x = ST.features(PD, { yaw: 0.2, pitch: -0.1 }, BODY, { yaw: 0.5, pitch: 0.3, fire: true, target: 9 }, TG, 600);
    ok("!! a target 300 units to port, the sight asking for yaw 0.5 and pitch 0.3 of a seat at 0.2 and -0.1: bias 1; bearing 0.3 / pi; pitch 0.4 / (pi / 2); range 300 / 300 = 1; closing 50 / 200 (it comes at 50); crossing 40 / 200 (the ship's own 10 along x is taken off); reloading 0; reachable 1; aligned 1; the two oil features 0",
        x.length === 11 && x[0] === 1 && near(x[1], 0.3 / Math.PI) && near(x[2], 0.4 / (Math.PI / 2)) && near(x[3], 1) && near(x[4], 0.25) && near(x[5], 0.2) && x[6] === 0 && x[7] === 1 && x[8] === 1 && x[9] === 0 && x[10] === 0);
    const far = ST.features(PD, { yaw: 0, pitch: 0 }, BODY, { yaw: 0, pitch: 0, fire: false, target: 9 }, { ...TG, pos: [0, 900, 0], vel: [10, 80, 0] }, 600), half = ST.features(PD, { yaw: 0, pitch: 0 }, BODY, { yaw: 0, pitch: 0, fire: false, target: 9 }, TG, 1200);
    ok("the range stops at 2 (900 of a reach of 600), a target going away closes at -0.4, `aligned` is the sight's flag (0 when it is off), and the reach scales the range (300 of 1,200 is 0.5)", far[3] === 2 && near(far[4], -0.4) && far[5] === 0 && far[8] === 0 && near(half[3], 0.5));
    const bad = ST.features(PD, { yaw: NaN, pitch: 0 }, BODY, { yaw: 0, pitch: Infinity, fire: false, target: 9 }, { ...TG, vel: undefined }, 600);
    ok("a number that is not finite is shown as 0, and a target with no velocity is one at rest (the ship's own 10 closes on nothing: it is across)", bad.every(Number.isFinite) && bad[1] === 0 && bad[2] === 0 && near(bad[5], 10 / 200));
});

console.log("3. THE COMMAND");
section(() => {
    const st = { yaw: 0.2, pitch: -0.1 }, g = (w, sight = sightAt(1, 1), o = {}) => ST.gunnerFor(w, sight, o)(PD, st, BODY, [TG], 0);
    const z = g(ST.zeroWeights()), full = g(biasNet(0, 20)), back = g(biasNet(0, -20)), up = g(biasNet(1, 20)), fire = g(biasNet(2, 0.1)), hold = g(biasNet(2, -0.1));
    ok("!! the zero weights leave the gun where it is and never fire, whatever the sight asks; a full yaw output turns it by the seat's slew in a tick (3 rad/s x 1/30) and a full negative one back by the same; a full pitch output lifts it by 2.5 x 1/30; the trigger is the third output's sign", z.yaw === 0.2 && z.pitch === -0.1 && z.fire === false && z.target === 9 && near(full.yaw, 0.2 + PD.slew.yaw * DT, 1e-6) && near(back.yaw, 0.2 - PD.slew.yaw * DT, 1e-6) && full.pitch === -0.1 && near(up.pitch, -0.1 + PD.slew.pitch * DT, 1e-6) && fire.fire === true && hold.fire === false && PD.slew.yaw === 3 && PD.slew.pitch === 2.5);
    ok("the tick the rates are turned over is `dt`, and a main turret turns at its own slower slew", near(g(biasNet(0, 20), sightAt(1, 1), { dt: 0.1 }).yaw, 0.2 + 0.3, 1e-6) && near(ST.gunnerFor(biasNet(0, 20), sightAt(1, 1))(MAIN, st, BODY, [TG], 0).yaw, 0.2 + MAIN.slew.yaw * DT, 1e-6) && MAIN.slew.yaw === 0.5);
    const edge = ST.gunnerFor(biasNet(0, 20), sightAt(1, 1))(PD, { yaw: PD.arc.yaw[1] - 0.01, pitch: 0 }, BODY, [TG], 0);
    ok("the laid gun stays in the seat's arc: a full turn from 0.01 inside the edge stops at the edge", edge.yaw === PD.arc.yaw[1]);
    const both = ST.zeroWeights(); both[ST.biasAt(3)] = 5; both[ST.biasAt(4)] = 5;
    ok("the car's drop and ignite outputs are not a ship's: a network that pulls both does nothing a seat can see", JSON.stringify(g(both)) === JSON.stringify(z));
    const none = () => ({ yaw: 0, pitch: 0, fire: false, target: null }), gone = sightAt(1, 1, true, 77);
    ok("!! with no target (or one the arena no longer shows) the gun HOLDS and does not fire, the network is not asked (`last` is null); with `idle: \"rest\"` it is sent to yaw 0, pitch 0 as the hand gunner's is; another `idle` is refused by name", JSON.stringify(g(biasNet(2, 5), none)) === '{"yaw":0.2,"pitch":-0.1,"fire":false,"target":null}' && JSON.stringify(g(biasNet(2, 5), gone)) === '{"yaw":0.2,"pitch":-0.1,"fire":false,"target":null}' && JSON.stringify(g(biasNet(2, 5), none, { idle: "rest" })) === '{"yaw":0,"pitch":0,"fire":false,"target":null}'
        && (() => { const d = ST.gunnerFor(biasNet(2, 5), none); d(PD, st, BODY, [TG], 0); return d.last === null; })() && throwsWith(() => ST.gunnerFor(ST.zeroWeights(), none, { idle: "park" }), /idle is "hold" or "rest" \(got park\)/));
    const hw = ST.handWeights(), turn = ST.gunnerFor(hw, sightAt(0.5, 0.3, true))(PD, st, BODY, [TG], 0), want = GP.forward(hw, ST.features(PD, st, BODY, { yaw: 0.5, pitch: 0.3, fire: true }, TG, 600));
    ok("the car's hand weights in a seat: they turn toward the sight's aim at tanh(12 x the bearing) of the slew and lift at tanh(8 x the pitch), and fire when the sight says the gun is on", near(turn.yaw, 0.2 + want[0] * 3 * DT, 1e-9) && near(want[0], Math.tanh(12 * 0.3 / Math.PI), 1e-5) && near(want[1], Math.tanh(8 * 0.4 / (Math.PI / 2)), 1e-5) && turn.fire === true && ST.gunnerFor(hw, sightAt(0.5, 0.3, false))(PD, st, BODY, [TG], 0).fire === false);
});

console.log("4. THE HAND'S ERROR");
section(() => {
    const run = (sigma, seed, n = 2000, w = biasNet(0, 0.05)) => { const d = ST.gunnerFor(w, sightAt(1, 1), { sigma, seed }), out = []; let st = { yaw: 0, pitch: 0 }; for (let i = 0; i < n; i++) { const c = d(PD, st, BODY, [TG], i * DT); out.push({ c, x: d.last.x }); st = { yaw: c.yaw, pitch: c.pitch }; } return out; };
    const clean = run(0, 5), shaky = run(0.03, 5), dy = shaky.map((r, i) => r.c.yaw - clean[i].c.yaw), dp = shaky.map((r, i) => r.c.pitch - clean[i].c.pitch), mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
    ok("!! with sigma 0.03 the command is the laid gun plus an error of that size on each axis (standard deviation 0.027-0.033 over 2,000 ticks, mean within 0.003 of nothing) and the error does NOT drift: the last 500 ticks' is the size of the first 500's", sd(dy) > 0.027 && sd(dy) < 0.033 && sd(dp) > 0.027 && sd(dp) < 0.033 && Math.abs(mean(dy)) < 0.003 && Math.abs(mean(dp)) < 0.003 && sd(dy.slice(-500)) < 1.2 * sd(dy.slice(0, 500)), `yaw ${sd(dy).toFixed(4)}, pitch ${sd(dp).toFixed(4)}`);
    ok("!! the error is not fed back: what the network is shown tick by tick is what it is shown with no error at all (the seat that follows the shaken command is not where the gun is laid)", shaky.every((r, i) => r.x.join() === clean[i].x.join()) && clean[1999].x[1] !== clean[0].x[1]);
    ok("with sigma 0 the command is exactly the laid gun (the seat's angle plus the rate's step)", near(clean[0].c.yaw, Math.tanh(0.05) * 3 * DT, 1e-9) && clean[0].c.pitch === 0);
    const a = run(0.03, 5, 50), b = run(0.03, 5, 50), c = run(0.03, 6, 50);
    ok("the same seed is the same shake and another seed another; the factory gives seat k the stream of `seed` + k and each seat its own sight", a.map((r) => r.c.yaw).join() === b.map((r) => r.c.yaw).join() && a[3].c.yaw !== c[3].c.yaw && (() => { const seen = [], f = ST.gunnerFactory(biasNet(0, 0.05), (seat, k) => { seen.push(k); return sightAt(1, 1); }, { sigma: 0.03, seed: 4 }), k0 = f(PD, 0)(PD, { yaw: 0, pitch: 0 }, BODY, [TG], 0), k1 = f(PD, 1)(PD, { yaw: 0, pitch: 0 }, BODY, [TG], 0), direct = ST.gunnerFor(biasNet(0, 0.05), sightAt(1, 1), { sigma: 0.03, seed: 5 })(PD, { yaw: 0, pitch: 0 }, BODY, [TG], 0); return seen.join() === "0,1" && k0.yaw !== k1.yaw && k1.yaw === direct.yaw; })());
});

console.log("5. THE TWO HALVES");
section(() => {
    const w = ST.perturb(ST.handWeights(), 0.2, ST.rngFor(3)), st = { yaw: 0.2, pitch: -0.1 }, d = ST.gunnerFor(w, sightAt(0.5, 0.3, true)), whole = d(PD, st, BODY, [TG], 0), e = ST.gunnerFor(w, sightAt(0.5, 0.3, true)), p = e.prepare(PD, st, BODY, [TG], 0), parts = e.finish(p, e.net.forward(e.net.w, p.x));
    ok("decide is finish(prepare, the network): the same command; `last` holds what the network was shown and said", JSON.stringify(whole) === JSON.stringify(parts) && d.last.x.join() === p.x.join() && d.last.y.length === 5 && e.net.w === w && e.net.forward === GP.forward);
    let h = Float32Array.from(p.x); const L = e.net.layersOf(w); for (const l of L) { const o = new Float32Array(l.nOut); for (let i = 0; i < l.nOut; i++) { let a = l.b[i]; for (let j = 0; j < l.nIn; j++) a += l.W[i * l.nIn + j] * h[j]; o[i] = l.act === "relu" ? Math.max(0, a) : a; } h = o; }
    ok("!! what a batch needs gives the same numbers: the layers of `net.layersOf` run plainly here, then `net.post`, are forward()'s five outputs to 1e-5", L.length === 5 && e.net.post(h).every((v, i) => near(v, GP.forward(w, p.x)[i], 1e-5)) && e.net.post([0, 0, 0, 0, 0]).length === 5);
});

console.log("6. THE FINDINGS, PINNED (twelve pairs a row: seeds 1-3 of each kind)");
section(() => {
    const row = (X, Y) => { let w = 0, l = 0, lead = 0; for (const kind of D.KINDS) for (const seed of [1, 2, 3]) { const p = D.pair(X, Y, seed, kind, { countBrains: false }); lead += p.lead; w += p.lead > D.DECISIVE ? 1 : 0; l += p.lead < -D.DECISIVE ? 1 : 0; } return { w, l, lead: lead / 12 }; };
    const net = { module: ST, weights: ST.handWeights() }, steady = { ...ST, gunnerFactory: (w, mk, o = {}) => ST.gunnerFactory(w, mk, { ...o, sigma: 0 }) };
    const reg = row(D.makeSide("car", { network: net }), D.makeSide("hand"));
    ok("!! the car's hand weights, carried over untrained, on THESE twelve pairs behind regular sights: 6 won, 4 lost, mean lead -0.183 -- A PIN OF THE ARITHMETIC AND NOT A FINDING: this row once said they TRAIL the hand gunner, and 600 fresh pairs (tools/ship/takeTurretAudit.mjs) say they LEAD it, +0.099 (se 0.033)", reg.w === 6 && reg.l === 4 && near(reg.lead, -0.183, 0.0005), `${reg.w} won, ${reg.l} lost, ${reg.lead.toFixed(3)}`);
    const per = row(D.makeSide("car", { network: net, gunners: "perfect" }), D.makeSide("hand", { gunners: "perfect" }));
    ok("... and plainly behind perfect sights, where a proportional turn's lag is all there is: none won, 9 lost, -0.881", per.w === 0 && per.l === 9 && near(per.lead, -0.881, 0.0005), `${per.w} won, ${per.l} lost, ${per.lead.toFixed(3)}`);
    const filt = row(D.makeSide("car-steady", { network: { module: steady, weights: ST.handWeights() } }), D.makeSide("hand"));
    ok("!! *** WITHOUT THE HAND'S ERROR THE SAME WEIGHTS LEAD BY +1.710 (10 won, none lost): THE LEAD IS THE FILTER, which is why the error is put back *** ", filt.w === 10 && filt.l === 0 && near(filt.lead, 1.710, 0.0005), `${filt.w} won, ${filt.l} lost, ${filt.lead.toFixed(3)}`);
});

console.log("7. THE FRONT DOOR");
section(() => {
    const blob = PB.exportBrain(PB.describePolicy("gunnerPolicy", GP), GP.handWeights(), { by: "a car's gunner" }), r = D.sideFromBrains("car", [blob]), d = D.duel(r.side, D.makeSide("hand"), 1, "broadside");
    ok("!! a brain exported for the CAR'S policy (described from brain/gunnerPolicy.mjs itself) is seated in all thirteen seats by battleshipDuel.sideFromBrains, through this module, and fights: the networks are asked and the seats fire", r.refused.length === 0 && r.seated[0].policy === "gunnerPolicy" && r.seated[0].where.length === 13 && D.seatNetOf(r.side, "pd-p1").module === ST && d.brains.seated.join() === "13,0" && d.brains.asked > 500 && d.rounds[0] > 20, `${d.brains.asked} forward passes, ${d.rounds[0]} rounds`);
    const x = Float32Array.from([1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]), w = ST.zeroWeights(); w[ST.encoderAt(7, 1)] = 2; w[ST.outputAt(1, 7)] = 1; w[ST.biasAt(2)] = 0.5; w[ST.hiddenBiasAt(3)] = 1; w[ST.outputAt(0, 3)] = -1;
    const k = GP.layersOf(ST.zeroWeights())[1].W.length && 5, s = ST.zeroWeights(); s[ST.synapseAt(k)] = 0.25; s[ST.synapseAt(0)] = -1;
    ok("where the weights are, against the network's own forward(): feature 1 into unit 7 into output 1 answers tanh(2 x 0.5); a hidden bias of 1 into output 0 with -1 answers tanh(-1); output 2's bias answers tanh(0.5); and synapsesUsed counts the synapses that carry a weight (0, then 2)", near(GP.forward(w, x)[1], Math.tanh(1), 1e-6) && near(GP.forward(w, x)[0], Math.tanh(-1), 1e-6) && near(GP.forward(w, x)[2], Math.tanh(0.5), 1e-6) && ST.synapsesUsed(w) === 0 && ST.synapsesUsed(s) === 2 && ST.synapsesUsed(ST.handWeights()) === 0 && ST.biasAt(4) === 895 && ST.synapseAt(0) === 11 * 34 + 34);
    ok("the report says real numbers", ST.reportLines().length === 2 && /11 features, 34 hidden neurons .* 313 synapses\), 5 outputs of which a seat reads 3: 896 weights, policy gunnerPolicy; .*\(18 non-zero weights\)/.test(ST.reportLines()[1]));
    ok("the export list", Object.keys(ST).sort().join() === "CLOSING,FEATURES,FEATURE_NAMES,HIDDEN,LIVE_FEATURES,OUTPUTS,OUTPUT_NAMES,POLICY_ID,REACH,READ_OUTPUTS,REC_EDGES,REC_STEPS,WEIGHT_COUNT,biasAt,encoderAt,features,forward,gunnerFactory,gunnerFor,handWeights,hiddenBiasAt,layersOf,outputAt,perturb,post,reportLines,rngFor,synapseAt,synapsesUsed,zeroWeights");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
