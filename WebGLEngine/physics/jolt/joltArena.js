// physics/jolt/joltArena.js -- jolt-arena.html's scene, so the page and its gate (tools/ship/joltArena-selfcheck.mjs) build
// the same thing. The page draws a side view (x across, y up) of a world that is 3-D, so everything here is about keeping that
// world's bodies where the side view can show them.
//
// 2026-11-03 (unnumbered) -- THREE FIXES, found by the spinning body's fourth round (physics/mechanics/SPINNING_BODY_WIP.md), which
// flew this scene headless:
//   1. ADD CREW SPAWNED ITS FIRST CREW MEMBER INSIDE THE WALL. The crew stood at x = 3.5, 4.9 and 6.3, and the wall's last column
//      reaches x = 3.56, so six of the first member's seven parts started 0.12 to 0.39 m inside its cubes and Jolt shoved them out;
//      a second press dropped the next three into the first. The crew now take the first free spots along the strip, beyond the
//      wall's face (computed from the wall's own numbers) and clear of every body already there.
//   2. FLING CREW SENT THE CREW OFF THE ARENA AT HUNDREDS OF METRES A SECOND. fling() is an impulse, and a ragdoll part of density 1
//      weighs 0.01 to 0.06 kg, so the throw of 30 left at up to 500 m/s (Jolt's cap) and 770 of 840 parts fell off the arena in the
//      round. The crew are now thrown with launch(), a VELOCITY of 30 m/s for the whole figure, and weigh about 4.4 kg each
//      (density 25), so that throw carries about a boulder's momentum and still craters the wall.
//   3. THE ARENA WAS ONLY 1 M DEEP. Any drift in z dropped a body off the ground strip, even a ragdoll merely dropped. The arena is
//      now a slab 1.5 m deep between two invisible panes, with end caps, on a ground as deep as the slab.
//   4. (later the same day, Keith's pick) THE ARENA IS LOCKED TO 2-D. The page draws x, y and the turn about z, and nothing else; its
//      wall, its crew and its boulders are now locked to the xy-plane (the Jolt wrapper's `plane2d`, Jolt's EAllowedDOFs_Plane2D), so
//      the physics is the picture. The panes and caps stay, for anything a page adds without the lock.
"use strict";
import { createStructures } from "./joltStructures.js";
import { createRagdoll } from "./joltRagdoll.js";

export const ARENA = Object.freeze({
    slab: 0.75,                                                                                   // the slab's half-depth in z, between the panes
    ground: Object.freeze({ pos: Object.freeze([0, -0.5, 0]), half: Object.freeze([40, 0.5, 0.75]) }),
    wall: Object.freeze({ x: 0, y: 0, z: 0, cols: 7, rows: 6, half: 0.5, gap: 0.02 }),           // joltStructures' addWall, gap its default
    crew: Object.freeze({ scale: 0.85, density: 25, y: 1.6, dx: 1.4, clear: 0.25, spots: 24 }),
    fling: Object.freeze({ speed: 30, up: 7, spin: 5 }),
    step: Object.freeze({ dt: 1 / 60, substeps: 2 }),
});
/** A ragdoll's half-extent in x at the arena's scale: arm tip to arm tip (joltRagdoll's arms sit at 0.5 with half-length 0.22). */
export const CREW_HALF = (0.5 + 0.22) * ARENA.crew.scale;
/** ...and its extent in y about the figure's origin: the legs' bottom (-0.76) to the head's top (1.1). */
export const CREW_Y = Object.freeze([-0.76 * ARENA.crew.scale, 1.1 * ARENA.crew.scale]);
/** The wall's +x face, from addWall's own spacing. */
export function wallFace(w = ARENA.wall) { return w.x + ((w.cols - 1) / 2) * (2 * w.half + w.gap) + w.half; }
/** Spot n along the strip: beyond the wall's face by the crew's half-width and a clearance, then one crew width apart. */
export const crewSpot = (n) => wallFace() + CREW_HALF + ARENA.crew.clear + n * ARENA.crew.dx;
/** ...and in z, the deepest part's half-depth (the head's 0.17). */
export const CREW_Z = 0.17 * ARENA.crew.scale;
const MARGIN = 0.05;   // the gap a spot keeps from any body already there

/** The arena: its ground, its panes front and back, its end caps, and the wall. Returns the structures and the wall's handles. */
export function buildArena(world) {
    const A = ARENA, L = A.ground.half[0];
    world.addBox({ type: "static", pos: [...A.ground.pos], half: [...A.ground.half] });
    for (const z of [A.slab + 0.25, -A.slab - 0.25]) world.addBox({ type: "static", pos: [0, 10, z], half: [L + 0.5, 10.5, 0.25] });
    for (const x of [L + 0.25, -L - 0.25]) world.addBox({ type: "static", pos: [x, 10, 0], half: [0.25, 10.5, A.slab] });
    const S = createStructures(world), wall = S.addWall({ ...A.wall, plane2d: true });
    return { S, wall };
}
/** Is spot n clear of every dynamic body now in the world? Each body is taken at Jolt's own world-space bounds, the crew at its box. */
export function spotIsFree(world, n) {
    const x = crewSpot(n), y = ARENA.crew.y, lo = [x - CREW_HALF - MARGIN, y + CREW_Y[0] - MARGIN, -CREW_Z - MARGIN], hi = [x + CREW_HALF + MARGIN, y + CREW_Y[1] + MARGIN, CREW_Z + MARGIN];
    for (let i = 0; i < world.bodies.length; i++) {
        if (!world.bodies[i].dynamic) continue;
        const bb = world.raw().bodyOf(i).GetWorldSpaceBounds(), a = [bb.mMin.GetX(), bb.mMin.GetY(), bb.mMin.GetZ()], b = [bb.mMax.GetX(), bb.mMax.GetY(), bb.mMax.GetZ()];   // read at once: a value
        if (a.every((v, k) => v < hi[k]) && b.every((v, k) => v > lo[k])) return false;
    }
    return true;
}
/** ADD CREW: `count` ragdolls, each on the first free spot along the strip; if every spot is taken, dropped from above the first. */
export function addCrew(world, crew, count = 3) {
    for (let k = 0; k < count; k++) {
        let n = 0; while (n < ARENA.crew.spots && !spotIsFree(world, n)) n++;
        const at = n < ARENA.crew.spots ? { x: crewSpot(n), y: ARENA.crew.y } : { x: crewSpot(0), y: ARENA.crew.y + 6 };
        crew.push(createRagdoll(world, { ...at, z: 0, scale: ARENA.crew.scale, density: ARENA.crew.density, plane2d: true }));
    }
    return crew;
}
/** A BOULDER, as the page lobs one: a cube of half-size 0.55 and density 5, locked to the plane, thrown at `v`. */
export function addBoulder(world, pos, v) { const i = world.addBox({ type: "dynamic", pos: [pos[0], pos[1], 0], half: [0.55, 0.55, 0.55], density: 5, plane2d: true }); world.setVelocity(i, [v[0], v[1], 0]); return i; }
/** FLING CREW: every ragdoll thrown toward the wall at the fling's speed, as a velocity (joltRagdoll's launch()). */
export function flingCrew(crew) {
    for (const rag of crew) { const c = rag.center(), dir = c[0] >= 0 ? -1 : 1; rag.launch([dir * ARENA.fling.speed, ARENA.fling.up, 0], ARENA.fling.spin); }
}
