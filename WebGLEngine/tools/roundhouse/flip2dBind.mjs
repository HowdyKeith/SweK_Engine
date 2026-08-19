// tools/roundhouse/flip2dBind.mjs
//
// v3718 -- roundhouse device: the FLIP/PIC FLUID (fluid/flip2d.mjs). The curriculum has proposed GRADE
// fluid/flip2d.mjs for many rounds, and gradedCoverage's rule is exactly this file existing and importing it:
// "a module is graded if some tools/roundhouse/*Bind.mjs imports it -- a fact about the import graph".
//
// *** THE KEY HAD TO BE ONE THE SOLVER IS NEVER TOLD, AND THE OBVIOUS CANDIDATES ARE ALL MIRRORS. flip2d
// applies gravity as v += g*dt, so measuring free-fall acceleration back out is READING BACK THE CONSTANT WE
// PUT IN. It solves a Poisson equation for pressure, so asserting the divergence collapses afterwards is the
// solver's own stopping criterion -- SELF-CONSISTENCY IS NOT CORRECTNESS (v3714's lesson, learned on a device
// whose round trip could not see a wrong drag coefficient). Both were rejected before this one was built. ***
//
// WHAT IS GRADED HERE: HYDROSTATIC PRESSURE. Let a pool settle and the pressure field must satisfy
// p = rho * |g| * d, linear in depth d, with rho = 1 in the solver's units. That number is NOT applied
// anywhere -- gravity enters as a velocity increment and the pressure comes out of the projection, so
// recovering rho*g*d is the projection agreeing with hydrostatics it was never handed.
//
// MEASURED at 16x32, h=1, 400 steps: the column is linear to R^2 = 1.000000 with a slope of -9.810006 per
// cell against g*h = -9.81, and the top fluid cell reads 9.8100 = one cell of head. THE SLOPE IS THE CLAIM;
// the R^2 is what makes the slope meaningful, since a fit through a curve can have any slope you like.
//
// *** WHAT THIS DOES NOT CLAIM, STATED SO THE COVERAGE NUMBER IS NOT READ AS MORE THAN IT IS: grading the
// hydrostatic limit does not grade the SOLVER. Advection, the FLIP/PIC blend, the free surface, two-way
// coupling and every dynamic claim remain UNGRADED -- a fluid at rest exercises the projection and the
// boundary conditions and nothing else. A DEVICE THAT GRADES ONE LIMIT OF A MODULE MOVES gradedCoverage BY
// ONE MODULE, and the honest reading of that is "this module now has a key", not "this module is verified". ***
//
// *** HOW SENSITIVE THE KEY IS, MEASURED RATHER THAN ASSUMED. A synthetic solver defect -- halving the
// projection's right-hand-side scaling in the JACOBI branch, the one the default actually runs -- moves
// slopeErrFrac to 1.347e-3 against the claim's bar of 1e-3. IT FIRES AT 1.35x THE BAR, WHICH IS NARROW, AND
// SAYING SO IS PART OF SHIPPING THE KEY. The margin GROWS with run length (2.426e-3 at 1200 steps), so the
// defect is a PERSISTENT BIAS rather than a convergence artefact that washes out -- a longer run is the
// stronger test if this key ever needs to be leaned on harder. R^2 stays 0.999997 under that defect: THE
// LINEARITY IS NOT THE DISCRIMINATOR, the slope is. ***
//
// *** PLANTED AT v3806, AND IT IS THAT SEPARATE ROUND. The plant is an ORDER OF OPERATIONS: gravity applied
// AFTER the projection instead of before, so THE PROJECTION NEVER SEES IT and no hydrostatic gradient can
// develop. slopeErrFrac 6.584e-7 -> 1.598e-3, a 2427x separation. The same shape v3790 found in MPM's grid
// step -- THE SAME LINES IN A DIFFERENT ORDER, which is why reading the code does not catch it. ***
//
// *** AND PLANTING IT EXPOSED THAT THE CLAIM'S BAR IS LOOSE. The honest run sits at 6.584e-7 and the bar is
// 1e-3 -- FIFTEEN HUNDRED TIMES SLACKER THAN THE MEASUREMENT SUPPORTS -- which is why this plant clears it by
// only 1.6x despite a 2427x separation from the honest value. THE PLANT IS STRONG AND THE BAR IS WEAK, and
// those read identically in a pass/fail line. NOT TIGHTENED HERE: the bar is a SHIPPED CLAIM and moving it
// could redden configurations nobody in this sandbox can run. IT IS NAMED AS DEBT INSTEAD. ***

import { Flip2D, FLUID } from "../../fluid/flip2d.mjs";

export const FLIP2D_MODES = ["hydrostatic", "forceslate"];

export const FLIP2D_OBSERVABLES = [
    "slopePerCell", "slopeExact", "slopeErrFrac", "linearityR2",
    "topCellPressure", "topCellExact", "fluidCellsInColumn", "particles", "steps",
];

const DEF = { nx: 16, ny: 32, h: 1, gravity: -9.81, dt: 1 / 60, steps: 400, iters: 120, seed: 1 };

export function flip2dDefaults(hyp) {
    const h = { mode: "hydrostatic", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.nx = Math.min(48, Math.max(8, num(c.nx, DEF.nx) | 0));
    c.ny = Math.min(96, Math.max(16, num(c.ny, DEF.ny) | 0));
    c.h = Math.min(10, Math.max(0.05, num(c.h, DEF.h)));
    c.gravity = Math.min(-0.1, Math.max(-100, num(c.gravity, DEF.gravity)));   // downward, and never zero
    c.dt = Math.min(0.1, Math.max(1e-4, num(c.dt, DEF.dt)));
    c.steps = Math.min(4000, Math.max(50, num(c.steps, DEF.steps) | 0));
    c.iters = Math.min(400, Math.max(10, num(c.iters, DEF.iters) | 0));
    h.config = c;
    // *** v3806 -- THE VALIDATOR MUST LIST THE PLANT MODE. Written as `if (mode !== "hydrostatic") mode =
    // "hydrostatic"`, it SILENTLY REVERTED the plant and both arms read an IDENTICAL 6.584e-7 -- a plant that
    // fires at nothing because it never ran. Caught only because the two numbers matched to every digit.
    // REACHABLE AND FINDABLE ARE TWO DIFFERENT EDITS (v3766). ***
    if (!FLIP2D_MODES.includes(h.mode)) h.mode = "hydrostatic";
    if (!h.claim || !h.claim.observable) h.claim = { observable: "slopeErrFrac", max: 1e-3 };
    return h;
}

/** Deterministic jitter, so the same build gives the same pool on every machine. */
function lcg(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

export async function buildFlip2D(hyp, base = {}) {
    const h = flip2dDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config;

    const f = new Flip2D(c.nx, c.ny, { h: c.h, gravity: c.gravity, iters: c.iters,
                                       forcesAfterProject: h.mode === "forceslate" });
    f.fillBlock(c.h, c.h, (c.nx - 1) * c.h, Math.floor(c.ny / 2) * c.h, 2, lcg(c.seed));
    const particles = f.count();
    for (let s = 0; s < c.steps; s++) await f.step(c.dt);

    // Read the pressure straight down the middle column, over FLUID-marked cells only: an AIR cell has no
    // hydrostatic claim on it, and a SOLID one is the wall.
    const col = Math.floor(c.nx / 2), js = [], ps = [];
    for (let j = 0; j < c.ny; j++) {
        if (f.type[j * c.nx + col] === FLUID) { js.push(j); ps.push(f.p[j * c.nx + col]); }
    }
    if (js.length < 4) return { error: "not-enough-fluid-cells-in-column (the pool did not settle where expected)" };

    // Least squares p against j. j INCREASES upward, so the slope is NEGATIVE and equals rho*g*h with rho = 1.
    const n = js.length;
    const mx = js.reduce((a, b) => a + b, 0) / n, my = ps.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) { sxy += (js[i] - mx) * (ps[i] - my); sxx += (js[i] - mx) ** 2; }
    const slope = sxy / sxx;
    let ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) { const fit = my + slope * (js[i] - mx); ssRes += (ps[i] - fit) ** 2; ssTot += (ps[i] - my) ** 2; }

    const slopeExact = c.gravity * c.h;                 // rho = 1: dp/dj = rho * g * h per cell of height
    const topJ = js[js.length - 1];
    const topExact = Math.abs(c.gravity) * c.h;         // one cell of head under the free surface

    return {
        slopePerCell: slope,
        slopeExact,
        slopeErrFrac: Math.abs(slope - slopeExact) / Math.abs(slopeExact),
        linearityR2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
        topCellPressure: f.p[topJ * c.nx + col],
        topCellExact: topExact,
        fluidCellsInColumn: n,
        particles, steps: c.steps,
    };
}

export const flip2dDevice = {
    // v3806 -- "hydrostatic" stays FIRST so the contract compares the plant against the mode that owns the key.
    modes: FLIP2D_MODES,
    plantMode: "forceslate", plantFlips: "slopeErrFrac", plantKind: "mode",
    name: "flip2d-hydrostatic",
    observables: FLIP2D_OBSERVABLES,
    build: buildFlip2D,
    defaults: flip2dDefaults,
};

// ---- front door ------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
    const r = await buildFlip2D({ mode: "hydrostatic" });
    console.log("[flip2d] the FLIP/PIC solver's HYDROSTATIC limit, graded against p = rho g d\n");
    if (r.error) { console.log("  REFUSED:", r.error); }
    else {
        console.log("  slope per cell   ", r.slopePerCell.toFixed(6), " vs exact rho*g*h", r.slopeExact.toFixed(6),
            ` (err ${r.slopeErrFrac.toExponential(2)})`);
        console.log("  linearity R^2    ", r.linearityR2.toFixed(6), " -- a fit through a curve can have any slope you like");
        console.log("  top fluid cell   ", r.topCellPressure.toFixed(4), " vs exact one cell of head", r.topCellExact.toFixed(4));
        console.log("  measured over    ", r.fluidCellsInColumn, "fluid cells,", r.particles, "particles,", r.steps, "steps");
    }
    console.log("\n  NOT CLAIMED: that the SOLVER is verified. Advection, the FLIP/PIC blend, the free surface and");
    console.log("  two-way coupling stay UNGRADED -- a fluid at rest exercises the projection and nothing else.");
    console.log("  NOT PLANTED: the curriculum asked for a grade; a plant for flip2d is a separate round.");
}
