// tools/roundhouse/inspiral-selfcheck.mjs
//
// Run: node tools/roundhouse/inspiral-selfcheck.mjs   (~20s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2938 -- THE LAB'S FIRST RADIATIVE SCENE, AND THE TWO TRAPS IT WAS BUILT KNOWING ABOUT.
//
// Gravitational-wave inspiral graded against Peters (1964). A new device, and a radiative one, so the gate does
// three things: confirms it HITS the closed form, confirms the two anticipated traps are actually handled (not
// merely avoided by luck), and plants a wrong secular rate to prove the trajectory key would CATCH it.

import { getDevice } from "./devices.mjs";
import { integrateInspiral, mergerTimeExact, semiMajorExact } from "../../physics/orbits/inspiral.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const dev = await getDevice("inspiral");

// ---- PRE-REGISTERED --------------------------------------------------------------------------------------------------
// A) merger time matches Peters t_merge to better than 1e-6 (adaptive step + exact analytic tail)
// B) trajectory a(t) tracks Peters a(t) in the BULK to better than 1e-4 (the secular rate is right throughout)
// C) both errors CONVERGE as the step shrinks (rules out converged-but-wrong)
// D) a stays POSITIVE to the end (the a->0 singularity is handled, not overshot)

// ---- 1. THE MERGER TIME HITS PETERS ---------------------------------------------------------------------------------
{
    const o = await dev.build({ mode: "merger" });
    ok("!! measured merger time matches the Peters closed form",
        o.mergerErrFrac < 1e-6,
        "m1=3, m2=1, a0=10: measured t_merge = " + o.mergerMeasured.toFixed(6) + " vs Peters " +
        o.mergerExact.toFixed(6) + " (err " + o.mergerErrFrac.toExponential(2) + "). t_merge = (5/256)c^5 a0^4 / " +
        "(G^3 m1 m2 (m1+m2)) -- the Hulse-Taylor / LIGO coalescence time");

    // a0^4 scaling
    const r10 = (await dev.build({ mode: "merger", config: { a0: 10 } })).mergerMeasured;
    const r20 = (await dev.build({ mode: "merger", config: { a0: 20 } })).mergerMeasured;
    ok("...t_merge(a0=20) / t_merge(a0=10) = 2^4 = 16",
        Math.abs(r20 / r10 - 16) / 16 < 1e-4,
        "measured ratio " + (r20 / r10).toFixed(4) + " vs 16 -- doubling the initial separation multiplies the " +
        "merger time by 2^4, the signature of the a0^4 law. A wrong power would show here");
}

// ---- 2. THE TRAJECTORY TRACKS PETERS IN THE BULK (secular rate is right) --------------------------------------------
{
    const o = await dev.build({ mode: "track" });
    ok("!! a(t) tracks the closed-form trajectory throughout, not just at the endpoint",
        o.worstBulkErrFrac < 1e-4,
        "worst bulk deviation " + o.worstBulkErrFrac.toExponential(2) + " (t < 0.99 t_merge). This is the guard " +
        "against the secular 'converged but wrong' trap: a wrong shrink RATE would track poorly in the middle " +
        "even if the endpoint landed close. It tracks, so the rate is right along the whole inspiral");

    ok("the full-trajectory error is dominated by ENDPOINT amplification, correctly excluded from the bulk key",
        o.worstTrajErrFrac > o.worstBulkErrFrac * 100,
        "full worst " + o.worstTrajErrFrac.toExponential(2) + " at t/t_merge~1 vs bulk " +
        o.worstBulkErrFrac.toExponential(2) + ": the last 1% is a region where a is tiny and relative error " +
        "amplifies against a vanishing denominator (a v2905 floor artefact). The merger-time key covers the " +
        "endpoint; the bulk key covers the rate. Neither is asked to do the other's job");
}

// ---- 3. BOTH KEYS CONVERGE AS THE STEP SHRINKS (not converged-but-wrong) --------------------------------------------
{
    const errs = [];
    for (const safety of [0.02, 0.01, 0.005]) {
        const o = await dev.build({ mode: "merger", config: { safety } });
        const t = await dev.build({ mode: "track", config: { safety } });
        errs.push({ safety, merger: o.mergerErrFrac, bulk: t.worstBulkErrFrac });
    }
    ok("!! the merger error falls as the adaptive step shrinks",
        errs[0].merger > errs[1].merger && errs[1].merger > errs[2].merger,
        "mergerErrFrac at safety 0.02/0.01/0.005: " + errs.map((e) => e.merger.toExponential(2)).join(" -> ") +
        ", converging -- a real integration, not a value baked into the closed-form tail");

    ok("!! the bulk trajectory error also falls -- the secular rate converges to the right answer",
        errs[0].bulk > errs[1].bulk && errs[1].bulk > errs[2].bulk,
        "worstBulkErrFrac: " + errs.map((e) => e.bulk.toExponential(2)).join(" -> ") + ". Both keys refine " +
        "together, which is what rules out a rate that converged smoothly to the wrong number");
}

// ---- 4. THE a->0 SINGULARITY IS HANDLED (a stays positive) ----------------------------------------------------------
{
    const o = await dev.build({ mode: "merger" });
    ok("!! the semi-major axis stays POSITIVE to the stop point -- the singularity is not overshot",
        o.finalA > 0,
        "final a = " + o.finalA.toPrecision(4) + " > 0. da/dt ~ 1/a^3 diverges as a->0, so a FIXED step would " +
        "overshoot into negative a (measured -0.52 during design). The adaptive step ~a^4 shrinks exactly where " +
        "the rate blows up, so the integration reaches the stop cleanly");
}

// ---- 5. PLANTED ERROR: a WRONG secular rate is caught by the trajectory key -----------------------------------------
{
    // integrate with a deliberately wrong rate coefficient (10% too fast) and check the trajectory key would flag it
    const m1 = 3, m2 = 1, a0 = 10, Mc = m1 * m2 * (m1 + m2);
    const wrongRate = (a) => -1.1 * (64 / 5) * Mc / (a * a * a);   // 10% too fast
    let a = a0, t = 0, worstBulk = 0;
    const tM = mergerTimeExact({ m1, m2, a0 });
    for (let i = 0; i < 100000 && a > a0 * 0.05; i++) {
        const dt = 0.01 * a / Math.abs(wrongRate(a));
        const k1 = wrongRate(a), k2 = wrongRate(a + 0.5 * dt * k1), k3 = wrongRate(a + 0.5 * dt * k2), k4 = wrongRate(a + dt * k3);
        a += (dt / 6) * (k1 + 2 * k2 + 2 * k3 + k4); t += dt;
        if (a > 0 && t < 0.99 * tM) {
            const aRef = semiMajorExact(t, { m1, m2, a0 });
            if (aRef > 0) worstBulk = Math.max(worstBulk, Math.abs(a - aRef) / aRef);
        }
    }
    ok("!! a 10%-wrong shrink rate produces a LARGE bulk trajectory error -- the key has real detection power",
        worstBulk > 0.02,
        "a rate 10% too fast gives worst bulk deviation " + worstBulk.toExponential(2) + " (vs ~1e-7 for the " +
        "correct rate) -- so the trajectory key genuinely discriminates the right secular rate from a wrong one. " +
        "A key that passed this would be measuring nothing");
}

console.log();
if (fails) { console.log("inspiral-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("inspiral-selfcheck: all checks pass");
