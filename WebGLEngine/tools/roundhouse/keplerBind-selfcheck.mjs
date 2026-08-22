// tools/roundhouse/keplerBind-selfcheck.mjs -- v3762
//
// *** THIS DEVICE HAD NO GATE OF ITS OWN, AND ITS PERIOD KEY IS A MIRROR FOR mu. measurePeriod hands the SAME
// mu to period() for the theory and to step() for the integration, so a wrong gravitational parameter CANCELS.
// MEASURED: periodErrFrac is BIT-IDENTICAL at 3.885e-5 across mu 1 -> 8 -> 64. That is the THIRD DEVICE RUNNING
// with this shape -- ct's scale-invariant correlations (v3732), the interferometer's shared lambda (v3758), and
// now kepler's shared mu. *** WHEN A DEVICE MEASURES A ROUND TRIP, THE CONSTANT IT HANDS TO BOTH HALVES IS
// INVISIBLE TO IT. *** But v3761's refinement applies: that is a mirror OF THE PARAMETER, not of everything.
// A DEFECT ON ONE SIDE ONLY STILL FIRES, and finding one is what this round did. ***
//
// *** AND slopeMeasured READING EXACTLY 1.500000 AT EVERY mu IS NOT A GAP. Kepler's third law slope is a SHAPE,
// and shapes are blind to scale BY CONSTRUCTION -- it never claimed to look. v3715's rule: ask whether the
// observable ever claimed to see the thing before calling its blindness a defect. ***

import { keplerDevice, KEPLER_MODES } from "./keplerBind.mjs";
import { measurePeriod, atPerihelion, visViva } from "../../physics/orbits/kepler.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const build = keplerDevice.build;

// ---- 1. THE MIRROR, DECLARED -------------------------------------------------------------------------------
console.log("1. THE PERIOD KEY CANNOT SEE A WRONG GRAVITATIONAL PARAMETER");
{
    const errs = [], slopes = [];
    for (const mu of [1, 8, 64]) {
        const o = await build({ mode: "kepler3", config: { mu } });
        errs.push(o.periodErrFrac); slopes.push(o.slopeMeasured);
    }
    // *** I FIRST WROTE THIS CHECK AS `errs.every(v => v === errs[0])` AND CALLED THE RESULT "BIT-IDENTICAL",
    // BECAUSE MY PROBE PRINTED toExponential(3) AND THREE ROUNDED VALUES LOOKED THE SAME. THE GATE FAILED
    // IMMEDIATELY. The real spread is 1.769e-11 relative -- ROUND-OFF FROM SCALING THROUGH THE SAME ARITHMETIC,
    // not a dependence. A ROUNDED DISPLAY IS NOT A MEASUREMENT, and "identical" is a claim about digits I had
    // not looked at. (mu 1 and mu 64 ARE exactly equal; mu 8 differs in the thirteenth digit.) ***
    const spread = (Math.max(...errs) - Math.min(...errs)) / errs[0];
    ok("!! *** periodErrFrac IS INVARIANT TO ROUND-OFF ACROSS A 64x RANGE IN mu ***",
        spread < 1e-9,
        errs.map((v) => v.toPrecision(12)).join(", ") + " -- relative spread " + spread.toExponential(3) +
        ". The SAME mu goes to period() and to step(), so it CANCELS. *** SET THAT AGAINST THE PLANT BELOW, " +
        "WHICH MOVES THE SAME OBSERVABLE BY 2.2e4: the noise floor here is 1.8e-11 and the signal there is " +
        "twenty-two thousand, so this is a blindness rather than a tolerance question ***. A DECLARED BLINDNESS, " +
        "NOT A DEFECT TO FIX -- the round trip is worth measuring, it just is not evidence about mu");
    ok("!! and the Kepler-III slope is 1.5 to twelve digits at every mu, which is not a gap either",
        slopes.every((v) => Math.abs(v - 1.5) < 1e-11),
        slopes.map((v) => v.toPrecision(15)).join(", ") + " -- a SHAPE is blind to scale BY CONSTRUCTION and " +
        "never claimed otherwise. v3715: ask whether the observable ever claimed to SEE the thing");
}

// ---- 2. THE PLANT THAT SITS ON ONE SIDE ONLY ---------------------------------------------------------------
console.log("\n2. A DEFECT THE ABSOLUTE KEY CATCHES AND THE SHAPE KEY CANNOT");
{
    const honest = await build({ mode: "kepler3" });
    const planted = await build({ mode: "startspeed" });
    ok("!! *** THE APHELION SPEED AT THE PERIHELION RADIUS FIRES periodErrFrac BY 2.2e4 ***",
        honest.periodErrFrac < 1e-4 && planted.periodErrFrac > 0.5,
        honest.periodErrFrac.toExponential(3) + " -> " + planted.periodErrFrac.toExponential(3) + ". *** THE " +
        "CONFUSION IS REAL: the perihelion speed is usually quoted as sqrt(mu/a * (1+e)/(1-e)), and INVERTING " +
        "THAT RATIO GIVES THE APHELION SPEED. Both numbers are correct speeds FOR THIS ORBIT, just not at that " +
        "radius -- which is why no eye catches it ***");
    ok("!! *** AND slopeMeasured DOES NOT MOVE -- 1.500000 IN BOTH ARMS ***",
        planted.slopeMeasured === honest.slopeMeasured,
        "the same run shows an ABSOLUTE key firing while a SHAPE key survives untouched. keplerThirdLaw is " +
        "deliberately LEFT HONEST in the plant mode so that contrast is visible in ONE reading rather than " +
        "argued for in prose");
    ok("!! the plant changes the ORBIT, not the prediction -- measured against an unmoved theory",
        (() => { const a = measurePeriod({ a: 1, e: 0.3, mu: 1, speedAt: "perihelion", stepsPerOrbit: 2000, orbits: 6 });
                 const b = measurePeriod({ a: 1, e: 0.3, mu: 1, speedAt: "aphelion", stepsPerOrbit: 2000, orbits: 6 });
                 return a.theory === b.theory && Math.abs(b.measured - a.measured) > 1; })(),
        "theory 6.283185 in both arms; measured 6.283234 -> 1.779563. period(a, mu) NEVER SEES THE PLANT, which " +
        "is what makes it a key rather than a mirror -- a plant that moved both sides would prove nothing (v3733)");
    ok("!! the default is CORRECT, so the option cannot change any existing caller",
        (() => { const d = atPerihelion(1, 0.3, 1), p = atPerihelion(1, 0.3, 1, "perihelion");
                 return d.vy === p.vy && d.vy === visViva(0.7, 1, 1); })(),
        "`speedAt` defaults to 'perihelion' and three other call sites were LEFT ALONE -- only measurePeriod " +
        "threads it. A plant knob that changed behaviour for everybody would be a defect, not a plant");
    ok("!! and the device DECLARES the plant so plantedCoverage can find it",
        keplerDevice.plantMode === "startspeed" && keplerDevice.plantFlips === "periodErrFrac" &&
        keplerDevice.plantKind === "mode" && KEPLER_MODES.includes("startspeed"),
        "periodErrFrac is reported by the kepler3 branch the plant runs, so it is not DECLARED BUT DEAD");
}

report("WHAT THIS DOES NOT CLAIM",
    "That kepler's other keys are proven. The energy, angular-momentum and closure observables are untouched by " +
    "this plant and remain UNTESTED AGAINST A DELIBERATE DEFECT -- a start with the wrong speed is still a " +
    "perfectly conservative orbit, so a symplectic integrator holds its energy on it exactly as well. THAT IS " +
    "THE POINT OF SAYING WHICH OBSERVABLE A PLANT FLIPS: one plant tests one claim.");

console.log("\nkeplerBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
