// WebGLEngine/brain/gunnerPolicy-selfcheck.mjs -- v4588, grown v4590 (the slick: drop and ignite outputs, the two slick facts)
//
// Run: node brain/gunnerPolicy-selfcheck.mjs
//
// THE SIBLING GATE OF brain/gunnerPolicy.mjs: the shape (an 11 -> 8 -> 5 relu MLP through the kernel's f32 twin, held to a plain
// MLP written here), the features against physics/turret.mjs's aim errors and physics/slick.mjs's two facts (a pursuer close
// behind, a car on my oil), the hand gunner's rule read off its outputs (fire only aligned, drop only pursued, ignite only with a
// car on the oil), THE DUEL (the hand gunner hits, drops and burns the pursuer; the zero gunner never fires or drops; both
// deterministic; without slicks nothing drops), the shell-speed knob (the slowest candidate refused by the CHASE leg, the greedy
// pick the first refusal; a passing speed passes both legs), LEARNING (the ES from zero climbs and is deterministic per seed), and
// THE RACE WITH GUNNERS (deterministic per seed, replayed from its log -- eight fields per car per tick -- to the same fingerprint
// with the same hits, drops and burn ticks). box3d's wasm is loaded
// headless through physics/box3d/box3dNode.mjs, as tools/ship/drivePolicy-selfcheck.mjs loads it; without it this gate FAILS
// rather than skips, because the wasm is the substrate.
//
// SABOTAGE LOG -- v4588, each applied to brain/gunnerPolicy.mjs, the gate run (box3d loaded), the module restored.
//   A  the hand gunner's trigger never gated by alignment (the aligned weight zeroed)   -> 4 red: the hand rule, the duel's
//      hits, 28 m/s (0 hits of 0 shots), the race's hand gunners.
//   B  the bearing feature's sign flipped (the gun turns away)                          -> 3 red: the duel, 28 m/s (1 of 1), the race.
//   C  the replay reading only the log's fire, not its yaw and pitch                    -> 1 red: the replay's fingerprint.
//   D  the adjudicator's bound ignored (every candidate passes)                          -> 1 red: 8 m/s refused.
//   E  the hit's impulse never applied                                                  -> 1 red: the still car nudged 0.743 m/s.
//   FINDING, in the first draft of this gate: the impulse row stepped the bare box3d world, which has NO GROUND BODY -- the
//   cars stand on their raycast suspension only inside stepCars -- so both cars fell during the shell's 0.43 s of flight and
//   the shell flew over a target that had dropped 0.9 m: 0 events, and the row read 0.000 m/s. It settles the cars through
//   stepCars on a flat surface now, and reads the velocity after the step box3d applies the impulse on (0.001 -> 0.743 m/s).
// SABOTAGE LOG -- v4590 (the grown policy), each applied to brain/gunnerPolicy.mjs, the gate run, the module restored.
//   F  the hand gunner's drop never gated by a pursuer (dropOn zeroed)                   -> 3 red: the slick half of the rule, the duel's
//      drops and burn, the race's drops (0 0 0) and burn (0 0 0).
//   G  turretTick never ignites                                                         -> 3 red: the duel's burn, the race's burn
//      (drops 7 0 0, burned 0 0 0), and -- a side effect -- the two ES seeds trained to the same weights (nothing to accept without the burn).
//   H  the replay reading the log's yaw, pitch and fire but not its drop and ignite      -> 1 red: the replay's fingerprint and tallies.
//   I  pursuerInfo forgetting BEHIND (any car in range is a pursuer)                      -> 2 red: the pursuerInfo row, the chase leg (5 drops).
//   J  the adjudicator running the pursued leg twice and never the chase                 -> 2 red: 8 m/s refused, 28 m/s on both legs.
//   K  the features dropping the slick tail (always 0, 0)                                -> 3 red: the tail row, the duel's drops, the race's drops.
"use strict";
import { initNode, mod } from "../physics/box3d/box3dNode.mjs";
import { worldFromModule } from "../render/slugTicker.mjs";
import * as G from "./gunnerPolicy.mjs";
import * as D from "./drivePolicy.mjs";
import * as U from "../physics/turret.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const quiet = () => { const log = console.log; console.log = (...a) => { if (!/\[GLBParser\]|\[box3d\]|\[CityGen\]/.test(String(a[0]))) log(...a); }; };
quiet();
console.log("gunnerPolicy-selfcheck -- the gunner beside the driver: the shape, the duel, the knob, the learning, the race with turrets\n");
const st = await initNode();
if (!st.ready) { console.log("  FAIL  box3d wasm: " + st.reason + " -- the wasm is the substrate"); console.log("\ngunnerPolicy-selfcheck: 1 FAILED"); process.exit(1); }
const m = mod(), worldFrom = () => worldFromModule(m, [0, -9.81, 0]);
const timed = (f) => { const t0 = performance.now(); const r = f(); return { r, ms: performance.now() - t0 }; };

console.log("1. THE SHAPE: 11 -> 8 -> 5 THROUGH THE KERNEL'S TWIN, THE ZERO AND THE HAND");
{
    ok("141 weights: 11 x 8 + 8 + 8 x 5 + 5", G.WEIGHT_COUNT === 141 && G.zeroWeights().length === 141 && G.FEATURE_NAMES.length === G.FEATURES && G.FEATURES === 11 && G.OUTPUTS === 5 && G.OUTPUT_NAMES.join() === "yaw,pitch,fire,drop,ignite" && G.FEATURE_NAMES.slice(9).join() === "pursuerNear,onMyOil");
    const [l1, l2] = G.layersOf(G.zeroWeights());
    ok("layersOf splits them into 11 -> 8 relu and 8 -> 5 none", l1.nIn === 11 && l1.nOut === 8 && l1.act === "relu" && l1.W.length === 88 && l2.nIn === 8 && l2.nOut === 5 && l2.act === "none" && l2.W.length === 40);
    const w = G.perturb(G.zeroWeights(), 0.7, () => 0.37), x = [1, 0.3, -0.2, 0.5, -0.4, 0.2, 0, 1, 0, 1, 0];
    const plain = (() => { const f = Math.fround, [a, b] = G.layersOf(w), h = []; for (let o = 0; o < 8; o++) { let acc = f(a.b[o]); for (let k = 0; k < 11; k++) acc = f(acc + f(f(x[k]) * f(a.W[o * 11 + k]))); h.push(f(Math.max(0, acc))); } const y = []; for (let o = 0; o < 5; o++) { let acc = f(b.b[o]); for (let k = 0; k < 8; k++) acc = f(acc + f(h[k] * f(b.W[o * 8 + k]))); y.push(Math.tanh(acc)); } return y; })();
    const got = G.forward(w, x);
    ok("!! forward equals a plain float32 relu MLP written here, then tanh, on all five outputs", got.length === 5 && got.every((v, i) => near(v, plain[i], 1e-6)), `${got.map((v) => v.toFixed(5))} vs ${plain.map((v) => v.toFixed(5))}`);
    const zc = G.gunnerFor(G.zeroWeights())({ pos: [0, 1, 0], quat: [0, 0, 0, 1], yaw: 0, vel: [0, 0, 0] }, U.createTurret(), null);
    ok("the zero gunner answers five zeros and its fire, drop and ignite (tanh 0, not positive) are 0", G.forward(G.zeroWeights(), x).every((v) => v === 0) && zc.fire === 0 && zc.drop === 0 && zc.ignite === 0 && Object.keys(zc).join() === "yaw,pitch,fire,drop,ignite");
    const hand = G.handWeights(), b = 0.02;
    const h0 = G.forward(hand, [1, b, 0, 0.5, 0, 0, 0, 1, 0, 0, 0]), h1 = G.forward(hand, [1, 0, -0.05, 0.5, 0, 0, 0, 1, 1, 0, 0]);
    ok("!! the hand gunner's rule reads off its outputs: yaw = tanh(12 x bearing), pitch = tanh(8 x pitch error), fire only when aligned", near(h0[0], Math.tanh(12 * b)) && near(h0[1], 0) && h0[2] < 0 && near(h1[1], Math.tanh(8 * -0.05)) && near(h1[2], Math.tanh(2)) && h1[2] > 0, `${h0.map((v) => v.toFixed(4))} / ${h1.map((v) => v.toFixed(4))}`);
    const h2 = G.forward(hand, [1, 0, 0, 0.5, 0, 0, 0, 1, 0, 1, 0]), h3 = G.forward(hand, [1, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 1]);
    ok("!! ...and the slick half of it: drop = tanh(4 x pursuerNear - 2), ignite = tanh(4 x onMyOil - 2) -- each positive only on its own fact, negative otherwise", h0[3] < 0 && h0[4] < 0 && near(h2[3], Math.tanh(2)) && h2[4] < 0 && near(h3[4], Math.tanh(2)) && h3[3] < 0 && near(h2[3], -h0[3]) , `${h2.slice(3).map((v) => v.toFixed(4))} / ${h3.slice(3).map((v) => v.toFixed(4))}`);
}
console.log("\n2. THE FEATURES ARE THE TURRET'S AIM ERRORS AND THE SLICK'S TWO FACTS");
{
    const pose = { pos: [0, 1, 0], quat: [0, 0, 0, 1], yaw: 0, vel: [0, 0, 0] }, t = U.createTurret(), target = { pose: { pos: [0, 1, 20], quat: [0, 0, 0, 1], yaw: 0, vel: [0, 0, 0] } };
    const f = G.features(pose, t, target);
    ok("!! a still target straight ahead at 20 m: no bearing error, a positive pitch error, range 0.5, reachable, not yet aligned; eleven values, the slick tail 0, 0 without an extra", f.length === 11 && near(f[1], 0, 1e-9) && f[2] > 0 && near(f[3], 0.5) && near(f[4], 0) && near(f[5], 0) && f[6] === 0 && f[7] === 1 && f[8] === 0 && f[9] === 0 && f[10] === 0, f.map((v) => v.toFixed(3)).join(" "));
    const fe = G.features(pose, t, target, { pursuerNear: true, onMyOil: true }), fn = G.features(pose, t, null, { pursuerNear: true, onMyOil: false });
    ok("the extra fills the tail, with and without a target", fe[9] === 1 && fe[10] === 1 && fe.slice(0, 9).every((v, i) => v === f[i]) && fn.length === 11 && fn[9] === 1 && fn[10] === 0);
    const sol = U.aimSolution(pose, t, target.pose.pos, target.pose.vel); t.pitch = sol.pitch; t.yaw = sol.yaw;
    ok("...at the solution the gun is aligned, the errors zero", G.features(pose, t, target)[8] === 1 && near(G.features(pose, t, target)[2], 0, 1e-9));
    t.reload = 10;
    ok("the reload bit follows the turret; no target reads unreachable and unaligned", G.features(pose, t, target)[6] === 1 && G.features(pose, t, null)[7] === 0 && G.features(pose, t, null)[8] === 0);
    const fleeing = { pose: { ...target.pose, vel: [0, 0, 40] } }, ff = G.features(pose, U.createTurret(), fleeing);
    ok("a target the shell cannot catch reads unreachable, with its closing speed negative", ff[7] === 0 && ff[8] === 0 && ff[4] < 0);
    // pursuerInfo: a car close BEHIND me is a pursuer; the same car ahead is not; a car on my unlit oil is the ignite fact
    const S = await import("../physics/slick.mjs"), me = { pos: [0, 1, 0], yaw: 0, quat: [0, 0, 0, 1], vel: [0, 0, 0] }, behind = { ...me, pos: [1, 1, -8] }, ahead = { ...me, pos: [1, 1, 8] }, far = { ...me, pos: [0, 1, -(G.DROP_RANGE + 1)] };
    const sl = S.createSlicks(); const patch = S.dropSlick(sl, me, 0, 0); const onOil = { ...me, pos: [patch.x, 1, patch.z] };
    const pb = G.pursuerInfo(0, [me, behind], sl), pa = G.pursuerInfo(0, [me, ahead], sl), pf = G.pursuerInfo(0, [me, far], sl), po = G.pursuerInfo(0, [me, onOil], sl), pn = G.pursuerInfo(0, [me, onOil], null);
    ok("!! pursuerInfo: a car 8 m behind is a pursuer, the same car 8 m ahead or one past DROP_RANGE behind is not; a car standing on my unlit patch is onMyOil, and without a slick state neither fact is ever true", pb.pursuerNear && !pb.onMyOil && !pa.pursuerNear && !pf.pursuerNear && po.onMyOil && po.pursuerNear && !pn.onMyOil, JSON.stringify([pb, pa, pf, po]));
    S.igniteSlick(sl, 0, 0);
    ok("...a lit patch is no longer oil to stand on", !G.pursuerInfo(0, [me, onOil], sl).onMyOil);
}
console.log("\n3. THE DUEL: THE HAND GUNNER HITS, DROPS AND BURNS ITS PURSUER; THE ZERO GUNNER NEVER FIRES OR DROPS; BOTH DETERMINISTIC");
let handRuns;
{
    handRuns = [1, 2].map((seed) => timed(() => G.duel(worldFrom, G.handWeights(), { seed, seconds: 20 })));
    const zero = [1, 2].map((seed) => G.duel(worldFrom, G.zeroWeights(), { seed, seconds: 20 }));
    report(handRuns.map((r, i) => `seed ${i + 1}: hand ${r.r.hits} hits of ${r.r.shots} shots, ${r.r.drops} drops, ${r.r.burned} burn ticks on the pursuer, score ${r.r.score.toFixed(2)}, ${r.ms.toFixed(0)} ms; zero ${zero[i].hits} of ${zero[i].shots}, ${zero[i].drops} drops`).join("  |  "));
    ok("!! pursued, the hand gunner lands at least ten hits in 20 s on both tracks, most of its shots", handRuns.every((r) => r.r.geometry === "pursued" && r.r.hits >= 10 && r.r.hits / r.r.shots >= 0.7));
    ok("!! ...and drops oil at least three times and burns the pursuer on it (burn ticks > 0), which the score pays for", handRuns.every((r) => r.r.drops >= 3 && r.r.burned > 0 && r.r.score > r.r.hits - G.REWARD.waste * r.r.shots));
    ok("!! the zero gunner fires nothing, hits nothing, drops nothing", zero.every((z) => z.shots === 0 && z.hits === 0 && z.drops === 0 && z.burned === 0 && z.score === 0));
    const dry = G.duel(worldFrom, G.handWeights(), { seed: 1, seconds: 20, slicks: false }), chase = G.duel(worldFrom, G.handWeights(), { seed: 1, seconds: 20, geometry: "chase" });
    ok("without a slick state the same gunner drops nothing and burns nothing (the outputs have no oil to reach)", dry.drops === 0 && dry.burned === 0 && dry.hits > 0);
    ok("!! chasing, the hand gunner still lands ten hits and, with nobody behind it, drops nothing", chase.geometry === "chase" && chase.hits >= 10 && chase.drops === 0, `chase ${chase.hits} of ${chase.shots}, ${chase.drops} drops`);
    const again = G.duel(worldFrom, G.handWeights(), { seed: 1, seconds: 20 });
    ok("the duel is deterministic: the same fingerprint twice (hits, drops and burn ticks equal), and a different gunner is a different fingerprint", again.fingerprint === handRuns[0].r.fingerprint && again.hits === handRuns[0].r.hits && again.drops === handRuns[0].r.drops && again.burned === handRuns[0].r.burned && zero[0].fingerprint !== handRuns[0].r.fingerprint && dry.fingerprint !== handRuns[0].r.fingerprint, again.fingerprint);
}
console.log("\n4. THE KNOB: THE SLOWEST SHELL IS THE SEARCH'S FAVOURITE AND THE KEY'S FIRST REFUSAL -- BY THE CHASE LEG");
{
    ok("unready, the adjudicator refuses BY NAME rather than guessing", !G.isReady() && G.adjudicateShell(28).pass === false && /not initialised/.test(G.adjudicateShell(28).evidence.reason));
    G.setModule(m);
    const cands = G.proposeShell(), greedy = cands.slice().sort((a, b) => G.scoreShell(b) - G.scoreShell(a))[0];
    ok("seven candidates, scored 1 / speed: the greedy pick is the slowest", cands.length === 7 && greedy === 8 && G.scoreShell(-1) === -Infinity);
    const slow = timed(() => G.adjudicateShell(8)), good = timed(() => G.adjudicateShell(28));
    ok("!! 8 m/s is REFUSED by the chase leg: the target outruns the shell, no solution, no shot, no hit (pursued, the closing target is hittable even at 8 m/s: that leg alone would let it through)", !slow.r.pass && slow.r.evidence.chase.shots === 0 && slow.r.evidence.hits === 0 && /chase: 0 hits of 0 shots/.test(slow.r.evidence.reason) && /under the bound/.test(slow.r.evidence.reason), `${slow.r.evidence.reason} (${slow.ms.toFixed(0)} ms)`);
    ok("!! 28 m/s PASSES the bound on BOTH legs on the held-out track", good.r.pass && good.r.evidence.chase.hits >= G.HIT_BOUND && good.r.evidence.pursued.hits >= G.HIT_BOUND && good.r.evidence.seed === G.KEY_SEED && good.r.evidence.fingerprints.length === 2 && /chase: .*; pursued: /.test(good.r.evidence.reason), `${good.r.evidence.reason} (${good.ms.toFixed(0)} ms)`);
    ok("a non-positive speed is refused with a reason", !G.adjudicateShell(0).pass && /positive/.test(G.adjudicateShell(0).evidence.reason));
}
console.log("\n5. LEARNING: THE ES FROM ZERO CLIMBS, AND IS DETERMINISTIC PER SEED");
{
    const { r, ms } = timed(() => G.train(worldFrom, { seed: 7, iters: 10, seconds: 10 }));
    report(`10 candidates x 2 seeds x 10 s from zero: score ${r.trainScore.toFixed(2)}, ${r.accepted} accepted, ${ms.toFixed(0)} ms`);
    ok("!! from zero the ES finds a gunner that scores where zero scores nothing", r.trainScore > 0 && r.accepted >= 1);
    const a = G.train(worldFrom, { seed: 11, iters: 3, seconds: 6 }), b = G.train(worldFrom, { seed: 11, iters: 3, seconds: 6 }), c = G.train(worldFrom, { seed: 12, iters: 3, seconds: 6 });
    ok("the same seed trains the same weights; a different seed does not", D.weightsHash(a.weights) === D.weightsHash(b.weights) && a.trainScore === b.trainScore && D.weightsHash(a.weights) !== D.weightsHash(c.weights));
    const store = G.gunnerStore(); const o1 = store.offer({ weights: r.weights, score: 1 }), o2 = store.offer({ weights: r.weights, score: 0.5 }), o3 = store.offer({ weights: new Float32Array(3), score: 9 });
    ok("the store ratchets on the score and refuses malformed weights at the door", o1.accepted && !o2.accepted && !o3.ok && store.current().score === 1);
}
console.log("\n6. THE RACE WITH GUNNERS: LOCKSTEP, DETERMINISTIC, REPLAYED FROM ITS LOG");
{
    const fleet = D.machineFingerprint(m), drivers = [D.handWeights(), D.handWeights({ speed: 0.8 }), D.zeroWeights()], gunners = [G.handWeights(), G.zeroWeights(), G.handWeights()];
    const { r: R, ms } = timed(() => G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 20, fleet }));
    report(`three cars, 20 s in ${ms.toFixed(0)} ms: order ${R.order.join(" > ")}, hits ${R.results.map((q) => q.hits + "/" + q.shots).join(" ")}, drops ${R.results.map((q) => q.drops).join(" ")}, burned ${R.results.map((q) => q.burned).join(" ")}, fingerprint ${R.fingerprint}`);
    ok("!! the hand gunners hit, the zero gunner never fires, and the log carries both contracts -- eight fields -- per car per tick", R.results[0].hits > 0 && R.results[2].hits > 0 && R.results[1].shots === 0 && R.log.length === R.ticks && R.log[0].length === 3 && Object.keys(R.log[0][0]).join() === "throttle,steer,brake,yaw,pitch,fire,drop,ignite");
    ok("!! the leader's hand gunner drops oil on the car behind and that car takes burn ticks; the zero gunner drops none", R.results[0].drops > 0 && R.results[1].burned > 0 && R.results[1].drops === 0, `drops ${R.results.map((q) => q.drops).join(" ")}, burned ${R.results.map((q) => q.burned).join(" ")}`);
    const R2 = G.raceWithGunners(worldFrom, drivers, gunners, { seed: 1, seconds: 20, fleet });
    ok("!! the race is deterministic per seed: the same fingerprint, order and tallies twice", R2.fingerprint === R.fingerprint && R2.order.join() === R.order.join() && R2.results.every((q, i) => q.hits === R.results[i].hits && q.drops === R.results[i].drops && q.burned === R.results[i].burned));
    const rp = G.replayGunners(worldFrom, R);
    ok("!! the replay from the log alone -- no policies -- reaches the same fingerprint with the same hits, drops and burn ticks", rp.fingerprint === R.fingerprint && rp.results.every((q, i) => q.hits === R.results[i].hits && q.laps === R.results[i].laps && q.drops === R.results[i].drops && q.burned === R.results[i].burned));
    // a hit is an IMPULSE on the target's chassis, applied before the world steps: a still target nudged by one shell
    {
        const world = worldFrom(), C = await import("../physics/raceCar.mjs"), T = await import("../world/raceTrack.mjs");
        // box3d has no ground body: the cars stand on their raycast suspension, so they are stepped through stepCars (zero
        // inputs, a flat surface) or they fall away from the aim -- the first draft stepped the bare world and the shell
        // flew over a target that had dropped 0.9 m in the 0.43 s of flight
        const surface = C.flatSurface(), gunCar = C.createCar(world, { x: 0, z: 0, yaw: 0 }), tgCar = C.createCar(world, { x: 0, z: 12, yaw: 0 }), cars = [gunCar, tgCar];
        const spec = U.TURRET, turrets = [U.createTurret(spec), U.createTurret(spec)], shells = [], rest = [{ throttle: 0, steer: 0, brake: 0 }, { throttle: 0, steer: 0, brake: 0 }];
        for (let t = 0; t < 30; t++) C.stepCars(world, cars, surface, rest, C.CAR.dt);   // settle on the suspension
        const poses = cars.map((c) => C.carPose(world, c)), sol = U.aimSolution(poses[0], turrets[0], poses[1].pos, [0, 0, 0]);
        turrets[0].yaw = sol.yaw - poses[0].yaw; turrets[0].pitch = sol.pitch;
        let events = [], v = 0, before = 0;
        for (let t = 0; t < 60 && !events.length; t++) {
            const ps = cars.map((c) => C.carPose(world, c));
            const tt = G.turretTick(world, cars, turrets, shells, ps, [{ yaw: 0, pitch: 0, fire: t === 0 ? 1 : 0 }, { yaw: 0, pitch: 0, fire: 0 }], t, spec);
            events = tt.events; if (events.length) before = Math.hypot(ps[1].vel[0], 0, ps[1].vel[2]);
            // box3d applies an impulse at the step (carForces relies on the same), so the velocity is read after it
            C.stepCars(world, cars, surface, rest, C.CAR.dt);
            if (events.length) { const vel = world.readVelocities(); v = Math.hypot(vel[tgCar.body * 3], 0, vel[tgCar.body * 3 + 2]); }
        }
        world.destroy();
        ok("!! a hit is an impulse: one shell into a still car sets it moving at about hitImpulse / mass after the step it lands on", events.length === 1 && events[0].target === 1 && before < 0.01 && Math.abs(v - spec.hitImpulse / C.CAR.mass) < 0.15, `${events.length} event(s); ${before.toFixed(3)} -> ${v.toFixed(3)} m/s against ${(spec.hitImpulse / C.CAR.mass).toFixed(3)}`);
    }
    const ordered = R.order.map((i) => R.results[i]);
    ok("the order is laps first, then metres", ordered.every((q, k) => k === 0 || ordered[k - 1].laps > q.laps || (ordered[k - 1].laps === q.laps && ordered[k - 1].metres + 1 >= q.metres)));
}
console.log("\n7. THE FRONT DOOR");
{
    const L = G.reportLines();
    ok("reportLines names the shape, the reward (the burn), the knob and the wasm state", L.length === 4 && /11 -> 8 -> 5/.test(L[0]) && /141 weights/.test(L[1]) && /drop, ignite/.test(L[1]) && /on my fire/.test(L[2]) && /1 \/ speed/.test(L[2]) && /ready/.test(L[3]));
}
console.log(fails ? `\ngunnerPolicy-selfcheck: ${fails} FAILED` : "\ngunnerPolicy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
