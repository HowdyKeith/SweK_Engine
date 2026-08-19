// tools/roundhouse/isingBind-selfcheck.mjs -- v3764
//
// *** THIS DEVICE HAD NO GATE OF ITS OWN, AND ITS KEYS ARE GENUINELY EXTERNAL: Yang's exact spontaneous
// magnetisation, Onsager's Tc = 2/ln(1+sqrt(2)), and the critical exponent. None of them is written into the
// Monte Carlo, so this is TWO ROUTES SHARING NO CODE -- unlike ct, the interferometer and kepler, which all
// turned out to hand one constant to both halves. ***
//
// *** THE PLANT IS THE CLASSIC METROPOLIS ISING BUG: dE = 2*J*s*(neighbour sum), AND THE 2 IS THERE BECAUSE
// EACH BOND IS COUNTED ONCE FROM EACH END AND A FLIP CHANGES BOTH SIGNS. Dropping it is common enough to be a
// teaching example, and IT IS INVISIBLE TO INSPECTION -- exp(-dE/T) still looks like a Boltzmann factor, the
// lattice still equilibrates, and it still orders. IT SIMPLY ORDERS AT THE WRONG TEMPERATURE, because halving
// every energy is exactly doubling T. ***

import { isingDevice, ISING_OBSERVABLES } from "./isingBind.mjs";
import { measure, yangMagnetisation, ONSAGER_TC } from "../../physics/statmech/ising.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const build = isingDevice.build;

// ---- 1. THE BASELINE IS DETERMINISTIC, WHICH A MONTE CARLO NEED NOT BE ------------------------------------
console.log("1. THE RUN REPEATS EXACTLY, SO A SEPARATION IS A SIGNAL AND NOT A DRAW");
{
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push((await build({ mode: "order" })).magnetisation);
    ok("!! three identical calls give an IDENTICAL magnetisation",
        new Set(runs).size === 1,
        runs[0].toFixed(6) + " every time -- the lattice is SEEDED. *** THIS MATTERS MORE HERE THAN ANYWHERE " +
        "ELSE IN THE LAB: ising.L is this project's standing example of a beautiful convergence that IS NOISE, " +
        "so a plant separation on a Monte Carlo has to be shown against a baseline that does not wander ***");
    const o = await build({ mode: "order" });
    ok("!! and it sits close to Yang's exact value, which the simulation is never told",
        o.magnetisationErrFrac < 5e-3 && Math.abs(o.yangExact - yangMagnetisation(o.temperature)) < 1e-12,
        "m " + o.magnetisation.toFixed(6) + " against Yang " + o.yangExact.toFixed(6) + ", errFrac " +
        o.magnetisationErrFrac.toExponential(3) + ". TWO ROUTES SHARING NO CODE");
}

// ---- 2. THE PLANT -----------------------------------------------------------------------------------------
console.log("\n2. THE FACTOR OF TWO THAT IS NOT A SCALE, BUT A TEMPERATURE");
{
    const honest = await build({ mode: "order" });
    const planted = await build({ mode: "halfbond" });
    ok("!! *** DROPPING THE 2 FROM dE COLLAPSES THE MAGNETISATION, BY 5.97e2 IN errFrac ***",
        honest.magnetisationErrFrac < 5e-3 && planted.magnetisationErrFrac > 0.5,
        "m " + honest.magnetisation.toFixed(6) + " -> " + planted.magnetisation.toFixed(6) + ", errFrac " +
        honest.magnetisationErrFrac.toExponential(3) + " -> " + planted.magnetisationErrFrac.toExponential(3) +
        ". *** HALVING EVERY ENERGY IS EXACTLY DOUBLING T, so the planted run is a PERFECTLY VALID Ising " +
        "simulation of the WRONG SYSTEM -- it equilibrates, it orders, and it disagrees with Yang ***");
    ok("!! it is ONE-SIDED: the exact reference never sees the update rule",
        planted.yangExact === honest.yangExact && planted.temperature === honest.temperature,
        "yangExact " + honest.yangExact.toFixed(6) + " and T " + honest.temperature + " identical in both arms. " +
        "A PLANT THAT MOVED THE REFERENCE TOO WOULD CANCEL AND PROVE NOTHING (v3733)");
    ok("!! the default is CORRECT, so the option cannot change an existing caller",
        (() => { const a = measure({ L: 16, T: 2.0, seed: 7, warmup: 100, samples: 100 });
                 const b = measure({ L: 16, T: 2.0, seed: 7, warmup: 100, samples: 100, bondFactor: 2 });
                 return a.magnetisation === b.magnetisation; })(),
        "bondFactor defaults to 2, and only measure() threads it -- the second makeIsing call site in that " +
        "module was LEFT ALONE. A plant knob that changed behaviour for everybody would be a defect");
    ok("!! and the device DECLARES it, with `order` first so the contract compares like with like",
        isingDevice.plantMode === "halfbond" && isingDevice.plantFlips === "magnetisationErrFrac" &&
        isingDevice.plantKind === "mode" && isingDevice.modes[0] === "order",
        "plantedCoverage compares a mode plant against the first OTHER mode, and the plant is a variant of " +
        "order -- v3762's lesson, two rounds old and applied without being re-learned");
}

report("A SECOND READING WORTH KEEPING, MEASURED IN PASSING",
    "bondFactor 4 -- DOUBLING the energies, so HALVING the effective temperature -- ALSO collapses the " +
    "magnetisation, to 0.123. That is NOT the same failure: a colder system should order MORE. It is the " +
    "lattice QUENCHING INTO DOMAIN WALLS, a real physical effect of cooling too fast for the warmup given. " +
    "*** SO A PLANT IN EITHER DIRECTION LOOKS ALIKE IN THE OBSERVABLE AND HAS TWO DIFFERENT CAUSES, and only " +
    "the one that disagrees with Yang FOR THE RIGHT REASON was shipped. ***");

report("WHAT THIS DOES NOT CLAIM",
    "That ising's other keys are proven. The GROUND, EXPONENT and TRANSITION modes are untouched -- the plant " +
    "runs the order branch only -- and the critical exponent in particular is the one this project has warned " +
    "about by name. ONE PLANT TESTS ONE CLAIM.");

console.log("\nisingBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
