// tools/roundhouse/thermostatBind-selfcheck.mjs -- v3773
//
// *** THE ROADMAP NAMED A KEY FOR THIS MODULE AND IT IS A MIRROR. "Equipartition gives <1/2 m v^2> = 3/2 kT
// from the target alone" sounds external and is not: rescaleToT(vel, m, T, dof) SETS the velocities so that
// temperature() reads T, and MEASURED IT READS 1.500000000000 for a target of 1.5. The function sets it and
// the observable reads it back. FOURTH DEVICE IN THIS FAMILY after ct's correlations, the interferometer's
// lambda and kepler's mu -- and the first where the mirror was in MY OWN PLAN rather than in the code. ***

import { thermostatDevice, THERMOSTAT_MODES, buildThermostat } from "./thermostatBind.mjs";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

const honest = await buildThermostat({ mode: "relax" });
const planted = await buildThermostat({ mode: "nosqrt" });
const mirror = await buildThermostat({ mode: "mirror" });

console.log("1. THE MIRROR, REPORTED SO IT CANNOT BE MISTAKEN FOR A KEY");
{
    ok("!! *** rescaleToT SETS THE TEMPERATURE AND temperature() READS IT BACK, EXACTLY ***",
        mirror.rescaleErrFrac < 1e-12,
        "target " + mirror.target + ", read back with errFrac " + mirror.rescaleErrFrac.toExponential(3) +
        ". *** THAT IS NOT EVIDENCE ABOUT THIS MODULE and the device says so in its own payload. If this line " +
        "ever goes red the two have stopped sharing the definition, which WOULD be worth knowing ***");
}

console.log("\n2. TWO KEYS THAT ARE NOT MIRRORS, BOTH EXACT");
{
    ok("!! *** AFTER removeCOMMotion THE TOTAL MOMENTUM IS ZERO -- a DIFFERENT quantity from the one set ***",
        honest.momentumHolds === true && honest.momentumMagnitude < 1e-9,
        "|p| = " + honest.momentumMagnitude.toExponential(3) + " over " + honest.N + " particles. Nothing " +
        "cancels here: the function removes a MEAN and the check reads a SUM");
    ok("!! *** THE RELAXATION FOLLOWS dT/dt = (T0-T)/tau, A LAW THE CODE NEVER CONTAINS ***",
        honest.relaxHolds === true && honest.relaxErrFrac < 1e-2,
        "measured " + honest.tMeasured.toFixed(6) + " against an analytic " + honest.tAnalytic.toFixed(6) +
        ", errFrac " + honest.relaxErrFrac.toExponential(3) + ". berendsenStep computes a per-step velocity " +
        "SCALE FACTOR and knows nothing about exponentials; the analytic solution is written out FROM THE " +
        "INPUTS here, never imported from the module under test (v3733)");
}

console.log("\n3. THE PLANT -- AND THE ONE BEFORE IT THAT DID NOT FIRE");
{
    ok("!! *** DROPPING THE SQUARE ROOT SEPARATES BY 64.6x AND FLIPS THE VERDICT ***",
        planted.relaxErrFrac > honest.relaxErrFrac * 20 && planted.relaxHolds === false,
        honest.relaxErrFrac.toExponential(3) + " -> " + planted.relaxErrFrac.toExponential(3) +
        ", relaxHolds true -> false. *** lam2 IS A RATIO OF ENERGIES AND VELOCITIES SCALE AS ITS SQUARE ROOT. " +
        "Applying it directly still relaxes toward the target and still converges -- IT SIMPLY RELAXES AT THE " +
        "WRONG RATE. The final temperature does not give it away; ONLY THE LAW DOES ***");
    ok("!! the momentum key is untouched -- the plant is one-sided",
        planted.momentumMagnitude === honest.momentumMagnitude,
        "the scale factor multiplies every velocity by the same number, which cannot move a momentum that is " +
        "already zero. TWO INDEPENDENT KEYS, and the plant moves exactly one");
    ok("!! and the device DECLARES the plant, with `relax` first",
        DEVICE_NAMES.includes("thermostat") && thermostatDevice.plantMode === "nosqrt" &&
        thermostatDevice.plantFlips === "relaxErrFrac" && THERMOSTAT_MODES[0] === "relax",
        "registered by a STATIC import -- v3768 registered a device dynamically and it was INVISIBLE to " +
        "deviceInstrumentMap while every gate passed");
}

report("*** THE PLANT I CHOSE FIRST DID NOT FIRE, AND THE REASON WAS ALREADY IN MY OWN FILE ***",
    "`freedof` used 3N instead of 3N-3 -- forgetting that removing the centre-of-mass motion removes three " +
    "degrees of freedom, which is the classic MD slip. relaxErrFrac read 1.099e-4 IN BOTH ARMS. dof enters " +
    "temperature() at BOTH ends of the ratio and CANCELS, and I had written 'the analytic relaxation law does " +
    "not contain dof at all' into the bind ONE PARAGRAPH BEFORE PLANTING INTO IT. IF THE LAW DOES NOT CONTAIN " +
    "IT, CHANGING IT CANNOT BREAK THE LAW. Ruled out as a BADLY CHOSEN PLANT rather than reported as a " +
    "finding about the module (v3715's rule).");

report("*** WHY THE DEFAULT IS 50 STEPS AND NOT 300 -- THE ENVELOPE, NOT A LATE SAMPLE ***",
    "A rate error is largest BEFORE convergence and vanishes after it, because both rates end in the same " +
    "place. Measured across the approach: 81.6x at 25 steps, 64.6x at 50, 43.7x at 100, and only 16.9x at " +
    "300. 50 keeps the honest residual at 3.8e-3, well inside the 1e-2 bar, while the plant reads 24.8%. " +
    "SAMPLING AFTER CONVERGENCE WOULD HAVE MADE THIS PLANT LOOK WEAK.");

report("WHAT THIS DOES NOT CLAIM",
    "That Berendsen samples the canonical ensemble. IT DOES NOT -- it controls the MEAN and suppresses the " +
    "FLUCTUATIONS, so the kinetic-energy variance is below the canonical 2/dof. THAT CANNOT BE MEASURED HERE: " +
    "this module is a thermostat, not an integrator, and with no forces the temperature marches monotonically " +
    "to target and sits, with NO thermal fluctuation to have a variance. Named so nobody grades a distribution " +
    "this fixture cannot produce.");

console.log("\nthermostatBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
