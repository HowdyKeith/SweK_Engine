// WebGLEngine/render/passFootprint.mjs -- v4285
//
// *** WHICH POST PASSES CAN BE FUSED INTO ONE DISPATCH, MEASURED RATHER THAN ARGUED. ***
//
// v4284 fused bright + blur-H + blur-V into a single compute dispatch and closed by saying the composite was
// "the one that would decide whether the whole post chain can become one dispatch or merely two."
//
// *** THAT WAS WRONG, AND THIS MODULE IS HOW IT WAS FOUND OUT. *** The composite decides nothing. GOD RAYS
// decides, and it decides NO, at any tile size, for a reason no amount of apron can fix.
//
// ---- THE METHOD: PERTURB ONE TEXEL AND SEE HOW FAR THE DAMAGE TRAVELS -----------------------------------
//
// A pass can be fused into a tile-local dispatch only if its READ FOOTPRINT is bounded by a constant -- an
// apron of A texels around the tile, with A independent of image size. Reading the shader and counting taps
// gives an answer; running it gives the answer. So: render the pass twice, identical but for ONE texel of the
// source, and collect every output pixel that moved. The greatest distance from the perturbed texel to a
// moved pixel IS the footprint radius, and no reading of the source is involved.
//
// Measured on a real WebGL2 driver, perturbing the centre texel:
//
//                      N = 32      N = 64
//     BRIGHT_FS          0           0        constant -- purely local
//     BLUR_FS (H)        4           4        CONSTANT -- a fixed apron works, and 4 is the kernel's reach
//     GODRAYS_FS        15          31        DOUBLES WITH THE IMAGE
//
// *** THE LAST ROW IS THE WHOLE FINDING. *** A footprint that grows with resolution cannot be covered by any
// fixed apron, so god rays cannot join a tile-local dispatch at 8x8, at 32x32, or at any size. And the
// numbers are not merely "big": 15 = 31 - 16 and 31 = 63 - 32, which is exactly the distance from the
// perturbed texel to the FAR CORNER. The pass's true footprint is "the rest of the image along the ray from
// the sun", and the geometry predicts it exactly -- see predictedGodRayRadius below.
//
// ---- WHAT THIS DOES NOT CLAIM ------------------------------------------------------------------------------
//
// The frame is read back as 8 bits, so an influence smaller than 1/255 is invisible and every measured radius
// is a LOWER BOUND. That matters least where it would matter most: the blur's outermost tap has weight
// 0.016216, and the perturbation drives it to about 3.5/255 -- comfortably visible -- so the blur's 4 is a
// real 4 and not a truncation. Stated because a lower bound quoted as a measurement is how an under-selecting
// analysis gets believed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BLOOM_SOURCE = "render/bloomPass.js";

const readBloom = () => fs.readFileSync(path.join(ENG, BLOOM_SOURCE), "utf8");

/** Pull one shader's GLSL out of bloomPass.js by the constants that bracket it. */
export function shaderBetween(a, b, src = readBloom()) {
    const t = src.slice(src.indexOf(a), src.indexOf(b));
    return t.slice(t.indexOf("`") + 1, t.lastIndexOf("`"));
}

/** The god-ray march's constants, read from the shader rather than retyped. */
export function godRayConstants(src = readBloom()) {
    const g = shaderBetween("const GODRAYS_FS", "const COMPOSITE_FS", src);
    const n = /const int N_SAMPLES = (\d+);/.exec(g);
    const d = /const float DENSITY = ([0-9.]+);/.exec(g);
    const k = /const float DECAY = ([0-9.]+);/.exec(g);
    if (!n || !d || !k) throw new Error("passFootprint: could not parse the god-ray constants");
    return { samples: +n[1], density: parseFloat(d[1]), decay: parseFloat(k[1]) };
}

/**
 * How far a perturbation at (px,py) can travel, modelled as a SINGLE ray per output pixel.
 *
 * Each output pixel q marches from itself toward the sun, covering DENSITY of the vector (q - sun), so q is
 * influenced by p when p lies on that segment. The farthest such q is usually the image corner.
 *
 * *** THE MODEL IS EXACT AWAY FROM THE SUN AND UNDERSTATES NEAR IT, AND THAT WAS MEASURED, NOT ASSUMED. ***
 * At the image centre it predicts 15 and 31 against measurements of 15 and 31. One texel from the sun it
 * predicts 3 and the device says 12 -- see MODEL_LIMIT. The reason is that every pixel's ray converges on the
 * sun, so a texel beside the sun lies on rays from all directions at once, and the march's 48 steps are tiny
 * there and land on it from rays this single-ray test rejects as too far off-axis. A model that is right in
 * one regime and quietly wrong in another is worth keeping ONLY if the regimes are named.
 */
export function predictedGodRayRadius(n, sunUV, px, py, { density = godRayConstants().density } = {}) {
    const sx = sunUV[0] * n, sy = sunUV[1] * n;
    let best = 0;
    for (let qy = 0; qy < n; qy++) for (let qx = 0; qx < n; qx++) {
        // does q's march reach p?
        const vx = qx - sx, vy = qy - sy;
        const len2 = vx * vx + vy * vy;
        if (len2 < 1e-9) continue;
        const t = ((px - sx) * vx + (py - sy) * vy) / len2;      // p's projection along q's ray
        if (t < 1 - density || t > 1) continue;                   // outside the marched segment
        const perp = Math.abs((px - sx) * vy - (py - sy) * vx) / Math.sqrt(len2);
        if (perp > 0.75) continue;                                // not on the ray within a texel
        best = Math.max(best, Math.max(Math.abs(qx - px), Math.abs(qy - py)));
    }
    return best;
}

/**
 * Render `fragment` twice -- identical but for ONE texel -- and report how far the difference reached.
 *
 * Returns { radius, moved }: the greatest Chebyshev distance from the perturbed texel to a changed output
 * pixel, and how many pixels changed. radius === -1 means NOTHING changed, which is a real answer and
 * usually means the pass never reads that texel at all.
 *
 * *** THE POKE VALUE IS A PARAMETER BECAUSE A FIXED ONE IS INVISIBLE TO SOME SHADERS. *** The first version
 * always drove the texel to white, and against SSAO_FS that measured a footprint of NOTHING at every radius:
 * white reads as depth 1.0, the shader treats depth >= 0.999 as sky and `continue`s past it, so the poke
 * landed on the one value the pass is written to ignore. A perturbation the shader discards is not evidence
 * that the shader does not read there -- it is evidence about the poke. For a depth pass the poke must be
 * NEARER than the base, which is dark, not white.
 */
export async function perturbFootprint({ render, fragment, vertex, n = 32, px = null, py = null,
                                         base = () => [40, 40, 40, 255], poke = [255, 255, 255, 255],
                                         opts = {} }) {
    const cx = px == null ? n >> 1 : px, cy = py == null ? n >> 1 : py;
    const a = await render({ vertex, fragment, width: n, height: n, srcSize: n, sourceTexel: base, ...opts });
    const b = await render({ vertex, fragment, width: n, height: n, srcSize: n, ...opts,
        sourceTexel: (x, y, N) => (x === cx && y === cy ? poke : base(x, y, N)) });
    if (!a.ok || !b.ok) return { ok: false, reason: a.reason || b.reason, radius: null, moved: 0 };
    // *** A RADIUS FROM A RUN WITH UNRESOLVED UNIFORMS IS VOID, AND SAYING SO IS THE POINT. *** Measuring the
    // composite's heat displacement returned "radius 0, 1 moved" while uHeatRadii and uHeatStrength had
    // silently failed to bind -- they are float ARRAYS and the harness sets scalars and vectors. Zero was the
    // truthful footprint of a shader whose heat was switched off by the binding failure, and it would have
    // been read as the footprint of heat. The names come back from the harness; a caller that ignores them is
    // measuring a different shader from the one it named.
    const unresolved = [...new Set([...(a.unresolved || []), ...(b.unresolved || [])])];
    if (unresolved.length) return { ok: false, void: true, unresolved, radius: null, moved: 0,
        reason: "uniforms did not bind, so any radius would describe a different shader: " + unresolved.join(", ") };
    let radius = -1, moved = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        if (a.pixels[i] === b.pixels[i] && a.pixels[i + 1] === b.pixels[i + 1] && a.pixels[i + 2] === b.pixels[i + 2])
            continue;
        moved++;
        // rows come back top-first; the source's row 0 is the bottom
        const sy = n - 1 - y;
        radius = Math.max(radius, Math.max(Math.abs(x - cx), Math.abs(sy - cy)));
    }
    return { ok: true, radius, moved, at: [cx, cy], unresolved: [] };
}

/**
 * The verdict, per pass. `fusable` is about ONE property only: is the read footprint bounded by a constant?
 *
 * *** "BOUNDED" IS NOT THE SAME AS "SMALL". *** The composite's heat distortion displaces its reads by a
 * data-dependent amount, but that amount is capped by a literal in the shader, so a conservative apron exists
 * and the pass is fusable in principle. God rays has no cap at all: its reach is a fraction of the distance
 * to the sun, which is a fraction of the image.
 */
export const FUSION = Object.freeze({
    bright: Object.freeze({ pass: "BRIGHT_FS", footprint: "constant", radius: 0, fusable: true,
        evidence: "measured", why: "one texel; no neighbourhood at all" }),
    blur: Object.freeze({ pass: "BLUR_FS", footprint: "constant", radius: 4, fusable: true,
        evidence: "measured", why: "a nine-tap separable kernel reaches exactly 4 texels, at 32 and at 64" }),
    ssao: Object.freeze({ pass: "SSAO_FS", footprint: "bounded-by-uniform", radius: null, fusable: true,
        evidence: "measured", why: "eight disc samples at 0.95 * uRadius / max(1,depth) texels. MEASURED at " +
             "uRadius 2, 5, 10 -> radius 2, 5, 9, tracking the uniform; at 20 it reads 16 because the 32px " +
             "frame clips it, not the pass. An apron exists only once somebody bounds uRadius, and at " +
             "uRadius 10 that apron is 9 -- larger than an 8x8 tile" }),
    godRays: Object.freeze({ pass: "GODRAYS_FS", footprint: "scales-with-resolution", radius: null, fusable: false,
        evidence: "measured", why: "15 at N=32 and 31 at N=64: the read set is a LINE across the image, so " +
             "the apron would have to be the image, which is not an apron" }),
    composite: Object.freeze({ pass: "COMPOSITE_FS", footprint: "bounded-by-literal", radius: 1, fusable: true,
        evidence: "measured", why: "MEASURED per input with all five samplers bound separately: uBloom 0 and " +
             "uSSAO 0, and uSceneDepth 1 with 8 pixels moved -- exactly the 3x3 outline Sobel -- but MINUS " +
             "ONE with the outline switched off, because the Sobel never runs. A pass's footprint depends on " +
             "which features are enabled, so an apron must be sized for the FEATURE SET and not the shader. " +
             "It is fusable in itself AND it consumes god rays, which is not" }),
});

// v4288 -- HEAT DISPLACEMENT, NOW EXERCISED BUT NOT CLEANLY MEASURABLE BY THIS METHOD, WHICH IS A DIFFERENT
// AND MORE USEFUL ANSWER THAN "UNMEASURED".
//
// v4286 could not bind its uniforms at all. Three harness gaps later they bind, and the heat path is
// demonstrably LIVE: with one source at strength 1.0 on a striped scene, 4,792 pixels of a 256x256 frame
// change between heat off and heat on. But the perturbation method reports 0 texels at N=128, MINUS ONE at
// N=256, and 1 at N=512, for displacements of 0.45, 0.90 and 1.79 texels.
//
// *** THE MINUS ONE IS THE POINT, AND IT IS A LIMIT OF THE METHOD RATHER THAN A FACT ABOUT THE SHADER. ***
// Perturbation measures a GATHER: poke a source texel, see which output pixels read it. That works when every
// source texel is read by at least one pixel. A DISPLACEMENT field breaks exactly that: each pixel's sample
// point is shifted, so the map from source texel to reading pixel is no longer onto, and a poked texel can be
// read by NOBODY. "Nothing changed" then means the texel was skipped, not that the footprint is small -- and
// it is indistinguishable from a pass that never reads there at all.
export const HEAT = Object.freeze({
    pass: "COMPOSITE_FS heat displacement", footprint: "bounded-by-literal", cap: 0.0035,
    evidence: "exercised, and the method's limit measured rather than a radius",
    activePixels: 4792, activeAt: 256,
    radii: Object.freeze([Object.freeze({ n: 128, texels: 0.45, radius: 0 }),
                          Object.freeze({ n: 256, texels: 0.90, radius: -1 }),
                          Object.freeze({ n: 512, texels: 1.79, radius: 1 })]),
    why: "the displacement is capped by a LITERAL 0.0035 of the image, so the apron is 0.0035*N texels -- " +
         "about 7 at 1080p and 1 at 256. That is derivable from the source and confirmed to have an effect; " +
         "what is NOT available is a perturbation radius, because a displaced read can skip the poked texel",
});

// The heat block's vertical bias, measured because reading it did not settle it.
export const HEAT_BIAS = Object.freeze({
    sourceAtV: 0.5, affectedSourceRows: Object.freeze([0, 149]), n: 256,
    note: "the distortion occupies the region BELOW the source in UV space while the comment beside it says " +
          "it biases ABOVE ('rising heat, not below'). AND THE EXPRESSION IS UNDEFINED BEHAVIOUR: it is " +
          "smoothstep(0.5, -0.5, x), and GLSL ES specifies results are undefined when edge0 >= edge1. It " +
          "happens to behave as a reversed smoothstep wherever the naive formula is used, which is " +
          "everywhere anyone has looked, and that is not the same as being defined. Reported, not changed: " +
          "which way a heat plume should lean is a decision about the picture, and this file measures.",
});

/** The chain cannot be one dispatch, and this says which pass is responsible. */
// MEASURED on google/swiftshader, N=32, sun at (0.02,0.02), perturbing the texel at (1,1).
// The single-ray model says 3. The device says 12. The disagreement is recorded rather than tuned away,
// because the model's job is to check the CENTRE case, and a number it gets wrong elsewhere is a limit of
// the model rather than a fact about the shader.
export const MODEL_LIMIT = Object.freeze({
    at: Object.freeze([1, 1]), n: 32, sun: Object.freeze([0.02, 0.02]),
    modelled: 3, measured: 12, movedPixels: 131,
    why: "near the sun every pixel's ray converges, so one texel lies on rays from all directions and the " +
         "march's steps are small enough to land on it from many of them",
});

export function blockers() {
    return Object.entries(FUSION).filter(([, v]) => !v.fusable).map(([k]) => k);
}
