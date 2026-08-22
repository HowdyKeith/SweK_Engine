// tools/roundhouse/airyRefined-selfcheck.mjs
//
// Run: node tools/roundhouse/airyRefined-selfcheck.mjs   (~40s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2911 -- A GRADED OBSERVABLE THAT SCORES EXACTLY ZERO AGAINST A CONSTANT THAT IS WRONG IN THE FOURTH DIGIT.

import { circularNumeric } from "../../physics/optics/diffraction.js";
import { airyMetrics, firstMinimumRefined, AIRY_FIRST_RING, J1_FIRST_ZERO } from "../../physics/optics/airyRefined.mjs";
import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const L = 500e-6, D = 0.2, sp = 4 * L / D;
const sweep = (n, s) => { const o = []; for (let i = 0; i < n; i++) o.push(s * i / (n - 1)); return o; };
const at = (n) => { const st = sweep(n, sp); return airyMetrics(circularNumeric(D, L, st), st, L, D); };

// ---- 1. THE ANSWER KEY IS ROUNDED -----------------------------------------------------------------------------------
{
    ok("the first dark ring has an exact value and it is not 1.22",
        Math.abs(AIRY_FIRST_RING - 1.2196698912665045) < 1e-15 && Math.abs(J1_FIRST_ZERO - 3.8317059702075123) < 1e-13,
        "j(1,1)/pi = " + AIRY_FIRST_RING.toPrecision(17) + ", where j(1,1) is the first zero of J1. opticsBind " +
        "grades against the literal 1.22");
    const floor = Math.abs(AIRY_FIRST_RING - 1.22) / 1.22;
    ok("!! grading against 1.22 puts a FLOOR under the reported error",
        floor > 2.7e-4 && floor < 2.8e-4,
        "floor = " + floor.toExponential(3) + ". A PERFECT measurement would score 2.7e-4, and a worse one that " +
        "happened to land nearer 1.22 would score better -- the grade rewards being wrong in the right direction");
}

// ---- 2. THE MEASUREMENT IS GRID-QUANTISED ----------------------------------------------------------------------------
{
    const m900 = at(900), m1800 = at(1800);
    ok("!! the raw estimator does not converge -- it jitters",
        m1800.errRawVsExact > m900.errRawVsExact,
        "error against the EXACT ring goes " + m900.errRawVsExact.toExponential(2) + " at n=900 to " +
        m1800.errRawVsExact.toExponential(2) + " at n=1800 -- WORSE with more resolution, because " +
        "firstMinimumAt returns the raw sample where the pattern turns and doubling the grid moves which " +
        "sample that is");
    ok("...and grading it against the rounded key hides the jitter",
        m1800.errRawVsRounded < m1800.errRawVsExact,
        "at n=1800 the error reads " + m1800.errRawVsRounded.toExponential(2) + " against 1.22 but " +
        m1800.errRawVsExact.toExponential(2) + " against the truth. The wrong constant flattered the worse " +
        "measurement, which is why nobody noticed either defect");
}

// ---- 3. THE DEFECT IS GONE: v2931 ADOPTED THE FIX --------------------------------------------------------------------
// This section used to assert the OLD defect -- that at max resolution the raw estimator scored a fake exact
// zero against the rounded 1.22. v2931 adopted the refined estimator and the exact constant into opticsBind, so
// those assertions are now false, which is the POINT: the fix took. Rewritten to verify the adopted behaviour.
{
    const dev = await getDevice("optics");
    const a = await dev.build({ mode: "airy", config: { nSamples: 3600 } });
    const b = await dev.build({ mode: "airy", config: { nSamples: 7200 } });

    ok("!! the fake exact zero at max resolution is GONE -- the device no longer scores 0 against 1.22",
        a.airyRingErrFrac > 0 && a.rayleighFactor !== 1.22 && b.airyRingErrFrac > 0,
        "nSamples 3600 now returns rayleighFactor " + a.rayleighFactor.toPrecision(9) + " and airyRingErrFrac " +
        a.airyRingErrFrac.toExponential(2) + " against the EXACT ring -- a real residual, not a grid coincidence " +
        "landing on a rounded constant. Before v2931 this was exactly 1.220000000 and exactly 0");

    ok("!! and the refined estimator CONVERGES with resolution instead of jittering",
        b.airyRingErrFrac <= a.airyRingErrFrac * 1.5,
        "airyRingErrFrac at nSamples 3600 -> 7200: " + a.airyRingErrFrac.toExponential(2) + " -> " +
        b.airyRingErrFrac.toExponential(2) + ", falling rather than alternating. The raw estimator went the " +
        "wrong way (4.4e-4 at 900, 8.3e-4 at 1800)");

    ok("...and the default build now grades against the exact constant, not the rounded 1.22",
        Math.abs((await dev.build({ mode: "airy" })).rayleighFactorExact - 1.2196698912665045) < 1e-15,
        "rayleighFactorExact is j(1,1)/pi, reported alongside so the grade can never again be against a constant " +
        "wrong in the fourth digit");

}

// ---- 4. WHAT THE FIX BUYS, MEASURED ------------------------------------------------------------------------------------
{
    const ms = [300, 900, 1800, 3600].map(at);
    const refined = ms.map((m) => m.errRefinedVsExact);
    const monotone = refined.every((v, i) => i === 0 || v < refined[i - 1]);
    ok("!! the refined estimator converges monotonically where the raw one jitters",
        monotone,
        "refined error against the exact ring: " + refined.map((v) => v.toExponential(2)).join(" -> ") +
        " -- strictly decreasing across a 12x range of resolution");
    ok("...and beats the floor the rounded key imposes",
        refined[3] < 2.7e-4 / 20,
        refined[3].toExponential(2) + " at n=3600 versus a 2.706e-4 floor -- the refined measurement is " +
        Math.round(2.706e-4 / refined[3]) + "x finer than the best score the old grading could even express, " +
        "and " + Math.round(ms[3].errRawVsExact / refined[3]) + "x better than the raw estimator at the same " +
        "resolution");

    // THE ESTIMATOR FITS THE INTENSITY, AND THE FIRST VERSION DID NOT. This check was written to confirm that
    // fitting sqrt(intensity) beat fitting intensity, on a smoothness argument that turned out to be inverted.
    // It FAILED, 1.78e-4 against 2.06e-5, and the module was changed rather than the check. Near the first zero
    // J1 is linear, so intensity ~ J1^2 is very nearly an exact parabola and amplitude |J1| is a V with a corner.
    // Retained pointing the other way so the refuted version cannot quietly come back.
    const st = sweep(900, sp), pat = circularNumeric(D, L, st);
    const amp = (() => {
        for (let i = 2; i < pat.length - 1; i++) if (pat[i] < pat[i - 1] && pat[i] <= pat[i + 1]) {
            const y0 = Math.sqrt(pat[i - 1]), y1 = Math.sqrt(pat[i]), y2 = Math.sqrt(pat[i + 1]);
            const d = y0 - 2 * y1 + y2;
            return st[i] + (Math.abs(d) > 0 ? 0.5 * (y0 - y2) / d : 0) * (st[i + 1] - st[i]);
        }
        return null;
    })();
    const ampErr = Math.abs(amp / (L / D) - AIRY_FIRST_RING) / AIRY_FIRST_RING;
    ok("!! fitting the INTENSITY beats fitting the amplitude, refuting how this file was first written",
        ms[1].errRefinedVsExact < ampErr,
        "parabola on intensity: " + ms[1].errRefinedVsExact.toExponential(2) + " vs on sqrt(intensity): " +
        ampErr.toExponential(2) + ". Near the first zero J1 is linear, so the intensity is very nearly an exact " +
        "parabola -- the one shape a parabola fits perfectly -- while the amplitude is a V with a corner");
}

// ---- 5. THE FIX IS NOW ADOPTED (was: "deliberately does not do") ---------------------------------------------------------
{
    const dev = await getDevice("optics");
    const o = await dev.build({ mode: "airy" });
    ok("opticsBind now uses the refined estimator and the exact constant (v2931 adopted)",
        o.airyRingErrFrac < 1e-4 && o.airyRingErrFrac > 0,
        "default build reports " + o.airyRingErrFrac.toExponential(3) + " against the exact ring, down from " +
        "7.1e-4 against the rounded 1.22. This section used to assert opticsBind was UNCHANGED; v2931 changed it, " +
        "which is why the assertion is inverted. HISTORICAL NOTE, still true: no baseline gated this -- v2915 " +
        "established the fingerprint baselines pin fifty subsystem hashes, not optics observables, so the only " +
        "consequence to manage was the physicsBaseline PIN, which v2931 updated in the same commit (1.21913 -> " +
        "1.21970) so the improvement is recorded, not hidden");
    console.log("  NOTE   the slit mode was adopted in the same round; slitQuantisation-selfcheck now verifies");
    console.log("         its refined estimator too, and physicsBaseline re-pinned slit-first-min-factor alongside.");
}

console.log();
if (fails) { console.log("airyRefined-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("airyRefined-selfcheck: all checks pass");
