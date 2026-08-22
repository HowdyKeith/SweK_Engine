// tools/roundhouse/mpmStepBind-selfcheck.mjs -- v3794
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
    ok("!! sideways drift is EXACTLY zero",
        sideways.noSidewaysDrift === true && sideways.driftX === 0,
        "=== 0, not < 1e-12: gravity is vertical and NOTHING ELSE MAY PUSH. A non-zero value would mean the " +
        "stencil or the force scatter had become asymmetric");
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
