// WebGLEngine/fx/paintTransforms.mjs -- v4422
//
// *** THE SAME PICTURE, RENDERED DIFFERENTLY -- AN AXIS NOTHING IN THIS ARC HAS VARIED. ***
//
// v4417 varied REPRESENTABILITY, v4418 varied whether a pixel is on the subject, v4419 varied TIME, v4420
// varied the GENERATOR. All four change what the picture is OF. A transform changes none of that: it takes a
// finished picture and re-renders it, so the content is identical by construction and only the presentation
// moves. That is the finest-grained transfer question available, and it is the one v4420's result makes
// worth asking -- a policy that cannot cross from flat regions to a ray-marched frame might still be expected
// to survive the SAME flat regions behind a scanline mask.
//
// ---- TWO TRANSFORMS THAT MOVE OPPOSITE THINGS, WHICH IS WHY BOTH ARE HERE -------------------------------------
//
//   render/crtModel.js   scanlines, a shadow mask, bloom, curvature, vignette and a tint. It rewrites the
//                        COLOUR of nearly every pixel -- 1028 of 4096 bytes survive `arcade` untouched -- and
//                        raises the flat-average start distance by 25% to 120%, because it adds high-frequency
//                        luminance structure that was not in the picture.
//   render/liquefyModel  a displacement field: each output pixel reads from where the field says it came
//                        from. It MOVES content and preserves the colour histogram, so the same start
//                        distance comes back to within 2%. Geometry without colour, against colour without
//                        geometry.
//
// *** AND crtImage WITH PRESETS.off IS THE IDENTITY, BIT FOR BIT -- 4096 of 4096 bytes. *** That is a
// must-not-matter this round did not have to build: a transform in the same list, applied the same way,
// through the same code path, that must change no number anywhere. A result that moved through it would be
// measuring the harness rather than the transform.
"use strict";

import { crtImage, PRESETS } from "../render/crtModel.js";
import { makeField, stampStroke, warp, peakDisplacement } from "../render/liquefyModel.mjs";
import { mulberry32 } from "./primitiveFit.mjs";
import { dims } from "../render/perceptual.mjs";

/** Everything here speaks {data, w, h}; liquefyModel's warp speaks {data, width, height}. One place to bridge. */
const asWH = (img) => { const d = dims(img); return { data: d.data, width: d.w, height: d.h }; };
const asWh = (img) => ({ data: img.data, w: img.width, h: img.height });

/**
 * A seeded displacement field: two strokes whose endpoints and strengths come from the seed, so two seeds
 * warp differently. *** A FIXED FIELD WOULD MAKE "liquefy" ONE PICTURE-TRANSFORM REPEATED, and every episode
 * would meet the same distortion -- the same defect v4420's seedSpread was written to catch one level up.
 */
export function liquefyField(w, h, seed = 1, { strokes = 2 } = {}) {
    const r = mulberry32(seed >>> 0);
    const f = makeField(w, h);
    for (let i = 0; i < strokes; i++) {
        stampStroke(f, r() * w, r() * h, r() * w, r() * h,
                    { strength: 4 + r() * 5, radius: 8 + r() * 10, hardness: 0.3 + r() * 0.5 });
    }
    return f;
}

/**
 * The registry. Each entry is (image, seed) -> image, and every one is the shipped module doing the work:
 * this file owns no scanline, no mask and no resampler.
 */
export const TRANSFORMS = Object.freeze({
    identity: (img) => img,
    crtOff: (img) => { const d = dims(img); return { data: crtImage(d.data, d.w, d.h, PRESETS.off), w: d.w, h: d.h }; },
    crtPipboy: (img) => { const d = dims(img); return { data: crtImage(d.data, d.w, d.h, PRESETS.pipboy), w: d.w, h: d.h }; },
    crtArcade: (img) => { const d = dims(img); return { data: crtImage(d.data, d.w, d.h, PRESETS.arcade), w: d.w, h: d.h }; },
    crtTrinitron: (img) => { const d = dims(img); return { data: crtImage(d.data, d.w, d.h, PRESETS.trinitron), w: d.w, h: d.h }; },
    liquefy: (img, seed = 1) => { const d = dims(img); return asWh(warp(asWH(img), liquefyField(d.w, d.h, seed))); },
});

export const TRANSFORM_NAMES = Object.freeze(Object.keys(TRANSFORMS));
/** The ones that change the picture at all -- crtOff is the identity and belongs on the other side of that line. */
export const REAL_TRANSFORMS = Object.freeze(TRANSFORM_NAMES.filter((n) => n !== "identity" && n !== "crtOff"));

/**
 * A generator with a transform hung on the end, in makeTarget's own (w, h, seed) signature -- so a transformed
 * picture drops into brain/rl/paintEnv.js's targetOf slot exactly like an untransformed one, and v4420's
 * evaluation protocol runs over it unchanged.
 */
export const transformed = (gen, name) => (w, h, seed) => TRANSFORMS[name](gen(w, h, seed), seed);

/** How far a transform moved a picture, and how many bytes it left alone -- the identity check reads both. */
export function transformDelta(img, name, seed = 1) {
    const a = dims(img), out = dims(TRANSFORMS[name](img, seed));
    let same = 0, sq = 0;
    for (let i = 0; i < a.data.length; i++) {
        if (a.data[i] === out.data[i]) same++;
        if (i % 4 !== 3) { const e = a.data[i] - out.data[i]; sq += e * e; }
    }
    return { bytesEqual: same, bytes: a.data.length, rms: Math.sqrt(sq / (a.w * a.h * 3)) / 255 };
}

/** Peak displacement of a seeded field, so the gate can say how far liquefy actually moves things. */
export const liquefyPeak = (w, h, seed) => peakDisplacement(liquefyField(w, h, seed));
