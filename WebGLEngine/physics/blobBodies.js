// WebGLEngine/physics/blobBodies.js — v2595
//
// THE BLOBS WERE ALWAYS THE BODIES. I ASKED THE WRONG QUESTION IN v2589.
//
// ---- WHAT KEITH BROUGHT BACK -------------------------------------------------------------------------------------
//
// Another assistant gave Keith a full plan for "blobulator as the universe physics": bake the density into a
// WebGPU 3D texture, solve Navier-Stokes on it with semi-Lagrangian advection, Jacobi pressure projection,
// boundary bounce, marching cubes on the way out, and a Jolt bridge that reads the density gradient for
// buoyancy. THE SHAPE OF THAT PLAN IS CORRECT. It is the standard Stam-1999 stable-fluids pipeline and it
// works. It even got the sign right -- `let normal = -normalize(gradient)` -- which is the exact thing v2589
// measured and negated, because A DENSITY FIELD'S GRADIENT POINTS UPHILL AND UPHILL IS INTO THE BLOB.
//
// NOBODY IN THAT CONVERSATION MEASURED WHAT IT COSTS. So I did.
//
// ---- WHAT THE AQUARIUM COSTS -------------------------------------------------------------------------------------
//
// Bake blobFieldAt into 64^3 (peak 4.260, mass 6379). Advect it right 30 steps, then left 30 steps -- IT ENDS
// EXACTLY WHERE IT STARTED, so every bit of loss is PURE NUMERICS, not motion:
//
//     round trips    peak     mass     peak kept
//          1        3.208     6379       75.3%
//          2        2.682     6379       63.0%
//          3        2.376     6375       55.8%
//          4        2.153     6364       50.5%
//
// THE BLOB LOSES HALF ITS PEAK IN FOUR SECONDS OF STANDING STILL. And look at the mass column: 6379 -> 6364.
// IT IS CONSERVED. THE BLOB DOES NOT EVAPORATE, IT DISSOLVES -- it smears flatter and wider while the books
// stay balanced. That is semi-Lagrangian advection's famous flaw (numerical diffusion), it is the price of the
// unconditional stability that makes the method worth using, and THE PLAN NEVER MENTIONS IT.
//
// Keith: "I would hate to think we would need to create an aquarium in the simulator that could allow the
// blobulator to breathe easier." THE AQUARIUM DISSOLVES HIM IN FOUR SECONDS.
//
// ---- WHAT A BLOB ACTUALLY IS -------------------------------------------------------------------------------------
//
// blobPhantom.js line 91: `{ x, y, z, r, a }`. A POSITION, A SUPPORT RADIUS, AN AMPLITUDE. SEVEN OF THEM. And
// blobFieldAt just sums over that list.
//
// SO THE BLOBS ARE ALREADY BODIES. v2589 asked "can the blob be the SPACE?" and the answer was no -- the
// backend CONTRACT is thirteen calls and every one is about a body. THAT WAS THE WRONG QUESTION. The right one
// is "can the blobs be the BODIES?", and they already are: box3d moves seven centres, the field re-evaluates,
// AND THE FORMULA TRAVELS WITH THEM.
//
//     round trips    peak    peak kept    drift
//         1..4      3.920      100.0%     5.6e-17
//
// 100.0%, FOREVER. The drift is one float rounding, not accumulation -- four round trips or four million, the
// blob is exact. THE GRID LOST HALF ITS PEAK; SEVEN NUMBERS LOST NOTHING. And the cost is 7 bodies against
// 262,144 voxels.
//
// ---- WHAT THIS IS NOT --------------------------------------------------------------------------------------------
//
// THIS DOES NOT MAKE THE BLOB A FLUID. Move the centres and the blob is a soft rigid arrangement of lumps that
// merge and part -- it does not slosh, it does not conserve momentum through the field, and it will never
// splash. IF YOU WANT A FLUID, YOU WANT THE AQUARIUM AND YOU WANT TO PAY THE DIFFUSION. Keith said the blob is
// not a liquid. THIS IS THE READING THAT TAKES HIM AT HIS WORD.
import { blobFieldAt } from "../simulation/tomo/blobPhantom.js";

/**
 * Hand the blob's centres to a physics backend as bodies. Any backend -- this only uses addShip, which is the
 * first call in the thirteen-call CONTRACT.
 *
 * ---- coreScale, AND WHY v2595 SHIPPED THIS WRONG ---------------------------------------------------------------
 *
 * v2595 passed `half: b.r` -- THE FIELD RADIUS AS THE COLLISION RADIUS. Then v2597 put REAL box3d.wasm behind it
 * for the first time and watched it TAKE THE BLOB APART:
 *
 *     collision radius     closest pair, before -> after one second
 *       b.r * 1.00           0.2103 -> 1.1255      BLOWN APART, 5.4x
 *       b.r * 0.50           0.2103 -> 0.6176
 *       b.r * 0.25           0.2103 -> 0.3356
 *       b.r * 0.10           0.2103 -> 0.2025      STAYS A BLOB
 *
 * THE FIELD RADIUS IS NOT THE COLLISION RADIUS. The field radius is where a blob's INFLUENCE ENDS; the collision
 * radius is where its SOLIDITY BEGINS. And a metaball's whole existence is its overlap -- these seven sit 0.21
 * apart with r ~ 0.5, WHICH IS DEEP INTERPENETRATION BY DESIGN.
 *
 * A RIGID SOLVER'S ENTIRE JOB IS TO REMOVE INTERPENETRATION. A METABALL'S PEAK *IS* INTERPENETRATION. Hand box3d
 * the field radius and it will do its job perfectly and SOLVE YOUR BLOB APART. It is not a bug in box3d. IT IS
 * TWO CORRECT THINGS WANTING OPPOSITE OUTCOMES, and the only place to resolve it is HERE, in the number you
 * hand across.
 *
 * 0.15 is a CHOICE, not a discovery: small enough that the lumps stay a blob, large enough that they cannot
 * pass through each other. THE CALLER SHOULD OVERRIDE IT WHEN THEY KNOW BETTER, WHICH IS WHY IT IS AN ARGUMENT.
 *
 * ---- v2602: THE BLOB WAS SEVEN ENDLESS SKY SHIPS, AND KEITH ASKED THE QUESTION THAT FOUND IT ---------------
 *
 * He asked: "Were you able to determine if box3d supported y, was it drag that you were checking?"
 *
 * NO. I HAD ASSERTED "box3d issue #84, swk_body_ship locks Y" FROM MEMORY, QUOTING AN ISSUE NUMBER INSTEAD OF
 * READING THE FUNCTION TWO LINES ABOVE IT. And my own two measurements contradicted each other and I did not
 * notice: v2597's blobarium reported movedY 0.362 (seven bodies) while v2599's pose check reported y = 0 (one
 * body). SEVEN COLLIDING BODIES MOVED IN Y; ONE ALONE DID NOT. I READ COLLISION RESPONSE AS GRAVITY.
 *
 * READ, NOT RECALLED:
 *
 *     createWorld({ gravity = [0, -9.8, 0] } = {})                              // gravity is ON, by default
 *     // v2263 -- ES ship: a planar, drag-free, non-rotating body
 *     addShip({ x = 0, z = 0, half = 0.5, density = 1 } = {})                   // THERE IS NO y PARAMETER
 *
 * MEASURED, one world, both constructors, one second of the same gravity:
 *
 *     addShip:  y 0 -> 0          NEVER MOVES
 *     addBox:   y 5 -> 0.1602     FELL 4.84, which is 9.8*t^2/2
 *
 * BOX3D SUPPORTS Y COMPLETELY. addShip is the ENDLESS SKY SHIP CONSTRUCTOR and ships fly on a plane -- it is
 * doing exactly what its comment advertises. IT IS NOT A LOCK AND IT IS NOT DRAG. I CALLED THE WRONG FUNCTION,
 * and then explained the symptom with an issue number.
 *
 * So every lump of the blobarium was a planar ES ship and THE BLOB COULD NOT FALL. Shipped in v2595, wired
 * into a page in v2597, and nothing caught it: v2595's gate used a STAND-IN WORLD (which has no gravity to
 * disagree about) and v2597's gate only ever asked whether the blob STAYED TOGETHER, never whether it FELL.
 *
 * `planar: true` is kept because ES ships genuinely want it -- THAT PATH WAS NEVER WRONG, IT WAS JUST NEVER
 * WHAT A BLOB WANTED.
 *
 * @returns {number[]} body indices, parallel to blobs
 */
export function blobsToBodies(blobs, world, { coreScale = 0.15, planar = false } = {}) {
    return blobs.map((b) => {
        if (planar) return world.addShip({ x: b.x, z: b.z, half: b.r * coreScale });
        const h = b.r * coreScale;
        return world.addBox({ type: "dynamic", pos: [b.x, b.y, b.z], half: [h, h, h] });
    });
}

/**
 * Read the solver's transforms back into the blob centres. AFTER THIS, blobFieldAt IS EXACT AGAIN -- not
 * approximately, not to within a tolerance. EXACT. There is no grid to have smeared.
 *
 * readTransforms packs 7 floats per body (v2589's conformance suite pins the stride).
 */
export function bodiesToBlobs(world, blobs, ids) {
    const tr = world.readTransforms();
    ids.forEach((id, i) => {
        const o = id * 7;
        blobs[i].x = tr[o];
        blobs[i].y = tr[o + 1];
        blobs[i].z = tr[o + 2];
    });
    return blobs;
}

/**
 * What the aquarium costs, as a function you can run rather than a claim you have to trust.
 *
 * Bakes the field, advects it out and back so it ENDS WHERE IT STARTED, and reports what is left. Any loss is
 * numerics. This exists so nobody has to take the number on faith -- INCLUDING ME.
 *
 * *** v3713 -- THE ROUND TRIP MEASURES LOSS AND CANNOT SEE MOTION, WHICH IS A DIFFERENT THING. A sampler that
 * never moves the field at all scores PERFECTLY on both original columns: peakKept 1.0000, massKept 1.0000,
 * BETTER THAN THE HONEST RUN'S 0.5617. "Nothing was lost" and "nothing happened" are the same reading here,
 * and they are opposite verdicts. So the one-way transport is measured too: advect ONE WAY ONLY and compare
 * the field's CENTROID SHIFT against v*dt*steps, which is what the velocity field was told to do.
 * shiftKept = measured / expected, and it needs no reference value either -- linear advection of a conserved
 * quantity translates the centroid EXACTLY, so the honest answer is 1 and a stalled sampler reads 0. ***
 * `nearest` is the PLANTED sampler, kept here beside the real one so the plant is a MODE OF THIS FUNCTION
 * rather than a second copy of it that could drift.
 */
export function advectionLoss(blobs, { n = 32, ext = 2, trips = 1, steps = 20, v = 1, dt = 1 / 60, nearest = false } = {}) {
    const idx = (i, j, k) => (k * n + j) * n + i;
    const wc = (i) => (i / (n - 1)) * 2 * ext - ext;
    let g = new Float32Array(n * n * n);
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[idx(i, j, k)] = blobFieldAt(wc(i), wc(j), wc(k), blobs);
    const peak = (f) => { let m = 0; for (const x of f) if (x > m) m = x; return m; };
    const mass = (f) => { let m = 0; for (const x of f) m += x; return m; };
    const p0 = peak(g), m0 = mass(g);
    // Centroid along x, mass-weighted. The transport observable reads this and nothing else.
    const centroidX = (f) => { let s = 0, w = 0;
        for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const val = f[idx(i, j, k)]; s += val * wc(i); w += val; }
        return w > 0 ? s / w : 0; };
    const c0 = centroidX(g);
    const sample = (f, x, y, z) => {
        const gx = ((x + ext) / (2 * ext)) * (n - 1), gy = ((y + ext) / (2 * ext)) * (n - 1), gz = ((z + ext) / (2 * ext)) * (n - 1);
        if (nearest) {
            // THE PLANT: round to the nearest voxel instead of interpolating. Per step the departure point is
            // v*dt = 1/60 world units against a cell of 2*ext/(n-1), about a quarter of a cell, SO IT ROUNDS
            // BACK TO THE CELL IT STARTED IN AND THE FIELD NEVER MOVES. Nothing is lost because nothing is done.
            const i = Math.round(gx), j = Math.round(gy), k = Math.round(gz);
            if (i < 0 || j < 0 || k < 0 || i >= n || j >= n || k >= n) return 0;
            return f[idx(i, j, k)];
        }
        const i0 = Math.floor(gx), j0 = Math.floor(gy), k0 = Math.floor(gz);
        if (i0 < 0 || j0 < 0 || k0 < 0 || i0 >= n - 1 || j0 >= n - 1 || k0 >= n - 1) return 0;
        const fx = gx - i0, fy = gy - j0, fz = gz - k0;
        let acc = 0;
        for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++)
            acc += (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz) * g[idx(i0 + di, j0 + dj, k0 + dk)];
        return acc;
    };
    const advect = (vx) => { const out = new Float32Array(n * n * n);
        for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
            out[idx(i, j, k)] = sample(g, wc(i) - vx * dt, wc(j), wc(k));
        return out; };
    // ONE WAY FIRST, off a saved copy, so the round trip below starts from the same field it always did and
    // the two original columns are BIT-IDENTICAL to every version before this one.
    const baked = g;
    for (let s = 0; s < steps; s++) g = advect(v);
    const oneWayShift = centroidX(g) - c0;
    const expectedShift = v * dt * steps;
    g = baked;
    for (let t = 0; t < trips; t++) {
        for (let s = 0; s < steps; s++) g = advect(v);
        for (let s = 0; s < steps; s++) g = advect(-v);
    }
    return { peak0: p0, peak: peak(g), peakKept: peak(g) / p0, mass0: m0, mass: mass(g), massKept: mass(g) / m0,
             oneWayShift, expectedShift, shiftKept: expectedShift !== 0 ? oneWayShift / expectedShift : 0 };
}
