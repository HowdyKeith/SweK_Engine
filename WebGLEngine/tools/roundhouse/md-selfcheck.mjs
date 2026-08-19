// tools/roundhouse/md-selfcheck.mjs
//
// Run: node tools/roundhouse/md-selfcheck.mjs   (~20s)
//
// v3199 -- FOUR MODULES IN ONE ROUND, AND THE HONEST WAY TO DO IT.
//
// Keith asked whether coverage can move more than one module per round. IT CAN, AND THE METHOD IS A SHARED
// SUBSTRATE WITH SEPARATE KEYS.
//
// *** THE TRAP IS REAL AND THIS DEVICE WALKED INTO IT ONCE. *** A bind that IMPORTS seventeen xpbd modules to
// grade one thing would move the coverage number and grade nothing more -- COVERAGE IS A MEANS, NOT THE GOAL.
// My first version imported angles.js and never called it.
//
// v3211 -- ANGLES IS GRADED NOW, AND TWO THINGS ABOUT THIS FILE HAD TO BE DELETED RATHER THAN WEAKENED.
//
// (1) *** THE CHECK THAT USED TO SIT IN SECTION 3 ASSERTED angles.js STAYS UNGRADED. *** That is a gate PINNED
// TO A STATE PROGRESS WAS MEANT TO CHANGE -- one of the named species on this project's own list -- and it went
// red the moment the round it was waiting for happened. IT CARRIED NO ANTIDOTE SENTENCE, though v3196 had
// already proven that naming the correct response in advance is the only thing that reliably prevents a
// loosened threshold, and v3197 had already fired one. So it is DELETED, and its replacement below says what
// should happen to IT.
// (2) *** AND THE KEY THIS FILE PROPOSED FOR angles WAS THE WRONG ONE. *** It said the key is "that the force
// VANISHES at the preferred angle". THAT IS SECTION 1 OF angles-selfcheck.mjs, VERBATIM: a device restating its
// module's own gate moves the count and grades nothing new. The real key is the effective stiffness
// k_eff = k(1 - cos0^2), which angles.js never computes and could not have got right by accident.
//
// Four terms, four keys, four modes:
//   "madelung"  EWALD against M = 1.7475645946 -- a published constant OF THE GEOMETRY, not of the code
//   "alphaFree" THE LOAD-BEARING NEGATIVE: alpha splits Ewald's work between real and k space and HAS NO
//               PHYSICAL MEANING, so M must be independent of it
//   "bond"      omega = sqrt(k/mu), exact
//   "coulomb"   the inverse square, TESTED BY RATIO
//   "torsion"   force against a CENTRAL FINITE DIFFERENCE of the energy -- the definition, not the formula
//   "angles"    k_eff = k(1 - cos0^2) by CURVATURE of the reported potential, across seven preferred angles
//   "angleFreq" THE INDEPENDENT ROUTE: the bend FREQUENCY, arriving through masses and an integrator rather
//               than through the potential the key was derived from -- which is what stops the key being a
//               MIRROR, the rule that refused muscle
//   "angleLinear" THE LOAD-BEARING NEGATIVE, TOLD BY AN EXPONENT: at 180 degrees the potential is QUARTIC and
//               the force CUBIC, so a linear molecule has no first-order restoring force at all
//   "integrator" *** md.js, GRADED BECAUSE I REFUSED TO LET THE COUNT MOVE WITHOUT A KEY. *** angleFreq needs an
//               integrator, so importing velocityVerlet put physics/md/md.js in the graded set by itself and
//               coverage went 31 -> 34 for a round that had earned two. gradedCoverage CANNOT TELL A MODULE
//               UNDER TEST FROM A MODULE USED TO TEST ONE -- both are imported by a bind and both are really
//               called. So md.js got a real key rather than a free ride.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);
const G = await import(pathToFileURL(path.join(HERE, "gradedCoverage.mjs")).href);
const dev = await D.getDevice("md");
const src = fsMod.readFileSync(path.join(HERE, "mdBind.mjs"), "utf8");

const mad = await dev.build({ mode: "madelung" });
const af = await dev.build({ mode: "alphaFree" });
const bond = await dev.build({ mode: "bond" });
const coul = await dev.build({ mode: "coulomb" });
const tors = await dev.build({ mode: "torsion" });
const ang = await dev.build({ mode: "angles" });
const afq = await dev.build({ mode: "angleFreq" });
const alin = await dev.build({ mode: "angleLinear" });
const integ = await dev.build({ mode: "integrator" });
// HOISTED DELIBERATELY. It was declared inside section 3 and read from section 5, and the gate CRASHED with a
// ReferenceError instead of reporting -- the THIRD recorded instance of exactly this in a gate file, because
// these gates are written as a series of independent { } blocks and a const inside one is invisible to the next.
// A crash is not a verdict: it exits 1 and looks like a failing check.
const cov = G.gradedCoverage(path.resolve(HERE, "..", ".."));

// ---- 1. THE SHARPEST KEY IN THE LAB, AND ITS CONTROL --------------------------------------------------------------
{
    ok("!! *** Ewald reproduces the Madelung constant ***",
        mad.madelungErrFrac < 1e-5,
        "M = " + mad.madelung.toFixed(8) + " against 1.7475645946, error " + mad.madelungErrFrac.toExponential(2) +
        ". A PUBLISHED CONSTANT OF THE ROCK-SALT GEOMETRY -- it does not come from this code, from a previous " +
        "run, or from anything anybody here chose");

    ok("!! *** and M is INDEPENDENT of alpha, which is the control ***",
        af.alphaSpread < 1e-3,
        "spread " + af.alphaSpread.toExponential(2) + " across alpha = 3, 4, 5. ALPHA SPLITS THE WORK BETWEEN " +
        "REAL AND k SPACE AND HAS NO PHYSICAL MEANING, so a Madelung constant that MOVED with it would mean the " +
        "split was wrong -- and the madelung mode alone could still pass at one tuned alpha");
}

// ---- 2. THREE MORE TERMS, EACH AGAINST ITS OWN KEY ---------------------------------------------------------------
{
    ok("!! a diatomic vibrates at omega = sqrt(k/mu)",
        bond.omegaErrFrac < 1e-4 && bond.reducedMassCheck === 1,
        "measured " + bond.omegaMeasured.toFixed(6) + " against " + bond.omegaTheory.toFixed(6) + ", error " +
        bond.omegaErrFrac.toExponential(2) + ". The period is counted FROM SIGN CHANGES OF THE VELOCITY, not " +
        "from a fitted sinusoid -- A FIT WOULD SMOOTH OVER EXACTLY THE FREQUENCY ERROR BEING LOOKED FOR");

    ok("!! *** Coulomb is the inverse square, EXACTLY ***",
        coul.coulombErrFrac < 1e-12,
        "halving the distance quadruples the force: ratio " + coul.coulombRatio.toFixed(6) + ", error " +
        coul.coulombErrFrac.toExponential(2) + ". TESTED BY RATIO, which needs no unit convention -- an absolute " +
        "magnitude would be testing my choice of constants rather than the physics");

    ok("!! the torsion force agrees with a CENTRAL finite difference of its own energy",
        tors.torsionFdErrFrac < 0.05,
        "worst component " + tors.torsionFdErrFrac.toExponential(2) + " over all twelve. A 4-BODY TORSION IS THE " +
        "EASIEST PLACE IN MD TO SLIP A SIGN, and a finite difference is THE DEFINITION of a force -- it cannot " +
        "be satisfied by restating the formula the force was written from");

    ok("...and the difference is CENTRAL, not forward",
        /CENTRAL difference, not forward/.test(src) && /\(2 \* h\)/.test(src),
        "a forward difference carries an O(h) error that would SWAMP the sign error this mode exists to catch");
}

// ---- 3. THE COUNT MOVED FOUR, AND ONE MODULE STAYED HONEST -------------------------------------------------------
{
    ok("!! *** coverage moved FOUR modules in one round ***",
        ["bonds", "coulomb", "dihedrals", "ewald"].every((m) => cov.graded.includes("physics/md/" + m + ".js")),
        cov.graded.length + " graded of " + cov.proven + " today; THE v3199 ROUND took it 26 -> 30. FOUR " +
        "MODULES, FOUR SEPARATE KEYS, ONE " +
        "DEVICE -- which is what a shared substrate buys, and the answer to whether coverage can move faster " +
        "than one at a time");

    // *** THE CHECK THAT STOOD HERE ASSERTED angles.js STAYS UNGRADED, AND IT IS DELETED RATHER THAN
    // WEAKENED. *** It pinned a STATE PROGRESS WAS MEANT TO CHANGE and carried no antidote sentence. THIS ONE
    // DOES: when the last of md's ungraded modules is graded, THE LINE BELOW GOES RED AND SHOULD BE DELETED,
    // NOT WEAKENED -- do not turn `includes` into a count, and do not soften it to "at least one".
    ok("!! *** angles.js is graded now, and it is graded because something CALLS it ***",
        cov.graded.includes("physics/md/angles.js") && /angleForces\(/.test(src),
        "an IMPORT moves the count and grades nothing -- angleForces is called on every point of a seven-angle " +
        "curvature sweep, four amplitudes of a frequency run and two exponent fits. AND THE KEY THIS FILE ONCE " +
        "PROPOSED FOR IT WAS SECTION 1 OF ITS OWN GATE VERBATIM, which would have moved the count and graded " +
        "nothing just as surely");

    ok("...nine modes, EXPORTED, nonsense refused",
        Array.isArray(dev.modes) && dev.modes.length === 9 &&
        dev.modes.every((m) => K.checkMode(dev, m).ok !== false) &&
        K.checkMode(dev, "zzz_no_mode").ok === false,
        dev.modes.join(", "));
}

// ---- 4. THE ANGLE TERM: ONE KEY, TWO INDEPENDENT ROUTES, AND A NEGATIVE THAT FAILS BY AN EXPONENT -----------------
{
    ok("!! *** the cosine-harmonic effective stiffness is k(1 - cos0^2), across seven preferred angles ***",
        ang.angleStiffWorstErrFrac < 1e-4 && ang.angleStiffPoints === 7,
        "worst " + ang.angleStiffWorstErrFrac.toExponential(2) + " at " + ang.angleStiffWorstAtDeg + " degrees. " +
        "V = 1/2 k (cos t - cos t0)^2 IS NOT A HARMONIC ANGLE POTENTIAL, and expanded about t0 it behaves as one " +
        "with k_eff = k sin^2(t0). SEVEN ANGLES RATHER THAN ONE because one would test arithmetic, while seven " +
        "test the (1 - cos0^2) dependence -- where a module using cos0 where cos0^2 belongs comes apart");

    ok("!! *** and the residual is the FINITE DIFFERENCE'S, shown by its own order rather than assumed ***",
        Math.abs(ang.angleStiffHOrderRatio - 4) < 0.1,
        "halving h QUARTERS the residual: ratio " + ang.angleStiffHOrderRatio.toFixed(4) + " against exactly 4 " +
        "for a central second difference. The worst point is 179 degrees, where the true curvature is 0.0122 and " +
        "O(h^2) truncation is a visible fraction of it. A RESIDUAL FALLING AT THE INSTRUMENT'S OWN PREDICTED " +
        "RATE CANNOT BE THE MODULE BEING WRONG -- and that is a claim no tolerance could have made");

    ok("!! *** the FREQUENCY reaches the same key by a route that shares nothing with it ***",
        Math.abs(afq.angleOmegaOrderRatio - 4) < 0.1 && afq.angleOmegaRatio > 0.999,
        "omega/key = " + afq.angleOmegaRatio.toFixed(6) + " at the smallest amplitude, and the SHORTFALL is " +
        "second order in amplitude -- ratio " + afq.angleOmegaOrderRatio.toFixed(4) + " on halving, against " +
        "exactly 4. THIS IS WHY THE KEY IS NOT A MIRROR: it arrives through masses and an integrator, not " +
        "through the potential it was derived from, which is the rule that refused muscle at v3201");

    ok("!! ...and the shortfall is the ANHARMONICITY, not the integrator, because dt does not move it",
        afq.angleOmegaDtSpread < 1e-5 && afq.angleArmDrift < 0.05,
        "spread " + afq.angleOmegaDtSpread.toExponential(2) + " across an 8x dt sweep. TWO NUMBERS THAT COULD " +
        "INVALIDATE THIS ARE REPORTED RATHER THAN ASSUMED AWAY: that one, and the arm drift " +
        afq.angleArmDrift.toExponential(2) + " -- the arms are NOT BONDED, so the angle force turns the atoms " +
        "and supplies no centripetal force. My first fixture ran 400,000 steps and read 0.68 of the key; THAT " +
        "WAS THE FIXTURE DECAYING, NOT THE MODULE, and only measuring the drift said so");

    ok("!! *** THE NEGATIVE: at 180 degrees this potential is QUARTIC and its force CUBIC ***",
        Math.abs(alin.angleLinearVExponent - 4) < 0.05 && Math.abs(alin.angleLinearFExponent - 3) < 0.05 &&
        Math.abs(alin.angleGenericVExponent - 2) < 0.05 && Math.abs(alin.angleGenericFExponent - 1) < 0.05 &&
        alin.angleLinearStiffKey === 0,
        "V exponent " + alin.angleLinearVExponent.toFixed(6) + " at 180 against " +
        alin.angleGenericVExponent.toFixed(6) + " generically; force " + alin.angleLinearFExponent.toFixed(6) +
        " against " + alin.angleGenericFExponent.toFixed(6) + ". k_eff is EXACTLY ZERO there, so a linear " +
        "molecule has NO FIRST-ORDER RESTORING FORCE AT ALL -- while a textbook harmonic angle term would still " +
        "be quadratic. THIS IS THE UNNAMED COST OF THE TRIG-FREE CHOICE angles.js's OWN HEADER ADVERTISES as a " +
        "clean win, and the two cases are told apart BY THEIR EXPONENT, not by the size of any number: near t0 " +
        "every one of these values is small");
}

// ---- 5. AND THE MODULE THE INSTRUMENT NEEDED, KEYED RATHER THAN COUNTED ------------------------------------------
{
    ok("!! *** velocityVerlet is SECOND ORDER: the energy error quarters when dt halves ***",
        Math.abs(integ.integratorOrderRatio - 4) < 0.05,
        "ratio " + integ.integratorOrderRatio.toFixed(4) + " against exactly 4, at " +
        integ.integratorErrAtRefDt.toExponential(3) + " of the total energy at the reference dt. THE PUBLISHED " +
        "ORDER OF STORMER-VERLET, which this module never states");

    ok("!! *** and the energy error is BOUNDED, which is the half ORDER ALONE CANNOT SEE ***",
        integ.integratorSecularRatio === 1,
        "the worst error over a 32x LONGER RUN at the same dt is " + integ.integratorSecularRatio.toFixed(6) +
        " times the short one -- BIT-IDENTICAL, not merely close. A NON-SYMPLECTIC INTEGRATOR OF THE SAME " +
        "SECOND ORDER HAS THE SAME dt LAW AND A SECULAR DRIFT, so the order check alone would accept it. " +
        "angles-selfcheck section 4 asserts the energy 'stays bounded' under 1e-2 of E0 over one fixed run, " +
        "which cannot see growth at all");

    ok("!! *** md.js is graded by a KEY, not by having been imported as instrumentation ***",
        cov.graded.includes("physics/md/md.js") && dev.modes.includes("integrator"),
        "IT ENTERED THE GRADED SET FOR FREE when angleFreq imported velocityVerlet, and the count moved by " +
        "three for a round that had earned two. gradedCoverage's reachability is EXACT and it answers a " +
        "DIFFERENT QUESTION than the number is read as: A MODULE UNDER TEST AND A MODULE USED TO TEST ONE LOOK " +
        "IDENTICAL FROM A BIND'S IMPORT LIST. Writing a second velocity-Verlet inside the bind to dodge it " +
        "would have been worse -- a duplicate of an idea the tree already has. WHEN gradedCoverage LEARNS TO " +
        "SEPARATE THE TWO, THIS LINE GOES RED AND SHOULD BE DELETED, NOT WEAKENED");
}

console.log();
console.log("  ----  A THING FOR THE NEXT ROUND, FOUND HERE AND NOT FIXED HERE: gradedCoverage counts a module");
console.log("  ----  as graded when a bind imports and calls it. AN INSTRUMENT IS IMPORTED AND CALLED TOO. The");
console.log("  ----  number is honest this round only because md.js was given a key on the spot; the next bind");
console.log("  ----  to need a helper will inflate it silently.");
console.log("  ----  THAT QUESTION IS NOW ANSWERED FOR xpbd: v3200 read all seventeen gates and found FOUR with an");
console.log("  ----  external key. Three are graded and muscle is REFUSED. The other thirteen claim determinism,");
console.log("  ----  GPU/CPU equivalence or coupling -- which is what a solver IS -- and must not be proposed as");
console.log("  ----  devices. md has four ungraded modules left and nobody has read their gates yet.");
if (fails) { console.log("md-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("md-selfcheck: all checks pass");
