// tools/roundhouse/twoBody-selfcheck.mjs
//
// Run: node tools/roundhouse/twoBody-selfcheck.mjs   (~30s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2937 -- A NEW DEVICE, SO THE GATE MUST EARN IT. Three closed-form keys and a new conserved quantity, each
// checked two ways: that it HITS its key when the physics is right, and that it MOVES when the physics is wrong.
// A new device whose observables are only ever seen passing has unknown power over a device that is broken --
// the same planted-error discipline v2893 established for the censuses applies doubly to a device written today.

import { getDevice } from "./devices.mjs";
import { integrateTwoBody, setupTwoBody, barycentre } from "../../physics/orbits/twoBody.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const dev = await getDevice("twobody");

// ---- PRE-REGISTERED before the run --------------------------------------------------------------------------------
// A) amplitude ratio a1/a2 = m2/m1 to machine precision (a pure ratio, no discretisation in it)
// B) total-mass period error is DISCRETISATION-limited: ~1e-4 at 400 steps/orbit and falling as the step shrinks
// C) barycentre drift is NON-ZERO (real rounding accumulation, ~1e-14) but bounded -- NOT the structural 0 the
//    relative-coordinate shortcut would give, and it must respond to a real displacement

// ---- 1. THE KEYS ARE HIT WHEN THE PHYSICS IS RIGHT ------------------------------------------------------------------
{
    const o = await dev.build({ mode: "orbit" });
    ok("!! amplitude ratio a1/a2 = m2/m1 to machine precision",
        o.ratioErrFrac < 1e-11,
        "m1=3, m2=1: measured a1/a2 = " + o.ratioMeasured.toFixed(9) + " vs exact " + o.ratioExact.toFixed(9) +
        " (err " + o.ratioErrFrac.toExponential(2) + "). The heavier body moves less, in exact inverse proportion");

    ok("!! total-mass Kepler III period holds to discretisation error",
        o.periodErrFrac < 1e-3 && o.periodErrFrac > 1e-6,
        "T = 2pi sqrt(a^3/(G(m1+m2))): measured " + o.periodMeasured.toFixed(4) + " vs exact " +
        o.periodExact.toFixed(4) + " (err " + o.periodErrFrac.toExponential(2) + ", the 400-step floor). The " +
        "period depends on the SUM of the masses -- the signature of a two-body system, not a test particle");

    ok("!! the barycentre stays fixed to ~1e-14 -- real rounding, not a structural zero",
        o.barycentreDriftFrac > 0 && o.barycentreDriftFrac < 1e-10,
        "worst R_cm drift " + o.barycentreDriftFrac.toExponential(2) + " of the semi-major axis, net momentum " +
        o.netMomentum.toExponential(2) + ". Symplectic Verlet conserves the momentum that holds the barycentre " +
        "fixed, but only to accumulated rounding -- a nonzero value is the honest signature of a real integration");
}

// ---- 2. THE RATIO KEY DISTINGUISHES MASS RATIOS (not hard-coded) ----------------------------------------------------
{
    const ratios = [];
    for (const [m1, m2] of [[3, 1], [10, 1], [5, 2], [1, 4]]) {
        const o = await dev.build({ mode: "ratio", config: { m1, m2 } });
        ratios.push({ m1, m2, measured: o.ratioMeasured, exact: m2 / m1, err: o.ratioErrFrac });
    }
    ok("!! the amplitude ratio tracks m2/m1 across a range of mass ratios",
        ratios.every((r) => r.err < 1e-10),
        ratios.map((r) => `${r.m1}:${r.m2}->${r.measured.toFixed(4)}`).join(", ") + " -- each matching m2/m1 " +
        "exactly. The ratio is MEASURED from peak excursions, not read from the masses, so agreement is evidence");
}

// ---- 3. PLANTED ERRORS: THE KEYS MOVE WHEN THE PHYSICS IS WRONG -----------------------------------------------------
{
    // (a) barycentre check detects a real displacement -- not always zero
    const S = setupTwoBody({ m1: 3, m2: 1, a: 10, e: 0.3 });
    const bc0 = barycentre(S.b1, S.b2, 3, 1);
    const nudged = barycentre({ ...S.b1, x: S.b1.x + 0.5 }, S.b2, 3, 1);
    ok("!! a real body displacement moves the barycentre by exactly m1/M * displacement",
        Math.hypot(bc0.x, bc0.y) < 1e-12 && Math.abs(nudged.x - (3 / 4) * 0.5) < 1e-12,
        "unperturbed R_cm at " + Math.hypot(bc0.x, bc0.y).toExponential(1) + "; nudging body1 by 0.5 moves R_cm " +
        "to " + nudged.x.toFixed(4) + " = (m1/M)*0.5. The check is a real measurement, not a constant zero");

    // (b) using the WRONG mass in the period key breaks it -- proves the period genuinely depends on total mass
    const o = await dev.build({ mode: "orbit", config: { m1: 3, m2: 1 } });
    const wrongKey = 2 * Math.PI * Math.sqrt(10 ** 3 / (1 * 3));   // period as if only ONE mass mattered (mu=3)
    const relToWrong = Math.abs(o.periodMeasured - wrongKey) / wrongKey;
    ok("!! the measured period matches TOTAL mass, not either mass alone",
        relToWrong > 0.1,
        "measured period " + o.periodMeasured.toFixed(3) + " is " + (100 * relToWrong).toFixed(0) + "% off from " +
        "the single-mass key " + wrongKey.toFixed(3) + " -- so the period genuinely encodes m1+m2, which is the " +
        "whole distinction from a test-particle orbit. A test particle would match the single-mass key");
}

// ---- 4. THE RESOLUTION KNOB IS LIVE (period converges) --------------------------------------------------------------
{
    const errs = [];
    for (const spo of [100, 400, 1600]) {
        const o = await dev.build({ mode: "conserve", config: { stepsPerOrbit: spo, orbits: 20 } });
        errs.push({ spo, e: o.periodErrFrac });
    }
    ok("!! the period error falls as the step shrinks -- a genuine convergence knob",
        errs[0].e > errs[1].e && errs[1].e > errs[2].e,
        "periodErrFrac at 100/400/1600 steps/orbit: " + errs.map((x) => x.e.toExponential(2)).join(" -> ") +
        ", converging. A dead knob would leave it flat -- this one refines the measurement as expected");
}

// ---- 5. THE SYMMETRIC CASE IS EXACTLY ZERO BY A REAL SYMMETRY, NOT A BUG --------------------------------------------
{
    const o = await dev.build({ mode: "orbit", config: { m1: 2, m2: 2 } });
    ok("equal masses give ratio EXACTLY 1 and barycentre EXACTLY 0, by mirror symmetry",
        o.ratioErrFrac === 0 && o.barycentreDriftFrac === 0,
        "m1=m2=2: both bodies trace identical opposite orbits, so their peak excursions are bit-identical (ratio " +
        "exactly 1) and their positions exactly cancel (R_cm exactly 0). This is a genuine symmetry of the " +
        "configuration, not an unwired knob -- the asymmetric cases above show real nonzero rounding, which is " +
        "what proves the zero here is the symmetry and not a dead measurement");
}

console.log();
if (fails) { console.log("twoBody-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("twoBody-selfcheck: all checks pass");
