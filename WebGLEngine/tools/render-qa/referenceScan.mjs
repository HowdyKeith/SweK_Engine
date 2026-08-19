// WebGLEngine/tools/render-qa/referenceScan.mjs -- v3475
//
// *** SCAN A REGION WITH THE PATH TRACER AND COMPARE IT TO WHAT THE ENGINE DREW. AND THE WHOLE DESIGN TURNS ON
// KEITH'S DISTINCTION: "a quick indicator, as opposed to a quantifiable measurement". IT IS BOTH, IN DIFFERENT
// SCENES, AND THE TWO MUST NEVER SHARE A VERDICT. ***
//
// ================================================================================================
// TWO MODES, AND MERGING THEM WOULD BE THE DEFECT THIS TREE NAMES MOST OFTEN
// ================================================================================================
//
//   GRADED     -- a CONTROLLED scene where both renderers must agree because the right answer is known.
//                 A furnace patch reads the albedo, flat and exact. Here a residual is a DEFECT and a number,
//                 and a gate may fail on it.
//
//   INDICATOR  -- a general scene, where the raster path does NOT compute global illumination and the two
//                 SHOULD differ. Here the residual is a PICTURE, it is reported, and NOTHING MAY FAIL ON IT.
//
// *** AN INSTRUMENT WHOSE RED STATE IS THE EXPECTED ANSWER HAS FOUND NOTHING. If a general-scene residual were
// gated, the gate would fire on every correct engine and the only way to make it pass would be to break the
// path tracer until it stopped computing the light the raster path never had. THE MODE IS CARRIED IN THE
// RESULT so a caller cannot lose it, and gradeable() is the only thing a gate is allowed to ask. ***
//
// The cost is what makes a REGION the right unit: 4.7M paths/sec measured, so a 64x64 patch at 64 spp is about
// 90 ms -- interactive -- while a 1080p frame at the same quality is nearly half a minute. YOU DO NOT WAIT FOR
// A SLOW PICTURE AND THEN HUNT FOR THE FLAW; YOU POINT AT THE SUSPICIOUS CORNER AND GET GROUND TRUTH FOR IT.
//
// And a region scan is BIT-IDENTICAL to the same patch cut out of a full frame, because pathTracer seeds its
// generator per pixel. Without that the region and the crop would differ by noise and "scan just this corner"
// would be a suggestion rather than a measurement.
"use strict";
import { render } from "../../physics/render/pathTracer.mjs";

export const MODES = ["graded", "indicator"];

/**
 * Path-trace a rectangle of the frame.
 *
 * `mode` is REQUIRED and unvalidated values throw, because a scan that forgets to say what kind of claim it is
 * making is exactly the thing this file exists to prevent.
 */
export function scanRegion(scene, region, opts = {}) {
    const mode = opts.mode;
    if (!MODES.includes(mode)) throw new Error("referenceScan: mode must be one of " + MODES.join("/") + ", got " + mode);
    const t0 = Date.now();
    const pixels = render(scene, { ...opts, region });
    return { mode, region, pixels, ms: Date.now() - t0,
             spp: opts.spp || 64, w: region.w, h: region.h };
}

/** A gate may act on a scan ONLY when it is graded. The one question a caller is allowed to ask. */
export const gradeable = (scan) => scan.mode === "graded";

/**
 * Residual between a scan and the engine's pixels for the same rectangle.
 *
 * Returns the amplified image for a human AND the numbers for a gate -- but the numbers carry the mode with
 * them, so a caller cannot quietly promote an indicator reading into a verdict.
 */
export function residual(scan, enginePixels, { amplify = 40 } = {}) {
    if (enginePixels.length !== scan.pixels.length)
        throw new Error("referenceScan: region is " + scan.pixels.length + " pixels and the engine gave " + enginePixels.length);
    const diff = new Float64Array(scan.pixels.length);
    let worst = 0, sum = 0, differing = 0, signedSum = 0;
    for (let i = 0; i < diff.length; i++) {
        const d = enginePixels[i] - scan.pixels[i];
        diff[i] = Math.min(1, Math.abs(d) * amplify);
        const a = Math.abs(d);
        worst = Math.max(worst, a); sum += a; signedSum += d;
        if (a > 1e-6) differing++;
    }
    return {
        mode: scan.mode, amplified: diff, amplify,
        worst, mean: sum / diff.length, differing, total: diff.length,
        // *** THE SIGN IS REPORTED SEPARATELY FROM THE MAGNITUDE BECAUSE THE TWO FAULTS IT SEPARATES ARE
        // OPPOSITE: v3474 measured that lost energy reads DARK and a double-counted light reads BRIGHT, and a
        // mean absolute difference cannot tell them apart. "Off by 3%" is not a diagnosis; "3% too bright
        // everywhere" is. ***
        bias: signedSum / diff.length,
        verdict: scan.mode === "graded" ? null : "INDICATOR -- reported, never failed on",
    };
}

/** The furnace patch: the one scene where both renderers must agree, and by exactly how much. */
export const furnacePatch = (albedo) => ({
    scene: [{ centre: [0, 0, 0], radius: 1, albedo }],
    sky: () => 1,
    expect: albedo,
});
