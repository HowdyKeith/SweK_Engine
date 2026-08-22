// physics/mpm/gridSolve.mjs -- v3790
//
// *** THE SECOND OF MPM'S FOUR PIECES: THE GRID SOLVE. v3789 built the TRANSFER; this is what happens to the
// grid between P2G and G2P -- normalise momentum to velocity, apply a body force, enforce boundaries. Still
// NOT a simulation: there is no stress here, so nothing resists deformation and a block of particles simply
// falls. THAT IS THE CORRECT SCOPE FOR THIS ROUND and the next one adds the missing half. ***
//
// *** THE KEY IS AN EXACT IMPULSE IDENTITY, AND IT IS THE ONE PLACE MPM'S ORDER OF OPERATIONS BITES.
// A body force g applied for dt to a total mass M changes total momentum by EXACTLY M*g*dt. Not approximately
// -- exactly, because gravity is uniform. The identity holds for the GRID's momentum sum, and it is destroyed
// by the classic slip: applying the force to the node VELOCITY FIELD BEFORE dividing by mass, or applying it
// to every node whether or not that node carries any mass. BOTH LOOK RIGHT AND BOTH WEIGHT THE IMPULSE BY
// NODE COUNT INSTEAD OF BY MASS. ***
//
// The second key is the boundary: a node on a sticky wall must have EXACTLY ZERO normal velocity afterwards,
// which is a verdict rather than a residual.

/**
 * Normalise the grid's momentum to a velocity field, in place.
 * Nodes with no mass are LEFT AT ZERO rather than divided -- an empty node has no velocity, and
 * 0/0 would put NaN into a field that every later gather reads.
 * @returns {number} how many nodes carried mass
 */
export function normalise(g) {
    let live = 0;
    for (let k = 0; k < g.n; k++) {
        const m = g.mass[k];
        if (m > 0) { g.mvx[k] /= m; g.mvy[k] /= m; live++; }
        else { g.mvx[k] = 0; g.mvy[k] = 0; }
    }
    g.normalised = true;
    return live;
}

/**
 * Apply a uniform body force for dt to the VELOCITY field.
 *
 * *** THIS MUST RUN AFTER normalise(), AND THE ORDER IS THE WHOLE POINT. On a velocity field, v += g*dt gives
 * every node the same velocity change, so the MOMENTUM change is m_i*g*dt per node and M*g*dt in total --
 * WHICH IS THE IDENTITY. Run on a MOMENTUM field instead, the same line adds g*dt of MOMENTUM to each node
 * regardless of its mass, so the total impulse becomes (node count)*g*dt: right units, plausible motion,
 * WRONG PHYSICS, and it scales with the grid resolution rather than with the material. ***
 *
 * *** v3794 -- THIS TOOK AN `onMomentum` FLAG WHOSE TWO BRANCHES WERE BYTE-IDENTICAL. A KNOB THAT DOES
 * NOTHING -- the exact shape v3783 planted deliberately and this file shipped by accident one round later.
 * IT CAUSED NO WRONG RESULT, because gridStep implements the plant by CALLING ORDER and never depended on the
 * flag: the graded behaviour was always right and the option was always dead. THE FLAG IS DELETED RATHER THAN
 * REPAIRED, because THE ORDER IS WHAT CARRIES THE MEANING -- this function adds a velocity increment, and
 * whether that is a velocity or a momentum increment is decided ENTIRELY by which field the caller has in the
 * buffer. Making the flag "work" would have put a second, contradictory way to express the same thing. ***
 */
export function applyBodyForce(g, gx, gy, dt) {
    for (let k = 0; k < g.n; k++) {
        if (g.mass[k] <= 0) continue;         // an empty node is not accelerated: there is nothing there to accelerate
        g.mvx[k] += gx * dt; g.mvy[k] += gy * dt;
    }
}

/**
 * *** THE REAL DIFFERENCE BETWEEN THE TWO ORDERS IS WHICH FIELD IS IN mvx/mvy WHEN THE LINE RUNS, NOT THE LINE
 * ITSELF -- which is exactly why the bug survives a reading. This runs the whole grid step in one call so the
 * ORDER is the thing under test, and `forceBeforeNormalise` is the plant.
 * @returns {{impulseX, impulseY, totalMass, live}} the momentum the step actually added
 */
export function gridStep(g, { gx = 0, gy = -9.81, dt = 1 / 120, forceBeforeNormalise = false,
                              walls = null } = {}) {
    let totalMass = 0;
    for (let k = 0; k < g.n; k++) totalMass += g.mass[k];

    const momBefore = { x: 0, y: 0 };
    for (let k = 0; k < g.n; k++) { momBefore.x += g.mvx[k]; momBefore.y += g.mvy[k]; }

    let live;
    if (forceBeforeNormalise) {
        // THE PLANT: the force lands on the MOMENTUM field, so each node gets the same momentum kick
        // regardless of its mass -- an impulse weighted by NODE COUNT.
        applyBodyForce(g, gx, gy, dt);      // on the MOMENTUM field, because normalise has not run yet
        live = normalise(g);
    } else {
        live = normalise(g);
        applyBodyForce(g, gx, gy, dt);      // on the VELOCITY field, which is what makes the impulse M*g*dt
    }

    if (walls) enforceWalls(g, walls);

    // momentum AFTER is the velocity field re-weighted by mass -- the grid holds velocities now
    let mx = 0, my = 0;
    for (let k = 0; k < g.n; k++) { mx += g.mass[k] * g.mvx[k]; my += g.mass[k] * g.mvy[k]; }
    return { impulseX: mx - momBefore.x, impulseY: my - momBefore.y, totalMass, live,
             momentumX: mx, momentumY: my };
}

/**
 * Sticky walls on the grid's outer rows/columns: the normal component is set to EXACTLY zero.
 * `sticky` zeroes both components, which is the stronger condition and the one a no-slip boundary wants.
 */
/**
 * *** v3798 -- `sides` AND `floorOnly` ADDED, BECAUSE A FRICTIONLESS FLOOR CARRIES AN EXACT KEY AND THERE WAS
 * NO WAY TO ASK FOR ONE. The non-sticky branch already zeroes ONLY THE NORMAL COMPONENT, which IS free slip --
 * but it applied to all four sides at once, so horizontal momentum was always destroyed by the side walls and
 * the identity could never be stated. WITH A FLOOR ALONE, sum(m*vx) IS CONSERVED EXACTLY: a frictionless floor
 * exerts no horizontal force, so nothing in the system can change the horizontal momentum. ***
 *
 * *** AND A CORNER IS STICKY EVEN IN THE FREE-SLIP BRANCH, WHICH IS WORTH KNOWING RATHER THAN DISCOVERING:
 * where onX and onY are both true BOTH components are zeroed, so a block reaching a corner loses its
 * horizontal momentum to a boundary that claims to be frictionless. That is why the momentum fixture uses a
 * FLOOR ONLY -- with side walls the key would be measuring the corners.
 *
 * *** THE WALL MUST STAND AT LEAST TWO CELLS FROM THE DOMAIN EDGE, AND THAT IS NOT A STYLE POINT -- IT IS THE
 * DIFFERENCE BETWEEN THE MOMENTUM KEY HOLDING AND FAILING BY 99.9%. A quadratic stencil reaches ONE CELL EACH
 * WAY, so a particle resting a fraction above y=0 has a stencil base of -1: THAT NODE ROW DOES NOT EXIST, and
 * both p2g and g2p SKIP IT. The weights then no longer sum to one, and the gather silently loses whatever
 * share those nodes carried.
 * MEASURED on a block sliding on a frictionless floor: with the floor at lo=1 the horizontal momentum went
 * 3.750000 -> 0.003025, A 99.9% LOSS ON A BOUNDARY THAT EXERTS NO HORIZONTAL FORCE. With the floor at lo=3 it
 * reads 1.184e-15. THE PHYSICS WAS NEVER WRONG; THE MATERIAL WAS STANDING ON THE EDGE OF THE GRID. ***
 */
export function enforceWalls(g, { lo = 1, hi = 1, sticky = false, sides = true, floorOnly = false } = {}) {
    let clamped = 0;
    for (let j = 0; j <= g.ny; j++) for (let i = 0; i <= g.nx; i++) {
        const k = j * (g.nx + 1) + i;
        const onX = sides && !floorOnly && ((i < lo) || (i > g.nx - hi));
        const onY = floorOnly ? (j < lo) : ((j < lo) || (j > g.ny - hi));
        if (!onX && !onY) continue;
        if (sticky) { g.mvx[k] = 0; g.mvy[k] = 0; }
        else { if (onX) g.mvx[k] = 0; if (onY) g.mvy[k] = 0; }
        clamped++;
    }
    return clamped;
}

// *** GUARDED, BECAUSE THIS MODULE IS LOADED BY A BROWSER AND `process` IS A NODE GLOBAL. *** Unguarded,
// this line threw ReferenceError at module scope, which kills the WHOLE import graph -- so mpm.html
// rendered its headings and then nothing at all. VERIFIED IN A REAL CHROMIUM at v3809, before and after.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    import("./transfer.mjs").then((T) => {
        const mk = () => { const g = T.makeGrid(12, 12, 1); T.p2g(T.rotatingBlock(), g, { affine: true }); return g; };
        const dt = 1 / 120, gy = -9.81;
        for (const bad of [false, true]) {
            const g = mk();
            const r = gridStep(g, { gy, dt, forceBeforeNormalise: bad });
            const want = r.totalMass * gy * dt;
            console.log("[gridSolve] " + (bad ? "force-before-normalise" : "correct order       ") +
                        "  impulseY " + r.impulseY.toFixed(9) + "   expected " + want.toFixed(9) +
                        "   err " + (Math.abs(r.impulseY - want) / Math.abs(want)).toExponential(3));
        }
    });
}
