// physics/sph/poolFixture.mjs
//
// v3543 -- *** THE 24% GAP WAS NEVER QUANTISATION, AND EIGHT TIMES THE DEPTH MOVES IT BY NOTHING. ***
//
// v3542 closed by naming what was owed: "a fixture whose SETTLED depth is MANY CELLS -- more particles, or a
// smaller h against the same box", on the reading that levelness reads sd exactly zero and the volume claim
// is 24% short BECAUSE THE POOL IS ONLY 2.6 CELLS DEEP. v3540 had made the same attribution about its own
// 10.7% ("a KNOWN BIAS WITH A SIGN: the surface cell is counted whole while it is partly air"). *** BOTH
// ATTRIBUTIONS ARE REFUTED BY THE SAME MEASUREMENT. *** Same box, more particles:
//
//     N =  700   depth  2.69 cells   err 25.8%
//     N = 2800   depth 10.78 cells   err 25.8%
//     N = 5600   depth 21.55 cells   err 25.8%
//
// EIGHTFOLD DEPTH, BIT-IDENTICAL ERROR. A ratio that does not move under refinement is a DEFINITION ERROR,
// not a discretisation error -- v3492's rule (the give-away is the ratio failing to follow the order) in a
// new subject, and the third round running where a number this arc called quantisation was something else.
//
// ---- AND THE OTHER HALF OF v3542'S PRESCRIPTION IS WORSE THAN USELESS ---------------------------------------
//
// Narrowing the box looks equivalent to deepening the pool -- depth x columns is a CONSERVED BUDGET, fixed at
// N/perCellFull by the fluid's own volume, so a narrower floor must buy depth. IT BUYS NOTHING, AND THE
// APPARENT GAIN WAS AN ARTEFACT OF THE WALL.
//
// *** THE WALL CLAMP SETS a[k] = hi EXACTLY, AND Math.floor(W / h) IS A CELL INDEX OUTSIDE A BOX W/h CELLS
// WIDE. *** At W = 0.4, NINETY-EIGHT OF 686 PARTICLES sit at exactly x = 0.4 and land in phantom column 4.
// The column count reads 24 where the box has 16, `predicted = cells / columns` is therefore too SMALL, and
// the volume error is FLATTERED. Clamp the index to the box and every apparent gain evaporates:
//
//     W      raw cols/err/sd            clamped cols/err/sd        on a wall
//     0.6    36 / 25.8% / 0.000         36 / 25.8% / 0.000         36.0%
//     0.4    24 /  7.4% / 0.471         16 / 32.7% / 0.000         48.8%
//     0.3     9 / 43.4% / 0.000          9 / 43.4% / 0.000         59.9%
//     0.2     9 /  2.3% / 1.397          4 / 49.4% / 0.000         75.6%
//
// The 2.3% and the nonzero spread at W = 0.2 -- exactly the two things v3542's antidote asked for -- WERE
// ENTIRELY THE PHANTOM COLUMNS. Corrected, the error is MONOTONE IN THE WRONG DIRECTION, and the reason is in
// the last column: *** A NARROW TANK IS NOT A DEEPER POOL, IT IS A POOL THAT IS ALMOST ENTIRELY BOUNDARY
// LAYER. *** At W = 0.2 three quarters of the fluid is touching a wall.
//
// ---- WHAT THE 25.8% ACTUALLY IS, AND TWO WRONG ROUTES BEFORE THE RIGHT ONE ------------------------------------
//
// `perCellFull` counts PARTICLES IN A CELL and is derived from rho0. *** BUT rho0 IS A KERNEL SUM, NOT A
// NUMBER DENSITY *** -- 144.34 against the lattice's exact mass density of 160 -- so the two are different
// densities wearing one name, which is this tree's most-repeated shape, inside the definition of "full".
//
// *** MY FIRST TWO ATTEMPTS TO SIZE IT WERE BOTH INVALID AND ARE KEPT AS NAMED TRAPS. *** (1) The mean
// occupancy of qualifying cells reproduces the error to six decimals -- because it IS N/(columns * observed),
// the same number rearranged. A MIRROR, and the give-away was that it agreed too exactly. (2) The mean
// NEAREST-NEIGHBOUR spacing read a density ratio of 2.069: an EXTREME, equal to the pitch only on a perfect
// lattice and smaller in any disordered packing at the same density. THIRD EXTREME IN THIS ARC, after v3539's
// topmost particle and v3540's max-occupancy threshold.
//
// THE ROUTE THAT WORKS IS AN INTERIOR SLAB -- one smoothing length in from every wall and from the free
// surface, particles divided by volume, no threshold and no columns -- AND IT SPLITS THE GAP RATHER THAN
// EXPLAINING ALL OF IT:
//
//     declared  rho0 * h^3 / mass        7.2169      lattice  (h / spacing)^3   8.0000
//     slab      MEASURED interior       8.6798      => kernel under-read 0.90212, relaxation 1.0850
//
//     MIS-DEFINED CELL          1 - 7.2169/8.6798 = 16.9%
//     THE STATISTIC'S OWN BIAS  25.8% - 16.9%     =  8.9%   <- what v3540 and v3542 called quantisation
//
// *** SO THE QUANTISATION STORY WAS A THIRD OF THE TRUTH: not none of it, and not all of it. *** And the
// fluid is fine -- the settled pool's own SPH density is 144.57 against a rho0 of 144.34, 0.2% -- so without
// that control the whole finding would read as a compressed fluid rather than a mis-defined cell.
//
// *** AND AT THE SHIPPED PARTICLE COUNT THE SLAB HAS NEGATIVE VOLUME AND THE FUNCTION REFUSES. *** A two-cell
// pool has no interior. That is the real reason "more particles" was the right lever, and it is not the reason
// v3542 gave: NOT to shrink the error, which does not move, but to make the question askable at all.
//
// ---- THE CONSEQUENCE, WHICH IS NOT A FIX ----------------------------------------------------------------------
//
// freeSurface.mjs's contract is that THE CALLER KNOWS HOW FULL A CELL IS AND THE FUNCTION DOES NOT GET TO
// DECIDE (v3201's mirror rule: a key is external only when the route that measures is independent of the
// route that set it). v3540 supplied "full" from the LATTICE; v3542 replaced that with the MATERIAL to
// survive the fluid moving. *** BOTH ARE WRONG FOR A SETTLED POOL, AND FOR ONE REASON: THE PACKING A FLUID
// RELAXES INTO IS A RESULT, NOT AN INPUT. *** 9.7222 is not knowable from the fill or from rho0. Deriving it
// by counting would let the state define its own "full" and turn the volume claim into a mirror.
//
// SO THIS ROUND SHIPS THE MEASUREMENT AND REFUSES THE FIX. What is recorded is which of the two claims
// survives: the LEVEL claim needs no notion of full at all beyond a threshold that ranks columns consistently,
// while the VOLUME claim needs an absolute one and therefore cannot be closed this way.
"use strict";
import { createSphWorld } from "./sph.js";
import { LATTICE, packedDensity } from "./materialKnobs.mjs";

import { pathToFileURL } from "node:url";
export const G = 9.81, TALL_LID = 6.0;
export const SHIPPED_FLOOR = 0.6;

/**
 * v4007 -- THE SMOOTHING LENGTH, WHICH IS ALSO THE CELL SIZE, AS ONE DECLARATION.
 *
 * It was typed as a default parameter in three places -- settlePool, perCellFullDeclared and fullCellSplit --
 * and levelClaim-selfcheck was about to type a FOURTH copy in order to compute the grid's resolution floor.
 * Four spellings of one number is this tree's most repeated defect, and the fourth would have been the worst
 * kind: a constant restated inside the gate that grades the module, so the two could disagree and the gate
 * would report the disagreement as physics.
 *
 * The floor it buys: a tilt of theta across a box of width W raises the surface by tan(theta)*W end to end,
 * which is tan(theta)*W/CELL_H cells. BELOW ONE CELL A GRID-QUANTISED STATISTIC MUST READ ZERO. At the shipped
 * W of 0.6 that boundary sits between 5 degrees (0.53 cells) and 10 degrees (1.06 cells) -- which is exactly
 * where the measured tilt series stops reading zero, so the derivation predicts the data rather than excusing it.
 */
export const CELL_H = 0.1;

/**
 * A fixture parameterised by FLOOR WIDTH and PARTICLE COUNT, reusing materialKnobs' spacing so there is one
 * declaration of the lattice pitch. The fill is CENTRED, and its height is chosen to hold the requested count,
 * so a width sweep changes THE CONTAINER and leaves the solver untouched.
 */
export function makeFixture({ W = SHIPPED_FLOOR, targetN = 686, spacing = LATTICE.spacing, y0 = LATTICE.y0 } = {}) {
    const n = Math.max(1, Math.floor(W / spacing) - 1);        // one spacing of margin off each wall
    const ny = Math.max(1, Math.round(targetN / (n * n)));
    const off = (W - (n - 1) * spacing) / 2;
    return { W, n, ny, spacing, x0: off, z0: off, y0, N: n * n * ny };
}

/**
 * *** THE CELL INDEX IS CLAMPED TO THE BOX, AND THAT IS THE ROUND'S FIRST FINDING RATHER THAN A DETAIL. ***
 * The wall clamp sets the coordinate to exactly `hi`, and Math.floor(hi / h) is one PAST the last cell inside.
 * The bound is DERIVED from the box and the cell size -- nothing is chosen.
 */
export function cellIndex(v, W, h) { return Math.min(Math.floor(v / h), Math.ceil(W / h) - 1); }

export function perCellFullDeclared(h = CELL_H, mass = 0.02) { return packedDensity(h, mass) * h * h * h / mass; }
export function perCellFullLattice(h = 0.1, spacing = LATTICE.spacing) { return (h / spacing) ** 3; }

/** Settle a fixture and hand back the world plus the energy ratio (v3542's stability bound). */
export function settlePool({ W = SHIPPED_FLOOR, targetN = 686, viscosity = 3, steps = 3000,
                             h = CELL_H, mass = 0.02, c = 15, dt = 1 / 1000,
                             tiltDeg = 0, damColumns = null, eos = "tait", stiffness = 8 } = {}) {
    const F = makeFixture({ W, targetN, spacing: LATTICE.spacing });
    const rho0 = packedDensity(h, mass);
    // v3544 -- TWO OPTIONS ADDED AND THE DEFAULTS ARE UNCHANGED, so every v3543 row is bit-identical.
    // `damColumns` narrows the FILL without narrowing the BOX (the particle count is held by growing the
    // column), which is the only way to start a pool whose surface is UNEVEN. `tiltDeg` rotates gravity,
    // which gives a state that is SETTLED AND NOT LEVEL -- the load-bearing negative the level claim lacked.
    const th = tiltDeg * Math.PI / 180;
    const nx = damColumns != null ? damColumns : F.n;
    const ny = damColumns != null ? Math.round(F.ny * F.n / nx) : F.ny;
    // v3544 -- `eos` AND `stiffness` ADDED, DEFAULTS UNCHANGED. They were hardcoded here, so a caller asking
    // for a pressureless fluid got a tait fluid and the negative would have graded nothing. THAT IS v3541's
    // OWN FINDING -- three of four candidates could not reach the solver through makeColumn -- REPEATING IN
    // THE FILE THAT WROTE IT UP, one round later. The gate asserts they arrive by reading world.opts back.
    // v4121 -- *** REFERENCE_WALK IS NOT "ALWAYS BRUTE FORCE", AND A BLANKET VERSION OF IT SHIPPED A SECOND
    // REGRESSION IN THIS SAME ROUND. *** materialKnobs and stability build at a fixed 686 particles, so
    // pinning them to brute force is unambiguous -- 686 sat under BOTH the old crossover (1000) and could sit
    // over the new one (128), so blanket-false correctly restores what their keys were cut on. This file is
    // different: poolFixture-selfcheck's own "eightfold depth" section calls settlePool at targetN 2800 --
    // ABOVE the old crossover of 1000 -- so in the SHIPPED tree that call was ALREADY running on the grid.
    // A blanket useGrid:false forced it onto brute force instead, which is not "the walk its keys were cut
    // on", it is a DIFFERENT walk, and poolFixture-selfcheck went red for exactly that reason -- caught by
    // testing against the untouched tree the same way materialKnobs was, not assumed fixed because the fix
    // looked like the last one.
    //
    // So the reference is reproduced exactly rather than approximated: the OLD crossover (1000) is baked in
    // here as OLD_CROSSOVER, computed against the REAL particle count (nx*ny*F.n) before the world exists,
    // which is what gridWanted() would have decided in the shipped tree regardless of what GRID_CROSSOVER in
    // sph.js is set to today. levelClaim-selfcheck already passed under blanket-false because none of its
    // calls happen to cross 1000; this formula is a superset of that correctness, not a narrower one.
    const OLD_CROSSOVER = 1000;
    const wo = { h, mass, restDensity: rho0, stiffness, viscosity, useGrid: (nx * ny * F.n) >= OLD_CROSSOVER,
                 gravity: [G * Math.sin(th), -G * Math.cos(th), 0], eos, gamma: 7 };
    if (eos === "tait") wo.soundSpeed = c;
    const w = createSphWorld(wo);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < F.n; k++)
        w.addParticle([F.x0 + i * F.spacing, F.y0 + j * F.spacing, F.z0 + k * F.spacing]);
    const E = () => w.particles.reduce((s, p) => s + 0.5 * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) + G * p.y, 0) / w.particles.length;
    const e0 = E();
    for (let t = 0; t < steps; t++) w.step(dt, [0, 0, 0, W, TALL_LID, W]);
    const finite = w.particles.every((p) => Number.isFinite(p.y));
    return { F, w, rho0, h, mass, W, tiltDeg, damColumns, finite, energyRatio: finite ? E() / e0 : Infinity };
}

/** The surface statistic, with `clamped` a PARAMETER so the phantom columns can be measured rather than described. */
export function poolSurface(pool, { clamped = true, frac = 0.5, full = null } = {}) {
    const { w, W, h } = pool, P = w.particles;
    const FULL = full != null ? full : perCellFullDeclared(h, pool.mass);
    const ci = (v) => (clamped ? cellIndex(v, W, h) : Math.floor(v / h));
    const cnt = new Map();
    for (const p of P) {
        const k = ci(p.x) + "," + Math.floor(p.y / h) + "," + ci(p.z);
        cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    const top = new Map(), occ = [];
    for (const [k, v] of cnt) {
        if (v < frac * FULL) continue;
        occ.push(v);
        const [cx, cy, cz] = k.split(",").map(Number), col = cx + "," + cz;
        if (!top.has(col) || cy > top.get(col)) top.set(col, cy);
    }
    const ys = [...top.values()];
    const mean = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
    const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, ys.length));
    const predicted = (P.length / FULL) / Math.max(1, top.size);
    const observed = mean + 1;
    return { columns: top.size, boxColumns: Math.ceil(W / h) ** 2, sd, observed, predicted,
             errFrac: Math.abs(observed - predicted) / predicted,
             meanOccupancy: occ.reduce((a, b) => a + b, 0) / Math.max(1, occ.length),
             // *** onSideWallFrac EXCLUDES THE FLOOR ON PURPOSE. My first version counted p.y === 0 with the
             // four side walls, and the floor is there at EVERY width -- so the narrowing claim came out
             // 56.0% -> 57.1% (nothing) where the side walls alone read 36.0% -> 48.8%. A COUNT THAT MIXES
             // A CONSTANT INTO THE THING THAT VARIES HIDES THE VARIATION, and it disagreed with the number
             // recorded in this very file: TWO DECLARATIONS OF ONE QUANTITY, in the round about that shape.
             onSideWallFrac: P.filter((p) => p.x === 0 || p.z === 0 || p.x === W || p.z === W).length / P.length,
             onFloorFrac: P.filter((p) => p.y === 0).length / P.length };
}

/** Mean SPH density of the settled pool. THE CONTROL: if this sits on rho0, the fluid is not the problem. */
export function settledDensity(pool) {
    pool.w.computeDensity();
    const r = pool.w.particles.map((p) => p.rho);
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    return { mean, rho0: pool.rho0, ratio: mean / pool.rho0 };
}

/**
 * *** AN INTERIOR NUMBER DENSITY THAT IS NEITHER A MIRROR NOR AN EXTREME, AND IT TOOK TWO WRONG ROUTES TO GET
 * HERE. *** Count particles in a slab one smoothing length in from every wall AND from the free surface, and
 * divide by that slab's volume. No threshold, no columns, no nearest neighbour: a different region and a
 * different arithmetic from the surface statistic.
 *
 * IT REFUSES RATHER THAN RETURNING A NUMBER when the pool is too shallow to have an interior -- at the shipped
 * particle count the slab's volume is NEGATIVE (the pool is two cells deep, so top - h sits below h) and a
 * route that quietly returned 0 there would report an infinite error about a fixture that cannot be asked.
 */
export function interiorNumberDensity(pool) {
    const { w, W, h } = pool, P = w.particles;
    const top = Math.max(...P.map((q) => q.y));
    const lo = h, hi = top - h, x0 = h, x1 = W - h;
    const side = x1 - x0, height = hi - lo;
    if (!(side > 0 && height > 0)) {
        return { askable: false, why: "the pool has no interior: a slab one smoothing length in from every " +
                 "wall and from the free surface has non-positive volume. THE FIXTURE IS TOO SHALLOW TO ASK." };
    }
    const inSlab = P.filter((q) => q.y > lo && q.y < hi && q.x > x0 && q.x < x1 && q.z > x0 && q.z < x1);
    const volume = side * height * side;
    return { askable: true, count: inSlab.length, volume, perCell: (inSlab.length / volume) * h * h * h };
}

/**
 * THE SPLIT. `declared` is what the surface statistic calls full; `slab` is what the fluid's interior actually
 * holds. The gap between them is a MIS-DEFINED CELL and is real; whatever the surface statistic reports BEYOND
 * that is the statistic's own bias -- which is what v3540 and v3542 both called quantisation, and it turns out
 * to be about a third of the total rather than all of it.
 */
export function fullCellSplit({ h = CELL_H, mass = 0.02, spacing = LATTICE.spacing, slabPerCell, surfaceErrFrac } = {}) {
    const declared = perCellFullDeclared(h, mass), lattice = perCellFullLattice(h, spacing);
    const definitionErr = 1 - declared / slabPerCell;
    return {
        declared, lattice, slab: slabPerCell,
        kernelUnderRead: declared / lattice,          // rho0 is a KERNEL SUM: 144.34 against the lattice's exact 160
        relaxation: slabPerCell / lattice,            // and the settled packing is modestly denser than simple cubic
        definitionErr,                                // the part that is a mis-defined cell
        statisticErr: surfaceErrFrac - definitionErr, // and the part that is the surface statistic's own bias
        // ASSERTED, NOT ASSUMED: the two factors must reproduce declared/slab exactly.
        productCheck: (declared / lattice) * (lattice / slabPerCell),
    };
}

/**
 * *** THE TWO ROUTES THAT DID NOT WORK, KEPT BECAUSE EACH IS A NAMED TRAP AND THE NEXT READER WILL REACH FOR
 * ONE OF THEM. *** meanOccupancy from the surface statistic is N / (columns * observed) ALGEBRAICALLY, so
 * "predicting" the error from it reproduces the error to six decimals and confirms nothing -- A MIRROR, and it
 * agreed so exactly that the agreement is what gave it away. And the MEAN NEAREST-NEIGHBOUR SPACING is an
 * EXTREME: on a perfect cubic lattice it equals the pitch, but in a disordered packing at the SAME number
 * density it is the minimum over a dozen neighbours and therefore smaller, so (d0/dnn)^3 read 2.069 against
 * the truth. THIRD EXTREME IN THIS ARC, after v3539's topmost particle and v3540's max-occupancy threshold.
 */
export const REFUTED_ROUTES = {
    meanOccupancy: "IDENTICAL to N/(columns*observed) to six decimals -- a mirror, not a check (v3201's rule).",
    nearestNeighbour: "AN EXTREME, AND IT OVER-READS AT EVERY FIXTURE: 1.126 against the slab's 1.085 on the " +
                      "SAME deep pool, and 2.069 on the shallow one. NN spacing equals the pitch only on a " +
                      "perfect lattice and is the minimum over a dozen neighbours in any disordered packing at " +
                      "the same density. *** MY FIRST WRITE-UP COMPARED THE SHALLOW 2.069 AGAINST THE DEEP " +
                      "1.085 -- TWO FIXTURES IN ONE COMPARISON, which is why the gate drives both numbers off " +
                      "ONE pool. ***",
};

// ---- THE REGISTER. RECORDED; THE GATE RE-DERIVES. -------------------------------------------------------------
export const MEASURED_V3543 = {
    viscosity: 3, steps: 3000, c: 15, dt: 1 / 1000, lid: TALL_LID,
    depthSweepSameBox: [[700, 2.69, 25.8], [2800, 10.78, 25.8], [5600, 21.55, 25.8]],   // N, predicted cells, err%
    widthSweepRaw: [[0.6, 36, 25.8, 0.000], [0.4, 24, 7.4, 0.471], [0.3, 9, 43.4, 0.000], [0.2, 9, 2.3, 1.397]],
    widthSweepClamped: [[0.6, 36, 25.8, 0.000], [0.4, 16, 32.7, 0.000], [0.3, 9, 43.4, 0.000], [0.2, 4, 49.4, 0.000]],
    onSideWallFrac: [[0.6, 0.360], [0.4, 0.488], [0.3, 0.599], [0.2, 0.756]],   // SIDE walls only; the floor is there at every width
    phantomAt0p4: { particlesExactlyAtWall: 98, of: 686, phantomIndex: 4, boxCellsWide: 4 },
    full: { declared: 7.2169, lattice: 8.0, slabPerCell: 8.6798, kernelUnderRead: 0.90212,
            relaxation: 1.0850, definitionErr: 0.1685, statisticErr: 0.089 },
    slabAtShippedN: { askable: false, why: "the pool is two cells deep and has no interior" },
    settledDensityRatio: 1.0016,
    note: "*** EIGHTFOLD DEPTH, BIT-IDENTICAL 25.8% ERROR, SO THE GAP IS NOT DISCRETISATION. AND IT IS NOT " +
          "ALL DEFINITION EITHER: the interior slab splits it 16.9% MIS-DEFINED CELL against ~8.9% THE " +
          "SURFACE STATISTIC'S OWN BIAS -- so v3540's and v3542's quantisation story was A THIRD of the " +
          "truth rather than none of it or all of it. The definition half is that rho0 is a KERNEL SUM " +
          "(144.34 against the lattice's exact 160) while perCellFull COUNTS PARTICLES: two densities under " +
          "one name. The fluid itself sits on rest density to 0.2%, which is the control. AND THE SHIPPED " +
          "FIXTURE CANNOT BE ASKED AT ALL -- it has no interior -- which is the real reason more particles " +
          "was the right lever: not to shrink the error but to make the question askable.",
};

export const REFUSED_FIX = {
    perCellFull:
        "*** NOT FIXED, AND THE REASON IS THE CONTRACT RATHER THAN THE ARITHMETIC. *** The interior slab " +
        "holds 8.6798 particles per cell and that is knowable from NEITHER the fill (8.0) NOR the material " +
        "(7.2169), because THE PACKING A FLUID RELAXES INTO IS A RESULT AND NOT AN INPUT. Measuring it from " +
        "the pool being judged would let the state define its own 'full' -- v3201's rule, " +
        "and the very thing freeSurface's argument-not-inference design exists to prevent. v3540 took it from " +
        "the LATTICE and v3542 from the MATERIAL; both are caller-side and both are wrong by the relaxation. " +
        "THE LEVEL CLAIM SURVIVES because it needs only a threshold that ranks columns consistently; THE " +
        "VOLUME CLAIM NEEDS AN ABSOLUTE ONE and cannot be closed this way.",
};

// ---- FRONT DOOR -----------------------------------------------------------------------------------------------
export function reportLines({ live = true } = {}) {
    const L = [];
    L.push("[poolFixture] WHAT v3542 SAID WAS OWED, MEASURED -- and neither half of it works");
    L.push("");
    L.push("  SAME BOX, MORE PARTICLES (the depth lever):");
    L.push("      N     predicted depth (cells)   volume err");
    for (const [n, d, e] of MEASURED_V3543.depthSweepSameBox)
        L.push("    " + String(n).padStart(5) + String(d.toFixed(2)).padStart(18) + " " + (e + "%").padStart(15));
    L.push("  *** EIGHTFOLD DEPTH, BIT-IDENTICAL ERROR. A ratio that will not follow a refinement is a");
    L.push("      DEFINITION error and not a discretisation one. ***");
    L.push("");
    L.push("  NARROWER BOX (the other lever), raw against cell-index CLAMPED to the box:");
    L.push("      W     raw cols/err/sd          clamped cols/err/sd       on a wall");
    for (let i = 0; i < MEASURED_V3543.widthSweepRaw.length; i++) {
        const r = MEASURED_V3543.widthSweepRaw[i], c = MEASURED_V3543.widthSweepClamped[i];
        L.push("    " + String(r[0]).padEnd(6) + (r[1] + " / " + r[2] + "% / " + r[3].toFixed(3)).padEnd(25) +
               (c[1] + " / " + c[2] + "% / " + c[3].toFixed(3)).padEnd(26) +
               (MEASURED_V3543.onSideWallFrac[i][1] * 100).toFixed(1) + "%");
    }
    L.push("  *** THE WALL CLAMP SETS THE COORDINATE TO EXACTLY `hi` AND Math.floor(W/h) IS A CELL OUTSIDE THE");
    L.push("      BOX: " + MEASURED_V3543.phantomAt0p4.particlesExactlyAtWall + " of " +
           MEASURED_V3543.phantomAt0p4.of + " particles at W = 0.4 land in phantom column " +
           MEASURED_V3543.phantomAt0p4.phantomIndex + " of a box " + MEASURED_V3543.phantomAt0p4.boxCellsWide +
           " cells wide. EVERY APPARENT GAIN WAS THAT. ***");
    L.push("      Corrected, the error is MONOTONE IN THE WRONG DIRECTION -- a narrow tank is not a deeper");
    L.push("      pool, it is a pool that is almost entirely boundary layer.");
    L.push("");
    const d = MEASURED_V3543.full;
    L.push("  WHAT THE 25.8% IS -- SPLIT BY AN INTERIOR SLAB, NOT EXPLAINED AWAY BY ONE CAUSE:");
    L.push("    declared rho0*h^3/mass " + d.declared.toFixed(4) + "   lattice (h/spacing)^3 " + d.lattice.toFixed(4) +
           "   interior slab MEASURED " + d.slabPerCell.toFixed(4));
    L.push("    kernel under-read " + d.kernelUnderRead.toFixed(5) + " (rho0 IS A KERNEL SUM, not a number density)" +
           "   relaxation " + d.relaxation.toFixed(4));
    L.push("    MIS-DEFINED CELL " + (d.definitionErr * 100).toFixed(1) + "%   +   THE STATISTIC'S OWN BIAS " +
           (d.statisticErr * 100).toFixed(1) + "%   =   " + (MEASURED_V3543.depthSweepSameBox[0][2]) + "%");
    L.push("    *** SO v3540's AND v3542's QUANTISATION STORY WAS A THIRD OF THE TRUTH -- not none of it and");
    L.push("        not all of it. The settled fluid sits on rest density to " +
           ((MEASURED_V3543.settledDensityRatio - 1) * 100).toFixed(1) + "%, which is the control that stops");
    L.push("        this reading as a compressed fluid. ***");
    L.push("    TWO ROUTES REFUTED FIRST: " + REFUTED_ROUTES.meanOccupancy);
    L.push("                              " + REFUTED_ROUTES.nearestNeighbour.slice(0, 110) + "...");
    if (live) {
        const p2 = settlePool({ W: SHIPPED_FLOOR, targetN: 686, steps: 1200 });
        const nd = interiorNumberDensity(p2);
        L.push("    MEASURED NOW at the SHIPPED particle count: " +
               (nd.askable ? "slab " + nd.perCell.toFixed(4) : "REFUSED -- " + nd.why));
    }
    L.push("");
    L.push("  NOT FIXED: " + REFUSED_FIX.perCellFull.slice(0, 190) + "...");
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { for (const l of reportLines()) console.log(l); process.exit(0); }
