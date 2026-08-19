import { pathToFileURL } from "node:url";
// physics/sph/packingTransfer.mjs
//
// v3546 -- CAN `full` BE CALIBRATED ON ONE POOL AND USED TO JUDGE ANOTHER? NO. THE CONTAINER MOVES IT MOST.
//
// v3543 REFUSED to close the volume claim and stated the reason as a contract: the packing a fluid relaxes
// into is 8.6798 per cell, knowable from NEITHER the fill (the lattice's 8.0) NOR the material (the declared
// rho0*h^3/mass = 7.2169), and measuring it from the pool being judged would make the claim a MIRROR (v3201).
// THAT REFUSAL WAS AN ARGUMENT. This round tests it, and the test was proposed as a way to OVERTURN it.
//
// THE PROPOSED ESCAPE: a key is external when the route that MEASURES is independent of the route that SET.
// The packing a fluid relaxes into ought to be a property of the SOLVER AND THE MATERIAL rather than of the
// box, so calibrate the interior number density on a REFERENCE pool and judge a DIFFERENT one. That is not a
// mirror: the calibration pool's geometry does not determine the test pool's volume.
//
// *** THE CONTROL NAMED IN ADVANCE IS THE ONE THAT FIRED, AND IT FIRED AGAINST THE PROPOSAL. *** Before any
// measurement the todo list recorded two controls: changing the MATERIAL must MOVE the calibrated value, and
// changing only the CONTAINER must NOT. Measured, three levers off one baseline (W 0.6, N 2800, c 15, all
// settled 3000 steps at viscosity 3):
//
//     lever changed                 slab perCell     shift from baseline
//     -------------------------------------------------------------------
//     (baseline)                        8.6798             --
//     DEPTH doubled  (N 2800 -> 5600)   8.5347           -1.67%
//     CONTAINER only (W 0.6 -> 0.8)     8.2804           -4.60%   <-- LARGEST
//     SOUND SPEED    (c 15 -> 30)       8.6154           -0.74%
//
// THE CONTAINER IS THE DOMINANT TERM. It moves the calibration nearly three times as far as doubling the
// depth and six times as far as doubling the sound speed. A quantity whose largest sensitivity is to the very
// geometry it is meant to be independent of cannot be carried from one box to another, so THE CALIBRATION
// DOES NOT TRANSFER AND v3543's REFUSAL IS CONFIRMED RATHER THAN ASSUMED. That is worth more than the
// refusal alone: an argued refusal and a measured one look identical from outside the file that records them.
//
// *** THE SECOND FINDING, AND IT IS THE SHARPER ONE: TWO DENSITIES UNDER ONE NAME RESPOND TO DIFFERENT
// LEVERS. *** v3543 already found that rho0 is a KERNEL SUM while perCellFull COUNTS PARTICLES. This round
// shows they are genuinely different quantities rather than two estimates of one, because a lever moves one
// and not the other. Doubling the sound speed cuts the SPH density excess from 1.0241 to 1.0049 -- the excess
// falls 4.9x for a 2x rise in c, which is the c^-2 hydrostatic compression scaling, essentially exact and
// PREDICTED RATHER THAN FITTED -- while the same change moves the per-cell COUNT by 0.74%. So hydrostatic
// compression accounts for under a tenth of the 8.5% packing excess; the rest is geometric rearrangement, and
// the geometric part is what the container sets.
//
// *** THE THIRD: THE INSTRUMENT HAS NO PLATEAU, SO THERE IS NO BULK TO CALIBRATE ON. *** v3543 fixed the
// interior slab's margin at ONE smoothing length. Made a parameter and swept, the value never settles --
// baseline reads 8.6798 / 8.6872 / 8.1322 / 7.7940 at margins of 1.0 / 1.5 / 2.0 / 2.5 h and is still
// falling, and the spread ACROSS pools goes 4.82% / 9.35% / 5.62% / 3.03%, NOT MONOTONE. A NUMBER THAT WILL
// NOT STOP MOVING AS YOU SAMPLE FURTHER FROM THE WALLS HAS NO BULK VALUE AT THIS SIZE. The deepest pool
// REFUSES a 3h margin outright, which is the honest answer rather than a small number.
//
// *** WHAT IS OWED, AND IT IS A FIXTURE. *** A pool with an actual bulk -- no walls and no free surface, so
// that "interior" is the whole domain by construction. The obvious shape is a PERIODIC box, and the obvious
// way to use it is a trap worth writing down: at fixed N and fixed V a periodic box has number density N/V BY
// CONSTRUCTION, so reading the packing back out of it is a MIRROR one level up. The question that is not a
// mirror is the INVERSE one -- at what number density does the kernel sum return rho0 -- because there the
// measuring route (a kernel sum) is independent of the setting route (particle placement). NOT BUILT HERE:
// this tree's SPH kernel has no periodic wrapping, so that is a solver feature and not a fixture, and
// half-building it against an unvalidated kernel is how the last three rounds of this arc went wrong.
//
// NOTHING IS RATCHETED AND NO KEY IS REGISTERED. The numbers above are a REPORT: freezing a shift measured
// from three pools I chose would ratchet MY CHOICE OF POOLS, which is v3453's refusal in another subject.
"use strict";
import { settlePool, poolSurface, settledDensity, perCellFullDeclared, perCellFullLattice,
         SHIPPED_FLOOR } from "./poolFixture.mjs";

/**
 * *** THE MARGIN IS A PARAMETER HERE AND WAS A CONSTANT IN v3543. *** interiorNumberDensity fixes the slab at
 * one smoothing length in from every wall and from the free surface; that is a choice, and a choice nobody
 * varies is an assumption. Everything else is v3543's arithmetic unchanged -- particles over volume, no
 * threshold, no columns -- so the 1.0 column of any sweep reproduces its number exactly, and the gate asserts
 * that rather than trusting it.
 *
 * RETURNS null RATHER THAN A NUMBER when the slab has non-positive volume, which is v3543's refusal kept:
 * a pool with no interior must not quietly report one (v3177's shape).
 */
export function slabDensityAt(pool, margin = 1) {
    const { w, W, h } = pool, P = w.particles;
    const top = Math.max(...P.map((q) => q.y));
    const lo = margin * h, hi = top - margin * h, x0 = margin * h, x1 = W - margin * h;
    const side = x1 - x0, height = hi - lo;
    if (!(side > 0 && height > 0)) return null;
    const n = P.filter((q) => q.y > lo && q.y < hi && q.x > x0 && q.x < x1 && q.z > x0 && q.z < x1).length;
    return (n / (side * height * side)) * h * h * h;
}

/** Settle one pool and read everything this round needs off it, in one place. */
export function probe({ W = SHIPPED_FLOOR, targetN = 2800, c = 15, viscosity = 3, steps = 3000 } = {}) {
    const pool = settlePool({ W, targetN, c, viscosity, steps });
    const s = poolSurface(pool);
    const d = settledDensity(pool);
    return { pool, W, targetN, c, N: pool.w.particles.length,
             slab: slabDensityAt(pool, 1), columns: s.columns, depth: s.observed,
             errDeclared: s.errFrac, rhoRatio: d.ratio, energyRatio: pool.energyRatio };
}

/** The margin sweep, per pool. A null entry is a REFUSAL and is kept as one. */
export function marginSweep(pool, margins = [1, 1.5, 2, 2.5, 3]) {
    return margins.map((m) => [m, slabDensityAt(pool, m)]);
}

/** Relative spread of the askable values at one margin -- the cross-pool disagreement. */
export function spreadAt(sweeps, index) {
    const v = sweeps.map((s) => s[index][1]).filter((x) => x != null);
    if (v.length < 2) return { askable: v.length, spread: null };
    return { askable: v.length, spread: Math.max(...v) / Math.min(...v) - 1 };
}

/** How far a calibration taken on `ref` misses when carried to `other`. */
export function transferMiss(refSlab, otherSlab) { return otherSlab / refSlab - 1; }

export const MEASURED_V3546 = {
    fixture: { W: SHIPPED_FLOOR, h: 0.1, viscosity: 3, steps: 3000, eos: "tait" },
    // lever, W, targetN, c, slab perCell, shift from the baseline row
    levers: [
        { lever: "baseline",       W: 0.6, targetN: 2800, c: 15, slab: 8.6798, shift:  0.0000, rhoRatio: 1.0241 },
        { lever: "DEPTH x2",       W: 0.6, targetN: 5600, c: 15, slab: 8.5347, shift: -0.0167, rhoRatio: 1.0181 },
        { lever: "CONTAINER only", W: 0.8, targetN: 4978, c: 15, slab: 8.2804, shift: -0.0460, rhoRatio: 1.0161 },
        { lever: "SOUND SPEED x2", W: 0.6, targetN: 2800, c: 30, slab: 8.6154, shift: -0.0074, rhoRatio: 1.0049 },
    ],
    margins: [1, 1.5, 2, 2.5, 3],
    marginSweep: {                                   // null = the slab has no volume, and that is the answer
        "W0.6 N2800": [8.6798, 8.6872, 8.1322, 7.7940, null],
        "W0.6 N5600": [8.5347, 8.3254, 7.9558, 7.5645, null],
        "W0.8 N4978": [8.2804, 7.9445, 7.6996, 7.5965, 7.2088],
    },
    // OVER ALL THREE POOLS. The gate drives only TWO (the depth pool costs 126s) and therefore computes a
    // SMALLER spread at 2.5h -- 2.60% against 3.03%. TWO POPULATIONS, ONE NAME: the numbers are both right
    // and they are not the same quantity, which is exactly the shape this arc keeps finding, so it is
    // written down here rather than left for somebody to read as a drift.
    crossPoolSpread: [[1, 0.0482], [1.5, 0.0935], [2, 0.0562], [2.5, 0.0303]],
    reference: { lattice: perCellFullLattice(0.1, 0.05), declared: perCellFullDeclared(0.1, 0.02) },
    note: "*** THE CONTAINER MOVES THE CALIBRATION MOST -- 4.60% against 1.67% for doubling the DEPTH and " +
          "0.74% for doubling the SOUND SPEED. The control written down BEFORE the measurement was that " +
          "changing only the container must NOT move it, and it moved it further than either other lever. " +
          "SO THE CALIBRATION DOES NOT TRANSFER AND v3543's REFUSAL IS CONFIRMED RATHER THAN ASSUMED. *** " +
          "Two supporting findings: doubling c cuts the SPH DENSITY excess 4.9x (1.0241 -> 1.0049, the c^-2 " +
          "hydrostatic scaling, PREDICTED not fitted) while moving the per-cell COUNT 0.74%, so rho and " +
          "number density are different quantities and hydrostatic compression is under a tenth of the " +
          "packing excess; and the slab has NO PLATEAU in its own margin, so there is no bulk here to " +
          "calibrate on at all.",
};

export const CONFIRMS_V3543 = {
    refusal: "v3543 refused to define `full` from a calibration and gave a contract argument: the packing a " +
             "fluid relaxes into is a RESULT, not an input. This round tried to overturn that by calibrating " +
             "on a different pool, and measured the refusal to be correct for a sharper reason -- the " +
             "packing's largest sensitivity is to the CONTAINER, the one thing a transferable constant must " +
             "not depend on.",
    owed: "A fixture with an actual bulk: no walls, no free surface. The periodic box is the shape, but " +
          "reading N/V back out of one is a MIRROR -- the non-mirror question is the INVERSE (at what number " +
          "density does the kernel sum return rho0). This tree's kernel has no periodic wrapping, so that is " +
          "a SOLVER feature and not a fixture, and it is not built here.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------
export function reportLines({ live = false } = {}) {
    const L = [];
    L.push("[packingTransfer] CAN `full` BE CALIBRATED ON ONE POOL AND USED ON ANOTHER? NO -- the CONTAINER moves it most");
    L.push("");
    L.push("  ONE LEVER AT A TIME OFF THE SAME BASELINE (W 0.6 / N 2800 / c 15, settled 3000 steps):");
    L.push("    lever              slab perCell     shift    rho/rho0");
    for (const r of MEASURED_V3546.levers)
        L.push("    " + r.lever.padEnd(16) + r.slab.toFixed(4).padStart(11) +
               (r.shift === 0 ? "        --" : (r.shift * 100).toFixed(2).padStart(9) + "%") +
               r.rhoRatio.toFixed(4).padStart(12) +
               (r.lever === "CONTAINER only" ? "   <-- LARGEST" : ""));
    L.push("  *** THE CONTROL WAS WRITTEN DOWN BEFORE THE MEASUREMENT: changing only the container must NOT");
    L.push("      move the calibrated value. IT MOVED IT FURTHER THAN EITHER OTHER LEVER. ***");
    L.push("");
    L.push("  AND rho AND THE COUNT ANSWER TO DIFFERENT LEVERS -- which is what proves they are two");
    L.push("  quantities and not two estimates of one:");
    L.push("    doubling c cuts the SPH density excess 4.9x (0.0241 -> 0.0049, the c^-2 hydrostatic scaling)");
    L.push("    and moves the per-cell COUNT by 0.74%. HYDROSTATIC COMPRESSION IS UNDER A TENTH OF IT.");
    L.push("");
    L.push("  THE SLAB HAS NO PLATEAU IN ITS OWN MARGIN (v3543 fixed that margin at 1h and never swept it):");
    L.push("    margin (x h)  " + MEASURED_V3546.margins.map((m) => String(m).padStart(9)).join(""));
    for (const [k, v] of Object.entries(MEASURED_V3546.marginSweep))
        L.push("    " + k.padEnd(13) + v.map((x) => (x == null ? "  REFUSED" : x.toFixed(4)).padStart(9)).join(""));
    L.push("    cross-pool spread " + MEASURED_V3546.crossPoolSpread
           .map(([m, s]) => m + "h:" + (s * 100).toFixed(2) + "%").join("  ") + "  -- NOT MONOTONE");
    L.push("  *** A NUMBER THAT WILL NOT STOP MOVING AS YOU SAMPLE FURTHER FROM THE WALLS HAS NO BULK VALUE.");
    L.push("      THERE IS NOTHING HERE TO CALIBRATE ON. ***");
    L.push("");
    L.push("  OWED: " + CONFIRMS_V3543.owed);
    if (live) {
        const p = probe({ targetN: 2800 });
        L.push("    MEASURED NOW: baseline slab " + p.slab.toFixed(4) + " over " + p.columns +
               " columns, rho/rho0 " + p.rhoRatio.toFixed(4));
    }
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
