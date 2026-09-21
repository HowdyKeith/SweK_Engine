// WebGLEngine/brain/pilotPolicy.mjs -- the fly brain pilots the existing space dogfight (fly-connectome integration, task 4)
//
// A FLIGHT-CONTROL POLICY IN THE GPU BRAIN'S OWN SHAPE, REPLACING ev/flightModel3d.js's stepAI3d AS THE PILOT OF ONE SIDE OF THE
// EXISTING es-box3d-fly3d.html DOGFIGHT. Nothing about the dogfight itself changes: the same physics/esBox3d.js fly3d substrate,
// the same ev/combat.js weapons and damage, the same ev/flightModel3d.js facing math. What changes is WHO is behind the stick --
// a trained connectome-masked MLP instead of stepAI3d's hand-written thresholds -- and pilotFor(w) below is an exact drop-in for
// stepAI3d's own signature, (ship, target, opts) -> { turn, pitch, thrust, firing }, so nothing downstream of it has to know or care.
//
// THE HIDDEN LAYER IS brain/gfcTopology.mjs: A REAL FLY'S ESCAPE CIRCUIT, ALREADY PROVEN ON THIS EXACT SHAPE OF PROBLEM. Instead
// of a dense N-unit layer, the features are encoded (dense, learned, no biological claim here -- there is no real neuron whose
// synapses happen to be "yaw error") into 34 hidden units -- one per real traced neuron of Janelia's male-cns Giant Fiber Circuit
// (vendor/male-cns/, PROVENANCE.md), in the same order the vendored data lists them, so a hidden unit's identity is a real,
// citable bodyId rather than an anonymous slot. Those 34 units then run REC_STEPS (3) weight-tied recurrent steps through a
// masked 34x34 matrix whose only trainable entries are the circuit's own 313 real synapses -- every other connection is
// PERMANENTLY zero, a structural constraint the search can never route around (expandRecurrent() below, brain/gunnerPolicy.mjs's
// own technique, restated per-module rather than shared, since each masks a different circuit). GFC over the other vendored
// circuit (brain/epgTopology.mjs's compass ring, already claimed by brain/drivePolicy.mjs's road-following job) because this
// job is NOT road-following: turning the whole ship to face a target and firing when aligned is the SAME shape of task
// brain/gunnerPolicy.mjs already asks of GFC -- turn a turret to face a target and fire when aligned -- just with the turret
// welded to the airframe. An escape-reflex circuit, repurposed to drive pursuit AND evasion in a dogfight, is at least as
// natural a fit as a heading-hold compass ring would be for combat maneuvering that is rarely about holding a fixed heading.
//
// THE HAND PILOT PROVES IT ADDS NOTHING BY DEFAULT. handWeights() below routes its rule through 8 of the 34 channels and leaves
// the recurrent core's weights at zero -- and with every recurrent weight zero, expandRecurrent()'s matrix is the identity, so
// REC_STEPS steps of relu(I @ h) reproduce h exactly (h is already >=0 out of the encoder's own relu). The hand rule reaches the
// decoder completely unchanged; the connectome core is there for a TRAINED pilot to use, not forced onto this one.
// tools/ship/pilotPolicy-selfcheck.mjs measures this rather than assuming it.
//
// THE FEATURES ARE EXACTLY WHAT stepAI3d COMPUTED, NOTHING MORE: the yaw and pitch errors against the target (ev/flightModel3d.js's
// own yawTo/pitchTo/angleDiffDeg -- the identical geometry the scripted AI used, so the brain has no unfair advantage over what
// it replaces), the 3D range against opts.range, how far outside (or inside) the standoff band the target sits, whether the nose
// is already aligned (stepAI3d's own <12deg bound), and the ship's own current pitch (order one against MAX_PITCH, since pitch
// saturates and a pilot that cannot feel how close it is to the limit cannot avoid fighting it). No target velocity: the live
// demo's snapshot() (es-box3d-fly3d.html) does not carry it for the enemy fleet, and a policy that needed it would not be a
// drop-in for the AI it replaces.
//
// THE OUTPUTS ARE CONTINUOUS, NOT THE OLD BANG-BANG -1/0/1: physics/esBox3d.js's driveShip3d multiplies input.turn/input.pitch
// by stats.turn/stats.pitchRate * dt with no range check, so any value in [-1, 1] is already a valid, meaningful command --
// stepAI3d's discrete steps were a choice of that function, not a contract the substrate imposes. A proportional turn/pitch
// command is if anything a BETTER pilot than the bang-bang one it replaces, and handWeights() below is exactly that: a
// proportional controller, not a re-implementation of stepAI3d's thresholds.
//
// TRAINED AND DUELLED THE SAME WAY drivePolicy/gunnerPolicy already are: duel() is a 1-on-1 dogfight, the candidate against a
// fixed opponent (the ORIGINAL stepAI3d by default -- "does the trained brain hold its own against the AI already flying this
// demo" is the whole point), scored on hits landed, shots wasted, damage taken, and the kill/death outcome. It runs on
// physics/planarFallbackWorld.js, the SAME headless substrate ev/flightModel3d-selfcheck.mjs already holds fly3d mode to for its
// own answer key -- a real box3d wasm buys ship-ship collision fidelity a 1-on-1 duel over open space essentially never needs,
// and altitude flies entirely off the substrate either way (esBox3d.js's own header: box3d owns x-z, the flight model owns alt).
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as FM from "../ev/flightModel3d.js";
import { createESBox3D } from "../physics/esBox3d.js";
import { applyDamage } from "../ev/combat.js";
import { foldHash } from "../physics/raceCar.mjs";
import * as D from "./drivePolicy.mjs";

export const FEATURES = 7, HIDDEN = Topo.NEURON_ORDER.length, OUTPUTS = 4;
export const REC_STEPS = 3;                               // weight-tied recurrent relaxation steps through the masked core
export const REC_EDGES = Topo.EDGES.length;                // one trainable weight per real GFC synapse -- 313, measured from brain/gfcTopology.mjs, not typed
export const FEATURE_NAMES = Object.freeze(["bias", "yawErr", "pitchErr", "dist", "standoffGap", "aligned", "pitchSelf"]);
export const OUTPUT_NAMES = Object.freeze(["turn", "pitch", "thrust", "firing"]);
export const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS;   // 238 + 34 + 313 + 136 + 4 = 725

/** The all-zero pilot: never turns, never thrusts, never fires (tanh 0 is not > 0). What every trained pilot is measured against. */
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);

const ZERO_HIDDEN = new Float32Array(HIDDEN);

/**
 * Expand the compact per-edge recurrent weights into a HIDDEN x HIDDEN matrix: the identity on the diagonal (so a plain
 * relu-matmul computes relu(h + Wm@h), the residual step, with no special case in mlpLayerCpu) plus each real GFC edge's own
 * trainable weight at [toIdx*HIDDEN+fromIdx]. Every other entry is permanently, structurally zero. Same technique and the same
 * measured no-clamping rationale as brain/gunnerPolicy.mjs's own expandRecurrent() (see that file's header for the overflow
 * bound) -- restated per-module since this masks the same circuit for a different policy with a different weight vector.
 */
function expandRecurrent(Wrec) {
    const Wm = new Float32Array(HIDDEN * HIDDEN);
    for (let i = 0; i < HIDDEN; i++) Wm[i * HIDDEN + i] = 1;
    Topo.EDGES.forEach(([toIdx, fromIdx], k) => { Wm[toIdx * HIDDEN + fromIdx] += Wrec[k]; });
    return Wm;
}

/**
 * Split a flat weight vector into the sequence mlpLayerCpu applies in order: the encoder (7 -> 34, dense, relu), REC_STEPS
 * weight-tied copies of the connectome-masked recurrent layer (34 -> 34, relu), and the decoder (34 -> 4, none).
 */
export function layersOf(w) {
    let o = 0;
    const W1 = w.subarray(o, o += FEATURES * HIDDEN), b1 = w.subarray(o, o += HIDDEN);
    const Wrec = w.subarray(o, o += REC_EDGES);
    const W2 = w.subarray(o, o += HIDDEN * OUTPUTS), b2 = w.subarray(o, o += OUTPUTS);
    const rec = { nIn: HIDDEN, nOut: HIDDEN, W: expandRecurrent(Wrec), b: ZERO_HIDDEN, act: "relu" };
    return [
        { nIn: FEATURES, nOut: HIDDEN, W: W1, b: b1, act: "relu" },
        ...Array(REC_STEPS).fill(rec),
        { nIn: HIDDEN, nOut: OUTPUTS, W: W2, b: b2, act: "none" },
    ];
}

/** The forward pass: features -> [turn, pitch, thrust, firing] in [-1, 1], through the encoder, the connectome-masked
 *  recurrent core, and the decoder; thrust/firing are honoured when their output is positive (pilotFor's own rule). */
export function forward(w, x) {
    const layers = layersOf(w);
    let h = Float32Array.from(x);
    for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
    const y = mlpLayerCpu(layers[layers.length - 1], h, 1);
    return [Math.tanh(y[0]), Math.tanh(y[1]), Math.tanh(y[2]), Math.tanh(y[3])];
}

/**
 * The seven features of a pilot on `ship` against `target` -- exactly stepAI3d's own geometry (ev/flightModel3d.js's
 * yawTo/pitchTo/angleDiffDeg/dist3d), so the network sees nothing the scripted AI it replaces did not already have.
 */
export function features(ship, target, opts = {}) {
    const range = opts.range || 1400, standoff = opts.standoff || 140;
    const yawErr = FM.angleDiffDeg(ship.heading || 0, FM.yawTo(ship, target));
    const pitchErr = FM.angleDiffDeg(ship.pitch || 0, FM.pitchTo(ship, target));
    const d = FM.dist3d(ship, target);
    // "aligned" is stepAI3d's own FIRING test, not just its aim test: `aimed && d < range` (ev/flightModel3d.js's
    // stepAI3d), not aim alone. Found by adversarial review: with only the angle bound, handWeights()'s fire gate
    // (routed through this feature alone) fired at any aligned target no matter the range -- verified directly, a
    // target 5000 m away at range=1400 still fired. Folding the range test into the feature itself, rather than
    // adding an eighth feature, is what handWeights() can actually gate on with the one channel it already uses.
    const aligned = (Math.abs(yawErr) < 12 && Math.abs(pitchErr) < 12 && d < range) ? 1 : 0;
    const standoffGap = (d - standoff) / Math.max(1, standoff);
    return [1, yawErr / 180, pitchErr / 180, Math.min(2, d / range), Math.max(-1, Math.min(3, standoffGap)), aligned, (ship.pitch || 0) / FM.MAX_PITCH];
}

/** A pilot (ship, target, opts) -> { turn, pitch, thrust, firing } from weights -- an exact drop-in for stepAI3d's own contract. */
export function pilotFor(w) {
    return (ship, target, opts = {}) => {
        const [turn, pitch, thrustOut, fireOut] = forward(w, features(ship, target, opts));
        return { turn, pitch, thrust: thrustOut > 0, firing: fireOut > 0 };
    };
}

/**
 * The HAND pilot, in the network's own weights: a PROPORTIONAL turn/pitch controller (turn = tanh(gain x yawErr), not the old
 * bang-bang -1/0/1), thrust unless the target is well inside the standoff band, fire only when aligned -- routed through 8 of
 * the 34 real GFC channels (indices 0-7; which specific bodyId lands there is an accident of the vendored data's own neuron
 * order, not a biological claim). The recurrent core's weights are left at zeroWeights()'s default of 0, which makes the core a
 * provable identity (see expandRecurrent() and this file's own header) -- the rule below reaches the decoder unchanged.
 */
export function handWeights({ turn = 6, lift = 6, fireOn = 4, thrustBase = 3, closePenalty = 6 } = {}) {
    const w = zeroWeights(), W1 = (h, k, v) => { w[h * FEATURES + k] = v; }, outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, W2 = (o, h, v) => { w[outBase + o * HIDDEN + h] = v; };
    const F = { bias: 0, yawErr: 1, pitchErr: 2, dist: 3, standoffGap: 4, aligned: 5, pitchSelf: 6 };
    W1(0, F.yawErr, 1); W1(1, F.yawErr, -1); W1(2, F.pitchErr, 1); W1(3, F.pitchErr, -1); W1(4, F.aligned, 1); W1(5, F.bias, 1); W1(6, F.standoffGap, 1); W1(7, F.standoffGap, -1);
    W2(0, 0, turn); W2(0, 1, -turn);                          // turn = tanh(turn x yawErr)
    W2(1, 2, lift); W2(1, 3, -lift);                          // pitch = tanh(lift x pitchErr)
    W2(2, 5, thrustBase); W2(2, 7, -closePenalty);            // thrust = tanh(thrustBase - closePenalty x max(0,-standoffGap)): off well inside standoff
    W2(3, 4, fireOn); W2(3, 5, -fireOn / 2);                  // firing = tanh(fireOn x aligned - fireOn / 2): positive only when aligned
    return w;
}

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

// ---- THE DUEL -----------------------------------------------------------------------------------------------------------------

// a mid-tier CLASSES entry from es-box3d-fly3d.html (Raider: speed 340, accel 240, maneuver 11), run through
// ev/flightModel.js's shipFlightStats() the live demo actually uses -- turn = maneuver x TURN_SCALE (3) = 33
// deg/sec, NOT the raw maneuver field. No pitchRate here either, matching the live demo's own makeFleet(): it
// never sets one, so esBox3d.js's driveShip3d defaults pitch to the same rate as yaw.
export const STATS = Object.freeze({ accel: 240, speed: 340, turn: 33 });
export const SHOT = Object.freeze({ speed: 1050, life: 1.7, dmgShield: 14, dmgArmor: 12, cooldownMs: 360, hitRadius: 90 });   // the live demo's own SHOT constant
// NO DEATH PENALTY, ON PURPOSE, MEASURED RATHER THAN GUESSED: a first pass scored -5 for dying, symmetric with
// +5 for a kill, mirroring drivePolicy's off-track penalty in shape. Every seed's (1+1)-ES converged to the
// SAME trivial policy -- 0 hits, 0 shots, 0 damage taken, score exactly 0 -- confirmed by tracing the trained
// weights through a real duel. With hits worth only 1 and a death worth -5, ONE lost fight erases five landed
// hits, so "never engage" (a free, zero-variance 0) dominated every "fight and sometimes lose" candidate the
// search actually found from zero. Dropping the death term removes that trap: any policy that lands hits net
// of its own shot-waste and damage-taken costs (both an order of magnitude smaller than a hit) outscores
// standing still, whether or not the fight is ultimately won -- REWARD.kill is still a bonus for winning, just
// no longer a matching penalty for losing.
export const REWARD = Object.freeze({ hit: 1, waste: 0.02, damageTaken: 0.01, kill: 3 });

/** Does shot `sh` (already advanced this tick) land on `victim`? The FULL 3D hit test -- x, y, AND altitude -- since
 *  a shot that only checked the x-z plane would connect through a target it passed nowhere near in altitude, the
 *  one axis esBox3d.js's own substrate never sees (it flies entirely off the flight model, not box3d). */
export function shotHits3d(sh, victim, hitRadius = SHOT.hitRadius) {
    const dx = victim.x - sh.x, dy = victim.y - sh.y, da = (victim.alt || 0) - sh.alt;
    return dx * dx + dy * dy + da * da <= hitRadius * hitRadius;
}

function makeDuelShip(id, team, x, y, alt, heading) {
    return { id, team, x, y, alt, vx: 0, vy: 0, valt: 0, heading, pitch: 0, shield: 80, armor: 60, maxShield: 80, maxArmor: 60, dead: false, _cool: 0 };
}

/** The starting geometry for a duel seed: a mulberry32 draw off `seed`, varying each side's altitude and initial bearing so a
 *  pilot cannot overfit to a single head-on-at-altitude-0 start. Deterministic per seed. */
function startGeom(seed, gap) {
    const rng = D.mulberry((seed >>> 0) * 7919 + 1);
    return {
        ax: -gap / 2, bx: gap / 2,
        aAlt: (rng() - 0.5) * 400, bAlt: (rng() - 0.5) * 400,
        aHead: 90 + (rng() - 0.5) * 40, bHead: -90 + (rng() - 0.5) * 40,
    };
}

/**
 * ONE-ON-ONE: the candidate pilot (team A, weights `w`) against `opponent`'s pilot (team B), `seconds` in physics/esBox3d.js's
 * fly3d mode on the headless planar-fallback substrate. `opponent` is "scripted" (ev/flightModel3d.js's own stepAI3d, the
 * default -- the AI already flying this demo), "hand" (this module's own handWeights()), or "zero" (never turns or fires).
 * `altOffset` (default 0) shifts BOTH ships' starting altitude by the same amount -- their altitude DIFFERENCE, and so every
 * yaw/pitch/thrust/fire decision either pilot makes, is unchanged, but the two runs occupy different absolute altitude. A
 * gate uses this to isolate whether the fingerprint actually sees altitude, independent of any behavior difference.
 * Returns { hits, shotsFired, damageDealt, damageTaken, aDead, bDead, score, ticks, seed, opponent, fingerprint }.
 */
export function duel(worldFrom, w, { seed = 1, seconds = 30, standoff = 140, range = 1400, opponent = "scripted", gap = 1200, altOffset = 0 } = {}) {
    const world = worldFrom(), esbx = createESBox3D(world, { shipHalf: 60, fly3d: true, ownCollision: true });
    const g = startGeom(seed, gap);
    const a = makeDuelShip("A", "A", g.ax, 0, g.aAlt + altOffset, g.aHead), b = makeDuelShip("B", "B", g.bx, 0, g.bAlt + altOffset, g.bHead);
    const ra = esbx.add(a, STATS), rb = esbx.add(b, STATS);
    const pilotA = pilotFor(w);
    const pilotB = opponent === "hand" ? pilotFor(handWeights()) : opponent === "zero" ? pilotFor(zeroWeights()) : null;   // null -> the original scripted AI
    const dt = 1 / 30, steps = Math.round(seconds / dt);
    let shots = [], nowMs = 0, h = 0x811c9dc5, t = 0;
    const tally = { hits: 0, shotsFired: 0, damageDealt: 0, damageTaken: 0 };
    for (; t < steps; t++, nowMs += dt * 1000) {
        if (a.dead || b.dead) break;
        const aiA = pilotA(a, b, { range, standoff }), aiB = pilotB ? pilotB(b, a, { range, standoff }) : FM.stepAI3d(b, a, { range, standoff });
        esbx.driveShip(ra, aiA, dt); esbx.driveShip(rb, aiB, dt);
        if (aiA.firing && nowMs >= a._cool) { a._cool = nowMs + SHOT.cooldownMs; const f = FM.forward3d(a.heading, a.pitch); shots.push({ team: "A", x: a.x, y: a.y, alt: a.alt, vx: f.x * SHOT.speed, vy: f.y * SHOT.speed, valt: f.alt * SHOT.speed, life: SHOT.life }); tally.shotsFired++; }
        if (aiB.firing && nowMs >= b._cool) { b._cool = nowMs + SHOT.cooldownMs; const f = FM.forward3d(b.heading, b.pitch); shots.push({ team: "B", x: b.x, y: b.y, alt: b.alt, vx: f.x * SHOT.speed, vy: f.y * SHOT.speed, valt: f.alt * SHOT.speed, life: SHOT.life }); }
        esbx.step(dt); esbx.sync();
        const alive = [];
        for (const sh of shots) {
            sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.alt += sh.valt * dt; sh.life -= dt;
            if (sh.life > 0) {
                const victim = sh.team === "A" ? b : a;
                if (!victim.dead) {
                    if (shotHits3d(sh, victim)) {
                        const before = victim.shield + victim.armor;
                        if (applyDamage(victim, SHOT.dmgShield, SHOT.dmgArmor)) victim.dead = true;
                        const dealt = before - (victim.shield + victim.armor);
                        if (sh.team === "A") { tally.hits++; tally.damageDealt += dealt; } else tally.damageTaken += dealt;
                        continue;
                    }
                }
                alive.push(sh);
            }
        }
        shots = alive;
        // altitude flies entirely off the substrate (esBox3d.js's own contract), so the world's stateHash alone
        // (x-z only) cannot see it -- fold both ships' altitude in explicitly, or two duels that fly identical
        // planar tracks at different altitudes would collide to the same fingerprint.
        h = foldHash(h, esbx.stateHash() >>> 0);
        h = foldHash(h, Math.round(a.alt * 10) & 0xffffffff); h = foldHash(h, Math.round(b.alt * 10) & 0xffffffff);
    }
    esbx.destroy();   // esBox3d.js's own destroy() already guards world.destroy not existing (planarFallbackWorld.js has none)
    const score = tally.hits * REWARD.hit - tally.shotsFired * REWARD.waste - tally.damageTaken * REWARD.damageTaken + (b.dead ? REWARD.kill : 0);
    return { ...tally, aDead: a.dead, bDead: b.dead, score, ticks: t, seed, opponent, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
}

/** The mean duel score of a pilot over track seeds, against `opts.opponent` (default: the scripted AI it replaces). */
export function evaluate(worldFrom, w, seeds, opts = {}) {
    let sum = 0; const runs = [];
    for (const seed of seeds) { const r = duel(worldFrom, w, { ...opts, seed }); sum += r.score; runs.push(r); }
    return { score: sum / seeds.length, runs };
}

export const TRAIN_SEEDS = Object.freeze([1, 4]), HELD_OUT_SEEDS = Object.freeze([2]), AUDIT_SEEDS = Object.freeze([3]);

/**
 * drivePolicy's (1+1)-ES on the duel against the scripted AI. Deterministic for a seed. Returns { weights, trainScore,
 * history, iters, accepted }.
 *
 * MEASURED, NOT GUESSED: from zero, wide-sigma search (the default below) reliably finds and then never leaves a
 * safe local optimum -- a policy that never turns, never fires and never closes distance, scoring 0 by never
 * engaging at all -- because one lost dogfight this search actually finds outweighs several won ones at this
 * module's reward scale, and "never engage" is a much easier behavior for small random weight perturbations to
 * stumble into than "close, aim, and fire" is. Confirmed directly: 200 iterations from zero still converges to
 * exactly the same trivial policy (0 hits, 0 shots, 0 damage taken) tracing the trained weights through a real
 * duel, not merely a plateaued score. REFINING FROM A GOOD START WORKS, the same way brain/drivePolicy.mjs's
 * createAutoTrainer already refines from the store's held policy with a much smaller sigma than its from-zero
 * default: `train(worldFrom, { start: handWeights(), sigma: 0.05 })` reliably improves on the hand pilot's own
 * 0.49 (measured: 0.78 on one seed, unchanged on another, never worse). A caller training this policy for real
 * should start from handWeights() (or a previously stored pilot), not zero.
 */
export function train(worldFrom, { seed = 7, iters = 30, sigma = 0.5, start = null, seconds = 20, trainSeeds = TRAIN_SEEDS, opponent = "scripted", onIter = null } = {}) {
    const rng = D.mulberry(seed); let best = start ? Float32Array.from(start) : zeroWeights();
    let bestScore = evaluate(worldFrom, best, trainSeeds, { seconds, opponent }).score, accepted = 0; const history = [{ i: 0, score: bestScore, sigma }];
    for (let i = 1; i <= iters; i++) {
        const cand = perturb(best, sigma, rng), score = evaluate(worldFrom, cand, trainSeeds, { seconds, opponent }).score;
        if (score > bestScore) { best = cand; bestScore = score; accepted++; sigma = Math.min(1.0, sigma * 1.15); }
        else sigma = Math.max(0.02, sigma * 0.97);
        if (i % 10 === 0 || i === iters) history.push({ i, score: bestScore, sigma });
        if (onIter) onIter(i, { score: bestScore, sigma, accepted });
    }
    return { weights: best, trainScore: bestScore, history, iters, accepted };
}

/** The store: a ratchet on the held-out duel score, drivePolicy.driveStore's rule with this policy's weight count. */
export function pilotStore({ persist = null, restore = null } = {}) {
    let cur = restore ? restore() : null;
    if (cur && !(cur.weights && cur.weights.length === WEIGHT_COUNT && Number.isFinite(cur.score))) cur = null;
    return {
        current() { return cur ? { weights: Float32Array.from(cur.weights), score: cur.score, hash: cur.hash } : null; },
        offer(sub) {
            if (!sub || !sub.weights || sub.weights.length !== WEIGHT_COUNT || !Number.isFinite(sub.score) || Array.from(sub.weights).some((v) => !Number.isFinite(v))) return { ok: false, accepted: false, reason: "malformed weights or score" };
            if (cur && cur.score >= sub.score) return { ok: true, accepted: false, reason: "kept the better pilot", score: cur.score, offered: sub.score };
            cur = { weights: Array.from(sub.weights), score: sub.score, hash: D.weightsHash(sub.weights), by: sub.by || "trainer" };
            if (persist) persist(cur);
            return { ok: true, accepted: true, score: sub.score, was: null };
        },
    };
}

/** The front door. */
export function reportLines() {
    return [
        `[pilotPolicy] the pilot: ${FEATURES} -> ${HIDDEN} (encoder) -> ${REC_STEPS}x connectome-masked recurrent (${REC_EDGES} real GFC synapses, brain/gfcTopology.mjs) -> ${OUTPUTS} (decoder) on stepAI3d's own yaw/pitch/range/standoff geometry, an exact drop-in for ev/flightModel3d.js's stepAI3d`,
        `  ${WEIGHT_COUNT} weights (${FEATURES} x ${HIDDEN} + ${HIDDEN} + ${REC_EDGES} + ${HIDDEN} x ${OUTPUTS} + ${OUTPUTS}); features ${FEATURE_NAMES.join(", ")}; outputs ${OUTPUT_NAMES.join(", ")}`,
        `  reward: ${REWARD.hit} per hit, -${REWARD.waste} per shot, -${REWARD.damageTaken} per point of damage taken, +${REWARD.kill} for a kill, NO death penalty (see train()'s own header for the measured "never engage" trap that fixed); duelled against the scripted stepAI3d it replaces by default`,
    ];
}
