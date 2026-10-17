// WebGLEngine/brain/seatGunnerMlp-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/seatGunnerMlp-selfcheck.mjs      (~2 s)
//
// THE GPU BRAIN'S PLAIN NETWORK IN A GUN SEAT, HELD TO THE FRUIT FLY'S CONTRACT (brain/seatGunnerPolicy-selfcheck.mjs holds that one): the same twelve features and three outputs, a 12 -> 32 -> 32 -> 3 relu network.
//
//   1  THE SHAPE     1,571 weights = 12 x 32 + 32 + 32 x 32 + 32 + 32 x 3 + 3, three layers (relu, relu, none) cut from the vector where the layout says; the features are the fruit fly's function itself
//   2  THE OUTPUTS   forward() is the layers run through brain/brainTsl.mjs's mlpLayerCpu and a tanh, by hand on chosen weights (a unit that is not zero in every layer, to 1e-6); the decider adds AIM_GAIN x the output to the sight's aim and fires on a
//                    positive third output
//   3  THE HAND TWIN the hand weights are the hand gunner, to the bit, in a fight of thirteen seats against four fighters; the zero gunner never fires
//   4  THE FRONT DOOR the export list is pinned and the report line says real numbers
//
// SABOTAGE LOG -- ELEVEN SABOTAGES, each applied to brain/seatGunnerMlp.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   M1 the width is 16 4 | M2 the last layer is relu 3 | M3 the pitch output is not squashed 2 | M4 the second layer does not carry the aimed unit 3 | M5 no trigger bias 2
//   M6 the fruit fly's network is run on these weights 2 | M7 perturb is mutate 1 | M8 the closing feature is zero 1 | M9 the second layer is cut at the wrong offset 5
//   M10 the hand weights drive the pitch output, not the trigger 1 | M11 every seat gets seat 0's sight 1
"use strict";
import * as MG from "./seatGunnerMlp.mjs";
import * as SG from "./seatGunnerPolicy.mjs";
import * as SA from "./spaceArena.mjs";
import * as CS from "../physics/mechanics/capitalShip.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = (fn) => { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const SHIP = CS.createCapitalShip(), Q = [1, 0, 0, 0];
const relu = (v) => (v > 0 ? v : 0);
console.log("seatGunnerMlp-selfcheck -- the GPU Brain's plain network in a gun seat\n");

console.log("1. THE SHAPE");
section(() => {
    const w = new Float32Array(MG.WEIGHT_COUNT).map((_, i) => ((i * 37) % 17 - 8) / 40), L = MG.layersOf(w);
    ok("!! 1,571 weights = 12 x 32 + 32 + 32 x 32 + 32 + 32 x 3 + 3; three layers (12 -> 32 relu, 32 -> 32 relu, 32 -> 3 linear) cut from the vector at the offsets the layout says (the first weight of each layer is the vector's own 0th, 416th and 1472nd); the features ARE the fruit fly's function and the names are its names",
        MG.WEIGHT_COUNT === 1571 && MG.zeroWeights().length === 1571 && L.length === 3 && L[0].nIn === 12 && L[0].nOut === 32 && L[1].nIn === 32 && L[2].nOut === 3 && L[0].act === "relu" && L[1].act === "relu" && L[2].act === "none" && L[0].W[0] === w[0] && L[1].W[0] === w[416] && L[2].W[0] === w[1472] && L[2].b[2] === w[1570] && MG.features === SG.features && MG.FEATURE_NAMES === SG.FEATURE_NAMES && MG.OUTPUT_NAMES === SG.OUTPUT_NAMES && MG.LAYER_SIZES.join() === "12,32,32,3");
});

console.log("\n2. THE OUTPUTS");
section(() => {
    const rng = SG.rngFor(3), w = MG.perturb(MG.zeroWeights(), 0.3, rng), x = Array.from({ length: 12 }, (_, i) => Math.sin(i + 1));
    const L = MG.layersOf(w), h1 = Array.from({ length: 32 }, (_, j) => relu(L[0].b[j] + x.reduce((a, v, i) => a + L[0].W[j * 12 + i] * v, 0))), h2 = Array.from({ length: 32 }, (_, j) => relu(L[1].b[j] + h1.reduce((a, v, i) => a + L[1].W[j * 32 + i] * v, 0)));
    const y = [0, 1, 2].map((j) => Math.tanh(L[2].b[j] + h2.reduce((a, v, i) => a + L[2].W[j * 32 + i] * v, 0))), got = MG.forward(w, x);
    ok("!! forward() IS THE NETWORK BY HAND: on random weights the three outputs are tanh of the third layer of the relu of the second of the relu of the first, written out here -- to 1e-5 (the layers run in float32), and not all zero", got.length === 3 && got.every((v, i) => Math.abs(v - y[i]) < 1e-5) && got.some((v) => Math.abs(v) > 1e-3), `${got.map((v) => v.toFixed(5))} / ${y.map((v) => v.toFixed(5))}`);
    const pd = SHIP.seats.find((s) => s.name === "port PD 2"), st = (() => { const q = GS.createSeatState(pd); return { ...q, yaw: 0.3, pitch: -0.2 }; })(), body = { pos: [0, 0, 0], vel: [0, 0, 0], q: Q, w: [0, 0, 0] }, tg = { id: 2, pos: [0, 300, 0], vel: [0, 0, 0] };
    const b = MG.zeroWeights(); b[1568] = Math.atanh(0.5); b[1569] = Math.atanh(-0.3); b[1570] = 1;
    const r = MG.gunnerFor(b, () => ({ yaw: 0.5, pitch: 0.1, fire: false, target: 2 }))(pd, st, body, [tg], 1);
    ok("!! THE DECIDER USES ITS OUTPUTS: biases giving +0.5, -0.3 and +0.76 add 0.05 x 0.5 to the sight's yaw and 0.05 x -0.3 to its pitch and turn the trigger on though the sight's rule said no; a negative third output stops a rule that fires", Math.abs(r.yaw - 0.525) < 1e-6 && Math.abs(r.pitch - 0.085) < 1e-6 && r.fire === true && r.target === 2 && (() => { const c = MG.zeroWeights(); c[1570] = -1; return MG.gunnerFor(c, () => ({ yaw: 0, pitch: 0, fire: true, target: 2 }))(pd, st, body, [tg], 1).fire === false; })());
});

console.log("\n3. THE HAND WEIGHTS ARE THE HAND GUNNER");
section(() => {
    const regular = { delay: 0.4, sigma: 0.03, maxRange: 600, burst: 1, gravity: 0, observe: { window: 0.6, sigmaRange: 0.01 } }, makeSight = (seat, k) => GS.handGunner({ seed: 200 + k, ...regular });
    const spots = [[380, 60, 20], [-350, -80, -10], [100, 400, 0], [0, -420, 60]];
    const mk = (gunner) => SA.createSpaceArena({ crafts: [{ id: 1, team: 1, name: "ship", kind: "capital", ship: SHIP, state: { pos: [0, 0, 0], q: Q }, cruise: 0.3, gunner }, ...spots.map((p, i) => ({ id: 2 + i, team: 2, name: "f" + (i + 1), kind: "fighter", state: { pos: p, q: Q } }))], seconds: 30 });
    const a = mk(makeSight), b = mk(MG.gunnerFactory(MG.handWeights(), makeSight)), z = mk(MG.gunnerFactory(MG.zeroWeights(), makeSight));
    for (let i = 0; i < 420; i++) { SA.stepSpaceArena(a); SA.stepSpaceArena(b); SA.stepSpaceArena(z); }
    const sig = (x) => JSON.stringify([x.i, x.rounds.length, x.crafts.map((c) => [c.body.pos, c.body.q, c.hp, c.hits, c.seats.map((s) => [s.state.yaw, s.state.pitch, s.state.gun.fired, s.state.gun.ammo])])]), fired = (x) => x.crafts[0].seats.reduce((n, s) => n + s.state.gun.fired, 0);
    ok("!! THE HAND WEIGHTS ARE THE HAND GUNNER, TO THE BIT: the same 14 s against four fighters with the sight alone and with the sight and this network on the hand weights end in the same state (positions, attitudes, hit points, every seat's aim and rounds, the rounds in flight), and it was a fight; the zero gunner fires not one round and hurts nothing", sig(a) === sig(b) && fired(a) > 100 && a.crafts.slice(1).some((c) => c.hp < 100) && fired(z) === 0 && z.crafts.slice(1).every((c) => c.hp === 100), `${fired(a)} rounds`);
    ok("and the hand weights are four non-zero entries (the aimed channel through two hidden layers into the trigger, and its bias)", Array.from(MG.handWeights()).filter((v) => v !== 0).length === 4);
});

console.log("\n4. THE FRONT DOOR");
section(() => {
    ok("!! the export list is pinned: FEATURES, FEATURE_NAMES, HIDDEN, LAYER_SIZES, OUTPUTS, OUTPUT_NAMES, WEIGHT_COUNT, WIDTH, features, forward, gunnerFactory, gunnerFor, handWeights, layersOf, mutate, perturb, reportLines, rngFor, zeroWeights", Object.keys(MG).sort().join() === "FEATURES,FEATURE_NAMES,HIDDEN,LAYER_SIZES,OUTPUTS,OUTPUT_NAMES,WEIGHT_COUNT,WIDTH,features,forward,gunnerFactory,gunnerFor,handWeights,layersOf,mutate,perturb,reportLines,rngFor,zeroWeights", Object.keys(MG).sort().join());
    const lines = MG.reportLines();
    ok("the report lines say real numbers", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /1571 weights/.test(lines[1]) && /in 4 non-zero weights/.test(lines[1]), lines[1]);
});

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
