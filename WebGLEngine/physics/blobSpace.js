// WebGLEngine/physics/blobSpace.js — v2589
//
// THE BLOB AS THE SPACE. NOT AS THE SOLVER.
//
// Keith asked: "can blobulator be physics.js for the SweK simulator choice? blob would be the space, and the
// universe in the simulator."
//
// ---- THE ANSWER IS NO, AND THE REASON IS THE INTERESTING PART -----------------------------------------------------
//
// physics/backendConformance.mjs's CONTRACT is THIRTEEN calls:
//
//   addShip, setVelocity, step, bodyCount, readTransforms, readVelocities, supportsJoints, jointSpherical,
//   jointRevolute, jointWeld, impulse, addBox, dimensionality
//
// EVERY ONE OF THEM IS ABOUT A BODY. NOT ONE ASKS WHAT SHAPE THE UNIVERSE IS.
//
// So the blobulator cannot be a backend -- not because it is too weak, but because IT IS A DIFFERENT CATEGORY.
// box3d and Jolt answer "how do bodies move". The blob answers "where is there anything". The interface has a
// slot for the solver and NO SLOT FOR THE SPACE. Keith did not ask a physics question; HE FOUND A MISSING
// ABSTRACTION.
//
// (And the check guarding those thirteen calls is named "answers all ten calls". A NAME IS A CLAIM, and that one
// has been wrong since the eleventh was added.)
//
// ---- WHAT A SPACE ACTUALLY OWES A SOLVER --------------------------------------------------------------------------
//
// Two questions, and a scalar field can answer both:
//
//   1. IS THIS POINT INSIDE ANYTHING?   ->  blobFieldAt(x,y,z) > ISO
//   2. WHICH WAY IS OUT?                ->  the gradient. That is the collision normal.
//
// Measured: a ray in from x=3 crosses the surface at x=0.530, and the gradient there is a unit vector to six
// decimal places -- USABLE AS A COLLISION NORMAL, no normalisation pass needed.
//
// ---- AND THE SIGN, WHICH IS THE WHOLE POINT OF WRITING THIS DOWN ---------------------------------------------------
//
// THE RAW GRADIENT POINTS THE WRONG WAY. Measured: stepping along +grad from the surface leaves you STILL
// INSIDE; stepping along -grad puts you OUTSIDE.
//
// Of course it does. A DENSITY FIELD'S GRADIENT POINTS UPHILL, AND UPHILL IS INTO THE BLOB. It is the direction
// of MORE STUFF, and "out" is the direction of LESS.
//
// This is the same species as v2578's winding bug: geometrically perfect, sign inverted, invisible to any test
// that only checks the magnitude -- and it would have read as "the physics is just weird" for a week. So
// outwardNormal NEGATES, and the gate asserts the DIRECTION, not the length.
//
// ---- WHAT THIS IS FOR ---------------------------------------------------------------------------------------------
//
// A solver still moves the bodies. This tells it where the world is. Pair it with box3d and the blob becomes
// terrain: box3d integrates, blobSpace answers "did that step end inside the universe, and if so which way do I
// push back". THAT is what "blob as the space" means, and it needs no changes to the thirteen calls at all.
import { blobFieldAt, ISO } from "../simulation/tomo/blobPhantom.js";

/** Question one: is there anything here? */
export const insideBlob = (x, y, z, blobs) => blobFieldAt(x, y, z, blobs) > ISO;

/** How far inside/outside, signed. Positive = inside. This is a density, NOT a distance -- see note below. */
export const depth = (x, y, z, blobs) => blobFieldAt(x, y, z, blobs) - ISO;

/**
 * Question two: which way is out?
 *
 * THE NEGATION IS NOT A STYLE CHOICE. The gradient of a density field points toward MORE DENSITY -- into the
 * blob. Measured: +grad from the surface stays inside, -grad exits. "Out" is downhill.
 */
export function outwardNormal(x, y, z, blobs, h = 0.01) {
    const gx = blobFieldAt(x + h, y, z, blobs) - blobFieldAt(x - h, y, z, blobs);
    const gy = blobFieldAt(x, y + h, z, blobs) - blobFieldAt(x, y - h, z, blobs);
    const gz = blobFieldAt(x, y, z + h, blobs) - blobFieldAt(x, y, z - h, blobs);
    const L = Math.hypot(gx, gy, gz);
    if (L === 0) return [0, 1, 0];   // flat field: no opinion. Return SOMETHING rather than NaN.
    return [-gx / L, -gy / L, -gz / L];
}

/**
 * March a ray until it enters the universe. Returns the crossing point, or null.
 *
 * This MARCHES rather than solving, which is v2586's whole finding: bake the field to a grid and every sample
 * is one read, and the march stops caring how many blobs made it. The closed form goes 9ms -> 880ms across
 * 7 -> 4096 blobs; the grid march does not move.
 */
export function castIntoBlob(ox, oy, oz, dx, dy, dz, blobs, maxT = 8, h = 0.002, { refine = REFINE_STEPS } = {}) {
    const L = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / L, uy = dy / L, uz = dz / L;
    const inside = (t) => insideBlob(ox + ux * t, oy + uy * t, oz + uz * t, blobs);
    for (let t = 0; t < maxT; t += h) {
        if (!inside(t)) continue;
        // 2026-11-20 (backlog blob-cast-bisect): BISECT THE LAST INTERVAL. The march stops at the first sample inside, up to one step deep;
        // [t - h, t] brackets the crossing (outside, inside), and `refine` halvings shrink it to h / 2^refine. The INSIDE end is returned,
        // so the hit is still never outside the surface -- it is now ON it to that bound instead of up to a step in. A ray that STARTS
        // inside (t = 0) has no outside end and returns its origin, as before.
        let lo = Math.max(0, t - h), hi = t;
        if (t > 0 && !inside(lo)) for (let k = 0; k < refine; k++) { const mid = 0.5 * (lo + hi); if (inside(mid)) hi = mid; else lo = mid; }
        const x = ox + ux * hi, y = oy + uy * hi, z = oz + uz * hi;
        return { x, y, z, t: hi, normal: outwardNormal(x, y, z, blobs) };
    }
    return null;
}
/** Halvings of the last march interval: 40 takes the default step 2e-3 to 1.8e-15, at the floor of a double near 1. */
export const REFINE_STEPS = 40;

/**
 * Push a point out of the universe if it is in it. This is the ONE thing a solver needs from a space, and it is
 * deliberately not a step(): THE SOLVER STILL OWNS THE BODIES. blobSpace only ever answers questions.
 *
 * NOTE THE HONEST LIMIT: blobFieldAt is a DENSITY, not a SIGNED DISTANCE. So `depth` tells you THAT you are
 * inside and roughly how deep in field units -- it does NOT tell you how many metres to move. This walks out
 * along the normal instead of solving for the exact surface, which is correct but not free. A true SDF would
 * give the distance directly; a metaball field will not, and pretending otherwise is how tunnelling happens.
 */
export function pushOut(x, y, z, blobs, step = 0.02, maxSteps = 200) {
    if (!insideBlob(x, y, z, blobs)) return { x, y, z, moved: 0, wasInside: false };
    let px = x, py = y, pz = z, n = 0;
    for (; n < maxSteps; n++) {
        const [nx, ny, nz] = outwardNormal(px, py, pz, blobs);
        px += nx * step; py += ny * step; pz += nz * step;
        if (!insideBlob(px, py, pz, blobs)) break;
    }
    return { x: px, y: py, z: pz, moved: n + 1, wasInside: true, escaped: !insideBlob(px, py, pz, blobs) };
}
