// WebGLEngine/brain/seatTurretGunner.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE RACE CAR'S TURRET GUNNER IN A GUN SEAT. brain/gunnerPolicy.mjs is the gunner of the race car's turret -- eleven features, the 34 neurons and 313 synapses of the fruit fly's Giant Fiber Circuit, five outputs, 896 weights -- and it WORKS the turret: it is shown how far the gun is from the aim and answers with
// the rates to turn it at and the trigger. The seat gunners this tree had (brain/seatGunnerPolicy.mjs, seatGunnerMlp.mjs, seatGunnerFish.mjs) do less: the hand gunner's sight says where to point and they add a small CORRECTION and decide the trigger. Keith asked whether the cars' training carries over to the 6DOF
// level; this is the seat it can carry over INTO: the same network, the same weight vector, the same policy id ("gunnerPolicy"), so a gunner trained on race-brain.html and exported is seated in a capital ship AS IT IS (battleshipDuel.sideFromBrains takes the file).
//
// WHAT THE NETWORK DOES AND WHAT IT DOES NOT, SAID PLAINLY. THE SIGHT IS STILL THE HAND GUNNER'S (it is handed in, as to the other seat gunners): what the gunner knows of a target -- late, noisy, fitted, led -- which target it takes, and its judgement that the gun is ON (the miss within the target's radius). That is
// the honesty of the arena (a gunner with the exact solution and no delay empties the sky) and no network is let past it. THE HAND IS ALL THE NETWORK'S: the sight's aim is not passed to the seat; the network is shown the ERROR between where the seat points and where the sight says to, and its yaw and pitch
// outputs are RATES -- a full output turns the seat at its own slew rate -- and its third output is the trigger. So a network that answers nothing leaves the gun where it is, and a bad one swings it away; nothing but the network lays the gun.
//
//   FEATURES (11, the car's, in the car's order)   bias; the yaw still to turn over pi; the pitch still to turn over pi/2; the range over half the sight's reach, at most 2 (the car: over 40 m, at most 2); the closing speed over CLOSING (200 units/s; the car: over 20 m/s); the speed ACROSS the line of sight over the
//                  same (a feature the correcting seat gunners never had); `reloading`, ALWAYS 0 (a seat's gun fires at a steady rate and has no reload); `reachable`, 1 whenever the sight offers a target (the sight only offers one in the seat's arc with an aim solution); `aligned`, the sight's own flag that the
//                  gun is on (the car's is both errors inside 0.03 rad; a ship's guns are judged by the miss at the target, which the sight already does); and the car's two facts about its oil slick, ALWAYS 0. The range and the two speeds are read off the target as the arena shows it (a rangefinder), as the other seat gunners read them.
//   OUTPUTS (5)    the yaw rate and the pitch rate (x the seat's slew rate; the seat is commanded to where that takes it in one tick, and gunSeats.stepSeat keeps it in its arc), the trigger (on when positive), and the car's `drop` and `ignite`, WHICH A SHIP DOES NOT HAVE AND ARE IGNORED.
//
// *** THE HAND'S AIM ERROR HAS TO BE PUT BACK, AND THIS WAS MEASURED BEFORE IT WAS WRITTEN. *** gunSeats.handGunner adds the gunner's aim error (`sigma`: 0.03 rad for a regular gunner) to the aim it REPORTS, every tick. A correcting network passes that aim on and carries the error; a network that lays the gun by rates from
// the error it is shown AVERAGES it away -- a proportional turn is a low-pass filter. The car's untrained hand weights, seated without this, led the hand gunner by +1.71 in twelve ship-against-ship pairs behind regular sights and by +1.16 behind perfect ones, and TRAILED it by 0.93 with every noise taken out of both
// (where all that is left is the lag): the lead was the filter and nothing else, and what it filtered was an error the arena means every gunner to have. So gunnerFor takes `sigma` -- the SAME error, drawn the same way, added each tick to where the network's rates have LAID the gun (the network turns `laid`, the seat is sent to `laid` plus the tick's error, and the error is not fed back: added to the seat's own angle it would be integrated into a random walk, which was tried first and cost the car's hand weights a further 1.0 of lead that no gunner's hand owes) -- and battleshipDuel passes the side's own. With `sigma` left
// at 0 (brain/battleshipFight.mjs does not pass it) this seat is a gunner with a steadier hand than the arena's settings say, and a result from it says so or is not a result. Smoothing what the SIGHT measured (its noise is in the aim the network is shown) is still open to the network, and is a skill.
//
// THE HAND WEIGHTS ARE THE CAR'S OWN (gunnerPolicy.handWeights(): turn at 12 x the bearing, lift at 8 x the pitch, fire when aligned) AND THEY ARE NOT THE HAND GUNNER -- unlike every other seat network's hand weights. A proportional turn LAGS a moving aim point where the hand gunner's seat goes straight to it at the slew
// limit; the gate measures the difference in a fight and pins it. That difference is what "carrying the car's gunner over" costs before any training in space, and the first thing a search has to win back.
//
// A DECISION IS TWO HALVES, as seatGunnerPolicy's: `prepare` (the sight and the eleven features), `finish(prep, y)` (the rates into a command), and `decide.net` for a batch. With no target the gun is left where it is and the trigger is off. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as GP from "./gunnerPolicy.mjs";
import { clampToArc } from "../physics/mechanics/gunSeats.mjs";

export const FEATURES = GP.FEATURES, HIDDEN = GP.HIDDEN, OUTPUTS = GP.OUTPUTS, REC_STEPS = GP.REC_STEPS, REC_EDGES = GP.REC_EDGES, WEIGHT_COUNT = GP.WEIGHT_COUNT;   // 11, 34, 5, 3, 313, 896: the car's
export const FEATURE_NAMES = GP.FEATURE_NAMES, OUTPUT_NAMES = GP.OUTPUT_NAMES;
export const POLICY_ID = "gunnerPolicy";   // the car's own: a file exported from the race is a file for this seat
export const REACH = 600, CLOSING = 200;   // the sight's reach when the caller does not say; the speed a closing or crossing feature of 1 stands for
export const zeroWeights = GP.zeroWeights, handWeights = GP.handWeights, forward = GP.forward, layersOf = GP.layersOf, perturb = GP.perturb;
/** The last layer's five outputs as the five controls in [-1, 1] (what a batch that ran the layers elsewhere still has to do). */
export const post = (y) => [Math.tanh(y[0]), Math.tanh(y[1]), Math.tanh(y[2]), Math.tanh(y[3]), Math.tanh(y[4])];

const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const fin = (v) => (Number.isFinite(v) ? v : 0);

/**
 * The eleven features for a seat that has a target. `rule` is the sight's answer ({ yaw, pitch, fire, target }), `tg` the target as the arena shows it ({ pos, vel }), `st` the seat's state ({ yaw, pitch }), `body` the craft's body ({ pos, vel }), `reach` the sight's range.
 */
export function features(seat, st, body, rule, tg, reach = REACH) {
    const d = sub(tg.pos, body.pos), range = Math.hypot(d[0], d[1], d[2]), n = range > 1e-9 ? range : 1, dh = [d[0] / n, d[1] / n, d[2] / n], rel = sub(tg.vel || [0, 0, 0], body.vel || [0, 0, 0]);
    const along = rel[0] * dh[0] + rel[1] * dh[1] + rel[2] * dh[2], lat = Math.hypot(rel[0] - along * dh[0], rel[1] - along * dh[1], rel[2] - along * dh[2]);
    return [1, fin((rule.yaw - st.yaw) / Math.PI), fin((rule.pitch - st.pitch) / (Math.PI / 2)), Math.min(2, fin(range / (reach / 2))), fin(-along / CLOSING), fin(lat / CLOSING), 0, 1, rule.fire ? 1 : 0, 0, 0];
}

/**
 * `sigma` (default 0) is THE HAND'S AIM ERROR in radians, added to the seat's command on each axis every tick from a stream seeded by `seed`, the seat and the tick (gunSeats.handGunner's own recipe): see the header for why a gunner that lays the gun has to carry it.
 * `idle` is what the seat does with NO target: "hold" (default: it stays where it points) or "rest" (it is sent back to yaw 0, pitch 0, which is what gunSeats.handGunner does). THIS IS THE ADAPTER'S CHOICE, NOT THE NETWORK'S, and the gate measures what it is worth.
 * The gunner for weights `w` behind `sight` (a gunSeats.handGunner or anything with its contract): decide(seat, state, body, targets, t) -> { yaw, pitch, fire, target }, the contract of a seat's gunner. `dt` is the tick the rates are turned over (the arena's, 1/30).
 */
export function gunnerFor(w, sight, { reach = REACH, dt = 1 / 30, idle = "hold", sigma = 0, seed = 1, forward: fwd = forward, layersOf: lo = layersOf, post: pst = post } = {}) {
    if (idle !== "hold" && idle !== "rest") throw new Error(`seatTurretGunner.gunnerFor: idle is "hold" or "rest" (got ${idle})`);
    let laid = null;   // where the hand MEANS the gun to be: the seat's own angles are this plus the hand's error of the tick, and the error is not carried from one tick into the next (a gunner's hand shakes about where it holds the gun; it does not wander)
    function prepare(seat, st, body, targets, t = 0) {
        const rule = sight(seat, st, body, targets, t);
        if (rule.target == null) { decide.last = null; laid = null; return { rule, x: null, st, seat, t }; }
        const tg = targets.find((q) => q.id === rule.target); if (!tg) { decide.last = null; laid = null; return { rule, x: null, st, seat, t }; }
        if (!laid || !sigma) laid = { yaw: st.yaw, pitch: st.pitch };
        return { rule, x: features(seat, laid, body, rule, tg, reach), st, seat, t };
    }
    function finish(prep, y) {
        if (prep.x === null) return idle === "rest" ? { yaw: 0, pitch: 0, fire: false, target: null } : { yaw: prep.st.yaw, pitch: prep.st.pitch, fire: false, target: null };   // nothing to shoot at: the gun stays where it is, or with `idle: "rest"` goes back to its rest as the hand gunner's seat does
        decide.last = { x: prep.x, y };
        let ey = 0, ep = 0;
        if (sigma) { const rng = mulberry((seed * 7919 + Math.round(prep.t * 1000) * 104729 + hash(prep.seat.id)) >>> 0); ey = gauss(rng) * sigma; ep = gauss(rng) * sigma; }   // THE HAND'S ERROR, on what the hand does (see the header)
        laid = clampToArc(prep.seat, laid.yaw + y[0] * prep.seat.slew.yaw * dt, laid.pitch + y[1] * prep.seat.slew.pitch * dt);
        return { yaw: laid.yaw + ey, pitch: laid.pitch + ep, fire: y[2] > 0, target: prep.rule.target };
    }
    function decide(seat, st, body, targets, t = 0) { const p = prepare(seat, st, body, targets, t); return finish(p, p.x === null ? null : fwd(w, p.x)); }
    decide.prepare = prepare; decide.finish = finish;
    decide.net = { w, forward: fwd, layersOf: lo, post: pst };
    decide.last = null;
    return decide;
}
/** The factory spaceArena's `gunner(seat, k)` wants: each seat gets its own sight from `makeSight(seat, k)` and its own stream for the hand's error (`seed` + k). */
export const gunnerFactory = (w, makeSight, opts = {}) => (seat, k) => gunnerFor(w, makeSight(seat, k), { ...opts, seed: (opts.seed ?? 1) + k });

const O_B1 = FEATURES * HIDDEN, O_REC = O_B1 + HIDDEN, O_OUT = O_REC + REC_EDGES, O_B2 = O_OUT + HIDDEN * OUTPUTS;
/** Where a weight is: the encoder's weight from feature f into hidden unit h, unit h's bias, synapse k, unit h's weight into output o, output o's bias. */
export const encoderAt = (h, f) => h * FEATURES + f, hiddenBiasAt = (h) => O_B1 + h, synapseAt = (k) => O_REC + k, outputAt = (o, h) => O_OUT + o * HIDDEN + h, biasAt = (o) => O_B2 + o;
/** The outputs a seat reads (yaw, pitch, fire) and the features that are ever anything but a constant in a seat (the bias is 1, reloading and the two oil features 0, reachable 1): a search that moves another weight of the encoder moves a bias at best. */
export const READ_OUTPUTS = Object.freeze([0, 1, 2]), LIVE_FEATURES = Object.freeze([0, 1, 2, 3, 4, 5, 8]);
/** How many of the circuit's synapses carry a weight in `w`. */
export const synapsesUsed = (w) => { let n = 0; for (let k = 0; k < REC_EDGES; k++) if (w[O_REC + k] !== 0) n++; return n; };

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const rngFor = mulberry;

export function reportLines() {
    const nz = Array.from(handWeights()).filter((v) => v !== 0).length;
    return ["[seatTurretGunner] the race car's turret gunner in a gun seat: the hand gunner's sight, and brain/gunnerPolicy.mjs's network laying the gun by rates (not a correction to the sight's aim) and pulling the trigger",
        `  ${FEATURES} features, ${HIDDEN} hidden neurons (the male-cns Giant Fiber Circuit, ${REC_EDGES} synapses), ${OUTPUTS} outputs of which a seat reads ${READ_OUTPUTS.length}: ${WEIGHT_COUNT} weights, policy ${POLICY_ID}; the hand weights are the CAR'S hand gunner (${nz} non-zero weights) and are not the seat's hand gunner`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
