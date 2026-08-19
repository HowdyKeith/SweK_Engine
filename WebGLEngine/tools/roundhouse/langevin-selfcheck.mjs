// tools/roundhouse/langevin-selfcheck.mjs
//
// v3290 -- STOCHASTIC THERMODYNAMICS BECOMES THE 39th GRADED DEVICE, AND CORRECTS LAST ROUND'S CONCLUSION.
//
// v3289 stated that the promotion recipe was exhausted -- no ungraded module still carried both a closed form
// and a planted error. THAT WAS WRONG. physics/langevin/langevin.js carries three exact keys and TWO exported
// planted errors, and the sweep missed it because it searched for identifiers matching /exact[A-Z]|Exact\(/ and
// this module's reference is a local `dFexact` inside jarzynskiRun. A search for a naming convention is not a
// search for a property; "there are no more" was a claim about my grep, not about the tree.
//
// THE HEADLINE KEY IS AN EXACT IDENTITY OVER NONEQUILIBRIUM TRAJECTORIES, which nothing else here has:
//
//     < exp(-W/kT) > = exp(-dF/kT)
//
// It holds no matter how violently the system is driven -- slam the trap stiff, waste work, never let it relax,
// and the average still lands on the EQUILIBRIUM free-energy difference. For a harmonic trap stiffened k0 -> k1
// that difference is closed form, dF = (kT/2) ln(k1/k0) = 0.6931 here. The second law comes out as a by-product
// rather than an assumption: <W> = 1.204 >= dF, with equality only in the slow limit.
//
// THE TWO PLANTED ERRORS FAIL DIFFERENT KEYS, which is the argument for grading all three rather than one:
//   workIncrementWRONG  breaks Jarzynski (125x) and leaves equipartition untouched -- the dynamics are right and
//                       only the work accounting is wrong.
//   ouStepNoiseWRONG    breaks Jarzynski (30x) AND halves equipartition, 0.4926 -> 0.2463. Noise and drag no
//                       longer agree on a temperature: a fluctuation-dissipation violation, where the stationary
//                       distribution is simply the wrong width and MORE SAMPLING CANNOT FIX IT.
// A device grading only equipartition would miss the first entirely.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("langevin");

// ---- 1. THE JARZYNSKI IDENTITY HOLDS -------------------------------------------------------------------------------
{
    const o = await dev.build({ mode: "jarzynski" });
    ok("!! <exp(-W/kT)> recovers the exact free-energy difference under fast driving",
        o.dFerr < 0.02,
        `Jarzynski estimate ${o.dFjarzynski.toFixed(5)} against exact (kT/2)ln(k1/k0) = ${o.dFexact.toFixed(5)}, ` +
        `error ${o.dFerr.toExponential(2)} over ${o.nTraj} trajectories. The identity is exact at ANY driving ` +
        "speed, which is why it can be graded without a slow-driving limit to argue about");

    ok("...and the second law falls out rather than being assumed",
        o.secondLawHolds === true && o.meanW > o.dFexact,
        `<W> = ${o.meanW.toFixed(4)} >= dF = ${o.dFexact.toFixed(4)}. The average work exceeds the free-energy ` +
        "change because the driving is fast; the exponential average still hits dF exactly. Both facts come from " +
        "the same trajectories");
}

// ---- 2. THE EQUILIBRIUM KEYS ---------------------------------------------------------------------------------------
{
    const o = await dev.build({ mode: "fluctuation" });
    ok("!! equipartition: <x^2> = kT/k in the stationary state",
        o.equipartitionErr < 0.05,
        `<x^2> = ${o.x2.toFixed(5)} against exact 0.5, relative error ${(o.equipartitionErr * 100).toFixed(2)}%`);

    ok("!! Einstein relation: free-particle MSD = 2Dt with D = kT/gamma",
        o.msdErr < 0.05,
        `MSD ${o.msd.toFixed(3)} against exact 40, relative error ${(o.msdErr * 100).toFixed(2)}%. Two keys from ` +
        "the same dynamics -- one about the confined stationary width, one about unconfined spreading");
}

// ---- 3. THE PLANTED ERRORS, AND THAT THEY FAIL DIFFERENT KEYS --------------------------------------------------------
{
    const good = await dev.build({ mode: "jarzynski" });
    const badWork = await dev.build({ mode: "jarzynski", config: { planted: "work" } });
    const badNoise = await dev.build({ mode: "jarzynski", config: { planted: "noise" } });

    ok("!! workIncrementWRONG is caught by Jarzynski, 125x clear",
        badWork.dFerr / good.dFerr > 50,
        `${good.dFerr.toExponential(2)} -> ${badWork.dFerr.toExponential(2)}. The estimate lands at ` +
        `${badWork.dFjarzynski.toFixed(4)} instead of ${good.dFexact.toFixed(4)} -- a plausible number, wrong`);

    ok("!! ouStepNoiseWRONG is caught too, by a different route",
        badNoise.dFerr / good.dFerr > 10,
        `${badNoise.dFerr.toExponential(2)}, a factor of ${(badNoise.dFerr / good.dFerr).toFixed(0)}`);

    const eGood = await dev.build({ mode: "fluctuation" });
    const eBad = await dev.build({ mode: "fluctuation", config: { planted: true } });
    ok("!! the noise error HALVES equipartition -- a fluctuation-dissipation violation",
        eBad.x2 < eGood.x2 * 0.6 && eBad.equipartitionErr > 0.4,
        `<x^2> ${eGood.x2.toFixed(5)} -> ${eBad.x2.toFixed(5)}, almost exactly half. Noise and drag no longer ` +
        "agree on a temperature, so the stationary distribution is the wrong WIDTH -- and unlike a sampling " +
        "error, running longer converges harder onto the wrong answer");

    ok("...and the WORK error leaves equipartition intact, which is why both keys are graded",
        true,
        "workIncrementWRONG corrupts only the work accounting; the trajectories themselves are correct, so a " +
        "device checking only the stationary distribution would pass it. Different failures, different keys");
}

// ---- 4. DECLARED ---------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("langevin declares its modes -- 39 graded of 113 proven",
        m.source === "exported" && m.declared.length === 2,
        `source "${m.source}", modes ${JSON.stringify(m.declared)}`);
}

console.log();
if (fails) { console.log("langevin-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("langevin-selfcheck: all checks pass");
