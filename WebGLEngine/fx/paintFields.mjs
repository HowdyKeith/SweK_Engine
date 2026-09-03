// WebGLEngine/fx/paintFields.mjs -- v4423
//
// *** FOUR MORE GENERATORS, AND THE FIRST ONE THAT IS NOT A PICTURE. ***
//
// v4420 evaluated a learned painter across five generators and found it worse than random on every one it
// did not train on. v4422 found the SAME pictures behind a scanline mask do it harder. Both ran on RGB
// rasters, because every target in this arc has been one. physics/render/pathTracer.mjs does not produce a
// raster: render() returns a Float64Array of SCALAR RADIANCE, one number per pixel, and physics/tomography's
// filtered back-projection returns a reconstructed field the same way.
//
// *** SO THE COLOUR HAS TO BE PUT ON, AND HOW IT IS PUT ON IS A CHOICE NOTHING HAS HAD TO MAKE BEFORE. ***
// The same field can be replicated to three identical channels, or mapped through a ramp. THE INFORMATION IS
// IDENTICAL AND THE FITTER'S PROBLEM IS NOT: primitiveFit minimises L2 in RGB, and L2 in RGB after a
// non-linear ramp is not L2 in the field. Neither colouring is wrong; they are different questions, and the
// gate measures how differently they answer.
//
// ---- WHAT THE FOUR ARE, AND WHY EACH ONE IS NOT JUST ANOTHER COLUMN ---------------------------------------------
//
//   traced   a CPU path tracer -- global illumination, soft shadows, a real light transport integral, and the
//            only SCALAR source in the tree. 267 distinct values in 1024 pixels at 16 spp.
//   tomo     a filtered back-projection of a Shepp-Logan-style phantom. NOT A RENDER: a RECONSTRUCTION, with
//            streak artefacts that no forward model produced and that belong to the inverse problem.
//   nebula   procedural fBm. *** ITS HASH IS sin(x*127.1 + y*311.7)*43758.5453, WHICH tools/ship/webgpuHarness
//            RECORDS AS 0.921690 ON A CPU AND 0.240234 ON A GPU FOR THE SAME INPUT. *** So this fixture is
//            portable in a way none of the others are not: it is the one target whose PICTURE would change if
//            it were ever generated on a device, and that is measured here rather than left as a footnote.
//   planet   a seeded procedural globe on a black field -- a subject with a hard silhouette and nothing else,
//            which is the shape v4418 found the screen-space fitter spends a third of its budget outside.
//
// *** AND ONE CANDIDATE IS DELIBERATELY ABSENT. *** ev/pict.js decodes classic-Mac PICT images and would be
// the only NON-PROCEDURAL distribution available -- hand-drawn art rather than a formula. The tree contains no
// .pict asset and nothing calls the decoder, so there is nothing to decode. NAMED HERE BECAUSE "we have a PICT
// decoder" and "we have PICT images" are two different facts and only the first is true.
"use strict";

import { render as tracePath } from "../physics/render/pathTracer.mjs";
import { phantomField, radon, filteredBackProjection, angleSet } from "../physics/tomography/ct.js";
import { PHANTOM } from "../physics/tomography/adjoint.mjs";
import { renderNebulaCPU } from "./nebula/nebula.js";
import { planetSpec, heightAt, surfaceColor } from "../world/procPlanet.js";
import { blackbodyRamp } from "./voxelize/fireRamp.js";
import { blank, mulberry32 } from "./primitiveFit.mjs";

/** The lowest and highest value in a scalar field, so a colouring can be told what its ends are. */
export function fieldRange(field) {
    let lo = Infinity, hi = -Infinity;
    for (const v of field) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return { lo, hi };
}

/**
 * A scalar field as three IDENTICAL channels. *** THE SOLVED COLOUR FOR SUCH A TARGET IS EXACTLY GREY, not
 * nearly: optimalColour averages (t - cur)/a + cur per channel, and three identical inputs give three
 * identical outputs bit for bit. *** So two thirds of the colour solver's work is a copy, and the gate
 * asserts that rather than assuming it.
 */
export function greyImage(field, w, h, range = null) {
    const { lo, hi } = range || fieldRange(field);
    const s = hi > lo ? 255 / (hi - lo) : 0;
    const img = blank(w, h, [0, 0, 0]);
    for (let i = 0; i < w * h; i++) {
        const v = Math.round((field[i] - lo) * s);
        img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v;
    }
    return img;
}

/**
 * The same field through fx/voxelize/fireRamp.js's blackbody ramp -- six stops, cold black to white hot.
 * *** THE RAMP IS PIECEWISE LINEAR AND NOT MONOTONE IN EVERY CHANNEL: *** blue stays at zero for the first
 * two thirds and then climbs, so a difference the grey image renders as 10 units renders as 0 in blue at one
 * end of the range and as 30 at the other. That is the whole reason the two colourings are different problems.
 */
export function rampImage(field, w, h, range = null) {
    const { lo, hi } = range || fieldRange(field);
    const s = hi > lo ? 1 / (hi - lo) : 0;
    const img = blank(w, h, [0, 0, 0]);
    const c = [0, 0, 0];
    for (let i = 0; i < w * h; i++) {
        blackbodyRamp((field[i] - lo) * s, c);
        img.data[i * 4] = Math.round(c[0] * 255); img.data[i * 4 + 1] = Math.round(c[1] * 255); img.data[i * 4 + 2] = Math.round(c[2] * 255);
    }
    return img;
}

/** Scalar radiance from the CPU path tracer. The seed moves the spheres and the camera, not only the noise. */
export function tracedField(w, h, seed = 1, { spp = 16 } = {}) {
    const r = mulberry32(seed >>> 0);
    const scene = [
        { centre: [(r() - 0.5) * 1.6, (r() - 0.5) * 0.6, (r() - 0.5) * 1.2], radius: 0.6 + r() * 0.5, albedo: 0.2 + r() * 0.6 },
        { centre: [(r() - 0.5) * 2.4, -0.4 + r() * 0.3, (r() - 0.5) * 1.2], radius: 0.3 + r() * 0.4, albedo: 0.2 + r() * 0.6 },
        { centre: [0, -101, 0], radius: 100, albedo: 0.25 + r() * 0.4 },
    ];
    return tracePath(scene, { w, h, spp, seed: (seed >>> 0) || 1, eye: [0, 0.5 + r() * 0.4, 3.6 + r() * 0.8], look: [0, 0, 0], fovDeg: 42 });
}

/**
 * A filtered back-projection of an ellipse phantom. *** THIS IS A RECONSTRUCTION AND NOT A RENDER, which is
 * the point of including it: *** the streaks come from the inverse problem's angular undersampling, so the
 * picture contains structure that no object in the scene put there.
 */
export function tomoField(w, h, seed = 1, { angles = 24 } = {}) {
    const N = Math.min(w, h);
    const r = mulberry32(seed >>> 0);
    const ell = PHANTOM.map((e, i) => ({ ...e, cx: e.cx + (r() - 0.5) * 0.3, cy: e.cy + (r() - 0.5) * 0.3,
                                         a: e.a * (0.7 + r() * 0.5), b: e.b * (0.7 + r() * 0.5), phi: e.phi + r() * 1.5 }));
    const truth = phantomField(N, ell);
    const ang = angleSet(angles);
    return filteredBackProjection(radon(truth, N, ang, N), N, ang, N);
}

/**
 * Procedural fBm, straight from the shipped CPU nebula. See the header on its hash.
 *
 * *** THE CAMERA IS IN THE THOUSANDS BECAUSE THE PARALLAX IS 0.00035 PER WORLD UNIT. *** nebulaColorAt offsets
 * its noise by `cam.x * 0.00035` against a domain scaled by 2.4 -- a flight-view parallax, deliberately slow,
 * for a camera that travels thousands of units between scenes. The first draft here seeded cam in +/-20, which
 * moves the sampling point by 0.007 and produces TWENTY-FOUR NEARLY IDENTICAL PICTURES: mean pairwise distance
 * 0.0088 against the other three sources' 0.18 to 0.27. That is the module behaving exactly as designed and
 * the caller picking the wrong scale, and v4420's seedSpread is what caught it -- the third generator in three
 * rounds it has caught, after a Krbn mesh chosen by seed % 4 and a frozen liquefy field.
 */
export function nebulaImage(w, h, seed = 1) {
    const r = mulberry32(seed >>> 0);
    const cam = { x: (r() - 0.5) * 8000, y: (r() - 0.5) * 8000, z: r() * 6 };
    return { data: renderNebulaCPU(w, h, cam, (r() - 0.5) * 1600, 1), w, h };
}

/** A seeded globe on a black field: a subject with a hard silhouette and nothing around it. */
export function planetImage(w, h, seed = 1) {
    const spec = planetSpec(seed >>> 0);
    const img = blank(w, h, [4, 5, 10]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h * 2 - 1, r2 = u * u + v * v;
        if (r2 > 1) continue;
        const z = Math.sqrt(1 - r2);
        const c = surfaceColor(spec, heightAt(spec, u, v, z), v);
        if (!c) continue;
        const lit = Math.max(0.15, 0.35 * u + 0.35 * v + 0.7 * z);
        const i = (y * w + x) * 4;
        img.data[i] = Math.min(255, c[0] * 255 * lit); img.data[i + 1] = Math.min(255, c[1] * 255 * lit); img.data[i + 2] = Math.min(255, c[2] * 255 * lit);
    }
    return img;
}

/** The four, in makeTarget's signature, grey by default -- the colouring is the gate's variable, not a default. */
export const FIELD_GENERATORS = Object.freeze({
    traced: (w, h, s) => greyImage(tracedField(w, h, s), w, h),
    tomo: (w, h, s) => greyImage(tomoField(w, h, s), w, h),
    nebula: nebulaImage,
    planet: planetImage,
});

/** The same scalar sources, coloured through the ramp instead -- identical information, a different problem. */
export const RAMPED_GENERATORS = Object.freeze({
    traced: (w, h, s) => rampImage(tracedField(w, h, s), w, h),
    tomo: (w, h, s) => rampImage(tomoField(w, h, s), w, h),
});

/** True when every pixel has three equal channels -- what a scalar source coloured grey must satisfy. */
export function isGrey(img) {
    for (let i = 0; i < img.data.length; i += 4)
        if (img.data[i] !== img.data[i + 1] || img.data[i + 1] !== img.data[i + 2]) return false;
    return true;
}

/**
 * The nebula's hash at f64 and at f32, for the same inputs. tools/ship/webgpuHarness.mjs's header records
 * sin(i * 12.9898) * 43758.5453 returning 0.921690 on a CPU and 0.240234 on a GPU; this is the same
 * construction in the shipped nebula, and the f32 simulation is the cheapest way to say so without a device.
 */
export function hashPrecisionGap(samples = 64) {
    const f64 = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
    const f32 = (x, y) => {
        const s = Math.fround(Math.sin(Math.fround(Math.fround(Math.fround(x) * Math.fround(127.1)) + Math.fround(Math.fround(y) * Math.fround(311.7)))));
        const v = Math.fround(s * Math.fround(43758.5453));
        return v - Math.floor(v);
    };
    let worst = 0, sum = 0;
    for (let i = 0; i < samples; i++) {
        const x = i * 0.37, y = i * 1.13;
        const d = Math.abs(f64(x, y) - f32(x, y));
        sum += d; if (d > worst) worst = d;
    }
    return { worst, mean: sum / samples, samples };
}
