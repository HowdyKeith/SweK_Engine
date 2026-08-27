// WebGLEngine/rig/cinematicShot.js — v4053
// ---------------------------------------------------------------------------------------------------------------
// A CINEMATIC CAMERA MOVE AS PURE ARITHMETIC: t in, a camera out. No Three.js, no DOM, no GL.
//
// Keith asked whether we could tack Makio64/threejs-cinematic-world-zoom onto the terrain view. THE REPO ITSELF
// CANNOT BE ADOPTED, for three independent reasons, each disqualifying on its own:
//   1. It needs a Vite build. This tree's standing law (tools/ship/asciify-selfcheck.mjs's own header): "NOTHING
//      IN WebGLEngine/*.html MAY NEED COMPILING, because a phone peer opens those pages in a browser with no
//      toolchain. An idea ports; a build step is a permanent cost paid by every peer."
//   2. It cannot render its globe without a Google Maps Platform or Cesium Ion key. realterrain.html's own
//      subtitle is "no API keys", and its MIT licence covers the CODE only -- Google's tile terms, not the
//      licence, govern anything rendered or recorded from it.
//   3. It hard-pins three@0.185.1 with a documented silent depth-texture failure above it. This tree runs r160.
//
// *** BUT THE CAMERA MOVE ITSELF NEEDS NONE OF THOSE THINGS. *** It is trigonometry over a scalar t, and this
// tree already owns a better subject to fly onto than somebody's tile server: world/procPlanet.js bakes a whole
// planet from a seed, and world/planetSurface.js can answer the ground height at any direction on it. So the
// TECHNIQUE is reimplemented here from its description -- the same call this tree made for asciify.mjs ("that
// library is React/Vue/Svelte source and would need porting -- BUT THE TECHNIQUE NEEDS NOTHING") and for
// world/procPlanet.js ("technique lifted (not copied)"). Nothing is vendored.
//
// THIS IS NOT rig/cameraCinematic.js, AND THE DIFFERENCE IS THE WHOLE POINT. That file is a RECORDER: you fly
// the camera by hand, it snapshots keyframes, and a TrackAnimator replays them. It cannot produce a move nobody
// flew first. This file is the opposite -- a move COMPUTED from parameters, with nothing to record. The two
// compose (a shot sampled at N times IS a keyframe list) but neither replaces the other, and putting a
// parametric shot inside the recorder would have made the recorder lie about where its keyframes came from.
//
// THE THREE THINGS THAT MAKE IT READ AS CINEMA RATHER THAN A LERP:
//
//   1. LOGARITHMIC DISTANCE. A constant PERCEIVED zoom rate is a constant rate of change of LOG distance, not of
//      distance. Linear interpolation across four decades reads as a stall followed by a slam: from 20000 to 2,
//      half-way through a linear move you are still at 10001 -- 0.1% of the way there in perceived terms, having
//      spent 50% of the shot. mixLog puts you at 200, which LOOKS like halfway because each second multiplies
//      the distance by the same factor. This is the single most load-bearing line in the file.
//
//   2. AN ANALYTIC, SINGULARITY-FREE RIG. The obvious way to aim a camera is lookAt(eye, target, worldUp), which
//      builds its basis from cross(worldUp, forward) -- and that cross product VANISHES when you look straight
//      down, which is exactly where a descent shot spends its climax. The frame here is built from the orbit
//      parameters instead: the camera sits at elevation `pitch` above the target's local horizon, and its up
//      vector is the DERIVATIVE of the eye direction with respect to pitch. That derivative is a unit vector,
//      always perpendicular to the view direction, and perfectly continuous THROUGH straight-down -- so there is
//      no angle to avoid and no epsilon to tune.
//
//   3. PER-CHANNEL CURVES, EACH A PURE FUNCTION OF t. Distance, pitch, azimuth, roll and FOV are five
//      independent easings of one normalized time, not a spline through hand-placed keyframes. Purity is not
//      tidiness here: it is what lets a frame-locked recorder seek to frame N and get exactly the frame it would
//      have got playing forward, and what lets this whole file be graded against fixtures with no GPU.
//
// FOV IS A REAL CHANNEL, NOT DECORATION: a hyperzoom is mostly a LENS move (62deg -> 11deg) with the camera
// barely translating, which is a different shot from a dolly even when the framing matches at both ends.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

// ---- small vector helpers (arrays, so nothing here depends on a math library) ----
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * *** THE LOAD-BEARING ONE. *** Interpolate a DISTANCE geometrically, so equal steps of t multiply the distance
 * by equal factors -- which is what a constant perceived zoom rate actually is.
 *
 * MEASURED, 20000 -> 2 (four decades), at t = 0.5:
 *     linear -> 10001.0   (0.1% of the way there perceptually, for 50% of the shot: a stall, then a slam)
 *     mixLog ->   200.0   (exactly halfway in log space, and it looks halfway)
 *
 * Guarded against a non-positive endpoint because log(0) is -Infinity and a zero distance is a camera inside its
 * own subject: both ends are clamped to a small positive epsilon rather than allowed to produce NaN downstream,
 * where it would surface as a black frame rather than as an error.
 */
export function mixLog(d0, d1, t) {
    const a = Math.max(1e-9, d0), b = Math.max(1e-9, d1);
    return Math.exp(lerp(Math.log(a), Math.log(b), t));
}

// ---- easings. Each is a pure function [0,1] -> [0,1] with f(0)=0 and f(1)=1. ----
export const linearE = (t) => clamp01(t);
export const sineInOut = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t));
export const cubicOut = (t) => { const u = 1 - clamp01(t); return 1 - u * u * u; };
export const cubicIn = (t) => { const u = clamp01(t); return u * u * u; };
/** Hold at 0 until `d`, then run `f` over the remainder -- how a channel joins a move already in progress. */
export const delayed = (d, f) => (t) => (clamp01(t) <= d ? 0 : f((clamp01(t) - d) / (1 - d)));
/** Run `f` only up to `d`, then hold at 1 -- a channel that finishes early and lets the others land. */
export const early = (d, f) => (t) => (clamp01(t) >= d ? 1 : f(clamp01(t) / d));

/**
 * The geographic tangent frame at a direction: EAST is the direction of increasing longitude, NORTH completes
 * it. Deliberately the SAME construction world/planetSurface.js uses (its own note: "choosing the frame
 * geographically rather than an arbitrary perpendicular is what makes a banded world checkable"), so a camera
 * azimuth here and a surface gradient there mean the same thing rather than differing by an unstated rotation.
 * At the poles east degenerates and falls back to +x, which is a naming choice, not a discontinuity in the rig:
 * the rig below never differences across it.
 */
export function tangentFrameAt(dir) {
    const d = norm3(dir);
    let e = [d[2], 0, -d[0]];
    const len = Math.hypot(e[0], e[1], e[2]);
    e = len < 1e-6 ? [1, 0, 0] : [e[0] / len, e[1] / len, e[2] / len];
    return { east: e, north: norm3(cross3(d, e)) };
}

/**
 * *** THE SINGULARITY-FREE RIG. *** Place a camera looking at `target`, which sits on a body centred at
 * `center`, from `distance` away, at `pitch` radians above that point's LOCAL horizon and `azimuth` radians
 * around its local vertical.
 *
 * Writing o(p) = n*sin p + h*cos p for the offset direction (n = the local up at the target, h = the horizontal
 * bearing chosen by azimuth), the camera's up is do/dp = n*cos p - h*sin p. That is automatically a UNIT vector
 * and automatically perpendicular to o, for every p, INCLUDING p = pi/2 where lookAt's cross(worldUp, forward)
 * collapses to the zero vector. At p=0 it equals the planet's own up; at p=pi/2 (straight down) it equals -h,
 * a continuous, well-defined choice rather than an epsilon nudged away from a division by zero.
 *
 * @returns {{eye:number[], target:number[], forward:number[], up:number[], right:number[]}}
 */
export function orbitRig({ center = [0, 0, 0], target, distance, pitch = 0, azimuth = 0, roll = 0 }) {
    const n = norm3(sub3(target, center));                 // local up at the target (the surface normal)
    const { east, north } = tangentFrameAt(n);
    const h = norm3(add3(mul3(east, Math.cos(azimuth)), mul3(north, Math.sin(azimuth))));   // horizontal bearing
    const sp = Math.sin(pitch), cp = Math.cos(pitch);
    const o = add3(mul3(n, sp), mul3(h, cp));              // unit: |o|^2 = sp^2 + cp^2 = 1, n perp h
    const eye = add3(target, mul3(o, distance));
    const forward = mul3(o, -1);                            // looking back down at the target
    let up = sub3(mul3(n, cp), mul3(h, sp));                // do/dp -- unit, perpendicular to o, continuous at pi/2
    if (roll) {                                             // Rodrigues about `forward`, which is already unit
        const c = Math.cos(roll), s = Math.sin(roll);
        up = add3(add3(mul3(up, c), mul3(cross3(forward, up), s)), mul3(forward, dot3(forward, up) * (1 - c)));
    }
    return { eye, target: target.slice(), forward, up: norm3(up), right: norm3(cross3(forward, up)) };
}

/**
 * SHOT SHAPES. Each channel is a pure easing of normalized time; the SHOT says how the move is SHAPED and the
 * caller's `from`/`to` say where it runs between, so one shot serves any pair of endpoints. Distance is the
 * exception in kind, not in form: its easing feeds mixLog rather than a lerp.
 */
export const SHOTS = {
    // Fall toward the subject, steepening, then pull up and level off as the ground arrives.
    dive: { dist: cubicIn, pitch: sineInOut, az: delayed(0.35, sineInOut), fov: sineInOut, roll: () => 0 },
    // A steady, even descent -- the honest "come down and look at it" move.
    descent: { dist: sineInOut, pitch: sineInOut, az: sineInOut, fov: sineInOut, roll: () => 0 },
    // Hold the distance and sweep around: azimuth does all the work.
    orbit: { dist: () => 0, pitch: sineInOut, az: linearE, fov: () => 0, roll: () => 0 },
    // Almost entirely a LENS move: the camera barely travels and the field of view collapses.
    hyperzoom: { dist: early(0.25, sineInOut), pitch: sineInOut, az: delayed(0.5, sineInOut), fov: cubicOut, roll: () => 0 },
};

/**
 * Sample a shot at normalized time t. Everything the caller needs for one frame, and NOTHING stateful -- call it
 * with the same t twice and get the same frame twice, which is what makes a frame-locked render possible and
 * what makes this file gradeable without a GPU.
 *
 * @param shot   a key of SHOTS, or a channel object of the same shape
 * @param t      normalized time, clamped to [0,1]
 * @param p      { center, target, from:{distance,pitch,azimuth,fov}, to:{...} }
 */
export function sampleShot(shot, t, p) {
    const S = typeof shot === "string" ? SHOTS[shot] : shot;
    if (!S) throw new Error("unknown shot: " + shot);
    if (!p || !p.target || !p.from || !p.to) throw new TypeError("sampleShot needs { target, from, to }");
    const u = clamp01(t);
    const distance = mixLog(p.from.distance, p.to.distance, S.dist(u));
    const pitch = lerp(p.from.pitch, p.to.pitch, S.pitch(u));
    const azimuth = lerp(p.from.azimuth, p.to.azimuth, S.az(u));
    const fov = lerp(p.from.fov, p.to.fov, S.fov(u));
    const roll = lerp(p.from.roll || 0, p.to.roll || 0, S.roll(u));
    const rig = orbitRig({ center: p.center || [0, 0, 0], target: p.target, distance, pitch, azimuth, roll });
    return { ...rig, distance, pitch, azimuth, roll, fov, t: u };
}
