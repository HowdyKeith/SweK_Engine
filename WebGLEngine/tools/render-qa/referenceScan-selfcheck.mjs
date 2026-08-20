// WebGLEngine/tools/render-qa/referenceScan-selfcheck.mjs -- v3475
//
// Run: node tools/render-qa/referenceScan-selfcheck.mjs
//
// Keith framed this as "a quick indicator, as opposed to a quantifiable measurement". *** IT IS BOTH, IN
// DIFFERENT SCENES, AND THE POINT OF THIS GATE IS THAT THE TWO CANNOT SHARE A VERDICT. ***
//
//   GRADED    -- a furnace patch, where the answer is known exactly and a residual is a defect.
//   INDICATOR -- a general scene, where the raster path has no global illumination and the two SHOULD differ.
//                Reported as a picture. NOTHING MAY FAIL ON IT.
//
// AN INSTRUMENT WHOSE RED STATE IS THE EXPECTED ANSWER HAS FOUND NOTHING.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanRegion, residual, gradeable, furnacePatch, MODES } from "./referenceScan.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
import { render } from "../../physics/render/pathTracer.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const CAM = { w: 64, h: 64, spp: 24, seed: 3, eye: [0, 0, 4], look: [0, 0, 0], fovDeg: 40, maxDepth: 4 };
const RHO = 0.18;

/* ------------------------------------------------------------------------------------------------------------
 * 1. A REGION IS THE CROP -- BIT FOR BIT
 * --------------------------------------------------------------------------------------------------------- */
{
    const F = furnacePatch(0.6);
    const opts = { ...CAM, sky: (d) => 0.3 + 1.4 * Math.max(0, d[1]) };   // a NOISY sky, so noise could differ
    const full = render(F.scene, opts);
    const R = { x0: 19, y0: 27, w: 17, h: 11 };
    const scan = scanRegion(F.scene, R, { ...opts, mode: "indicator" });
    let worst = 0;
    for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++)
        worst = Math.max(worst, Math.abs(scan.pixels[y * R.w + x] - full[(y + R.y0) * CAM.w + (x + R.x0)]));
    say(`${R.w}x${R.h} region against the same crop of a ${CAM.w}x${CAM.h} frame: worst difference ${worst}`);
    ok("!! *** A REGION SCAN IS BIT-IDENTICAL TO THE CROP, ON A SCENE WITH REAL NOISE ***", worst === 0,
       `*** THIS IS WHY THE GENERATOR IS SEEDED PER PIXEL RATHER THAN STREAMED. With one stream, a 17x11 region consumes a different random sequence than the same patch inside a 64x64 frame, and the two would differ by NOISE -- so "scan just this corner" would be a suggestion rather than a measurement. Checked on a GRADIENT sky, because on a constant one every sample is identical and the test would pass on a broken seeding scheme. ***`);

    const odd = { x0: 0, y0: 0, w: 1, h: 1 };
    const one = scanRegion(F.scene, odd, { ...opts, mode: "indicator" });
    ok("...and a one-pixel region works, which is the smallest useful scan",
       Math.abs(one.pixels[0] - full[0]) === 0,
       "A single pixel is the limit case of 'point at the suspicious spot', and off-by-one arithmetic in the region offsets shows up here before anywhere else.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE GRADED MODE: A FURNACE PATCH HAS AN EXACT ANSWER
 * --------------------------------------------------------------------------------------------------------- */
{
    const F = furnacePatch(RHO);
    const R = { x0: 26, y0: 26, w: 12, h: 12 };            // dead centre, well inside the silhouette
    const scan = scanRegion(F.scene, R, { ...CAM, sky: F.sky, mode: "graded" });
    const vals = [...scan.pixels];
    say(`graded furnace patch, ${R.w}x${R.h}: [${Math.min(...vals).toFixed(6)}, ${Math.max(...vals).toFixed(6)}] against an albedo of ${F.expect}`);
    ok("!! *** THE GRADED PATCH READS THE ALBEDO EXACTLY -- A REAL MEASUREMENT, NOT AN IMPRESSION ***",
       vals.every((v) => Math.abs(v - F.expect) < 1e-12),
       "Every pixel, to machine precision. THIS is the mode a gate may fail on, because the right answer is known in advance and any residual is a defect rather than a legitimate difference of method.");

    // A PERFECT engine: residual is zero, bias is zero.
    const perfect = residual(scan, scan.pixels);
    ok("...and an engine that matched it exactly shows zero residual and zero bias",
       perfect.worst === 0 && perfect.bias === 0 && perfect.differing === 0,
       "The identity case, checked because a residual routine that never returns zero would make every comparison look like a finding.");

    // A 3% TOO BRIGHT engine: the SIGN is what names the fault.
    const bright = residual(scan, scan.pixels.map((v) => v * 1.03));
    const dark = residual(scan, scan.pixels.map((v) => v * 0.97));
    say(`3% bright: bias ${bright.bias.toExponential(2)} | 3% dark: bias ${dark.bias.toExponential(2)} | both have mean |diff| ${bright.mean.toExponential(2)}`);
    ok("!! *** THE SIGN SEPARATES TWO OPPOSITE FAULTS THAT SHARE A MAGNITUDE ***",
       bright.bias > 0 && dark.bias < 0 && Math.abs(bright.mean - dark.mean) < 1e-15,
       `*** THE MEAN ABSOLUTE DIFFERENCE IS THE SAME FOR BOTH AND TELLS YOU NOTHING. v3474 measured that a lost 1/q reads DARK and a double-counted light reads BRIGHT -- "off by 3%" is not a diagnosis, "3% too bright everywhere" is. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE INDICATOR MODE MUST NOT BE GRADEABLE ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const F = furnacePatch(0.6);
    const R = { x0: 20, y0: 20, w: 8, h: 8 };
    const ind = scanRegion(F.scene, R, { ...CAM, sky: (d) => 0.3 + 1.4 * Math.max(0, d[1]), mode: "indicator" });
    const grd = scanRegion(F.scene, R, { ...CAM, sky: () => 1, mode: "graded" });

    ok("!! *** gradeable() IS FALSE FOR AN INDICATOR SCAN AND TRUE FOR A GRADED ONE ***",
       gradeable(ind) === false && gradeable(grd) === true,
       "*** THE ONLY QUESTION A GATE IS ALLOWED TO ASK. A general scene's residual is a legitimate difference of METHOD -- the raster path computes no global illumination and SHOULD disagree -- so gating it would fire on every correct engine, and the only way to make it pass would be to break the path tracer until it stopped computing the light the raster path never had. AN INSTRUMENT WHOSE RED STATE IS THE EXPECTED ANSWER HAS FOUND NOTHING. ***");

    ok("...and the mode travels WITH the residual, so a caller cannot lose it downstream",
       residual(ind, ind.pixels).mode === "indicator" && residual(ind, ind.pixels).verdict !== null &&
       residual(grd, grd.pixels).verdict === null,
       "The indicator result carries the words 'reported, never failed on' in its own verdict field. A mode kept only at the call site is a mode that gets dropped one refactor later.");

    let threw = false;
    try { scanRegion(F.scene, R, { ...CAM, sky: () => 1 }); } catch { threw = true; }
    ok("!! and a scan with NO mode is refused outright rather than defaulted",
       threw,
       `MODES = ${MODES.join("/")}, and there is no default. *** A DEFAULT WOULD PICK A SIDE FOR SOMEBODY WHO DID NOT THINK ABOUT IT, and whichever side it picked would be wrong half the time: default to graded and correct engines fail; default to indicator and real defects are never gated. REFUSING IS THE ONLY HONEST DEFAULT. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3b. THE SCAN MEASURES WHAT YOU ARE LOOKING AT -- v3486
 * --------------------------------------------------------------------------------------------------------- */
{
    const F = furnacePatch(RHO);
    const R = { x0: 26, y0: 26, w: 12, h: 12 };
    const runs = [null, 0.7].map((rrQ) => {
        const v = [...scanRegion(F.scene, R, { ...CAM, sky: F.sky, mode: "graded", rrQ }).pixels];
        const mn = Math.min(...v), mx = Math.max(...v);
        return { rrQ, mean: v.reduce((a, b) => a + b, 0) / v.length, spread: mx - mn };
    });
    for (const r of runs) say(`rrQ=${r.rrQ}: mean ${r.mean.toFixed(6)}, spread ${r.spread.toExponential(2)}`);

    ok("!! *** ROULETTE REACHES THE SCAN -- IT DID NOT UNTIL v3486 ***",
       runs[1].spread > runs[0].spread * 100,
       `*** KEITH RENDERED THE FURNACE WITH ROULETTE ON -- VISIBLY GRAINY -- AND THE SCAN BESIDE IT STILL READ [0.180000, 0.180000] WITH NO SPREAD, because it silently measured WITHOUT roulette every time. A control labelled "ground truth" that quietly measures a DIFFERENT CONFIGURATION FROM THE ONE ON SCREEN is worse than one that is merely wrong: it agrees by luck and disagrees by luck, and nobody can tell which. ***`);

    ok("!! *** AND THE ANSWER DOES NOT MOVE, WHICH IS v3471'S CLAIM SEEN THROUGH THE SCAN ***",
       Math.abs(runs[1].mean - runs[0].mean) / runs[0].mean < 0.02,
       `${runs[0].mean.toFixed(6)} against ${runs[1].mean.toFixed(6)}. UNBIASED BUT NOISIER -- the mean is the invariant and the spread is the thing roulette is allowed to change.`);

    const src = fs.readFileSync(path.join(ROOT, "path-tracer.html"), "utf8");
    ok("!! *** the page's GRADED verdict tests the right property for the estimator in use ***",
       /rrQ\s*$/m.test(src.slice(src.indexOf("const good ="), src.indexOf("const good =") + 60)) ||
       /const good = rrQ/.test(src),
       "*** WITHOUT THIS THE FIX WOULD HAVE MANUFACTURED A FALSE FAILURE: with roulette off the scene is EXACT so min must equal max, but with roulette on the estimator is UNBIASED AND NOISY BY DESIGN, and the same demand would fail a correct renderer for doing exactly what was asked of it. ***");

    ok("...and the page no longer claims the sphere is INVISIBLE",
       !/the sphere disappears/.test(src) && /featureless, not invisible/.test(src),
       `*** \"THE SPHERE DISAPPEARS\" IS ONLY TRUE AT ALBEDO 1. At rho = 0.18 the correct picture is a FLAT GREY DISC against a white sky -- the sphere reflects 18% and the environment emits 100%. What must be absent is SHADING, not the sphere. A page that promises an invisible sphere and then shows a visible one teaches the reader to distrust a check that was passing. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE COST, BECAUSE THE REGION IS THE WHOLE POINT
 * --------------------------------------------------------------------------------------------------------- */
{
    const F = furnacePatch(0.5);
    const opts = { ...CAM, w: 256, h: 256, spp: 16, sky: (d) => 0.3 + 1.4 * Math.max(0, d[1]) };
    const t0 = Date.now(); scanRegion(F.scene, { x0: 96, y0: 96, w: 64, h: 64 }, { ...opts, mode: "indicator" });
    const patch = Date.now() - t0;
    const t1 = Date.now(); scanRegion(F.scene, { x0: 0, y0: 0, w: 256, h: 256 }, { ...opts, mode: "indicator" });
    const whole = Date.now() - t1;
    say(`64x64 patch ${patch} ms against the whole 256x256 frame ${whole} ms -- ${(whole / Math.max(1, patch)).toFixed(1)}x`);
    ok("!! the patch costs about its share of the frame, which is what makes pointing at a corner viable",
       patch * 4 < whole,
       `A 64x64 region is 1/16 of a 256x256 frame and came back ${(whole / Math.max(1, patch)).toFixed(1)}x faster, NOT 16x -- THE FIRST SCAN PAYS THE JIT AND THE SECOND DOES NOT, so this ratio flatters the full frame rather than the patch. The assertion is deliberately the weak one (a quarter, not a sixteenth) because THE STRONGER CLAIM WOULD BE MEASURING V8'S WARMUP RATHER THAN THE RENDERER. *** THE ARITHMETIC IS THE ARGUMENT FOR THE WHOLE DESIGN: at 4.7M paths/sec a 1080p frame at this quality is nearly half a minute, and a patch is a tenth of a second. You do not wait for a slow picture and then hunt for the flaw -- you point at the suspicious corner. ***`);
}

console.log(fails ? "\nreferenceScan-selfcheck: " + fails + " FAILED" : "\nreferenceScan-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
