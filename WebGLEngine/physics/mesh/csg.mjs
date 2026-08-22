// WebGLEngine/physics/mesh/csg.mjs -- v3432
//
// A CSG TREE OF EXACT SIGNED DISTANCE FUNCTIONS, WHICH EXISTS TO BE A CONSUMER.
//
// *** THE INVENTORY AT v3429 FOUND TEN PAGES CONTOURING AN ISOSURFACE AND ALL TEN CONTOURING SOMETHING SMOOTH.
// NO PAGE IN THE TREE DID CSG OR SDF PRIMITIVES AT ALL. *** So dual contouring had no consumer, and a fifth
// mesher with no consumer is the greedyMesh3d situation again. This file is the consumer, and it is built
// first on purpose: THE PAGE HAS TO EXIST BEFORE THE EXTRACTOR DOES.
//
// EVERY PRIMITIVE IS AN EXACT EUCLIDEAN DISTANCE WITH AN ANALYTIC GRADIENT, not a sampled field. That matters
// twice over: the gradient IS the Hermite data dual contouring needs, so the normals are a FACT rather than a
// finite difference, and a corner's position is known in closed form so a mesh can be graded against it rather
// than against a finer mesh of itself.
//
// SIGN CONVENTION: NEGATIVE INSIDE, positive outside -- the standard for SDF work and the OPPOSITE of
// physics/mesh/marchingCubes.js's boxField, which is positive inside. THE TWO ARE NOT INTERCHANGEABLE AND
// NEITHER IS WRONG; v3417 already lost a round to two fields describing one shape, so the convention is stated
// here and asserted in the gate rather than left for a reader to infer.
//
// THE BOOLEANS ARE min/max, WHICH ARE EXACT FOR UNION AND ONLY BOUNDS FOR THE OTHERS. max(-a, b) for a
// subtraction gives the true distance ON the surface and can UNDERESTIMATE it away from the surface, near a
// concave join. That is fine for contouring, which only ever asks about the zero set and its immediate
// neighbourhood, and it is stated because a caller who used this for sphere tracing would need to know.
"use strict";

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
const norm3 = (v) => { const L = len3(v) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };

// ---- PRIMITIVES: value and analytic gradient, side by side so they cannot drift apart -----------------------

/** Sphere of radius r at c. Distance is exact everywhere; the gradient is the radial direction. */
export function sphere(c, r) {
    return {
        kind: "sphere", c, r,
        f: (p) => len3(sub3(p, c)) - r,
        g: (p) => norm3(sub3(p, c)),
    };
}

/**
 * Axis-aligned box of half-extents h at c. THE EXACT DISTANCE, not the cheap max(): outside a box the nearest
 * point can be on a face, an edge or a corner, so it is |max(d,0)| + min(max(dx,dy,dz),0). A box built from
 * max() alone would be wrong exactly at the corners, WHICH IS THE ONE PLACE THIS ROUND IS MEASURING.
 */
export function box(c, h) {
    const dOf = (p) => [Math.abs(p[0] - c[0]) - h[0], Math.abs(p[1] - c[1]) - h[1], Math.abs(p[2] - c[2]) - h[2]];
    return {
        kind: "box", c, h,
        f: (p) => {
            const d = dOf(p);
            const out = [Math.max(d[0], 0), Math.max(d[1], 0), Math.max(d[2], 0)];
            return len3(out) + Math.min(Math.max(d[0], d[1], d[2]), 0);
        },
        g: (p) => {
            const d = dOf(p), s = [Math.sign(p[0] - c[0]) || 1, Math.sign(p[1] - c[1]) || 1, Math.sign(p[2] - c[2]) || 1];
            if (Math.max(d[0], d[1], d[2]) > 0) {                     // outside: gradient of the clamped length
                const out = [Math.max(d[0], 0), Math.max(d[1], 0), Math.max(d[2], 0)];
                return norm3([out[0] * s[0], out[1] * s[1], out[2] * s[2]]);
            }
            // inside: the nearest face is the least-negative component, and the normal is that axis alone
            const i = d[0] >= d[1] && d[0] >= d[2] ? 0 : (d[1] >= d[2] ? 1 : 2);
            const n = [0, 0, 0]; n[i] = s[i];
            return n;
        },
    };
}

/** Cylinder along +y of radius r and half-height hh. Exact, including the rim where cap and wall meet. */
export function cylinder(c, r, hh) {
    const rad = (p) => Math.hypot(p[0] - c[0], p[2] - c[2]);
    return {
        kind: "cylinder", c, r, hh,
        f: (p) => {
            const dx = rad(p) - r, dy = Math.abs(p[1] - c[1]) - hh;
            return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
        },
        g: (p) => {
            const dx = rad(p) - r, dy = Math.abs(p[1] - c[1]) - hh;
            const sy = Math.sign(p[1] - c[1]) || 1, R = rad(p) || 1;
            const radial = [(p[0] - c[0]) / R, 0, (p[2] - c[2]) / R];
            if (Math.max(dx, dy) <= 0) return dx > dy ? radial : [0, sy, 0];
            const a = Math.max(dx, 0), b = Math.max(dy, 0);
            return norm3([radial[0] * a, sy * b, radial[2] * a]);
        },
    };
}

// ---- BOOLEANS ----------------------------------------------------------------------------------------------
// *** THE GRADIENT OF A BOOLEAN IS THE GRADIENT OF WHICHEVER CHILD IS WINNING, AND THAT IS WHY THE CORNER IS
// SHARP. *** At a crease the winner flips discontinuously, so two sample points a hair apart return two
// different plane normals -- which is exactly the Hermite data a QEF needs to place a vertex ON the crease. A
// smoothed blend here would erase the feature before the mesher ever saw it.

export const union = (a, b) => ({
    kind: "union", a, b,
    f: (p) => Math.min(a.f(p), b.f(p)),
    g: (p) => (a.f(p) <= b.f(p) ? a.g(p) : b.g(p)),
});

/** a MINUS b: outside b and inside a. The gradient of the subtracted child is NEGATED -- its surface faces in. */
export const subtract = (a, b) => ({
    kind: "subtract", a, b,
    f: (p) => Math.max(a.f(p), -b.f(p)),
    g: (p) => {
        const fa = a.f(p), fb = -b.f(p);
        if (fa >= fb) return a.g(p);
        const n = b.g(p); return [-n[0], -n[1], -n[2]];
    },
});

export const intersect = (a, b) => ({
    kind: "intersect", a, b,
    f: (p) => Math.max(a.f(p), b.f(p)),
    g: (p) => (a.f(p) >= b.f(p) ? a.g(p) : b.g(p)),
});

// ---- HERMITE DATA ------------------------------------------------------------------------------------------

/**
 * Where the surface crosses the segment ab, and the normal there. THE CROSSING IS FOUND BY BISECTION ON THE
 * SIGN, not by linear interpolation of the values: the field along an edge that straddles a crease is piecewise
 * linear with a KINK, and lerping across the kink puts the point in the wrong place -- which is a small error
 * on a smooth surface and the entire error on a sharp one.
 */
export function edgeCrossing(node, a, b, iters = 40) {
    let fa = node.f(a);
    let lo = a.slice(), hi = b.slice();
    if (fa > 0) { const t = lo; lo = hi; hi = t; fa = node.f(lo); }     // lo is inside (f <= 0)
    for (let i = 0; i < iters; i++) {
        const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
        if (node.f(mid) <= 0) lo = mid; else hi = mid;
    }
    const p = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    return { p, n: node.g(p) };
}

/** A ready-made fixture: a box with a sphere bitten out of one corner. Sharp edges AND a curved concave face. */
export function notchedBox() {
    return subtract(box([0, 0, 0], [0.6, 0.6, 0.6]), sphere([0.6, 0.6, 0.6], 0.45));
}

/** The plainest sharp fixture: one box, eight corners whose positions are known in closed form. */
export const unitBox = (h = 0.6) => box([0, 0, 0], [h, h, h]);
