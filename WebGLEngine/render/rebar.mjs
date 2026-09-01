// WebGLEngine/render/rebar.mjs -- v4251
//
// THE STRUCTURES THAT ONLY EXIST WHEN YOU CUT SOMETHING OPEN.
//
// v4243 established that a CSG cut face can be textured by a function of the 3D point, and measured why a
// triplanar projection cannot do it without a seam: an original face and a cut face meet along an edge, being
// an edge means their normals differ, triplanar's weights are a function of the normal, so it jumps 136 of
// 255 across the rim while a solid texture jumps 0.
//
// What that round built was a HOMOGENEOUS material -- concrete aggregate in a cement matrix, statistically the
// same everywhere. This file adds the other half: structures that are ORIENTED and PLACED, so that WHERE the
// break happens changes WHAT the break reveals.
//
// ---- WHY THIS IS THE CASE THAT SETTLES THE ARGUMENT ----------------------------------------------------------
//
// A homogeneous solid texture and a good triplanar projection can be argued about on taste. Rebar cannot.
//
// *** SLICE A CYLINDER AND THE SHAPE OF THE HOLE DEPENDS ON THE ANGLE. *** Cut a rod square-on and the
// exposed cross-section is a CIRCLE of the rod's radius. Cut it obliquely and it is an ELLIPSE, semi-minor
// still r and semi-major r / cos(phi) where phi is the tilt away from perpendicular. Cut along the rod and
// you expose a LENGTH of bar. No 2D projection can produce that, because the shape of the intersection is a
// property of the geometry doing the cutting -- and it is a closed form, so the gate does not have to like
// the picture, it can predict the number and compare.
//
// The same argument in a second material: BEDDING PLANES. Stratified rock is parallel layers at some
// orientation. A cut across the bedding shows stripes whose spacing is the layer pitch divided by the cosine
// of the angle between the cut plane and the layers; a cut along it shows one flat colour. Again a closed
// form, again unreachable by projecting a picture.
//
// ---- AND IT GIVES v4243's SKIN/CUT TAG SOMETHING TO DO -------------------------------------------------------
//
// physics/mesh/meshCSG.mjs tags every output polygon SKIN or CUT (v4243), and so far that tag only selects
// weathering. With rebar the interior has structure the exterior never shows, and a second blast crossing the
// first reveals a rod that is ALREADY CUT -- which the geometry knows and the material can render.
//
// NOTHING IS TAKEN FROM ANY REPOSITORY HERE. Keith's TSL blueprint reached for mx_noise_vec3 and
// mx_cellnoise_vec3, which are three.js MaterialX bindings this tree does not have; a rod field is a
// distance-to-nearest-line, which is a dozen lines of arithmetic and needs no library.
"use strict";

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A rebar cage: rods on a regular grid, running along one or more axes. */
export const REBAR = Object.freeze({
    pitch: 0.30,          // centre-to-centre spacing, world units
    radius: 0.012,        // rod radius -- 24 mm bar, which is a real size
    axes: "xy",           // which directions rods run along: any of "x", "y", "z"
    offset: [0, 0, 0],    // shifts the whole cage, so it need not sit on the origin
});

/**
 * Distance from a point to the nearest rod axis, and which axis family it belongs to.
 *
 * A rod running along X is a line at fixed (y, z), so the distance to the nearest one is the distance in the
 * (y, z) plane to the nearest grid point. That is what makes this cheap: no rod list, no nearest search, just
 * a modulus per axis.
 */
export function rebarDistance(x, y, z, opts = {}) {
    const o = { ...REBAR, ...opts };
    const p = [x - o.offset[0], y - o.offset[1], z - o.offset[2]];
    // distance from a coordinate to the nearest multiple of pitch
    const toGrid = (v) => {
        const m = v / o.pitch;
        return Math.abs(m - Math.round(m)) * o.pitch;
    };
    let best = Infinity, axis = null;
    if (o.axes.includes("x")) {                       // rods along X: vary in (y, z)
        const d = Math.hypot(toGrid(p[1]), toGrid(p[2]));
        if (d < best) { best = d; axis = "x"; }
    }
    if (o.axes.includes("y")) {                       // rods along Y: vary in (x, z)
        const d = Math.hypot(toGrid(p[0]), toGrid(p[2]));
        if (d < best) { best = d; axis = "y"; }
    }
    if (o.axes.includes("z")) {                       // rods along Z: vary in (x, y)
        const d = Math.hypot(toGrid(p[0]), toGrid(p[1]));
        if (d < best) { best = d; axis = "z"; }
    }
    return { dist: best, axis, inside: best <= o.radius };
}

/** Is this point steel? The whole of what a renderer needs. */
export const isRebar = (x, y, z, opts = {}) => rebarDistance(x, y, z, opts).inside;

/** Steel, and how far into the bar -- for shading a cut end brighter at its centre. */
export function rebarAt(x, y, z, opts = {}) {
    const o = { ...REBAR, ...opts };
    const r = rebarDistance(x, y, z, o);
    return { ...r, depth: r.inside ? clamp01(1 - r.dist / o.radius) : 0 };
}

// ---- BEDDING PLANES ------------------------------------------------------------------------------------------

/** Stratified rock: parallel layers of a given thickness, stacked along a unit normal. */
export const BEDDING = Object.freeze({
    thickness: 0.08,
    normal: [0, 1, 0],       // layers stack along this direction
    offset: 0,
});

/**
 * Which layer is this point in, and how far through it?
 * A layer index is just the signed distance along the normal, divided by the thickness.
 */
export function beddingAt(x, y, z, opts = {}) {
    const o = { ...BEDDING, ...opts };
    const n = normalise(o.normal);
    const s = (x * n[0] + y * n[1] + z * n[2]) - o.offset;
    const t = s / o.thickness;
    const layer = Math.floor(t);
    return { layer, through: t - layer, band: ((layer % 2) + 2) % 2 };
}

function normalise(v) {
    const L = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
}

// ---- THE PREDICTIONS THE GATE CHECKS AGAINST -----------------------------------------------------------------
//
// These are exported rather than written into the gate, so the closed form and the thing being graded are the
// same statement. A gate that re-derives the formula is grading its own arithmetic.

/**
 * Semi-major axis of the ellipse a plane cuts from a cylinder.
 *
 * `phi` is the angle between the cut plane's normal and the rod's axis: 0 means the plane is perpendicular to
 * the rod (a circle), and larger angles stretch the section. cos goes to zero as the plane approaches
 * parallel, where the "section" becomes an infinite stripe, which is the length-of-bar case.
 */
export const sectionSemiMajor = (radius, phi) => radius / Math.max(1e-9, Math.cos(phi));

/** Semi-minor is just the radius: the direction across the rod is not foreshortened by tilting. */
export const sectionSemiMinor = (radius) => radius;

/** Eccentricity of that ellipse, which is the shape claim independent of scale. */
export function sectionEccentricity(phi) {
    const a = 1 / Math.max(1e-9, Math.cos(phi)), b = 1;
    return Math.sqrt(Math.max(0, 1 - (b * b) / (a * a)));
}

/**
 * Apparent spacing of a repeating structure on a cut face.
 *
 * Layers of pitch `p` stacked along a normal, cut by a plane whose normal makes angle `theta` with theirs,
 * show stripes `p / sin(theta)` apart -- widest when the cut is nearly parallel to the layers. The same
 * formula gives rod spacing across a cut through a rebar grid.
 */
export const apparentSpacing = (pitch, theta) => pitch / Math.max(1e-9, Math.sin(theta));
