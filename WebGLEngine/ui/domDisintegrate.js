// FILE: ui/domDisintegrate.js -- v4199
//
// TURN A LIVE DOM ELEMENT INTO COLOURED PARTICLES, by sampling what it actually looks like.
//
// Idea from ZachSaucier/Disintegrate (MIT). *** ALMOST NONE OF IT NEEDED WRITING, AND THAT IS THE POINT. ***
// Its one hard step is DOM -> pixels, which it does with html2canvas. ui/domToTexture.js (v4120) already does
// that -- through SVG <foreignObject>, asking the browser's OWN renderer instead of re-implementing layout --
// and its header names html2canvas as the alternative it REJECTED, three rounds before this file needed it.
// So what remains is pixels -> particles, which is the loop below.
//
// *** AND THE PARTICLES ARE ui/gestureVfx.js's PARTICLES, NOT A SIXTH KIND. *** That module already owns a
// pure particle system -- spawnBurst, stepParticles, particleAlpha, normalised 0..1 positions, a renderer
// drawing whatever it is handed. This file emits into exactly that shape and adds one thing: the pixel's
// COLOUR. stepParticles spreads `...p` when it advances a particle, so r/g/b ride through a stepper that has
// never heard of them, and the existing fade and gravity apply unchanged. A disintegration is a burst that
// remembers what it was.
//
// *** THE LIMITATION IS INHERITED, MEASURED, AND WORTH REPEATING HERE. *** domToTexture MEASURED that a
// nested <canvas> rasterises to ZERO pixels -- a canvas's bitmap is not part of its markup. So disintegrating
// an element that contains a canvas silently loses that region, and "silently" is the problem: the result is
// a plausible cloud with a rectangular hole. sampleParticles reports its own emptiness rather than returning
// [] and letting the caller guess.
"use strict";

import { rasterize } from "./domToTexture.js";

/** The default Disintegrate uses: one particle per 35 pixels. Kept, because it is a good-looking number. */
export const DEFAULT_STRIDE = 6;          // 6 x 6 = 36 pixels per particle

/**
 * Sample an ImageData into particles in ui/gestureVfx.js's shape.
 *
 * Pure: takes { width, height, data } and returns an array. No DOM, so a gate can drive it with a hand-built
 * buffer and check the sampling rather than the browser.
 *
 * @param img    { width, height, data: Uint8ClampedArray RGBA }
 * @param stride sample every Nth pixel in x and y
 * @param minAlpha pixels at or below this alpha are SKIPPED
 */
export function sampleParticles(img, { stride = DEFAULT_STRIDE, minAlpha = 8, speed = 0.35, life = 0.9,
                                       size = 2.2, kind = "impact", rand = Math.random } = {}) {
    const out = [];
    if (!img || !img.data || !(img.width > 0) || !(img.height > 0)) return out;
    const s = Math.max(1, Math.trunc(stride));
    const { width: w, height: h, data } = img;
    for (let y = 0; y < h; y += s) {
        for (let x = 0; x < w; x += s) {
            const i = (y * w + x) * 4;
            const a = data[i + 3];
            // *** TRANSPARENT PIXELS ARE SKIPPED, AND SKIPPING THEM IS THE WHOLE DIFFERENCE BETWEEN A
            // DISINTEGRATING SHAPE AND A DISINTEGRATING RECTANGLE. *** Almost every element is mostly empty
            // space; keeping those pixels gives a perfect bounding box of invisible particles that still
            // cost a step every frame and still hold the frame dirty.
            if (a <= minAlpha) continue;
            const ang = rand() * Math.PI * 2;
            const sp = speed * (0.45 + rand() * 0.75);
            out.push({
                x: (x + 0.5) / w, y: (y + 0.5) / h,        // NORMALISED, matching gestureVfx
                vx: Math.cos(ang) * sp,
                vy: Math.sin(ang) * sp,
                life: life * (0.6 + rand() * 0.7),
                age: 0,
                size: size * (0.7 + rand() * 0.6),
                kind,                                       // a kind stepParticles already knows
                r: data[i], g: data[i + 1], b: data[i + 2], a,
            });
        }
    }
    return out;
}

/**
 * Why a sample came back empty. An empty array has three very different causes and a caller cannot tell them
 * apart -- which is exactly how the nested-canvas limitation would become a mystery bug.
 */
export function explainEmpty(img, opts = {}) {
    if (!img || !img.data) return "no image data -- rasterize() returned null, so the element was never drawn";
    if (!(img.width > 0) || !(img.height > 0)) return `the rasterised canvas is ${img.width}x${img.height}`;
    const minAlpha = opts.minAlpha != null ? opts.minAlpha : 8;
    let lit = 0;
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > minAlpha) { lit++; if (lit > 0) break; }
    if (!lit) {
        return "every pixel is transparent. domToTexture MEASURED that a nested <canvas> rasterises to zero " +
               "pixels (a canvas's bitmap is not part of its markup), and a hidden subtree does the same -- " +
               "see its `exclude` and `stripClasses` options";
    }
    return `the element has content but the stride of ${opts.stride || DEFAULT_STRIDE} landed on no lit pixel`;
}

/**
 * Rasterise an element and sample it. Returns { particles, canvas, why } -- `why` is non-null only when the
 * particle list is empty, so a caller can log a reason instead of an absence.
 */
export async function disintegrate(el, opts = {}) {
    const canvas = await rasterize(el, opts);
    if (!canvas) return { particles: [], canvas: null, why: explainEmpty(null) };
    const ctx = canvas.getContext("2d");
    if (!ctx) return { particles: [], canvas, why: "the rasterised canvas has no 2d context" };
    let img;
    // getImageData throws on a tainted canvas. domToTexture uses a data: URL precisely so this cannot happen,
    // and MEASURED that it does not -- but a caller passing its own `css` with a remote url() could break it,
    // so the failure is reported rather than thrown into an animation frame.
    try { img = ctx.getImageData(0, 0, canvas.width, canvas.height); }
    catch (e) { return { particles: [], canvas, why: "the canvas is tainted: " + e.message }; }
    const particles = sampleParticles(img, opts);
    return { particles, canvas, why: particles.length ? null : explainEmpty(img, opts) };
}
