// WebGLEngine/render/blobField.mjs -- v4427
//
// *** #169 SAYS "TWO BLOBULATORS, ONE SDF, NEVER COMPARED". THE COMPARISON'S FIRST RESULT IS THAT THERE IS NO
// SHARED SDF -- THE TWO PAGES SOLVE DIFFERENT EQUATIONS. ***
//
// blobulator.html builds a SCALAR DENSITY FIELD and marches it at isolevel 0:
//
//     field = 1 - SUM over blobs of  r^2 / (d^2 + 0.35)          (an inverse-square metaball, Blinn-style)
//
// blobulator-gpu.html raymarches a SIGNED DISTANCE FIELD:
//
//     d = smin(d, length(p - c) - r, k)                          (a smooth-minimum union of sphere SDFs)
//
// One is a density thresholded at a level; the other is a distance to a surface. They both look like blobs and
// they are not the same object, so "compare the two implementations of the SDF" had no subject until the
// difference itself was measured.
//
// ---- *** AND `r` IS NOT THE SAME QUANTITY ON THE TWO PAGES, WHICH IS THE PART THAT BITES. *** ---------------
//
// Both pages carry blobs as {x, y, z, r} and hand that same shape to their own field. On the GPU page `r` IS
// the sphere's radius. On the CPU page it is a STRENGTH, and the surface lands where the density crosses zero:
//
//     1 - r^2 / (d^2 + 0.35) = 0     =>     d = sqrt(r^2 - 0.35)
//
// A CLOSED FORM, not a fit -- measured against a bisection to four decimals:
//
//     r        CPU surface radius     ratio to r
//     0.70          0.3742              0.535
//     1.00          0.8064              0.806
//     1.50          1.3786              0.919
//     2.00          1.9106              0.955
//
// *** AND BELOW r = sqrt(0.35) = 0.5916 THE CPU BLOB HAS NO SURFACE AT ALL. *** The density never reaches the
// isolevel, so the blob is INVISIBLE on blobulator.html and a solid sphere of that radius on
// blobulator-gpu.html. That is not a tolerance, it is a blob that one page draws and the other does not.
//
// The same disagreement at the waist between two blobs: unit blobs at x = -1.2 and +1.2 give
//
//     metaball at x=0        -0.1173   INSIDE  -- the blobs have MERGED
//     smin SDF k=0.2         +0.1500   outside -- they are SEPARATE
//     smin SDF k=0.5         +0.0750   outside
//     smin SDF k=0.8         -0.0000   just touching
//
// so for one blob set the two pages disagree about whether the shape is even CONNECTED. The k that makes them
// agree is a property of the scene, not a constant, which is why no single k reconciles the pages.
//
// ---- AND THE SECOND FINDING: fireRamp IS DUPLICATED INTO WGSL AND HAS DRIFTED -------------------------------
//
// blobulator.html line 81 imports the shared ramp:
//
//     import { blackbodyRamp as fireRamp } from "./fx/voxelize/fireRamp.js";
//         // v2438 -- the shared temperature ramp; this page carried a byte-identical copy
//
// v2438 removed a duplicate from THIS page and imported the shared one. IT MISSED THE WGSL COPY ON THE SIBLING
// PAGE, which blobulator-gpu.html still carries as its own `fn fireRamp`. Compared stop by stop, five of six
// match exactly and one has drifted:
//
//     stop      fx/voxelize/fireRamp.js        blobulator-gpu.html
//     0.85      [1.00, 0.82, 0.32]             [1.00, 0.85, 0.35]      <-- 0.03 on two channels
//
// Widest divergence over the ramp: 0.0200 at heat 0.90, and exactly 0.0000 below heat 0.68. A COPY THAT IS
// RIGHT AT FIVE STOPS OF SIX IS THE KIND NOBODY NOTICES, which is what v2438 was trying to prevent and why it
// deduplicated the JS copy in the first place. The WGSL stop is corrected to the shared value at v4427; the
// shared ramp is the source of truth because v2438 said so.
"use strict";

import { blackbodyRamp } from "../fx/voxelize/fireRamp.js";

/** blobulator.html's softening constant, and the reason a small blob can vanish. */
export const META_EPS = 0.35;

/** The radius below which a CPU blob has no surface at all. sqrt(META_EPS). */
export const VANISH_BELOW = Math.sqrt(META_EPS);

/** blobulator.html's field. Negative inside, positive outside, marched at isolevel 0. */
export function metaballField(p, blobs, eps = META_EPS) {
    let sum = 0;
    for (const b of blobs) {
        const dx = p[0] - b.x, dy = p[1] - b.y, dz = p[2] - b.z;
        sum += b.r * b.r / (dx * dx + dy * dy + dz * dz + eps);
    }
    return 1 - sum;
}

/**
 * blobulator-gpu.html's smin, transcribed from the WGSL.
 *
 * *** A TRANSCRIPTION IS A SECOND DECLARATION, AND THIS FILE COMMITTED THE VERY DEFECT IT WAS WRITTEN TO
 * REPORT. *** The first draft asserted the WGSL ramp against the shared one and left THIS function unchecked
 * -- so a sabotage that dropped smin's `- k*h*(1-h)` term cost ZERO RED, and every number downstream (the
 * waist, the connectivity verdict) would have been measuring a function the page does not have. wgslSmin()
 * below reads the page's own text so the gate can compare the two, which is the same treatment the ramp got
 * and should have had from the start.
 */
export function smin(a, b, k) {
    const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b - a) / k));
    return b + (a - b) * h - k * h * (1 - h);
}

/** The page's own smin, parsed out of the WGSL, so the transcription above can be checked rather than trusted. */
export function wgslSmin(src) {
    const seg = src.slice(src.indexOf("fn smin("), src.indexOf("fn mapScene"));
    const h = /let h = clamp\(0\.5 \+ 0\.5 \* \(b - a\) \/ k, 0\.0, 1\.0\);/.test(seg);
    const r = /return mix\(b, a, h\) - k \* h \* \(1\.0 - h\);/.test(seg);
    return { hasClampedH: h, hasMixMinusK: r, matchesJs: h && r, source: seg.trim() };
}

/** blobulator-gpu.html's field. A signed distance. */
export function sminSdf(p, blobs, k) {
    let d = 1e9;
    for (const b of blobs) {
        const dx = p[0] - b.x, dy = p[1] - b.y, dz = p[2] - b.z;
        d = smin(d, Math.hypot(dx, dy, dz) - b.r, k);
    }
    return d;
}

/**
 * Where the CPU page actually puts a lone blob's surface. NaN when the blob never reaches the isolevel.
 * *** DERIVED, NOT FITTED: *** 1 - r^2/(d^2 + eps) = 0 rearranges to d = sqrt(r^2 - eps).
 */
export const metaballSurfaceRadius = (r, eps = META_EPS) =>
    (r * r > eps ? Math.sqrt(r * r - eps) : NaN);

/** Numerically, by bisection, so the closed form above can be checked rather than believed. */
export function metaballSurfaceMeasured(r, eps = META_EPS, step = 2e-4, cap = 8) {
    for (let x = 0; x < cap; x += step) if (metaballField([x, 0, 0], [{ x: 0, y: 0, z: 0, r }], eps) > 0) return x;
    return NaN;
}

/** The six stops of the shared ramp, as {t, r, g, b}, read from the module rather than retyped. */
export function sharedStops(samples = 2001) {
    // The ramp is piecewise linear; its stops are where the slope changes. Reading them by sampling keeps
    // this file from being a second declaration of the table.
    const out = [];
    for (const t of [0, 0.22, 0.45, 0.68, 0.85, 1]) {
        const c = [0, 0, 0]; blackbodyRamp(t, c);
        out.push({ t, r: c[0], g: c[1], b: c[2] });
    }
    return out;
}

/** Parse blobulator-gpu.html's WGSL ramp constants, so drift is read from the page and never assumed. */
export function wgslStops(src) {
    const seg = src.slice(src.indexOf("fn fireRamp"), src.indexOf("fn sky"));
    const cs = [...seg.matchAll(/let c(\d) = vec3f\(([^)]+)\);/g)]
        .map((m) => ({ i: +m[1], v: m[2].split(",").map((s) => parseFloat(s)) }))
        .sort((a, b) => a.i - b.i);
    const ts = [0, 0.22, 0.45, 0.68, 0.85, 1];
    return cs.map((c, i) => ({ t: ts[i], r: c.v[0], g: c.v[1], b: c.v[2] }));
}

/** What v4427 measured. Re-take with: node render/blobField-selfcheck.mjs */
export const MEASURED_AT_V4427 = Object.freeze({
    vanishBelow: 0.5916,
    surfaceRadius: Object.freeze({ 0.7: 0.3742, 1: 0.8062, 1.5: 1.3784, 2: 1.9105 }),
    waist: Object.freeze({ metaball: -0.1173, sdfK02: 0.15, sdfK05: 0.075, sdfK08: 0 }),
    rampStopsTotal: 6, rampStopsDriftedBeforeV4427: 1,
    rampWidestDivergenceBeforeV4427: 0.02,
});
