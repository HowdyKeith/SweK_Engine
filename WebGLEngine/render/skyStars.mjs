// WebGLEngine/render/skyStars.mjs -- v4580
//
// *** THE ENGINE'S OWN NIGHT SKY, AND THE CPU REFERENCE IT NEVER HAD. ***
//
// render/skyRenderer.js is imported by main.js and draws every star the engine shows. Its starfield was
// GLSL-only -- no twin, no gate, nothing that could say what it draws -- and it carried two defects that a
// reference would have caught on the first run.
//
// ---- ONE: THE DENSITY KNOB SILENTLY DIMMED EVERY STAR --------------------------------------------------------
//
// The shader read
//     float threshold = 1.0 - uStarDensity * 0.005;
//     if (h > threshold) { float bright = (h - threshold) / 0.005; ... }
//
// `1.0 - threshold` IS `uStarDensity * 0.005`, so the normalising divisor is only correct at density 1. For a
// star, h - threshold lands in (0, density * 0.005], and dividing by a fixed 0.005 puts `bright` in
// (0, density] instead of (0, 1]. THE BRIGHTEST POSSIBLE STAR AT DENSITY 0.6 IS 0.60, AND AT 0.4 IS 0.40.
//
// That is not hypothetical: main.js sets density 0.4 with brightness 0.7, and density 0.6 with brightness 0.5.
// The "city sky" preset therefore tops out at 0.4 * 0.7 = 0.28 of full brightness while asking for 0.7, and
// the two knobs the API documents as independent were multiplied together. The three star pages fixed at
// v4579 all spell the correct form, `(hh - cut) / (1.0 - cut)`; this one divided by the constant.
//
// ---- TWO: THE SIN-HASH'S TAIL, WHICH IS THE ONLY PART A STAR THRESHOLD READS ---------------------------------
//
// v4579 measured fract(sin(dot(p,K))*43758.5453) reading 12.4 sd below its own cut at 0.986. THIS SITE CUTS
// FAR DEEPER -- density 1.0 is a cut of 0.995, density 0.6 is 0.997, density 0.4 is 0.998 -- AND THE DEFICIT
// GROWS WITH DEPTH. Over a 100^3 cube of integer cells, the fraction admitted against the fraction asked for:
//
//     cut     asked    sin-hash   ratio        cut     asked    sin-hash   ratio
//     0.900   10.00%    9.868%    0.987        0.995    0.500%   0.427%    0.854
//     0.950    5.00%    4.809%    0.962        0.997    0.300%   0.131%    0.437
//     0.986    1.40%    1.279%    0.914        0.998    0.200%   0.108%    0.538
//     0.990    1.00%    0.889%    0.889        0.999    0.100%   0.024%    0.243
//
// *** AT THE ENGINE'S OWN density = 0.6 SETTING THE SKY GETS 44% OF THE STARS IT ASKED FOR. *** Both sin-hash
// variants in this tree show the same curve -- skyRenderer's constants (17.13, 91.71, 53.97) and the star
// pages' (12.9898, 78.233, 37.719) -- so it is the IDIOM and not the constants.
//
// *** AND THE MECHANISM IS COUNTABLE. *** Over 216,000 integer cells the sin-hash produces 7,112 DISTINCT
// VALUES; exact_hash3 produces 216,000. Above 0.997 -- the tail a density-0.6 sky lives in -- the sin-hash
// has NINETEEN distinct values and exact_hash3 has 656. float32 loses the low bits of sin(x) * 43758.5453
// before fract() ever runs, so the output lands on a coarse, uneven lattice, and a threshold cutting a
// 0.003-wide slice is choosing between a handful of levels. A hash that averages into an fbm survives that;
// a threshold does not, which is v4569's finding one level deeper.
//
// ---- WHAT IS NOT CLAIMED -------------------------------------------------------------------------------------
//
// That the old sky looked wrong. A field with 44% of its stars is a sky, and nobody had a reference to compare
// it to -- which is the actual defect and the reason this file exists. The trade is the same one v4579 stated:
// it is a DIFFERENT sky, and no saved screenshot still matches.
"use strict";
import { exactHash3, EXACT_HASH3_GLSL, EXACT_HASH_GLSL } from "./exactHash.mjs";

/** Cells per unit of direction. The shader's `floor(ray * 240.0)`. */
export const CELL_SCALE = 240;
/** Stars are suppressed below this ray.y -- otherwise they show through the ground. */
export const HORIZON_CUT = -0.05;
/** density 1.0 admits this fraction of cells; the cut is 1 - density * DENSITY_SPAN. */
export const DENSITY_SPAN = 0.005;

/**
 * *** THE SEEDS, WHICH REPLACE SIX MAGIC COORDINATE OFFSETS. *** The shader decorrelated its per-star hashes
 * by adding 7.3, 41.3, 53.7, 13.7 and 29.4 to an integer cell -- which works, and is exactly what
 * exactHash3's `seed` argument exists for. Named, so a seventh attribute cannot silently collide with one of
 * the six by picking an offset somebody already used.
 */
export const SEED = Object.freeze({
    exists: 0, palette: 1, driftPhase: 2, driftSpeed: 3, twinklePhase: 4, twinkleSpeed: 5, band: 6,
});

/** The cut a density asks for. Stated once, because the brightness normalisation must use the SAME number. */
export const cutFor = (density) => 1 - density * DENSITY_SPAN;

/**
 * *** THE CPU TWIN. *** What the shader draws along one view direction.
 *
 * Returns null where there is no star -- below the horizon guard, at density 0, or where the cell's hash
 * fails the cut -- and otherwise the cell, its hash, and the brightness in (0, 1].
 */
export function skyStarAt(ray, density) {
    if (!(density > 0)) return null;
    if (ray[1] <= HORIZON_CUT) return null;
    const cut = cutFor(density);
    const cell = [Math.floor(ray[0] * CELL_SCALE), Math.floor(ray[1] * CELL_SCALE), Math.floor(ray[2] * CELL_SCALE)];
    const h = exactHash3(cell[0], cell[1], cell[2], SEED.exists);
    if (h <= cut) return null;
    // (h - cut) / (1 - cut), NOT (h - cut) / DENSITY_SPAN -- see the header. The two agree only at density 1.
    return { cell, hash: h, bright: (h - cut) / (1 - cut) };
}

/** The per-star attributes, each from its own seed at the same cell. */
export function starAttributes(cell) {
    const at = (s) => exactHash3(cell[0], cell[1], cell[2], s);
    return { palette: at(SEED.palette), driftPhase: at(SEED.driftPhase), driftSpeed: at(SEED.driftSpeed),
             twinklePhase: at(SEED.twinklePhase), twinkleSpeed: at(SEED.twinkleSpeed) };
}

/**
 * The GLSL render/skyRenderer.js splices.
 *
 * It carries exact_umix and exact_hash3 with it, so the shader splices ONE string: the dependency is real and
 * leaving a caller to remember the second include is how a shader stops compiling in exactly one place.
 */
export const SKY_STARS_GLSL =
    EXACT_HASH_GLSL.replace(/float exact_hash\(vec2 p[\s\S]*?\n}\n/, "") +   // exact_umix only; the 2-D form is unused
    EXACT_HASH3_GLSL + `
// One hash of one sky cell. The seed picks WHICH attribute, replacing the old coordinate offsets.
float sky_hash(vec3 cellP, uint seed) { return exact_hash3(cellP, seed); }

// Whether this cell holds a star, and how bright. x = brightness in (0,1], 0 when there is none; y = the hash.
vec2 sky_star(vec3 cellP, float density) {
    float cut = 1.0 - density * ${DENSITY_SPAN};
    float h = sky_hash(cellP, ${SEED.exists}u);
    if (h <= cut) { return vec2(0.0, h); }
    return vec2((h - cut) / (1.0 - cut), h);
}
`;
