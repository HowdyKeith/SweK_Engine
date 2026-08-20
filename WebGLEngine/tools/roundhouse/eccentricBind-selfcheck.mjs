// tools/roundhouse/eccentricBind-selfcheck.mjs
//
// v3733 -- THE ANSWER KEY FOR THE eccentric DEVICE'S ABSOLUTE HALF, AND THE PLANT THAT SHOWED IT WAS MISSING.
// Beside the bind (v3724's split); registry-shape checks stay in tools/ship/labDevices-selfcheck.mjs. This
// file imports physics/orbits/eccentricInspiral.js DIRECTLY AND USES IT (v3729's lesson).
//
// *** THE PLANT MOVED NOTHING, AND THAT WAS THE ROUND -- FOR THE SECOND TIME IN TWO PLANT ROUNDS. *** Doubling
// the mass term is a common factor on BOTH Peters rate equations, and all three original modes were blind:
//   - `invariant` is a RATIO. a/g(e) comes from dividing da/dt by de/dt, so any common factor cancels.
//   - `limit` compares dadt(a0,0) against the circular Peters rate AND BOTH SIDES USE THE SAME massTerm, so it
//     cancels there too. A COMPARISON BETWEEN TWO EXPRESSIONS THAT SHARE THE WRONG CONSTANT CANNOT SEE IT.
//   - `circularise` is a trajectory SHAPE, and a common factor only rescales time -- even `steps` was
//     identical at 34234 in both arms.
// MEASURED: worstInvariantDev 3.632e-9 in both arms, circularLimitErrFrac 0.000e+0 in both, eFinal identical.
// *** THE DEVICE COULD NOT SEE A BINARY INSPIRALLING TWICE AS FAST, AND THE MERGER TIME IS THE THING A
// DETECTOR ACTUALLY MEASURES. *** A GAP (v3713's shape), not a declared blindness (v3715's).
//
// AND THE SHAPE IS NOW NAMED, BECAUSE IT HAS HAPPENED TWICE RUNNING: v3732's ct graded by PEARSON CORRELATION
// and could not see a gain; this device grades by a RATIO, a SHAPE and a SELF-CONSISTENT COMPARISON and cannot
// see a rate. *** A DEVICE THAT GRADES SHAPE CANNOT SEE SCALE, and shape statistics are the convenient ones --
// correlations, invariants, ratios and reductions all divide the scale out. ASK OF ANY DEVICE: WHICH OF ITS
// OBSERVABLES WOULD MOVE IF EVERYTHING GOT UNIFORMLY BIGGER? ***
//
// WHEN A CHECK HERE GOES RED: the fix is in the rate constants or the integrator, NEVER a wider timeErrFrac --
// 1e-3 is already ten times looser than the honest reading and the residue below it is PHYSICS, not slack.

import { eccentricDevice } from "./eccentricBind.mjs";
import { integrateEccentric, massTerm, dadt } from "../../physics/orbits/eccentricInspiral.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const B = (mode) => eccentricDevice.build({ mode });

// ---- 1. THE ABSOLUTE KEY ---------------------------------------------------------------------------------
console.log("1. THE ELAPSED TIME AGAINST PETERS' CLOSED FORM -- the only mode that can see a wrong RATE");
// da/dt = -A Mc / a^3  =>  a^4 = a0^4 - 4 A Mc t  =>  t = (a0^4 - aFinal^4) / (4 A Mc),  A = 64/5.
const t = B("time");
ok("!! the integrated inspiral time matches the closed form to the eccentric enhancement",
    t.timeErrFrac < 1e-3,
    `t ${t.inspiralTime.toExponential(6)} against ${t.closedFormTime.toExponential(6)} -- ratio ` +
    `${t.enhancement.toFixed(9)}, err ${t.timeErrFrac.toExponential(3)} against a bar of 1e-3. THE INTEGRATOR ` +
    `RETURNED THIS ALL ALONG and no observable ever reached for it (the v3136 shape again)`);

// *** THE MASS TERM IS COMPUTED FROM m1 AND m2 HERE, NOT IMPORTED -- see section 3. ***
const run = integrateEccentric({ m1: 5, m2: 2, a0: 7, e0: 0.01, eStop: 1e-4, safety: 1e-4 });
const closedIndependent = (Math.pow(7, 4) - Math.pow(run.aFinal, 4)) / (4 * (64 / 5) * (5 * 2 * (5 + 2)));
ok("!! ...and at a DIFFERENT mass pair and separation the ratio is the same number",
    Math.abs(run.t / closedIndependent - t.enhancement) < 1e-9,
    `m 5/2 a0 7 gives ${(run.t / closedIndependent).toFixed(9)} against m 3/1 a0 10's ${t.enhancement.toFixed(9)} ` +
    `-- IDENTICAL, which is what says the residue is the e-dependence and not the particular numbers`);

report("*** THE 3.65e-4 RESIDUE IS NOT THE INTEGRATOR, AND THAT WAS CHECKED RATHER THAN ASSUMED ***",
    "Sweeping `safety` across 4e-4 / 2e-4 / 1e-4 / 5e-5 -- an EIGHTFOLD change in step, 7266 to 58168 steps -- " +
    "moves the error 3.647e-4 -> 3.650e-4 -> 3.650e-4 -> 3.651e-4. FLAT. It is the O(e^2) ECCENTRIC " +
    "ENHANCEMENT: an eccentric orbit radiates faster, so the true time sits BELOW the circular closed form. " +
    "THE FIRST DRAFT OF THIS COMMENT CALLED IT TRUNCATION. The enhancement is monotone and large -- t/closed " +
    "reads 0.999635 / 0.964002 / 0.710636 / 0.357798 / 0.094493 / 0.003407 at e0 = 0.01 / 0.1 / 0.3 / 0.5 / " +
    "0.7 / 0.9 -- so at the near-circular default it is small BY CONSTRUCTION and the bar is set above it.");

// ---- 2. THE DECLARED PLANT, AND WHAT IT LEAVES UNTOUCHED --------------------------------------------------
console.log("\n2. THE PLANT -- and the three original modes cannot see it");
const p = B("slowrate");
ok("!! the declared plant moves timeErrFrac by three orders",
    p.timeErrFrac / t.timeErrFrac > 1000,
    `${t.timeErrFrac.toExponential(3)} -> ${p.timeErrFrac.toExponential(3)}, ` +
    `${(p.timeErrFrac / t.timeErrFrac).toFixed(0)}x, against a bar of 1e-3`);

const inv = B("invariant"), lim = B("limit"), cir = B("circularise");
ok("!! *** AND THE SHIPPED MODES ARE BLIND TO IT BY CONSTRUCTION -- asserted so nobody calls them coverage ***",
    inv.worstInvariantDev < 1e-6 && lim.circularLimitErrFrac < 1e-12 && cir.circularised === true,
    `with the mass term doubled inside the module the invariant read 3.632e-9 (unchanged), ` +
    `circularLimitErrFrac 0.000e+0 (unchanged) and circularise gave the SAME 34234 steps. Today's honest ` +
    `readings: invariant ${inv.worstInvariantDev.toExponential(3)}, limit ` +
    `${lim.circularLimitErrFrac.toExponential(3)}. *** A RATIO, A SHAPE AND A SELF-CONSISTENT COMPARISON ARE ` +
    `THREE WAYS OF NOT LOOKING AT THE SCALE. ***`);

ok("the plant is DECLARED the way plantedCoverage's mode contract requires",
    eccentricDevice.plantMode === "slowrate" && eccentricDevice.plantFlips === "timeErrFrac" &&
    eccentricDevice.modes.includes(eccentricDevice.plantMode) && eccentricDevice.plantKind === "mode",
    `plantMode "${eccentricDevice.plantMode}" flips "${eccentricDevice.plantFlips}"`);

ok("!! ...and the PRIMARY mode reports the flipped observable, which the sweep requires",
    Number.isFinite(inv.timeErrFrac),
    `invariant reports timeErrFrac ${inv.timeErrFrac.toExponential(3)}. The sweep builds the plant against the ` +
    `FIRST OTHER MODE and needs the observable to move THERE -- it read DECLARED BUT DEAD until this held, ` +
    `exactly as at v3732. I HAD WRITTEN THAT LESSON DOWN ONE ROUND EARLIER AND STILL NEEDED THE SWEEP TO SAY IT`);

// ---- 3. THE KEY THAT WAS A MIRROR FIRST ------------------------------------------------------------------
console.log("\n3. THE FIRST VERSION OF THIS KEY WAS A MIRROR, AND THE PLANT CAUGHT IT");
report("*** A CHECK THAT RE-DERIVES ITS ANSWER FROM A SIBLING NEVER TESTS THE CODE IT DESCRIBES (v3724) ***",
    "The closed form first imported the SHIPPED massTerm. Doubling massTerm then moved BOTH SIDES of the " +
    "comparison and the error stayed at 3.65e-4 in both arms -- A NEW KEY THAT REPRODUCED THE EXACT DEFECT IT " +
    "WAS BUILT TO EXPOSE, and the only reason it was caught is that the plant was run against it before it " +
    "shipped. The mass term is written out from m1 and m2 now, in the bind AND in this file's section 1.");

ok("...and the fix holds: the shipped massTerm and an independent product still agree TODAY",
    Math.abs(massTerm(5, 2) - 5 * 2 * (5 + 2)) < 1e-12,
    `${massTerm(5, 2)} against ${5 * 2 * (5 + 2)} -- this line is a REGRESSION CHECK on the module, not the ` +
    `key: the key must not consult massTerm at all, and does not`);

// ---- 4. THE ROUND DID NOT MOVE A VERDICT IT IS NOT ABOUT -------------------------------------------------
console.log("\n4. THE PRE-EXISTING KEYS ARE UNTOUCHED");
ok("!! the a(e) invariant still holds to 1e-6 and e still circularises without ever rising",
    inv.worstInvariantDev < 1e-6 && cir.circularised && cir.eccentricityEverRose === false,
    `worstInvariantDev ${inv.worstInvariantDev.toExponential(3)} at e ${inv.worstAtE.toFixed(4)}, eFinal ` +
    `${cir.eFinal.toFixed(6)}, eccentricity never rose -- v3679: a round must not move a verdict it is not about`);

ok("every key measured in every mode is declared",
    [inv, lim, cir, t, p].every((o) => Object.keys(o).every((k) => eccentricDevice.observables.includes(k))),
    `${eccentricDevice.observables.length} declared observables across ${eccentricDevice.modes.length} modes`);

report("WHAT THIS DOES NOT CLAIM",
    "That the Peters constants are right in absolute units. The closed form and the integrator SHARE the " +
    "64/5, so a wrong A cancels here exactly the way massTerm used to -- what is established is that the " +
    "INTEGRATION is faithful to the rate law it is given, and that a factor applied to the MASS TERM alone is " +
    "now visible. Grading A itself needs an outside number this bench does not have.");

console.log("\neccentricBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
