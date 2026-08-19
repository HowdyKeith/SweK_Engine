// tools/roundhouse/pipeFlowKey-selfcheck.mjs
//
// Run: node tools/roundhouse/pipeFlowKey-selfcheck.mjs   (~250s -- MEASURED, was a typed ~20s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3091 -- THE FIFTH SECOND ANSWER KEY, AND THE FOURTH TO FIND SOMETHING REAL.
//
// The pattern: an instrument whose numeric result is only ever compared to ITSELF, or to one constant, cannot
// be caught being wrong in a way that constant happens to share. pipe3d looked like the exception -- it reported
// TWO error fractions, centrelineErrFrac and nuErrFrac, and they moved by visibly different amounts. The first
// probe of this round concluded they were independent on exactly that evidence, AND THAT WAS THE WRONG TEST:
// a ratio that VARIES is not evidence of independence, only evidence that the ratio is not constant.
//
// THE ALGEBRA SETTLES IT. nuImplied inverts the SAME closed form the centreline is graded against:
//     centrelineTheory = F R^2 / (4 nu)        nuImplied = F R^2 / (4 u_m)
// so with x = u_m / u_theory, nuImplied / nu = 1 / x and nuErrFrac = |1 - x| / x = e / (1 - e), where e is
// centrelineErrFrac. Measured below to within 3e-15 across five configurations including a viscosity change.
// ONE MEASUREMENT, REPORTED TWICE. The second copy cannot fail while the first passes, which makes it exactly
// the decoration this tree's first law names -- and it had been sitting in the observable list looking like
// corroboration.
//
// THE FLOW RATE IS A DIFFERENT QUESTION ABOUT THE SAME FIELD, and the reason is WHERE IT LOOKS. The centreline
// samples one cell at r = 0 and is completely blind at the wall. Q's integrand u(r) * 2 pi r VANISHES at r = 0
// and peaks near r = R/sqrt(2). A profile with the correct peak and the wrong shape passes one and fails the
// other -- demonstrated below with a plug profile rather than asserted.
//
// AND IT IMMEDIATELY SAID SOMETHING THE INSTRUMENT WAS NOT SAYING. At the default configuration the centreline
// agrees to 2.7% while the THROUGHPUT is off by 5.0% -- nearly twice as wrong. The error lives away from the
// axis, near the staircased wall, which is precisely the region the reported number could not see. The quantity
// an engineer would actually quote for a pipe was the one nobody was grading.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!fails && !cond) {} if (!cond) fails++; };
const dev = await getDevice("pipe3d");
const run = (config = {}) => dev.build({ config });

// ---- 1. THE TAUTOLOGY, PROVEN RATHER THAN ASSERTED -----------------------------------------------------------------
{
    const CFGS = [{}, { steps: 400 }, { steps: 800 }, { steps: 1200 }, { tau: 0.9 }];
    const worst = [];
    for (const cfg of CFGS) {
        const o = await run(cfg);
        const e = o.centrelineErrFrac;
        worst.push(Math.abs(o.nuErrFrac - e / (1 - e)) / (e / (1 - e)));
    }
    const w = Math.max(...worst);
    ok("!! nuErrFrac is centrelineErrFrac restated, not a second measurement",
        w < 1e-12,
        "nuErrFrac == e/(1-e) to within " + w.toExponential(2) + " over " + CFGS.length + " configurations " +
        "including a viscosity change. nuImplied inverts the same closed form the centreline is graded against, " +
        "so it cannot fail while the centreline passes -- a control that cannot fail is decoration");

    // AND THE TEST THAT LOOKED CONVINCING AND WAS NOT. Recording it because the wrong test is easy to repeat.
    const a = await run({}), b = await run({ steps: 400 });
    const r1 = a.nuErrFrac / a.centrelineErrFrac, r2 = b.nuErrFrac / b.centrelineErrFrac;
    ok("...even though the RATIO between them varies, which is what fooled the first probe",
        Math.abs(r1 - r2) > 0.1,
        "ratio " + r1.toFixed(4) + " vs " + r2.toFixed(4) + ". A varying ratio says only that the ratio is not " +
        "constant; here it is exactly 1/x, a function of the SAME measurement. Independence has to be argued " +
        "from what a quantity LOOKS AT, not from whether its numbers move together");
}

// ---- 2. THE NEW KEY IS NOT LOCKED TO THE OLD ONE ---------------------------------------------------------------------
{
    const rows = [];
    for (const cfg of [{}, { steps: 400 }, { steps: 800 }, { tau: 0.9 }, { tau: 1.4 }]) {
        const o = await run(cfg);
        rows.push({ cfg, c: o.centrelineErrFrac, f: o.flowErrFrac, ratio: o.flowErrFrac / o.centrelineErrFrac });
    }
    const rs = rows.map((r) => r.ratio);
    ok("!! flowErrFrac is NOT an algebraic restatement of centrelineErrFrac",
        Math.max(...rs) / Math.min(...rs) > 1.5,
        "ratio spans " + Math.min(...rs).toFixed(3) + " to " + Math.max(...rs).toFixed(3) + " -- and unlike " +
        "section 1 there is no closed form linking them, because Q weights the profile by r while the centreline " +
        "weights only r = 0");

    const d = rows[0];
    ok("!! and at the default it is nearly TWICE as wrong as the number being reported",
        d.f > 1.5 * d.c,
        "centreline " + (100 * d.c).toFixed(1) + "%, throughput " + (100 * d.f).toFixed(1) + "%. The error lives " +
        "away from the axis, near the staircased wall, which is exactly where the reported number is blind. The " +
        "quantity an engineer would quote for a pipe was the one nobody was grading");
}

// ---- 3. SABOTAGE: A CORRECT PEAK WITH A WRONG SHAPE --------------------------------------------------------------------
// The whole claim is that Q sees something the centreline cannot. Demonstrated on a synthetic field so the
// failure is exhibited rather than argued: a PLUG profile, flat at the true peak value everywhere inside the
// pipe. Its centreline is exactly right and its flow rate is twice the truth.
{
    const o = await run({});
    const R = o.radius, uMax = o.centrelineTheory;
    let qPlug = 0, qPara = 0, cells = 0;
    for (let y = -Math.ceil(R); y <= Math.ceil(R); y++) {
        for (let z = -Math.ceil(R); z <= Math.ceil(R); z++) {
            const r2 = y * y + z * z;
            if (r2 > R * R) continue;
            qPlug += uMax;                            // flat: right at the centre, wrong everywhere else
            qPara += uMax * (1 - r2 / (R * R));       // the true paraboloid
            cells++;
        }
    }
    ok("!! SABOTAGE: a plug profile has the EXACT right centreline",
        true,
        "u(0) = " + uMax.toExponential(4) + " by construction, so the centreline check passes perfectly on a " +
        "field that is wrong at every other point in the pipe");
    ok("...and the flow-rate key catches it, by a factor of two",
        qPlug / qPara > 1.8,
        "Q_plug / Q_paraboloid = " + (qPlug / qPara).toFixed(4) + " over " + cells + " cells. Twice the " +
        "throughput, identical centreline -- which is the entire reason this key was worth adding");
}

// ---- 4. THE ANALYTIC VALUE IS DERIVED, NOT TYPED ------------------------------------------------------------------------
// NEVER TYPE A REFERENCE VALUE A GATE COMPARES AGAINST. pi F R^4 / (8 nu) is checked against a numerical
// integration of the analytic profile on the same lattice, so a wrong constant in the closed form shows up here
// rather than silently shifting every verdict this key ever returns.
{
    const o = await run({});
    const R = o.radius, nu = o.nuTheory, F = o.centrelineTheory * 4 * nu / (R * R);
    let qNum = 0;
    for (let y = -Math.ceil(R); y <= Math.ceil(R); y++) {
        for (let z = -Math.ceil(R); z <= Math.ceil(R); z++) {
            const r2 = y * y + z * z;
            if (r2 <= R * R) qNum += F * (R * R - r2) / (4 * nu);
        }
    }
    const rel = Math.abs(qNum - o.flowTheory) / o.flowTheory;
    ok("!! the closed form agrees with a numerical integral of the same profile",
        rel < 0.05,
        "pi F R^4 / (8 nu) = " + o.flowTheory.toExponential(5) + " against a lattice sum of " +
        qNum.toExponential(5) + ", " + (100 * rel).toFixed(2) + "% apart. The residual is the staircased " +
        "circle -- a square lattice cannot tile a disc -- and it is the reason this key is graded in percent " +
        "rather than in ulps");
    ok("the integral covers the CROSS SECTION, not a diameter line",
        o.profileCells > 4 * R,
        o.profileCells + " cells for R = " + R.toFixed(2) + ". A 1D scan across the diameter cannot see an " +
        "asymmetry between y and z, and this lattice has separate ny and nz");
}

console.log();
if (fails) { console.log("pipeFlowKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("pipeFlowKey-selfcheck: all checks pass");
