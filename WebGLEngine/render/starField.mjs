// WebGLEngine/render/starField.mjs -- v4579
//
// *** ONE STARFIELD, THREE PAGES, AND IT WAS HAND-COPIED INTO EACH. ***
//
// blackhole.html, flight-gpu.html and wormhole.html each carried their own transcription of the same sky: a
// byte-identical `n3` (md5 a8bec00ebc4c on all three), the same three octaves at sc = 55 * 2^o, the same
// `id = floor(dir * sc)` cell, the same `n3(id + o * 17)` and the same smoothstep falloff. Only the density
// cut differs -- 0.986, 0.987 and 0.985 -- which is a knob and belongs to the page.
//
// *** AND v4578'S OWN RECORD SAID THE CUT WAS IDENTICAL TOO, WHICH IT IS NOT. *** SHADER_SINHASH_V4578 read
// "identical n3 text and the identical `hh > 0.986` cut in blackhole.html, flight-gpu.html and wormhole.html".
// The n3 text is identical; the cut is three different numbers. I generalised from one file after checking the
// function and not the caller, which is the same shape as every other claim this session has had to correct.
//
// ---- WHY THE HASH CHANGED, AND IT IS NOT "A DIFFERENT PATTERN IS BETTER" ------------------------------------
//
// fract(sin(dot(p, K)) * 43758.5453) is uniform enough by DECILE -- both hashes sit within 0.2 points of 10%
// in every tenth. THE STARFIELD DOES NOT READ DECILES, IT READS THE EXTREME TAIL, and there the sin-hash is
// measurably deficient. Over three independent unstrided 80^3 cubes of integer cells, against a cut of 0.986
// that should admit 1.400% if the hash were uniform:
//
//                    cells -40..40    cells 0..80    cells 200..280     expected
//     sin-hash          1.277%          1.320%          1.240%           1.400%
//     exact_hash3       1.411%          1.415%          1.383%           1.400%
//
// The sampling standard deviation is 0.016%, so the sin-hash readings are 7.5, 4.9 and 9.8 sd BELOW the cut
// and the exact ones are inside 1 sd. TWO THINGS FOLLOW. The density knob does not mean what it says -- a page
// asking for 1.4% of cells gets about 1.28%. And the shortfall MOVES WITH THE REGION, 1.240% to 1.320%, so the
// star density depends on which way you are looking, which is the one thing a starfield must not do.
//
// *** THE TRADE, STATED AS A NUMBER: IT IS A COMPLETELY DIFFERENT SKY. *** Over the sampled sphere blackhole
// drew 2,133 stars and now draws 2,316, and 26 of them are in the same cell -- which is chance (1.4% of 2,133
// is about 30). Nobody's saved screenshot of these pages still matches. That is the cost, and the gain is that
// the sky is now the same on every device and a CPU reference can be held to it.
//
// ---- WHAT WAS NOT CLAIMED --------------------------------------------------------------------------------
//
// That the old sky looked wrong. It did not; a starfield 8% short of its own knob is not a thing an eye
// catches, which is exactly why it survived. The evidence here is arithmetic, not aesthetic.
"use strict";
import { exactHash3, EXACT_HASH3_WGSL, EXACT_HASH_WGSL } from "./exactHash.mjs";

/** The three octaves every page drew, and their shared geometry. Not a page's to change without the others. */
export const OCTAVES = 3;
export const BASE_SCALE = 55;
/** Each octave offsets the cell before hashing, so the three layers are decorrelated. */
export const OCTAVE_OFFSET = 17;
/** The tint hash reads the same cell with a different offset. */
export const TINT_OFFSET = 3;
/** Radius falloff inside the cell: smoothstep(FALLOFF, 0, d) about the cell centre. */
export const FALLOFF = 0.55;

/**
 * *** THE CPU TWIN. *** Given a view direction, the stars the shader draws along it.
 *
 * Returns one entry per octave that has a star, with the cell, the hash value and the brightness the shader
 * computes. `cut` is the page's own density knob; everything else is shared and comes from the constants above.
 */
export function starsAlong(dir, { cut, octaves = OCTAVES } = {}) {
    if (!(cut >= 0 && cut < 1)) throw new Error("starsAlong: cut must be in [0, 1)");
    const out = [];
    for (let o = 0; o < octaves; o++) {
        const sc = BASE_SCALE * Math.pow(2, o);
        const id = [Math.floor(dir[0] * sc), Math.floor(dir[1] * sc), Math.floor(dir[2] * sc)];
        const fp = [dir[0] * sc - id[0], dir[1] * sc - id[1], dir[2] * sc - id[2]];
        const k = o * OCTAVE_OFFSET;
        const hh = exactHash3(id[0] + k, id[1] + k, id[2] + k);
        if (hh <= cut) continue;
        const dx = fp[0] - 0.5, dy = fp[1] - 0.5, dz = fp[2] - 0.5;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // smoothstep(FALLOFF, 0.0, d): note the REVERSED edges -- 1 at the centre, 0 at the rim.
        const t = Math.min(1, Math.max(0, (FALLOFF - d) / FALLOFF));
        const star = t * t * (3 - 2 * t) * (hh - cut) / (1 - cut);
        out.push({ octave: o, cell: id, hash: hh, star,
                   tint: exactHash3(id[0] + TINT_OFFSET, id[1] + TINT_OFFSET, id[2] + TINT_OFFSET) });
    }
    return out;
}

/** Whether a direction has a star at all, which is the THRESHOLD the divergence used to move. */
export const hasStar = (dir, cut) => starsAlong(dir, { cut }).length > 0;

/**
 * The WGSL the three pages splice.
 *
 * *** IT CARRIES ITS OWN exact_umix AND exact_hash3, SO A PAGE SPLICES ONE STRING AND NOT THREE. *** The
 * dependency is real -- exact_hash3 calls exact_umix -- and leaving a page to remember the second include is
 * how two of three pages end up with a shader that does not compile.
 */
export const STARFIELD_WGSL =
    EXACT_HASH_WGSL.replace(/fn exact_hash\(p: vec2f[\s\S]*?\n}\n/, "") +   // exact_umix only; the 2-D form is unused here
    EXACT_HASH3_WGSL + `
// One octave's star along a direction. cut is the page's density knob; everything else is shared.
fn starfield_at(dir: vec3f, cut: f32, o: i32) -> vec2f {
    let sc = ${BASE_SCALE}.0 * pow(2.0, f32(o));
    let g = dir * sc;
    let id = floor(g);
    let fp = fract(g);
    let hh = exact_hash3(id + f32(o) * ${OCTAVE_OFFSET}.0, 0u);
    if (hh <= cut) { return vec2f(0.0, 0.0); }
    let d = length(fp - vec3f(0.5));
    let star = smoothstep(${FALLOFF}, 0.0, d) * (hh - cut) / (1.0 - cut);
    return vec2f(star, exact_hash3(id + ${TINT_OFFSET}.0, 0u));
}
`;
