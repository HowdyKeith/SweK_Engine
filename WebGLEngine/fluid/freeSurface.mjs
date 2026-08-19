// fluid/freeSurface.mjs
//
// v3540 -- WHERE THE LIQUID ENDS, WHICH NOTHING IN THIS TREE HAD EVER ASKED.
//
// flip2d-selfcheck keys free-fall at exactly g, particle conservation across 200 steps, divergence falling with
// iteration count, and the PIC/FLIP blend settling differently. Every SPH key is about the BULK: kernels
// integrate to one, momentum conserved, density recovered, hydrostatic pressure. *** NOT ONE OF THEM ASKS
// WHERE THE LIQUID ENDS, AND THAT IS WHERE THE REALISM LIVES. ***
//
// *** THE SURFACE IS DEFINED BY DENSITY, NOT BY AN EXTREME PARTICLE, AND v3539 IS WHY. *** Measuring it as the
// topmost particle per column gave a roughness of 0.18 that PLATEAUED BY 300 STEPS and never improved through
// 3000 -- which reads as "the surface never levels" and is nothing of the sort: an extreme statistic is
// dominated by where one particle happens to sit, so that number is PARTICLE DISCRETENESS AND ANY REAL
// WAVINESS MIXED TOGETHER, WITH NO WAY TO SEPARATE THEM. A key built on it would have certified noise, which
// is v3534's lesson one subject along.
//
// THREE THINGS I GOT WRONG BEFORE THIS FILE EXISTED, ALL THE SAME KIND:
//   1. thresholding against max(occupancy) -- AN EXTREME AGAIN, one cell setting the scale for every column;
//   2. deriving particles-per-cell as 24 from a fill I had not read;
//   3. and the cause of (2): fillBlock is (x0, y0, x1, y1, perCell), NOT (x0, x1, y0, y1). AN ASSUMED
//      SIGNATURE, the ninth this project has counted.
// v3411's rule fired on the third: THREE GUESSES IS THE SIGNAL THAT THE INSTRUMENT IS MISSING, NOT THAT THE
// NEXT GUESS WILL BE BETTER. So the parameters were MEASURED -- h = 1, perCell = 2 giving 4 particles per
// cell, 336 cells filled, 343 after settling -- and this file takes the fill density AS AN ARGUMENT rather
// than inferring it from the state it is judging.
//
// THE TWO CLAIMS ARE CLOSED FORMS AND NEED NO EXTERNAL TABLE:
//   LEVEL  -- a settled liquid under gravity has a HORIZONTAL free surface. The claim is that the spread of
//             surface heights across columns FALLS as the fluid settles. A resting liquid whose surface stays
//             sloped is not resting.
//   VOLUME -- the settled height follows from the fluid's own volume: h = V / width. Nothing is measured
//             against a remembered number; the target is computed from the particles that are there.
"use strict";

/** Cell occupancy counts, keyed "cx,cy". THE GRID IS THE SOLVER'S OWN (h), never a grid chosen here. */
export function occupancy(px, py, h) {
    const c = new Map();
    for (let i = 0; i < px.length; i++) {
        const k = Math.floor(px[i] / h) + "," + Math.floor(py[i] / h);
        c.set(k, (c.get(k) || 0) + 1);
    }
    return c;
}

/**
 * The free surface: for each column, the highest cell holding at least `frac` of a FULL cell.
 *
 * `perCellFull` IS AN ARGUMENT AND NOT INFERRED. Deriving it from the state being judged would let a collapsed
 * or exploded fluid redefine what "full" means and then pass -- a measurement grading itself, which is the
 * mirror defect v3201 named (a key is external only when the route that measures is independent of the route
 * that set it). The caller knows how it filled the block; this function does not get to decide.
 *
 * *** THE SURFACE IS THE MAXIMUM CELL INDEX, AND MY FIRST VERSION TOOK THE MINIMUM. *** I wrote "y grows
 * downward in this solver" into the header and it is FALSE: the fill starts at y 32..36 and settles to mean
 * cell 1.0, so GRAVITY DECREASES y AND THE FLOOR IS AT LOW y. Taking the minimum reported THE BOTTOM OF THE
 * FLUID -- which sits on the container floor and is therefore FLAT BY CONSTRUCTION, giving sd = 0.0000 at
 * every step. *** A KEY THAT READ ZERO SPREAD AND CALLED THE SURFACE PERFECTLY LEVEL WOULD HAVE BEEN MEASURING
 * THE CONTAINER. *** A DIRECTION IS AN ASSUMPTION TOO, and this one was written down as fact before it was
 * checked -- the same shape as the eight assumed signatures, in a coordinate convention.
 */
export function surfaceCells(px, py, h, perCellFull, frac = 0.5) {
    if (!(perCellFull > 0)) throw new Error("perCellFull must be positive -- it is the caller's fill density, not a guess");
    const cnt = occupancy(px, py, h);
    const top = new Map();
    for (const [k, v] of cnt) {
        if (v < frac * perCellFull) continue;
        const i = k.indexOf(","), cx = +k.slice(0, i), cy = +k.slice(i + 1);
        if (!top.has(cx) || cy > top.get(cx)) top.set(cx, cy);   // MAX: gravity decreases y here
    }
    return [...top.entries()].sort((a, b) => a[0] - b[0]).map(([cx, cy]) => ({ cx, cy }));
}

/** Spread of the surface about its own mean. THE LEVEL CLAIM IS THAT THIS FALLS AS THE FLUID SETTLES. */
export function levelness(surface) {
    if (surface.length < 2) return { columns: surface.length, mean: NaN, sd: Infinity };
    const ys = surface.map((s) => s.cy);
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    const sd = Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
    return { columns: ys.length, mean, sd, min: Math.min(...ys), max: Math.max(...ys) };
}

/**
 * Height predicted by the fluid's OWN volume, against the height observed.
 *
 * THE TARGET IS COMPUTED FROM THE PARTICLES PRESENT, so this cannot drift out of step with a fill that
 * changed -- and it is a genuine second route: `predicted` never looks at the surface, `observed` never counts
 * particles.
 */
export function volumeHeight({ px, py, h, perCellFull, floorCell, surface }) {
    const cells = px.length / perCellFull;                 // cells' worth of fluid, from the particles alone
    const width = new Set(surface.map((s) => s.cx)).size;
    if (!(width > 0)) return { predicted: NaN, observed: NaN, errFrac: Infinity };
    const predicted = cells / width;                       // a column of this many cells, spread over the wetted width
    const observed = levelness(surface).mean - floorCell;   // depth from the floor up to the surface
    return { predicted, observed, width, errFrac: predicted > 0 ? Math.abs(observed - predicted) / predicted : Infinity };
}
