// tools/roundhouse/mpmStepBind-selfcheck.mjs -- v3794, v4031
//
// *** THE ASSEMBLY. Five pieces were graded one at a time and every entry closed with the same sentence: THE
// PIECES ARE GRADED, THE ASSEMBLY IS NOT WRITTEN. This is the assembly, and writing it FOUND A COMPOSITION BUG
// THAT NO PIECE'S OWN GATE COULD EVER HAVE CAUGHT. ***
//
// *** THE KEY IS A PROPERTY OF THE COMPOSITION: a freely falling block's centre of mass follows the analytic
// parabola WHATEVER THE MATERIAL DOES INTERNALLY. Internal stress cannot move it (v3793's third law),
// plasticity cannot, and the transfer conserves momentum (v3789). The block may wobble, squash, rotate and
// yield -- ITS CENTRE OF MASS STILL TRACES A PARABOLA. ***

import { mpmStepDevice, MPMSTEP_MODES, buildMpmStep } from "./mpmStepBind.mjs";
import { makeGrid, p2g, g2p } from "../../physics/mpm/transfer.mjs";
import { normalise, applyBodyForce } from "../../physics/mpm/gridSolve.mjs";
import { codeOnly } from "../ship/sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const dir = path.dirname(fileURLToPath(import.meta.url));
const XFER = codeOnly(readFileSync(path.resolve(dir, "../../physics/mpm/transfer.mjs"), "utf8"));
const GRID = codeOnly(readFileSync(path.resolve(dir, "../../physics/mpm/gridSolve.mjs"), "utf8"));

const fall = await buildMpmStep({ mode: "freefall" });
const planted = await buildMpmStep({ mode: "continuous" });
const sideways = await buildMpmStep({ mode: "sideways" });

console.log("1. THE PARABOLA");
{
    ok("!! *** THE CENTRE OF MASS FOLLOWS THE ANALYTIC FALL TO ROUND-OFF ***",
        fall.parabolaHolds === true && fall.errY < 1e-9,
        "y " + fall.gotY.toFixed(9) + " against " + fall.wantY.toFixed(9) + ", err " + fall.errY.toExponential(3) +
        " after falling " + fall.fell.toFixed(6) + ". *** THIS IS A PROPERTY OF THE WHOLE LOOP AND OF NO PIECE " +
        "IN IT ***");
    ok("!! *** AND IT DOES NOT CARE WHETHER THE MATERIAL YIELDED ***",
        fall.plasticIrrelevant === true,
        "the error with plasticity and without differ by less than 1e-12. PLASTICITY IS INTERNAL, AND INTERNAL " +
        "PROCESSES CANNOT MOVE A CENTRE OF MASS -- if this line ever goes red, something internal has started " +
        "pushing");
    ok("!! sideways drift is EXACTLY zero, ON A RUN THAT ACTUALLY HAPPENED",
        sideways.noSidewaysDrift === true && sideways.driftX === 0 && sideways.blockFell === true,
        "=== 0, not < 1e-12: gravity is vertical and NOTHING ELSE MAY PUSH. A non-zero value would mean the " +
        "stencil or the force scatter had become asymmetric. *** v4031 ADDED THE SECOND HALF: a grid too small " +
        "to hold the block satisfies driftX === 0 perfectly by never moving it, and this line asked only the " +
        "first half until the knob census walked nx down to 2. Section 6. ***");
}

console.log("\n2. THE PLANT IS A WRONG EXPECTATION, NOT A WRONG SIMULATION");
{
    ok("!! *** GRADING AGAINST THE CONTINUOUS g t^2 / 2 FAILS BY 1.022e-2 ***",
        planted.parabolaHolds === false && planted.errY > 1e-6,
        "err " + fall.errY.toExponential(3) + " -> " + planted.errY.toExponential(3) + ". *** SYMPLECTIC-EULER " +
        "ADVECTS WITH THE VELOCITY AFTER THE KICK, so the fall after n steps is g*dt^2*n(n+1)/2 -- one " +
        "half-step of drift away from the textbook form. THE SIMULATION IS RIGHT AND THE EXPECTATION IS WRONG, " +
        "WHICH IS THE MORE DANGEROUS KIND: the natural response is to TUNE A CORRECT LOOP UNTIL IT MATCHES ***");
    ok("!! the device DECLARES the plant, with `freefall` first",
        DEVICE_NAMES.includes("mpmstep") && mpmStepDevice.plantMode === "continuous" &&
        mpmStepDevice.plantFlips === "errY" && MPMSTEP_MODES[0] === "freefall");
}

console.log("\n3. THE COMPOSITION BUG THIS ROUND FOUND, PINNED SO IT CANNOT RETURN");
{
    ok("!! *** g2p READS THE GRID'S STATE INSTEAD OF ASSUMING IT ***",
        /alreadyVelocity = g\.normalised === true/.test(XFER) && /alreadyVelocity \?/.test(XFER),
        "*** g2p DIVIDES BY NODE MASS AS IT GATHERS, AND normalise() DOES THE SAME DIVISION IN PLACE. A loop " +
        "that calls normalise -- WHICH IT MUST, because the body force has to land on a VELOCITY field for the " +
        "impulse to be M*g*dt -- and then calls g2p DIVIDED BY MASS TWICE ***");
    ok("!! and p2g CLEARS the flag, because it writes momentum",
        /g\.normalised = false/.test(XFER) && /g\.normalised = true/.test(GRID),
        "the flag is set by normalise and cleared by p2g, so the grid always says which field it holds. A flag " +
        "that is only ever SET is a flag that goes stale on the second step");
    // The measurement that found it, kept as a check rather than a memory.
    const g = makeGrid(8, 8, 0.5);
    const ps = [{ x: 2, y: 2, vx: 0, vy: 0, cxx: 0, cxy: 0, cyx: 0, cyy: 0, m: 0.1 }];
    p2g(ps, g, { affine: true });
    normalise(g);
    applyBodyForce(g, 0, -9.81, 1 / 240);
    g2p(ps, g, { affine: true });
    ok("!! *** ONE PARTICLE, NORMALISED THEN GATHERED, READS EXACTLY g*dt ***",
        Math.abs(ps[0].vy - (-9.81 / 240)) < 1e-12,
        "vy " + ps[0].vy.toFixed(9) + " against " + (-9.81 / 240).toFixed(9) + ". *** BEFORE THE FIX THIS READ " +
        "-3.678750000 -- NINETY TIMES TOO MUCH, WHICH IS 1/(0.1/9), THE PER-NODE MASS. The grid was PERFECT " +
        "(total mass 0.100000000000, momentum exact); ONLY THE GATHER WAS WRONG ***");
}

console.log("\n4. *** v4031 -- THE GRID THRESHOLD IS DERIVED FROM THE FIXTURE, NOT TUNED ***");
{
    // restBlock spans x in [2,3] and y in [6,7] (5x5 particles, spacing 0.25, from x0=2, y0=6). The quadratic
    // kernel's support reaches ONE NODE past the particle, so with h = 0.5 the last node the block touches is
    // at index 3/0.5 + 1 = 7 in x and 7/0.5 + 1 = 15 in y. Below that, p2g's own bounds guard silently drops
    // the scatters that fall off the end and the parabola stops holding. THE NUMBERS BELOW ARE THAT ARITHMETIC
    // AND NOTHING ELSE -- if the fixture's extent or the kernel's support changes, they move with it.
    const need = (extent) => Math.ceil(extent / 0.5) + 1;
    const at = async (cfg) => (await buildMpmStep({ mode: "freefall", config: cfg }));
    const nx7 = await at({ nx: 7 }), nx6 = await at({ nx: 6 });
    const ny15 = await at({ ny: 15 }), ny14 = await at({ ny: 14 });
    ok("!! the x threshold is EXACTLY the block's right edge plus one node of stencil",
        need(3) === 7 && nx7.parabolaHolds === true && nx7.errY < 1e-9 && nx6.parabolaHolds === false,
        "nx = 7 -> errY " + nx7.errY.toExponential(3) + " (exact); nx = 6 -> " + nx6.errY.toExponential(3) +
        ", a factor of 2.5e14. ceil(3/0.5)+1 = 7 and the measurement agrees WITHOUT BEING TOLD");
    ok("!! the y threshold is EXACTLY the block's top edge plus one node of stencil",
        need(7) === 15 && ny15.parabolaHolds === true && ny15.errY < 1e-9 && ny14.parabolaHolds === false,
        "ny = 15 -> errY " + ny15.errY.toExponential(3) + " (exact); ny = 14 -> " + ny14.errY.toExponential(3) +
        ". *** THE BLOCK IS TALLER THAN IT IS WIDE, AND THAT ALONE IS WHY knobLiveness CALLED ny LIVE AND nx " +
        "DEAD: its near ladder's 0.5x rung is 8, which clears 7 and does not clear 15. A verdict that turns on " +
        "whether a ladder rung straddles a physical threshold is a reading about the ladder. ***");
    const above = await Promise.all([8, 9, 10, 16, 32, 64].map((n) => at({ nx: n })));
    ok("!! and the knob is flat everywhere above it, which is the key rather than a dead knob",
        above.every((r) => Object.is(r.errY, nx7.errY)),
        "errY is BIT-IDENTICAL at nx = 7, 8, 9, 10, 16, 32 and 64. The discretisation is refined by a factor " +
        "of nine and the centre of mass does not notice, because a centre of mass is not a field");
}

console.log("\n5. *** v4031 -- nu IS FLAT BECAUSE THE KEY HOLDS, AND E READS LIVE ON ONE ULP ***");
{
    // This is the claim knobLiveness's STILL_OK entry for mpmstep.nu points at, pinned HERE at the source
    // rather than only in the register, so it goes red where the physics is if it ever stops being true.
    const base = await buildMpmStep({ mode: "freefall" });
    const nus = [0, 0.15, 0.45, 0.49, 1e-6, -0.3, 3e5];
    const outs = await Promise.all(nus.map((v) => buildMpmStep({ mode: "freefall", config: { nu: v } })));
    const keys = Object.keys(base);
    ok("!! *** POISSON'S RATIO MOVES NOTHING, INCLUDING AT VALUES THAT ARE NOT POISSON RATIOS ***",
        outs.every((o) => keys.every((k) => Object.is(base[k], o[k]))),
        "bit-identical at nu = " + nus.join(", ") + ". The last two are outside (-1, 0.5) and the observables " +
        "DO NOT NOTICE. *** nu enters only through lame(E, nu) into the internal stress, and internal stress " +
        "cannot move a centre of mass -- so this is the file's own first sentence, measured. THE HONEST " +
        "CONSEQUENCE IS THAT NO KEY THIS DEVICE CARRIES CAN GRADE THE CONSTITUTIVE MODEL, which is worth " +
        "knowing rather than worth silencing (mpmdrucker.E, same shape, v4025). ***");
    const e250 = await buildMpmStep({ mode: "freefall", config: { E: 250 } });
    const moved = Object.keys(base).filter((k) => !Object.is(base[k], e250[k]));
    ok("!! ...and E, which the census calls LIVE, differs in exactly one observable by one ULP",
        moved.length === 1 && moved[0] === "errNoPlastic" &&
        Math.abs(e250.errNoPlastic - base.errNoPlastic) < 1e-14,
        "E 500 -> 250 moves errNoPlastic " + base.errNoPlastic.toExponential(4) + " -> " +
        e250.errNoPlastic.toExponential(4) + " and nothing else. *** THE live/still LINE BETWEEN E AND nu IN " +
        "THIS DEVICE IS ROUNDING, NOT GRADING. *** The census tests motion with Object.is, so one bit of " +
        "round-off reads the same as a real response -- a reading, never a diagnosis, exactly as it says.");
}

console.log("\n6. *** v4031 -- THE SIDEWAYS NEGATIVE NO LONGER PASSES VACUOUSLY ***");
{
    // Found by walking the knob census down nx: the strongest form of this key -- driftX EXACTLY zero -- is
    // satisfied perfectly by a simulation in which nothing whatsoever happens.
    const good = await buildMpmStep({ mode: "sideways" });
    const empty = await buildMpmStep({ mode: "sideways", config: { nx: 2 } });
    const clipped = await buildMpmStep({ mode: "sideways", config: { nx: 3 } });
    ok("!! *** A GRID TOO SMALL TO HOLD THE BLOCK STILL REPORTS driftX EXACTLY ZERO ***",
        empty.driftX === 0 && empty.noSidewaysDrift === true && empty.fell === 0,
        "nx = 2 puts x in [2,3] entirely outside a grid of extent 1.0, p2g's bounds guard drops every scatter, " +
        "no node carries mass and the block never moves. driftX === 0 and the negative is SATISFIED BY " +
        "NOTHING HAPPENING");
    ok("!! ...and blockFell is the witness that separates that from the real pass",
        good.blockFell === true && empty.blockFell === false,
        "fell " + good.fell.toFixed(6) + " -> " + empty.fell.toFixed(6) + ". Reported SEPARATELY rather than " +
        "folded into noSidewaysDrift: two facts averaged into one observable is a number that means neither " +
        "(render/silhouette.mjs on hard gates), so the observable stays pure and THE GATE ASKS FOR BOTH");
    ok("!! the honest failure in between still fires, so this is not a blanket excuse for small grids",
        clipped.noSidewaysDrift === false && clipped.blockFell === true && clipped.driftX > 0,
        "nx = 3 clips the block asymmetrically and driftX goes to " + clipped.driftX.toExponential(3) +
        " -- a REAL asymmetry, caught. The hole was only ever at the degenerate end, where the guard drops " +
        "everything symmetrically");
    ok("!! and the default run passes BOTH halves, which is what section 1 was always assuming",
        good.noSidewaysDrift === true && good.driftX === 0 && good.blockFell === true);
}

report("*** WHY NEITHER PIECE'S GATE COULD HAVE FOUND IT ***",
    "v3789's gate tests g2p on a grid holding MOMENTUM, which is the state g2p was written for, and it passes. " +
    "v3790's gate tests normalise on a grid holding momentum, and it passes. BOTH MODULES ARE CORRECT ON THE " +
    "INPUT EACH EXPECTS, and the defect lives ONLY in the sentence 'and then you call the other one'. " +
    "*** A COMPOSITION IS A CLAIM NOBODY MAKES UNTIL SOMEBODY WRITES THE LOOP -- which is the argument for " +
    "writing it, and for grading it on something no piece can supply. ***");

report("WHAT THIS DOES NOT CLAIM",
    "That the material behaves correctly. FREE FALL IS THE WEAKEST INTERESTING TEST: the block barely deforms, " +
    "so the stress and the return mapping are exercised but not stressed. A collapsing column against a wall " +
    "would say far more and has NO analytic answer, which is exactly why this key came first. Nor does SweK " +
    "have an MPM PAGE -- nothing draws this, and the loop is CPU and 2D.");

console.log("\nmpmStepBind-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
