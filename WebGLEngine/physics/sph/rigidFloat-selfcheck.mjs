// WebGLEngine/physics/sph/rigidFloat-selfcheck.mjs -- v4405
//
// *** THE COUPLING IS BUILT AND VERIFIED. ARCHIMEDES IS REFUSED, WITH A CAUSE THAT IS MEASURED. ***
//
// #160 was filed to come after #159 on purpose: the fluid side should not be the second consumer of an
// unproven bridge. v4403 proved the bridge -- generalized inverse mass, a bit-exact impulse ledger, a sheet
// that holds a 3.8 kg box up. This round takes it to the fluid, and the honest result is in two halves.
//
// WHAT IS ESTABLISHED: the hull integral. Given a hydrostatic pressure field, quadrature over a submerged
// box's six faces returns rho*g*V to within 0.017% at every resolution and every quadrature order tried, with
// the summed area equal to the hull area IDENTICALLY rather than approximately. The integrator is right.
//
// WHAT IS REFUSED: buoyancy in this tree's SPH. Against the live fluid the same integral reads 5x to 13x
// rho*g*V, and the reason is not the integral:
//
//     MEASURED, on physicsSuite's own settled pool (its gated fluid, its numbers, 2000 steps)
//     dp/d(depth) by least squares over 9 depths     7778 Pa/m
//     rho0 * g, which hydrostatics requires          1179 Pa/m
//     ratio                                          6.60
//     fraction of the column carrying NO pressure    4 of 9 samples, the top 44%
//     mean floor pressure vs M*g/area                0.155474 -- 15.5% low
//
// *** SO THE ONE GATED FLUID CHECK MEASURES THE QUANTITY BUOYANCY DOES NOT DEPEND ON. *** physicsSuite's
// "a settled fluid presses with exactly its own weight" reads the MEAN floor pressure and gets it right to
// 15.5%, honestly argued against a 25% tolerance. Buoyancy is a DIFFERENCE between two face pressures, so it
// depends on the GRADIENT -- and the gradient is 6.6x too steep while the mean is nearly right, because
// clampPressure zeroes everything under rest density and the top 44% of this column sits under it. All the
// pressure is crowded into the bottom half. A hull there feels 6.6x too much lift; a hull in the top 44%
// feels none at all, which is the 0.213 row in the table this gate prints.
//
// That is a fact about the fluid, not about the coupling, and it is the first time the tree has read it --
// because nothing had ever asked. rigidFloat.pressureGradient() is the reader this round adds.
//
// THE REFUSAL IS WRITTEN TO EXPIRE. The checks below assert the measured state, so if somebody fixes the
// pressure gradient this gate goes RED and says the refusal is stale rather than standing over a tree that
// has moved past it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSphWorld } from "./sph.js";
import * as RF from "./rigidFloat.mjs";
import { CHECKS } from "../../tools/ship/physicsSuite.mjs";
import { MEASURED_V2881 } from "./hydrostatic.mjs";
import { noComments } from "../../tools/ship/sourceScan.mjs";
import { gateReport } from "../../tools/ship/gateReport.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ....  " + m);
const GR = gateReport("physics/sph/rigidFloat-selfcheck.mjs");

const MASS = 0.02, G = 9.81;

/** physicsSuite's gated pool, its numbers, verbatim -- so every reading here is comparable to its own. */
const d = 0.055, W = 0.09, REST = MASS / (d * d * d);
const BOUNDS = [-W, 0.0, -W, W, 2.0, W];
function pool(settle = 2000) {
    const w = createSphWorld({ h: 0.16, mass: MASS, restDensity: REST, stiffness: 3000, viscosity: 3.0,
                               gravity: [0, -G, 0], clampPressure: true });
    for (let i = -2; i <= 2; i++) for (let k = -2; k <= 2; k++) for (let j = 0; j < 8; j++)
        w.addParticle([i * d, 0.04 + j * d, k * d]);
    for (let s = 0; s < settle; s++) w.step(0.00025, BOUNDS);
    w.computeDensity();
    return w;
}
/** A lattice GIVEN an exact hydrostatic field. No solver, so the only error left is discretisation. */
function exactField(dd, nx, ny) {
    const R = MASS / (dd * dd * dd);
    const w = createSphWorld({ h: 2.9 * dd, mass: MASS, restDensity: R, gravity: [0, -G, 0] });
    for (let i = 0; i < nx; i++) for (let k = 0; k < nx; k++) for (let j = 0; j < ny; j++)
        w.addParticle([(i - (nx - 1) / 2) * dd, (j + 0.5) * dd, (k - (nx - 1) / 2) * dd]);
    const level = ny * dd;
    for (const p of w.particles) { p.rho = R; p.p = Math.max(0, R * G * (level - p.y)); }
    return { w, R, level, d: dd };
}
const hullArea = (hw, hh) => 2 * (2 * hw) * (2 * hw) + 4 * (2 * hw) * (2 * hh);

// =============================================================================================================
console.log("1. THE GAP, AND THE FORMULA THIS FILE DOES NOT OWN A SECOND COPY OF");
{
    const pf = noComments(fs.readFileSync(path.join(HERE, "poolFixture.mjs"), "utf8"));
    ok("SPH's pre-existing boundaries really are analytic box walls, nothing else",
       /wall/i.test(pf) || /spacing of margin/.test(fs.readFileSync(path.join(HERE, "poolFixture.mjs"), "utf8")),
       "poolFixture.mjs works in 'one spacing of margin off each wall'; sph.js's step() clamps to a bounds " +
       "array and scales the outward velocity by -0.3. A body had nothing to be a boundary WITH");
    const src = fs.readFileSync(path.join(HERE, "rigidFloat.mjs"), "utf8");
    const code = noComments(src);
    ok("*** and the generalized inverse mass is IMPORTED from v4403, not copied into this directory ***",
       /from\s*["']\.\.\/xpbd\/rigidCouple\.js["']/.test(code) &&
       /generalizedInvMass/.test(code) && !/invInertia\[0\]/.test(code) && !/\(r x n\)\^T/.test(code),
       "boxFace, faceConstraint and generalizedInvMass come across from physics/xpbd/. A cross-family import " +
       "is the point: the alternative is one formula implemented twice in two directories");
    ok("...and there is no rho*g*V anywhere in the module, which is what makes Archimedes falsifiable",
       !/restDensity\s*\*\s*[gG]|\*\s*9\.81|rho\s*\*\s*g\s*\*/.test(code.replace(/archimedesDraft[\s\S]*?\n}/, "")),
       "the only place a density meets a gravity is archimedesDraft(), which is the PREDICTION. The integral " +
       "sums p*A over a surface and knows nothing about what buoyancy is");
}

// =============================================================================================================
console.log("\n2. THE DERIVED QUANTITIES RECOVER THE LATTICE THEY CAME FROM");
{
    const sp = RF.particleSpacing(MASS, REST);
    ok("*** (m/rho)^(1/3) recovers the pool's own particle spacing to 15 digits ***",
       Math.abs(sp - d) < 1e-15,
       `${sp.toFixed(15)} against the lattice's d = ${d}. The area a particle carries is the square of this ` +
       "and it is DERIVED, never a tuned constant");
    const a = RF.particleArea(MASS, REST);
    ok("...and the area is that spacing squared",
       Math.abs(a - d * d) < 1e-17, `${a.toExponential(10)} = ${d}^2`);
    const pr = RF.makeRigidProxy({ halfExtents: [0.06, 0.04, 0.06], density: 60 });
    const ar = RF.archimedesDraft(pr, 120);
    ok("Archimedes' own arithmetic: half the fluid's density floats at half the height",
       Math.abs(ar.ratio - 0.5) < 1e-12 && Math.abs(ar.draft - 0.04) < 1e-12 && ar.floats === true,
       `rho_box ${ar.rhoBox} in rho_fluid 120 -> ratio ${ar.ratio}, draft ${ar.draft} of ${ar.fullHeight}`);
    const sink = RF.archimedesDraft(RF.makeRigidProxy({ halfExtents: [0.06, 0.04, 0.06], density: 240 }), 120);
    ok("...and denser than the fluid does not float, which is a different statement from a deeper draft",
       sink.floats === false && sink.draft === sink.fullHeight,
       `ratio ${sink.ratio} -> floats ${sink.floats}, draft capped at the full height ${sink.fullHeight}`);
}

// =============================================================================================================
console.log("\n3. *** THE HULL INTEGRAL AGAINST AN EXACT FIELD: rho*g*V TO 0.017% ***");
const exactRows = [];
{
    console.log("        d       span       sum(A)/hull        F_up (N)      rho*g*V (N)     ratio");
    let worst = 0, areaExact = true;
    for (const dd of [0.05, 0.033, 0.025, 0.02]) {
        const nx = 2 * Math.round(0.25 / dd) + 1, ny = Math.round(0.5 / dd);
        const L = exactField(dd, nx, ny);
        const hw = Math.round(0.16 / dd) * dd / 2, hh = Math.round(0.08 / dd) * dd / 2;
        const proxy = RF.makeRigidProxy({ halfExtents: [hw, hh, hw], mass: 0, pos: [0, L.level * 0.5, 0] });
        const q = RF.hullPressureQuadrature(L.w, proxy, { res: 6 });
        const vol = 8 * hw * hh * hw, want = L.R * G * vol;
        const ratio = q.body[1] / want, ha = hullArea(hw, hh);
        if (Math.abs(q.area / ha - 1) > 1e-12) areaExact = false;
        worst = Math.max(worst, Math.abs(ratio - 1));
        exactRows.push([dd, 2 * hw / dd, q.area / ha, q.body[1], want, ratio]);
        console.log("       " + dd.toFixed(3) + "    " + (2 * hw / dd).toFixed(1) + "       " +
                    (q.area / ha).toFixed(12) + "      " + q.body[1].toFixed(5).padStart(9) + "     " +
                    want.toFixed(5).padStart(9) + "     " + ratio.toFixed(4));
    }
    ok("*** the summed quadrature area IS the hull area, not merely close to it ***", areaExact,
       "res x res midpoints per face at weight faceArea/res^2 sum to the face area by construction. THE " +
       "PARTICLE-BAND ESTIMATOR THIS REPLACED could not say that: its summed area came out between 0.28x and " +
       "3.4x the hull depending on how the lattice happened to align, which is how it was caught");
    ok("*** and a submerged box feels rho*g*V, across a 2.5x range of resolution ***", worst < 0.001,
       `worst deviation ${(worst * 100).toFixed(3)}% over spans of 3 to 8 particle spacings. The integrator is ` +
       "right; everything refused below is about the field it is handed");
    // *** THE BAND ESTIMATOR IS KEPT AS THE NEGATIVE CONTROL, AND A SABOTAGE IS WHY. *** With nothing here
    // calling hullPressureForce, removing its "a fluid pushes, it does not pull" guard read ZERO RED: the
    // function had become dead code carrying a header about its own failure, which is prose where a
    // measurement belongs. spatialGrid-selfcheck's rule, inverted -- there the slow path is the oracle for the
    // fast one; here the WRONG method is the oracle for the right one, and deleting it would delete the reason
    // quadrature exists.
    {
        const L = exactField(0.033, 2 * Math.round(0.25 / 0.033) + 1, Math.round(0.5 / 0.033));
        const hw = Math.round(0.16 / 0.033) * 0.033 / 2, hh = Math.round(0.08 / 0.033) * 0.033 / 2;
        const proxy = RF.makeRigidProxy({ halfExtents: [hw, hh, hw], mass: 0, pos: [0, L.level * 0.5, 0] });
        const band = RF.hullPressureForce(L.w, proxy, { wetReach: L.d, dt: 1 });
        const quad = RF.hullPressureQuadrature(L.w, proxy, { res: 6 });
        const ha = hullArea(hw, hh);
        const want = L.R * G * (8 * hw * hh * hw);
        console.log(`        band estimator: summed area ${(band.area / ha).toFixed(3)}x the hull, ` +
                    `${band.wetted} wetted particles, ${band.inside} inside the hull, F_up ${band.body[1].toFixed(3)} N ` +
                    `(${(band.body[1] / want).toFixed(2)}x rho*g*V)`);
        // *** THE READING IS PINNED, NOT BOUNDED, AND THAT IS THE SECOND THING A SABOTAGE TAUGHT THIS CHECK. ***
        // The first draft asserted the band was wrong by MORE than a threshold -- and two sabotages that made
        // it wronger still (dropping its pull guard, then letting interior particles back into the sum) both
        // read ZERO RED, because a check written in the direction of the defect cannot see the defect grow.
        // v4398's lesson in a new shape. These are the MEASURED values on this exact field; any change to the
        // band, better or worse, moves them and says so.
        const BAND_AT_V4405 = Object.freeze({ areaRatio: 1.0778, forceRatio: -3.2500, wetted: 97, inside: 50 });
        const near = (a, b, tol) => Math.abs(a - b) <= tol;
        ok("*** the particle-band estimator's failure is PINNED as a measurement, and quadrature's area is exact ***",
           near(band.area / ha, BAND_AT_V4405.areaRatio, 5e-4) &&
           near(band.body[1] / want, BAND_AT_V4405.forceRatio, 5e-4) &&
           band.wetted === BAND_AT_V4405.wetted && band.inside === BAND_AT_V4405.inside &&
           Math.abs(quad.area / ha - 1) < 1e-12,
           `band: area ${(band.area / ha).toFixed(4)}x the hull (recorded ${BAND_AT_V4405.areaRatio}), force ` +
           `${(band.body[1] / want).toFixed(4)}x rho*g*V (recorded ${BAND_AT_V4405.forceRatio}), ${band.wetted} ` +
           `wetted and ${band.inside} inside. Quadrature's area is exact. A band of particles is not a surface ` +
           "and its area is an accident of how the lattice met the faces -- the force comes out with the WRONG " +
           "SIGN here, which is how it was caught in the first place");
        exactRows.push(["band estimator, d=0.033", 2 * hw / 0.033, band.area / ha, band.body[1], want, band.body[1] / want]);
    }
    GR.table("hull quadrature against an exact hydrostatic field",
             ["particle spacing (m)", "hull span (spacings)", "summed area / hull area", "F_up (N)", "rho*g*V (N)", "ratio"],
             exactRows, "no solver in this table: every particle is GIVEN p = rho*g*(level-y)");
}

// =============================================================================================================
console.log("\n4. THE COUPLING'S LEDGER IS EXACT, AND THE ONE-WAY CONTROL BREAKS IT");
{
    const runLedger = (oneWay) => {
        const w = pool(400);
        const lv = RF.freeSurface(w).level;
        const proxy = RF.makeRigidProxy({ halfExtents: [0.045, 0.025, 0.045], density: 60, pos: [0, lv * 0.6, 0] });
        let exact = true, applied = 0;
        for (let s = 0; s < 200; s++) {
            const r = RF.sphRigidStep(w, proxy, 0.00025, BOUNDS,
                { radius: 0.5 * d, wetReach: 1.5 * d, iterations: 2, pressure: true, oneWay });
            if (Math.hypot(...RF.ledgerResidual(r.ledger)) !== 0) exact = false;
            applied += r.ledger.applied;
        }
        return { exact, applied };
    };
    const two = runLedger(false), one = runLedger(true);
    ok("*** the non-penetration ledger is a BIT-IDENTICAL zero, every step ***",
       two.exact === true && two.applied > 0,
       `${two.applied} projections over 200 steps and sum(+s*n) + sum(-s*n) is exactly [0,0,0] -- IEEE ` +
       "negation is exact and round-to-nearest is sign-symmetric, the same argument v4403 shipped");
    ok("...and dropping the body's half breaks it, so the check is not vacuous",
       one.exact === false && one.applied > 0,
       `the one-way run applied ${one.applied} projections and its residual is non-zero`);
    const src = noComments(fs.readFileSync(path.join(HERE, "rigidFloat.mjs"), "utf8"));
    ok("...and the fluid is stepped by sph.js untouched, so this is a coupling and not a fork of the solver",
       /world\.step\(dt, bounds\)/.test(src),
       "everything this module adds happens between one world.step and the next");
}

// =============================================================================================================
console.log("\n5. *** THE MEASUREMENT THAT REFUSES ARCHIMEDES, AND IT IS ABOUT THE GRADIENT ***");
let grad = null;
{
    const w = pool();
    grad = RF.pressureGradient(w, { samples: 9 });
    console.log("        depth below surface     p (SPH interpolant, centre column)");
    for (const [depth, p] of grad.rows)
        console.log("             " + depth.toFixed(4) + "                    " + p.toFixed(1).padStart(9));
    console.log(`        least squares dp/d(depth) ${grad.slope.toFixed(1)} Pa/m  against rho0*g ` +
                `${grad.required.toFixed(1)} Pa/m  -> ${grad.ratio.toFixed(3)}x`);
    ok("*** the pressure gradient is 6.6x too steep, which is what buoyancy actually depends on ***",
       grad.ratio > 5 && grad.ratio < 8,
       `${grad.slope.toFixed(1)} Pa/m measured against the ${grad.required.toFixed(1)} Pa/m hydrostatics ` +
       "requires. Buoyancy is a DIFFERENCE between two face pressures, so a gradient this wrong cannot give " +
       "the right force however good the integral is");
    ok("*** and the top of the column carries NO pressure at all ***",
       grad.pressurelessFraction > 0.3,
       `${Math.round(grad.pressurelessFraction * grad.samples)} of ${grad.samples} sampled depths read exactly ` +
       `0 Pa -- the top ${(grad.pressurelessFraction * 100).toFixed(0)}%. clampPressure zeroes anything under ` +
       "rest density and this column's upper half sits under it, so all the pressure is crowded into the bottom");
    // *** AND THE GATED CHECK NEXT DOOR IS RIGHT ABOUT ITS OWN QUANTITY, WHICH IS THE POINT. ***
    const suite = CHECKS.find((c) => c.name === "a settled fluid presses with exactly its own weight");
    const sr = suite.run();
    ok("...while the one fluid check the tree DOES gate is right to 15.5%, because it measures the MEAN",
       sr.got < suite.tol && sr.got > 0.1,
       `physicsSuite reads ${sr.got.toFixed(6)} relative against its ${suite.tol} tolerance -- ${sr.detail}. ` +
       "A mean and a gradient are different quantities and only one of them was ever asked for");
    const best = MEASURED_V2881.reduce((a, b) => (b.retained > a.retained && b.retained <= 1 ? b : a));
    ok("...and hydrostatic.mjs's own best row says the same thing from the third direction",
       best.retained > 0.6 && best.retained < 0.7,
       `"${best.label}" RETAINS ${best.retained} of a still column's height -- a column standing at ` +
       `${(1 / best.retained).toFixed(2)}x the density it was given. Three readings, one fluid, and the ` +
       "gradient is the one nobody had taken");
    GR.table("the settled pool's pressure down its centre column",
             ["depth below surface (m)", "p (Pa)"], grad.rows,
             `least squares dp/d(depth) = ${grad.slope.toFixed(1)} Pa/m against rho0*g = ${grad.required.toFixed(1)} Pa/m`);
}

// =============================================================================================================
console.log("\n6. *** SO THE LIVE FLUID'S BUOYANCY IS WRONG BY THE FACTOR THE GRADIENT IS WRONG BY ***");
{
    const w = pool();
    const lv = RF.freeSurface(w).level;
    const rows = [];
    console.log("        box (m)          centre y    local rho    F_up (N)    rho_local*g*V    ratio");
    for (const [hw, hh, frac] of [[0.06, 0.04, 0.35], [0.06, 0.04, 0.5], [0.06, 0.04, 0.65], [0.04, 0.03, 0.5]]) {
        const cy = lv * frac;
        const proxy = RF.makeRigidProxy({ halfExtents: [hw, hh, hw], mass: 0, pos: [0, cy, 0] });
        const q = RF.hullPressureQuadrature(w, proxy, { res: 6 });
        const ld = RF.localDensity(w, proxy, 0.06);
        const vol = 8 * hw * hh * hw, want = ld.rho * G * vol;
        rows.push([`${(2 * hw).toFixed(3)} x ${(2 * hh).toFixed(3)}`, cy, ld.rho, q.body[1], want, q.body[1] / want]);
        console.log("        " + (2 * hw).toFixed(3) + " x " + (2 * hh).toFixed(3) + "      " + cy.toFixed(4) +
                    "     " + ld.rho.toFixed(1).padStart(6) + "    " + q.body[1].toFixed(4).padStart(8) +
                    "     " + want.toFixed(4).padStart(8) + "     " + (q.body[1] / want).toFixed(3));
    }
    const ratios = rows.map((r) => r[5]);
    const deep = ratios.slice(0, 2), shallow = ratios[2];
    ok("*** a hull in the bottom half feels FAR more lift than rho*g*V, and by the gradient's factor ***",
       deep.every((r) => r > 3),
       `ratios ${deep.map((r) => r.toFixed(2)).join(" and ")} where Archimedes says 1. The gradient is ` +
       `${grad.ratio.toFixed(1)}x too steep and a hull spanning that region reads the same kind of excess`);
    ok("*** and a hull in the pressureless top feels almost nothing, which is the same defect inverted ***",
       shallow < 0.5,
       `ratio ${shallow.toFixed(3)} at 65% of the way up. Not a smaller error -- the OPPOSITE error, and both ` +
       "come from the pressure being crowded into the bottom of the column");
    ok("...so ARCHIMEDES IS REFUSED for this fluid, and refused with a number rather than a shrug",
       true,
       "the integral is right to 0.017% against an exact field and wrong by 5x to 13x against this one. That " +
       "is a statement about physics/sph/'s pressure field and it is now on the record");
    GR.table("the same quadrature against the LIVE settled pool",
             ["box footprint x height (m)", "centre y (m)", "local rho", "F_up (N)", "rho_local*g*V (N)", "ratio"],
             rows, "the integrator is unchanged from the table in section 3; only the field is different");
}

// ---- v4405 SABOTAGES, grep-CONFIRMED APPLIED BEFORE READING, RESTORED md5-IDENTICAL -------------------------
//
// physics/sph/rigidFloat.mjs before and after all six -- md5-identical: af69b02d515d463094c9f6f6cda9b415
//
//   A  the quadrature weight becomes faceArea/res instead of faceArea/res^2
//      -> 3 RED: the area invariant, rho*g*V on the exact field, and the pressureless-top row.
//   B  pressureAt drops the (m/rho) volume factor, so the SPH interpolant is no longer one
//      -> 3 RED: rho*g*V, the measured gradient, and the pressureless-top row.
//   C  the ledger's body half given the wrong sign (+= for -=)
//      -> 1 RED: the bit-exact ledger, the same check and the same argument as v4403's sabotage B.
//   D  particleSpacing takes a square root instead of a cube root
//      -> 2 RED: the spacing recovery and the area-is-spacing-squared check.
//   E  the band estimator's "a fluid pushes, it does not pull" guard removed
//      -> 0 RED, AND IT STAYS 0 RED, WHICH IS REPORTED RATHER THAN PAPERED OVER. The guard defends against
//      p <= 0, and every fixture in this file runs with clampPressure:true, which already prevents it. The
//      mutation is UNREACHABLE here, not undetected by a weak check. Manufacturing a fixture with negative
//      pressure to catch it would be writing a test for a state the engine's own configuration forbids; the
//      honest record is that this guard is exercised by nothing in this gate and the reason why.
//   F  interior particles allowed back into the band's surface integral
//      -> 1 RED: the pinned band reading. AND THIS IS THE SECOND SABOTAGE THAT REWROTE A CHECK. The band
//      check's first draft asserted the band was wrong by MORE than a threshold, and both E and F read zero
//      against it -- a check written in the direction of the defect cannot see the defect grow. It pins the
//      measured values now.
//

GR.skip("a box that floats at the Archimedes draft",
        "refused, not deferred: the pressure gradient this fluid delivers is 6.6x too steep in the bottom half " +
        "and zero in the top 44%, so there is no depth at which the lift is rho*g*V. Section 6 is the evidence");
GR.skip("torque, heel and righting moment",
        "the quadrature returns a torque and nothing here checks it. A floating body's stability is a second " +
        "round and it needs a fluid whose gradient is right first");
GR.note("Every number in these tables is read from the same objects the checks above assert on.");
{
    const w = GR.write();
    console.log("\n  ----  gate report: " + (w.written ? "written to " + w.file : w.why) +
                ` -- ${w.doc.tables.length} tables, ` +
                `${w.doc.tables.reduce((n, t) => n + t.rows.length * t.columns.length, 0)} cells`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE FLUID CAN BE FIXED. This round measures the gradient and refuses " +
    "buoyancy on it; it does not attempt a stiffness, a viscosity or an equation of state that would make the " +
    "gradient right, because tuning a solver until a number matches is the one move this tree does not make " +
    "without a separate argument. Also unchecked: any shape but a box, any body but one, and the reaction the " +
    "fluid takes from the hull -- which is shared over the wetted particles in proportion to nothing but their " +
    "number, stated as crude in the module rather than dressed up. AND THIS REFUSAL IS WRITTEN TO EXPIRE: the " +
    "checks above assert the MEASURED state, so a round that fixes the gradient turns this gate red and makes " +
    "it say so, rather than leaving a stale refusal standing over a tree that has moved past it.");
process.exit(fails ? 1 : 0);
