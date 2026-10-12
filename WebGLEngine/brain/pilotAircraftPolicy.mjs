// WebGLEngine/brain/pilotAircraftPolicy.mjs -- v4839
//
// A LEARNED HEADING-HOLD PILOT FOR THE AERODYNAMIC AIRCRAFT: the same contract brain/autopilotAircraft.mjs's decide() has -- (body, desiredForward, opts) -> { controls: { pitch, roll, yaw }, facingCos, eBody,
// currentBank, desiredBank } -- from a network. es-aircraft.html flew its three aircraft on that PD heading-hold controller and nothing else, so there was nothing to choose between; this is the second,
// and brain/pilotRoster.mjs (which resolves a choice of weights to a pilot, for the plane and space-battle pages) resolves it for this page unchanged: zeroWeights(), handWeights(), perturb(), pilotFor(),
// WEIGHT_COUNT are all here.
//
// THE NETWORK is pilot6dofPolicy.mjs's, for a different body (restated, not imported, for the reason that file's header gives): twelve features through an encoder into the 34 neurons of the real male-cns Giant
// Fiber Circuit (313 real synapses, three weight-tied recurrent steps, every other recurrent weight structurally zero), out to three numbers -- pitch, roll, yaw -- each CLAMPED to [-1, 1], which is exactly the
// range aircraftAssembly.mjs' mixControls() takes. (The space-battle pilot squashes with tanh; here a clamp, so that the hand weights are the PD controller and not an approximation of it.)
//
//   FEATURES   bias; the pointing error in the BODY frame over pi (pitch, yaw and the roll component); the body's angular velocity over 2 rad/s (three); the bank error autopilotAircraft.decide() computes
//              (the wrapped difference between the bank the heading error asks for and the bank it has) and the bank itself, both over pi; the cosine to the held heading; airspeed over 30 m/s (the control
//              surfaces' authority depends on it); and the world-z of the aircraft's own up (it tells upright from inverted, which a bank angle alone cannot at the pole).
//
// *** THE HAND WEIGHTS ARE THE PD CONTROLLER, WRITTEN THROUGH THE NETWORK, AND THEY ARE IT EXACTLY. *** pitch = clamp(kp e_y - kd w_y), yaw = clamp(kp e_z - kd w_z), roll = clamp(-kpBank bankErr + kdBank w_x), each
// as a pair of relu channels (z and -z) so the decoder reads z linearly; the recurrent core is left at zero, an exact identity; the clamp is decide()'s own. The only difference from decide() is float32 weights.
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as AC from "../physics/mechanics/aircraftAssembly.mjs";
import { relativeAirflow, applySurfaceForce } from "../physics/mechanics/aeroSurface.mjs";
import * as AP from "./autopilotAircraft.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const FEATURES = 12, HIDDEN = Topo.NEURON_ORDER.length, OUTPUTS = 3;
export const REC_STEPS = 3, REC_EDGES = Topo.EDGES.length;
export const FEATURE_NAMES = Object.freeze(["bias", "errPitch", "errYaw", "errRoll", "wRoll", "wPitch", "wYaw", "bankErr", "bank", "facingCos", "speed", "upZ"]);
export const OUTPUT_NAMES = Object.freeze(["pitch", "roll", "yaw"]);
export const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS;   // 408 + 34 + 313 + 102 + 3 = 860
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
const ZERO_HIDDEN = new Float32Array(HIDDEN);

function expandRecurrent(Wrec) {
    const Wm = new Float32Array(HIDDEN * HIDDEN);
    for (let i = 0; i < HIDDEN; i++) Wm[i * HIDDEN + i] = 1;
    Topo.EDGES.forEach(([toIdx, fromIdx], k) => { Wm[toIdx * HIDDEN + fromIdx] += Wrec[k]; });
    return Wm;
}
const LAYERS_MEMO = new WeakMap(), REC_OFFSET = FEATURES * HIDDEN + HIDDEN;
function layersOfMemo(w) {
    const m = LAYERS_MEMO.get(w);
    if (m) { let k = 0; while (k < REC_EDGES && m.snap[k] === w[REC_OFFSET + k]) k++; if (k === REC_EDGES) return m.layers; }
    let o = 0;
    const W1 = w.subarray(o, o += FEATURES * HIDDEN), b1 = w.subarray(o, o += HIDDEN), Wrec = w.subarray(o, o += REC_EDGES), W2 = w.subarray(o, o += HIDDEN * OUTPUTS), b2 = w.subarray(o, o += OUTPUTS);
    const rec = { nIn: HIDDEN, nOut: HIDDEN, W: expandRecurrent(Wrec), b: ZERO_HIDDEN, act: "relu" };
    const layers = [{ nIn: FEATURES, nOut: HIDDEN, W: W1, b: b1, act: "relu" }, ...Array(REC_STEPS).fill(rec), { nIn: HIDDEN, nOut: OUTPUTS, W: W2, b: b2, act: "none" }];
    LAYERS_MEMO.set(w, { snap: Float32Array.from(w.subarray(REC_OFFSET, REC_OFFSET + REC_EDGES)), layers });
    return layers;
}
export const layersOf = (w) => layersOfMemo(w);

const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
/** features -> three numbers in [-1, 1]: pitch, roll, yaw (the linear output, clamped). */
export function forward(w, x) {
    const layers = layersOfMemo(w);
    let h = Float32Array.from(x);
    for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
    const y = mlpLayerCpu(layers[layers.length - 1], h, 1);
    return [clamp(y[0]), clamp(y[1]), clamp(y[2])];
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit3 = (v, fb) => { const n = Math.hypot(v[0], v[1], v[2]); return n > 1e-9 ? v.map((c) => c / n) : fb; };
const wrapAngle = (a) => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/** What autopilotAircraft.decide() computes before it applies its control law, restated: pointing error in the body frame, the bank it asks for and has, the wrapped difference, the cosine to the heading. */
export function geometry(body, desiredForward, opts = {}) {
    const spec = { ...AP.AUTOPILOT_AIRCRAFT, ...opts };
    const currentForward = RB.rotateByQuat(body.q, AP.FORWARD_BODY), desiredUnit = unit3(desiredForward, currentForward);
    const eBody = RB.worldToBody(body.q, AP.pointingError(currentForward, desiredUnit));
    const desiredBank = clamp(spec.kHeadingToBank * eBody[2], -spec.maxBank, spec.maxBank), currentBank = AP.bankAngle(body.q);
    const up = RB.rotateByQuat(body.q, AC.UP_BODY);
    return { spec, eBody, desiredBank, currentBank, bankErr: wrapAngle(desiredBank - currentBank), facingCos: dot3(currentForward, desiredUnit), speed: Math.hypot(body.vel[0], body.vel[1], body.vel[2]), upZ: up[2] };
}
const featuresFrom = (g, body) => [1, g.eBody[1] / Math.PI, g.eBody[2] / Math.PI, g.eBody[0] / Math.PI, clamp(body.w[0] / 2, -3, 3), clamp(body.w[1] / 2, -3, 3), clamp(body.w[2] / 2, -3, 3),
    g.bankErr / Math.PI, g.currentBank / Math.PI, g.facingCos, clamp(g.speed / 30, 0, 3), g.upZ];
/** The twelve features, in FEATURE_NAMES order. */
export const features = (body, desiredForward, opts = {}) => featuresFrom(geometry(body, desiredForward, opts), body);

/** A pilot (body, desiredForward, opts) -> { controls, facingCos, eBody, currentBank, desiredBank } from weights: an exact drop-in for autopilotAircraft.decide()'s own contract. */
export function pilotFor(w) {
    return (body, desiredForward, opts = {}) => {
        const g = geometry(body, desiredForward, opts), y = forward(w, featuresFrom(g, body));
        return { controls: { pitch: y[0], roll: y[1], yaw: y[2] }, facingCos: g.facingCos, eBody: g.eBody, currentBank: g.currentBank, desiredBank: g.desiredBank };
    };
}

/** The PD heading-hold controller in the network's own weights (see the header). kd defaults to decide()'s 2 sqrt(kp). */
export function handWeights({ kp = AP.AUTOPILOT_AIRCRAFT.kp, kd = null, kpBank = AP.AUTOPILOT_AIRCRAFT.kpBank, kdBank = AP.AUTOPILOT_AIRCRAFT.kdBank } = {}) {
    const k2 = kd == null ? 2 * Math.sqrt(kp) : kd, w = zeroWeights(), W1 = (h, f, v) => { w[h * FEATURES + f] = v; };
    const outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, W2 = (o, h, v) => { w[outBase + o * HIDDEN + h] = v; };
    const F = { errPitch: 1, errYaw: 2, wRoll: 4, wPitch: 5, wYaw: 6, bankErr: 7 };
    // z = a * (e / pi) + b * (w / 2): a pair of relu channels per output (z and -z), read back as h_a - h_b = z
    const channel = (o, terms) => { for (const [f, v] of terms) { W1(2 * o, f, v); W1(2 * o + 1, f, -v); } W2(o, 2 * o, 1); W2(o, 2 * o + 1, -1); };
    channel(0, [[F.errPitch, kp * Math.PI], [F.wPitch, -k2 * 2]]);          // pitch = kp e_y - kd w_y
    channel(1, [[F.bankErr, -kpBank * Math.PI], [F.wRoll, kdBank * 2]]);    // roll  = -kpBank bankErr + kdBank w_x
    channel(2, [[F.errYaw, kp * Math.PI], [F.wYaw, -k2 * 2]]);              // yaw   = kp e_z - kd w_z
    return w;
}

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

// ---- THE FLIGHT --------------------------------------------------------------------------------------------------------------------
// es-aircraft.html's own aircraft (the same mass, hull, engine and cruise speed), flown headless by the same step the page uses. NO gravity (rigidBody6dof.mjs has none), so a pilot that tumbles stays in the
// sky; what is graded is whether the nose comes round to the held heading and stays there.
export const AIRCRAFT_MASS = 600, HX = 3, HY = 3, HZ = 0.6, ENGINE_MOUNT = [-3, 0, 0], ENGINE_THRUST = 60, CRUISE_SPEED = 30, DT = 1 / 30;
export const HEADING = Object.freeze([1, 0, 0]);

/** One tick of the page's step: control surfaces mixed into aircraftAssembly's aerodynamic forces, plus the page's constant engine thrust, integrated by rigidBody6dof's step. */
export function stepWithEngine(aircraft, state, controls, dt = DT) {
    const deflections = AC.mixControls(aircraft, controls), flow = relativeAirflow(state), acc = AC.createAccumulator();
    for (const name of Object.keys(aircraft.surfaces)) applySurfaceForce(acc, flow, AC.withDeflection(aircraft.surfaces[name], deflections[name]));
    AC.applyForceAtPoint(acc, [ENGINE_THRUST, 0, 0], ENGINE_MOUNT);
    return AC.step(state, acc, dt);
}

const makeRng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
/** A scenario: the aircraft starts `deg` degrees off the held heading about a seeded axis (or about the vertical when `axis` is given), flying along its own nose at cruise speed. */
export function scenario(seed, deg, axis = null) {
    const rng = makeRng(seed * 7919 + Math.round(deg) * 104729);
    let a = axis;
    if (!a) { const z = rng() * 2 - 1, t = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z); a = [r * Math.cos(t), r * Math.sin(t), z]; }
    const n = Math.hypot(a[0], a[1], a[2]), half = (deg * Math.PI / 180) / 2, s = Math.sin(half);
    return { seed, deg, q: [Math.cos(half), a[0] / n * s, a[1] / n * s, a[2] / n * s] };
}

export const SECONDS = 30;
/**
 * Fly one scenario with `pilot` ("autopilot" = autopilotAircraft.decide, "hand", "zero", or a weight vector). Returns { mean, final, maxW, finite, score, fingerprint }: the mean and final cosine between the nose
 * and the held heading, the largest angular rate seen, and score = half the mean plus half the final, minus 5 for a flight that went non-finite or spun past 20 rad/s. Deterministic.
 */
export function fly(pilot, sc, { seconds = SECONDS, desired = HEADING } = {}) {
    const decide = pilot === "autopilot" ? (b, d) => AP.decide(b, d) : pilotFor(pilot === "hand" ? handWeights() : pilot === "zero" ? zeroWeights() : pilot);
    const aircraft = AC.createAircraft(), I = RB.boxInertia({ m: AIRCRAFT_MASS, hx: HX, hy: HY, hz: HZ });
    let body = RB.createBody({ mass: AIRCRAFT_MASS, I, pos: [0, 0, 0], vel: RB.rotateByQuat(sc.q, [CRUISE_SPEED, 0, 0]), q: sc.q });
    const ticks = Math.round(seconds / DT);
    let sum = 0, maxW = 0, finite = true, h = 0x811c9dc5, last = 0;
    for (let t = 0; t < ticks; t++) {
        const d = decide(body, desired);
        body = stepWithEngine(aircraft, body, d.controls, DT);
        sum += d.facingCos; last = d.facingCos;
        const w = Math.hypot(body.w[0], body.w[1], body.w[2]); if (w > maxW) maxW = w;
        if (!(body.pos.every(Number.isFinite) && body.q.every(Number.isFinite) && Number.isFinite(w))) { finite = false; break; }
        if (t % 30 === 0) for (const c of body.q) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    const mean = sum / ticks, fin = RB.rotateByQuat(body.q, AP.FORWARD_BODY).reduce((a, v, i) => a + v * desired[i], 0), final = finite ? fin : last;
    const bad = !finite || maxW > 20;
    return { mean, final, maxW, finite, bad, score: 0.5 * mean + 0.5 * final - (bad ? 5 : 0), deg: sc.deg, seed: sc.seed, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
}

// ---- THE SCENARIO SETS (v4839) -------------------------------------------------------------------------------------------------------
// TRAIN, HELD-OUT and AUDIT are three disjoint sets of (angle, axis) starts. The PD controller flies 25 degrees to 0.996 and 60 to 0.81 over 30 s, and 120 to 0.58 and 150 to 0.53 (measured here): its documented limit
// is the large angles, so the sets run to 175. YAW scenarios turn about the vertical, which is what the page's patrol asks (36 degrees a leg). No start repeats across the three sets, and the angles are disjoint but for one: 90 degrees, about a seeded axis in TRAIN and about the vertical in AUDIT (a different start).
const mk = (angles, seeds) => Object.freeze(angles.flatMap((d) => seeds.map((s) => Object.freeze(scenario(s, d)))));
const yaw = (deg) => Object.freeze(scenario(1, deg, [0, 0, 1]));
export const TRAIN_SET = Object.freeze([...mk([45, 90, 120, 150], [1, 2]), yaw(36), yaw(72)]);
export const HELD_OUT_SET = Object.freeze([...mk([40, 75, 105, 135, 160], [11, 12]), yaw(54)]);
export const AUDIT_SET = Object.freeze([...mk([25, 55, 85, 100, 115, 130, 145, 165, 175], [21, 22]), yaw(20), yaw(90)]);

/** The pilot `w` (or "autopilot"/"hand"/"zero") over a set: { score (the mean), mean, final, unstable, runs }. */
export function evaluate(w, set, { seconds = SECONDS } = {}) {
    const runs = set.map((sc) => fly(w, sc, { seconds })), n = runs.length, avg = (k) => runs.reduce((a, r) => a + r[k], 0) / n;
    return { score: avg("score"), mean: avg("mean"), final: avg("final"), unstable: runs.filter((r) => r.bad).length, runs };
}
/** One line for an evaluate() result. The shipped file's `by` quotes it, and the gate recomputes it. */
export const describeEval = (r) => `${r.score.toFixed(3)} (mean ${r.mean.toFixed(3)}, final ${r.final.toFixed(3)}, ${r.unstable} unstable)`;
/** Scenario by scenario: how many the pilot flew better than `ref` by more than `eps`, and how many worse. */
export function versus(r, ref, eps = 0.01) {
    let better = 0, worse = 0; r.runs.forEach((x, i) => { const d = x.score - ref.runs[i].score; if (d > eps) better++; else if (d < -eps) worse++; });
    return { better, worse, same: r.runs.length - better - worse };
}

// ---- THE PAGE'S OWN TASK: THE PATROL ------------------------------------------------------------------------------------------------
export const N_HEADINGS = 10, LEG_SECONDS = 30;
export const PATROL_HEADINGS = Object.freeze(Array.from({ length: N_HEADINGS }, (_, i) => { const a = (i / N_HEADINGS) * Math.PI * 2; return Object.freeze([Math.cos(a), Math.sin(a), 0]); }));
/**
 * es-aircraft.html's patrol for ONE aircraft, headless: it holds heading 0, and every LEG_SECONDS the held heading steps to the next of ten (36 degrees about the vertical). Returns { mean, worstLeg, legs }: the mean
 * cosine to the held heading over the whole flight and the worst leg's mean. The page's own loop is replicated; brain/pilotAircraftPolicy-selfcheck.mjs holds the constants to the page's source.
 */
export function patrol(pilot, { legs = 3 } = {}) {
    const decide = pilot === "autopilot" ? (b, d) => AP.decide(b, d) : pilotFor(pilot === "hand" ? handWeights() : pilot === "zero" ? zeroWeights() : pilot);
    const aircraft = AC.createAircraft(), I = RB.boxInertia({ m: AIRCRAFT_MASS, hx: HX, hy: HY, hz: HZ }), legTicks = Math.round(LEG_SECONDS / DT);
    let body = RB.createBody({ mass: AIRCRAFT_MASS, I, pos: [0, 0, 0], vel: [CRUISE_SPEED, 0, 0], q: [1, 0, 0, 0] }), idx = 0, sum = 0; const leg = [];
    for (let t = 0; t < legs * legTicks; t++) {
        if (t > 0 && t % legTicks === 0) idx = (idx + 1) % N_HEADINGS;
        const d = decide(body, PATROL_HEADINGS[idx]); body = stepWithEngine(aircraft, body, d.controls, DT);
        sum += d.facingCos; const k = Math.floor(t / legTicks); leg[k] = (leg[k] || 0) + d.facingCos;
    }
    return { mean: sum / (legs * legTicks), worstLeg: Math.min(...leg.map((s) => s / legTicks)), legs };
}

// ---- TRAINING ---------------------------------------------------------------------------------------------------------------------
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** A child of `w` with 1..maxK weights moved by a gaussian of `sigma`. SPARSE ON PURPOSE (see brain/pilot6dofPolicy.mjs's train(): moving all of them accepted nothing). */
export function mutate(w, sigma, rng, maxK = 4) {
    const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
    return o;
}
/** (1+1)-ES from the hand weights (the PD controller) on TRAIN_SET. A child that scores exactly its parent replaces it; counted apart. Deterministic for a seed. */
export function train({ seed = 7, iters = 600, sigma = 0.3, maxK = 4, start = null, trainSet = TRAIN_SET, seconds = SECONDS, onIter = null } = {}) {
    const rng = mulberry(seed); let best = start ? Float32Array.from(start) : handWeights();
    let bestScore = evaluate(best, trainSet, { seconds }).score, improved = 0, neutral = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = mutate(best, sigma, rng, maxK), score = evaluate(cand, trainSet, { seconds }).score;
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % 50 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved, neutral });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved, neutral };
}
/** Put every weight that differs from the hand weights back whenever the TRAIN score does not fall, passes repeated to a fixed point (brain/pilot6dofPolicy.mjs's prune() has the measurement that motivates it). */
export function prune(w, { toward = null, trainSet = TRAIN_SET, seconds = SECONDS } = {}) {
    const base0 = toward ? Float32Array.from(toward) : handWeights(), out = Float32Array.from(w);
    const differs = () => { const idx = []; for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - base0[i]) > 1e-6) idx.push(i); return idx; };
    const moved = differs().length; let best = evaluate(out, trainSet, { seconds }).score, passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const i of differs()) {
            const keep = out[i]; out[i] = base0[i];
            const s = evaluate(out, trainSet, { seconds }).score;
            if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep;
        }
    } while (reverted > 0);
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}
