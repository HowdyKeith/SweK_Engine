// WebGLEngine/brain/seatGunnerPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A LEARNED GUNNER FOR A GUN SEAT (physics/mechanics/gunSeats.mjs): a network in the seat where the hand gunner sat, with the same contract -- decide(seat, state, body, targets, t) -> { yaw, pitch, fire, target } -- so that the
// arena (brain/spaceArena.mjs) neither knows nor cares which of the two is in a seat. The race cars' turrets have had one for a while (brain/gunnerPolicy.mjs); this is the seat's, for the bomber's five and the battleship's thirteen.
//
// WHAT THE NETWORK DOES AND WHAT IT DOES NOT, SAID PLAINLY. The hand gunner is two things: a SIGHT (what the gunner knows of a target -- its position `delay` seconds ago, measured with an error, fitted to a line, led by the aim solution -- and
// which target it takes: the one the round gets to soonest of those the seat can reach) and a HAND (the aim error, the decision to fire, the burst). The network is the HAND. The sight stays the rule's -- it is handed in (`makeSight(seat, k)`:
// a gunSeats.handGunner or anything with its contract) and its answer is what the network is shown: the yaw and pitch the sight says to point at, whether the sight's own rule would fire, and the target. The network answers with a CORRECTION to
// that aim (up to AIM_GAIN radians each way on each axis) and the TRIGGER. So what it can learn is a better trigger than the rule's (when not to waste rounds on a target it will miss, when to keep firing) and a better aim than the sight's
// (a lead for a target that turns); what it cannot learn is to see better than the sight sees or to pick a target the sight did not offer, and a network that did better than the rule would be doing it by the hand alone. The target is
// the sight's; the range and the closing speed are read off the target as the arena shows it to the gunner (a rangefinder), not off the sight's noisy track.
//
//   FEATURES (12)  bias; the yaw the sight wants over the half-width of the seat's yaw arc, minus where the seat points (the error to slew, in arcs); the same for pitch; whether the sight's rule would fire; the range over the sight's reach (maxRange, 600 if not
//                  said); the time of flight over the gun's life (range / muzzle speed / life); the closing speed over 200 units/s, clamped to +-3; where the seat points in its arc on each axis (-1..+1 from the arc's centre); the rounds left
//                  over the magazine; whether the network fired the tick before; and whether this is a HEAVY gun (a round of more than 30 damage: the main battery's) -- one network serves both kinds of seat.
//   OUTPUTS (3)    a yaw correction and a pitch correction (times AIM_GAIN radians) and the trigger (on when positive).
//
// THE NETWORK is brain/gunnerPolicy.mjs's, for a different seat: the twelve features through an encoder into the 34 neurons of the real male-cns Giant Fiber Circuit (313 real synapses, three weight-tied recurrent steps, every other recurrent weight
// structurally zero), out to three numbers. (Restated here, as pilot6dofPolicy restates it, because each file's constants are its contract.)
//
// *** THE HAND WEIGHTS ARE THE HAND GUNNER, WRITTEN THROUGH THE NETWORK: no correction, and the trigger is the sight's own rule (the 'aimed' feature through one channel, +4 and -2 into a tanh: on exactly when the rule's flag is). *** A seat given them
// does what a seat given the hand gunner does, to the bit (the gate flies both in the same fight and compares the states). The recurrent core is zero, which makes it an exact identity, as in gunnerPolicy and pilot6dofPolicy: the connectome is
// there for a TRAINED gunner to use. The zero gunner never fires and never corrects (tanh 0 is not > 0).
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as Topo from "./gfcTopology.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";

export const FEATURES = 12, HIDDEN = Topo.NEURON_ORDER.length, OUTPUTS = 3;
export const REC_STEPS = 3, REC_EDGES = Topo.EDGES.length;
export const FEATURE_NAMES = Object.freeze(["bias", "yawErr", "pitchErr", "aimed", "rangeFrac", "tofFrac", "closing", "yawFrac", "pitchFrac", "ammoFrac", "lastFire", "heavy"]);
export const OUTPUT_NAMES = Object.freeze(["yawFix", "pitchFix", "fire"]);
export const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS;   // 408 + 34 + 313 + 102 + 3 = 860
export const AIM_GAIN = 0.05;      // radians of correction at full output
export const HEAVY_DAMAGE = 30;    // a round that does more than this is a heavy gun's
export const REACH = 600;          // the sight's reach, when the caller does not say (spaceArena's default gunner's maxRange)
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
const ZERO_HIDDEN = new Float32Array(HIDDEN);

const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);

function expandRecurrent(Wrec) {
    const Wm = new Float32Array(HIDDEN * HIDDEN);
    for (let i = 0; i < HIDDEN; i++) Wm[i * HIDDEN + i] = 1;
    Topo.EDGES.forEach(([toIdx, fromIdx], k) => { Wm[toIdx * HIDDEN + fromIdx] += Wrec[k]; });
    return Wm;
}
const MEMO = new WeakMap(), REC_OFFSET = FEATURES * HIDDEN + HIDDEN;
function layersOfMemo(w) {
    const m = MEMO.get(w);
    if (m) { let k = 0; while (k < REC_EDGES && m.snap[k] === w[REC_OFFSET + k]) k++; if (k === REC_EDGES) return m.layers; }
    let o = 0;
    const W1 = w.subarray(o, o += FEATURES * HIDDEN), b1 = w.subarray(o, o += HIDDEN), Wrec = w.subarray(o, o += REC_EDGES), W2 = w.subarray(o, o += HIDDEN * OUTPUTS), b2 = w.subarray(o, o += OUTPUTS);
    const rec = { nIn: HIDDEN, nOut: HIDDEN, W: expandRecurrent(Wrec), b: ZERO_HIDDEN, act: "relu" };
    const layers = [{ nIn: FEATURES, nOut: HIDDEN, W: W1, b: b1, act: "relu" }, ...Array(REC_STEPS).fill(rec), { nIn: HIDDEN, nOut: OUTPUTS, W: W2, b: b2, act: "none" }];
    MEMO.set(w, { snap: Float32Array.from(w.subarray(REC_OFFSET, REC_OFFSET + REC_EDGES)), layers });
    return layers;
}
export const layersOf = (w) => layersOfMemo(w);

/** features -> three numbers in [-1, 1]: the yaw correction, the pitch correction, the trigger. */
export function forward(w, x) {
    const layers = layersOfMemo(w);
    let h = Float32Array.from(x);
    for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
    const y = mlpLayerCpu(layers[layers.length - 1], h, 1);
    return [Math.tanh(y[0]), Math.tanh(y[1]), Math.tanh(y[2])];
}

const halfSpan = (arc) => Math.max((arc[1] - arc[0]) / 2, 1e-6), centre = (arc) => (arc[0] + arc[1]) / 2;
/**
 * The twelve features for a seat that has a target. `rule` is the sight's answer ({ yaw, pitch, fire, target }), `tg` the target as the arena shows it ({ pos, vel }), `lastFire` whether the network fired the tick before, `reach` the sight's range.
 * `seat` is the gunSeats seat, `st` its state ({ yaw, pitch, gun: { ammo } }), `body` the craft's body.
 */
export function features(seat, st, body, rule, tg, lastFire = false, reach = REACH) {
    const m = GS.muzzleOfSeat(seat, st, body), rel = sub(tg.pos, m.pos), range = norm(rel), vrel = sub(tg.vel, m.vel), closing = range > 1e-9 ? -dot(rel, vrel) / range : 0, gun = seat.gun;
    return [1, fin((rule.yaw - st.yaw) / halfSpan(seat.arc.yaw)), fin((rule.pitch - st.pitch) / halfSpan(seat.arc.pitch)), rule.fire ? 1 : 0, clamp(range / reach, 0, 3), clamp(range / (gun.muzzleSpeed * gun.life), 0, 3), clamp(closing / 200, -3, 3),
        clamp((st.yaw - centre(seat.arc.yaw)) / halfSpan(seat.arc.yaw), -1, 1), clamp((st.pitch - centre(seat.arc.pitch)) / halfSpan(seat.arc.pitch), -1, 1), clamp(st.gun.ammo / gun.magazine, 0, 1), lastFire ? 1 : 0, gun.damage > HEAVY_DAMAGE ? 1 : 0];
}

/**
 * The gunner for ONE seat from weights `w` and a sight: decide(seat, st, body, targets, t) -> { yaw, pitch, fire, target } (the gunSeats contract). With no target the sight's own answer stands (the network is not asked); with one, the network's
 * correction is added to the sight's aim and its trigger replaces the sight's; the decider's `last` holds what the network was shown and said the last time it was asked (null if the tick had no target). `reach` is the sight's maxRange (REACH if not said); `forward` is the network to run (this module's by default; brain/seatGunnerMlp.mjs hands in its own).
 */
export function gunnerFor(w, sight, { reach = REACH, forward: fwd = forward } = {}) {
    let lastFire = false;
    function decide(seat, st, body, targets, t = 0) {
        const rule = sight(seat, st, body, targets, t);
        if (rule.target == null) { lastFire = false; decide.last = null; return rule; }
        const tg = targets.find((x) => x.id === rule.target); if (!tg) { lastFire = false; decide.last = null; return rule; }
        const x = features(seat, st, body, rule, tg, lastFire, reach), y = fwd(w, x), fire = y[2] > 0;
        lastFire = fire; decide.last = { x, y };
        return { yaw: rule.yaw + AIM_GAIN * y[0], pitch: rule.pitch + AIM_GAIN * y[1], fire, target: rule.target };
    }
    decide.last = null;   // what the network was last shown and answered ({ x: the twelve features, y: the three outputs }), or null when the tick had no target: for a page to draw
    return decide;
}

/** The factory spaceArena's `gunner(seat, k)` option wants, for weights `w`: each seat gets its own sight from `makeSight(seat, k)` and a network of its own (it remembers its own last trigger). */
export const gunnerFactory = (w, makeSight, opts = {}) => (seat, k) => gunnerFor(w, makeSight(seat, k), opts);

/** The hand gunner in the network's weights (see the header): no correction, the trigger the sight's own flag (+4 on `aimed`, -2 bias, through one channel). */
export function handWeights() {
    const w = zeroWeights(), outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, AIMED = FEATURE_NAMES.indexOf("aimed");
    w[0 * FEATURES + AIMED] = 1;                                // hidden unit 0 = relu(aimed)
    w[outBase + 2 * HIDDEN + 0] = 4;                            // fire = tanh(4 h0 - 2): positive exactly when aimed is 1
    w[outBase + HIDDEN * OUTPUTS + 2] = -2;
    return w;
}

/**
 * The weights wired into the hand path -- the ones a single change can reach the three outputs through (the hand weights' own unit 0, whose row of the encoder, bias and weights into the outputs and the output biases are these): 12 + 1 + 3 + 3 = 19 of the 860. A search that moves one to four weights
 * of 860 at random almost never moves one of these (the 841 others do nothing until a unit that carries them is switched on), so the trainer (tools/ship/trainSeatGunner.mjs) breeds half its children from these alone.
 */
export function liveIndices() {
    const outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, idx = [];
    for (let f = 0; f < FEATURES; f++) idx.push(0 * FEATURES + f);                       // unit 0's row of the encoder
    idx.push(FEATURES * HIDDEN + 0);                                                      // unit 0's bias
    for (let o = 0; o < OUTPUTS; o++) idx.push(outBase + o * HIDDEN + 0);                 // unit 0 into each output
    for (let o = 0; o < OUTPUTS; o++) idx.push(outBase + HIDDEN * OUTPUTS + o);           // the output biases
    return idx;
}

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export const rngFor = mulberry;
/** A child of `w` with 1..maxK weights moved by a gaussian of `sigma` (sparse on purpose, as pilot6dofPolicy's: the hand weights are a few non-zero entries in a sea of zeros). */
export function mutate(w, sigma, rng, maxK = 4) {
    const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
    return o;
}
/** Every weight moved by a gaussian of `sigma`. */
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

export function reportLines() {
    const w = handWeights(), nz = Array.from(w).filter((v) => v !== 0).length;
    return ["[seatGunnerPolicy] a learned gunner for a gun seat: the hand gunner's sight, and a fruit fly's escape-circuit network for the hand (a correction to the aim and the trigger)",
        `  ${FEATURES} features, ${HIDDEN} hidden neurons (the male-cns Giant Fiber Circuit, ${REC_EDGES} synapses), ${OUTPUTS} outputs: ${WEIGHT_COUNT} weights; the hand weights are the hand gunner through the network in ${nz} non-zero weights`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
