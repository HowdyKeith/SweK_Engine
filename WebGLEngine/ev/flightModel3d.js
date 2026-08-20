// WebGLEngine/ev/flightModel3d.js — v3826 (Long Silence, Round B)
//
// THE 2D FLIGHT MODEL GROWS A PITCH AXIS. flightModel.js is a scalar heading on a plane (thrust along
// (sin h, -cos h), no drift, cap to top speed). Round B lets a ship actually leave the plane: it keeps that
// heading (yaw) and adds PITCH, so the facing is a full 3D vector and thrust drives altitude as well as the
// plane. Everything here is pure and deterministic, exactly like flightModel.js, so the one thing that could go
// silently wrong -- the 3D facing and its reduction to the old model -- lives behind an answer key.
//
// *** THE LOAD-BEARING PROPERTY: at pitch 0 with no pitch input, every function here reduces EXACTLY to
// flightModel.js. *** forward3d(h,0) === headingVector(h) with alt 0; stepFlight3d matches stepFlight; the AI's
// yaw half matches the 2D AI. That is what lets Round B be a superset and lets the 2D game and Round A keep
// their behavior unchanged -- proven in flightModel3d-selfcheck.mjs, not asserted.
//
// SUBSTRATE NOTE: box3d owns x-z position and collision (its addShip helper hides the up axis -- see
// planarFallbackWorld's own account of "spatial"); ALTITUDE IS OWNED HERE. So collisions are the x-z projection
// and altitude flies free. True volumetric collision is a later round on spatial (addBox) bodies.
//
// Conventions (matching flightModel.js + esFlight3dMath.js):
//   yaw = heading, deg CW from "up"; pitch deg, + = nose up (+altitude).
//   forward = (sin yaw · cos pitch,  -cos yaw · cos pitch,  sin pitch)  as {x, y, alt}
//     x,y are the ES plane (box3d x,z); alt is the out-of-plane axis (box3d Y).

import { headingVector, normDeg } from "./flightModel.js";

const DEG = Math.PI / 180, RAD = 180 / Math.PI;
export const MAX_PITCH = 85;   // deg; short of ±90 so yaw never gimbal-locks against a vertical facing

export function clampPitch(p) { return p > MAX_PITCH ? MAX_PITCH : (p < -MAX_PITCH ? -MAX_PITCH : p); }

// 3D facing. cos(pitch) shrinks the planar part as the nose tilts; sin(pitch) is the altitude part. At pitch 0
// this is exactly headingVector(yaw) with alt 0.
export function forward3d(yawDeg, pitchDeg) {
    const hv = headingVector(yawDeg), cp = Math.cos((pitchDeg || 0) * DEG);
    return { x: hv.x * cp, y: hv.y * cp, alt: Math.sin((pitchDeg || 0) * DEG) };
}

// Advance one tick of 3D flight. state = { x, y, alt, vx, vy, valt, heading, pitch }. Returns a NEW state.
// stats = { accel, speed, turn, pitchRate? }  (pitchRate deg/sec; defaults to turn). input = { turn, pitch, thrust }.
export function stepFlight3d(state, input, stats, dt) {
    const heading = normDeg((state.heading || 0) + (input.turn || 0) * stats.turn * dt);
    const pitch = clampPitch((state.pitch || 0) + (input.pitch || 0) * ((stats.pitchRate != null ? stats.pitchRate : stats.turn)) * dt);
    let vx = state.vx || 0, vy = state.vy || 0, valt = state.valt || 0;
    if (input.thrust) {
        const f = forward3d(heading, pitch), a = stats.accel * dt;
        vx += f.x * a; vy += f.y * a; valt += f.alt * a;
    }
    const sp = Math.hypot(vx, vy, valt);
    if (sp > stats.speed && sp > 0) { const k = stats.speed / sp; vx *= k; vy *= k; valt *= k; }
    return {
        x: (state.x || 0) + vx * dt, y: (state.y || 0) + vy * dt, alt: (state.alt || 0) + valt * dt,
        vx, vy, valt, heading, pitch,
    };
}

// Signed shortest angle a->b in degrees, in (-180, 180].
export function angleDiffDeg(a, b) { let d = ((b - a) % 360 + 540) % 360 - 180; return d; }

// The yaw a ship at (x,y) must hold to face (tx,ty) in the ES plane. headingVector = (sin, -cos), so the heading
// whose facing points along (dx,dy) is atan2(dx, -dy). Identical convention to the 2D AI's aim.
export function yawTo(ship, target) {
    return normDeg(Math.atan2((target.x || 0) - (ship.x || 0), -(((target.y || 0) - (ship.y || 0)))) * RAD);
}

// The pitch that points the nose at the target's altitude: rise over the horizontal run. + when target is above.
export function pitchTo(ship, target) {
    const dx = (target.x || 0) - (ship.x || 0), dy = (target.y || 0) - (ship.y || 0);
    const dAlt = (target.alt || 0) - (ship.alt || 0), horiz = Math.hypot(dx, dy);
    return clampPitch(Math.atan2(dAlt, horiz) * RAD);
}

// Full 3D straight-line distance including altitude.
export function dist3d(ship, target) {
    const dx = (target.x || 0) - (ship.x || 0), dy = (target.y || 0) - (ship.y || 0), da = (target.alt || 0) - (ship.alt || 0);
    return Math.hypot(dx, dy, da);
}

// 3D steering AI: the 2D pursuit (turn to face, thrust when roughly aligned, fire when aligned and in range)
// with a pitch axis added on the same logic. Pure: reads positions/orientation, returns { turn, pitch, thrust,
// firing }. At equal altitude and pitch 0 the yaw/thrust/fire half matches the 2D stepAI's shape.
export function stepAI3d(ship, target, opts = {}) {
    const range = opts.range || 1400, standoff = opts.standoff || 140;
    const yawErr = angleDiffDeg(ship.heading || 0, yawTo(ship, target));
    const pitchErr = angleDiffDeg(ship.pitch || 0, pitchTo(ship, target));
    const d = dist3d(ship, target);
    const aimed = Math.abs(yawErr) < 12 && Math.abs(pitchErr) < 12;
    return {
        turn: yawErr > 4 ? 1 : yawErr < -4 ? -1 : 0,
        pitch: pitchErr > 4 ? 1 : pitchErr < -4 ? -1 : 0,
        thrust: Math.abs(yawErr) < 35 && Math.abs(pitchErr) < 35 && d > standoff,
        firing: aimed && d < range,
    };
}
