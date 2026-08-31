// engine/xrPost.mjs -- v4212 -- the post chain in stereo.
//
// *** v4179 SHIPPED THE STEREO DRAW AND DELIBERATELY LEFT THIS OUT, SAYING SO: *** "Deliberately NOT the full
// desktop render block: that block runs shadow cascades, the post chain and the HUD, all of which assume ONE
// camera and one full-screen quad. Two eyes through a full-screen post pass is its own piece of work."
//
// THIS IS THAT PIECE OF WORK, AND THE FINDING IS NOT "THE POST CHAIN DOES NOT RUN IN VR". It is that every
// UV-space effect in the chain SILENTLY MEANS SOMETHING ELSE when the framebuffer holds two eyes instead of
// one image. An XRWebGLLayer hands both eyes ONE framebuffer with two viewports side by side, so a shader
// written in "vUV of the whole target" -- which is every post shader ever written, correctly, for a monitor --
// is now addressing a double-wide image whose middle is the bridge of your nose.
//
// Three concrete consequences, all measured by tools/ship/xrPost-selfcheck.mjs rather than asserted here:
//
//   1. THE BLUR READS ACROSS THE SEAM. render/bloomPass.js's BLUR_FS is a 9-tap Gaussian sampling +/-4 texels
//      along uDir, run at HALF resolution. On a shared framebuffer the horizontal pass at the inner edge of
//      the left eye reaches 4 half-res texels = 8 FULL-RES PIXELS into the right eye, and vice versa. A bright
//      window on one side puts a glow on the other side's inner border, in a place with no light in it. This
//      is the one that cannot be fixed by moving a viewport: SCISSORING RESTRICTS WRITES, NOT READS.
//
//   2. THE VIGNETTE CENTRES ON THE SEAM. The composite does `vec2 ctr = vUV - 0.5`, which is the centre of the
//      TARGET. Two eyes side by side put UV 0.5 exactly on the boundary, so each eye is brightest at its inner
//      edge and darkest at its outer one -- a vignette centred on the nose. The error is not subtle: for the
//      standard even split the naive centre is 0.25 in UV away from each eye's real centre, a QUARTER OF THE
//      FRAMEBUFFER WIDTH.
//
//   3. SCREEN-SPACE SOURCES ARE PROJECTED WITH ONE CAMERA. The god-ray pass takes a single uSunPosUV and the
//      heat-distortion sources are projected through whichever camera was passed last. One screen position
//      cannot be right for two eyes that are looking from different places; that is what stereo IS.
//
// THE FIX FOR ALL THREE IS ONE IDEA: give the chain the EYE'S RECT and express every UV-space quantity
// relative to it. This module is that rect and the arithmetic around it. It holds NO GL -- it is pure so the
// gate can drive it against XRView-shaped fixtures with no headset, the same posture engine/xrSession.mjs
// took at v4179 and brain/transport/scanTwin.mjs took at v4208.
//
// A NOTE ON WHAT THIS DOES NOT CLAIM: it does not claim the post chain now looks RIGHT in a headset. Nobody
// here has a headset. It claims the rect arithmetic is correct, that the naive full-target arithmetic is
// measurably wrong, and that the shader clamp implemented against this rect keeps every sample inside the eye
// that asked for it. Whether the result is comfortable to wear is Keith's to say.

/** The full target, as a rect. Desktop passes this and every formula below reduces to what it always was. */
export const FULL_RECT = Object.freeze({ u0: 0, v0: 0, u1: 1, v1: 1 });

/**
 * A viewport in PIXELS on the layer's shared framebuffer -> a rect in UV.
 * Returns null rather than a wrong rect when the framebuffer size is unusable: a zero width would divide by
 * zero and produce Infinity, and an Infinity in a uniform is a black eye with no error anywhere.
 */
export function uvRectOf(viewport, fbWidth, fbHeight) {
    if (!viewport) return null;
    const W = Number(fbWidth), H = Number(fbHeight);
    if (!(W > 0) || !(H > 0)) return null;
    const { x = 0, y = 0, width = 0, height = 0 } = viewport;
    if (!(width > 0) || !(height > 0)) return null;
    return Object.freeze({ u0: x / W, v0: y / H, u1: (x + width) / W, v1: (y + height) / H });
}

/** Rect width/height in UV, and its centre -- the centre a per-eye vignette must use. */
export function rectSize(r) { return { w: r.u1 - r.u0, h: r.v1 - r.v0 }; }
export function rectCentre(r) { return { u: (r.u0 + r.u1) / 2, v: (r.v0 + r.v1) / 2 }; }

/**
 * How far the NAIVE centre (0.5, 0.5 -- the centre of the whole target) is from this eye's real centre.
 * This is defect 2 expressed as a number, so the gate can assert it is large in stereo and exactly zero on a
 * desktop full-frame rect rather than taking "the vignette is off" on trust.
 */
export function vignetteCentreError(r) {
    const c = rectCentre(r);
    return Math.hypot(c.u - 0.5, c.v - 0.5);
}

/**
 * The eye rects for a set of views, in the order the views came in.
 * @param views  [{ viewport: {x,y,width,height} }, ...] -- XRWebGLLayer.getViewport() shaped
 */
export function eyeRectsFor(views, fbWidth, fbHeight) {
    if (!Array.isArray(views)) return [];
    return views.map((v) => uvRectOf(v && v.viewport, fbWidth, fbHeight)).filter(Boolean);
}

/**
 * Do these rects share one framebuffer side by side, and where do they meet?
 * Returns { shared, seams } -- seams are UV x positions where one rect's right edge meets another's left.
 * An XRWebGLLayer ALWAYS shares (that is what it is), but a layer with one view (a monitor "immersive" mode,
 * or a device reporting a single view) has no seam at all and must not be treated as if it did.
 */
export function seamsOf(rects, eps = 1e-6) {
    const seams = [];
    for (let i = 0; i < rects.length; i++) {
        for (let j = 0; j < rects.length; j++) {
            if (i === j) continue;
            if (Math.abs(rects[i].u1 - rects[j].u0) <= eps && rects[i].u1 > 0 && rects[i].u1 < 1) {
                if (!seams.some((s) => Math.abs(s - rects[i].u1) <= eps)) seams.push(rects[i].u1);
            }
        }
    }
    seams.sort((a, b) => a - b);
    return { shared: rects.length > 1, seams };
}

/**
 * How far, IN FULL-RESOLUTION PIXELS, a separable blur reaches past the pixel it is writing.
 *
 * bloomPass runs its blur at HALF resolution, so one texel step is `downsample` full-res pixels, and the
 * kernel reaches `taps` steps. This is defect 1's magnitude. It is deliberately a function of both numbers
 * rather than the constant 8: change the kernel or the downsample and the gate's expected band changes with
 * it, instead of the comment going quietly stale.
 */
export function blurBleedPixels(taps = 4, downsample = 2) {
    return Math.max(0, taps) * Math.max(1, downsample);
}

/**
 * The band of each eye that an UNCLAMPED blur pollutes, in full-res pixels, given the seams.
 * Returns [{ rect, contaminatedPx, edges }] where edges names WHICH borders are dirty -- an eye at the outer
 * wall of the framebuffer has a clean outer edge and a dirty inner one, and saying "the eye is contaminated"
 * without saying which side would be useless for fixing it.
 */
export function contaminationFor(rects, fbWidth, opts = {}) {
    const bleed = blurBleedPixels(opts.taps ?? 4, opts.downsample ?? 2);
    const { seams } = seamsOf(rects);
    const eps = 1e-6;
    return rects.map((r) => {
        const edges = [];
        for (const s of seams) {
            if (Math.abs(r.u0 - s) <= eps) edges.push("left");
            if (Math.abs(r.u1 - s) <= eps) edges.push("right");
        }
        return { rect: r, contaminatedPx: edges.length ? bleed : 0, edges };
    });
}

/**
 * THE CLAMP ITSELF, as a pure function -- the CPU twin of what the shader does.
 *
 * A blur tap that would leave the eye is pulled back to the eye's last texel, which is the standard
 * clamp-to-edge behaviour a texture would give at the TEXTURE border and does not give at an INTERIOR border.
 * That distinction is the whole bug: GL_CLAMP_TO_EDGE protects the edge of the texture, and the seam is not
 * the edge of the texture, it is the middle of it.
 *
 * `inset` is half a texel in UV, so the clamp lands on the last texel CENTRE rather than on the boundary
 * between two texels -- sampling exactly on the boundary is a coin flip between the two under linear
 * filtering, and the wrong side of that flip is the other eye.
 */
export function clampUVToRect(u, v, r, inset = 0) {
    return {
        u: Math.min(Math.max(u, r.u0 + inset), r.u1 - inset),
        v: Math.min(Math.max(v, r.v0 + inset), r.v1 - inset),
    };
}

/** Half a texel in UV, for the clamp inset above. */
export function halfTexel(fbWidth, fbHeight, downsample = 1) {
    const W = fbWidth / downsample, H = fbHeight / downsample;
    return { u: W > 0 ? 0.5 / W : 0, v: H > 0 ? 0.5 / H : 0 };
}

/**
 * Map a point that is normalised WITHIN one eye (0..1 across that eye) to the shared framebuffer's UV.
 * This is how a per-eye vignette centre, or a per-eye god-ray sun position, is expressed to a shader whose
 * vUV addresses the whole target.
 */
export function eyeUVToTarget(eu, ev, r) {
    return { u: r.u0 + eu * (r.u1 - r.u0), v: r.v0 + ev * (r.v1 - r.v0) };
}

/** ...and back: where does a target UV sit within this eye? Outside 0..1 means it is not in this eye at all. */
export function targetUVToEye(u, v, r) {
    const w = r.u1 - r.u0, h = r.v1 - r.v0;
    return { u: w ? (u - r.u0) / w : 0, v: h ? (v - r.v0) / h : 0 };
}

/** Is this target UV inside the rect (inclusive of its borders)? */
export function rectContains(r, u, v, eps = 1e-9) {
    return u >= r.u0 - eps && u <= r.u1 + eps && v >= r.v0 - eps && v <= r.v1 + eps;
}

/**
 * The plan a renderer needs for one XR frame's post chain.
 *
 * `perEye` is the list of rects to run the chain against. `sharedTarget` says the eyes live in one
 * framebuffer, which is what makes clamping necessary rather than merely tidy. `warnings` names anything the
 * caller cannot fix by clamping -- specifically the single-camera screen-space sources -- because a plan that
 * silently omits what it cannot handle is how a known defect becomes an unknown one.
 */
export function postPlanFor(views, layer, opts = {}) {
    const fbW = layer && (layer.framebufferWidth ?? layer.width);
    const fbH = layer && (layer.framebufferHeight ?? layer.height);
    const rects = eyeRectsFor(views, fbW, fbH);
    const { shared, seams } = seamsOf(rects);
    const warnings = [];
    if (rects.length !== (Array.isArray(views) ? views.length : 0)) {
        warnings.push("some views had no usable viewport and were dropped");
    }
    if (rects.length > 1 && opts.screenSpaceSources) {
        // Deliberately a warning and not a fix. A per-eye sun UV needs the sun reprojected through EACH eye's
        // view-projection, which is the caller's matrix, not this module's rect.
        warnings.push("god rays / heat sources project through ONE camera -- a single screen-space position " +
                      "cannot be correct for two eyes; reproject per eye or disable them in stereo");
    }
    return {
        perEye: rects,
        sharedTarget: shared,
        seams,
        needsClamp: shared && seams.length > 0,
        bleedPx: blurBleedPixels(opts.taps ?? 4, opts.downsample ?? 2),
        warnings,
    };
}

export default {
    FULL_RECT, uvRectOf, rectSize, rectCentre, vignetteCentreError, eyeRectsFor, seamsOf,
    blurBleedPixels, contaminationFor, clampUVToRect, halfTexel, eyeUVToTarget, targetUVToEye,
    rectContains, postPlanFor,
};
