// WebGLEngine/simulation/lbm/sheddingDesign-selfcheck.mjs -- v2834
//
// Run: node simulation/lbm/sheddingDesign-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES simulation/lbm/sheddingDesign.mjs -- the arithmetic that explains why the f_drag = 2 f_lift test never
// converged, in v2797 or in three fresh attempts this round.
//
// THE POINT OF GATING A DIAGNOSIS: a finding written only in a changelog is a story, and stories do not fail
// when the code drifts. This one is arithmetic, so it can be checked -- and the strongest check available is
// that it CONDEMNS EVERY CONFIGURATION THAT ACTUALLY FAILED, each for the reason it actually failed, and still
// approves one that satisfies all three constraints. A diagnostic that only ever says no is not a diagnostic.

import { viscosityOf, terminalU, forceForU, equilibrationSteps, velocityWindow, assessConfig, LBM_VALIDITY_U, SHEDDING_RE } from "./sheddingDesign.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. the closed forms are self-consistent
{
    ok("viscosity is (tau - 1/2)/3", Math.abs(viscosityOf(0.53) - 0.01) < 1e-12);
    const nu = 0.005, h = 30, U = 0.06;
    ok("forceForU inverts terminalU exactly", Math.abs(terminalU(forceForU(U, h, nu), h, nu) - U) < 1e-12);
    ok("terminal speed grows with the drive and falls with viscosity",
        terminalU(2e-6, h, nu) > terminalU(1e-6, h, nu) && terminalU(1e-6, h, 0.01) < terminalU(1e-6, h, nu));
    ok("equilibration scales as h^2/nu", Math.abs(equilibrationSteps(30, 0.005) - 900 / 0.005) < 1e-9);
}

// 2. IT CONDEMNS v2797'S OWN CONFIGURATION, which is the finding
{
    const a = assessConfig({ nx: 160, ny: 61, D: 7, tau: 0.53, g: 3e-6 });
    ok("v2797's config is judged NOT viable", a.viable === false);
    ok("...because its terminal speed exceeds the LBM validity ceiling", a.clearTerminalU > LBM_VALIDITY_U, a.clearTerminalU.toFixed(3));
    ok("...and it says so in words, not just a flag", a.problems.some((p) => /validity ceiling/.test(p)));
    ok("...and it was in a DOUBLE bind: also below the shedding onset once the cylinder's drag is counted",
        a.problems.some((p) => /below the shedding onset/.test(p)), `terminal Re ${a.terminalRe.toFixed(0)}`);
}

// 3. IT CONDEMNS ALL THREE OF THIS ROUND'S ATTEMPTS, each for its own reason
{
    const a1 = assessConfig({ nx: 200, ny: 101, D: 7, tau: 0.53, g: 8e-6 });
    ok("attempt 1 rejected: terminal speed wildly above validity", !a1.viable && a1.clearTerminalU > 0.5, a1.clearTerminalU.toFixed(3));
    const a2 = assessConfig({ nx: 200, ny: 101, D: 7, tau: 0.515, g: 2.041e-7 });
    ok("attempt 2 rejected: a converged flow there would not shed at all", !a2.viable && a2.terminalRe < SHEDDING_RE, `Re ${a2.terminalRe.toFixed(0)}`);
    const a3 = assessConfig({ nx: 200, ny: 101, D: 7, tau: 0.515, g: 7.2e-7 });
    ok("attempt 3 rejected: back above the validity ceiling", !a3.viable && a3.clearTerminalU > LBM_VALIDITY_U, a3.clearTerminalU.toFixed(3));
    ok("the three failed for DIFFERENT reasons, which is why one fix never worked",
        new Set([a1.problems[0], a2.problems[0], a3.problems[0]]).size >= 2);
}

// 4. AND IT APPROVES A CONFIGURATION THAT SATISFIES ALL THREE CONSTRAINTS.
//    A diagnostic that only ever says no cannot be trusted to mean it when it does.
{
    const good = assessConfig({ nx: 200, ny: 41, D: 7, tau: 0.51, g: 1.61e-6 });
    ok("a properly sized rig IS approved", good.viable === true, `terminal Re ${good.terminalRe.toFixed(0)}, clear U ${good.clearTerminalU.toFixed(3)}`);
    ok("...with no problems listed", good.problems.length === 0);
    ok("...its terminal Re clears the shedding onset", good.terminalRe >= SHEDDING_RE);
    ok("...and its terminal speed stays inside validity", good.clearTerminalU <= LBM_VALIDITY_U);
}

// 5. THE WINDOW, and why lowering tau is the lever rather than lengthening the run
{
    const wHigh = velocityWindow(0.53, 7), wLow = velocityWindow(0.51, 7);
    ok("a lower tau widens the usable speed window", wLow.headroom > wHigh.headroom, `${wHigh.headroom.toFixed(4)} -> ${wLow.headroom.toFixed(4)}`);
    ok("both windows are non-empty at D=7", wHigh.viable && wLow.viable);
    const tooThick = velocityWindow(0.6, 3);
    ok("a thick fluid on a small body has NO window at all", tooThick.viable === false, `needs U>=${tooThick.uMin.toFixed(3)}`);
}

// 6. EQUILIBRATION is why the field must start at equilibrium rather than accelerate into it
{
    ok("a 101-tall channel needs ~half a million steps from rest", equilibrationSteps(49.5, 0.005) > 400000,
        Math.round(equilibrationSteps(49.5, 0.005) / 1000) + "k steps");
    ok("...and a 41-tall one still needs tens of thousands", equilibrationSteps(19.5, 0.005) > 50000);
}

// 7. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./sheddingDesign.mjs", import.meta.url), "utf8");
    ok("sheddingDesign imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
    ok("the boundary-condition conclusion is recorded in the source", /FIXED INFLOW VELOCITY|different BOUNDARY CONDITION/.test(src));
}


// 8. THE DRIVEN-RIG RESULT -- what the fixed-inflow BC actually bought, recorded as numbers
{
    const { DRIVEN_RIG_RESULT } = await import("./sheddingDesign.mjs");
    const R = DRIVEN_RIG_RESULT;
    ok("!! the driven rig cut the Reynolds drift by a factor of five", R.reDriftFraction < 0.21 / 4,
        `${(R.reDriftFraction * 100).toFixed(2)}% vs v2797's 21%`);
    ok("!! ...and BOTH observables sustained at once for the first time", R.liftSustained === true && R.wakeSustained === true);
    ok("the prescribed config is the one this file APPROVES", assessConfig({ nx: R.config.nx, ny: R.config.ny, D: R.config.D, tau: R.config.tau, g: 0, cylinder: false }).window.viable);
    ok("...and its velocity sits inside the window", (() => { const w = velocityWindow(R.config.tau, R.config.D); return R.config.U >= w.uMin && R.config.U <= w.uMax; })(),
        `U=${R.config.U}`);
    ok("!! 2f is STILL not reproduced, and that is recorded rather than rounded off", Math.abs(R.fDragOverFLift - 2) > 1,
        `ratio ${R.fDragOverFLift}`);
    ok("...with the harmonic PRESENT but not dominant", R.dragPowerRatioAt2f > 0.2 && R.dragPowerRatioAt2f < 1, String(R.dragPowerRatioAt2f));
    ok("!! the NEW symptom is captured: the two estimates now disagree far more than at lower blockage",
        R.observablesApartFraction > 0.1, `${(R.observablesApartFraction * 100).toFixed(1)}% vs 2.43% in v2834`);
    ok("!! and the next experiment is named by the EVIDENCE, not by a list", /probe/.test(R.nextStep) && /NOT another boundary condition/.test(R.nextStep));
}


// 9. THE PROBE-RAKE REFUTATION -- a hypothesis of mine, tested and killed
{
    const { PROBE_RAKE_RESULT: R, DRIVEN_RIG_RESULT } = await import("./sheddingDesign.mjs");
    ok("!! v2842's near-wake hypothesis was TESTED, not assumed", R.hypothesis.length > 20 && typeof R.refuted === "boolean");
    ok("!! ...and REFUTED -- the record says so plainly", R.refuted === true);
    ok("the rake covers near AND far wake", R.rake.length >= 6 && R.rake[R.rake.length - 1].d >= 18);
    ok("!! disagreement does NOT fall smoothly with distance, which is what the hypothesis predicted",
        !R.rake.every((p, i) => i === 0 || p.apart <= R.rake[i - 1].apart));
    ok("!! and the BEST rake position is still worse than the previous run managed at 3D",
        Math.min(...R.rake.map((p) => p.apart)) > DRIVEN_RIG_RESULT.observablesApartFraction,
        `best ${Math.min(...R.rake.map((p) => p.apart)).toFixed(3)} vs ${DRIVEN_RIG_RESULT.observablesApartFraction}`);
    ok("!! the probes disagree with EACH OTHER along one wake -- there is no street to find",
        R.strouhalSpreadAlongWake[1] / R.strouhalSpreadAlongWake[0] > 2, R.strouhalSpreadAlongWake.join(" to "));
    // the real variable: everything tracked warmup, monotonically
    const [longer, shorter] = R.warmupComparison;
    ok("!! LESS settling gave MORE drift AND worse agreement, together",
        shorter.warmup < longer.warmup && shorter.reDrift > longer.reDrift && shorter.apart > longer.apart,
        `${longer.warmup}->${(longer.reDrift * 100).toFixed(1)}%/${(longer.apart * 100).toFixed(1)}% vs ${shorter.warmup}->${(shorter.reDrift * 100).toFixed(1)}%/${(shorter.apart * 100).toFixed(1)}%`);
    ok("the conclusion names the variable rather than the symptom", /settling time is the variable/i.test(R.conclusion));
    ok("...and the next step changes ONE thing", /nothing else/i.test(R.nextStep));
    const src = (await import("node:fs")).readFileSync(new URL("./sheddingDesign.mjs", import.meta.url), "utf8");
    ok("!! the file admits this is its THIRD prescription, two of which were wrong or partial",
        /THIRD prescription/.test(src) && /v2797, wrong/.test(src));
}

console.log("sheddingDesign-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
