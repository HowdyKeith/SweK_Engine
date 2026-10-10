// WebGLEngine/brain/pilot6dofPolicy.mjs -- v4829
//
// A LEARNED PILOT FOR THE NEWTONIAN SPACE BATTLE: the same contract brain/autopilot6dof.mjs's decide() has -- (body, target, opts) -> { torqueBody, thrust, firing, range, facingCos } -- from a network.
// es-box3d-6dof.html flew its ships on that PD attitude controller and nothing else, so there was no second pilot to choose; this is the second, and brain/pilotRoster.mjs (which resolves a
// choice of weights to a pilot per ship, for the plane page) resolves it for this page unchanged, because the policy module is handed in and this one has the same constructors:
// zeroWeights(), handWeights(), perturb(), pilotFor(), WEIGHT_COUNT.
//
// THE NETWORK is pilotPolicy.mjs's, for a different body: twelve features through an encoder into the 34 neurons of the real male-cns Giant Fiber Circuit (313 real synapses, three weight-tied
// recurrent steps, every other recurrent weight structurally zero), out to five numbers. It is restated here and not imported from brain/pilotPolicy.mjs because that file's constants are its
// contract (seven features, four outputs) -- the same arrangement pilotPolicy has with gunnerPolicy, whose header says why.
//
//   FEATURES   bias; the pointing error as a rotation vector in the BODY frame, divided by pi (three); the body's angular velocity over 2 rad/s, clamped to +-3 (three); the cosine of the angle to
//              the aim direction; range over the weapon's range; the closing speed over 20 m/s (what the PD controller does not have, and the reason a ship can learn not to ram); and the two GATES
//              autopilot6dof.decide() applies to thrust and to fire, as 0/1 features (the way brain/pilotPolicy.mjs folded stepAI3d's range test into "aligned": a gate routed through one channel).
//   OUTPUTS    torque about each body axis (times TORQUE_GAIN times that axis' moment of inertia), thrust (on when positive), fire (on when positive).
//
// *** THE HAND WEIGHTS ARE THE PD AUTOPILOT, WRITTEN THROUGH THE NETWORK. *** torque_i / I_i = kp * e_i - kd * w_i, as a pair of relu channels per axis (z and -z) so the decoder reads z linearly, then tanh
// and TORQUE_GAIN: the same controller to within the tanh's saturation (7% under at the largest possible error, 180 degrees; nothing at small ones). Thrust and fire are the gates. The recurrent
// core is left at zero, which makes it an exact identity (brain/pilotPolicy.mjs's expandRecurrent). The zero pilot never turns, thrusts or fires (tanh 0 is not > 0).
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
import * as RBW from "../physics/mechanics/rigidBody6dofWeapon.mjs";
import * as AP from "./autopilot6dof.mjs";
import { leadMoving } from "../physics/ballistics.mjs";
import { foldHash } from "../physics/raceCar.mjs";

export const FEATURES = 12, HIDDEN = Topo.NEURON_ORDER.length, OUTPUTS = 5;
export const REC_STEPS = 3, REC_EDGES = Topo.EDGES.length;
export const FEATURE_NAMES = Object.freeze(["bias", "errX", "errY", "errZ", "wX", "wY", "wZ", "facingCos", "rangeFrac", "closing", "thrustOk", "aligned"]);
export const OUTPUT_NAMES = Object.freeze(["torqueX", "torqueY", "torqueZ", "thrust", "firing"]);
export const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS;   // 408 + 34 + 313 + 170 + 5 = 930
export const TORQUE_GAIN = 40;   // rad/s^2 at full output; the PD controller's largest demand is kp * pi = 18.8
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

/** features -> five numbers in [-1, 1]: torque about x, y, z, thrust, fire. */
export function forward(w, x) {
    const layers = layersOfMemo(w);
    let h = Float32Array.from(x);
    for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
    const y = mlpLayerCpu(layers[layers.length - 1], h, 1);
    return [Math.tanh(y[0]), Math.tanh(y[1]), Math.tanh(y[2]), Math.tanh(y[3]), Math.tanh(y[4])];
}

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit3 = (v, fb) => { const n = Math.hypot(v[0], v[1], v[2]); return n > 1e-9 ? v.map((c) => c / n) : fb; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * The geometry autopilot6dof.decide() computes, restated: the aim direction (led by `opts.weaponSpeed` when given), the pointing error in the body frame, the cosine to the aim, the range,
 * and the two gates. brain/pilot6dofPolicy-selfcheck.mjs holds every quantity here to decide()'s own on the same states, so the restatement cannot drift unseen.
 */
export function geometry(body, target, opts = {}) {
    const spec = { ...AP.AUTOPILOT, ...opts }, targetVel = target.vel || [0, 0, 0];
    const toTarget = [target.pos[0] - body.pos[0], target.pos[1] - body.pos[1], target.pos[2] - body.pos[2]], range = Math.hypot(toTarget[0], toTarget[1], toTarget[2]);
    const currentForward = RB.rotateByQuat(body.q, AP.FORWARD_BODY);
    let desired;
    if (spec.weaponSpeed) { const lead = leadMoving(body.pos, body.vel, target.pos, targetVel, spec.weaponSpeed); desired = lead ? lead.dir : unit3(toTarget, currentForward); }
    else desired = unit3(toTarget, currentForward);
    const eBody = RB.worldToBody(body.q, AP.pointingError(currentForward, desired));
    const facingCos = dot3(currentForward, desired);
    const vrel = [targetVel[0] - body.vel[0], targetVel[1] - body.vel[1], targetVel[2] - body.vel[2]], closing = -dot3(vrel, toTarget) / (range || 1);   // positive when the gap is shrinking
    return { spec, range, eBody, facingCos, closing, thrustOk: facingCos > Math.cos(spec.thrustAngle) && range > spec.standoff, aligned: facingCos > Math.cos(spec.fireAngle) && range < spec.fireRange };
}

const featuresFrom = (g, body) => [1, g.eBody[0] / Math.PI, g.eBody[1] / Math.PI, g.eBody[2] / Math.PI, clamp(body.w[0] / 2, -3, 3), clamp(body.w[1] / 2, -3, 3), clamp(body.w[2] / 2, -3, 3),
    g.facingCos, clamp(g.range / g.spec.fireRange, 0, 3), clamp(g.closing / 20, -3, 3), g.thrustOk ? 1 : 0, g.aligned ? 1 : 0];

/** The twelve features, in FEATURE_NAMES order. */
export const features = (body, target, opts = {}) => featuresFrom(geometry(body, target, opts), body);

/** A pilot (body, target, opts) -> { torqueBody, thrust, firing, range, facingCos } from weights: an exact drop-in for autopilot6dof.decide()'s own contract. */
export function pilotFor(w) {
    return (body, target, opts = {}) => {
        const g = geometry(body, target, opts), y = forward(w, featuresFrom(g, body));
        return { torqueBody: [0, 1, 2].map((i) => body.I[i] * TORQUE_GAIN * y[i]), thrust: y[3] > 0 ? g.spec.thrustForce : 0, firing: y[4] > 0, range: g.range, facingCos: g.facingCos };
    };
}

/** The PD autopilot in the network's own weights (see the header). kp and kd are autopilot6dof's: kd defaults to 2 sqrt(kp). */
export function handWeights({ kp = AP.AUTOPILOT.kp, kd = null } = {}) {
    const k2 = kd == null ? 2 * Math.sqrt(kp) : kd, w = zeroWeights(), W1 = (h, f, v) => { w[h * FEATURES + f] = v; };
    const outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, W2 = (o, h, v) => { w[outBase + o * HIDDEN + h] = v; }, b2 = (o, v) => { w[outBase + HIDDEN * OUTPUTS + o] = v; };
    const F = { err: 1, w: 4, thrustOk: 10, aligned: 11 };
    for (let i = 0; i < 3; i++) {
        const a = (kp * Math.PI) / TORQUE_GAIN, b = (k2 * 2) / TORQUE_GAIN;   // z = a * (e / pi) - b * (w / 2), in units of TORQUE_GAIN
        W1(2 * i, F.err + i, a); W1(2 * i, F.w + i, -b); W1(2 * i + 1, F.err + i, -a); W1(2 * i + 1, F.w + i, b);
        W2(i, 2 * i, 1); W2(i, 2 * i + 1, -1);
    }
    W1(6, F.thrustOk, 1); W2(3, 6, 4); b2(3, -2);   // thrust = tanh(4 thrustOk - 2): positive exactly when the gate is open
    W1(7, F.aligned, 1); W2(4, 7, 4); b2(4, -2);    // fire likewise
    return w;
}

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

// ---- THE DUEL -----------------------------------------------------------------------------------------------------------------
// es-box3d-6dof.html's own ship (the same hull, mass, engine mount, weapon, hit points and damage), one on one, headless. Ship-ship collisions are NOT resolved here: a duel asks who steers and shoots
// better, and the page's pile-up on a head-on joust is its own finding (PAGE_AUTOPILOT's note), not a thing this is graded on.
export const HALF = [1.6, 0.7, 0.7], ENGINE_MOUNT = [-1.4, 0, 0], SHIP_MASS = 8, HP_MAX = 100, SHOT_DAMAGE = 18, SPAWN_X = 42;
export const PAGE_AUTOPILOT = { thrustForce: 16, standoff: 50 };
const makeRng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };

/**
 * `a` and `b` are each "autopilot" (autopilot6dof.decide, with the page's own thrust and standoff), "hand", "zero", or a weight vector. Returns { hits, shotsFired, hitsTaken, aHp, bHp, aDead, bDead,
 * ticks, seed, fingerprint } from A's side. Deterministic for a seed.
 */
export function duel(a = "autopilot", b = "autopilot", { seed = 1, seconds = 30 } = {}) {
    const pilotOf = (x) => x === "autopilot" ? (body, tgt, o) => AP.decide(body, tgt, o) : pilotFor(x === "hand" ? handWeights() : x === "zero" ? zeroWeights() : x);
    const pa = pilotOf(a), pb = pilotOf(b), rng = makeRng(seed), I = RB.boxInertia({ m: SHIP_MASS, hx: HALF[0], hy: HALF[1], hz: HALF[2] });
    const mk = (id, team, x, q) => ({ id, team, hp: HP_MAX, cool: 0, dead: false, body: RB.createBody({ mass: SHIP_MASS, I, pos: [x, (rng() - 0.5) * 4, (rng() - 0.5) * 18], q, vel: [0, 0, 0], w: [0, 0, 0] }) });
    const A = mk("A#0", "A", -SPAWN_X, [1, 0, 0, 0]), B = mk("B#0", "B", SPAWN_X, [0, 0, 1, 0]), dt = 1 / 30, steps = Math.round(seconds / dt);
    let shots = [], h = 0x811c9dc5, t = 0; const tally = { hits: 0, shotsFired: 0, hitsTaken: 0 };
    for (; t < steps && !A.dead && !B.dead; t++) {
        const nowMs = t * dt * 1000;
        for (const [s, foe, p] of [[A, B, pa], [B, A, pb]]) {
            const d = p(s.body, { pos: foe.body.pos, vel: foe.body.vel }, { weaponSpeed: RBW.WEAPON.speed, ...PAGE_AUTOPILOT });
            const acc = RB.createAccumulator(); RB.applyForceAtPoint(acc, [d.thrust, 0, 0], ENGINE_MOUNT); acc.torque = d.torqueBody;
            s.body = RB.step(s.body, acc, dt);
            if (d.firing && nowMs >= s.cool) { s.cool = nowMs + RBW.WEAPON.cooldownMs; shots.push(RBW.fireProjectile(s.body, { ownerId: s.id, team: s.team })); if (s === A) tally.shotsFired++; }
        }
        const targets = [A, B].filter((s) => !s.dead).map((s) => ({ id: s.id, team: s.team, body: s.body, half: HALF }));
        const { alive, events } = RBW.stepShots(shots, targets, dt); shots = alive;
        for (const ev of events) { const v = ev.targetId === "A#0" ? A : B; v.hp -= SHOT_DAMAGE; if (v === B) tally.hits++; else tally.hitsTaken++; if (v.hp <= 0) v.dead = true; }
        for (const s of [A, B]) for (const c of [...s.body.pos, ...s.body.q]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    return { ...tally, aHp: A.hp, bHp: B.hp, aDead: A.dead, bDead: B.dead, ticks: t, seed, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
}
