// WebGLEngine/tools/roundhouse/refScanBind.mjs -- v3487
// ---------------------------------------------------------------------------------------------------------------
// THE REFERENCE REGION SCAN AS A LAB DEVICE, AND THE ONLY REASON IT IS ALLOWED TO BE ONE IS THAT EXACTLY ONE OF
// ITS TWO MODES HAS AN ANSWER.
//
// v3475 built referenceScan with the split that decides everything here: GRADED is a controlled scene where the
// answer is known and a residual is a defect; INDICATOR is a general scene where the raster path computes no
// global illumination and the two SHOULD differ, so the residual is a picture and nothing may fail on it.
//
// *** AN AGENT MAY CALL A SCAN FREELY AND MAY CONCLUDE FROM IT ONLY IN A CONTROLLED SCENE. That is why this
// device exists at all: the roundhouse loop crystallises a claim on whatever observable it is handed, and if an
// INDICATOR residual were an observable the loop could crystallise on, the lab would report a defect on a
// correct engine every single round -- because the raster path genuinely does not compute global illumination
// and it is RIGHT to disagree. AN INSTRUMENT WHOSE RED STATE IS THE EXPECTED ANSWER HAS FOUND NOTHING. ***
//
// So `indicator` is a REPORTED mode: it returns numbers and it returns `mayConclude: false` beside them, and
// the observable that carries the residual is named `indicatorResidual` rather than an error.
//
// ================================================================================================
// WHAT THIS DEVICE ADDS THAT referenceScan-selfcheck DOES NOT ALREADY HOLD
// ================================================================================================
//
// A second copy of somebody else's check is not a key (v3423). That gate proves the crop identity AT ONE
// RECTANGLE on one sky, and the graded patch AT ONE ALBEDO. Three things here are new:
//
//   1. THE ALBEDO IS SWEPT, so the key is not tuned to 0.18 -- the number everybody quotes and the one Keith's
//      screenshot showed. v3467 made exactly this argument about the analytic furnace; nothing had made it
//      through a camera.
//   2. THE CROP IDENTITY IS SWEPT over rectangles including a 1x1 and one touching the frame edge, where
//      off-by-one arithmetic in the region offsets shows up first.
//   3. *** THE CLAIM IS SHOWN FAILING. *** referenceScan-selfcheck asserts the crop difference is 0 and has
//      never seen it be anything else, which is the ratchet-nobody-has-watched-fire shape (v3142). The plant
//      here is a REAL implementation choice -- one streamed generator instead of one seeded per pixel -- and it
//      breaks that identity while leaving the furnace answer untouched.
//
// ================================================================================================
// THE PLANT, AND IT IS INVISIBLE TO THE HEADLINE MODE
// ================================================================================================
//
// `planted` sets pathTracer's `streamRng`. With a CONSTANT sky every sample carries the same radiance, so which
// random numbers a pixel drew cannot change what it reads: the furnace still returns the albedo exactly AND the
// crop still matches, because there is no noise for the two sequences to differ in. Only a gradient sky exposes
// it. *** A DEVICE GRADED ON THE FURNACE ALONE WOULD RATE THE PLANTED SCAN A PERFECT RENDERER, which is the
// fifth round running where the result is which key catches which fault. ***
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { scanRegion, residual, gradeable, furnacePatch } from "../render-qa/referenceScan.mjs";
import { render } from "../../physics/render/pathTracer.mjs";

export const REFSCAN_MODES = ["furnace", "crop", "sign", "decision", "roulette"];

// A small frame on purpose: this device is asked at every mode by several gates, and the region is the whole
// argument for the instrument -- pointing at a patch rather than waiting for a picture.
const DEF = {
    w: 48, h: 48, spp: 12, seed: 3, fovDeg: 40, maxDepth: 4,
    albedo: 0.18, patchW: 8, patchH: 8, rrQ: 0.7, skyTilt: 1.4,
};
const CAM = (c) => ({ w: c.w, h: c.h, spp: c.spp, seed: c.seed, eye: [0, 0, 4], look: [0, 0, 0],
                      fovDeg: c.fovDeg, maxDepth: c.maxDepth });

// A GRADIENT sky. The crop identity is checked here and never on the furnace's constant one, because on a
// constant sky every sample is identical and the test would pass on a broken seeding scheme.
const tiltedSky = (k) => (d) => 0.3 + k * Math.max(0, d[1]);

export const REFSCAN_OBSERVABLES = [
    "worstAlbedoErrFrac", "albedosTested", "furnaceSpread", "furnaceGradeable", "furnaceMean",
    "worstCropDiff", "cropRegions", "cropDiffAltSky", "cropSkyGraded",
    "brightBias", "darkBias", "signMeanGap",
    "gradedGradeable", "indicatorGradeable", "gradedVerdictNull", "indicatorVerdictSet",
    "arbitrarySceneGradeable", "indicatorResidual", "mayConclude",
    "meanNoRR", "meanRR", "spreadNoRR", "spreadRR", "meanShiftFrac",
    "planted",
];

export function defaults({ mode = "furnace", config = {} } = {}) {
    if (!REFSCAN_MODES.includes(mode)) return null;      // a refusal, not a silent substitution
    return { mode, config: { ...DEF, ...config } };
}

const centreRegion = (c) => ({ x0: Math.floor((c.w - c.patchW) / 2), y0: Math.floor((c.h - c.patchH) / 2),
                               w: c.patchW, h: c.patchH });

export function build({ mode = "furnace", config = {} } = {}) {
    if (!REFSCAN_MODES.includes(mode)) throw new Error("refscan: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const planted = !!c.planted;
    const streamRng = planted;
    const blank = { planted };

    if (mode === "furnace") {
        // *** THE ALBEDO IS SWEPT AND THE ERROR IS A FRACTION OF IT, so the key cannot be tuned to 0.18. The
        // estimator is never told rho -- it enters as a scale and the 1/2 comes out of the sampling. ***
        const albedos = [0.05, c.albedo, 0.5, 0.9];
        const R = centreRegion(c);
        let worst = 0, spread = 0, mean = 0, gradeableAll = true;
        for (const rho of albedos) {
            const F = furnacePatch(rho);
            const scan = scanRegion(F.scene, R, { ...CAM(c), sky: F.sky, mode: "graded", streamRng });
            const v = [...scan.pixels];
            worst = Math.max(worst, ...v.map((x) => Math.abs(x - F.expect) / F.expect));
            spread = Math.max(spread, Math.max(...v) - Math.min(...v));
            if (rho === c.albedo) mean = v.reduce((a, b) => a + b, 0) / v.length;
            gradeableAll = gradeableAll && gradeable(scan);
        }
        return { ...blank, worstAlbedoErrFrac: worst, albedosTested: albedos.length,
                 furnaceSpread: spread, furnaceMean: mean, furnaceGradeable: gradeableAll };
    }

    if (mode === "crop") {
        // *** THE PROPERTY THAT MAKES A REGION A MEASUREMENT RATHER THAN A SUGGESTION, AND THE ONE THE PLANT
        // BREAKS. A scan of a rectangle must equal the same rectangle cut out of the whole frame, BIT FOR BIT.
        // Swept over five rectangles including a 1x1 and one touching the edge. ***
        const F = furnacePatch(0.6);
        const regions = [
            { x0: 19, y0: 27, w: 17, h: 11 },
            { x0: 0, y0: 0, w: 1, h: 1 },
            { x0: 0, y0: 0, w: 9, h: 5 },
            { x0: c.w - 6, y0: c.h - 6, w: 6, h: 6 },
            { x0: 12, y0: 3, w: 4, h: 20 },
        ];
        const worstAt = (k) => {
            const opts = { ...CAM(c), sky: tiltedSky(k), streamRng };
            const full = render(F.scene, opts);
            let worst = 0;
            for (const R of regions) {
                const scan = scanRegion(F.scene, R, { ...opts, mode: "indicator" });
                for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++)
                    worst = Math.max(worst, Math.abs(scan.pixels[y * R.w + x] - full[(y + R.y0) * c.w + (x + R.x0)]));
            }
            return worst;
        };
        // *** v4056 -- `cropSky: c.skyTilt` USED TO BE HERE, AND IT WAS THE KNOB HANDED BACK. *** The census
        // read skyTilt as ECHOED AND IGNORED in `crop` -- the deaf-knob shape, the same signature as the lab's
        // planted deaf knob -- and the reading was right about the echo and wrong about the implication. crop
        // DOES use skyTilt: it builds the sky both sides render under. The knob moves nothing because THE KEY
        // HOLDS: a scanned rectangle equals that rectangle cut from the full frame whatever the sky is, so a
        // number that changed with the tilt would be the defect. This is mpmstep.nu exactly -- flat BECAUSE
        // the claim is true -- and echoing the input turned that into a suspicion.
        //
        // So the echo is replaced by the thing it was standing in for: THE SAME CHECK UNDER A DIFFERENT SKY,
        // which states the independence instead of gesturing at it.
        //
        // *** AND THE ALTERNATE KEEPS A GRADIENT, WHICH IS WHY IT IS NOT SIMPLY 0. *** This file's header
        // says a CONSTANT sky is where the plant hides: every sample carries the same radiance, so the two RNG
        // streams have little noise to differ in. MEASURED rather than taken from the header, because the
        // header overstates it: at skyTilt 0 the planted crop diff is 0.04, not 0 -- detectable, but an order
        // of magnitude weaker than the 0.23 the same plant produces once a gradient is restored. So a flat
        // alternate would not have been a check that CANNOT fail; it would have been the weakest available
        // second opinion, chosen from the one region the file warns about. Doubling keeps the gradient and
        // cannot coincide with the original; k === 0 is sent to 1 rather than staying flat.
        const altK = c.skyTilt === 0 ? 1 : c.skyTilt * 2;
        // A LOAD-BEARING NEGATIVE NEEDS A WITNESS THAT THE RUN COULD HAVE FAILED (mpmstep's blockFell). With
        // skyTilt at 0 the primary check is vacuous against the plant, so whether the sky it used actually has
        // a gradient is reported beside the zero rather than assumed.
        return { ...blank, worstCropDiff: worstAt(c.skyTilt), cropRegions: regions.length,
                 cropDiffAltSky: worstAt(altK), cropSkyGraded: c.skyTilt !== 0 };
    }

    if (mode === "sign") {
        // THE SIGN IS REPORTED APART FROM THE MAGNITUDE BECAUSE THE TWO FAULTS IT SEPARATES ARE OPPOSITE: lost
        // energy reads DARK, a double-counted light reads BRIGHT, and a mean absolute difference cannot tell
        // them apart. "Off by 3%" is not a diagnosis; "3% too bright everywhere" is.
        const F = furnacePatch(c.albedo);
        const scan = scanRegion(F.scene, centreRegion(c), { ...CAM(c), sky: F.sky, mode: "graded", streamRng });
        const bright = residual(scan, scan.pixels.map((v) => v * 1.03));
        const dark = residual(scan, scan.pixels.map((v) => v * 0.97));
        return { ...blank, brightBias: bright.bias, darkBias: dark.bias,
                 signMeanGap: Math.abs(bright.mean - dark.mean) };
    }

    if (mode === "decision") {
        // *** THE MODE THE ROUNDHOUSE ACTUALLY NEEDS: WHICH SCANS MAY BE CONCLUDED FROM. gradeable() is the one
        // question a caller is allowed to ask, and this mode makes the answer an observable so a claim can be
        // REFUSED against it rather than against a residual. ***
        const F = furnacePatch(0.6);
        const R = { x0: 20, y0: 20, w: 8, h: 8 };
        const ind = scanRegion(F.scene, R, { ...CAM(c), sky: tiltedSky(c.skyTilt), mode: "indicator", streamRng });
        const grd = scanRegion(F.scene, R, { ...CAM(c), sky: () => 1, mode: "graded", streamRng });
        const indRes = residual(ind, ind.pixels.map((v) => v * 0.8));   // a "raster" that lacks the bounce light
        // *** AND THE HONEST LIMIT, MEASURED RATHER THAN ASSUMED: `mode` IS A LABEL THE CALLER WRITES AND
        // NOTHING CHECKS IT AGAINST THE SCENE. A scene with no known answer, labelled "graded", reports
        // gradeable() TRUE. That is not a defect in referenceScan -- there is no way to look at an arbitrary
        // sphere list and decide whether it has a right answer -- IT IS THE REASON THIS DEVICE ONLY EVER GRADES
        // SCENES IT BUILT ITSELF FROM furnacePatch, and the reason the observable below is reported. ***
        const arbitrary = scanRegion(
            [{ centre: [0, 0, 0], radius: 1, albedo: 0.4 }, { centre: [1.6, 0.4, 0.9], radius: 0.5, albedo: 0.9 }],
            R, { ...CAM(c), sky: tiltedSky(c.skyTilt), mode: "graded", streamRng });
        return {
            ...blank,
            gradedGradeable: gradeable(grd), indicatorGradeable: gradeable(ind),
            gradedVerdictNull: residual(grd, grd.pixels).verdict === null,
            indicatorVerdictSet: indRes.verdict !== null,
            arbitrarySceneGradeable: gradeable(arbitrary),
            indicatorResidual: indRes.mean, mayConclude: false,
        };
    }

    // roulette -- rrQ IS THE PARAMETER THAT MUST NOT MATTER, AND IT IS THE HALF v3486 FOUND MISSING FROM THE
    // SCAN. The MEAN is the invariant; the SPREAD is the only thing roulette is allowed to change. A check
    // demanding min == max would be right without roulette and WRONG with it -- failing a correct renderer for
    // doing exactly what was asked of it.
    const F = furnacePatch(c.albedo);
    const R = centreRegion(c);
    const read = (rrQ) => {
        const v = [...scanRegion(F.scene, R, { ...CAM(c), sky: F.sky, mode: "graded", rrQ, streamRng }).pixels];
        return { mean: v.reduce((a, b) => a + b, 0) / v.length, spread: Math.max(...v) - Math.min(...v) };
    };
    const off = read(null), on = read(c.rrQ);
    return {
        ...blank, meanNoRR: off.mean, meanRR: on.mean, spreadNoRR: off.spread, spreadRR: on.spread,
        meanShiftFrac: Math.abs(on.mean - off.mean) / off.mean,
    };
}

export const refScanDevice = {
    // METHOD PLANT: `planted` substitutes ONE STREAMED GENERATOR for the per-pixel seeding -- it swaps the
    // sampling scheme rather than misreading a knob or moving a value, which is seismic's third kind (v3400)
    // and compliance.mjs's shape (v3460).
    plantKind: "method",
    // v4123 -- NAMED, THE SAME COMPLETION v3851/v4088-v4122 gave the rest of this family. MEASURED across all
    // five modes rather than assumed: `furnace` (the default/modes[0]) and `sign` are BOTH BLIND -- the
    // furnace albedo check and the sign check never depend on which RNG stream feeds a pixel. `crop` carries
    // the strongest signal and is what the header itself calls out: worstCropDiff 0 -> 0.316, a bit-exact
    // identity broken outright. `roulette` also moves (meanShiftFrac 2.6e-3 -> 1.4e-2); `decision` barely
    // shifts (0.0719 -> 0.0718) and reads as RNG-stream noise rather than a real signal.
    planted: { knob: "planted", observable: "worstCropDiff",
               note: "sets pathTracer's streamRng. Under a CONSTANT sky (furnace's) every sample carries the same radiance, so which random numbers a pixel drew cannot change what it reads -- the plant is invisible there by construction. crop mode renders under a GRADIENT sky (tiltedSky), which is what exposes it: a scanned rectangle must equal that rectangle cut from the full frame bit-for-bit, and under the plant it stops matching" },
    modes: REFSCAN_MODES, name: "reference-region-scan",
    observables: REFSCAN_OBSERVABLES, build, defaults,
};
export default refScanDevice;
