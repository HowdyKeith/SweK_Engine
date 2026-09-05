// WebGLEngine/render/orbitCamera.mjs -- v4475 (the 3D orrery, step 3)
//
// *** AN ORBIT CAMERA AS PURE FUNCTIONS. *** orrery-gpu.html has had one camera number since v4299: a tilt slider,
// with the eye on a fixed arc over the origin. A 3D system wants to be turned, approached and followed, and the
// three of those are arithmetic on a small state -- yaw, pitch, distance, target -- that a gate can hold without a
// pointer, a wheel or a page. The page owns the events; this module owns what they mean, and every function here
// returns a NEW state and leaves its input alone, so a frame can keep the old one and a gate can compare the two.
//
// THE FRAME. The orrery's orbit plane is XY and +z is its north (world/orreryView.mjs positionAt3 puts the tilt's
// height in z), so the camera orbits about +z:
//   eye = target + distance * (cos pitch sin yaw, -cos pitch cos yaw, sin pitch),  up = +z.
// pitch is the elevation above the plane: 0 is edge-on, +PI/2 is straight above (a top view, the 2D page's picture),
// negative is from below, which a 3D system may as well allow. It is clamped short of the poles, where lookAt's
// up would be parallel to the view and the basis would collapse -- the v4299 camera could reach exactly that at
// tilt 0, and the slider's minimum was what kept it from happening.
//
// THE SLIDER SURVIVES. The page's tilt was the angle from the pole, so pitch = PI/2 - tilt; pitchFromTilt and
// tiltFromPitch carry it both ways and the slider becomes the initial pitch and a second way to set it.
//
// NOT CLAIMED: inertia, easing, touch pinch (a wheel is the only dolly), or a roll about the view axis.
"use strict";

export const UP = Object.freeze([0, 0, 1]);
/** Short of the poles by this much, in radians, so lookAt's basis never collapses. */
export const POLE_MARGIN = 0.02;
export const DEFAULTS = Object.freeze({
    radiansPerPixel: 0.005,     // a drag of 200 px turns one radian
    dollyPerNotch: 1.1,         // one wheel notch (100 units of deltaY) moves the eye 10% nearer or farther
    notchUnits: 100,
    fovY: 0.9,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (a) => { const t = 2 * Math.PI; let r = a % t; if (r < 0) r += t; return r; };
const num = (v, d) => (Number.isFinite(v) ? v : d);

/** The camera at rest: a top-ish view from `distance`, looking at the origin, following nothing. */
export function makeOrbitState({ yaw = 0, pitch = Math.PI / 4, distance = 10, target = [0, 0, 0], distMin = 0.5, distMax = 1000, follow = null } = {}) {
    const dMin = Math.max(1e-6, num(distMin, 0.5)), dMax = Math.max(dMin, num(distMax, 1000));
    // an infinite pitch or distance is a request for the limit (a dolly of ten thousand notches overflows to
    // Infinity before it is clamped), so it clamps; a NaN or a non-number is no request at all, and defaults
    const real = (v, d) => (typeof v === "number" && !Number.isNaN(v) ? v : d);
    return Object.freeze({
        yaw: wrap(num(yaw, 0)),
        pitch: clamp(real(pitch, Math.PI / 4), -Math.PI / 2 + POLE_MARGIN, Math.PI / 2 - POLE_MARGIN),
        distance: clamp(real(distance, 10), dMin, dMax),
        target: Object.freeze([num(target[0], 0), num(target[1], 0), num(target[2], 0)]),
        distMin: dMin, distMax: dMax,
        follow: follow == null ? null : follow,
    });
}

/** A drag of (dx, dy) pixels: dx turns the yaw, dy tips the pitch (dragging DOWN raises the eye), both by radiansPerPixel. */
export function dragged(state, dx, dy, { radiansPerPixel = DEFAULTS.radiansPerPixel } = {}) {
    return makeOrbitState({ ...state, yaw: state.yaw + num(dx, 0) * radiansPerPixel, pitch: state.pitch + num(dy, 0) * radiansPerPixel });
}

/** A wheel of deltaY: positive (wheel toward you) backs the eye away, negative approaches; geometric, clamped to the state's limits. */
export function dollied(state, deltaY, { dollyPerNotch = DEFAULTS.dollyPerNotch, notchUnits = DEFAULTS.notchUnits } = {}) {
    const notches = num(deltaY, 0) / notchUnits;
    return makeOrbitState({ ...state, distance: state.distance * Math.pow(dollyPerNotch, notches) });
}

/** The pitch set outright (the tilt slider). */
export function withPitch(state, pitch) { return makeOrbitState({ ...state, pitch }); }

/** Follow something: `follow` is the caller's handle (a body id), `target` where it is now. null stops following and holds the target where it is. */
export function followed(state, follow, target = null) {
    return makeOrbitState({ ...state, follow: follow == null ? null : follow, target: target || state.target });
}

/** The target moved (a followed body advanced): the eye moves rigidly with it. */
export function retargeted(state, target) { return makeOrbitState({ ...state, target }); }

/** Where the eye is, for this state. */
export function eyeOf(state) {
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch), sy = Math.sin(state.yaw), cy = Math.cos(state.yaw), d = state.distance, t = state.target;
    return [t[0] + d * cp * sy, t[1] - d * cp * cy, t[2] + d * sp];
}

/** The page's tilt (degrees from the pole, 0 = top view) as a pitch, and back. */
export function pitchFromTilt(tiltDeg) { return Math.PI / 2 - num(tiltDeg, 35) * Math.PI / 180; }
export function tiltFromPitch(pitch) { return (Math.PI / 2 - num(pitch, Math.PI / 4)) * 180 / Math.PI; }

/** The distance the v4299 camera used to frame a system of extent `ext`, kept as the resting distance. */
export function fitDistance(ext, factor = 2.4) { return Math.max(1e-3, num(ext, 1)) * factor; }

/** near/far for a perspective at this state: near a fixed sliver, far past the target by the distance and the system. */
export function clipPlanes(state, ext) { return { near: 0.1, far: state.distance * 4 + Math.max(0, num(ext, 0)) * 2 }; }
