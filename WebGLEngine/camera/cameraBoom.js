// WebGLEngine/camera/cameraBoom.js -- the third-person camera boom against a voxel world.
//
// The camera sits behind and above the body. When something is in the way it comes IN along the boom, never up and
// around, and it must never end up inside a voxel or on the far side of one. That is a collision question about a
// BOX (the camera's near-plane clearance), not a ray: a ray that grazes a corner leaves the box half inside it.
//
// *** WHAT IT REPLACES, AND THE DEFECT THAT IS THE REASON. *** camera/camera.js's _thirdPersonEye answered the voxel
// case by sampling a COLUMN'S TOP at four points along the boom, and both of its errors were measured by putting it back
// (the gate's sabotage A4). A column's top is its highest solid, so a ceiling, a bridge or an overhang ABOVE the boom
// read as ground under it: under any roof the eye collapsed to 0.825 of 4.5. And it never asked about the camera's own
// box, so under an overhang low enough to cross the boom it stopped the eye at z 6.325 with the box inside the
// overhang's voxel. (A wall one voxel thick was NOT skipped: the column read is blended across neighbours and a sample
// every 1.125 voxels always reaches it. A first draft of this header said otherwise; the same sabotage corrected it.)
// This module asks the voxels themselves, so it pulls in for what is in the way, all of it, and only for that.
//
// *** THE SWEEP IS EXACT, NOT SAMPLED. *** For a box moving along a straight segment, the first moment it touches a
// voxel is the slab entry time: per axis an open interval of t in which the box overlaps that voxel's extent, and the
// box overlaps the voxel when all three intervals hold at once. The earliest such moment over every solid voxel the
// segment's swept box can reach is where the free part of the boom ends. Every position before it is free, which is
// what lets the camera ease out along the boom afterwards without ever re-testing.
//
// *** ONE CONVENTION, kinematic.js's, AND THE GATE ASSERTS IT RATHER THAN THIS COMMENT. *** A voxel (x,y,z) is the
// unit cell [x,x+1) x [y,y+1) x [z,z+1), and a box touches it under kinematic.overlappedVoxels's half-open rule with
// its EPS: min < v + 1 - EPS and max > v + EPS. The same rule written twice is a rule that can drift, so the result is
// also confirmed with kinematic.overlapsSolid itself, and the gate counts how often that confirmation had to step in.
//
// Pure, browser-safe. Imports physics/character/kinematic.js only for its EPS and overlapsSolid. It lives here, beside
// camera.js, and not in physics/character/: it is not a character controller -- it has no gravity, step or speed for
// tools/ship/controllerAgreement.mjs to compare -- and that directory's census counts controllers.

import { EPS, overlapsSolid } from "../physics/character/kinematic.js";

const norm3 = (d) => { const l = Math.hypot(d[0], d[1], d[2]); return l > 0 ? [d[0] / l, d[1] / l, d[2] / l] : [0, 0, 0]; };
const at = (s, d, t) => [s[0] + d[0] * t, s[1] + d[1] * t, s[2] + d[2] * t];

/**
 * Sweep an axis-aligned box of half-extents `half` from `start` along unit direction `dir` for up to `maxDist`.
 * Returns { free, first, startBlocked, voxel }:
 *   first        the earliest t in (0, maxDist] at which the box would touch a solid voxel, or Infinity if none does
 *   free         how far it may go: maxDist when nothing is touched on the way, else 0 <= free < first
 *   startBlocked true when the box already overlaps a solid at `start` (free is then 0)
 *   voxel        the voxel that ends the free part, for display and for the gate
 */
export function sweepBox(start, dir, maxDist, half, isSolid) {
    const d = norm3(dir);
    if (overlapsSolid(start, half, isSolid)) return { free: 0, first: 0, startBlocked: true, voxel: null };
    if (!(maxDist > 0) || (d[0] === 0 && d[1] === 0 && d[2] === 0)) return { free: Math.max(0, maxDist || 0), first: Infinity, startBlocked: false, voxel: null };
    const end = at(start, d, maxDist);
    const lo = [], hi = [];
    for (let a = 0; a < 3; a++) {
        lo.push(Math.floor(Math.min(start[a], end[a]) - half[a]) - 1);
        hi.push(Math.floor(Math.max(start[a], end[a]) + half[a]) + 1);
    }
    let first = Infinity, voxel = null;
    for (let x = lo[0]; x <= hi[0]; x++)
        for (let y = lo[1]; y <= hi[1]; y++)
            for (let z = lo[2]; z <= hi[2]; z++) {
                if (!isSolid(x, y, z)) continue;
                const v = [x, y, z];
                let tin = -Infinity, tout = Infinity;
                for (let a = 0; a < 3 && tin < tout; a++) {
                    // the box overlaps this voxel on axis a while  c - h < v + 1 - EPS  and  c + h > v + EPS
                    const lowEdge = v[a] + EPS - half[a], highEdge = v[a] + 1 - EPS + half[a];   // open interval for c
                    if (d[a] === 0) { if (!(start[a] > lowEdge && start[a] < highEdge)) tout = -Infinity; continue; }
                    const t1 = (lowEdge - start[a]) / d[a], t2 = (highEdge - start[a]) / d[a];
                    tin = Math.max(tin, Math.min(t1, t2)); tout = Math.min(tout, Math.max(t1, t2));
                }
                if (tin < tout && tout > 0 && tin < first) { first = Math.max(0, tin); voxel = v; }
            }
    return { free: first > maxDist ? maxDist : first, first, startBlocked: false, voxel };
}

/**
 * Where the camera can go. The boom rises `lift` from `pivot`, then runs `dist` along `back` (from the body toward the
 * desired camera, any length). Returns:
 *   pos        the camera position
 *   lift, dist what was achieved of each, never more than asked
 *   wanted     { lift, dist } as asked
 *   start      the top of the lift, where the back segment starts -- placeAt(r, d) puts the camera d along it
 *   blocked    the back segment was cut short
 *   corrected  times the final kinematic.overlapsSolid confirmation had to pull the camera in further (0 expected)
 */
export function cameraBoom({ pivot, back, dist, lift = 0, half = [0.2, 0.2, 0.2], skin = 0.3, isSolid }) {
    const up = sweepBox(pivot, [0, 1, 0], lift, half, isSolid);
    const liftGot = up.startBlocked ? 0 : (up.first > lift ? lift : Math.max(0, up.first - skin));
    const start = [pivot[0], pivot[1] + liftGot, pivot[2]];
    const b = norm3(back);
    const sw = sweepBox(start, b, dist, half, isSolid);
    let got = sw.startBlocked ? 0 : (sw.first > dist ? dist : Math.max(0, sw.first - skin));
    let corrected = 0;
    // the confirmation: the same rule, asked of kinematic.overlapsSolid at the answer. Pull in by the skin until it
    // agrees, and at worst to the start, which the lift sweep already found free.
    while (got > 0 && overlapsSolid(at(start, b, got), half, isSolid)) { got = Math.max(0, got - skin); corrected++; }
    return { pos: at(start, b, got), lift: liftGot, dist: got, wanted: { lift, dist }, start, dir: b,
             blocked: got < dist, startBlocked: up.startBlocked, corrected, voxel: sw.voxel };
}

/** The camera `d` along a boom cameraBoom returned. Any d in [0, r.dist] is free, because the sweep found no contact
 *  before r.dist -- which is what makes easing along the boom safe without another test. */
export const placeAt = (r, d) => at(r.start, r.dir, Math.max(0, Math.min(d, r.dist)));

/**
 * Ease the boom length toward the safe one. IN is instant (a wall that arrives must not be shown through); OUT is
 * exponential at `rate` per second. Never more than `safe`, so an eased camera is always somewhere placeAt calls free.
 */
export function easeBoom(prev, safe, dt, rate = 6) {
    if (!(Number.isFinite(prev)) || !(prev < safe) || !(dt > 0)) return safe;
    return Math.min(safe, prev + (safe - prev) * (1 - Math.exp(-rate * dt)));
}
