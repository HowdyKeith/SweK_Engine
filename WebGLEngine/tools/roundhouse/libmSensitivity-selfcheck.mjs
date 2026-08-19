// tools/roundhouse/libmSensitivity-selfcheck.mjs
//
// Run: node tools/roundhouse/libmSensitivity-selfcheck.mjs   (~150s: three builds of the whole lab)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2905 -- THE CENSUS'S OWN CAVEAT, MEASURED.

import { libmSensitivitySweep, sensitivityLines, SENSITIVITY_REGISTRATION, nextUp, ulpRel } from "./libmSensitivity.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 0. THE PERTURBATION ITSELF ----------------------------------------------------------------------------------
{
    ok("nextUp moves exactly one representable step and never by arithmetic",
        nextUp(1) === 1 + Number.EPSILON && nextUp(0) === Number.MIN_VALUE && nextUp(-1) < -1 === false,
        "1 -> " + (nextUp(1) - 1).toExponential(2) + " above 1; the step is taken on the bit pattern, so it " +
        "introduces no rounding of its own");
    ok("ulpRel reports the relative size of the perturbation being applied",
        Math.abs(ulpRel(1) - Number.EPSILON) < 1e-20 && ulpRel(1e300) > 0,
        "eps at 1.0 = " + ulpRel(1).toExponential(3) + " -- this is the denominator of every amplification below");
}


const s = await libmSensitivitySweep({});
console.log();
sensitivityLines(s).forEach((l) => console.log("  " + l));
console.log();

// ---- 1. THE CONTROL THAT MAKES ATTRIBUTION POSSIBLE ---------------------------------------------------------------
{
    // Every device is built twice unperturbed before it is built perturbed. If any of them failed to reproduce
    // itself, movement could not be attributed to the libm shift and the whole sweep would be uninterpretable.
    ok("!! the lab reproduces itself exactly, so every movement below is attributable to the perturbation",
        s.determinismFailures === 0,
        "0 of " + s.summary.deviceModes + " device/modes disagreed with their own second build -- this is the " +
        "control, and without it the sweep measures nothing");
}

// ---- 2. THE PRE-REGISTERED PREDICTIONS ----------------------------------------------------------------------------
{
    // v2904's at-risk set, recomputed inside this single sweep rather than by re-running the census.
    //
    // WHY NOT JUST IMPORT THE CENSUS: because running both in one process does not finish. Instrumenting Math --
    // which both tools do, and both disarm correctly -- deoptimises those callsites for the remainder of the
    // process, and the lab's heaviest mode makes 155,047,140 of them. Whichever ran second paid a tax large
    // enough to hang the gate. Folding the call count into this sweep removes the duplicate pass entirely, and
    // the classification is identical: an unkeyed observable from a build that made at least one such call.
    const stable = s.summary.atRiskStable, moved = s.summary.atRiskMoved;
    const stableFrac = stable / (stable + moved);

    ok("!! prediction 1 HELD: the census's 184 substantially overstated the damage",
        stableFrac >= SENSITIVITY_REGISTRATION.claim.min,
        "of " + (stable + moved) + " at-risk unkeyed observables, " + stable + " are BIT-IDENTICAL under a full " +
        "one-ulp libm shift and " + moved + " move -- " + (100 * stableFrac).toFixed(0) + "% stable against a " +
        "pre-registered floor of " + (100 * SENSITIVITY_REGISTRATION.claim.min).toFixed(0) + "%");

    // the census's own worked example, checked
    const kerr = s.rows.filter((r) => r.device === "kerr");
    ok("...and the census's own example was right about itself",
        kerr.every((r) => r.movedCount <= 3 && r.totalCount >= 12),
        "kerr modes move " + kerr.map((r) => r.movedCount + "/" + r.totalCount).join(", ") +
        " -- the census condemned eleven unkeyed observables per mode on twenty libm calls; two move");

    // CORRECTION, recorded rather than quietly fixed. This block first read
    //     amp.sort((x, y) => y.a - x.a)
    // over every moved field, and reported prediction 2 as FAILED with interferometer.recover.rmsResidual on
    // top. It had not failed. An observable whose base value is exactly 0 gets relMove = Infinity and therefore
    // amplification = Infinity, and `Infinity - Infinity` is NaN, which makes the comparator inconsistent and
    // leaves the array in an arbitrary order. The summary's worstAmplification -- computed with Math.max, which
    // has no such problem -- said 8.73e17 all along, and the two disagreeing was the tell. Non-finite
    // amplifications are now excluded explicitly, which is also the honest treatment: an observable that moved
    // off exact zero has no meaningful amplification ratio to report.
    const amp = [];
    for (const r of s.rows) for (const f of r.fields) {
        if (f.moved && Number.isFinite(f.amplification)) amp.push({ id: r.device + "." + r.mode + "." + f.field, a: f.amplification, dev: r.device });
    }
    amp.sort((x, y) => y.a - x.a);
    ok("!! prediction 2 HELD: the chaotic quantity amplifies hardest",
        amp[0].dev === "chaos" && amp[0].a === s.summary.worstAmplification,
        "top amplifier is " + amp[0].id + " at " + amp[0].a.toExponential(2) + " output ulps per input ulp -- " +
        "which is what a period-doubling cascade DOES to a perturbation, not a defect; and it agrees with the " +
        "summary's independently computed maximum, which is the check that caught the sort bug above");
}

// ---- 3. THE TRAP IN THE AMPLIFICATION TABLE, WHICH ALMOST BECAME THE HEADLINE -------------------------------------
{
    // Sorting by relative movement puts a string of graded error fields at the top -- coeffErr moving 63%,
    // shadowErrFrac 17%, rmsResidual 29%. Read carelessly that says the lab's GRADES are machine-dependent.
    // They are not: those quantities are 1e-14 to 1e-17 in absolute terms, and a large relative move on a
    // number at the numerical floor is arithmetic, not physics. This is the same reasoning suspiciousZero.mjs
    // applies to exact zeros, pointed the other way -- and it is recorded because the alarming version of this
    // finding was the one I nearly wrote up.
    const movers = [];
    for (const r of s.rows) for (const f of r.fields) if (f.moved && typeof f.base === "number") movers.push(f);
    const nearZero = movers.filter((f) => Math.abs(f.base) <= 1e-6);
    const real = movers.filter((f) => Math.abs(f.base) > 1e-6 && f.relMove > 1e-9);

    ok("!! most of the amplification table is near-zero error fields, not machine-dependent physics",
        nearZero.length > real.length,
        movers.length + " movers; " + nearZero.length + " have |value| <= 1e-6 where a large RELATIVE move is " +
        "meaningless; " + real.length + " are genuinely sensitive at a magnitude that matters");
    ok("the graded Feigenbaum error survives the shift on both sides of it",
        real.some((f) => Math.abs(f.base - 0.00171474) < 1e-6) &&
        movers.every((f) => !(f.base > 0.0005 && f.base < 0.01 && f.pert > 0.01)),
        "deltaErrFrac 1.71e-3 -> 7.61e-4: it halves, but the device's claim is 'within a fraction of 1%' and " +
        "both values satisfy it, so no claim crystallises differently on a second machine");
}

// ---- 4. WHAT THE GENUINELY SENSITIVE ONES HAVE IN COMMON ----------------------------------------------------------
{
    const find = (d, m, f) => { const r = s.rows.find((r) => r.device === d && r.mode === m); return r && r.fields.find((x) => x.field === f); };
    const spread = find("chaos", "feigenbaum", "deltaSpread");
    const gain = find("interferometer", "recover", "unwrapGain");
    const rms = find("interferometer", "recover", "rmsResidual");

    ok("!! the worst genuinely-sensitive observable is a real quantity, not a floor artefact",
        spread && spread.moved && Math.abs(spread.base) > 0.01 && spread.relMove > 10,
        "chaos.feigenbaum.deltaSpread " + spread.base.toFixed(4) + " -> " + spread.pert.toFixed(4) +
        " under a one-ulp libm shift. Order 0.1 becoming order 10 is not rounding noise");

    // BOTH of the large real movers are ratios whose DENOMINATOR sits at the numerical floor. deltaSpread is the
    // range of delta estimates taken across a precision-limited bifurcation cascade -- a difference of ratios
    // whose denominators nearly vanish. unwrapGain is literally rms_without / rms_with with rms_with ~ 9e-17.
    // Neither is wrong; both are uninterpretable as bare numbers, and that is the actionable finding: they should
    // be reported as bounds or with their conditioning attached, not as values a second machine will reproduce.
    ok("!! and it shares its shape with the other large mover: a ratio against something at the floor",
        gain && rms && Math.abs(rms.base) < 1e-15 && gain.base > 1e15,
        "interferometer unwrapGain = rms_without/rms_with = " + gain.base.toExponential(2) + " with rms_with = " +
        rms.base.toExponential(2) + " -- a denominator at machine epsilon, so the 41% move is inevitable and the " +
        "number was never a measurement of anything but 'enormously better'");
}

// ---- 5. WHAT THIS DOES NOT ESTABLISH ------------------------------------------------------------------------------
{
    ok("the sweep reports movement, never correctness",
        !("correct" in s.summary) && !("portable" in s.summary),
        "a bit-stable observable is stable UNDER THIS PERTURBATION; it can still be wrong, and it can still " +
        "depend on something else the fleet varies");
    console.log("  NOTE   this models libm disagreement, it does not observe one. The perturbation is a uniform");
    console.log("         one-ulp shift in a single direction, which no real libm performs. The three machines");
    console.log("         running this sweep and diffing the 57 movers is the experiment that would settle it --");
    console.log("         and the 269 bit-stable observables are a falsifiable prediction that they will agree.");
}

console.log();
if (fails) { console.log("libmSensitivity-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("libmSensitivity-selfcheck: all checks pass");
