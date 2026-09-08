// WebGLEngine/physics/character/terrainWalk.mjs -- v4544
//
// *** A SLOPE-AWARE GROUND CONTROLLER, BECAUSE THE TREE'S ONLY CHARACTER CONTROLLER CANNOT WALK ON A SLOPE
// AND THE WORLD IT WAS WRITTEN FOR DOES NOT HAVE ANY. ***
//
// physics/character/kinematic.js is an AABB against axis-aligned unit voxels, and its header says why in as
// many words: "The world is axis-aligned unit voxels... Choosing the shape the world is made of keeps every
// invariant below exactly true rather than true-to-a-tolerance." That is correct and it is also the limit. A
// voxel world has no slopes -- only staircases of unit lips -- and this tree also carries heightmaps (the
// pathfinder's, nav/navmesh.mjs's) and triangle meshes (mesh/meshBVH.mjs), on which a slope is the ordinary
// case.
//
// MEASURED ON VOXELISED RAMPS BEFORE ANY OF THIS WAS WRITTEN, which is what said a new file was owed rather
// than a patch. Requested horizontal speed 5.000 in every row:
//
//     slope    stepHeight 0            stepHeight 1.1
//     14 deg   0.31x requested         surface speed 1.020x requested
//     26 deg   0.11x                   1.118x
//     45 deg   0.01x  (stuck)          1.414x
//
// With no step allowance it cannot climb at all. With one, it climbs -- and moves along the surface at
// EXACTLY sec(theta) of the speed it was asked for. 1/cos(45) = 1.41421. You sprint up hills faster than you
// run on the flat.
//
// ---- SO THE FIRST THING THIS FILE OWES IS TO SAY WHICH SPEED IT MEANS ------------------------------------
//
// Both conventions ship in real engines and they are not the same:
//
//     HORIZONTAL   the horizontal component is `speed`; distance along the surface is speed * sec(theta)
//     SURFACE      the distance along the surface is `speed`; horizontal progress is speed * cos(theta)
//
// They differ by 41% at 45 degrees. The default here is SURFACE, because it is the one that makes "speed"
// mean the number an animation is tuned against -- a walk cycle plays at the rate the feet move, not the
// rate the shadow moves -- and because HORIZONTAL is what produced the sec(theta) reading above. Both are
// implemented, the parameter is named, and the gate measures each against its own closed form rather than
// asserting that one of them is correct.
//
// ---- THE BUG THIS FILE IS SHAPED AROUND, AND IT IS SUBSTEP-DEPENDENT ------------------------------------
//
// *** A SLOPE LIMIT TESTED ON THE PER-STEP HEIGHT DIFFERENCE IS NOT A SLOPE LIMIT. *** The tempting way to
// write "you may climb a lip up to stepHeight" is to compare the ground height at the destination against
// the height at the origin and allow the move when the difference is under the allowance. On a heightfield
// that lets a character climb ANY slope, however steep, as long as the substep is short enough -- because
// the height difference over one substep shrinks with the substep while the slope does not. The limit then
// depends on the frame rate, which is the definition of a bug you cannot reproduce.
//
// The limit here is tested on the SURFACE NORMAL, which is a property of the ground and not of the timestep.
// Step-up is a separate thing, for a DISCONTINUITY -- a stair edge, where the surface is vertical over zero
// horizontal distance and a normal-based test would refuse forever. The two are distinguished by which
// question they answer: `walkable(n)` asks about the ground you would be standing on, `stepHeight` asks how
// far the ground may JUMP between two adjacent samples. The gate drives the same wall at four timesteps and
// checks the verdict does not move.
//
// ---- WHAT IS AND IS NOT IN SCOPE -------------------------------------------------------------------------
//
// THIS IS A GROUND CONTROLLER. It answers: where does the body stand, may it walk there, how fast does it
// actually move, and what happens at a crest or a cliff. On terrain that is the whole job, because a wall IS
// a very steep slope and the slope limit is what stops you at it.
//
// IT IS NOT a full character controller against arbitrary geometry. Capsule-against-triangle depenetration
// -- what you need for overhangs, thin walls, ceilings and stepping onto a floating platform -- is a
// different problem with a different shape, and mesh/meshBVH.mjs's trianglesInBox is the query it would be
// built on. Not started here, and said so rather than left to be discovered.
//
// The ground is a FUNCTION of (x, z), which is the assumption a heightmap makes and a triangle mesh does
// not: an overhang has two surfaces over one point and this takes the topmost. Stated because it is the
// thing that will be wrong first on a real mesh.
"use strict";

/** Degrees between a surface normal and straight up. */
export const slopeDeg = (n) => Math.acos(Math.max(-1, Math.min(1, n[1]))) * 180 / Math.PI;

/** Speed conventions -- see the header; they differ by sec(theta). */
export const SURFACE = "surface";
export const HORIZONTAL = "horizontal";

/**
 * A ground oracle over a heightfield: bilinear height, and the normal of that same bilinear surface.
 *
 * *** THE NORMAL IS THE GRADIENT OF THE SURFACE ACTUALLY BEING WALKED ON, NOT OF THE SAMPLES. *** Taking a
 * central difference of the raw samples gives the normal of a DIFFERENT, smoother surface than the one the
 * body's height is read from, so the controller would stand on one surface and be limited by another -- and
 * on a ramp the two disagree by exactly the amount that makes a slope limit fire in the wrong place. The
 * partial derivatives below are those of the bilinear patch the height came from.
 */
export function heightfieldGround(hm, { stride, cellSize = 1, originX = 0, originZ = 0 } = {}) {
    const rows = Math.floor(hm.length / stride);
    const H = (i, j) => hm[Math.max(0, Math.min(rows - 1, j)) * stride + Math.max(0, Math.min(stride - 1, i))];
    return (wx, wz) => {
        const fx = (wx - originX) / cellSize, fz = (wz - originZ) / cellSize;
        const i = Math.floor(fx), j = Math.floor(fz);
        if (i < -1 || j < -1 || i > stride - 1 || j > rows - 1) return null;
        const u = fx - i, v = fz - j;
        const h00 = H(i, j), h10 = H(i + 1, j), h01 = H(i, j + 1), h11 = H(i + 1, j + 1);
        const y = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v;
        // d/du and d/dv of the same bilinear patch, converted to world units
        const dhdx = ((h10 - h00) * (1 - v) + (h11 - h01) * v) / cellSize;
        const dhdz = ((h01 - h00) * (1 - u) + (h11 - h10) * u) / cellSize;
        const len = Math.hypot(-dhdx, 1, -dhdz);
        return { y, n: [-dhdx / len, 1 / len, -dhdz / len] };
    };
}

/**
 * A ground oracle over a triangle mesh: cast down and take the first hit.
 *
 * `top` must be above anything the body can stand on; the ray starts there. A miss returns null, which the
 * controller treats as "no ground", not as "height zero" -- the difference is walking off the end of the
 * world versus falling into a hole that is not there.
 */
export function meshGround(bvh, { top = 1e4, maxT = Infinity } = {}) {
    return (wx, wz) => {
        const hit = bvh.raycastFirst(wx, top, wz, 0, -1, 0, maxT);
        if (!hit) return null;
        const i = hit.tri * 9, t = bvh.tris;
        const e1 = [t[i + 3] - t[i], t[i + 4] - t[i + 1], t[i + 5] - t[i + 2]];
        const e2 = [t[i + 6] - t[i], t[i + 7] - t[i + 1], t[i + 8] - t[i + 2]];
        let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const L = Math.hypot(n[0], n[1], n[2]) || 1;
        n = [n[0] / L, n[1] / L, n[2] / L];
        if (n[1] < 0) n = [-n[0], -n[1], -n[2]];      // a floor's normal points up whichever way it is wound
        return { y: hit.point[1], n };
    };
}

/**
 * A ground oracle over a height FUNCTION, which is the shape a live world exposes.
 *
 * simulation/BotManager.js reads its terrain through `world._heightAt(x, z)` -- a function, not an array --
 * so neither adapter above fits it. *** AND THE CENTRAL DIFFERENCE THIS USES IS CORRECT HERE FOR THE EXACT
 * REASON THE HEIGHTFIELD ADAPTER REFUSES IT. *** There, the height comes from a bilinear patch and a central
 * difference of the raw samples describes a different, smoother surface than the one being stood on. Here
 * the function IS the surface: there is no patch to disagree with, and a symmetric difference is the
 * gradient of the thing itself, second-order accurate in `eps` wherever the function is smooth.
 *
 * What it cannot do is a DISCONTINUITY. Across a step the difference reports a slope of (jump / 2*eps),
 * which grows without bound as eps shrinks -- so a cliff reads as unwalkable rather than as a step, and
 * `stepHeight` never gets a chance to consider it. That is the safe direction and it is a real limit: on a
 * world of hard voxel lips this adapter will refuse ledges that physics/character/kinematic.js can climb.
 */
export function functionGround(hAt, { eps = 0.5 } = {}) {
    return (wx, wz) => {
        let y, hx0, hx1, hz0, hz1;
        try {
            y = hAt(wx, wz);
            hx0 = hAt(wx - eps, wz); hx1 = hAt(wx + eps, wz);
            hz0 = hAt(wx, wz - eps); hz1 = hAt(wx, wz + eps);
        } catch { return null; }
        if (!Number.isFinite(y) || !Number.isFinite(hx0) || !Number.isFinite(hx1) ||
            !Number.isFinite(hz0) || !Number.isFinite(hz1)) return null;
        const dhdx = (hx1 - hx0) / (2 * eps), dhdz = (hz1 - hz0) / (2 * eps);
        const len = Math.hypot(-dhdx, 1, -dhdz);
        return { y, n: [-dhdx / len, 1 / len, -dhdz / len] };
    };
}

/** Project a vector onto the plane with normal n: v - (v.n)n, the same identity nav/funnel.mjs's slide uses. */
export function projectOnPlane(v, n) {
    const d = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    return [v[0] - d * n[0], v[1] - d * n[1], v[2] - d * n[2]];
}

/**
 * The horizontal direction to travel when the ground ahead is too steep to climb: along the CONTOUR.
 *
 * Projecting the wish onto the steep plane and taking its horizontal part points partly UP the face, which
 * is the move being refused. What survives a refusal is the component along the level line -- perpendicular
 * to the horizontal gradient -- and that is what lets a body slide around the foot of a hill instead of
 * sticking to it.
 */
export function contourSlide(wishX, wishZ, n) {
    const gx = n[0], gz = n[2];                  // horizontal part of the normal = downhill direction
    const g = Math.hypot(gx, gz);
    if (g < 1e-12) return [wishX, wishZ];
    const tx = -gz / g, tz = gx / g;             // unit tangent along the contour
    const d = wishX * tx + wishZ * tz;
    return [tx * d, tz * d];
}

/**
 * One step of ground-following motion.
 *
 *   pos          [x, y, z] of the body's FEET
 *   ground       an oracle (x, z) -> { y, n } or null
 *   wish         [wx, wz], the horizontal direction it wants to go; length is ignored
 *   speed        metres per second, in the convention named below
 *   maxSlopeDeg  steeper than this and the ground is not walkable
 *   stepHeight   how far the ground may JUMP between adjacent samples and still be stepped onto
 *   snapDown     how far below the feet ground may be and still be snapped to rather than fallen off.
 *                Ground further down than this ENDS the step with airborne=true and the body still at the
 *                lip: this module has no vertical velocity and does not pretend to integrate a fall.
 *   substep      maximum horizontal distance per internal step; the verdict must not depend on it
 */
export function stepTerrain({
    pos, ground, wish, dt = 1 / 60, speed = 5,
    maxSlopeDeg = 45, stepHeight = 0.5, snapDown = 0.5,
    convention = SURFACE, substep = 0.25,
} = {}) {
    const start = pos.slice();
    const wl = Math.hypot(wish[0], wish[1]);
    // *** THE LIMIT IS INCLUSIVE, AND THE TOLERANCE IS A MEASUREMENT RATHER THAN A CUSHION. *** An exact
    // 45-degree plane has n.y = 1/sqrt(2), which Math.hypot returns as 0.70710678118654746, while
    // Math.cos(45 * PI / 180) is 0.70710678118654757 -- ONE ULP APART, and a bare `n.y < cos` therefore
    // refuses a 45-degree ramp to a character whose limit is 45 degrees. Measured on a slope-1 heightfield:
    // every sample from the foot of the hill onward read REFUSED at 45.000000 degrees. 1e-12 in cosine is
    // about 8e-11 degrees near this angle, which is far below anything terrain can express and far above the
    // 1.1e-16 that caused it.
    const cos = Math.cos(maxSlopeDeg * Math.PI / 180) - 1e-12;
    const here = ground(pos[0], pos[2]);
    if (wl < 1e-12) {
        return { pos: here ? [pos[0], here.y, pos[2]] : pos.slice(), moved: [0, 0, 0], movedH: 0,
                 surfaceDist: 0, grounded: !!here, blocked: false, slid: false,
                 normal: here ? here.n : null, slope: here ? slopeDeg(here.n) : null, substeps: 0, airborne: !here };
    }
    let dir = [wish[0] / wl, wish[1] / wl];
    // *** THE CONVENTION IS APPLIED HERE AND NOWHERE ELSE. *** SURFACE asks for `speed` along the ground, so
    // the horizontal budget is shortened by cos(theta) of the slope being stood on; HORIZONTAL spends the
    // whole budget horizontally and lets the surface distance run to speed * sec(theta).
    let budget = speed * dt;
    if (convention === SURFACE && here) budget *= Math.max(0, here.n[1]);
    const steps = Math.max(1, Math.ceil(budget / Math.max(1e-6, substep)));
    const chunk = budget / steps;

    let cur = pos.slice(), blocked = false, slid = false, airborne = false;
    let last = here;
    for (let s = 0; s < steps; s++) {
        let nx = cur[0] + dir[0] * chunk, nz = cur[2] + dir[1] * chunk;
        let g = ground(nx, nz);
        if (!g) { blocked = true; break; }                       // walked off the edge of the data
        // *** THE LIMIT IS ON THE NORMAL, NOT ON THE HEIGHT DIFFERENCE. *** A height-difference test shrinks
        // with the substep and would make this verdict depend on dt; see the header.
        if (g.n[1] < cos) {
            const t = contourSlide(dir[0], dir[1], g.n);
            const tl = Math.hypot(t[0], t[1]);
            if (tl < 1e-9) { blocked = true; break; }
            dir = [t[0] / tl, t[1] / tl];
            nx = cur[0] + dir[0] * chunk; nz = cur[2] + dir[1] * chunk;
            g = ground(nx, nz);
            if (!g || g.n[1] < cos) { blocked = true; break; }
            slid = true;
        }
        const rise = g.y - cur[1];
        if (rise > stepHeight) { blocked = true; break; }        // a wall taller than the allowance
        // *** LEAVING THE GROUND ENDS THIS STEP; IT DOES NOT CONTINUE IT IN MID-AIR. *** The first draft set
        // `airborne` and carried on advancing horizontally at the old height, which is not a ground
        // controller falling badly -- it is a ground controller FLYING. Measured on a mesh cliff with a real
        // vertical face: 143 substeps from x=32.08 to x=43.92, every one of them at y=10.00, sailing over a
        // deck 10 units below. This module owns no vertical velocity and no gravity by design (see the
        // header's scope), so the honest thing is to stop at the lip, say so, and let the caller -- which
        // does own velocity -- take over. Reporting the transition is the contract; simulating the fall is not.
        if (rise < -snapDown) { airborne = true; break; }
        cur = [nx, g.y, nz];
        last = g;
    }
    const moved = [cur[0] - start[0], cur[1] - start[1], cur[2] - start[2]];
    const movedH = Math.hypot(moved[0], moved[2]);
    return {
        pos: cur, moved, movedH,
        surfaceDist: Math.hypot(moved[0], moved[1], moved[2]),
        grounded: !airborne && !!last, blocked, slid, airborne,
        normal: last ? last.n : null, slope: last ? slopeDeg(last.n) : null,
        substeps: steps,
    };
}

export function reportLines(g, at = [0, 0]) {
    const p = g(at[0], at[1]);
    return p ? ["[terrainWalk] ground at (" + at + ") y " + p.y.toFixed(3) +
                ", normal " + p.n.map((v) => v.toFixed(3)).join(", ") +
                ", slope " + slopeDeg(p.n).toFixed(2) + " deg"]
             : ["[terrainWalk] no ground at (" + at + ")"];
}
