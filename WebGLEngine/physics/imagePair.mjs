// WebGLEngine/physics/imagePair.mjs — v3339
// ---------------------------------------------------------------------------------------------------------------
// AN IMAGE-BASED CONSISTENCY PAIR — the first on this board that is not a number.
//
// Every pair the consistency board carries compares two SCALARS: a critical temperature, a free energy, a
// viscosity, a diffusion coefficient. This one compares two PICTURES of the same physics, produced by machinery
// that shares no code path, and asks whether they show the same thing.
//
// THE ADMISSION RULE IS UNCHANGED AND IS WHAT MAKES THIS HARD. Two routes may pair only if they are independent
// in MECHANISM. Rendering one scene twice is one mechanism run twice -- reproducibility, which the zero-tolerance
// kernels already do better. So the legitimate image pair is TWO DIFFERENT RENDERERS, or two different solvers
// feeding one renderer, and the mechanism ids say which.
//
// *** AND THE COMPARISON CANNOT BE A PIXEL DIFF. *** Two renderers agree about a scene and disagree about
// antialiasing, sample ordering and the last bit of every colour. A pixel count calls that a difference; it is
// not one. What the pair needs is the question a person asks looking at two pictures -- "is that the same thing"
// -- which is what render/perceptual.mjs answers, and what a hard silhouette gate refuses to let an average
// wash out.
//
// STRUCTURE, HONESTLY: this file supplies the COMPARISON and the pair shape. It does not supply a second
// renderer, because there is not one here that renders the same scene independently. A pair needs two sides and
// this tree currently has one, so the route table below declares the side it HAS and the gate says plainly that
// the pair is incomplete rather than assembling it from one renderer twice.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { ssim, pHash, hamming, edgeOverlap, phashAgreement } from "../render/perceptual.mjs";
import { iou, scaleDelta, combine } from "../render/silhouette.mjs";

/**
 * Compare two renderings of the same scene. Returns the soft ensemble AND the hard verdict, never merged.
 *
 * `hard` must be supplied by the caller with limits it has measured. There is no default, for the reason the
 * whole perceptual round exists: img2threejs's 0.85 is tuned for photographs of knives, and a number nobody here
 * measured is not a threshold, it is a decoration.
 */
export function compareRenders(a, b, { hard = null } = {}) {
    const soft = {
        structure: +phashAgreement(pHash(a), pHash(b)).toFixed(6),
        ssim: +ssim(a, b).toFixed(6),
        edges: +edgeOverlap(a, b).toFixed(6),
    };
    const shape = { silhouetteIoU: iou(a, b).iou, scaleDelta: scaleDelta(a, b) };
    if (!hard) {
        return { soft, shape, verdict: "UNGATED",
                 why: "no hard limits supplied. The soft signals are reported and NOTHING is concluded from them: " +
                      "an ensemble without a veto is a number that always has an answer, which is the failure mode " +
                      "the hard/soft split exists to prevent" };
    }
    const res = combine({
        soft,
        hard: {
            silhouetteIoU: { value: shape.silhouetteIoU, limit: hard.iou, direction: "min" },
            scaleDelta: { value: shape.scaleDelta, limit: hard.scaleDelta, direction: "max" },
        },
    });
    return { ...res, shape };
}

/**
 * The route table entry this tree can honestly offer today: ONE side. A second independent renderer does not
 * exist here, and manufacturing the pair by rendering the same scene twice would be exactly the mistake
 * consistencyFleet refuses -- same mechanism, two hosts, agreement that carries no information.
 */
export const IMAGE_ROUTES = {
    "scene-image/rasteriser": {
        pair: "rendered scene agreement",
        side: "a",
        mechanism: "headless-box-rasteriser",
        note: "the headless side-view rasteriser in physics/backendVisualDiff.mjs. The other side would be a real " +
              "renderer capturing the same scene through the render-qa rig -- which exists, but not yet wired to " +
              "produce the same framing, so the pair is DECLARED INCOMPLETE rather than faked.",
    },
};

/** Is the image pair assemblable yet? Answered honestly rather than optimistically. */
export function imagePairStatus() {
    const sides = Object.values(IMAGE_ROUTES);
    const mechanisms = new Set(sides.map((s) => s.mechanism));
    return {
        sides: sides.length,
        mechanisms: [...mechanisms],
        complete: sides.length >= 2 && mechanisms.size >= 2,
        why: sides.length < 2
            ? "only one side exists. A pair assembled from one mechanism twice would be reproducibility wearing the costume of corroboration"
            : "two sides, two mechanisms",
    };
}
