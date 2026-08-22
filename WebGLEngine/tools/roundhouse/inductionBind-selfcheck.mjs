// tools/roundhouse/inductionBind-selfcheck.mjs
//
// v3731 -- THE ANSWER KEYS FOR THE induction DEVICE, BESIDE THE BIND (v3724's split). Registry-shape checks
// live in tools/ship/labDevices-selfcheck.mjs. The instrument row's `gate` points here, and this file imports
// physics/blobInduction.js DIRECTLY AND USES IT -- v3729's lesson: deviceInstrumentMap takes a row's gate
// imports as the modules that row exercises, so a gate reaching the physics only through the bind shares no
// module with the device it claims.
//
// *** WHAT IS GRADED: THE LEFT-HAND END OF THE MODULE'S OWN DERIVATION. blobInduction.js writes
// "closed integral of E.dl = -dPhi/dt -> ... -> E_phi = -(s/2) dB/dt" and implements the right-hand end.
// Checking E_phi against -(s/2)dB/dt reads the docstring back to itself. THE INTEGRALS ARE WHAT IT NEVER
// COMPUTES -- there is no line integral, no surface integral and no quadrature anywhere in the file. ***
//
// WHEN A CHECK HERE GOES RED:
//   section 1 -> the circulation has stopped matching the enclosed AREA. Do not widen it toward the
//     centred-loop case; THE OFF-CENTRE LOOPS ARE THE POINT, because the shipped E_phi is written in terms of
//     distance from the axis and nothing tells it a loop at (3,-2) encloses the same flux.
//   section 2 -> READ WHICH OF THE TWO NUMBERS MOVED BEFORE TOUCHING EITHER BAR. The SPREAD across radii is
//     exact physics and its bar is 1e-9 (it measures 0). The ABSOLUTE offset is THIS FILE'S QUADRATURE and its
//     bar is 1e-4. A physics error moves with R; a quadrature error cannot. Tightening the absolute bar means
//     a better quadrature, NOT a looser spread.
//   section 3 -> the two fields have stopped being separable by their integrals, which would mean one of them
//     is no longer the field it claims to be.

import { buildInduction, inductionDevice, inductionDefaults, circulationAround, fluxThrough } from "./inductionBind.mjs";
import { inducedE, coulombE, divergence, K_COULOMB } from "../../physics/blobInduction.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);

// ---- 1. FARADAY: THE AREA, NOT THE PLACE -----------------------------------------------------------------
console.log("1. FARADAY IN INTEGRAL FORM -- circulation depends only on the ENCLOSED AREA");
const f = await buildInduction({ mode: "faraday" });
ok("!! the circulation of the induced field equals -(dB/dt) times the enclosed AREA, wherever the loop sits",
    !f.error && f.circulationWorstErr < 1e-10,
    `worst relative error ${f.circulationWorstErr.toExponential(3)} over ${f.loops} loops INCLUDING ONE CENTRED ` +
    `AT (3,-2) -- the shipped E_phi is written in terms of s, the distance from the axis, so an off-centre loop ` +
    `sits in a visibly different field and still encloses the same flux. NOTHING TOLD IT THAT`);

// The off-centre case asserted ON ITS OWN, because a worst-of aggregate can be carried by the easy rows.
const dBdt = 3.7, E2 = (x, y) => inducedE(x, y, dBdt);
const offCentre = circulationAround(E2, 3, -2, 1, 20000), exact1 = -dBdt * Math.PI;
ok("!! ...and the OFF-CENTRE loop is asserted by itself, not carried by an aggregate over easy rows",
    Math.abs(offCentre - exact1) / Math.abs(exact1) < 1e-10,
    `centre (3,-2), radius 1: ${offCentre.toFixed(9)} vs ${exact1.toFixed(9)} -- the axis is nowhere near it`);

report("WHY THE FARADAY BAR CAN BE 1e-10 AND THE GAUSS ONE CANNOT",
    "The midpoint rule on a CLOSED SMOOTH CURVE is a periodic trapezoid and converges faster than any power " +
    "of 1/n. The sphere's lat/long grid is not periodic in the polar direction and its error is algebraic. " +
    "THE TWO BARS DIFFER BECAUSE THE QUADRATURES DIFFER, NOT BECAUSE THE PHYSICS DOES.");

// ---- 2. GAUSS: TWO NUMBERS LIMITED BY DIFFERENT THINGS ---------------------------------------------------
console.log("\n2. GAUSS IN INTEGRAL FORM -- and the two readings do not share a limit");
const g = await buildInduction({ mode: "gauss" });
ok("!! *** THE FLUX IS THE SAME THROUGH EVERY RADIUS -- THE EXACT HALF, AND IT MEASURES ZERO ***",
    !g.error && g.fluxSpread < 1e-9,
    `spread ${g.fluxSpread.toExponential(3)} across R = ${g.radii.join(", ")} -- a 1/r^2 field's flux cannot ` +
    `depend on the radius, and the same quadrature on the same field at four scales cancels its own error exactly`);

ok("...and the absolute value is 4 pi k Q, to the accuracy of the SURFACE GRID and no better",
    g.fluxAbsErr < 1e-4,
    `offset ${g.fluxAbsErr.toExponential(3)} from ${g.fluxExact.toFixed(9)}. *** THE GIVE-AWAY THAT THIS IS ` +
    `QUADRATURE AND NOT PHYSICS: IT IS IDENTICAL AT EVERY RADIUS. A physics error would move with R. *** One ` +
    `bar for both readings would either bless a broken exponent or fail an honest quadrature`);

ok("!! a closed surface with the charge OUTSIDE it encloses no flux, which is Gauss's other half",
    g.fluxOutside < 1e-5,
    `${g.fluxOutside.toExponential(3)} of 4 pi k -- and a merely RADIAL field would have to satisfy this too, ` +
    `so it is not implied by the first`);

// ---- 3. THE 2x2 TABLE ------------------------------------------------------------------------------------
console.log("\n3. EACH FIELD IS ANNIHILATED BY THE OTHER'S INTEGRAL -- and by neither's divergence");
const s = await buildInduction({ mode: "separation" });
ok("!! the two integrals SEPARATE the fields: circulation without flux, flux without circulation",
    !s.error && s.separates === true,
    `induced: circulation ${s.circulation.toFixed(6)}, flux ${s.fluxOfInduced.toExponential(3)} (relative). ` +
    `Coulomb: flux ${s.fluxAtRadius.toFixed(6)}, circulation ${s.circulationOfCoulomb.toExponential(3)} (relative)`);

ok("!! *** AND THE OPERATOR THE MODULE SHIPS TO CHECK ITS WORK CANNOT TELL THEM APART ***",
    Math.abs(divergence((x, y, z) => { const [a, b] = inducedE(x, y, dBdt); return [a, b, 0]; }, 1, 2, 3)) < 1e-6 &&
    Math.abs(divergence((x, y, z) => coulombE(x, y, z, 1), 1, 2, 3)) < 1e-6,
    `divergence reads ${s.divergenceOfInduced.toExponential(3)} for the induced field and ` +
    `${s.divergenceOfCoulomb.toExponential(3)} for the Coulomb one -- BOTH ZERO. *** THIS IS NOT A DEFECT IN ` +
    `blobInduction: div E = 0 away from the charge is correct and the file never claimed the operator ` +
    `distinguishes them (v3715 -- ask whether the observable ever claimed to look). IT IS THE REASON THIS GRADE ` +
    `HAD TO BE INTEGRAL AND NOT POINTWISE. ***`);

// ---- 4. THE THREE PLANTS, MEASURED -----------------------------------------------------------------------
console.log("\n4. THE PLANTS -- run against the shipped file and REVERTED");
report("A -- the Coulomb exponent moved from r^2 to r^2.05  [6 of these checks red]",
    "GAUSS FIRES ON THE EXACT HALF: the flux stops being radius-independent, spread 0 -> 1.280e-1 against a " +
    "bar of 1e-9, and the outside-sphere and absolute checks go with it. `separates` goes false. AND THE " +
    "DIVERGENCE CHECK FIRES TOO -- a 1/r^2.05 field is NOT divergence-free, so the operator that cannot " +
    "distinguish the two HONEST fields does notice this one. THAT IS WORTH SAYING PRECISELY: the blindness in " +
    "section 3 is a statement about the honest pair, NOT a claim that divergence sees nothing. FARADAY IS " +
    "BLIND BY CONSTRUCTION -- it never touches the Coulomb field, and that is not a gap.");
report("B -- the induced field's -(s/2) factor became -(s/2.05)  [exactly 2 red, both in section 1]",
    "FARADAY FIRES: worst error 1.677e-13 -> 2.439e-2. GAUSS IS BLIND, and so is `separates` -- A WRONGLY " +
    "SCALED AZIMUTHAL FIELD IS STILL AZIMUTHAL, so it still has no flux and the table still separates. That " +
    "is the correct reading and it is why the MAGNITUDE key and the SHAPE key are both needed.");
report("C -- the induced field returned RADIAL instead of azimuthal (components swapped)  [4 red]",
    "faraday 1.000e+0, `separates` false, and the divergence check with them -- a radial field has divergence. " +
    "This is the plant the 2x2 table exists to catch, and it is the ONLY one of the three the module's own " +
    "gate also sees.");
report("A' -- the GROSS version of A, 1/r instead of 1/r^2, which predictions.html already names as a kill",
    "The module's gate DOES catch that one (1 failed) and this gate catches it six ways. *** SO THE HONEST " +
    "STATEMENT IS ABOUT DEGREE, NOT KIND: the shipped gate sees a fall-off broken by a WHOLE POWER and is " +
    "blind to one broken by 2.5%. Reading its prose as 'the exponent is checked' would be a count absorbing a " +
    "case that is not of its kind. A 2.5% exponent error is exactly the kind a refactor introduces. ***");

report("*** AND THE HONEST HALF, MEASURED BECAUSE v3724 SAYS TO MEASURE IT -- AND IT CAME OUT BIGGER THAN THE",
    "GUESS. physics/blobInduction-selfcheck.mjs PASSES ALL CHECKS UNDER BOTH A AND B, and catches only C " +
    "(3 failed). SO THIS DEVICE ADDS TWO DEFECT CLASSES THE MODULE'S OWN GATE CANNOT SEE -- a wrong radial " +
    "FALL-OFF of the Coulomb field, and a wrongly SCALED induced field -- and re-states one it can. The first " +
    "draft of this block said the module's gate caught B; that was a guess, and measuring it was the only " +
    "reason the number is right. WRITE THE COMMENT AFTER THE MEASUREMENT.");

// ---- 5. THE DEVICE CONTRACT ------------------------------------------------------------------------------
console.log("\n5. THE DEVICE CONTRACT");
ok("every key measured in every mode is declared",
    [f, g, s].every((o) => Object.keys(o).every((k) => inductionDevice.observables.includes(k))),
    `${inductionDevice.observables.length} declared observables across ${inductionDevice.modes.length} modes`);

ok("each mode carries its OWN claim rather than one claim with a mode label",
    inductionDefaults({ mode: "faraday" }).claim.observable === "circulationWorstErr" &&
    inductionDefaults({ mode: "gauss" }).claim.observable === "fluxSpread" &&
    inductionDefaults({ mode: "separation" }).claim.observable === "separates");

ok("the quadratures are EXPORTED and driven here, so this gate integrates the same way the device does",
    typeof circulationAround === "function" && typeof fluxThrough === "function" &&
    Math.abs(fluxThrough((x, y, z) => coulombE(x, y, z, 1), 3, 0, 0, 0, 200, 400) - 4 * Math.PI * K_COULOMB) < 1e-3,
    "two copies of a quadrature are two declarations about one integral that nobody ever compares");

report("WHAT THIS DOES NOT CLAIM",
    "That blobInduction.js is correct. blobCharge, blobCoulombE, radialAzimuthal and the blob-shaped source " +
    "are UNGRADED; these keys drive inducedE and coulombE only. gradedCoverage moving by one module means " +
    "THIS MODULE NOW HAS A KEY.");

console.log("\ninductionBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
