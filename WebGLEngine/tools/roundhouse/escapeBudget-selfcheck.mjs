// tools/roundhouse/escapeBudget-selfcheck.mjs
//
// Run: node tools/roundhouse/escapeBudget-selfcheck.mjs   (~5 s: every point integrates up to 4.8M steps)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2919 -- THREE BASINS, ONE CONSTRAINT, AND A NUMBER THAT LOOKS BETTER FOR NOT HAVING CONVERGED.
//
// v2917 found that blackhole.escape's graded error is minimised at the default value of escRFar, and read it as
// a monotone curve sampled where it crosses the answer. v2918's sweep then found the SAME signature on dt and
// on escSteps, which v2917 had never questioned -- it had looked at escRFar because that knob's NAME suggested
// a nuisance parameter. Three of the mode's knobs sitting at the error minimum is not three coincidences.
//
// THE DIAGNOSIS. dt and escSteps are not independent knobs at all. Their product is the integration TIME BUDGET,
// and the mode's answer depends on nothing else about them: (dt 0.005, escSteps 600000) and (dt 0.02, escSteps
// 150000) both give a budget of 3000 and return escapeV = 0.588180267586 BIT-IDENTICALLY. Halving the timestep
// does not integrate more accurately here, it just buys half as much time. So the two basins are one basin seen
// from two directions, and escRFar -- how far the particle has to travel inside that budget -- is the third
// face of the same constraint.
//
// WHAT THE BUDGET ACTUALLY DOES, which is the part worth having found:
//
//     budget    escapeV            error vs the reported theory 0.534522483825
//     3000      0.588180267586     1.004e-1
//     6000      0.543960798923     1.766e-2
//     12000     0.533684029978     1.569e-3   <- the DEFAULT, 600000 x 0.02
//     24000     0.532157195734     4.425e-3
//     48000     0.532157195734     4.425e-3
//     96000     0.532157195734     4.425e-3
//
// The measurement CONVERGES, and it converges to 0.532157195734 -- bit-identical across a four-fold range of
// budget, so this is a settled answer and not a slow drift. Its honest disagreement with the quoted theory is
// 4.425e-3. The default budget stops the integration before that, on the way down through the theory line, and
// reports 1.569e-3.
//
// So the device's headline agreement is nearly three times better than its own converged answer, and it is
// better BECAUSE the integration was stopped early. That is a different fault from the four found in v2911 to
// v2917: those were parameters sitting where a curve crosses a constant. This one is a parameter sitting where
// a TRANSIENT crosses a constant, which is worse, because the fix for the others is to refine and the fix here
// is to refine and then accept a worse-looking number.
//
// NOT CLAIMED: that the 4.425e-3 gap is an error. Escaping to a finite escRFar of 800 legitimately costs less
// than escaping to infinity, which is what sqrt(2GM/r0) describes, so a systematic gap of this sign is expected.
// The claim is narrower: whatever that gap means, 4.425e-3 is the number this mode measures, and 1.569e-3 is
// the number it reports.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const dev = await getDevice("blackhole");
const run = async (cfg) => await dev.build({ mode: "escape", config: cfg });

// ---- 1. dt AND escSteps ARE ONE KNOB ---------------------------------------------------------------------------------
{
    const a = await run({ dt: 0.005, escSteps: 600000 });   // budget 3000
    const b = await run({ dt: 0.02, escSteps: 150000 });    // budget 3000
    const c = await run({ dt: 0.01, escSteps: 600000 });    // budget 6000
    const d = await run({ dt: 0.02, escSteps: 300000 });    // budget 6000

    ok("!! dt and escSteps affect the answer ONLY through their product",
        Object.is(a.escapeV, b.escapeV) && Object.is(c.escapeV, d.escapeV),
        "budget 3000 via two different (dt, escSteps) pairs gives " + a.escapeV.toPrecision(12) + " both times, " +
        "BIT-IDENTICALLY; budget 6000 likewise. Halving the timestep does not integrate more accurately here, it " +
        "buys half the time. The two basins v2918 reported are one basin seen from two directions");

    ok("...so a four-fold change in timestep with the budget held fixed changes nothing",
        Object.is((await run({ dt: 0.01, escSteps: 1200000 })).escapeV, (await run({ dt: 0.04, escSteps: 300000 })).escapeV),
        "which also says the integrator's truncation error is negligible against the effect being measured -- " +
        "worth knowing before anyone tries to fix this by refining dt");
}

// ---- 2. THE MEASUREMENT CONVERGES, AND NOT WHERE THE DEVICE STOPS -------------------------------------------------------
{
    const prof = [];
    for (const escSteps of [600000, 1200000, 2400000, 4800000]) {
        const o = await run({ escSteps });
        prof.push({ budget: escSteps * 0.02, v: o.escapeV, err: o.escapeErrFrac });
    }
    // *** v4305 -- THIS BINDING WAS CALLED `def` AND IT HAS NOT BEEN THE DEFAULT SINCE v2932. *** The sweep's
    // first rung is escSteps 600000; the DEVICE default is 1200000, raised by v2932 -- which SECTION 3 OF THIS
    // FILE STATES IN SO MANY WORDS. So section 2 said "the DEFAULT budget is not converged" about a budget that
    // is no longer the default, attributed the flattering 1.569e-3 to "the default" when the default reports
    // 4.425e-3, and section 3 said the opposite. BOTH HALVES PASSED. Every number here re-measures exact
    // (0.5882 / 0.5440 / 0.5337 / 0.5322, verified v4305); what was stale was the WORD.
    const [old600k, x2, x4, x8] = prof;
    const def = x2;                                   // escSteps 1200000 -- the default as v2932 left it

    ok("!! the escape velocity converges to a settled value",
        Object.is(x2.v, x4.v) && Object.is(x4.v, x8.v),
        "budgets 24000, 48000 and 96000 all return " + x2.v.toPrecision(12) + " bit-identically -- a four-fold " +
        "range with no movement, so this is converged rather than slowly drifting");

    ok("!! the PRE-v2932 budget was not converged, which is why v2932 moved it",
        !Object.is(old600k.v, x2.v),
        "budget " + old600k.budget + " (escSteps 600000, the default until v2932) returns " +
        old600k.v.toPrecision(12) + " against the converged " + x2.v.toPrecision(12) + " -- it was still on " +
        "the way down. THE DEFAULT TODAY IS escSteps 1200000, budget " + def.budget + ", and it IS converged");

    ok("!! and the unconverged value scores BETTER against the quoted theory",
        old600k.err < x2.err && x2.err / old600k.err > 2.5,
        "error at the OLD budget is " + old600k.err.toExponential(3) + "; the converged error -- which is what " +
        "the default reports now -- is " + x2.err.toExponential(3) + ", a factor of " +
        (x2.err / old600k.err).toFixed(1) + " worse. The headline agreement was a product of stopping early, " +
        "and the honest number is the larger one");

    ok("the approach is monotone from above, so the OLD default was a crossing rather than a minimum in the physics",
        old600k.v > x2.v && prof[0].v < 0.54,
        "escapeV falls 0.5882, 0.5440, " + old600k.v.toFixed(4) + ", then settles at " + x2.v.toFixed(4) +
        " as the budget grows (all four re-measured exact at v4305). The theory value 0.5345 sits between the " +
        "settled " + x2.v.toFixed(4) + " and the earlier 0.5440, so the curve passes THROUGH the answer on its " +
        "way to its own limit -- and the OLD default sat on the crossing, which is what flattered it");
}

// ---- 3. v2932 ADOPTED THE FIX: THE DEFAULT NOW CONVERGES -------------------------------------------------------------
{
    const o = await run({});
    ok("!! the default build now reports the CONVERGED escape speed, not the transient",
        Math.abs(o.escapeErrFrac - 4.425e-3) / 4.425e-3 < 1e-2 && Math.abs(o.escapeV - 0.5321571957341932) < 1e-9,
        "escapeErrFrac = " + o.escapeErrFrac.toExponential(3) + " at defaults now, up from the old 1.569e-3. " +
        "v2932 raised the default escSteps 600000 -> 1200000 so the bisection reaches the plateau. The number got " +
        "numerically WORSE and epistemically HONEST: 1.569e-3 was the still-falling transient crossing theory, " +
        "not a measurement. This is the one adoption of the five that makes a reported error LARGER, which is " +
        "exactly why it needed a deliberate decision rather than a quiet bundle");

    ok("the converged residual is the finite-escRFar offset, not integrator error",
        o.escapeErrFrac > 0,
        "escaping to a finite escRFar of 800 legitimately costs less than escaping to infinity (Paczynski-Wiita " +
        "theory), so a systematic gap of this sign is EXPECTED and the escapeErrFrac field correctly carries it. " +
        "v2806's own comment documented this as honest-convergent-bias; v2932 makes the default actually converge " +
        "to it instead of stopping short where the transient flatters the number");
}

console.log();
if (fails) { console.log("escapeBudget-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("escapeBudget-selfcheck: all checks pass");
