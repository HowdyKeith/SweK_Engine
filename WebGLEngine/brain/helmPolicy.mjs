// WebGLEngine/brain/helmPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A LEARNED PILOT FOR A CAPITAL SHIP'S HELM: a network in the place of the rule that turns the hull and sets the engines (brain/spaceArena.mjs: a capital ship FACES the nearest enemy at the hull's own torque limit -- the PD of autopilot6dof.decide() with the ship's gains --
// and thrusts at a fraction `cruise` of what its pods give). The gun seats have had a network for their hand since brain/seatGunnerPolicy.mjs; this is the helm's, built the same way, for the same reason: so that what the rule does is the starting point and the exact answer of a network that
// has learned nothing, and a network that has learned something can be told from it.
//
// WHAT THE NETWORK DOES AND WHAT IT DOES NOT, SAID PLAINLY. The rule decides first -- the torque that turns the hull toward the enemy (limited to what the hull can give) and the thrust of the cruise. The network is shown the 12 features of the 6DOF pilot (brain/pilot6dofPolicy.mjs's: the pointing error to the
// enemy as a rotation vector in the hull's frame, the spin, the cosine to the aim, the range, the closing speed and the two gates) and answers with a CORRECTION: up to TORQUE_FRACTION (half) of the hull's torque limit about each axis, added to the rule's, and up to THROTTLE_FRACTION (0.3) of the thrust
// the engine pods left can give, added to the rule's -- the result clamped to what the hull and the pods can do (the arena limits the torque again). So what it can learn is to turn faster or slower than the rule does, to roll, to wind the spin up or down, and to run the engines hotter or cooler; what it cannot
// learn is where to point: the enemy it faces is the rule's (the nearest), and a ship with no helm (the `crew` option) has no network either.
//
// *** THE HAND WEIGHTS ARE THE RULE: ZERO. *** A network whose outputs are all tanh(0) = 0 corrects nothing, so a helm given them does what the rule does, to the bit (the gate flies both in the same fights and compares the tallies and the states). The zero weights are therefore the same network, and
// there is NO network here that does nothing: unlike the gunner's trigger, which a network replaces, the helm's outputs are all corrections, and the identity is the origin. NO HELM WAS TRAINED. Everything below is the means to hold one to account when there is one.
//
// THE NETWORK is pilot6dofPolicy's -- the 34 neurons of the real male-cns Giant Fiber Circuit, 313 real synapses, three weight-tied recurrent steps, 930 weights -- used as it is (the arithmetic of forward() and the memoised layers are its own), with the five outputs read as: torque corrections about x, y and z,
// the throttle correction, and a fifth that is not used (the pilot's trigger).
"use strict";
import * as P6 from "./pilot6dofPolicy.mjs";

export const FEATURES = P6.FEATURES, HIDDEN = P6.HIDDEN, OUTPUTS = P6.OUTPUTS, WEIGHT_COUNT = P6.WEIGHT_COUNT, REC_EDGES = P6.REC_EDGES, REC_STEPS = P6.REC_STEPS;
export const FEATURE_NAMES = P6.FEATURE_NAMES;
export const OUTPUT_NAMES = Object.freeze(["torqueX", "torqueY", "torqueZ", "throttle", "unused"]);
export const TORQUE_FRACTION = 0.5, THROTTLE_FRACTION = 0.3;
export const zeroWeights = P6.zeroWeights, forward = P6.forward, layersOf = P6.layersOf, perturb = P6.perturb;
/** The rule, as weights: nothing corrected (see the header: the same as the zero weights). */
export const handWeights = () => P6.zeroWeights();

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * The twelve features the helm is shown: the 6DOF pilot's, for the hull against its enemy, called as the rule calls the autopilot (thrustForce 0, standoff 1e9: the ship never thrusts for the enemy, so `thrustOk` never opens; `aligned` is the pilot's, on the aim and inside its fire range).
 * `body` is the hull's rigid body, `foe` the enemy craft ({ body: { pos, vel } }). (The features do not depend on the gains kp and kd, which only the rule's torque does.)
 */
export const featuresOf = (body, foe) => P6.features(body, { pos: foe.body.pos, vel: foe.body.vel }, { thrustForce: 0, standoff: 1e9 });

/**
 * The helm for weights `w`: helm(rule, ctx) -> { torque, thrust }, where `rule` is { torque (body frame, already limited), thrust (force along the nose) } and `ctx` is { body, ship, foe (or null), thrustMax (what the pods left give) }.
 * With no enemy the rule's answer stands (the network is not asked); with one, its corrections are added and the result clamped (thrust to 0..thrustMax). `helm.last` holds what the network was shown and said the last time it was asked ({ x, y }), or null.
 */
export function helmFor(w) {
    function helm(rule, ctx) {
        if (!ctx.foe) { helm.last = null; return rule; }
        const x = featuresOf(ctx.body, ctx.foe), y = forward(w, x), lim = ctx.ship.maxAlpha;
        helm.last = { x, y };
        return { torque: rule.torque.map((t, i) => t + TORQUE_FRACTION * lim * ctx.body.I[i] * y[i]), thrust: clamp(rule.thrust + THROTTLE_FRACTION * ctx.thrustMax * y[3], 0, ctx.thrustMax) };
    }
    helm.last = null;
    return helm;
}
/** The factory the arena and the fight take: each ship gets a helm of its own (it remembers what it was last shown). */
export const helmFactory = (w) => () => helmFor(w);

export function reportLines() {
    const nz = Array.from(handWeights()).filter((v) => v !== 0).length;
    return ["[helmPolicy] a learned helm for a capital ship: the rule (face the nearest enemy at the hull's torque limit, cruise) and a fruit fly's escape-circuit network for a correction to it (torque about each axis, throttle)",
        `  ${FEATURES} features, ${HIDDEN} hidden neurons (the male-cns Giant Fiber Circuit, ${REC_EDGES} synapses), ${OUTPUTS} outputs: ${WEIGHT_COUNT} weights; the rule is the network with ${nz} non-zero weights (every output a correction: zero corrects nothing); no helm network was trained`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
