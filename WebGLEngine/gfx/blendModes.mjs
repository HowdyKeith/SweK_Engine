// WebGLEngine/gfx/blendModes.mjs -- v4479
//
// *** gfx/device.js CARRIES topology, cull, frontFace AND NO BLEND AT ALL, SO EVERYTHING IT DRAWS IS OPAQUE. ***
//
// MEASURED, not recalled: `gl.BLEND`, `blendFunc` and `blendEquation` appear ZERO times in gfx/device.js, and
// the WebGPU render pipeline's fragment target carries no `blend` key. Both backends draw with the source
// colour replacing the destination, always. docs/TSL-ROADMAP.md names this as the second thing blocking the
// Slug text arc, in those words: "Blend state on gfx/device.js pipelines. Slug returns colour premultiplied by
// coverage and needs (ONE, ONE_MINUS_SRC_ALPHA); the device carries topology, cull and frontFace and no blend
// at all."
//
// ---- A CORRECTION THIS ROUND OWES, BECAUSE IT ALMOST SHIPPED THE WRONG REASON --------------------------------
//
// The survey that opened this round claimed device.js "cannot express the state where its two backends most
// visibly disagree", and cited the comment at gfx/device.js line 123 as evidence. READ IN FULL, THAT COMMENT IS
// ABOUT MSAA AND NOT ABOUT ALPHA: a WebGL2 canvas defaults to multisampling and WebGPU renders one sample per
// pixel, which made "3,417 of 65,536 pixels differ between the two backends on a scene of 100 small quads,
// every one an edge blended on GL and hard on WebGPU". That disagreement was FOUND AND FIXED at Level 11 by
// defaulting antialias off, with the pixel count measured. It is a solved problem wearing the word "blended".
//
// So the finding is narrower than the survey said and it is still real: there is no blend state, nothing drawn
// through the device can composite, and the roadmap has a named consumer waiting. The overclaim is recorded
// rather than quietly rewritten, because "I cited a comment that says something else" is the same species of
// error as the census this session has re-frozen five times.
//
// ---- WHY NAMED MODES RATHER THAN RAW FACTORS -----------------------------------------------------------------
//
// The two APIs spell the same arithmetic differently -- "one-minus-src-alpha" against gl.ONE_MINUS_SRC_ALPHA --
// so a descriptor carrying raw enums could only ever be right for one backend. A NAME is the thing both can
// keep, and it is what makes a parity gate possible at all: the check iterates this table and asserts the two
// backends produce the same pixels for each entry.
//
// *** AND THE FAILURE MODE THAT MATTERS IS A MISSPELLED MODE SILENTLY DRAWING OPAQUE. *** A caller who asks for
// "premultipled" (or "alpha-blend", or "add") must not get a solid quad and no complaint -- that is a bug that
// looks like a design decision, and it would be found by eye months later on one backend. resolveBlend()
// REFUSES an unknown name. The default is "none", which must be asked for by name or by omission and never
// arrived at by typo.
"use strict";

/**
 * The modes both backends can express, as the pair (srcFactor, dstFactor) applied to colour and alpha.
 * Factors are named in the WebGPU spelling; toGL() maps them to the GL constants.
 */
export const BLEND_MODES = Object.freeze({
    // No blending at all: the source replaces the destination. This is what device.js has always done, and it
    // stays the default so this round changes no existing pixel anywhere.
    none: null,
    // Classic straight-alpha compositing.
    alpha: Object.freeze({ srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" }),
    // *** WHAT SLUG NEEDS. *** Colour already multiplied by coverage, so the source is added whole.
    premultiplied: Object.freeze({ srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }),
    // Glow: light adds to light and nothing occludes.
    additive: Object.freeze({ srcFactor: "one", dstFactor: "one", operation: "add" }),
});

export const BLEND_NAMES = Object.freeze(Object.keys(BLEND_MODES));

/**
 * *** THE REFUSAL. *** An unknown mode name throws rather than falling back to opaque, because a silent
 * fallback is a wrong picture with no error beside it. Omitting blend entirely is still fine and still opaque.
 */
export function resolveBlend(name) {
    if (name == null) return BLEND_MODES.none;
    if (!Object.prototype.hasOwnProperty.call(BLEND_MODES, name)) {
        throw new Error(`gfx/blendModes: unknown blend "${name}" -- one of ${BLEND_NAMES.join(", ")}. ` +
                        "A misspelled mode must not quietly draw opaque.");
    }
    return BLEND_MODES[name];
}

/** The WebGPU fragment-target `blend` object, or undefined when there is none. Colour and alpha share the pair. */
export function toWebGPU(name) {
    const m = resolveBlend(name);
    return m ? { color: { ...m }, alpha: { ...m } } : undefined;
}

/** GL enum NAMES (not values -- this module never imports a context), for webgl2Backend to look up. */
const GL_FACTOR = Object.freeze({
    "one": "ONE", "zero": "ZERO",
    "src-alpha": "SRC_ALPHA", "one-minus-src-alpha": "ONE_MINUS_SRC_ALPHA",
});

/**
 * The GL side, as names a caller resolves against its own context. Returns null for "none" so the caller
 * knows to gl.disable(gl.BLEND) rather than to enable it with an identity it has to invent.
 */
export function toGL(name) {
    const m = resolveBlend(name);
    if (!m) return null;
    const src = GL_FACTOR[m.srcFactor], dst = GL_FACTOR[m.dstFactor];
    if (!src || !dst) throw new Error(`gfx/blendModes: no GL name for ${m.srcFactor}/${m.dstFactor}`);
    return { src, dst, equation: "FUNC_ADD" };
}

/**
 * What the mode DOES, in arithmetic, so a gate can predict a pixel instead of eyeballing one. All channels
 * 0..1. This is the reference the parity check grades both backends against -- neither backend is the answer
 * key, because two backends that agree with each other and disagree with the arithmetic are both wrong.
 */
export function composite(name, src, dst, { clamped = true } = {}) {
    const m = resolveBlend(name);
    if (!m) return [src[0], src[1], src[2], src[3]];
    const f = (which, s, d) => {
        switch (which) {
            case "one": return 1;
            case "zero": return 0;
            case "src-alpha": return src[3];
            case "one-minus-src-alpha": return 1 - src[3];
            default: throw new Error("gfx/blendModes: unhandled factor " + which);
        }
    };
    const sf = f(m.srcFactor), df = f(m.dstFactor);
    // *** CLAMPED, BECAUSE A unorm TARGET CLAMPS AND THE FIRST DRAFT OF THIS FUNCTION DID NOT. ***
    // The parity gate caught it on the device: additive over an opaque destination gives alpha 0.5 + 1.0 = 1.5,
    // and this returned 1.5 -> 383 while BOTH backends returned 255. The two devices agreed with each other AND
    // with the hardware; the reference was the thing that was wrong. Only a three-way comparison could show
    // that -- a check that compared the backends to each other would have called 383-against-255 a pass.
    //
    // The clamp is a property of the TARGET FORMAT, not of the blend: on an rgba16float target additive alpha
    // really would exceed 1 and carry, which is the format gfx/device.js does not have (see the texture-format
    // item). So this takes the format's range rather than assuming one, and the default is the 8-bit unorm the
    // device actually offers today.
    const raw = [0, 1, 2, 3].map((i) => src[i] * sf + dst[i] * df);
    return clamped ? raw.map((x) => (x < 0 ? 0 : x > 1 ? 1 : x)) : raw;
}

/** What v4479 measured. */
export const MEASURED_AT_V4479 = Object.freeze({
    blendCallsInDeviceBefore: 0,        // gl.BLEND / blendFunc / blendEquation, and no WebGPU `blend` key
    modes: 4,                           // none, alpha, premultiplied, additive
    slugNeeds: "premultiplied",         // (ONE, ONE_MINUS_SRC_ALPHA), per docs/TSL-ROADMAP.md item 2
    defaultIsNone: true,                // so no existing pixel in the tree moves
    // The correction this round owes, kept as data so the gate can hold it:
    line123IsAboutMsaaNotAlpha: true,
    msaaPixelsDifferedAtLevel11: 3417,  // of 65,536 -- and antialias:false was the fix, already shipped
    // The parity gate's own finding: the reference was wrong and both devices were right.
    additiveAlphaUnclamped: 1.5,        // 0.5 src over an opaque dst
    additiveAlphaOnUnorm: 1,            // what an 8-bit target actually stores, and what both backends returned
    clampIsTheFormatNotTheBlend: true,  // on rgba16float it would carry -- the format device.js does not have
});
