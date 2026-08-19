// tools/roundhouse/fluidBind-selfcheck.mjs -- v3845
//
// *** THE WIND TUNNEL HAD NO GATE OF ITS OWN. *** `windtunnel` has been a registered device since v2816 and
// the only thing asserting anything about it was labDevices-selfcheck's registry contract -- that it declares
// its modes and returns declared keys. Nothing drove its answer key. This file is that gate, and it arrives
// with the device's plant because the two questions are the same question: what would this device catch?
//
// THE ANSWER KEY IS DERIVED, WHICH IS RARE. In a periodic channel at steady state the total force on all
// solids MUST equal the total applied body force -- momentum conservation, and nothing the momentum-exchange
// sum is built from. So the identity adjudicates the force measurement from outside it.
//
// *** AND THE FIRST THING THIS GATE FOUND IS THAT THE DEVICE DEFAULT DOES NOT SATISFY IT. *** balanceErr is
// simultaneously "is the force right" and "is this reading finished" -- fluidBind.mjs's own header says so --
// and nobody had asked it the second question. At the default 3500 steps it reads 2.8e-1. IT IS NOT A FORCE
// ERROR, IT IS AN UNSETTLED FLOW, and the two are indistinguishable in a log. Section 2 pins the convergence
// so the number is readable as what it is.
//
// RUNTIME 21 s MEASURED with time(1) around the run, against verify.mjs's 180 s per-gate budget. Every LBM
// step here is real; the sweep in section 2 is the cost and it is what makes section 3's plant legible.
"use strict";
import { buildFluid, fluidDevice, fluidDefaults } from "./fluidBind.mjs";
import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { solidForceBalance, appliedBodyForce } from "../../simulation/lbm/windTunnel.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + (d ? "   " + d : ""));

console.log("fluidBind-selfcheck -- the wind tunnel's derived identity, and the reader that reports zero\n");

// ---- 1. THE MODULE IS DRIVEN, NOT MERELY IMPORTED ---------------------------------------------------------
console.log("1. THE GRADED MODULE IS ACTUALLY RUN");
const balance = await buildFluid({ mode: "balance" });
const drag = await buildFluid({ mode: "drag" });
{
    ok("!! a real LBM channel is stepped and both modes return finite observables",
        Number.isFinite(balance.balanceErr) && Number.isFinite(drag.cd) && drag.cd > 0 && balance.steps === 3500,
        `balance: balanceErr ${balance.balanceErr.toExponential(4)}, solidFx ${balance.solidFx.toExponential(4)}; ` +
        `drag: cd ${drag.cd.toFixed(4)}, Re ${drag.reMeasured.toFixed(1)}. gradedCoverage counts an IMPORT ` +
        "SPECIFIER, so a bind can satisfy the census without executing a line of the module it names");

    ok("!! mass is conserved to machine precision, which is the cheapest check that the solver is sane",
        balance.massDrift < 1e-9,
        `massDrift ${balance.massDrift.toExponential(2)} -- LBM conserves mass exactly; drift here would mean ` +
        "the identity below is being measured on a solver that is losing fluid, and no force claim survives that");

    ok("!! the symmetric body has no lift, which is the cheapest check that the force SUM is not broken",
        drag.liftToDragRatio < 0.05,
        `|cl/cd| = ${drag.liftToDragRatio.toExponential(3)} on a cylinder. A momentum-exchange sum that walked ` +
        "its links wrongly would almost never come out symmetric by accident");
}

// ---- 2. *** THE IDENTITY CONVERGES, AND THE DEVICE DEFAULT IS NOT ON IT *** ---------------------------------
console.log("\n2. *** THE DEFAULT IS NOT CONVERGED, AND THAT IS THIS GATE'S FINDING ***");
{
    // The empty channel, sampled as it settles. ONE solver, read at increasing step counts -- not N solvers,
    // so the sequence is a trajectory rather than N independent runs that happen to be ordered.
    const lbm = makeLBM({ nx: 72, ny: 35, tau: 0.6, force: [3e-5, 0] });
    const marks = [1000, 2000, 3500, 6000, 10000];
    const seen = [];
    let n = 0;
    for (const target of marks) {
        while (n < target) { lbm.step(); n++; }
        seen.push({ n: target, err: solidForceBalance(lbm).relError });
    }
    for (const s of seen) report("steps " + String(s.n).padStart(5), "balanceErr " + s.err.toExponential(4));

    ok("!! the imbalance falls MONOTONICALLY as the flow settles -- it is a convergence diagnostic",
        seen.every((s, i) => i === 0 || s.err < seen[i - 1].err),
        "the header calls balanceErr 'simultaneously is-the-force-right and is-this-reading-finished'. THIS " +
        "IS THE SECOND HALF, and it had never been asserted");

    ok("!! ...and it is heading for zero, not for a floor",
        seen[seen.length - 1].err < 0.1 * seen[0].err,
        `${seen[0].err.toExponential(3)} -> ${seen[seen.length - 1].err.toExponential(3)} over 1000 -> 10000 ` +
        "steps, better than tenfold. Measured further out (not asserted here, it costs 17 s): 1.918e-3 at " +
        "20000 and 4.539e-6 at 40000. THE IDENTITY IS EXACT AND THE SOLVER REACHES IT");

    ok("!! *** AND THE DEVICE DEFAULT SITS AT 2.8e-1, WHICH READS IN A LOG LIKE A 28% FORCE ERROR ***",
        balance.balanceErr > 0.1 && balance.balanceErr < 0.5,
        `balanceErr ${balance.balanceErr.toExponential(4)} at the default 3500 steps. IT IS AN UNSETTLED FLOW, ` +
        "NOT A WRONG FORCE, and nothing in the device said so. *** NOT FIXED HERE AND NAMED AS DEBT: `steps` " +
        "is CLAMPED AT 20000 by the bind's own validator so the converged reading is not reachable through " +
        "the device at all, and raising the default takes a round from 1.7 s to 17 s against the bind's own " +
        "'a device round should finish in seconds'. Making the identity converge at an affordable runtime is " +
        "a FIXTURE question -- domain size and tau, not steps -- and that is a different round. ***");

    ok("...and the cylinder closes the identity far faster, which is why the plant separates better there",
        drag.balanceErr < balance.balanceErr / 5,
        `drag ${drag.balanceErr.toExponential(4)} against balance ${balance.balanceErr.toExponential(4)} at the ` +
        "same 3500 steps -- more solid surface, so the momentum sink is reached sooner");
}

// ---- 3. *** THE MODE PLANT: THE BOUNCE-BACK INDEXING CONFUSION *** ------------------------------------------
console.log("\n3. *** THE PLANT -- READING WHERE A POPULATION IS GOING INSTEAD OF WHERE IT CAME FROM ***");
const planted = await buildFluid({ mode: "sourceconfusion" });
{
    ok("!! the plant is DECLARED in the shape the census adjudicates -- plantMode / plantFlips / plantKind",
        fluidDevice.plantMode === "sourceconfusion" && fluidDevice.plantFlips === "balanceErr" &&
        fluidDevice.plantKind === "reader" && fluidDevice.modes.includes("sourceconfusion") &&
        fluidDevice.modes[0] === "balance",
        "modes " + JSON.stringify(fluidDevice.modes) + ' -- "balance" stays FIRST so the contract compares the ' +
        "plant against the mode that owns the identity, and the plant runs THAT GEOMETRY so the separation " +
        "belongs to the reader rather than to a second fixture");

    ok("!! *** ON A FLAT WALL THE CONFUSED READER MEASURES EXACTLY ZERO FORCE ***",
        planted.solidFx === 0 && balance.solidFx > 0,
        `solidFx ${balance.solidFx.toExponential(4)} -> ${planted.solidFx}. Not a small force -- ZERO, because ` +
        "the outgoing set is symmetric about a straight boundary and every contribution cancels. The channel " +
        "is being driven and the instrument reports that nothing is pushing back");

    ok("!! ...so the DECLARED observable reads EXACTLY 1: the maximum possible violation of the identity",
        planted.balanceErr === 1,
        `balanceErr ${balance.balanceErr.toExponential(4)} -> ${planted.balanceErr}. relError is ` +
        "|solid - applied| / |applied| and solid is zero, so the plant does not perturb the identity, it " +
        "DELETES one side of it");

    ok("!! the applied body force is UNTOUCHED, so the separation is the reader's and not the flow's",
        Math.abs(planted.appliedFx - balance.appliedFx) < 1e-12 * Math.abs(balance.appliedFx),
        `appliedFx ${balance.appliedFx.toExponential(6)} -> ${planted.appliedFx.toExponential(6)}. The plant is ` +
        "ONE CHARACTER in the force walk -- x + e_i where the shipped code has x - e_i -- and the same 432 " +
        "links are visited. A plant that moved both sides would be measuring nothing");

    ok("!! *** AND THE SEPARATION IS ONLY 3.6x DESPITE DRIVING THE MEASUREMENT TO ZERO ***",
        planted.balanceErr / balance.balanceErr < 5,
        `${(planted.balanceErr / balance.balanceErr).toFixed(2)}x, ENTIRELY BECAUSE THE HONEST ARM IS NOT ` +
        "CONVERGED (section 2). In the `drag` geometry the same defect separates 3.024e-2 -> 9.251e-1, 30.6x, " +
        "and cd 5.4773 -> 0.9748. *** THE PLANT IS AS STRONG AS A PLANT CAN BE AND THE BASELINE IS WEAK, AND " +
        "THOSE READ IDENTICALLY IN A PASS/FAIL LINE. Saying so is part of shipping the key. ***");

    ok("...and the validator LISTS the plant mode, so it cannot silently revert",
        fluidDefaults({ mode: "sourceconfusion" }).mode === "sourceconfusion" &&
        fluidDefaults({ mode: "nonsense-mode" }).mode === "balance",
        "v3806 lost a round to a validator written as a two-name test that reverted its plant in silence -- " +
        "both arms read an identical number and the plant fired at nothing");
}

// ---- 4. A PLANT THAT WAS TRIED AND IS INERT, RECORDED SO NOBODY SPENDS THE ROUND AGAIN ----------------------
console.log("\n4. THE CANDIDATE THAT DOES NOT WORK, AND WHY THAT IS A FACT ABOUT THE KEY");
{
    // solidForce skips links whose SOURCE is another solid node -- "internal links are not a fluid/solid
    // exchange", says the shipped comment. Dropping that guard is the obvious second plant. IT IS INERT.
    const lbm = makeLBM({ nx: 72, ny: 35, tau: 0.6, force: [3e-5, 0] });
    for (let t = 0; t < 3500; t++) lbm.step();
    const walk = (guard) => {
        const { nx, ny, solid, f, Q, E, idx } = lbm;
        let fx = 0, links = 0;
        for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            const k = idx(x, y);
            if (!solid[k]) continue;
            for (let i = 1; i < Q; i++) {
                const sx = (x - E[i][0] + nx) % nx, sy = y - E[i][1];
                if (sy < 0 || sy >= ny) continue;
                if (guard && solid[idx(sx, sy)]) continue;
                fx += 2 * E[i][0] * f[k * Q + i]; links++;
            }
        }
        return { fx, links };
    };
    const kept = walk(true), dropped = walk(false);
    const ap = appliedBodyForce(lbm);
    report("with the guard", `fx ${kept.fx.toExponential(10)} over ${kept.links} links`);
    report("without it", `fx ${dropped.fx.toExponential(10)} over ${dropped.links} links`);

    ok("!! dropping the internal-link guard changes the LINK COUNT and NOT THE FORCE",
        dropped.links > 1.5 * kept.links && Math.abs(dropped.fx - kept.fx) < 1e-9 * Math.abs(kept.fx),
        `${kept.links} links become ${dropped.links} and fx moves by ` +
        `${(Math.abs(dropped.fx - kept.fx) / Math.abs(kept.fx)).toExponential(2)} relative -- nothing. ` +
        "Internal solid-solid links cancel pairwise. *** THE GUARD IS CORRECT AND IT IS ALSO UNTESTABLE BY " +
        "THIS IDENTITY, WHICH IS A FACT ABOUT THE KEY AND NOT ABOUT THE GUARD. A plant declared here would " +
        "have been DECLARED BUT DEAD, and finding that out cost a build rather than a round. ***");

    ok("...and the identity's two sides are both real numbers, so the comparison above has content",
        Math.abs(ap.fx) > 1e-6 && Math.abs(kept.fx) > 1e-6,
        `applied ${ap.fx.toExponential(4)} against solid ${kept.fx.toExponential(4)} -- a comparison of two ` +
        "zeros is the emptiest pass available and it looks like the strongest result");
}

report("WHAT THIS DOES NOT CLAIM",
    "That simulation/lbm/windTunnel.mjs is verified. The identity grades the DRAG-AXIS force sum on a " +
    "periodic channel; coefficients()'s normalisation, sampleVelocity's bilinear interpolation, streamline " +
    "integration and every LIFT claim are UNGRADED, and the plant tests ONE of them. ONE PLANT TESTS ONE CLAIM.");

console.log("\nfluidBind-selfcheck: " + (fails ? fails + " FAILED" : "all " + "checks pass"));
process.exit(fails ? 1 : 0);
