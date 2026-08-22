// WebGLEngine/tools/roundhouse/refScanDevice-selfcheck.mjs -- v3487
//
// Run: node tools/roundhouse/refScanDevice-selfcheck.mjs
//
// THE REFERENCE REGION SCAN AS A DEVICE. referenceScan-selfcheck already proves the instrument; this proves the
// DEVICE, which is a different claim: that the roundhouse can drive it, that every observable it advertises is
// one it actually returns, and -- the part that decides whether it should be a device at all -- that a claim
// can be REFUSED against it in the one mode where refusing is the right answer.
//
// *** THE ROUND'S FINDING IS WHICH MODE CATCHES THE PLANT, AND IT IS EXACTLY ONE OF FIVE. *** The plant swaps
// per-pixel seeding for one streamed generator, and on the furnace's CONSTANT sky that changes nothing at all --
// every sample carries the same radiance, so the sequence a pixel drew cannot alter what it reads. THE HEADLINE
// MODE RETURNS BIT-IDENTICAL NUMBERS ON A BROKEN RENDERER.
"use strict";
import { REFSCAN_MODES, REFSCAN_OBSERVABLES, build, defaults, refScanDevice } from "./refScanBind.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE DEVICE IS REGISTERED, DECLARES ITS MODES ONCE, AND REFUSES AN UNDECLARED ONE
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("refscan is in the registry", DEVICE_NAMES.includes("refscan"), DEVICE_NAMES.length + " devices");

    ok("!! the mode list is declared ONCE and `modes:` IS that object, asserted by IDENTITY",
       refScanDevice.modes === REFSCAN_MODES,
       "*** THE MODE LIST WRITTEN TWICE IS THIS TREE'S MOST-REPEATED DEFECT (v3420 quantum, v3421 kepler AND blackhole -- where the two copies had already disagreed and a working mode was invisible to every registry-driven tool). Two arrays that happen to match today are still two declarations, so this compares references and not contents. ***");

    ok("an undeclared mode is REFUSED by defaults() rather than silently substituted",
       defaults({ mode: "furnice" }) === null && defaults({ mode: "furnace" }) !== null,
       "A null is read as a refusal by checkMode, which is the stronger answer than a thrown dereference (v3420).");

    let threw = false;
    try { build({ mode: "furnice" }); } catch { threw = true; }
    ok("...and build() throws rather than returning another mode's answer", threw,
       "v3420's quantum defect: build({mode:'bands'}) SILENTLY RETURNED THE 'well' ANSWER -- not a refusal, not an error, A PLAUSIBLE RESULT FOR A QUESTION NOBODY ASKED, which is worse than a red gate.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. EVERY OBSERVABLE THE DEVICE ADVERTISES IS ONE IT RETURNS -- AND NOTHING IT RETURNS IS UNDECLARED
 * --------------------------------------------------------------------------------------------------------- */
{
    const seen = new Set();
    for (const mode of REFSCAN_MODES) for (const k of Object.keys(build({ mode }))) seen.add(k);
    const undeclared = [...seen].filter((k) => !REFSCAN_OBSERVABLES.includes(k));
    const unreturned = REFSCAN_OBSERVABLES.filter((k) => !seen.has(k));
    say(`${seen.size} keys returned across ${REFSCAN_MODES.length} modes, ${REFSCAN_OBSERVABLES.length} declared`);
    ok("!! the registry cannot advertise one thing and measure another", undeclared.length === 0 && unreturned.length === 0,
       `undeclared: [${undeclared}] | declared but never returned: [${unreturned}] -- the labDevices rule since v2819, and it runs BOTH ways because a stale name in the list is a menu item the proposer can pick and the device can never answer.`);

    const distinct = new Set(REFSCAN_MODES.map((m) => JSON.stringify(build({ mode: m }))));
    ok("every declared mode produces a DISTINCT answer", distinct.size === REFSCAN_MODES.length,
       "A branch that changed nothing would be a mode in name only (v3194).");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE FURNACE KEY, SWEPT ACROSS ALBEDO SO IT IS NOT TUNED TO 0.18
 * --------------------------------------------------------------------------------------------------------- */
{
    const f = build({ mode: "furnace" });
    say(`furnace across ${f.albedosTested} albedos: worst error ${f.worstAlbedoErrFrac.toExponential(3)} of the albedo, spread ${f.furnaceSpread}, mean ${f.furnaceMean.toFixed(6)}`);
    ok("!! *** THE GRADED PATCH READS THE ALBEDO AT EVERY ALBEDO, NOT ONLY AT 0.18 ***",
       f.worstAlbedoErrFrac < 1e-12 && f.albedosTested === 4,
       "*** THE ERROR IS A FRACTION OF THE ALBEDO, so 0.05 is graded as hard as 0.9 and the key cannot have been tuned to the one value everybody quotes. Nothing in the estimator is told rho: it enters as a SCALE and the factor that makes it come out right is E[cos theta] = 1/2, which falls out of the sampling. ***");

    ok("...and the spread is EXACTLY zero, which is a property of this scene rather than a tolerance",
       f.furnaceSpread === 0,
       "A constant sky, a convex sphere and cosine weighting mean every path escapes on its first bounce carrying exactly rho -- there is no noise to average. THE FIXTURE PROVES THE CAMERA AND THE GEOMETRY AND NOTHING ABOUT NOISE, which is why the roulette mode exists.");

    ok("a graded scan reports gradeable() true at every albedo", f.furnaceGradeable === true);
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE CROP IDENTITY, SWEPT -- AND THE CLAIM SHOWN FAILING
 * --------------------------------------------------------------------------------------------------------- */
{
    const clean = build({ mode: "crop" });
    const plant = build({ mode: "crop", config: { planted: true } });
    say(`${clean.cropRegions} rectangles on a gradient sky: clean worst ${clean.worstCropDiff}, streamed-generator plant ${plant.worstCropDiff.toExponential(3)}`);

    ok("!! *** A REGION SCAN IS BIT-IDENTICAL TO THE CROP, OVER FIVE RECTANGLES INCLUDING A 1x1 AND AN EDGE ***",
       clean.worstCropDiff === 0 && clean.cropRegions === 5,
       "Not within tolerance -- IDENTICAL, because the generator is seeded from (x, y, seed). That is what makes 'scan just this corner' a MEASUREMENT rather than a suggestion. A 1x1 is the limit case and the edge-touching rectangle is where off-by-one arithmetic in the region offsets shows first.");

    ok("!! *** AND THE PLANT BREAKS IT, WHICH NOBODY HAD EVER SEEN ***",
       plant.worstCropDiff > 0.01,
       `*** referenceScan-selfcheck HAS ASSERTED THIS ZERO SINCE v3475 AND HAD NEVER WATCHED IT BE ANYTHING ELSE -- a ratchet nobody has seen fire might not fire (v3142). The plant is not a synthetic corruption either: ONE STREAMED GENERATOR IS WHAT SOMEBODY WRITES FIRST, and with it a 17x11 region consumes a different sequence than the same patch inside a 48x48 frame, so region and crop differ BY NOISE (${plant.worstCropDiff.toFixed(4)}). ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. *** THE DETECTION SPLIT: FOUR OF FIVE MODES ARE BLIND TO THIS PLANT, AND THE HEADLINE MODE IS ONE OF THEM
 * --------------------------------------------------------------------------------------------------------- */
{
    const moved = [], blind = [];
    for (const mode of REFSCAN_MODES) {
        const a = build({ mode }), b = build({ mode, config: { planted: true } });
        const keys = Object.keys(a).filter((k) => k !== "planted");
        (keys.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])) ? moved : blind).push(mode);
    }
    say(`plant moves: [${moved.join(", ")}] | blind: [${blind.join(", ")}]`);

    ok("!! *** THE FURNACE MODE RETURNS BIT-IDENTICAL NUMBERS ON THE PLANTED RENDERER ***",
       blind.includes("furnace") && blind.includes("sign"),
       "*** WITH A CONSTANT SKY EVERY SAMPLE CARRIES THE SAME RADIANCE, so which random numbers a pixel drew cannot change what it reads -- the albedo comes back exact and the spread stays at zero on a renderer whose seeding is broken. A DEVICE GRADED ON THE FURNACE ALONE WOULD RATE THE PLANT A PERFECT IMPLEMENTATION. The blindness is stated rather than the mode deleted: the furnace grades the camera and the geometry, and it is right about both. ***");

    ok("...and `crop` catches it, so the device is not blind everywhere",
       moved.includes("crop"),
       "A plant no mode can see is a plant that grades nothing (v3391's wall at zero), so the positive control is asserted beside the blindness rather than left implied.");

    ok("the split is REPORTED as which-key-saw-what and not as a count",
       moved.length + blind.length === REFSCAN_MODES.length,
       `v3429's detection map: a tally would let one mode gain detection while another quietly lost it and never move. FIFTH ROUND RUNNING WHERE THE RESULT IS WHICH KEY CATCHES WHICH FAULT -- v3422's plant made a key look BETTER, v3423's was invisible to two, v3424's to the headline key, v3425's to three modes, and this one is invisible to ${blind.length} of ${REFSCAN_MODES.length} INCLUDING THE ONE THE DEVICE IS NAMED FOR.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 6. THE SIGN SEPARATES TWO FAULTS THAT SHARE A MAGNITUDE
 * --------------------------------------------------------------------------------------------------------- */
{
    const s = build({ mode: "sign" });
    say(`3% bright: bias ${s.brightBias.toExponential(3)} | 3% dark: bias ${s.darkBias.toExponential(3)} | gap between their mean |diff|: ${s.signMeanGap}`);
    ok("!! *** OPPOSITE SIGNS, IDENTICAL MAGNITUDE -- WHICH IS WHY THE MEAN ALONE IS NOT A DIAGNOSIS ***",
       s.brightBias > 0 && s.darkBias < 0 && s.signMeanGap === 0,
       "v3474 measured that lost energy reads DARK and a double-counted light reads BRIGHT. 'Off by 3%' is not a diagnosis; '3% too bright everywhere' is. The gap between the two mean absolute differences is EXACTLY zero, so a check watching only magnitude could not tell these two apart at all.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 7. THE DECISION LAYER -- THE ONLY REASON THIS IS ALLOWED TO BE A DEVICE
 * --------------------------------------------------------------------------------------------------------- */
{
    const d = build({ mode: "decision" });
    ok("!! *** gradeable() IS TRUE FOR THE GRADED SCAN AND FALSE FOR THE INDICATOR ONE, AND THE MODE TRAVELS WITH THE RESIDUAL ***",
       d.gradedGradeable === true && d.indicatorGradeable === false &&
       d.gradedVerdictNull === true && d.indicatorVerdictSet === true,
       "*** THE ONE QUESTION A GATE OR AN AGENT IS ALLOWED TO ASK. An indicator residual is a legitimate difference of METHOD -- the raster path computes no global illumination and SHOULD disagree -- so gating it would fire on every correct engine, and the only way to make it pass would be to break the path tracer until it stopped computing the light the raster path never had. ***");

    ok("...and the indicator residual is REPORTED with mayConclude false rather than offered as an error",
       d.indicatorResidual > 0 && d.mayConclude === false,
       `The residual is real (${d.indicatorResidual.toExponential(3)}) and it is not a defect. The observable is named indicatorResidual rather than an error BECAUSE THE NAME HAS TO CARRY THE CAVEAT (v3395): a field called err is one a proposer will write a max claim against.`);

    ok("!! *** THE HONEST LIMIT, MEASURED: `graded` IS A LABEL THE CALLER WRITES AND NOTHING CHECKS IT ***",
       d.arbitrarySceneGradeable === true,
       "*** AN ARBITRARY TWO-SPHERE SCENE WITH NO KNOWN ANSWER, LABELLED \"graded\", REPORTS gradeable() TRUE. That is NOT a defect in referenceScan -- there is no way to look at a list of spheres and derive whether it has a right answer, and inventing one would be fabricating provenance. IT IS THE REASON THIS DEVICE ONLY EVER GRADES SCENES IT BUILT ITSELF FROM furnacePatch, and the reason an agent may not be handed the mode as a free parameter. REPORTED, NOT FAILED: the assertion is that the hole is still open, so if somebody ever closes it this line goes red and should be REWRITTEN AS THE STRONGER CLAIM, NOT DELETED.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 8. ROULETTE: THE PARAMETER THAT MUST NOT MATTER
 * --------------------------------------------------------------------------------------------------------- */
{
    const r = build({ mode: "roulette" });
    say(`rrQ off: mean ${r.meanNoRR.toFixed(6)} spread ${r.spreadNoRR} | rrQ on: mean ${r.meanRR.toFixed(6)} spread ${r.spreadRR.toExponential(3)} | mean shift ${(r.meanShiftFrac * 100).toFixed(2)}%`);
    ok("!! *** THE MEAN IS THE INVARIANT AND THE SPREAD IS WHAT ROULETTE IS ALLOWED TO CHANGE ***",
       r.meanShiftFrac < 0.02 && r.spreadRR > 0.01 && r.spreadNoRR === 0,
       "*** v3471'S CLAIM SEEN THROUGH THE SCAN: killing continuations and dividing the survivors by q is UNBIASED AND NOISIER -- a TRADE, not a win. A check demanding min == max would be right with roulette off (the scene is exact) and WRONG with it on, failing a correct renderer for doing exactly what was asked of it. That is the v3486 defect from the other side. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 9. THE DEVICE RUNS THROUGH THE REGISTRY, NOT ONLY THROUGH ITS OWN IMPORT
 * --------------------------------------------------------------------------------------------------------- */
{
    const dev = await getDevice("refscan");
    const out = dev.build({ mode: "crop" });
    ok("getDevice('refscan') returns the same device and it builds",
       dev.name === "reference-region-scan" && out.worstCropDiff === 0,
       "A bind that only works when imported directly is a bind the roundhouse cannot reach (v3420's four modules with a page, a gate and no bind).");

    ok("the plant kind is DECLARED, and it is `method`",
       refScanDevice.plantKind === "method",
       "plantedCoverage's wall is at zero undeclared plants (v3400). The kind is read off the code rather than guessed: `const streamed = streamRng ? rng(seed) : null` SUBSTITUTES THE SAMPLING SCHEME, which is seismic's third kind rather than a knob or a misread.");
}

console.log(fails ? "\nrefScanDevice-selfcheck: " + fails + " FAILED" : "\nrefScanDevice-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
