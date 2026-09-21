// WebGLEngine/brain/autopilot6dof.mjs
//
// A TORQUE/THRUST AUTOPILOT for physics/mechanics/rigidBody6dof.mjs ships -- decide() turns "where is the
// target" into a body-frame torque and thrust the caller feeds straight into that module's own
// createAccumulator()/applyForceAtPoint() (this file never touches an accumulator itself; it is a pure
// decision function, matching the existing dogfight AIs' own shape -- ev/flightModel3d.js's stepAI3d and
// brain/pilotPolicy.mjs's pilotFor() are both (ship, target, opts) -> decision, no side effects).
//
// UNLIKE stepAI3d/pilotFor, THIS AI DOES NOT DIRECTLY SET HEADING -- there is no heading to set. A
// rigidBody6dof.mjs ship only ever receives torque and force; turning AT ALL is something the controller has
// to WIN, the same way a real reaction-control system does. This file is a PD (proportional-derivative)
// attitude controller on nose-pointing alone (roll is left free, matching how a spin-stabilised or simply
// roll-indifferent combat craft would fly) -- not a full 6DOF attitude-tracking controller.
//
// THE CONTROL LAW, derived and checked (not assumed) in this file's own gate:
//   e_world = the world-frame rotation vector (axis * angle, both derived from the current and desired FORWARD
//             directions via pointingError() below) that would align the ship's nose with the target
//   e_body  = worldToBody(q, e_world)                          -- rigidBody6dof.mjs's own shared primitive
//   torque[i] = I[i] * (kp * e_body[i] - kd * w[i])             -- PER-AXIS, scaled by that axis's own inertia
// Scaling by I[i] is what makes kp/kd's MEANING independent of a ship's mass/inertia scale: linearised about
// small e (single axis, e' = -w), this control law reduces to the textbook damped harmonic oscillator
// e'' + kd e' + kp e = 0 (natural frequency sqrt(kp), damping ratio kd/(2 sqrt(kp))) -- derived in this file's
// gate and checked TWO ways: against the linearised prediction directly, and against the REAL nonlinear
// rigidBody6dof.mjs simulator run for real ticks, confirming critical damping (kd = 2 sqrt(kp), this file's
// own default) converges without overshoot while a deliberately underdamped kd overshoots -- so the "no
// overshoot" claim is measured under both models, not merely derived once and trusted.
//
// LEAD AIMING is delegated to physics/ballistics.mjs's own leadMoving() (already gated, already documented as
// solving the intercept in the shooter's own rest frame) rather than reimplemented -- its `dir` output is
// exactly the "shooter's own barrel direction" this file needs, and matches
// physics/mechanics/rigidBody6dofWeapon.mjs's own fireProjectile() convention that a shot inherits the
// shooter's velocity (leadMoving's own doc comment: "the shell's inherited velocity carries it the rest of
// the way" -- the same physics, not a coincidence).
"use strict";
import { rotateByQuat, worldToBody, createBody, boxInertia, createAccumulator, applyForceAtPoint, step } from "../physics/mechanics/rigidBody6dof.mjs";
import { FORWARD_BODY } from "../physics/mechanics/rigidBody6dofWeapon.mjs";
import { leadMoving } from "../physics/ballistics.mjs";

export { FORWARD_BODY };

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
const unit3 = (v, fallback) => { const n = norm3(v); return n > 1e-9 ? v.map((c) => c / n) : fallback; };

export const AUTOPILOT = { kp: 6, thrustForce: 40, standoff: 40, thrustAngle: 0.6, fireAngle: 0.05, fireRange: 300 };

/** The world-frame rotation VECTOR (axis * angle, [0,pi]) that aligns `from` with `to` (both unit vectors). */
export function pointingError(from, to) {
    const c = Math.max(-1, Math.min(1, dot3(from, to)));
    const axis = cross3(from, to);
    const s = norm3(axis);
    if (s < 1e-9) {
        if (c > 0) return [0, 0, 0];   // already aligned
        // exactly (or numerically) opposite: pick ANY axis perpendicular to `from` to start the turn -- using
        // world +X unless `from` is already close to +X, in which case use +Y instead, so the reference is
        // never near-parallel to `from` (which would itself produce a near-zero cross product).
        const ref = Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        const perp = unit3(cross3(from, ref), [0, 1, 0]);
        return perp.map((v) => v * Math.PI);
    }
    const angle = Math.atan2(s, c);
    return axis.map((v) => (v / s) * angle);
}

/**
 * `body`: a rigidBody6dof.mjs state. `target`: {pos, vel?} (vel defaults to [0,0,0] -- aim at its current spot).
 * `opts.weaponSpeed`, if given, leads a moving target via physics/ballistics.mjs's leadMoving() instead of
 * aiming straight at its current position. Returns {torqueBody, thrust, firing, range, facingCos} -- `thrust`
 * is a scalar force along FORWARD_BODY, `torqueBody` a body-frame torque vector; the caller applies both via
 * rigidBody6dof.mjs's own createAccumulator()/applyForceAtPoint(), same as this file's own reportLines() demo.
 */
export function decide(body, target, opts = {}) {
    const spec = { ...AUTOPILOT, ...opts };
    const kd = opts.kd != null ? opts.kd : 2 * Math.sqrt(spec.kp);
    const targetVel = target.vel || [0, 0, 0];
    const toTarget = sub3(target.pos, body.pos), range = norm3(toTarget);
    const currentForward = rotateByQuat(body.q, FORWARD_BODY);

    let desiredForward;
    if (spec.weaponSpeed) {
        const lead = leadMoving(body.pos, body.vel, target.pos, targetVel, spec.weaponSpeed);
        desiredForward = lead ? lead.dir : unit3(toTarget, currentForward);
    } else {
        desiredForward = unit3(toTarget, currentForward);
    }

    const eWorld = pointingError(currentForward, desiredForward);
    const eBody = worldToBody(body.q, eWorld);
    const torqueBody = [0, 1, 2].map((i) => body.I[i] * (spec.kp * eBody[i] - kd * body.w[i]));

    const facingCos = dot3(currentForward, desiredForward);
    const thrust = (facingCos > Math.cos(spec.thrustAngle) && range > spec.standoff) ? spec.thrustForce : 0;
    const firing = facingCos > Math.cos(spec.fireAngle) && range < spec.fireRange;

    return { torqueBody, thrust, firing, range, facingCos };
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const I = boxInertia({ m: 8, hx: 0.8, hy: 0.8, hz: 1.8 });
    // start facing AWAY from the target (180deg error) -- the hardest case, and the one pointingError()'s own
    // degenerate branch exists for.
    let s = createBody({ mass: 8, I, pos: [0, 0, 0], q: [0, 0, 1, 0] });   // 180deg about Y: nose now faces -X
    const target = { pos: [40, 0, 0], vel: [0, 0, 0] };
    let ticks = 0, fired = false;
    for (; ticks < 300; ticks++) {
        const d = decide(s, target, {});
        const acc = createAccumulator();
        applyForceAtPoint(acc, [d.thrust, 0, 0], [0, 0, -0.9]);
        acc.torque = d.torqueBody;
        s = step(s, acc, 1 / 30);
        if (d.firing) { fired = true; break; }
    }
    return [
        "[autopilot6dof] a PD attitude controller for rigidBody6dof.mjs -- torque/thrust, not heading, out of a",
        "                180-degree starting error toward a stationary target, gated for convergence and lead-aim.",
        `  ${ticks} ticks to ${fired ? "fire (aligned + in range)" : "the demo's own tick budget without firing"}`,
    ];
}

// GUARDED (this tree's established idiom -- see physics/stabilityMeter.mjs's own v3900/v3951 notes and
// tools/ship/browserSafety-selfcheck.mjs, the gate that exists because of exactly this bug): this module is
// loaded by a PAGE as well as run as a CLI, and `process` at module top level is a ReferenceError in a
// browser -- not a caught failure, an EVALUATION failure, so the whole module fails to load and every page
// that imports it dies with it. The node:url import itself must be INSIDE the guard too, dynamically -- a
// bare top-level `import ... from "node:url"` is resolved before this line ever runs, so an unguarded import
// crashes the browser before the guard below would even get a chance to skip it.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        for (const l of reportLines()) console.log(l);
        process.exit(0);
    }
}
