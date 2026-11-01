// WebGLEngine/brain/emergencyPilot.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE EMERGENCY WRAPPER: any submarine pilot, plus the two things a flooded boat does that the pilot does not -- the EMERGENCY BLOW and the DROP WEIGHT (physics/mechanics/subModel6dof.mjs, v4901). The wrapped pilot is
// asked first; the wrapper only speaks when the boat is in trouble, so a healthy dive is the wrapped pilot's dive, bit for bit. Stateless (the vessel's own tank state says whether the weight has gone), in three steps:
//   TROUBLE   the vessel is more than `blowDepth` (5 m) DEEPER than its target AND still sinking (climb below `sinkRate`, -0.05 m/s): a boat that has overshot is rising again and is not in trouble, a boat that is deeper and
//             still going down is one the ballast law (no integrator, a gain of 0.03 per metre) cannot catch
//   BLOW      in trouble: blow=1 (the tank is driven to the stop at the emergency rate), full thrust, planes full nose-up -- every way up the boat has
//   RELEASE   still in trouble past `releaseDepth` (10 m) deeper than the target: release=1, the one-way drop weight goes
//   AFTER     once the weight has gone, the wrapper is silent: the tank trims the rest (the drop weight is sized to leave the boat lighter than the leak, and the pilot's ballast law holds the target from there)
// What it cannot do, said plainly: it reads the boat's depth against the TARGET, so it is a depth-keeping rescue, not a surface-reaching one (that is brain/surfacePilot.mjs); and the release is a one-way door -- a boat that
// drops its weight for a leak that was not there (a sensor fault in the depth) stays light.
//
// Pure: no DOM, no clock, no random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";

export const EMERGENCY = Object.freeze({ blowDepth: 5, releaseDepth: 10, sinkRate: -0.05 });

/** (state, target) -> the stage: "ok" | "blow" | "release" | "gone" (the weight is already dropped). */
export function stage(state, target, opts = {}) {
    const g = { ...EMERGENCY, ...opts };
    if (state.tank && state.tank.released) return "gone";
    const over = -state.pos[2] - target.depth;
    if (!(over > g.blowDepth && state.vel[2] < g.sinkRate)) return "ok";
    return over > g.releaseDepth ? "release" : "blow";
}

/** The wrapper: `base` is a pilot function (state, target, current) -> controls. */
export const wrap = (base, opts = {}) => (state, target, current = [0, 0, 0]) => {
    const c = base(state, target, current), st = stage(state, target, opts);
    if (st === "ok" || st === "gone") return c;
    return S.sanitize({ ...c, pitch: 1, thrust: 1, blow: 1, release: st === "release" ? 1 : 0 });
};
