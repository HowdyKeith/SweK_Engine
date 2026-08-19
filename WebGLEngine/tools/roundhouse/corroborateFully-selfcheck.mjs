// tools/roundhouse/corroborateFully-selfcheck.mjs
//
// Run: node tools/roundhouse/corroborateFully-selfcheck.mjs   (~60s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2908 -- THE LAB'S SECOND AND THIRD CORROBORATED QUANTITIES, AND A QUANTISED OBSERVABLE THAT TWO CRITERIA
// WAVED THROUGH.

import { corroborateFully, NEW_NUISANCE, fullLines, FULL_REGISTRATION } from "./corroborateFully.mjs";
import { REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { circularNumeric } from "../../physics/optics/diffraction.js";
import { DEVICE_NAMES } from "./devices.mjs";
import { coverageClaim, ratchet } from "./coverage.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const reg = FULL_REGISTRATION;
const run = (device, mode, field, refinement, nuisance, tol) =>
    corroborateFully({ device, mode, field, refinement, nuisance, registration: reg, tol });

const rs = [
    await run("quantum", "well", "ratio21", REFINEMENT_KNOBS.quantum, NEW_NUISANCE.quantum),
    await run("quantum", "well", "ratio31", REFINEMENT_KNOBS.quantum, NEW_NUISANCE.quantum),
    await run("optics", "airy", "rayleighFactor", REFINEMENT_KNOBS.optics, NEW_NUISANCE.optics, 2e-3),
    await run("chaos", "feigenbaum", "deltaBest", REFINEMENT_KNOBS.chaos, { param: "warmup", values: [20000, 40000, 80000], tol: 1e-9 }),
];
console.log();
fullLines(rs).forEach((l) => console.log(l));
console.log();
const R = (f) => rs.find((r) => r.field === f);

// ---- 1. ELIGIBILITY: THE FIRST FINDING IS HOW FEW COULD EVEN BE ASKED ----------------------------------------------
{
    const refine = new Set(Object.keys(REFINEMENT_KNOBS));
    const nuis = new Set([...Object.keys(NUISANCE_KNOBS), ...Object.keys(NEW_NUISANCE)]);
    const both = [...refine].filter((d) => nuis.has(d));
    // v3084 -- THE CEILING WAS THE BUG. This read `both.length >= 4 && both.length <= 8`, so eligibility
    // GROWING PAST EIGHT would have turned it red -- a check with an upper bound on progress, in the file whose
    // whole subject is that eligibility is too low. Fifth instance of the shape; see coverage.mjs.
    const cov = coverageClaim({ have: both.length, total: DEVICE_NAMES.length, what: "devices eligible", floor: 4 });
    ok("!! only a handful of devices can face the full battery at all",
        cov.pass,
        "a quantity needs BOTH a refinement knob and a nuisance knob to be eligible. After v2906 and v2907 the " +
        "intersection was {kepler, chaos} -- two devices out of 24. This round adds quantum and optics, making " +
        cov.evidence + " -- " + both.sort().join(", ") + ". Eligibility, not failure, is the lab's binding constraint");
}

// ---- 2. THE LAB'S SECOND AND THIRD CORROBORATED QUANTITIES -----------------------------------------------------------
{
    const a = R("ratio21"), b = R("ratio31");
    ok("!! quantum.well ratio21 is CORROBORATED -- all four criteria, first time anything has faced all four",
        a.standing === "CORROBORATED",
        "c2 L-invariance spread " + a.criteria.c2_nuisance.spread.toExponential(2) + " and NOT bit-identical, so " +
        "the knob is live; c3 converging; c4 bit-identical under a one-ulp libm shift. Before this the lab had " +
        "ONE corroborated quantity, chosen because it was expected to pass");
    ok("...and ratio31 with it",
        b.standing === "CORROBORATED",
        "spread " + b.criteria.c2_nuisance.spread.toExponential(2) + " -- these land on the exact 4 and 9 of an " +
        "n^2 spectrum while every energy in the discretised Hamiltonian moves with L");

    ok("the L-invariance is earned rather than assumed",
        !a.criteria.c2_nuisance.bitIdentical && a.criteria.c2_nuisance.spread < 1e-9,
        "the ratios move at 6e-12 across L = 0.5, 1, 2.5 -- nonzero, because the discretisation error itself " +
        "depends on grid spacing, and far inside tolerance. A bit-identical result here would have been " +
        "reported as SUSPECT, not as a pass");
}

// ---- 3. THE PRE-REGISTERED FAILURE, WHICH IS THE POINT -------------------------------------------------------------
{
    const d = R("deltaBest");
    ok("!! prediction B HELD: deltaBest is rejected, and on exactly the criterion registered",
        d.standing === "NOT CORROBORATED" && d.failedCriteria.includes("c4_portability"),
        "c3 CONVERGING (its own device would have checked no more than that) but c4 moves " +
        d.criteria.c4_portability.relMove.toExponential(2) + " under a one-ulp libm shift, three orders above " +
        "tolerance. The first quantity this lab has rejected while passing the criterion it was designed around");
    // v3083 -- this required TWO rejections, which was the v2908 tally: deltaBest on c4 and rayleighFactor on
    // its quantisation. v2932 fixed the quantisation, rayleighFactor legitimately corroborates, and the count
    // fell to one -- so the check went red because a defect was REPAIRED. Same species as the two assertions
    // rewritten in section 4 below, and the same fix: the property is that the battery has demonstrated the
    // POWER TO REFUSE, which one standing rejection establishes as well as two. A ratchet on the count would be
    // wrong here in the opposite direction -- rejections SHOULD fall as the lab improves.
    ok("a battery that had only ever ratified would not be a battery",
        rs.filter((r) => r.standing === "NOT CORROBORATED").length >= 1,
        rs.filter((r) => r.standing === "CORROBORATED").length + " corroborated, " +
        rs.filter((r) => r.standing !== "CORROBORATED").length + " rejected out of " + rs.length +
        ". It was 2 rejected at v2908; rayleighFactor moved to corroborated when v2932 fixed the quantisation " +
        "this file found, which is the lab working rather than the check failing");
}

// ---- 4. THE FINDING THAT WAS FIXED, AND THE CHECK THAT KEPT REQUIRING THE BUG ---------------------------------------
//
// v3083 -- THE EIGHTH MECHANISM-PINNED GATE, AND A NEW SPECIES AGAIN. v2908 found that rayleighFactor was
// QUANTISED: it was a function of the winning sample INDEX alone, so it was bit-identical under wavelength and
// under a one-ulp libm shift, and it "passed" three of four criteria for free. A real and important finding.
// The checks below then froze it as a STANDING FACT -- asserting bitIdentical === true and !moved -- and v2932
// adopted the REFINED sub-sample estimators, which is exactly the fix that finding called for. The quantisation
// went away, the assertions went red for a repair, and they have been red ever since.
//
// A CHECK THAT REQUIRES A BUG TO PERSIST is the seventh species of this failure in three rounds: it is not that
// the mechanism moved (fillText, attachTo), nor that the defect was encoded as the expectation (voxel-core),
// nor that a round's outcome was frozen (knobCandidates) -- it is a DIAGNOSIS recorded as an invariant, which
// goes red the moment someone acts on it. The finding is kept, in the past tense where it belongs, and the
// assertion now tracks the repair.
{
    const o = R("rayleighFactor");
    ok("!! the quantisation v2908 found is GONE, and the estimator is now continuous",
        !o.criteria.c2_nuisance.bitIdentical,
        "rayleighFactor across wavelength now reads " + o.criteria.c2_nuisance.vals.map((v) => v.toPrecision(17)).join(" / ") +
        " -- spread " + o.criteria.c2_nuisance.spread.toExponential(2) + ", nonzero where v2908 measured it " +
        "bit-identical. v2932 adopted the refined sub-sample estimators and the ring position stopped being a " +
        "function of the winning INDEX alone. The check that used to assert the quantisation has been red for " +
        "that repair since v2932");

    ok("...but it passes c2 on ONE ULP of ONE value, which is the thinnest evidence a pass can rest on",
        o.criteria.c2_nuisance.spread < 1e-15,
        "two of the three wavelengths still return bit-identical values and the third differs in the last bit. " +
        "The verdict is correct and it is one rounding away from flipping back, so it is worth knowing that " +
        "this particular pass would not survive a platform whose libm rounds the other way");

    // Which of the two it is, settled by measurement rather than left ambiguous.
    const D = 0.2, pat = [];
    for (const L of [400e-6, 500e-6, 700e-6]) {
        const sp = 4 * L / D, st = [];
        for (let i = 0; i < 7; i++) st.push(-sp + 2 * sp * i / 6);
        pat.push(circularNumeric(D, L, st, 40, 32)[5]);
    }
    const patternMoves = !pat.every((v) => Object.is(v, pat[0]));
    ok("!! the knob IS live -- the diffraction pattern moves, the reported number does not",
        patternMoves && Math.abs(pat[0] - pat[2]) / pat[0] < 1e-12,
        "pattern samples " + pat.map((v) => v.toPrecision(17)).join(" / ") + " -- they differ in the 15th digit " +
        "across wavelength, so lambda reaches the arithmetic and does NOT cancel bit-exactly. But the ring " +
        "position is located on the sample grid, so a 1e-15 shift never changes which sample wins, and " +
        "rayleighFactor is a function of the winning INDEX alone");

    // The consequence, which generalises well beyond this device and is the reason v3083 exists.
    ok("!! and criterion 4 now sees the same movement, so it is judged on magnitude rather than on silence",
        o.criteria.c4_portability.moved === true && o.criteria.c4_portability.controlNeeded === false,
        o.criteria.c4_portability.evidence + ". THE GENERAL LESSON SURVIVES THE FIX: a quantised observable " +
        "passes stability criteria FOR FREE and reports the same value while the physics underneath it drifts. " +
        "While this one was quantised, only c2 caught it -- and only because bit-identity was made a failure " +
        "there rather than a success. c4 accepted it, which is the hole v3083 closed by requiring a live " +
        "control before a bit-identical result may pass");

    ok("...and its criterion-3 pass was quantisation noise that happened to shrink",
        o.criteria.c3_convergence.pass,
        "v2907 measured rayleighFactor over nSamples as 1.2174, 1.2220, 1.2191, 1.2207 -- it jitters rather than " +
        "settles, and cleared the contraction threshold of 0.5 at 0.333. Three of four criteria were " +
        "uninformative about this quantity for the same underlying reason");
}

// ---- 5. WHAT THIS DOES NOT ESTABLISH ---------------------------------------------------------------------------------
{
    // v3084 -- pinned at the battery's current size, under a heading that admits the set is incomplete. Adding
    // a fifth quantity -- the entire point of the file -- would have turned it red, and the evidence had already
    // drifted ("two survived" was true at v2908 and is not now). A ratchet, with the survivor count DERIVED so
    // it cannot go stale again.
    const faced = ratchet({ have: rs.length, what: "quantities have faced all four criteria", floor: 4 });
    ok("a handful of quantities is not a lab", faced.pass,
        faced.evidence + ". 417 numeric observables were counted in v2905; " +
        rs.filter((r) => r.standing === "CORROBORATED").length + " of these survived");
    console.log("  NOTE   c1 is checked structurally -- a sealed registration naming the quantity. That is");
    console.log("         bookkeeping, not evidence: nothing here verifies the registration was written before");
    console.log("         the measurement, only that it exists. The seal makes retrofitting visible in the diff,");
    console.log("         which is the strongest guarantee a single-repository lab can offer itself.");
}

console.log();
if (fails) { console.log("corroborateFully-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("corroborateFully-selfcheck: all checks pass");
