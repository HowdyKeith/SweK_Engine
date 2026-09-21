// WebGLEngine/brain/gunnerPolicy.mjs -- v4588 (task 77): the gunner, a second GPU Brain policy beside the driver
//
// THE COPILOT. brain/drivePolicy.mjs is a 9 -> 8 -> 2 relu MLP that drives the race car through { throttle, steer, brake }; this
// works the turret physics/turret.mjs mounts on the same chassis, through the turret's own contract { yaw, pitch, fire, drop,
// ignite }. The two policies share nothing but the car: the driver never sees the turret, the gunner never sees the road. Its
// eleven features are the turret's errors against physics/turret.mjs's exact aim solution for the nearest other car plus the
// slick's two facts -- the bearing and pitch still to turn, the range, the closing and lateral speeds, whether the gun is
// reloading, whether the target is reachable at all, whether the gun is aligned inside ALIGN_TOL, whether a car is close
// behind, and whether one stands on this car's own unlit oil.
//
// THE HIDDEN LAYER IS brain/gfcTopology.mjs: A REAL FLY'S ESCAPE CIRCUIT, NOT AN INVENTED SHAPE. Instead of a dense N-unit
// layer, the 11 features are encoded (dense, learned, no biological claim here -- there is no real neuron whose synapses
// happen to be "bearing error") into 34 hidden units -- one per real traced neuron of Janelia's male-cns Giant Fiber Circuit
// (vendor/male-cns/, PROVENANCE.md), in the SAME order the vendored data lists them, so a hidden unit's identity is a real,
// citable bodyId rather than an anonymous slot. Those 34 units then run REC_STEPS (3) weight-tied recurrent steps through a
// masked 34x34 matrix whose only trainable entries are the circuit's own 313 real synapses -- every other connection is
// PERMANENTLY zero, a structural constraint the search can never route around, not an initial value it could wander away
// from (expandRecurrent() below). The decoder back to 5 outputs is dense again, for the same reason the encoder is: there is
// no real "motor neuron" in this data that means "fire the gun". What is real, traceable, and load-bearing is the SHAPE in
// the middle -- which artificial units may influence which others is exactly the fly's own measured wiring, not a guess.
//
// THE HAND GUNNER PROVES IT ADDS NOTHING BY DEFAULT. handWeights() below routes its rule through 8 of the 34 channels and
// leaves the recurrent core's weights at zero -- and with every recurrent weight zero, expandRecurrent()'s matrix is the
// identity, so REC_STEPS steps of relu(I @ h) reproduce h exactly (h is already >=0 out of the encoder's own relu). The hand
// rule reaches the decoder completely unchanged; the connectome core is there for a TRAINED gunner to use, not forced onto
// this one. gunnerPolicy-selfcheck.mjs section 1 measures this rather than assuming it.
//
// TRAINED THE SAME WAY, RACED IN THE SAME LOCKSTEP. trainGunner is drivePolicy's (1+1)-ES on a DUEL: two cars on the track, a
// hand driver in each, the candidate gunner in the rear car's turret, scored by hits minus a waste penalty per shot over the
// episode. raceWithGunners is drivePolicy.race with a turret on every car: every car's driver AND gunner read the poses before
// the step, the turrets turn, the shells fly and are tested against every other chassis, a hit is an impulse on the target's
// chassis applied before the world steps, then one step -- and the fingerprint folds box3d's state hash AND the turret and shell
// state every tick, so a replay from the log (both contracts per car per tick, no policies) must reach the same fingerprint.
//
// THE KNOB IS THE SHELL SPEED, AND THE SEARCH WANTS IT SLOW. A slow shell arcs visibly, which is the spectacle; the proposer's
// score is 1 / speed and its favourite is the slowest candidate. The adjudicator runs the hand gunner in a duel at that speed on
// a track and asks for HIT_BOUND hits: a shell slower than the cars never catches the target (physics/turret.mjs's aim solution has
// no root and the gunner's `reachable` feature is 0), so the slow end is refused BY MEASUREMENT and the greedy pick is the first
// refusal -- which is the property physics/knobRegistry-selfcheck.mjs holds every registered adjudicator to.
//
// MEASURED (brain/gunnerPolicy-selfcheck.mjs, this box): see the gate's header; every number there is re-derived, none typed.
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as T from "../world/raceTrack.mjs";
import * as C from "../physics/raceCar.mjs";
import * as D from "./drivePolicy.mjs";
import * as U from "../physics/turret.mjs";
import * as S from "../physics/slick.mjs";
import * as A from "../physics/spellAmmo.mjs";   // v4592 (task 81): the spellbook as ammunition, and the pickups
import { worldFromModule } from "../render/slugTicker.mjs";

// v4590 (task 79) -- two more features and two more outputs: the gunner sees whether a car is close BEHIND (the slick's target)
// and whether one is standing on its own unlit oil (the match's moment), and its contract grew drop and ignite.
export const FEATURES = 11, HIDDEN = Topo.NEURON_ORDER.length, OUTPUTS = 5;
export const REC_STEPS = 3;                             // weight-tied recurrent relaxation steps through the masked core
export const REC_EDGES = Topo.EDGES.length;              // one trainable weight per real GFC synapse -- 313, measured from brain/gfcTopology.mjs, not typed
export const FEATURE_NAMES = Object.freeze(["bias", "bearing", "pitch", "range", "closing", "lateral", "reloading", "reachable", "aligned", "pursuerNear", "onMyOil"]);
export const OUTPUT_NAMES = Object.freeze(["yaw", "pitch", "fire", "drop", "ignite"]);
export const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS;   // 374 + 34 + 313 + 170 + 5 = 896
export const REWARD = Object.freeze({ hit: 1, waste: 0.02, burn: 0.5, damage: 0.05 });  // a shot costs 2 % of a hit; an opponent's second on my fire pays half a hit; v4592: a twentieth per point of damage BEYOND the plain shell's
export const DROP_RANGE = 14;                                                          // m: a pursuer inside this is worth a slick

/** The all-zero gunner: never turns, never fires (tanh 0 is not > 0). What every trained gunner is measured against. */
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);

const ZERO_HIDDEN = new Float32Array(HIDDEN);

/**
 * Expand the compact per-edge recurrent weights into a HIDDEN x HIDDEN matrix: the identity on the diagonal
 * (so a plain relu-matmul computes relu(h + Wm@h), the residual step, with no special case in mlpLayerCpu)
 * plus each real GFC edge's own trainable weight at [toIdx*HIDDEN+fromIdx]. Every other entry is permanently,
 * structurally zero -- THIS is the wiring constraint, not an initial value a search could wander away from.
 *
 * NO CLAMPING ON PURPOSE, WITH A MEASURED BOUND ON WHY THAT IS SAFE HERE. relu(h + Wm@h) over REC_STEPS steps
 * can grow: measured directly, a uniform hidden state of 1 with every edge weight at 5 (well inside what
 * perturb()'s sigma<=1.0 random walk could reach) drives max(h) to 1 -> 96 -> 5216 -> ~3.0e5 over 3 steps.
 * Reaching actual float32 overflow at this in-degree needs edge weights around 1e11 -- astronomically outside
 * any sigma this file ever uses (train() starts at 0.5, caps at 1.0) -- but if it ever happened, 0 * Infinity
 * = NaN in IEEE-754 means the structural zero-mask would NOT contain it: mlpLayerCpu sums over every input
 * regardless of its weight, so one runaway channel would NaN-contaminate the whole hidden state, not just
 * itself. train()'s `score > bestScore` silently rejects a NaN-scoring candidate (NaN comparisons are always
 * false), so the ES loop degrades gracefully rather than crashing -- but a future reader who raises sigma or
 * REC_STEPS should re-measure this bound rather than assume it still holds.
 */
function expandRecurrent(Wrec) {
    const Wm = new Float32Array(HIDDEN * HIDDEN);
    for (let i = 0; i < HIDDEN; i++) Wm[i * HIDDEN + i] = 1;
    Topo.EDGES.forEach(([toIdx, fromIdx], k) => { Wm[toIdx * HIDDEN + fromIdx] += Wrec[k]; });
    return Wm;
}

/**
 * Split a flat weight vector into the sequence mlpLayerCpu applies in order: the encoder (11 -> 34, dense,
 * relu), REC_STEPS weight-tied copies of the connectome-masked recurrent layer (34 -> 34, relu), and the
 * decoder (34 -> 5, none). forward() below and render/carViews.mjs's activationsOf() both walk this same
 * array rather than assuming a fixed depth, so either can grow or shrink REC_STEPS with no second edit.
 */
export function layersOf(w) {
    let o = 0;
    const Win = w.subarray(o, o += FEATURES * HIDDEN), bin = w.subarray(o, o += HIDDEN);
    const Wrec = w.subarray(o, o += REC_EDGES);
    const Wout = w.subarray(o, o += HIDDEN * OUTPUTS), bout = w.subarray(o, o += OUTPUTS);
    const rec = { nIn: HIDDEN, nOut: HIDDEN, W: expandRecurrent(Wrec), b: ZERO_HIDDEN, act: "relu" };
    return [
        { nIn: FEATURES, nOut: HIDDEN, W: Win, b: bin, act: "relu" },
        ...Array(REC_STEPS).fill(rec),
        { nIn: HIDDEN, nOut: OUTPUTS, W: Wout, b: bout, act: "none" },
    ];
}

/** The forward pass: features -> [yaw rate, pitch rate, fire, drop, ignite] in [-1, 1], through the encoder, the
 *  connectome-masked recurrent core, and the decoder; a trigger is honoured when its output is positive. */
export function forward(w, x) {
    const layers = layersOf(w);
    let h = Float32Array.from(x);
    for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
    const y = mlpLayerCpu(layers[layers.length - 1], h, 1);
    return [Math.tanh(y[0]), Math.tanh(y[1]), Math.tanh(y[2]), Math.tanh(y[3]), Math.tanh(y[4])];
}

const unit3 = (v) => { const L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };

/**
 * The eleven features of a gunner on `pose` with `turret`, against a target { pose } (null: nothing to shoot at), with the slick's
 * two from `extra` ({ pursuerNear, onMyOil }, see pursuerInfo). Each of order one.
 */
export function features(pose, turret, target, extra = null) {
    const tail = [extra && extra.pursuerNear ? 1 : 0, extra && extra.onMyOil ? 1 : 0];
    if (!target) return [1, 0, 0, 0, 0, 0, turret.reload > 0 ? 1 : 0, 0, 0, ...tail];
    const e = U.aimErrors(pose, turret, target.pose.pos, target.pose.vel);
    const d = [target.pose.pos[0] - pose.pos[0], target.pose.pos[1] - pose.pos[1], target.pose.pos[2] - pose.pos[2]], range = Math.hypot(d[0], d[1], d[2]), dh = unit3(d);
    const rel = [target.pose.vel[0] - pose.vel[0], target.pose.vel[1] - pose.vel[1], target.pose.vel[2] - pose.vel[2]];
    const along = rel[0] * dh[0] + rel[1] * dh[1] + rel[2] * dh[2], lat = Math.hypot(rel[0] - along * dh[0], rel[1] - along * dh[1], rel[2] - along * dh[2]);
    return [1, e.bearing / Math.PI, e.pitch / (Math.PI / 2), Math.min(2, range / 40), -along / 20, lat / 20, turret.reload > 0 ? 1 : 0, e.reachable ? 1 : 0, e.aligned ? 1 : 0, ...tail];
}

/** The slick's two facts for car i: is another car close behind it (inside DROP_RANGE, behind the chassis), is one on its unlit oil. */
export function pursuerInfo(i, poses, slicks) {
    const me = poses[i], f = [Math.sin(me.yaw), 0, Math.cos(me.yaw)]; let near = false;
    for (let j = 0; j < poses.length; j++) {
        if (j === i) continue;
        const d = [poses[j].pos[0] - me.pos[0], 0, poses[j].pos[2] - me.pos[2]], r = Math.hypot(d[0], d[2]);
        if (r < DROP_RANGE && d[0] * f[0] + d[2] * f[2] < 0) near = true;
    }
    return { pursuerNear: near, onMyOil: slicks ? S.someoneOnMyOil(slicks, i, poses) : false };
}

/** A gunner (pose, turret, target, extra -> the turret contract) from weights. */
export function gunnerFor(w) {
    return (pose, turret, target, extra = null) => { const [yaw, pitch, fire, drop, ignite] = forward(w, features(pose, turret, target, extra)); return { yaw, pitch, fire: fire > 0 ? 1 : 0, drop: drop > 0 ? 1 : 0, ignite: ignite > 0 ? 1 : 0 }; };
}

/**
 * The hand gunner: turn at `turn` x the bearing error, lift at `lift` x the pitch error, fire when aligned,
 * drop oil when a car is close behind, light it when one is on it -- routed through 8 of the 34 real hidden
 * channels (indices 0-7; which specific bodyId lands there is an accident of vendor/male-cns's own neuron
 * order, not a biological claim). The recurrent core's weights are left at zeroWeights()'s default of 0,
 * which makes the core a provable identity (see expandRecurrent() and this file's own header) -- the rule
 * below reaches the decoder exactly as it would through the old plain 11 -> 8 -> 5 net.
 */
export function handWeights({ turn = 12, lift = 8, fireOn = 4, dropOn = 4, igniteOn = 4 } = {}) {
    const w = zeroWeights(), W1 = (h, k, v) => { w[h * FEATURES + k] = v; }, outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, W2 = (o, h, v) => { w[outBase + o * HIDDEN + h] = v; };
    const F = { bias: 0, bearing: 1, pitch: 2, aligned: 8, pursuerNear: 9, onMyOil: 10 };
    W1(0, F.bearing, 1); W1(1, F.bearing, -1); W1(2, F.pitch, 1); W1(3, F.pitch, -1); W1(4, F.aligned, 1); W1(5, F.bias, 1); W1(6, F.pursuerNear, 1); W1(7, F.onMyOil, 1);
    W2(0, 0, turn); W2(0, 1, -turn);              // yaw = turn x bearing
    W2(1, 2, lift); W2(1, 3, -lift);              // pitch = lift x pitch error
    W2(2, 4, fireOn); W2(2, 5, -fireOn / 2);      // fire = tanh(fireOn x aligned - fireOn / 2): positive only when aligned
    W2(3, 6, dropOn); W2(3, 5, -dropOn / 2);      // drop = tanh(dropOn x pursuerNear - dropOn / 2): positive only with a car close behind
    W2(4, 7, igniteOn); W2(4, 5, -igniteOn / 2);  // ignite = tanh(igniteOn x onMyOil - igniteOn / 2): positive only with a car on my oil
    return w;
}

/** The nearest other car to car i, by chassis distance; null when there is no other car. */
export function nearestOther(i, poses) {
    let best = null, bd = Infinity;
    for (let j = 0; j < poses.length; j++) { if (j === i) continue; const a = poses[i].pos, b = poses[j].pos, d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); if (d < bd) { bd = d; best = j; } }
    return best;
}

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

/**
 * One tick of every turret in a world of cars: the gunners' commands from the poses before the step, the mounts turned, the shells
 * fired and flown, hits turned into impulses on the target chassis; and, with a slick state, drops laid, ignitions lit, the fires
 * stepped and the burns tallied. Returns the commands (for the log), the hit events and the burn events.
 */
export function turretTick(world, cars, turrets, shells, poses, cmds, t, spec, slicks = null, pickups = null) {
    const fired = cmds.map((c, i) => U.stepTurret(turrets[i], c, C.CAR.dt));
    // v4592: a shell carries the spell its turret has loaded (spark, the plain shell, without a magazine); the pickups load the rest
    fired.forEach((f, i) => { if (f.fires) { const sh = U.fireShell(shells, poses[i], turrets[i], i, t); sh.ammo = turrets[i].ammo ? A.spendShell(turrets[i].ammo) : A.AMMO.plain; sh.ammoIndex = A.ammoIndex(sh.ammo); } });
    if (slicks) fired.forEach((f, i) => { if (f.drop && S.dropSlick(slicks, poses[i], i, t)) turrets[i].drops = (turrets[i].drops || 0) + 1; if (f.ignite) S.igniteSlick(slicks, i, t); });
    const targets = cars.map((car, i) => ({ index: i, pose: poses[i], half: car.spec.half }));
    const events = U.stepShells(shells, targets, C.CAR.dt, { groundY: T.ROAD_Y - 2, gravity: spec.gravity, spec });
    // a hit is the spell's row applied: the impulse scaled by its damage over spark's, the splash, the slow, the fire or the pool under the target
    const effects = [];
    for (const e of events) { turrets[e.owner].hits++; effects.push(...A.applyHit(e, { world, cars, turrets, poses, slicks, t, spec })); }
    const taken = pickups ? A.collectPickups(pickups, poses, turrets, t) : [];
    const burns = slicks ? S.stepSlicks(slicks, targets, t).events : [];
    for (const b of burns) {
        if (b.kind === "acid") { const dmg = b.dps * C.CAR.dt; turrets[b.car].damageTaken = (turrets[b.car].damageTaken || 0) + dmg; turrets[b.car].acid = (turrets[b.car].acid || 0) + 1; if (turrets[b.owner]) turrets[b.owner].damageDealt = (turrets[b.owner].damageDealt || 0) + dmg; }
        else turrets[b.car].burned = (turrets[b.car].burned || 0) + 1;
    }
    return { cmds: fired.map((f) => ({ yaw: f.yaw, pitch: f.pitch, fire: f.fire, drop: f.drop, ignite: f.ignite })), events, burns, effects, taken };
}

/**
 * THE DUEL: two hand-driven cars on the track of `seed`, the candidate gunner in the FRONT car's turret and a pursuer `gap` metres
 * behind it, for `seconds`. The gunner turns its turret back to shoot, drops oil for the pursuer to cross and lights it under
 * the pursuer. Returns { hits, shots, drops, burned (the pursuer's ticks on the candidate's fire), score, fingerprint, ticks,
 * seed }. A world is made and destroyed here. v4590 turned the duel around: until then the candidate sat behind a target it
 * could only shoot, and a slick dropped behind a rear car meets nobody.
 */
export function duel(worldFrom, w, { seed = 1, seconds = 20, gap = 10, shellSpeed = U.TURRET.shellSpeed, driver = null, otherDriver = null, slicks: withSlicks = true, geometry = "pursued", pickups: withPickups = false, onTick = null } = {}) {
    // "pursued": the candidate in the FRONT car, the other car behind it (the slick's geometry, the trainer's default);
    // "chase": the candidate BEHIND a car that pulls away (v4588's original duel), where a slow shell never catches the target
    const me = geometry === "chase" ? 1 : 0, other = 1 - me;
    const surface = D.surfaceFor(seed), world = worldFrom(), cp = T.checkpoints(surface.track)[0]; C.addBuildings(world, T.cityRects(surface.track));
    const cars = [C.createCar(world, { x: cp.x + 5, z: cp.z, yaw: Math.PI / 2 }), C.createCar(world, { x: cp.x + 5 - gap, z: cp.z, yaw: Math.PI / 2 })];
    const weights = [null, null]; weights[me] = driver || D.handWeights(); weights[other] = otherDriver || D.handWeights();
    const drivers = weights.map((dw, i) => D.policyDriver(dw, surface, cars[i]));
    const spec = Object.freeze({ ...U.TURRET, shellSpeed }), turrets = [U.createTurret(spec), U.createTurret(spec)], shells = [], gunner = gunnerFor(w);
    const slicks = withSlicks ? S.createSlicks() : null, surf = slicks ? S.slickSurface(surface, slicks) : surface, idle = { yaw: 0, pitch: 0, fire: 0, drop: 0, ignite: 0 };
    const field = withPickups ? A.pickupField(surface, { seed }) : null; turrets.forEach((tr) => { tr.ammo = A.createAmmo(); });
    const ticks = Math.round(seconds / C.CAR.dt); let h = 0x811c9dc5, burned = 0;
    for (let t = 0; t < ticks; t++) {
        const xf = world.readTransforms(), vel = world.readVelocities(), poses = cars.map((c) => C.carPose(world, c, xf, vel));
        const inputs = poses.map((p, i) => { const u = C.clampInput(drivers[i](p)); return { ...u, throttle: u.throttle * A.throttleFactor(turrets[i], t) }; });
        const extra = pursuerInfo(me, poses, slicks);
        const cmds = [idle, idle]; cmds[me] = U.clampGun(gunner(poses[me], turrets[me], { pose: poses[other] }, extra));
        // v4593 -- onTick: the SAME 11 features gunnerFor's own closure just fed forward(), recomputed here (a pure
        // function, no different from calling it twice) so a caller can capture the real per-tick activation trace
        // without duel() itself carrying the weight of that instrumentation on every ordinary run.
        if (onTick) onTick(t, features(poses[me], turrets[me], { pose: poses[other] }, extra), cmds[me]);
        const tt = turretTick(world, cars, turrets, shells, poses, cmds, t, spec, slicks, field);
        for (const b of tt.burns) if (b.kind === "burn" && b.car === other && b.owner === me) burned++;
        C.stepCars(world, cars, surf, inputs, C.CAR.dt);
        h = C.foldHash(h, world.stateHash()); h = U.turretHash(h, turrets, shells, C.foldHash); if (slicks) h = S.slickHash(h, slicks, C.foldHash); h = A.ammoHash(h, turrets, C.foldHash); if (field) h = A.pickupHash(h, field, C.foldHash);
    }
    world.destroy();
    const hits = turrets[me].hits, shots = turrets[me].shots, drops = turrets[me].drops || 0, damage = turrets[me].damageDealt || 0, pickups = turrets[me].ammo.taken;
    // the damage bonus is what the SPELLS add beyond the plain shell: a duel without pickups scores exactly as it did before them
    const beyond = Math.max(0, damage - hits * A.hitEffect(A.AMMO.plain).damage);
    return { hits, shots, drops, burned, damage, pickups, score: REWARD.hit * hits - REWARD.waste * shots + REWARD.burn * burned * C.CAR.dt + REWARD.damage * beyond, fingerprint: (h >>> 0).toString(16).padStart(8, "0"), ticks, seed, shellSpeed, geometry };
}

/** The mean duel score of a gunner over track seeds. */
export function evaluate(worldFrom, w, seeds, opts = {}) {
    let sum = 0; const runs = [];
    for (const seed of seeds) { const r = duel(worldFrom, w, { ...opts, seed }); sum += r.score; runs.push(r); }
    return { score: sum / seeds.length, runs };
}

export const TRAIN_SEEDS = D.TRAIN_SEEDS, HELD_OUT_SEEDS = D.HELD_OUT_SEEDS;

/** drivePolicy's (1+1)-ES on the duel. Deterministic for a seed. Returns { weights, trainScore, history, iters, accepted }. */
export function train(worldFrom, { seed = 7, iters = 30, sigma = 0.5, start = null, seconds = 15, trainSeeds = TRAIN_SEEDS, onIter = null } = {}) {
    const rng = D.mulberry(seed); let best = start ? Float32Array.from(start) : zeroWeights();
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

/** The store: a ratchet on the held-out duel score, drivePolicy.driveStore's rule with this policy's weight count. */
export function gunnerStore({ persist = null, restore = null } = {}) {
    let cur = restore ? restore() : null;
    if (cur && !(cur.weights && cur.weights.length === WEIGHT_COUNT && Number.isFinite(cur.score))) cur = null;
    return {
        current() { return cur ? { weights: Float32Array.from(cur.weights), score: cur.score, hash: cur.hash } : null; },
        offer(sub) {
            if (!sub || !sub.weights || sub.weights.length !== WEIGHT_COUNT || !Number.isFinite(sub.score) || Array.from(sub.weights).some((v) => !Number.isFinite(v))) return { ok: false, accepted: false, reason: "malformed weights or score" };
            if (cur && cur.score >= sub.score) return { ok: true, accepted: false, reason: "kept the better gunner", score: cur.score, offered: sub.score };
            cur = { weights: Array.from(sub.weights), score: sub.score, hash: D.weightsHash(sub.weights), by: sub.by || "trainer" };
            if (persist) persist(cur);
            return { ok: true, accepted: true, score: sub.score, was: null };
        },
    };
}

/**
 * THE RACE WITH GUNNERS: drivePolicy.race with a turret on every car. `drivers` and `gunners` are weight vectors, one each per car;
 * every gunner shoots at the nearest other car. The log carries both contracts per car per tick; `inputsLog` replays one with no
 * policies. Returns { order, results, fingerprint, log, ticks, seed, fleet, shellSpeed } with results[i] carrying hits and shots.
 */
export function raceWithGunners(worldFrom, drivers, gunners, { seed = 1, seconds = 60, fleet = "00000000", gap = 4, shellSpeed = U.TURRET.shellSpeed, inputsLog = null, onTick = null, pickups: withPickups = true } = {}) {
    const surface = D.surfaceFor(seed), world = worldFrom(), cp = T.checkpoints(surface.track)[0]; C.addBuildings(world, T.cityRects(surface.track));
    const n = drivers.length, cars = drivers.map((w, i) => C.createCar(world, { x: cp.x + 5 - gap * i, z: cp.z, yaw: Math.PI / 2 }));
    const drive = drivers.map((w, i) => D.policyDriver(w, surface, cars[i])), gun = gunners.map((w) => gunnerFor(w)), trackers = cars.map(() => C.lapTracker(surface));
    const spec = Object.freeze({ ...U.TURRET, shellSpeed }), turrets = cars.map(() => U.createTurret(spec)), shells = [];
    const slicks = S.createSlicks(), surf = S.slickSurface(surface, slicks);   // v4590: the oil and the fire under the wheels
    const field = withPickups ? A.pickupField(surface, { seed }) : null; turrets.forEach((tr) => { tr.ammo = A.createAmmo(); });   // v4592: the spellbook's pickups
    const s0 = cars.map((c, i) => surface.along(cp.x + 5 - gap * i, cp.z).s), metres = cars.map(() => 0), lapTimes = cars.map(() => null);
    const ticks = Math.round(seconds / C.CAR.dt), log = []; let h = 0x811c9dc5;
    for (let t = 0; t < ticks; t++) {
        const xf = world.readTransforms(), vel = world.readVelocities(), poses = cars.map((c) => C.carPose(world, c, xf, vel));
        const rec = inputsLog ? inputsLog[t] : null;
        const inputs = rec ? rec.map((r) => C.clampInput(r)) : poses.map((p, i) => C.clampInput(drive[i](p)));
        const cmds = rec ? rec.map((r) => U.clampGun(r)) : poses.map((p, i) => { const j = nearestOther(i, poses); return U.clampGun(gun[i](p, turrets[i], j === null ? null : { pose: poses[j] }, pursuerInfo(i, poses, slicks))); });
        const tt = turretTick(world, cars, turrets, shells, poses, cmds, t, spec, slicks, field);
        log.push(inputs.map((u, i) => ({ throttle: u.throttle, steer: u.steer, brake: u.brake, yaw: tt.cmds[i].yaw, pitch: tt.cmds[i].pitch, fire: tt.cmds[i].fire, drop: tt.cmds[i].drop, ignite: tt.cmds[i].ignite })));
        // v4592: a frostbitten car drives at half throttle -- applied after the log (the log is the policy's word; the slow is the world's, and the replay re-derives it)
        const slowed = inputs.map((u, i) => ({ ...u, throttle: u.throttle * A.throttleFactor(turrets[i], t) }));
        const rs = C.stepCars(world, cars, surf, slowed, C.CAR.dt);
        rs.forEach((r, i) => { const s1 = surface.along(r.pose.pos[0], r.pose.pos[2]).s; metres[i] += D.metresBetween(surface, s0[i], s1); s0[i] = s1; const tk = trackers[i].update(r.pose); if (tk.laps >= 1 && lapTimes[i] === null) lapTimes[i] = (t + 1) * C.CAR.dt; });
        h = C.foldHash(h, world.stateHash()); h = U.turretHash(h, turrets, shells, C.foldHash); h = S.slickHash(h, slicks, C.foldHash); h = A.ammoHash(h, turrets, C.foldHash); if (field) h = A.pickupHash(h, field, C.foldHash);
        if (onTick) onTick(t, rs.map((r) => r.pose), turrets, shells, tt.events, slicks, tt.burns, field, tt.taken, tt.effects);
    }
    const poses = cars.map((c) => C.carPose(world, c)); world.destroy();
    const results = drivers.map((w, i) => ({ car: i, laps: trackers[i].laps, metres: metres[i], lapTime: lapTimes[i], hash: D.weightsHash(w), gunnerHash: D.weightsHash(gunners[i]), hits: turrets[i].hits, shots: turrets[i].shots, drops: turrets[i].drops || 0, burned: turrets[i].burned || 0, damageDealt: turrets[i].damageDealt || 0, damageTaken: turrets[i].damageTaken || 0, acid: turrets[i].acid || 0, pickups: turrets[i].ammo.taken, ammo: turrets[i].ammo.loaded, pose: poses[i] }));
    const tieKey = (r) => { let k = 0x811c9dc5; for (const ch of fleet + r.hash + r.gunnerHash) { k ^= ch.charCodeAt(0); k = Math.imul(k, 0x01000193); } return k >>> 0; };
    const order = results.slice().sort((a, b) => (b.laps - a.laps) || (Math.abs(b.metres - a.metres) > 1 ? b.metres - a.metres : tieKey(a) - tieKey(b))).map((r) => r.car);
    return { order, results, fingerprint: (h >>> 0).toString(16).padStart(8, "0"), log, ticks, seed, fleet, shellSpeed, n, pickups: !!field, pickupCount: field ? field.pickups.length : 0 };
}

/** Replay a gunners' race from its log alone: the same seed, car count and shell speed, no policies. Must reach the same fingerprint. */
export function replayGunners(worldFrom, rec, { onTick = null } = {}) {
    const n = rec.log[0].length, zeros = Array.from({ length: n }, () => D.zeroWeights()), zg = Array.from({ length: n }, () => zeroWeights());
    return raceWithGunners(worldFrom, zeros, zg, { seed: rec.seed, seconds: rec.ticks * C.CAR.dt, fleet: rec.fleet, shellSpeed: rec.shellSpeed, inputsLog: rec.log, onTick, pickups: rec.pickups !== false });
}

// ---- THE KNOB: the shell speed, proposed slow, adjudicated by hits ------------------------------------------------------------
export const KNOB = "shellSpeed";
export const SHELL_CANDIDATES = Object.freeze([8, 12, 16, 20, 28, 40, 60]);
export const HIT_BOUND = 3;             // hits the hand gunner must land in KEY_SECONDS on the key track
export const KEY_SECONDS = 20, KEY_SEED = D.HELD_OUT_SEEDS[0];

let MOD = null;
const NOT_READY = "box3d is not initialised -- await gunnerPolicy.ready() (node) or setModule(box3d._mod) (browser) first";
export function setModule(m) { MOD = m || null; return !!MOD; }
export function isReady() { return !!MOD; }
/**
 * In node: load the vendored wasm through box3dNode and install it. Idempotent. A page hands box3d._mod to setModule.
 * The node-only module is imported behind a process guard and through a specifier the browser walk cannot follow:
 * race-brain.html reaches this module by a relative import, and tools/ship/browserNodeGuard-selfcheck.mjs walks every
 * relative literal import -- static or dynamic -- from a page down to box3dNode.mjs's top-level `node:` imports. The guard
 * is right that a page must never load that file; the guard here is what keeps it from trying.
 */
export async function ready() {
    if (MOD) return true;
    if (typeof process === "undefined" || !process.versions || !process.versions.node) throw new Error(NOT_READY + " (no node here to load the wasm from)");
    const nodeOnly = "../physics/box3d/" + "box3dNode.mjs";
    const N = await import(nodeOnly);
    await N.initNode(); MOD = N.mod();
    return !!MOD;
}
const worldFromMod = () => worldFromModule(MOD, [0, -9.81, 0]);

export function proposeShell({ current = null } = {}) { return SHELL_CANDIDATES.filter((v) => v !== current); }
/** The search's preference: the slowest shell, whose arc is the one a person can watch. 1 / speed, -Infinity off the domain. */
export function scoreShell(v) { return Number.isFinite(v) && v > 0 ? 1 / v : -Infinity; }
/**
 * THE ADJUDICATOR: the hand gunner at this shell speed on the held-out track must land HIT_BOUND hits in KEY_SECONDS in BOTH
 * geometries -- chasing a car that pulls away, and pursued by one. v4590 turned the training duel around for the slick, and
 * a slow shell fired back at a follower that closes in is reachable (8 m/s landed 4 of 4 there, measured), so the chase leg
 * is what keeps the slow end refused: a target moving away at the gun's own speed has no solution at 8 m/s, and no hits.
 */
export function adjudicateShell(v, opts = {}) {
    if (!MOD) return { pass: false, evidence: { shellSpeed: v, reason: NOT_READY } };
    if (!Number.isFinite(v) || v <= 0) return { pass: false, evidence: { shellSpeed: v, reason: "a shell speed must be finite and positive" } };
    const legs = ["chase", "pursued"].map((geometry) => duel(worldFromMod, handWeights(), { seed: opts.seed || KEY_SEED, seconds: opts.keySeconds || KEY_SECONDS, shellSpeed: v, geometry }));
    const failed = legs.filter((r) => r.hits < HIT_BOUND), pass = failed.length === 0, [chase, pursued] = legs;
    const leg = (r) => `${r.geometry}: ${r.hits} hit${r.hits === 1 ? "" : "s"} of ${r.shots} shot${r.shots === 1 ? "" : "s"}`;
    return { pass, evidence: { shellSpeed: v, hits: chase.hits, shots: chase.shots, chase: { hits: chase.hits, shots: chase.shots }, pursued: { hits: pursued.hits, shots: pursued.shots, drops: pursued.drops, burned: pursued.burned },
                               seed: chase.seed, seconds: chase.ticks * C.CAR.dt, bound: HIT_BOUND, fingerprints: legs.map((r) => r.fingerprint),
                               law: "the hand gunner, whose aim is the exact vacuum solution, must land the bound in both duels on a track the score never sees; a shell the target outruns has no solution and no hits",
                               reason: pass ? `${legs.map(leg).join("; ")} in ${KEY_SECONDS} s` : `${failed.map(leg).join("; ")} in ${KEY_SECONDS} s, under the bound of ${HIT_BOUND}` } };
}

/** The front door. */
export function reportLines() {
    return [
        `[gunnerPolicy] the gunner: ${FEATURES} -> ${HIDDEN} (encoder) -> ${REC_STEPS}x connectome-masked recurrent (${REC_EDGES} real GFC synapses, brain/gfcTopology.mjs) -> ${OUTPUTS} (decoder) on the turret's aim errors and the slick's two facts, the hand gunner as weights, the duel, the ES, the race with turrets and oil, the shell-speed knob`,
        `  ${WEIGHT_COUNT} weights (${FEATURES} x ${HIDDEN} + ${HIDDEN} + ${REC_EDGES} + ${HIDDEN} x ${OUTPUTS} + ${OUTPUTS}); features ${FEATURE_NAMES.join(", ")}; outputs ${OUTPUT_NAMES.join(", ")}`,
        `  reward: ${REWARD.hit} per hit, -${REWARD.waste} per shot, ${REWARD.burn} per second of an opponent on my fire, ${REWARD.damage} per point of spell damage beyond the plain shell's (physics/spellAmmo.mjs, v4592); knob ${KNOB} over [${SHELL_CANDIDATES.join(", ")}] m/s, score 1 / speed, key ${HIT_BOUND} hits in ${KEY_SECONDS} s on seed ${KEY_SEED}`,
        `  box3d ${MOD ? "ready" : "not loaded here (ready() in node, setModule() in a page)"}`,
    ];
}
