// WebGLEngine/physics/render/occlusion.mjs -- v3469
//
// *** THE FIRST PIECE THAT MAKES THIS A RENDERER RATHER THAN AN INTEGRATOR -- AND IT IS STILL GRADED BY A
// NUMBER, NOT BY A PICTURE. ***
//
// v3467 built the furnace key (a diffuse sphere of albedo rho in a white environment reads exactly rho) and
// v3468 showed that key GOING EXACT under cosine sampling, so a harder fixture was needed. Occlusion supplies
// one, and its answer is closed-form:
//
// ================================================================================================
// A CAP BLOCKED AROUND THE NORMAL REMOVES EXACTLY sin^2(alpha) OF THE ANSWER
// ================================================================================================
//
//     INT[0..alpha] cos(theta) sin(theta) dtheta dphi = pi sin^2(alpha),   and the whole hemisphere is pi.
//
// So a spherical occluder of radius r whose centre sits at distance d directly along the normal subtends a cap
// of half-angle alpha = asin(r/d), and the shading point reads
//
//     L = rho * (1 - (r/d)^2).
//
// *** THAT (r/d)^2 IS THE INVERSE-SQUARE LAW FALLING OUT OF GEOMETRY WITH NOBODY TYPING IT. It is the same
// point the lesson makes about area lights -- you never apply a distance falloff to them, because the number of
// rays that reach them already encodes it. Here the identical fact is a CHECKABLE PREDICTION: double the
// distance and the blocked fraction must drop by EXACTLY four. ***
//
// ================================================================================================
// AND THE SHARPEST CHECK IS A PARAMETER THAT MUST NOT MATTER
// ================================================================================================
//
// A sphere placed entirely BEHIND the shading point -- below the horizon of its own hemisphere -- must change
// the answer BY NOTHING AT ALL. Not approximately: the rays that would reach it are never cast.
//
// *** THAT IS THE `t > 0` TEST, AND IT IS THE MOST-MADE MISTAKE IN RAY TRACING. A quadratic solved without it
// happily reports intersections BEHIND the ray origin, and the resulting image is not obviously broken -- it is
// just mysteriously too dark in places. The invariance turns that into a number. ***
"use strict";

/**
 * Ray-sphere intersection. Returns the nearest positive t, or null.
 *
 * `noTMin` accepts intersections behind the origin -- the classic bug, as a PARAMETER rather than a warning, so
 * a planted run and a clean run are the same code path.
 */
export function raySphere(orig, dir, centre, radius, { noTMin = false, eps = 1e-6 } = {}) {
    const ox = orig[0] - centre[0], oy = orig[1] - centre[1], oz = orig[2] - centre[2];
    const b = 2 * (dir[0] * ox + dir[1] * oy + dir[2] * oz);
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const disc = b * b - 4 * c;                       // a = 1, directions are unit length
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t0 = (-b - sq) / 2, t1 = (-b + sq) / 2;
    if (noTMin) return Math.abs(t0) < Math.abs(t1) ? t0 : t1;
    if (t0 > eps) return t0;
    if (t1 > eps) return t1;
    return null;
}

/** True when anything stands between the point and the environment along `dir`. */
export const occluded = (orig, dir, spheres, opts) =>
    spheres.some((s) => raySphere(orig, dir, s.centre, s.radius, opts) !== null);

/**
 * The furnace with occluders. Cosine-weighted by default -- v3468 measured it 3.28x tighter, and the point of
 * this file is the geometry, so the sampling should not be the thing adding the noise.
 *
 * A blocked direction contributes ZERO: the occluder is black. Making it grey would be a second unknown in a
 * check whose whole value is having exactly one.
 */
export function furnaceOccluded(albedo, samples, {
    seed = 1, N = [0, 1, 0], P = [0, 0, 0], spheres = [], radiance = () => 1,
    noTMin = false, rng, sampler, frame, toWorld,
} = {}) {
    const rand = rng(seed);
    const { Nt, Nb } = frame(N);
    let sum = 0;
    for (let i = 0; i < samples; i++) {
        const dir = toWorld(sampler(rand(), rand()), N, Nt, Nb);
        if (occluded(P, dir, spheres, { noTMin })) continue;   // black occluder
        const cos = Math.max(0, dir[0] * N[0] + dir[1] * N[1] + dir[2] * N[2]);
        sum += radiance(dir) * cos / (cos / Math.PI);          // cosine-weighted: the cosine cancels
    }
    return (albedo / Math.PI) * (sum / samples);
}

/** The closed form: a cap of half-angle asin(r/d) about the normal removes (r/d)^2 of the answer. */
export const capPrediction = (albedo, r, d) => albedo * (1 - (r / d) * (r / d));
