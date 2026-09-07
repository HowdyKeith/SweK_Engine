// WebGLEngine/brain/drivePolicy.mjs -- Racing city 3 (task 66): the brain that learns to drive, and the race between brains
//
// A DRIVING POLICY IN THE GPU BRAIN'S OWN SHAPE, TRAINED BY THE TREE'S OWN (1+1)-ES, JUDGED THE WAY brain/blobAutoTrain.mjs JUDGES.
//
// The policy is two MLP layers -- FEATURES (9) -> HIDDEN (8, relu) -> 2 (none), then tanh -- run through render/brainTsl.mjs's
// mlpLayerCpu, which is the f32 twin of brain/mlp.js's WGSL layer in the kernel's own summation order. So the numbers a car gets
// here are the numbers the GPU Brain's kernel would give for the same weights (tools/ship/brainKernels-selfcheck.mjs holds that
// twin bit for bit), and a race page that runs N brains through BatchedMLP on the device is a change of runtime, not of policy.
// The two outputs are the controller contract physics/raceCar.mjs takes: steer in [-1, 1], and a signed drive whose negative half
// is the brake.
//
// The features are what a driver can see from the pose and the track: the speed, where the car is across the road, how it is
// pointed against the road, where the road goes next (the heading change 6, 12 and 20 m ahead), and whether it is off the asphalt.
// Nothing about other cars: round 3's brains race on one track and collide as box3d bodies, and they do not yet know it.
//
// ---- THE TRAINER IS blobTrainer's (1+1)-ES, THE JUDGEMENT IS blobAutoTrain's -----------------------------------------------------------
//
// Perturb every weight by seeded gaussian noise, keep the candidate if it scores better on the TRAIN seeds, widen the noise when
// winning and narrow it when not. The score is lap progress in metres over an episode, plus a bonus per lap completed, minus a
// penalty per wheel sample off the asphalt: a policy that stands still scores 0, one that drives onto the grass loses ground, one
// that laps is rewarded for every metre and again for finishing. A held-out seed judges what the STORE accepts (a ratchet: it refuses
// a worse held-out score), and an AUDIT seed that never votes is evaluated beside it, so the store can say when it is holding a policy
// worse than one it already threw away -- REGRET, blobAutoTrain's instrument, measured rather than a threshold invented.
//
// ---- THE RACE -----------------------------------------------------------------------------------------------------------------------------
//
// N policies drive N cars in ONE box3d world on one track, staggered on the finish straight, stepped in LOCKSTEP: every car's input
// is computed from the poses before the step, applied in car order, then one world step (physics/raceCar.mjs's stepCars), and
// box3d's state hash is folded every tick into the race fingerprint. The order is by laps, then progress; a tie (same laps, progress
// within a metre) is broken by the FLEET'S FINGERPRINT -- the machine's own box3d identity from the canonical eight-box scene, folded
// with each policy's hash -- so two equal cars finish in an order every peer running the same wasm derives the same way. The race
// records every car's inputs per tick; a REPLAY feeds them back through the same world and must reach the same fingerprint, which is
// what round 4's adjudicator and round 5's pre-render will read.
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as T from "../world/raceTrack.mjs";
import * as C from "../physics/raceCar.mjs";

/** blobTrainer.mjs's mulberry32, restated here because that module imports node:url and this one runs in the browser. */
export function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const FEATURES = 9, HIDDEN = 8, OUTPUTS = 2;
export const FEATURE_NAMES = Object.freeze(["bias", "speed", "across", "heading", "toLookahead", "turn6", "turn12", "turn20", "offRoad"]);
export const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + HIDDEN * OUTPUTS + OUTPUTS;   // 72 + 8 + 16 + 2 = 98

/** The all-zero policy: stands still (drive 0, steer 0). What every trained policy is measured against. */
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);

/** Split a flat weight vector into the two layers mlpLayerCpu takes. */
export function layersOf(w) {
    let o = 0; const W1 = w.subarray(o, o += FEATURES * HIDDEN), b1 = w.subarray(o, o += HIDDEN), W2 = w.subarray(o, o += HIDDEN * OUTPUTS), b2 = w.subarray(o, o += OUTPUTS);
    return [{ nIn: FEATURES, nOut: HIDDEN, W: W1, b: b1, act: "relu" }, { nIn: HIDDEN, nOut: OUTPUTS, W: W2, b: b2, act: "none" }];
}

/** The forward pass: features -> [steer, drive] in [-1, 1], through the GPU kernel's f32 twin. */
export function forward(w, x) {
    const [l1, l2] = layersOf(w), h = mlpLayerCpu(l1, Float32Array.from(x), 1), y = mlpLayerCpu(l2, h, 1);
    return [Math.tanh(y[0]), Math.tanh(y[1])];
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** A point `dist` metres ahead along the surface's centreline from lap parameter s, and the heading there. */
export function pathAhead(surface, s, dist) {
    const pts = surface.centreline, n = pts.length; let i = Math.floor(s), t = s - i, left = dist;
    for (let guard = 0; guard < n + 2; guard++) {
        const a = pts[i % n], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), rem = L * (1 - t);
        if (rem >= left) { const tt = t + left / L; return { p: [a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt], heading: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
        left -= rem; i++; t = 0;
    }
    const a = pts[i % n], b = pts[(i + 1) % n];
    return { p: a, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
}

/** The features a driver sees: nine numbers, each of order one. */
export function features(surface, pose, lastKind = "asphalt") {
    const { s, d } = surface.along(pose.pos[0], pose.pos[2]), here = pathAhead(surface, s, 0.5), look = pathAhead(surface, s, 8);
    // which side of the road: the sign of the cross product of the path tangent and the offset to the car
    const tx = Math.sin(here.heading), tz = Math.cos(here.heading), ox = pose.pos[0] - here.p[0], oz = pose.pos[2] - here.p[1], side = Math.sign(tx * oz - tz * ox) || 1;
    const toLook = wrap(Math.atan2(look.p[0] - pose.pos[0], look.p[1] - pose.pos[2]) - pose.yaw);
    const turn = (dist) => wrap(pathAhead(surface, s, dist).heading - here.heading) / (Math.PI / 2);
    return [1, pose.speed / 20, side * d / T.HALF_WIDTH, wrap(here.heading - pose.yaw) / (Math.PI / 2), toLook / (Math.PI / 2), turn(6), turn(12), turn(20), lastKind === "asphalt" ? 0 : 1];
}

/** A driver (pose -> input) from weights; `car` gives it the last wheel sample for the off-road feature. */
export function policyDriver(w, surface, car = null) {
    return (pose) => {
        const kind = car && car.last ? (car.last.wheels.every((q) => q.kind === "asphalt") ? "asphalt" : "off") : "asphalt";
        const [steer, drive] = forward(w, features(surface, pose, kind));
        return { throttle: Math.max(0, drive), steer, brake: Math.max(0, -drive) };
    };
}

/** Lap progress in metres from a lap-parameter delta (the centreline's segments are not equal). */
function metresBetween(surface, s0, s1) {
    const pts = surface.centreline, n = pts.length; let i = Math.floor(s0), t = s0 - i, left = ((s1 - s0) % n + n) % n, m = 0;
    if (left > n / 2) return -metresBetween(surface, s1, s0);   // went backwards
    for (let guard = 0; guard < n + 2 && left > 1e-9; guard++) { const a = pts[i % n], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), take = Math.min(1 - t, left); m += L * take; left -= take; i++; t = 0; }
    return m;
}

/** The reward for one episode: metres of progress + LAP_BONUS per lap - OFF_PENALTY per off-asphalt wheel sample. */
export const REWARD = Object.freeze({ lapBonus: 200, offPenalty: 0.2 });   // 0.05 let a policy earn 218 m across the grass at a profit; 0.2 makes the grass a loss

/**
 * One episode: a car from the finish line, the policy driving, `seconds` of it. Returns { score, metres, laps, off, lapTime, fingerprint,
 * pose }. A world is made and destroyed here; `mod` is the box3d module (node's box3dNode or the browser's box3d._mod).
 */
export function episode(worldFrom, w, surface, { seconds = 40, seed = surface.track.seed, offset = 5 } = {}) {
    const world = worldFrom(), cp = T.checkpoints(surface.track)[0], car = C.createCar(world, { x: cp.x + offset, z: cp.z, yaw: Math.PI / 2 });
    const tracker = C.lapTracker(surface), driver = policyDriver(w, surface, car);
    const steps = Math.round(seconds / C.CAR.dt); let s0 = surface.along(cp.x + offset, cp.z).s, metres = 0, off = 0, h = 0x811c9dc5, lapTime = null, pose = null;
    for (let i = 0; i < steps; i++) {
        const pre = C.carPose(world, car), r = C.stepCar(world, car, surface, driver(pre), C.CAR.dt); pose = r.pose;
        for (const q of r.wheels) if (q.kind !== "asphalt") off++;
        const s1 = surface.along(pose.pos[0], pose.pos[2]).s; metres += metresBetween(surface, s0, s1); s0 = s1;
        h = C.foldHash(h, world.stateHash());
        const t = tracker.update(pose); if (t.laps >= 1 && lapTime === null) lapTime = (i + 1) * C.CAR.dt;
        if (pose.pos[1] < -5) break;   // fell off the grid: the episode is over
    }
    const laps = tracker.laps; world.destroy();
    return { score: metres + REWARD.lapBonus * laps - REWARD.offPenalty * off, metres, laps, off, lapTime, fingerprint: (h >>> 0).toString(16).padStart(8, "0"), pose, seed };
}

/** The mean score of a policy over a set of track seeds (each seed its own track and surface). */
export function evaluate(worldFrom, w, seeds, opts = {}) {
    let sum = 0; const runs = [];
    for (const seed of seeds) { const r = episode(worldFrom, w, surfaceFor(seed), { ...opts, seed }); sum += r.score; runs.push(r); }
    return { score: sum / seeds.length, runs };
}

const surfaces = new Map();
/** The track surface for a seed, cached: the same seed is the same track everywhere. */
export function surfaceFor(seed) { if (!surfaces.has(seed)) surfaces.set(seed, C.trackSurface(T.generateTrack({ seed }))); return surfaces.get(seed); }

export const TRAIN_SEEDS = Object.freeze([1, 4]), HELD_OUT_SEEDS = Object.freeze([2]), AUDIT_SEEDS = Object.freeze([3]);   // one train seed memorised its first straight (2 m held-out); two generalise

/**
 * The HAND policy, in the network's own weights: a relu pair per signed input (x+ and x-), so a linear rule is exact. Steer toward the
 * lookahead point and along the road's heading; drive by a constant less the turn ahead less the speed, so the car creeps through a
 * corner rather than stalling in it (the first numbers, 0.6 - 0.5 |turn| - 0.9 speed, stalled at every corner: 13 m in 60 s on three of
 * four seeds) and settles near 13 m/s on a straight. It is what linearPolicy.js's schemas call the hand policy:
 * the start the ES improves from, and the driver a brain trained from zero must beat before it is worth anything.
 */
export function handWeights({ toLook = 3.0, heading = 1.0, drive0 = 0.8, turn = 0.35, speed = 1.2 } = {}) {
    const w = zeroWeights(), W1 = (h, k, v) => { w[h * FEATURES + k] = v; }, W2 = (o, h, v) => { w[FEATURES * HIDDEN + HIDDEN + o * HIDDEN + h] = v; };
    const F = { bias: 0, speed: 1, heading: 3, toLook: 4, turn12: 6 };
    W1(0, F.heading, 1); W1(1, F.heading, -1); W1(2, F.toLook, 1); W1(3, F.toLook, -1); W1(4, F.turn12, 1); W1(5, F.turn12, -1); W1(6, F.bias, 1); W1(7, F.speed, 1);
    W2(0, 0, heading); W2(0, 1, -heading); W2(0, 2, toLook); W2(0, 3, -toLook);                 // steer = heading (h0 - h1) + toLook (h2 - h3)
    W2(1, 6, drive0); W2(1, 4, -turn); W2(1, 5, -turn); W2(1, 7, -speed);                       // drive = drive0 - turn |turn12| - speed x speed
    return w;
}

function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

/**
 * The (1+1)-ES: from `start` (the zero policy by default), `iters` candidates on TRAIN_SEEDS, keep what wins, widen when winning and
 * narrow when not. Deterministic for a seed. `onIter(i, state)` lets a page yield between iterations. Returns { weights, trainScore,
 * history, iters, accepted }.
 */
export function train(worldFrom, { seed = 7, iters = 60, sigma = 0.5, start = null, seconds = 30, trainSeeds = TRAIN_SEEDS, onIter = null } = {}) {
    const rng = mulberry(seed); let best = start ? Float32Array.from(start) : zeroWeights();
    let bestScore = evaluate(worldFrom, best, trainSeeds, { seconds }).score, accepted = 0; const history = [{ i: 0, score: bestScore, sigma }];
    for (let i = 1; i <= iters; i++) {
        const cand = perturb(best, sigma, rng), score = evaluate(worldFrom, cand, trainSeeds, { seconds }).score;
        if (score > bestScore) { best = cand; bestScore = score; accepted++; sigma = Math.min(1.0, sigma * 1.15); }
        else sigma = Math.max(0.02, sigma * 0.97);
        if (i % 10 === 0 || i === iters) history.push({ i, score: bestScore, sigma });
        if (onIter) onIter(i, { score: bestScore, sigma, accepted });
    }
    return { weights: best, trainScore: bestScore, history, iters, accepted };
}

/** FNV-1a over the weights' float32 bytes: a policy's identity. */
export function weightsHash(w) { const u = new Uint8Array(Float32Array.from(w).buffer); let h = 0x811c9dc5; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); }

/**
 * The store: a ratchet on the HELD-OUT score. offer({ weights, score }) is accepted only when it beats what is held; malformed or
 * non-finite weights are refused at the door (blobPolicyStore's rule). `persist(obj)` / `restore()` let a page keep it in localStorage.
 */
export function driveStore({ persist = null, restore = null } = {}) {
    let cur = restore ? restore() : null;
    if (cur && !(cur.weights && cur.weights.length === WEIGHT_COUNT && Number.isFinite(cur.score))) cur = null;
    return {
        current() { return cur ? { weights: Float32Array.from(cur.weights), score: cur.score, hash: cur.hash } : null; },
        offer(sub) {
            if (!sub || !sub.weights || sub.weights.length !== WEIGHT_COUNT || !Number.isFinite(sub.score) || Array.from(sub.weights).some((v) => !Number.isFinite(v))) return { ok: false, accepted: false, reason: "malformed weights or score" };
            if (cur && cur.score >= sub.score) return { ok: true, accepted: false, reason: "kept the better policy", score: cur.score, offered: sub.score };
            cur = { weights: Array.from(sub.weights), score: sub.score, hash: weightsHash(sub.weights), by: sub.by || "trainer" };
            if (persist) persist(cur);
            return { ok: true, accepted: true, score: sub.score, was: null };
        },
    };
}

/**
 * The auto-trainer: blobAutoTrain's protocol on the car. Each attempt trains from the store's policy (or zero), judges the result on
 * HELD_OUT_SEEDS (the only score the store sees), evaluates AUDIT_SEEDS beside it (no vote), and reports REGRET: the best audit score
 * ever seen minus the audit score of the policy the store is holding. `attempt(i)` is one unit of idle work; `report()` the ledger.
 */
export function createAutoTrainer(worldFrom, { store = driveStore(), itersPerAttempt = 15, seconds = 45, seed0 = 1000, sigma = 0.05 } = {}) {
    const history = []; let bestAuditEver = -Infinity, bestAuditAt = null, heldAudit = null;
    // the policy the store already holds is audited first, so regret is defined from the first attempt and not only after an acceptance
    const held0 = store.current(); if (held0) { heldAudit = evaluate(worldFrom, held0.weights, AUDIT_SEEDS, { seconds }).score; bestAuditEver = heldAudit; bestAuditAt = 0; }
    function attempt(i) {
        // sigma 0.05 from a stored policy: at the trainer's default 0.5 every candidate perturbed from a lapping policy crashed, and two
        // attempts of fifteen accepted nothing; at 0.05, ten of forty improve it. From zero the wide search is right and the narrow one is not.
        const start = store.current(), r = train(worldFrom, { seed: seed0 + i, iters: itersPerAttempt, start: start ? start.weights : null, seconds, sigma: start ? sigma : 0.5 });
        const held = evaluate(worldFrom, r.weights, HELD_OUT_SEEDS, { seconds }).score, audit = evaluate(worldFrom, r.weights, AUDIT_SEEDS, { seconds }).score;
        const offer = store.offer({ weights: r.weights, score: held, by: "autoTrainer" });
        if (audit > bestAuditEver) { bestAuditEver = audit; bestAuditAt = i; }
        if (offer.accepted) heldAudit = audit;
        const row = { attempt: i, train: r.trainScore, held, audit, accepted: offer.accepted, regret: heldAudit === null ? null : bestAuditEver - heldAudit };
        history.push(row); return row;
    }
    return { attempt, history, store, report() { return { attempts: history.length, accepted: history.filter((h) => h.accepted).length, bestAuditEver, bestAuditAt, heldAudit, regret: heldAudit === null ? null : bestAuditEver - heldAudit }; } };
}

/** The machine's box3d identity from physics/box3dFingerprint.js's canonical scene, folded through the wasm's own state hash (no crypto needed). */
export function machineFingerprint(m) {
    m._swk_world_create(0, -9.8, 0); m._swk_body_box(0, 0, -2.2, 0, 50, 0.5, 50, 1);
    for (let i = 0; i < 8; i++) m._swk_body_box(1, (i % 3) * 0.3 - 0.3, 1 + i * 0.5, (i % 2) * 0.2, 0.2, 0.2, 0.2, 1);
    let h = 0x811c9dc5; for (let s = 0; s < 300; s++) { m._swk_world_step(1 / 60, 4); h = C.foldHash(h, m._swk_state_hash() >>> 0); }
    m._swk_world_destroy(); return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The race: `policies` (weights each) drive one car each in ONE world on the track of `seed`, staggered 4 m apart back from the finish,
 * for `seconds`, in lockstep. Returns { order, results, fingerprint, log, ticks } where results[i] = { laps, metres, lapTime, hash } and
 * order is car indices best first: laps, then metres, ties (within a metre) by the fleet fingerprint folded with the policy hash.
 */
export function race(worldFrom, policies, { seed = 1, seconds = 60, fleet = "00000000", gap = 4, inputsLog = null } = {}) {
    const surface = surfaceFor(seed), world = worldFrom(), cp = T.checkpoints(surface.track)[0], rects = T.cityRects(surface.track); C.addBuildings(world, rects);
    const cars = policies.map((w, i) => C.createCar(world, { x: cp.x + 5 - gap * i, z: cp.z, yaw: Math.PI / 2 }));
    const drivers = policies.map((w, i) => policyDriver(w, surface, cars[i])), trackers = cars.map(() => C.lapTracker(surface));
    const s0 = cars.map((c, i) => surface.along(cp.x + 5 - gap * i, cp.z).s), metres = cars.map(() => 0), lapTimes = cars.map(() => null);
    const ticks = Math.round(seconds / C.CAR.dt), log = []; let h = 0x811c9dc5;
    for (let t = 0; t < ticks; t++) {
        const xf = world.readTransforms(), vel = world.readVelocities();
        const inputs = inputsLog ? inputsLog[t] : cars.map((c, i) => C.clampInput(drivers[i](C.carPose(world, c, xf, vel))));
        log.push(inputs.map((u) => ({ throttle: u.throttle, steer: u.steer, brake: u.brake })));
        const rs = C.stepCars(world, cars, surface, inputs, C.CAR.dt);
        rs.forEach((r, i) => { const s1 = surface.along(r.pose.pos[0], r.pose.pos[2]).s; metres[i] += metresBetween(surface, s0[i], s1); s0[i] = s1; const tk = trackers[i].update(r.pose); if (tk.laps >= 1 && lapTimes[i] === null) lapTimes[i] = (t + 1) * C.CAR.dt; });
        h = C.foldHash(h, world.stateHash());
    }
    const poses = cars.map((c) => C.carPose(world, c)); world.destroy();
    const results = policies.map((w, i) => ({ car: i, laps: trackers[i].laps, metres: metres[i], lapTime: lapTimes[i], hash: weightsHash(w), pose: poses[i] }));
    const tieKey = (r) => { let k = 0x811c9dc5; for (const ch of fleet + r.hash) { k ^= ch.charCodeAt(0); k = Math.imul(k, 0x01000193); } return k >>> 0; };
    const order = results.slice().sort((a, b) => (b.laps - a.laps) || (Math.abs(b.metres - a.metres) > 1 ? b.metres - a.metres : tieKey(a) - tieKey(b))).map((r) => r.car);
    return { order, results, fingerprint: (h >>> 0).toString(16).padStart(8, "0"), log, ticks, seed, fleet };
}

/** Replay a race from its log alone: the same seed and car count, the recorded inputs, no policies. Must reach the same fingerprint. */
export function replay(worldFrom, raceResult, { seconds = null } = {}) {
    const n = raceResult.log[0].length, secs = seconds == null ? raceResult.ticks * C.CAR.dt : seconds;
    return race(worldFrom, Array.from({ length: n }, () => zeroWeights()), { seed: raceResult.seed, seconds: secs, fleet: raceResult.fleet, inputsLog: raceResult.log });
}
