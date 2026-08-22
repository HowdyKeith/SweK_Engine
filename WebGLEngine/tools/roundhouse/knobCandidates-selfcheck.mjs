// tools/roundhouse/knobCandidates-selfcheck.mjs
//
// Run: node tools/roundhouse/knobCandidates-selfcheck.mjs   (~6 s: blackhole escape is 600k steps per point)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2917 -- THREE KNOBS EXAMINED, THREE REJECTED, AND THE ONE THAT MATTERED.
//
// Every claim in knobCandidates.mjs is re-measured here rather than quoted, because a register of rejected
// candidates is exactly the kind of file that rots: the reasons stop being true when a device changes and
// nobody re-runs the prose.

import { REJECTED_KNOBS, ESC_RFAR_PROFILE, compensatedPairIsVacuous } from "./knobCandidates.mjs";
import { classifySequence, REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { NEW_NUISANCE } from "./corroborateFully.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. ELIGIBILITY IS STILL THE CONSTRAINT ------------------------------------------------------------------------
{
    const re = new Set(Object.keys(REFINEMENT_KNOBS));
    const nu = new Set([...Object.keys(NUISANCE_KNOBS), ...Object.keys(NEW_NUISANCE)]);
    const eligible = [...re].filter((d) => nu.has(d)).sort();
    // v3081 -- THE SEVENTH MECHANISM-PINNED GATE, and the first to pin a ROUND'S OUTCOME rather than a mechanism.
    // This was `eligible.length === 4`: v2909 examined three candidates, rejected all three, and froze "the set
    // did not grow" as a standing assertion. It is a true and valuable RECORD of that round and it is not an
    // invariant -- it goes red the moment anyone succeeds at the thing this whole file exists to attempt, which
    // is what happened when v3081 registered lens. A gate that fails on progress teaches people to delete gates.
    //
    // The property underneath is that ELIGIBILITY IS STILL THE CONSTRAINT -- a small minority of devices can
    // face the battery at all. Asserted as a RATCHET, the same shape gateQuality uses for the prose-wrapping
    // debt: the set may GROW and must not SHRINK, because a device losing a knob is a real regression while a
    // device gaining one is the goal. The v2909 finding is kept as the record it is, in the evidence.
    ok("!! eligibility is still the constraint, and the set has not shrunk",
        eligible.length >= 4 && eligible.length * 4 < DEVICE_NAMES.length,
        "eligible: " + eligible.join(", ") + " -- " + eligible.length + " of " + DEVICE_NAMES.length + " (" +
        (100 * eligible.length / DEVICE_NAMES.length).toFixed(0) + "%). v2909's record stands: three candidates " +
        "were examined that round and all three rejected, and a round that declared them anyway would have " +
        "added two devices to the count and two wrong verdicts to the lab");
}

// ---- 2. REJECTION 1: A MONTE CARLO SAMPLE COUNT IS NOT A REFINEMENT KNOB --------------------------------------------
{
    const dev = await getDevice("ising");
    const vals = [];
    for (const samples of [100, 200, 400, 800]) vals.push((await dev.build({ mode: "order", config: { samples } })).magnetisation);
    const cls = classifySequence(vals, [100, 200, 400, 800]);

    ok("!! ising.samples would be classified DRIFTING for a device behaving correctly",
        cls.verdict === "DRIFTING",
        "magnetisation " + vals.map((v) => v.toFixed(6)).join(", ") + " -- non-monotone, so successive " +
        "differences do not shrink and criterion 3 fails it. The device is fine: a Monte Carlo estimator " +
        "random-walks inside a standard error that falls as 1/sqrt(N), which is convergence in distribution and " +
        "not what classifySequence tests");

    ok("...and the gap is recorded as a gap in the CRITERIA, not a defect in ising",
        /statistical variant|1\/sqrt\(N\)/.test(REJECTED_KNOBS["ising.samples"].gap),
        "the correct test is that the SEED SPREAD shrinks as 1/sqrt(N). Nothing in this tree measures that, so " +
        "criterion 3 currently cannot be asked of any stochastic device -- and ising is the only one");
}

// ---- 3. REJECTION 2: A COMPENSATED PAIR CAN BE VACUOUS BY ARITHMETIC --------------------------------------------------
{
    ok("!! lambda * (1/lambda) is exactly 1.0 for every lambda tried",
        compensatedPairIsVacuous(),
        "2, 3, 5, 7, 0.3, 1.7 all round-trip exactly, so a G/M compensated nuisance reconstructs GM bit-for-bit");

    const dev = await getDevice("blackhole");
    const a = await dev.build({ mode: "escape", config: { G: 1, M: 1 } });
    const b = await dev.build({ mode: "escape", config: { G: 5, M: 1 / 5 } });
    ok("...and the whole build is consequently bit-identical, which is a vacuous pass not a real invariance",
        Object.is(a.escapeV, b.escapeV) && Object.is(a.escapeTheory, b.escapeTheory),
        "escapeV identical at " + a.escapeV.toPrecision(12) + " across lambda = 1 and 5. v2906's rule reports " +
        "bit-identical as SUSPECT rather than as success, which is the only reason this did not become a " +
        "declared knob and a fake criterion-2 pass");
}

// ---- 4. REJECTION 3, AND THE FINDING ------------------------------------------------------------------------------------
{
    const dev = await getDevice("blackhole");
    const got = [];
    for (const s of ESC_RFAR_PROFILE.samples) {
        const o = await dev.build({ mode: "escape", config: { escRFar: s.escRFar } });
        got.push({ escRFar: s.escRFar, escapeV: o.escapeV, errFrac: o.escapeErrFrac, isDefault: !!s.isDefault });
    }

    const nonDecreasing = got.every((g, i) => i === 0 || g.escapeV >= got[i - 1].escapeV);
    ok("!! escapeV depends strongly on where 'escaped' is declared (non-decreasing, with a low-end plateau)",
        nonDecreasing && got[got.length - 1].escapeV > got[0].escapeV,
        "escRFar 200 -> 1600 moves escapeV " + got[0].escapeV.toFixed(6) + " -> " + got[got.length - 1].escapeV.toFixed(6) +
        ", increasing (with a low-end plateau where the boundary is inside the settled trajectory). Still a " +
        "convergence knob, not a nuisance -- the invariance the name suggests does not hold. v2932 NOTE: after the " +
        "budget adoption the profile shifted but the CHARACTER is unchanged: escRFar still moves the answer");

    const best = got.reduce((a, g) => (g.errFrac < a.errFrac ? g : a), got[0]);
    ok("!! the error is NO LONGER minimised at the default -- v2932's budget adoption broke that alignment",
        best.isDefault === false && best.escRFar === 1200,
        "errFrac by escRFar: " + got.map((g) => g.escRFar + ":" + g.errFrac.toExponential(2)).join("  ") +
        " -- minimum now at " + best.escRFar + ", NOT the default 800. v2917 flagged that the graded error sat " +
        "at the default escRFar; raising escSteps to the converged budget shifted the profile so the minimum " +
        "moved to 1200. The suspicious coincidence v2917 named is gone -- adopting the budget fix removed it");

    // the mechanism: it crosses the answer rather than converging to it
    const below = got.filter((g) => g.escapeV < ESC_RFAR_PROFILE.theory);
    const above = got.filter((g) => g.escapeV > ESC_RFAR_PROFILE.theory);
    ok("!! because the curve CROSSES the theory value rather than converging to it",
        below.length > 0 && above.length > 0,
        below.length + " samples below the theory 0.5345 and " + above.length + " above it. The error minimum is " +
        "the crossing point. The reported 1.57e-3 agreement is not evidence the integrator is accurate -- it is " +
        "evidence a monotone curve was sampled where it crosses the answer, and refining escRFar makes the " +
        "agreement worse in BOTH directions, without limit");

    ok("the profile in the register matches what the device does now",
        got.every((g, i) => Math.abs(g.errFrac - ESC_RFAR_PROFILE.samples[i].errFrac) / g.errFrac < 1e-3),
        "re-measured rather than quoted, so the register cannot rot into prose that used to be true");
}

// ---- 5. WHAT IS AND IS NOT CLAIMED --------------------------------------------------------------------------------------
{
    ok("no claim is made that anyone tuned the default",
        /NOT CLAIMED: that anyone tuned it/.test(
            (await import("node:fs")).readFileSync(new URL("./knobCandidates.mjs", import.meta.url), "utf8")),
        "the default may predate the theory comparison entirely. What is claimed is narrower and sufficient: the " +
        "number cannot be read as a validation, and nothing in the device says so");
    console.log("  NOTE   this is the fourth member of a family -- an impressive agreement produced by where a");
    console.log("         parameter sits rather than by the physics. v2911 airy, v2913 slit, v2914 edge were all");
    console.log("         discretisation grids landing on a constant. This one is a PHYSICAL parameter, which");
    console.log("         means the pattern is not confined to sampling and the other 20 devices are unexamined.");
}

console.log();
if (fails) { console.log("knobCandidates-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("knobCandidates-selfcheck: all checks pass");
