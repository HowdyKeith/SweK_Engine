// WebGLEngine/tools/roundhouse/geostatsDevice-selfcheck.mjs -- v3382
// *** TWO ROUNDS PREDICTED KRIGING WOULD BE A SOLVER RATHER THAN A DEVICE. THE MEASUREMENT SAYS OTHERWISE, AND
// THIS FILE IS WHERE THE CORRECTION IS PINNED SO IT CANNOT DRIFT BACK. ***
//
// The prediction was right about kriging-selfcheck -- every check there is self-consistency (exact
// interpolation, sum(w)=1, optimality by random perturbation, the variance agreeing with varianceOfWeights).
// It was wrong about the METHOD: gamma is a CALLER-SUPPLIED FUNCTION, and two particular choices have answers
// known in advance from outside the solver entirely.
import * as K from "./geostatsBind.mjs";
import { ordinaryKriging } from "../../physics/geostats/kriging.js";
import { codeHas } from "../ship/sourceScan.mjs";
import fs from "node:fs";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// ---- 1. THE BROWNIAN VARIOGRAM: LINEAR INTERPOLATION, AND IT IS NOT THE SOLVER'S OWN ANSWER ----------------
const b = K.build({ mode: "bridge" });
say("gamma(h) = h over 6 irregular samples: worst |kriged - linear interpolant| = " + b.worstValueErr.toExponential(3) +
    ", worst weight on a NON-adjacent sample = " + b.worstOuterWeight.toExponential(3));
ok("!! *** ordinary kriging with a linear variogram IS linear interpolation, to machine precision ***",
    b.worstValueErr < 1e-13,
    "Brownian motion is MARKOV, so the two bracketing samples screen everything else and the estimator " +
    "collapses to a formula a schoolchild can evaluate. NOTHING IN kriging.js KNOWS THAT -- it assembles a " +
    "bordered system and eliminates. The closed form is met only at the comparison");
ok("!! *** and the screen effect is EXACT: four of six weights are driven to machine zero at every query ***",
    b.worstOuterWeight < 1e-13,
    "worst " + b.worstOuterWeight.toExponential(3) + ". Not small -- zero. A structural claim with no tolerance, " +
    "and one the module's own gate never makes: it checks that weights SUM to one, never WHICH samples carry them");

// ---- 2. THE VARIANCE IS THE BROWNIAN BRIDGE, AND THE 2 IS THE CONVENTION NAMING ITSELF ---------------------
say("kriging variance / (x0-a)(b-x0)/(b-a) = " + b.varianceRatio.toFixed(12) +
    " with a spread of " + b.varianceRatioSpread.toExponential(2) + " across five query points");
ok("!! *** the ratio is exactly 2 at EVERY query, which is the semivariogram convention and not an error ***",
    Math.abs(b.varianceRatio - 2) < 1e-12 && b.varianceRatioSpread < 1e-12,
    "gamma(h) = h means Var(Z(t)-Z(s)) = 2|t-s|, so the conditional variance of the bridge is twice the " +
    "geometric factor. A RATIO THAT COMES BACK AS A CLEAN CONSTANT RATHER THAN A SMALL NUMBER IS ALGEBRA " +
    "ANNOUNCING ITSELF (v3381's f0) -- here it announces a convention rather than a mistake, and the difference " +
    "is that this one is CONSTANT ACROSS THE SWEEP where a mistake would drift");

// ---- 3. THE LOAD-BEARING NEGATIVE FAILS BY A PREDICTED AMOUNT ---------------------------------------------
const s = K.build({ mode: "screen" });
say("gamma(h) = h^p:  " + s.rows.map((r) => "p=" + r.p + " -> " + r.outer.toExponential(2)).join("   "));
ok("!! *** the screen is a property of exponent 1 EXACTLY, and opens LINEARLY in the departure from it ***",
    s.markovOuter < 1e-13 && s.openingIsMonotone && s.slopeSpread / s.slopeMean < 0.05,
    "outer weight = " + s.slopeMean.toFixed(4) + " x (p-1) with a spread of " +
    (100 * s.slopeSpread / s.slopeMean).toFixed(2) + "% over a tenfold range of departure. THE BEST NEGATIVES " +
    "DO MORE THAN FAIL: this one fails by an amount predicted from how far the variogram is from Brownian, and " +
    "the same one-line function is evaluated at all four exponents so nothing was tuned");
ok("...and the largest departure is four orders above the Markov value, so the two cases cannot be confused",
    s.worstOffMarkov / Math.max(s.markovOuter, 1e-300) > 1e10,
    s.markovOuter.toExponential(2) + " against " + s.worstOffMarkov.toExponential(2));

// ---- 4. PURE NUGGET: THE ARITHMETIC MEAN, DERIVABLE IN TWO LINES AND WRITTEN NOWHERE IN THE SOLVER ---------
const n = K.build({ mode: "nugget" });
say("pure nugget: value " + n.value + " against the arithmetic mean " + n.mean + "; variance " +
    n.variance.toFixed(13) + " against the predicted 1 + 1/n = " + n.predictedVariance.toFixed(13));
ok("!! *** with no spatial information the only unbiased answer left is the plain mean, and it comes back EXACTLY ***",
    n.valueErr === 0 && n.worstWeightErr < 1e-14 && n.varianceErr < 1e-14,
    "weights all 1/n to " + n.worstWeightErr.toExponential(2) + " and the variance exactly (1 + 1/n) times the " +
    "nugget -- a SECOND external closed form, reached through a different degenerate limit than section 1, so " +
    "one lucky algebraic coincidence cannot satisfy both");

// ---- 5. SCALING THE VARIOGRAM IS THE SAME MODEL ------------------------------------------------------------
const sc = K.build({ mode: "scale" });
ok("scaling gamma by a constant leaves the weights bit-stable and scales the variance by exactly that constant",
    sc.worstWeightDelta < 1e-13 && sc.varianceRatioErr < 1e-12,
    "weights move " + sc.worstWeightDelta.toExponential(2) + ", variance ratio " + sc.varianceRatio.toFixed(12) +
    " against " + sc.scale + " -- a device that had absorbed a constant into the wrong side of the system would " +
    "separate here, and the DYADIC TRAP (v3081) is avoided because 7.3 is not a power of two");

// ---- 6. WHAT THIS DEVICE DELIBERATELY DOES NOT RESTATE ------------------------------------------------------
{
    const src = fs.readFileSync(new URL("./geostatsBind.mjs", import.meta.url), "utf8");
    ok("!! the bind never re-runs the BLUE optimality search, which kriging-selfcheck already proves",
        !codeHas(src, /perturb|randomWeights|beatsKriging/i),
        "a device that restated its module's own gate would MOVE THE COVERAGE COUNT AND GRADE NOTHING NEW " +
        "(v3201). The optimality search, exact interpolation and sum(w)=1 all stay where they are");
    ok("...and the module's self-consistency still holds where this device relies on it",
        sc.selfConsistent === true,
        "the reported variance equals varianceOfWeights on the same weights -- imported as a PREMISE rather " +
        "than re-asserted as a finding");
}

// ---- 7. THE PREDICTION THIS ROUND OVERTURNED, PINNED SO IT CANNOT DRIFT BACK -------------------------------
{
    // The claim is not a mood: it is that an EXTERNAL answer exists, computed without kriging, that the
    // estimator must meet. Both of these are that, and either alone would be enough.
    const externalKeys = [b.worstValueErr < 1e-13, n.valueErr === 0];
    ok("!! *** KRIGING IS A DEVICE, NOT A SOLVER: two external closed forms, neither reached through the system ***",
        externalKeys.every(Boolean),
        "v3380 and v3381 both recorded the opposite expectation, reasoning from the module's GATE rather than " +
        "from the method. WHEN SOMEBODY SHOWS THAT BOTH LIMITS ARE REACHABLE FROM THE KRIGING SYSTEM ITSELF, " +
        "THIS LINE SHOULD GO RED AND BE DELETED, NOT WEAKENED");
    // and the honest boundary: the module ships no linear variogram, so the key is reached by a caller's choice
    ok("the boundary is stated rather than implied: the module ships NO linear variogram",
        !codeHas(fs.readFileSync(new URL("../../physics/geostats/kriging.js", import.meta.url), "utf8"), /export const linear/),
        "spherical, exponential and gaussian are the shipped models. gamma(h)=h is a CALLER'S MODELLING CHOICE, " +
        "which is exactly what that file says a variogram is -- so this key is legitimate and it is NOT one the " +
        "module's defaults would ever have found");
}

// ---- 8. MODES ARE DECLARED, DISTINCT AND COMPLETE -----------------------------------------------------------
{
    // *** v3852 -- THE PLANT MODE IS EXCLUDED FROM THE DISTINCTNESS SET, AND THAT IS THE CONTRACT RATHER THAN
    // A WEAKENING. *** probeModePlant builds the primary and the plant and requires THE SAME DECLARED
    // OBSERVABLE TO BE A FINITE NUMBER IN BOTH -- so a plant mode MUST return its primary's shape. Demanding
    // it look different would demand it break the contract that makes it adjudicable. The distinctness rule
    // still applies in full to every mode that claims to ask a NEW QUESTION, which is what it was for.
    const plantMode = K.geostatsDevice.plantMode;
    const claimModes = K.MODES.filter((m) => m !== plantMode);
    const keys = claimModes.map((m) => Object.keys(K.build({ mode: m })).sort().join(","));
    ok("every CLAIM mode returns a different observable set", new Set(keys).size === claimModes.length,
        claimModes.join(" / "));

    // ...and the plant is held to the STRONGER pair instead: same shape as its primary, different value.
    const primary = K.MODES.find((m) => m !== plantMode);
    const pk = Object.keys(K.build({ mode: primary })).sort().join(",");
    const qk = Object.keys(K.build({ mode: plantMode })).sort().join(",");
    ok("!! the plant mode returns its PRIMARY'S shape, which is what makes it adjudicable",
        pk === qk, `${primary} and ${plantMode} both return [${pk}]`);
    const pv = K.build({ mode: primary })[K.geostatsDevice.plantFlips];
    const qv = K.build({ mode: plantMode })[K.geostatsDevice.plantFlips];
    ok("!! ...and the DECLARED observable differs, off an exact zero",
        Number.isFinite(pv) && Number.isFinite(qv) && pv !== qv && pv === 0,
        `${K.geostatsDevice.plantFlips} ${pv} -> ${qv}. Dropping the Lagrange row is SIMPLE kriging where ` +
        "ORDINARY is required: the weights stay finite and stop summing to one, so the estimator stops being " +
        "unbiased and the pure-nugget answer stops being the arithmetic mean");
    let refused = false;
    try { K.build({ mode: "no-such-mode-will-ever-be-declared" }); } catch { refused = true; }
    ok("an undeclared mode is REFUSED rather than silently defaulted", refused && K.defaults({ mode: "nope" }) === null);
    const declared = new Set(K.GEOSTATS_OBSERVABLES);
    const emitted = new Set(K.MODES.flatMap((m) => Object.keys(K.build({ mode: m }))));
    ok("!! every key any mode returns is in the declared observable list",
        [...emitted].every((k) => declared.has(k) || k === "rows"),
        emitted.size + " emitted, " + declared.size + " declared");
    ok("the underlying solver still refuses an empty sample set rather than returning a number",
        ordinaryKriging([], [0], (h) => h) === null);
}

console.log(failed ? "\n[geostatsDevice-selfcheck] FAILED " + failed : "\n[geostatsDevice-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
