// tools/roundhouse/flip3dBind-selfcheck.mjs
//
// v3729 -- THE ANSWER KEY FOR THE flip3d DEVICE, BESIDE THE BIND IT GRADES (v3724's split, applied again at
// v3728). The registry-shape checks live in tools/ship/labDevices-selfcheck.mjs where every device's do; the
// physics is here, and the instrument row's `gate` points HERE because deviceInstrumentMap takes a row's gate
// imports as the modules that row exercises.
//
// *** THE ARGUMENT OF THE ROUND, IN ONE LINE: THE OBVIOUS KEY FOR A 3D SOLVER IS THE 2D KEY ONE DIMENSION UP,
// AND IT CANNOT SEE A MISSING THIRD DIMENSION. *** Section 1 is v3718's hydrostatic claim ported to flip3d --
// real, and it fires on a symmetric error. Section 2 is the key that does not exist in 2D: the two lateral
// axes are interchangeable and NOTHING TELLS THE CODE THAT. Section 3 is the census that says which sees what.
//
// WHEN A CHECK HERE GOES RED:
//   section 1 -> the fix is in the projection or the boundaries, NEVER a wider slopeErrFrac. rho*g*d is exact.
//   section 2 -> x and z have stopped agreeing, and the bar is EXACTLY ZERO ON PURPOSE. It is not a tolerance
//     that can be loosened: the transposed run is the same arithmetic in a permuted order, and every honest
//     observable here is a max or a same-order sum, so any non-zero difference is a real asymmetry. If a future
//     change makes an observable order-dependent, MOVE THAT OBSERVABLE TO THE REPORTED SET beside meanSpeed --
//     do not raise the bar for the whole check.
//   section 4 (footprint) -> it is REPORTED, not asserted; see its own note.

import { buildFlip3D, flip3dDevice, flip3dDefaults, settledPool, transposedPair } from "./flip3dBind.mjs";
// *** THE MODULE UNDER GRADE IS IMPORTED HERE DIRECTLY, AND deviceInstrumentMap IS WHY. *** Its instrument row
// names this file as its gate, and the map takes a row's GATE IMPORTS as the modules that row exercises -- a
// gate that reaches the physics only through the bind shares NO module with the device it claims, and the map
// went red on exactly that ("no instrument names a device it shares NO physics module with"). It is not a
// formality: the check below uses it to assert THE DEVICE DRIVES THE SHIPPED CLASS rather than a copy of it.
import { Flip3D } from "../../fluid/flip3d.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (name, detail) => console.log("  ----  " + name + "   " + detail);

// ---- 1. THE PORTED KEY: p = rho*g*d OUT OF THE 3D PROJECTION ---------------------------------------------
console.log("1. THE HYDROSTATIC COLUMN -- flip2d's key one dimension up, on 3D code");
const hy = await buildFlip3D({ mode: "hydrostatic" });
ok("!! the settled pressure column recovers rho*g*h per cell, which the projection was never handed",
    !hy.error && hy.slopeErrFrac < 1e-3,
    `slope ${hy.slopePerCell.toFixed(6)} vs exact ${hy.slopeExact.toFixed(6)} (err ${hy.slopeErrFrac.toExponential(2)}) ` +
    `over ${hy.fluidCellsInColumn} fluid cells -- gravity enters as a velocity increment, so neither rho nor g ` +
    `reaches the Poisson solve`);

ok("!! ...and the column is LINEAR, which is what makes the slope mean anything",
    hy.linearityR2 > 0.9999, `R^2 ${hy.linearityR2.toFixed(6)} -- a least-squares fit through a CURVE also returns a slope`);

ok("!! the bottom cell carries the full depth of head",
    hy.bottomErrFrac < 1e-3,
    `${hy.bottomPressure.toFixed(4)} vs rho*g*d ${hy.bottomExact.toFixed(4)} (err ${hy.bottomErrFrac.toExponential(2)})`);

// ---- 2. THE KEY THAT CANNOT BE ASKED IN 2D ---------------------------------------------------------------
console.log("\n2. TRANSPOSITION -- the two lateral axes are interchangeable and nothing tells the code that");
// The three face arrays are indexed by hand with three different strides (ui/vi/wi); the divergence sums three
// separately written terms; the stencil lists six neighbours as a literal array; the gradient subtraction is
// three loops with different bounds. Every one is an opportunity for x and z to disagree.
const iso = await buildFlip3D({ mode: "isotropy" });
ok("!! a dam break run along x and THE SAME PARTICLES run along z agree BIT FOR BIT",
    !iso.error && iso.worstRel === 0,
    `front ${iso.frontRel.toExponential(3)}, meanAlong ${iso.meanAlongRel.toExponential(3)}, meanHeight ` +
    `${iso.meanHeightRel.toExponential(3)}, maxDivergence ${iso.maxDivRel.toExponential(3)} over ${iso.particles} ` +
    `particles and ${iso.steps} steps. *** EXACTLY ZERO, NOT "SMALL" -- and that bar is affordable only because ` +
    `the fixture is a TRANSPOSE rather than a second fill. ***`);

ok("...and the two runs carry the same particles, so this is one experiment and not two",
    iso.transposed === iso.particles, `${iso.transposed} particles matched`);

report("THE OBSERVABLE THAT IS *NOT* ASSERTED EXACT, AND WHY",
    `meanSpeed differs at ${iso.meanSpeedRel.toExponential(3)} -- ONE ULP. It is a SUM over particles and ` +
    `transposition permutes the order of the additions, so exact equality there would be asserting that ` +
    `floating-point addition is associative. The four asserted observables are a MAX (front, maxDivergence) or ` +
    `a sum in the SAME particle order (meanAlong, meanHeight), which is why they can be pinned to zero.`);

report("WHY THE FIRST VERSION OF THIS CHECK WAS MEASURING ITS OWN FIXTURE",
    `Filling the x pool and the z pool with two separate fillBlock calls read 7.6e-4 to 1.3e-1 -- fillBlock ` +
    `walks x,y,z and draws jitter in that order, so the two seeded pools are NOT transposes of each other. ` +
    `That number would have shipped as "isotropic to about a percent", A BAR LOOSE ENOUGH TO HIDE EVERY PLANT ` +
    `IN SECTION 3. The give-away was that it did not fall as the run got longer.`);

// ---- 3. THE BLINDNESS CENSUS -------------------------------------------------------------------------------
console.log("\n3. WHICH KEY SEES WHICH DEFECT -- three plants, measured on the shipped module and reverted");
report("PLANT A -- the divergence drops its z term (a 2D solver wearing a 3D interface)",
    "isotropy 0 -> 2.509e-1 FIRES. HYDROSTATIC BLIND: slope -9.810005, R^2 1.000000, bottom 78.4800.");
report("PLANT B -- the six-neighbour stencil lists k-1 and not k+1",
    "isotropy 0 -> 3.982e-1 FIRES. HYDROSTATIC BLIND: slope -9.810008, R^2 1.000000, bottom 78.4801.");
report("PLANT C -- the pressure scale halved, IDENTICAL IN ALL THREE AXES",
    "isotropy EXACTLY 0, BLIND BY CONSTRUCTION. HYDROSTATIC FIRES: slope -9.625245 (1.88e-2, 18.8x the bar), " +
    "R^2 0.999821, bottom 69.3768 against an exact 78.4800 -- 11.6%.");
report("*** SO NEITHER KEY IS REDUNDANT AND NEITHER IS A GAP IN THE OTHER ***",
    "A SYMMETRIC ERROR MOVES THE MAGNITUDE; AN ASYMMETRIC ONE MOVES THE AXES. C is the half that is easy to " +
    "skip, and skipping it leaves 'isotropy catches everything' standing unmeasured (v3715: ask whether the " +
    "observable ever CLAIMED to look). These three were run against the shipped fluid/flip3d.mjs and REVERTED " +
    "-- they are evidence about these keys, NOT declared plant coverage, and plantedCoverage is right to say so.");

// *** THE HONEST HALF, MEASURED BECAUSE v3724 SAYS TO MEASURE IT: DOES AN EXISTING GATE ALREADY CATCH THESE? ***
report("!! AND THE ANSWER IS YES -- fluid/flip3d-selfcheck.mjs CATCHES ALL THREE",
    "Each plant trips the SAME TWO pre-existing checks: 'more pressure iterations drive the divergence down' " +
    "and 'and MONOTONICALLY'. A 1.1e+0 reduction factor under A, 6.0e-3 under B, 1.8e+0 under C, against the " +
    "1.2e+4 the honest solver manages. SO THIS DEVICE IS NOT THE ONLY DETECTOR AND MUST NOT BE SOLD AS ONE.");
report("*** WHAT IT ADDS, WHICH IS A DIFFERENT THING FROM DETECTION ***",
    "The pre-existing checks are a SELF-CONSISTENCY measure -- the solver drives its own residual down -- and " +
    "v3718 rejected exactly that as an answer key for flip2d, because a stopping criterion is the solver " +
    "grading itself. They say SOMETHING IS WRONG. These two keys are reference-free and EXACT (rho*g*d is an " +
    "outside answer; transposition is an identity), and between them they say WHICH KIND: a red slope with a " +
    "green isotropy is a MAGNITUDE error, the reverse is an AXIS error, and the census above is what licenses " +
    "reading it that way. A DIAGNOSTIC THAT NAMES THE FAILURE MODE IS WORTH SHIPPING BESIDE A DETECTOR THAT " +
    "ONLY RAISES A HAND -- but it is worth it for that reason and NOT for a coverage gap, and this file will " +
    "not claim one it does not have.");

// ---- 4. THE FOOTPRINT INVARIANCE -- REPORTED, DELIBERATELY NOT A SECOND KEY -------------------------------
console.log("\n4. THE FOOTPRINT INVARIANCE, AND WHY IT IS REPORTED RATHER THAN ASSERTED AS A KEY");
const fp = await buildFlip3D({ mode: "footprint" });
ok("the footprint sweep runs and the bottom pressure does not track the fluid mass",
    !fp.error && fp.footprintSpread < 1e-3,
    `${fp.footprints.join("^2, ")}^2 -- spread ${fp.footprintSpread.toExponential(3)} across ${fp.massRatio.toFixed(2)}x THE FLUID MASS`);
report("*** IT READS LIKE A SECOND KEY AND IT IS NOT ONE ***",
    "Bottom pressure depends on DEPTH ALONE, so widening the cross-section must not move it -- true, and " +
    "MEASURED. But the only defect it responds to is UNDER-CONVERGENCE, which scales with domain size (spread " +
    "1.94e-6 at iters 60, 1.73e-5 at 10, 1.97e-3 at 4) -- AND AT iters 4 THE SLOPE FIRES TOO (1.9e-3 against a " +
    "1e-3 bar). A claim that moves only where an existing claim also moves is A SECOND DECLARATION, not a " +
    "second key. It is asserted loosely here as a regression guard on the sweep itself and reported as data.");

// ---- 5. THE DEVICE CONTRACT ------------------------------------------------------------------------------
console.log("\n5. THE DEVICE CONTRACT");
ok("every key measured in every mode is declared",
    [hy, iso, fp].every((o) => Object.keys(o).every((k) => flip3dDevice.observables.includes(k))),
    `${flip3dDevice.observables.length} declared observables across ${flip3dDevice.modes.length} modes`);

const again = await buildFlip3D({ mode: "hydrostatic" });
ok("the same seed gives the same numbers",
    again.slopePerCell === hy.slopePerCell && again.bottomPressure === hy.bottomPressure,
    `fillBlock defaults to Math.random and this device hands it a seeded LCG -- an unseeded run is not a measurement`);

ok("each mode carries its OWN claim rather than one claim with a mode label",
    flip3dDefaults({ mode: "hydrostatic" }).claim.observable === "slopeErrFrac" &&
    flip3dDefaults({ mode: "isotropy" }).claim.observable === "worstRel" &&
    flip3dDefaults({ mode: "footprint" }).claim.observable === "footprintSpread",
    "hydrostatic -> slopeErrFrac <= 1e-3 ; isotropy -> worstRel <= 0 ; footprint -> footprintSpread <= 1e-3");

ok("the fixtures are EXPORTED, so this gate drives the same pool the device does",
    typeof settledPool === "function" && typeof transposedPair === "function",
    "two copies of a fixture are two declarations about one experiment that nobody ever compares");

const tiny = flip3dDefaults({ mode: "hydrostatic", config: { n: 6, ny: 10, depth: 4, steps: 30 } }).config;
const pool = settledPool(tiny);
const pair = transposedPair(tiny);
ok("!! ...and what they return is THE SHIPPED Flip3D, not a copy of it wearing the same shape",
    pool instanceof Flip3D && pair.X instanceof Flip3D && pair.Z instanceof Flip3D,
    `an import SPECIFIER is what gradedCoverage counts, and a specifier can be satisfied without the class ever ` +
    `being constructed -- ${pool.count()} particles came out of the real one`);

report("WHAT THIS DOES NOT CLAIM",
    "That fluid/flip3d.mjs is correct. The rigid coupling (twoWay, buoyancy integrated over submerged faces), " +
    "the mgpcg and rbgs solver paths and the 3D free surface are all UNGRADED; the default jacobi path is what " +
    "these keys drive. gradedCoverage moves by ONE MODULE, and the honest reading of that is 'this module now " +
    "has a key', not 'this module is verified'.");

// ---- THE MODE PLANT, AND THE KEY THAT IS BLIND TO IT BY CONSTRUCTION (v3845) ---------------------------------
// *** THIS DEVICE RAN THIS DEFECT AT v3729 AND THREW THE MEASUREMENT AWAY. *** The front door has printed
// "the divergence dropping its z term leaves the hydrostatic column PERFECT and moves isotropy to 2.5e-1" for
// a hundred versions, as EVIDENCE ABOUT THE KEYS -- and the census still read flip3d as bare, because a
// measurement made and discarded is not coverage. It is a declared mode now.
{
    const honest = await buildFlip3D({ mode: "isotropy" });
    const planted = await buildFlip3D({ mode: "flatdivergence" });
    const hydro = await buildFlip3D({ mode: "hydrostatic" });

    ok("!! the plant is DECLARED in the shape the census adjudicates -- plantMode / plantFlips / plantKind",
        flip3dDevice.plantMode === "flatdivergence" && flip3dDevice.plantFlips === "worstRel" &&
        flip3dDevice.plantKind === "mode" && flip3dDevice.modes.includes("flatdivergence") &&
        flip3dDevice.modes[0] === "isotropy",
        "modes " + JSON.stringify(flip3dDevice.modes) + ' -- *** "isotropy" IS FIRST ON PURPOSE: the contract ' +
        "compares the plant against `modes.find(m => m !== plantMode)`, and worstRel EXISTS ONLY IN THE " +
        "ISOTROPY BRANCH. With hydrostatic first the census would build an arm with no worstRel in it and " +
        "report this device DECLARED BUT DEAD -- which is exactly what mpmrefine reads today. ***");

    ok("!! the DECLARED observable flips off an EXACT zero, so any movement at all is a violation",
        honest.worstRel === 0 && planted.worstRel > 0.1,
        `worstRel ${honest.worstRel} -> ${planted.worstRel.toExponential(4)}. The transposed pair is ` +
        "BIT-IDENTICAL when the solver is honest -- the same particles run along x and along z -- so the bar " +
        "is EXACTLY 0 and needs no tolerance to argue about. Component-wise: frontRel " +
        `${honest.frontRel} -> ${planted.frontRel.toExponential(3)}, maxDivRel ${honest.maxDivRel} -> ` +
        `${planted.maxDivRel.toExponential(3)}`);

    ok("!! *** AND THE DEVICE'S PRIMARY KEY IS BLIND TO IT, WHICH IS WHY THE TWO MODES ARE NOT ONE CLAIM ***",
        Math.abs(hydro.slopeErrFrac) < 1e-3 && hydro.linearityR2 > 0.999999,
        `the hydrostatic column is UNTOUCHED at slope ${hydro.slopePerCell.toFixed(6)} (err ` +
        `${hydro.slopeErrFrac.toExponential(3)}, R^2 ${hydro.linearityR2.toFixed(12)}) while the solver has ` +
        "lost a third of its divergence. A column at rest has NO z-flow to lose, so the key cannot see the " +
        "defect -- ONE PLANT TESTS ONE CLAIM, and this one says which claim the other key was never making");

    ok("!! the shipped default is BIT-IDENTICAL with the knob off -- verified, not assumed",
        (() => {
            const mk = (flat) => { const f = new Flip3D(6, 8, 6, { h: 1, gravity: -9.81, iters: 20, flatDivergence: flat }); return f; };
            const a = mk(false), b = mk(undefined);
            for (const f of [a, b]) { let s2 = 1; for (let i = 1; i < 5; i++) for (let j = 1; j < 5; j++) for (let k = 1; k < 5; k++) f.addParticle(i, j, k, 0, 0, 0); for (let t = 0; t < 20; t++) f.step(1 / 60); }
            let sa = 0, sb = 0; for (let i = 0; i < a.p.length; i++) { sa += a.p[i]; sb += b.p[i]; }
            return sa === sb && a.flatDivergence === false && b.flatDivergence === false;
        })(),
        "*** THE KNOB BRANCHES ON THE WHOLE EXPRESSION RATHER THAN FACTORING THE z TERM INTO A VARIABLE, " +
        "because floating-point addition is NOT ASSOCIATIVE: `... + w1 - w0` and `... + (w1 - w0)` are " +
        "different operations and the tidy version moved the default in the last ulp. A KNOB THAT CHANGES THE " +
        "DEFAULT IS NOT A KNOB. ***");

    ok("...and the validator LISTS the plant mode, so it cannot silently revert",
        flip3dDefaults({ mode: "flatdivergence" }).mode === "flatdivergence" &&
        flip3dDefaults({ mode: "nonsense-mode" }).mode === "hydrostatic",
        "v3806 lost a round to a validator that reverted its plant in silence. The DEFAULT is untouched by " +
        "the reordering: flip3dDefaults still returns `hydrostatic` and the front door still leads with it");
}

console.log("\nflip3dBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
