// WebGLEngine/brain/pilotJetPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FRUIT-FLY PILOT FOR THE JET: brain/pilotFlightPolicy.mjs's network -- the 34 neurons and 313 real synapses of the Giant Fiber Circuit, three weight-tied recurrent steps, eighteen features in, four controls out, 1,099 weights -- reading the JET's senses and holding the JET'S hand pilot (autopilotFlight.mjs, AUTOPILOT_JET_FIGHT) in its
// hand weights, to float32. The network is not new and is not copied: forward(), layersOf(), the weight count and the zero weights are the trainer's pilot's own, re-exported, so a weight file for this layout is a weight file for that network and the only things that differ are what the eighteen numbers mean and the weights that read them.
//
//   WHAT THE JET'S PILOT HAS THAT THE TRAINER'S DOES NOT, and where it goes in eighteen numbers. Three of the jet's laws are not a sum of the trainer's features: the bank compensation and the climb pull are SCHEDULED on the equivalent airspeed (autopilotFlight.gainSchedule: (vRef / EAS)^2 held between 0.3 and 3), and the angle-of-attack LIMITER takes the stick off by kAlpha per radian of
//   (alpha + lead x pitch rate - limit), when that is positive, and only while the wings are level enough to pull (the `upright` factor). So:
//     feature 3  the extra back-stick a banked wing needs, x upright x the schedule         (the trainer's feature 3 is the same without the schedule)
//     feature 4  the climb error / 5 m/s, x upright x the schedule                           (likewise; a pilot whose gains do not schedule the climb is not scheduled)
//     feature 12 upright x the angle of attack / 0.2                                          (the trainer's: the angle of attack / 0.2)
//     feature 13 upright x the pitch rate / 0.5                                                (the trainer's: the bank / 0.5 -- the bank is in feature 6's error and 5's neighbours)
//     feature 14 upright                                                                        (the trainer's: the altitude error / 50 -- it is in feature 4's climb command)
//   and of the other fourteen, twelve are the trainer's and two are the trainer's with a wider clamp (feature 10, the speed error / 10 m/s, and 11, the climb rate / 5 m/s: the trainer's clamps are 60 m/s and the jet dives at 150). The limiter is then ONE RELU NEURON: relu(kAlpha (0.2 f12 + lead 0.5 f13 - limit f14)) = relu(kAlpha upright (alpha + lead q - limit)) = upright x the limiter's excess (a positive factor goes through a relu), and the pitch output reads it with a weight of -1. That is the whole of the jet's pilot: 34 of the 1,099 weights are not zero
//   (the trainer's 30 and the limiter's four).
//
// WHAT THE JET'S NETWORK CANNOT SEE AND THE TRAINER'S CAN: the bank angle itself (the bank error is there) and the altitude error itself (the climb command that follows from it is there); two of the six features that the autopilot does not use are spent on the limiter. A weight file for the trainer's layout is NOT a weight file for this one, and the two refuse each other by their feature names (FEATURE_NAMES here differ at five places).
//
// Pure: no DOM, no clock, no random. The flight model is physics/mechanics/flightModel6dof.mjs's jet, the senses are autopilotFlight.guidance() read on it.
"use strict";
import * as PF from "./pilotFlightPolicy.mjs";
import * as AF from "./autopilotFlight.mjs";

export const FEATURES = PF.FEATURES, HIDDEN = PF.HIDDEN, OUTPUTS = PF.OUTPUTS, REC_STEPS = PF.REC_STEPS, REC_EDGES = PF.REC_EDGES, WEIGHT_COUNT = PF.WEIGHT_COUNT;
export const OUTPUT_NAMES = PF.OUTPUT_NAMES;
export const FEATURE_NAMES = Object.freeze(PF.FEATURE_NAMES.map((n, i) => (i === 3 ? "bankCompScheduled" : i === 4 ? "climbErrScheduled" : i === 12 ? "alphaUpright" : i === 13 ? "pitchRateUpright" : i === 14 ? "upright" : n)));
/** The gains the jet's hand weights are written from: the fighting pilot's. Another gain set (the cruise pilot's AUTOPILOT_JET) makes another set of weights and another set of features; the weights and the features are made from ONE set. */
export const JET_GAINS = AF.AUTOPILOT_JET_FIGHT;
/** The limiter's neuron: the first one the trainer's hand weights do not use (they use the first eight, a pair of channels for each output). */
export const LIMITER_NEURON = 2 * OUTPUTS;
export const zeroWeights = PF.zeroWeights, forward = PF.forward, layersOf = PF.layersOf, perturb = PF.perturb, mutate = PF.mutate;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);

/** The eighteen features of a guidance record read on the jet (see the header). `gains` are the gains the guidance was made with (they decide whether the climb is scheduled). */
export function featuresFrom(gd, gains = JET_GAINS) {
    const x = PF.featuresFrom(gd), g = { ...AF.AUTOPILOT_FLIGHT, ...gains }, sc = AF.gainSchedule(gd, g), r = gd.rates, a = gd.att;
    x[3] *= sc;
    x[4] *= g.scheduleClimb ? sc : 1;
    x[10] = fin(clamp(gd.speedErr / 10, -24, 24));   // the trainer's clamps (60 m/s of speed error, 60 m/s of climb) are far outside what a 45 m/s aircraft does and inside what a jet does: it dives at 150 m/s, and a clamp there is a different throttle (measured: 0.52 of throttle in a steep climb at 86 m/s)
    x[11] = fin(clamp(gd.climb / 5, -40, 40));
    x[12] = fin(clamp(gd.upright * a.alpha / 0.2, -8, 8));
    x[13] = fin(clamp(gd.upright * r.pitch / 0.5, -12, 12));
    x[14] = fin(gd.upright);
    return x;
}
/** The features for a state, a target and the wind: the guidance of `gains` on the jet. */
export const features = (state, target, wind = [0, 0, 0], gains = JET_GAINS) => featuresFrom(AF.guidance(state, target, wind, { ...gains, model: AF.jetModel() }), gains);
/** A pilot (state, target, wind) -> { pitch, roll, yaw, throttle } from weights: the autopilot's own contract, for the jet. */
export function pilotFor(w, gains = JET_GAINS) { return (state, target, wind = [0, 0, 0]) => forward(w, features(state, target, wind, gains)); }

/**
 * The jet's hand pilot in the network's weights: the trainer's pair-of-channels weights (pilotFlightPolicy.handWeights) with the jet's gains, and the limiter's neuron. The pitch law is f1 + kBankInv f3 + kVsPitch f4 - 0.5 kQ f5 - (the limiter's neuron), the other three are the trainer's laws with the jet's gains.
 * A set of gains without an angle-of-attack limit (the trainer's) writes no limiter neuron.
 */
export function handWeights(gains = JET_GAINS) {
    const K = { ...AF.AUTOPILOT_FLIGHT, ...gains }, w = PF.handWeights(K);
    if (K.alphaLimit) {
        const row = LIMITER_NEURON * FEATURES, outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES;
        w[row + 12] = K.kAlpha * 0.2; w[row + 13] = K.kAlpha * K.alphaLead * 0.5; w[row + 14] = -K.kAlpha * K.alphaLimit;
        w[outBase + 0 * HIDDEN + LIMITER_NEURON] = -1;
    }
    return w;
}

export function reportLines() {
    const w = handWeights(), t = AF.trimTable(AF.jetModel(), 3000)[7];
    return [
        `[pilotJetPolicy] the Giant Fiber Circuit (${HIDDEN} neurons, ${REC_EDGES} synapses) as the JET's pilot: ${FEATURES} features -> ${OUTPUTS} controls, ${WEIGHT_COUNT} weights; the jet's schedule on the equivalent airspeed is in two features and its angle-of-attack limiter is one neuron`,
        `  hand weights: ${w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)} of ${WEIGHT_COUNT} non-zero; they are AUTOPILOT_JET_FIGHT's laws and fly the same flight`,
        `  trim table entry at ${t.v.toFixed(0)} m/s and 3,000 m: stick ${t.pitch.toFixed(3)} throttle ${t.throttle.toFixed(3)}`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
