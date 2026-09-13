// WebGLEngine/physics/character/fallBody.mjs -- v4544
//
// *** BACKLOG "terrain-controller" PIECE (1): NOBODY PLAYS THE OTHER HALF. *** The entry reads "NO VERTICAL
// VELOCITY. Jumping, falling and ceilings are not owned by this module; leaving the ground ends the step
// with airborne=true and the caller takes over. That contract is deliberate and it is also a hole: nothing
// in the tree currently plays the other half." This is the other half.
//
// ---- WHAT THE HOLE ACTUALLY COSTS, MEASURED IN A REAL BOOT ---------------------------------------------
//
// simulation/BotManager.js:1227 branches on `if (r.grounded || r.blocked)`. A body more than `snapDown`
// above the ground is AIRBORNE and matches neither, so it falls through to a branch that writes
// `bot.y = world._heightAt(x, z) + BOT_EYE` -- the terrain MODEL, in one frame, with no fall and no voxel
// check at all. The standing-still branch a few lines later writes the same line every frame.
//
// Over 441 columns of the engine's own world, comparing that write against the surface a FALLING body would
// actually reach:
//
//     167 of 441 columns disagree        37.9%
//     worst disagreement                 44 voxels
//     _heightAt is INSIDE SOLID ROCK     39 columns, 8.8%
//     columns with more than one surface 225, 51.0%
//
// At (-30, -60) the model says 24 and a falling body lands at 8, on the floor of a cave under a hillside;
// at (-12, -60) it is 26 against 13. *** THIS IS THE DEFECT v4542 REPAIRED, STILL LIVE ON THE BRANCH v4542
// DID NOT TOUCH *** -- and v4540's repair is undone one file over in the same way, because the standing-
// still branch ignores terrainWalk's answer and writes the model's.
//
// ---- AND "AIRBORNE" IS NOT REACHED WHERE THE ENTRY SAYS IT IS ------------------------------------------
//
// The entry says "a body that walks off a ledge stops there". Driven at a five-unit cliff, 200 frames, over
// every adapter:
//
//     latticeGround    grounded 35, BLOCKED 165, airborne 0
//     heightfieldGround grounded 35, BLOCKED 165, airborne 0
//     functionGround   grounded 41, BLOCKED 159, airborne 0
//     meshGround       grounded 47, blocked 0,   AIRBORNE 153
//     meshGround, void below (the oracle returns null)  BLOCKED 153
//
// *** AT A CLIFF, THE THREE ADAPTERS A LIVE WORLD USES REPORT blocked, NOT airborne, *** because the drop
// reads as a steep slope and the slope test runs before the step test. The body stops at the edge and
// stepTerrainFan walks it along the rim, which is reasonable. What DOES reach airborne on those adapters is
// a body ABOVE the ground -- 1.2 up is grounded and 1.3 up is airborne, at snapDown 1.2 -- which is the
// falling case and is the one this module is for. The entry's sentence is about the wrong state.
//
// ---- THE DESIGN, AND THE ONE THING THAT MUST NOT BE BORROWED FROM THE WALKER ---------------------------
//
// Integrate vy, ask an oracle for the surface UNDER the body, and clamp to it if the step would pass it.
//
// *** THE PROBE IS TAKEN WITH NO REACH, AND THE FIRST DRAFT USED THE WALKING ALLOWANCE AND LIFTED A FALLING
// BODY UPWARDS. *** `stepUp` is how far a body may CLIMB onto something; handing it to a falling body lets
// the probe name a surface ABOVE it, and the clamp then "lands" it up there. Measured on a column standable
// at 1, 9 and 21: a body falling from y = 20.5 with the walking reach of 1.2 was LIFTED to 21 in one frame,
// and with no reach it falls to 9 in 64 frames, which is where it was always going. That is v4540's defect
// -- "standing still was a licence to be moved" -- arriving in the branch v4540 did not touch, and it
// arrived because a number was borrowed from the module next door.
//
// *** AND THE FALL CANNOT TUNNEL, BY CONSTRUCTION RATHER THAN BY SUBSTEPPING. *** The oracle is re-asked at
// the body's CURRENT height every frame and returns the first surface below it, so the clamp can never let
// the body past that surface however fast it is moving. Driven from just above a thin ledge at initial
// velocities of -1, -20, -55, -500, -10,000 and -10,000,000: every one lands on the ledge. capsuleMove
// (v4541) has to substep because its contact query is local; this does not, because its query is a column.
//
// ---- WHAT THIS DOES NOT OWN ----------------------------------------------------------------------------
//
// NO HORIZONTAL MOTION. It moves a body up and down and nothing else; terrainWalk owns the ground and
// capsuleMove owns the sweep. A caller runs both and this one second.
// NO STEP-UP. v4543 measured that neither capsuleGround nor capsuleMove mounts a step for a body with a
// radius, and named it a policy nobody has built. This does not build it either.
// NO MOVING PLATFORMS, for the reason capsuleMove gives: the geometry must not change between frames.
// NO AIR CONTROL, no jump buffering, no coyote time -- those are a controller's policy, not a body's physics,
// and inventing them here would put a game-feel decision in a module with no game to feel it.
"use strict";

/** Metres per second squared. Negative is down, and the sign is in the number rather than in the code. */
export const GRAVITY = -20;

/**
 * Terminal speed, as a velocity rather than a magnitude.
 *
 * It is a CLAMP AND NOT A DRAG MODEL: real terminal velocity is where drag balances weight, which depends on
 * the body's area and the air's density and is not something this module knows. -55 m/s is about what a
 * human reaches face-down, and it is here so a body that falls a long way does not arrive with a velocity
 * whose only effect is to make the landing frame's arithmetic large.
 */
export const TERMINAL = -55;

/**
 * A voxel column with named solid layers: the fixture every reading in this header was taken on.
 *
 * `solid` lists the y of each solid cell. The default is 0, 8 and 20, which for a body two cells tall is
 * standable at 1, 9 and 21 -- a floor, a thin ledge and a deck, which is the smallest world that can tell a
 * fall from a teleport and a landing from a lift. `_heightAt` names the TOP surface on purpose, because
 * that is what the terrain model does on the real world and it is what the branch this module replaces
 * wrote.
 */
export function layeredWorld({ solid = [0, 8, 20], chunkHeight = 64, model = null } = {}) {
    const set = new Set(solid);
    const top = Math.max(...solid) + 1;
    return {
        chunkHeight,
        isAir: (x, y, z) => !set.has(y),
        _heightAt: () => (model === null ? top : model),
    };
}

/**
 * One vertical step.
 *
 * `surfaceUnder(x, z, y)` returns the highest surface AT OR BELOW `y` that this body could stand on, or
 * null. `ceilingOver(x, z, y)` returns THE HIGHEST FEET-y THIS BODY MAY OCCUPY, or null; omit it and a body
 * moving up is unobstructed. Both are injected, so this module imports neither the voxel probe nor the mesh
 * one and works with either -- the same reason terrainWalk takes a ground oracle rather than a world.
 *
 * *** THE CEILING ORACLE IS IN FEET AND WAS NAMED IN HEADS, WHICH IS A UNITS BUG IN A CONTRACT. *** It was
 * `ceilingAbove`, documented as "the lowest obstruction above it", and the code clamped the body's FEET to
 * whatever it returned -- so an adapter written to the name would put a body-height of head through the
 * roof. The subtraction belongs to the adapter, which knows the body; the rename is what stops a caller
 * keeping the old units by keeping the old name.
 *
 * Returns `{ pos, vy, landed, airborne, hitCeiling, surface }`. `landed` is the EDGE and `airborne` is the
 * state: a body that lands reports landed true and airborne false on that frame and neither on the next,
 * because it is then the walker's.
 */
export function fallStep({
    pos, vy = 0, surfaceUnder, ceilingOver = null,
    dt = 1 / 60, gravity = GRAVITY, terminal = TERMINAL,
} = {}) {
    const x = pos[0], z = pos[2], y = pos[1];
    const v = Math.max(terminal, vy + gravity * dt);
    const want = y + v * dt;

    if (v > 0) {
        const cap = ceilingOver ? ceilingOver(x, z, y) : null;
        if (cap !== null && want >= cap) {
            // *** A CLAMP, NEVER A TELEPORT, AND THE FIRST DRAFT WAS A TELEPORT IN ONE DIRECTION. *** It
            // returned [x, cap, z] unconditionally, so a body ALREADY above the cap was dragged DOWN to it:
            // measured, feet at 15 with a cap of 12 moved -3.0 in one frame and feet at 40 moved -28.0.
            // A body above the cap is not this function's business -- it got there some other way and
            // pulling it down is the same species of defect as v4540's lift, pointing the other way. The
            // velocity is spent either way, which is what a caller means by hitting its head, and it is one
            // fewer invented number than a bounce.
            // a body BELOW the cap rises to it; one already at or above it stays exactly where it is
            return { pos: [x, y >= cap ? y : cap, z], vy: 0, landed: false, airborne: true,
                     hitCeiling: true, surface: null };
        }
        return { pos: [x, want, z], vy: v, landed: false, airborne: true, hitCeiling: false, surface: null };
    }

    // *** NO REACH. See the header: the walking allowance belongs to the walker. ***
    const surface = surfaceUnder(x, z, y);
    if (surface !== null && want <= surface) {
        return { pos: [x, surface, z], vy: 0, landed: true, airborne: false, hitCeiling: false, surface };
    }
    return { pos: [x, want, z], vy: v, landed: false, airborne: true, hitCeiling: false, surface };
}

/**
 * The surface oracle over a VOXEL world, built from world/surfaceProbe.mjs's body-aware probe.
 *
 * Passed `stepUp: 0` on purpose and the header says why. `standHeightAt` with a body scans DOWN from
 * `y + stepUp`, so any reach at all lets it name a surface above the body.
 */
export function voxelSurface(standHeightAt, world, { body = 2 } = {}) {
    return (x, z, y) => standHeightAt(world, x, z, { y, stepUp: 0, body });
}

/**
 * The same over a triangle mesh.
 *
 * *** IT TAKES THE BUILDER AND NOT A BUILT ORACLE, AND THE FIRST DRAFT TOOK THE ORACLE AND COULD NOT
 * ENFORCE THE ZERO. *** capsuleGround's `stepUp` defaults to 0.5, so an oracle handed in already built
 * carries a walking reach this module has no way to remove -- and the mesh side then had exactly the defect
 * the voxel side's `stepUp: 0` exists to prevent. Measured on capsuleGround's own tunnel fixture, a body
 * with its feet at 2.6 under a deck at 3: the default oracle LIFTS it to 3 in one frame, and with the reach
 * forced to zero it falls to 0 in 31 frames. Injecting the function is what lets this file insist, which is
 * the shape voxelSurface already had.
 */
export function meshSurface(capsuleGround, bvh, opts = {}) {
    const oracle = capsuleGround(bvh, { ...opts, stepUp: 0 });
    return (x, z, y) => { const g = oracle(x, z, y); return g ? g.y : null; };
}

/**
 * Run a body until it lands or the budget runs out. The loop a caller would otherwise write, so a gate can
 * measure a whole fall rather than a frame of one.
 */
export function fallUntilLanded(opts, { maxFrames = 1200 } = {}) {
    let pos = opts.pos.slice(), vy = opts.vy ?? 0, frames = 0, peakSpeed = 0, hitCeiling = false;
    for (; frames < maxFrames; frames++) {
        const r = fallStep({ ...opts, pos, vy });
        pos = r.pos; vy = r.vy;
        if (r.hitCeiling) hitCeiling = true;
        peakSpeed = Math.max(peakSpeed, Math.abs(vy));
        if (r.landed) return { pos, vy, frames: frames + 1, landed: true, peakSpeed, hitCeiling };
    }
    return { pos, vy, frames, landed: false, peakSpeed, hitCeiling };
}

/**
 * *** RE-DERIVED BY tools/ship/fallBody-selfcheck.mjs ON EVERY RUN. *** Readings at v4544.
 */
export const FALL_AT_V4544 = Object.freeze({
    at: "v4544",
    gravity: -20, terminal: -55,
    // the live cost of the branch this closes, measured in a real boot over 441 columns
    liveColumns: 441,
    liveDiffer: 167,
    liveDifferPct: 37.9,
    liveWorst: 44,               // voxels between the model's answer and where a falling body lands
    liveInsideRock: 39,
    liveInsidePct: 8.8,
    liveMultiSurface: 225,
    // which state a cliff actually produces, per adapter, over 200 frames
    cliffBlockedLattice: 165,
    cliffAirborneLattice: 0,
    cliffAirborneMesh: 153,
    groundedAt: 1.2,             // a body this far above the ground is grounded at snapDown 1.2
    airborneAt: 1.3,             // ...and this far above it is not
    // the reach defect, and the fall it hid
    liftedByWalkingReach: 21,    // where a body falling from 20.5 was put, using stepUp 1.2
    fallsTo: 9,                  // ...and where it actually goes, with no reach
    fallsToFrames: 64,
    // a fall is a fall
    dropFrom: 40,
    dropFrames: 83,              // 1.38 s, against ONE frame for the teleport it replaces
    teleportFrames: 1,
    // and it cannot tunnel, at any speed
    tunnelTestedTo: 10000000,
    // the plane the first draft of the wiring grounded, and the three defects a reading party found in it
    planeHeadSpeed: 14,          // units/s a bot_plane travels at HEAD
    planeFirstDraft: 0,          // ...and under the first draft of the airborne branch
    ceilingTeleportFrom: 40,     // feet already above a cap of 12, dragged down in one frame
    ceilingTeleportBy: -28,
    meshLiftedTo: 3,             // capsuleGround's default reach lifting a body whose feet are at 2.6
    meshFallsTo: 0,
    meshFallFrames: 31,
});
