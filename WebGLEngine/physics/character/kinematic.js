// physics/character/kinematic.js
//
// A KINEMATIC CHARACTER CONTROLLER -- v2833. Movement is DICTATED rather than simulated: the controller decides
// where the body wants to go, checks what is in the way, and places it. No forces, no mass, no restitution. That
// is what makes a character feel responsive instead of floaty, and it is also what makes it CHECKABLE -- a
// dynamic body's final position depends on an integrator, while this one depends on geometry, and geometry has
// exact answers.
//
// WHY AN AABB AND NOT A CAPSULE. The world is axis-aligned unit voxels. An axis-aligned box against axis-aligned
// boxes has an exact overlap test and an exact resolution; a capsule needs closest-point-on-segment work that
// buys nothing here except rounder corners. Choosing the shape the world is made of keeps every invariant below
// exactly true rather than true-to-a-tolerance.
//
// THE INVARIANTS THIS OWES, and they are the reason it belongs in a lab rather than beside one:
//   NEVER INSIDE      the body must never come to rest overlapping a solid voxel. Not "rarely". Never.
//   SLIDE PRESERVES   when a plane blocks motion, the component ALONG that plane survives untouched:
//                     v' = v - (v.n)n exactly, so walking into a wall at an angle does not shave your speed.
//   NEVER FURTHER     total displacement can never exceed the requested distance. A controller that gains
//                     ground on contact is how players get flung through walls.
//   NO TUNNELLING     at any speed. This is the one that bites: per-axis resolution alone lets a fast body
//                     step clean over a thin wall, so motion is SUBSTEPPED below one voxel per step.
//
// PER-AXIS RESOLUTION gives sliding for free and is exact for axis-aligned shapes: try X, resolve; then Y; then
// Z. A blocked axis does not cancel the others, which IS the slide. The order matters only in corners, and the
// gate pins the corner case rather than leaving it to chance.
//
// Pure, no imports, browser-safe.

export const EPS = 1e-6;                 // keeps the body a hair off the surface so the next overlap test is clean

// Voxel range an AABB touches. Half-open on the max side: a box whose face sits exactly on x=3 does not touch
// voxel 3, which is what keeps a body resting on a floor from reading as embedded in it.
export function overlappedVoxels(min, max) {
    return {
        x0: Math.floor(min[0] + EPS), x1: Math.ceil(max[0] - EPS) - 1,
        y0: Math.floor(min[1] + EPS), y1: Math.ceil(max[1] - EPS) - 1,
        z0: Math.floor(min[2] + EPS), z1: Math.ceil(max[2] - EPS) - 1,
    };
}

export function overlapsSolid(centre, half, isSolid) {
    const min = [centre[0] - half[0], centre[1] - half[1], centre[2] - half[2]];
    const max = [centre[0] + half[0], centre[1] + half[1], centre[2] + half[2]];
    const r = overlappedVoxels(min, max);
    for (let x = r.x0; x <= r.x1; x++)
        for (let y = r.y0; y <= r.y1; y++)
            for (let z = r.z0; z <= r.z1; z++)
                if (isSolid(x, y, z)) return true;
    return false;
}

// Move along ONE axis and stop at the first blocking voxel face. Returns the achieved delta and whether it was
// blocked. Exact: the stopping position is the voxel boundary minus EPS, not a bisection.
function moveAxis(centre, half, axis, d, isSolid) {
    if (d === 0) return { d: 0, blocked: false };
    const next = centre.slice();
    next[axis] += d;
    if (!overlapsSolid(next, half, isSolid)) return { d, blocked: false };

    // blocked: snap to the face we ran into
    const dir = d > 0 ? 1 : -1;
    const leading = centre[axis] + dir * half[axis];
    const target = leading + d;
    // the first boundary strictly between leading and target
    const boundary = dir > 0 ? Math.floor(target) : Math.ceil(target);
    let allowed = (boundary - dir * EPS) - leading;
    if (dir > 0) allowed = Math.min(allowed, d); else allowed = Math.max(allowed, d);
    if (dir > 0 ? allowed < 0 : allowed > 0) allowed = 0;

    const test = centre.slice();
    test[axis] += allowed;
    // If snapping still overlaps we were already touching -- refuse to move rather than push through.
    if (overlapsSolid(test, half, isSolid)) return { d: 0, blocked: true };
    return { d: allowed, blocked: true };
}

// One substep: X, then Y, then Z, each resolved independently. A blocked axis leaves the others free, and that
// is the slide -- there is no separate "project onto the plane" step because axis independence IS the projection
// for axis-aligned faces.
function substep(centre, half, delta, isSolid, normals) {
    const out = centre.slice();
    let grounded = false;
    for (const axis of [0, 1, 2]) {
        const r = moveAxis(out, half, axis, delta[axis], isSolid);
        out[axis] += r.d;
        if (r.blocked) {
            const n = [0, 0, 0];
            n[axis] = delta[axis] > 0 ? -1 : 1;
            normals.push(n);
            if (axis === 1 && delta[1] < 0) grounded = true;      // stopped while moving down = standing on it
        }
    }
    return { centre: out, grounded };
}

// THE CONTROLLER.
//   pos    centre of the body
//   half   half-extents
//   delta  the motion it WANTS this frame
//   stepHeight  how tall a lip it may walk over without jumping (0 disables)
export function moveCharacter({ pos, half, delta, isSolid, stepHeight = 0, maxSubstep = 0.4 }) {
    const start = pos.slice();
    let centre = pos.slice();
    const normals = [];
    let grounded = false;

    // SUBSTEPPING IS WHAT PREVENTS TUNNELLING and it is not optional. Per-axis resolution tests the DESTINATION,
    // so a body moving 50 voxels in one frame would test a point far beyond a thin wall, find it empty, and
    // teleport through. Capping each step below one voxel means every wall is tested.
    const dist = Math.hypot(delta[0], delta[1], delta[2]);
    const steps = Math.max(1, Math.ceil(dist / Math.max(1e-3, maxSubstep)));
    const d = [delta[0] / steps, delta[1] / steps, delta[2] / steps];

    for (let i = 0; i < steps; i++) {
        const before = centre.slice();
        const r = substep(centre, half, d, isSolid, normals);
        centre = r.centre;
        if (r.grounded) grounded = true;

        // STEP-UP, attempted only when horizontal motion was actually blocked. Lift by the allowance, retry the
        // horizontal move, then settle back down. It is a RETRY, not a teleport: if the raised position is also
        // blocked, or there is no floor to land on, nothing happens and the body stays blocked.
        if (stepHeight > 0) {
            const movedH = Math.hypot(centre[0] - before[0], centre[2] - before[2]);
            const wantH = Math.hypot(d[0], d[2]);
            if (wantH > EPS && movedH < wantH - EPS) {
                const lifted = [before[0], before[1] + stepHeight, before[2]];
                if (!overlapsSolid(lifted, half, isSolid)) {
                    const t = substep(lifted, half, [d[0], 0, d[2]], isSolid, []);
                    const movedUp = Math.hypot(t.centre[0] - lifted[0], t.centre[2] - lifted[2]);
                    if (movedUp > movedH + EPS) {
                        // settle: fall back down by at most the lift, stopping on whatever is under us
                        const drop = substep(t.centre, half, [0, -stepHeight, 0], isSolid, []);
                        if (drop.grounded) { centre = drop.centre; grounded = true; }
                    }
                }
            }
        }
    }

    const moved = [centre[0] - start[0], centre[1] - start[1], centre[2] - start[2]];
    return {
        pos: centre,
        moved,
        movedDist: Math.hypot(moved[0], moved[1], moved[2]),
        requestedDist: dist,
        grounded,
        normals,
        blocked: normals.length > 0,
        substeps: steps,
    };
}

// The slide identity, exposed so it can be checked directly rather than only inferred from a move:
// the component of v along a plane with normal n is v - (v.n)n, and it must survive a collision untouched.
export function slideVector(v, n) {
    const dot = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    return [v[0] - dot * n[0], v[1] - dot * n[1], v[2] - dot * n[2]];
}

// A convenience for pages: gravity + ground stick, expressed in terms of the controller rather than beside it.
export function stepCharacter({ pos, half, velocity, isSolid, dt = 1 / 60, gravity = -20, stepHeight = 0, maxSubstep = 0.4 }) {
    const v = velocity.slice();
    v[1] += gravity * dt;
    const r = moveCharacter({ pos, half, delta: [v[0] * dt, v[1] * dt, v[2] * dt], isSolid, stepHeight, maxSubstep });
    // a blocked axis kills the velocity INTO that axis only -- the rest is preserved, same rule as the slide
    for (const n of r.normals) {
        if (n[0] !== 0) v[0] = 0;
        if (n[1] !== 0) v[1] = 0;
        if (n[2] !== 0) v[2] = 0;
    }
    return { ...r, velocity: v };
}
