// WebGLEngine/brain/helmSteerCannon.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE STEERING HELM THAT KNOWS WHICH FIGHT IT IS IN. tools/ship/takeHelmLadder.mjs put the cannon-aware fly-wired helm (helmFlyWired3) first by 0.6 to 1.4 over every other helm on the duel page; second was `steer` (brain/helmSteerPolicy.mjs), trained to correct the bow-on rule
// with the hand gunner in the seats, the same in every fight. What the fly-wired helm has that it lacks is a switch: it asks whether its ship has a cannon and turns at other gains when it has (brain/flySteering.mjs's `third`). This gives `steer` that switch.
// THE SHIPPED STEER HELM CARRIES THREE NON-ZERO WEIGHTS of its 1,248 (indices 243, 1143 and 1246: what it learned is to throttle back and turn harder about one axis). This helm has SIX weights: those three WITH a cannon (w[0..2]) and WITHOUT one (w[3..5]); each tick
// it asks flySteering.hasCannon(ctx.ship) and answers as helmSteerPolicy at that set (every other weight 0). At the shipped three in both sets it IS the steer helm to the bit (the gate flies it). Keith: "then 2" (a cannon-aware version of the steering helm).
"use strict";
import * as HS from "./helmSteerPolicy.mjs";
import { hasCannon } from "./flySteering.mjs";

export const POLICY_ID = "helmSteerCannon", INDICES = Object.freeze([243, 1143, 1246]), WEIGHT_COUNT = 6;
export const FEATURES = HS.FEATURES, HIDDEN = HS.HIDDEN, OUTPUTS = HS.OUTPUTS, TORQUE_FRACTION = HS.TORQUE_FRACTION;
/** The steer helm's full weights with `three` at INDICES and every other weight 0. */
export function fullOf(three) { const w = new Float32Array(HS.WEIGHT_COUNT); INDICES.forEach((k, i) => { w[k] = three[i]; }); return w; }
/** The six weights of a full steer file: its three, twice (the same with a cannon and without). Refuses a file with a weight elsewhere. */
export function fromSteer(full) { const rest = Array.from(full).some((v, i) => v !== 0 && !INDICES.includes(i)); if (rest) throw new Error("helmSteerCannon.fromSteer: the steer weights carry a weight outside the three"); const t = INDICES.map((k) => full[k]); return Float32Array.from([...t, ...t]); }
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT), handWeights = zeroWeights;
export function helmFor(w) {
    const withC = HS.helmFor(fullOf([w[0], w[1], w[2]])), without = HS.helmFor(fullOf([w[3], w[4], w[5]]));
    function helm(rule, ctx) { const h = hasCannon(ctx.ship) ? withC : without, out = h(rule, ctx); helm.last = h.last; helm.cannon = h === withC; return out; }
    helm.last = null; helm.cannon = null;
    return helm;
}
export const helmFactory = (w) => () => helmFor(w);
export function reportLines() { return ["[helmSteerCannon] the steering helm (brain/helmSteerPolicy.mjs) with a cannon switch: its three learned weights with a cannon and without, six in all"]; }
