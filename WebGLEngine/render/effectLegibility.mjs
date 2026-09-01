// ===================================================================
// render/effectLegibility.mjs -- v4261
// -------------------------------------------------------------------
// *** WHAT DOES EACH EFFECT DESTROY? *** The tree has eight image
// passes and has never once asked any of them that. Every gate on
// them checks that the maths matches the shader it was ported from --
// which is the right question about FIDELITY and says nothing about
// what happens to the picture.
//
// v4260 built the missing instrument without meaning to. Its frames
// carry their own index in the pixels, so you can push a known frame
// through a pass and ask the OUTPUT which frame it is. An effect that
// still answers "47" has preserved the picture's identity; one that
// cannot has consumed it. Sweeping the strength knob turns that into
// a dose-response curve, which is a number these passes have never
// had: HOW FAR CAN THIS BE PUSHED BEFORE THE CONTENT IS GONE.
//
// *** AND NONE OF THIS IS A SCORE. *** A pass that destroys the frame
// at 0.75 is not worse than one that survives to 3.0 -- destroying
// the picture is what a heavy stylisation IS. The number says where
// the cliff is, not whether the cliff is bad.
//
// ---- WHAT ASKING THE QUESTION DID TO v4260 ------------------------
//
// The first census run put 1,248 encoded frames through four passes
// and got a CONFIDENT WRONG FRAME NUMBER 182 times -- 14.58%. v4260
// had reasoned that one parity bit catches any single flipped block,
// which is true and was beside the point:
//
//   * frame 1 read as 129 and frame 2 as 130, every time -- bit 7
//     flipped. Bit 7 is the last data block and THE PARITY BLOCK SAT
//     IMMEDIATELY BESIDE IT, both against the right edge, so a warp
//     that pulled that edge flipped the two together and parity
//     stayed consistent. A check bit placed next to the bit it checks
//     is defeated by any spatially local corruption, and spatially
//     local is what every image effect's corruption is.
//     -> TWO MIRRORED BANDS, top and bottom, reversed and inverted.
//        182 silent errors became 3.
//
//   * badTv scored 312 of 312 SURVIVED at every strength to 3x, which
//     read as "horizontal tearing is harmless" and was the instrument
//     being blind. badTv shifts each ROW by its own amount and the
//     decoder was reading two pixel rows: at 3x the row it read was
//     torn 2.17 px while row 24 of the same band was torn 30.28 px,
//     nearly two whole blocks.
//     -> THREE SPREAD ROWS PER BAND, required to agree. 3 became 0,
//        and badTv's honest score is 276 of 312.
//
// Silent errors across the same 1,248 cells: 182 -> 3 -> 0.
// *** THE CENSUS'S FIRST FINDING WAS ABOUT ITS OWN INSTRUMENT, AND
// *** BOTH FIXES LIVE IN render/videoFrames.mjs RATHER THAN HERE. ***
// ===================================================================
"use strict";

import { encodeFrameIndex, decodeFrameIndex } from "./videoFrames.mjs";
import { crtImage, DEFAULTS as CRT_DEFAULTS } from "./crtModel.js";
import * as badTv from "./badTvModel.mjs";
import * as aquarelle from "./aquarelleModel.mjs";
import * as liquefy from "./liquefyModel.mjs";

/**
 * Resample an image through a UV map. The passes that DISPLACE rather than recolour all reduce to this, and
 * writing it once keeps the census measuring the models rather than four copies of a sampler.
 */
export function warpBy(src, w, h, uvAt) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const [su, sv] = uvAt((x + 0.5) / w, (y + 0.5) / h);
            const sx = Math.min(w - 1, Math.max(0, Math.floor(su * w)));
            const sy = Math.min(h - 1, Math.max(0, Math.floor(sv * h)));
            const s = (sy * w + sx) * 4, d = (y * w + x) * 4;
            out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = 255;
        }
    }
    return out;
}

/**
 * The passes, each as `apply(rgba, w, h, k)` where k scales that pass's OWN defaults -- so k = 1 is the look
 * the tree actually ships and k = 0 is a no-op. `kind` records how the pass damages a picture, because the
 * census showed that the KIND of damage decides what an instrument can see.
 */
export const PASSES = Object.freeze({
    crt: {
        kind: "optics",          // barrel, scanlines, mask, vignette: geometric plus multiplicative
        apply: (src, w, h, k) => crtImage(src, w, h, {
            ...CRT_DEFAULTS,
            curvature: CRT_DEFAULTS.curvature * k, scanDepth: CRT_DEFAULTS.scanDepth * k,
            maskDepth: CRT_DEFAULTS.maskDepth * k, vignette: CRT_DEFAULTS.vignette * k,
            bleed: CRT_DEFAULTS.bleed * k,
        }),
    },
    badTv: {
        kind: "per-row",         // *** the kind that fooled the one-row decoder ***
        apply: (src, w, h, k) => warpBy(src, w, h, (u, v) => badTv.sampleAt(u, v, 0, {
            distortion: badTv.DEFAULTS.distortion * k, distortion2: badTv.DEFAULTS.distortion2 * k,
            rollSpeed: 0,        // the roll is a rigid translation and would move the bands off their rows
        })),
    },
    aquarelle: {
        kind: "curl",            // a rotation of the sample point: locally coherent, globally swirling
        apply: (src, w, h, k) => warpBy(src, w, h,
            (u, v) => aquarelle.sourceOffset(u, v, { amplitude: aquarelle.DEFAULTS.amplitude * k })),
    },
    liquefy: {
        kind: "stroke",          // one dragged stroke: violent locally, untouched elsewhere
        apply: (src, w, h, k) => {
            const field = liquefy.makeField(w, h);
            liquefy.stampStroke(field, 10, h * 0.12, w - 10, h * 0.12, { strength: 60 * k, radius: 40, hardness: 0.5 });
            const r = liquefy.warp({ data: src, width: w, height: h }, field, { clampEdges: true });
            return r && r.data ? r.data : r;
        },
    },
});

/** The default sweep. Runs to 3x because two of the four passes are still legible at their shipped strength. */
export const STRENGTHS = Object.freeze([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]);

/**
 * Push `frames` known frames through one pass at one strength and count what came back.
 *
 * `silent` is the number that matters and it must be ZERO: a frame that decodes to the wrong index is a
 * pipeline lying about its own contents, which is worse than one that admits it lost the picture.
 */
export function legibilityAt(apply, k, { frames = 24, w = 176, h = 128 } = {}) {
    let correct = 0, unreadable = 0, silent = 0;
    for (let n = 0; n < frames; n++) {
        const got = decodeFrameIndex(apply(encodeFrameIndex(n, w, h), w, h, k), w, h);
        if (got === n) correct++; else if (got < 0) unreadable++; else silent++;
    }
    return { k, frames, correct, unreadable, silent, rate: frames ? correct / frames : 0 };
}

/** The whole dose-response curve for one pass. */
export function legibilityCurve(apply, opts = {}) {
    return (opts.strengths || STRENGTHS).map((k) => legibilityAt(apply, k, opts));
}

/**
 * The FIRST strength at which legibility drops below `floor`, and whether the curve is monotone.
 *
 * `floor` defaults to 1, meaning EVERY frame must still decode. That is strict on purpose: one frame in
 * twenty-four that has lost its identity is a pass that has started destroying the picture.
 *
 * *** AND `monotone` IS HERE BECAUSE I BELIEVED SOMETHING FALSE. *** Under v4260's encoding liquefy read
 * 42, 42, unreadable, unreadable, and then READABLE AGAIN at higher strength, and I wrote that up as a real
 * property -- a displacement large enough to carry a block cleanly onto a neighbour's position landing back
 * on something decodable. It was not a property. Those three "recoveries" were the silent misreads (87, 87,
 * 63) that the two-band fix then eliminated, and with the corrected encoding all four passes are monotone.
 * So this is returned as a CHECK, not as documented behaviour: it has been true every time so far, and a
 * caller that reads only `first` should still learn when that single number would be a lie.
 */
export function firstFailure(curve, floor = 1) {
    let first = null, monotone = true;
    for (let i = 0; i < curve.length; i++) {
        if (first === null && curve[i].rate < floor) first = curve[i].k;
        if (i > 0 && curve[i].rate > curve[i - 1].rate + 1e-9) monotone = false;
    }
    return { first, monotone, survivesAll: first === null };
}

/** Every pass, swept. `silentTotal` is the census's own health check and belongs to the INSTRUMENT. */
export function census(opts = {}) {
    const passes = opts.passes || PASSES;
    const out = {};
    let silentTotal = 0, cells = 0;
    for (const [name, p] of Object.entries(passes)) {
        const curve = legibilityCurve(p.apply, opts);
        for (const c of curve) { silentTotal += c.silent; cells += c.frames; }
        out[name] = { kind: p.kind, curve, ...firstFailure(curve) };
    }
    return { passes: out, silentTotal, cells };
}
