// FILE: render/screenSpaceError.js
// VERSION: v4150 -- how big a detail actually IS on the screen, in pixels.
//
// *** A CORRECTION FIRST, BECAUSE THIS MODULE EXISTS ON THE STRENGTH OF A CLAIM THAT WAS WRONG. ***
// Reporting on DanWatkins/Terrain3D, I told Keith its transferable idea was "the screen-space-error -> tess-level
// heuristic". IT IS NOT. Reading Deployment/Shaders/terrain/terrain.tcs.glsl afterwards: lodForChunkPos() is a
// plain DISTANCE RAMP -- distance(cameraPos, chunkCentre), full detail inside lodNear, linear interpolation out
// to lodFar, minimum beyond -- and the commented-out alternative below it is distance-based too. There is no
// projection in that file, no field of view, and no viewport height. I named a technique the repository does not
// contain, and the honest response is to build the thing that was actually described rather than to quietly port
// a ramp and let the earlier sentence stand.
//
// THE ONE IDEA IN THAT SHADER GENUINELY WORTH TAKING is a different line, and it is kept below as edgeLevel():
// its comment reads "succumb to your neighbor to avoid cracking" -- the two shared outer edges of a patch adopt
// the NEIGHBOUR's level rather than their own, so adjacent patches agree along the edge they share and no
// T-junction crack opens between them. That is the hard part of every level-of-detail scheme and it is three
// lines long.
//
// ---- WHY DISTANCE ALONE IS THE WRONG MEASURE -----------------------------------------------------------------
// A distance ramp answers "how far away is it" when the question is "can anyone SEE the difference". Those come
// apart the moment anything else changes: zooming in (a narrower field of view) magnifies everything at the same
// distance, a 4K panel resolves detail a 720p one cannot, and the Steam Deck's 1280x800 resolves less than either.
// A ramp tuned on one of those is mistuned on the other two, which is why lodNear and lodFar are uniforms somebody
// has to keep tuning by hand.
//
// SCREEN-SPACE ERROR asks the real question. For a perspective projection with vertical field of view t and a
// viewport h pixels tall, a feature of world size e at distance d covers about
//
//     pixels = e * h / (2 * d * tan(t/2))
//
// -- the standard formula, the same one Cesium and the OGC 3D Tiles spec use to drive their own refinement. Feed
// it the GEOMETRIC ERROR (how much height a coarser mesh would get wrong, in world units) and the answer is how
// many pixels of error the viewer would actually see. A target of one pixel then means one pixel on every device,
// at every zoom, with nothing to re-tune.
//
// *** WHAT THIS MODULE DOES NOT DO, AND IT IS THE LARGER HALF. *** WebGL2 has no tessellation stage at all, so
// there is no gl_TessLevelOuter here to write and nothing to port a tessellation control shader ONTO. Worse for
// the analogy: this engine has no per-chunk mesh level of detail either -- world/chunkMesherCore.js meshes every
// chunk at one voxel step, and world/DynamicGridRadius.js steers VIEW DISTANCE from the frame rate rather than
// detail from anything. So this file is the metric and the neighbour rule, wired to the one decision that exists
// today (see growthWouldBeInvisible below). Meshing a chunk at a coarser step is a real feature with a real cost
// and it is NOT snuck in here under the name of a heuristic.
"use strict";

/** Guard shared by every entry point: a bad number must not silently become a plausible pixel count. */
function finitePositive(x) { return typeof x === "number" && isFinite(x) && x > 0; }

/**
 * Pixels of error a feature of world size `geometricError` shows at `distance`.
 *
 * @param geometricError world units a coarser representation would be wrong by
 * @param distance       world units from the eye; must be > 0
 * @param screenHeightPx viewport height in DEVICE pixels (multiply CSS pixels by devicePixelRatio)
 * @param fovYRad        VERTICAL field of view in radians
 * @returns pixels, or NaN if any input cannot produce a meaningful answer
 */
export function screenSpaceError({ geometricError, distance, screenHeightPx, fovYRad }) {
    if (!finitePositive(distance) || !finitePositive(screenHeightPx) || !finitePositive(fovYRad)) return NaN;
    if (typeof geometricError !== "number" || !isFinite(geometricError) || geometricError < 0) return NaN;
    if (fovYRad >= Math.PI) return NaN;                       // tan(t/2) diverges at and past 180 degrees
    return (geometricError * screenHeightPx) / (2 * distance * Math.tan(fovYRad / 2));
}

/** The inverse: the distance at which that feature falls to `targetPx`. Infinity when it never does. */
export function distanceForError({ geometricError, targetPx, screenHeightPx, fovYRad }) {
    if (!finitePositive(targetPx) || !finitePositive(screenHeightPx) || !finitePositive(fovYRad)) return NaN;
    if (typeof geometricError !== "number" || !isFinite(geometricError) || geometricError < 0) return NaN;
    if (fovYRad >= Math.PI) return NaN;
    if (geometricError === 0) return 0;                       // no error at any distance: nothing to resolve
    return (geometricError * screenHeightPx) / (2 * targetPx * Math.tan(fovYRad / 2));
}

/**
 * Geometric error of a chunk meshed at `step` voxels instead of 1.
 *
 * Halving the resolution can misplace a surface by at most half the step it skipped, so the error is
 * (step - 1) / 2 voxels, scaled to world units. `step` of 1 is the full-detail mesh and has error 0 BY
 * DEFINITION -- not "very small", exactly zero, because that mesh is the reference the others are wrong against.
 */
export function chunkGeometricError(step, voxelSize = 1) {
    if (!finitePositive(voxelSize) || typeof step !== "number" || !isFinite(step) || step < 1) return NaN;
    return ((step - 1) / 2) * voxelSize;
}

/**
 * The coarsest level whose error still lands within `targetPx`, or the finest level if none does.
 *
 * COARSEST-THAT-FITS, not nearest: the whole point is to spend as little as the target allows. `levels` is
 * ordered fine-to-coarse and is the CALLER's, because what levels exist is a property of the mesher and not of
 * this arithmetic -- a module that invented its own ladder would be a second declaration of the mesher's.
 */
export function levelFor({ levels, distance, screenHeightPx, fovYRad, targetPx = 1, voxelSize = 1 }) {
    if (!Array.isArray(levels) || !levels.length) return null;
    if (!finitePositive(targetPx)) return null;
    let best = levels[0];
    for (const step of levels) {
        const px = screenSpaceError({ geometricError: chunkGeometricError(step, voxelSize), distance, screenHeightPx, fovYRad });
        if (!isFinite(px)) return levels[0];                  // a question we cannot answer gets the SAFE answer
        if (px <= targetPx && step >= best) best = step;
    }
    return best;
}

/**
 * *** SUCCUMB TO YOUR NEIGHBOUR. *** Terrain3D's own three lines, and the reason its patches do not crack: the
 * level used along an edge two patches SHARE is the finer of the two, so both agree on how many vertices sit on
 * it. Take the coarser and the finer patch's extra vertices land on nothing -- a T-junction, which shows as a
 * one-pixel seam of background light between two triangles that are meant to be touching.
 *
 * Numerically finer means a SMALLER step, so this is a min and not a max. Getting that backwards produces
 * terrain that looks correct in a screenshot and cracks whenever the camera moves.
 */
export function edgeLevel(a, b) {
    if (!isFinite(a)) return b;
    if (!isFinite(b)) return a;
    return Math.min(a, b);
}

/**
 * Would widening the view by one ring add anything a person could see?
 *
 * This is the ONE decision in this engine today that a screen-space measure can improve, and it is deliberately
 * one-directional. world/DynamicGridRadius.js grows and shrinks view distance from the FRAME RATE, which is a
 * LAGGING signal: it can only shrink after frames have already been dropped. Asking first whether a new ring's
 * chunks would even be resolvable is a LEADING one -- and it is applied to GROWTH ONLY, never to shrinking,
 * because a veto that could also force a shrink could fight the frame-rate loop and oscillate. Refusing to grow
 * can at worst leave the view where it already was.
 *
 * @returns true when the new ring's chunks fall below `targetPx` and growing would buy nothing visible
 */
export function growthWouldBeInvisible({ ringDistance, chunkSize, screenHeightPx, fovYRad, targetPx = 1, voxelSize = 1 }) {
    // The error a whole chunk would carry if it were dropped entirely -- half its own size, the same
    // (step-1)/2 rule taken to step = chunkSize. If even THAT is under the target, the ring is not resolvable.
    const px = screenSpaceError({
        geometricError: chunkGeometricError(chunkSize, voxelSize),
        distance: ringDistance, screenHeightPx, fovYRad,
    });
    if (!isFinite(px)) return false;                          // cannot tell -> do not veto; the FPS loop still rules
    return px < targetPx;
}
