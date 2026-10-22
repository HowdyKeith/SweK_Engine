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
import * as SC from "./shipCollision6dof.mjs";
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
const finiteBody = (b) => b.pos.every(Number.isFinite) && b.vel.every(Number.isFinite) && b.q.every(Number.isFinite) && b.w.every(Number.isFinite);
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
// es-box3d-6dof.html's own ship (the same hull, mass, engine mount, weapon, hit points and damage), one on one, headless. Ship-ship collisions are resolved ONLY when asked for (`collisions: true`, v4848: brain/shipCollision6dof.mjs, the page's own
// function moved out, ram damage to both ships). Off by default because every number pinned before v4848 -- the shipped pilots' scores, their audits, the fingerprints -- was measured with them off, and stays true of the
// duel it was measured on; the league trainer turns them on. A duel with them off asks who steers and shoots better; with them on it also asks who can be near a ship and not hit it.
export const HALF = [1.6, 0.7, 0.7], ENGINE_MOUNT = [-1.4, 0, 0], SHIP_MASS = 8, HP_MAX = 100, SHOT_DAMAGE = 18, SPAWN_X = 42;
export const PAGE_AUTOPILOT = { thrustForce: 16, standoff: 50 };
const makeRng = (seed) => { let s = (seed >>> 0) || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };

/**
 * `a` and `b` are each "autopilot" (autopilot6dof.decide, with the page's own thrust and standoff), "hand", "zero", or a weight vector. Returns { hits, shotsFired, hitsTaken, aHp, bHp, aDead, bDead,
 * ticks, seed, fingerprint } from A's side, plus (v4848) rams (impacts: ticks a contact began), ramTicks (ticks in contact), ramHp (hit points EACH ship lost to rams), minRange (the closest the two centres came, metres; the hulls touch under about 3.2), aLost / bLost (a ship whose state went non-finite from its own spin: destroyed on the spot). Deterministic for a seed.
 * `scenario` "standoff" (the default, every number before v4848) starts the ships 84 m apart at rest; "joust" (v4848) starts them 14-40 m apart, each already closing on the other at 3-12 m/s with a lateral offset of up to 2 m / 3 m,
 * which is the only start in which touching is possible at all (measured: in standoff duels the centres never came nearer than 55 m and a fight lasts 1.6-3.9 s; the hulls touch under 3.2 m).
 * `collisions` (default off, see the header) resolves ship-ship contact; `ramPenalty` is a score cost per hit point lost to rams, charged to both sides (0 = the ram is only as costly as the hit points it takes).
 */
export function duel(a = "autopilot", b = "autopilot", { seed = 1, seconds = 30, collisions = false, ramPenalty = 0, scenario = "standoff" } = {}) {
    const pilotOf = (x) => x === "autopilot" ? (body, tgt, o) => AP.decide(body, tgt, o) : pilotFor(x === "hand" ? handWeights() : x === "zero" ? zeroWeights() : x);
    const pa = pilotOf(a), pb = pilotOf(b), rng = makeRng(seed), I = RB.boxInertia({ m: SHIP_MASS, hx: HALF[0], hy: HALF[1], hz: HALF[2] });
    const joust = scenario === "joust", gap = joust ? 14 + rng() * 26 : 2 * SPAWN_X, closing = joust ? 3 + rng() * 9 : 0, spreadY = joust ? 4 : 4, spreadZ = joust ? 6 : 18;   // the joust draws first, so a standoff's draws are the ones they always were
    const mk = (id, team, x, q, vx) => ({ id, team, hp: HP_MAX, cool: 0, dead: false, body: RB.createBody({ mass: SHIP_MASS, I, pos: [x, (rng() - 0.5) * spreadY, (rng() - 0.5) * spreadZ], q, vel: [vx, 0, 0], w: [0, 0, 0] }) });
    const A = mk("A#0", "A", -gap / 2, [1, 0, 0, 0], closing), B = mk("B#0", "B", gap / 2, [0, 0, 1, 0], -closing), dt = 1 / 30, steps = Math.round(seconds / dt);
    let shots = [], h = 0x811c9dc5, t = 0, bShots = 0, rams = 0, ramTicks = 0, ramHp = 0, inContact = false, minRange = Infinity; const tally = { hits: 0, shotsFired: 0, hitsTaken: 0 };
    const landed = [], taken = [];   // the tick of each hit A landed and each hit A took: the dense signal a mutual kill hides (see REWARD.tempo)
    for (; t < steps && !A.dead && !B.dead; t++) {
        const nowMs = t * dt * 1000;
        for (const [s, foe, p] of [[A, B, pa], [B, A, pb]]) {
            const d = p(s.body, { pos: foe.body.pos, vel: foe.body.vel }, { weaponSpeed: RBW.WEAPON.speed, ...PAGE_AUTOPILOT });
            const acc = RB.createAccumulator(); RB.applyForceAtPoint(acc, [d.thrust, 0, 0], ENGINE_MOUNT); acc.torque = d.torqueBody;
            const before = s.body; s.body = RB.step(s.body, acc, dt);
            // *** A SHIP THAT SPINS ITSELF TO NON-FINITE STATE IS DESTROYED, NOT SIMULATED ON. *** A pilot that holds a torque for ~800 ticks drives its angular velocity to 1e304 -- the integrator's gyroscopic term is unstable at
            // extreme spin -- and then to NaN. Before v4848 that was invisible: a NaN ship cannot be hit, fires nothing, and the duel ran to the time limit as a draw, scored by what the OTHER ship did. With collisions on,
            // the contact test reads NaN as a hit with no normal and the duel threw (it killed two training runs, at iteration 376 of search 0). The ship is put back where it last was, marked dead and marked `lost`.
            if (!finiteBody(s.body)) { s.body = before; s.dead = true; s.lost = true; continue; }
            if (d.firing && nowMs >= s.cool) { s.cool = nowMs + RBW.WEAPON.cooldownMs; shots.push(RBW.fireProjectile(s.body, { ownerId: s.id, team: s.team })); if (s === A) tally.shotsFired++; else bShots++; }
        }
        minRange = Math.min(minRange, Math.hypot(A.body.pos[0] - B.body.pos[0], A.body.pos[1] - B.body.pos[1], A.body.pos[2] - B.body.pos[2]));
        if (collisions) {   // the page's order: both ships move, THEN contact is resolved, THEN shots; death is marked after the tick's shots
            const contacts = SC.resolveShipCollisions([A, B], HALF), touching = contacts.length > 0;
            if (touching) { ramTicks++; if (!inContact) rams++; for (const c of contacts) ramHp += c.dmg; }
            inContact = touching;
        }
        const targets = [A, B].filter((s) => !s.dead).map((s) => ({ id: s.id, team: s.team, body: s.body, half: HALF }));
        const { alive, events } = RBW.stepShots(shots, targets, dt); shots = alive;
        for (const ev of events) { const v = ev.targetId === "A#0" ? A : B; v.hp -= SHOT_DAMAGE; if (v === B) { tally.hits++; landed.push(t); } else { tally.hitsTaken++; taken.push(t); } if (v.hp <= 0) v.dead = true; }
        for (const s of [A, B]) if (s.hp <= 0) s.dead = true;   // a ram can be what takes the last hit points
        for (const s of [A, B]) for (const c of [...s.body.pos, ...s.body.q]) h = foldHash(h, Math.round(c * 1000) & 0xffffffff);
    }
    const win = B.dead && !A.dead, paired = Math.min(landed.length, taken.length);
    // tempo: how many seconds sooner A's first `paired` hits landed than B's did (positive = A is ahead in the exchange), over the hits both sides made
    let tempo = 0; for (let i = 0; i < paired; i++) tempo += (taken[i] - landed[i]) * dt; if (paired) tempo /= paired;
    const score = tally.hits * REWARD.hit - tally.shotsFired * REWARD.waste - tally.hitsTaken * SHOT_DAMAGE * REWARD.damageTaken + (B.dead ? REWARD.kill : 0) + (win ? REWARD.win : 0) + tempo * REWARD.tempo - ramHp * ramPenalty;
    // v4846 -- THE SAME FIGHT FROM B'S SIDE: B's hits are A's hits taken, A's are B's, a win is A dead and B not, and the tempo reads the other way round. Added so a pilot can be scored on either side of one duel
    // without a second, separately-maintained reward (the gate holds scoreB to REWARD applied to this tally).
    const winB = A.dead && !B.dead, scoreB = tally.hitsTaken * REWARD.hit - bShots * REWARD.waste - tally.hits * SHOT_DAMAGE * REWARD.damageTaken + (A.dead ? REWARD.kill : 0) + (winB ? REWARD.win : 0) - tempo * REWARD.tempo - ramHp * ramPenalty;
    return { ...tally, aHp: A.hp, bHp: B.hp, aDead: A.dead, bDead: B.dead, aLost: !!A.lost, bLost: !!B.lost, win, winB, bShotsFired: bShots, scoreB, tempo, rams, ramTicks, ramHp, minRange, score, ticks: t, seed, fingerprint: (h >>> 0).toString(16).padStart(8, "0") };
}

// ---- TRAINING (v4832) -----------------------------------------------------------------------------------------------------------
// brain/pilotPolicy.mjs's recipe for this body: a (1+1)-ES on the duel against the PD autopilot, started from the HAND weights (never from zero -- that file's header measures the "never engage" trap a
// zero start falls into), judged on seeds it did not train on. A duel here is ~7 ms, so a few thousand are seconds, not hours.
//
// THE REWARD differs from pilotPolicy's in one term. Against the autopilot, a head-on joust between identical ships is a mutual kill on most seeds (the hand pilot IS the autopilot, so it is the same fight
// to the bit): both ships reach six hits in the same tick. A kill that costs your own ship is not a win, and a score that cannot tell the two apart gives the search nothing to climb, so `win` (the
// opponent dead and you not) is worth REWARD.win on top of the kill. It is NOT a death penalty -- that is the term pilotPolicy leaves out on purpose.
export const REWARD = Object.freeze({ hit: 1, waste: 0.02, damageTaken: 0.01, kill: 3, win: 2, tempo: 1 });
export const TRAIN_SEEDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), HELD_OUT_SEEDS = Object.freeze([21, 22, 23, 24, 25, 26, 27, 28]), AUDIT_SEEDS = Object.freeze([41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
// v4846 -- THE LEAGUE'S THREE SEED SETS (tools/ship/train6dofLeague.mjs). A league search is judged on the pilot it starts from, so the seeds it trains on, picks a champion on and is finally graded on must be ones that pilot's
// own verdict (AUDIT_SEEDS, read once at v4837) and this round's exploration never read. 48 to train on (the first league probe with twelve improved its train score and made its held-out result WORSE: it had learned
// the twelve), 24 to choose a champion on, 40 to grade it on once. The 40 are the second set: the first, 101-120, was read once by a probe that was never going to ship, which spends it.
export const LEAGUE_TRAIN_SEEDS = Object.freeze(Array.from({ length: 48 }, (_, i) => 201 + i));
export const LEAGUE_HELD_OUT_SEEDS = Object.freeze(Array.from({ length: 24 }, (_, i) => 301 + i));
export const LEAGUE_AUDIT_SEEDS = Object.freeze(Array.from({ length: 40 }, (_, i) => 401 + i));
// v4848 -- THE CLOSE-QUARTERS SEED SETS (collisions on, standoff AND joust starts). Fresh ones again: 401-440 were the league's audit, 501-540 the ram baseline's measurement (tools/ship/ramBaseline6dof.mjs).
export const CLOSE_TRAIN_SEEDS = Object.freeze(Array.from({ length: 48 }, (_, i) => 601 + i));
export const CLOSE_HELD_OUT_SEEDS = Object.freeze(Array.from({ length: 24 }, (_, i) => 701 + i));
export const CLOSE_AUDIT_SEEDS = Object.freeze(Array.from({ length: 40 }, (_, i) => 801 + i));
export const BASELINE_SEEDS = Object.freeze(Array.from({ length: 40 }, (_, i) => 501 + i));

/**
 * The pilot `w` against `opts.opponent` (default: the PD autopilot) over `seeds`: { score (the mean), wins, losses, draws, hits, hitsTaken, rams, ramHp, runs }. A draw is both ships dead, or neither.
 * v4848: `collisions`, `ramPenalty` and `scenarios` (default ["standoff"]: every number before v4848) are handed to duel(); with more than one scenario each seed is played in each.
 */
export function evaluate(w, seeds, { opponent = "autopilot", seconds = 30, collisions = false, ramPenalty = 0, scenarios = ["standoff"] } = {}) {
    if (Array.isArray(opponent)) return evaluateLeague(w, seeds, opponent, seconds, { collisions, ramPenalty, scenarios });
    const runs = []; for (const scenario of scenarios) for (const seed of seeds) runs.push(duel(w, opponent, { seed, seconds, collisions, ramPenalty, scenario }));
    return tally(runs);
}
const tally = (runs) => {
    const wins = runs.filter((r) => r.win).length, losses = runs.filter((r) => r.aDead && !r.bDead).length;
    return { score: runs.reduce((a, r) => a + r.score, 0) / runs.length, wins, losses, draws: runs.length - wins - losses, hits: runs.reduce((a, r) => a + r.hits, 0), hitsTaken: runs.reduce((a, r) => a + r.hitsTaken, 0),
        rams: runs.reduce((a, r) => a + (r.rams || 0), 0), ramHp: runs.reduce((a, r) => a + (r.ramHp || 0), 0), runs };
};
/** A tally over the runs of an evaluateLeague() result that satisfy `pred` (a scenario, a side, an opponent): { score, wins, losses, draws, hits, hitsTaken, rams, ramHp, runs }. */
export const subset = (res, pred) => tally(res.runs.filter(pred));

/**
 * THE LEAGUE (v4846): `opponent` an ARRAY of opponents, each played on every seed FROM BOTH SIDES. The duel is not symmetric -- side A acts first in a tick, and a pilot against a copy of itself wins 8, loses 2 and draws 10 of 20
 * from side A (measured at v4846 on the audit seeds) -- so a pilot judged from one side is judged partly on which side it was given, and a pilot trained from one side can learn the side. Each run is written from THE PILOT'S
 * point of view whichever side it flew, with the same fields a single-opponent run has: `aDead` is the pilot dead, `bDead` the opponent, `win` the pilot's win; plus `side` ("A" or "B"), `opp` (the opponent's index), `seed`
 * and `scenario`. score, wins, losses, draws, hits, hitsTaken, rams and ramHp are over all of them, so train() and prune() run on a league unchanged.
 */
function evaluateLeague(w, seeds, opponents, seconds, { collisions = false, ramPenalty = 0, scenarios = ["standoff"] } = {}) {
    const runs = [];
    opponents.forEach((opp, oi) => scenarios.forEach((scenario) => seeds.forEach((seed) => {
        const o = { seed, seconds, collisions, ramPenalty, scenario }, a = duel(w, opp, o), b = duel(opp, w, o);
        runs.push({ side: "A", opp: oi, seed, scenario, score: a.score, win: a.win, aDead: a.aDead, bDead: a.bDead, hits: a.hits, hitsTaken: a.hitsTaken, shotsFired: a.shotsFired, tempo: a.tempo, rams: a.rams, ramHp: a.ramHp, minRange: a.minRange });
        runs.push({ side: "B", opp: oi, seed, scenario, score: b.scoreB, win: b.winB, aDead: b.bDead, bDead: b.aDead, hits: b.hitsTaken, hitsTaken: b.hits, shotsFired: b.bShotsFired, tempo: -b.tempo, rams: b.rams, ramHp: b.ramHp, minRange: b.minRange });
    })));
    return tally(runs);
}

/** One line for an evaluate() result: "9.93 (W5/L0/D3, hits 48, taken 32)". The shipped file's `by` quotes it, and the gate recomputes it. */
export const describeEval = (r) => `${r.score.toFixed(2)} (W${r.wins}/L${r.losses}/D${r.draws}, hits ${r.hits}, taken ${r.hitsTaken})`;

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** A child of `w` with 1..maxK weights moved by a gaussian of `sigma`. SPARSE ON PURPOSE: see train(). */
export function mutate(w, sigma, rng, maxK = 4) {
    const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
    return o;
}

/**
 * (1+1)-ES from the hand weights on the duel against the PD autopilot, judged on the mean score over `trainSeeds`. Deterministic for a seed. Returns { weights, trainScore, history, iters, improved, neutral }.
 *
 * MEASURED, NOT GUESSED: perturbing ALL 930 weights (perturb(), pilotPolicy's mutation) accepted nothing in 100 iterations at sigma 0.05 -- the hand weights are ~30 nonzero entries in a sea of zeros and a
 * dense perturbation pushes noise through the whole recurrent core, so almost every child is worse. Moving one to four weights at a time found 7 improvements in 300 iterations from the same start and the same reward. A child
 * that scores EXACTLY what the parent did replaces it (a plateau is most of this landscape: a mutual kill scores the same however the shots were timed, until tempo is in the score), and is counted apart
 * from a real improvement.
 */
export function train({ seed = 7, iters = 600, sigma = 0.3, start = null, seconds = 30, trainSeeds = TRAIN_SEEDS, opponent = "autopilot", maxK = 4, onIter = null, collisions = false, ramPenalty = 0, scenarios = ["standoff"] } = {}) {
    const rng = mulberry(seed), ev = { seconds, opponent, collisions, ramPenalty, scenarios }; let best = start ? Float32Array.from(start) : handWeights();
    let bestScore = evaluate(best, trainSeeds, ev).score, improved = 0, neutral = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = mutate(best, sigma, rng, maxK), score = evaluate(cand, trainSeeds, ev).score;
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; }
        else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % 50 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved, neutral });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved, neutral };
}

/**
 * Put every weight that differs from `toward` (the hand weights) back to it, one at a time, whenever doing so does not lower the score on `trainSeeds` -- and go round again until a whole pass reverts nothing,
 * because one weight's reversal can be what lets another go back (the first pass over the shipped pilot's search left 97 of 696 moved weights; a second pass took it to 48). Returns { weights, kept, moved,
 * passes, trainScore }.
 *
 * WHY: train() lets a child that scores EXACTLY what its parent did replace it, so most of the weights it ends with moved by drift and carry nothing -- measured: 696 of 930 weights differed from the hand weights
 * and 599 of those went back with no change to the train, held-out or audit result. What is left is the pilot's difference from the PD autopilot, which is a statement worth being able to make and a smaller thing
 * to be wrong about. Deterministic: weights are tried in index order, every pass.
 */
export function prune(w, { toward = null, trainSeeds = TRAIN_SEEDS, opponent = "autopilot", seconds = 30, collisions = false, ramPenalty = 0, scenarios = ["standoff"] } = {}) {
    const ev = { seconds, opponent, collisions, ramPenalty, scenarios }, base0 = toward ? Float32Array.from(toward) : handWeights(), out = Float32Array.from(w);
    const differs = () => { const idx = []; for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - base0[i]) > 1e-6) idx.push(i); return idx; };
    const moved = differs().length;
    let best = evaluate(out, trainSeeds, ev).score, passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const i of differs()) {
            const keep = out[i]; out[i] = base0[i];
            const s = evaluate(out, trainSeeds, ev).score;
            if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep;
        }
    } while (reverted > 0);
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}
