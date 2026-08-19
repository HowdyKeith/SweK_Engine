// physics/xpbd/volumeKey.mjs
//
// v3459 -- GRADING THE PRESSURE CONSTRAINT, AND A NAME THAT IS WRONG.
//
// volume.js drives a closed mesh's enclosed volume to a target with one global XPBD constraint. Three exact keys
// and one defect.
//
// KEY 1 -- THE GEOMETRY IS EXACT AND ITS ERROR CONVERGES. enclosedVolume is the divergence-theorem sum over
// triangles, so on a sphere mesh it must approach 4/3 pi r^3 as the mesh refines, and at SECOND order in edge
// length because a polyhedron's chord error is quadratic. Measured at r = 1:
//
//     subdiv   faces   volume     relative error   ratio
//     0          8     1.333333   6.82e-1
//     1         32     2.942809   2.97e-1          2.30
//     2        128     3.817730   8.86e-2          3.35
//     3        512     4.091601   2.32e-2          3.82   -> approaching 4, which is second order
//
// KEY 2 -- AT TARGET THE VOLUME IS CONSERVED EXACTLY, not approximately. Every sample bit-identical to the
// first, which is the `exact` verdict rather than a tolerance.
//
// KEY 3 -- THE TARGET IS HIT EXACTLY at every inflation: 0.7 gives 0.700000, 1.5 gives 1.500000, 2.0 gives
// 2.000000 times rest volume. Below target it inflates and above it deflates, and the sign is part of the key.
//
// *** AND generateIcosphere DOES NOT GENERATE AN ICOSPHERE. *** It returns 6 vertices and 8 faces, subdividing
// 8 -> 32 -> 128 -> 512. That is an OCTAHEDRON base. An icosphere starts from an icosahedron -- 12 vertices, 20
// faces, subdividing 20 -> 80 -> 320. The mesh it builds is a perfectly good sphere approximation and every
// number above is correct; the NAME is not, and a reader choosing a subdivision level by icosahedral face counts
// would get a quarter of the triangles they expected.
//
// A NOTE ON THE lambda ARGUMENT, because getting it wrong produced a plausible pass. solveVolume takes lambda as
// a Float64Array. Passing an object gave a "bounded" conservation verdict with a NaN drift -- a verdict computed
// from a series of NaNs, which reads as success. The shape is checked here rather than assumed.

import { generateIcosphere, enclosedVolume, solveVolume } from "./volume.js";

export const SPHERE_VOLUME = (r = 1) => 4 / 3 * Math.PI * r * r * r;

/** Enclosed volume of the generated sphere mesh at a subdivision level, with its error against the exact sphere. */
export function meshVolume(subdiv, radius = 1) {
    const m = generateIcosphere(subdiv);
    const vol = enclosedVolume(m.pos, m.tris);
    const exact = SPHERE_VOLUME(radius);
    return {
        subdiv, faces: m.tris.length, vertices: m.pos.length / 3,
        volume: vol, exact, errFrac: Math.abs(vol - exact) / exact,
    };
}

/** Convergence of the mesh volume toward the analytic sphere, with the ratio between successive levels. */
export function volumeConvergence(levels = [0, 1, 2, 3]) {
    const rows = levels.map((s) => meshVolume(s));
    const errs = rows.map((r) => r.errFrac);
    const ratios = errs.slice(1).map((e, i) => errs[i] / e);
    return { rows, errs, ratios, approachesFour: ratios[ratios.length - 1] > 3.5 };
}

/**
 * Drive the pressure constraint and report the volume series.
 * lambda MUST be a Float64Array -- see the note above about what an object produces.
 */
export function pressureRun({ subdiv = 2, inflation = 1.0, compliance = 1e-6, dt = 1 / 120, steps = 400 } = {}) {
    const m = generateIcosphere(subdiv);
    const pred = Float64Array.from(m.pos);
    const invMass = new Float64Array(pred.length / 3).fill(1);
    const rest = enclosedVolume(pred, m.tris);
    const lambda = new Float64Array(1);
    const series = [];
    for (let s = 0; s < steps; s++) {
        solveVolume(pred, invMass, m.tris, rest, inflation, compliance, dt, lambda);
        series.push(enclosedVolume(pred, m.tris));
    }
    return {
        rest, series,
        final: series[series.length - 1],
        ratio: series[series.length - 1] / rest,
        target: inflation,
        targetErrFrac: Math.abs(series[series.length - 1] / rest - inflation) / inflation,
    };
}

/** Base solid of the generated mesh, reported because the function name claims a different one. */
export function baseSolid() {
    const m = generateIcosphere(0);
    const v = m.pos.length / 3, f = m.tris.length;
    return {
        vertices: v, faces: f,
        isOctahedron: v === 6 && f === 8,
        isIcosahedron: v === 12 && f === 20,
        name: v === 6 && f === 8 ? "octahedron" : v === 12 && f === 20 ? "icosahedron" : "other",
    };
}
