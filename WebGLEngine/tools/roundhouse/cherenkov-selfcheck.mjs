// WebGLEngine/tools/roundhouse/cherenkov-selfcheck.mjs -- v3424
//
// Run: node tools/roundhouse/cherenkov-selfcheck.mjs
//
// THE FIRST ASTROPARTICLE MODE, AND IT IS A MODE BECAUSE em ALREADY OWNS refractiveIndex AND phaseSpeed.
// Cherenkov light is what a neutrino telescope actually sees: a charge outruns the phase speed of light in the
// medium and radiates on a cone. Two things make it gradeable here rather than merely describable --
//
//   THE THRESHOLD IS A BIFURCATION, so it can be RECOVERED FROM BEHAVIOUR: bisect on whether there is any light
//   at all, and beta = 1/n falls out with nothing in the loop reading n (v3201's external-key rule).
//
//   AND THE SAME NUMBER HAS A SECOND, INDEPENDENT ROUTE: the threshold is a GEOMETRIC fact (beta = 1/n) while
//   the phase speed is a WAVE fact (v_phase = c/n), so beta_threshold must equal v_phase/c. *** THAT PAIR IS
//   WHAT CATCHES THE PLANT, AND THE THRESHOLD ALONE CANNOT: a CONSISTENTLY WRONG n is invisible to every check
//   that only ever asks n, and the planted index is exactly that. ***
//
// Everything stays in COS rather than the angle, so the whole mode is +,-,*,/ and sqrt -- no transcendental, so
// it is cross-arch deterministic. arccos would have bought nothing and cost that.
"use strict";
import { emDevice, EM_MODES } from "./emBind.mjs";
import { checkMode } from "./knobGate.mjs";

let failed = 0;
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };
const say = (m) => console.log("  ----  " + m);
const B = (config = {}) => emDevice.build({ mode: "cherenkov", config });

async function main() {
    console.log("[cherenkov-selfcheck] a threshold recovered from behaviour, and a second route that catches the plant\n");

    const r = B(), p = B({ planted: true });

    // ---- 1. THE THRESHOLD, RECOVERED FROM BEHAVIOUR ------------------------------------------------------
    {
        say(`n = ${r.nUsed}, 1/n = ${r.betaThreshold.toFixed(16)}, bisected ${r.betaThresholdRecovered.toFixed(16)}`);
        ok("!! *** the emission threshold comes back by BISECTING ON WHETHER THERE IS LIGHT AT ALL ***",
            r.thresholdRelErr < 1e-15,
            `relative error ${r.thresholdRelErr.toExponential(2)}. Nothing in the bisection reads n -- the EXISTENCE of a solution is the only input -- ` +
            "so the measuring route is independent of the route that set it. A THRESHOLD IS A BIFURCATION, which is friction's key (v3200) pointed at light");
    }

    // ---- 2. THE ANGLE AT THE THRESHOLD IS A ONE-SIDED LIMIT ----------------------------------------------
    {
        ok("!! at threshold the light goes straight down the track: cos is EXACTLY 1",
            r.cosThetaAtThreshold === 1,
            "*** and it is a ONE-SIDED LIMIT, taken from the side it exists on. My first version evaluated at the bisection MIDPOINT and got null " +
            "half the time, because the midpoint can land just BELOW 1/n where there is no emission and no angle to report. A BISECTION BRACKETS A " +
            "THRESHOLD; IT DOES NOT LAND ON IT, and a check reading the midpoint would have been a coin flip dressed as a measurement ***");
        ok("...and the cone opens with beta and SATURATES at cos = 1/n, which is a second recovery of the index",
            r.monotone && Math.abs(r.cosThetaMax - r.cosThetaMaxExact) < 1e-15,
            `cos(theta) rises monotonically to ${r.cosThetaMax.toFixed(16)} against an exact 1/n. A DIFFERENT LIMIT OF THE SAME FORMULA, so a law ` +
            "that got the threshold right by luck would still have to get the saturation right");
    }

    // ---- 3. *** THE TWO ROUTES, AND WHY THE THRESHOLD ALONE IS NOT ENOUGH *** -----------------------------
    {
        say(`nominal: geometric ${r.betaThresholdRecovered.toFixed(12)} vs wave ${r.betaFromPhaseSpeed.toFixed(12)}, gap ${r.twoRouteGap.toExponential(2)}`);
        say(`PLANTED: geometric ${p.betaThresholdRecovered.toFixed(12)} vs wave ${p.betaFromPhaseSpeed.toFixed(12)}, gap ${p.twoRouteGap.toExponential(2)}`);
        ok("!! the geometric threshold and the wave phase speed agree to machine precision",
            r.twoRouteGap < 1e-14,
            `${r.twoRouteGap.toExponential(2)}. beta = 1/n is GEOMETRY and v_phase = c/n is a WAVE FACT, and nothing forces them to meet except the physics`);
        ok("!! *** the plant is CAUGHT BY THE PAIR AND INVISIBLE TO THE THRESHOLD ALONE ***",
            p.twoRouteGap > 0.1 && p.thresholdRelErr < 1e-15,
            `planted two-route gap ${p.twoRouteGap.toExponential(2)} while its own threshold error is ${p.thresholdRelErr.toExponential(2)} -- ZERO. ` +
            "The planted index drops the square root and phaseSpeed keeps it, so the routes part; but the bisection recovers the PLANTED n perfectly, " +
            "because A CONSISTENTLY WRONG n IS INVISIBLE TO EVERY CHECK THAT ONLY EVER ASKS n. THIRD ROUND RUNNING WHERE THE RESULT IS WHICH KEY " +
            "CATCHES WHICH FAULT");
    }

    // ---- 4. THE MACH-CONE CONFUSION, MEASURED RATHER THAN WARNED ABOUT -----------------------------------
    {
        ok("!! *** the shock-cone half-angle triggers at the SAME beta and puts the light at ninety degrees ***",
            r.machTriggersAtSameBeta === true && r.machCosAtThreshold === 0 && r.cosThetaAtThreshold === 1,
            "sin = 1/(n beta) for the Mach cone against cos = 1/(n beta) for the emission angle -- COMPLEMENTARY, and both are 'the angle' in ordinary " +
            "speech. Compared at the SAME point: the true convention gives cos = 1 (straight down the track) and the confused one gives 0 (square across " +
            "it). *** THE THRESHOLD KEY IS BLIND TO THIS AND THE ANGLE KEY CATCHES IT OUTRIGHT -- which is the argument for having both, made by " +
            "measurement rather than by assertion ***");
    }

    // ---- 5. REGISTRY HYGIENE -----------------------------------------------------------------------------
    {
        ok("!! cherenkov is a DECLARED mode on the em device, so every roundhouse tool reaches it",
            EM_MODES.includes("cherenkov") && emDevice.modes === EM_MODES && !!emDevice.defaults({ mode: "cherenkov" }),
            "a MODE and not a device, because em already owns refractiveIndex and phaseSpeed -- the substrate, not merely the subject. " +
            "NO NEW DEVICE, so promptCost's count and the device census are untouched");
        ok("...and this device now has ONE definition of its mode list",
            emDevice.modes === EM_MODES,
            "four binds needed that in the last three rounds and one of them had a mode nobody could discover; this one gets the constant BEFORE " +
            "the drift rather than after it");
        ok("...and every observable the mode produces is declared",
            Object.keys(r).every((k) => emDevice.observables.includes(k)),
            "an observable a device produces but does not declare is invisible to claimTrace and to the lab-results baseline");
        ok("...and an undeclared mode is still refused",
            checkMode(emDevice, "zzz_not_a_mode").ok === false,
            "the guard is the device's own defaults(), unchanged by this round");
    }

    console.log(failed ? `\n[cherenkov-selfcheck] ${failed} FAILED` : "\n[cherenkov-selfcheck] all checks pass");
    process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error("[cherenkov-selfcheck] COULD NOT RUN:", e && e.stack || e); process.exit(1); });
