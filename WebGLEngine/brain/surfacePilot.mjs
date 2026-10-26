// WebGLEngine/brain/surfacePilot.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// SURFACING: any submarine pilot, plus the one thing none of them knows -- how to come up and STAY up. The autopilots (brain/autopilotSub.mjs and the network wired from it) hold a depth, and a depth of 0.56 m is a depth
// like another to them: asked for it they arrive, but at a speed of 1.2 m/s with the planes still working the hull (a measured pitch swing of half a radian) because the speed law wants its 2 m/s and the planes are what hold
// the depth. A boat that is surfaced is held up by the water. THE TARGET GAINS ONE OPTIONAL FIELD, `surface: true`; with it absent or false the wrapper is the wrapped pilot, bit for bit.
//   RISE    surface asked, the vessel deeper than `nearDepth` (3 m): the wrapped pilot flies to SURFACED_DEPTH (0.56 m) at the speed asked -- the planes bring it up; on a vessel with a FINITE bottle the pilot's blow is
//           refused on the way (ballast no lower than 0) so the air is still there at the surface
//   AFLOAT  within `nearDepth`: the ballast tank blown to the stop (-1), the screw idle, the planes holding the hull LEVEL (the pilot's own pitch loop with a pitch of zero asked), the rudder holding the heading. The speed
//           bleeds away on the hull's own drag and the boat comes to rest on its buoyancy alone.
// *** THE FREEBOARD IS FOUR CENTIMETRES, AND THAT IS THE MODEL, NOT THE PILOT. *** The tank trims 3% of the weight (ballastRange), so a boat blown to the stop floats where 97% of the hull is under: its centre of gravity
// 0.564 m below the surface (derived in physics/mechanics/subModel6dof.mjs: the submerged fraction is (R - z) / 2R, R = 0.6). A boat trimmed NEUTRAL hangs at 0.6 m, crown just awash. So the blow moves the boat 3.6 cm; what stands
// out of the water is the conning tower, and the 3D view draws it above the surface. A real boat's main ballast is a quarter of its volume and it rides much higher; that is a different spec (ballastRange 0.25), not a different pilot.
// The wrapper reads the sea at z = 0 (the vessel's own convention: no waves in the tank).
//
// Pure: no DOM, no clock, no random.
"use strict";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as A from "./autopilotSub.mjs";

export const SURFACED_DEPTH = 0.564;   // the centre of gravity of a boat blown to the stop, derived: R - 2 R (1 - ballastRange)
export const SURFACE = Object.freeze({ nearDepth: 3 });

/** "dive" (no surface asked) | "rise" | "afloat". */
export function stage(state, target, opts = {}) {
    if (!target || !target.surface) return "dive";
    const g = { ...SURFACE, ...opts };
    return -state.pos[2] < g.nearDepth ? "afloat" : "rise";
}

/** The wrapper: `base` is a pilot function (state, target, current) -> controls. `model` is the vessel (default the autopilot's). */
export const wrap = (base, opts = {}) => (state, target, current = [0, 0, 0]) => {
    const st = stage(state, target, opts);
    if (st === "dive") return base(state, target, current);
    if (st === "rise") {
        const c = base(state, { ...target, depth: SURFACED_DEPTH }, current);
        // a finite bottle is RATIONED on the way up: the pilot's ballast law blows and floods with every correction of the depth, and measured on the flood vessel it spends the whole bottle (1.5) by the time a boat
        // from 38 m arrives, leaving the afloat blow nothing (it floated with the tank at -0.45). The planes carry a moving boat up; the tank is kept for the surface.
        return state.tank && Number.isFinite(state.tank.air) && c.ballast < 0 ? S.sanitize({ ...c, ballast: 0 }) : c;
    }
    const g = { ...A.AUTOPILOT_SUB, ...opts }, d = A.guidance(state, { depth: SURFACED_DEPTH, heading: target.heading, speed: 0 }, current, opts), r = d.rates;
    return S.sanitize({ pitch: d.sched * (g.kTheta * (0 - d.att.pitch) - g.kQ * r.pitch), yaw: d.sched * (g.kHdg * d.headingErr - g.kR * r.yaw) - g.kBeta * d.att.beta, thrust: 0, ballast: -1 });
};
