// FILE: camera/camera.js
// VERSION: v9 - INPUT + PROJECTION (fixes 3 latent crashes from v8)
//
// v9 fixes:
//   * _attachInput() was called by the constructor but never defined.
//     The Camera failed to construct on page load. Now implements
//     pointer-lock + mouse-look + WASD/Space/Shift tracking.
//   * getViewProjMatrix() returned this.viewProj which was never
//     computed. Now update() builds the matrix each frame via the
//     shared buildViewProj() helper. Aspect ratio derives from
//     canvas.width/height so DPR-driven resizes are picked up.
//   * Projection params (fov, near, far) added as fields.

import { buildViewProj } from "./buildViewProj.js";
// v4545 -- the body-aware voxel probe, rather than a third copy of its rule. See _terrainTopAt.
import { standHeightAt } from "../world/surfaceProbe.mjs";
// v4548 -- the gated fall, rather than a third and fourth copy of it. See _fallSurface.
import { fallStep } from "../physics/character/fallBody.mjs";

/**
 * *** RE-DERIVED BY tools/ship/playerGround-selfcheck.mjs ON EVERY RUN. *** Readings at v4545.
 */
export const PLAYER_GROUND_AT_V4545 = Object.freeze({
    at: "v4545",
    // the population, measured in a real boot of index.html
    columns: 1681,
    multiSurface: 921,          // columns holding more than one place a body can stand
    multiSurfacePct: 54.8,      // NOT reproducible boot to boot -- the floor below is what a gate may assert
    multiSurfaceFloorPct: 25,
    bodyPlaces: 2687,
    topmostRight: 1681,         // 62.56%, and exactly the column count, which is the finding
    topmostRightPct: 62.56,
    worstGap: 42,               // voxels between the lowest surface and the topmost answer
    // the scan ceiling this query used, against the world's own
    scannedFrom: 80,
    worldChunkHeight: 64,
    // what the defect actually did, driven on a cave with a rising floor
    stuckAtX: 13.92,            // where HEAD stops dead, four units into the cave
    stuckAtY: 2.7,
    repairedX: 27.17,           // and where the body-aware query gets to
    repairedY: 6.7,
    stepUpMax: 1.2,
});

/**
 * *** RE-DERIVED BY tools/ship/playerSlope-selfcheck.mjs ON EVERY RUN. *** Readings at v4546.
 */
export const PLAYER_SLOPE_AT_V4546 = Object.freeze({
    at: "v4546",
    // the population, measured in a real boot of index.html over a 3-unit lattice
    columns: 1681,
    pairs: 6279,                // adjacent walkable column pairs a body could step between
    steep: 254,                 // pairs steeper than 45 degrees -- ground the bots refuse
    steepPct: 4.05,             // NOT reproducible boot to boot; the floor below is what a gate may assert
    steepFloorPct: 1,
    worstDeg: 88.1,
    // *** THE LATTICE EXPRESSES NO SLOPE BETWEEN 45.0 AND 60 DEGREES, AND THAT IS MEASURED RATHER THAN
    // REASONED. *** 1,826 pairs land in the [45, 60) bucket and EVERY ONE of them is exactly 45.0 -- a
    // one-voxel lip -- while every steep pair is 60 or more. So the limit could be 45, 50 or 60 and refuse
    // the identical ground on this world; 45 is chosen to match terrainWalk's default, not because this
    // world can tell it from the others.
    atExactly45: 1826,
    bucket0to15: 4199, bucket45to60: 1826, bucket60to75: 183, bucket75to90: 71,
    // what the old rule did, driven on a plateau falling k voxels per column
    headWalkedDownDeg: 63.4,    // walked down at full speed, permanently grounded, 0 frames airborne
    headSurfaceSpeed: 8.247,    // units per second along the ground, against a walk speed of 5
    // *** THE OLD RULE WAS A FRAME-RATE SWITCH. *** One body, one speed, one 63.4-degree slope:
    fellAtFps: 6,               // and only at 6 -- 10, 15, 20, 30, 60, 120, 144 and 240 all walked it
    walkedAtFps: Object.freeze([10, 15, 20, 30, 60, 120, 144, 240]),
    // the first draft of the repair, and what killed it
    firstDraftFellOnDeg: 26.6,  // a shallow hill, because a run that shrinks with dt shrinks into a lip
    // *** TWO NUMBERS, AND THEY MEASURE DIFFERENT THINGS -- SAID HERE BECAUSE THE FIRST DRAFT OF THIS
    // RECORD CARRIED ONE AND THE GATE ASSERTED IT AGAINST THE OTHER, AND WENT RED. *** `fellFrames` was
    // taken with the draft INSTALLED as the rule, so the body really left the ground and its whole path
    // differed from then on; the gate cannot re-run that without shipping the draft. `wouldFire` is what
    // the draft's arithmetic reports while the SHIPPED rule drives the body, which is re-derivable and is
    // what section 3 asserts. The shipped rule reports 0 on the same walk either way.
    firstDraftFellFrames: 76,   // of 240, with the draft installed -- NOT re-derived by the gate
    firstDraftWouldFire: 18,    // of 240, observed alongside the shipped rule -- this one is re-derived
    // *** THE FLOAT ERROR THIS LIMIT WAS BUILT TO ABSORB IS GONE AT ITS SOURCE, AND v4552 IS WHAT REMOVED
    // IT. *** v4546 measured 45.0000000000001990 on an exactly-45-degree ramp -- 1.99e-13 of error out of
    // the BILINEAR BLEND -- and a bare `> 45` threw the body off a slope it had just been told it could
    // walk, 21 frames of 240 over four separate departures. v4552's walk reads integer stand-heights at
    // both ends of the secant instead of the blend, so atan2(1, 1) * 180 / PI is EXACTLY 45 and the error
    // is 0. The reading is RE-TAKEN here rather than kept as history, because this record's own header says
    // it is re-derived on every run; v4546's number is in the prose above, where a superseded measurement
    // belongs. epsDeg is KEPT and is now belt-and-braces: it costs nothing, it still guards the general
    // case, and removing a tolerance because one fixture stopped needing it is how the next round
    // re-learns v4546 the hard way.
    observedAt45: 45,
    observedAt45BeforeV4552: 45.0000000000001990,
    epsDeg: 1e-9,
    maxSlopeDeg: 45,
    slopeRun: 1,
});

/**
 * *** RE-DERIVED BY tools/ship/cameraFall-selfcheck.mjs ON EVERY RUN. *** Readings at v4548.
 */
export const CAMERA_FALL_AT_V4548 = Object.freeze({
    at: "v4548",
    // the population: implementations of "integrate a vertical velocity, then clamp to a probed surface"
    copiesBefore: 4,            // _moveFP, _moveKaijuDrive, fallBody.fallStep, kinematic.stepCharacter
    copiesAfter: 2,             // the two modules; both camera paths call fallBody now
    integrationsInCameraBefore: 2,
    integrationsInCameraAfter: 0,
    // *** AND THE TWO COPIES DO NOT EVEN AGREE WITH EACH OTHER ABOUT THE ORDER OF THE TWO STEPS. ***
    // _moveFP probed the ground at the body's CURRENT height and then moved; _moveKaijuDrive moved and then
    // probed where it had arrived. One of those is fallBody's order and the other is not, and nothing in
    // the tree noticed that one rule had two implementations that disagreed about its central step.
    fpOrder: "probe at the current height, then move, then compare",
    kaijuOrder: "move, then probe where it arrived, then compare",
    // (1) THE WALKING REACH HANDED TO A FALLING BODY -- v4544's defect, in both camera paths
    deckAt: 21, deckBelow: 10,
    liftedFrom: Object.freeze([19.8, 19.9, 20.0, 20.2, 20.5]),
    liftedBy: Object.freeze([1.20, 1.10, 1.00, 0.80, 0.50]),
    fellFrom: 19.7,             // one tenth lower, and it falls ELEVEN voxels instead
    fellTo: 10,
    liftCutIsStepUpMax: true,   // the boundary sits exactly at STEP_UP_MAX, which is what names the cause
    // *** THE SAME BODY, THE SAME WORLD, THE SAME RELEASE HEIGHT, AND THE TWO COPIES ANSWER DIFFERENTLY. ***
    disagreeAt: 19.8, fpAnswer: 21, kaijuAnswer: 10,
    // (2) THE KAIJU'S ORDER TUNNELS THROUGH EVERYTHING THE MOMENT THE REACH IS HONEST. Its six lines only
    // looked like they worked because the walking reach let the probe see 1.2 ABOVE where the body landed,
    // catching surfaces the step had already crossed. Driven with that order and a reach of 0, EVERY
    // release -- 19.7, 19.8, 19.9, 20.2, 20.5, 21.0 and 25.0 -- falls past both decks to the world floor.
    kaijuOrderZeroReachLandsAt: 0,
    kaijuOrderZeroReachFrom: Object.freeze([19.7, 19.8, 19.9, 20.2, 20.5, 21.0, 25.0]),
    // (3) THE KAIJU'S GROUND FLAG WAS A LATCH: only landing set it, only jumping cleared it
    cliffTop: 40, cliffLeftAtFrame: 42,
    latchStillTrueAtFrame: 89, latchHeightThen: 34.12, latchVelocityThen: -14.40,
    freeJumpVelocity: 10.70,    // Space at frame 90, thirty-four units up and falling
    // (4) A LANDING HAPPENS ON ONE COLUMN, NOT ON AN INTERPOLATION
    // Straddling z=39.5, where the column the body is IN has rock up to y=3 (so its surface is 4) and the
    // next one along has rock to y=1 (surface 2). The blend answers 3 -- A HEIGHT NEITHER COLUMN HAS, and
    // one that is INSIDE the rock of the column the body occupies. The integer probe answers 4.
    blendLandsFeetAt: 3,
    columnLandsFeetAt: 4,
    blendRockTopInThatColumn: 3,
    // what is deliberately UNCHANGED, because v4547 measured both as gameplay decisions
    gravityPassedThrough: 18,
    terminalPassedThrough: -Infinity,
});

/**
 * *** RE-DERIVED BY tools/ship/playerBody-selfcheck.mjs ON EVERY RUN. *** Readings at v4549.
 */
export const PLAYER_BODY_AT_V4549 = Object.freeze({
    at: "v4549",
    radiusBefore: 0,            // _canStandAt tested ONE cell: floor(x), floor(z). The body was a LINE.
    radiusAfter: 0.4,           // physics/character/capsuleGround.mjs's own radius
    cellsTestedBefore: 1,
    cellsTestedAfterMax: 4,     // a disc of r < 0.5 touches at most four lattice cells
    // (1) THE DIAGONAL GAP: two pillars sharing one corner and nothing between them but a point
    diagonalFrom: Object.freeze([10.5, 9.5]),
    diagonalThroughTo: Object.freeze([15.80, 14.80]),   // where the line body ended up: past both pillars
    diagonalBlockedAt: Object.freeze([11.56, 10.56]),   // where the disc body stops
    // *** A RADIUS BELOW THE PER-FRAME STEP DOES NOT RELIABLY BLOCK. *** The test is discrete, so a body
    // moving 0.0833 per frame at walk speed steps over a slit narrower than that: r = 0.01 still goes
    // through, r = 0.05 does not. 0.4 is nearly five times the walking step and three times the sprint's.
    diagonalPassesAtRadius: Object.freeze([0, 0.01]),
    diagonalBlocksAtRadius: Object.freeze([0.05, 0.1, 0.2, 0.4]),
    perFrameStepAtWalk: 5 / 60,
    // (2) HOW CLOSE THE CENTRE GETS TO A WALL FACE
    wallFaceX: 12, centreStoppedBefore: 11.9167, centreStoppedAfter: 11.5833,
    // the live census: what a radius costs in standable ground, on a real boot
    censusCells: 14641, sampledPerCell: 256,
    lostPct: Object.freeze({ "0.40": 27.65, "0.42": 31.51, "0.44": 31.61, "0.46": 31.71,
                             "0.48": 35.34, "0.50": 35.58 }),
    cellsFullyLost: Object.freeze({ "0.40": 0, "0.42": 0, "0.44": 0, "0.46": 0, "0.48": 587, "0.50": 587 }),
    cliffBetween: Object.freeze([0.46, 0.48]),   // 0 cells lost below it, 587 above
    lostFloorPct: 10,           // the percentage is REPORTED; only a floor is asserted, per the usual rule
    // *** MY OWN CENSUS WAS WRONG TWICE BEFORE IT SAID ANYTHING. *** The first draft sampled CELL CENTRES
    // and read 0 lost at every radius, which is vacuous: a disc of r <= 0.5 centred in a cell never leaves
    // it. The second sampled offsets 0.125/0.375, whose only distances to a cell edge are 0.125 and 0.375,
    // so r=0.2 read identically to r=0.3 and r=0.4 to r=0.5 -- A GRID COARSER THAN THE THING MEASURED.
    censusFirstDraft: "cell centres -- 0 lost at every radius, vacuous by construction",
    censusSecondDraft: "offsets 0.125/0.375 -- quantised the radius into two buckets",
    // the cost, measured
    canStandAtMicroseconds: 0.115,
    callsPerFrame: 3,
});

/**
 * *** RE-DERIVED BY tools/ship/playerWater-selfcheck.mjs ON EVERY RUN. *** Readings at v4550.
 *
 * The filed item read "water is passable to the player and solid to every bot, which nothing states as
 * deliberate". HALF OF THAT IS WRONG AND THE CENSUS BELOW IS WHAT SAYS SO: the player's own ground query
 * and the bots' answer the same number in 146 of 146 water columns. The disagreement was between two
 * functions in ONE file.
 */
export const PLAYER_WATER_AT_V4550 = Object.freeze({
    at: "v4550",
    // (1) THE SHAPE OF THE DEFECT: one question, three answers, one of them different
    predicateCopiesBefore: 3,   // _canStandAt, _standYAt's shim, _terrainTopAt's legacy scan
    predicateCopiesAfter: 1,    // Camera.isSolidToBody
    idsExcludedByCanStandAt: Object.freeze([10, 11]),   // WATER, FLOWING_WATER
    idsExcludedByTheOtherTwo: Object.freeze([]),
    // (2) THE LIVE WORLD -- *** v4559: THE WHOLE ISLAND, BECAUSE THE PATCH WAS THE FLATTEST PART OF IT. ***
    //
    // v4550 censused x,z in -30..30 and called it "a generated world, 5x5 chunks". The world is not 5x5
    // chunks: VoxelWorld's constructor runs init() over gridRadius 7, so it is a FINITE 15x15-CHUNK ISLAND
    // of 240x240 = 57,600 columns, and all of it was already generated and sitting there. The census looked
    // at 3,721 of them -- 6.46% -- and the gate's own liveWorld() re-generated 25 chunks it already had.
    //
    // AND THE PATCH IT PICKED IS NOT A SAMPLE, IT IS AN OUTLIER. Measured over both:
    //     overhang / multi-surface columns   window 0 of 3,721 (0.00%)   island 8,200 of 57,600 (14.24%)
    //     water columns                      window 146 (3.92%)          island 14,183 (24.62%)
    //     worst first-to-last solid spread   window 0                    island 51
    // The one region of this world with NO overhangs at all, reading a sixth of the water the world has.
    censusColumns: 57600,               // the island   (3,721 at v4550, the window)
    censusColumnsAtV4550Window: 3721,
    overhangColumns: 8200,              // 14.24%   (0 in the v4550 window -- the reason this was re-taken)
    overhangColumnsAtV4550Window: 0,
    worstSolidSpread: 51,
    waterColumns: 14183,        // 24.62% -- water is not a hypothetical in this world   (146 in the window)
    waterColumnsAtV4550Window: 146,
    surfaceWaterColumns: 2346,  // water is the topmost non-air voxel: a lake you can walk to   (79)
    surfaceWaterColumnsAtV4550Window: 79,
    waterDepthRange: Object.freeze([1, 7]),
    surfaceDepthRange: Object.freeze([1, 7]),   // [1, 3] in the v4550 window: the deeper pools are outside it
    // *** THE PLAYER AND THE BOTS AGREED ALL ALONG, WHICH IS THE CORRECTION TO THE FILED ITEM. ***
    // v4559: re-taken over the island's 14,183 water columns rather than the window's 146 -- a NINETY-SEVEN
    // FOLD wider population for the round's central correction, and still every column.
    columnsWherePlayerGroundEqualsBotGround: 14183,
    ofWaterColumns: 14183,
    columnsWherePlayerGroundEqualsBotGroundAtV4550Window: 146,
    // (3) *** AND THE EXCLUSION WAS ASKED ON ZERO REACHABLE SITES -- RE-TAKEN AT v4559 AND STILL ZERO. ***
    //
    // Over every standable height in the census, the four-neighbour cells holding water anywhere in the
    // body's own two-cell span: none. A lake surface is level, so the land beside it stands at top+1 and the
    // neighbour's span is the air above the water. It takes water standing HIGHER than the land next to it
    // -- which the fluid systems level away.
    //
    // *** THE REGION WAS THE FILED COMPLAINT AND IT IS NOT WHERE THE HOLE WAS. *** Widening 3,481 standable
    // columns to the island's 56,644 -- every one of the 8,200 overhang columns included -- leaves the count
    // at 0. The instrument was the problem: standHeightAt(w, x, z, {}) returns ONE height per column and it
    // is the TOPMOST, so a flooded room under an overhang -- the exact case this row's own note says it
    // would catch -- could not be reached by the probe at all, in a world where 6,913 columns carry more
    // than one surface. standablesAt() has existed for this since v4542. Asked at all 63,684 standable
    // heights it is still 0: a SEVENTEENFOLD wider population and the same answer.
    reachableExclusionSites: 0,
    reachabilityIsAFixtureClaim: false,   // taken on the generated world, not on a hand-built one
    standableColumns: 56644,
    standableHeights: 63684,              // 3,481 were asked at v4550, one per column
    columnsWithMoreThanOneSurface: 6913,
    askedAtEveryStandableHeight: true,    // false at v4550: the topmost surface only
    // *** AND THE ZERO IS A MEASUREMENT RATHER THAN A DEAD CHECK, WHICH NOTHING ESTABLISHED BEFORE. *** A
    // census that reports 0 is worth exactly what its ability to report anything else is worth, and v4550
    // asserted the 0 without ever showing the probe firing. Driven on a hand world -- land topping at y=4,
    // a wall of water from y=5 to y=9 beside it, which is "somebody floods a room" -- THE SAME PREDICATE
    // THE ISLAND CENSUS USES counts 8: the four columns either side of the wall, at one standable height
    // each. The island's 0 is what the world is like, not what the instrument can see.
    //
    // *** 8 AND NOT 16, AND THE FIRST NUMBER IS WORTH RECORDING BECAUSE OF HOW IT WAS WRONG. *** The first
    // draft of the control re-implemented the neighbour test inline and counted every (neighbour, cell) hit
    // rather than asking once per standable position -- so it read 16, and sabotaging the shipped predicate
    // to return false left the island row at 0 AND the control at 16, both green. A control grading its own
    // copy of the thing under test is worth nothing at all, which is the defect this session has now found
    // in five rounds and the one it was written to rule out.
    controlSitesOnAFloodedWall: 8,
    controlSitesWhenTheControlCountedItsOwnCopy: 16,
    // (4) WHERE IT IS REACHABLE, BUILT BY HAND: a wall of water from y=2 to y=9 against land topping at 5
    stoneWallStopsBodyAt: 9.583,          // a radius short of the face at x = 10 -- UNMOVED by v4552
    // *** THE THREE `Before` NUMBERS ARE A COUNTERFACTUAL, AND v4552 MOVED THEM WITHOUT TOUCHING WATER. ***
    // They are what the PRE-v4550 rule does when driven under the CURRENT engine, not a record of shipped
    // behaviour -- so they legitimately drift whenever anything else in the walk changes, and v4552 changed
    // the walk's ground rule. Re-taken here: x 13.333 -> 13.750, feet -92.505 -> -87.605, vy -59.4 -> -57.9.
    // The v4550 readings are kept beside them because a counterfactual whose value moves for an unrelated
    // reason is exactly the kind of number that gets mistaken for a regression by the next reader.
    waterWallBeforeEndedAt: 13.75,        // it walked IN   (13.333 at v4550)
    waterWallBeforeFeetAfter240Frames: -87.605,   // (-92.505 at v4550)
    waterWallBeforeVyAfter240Frames: -57.9,       // still accelerating; the world has no floor  (-59.4)
    waterWallAfterStopsBodyAt: 9.583,     // identical to stone, which is the whole repair
    botGroundInThatColumn: null,          // the bots never entered it in either world
    // (5) WHAT DOES NOT MOVE, WHICH IS THE POINT OF (3): the shipping walk is unchanged
    lakeCrossingFrames: 300,
    lakeCrossingFeetY: 8,
    lakeCrossingAirborneFrames: 0,
    // (6) WHAT IS NOT IMPLEMENTED AND IS NOT CLAIMED
    // *** SCOPED TO WHAT IS CHECKED, WHICH IS THIS FILE. *** The first draft of this field was called
    // swimStatesInTree and its gate row read camera.js, so the name claimed a tree-wide absence one file
    // had been searched for. An absence is only worth what its scope is.
    swimStatesInTheController: 0,
    buoyancyForThePlayer: false,
    // The intent WAS swimming, and main.js says so in prose while nothing implements it: the v465 comment
    // beside renderer.skipWater reads "without this you swim into a blue void with no ground under the
    // water". That is about drawing the lakebed; the collision side never had a swim state to reach it.
    proseIntendedSwimming: true,
    botWaterRuleIsSpeedOnly: true,        // BotManager._waterSpeedMul, off a ROOM record, not off voxels
    botWaterSpeedMultipliers: Object.freeze({ waterKaijuDeep: 1.30, otherKaijuDeep: 0.40 }),
});

/**
 * *** RE-DERIVED BY tools/ship/walkGround-selfcheck.mjs ON EVERY RUN. *** Readings at v4552.
 *
 * The walk stood the body inside solid rock, and had since v404 made the ground bilinear. The numbers that
 * decided the shape of the repair are here; the ones this round DECLINED to decide are in notClosed.
 */
export const WALK_GROUND_AT_V4552 = Object.freeze({
    at: "v4552",
    // (1) THE FIXTURE THAT NAMED THE DEFECT -- task #30's own two-voxel ledge
    taskFixtureBeforeZ: 39.667,
    taskFixtureBeforeFeet: 2,        // in a cell whose surface is y=4: TWO VOXELS INSIDE THE ROCK
    taskFixtureBeforeStuck: true,    // and it never moved again for as long as the walk ran
    // (2) THE CENSUS, on an instrument sharing no code with the fix (raw voxelAt + its own disc)
    beforeGroundedBuriedPct: 56.56,
    beforeDistinctBuriedPct: 36.13,
    beforeFrozenInSolid: 67,         // of 128 ordinary walks
    afterGroundedBuriedPct: 1.51,
    afterDistinctBuriedPct: 2.77,
    afterFrozenInSolid: 2,
    residualIsNotZero: true,         // *** AND IT IS REPORTED RATHER THAN ROUNDED TO NONE ***
    // (3) THE FINDING THAT DECIDED THE SHAPE: no ground rule is both legal and smooth, because a sub-voxel
    // height on a unit lattice is BY CONSTRUCTION a height no column has. So smoothness comes from TIME.
    rampStepVoxels: 1,               // the lattice has no smaller riser
    fourDirectionMaxDy: Object.freeze([1, 1, 1, 1]),          // +x, -x, +z, -z -- EQUAL is the claim
    hybridMaxDyFavourable: 0.4167,   // max(blend, clamp) on +x/+z-facing ramps
    hybridMaxDyAdverse: 1,           // ...and on -x/-z-facing ones. A walk that depends on your heading.
    // (4) THE EYE, EASED IN TIME -- and the bound that keeps it from being a second physics authority
    eyeSmoothRate: 12,
    eyeSmoothSnap: 1.25,
    stepUpMax: 1.2,
    cliffDrop: 1.5,                  // local to _moveFP; the ordering is what makes the snap guard mean anything
    maxEyeStepAtShippedRate: 0.2148,
    maxEyeOffsetAtShippedRate: 0.992,
    eyeAsBlendWouldHaveBeen: 12.95,  // the option this replaced: PERMANENT, and an order of magnitude worse
    // (5) WHAT MUST NOT BREAK, pinned
    autoStepZ: 16.5, autoStepEye: 6.7, slabWalkZ: 25.5, sprintZ: 22.5,
    observedAt45AfterClamp: 45,      // exactly; see PLAYER_SLOPE_AT_V4546's observedAt45BeforeV4552
    steepDeparturesAt63: 3,          // the slope limit is STILL LIVE -- v4546 was not quietly undone
    // (6) WHAT THE ROUND ORPHANED AND SAID SO
    blendStillCalledBy: Object.freeze(["_terrainTopAt's fromY path", "the orbit clearance"]),
    blendStencilShiftPct: 36.16,     // of standable columns read BELOW their own surface at their own centre
    blendStencilWorstShortfall: 20.75,
    blendStencilShiftFixed: false,
    // *** AND IT IS STILL GUARDED, AGAINST THIS ROUND'S OWN PREDICTION. *** The design expected the walk
    // leaving the blend to orphan it -- a sabotage centring the stencil going 0 RED, with the round
    // recording that it had unguarded a known defect. Driven: it goes 2 RED. Both of these reach the blend
    // without going through the walk, so the shift keeps its keepers and the filed item is less urgent
    // than the design thought. Measured rather than inherited.
    blendStillGuardedBy: Object.freeze(["tools/ship/playerSlope-selfcheck.mjs", "tools/ship/cameraFall-selfcheck.mjs"]),
    notClosed: Object.freeze([
        "whether a 1.0-voxel step eased at 12/s LOOKS smooth -- NO FRAME HAS BEEN RENDERED at any rate, by " +
        "anyone, in this round or its four measurement probes; every smoothness number here is a trace",
        "the six render sites that read camera.position directly for uCamPos and the shadow centre, which " +
        "now disagree with the view matrix by up to 0.992 voxels transiently -- bounded and gated, not fixed",
        "the blend's half-cell stencil shift -- STILL GUARDED by playerSlope and cameraFall, which the " +
        "round predicted it would not be and measured instead; filed, not orphaned",
        "the clamp's residual burial, traced to _stepTargetAt's reach limit and to fallBody's landing " +
        "oracle being built from ONE column for a body that now has width -- fallBody's round, not the walk's",
        "sprint and dt other than 1/60 for the burial census; the stair RATE scales with ground speed",
    ]),
});

/**
 * *** RE-DERIVED BY tools/ship/kaijuGround-selfcheck.mjs ON EVERY RUN. *** Readings at v4554.
 *
 * The creature's height is written twice a frame by two rules, and the one that wins is the one nobody
 * designed to win -- so the drive camera's vertical physics is dead code in the shipping frame order, and
 * the write that kills it is the only thing keeping driven kaiju in the world.
 */
export const KAIJU_GROUND_AT_V4554 = Object.freeze({
    at: "v4554",
    // (1) THE DOUBLE WRITE
    driveWritesY: "camera/camera.js _moveKaijuDrive, through fallBody.fallStep",
    clampWritesY: "simulation/KaijuManager.js:280, k.position.y = gy, gated on k.state alone",
    frameOrder: "main.js:29660 camera.update() then main.js:29931 kaijuManager.tick(dt)",
    framesDriveDiscardedOf300: 300,
    isPlayerDrivenUsesInManager: 1,      // and it selects an ANIMATION CLIP; it guards no physics
    // (2) *** AND THE OBVIOUS FIX IS A CATASTROPHE, WHICH IS WHY THE ROUND DOES NOT MAKE IT ***
    lostWithClamp: 0,                    // of 60, five seconds of holding W on the generated world
    lostWithoutClamp: 56,                // ...guarding the clamp with _isPlayerDriven
    naiveFixIsACatastrophe: true,
    closingItRequires: Object.freeze([
        "a step-up for the drive: its probe is _fallSurface() at reach 0, so it can never name a surface " +
        "ABOVE the body and a driven kaiju has never once gained height",
        "a horizontal collision for the drive: k.position.x += mx * speed * dt is unguarded, and " +
        "_canStandAt has exactly ONE call site in the tree -- _moveFP, the other controller in this class",
    ]),
    // (3) THE OFF-BY-ONE, MEASURED AND DECLINED
    heightAtIsFirstAirIndex: true,       // 2,240 of 2,240 non-water samples; topmost-solid in 0
    terrainTopAddsOne: true,             // so `return h + 1` is one voxel above the model's own stand height
    terrainTopAboveVoxelTruth: 2240,     // of 2,240 non-water samples: ABOVE in every one of them
    offByOneFixed: false,                // gy feeds flyer clearance, the water line and the wake test
    notClosed: Object.freeze([
        "the double write itself -- closing it needs the drive to hold a body up alone, which is the " +
        "player's v4545..v4552 arc repeated for a second body",
        "the +1 in _terrainTop: correcting it moves every kaiju, every flyer's cruise altitude and the " +
        "water line at once, which is a gameplay decision and not a census's to make",
        "the body height: KAIJU_HEAD_Y is a CAMERA offset and the ground probe asks about 2 cells, but a " +
        "body-height fix is INVISIBLE until the double write is closed -- measured, and the reason this " +
        "round reordered itself",
    ]),
});

export class Camera {
    // The keys the _move* methods consult in EVERY mode that moves. KeyE is deliberately absent: it is
    // kaiju-drive only, and consumesKey() adds it there. Cross-checked against the keys.has() literals in this
    // file by tools/ship/cameraKeys-selfcheck.mjs, so this cannot quietly fall behind the code it describes.
    static MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft"]);

    /** The body's radius, in voxels. *** BEFORE v4549 IT WAS ZERO AND NOT BY DECISION: *** _canStandAt
     *  tested ONE lattice cell, floor(x) and floor(z), so the thing the player drove was a vertical LINE.
     *  0.4 is physics/character/capsuleGround.mjs's radius, taken so the player and the mesh authority
     *  describe the same body rather than two numbers nobody compared -- the v4547 lesson applied to a
     *  quantity that did not exist on this side at all. */
    static BODY_RADIUS = 0.4;

    /**
     * *** IS THIS VOXEL SOLID TO THE PLAYER'S BODY? THE FILE HELD THREE ANSWERS AND ONE OF THEM DIFFERED.
     * *** Until v4550 camera.js decided that question in three places -- _canStandAt's clearance loop,
     * _standYAt's surfaceProbe shim, and _terrainTopAt's legacy downward scan -- and _canStandAt alone
     * carried `&& v !== 10 && v !== 11`, which made WATER PASSABLE to the collision test while the same
     * file's ground test stood the body ON it. A body may not both walk into a thing and stand on it.
     *
     * *** WHAT THAT COST, DRIVEN RATHER THAN ARGUED: THE PLAYER FELL OUT OF THE WORLD. *** Against a wall
     * of stone from y=2 to y=9 the body stops at x = 9.583, a radius short of the face. Against a wall of
     * WATER with the identical shape it walks in to x = 13.333, finds no ground under it -- because the
     * ground probe needs two cells of AIR and water is not air -- and falls: feet at -92.505 after 240
     * frames
     * with vy = -59.4 and still accelerating, past the bottom of a world that has no floor to catch it.
     *
     * *** THE RULE IS `NOT AIR`, WHICH IS world.isAir's RULE, WHICH IS WHAT THE BOTS ALREADY GET. ***
     * world/world.js answers isAir as `voxelAt === VOXEL.AIR`, and simulation/BotManager.js walks its bots
     * on surfaceProbe.standHeightAt over that. So water was never "solid to bots and passable to the
     * player": MEASURED ON A REAL GENERATED WORLD, the player's ground and the bots' ground agree in 146
     * of 146 water columns. The disagreement was inside this file, not across the two controllers.
     *
     * *** NO SWIMMING IS CLAIMED AND NONE IS IMPLEMENTED. *** There is no buoyancy, no water drag and no
     * swim state in this controller; the bots' only water rule is a speed multiplier
     * read off a ROOM record (BotManager._waterSpeedMul), not off voxels. So a lake is a walkable floor
     * here, to everyone -- driven, the player crosses one at y = 8 grounded for 300 frames. This round
     * makes the tree SAY that in one place instead of contradicting itself in three. Refusing is the safe
     * direction, in physics/character/terrainWalk.mjs's own words, and a wall beats a fall out of the map.
     *
     * `undefined` is air, which is the fixture worlds' convention and not the engine's: world.voxelAt
     * returns 0 for a missing chunk and chunk.get returns 0 out of bounds, so the live world never
     * produces one. The guard is kept because the gates' worlds do.
     */
    static isSolidToBody(v) {
        return v !== 0 && v !== undefined;
    }

    /** How fast the rendered eye catches up to the body, per second. v4552. The walk steps a whole voxel
     *  at a lip now, so the SMOOTHNESS v404 wanted is taken here instead of by standing the body in rock.
     *  12 is the lowest rate in a sweep of 12/20/30 that gives 0 per-frame eye steps >= 0.5 voxels with the
     *  eye never more than a voxel from the body: k=12 max |dy| 0.2148, k=20 0.3359, k=30 0.5001 with 12
     *  steps. *** IT IS DEFENDED AS A TRACE AND NOT AS A LOOK, AND THE ROUND SAYS SO: *** no frame has been
     *  rendered at any k, and whether a 1.0-voxel step eased at 12/s reads as smooth is a judgement a human
     *  with the page open has to make, not one a trace can. */
    static EYE_SMOOTH_RATE = 12;

    /** Above this distance the eye SNAPS rather than eases, in voxels. v4552. It sits deliberately between
     *  STEP_UP_MAX (1.2) and CLIFF_DROP (1.5) -- so a walking step is eased and a fall, a teleport, a
     *  respawn or an external writer's jump is not smeared across the picture. Without the guard a body
     *  walking off a ramp dragged the eye 5.460 voxels behind it; with it, 0.992. The ordering of the three
     *  constants is what makes the guard mean anything and a gate row asserts it. */
    static EYE_SMOOTH_SNAP = 1.25;

    /** The tallest auto-step, in voxels. Read by _moveFP's walk rule AND by _terrainTopAt's reach, which
     *  are the same question asked twice -- so it is one number rather than two that must agree. */
    static STEP_UP_MAX = 1.2;

    /** Steeper than this and the ground is not walkable DOWN; the body leaves it and falls. v4546.
     *  45 is physics/character/terrainWalk.mjs's own default, taken so the player and the bots refuse the
     *  same ground rather than two numbers nobody compared. *** ON A VOXEL LATTICE EVERY LIMIT FROM 45 UP
     *  TO 63.4 IS THE SAME RULE, *** because the only slopes a lattice can express are n voxels per column
     *  -- 45.0, 63.4, 71.6 degrees -- and nothing lies between the first two. So this number is chosen to
     *  MATCH THE BOTS and not because this world can tell it from 50 or 60; said here rather than implied. */
    static MAX_SLOPE_DEG = 45;

    /** The world distance the slope is measured over, in voxels. ONE COLUMN, and it is fixed rather than
     *  derived from the frame's own travel for the reason _fpSlopeDeg sets out: a run that shrinks with dt
     *  shrinks into a single lip and reports 90 degrees for ordinary ground. v4546. */
    static SLOPE_RUN = 1;

    /** The tolerance that makes MAX_SLOPE_DEG inclusive, in degrees. See _moveFP's cliff branch: the
     *  bilinear blend puts about 2e-13 degrees of float error on an exactly-45-degree ramp. v4546. */
    static SLOPE_EPS_DEG = 1e-9;


    constructor(canvas) {

        this.canvas = canvas;

        this.position = { x: 0, y: 50, z: 50 };

        this.yaw = 0;
        this.pitch = -0.4;

        this.moveSpeed = 25;
        this.lookSpeed = 0.0025;

        this.locked = false;
        this._rotLock = false;          // v1735 - when true, mouse/drag/gamepad rotation is suppressed (#2: lock until floor draws)
        this._rotLockTimer = 0;
        this.lockRotation = (ms) => { this._rotLock = true; if (this._rotLockTimer) clearTimeout(this._rotLockTimer); this._rotLockTimer = setTimeout(() => { this._rotLock = false; this._rotLockTimer = 0; }, ms || 7000); };
        this.unlockRotation = () => { this._rotLock = false; if (this._rotLockTimer) { clearTimeout(this._rotLockTimer); this._rotLockTimer = 0; } };

        this.keys = new Set();

        // required for multiplayer + portal physics
        this.velocity = { x: 0, y: 0, z: 0 };

        this._lastTime = 0;

        // Round 28 — first-person agent mode. "observer" = free-fly
        // (default), "fp" = ground-locked walk + jump + collision.
        // World ref injected via setWorld() once world is constructed.
        // Round 96 — "ogre_orbit" = follow-cam circling a target entity
        // (the OGRE chassis usually). Target is set via setOrbitTarget;
        // movement code in _moveOrbit advances yaw and computes the
        // camera position with terrain-avoidance clearance.
        this.mode = "observer";
        this.world = null;
        this._fpVelY = 0;
        this._fpOnGround = false;
        this._eyeHeight = 1.7;          // body+head from ground
        this._fpWalkSpeed = 5;
        this._fpSprintSpeed = 9;
        this._fpJumpVel = 7.5;
        this._gravity = 18;             // m/s² downward in FP mode
        this._fpFallStartTime = 0;       // diagnostic: time spent airborne
        // Round 31 — energy bar gates sprint. main.js installs ref.
        this.playerEnergy = null;
        // Round 96 — orbit-cam state. Target can be a single object
        // {position:{x,y,z}} (OGRE), an array of such objects (2-OGRE
        // framing), or null. Distance/height adapt to spread automatically.
        this._orbitTarget   = null;
        this._orbitAngle    = 0;            // radians around target's Y axis
        this._orbitYawRate  = 0.18;         // rad/sec — slow lazy orbit
        this._orbitDistance = 55;           // base distance from target
        this._orbitHeight   = 20;           // height above target
        this._orbitMinY     = 8;            // never drop below this absolute
        this._orbitClearance= 6;            // raise above terrain by this much

        // Projection params (used by buildViewProj). Aspect ratio is
        // recomputed each update() against the canvas's current
        // framebuffer dimensions, so DPR-driven resizes are picked up
        // automatically.
        this.fov  = 70 * Math.PI / 180;
        this.near = 0.1;
        this.far  = 1000;
        // Round 31 polish — FOV "kick": a transient punch on weapon fire/landing that
        // eases back to base, plus a sustained widen while sprinting. Both add onto fov.
        this._fovKickAmp = 0; this._fovKickUntilT = 0; this._fovKickDuration = 1;
        this._fovSprint = 0; this._sprinting = false; this._fovLastT = 0;
        this.viewProj = new Float32Array(16);

        this._attachInput();
    }

    update() {

        const t = performance.now();

        if (!this._lastTime) this._lastTime = t;

        const dt = Math.min((t - this._lastTime) / 1000, 0.1);
        this._lastTime = t;

        // WASD/Space/Shift work whether or not pointer-lock is engaged.
        this._move(dt);

        // Round 28 — shake offset. Random-jitter the position passed to
        // buildViewProj so the matrix is shaken without mutating the
        // logical camera position.
        // *** v4552 -- THE PICTURE IS SMOOTHED IN TIME, BECAUSE THE GROUND CANNOT BE SMOOTHED IN SPACE. ***
        // The walk stands on real surfaces now (see _moveFP), so the body steps a whole voxel at a lip --
        // which is exactly the "stairs" v404's bilinear blend was written to remove, and v404's cure was to
        // stand the body in mid-rock. This eases the EYE toward the body instead. It writes only
        // _eyeRenderY: camera.position.y is bit-identical with the smoother on and off, which is the row
        // that keeps this from quietly becoming a second physics authority.
        // Measured over the clamped body on ramps in all four compass directions: at k=12 there are 0
        // per-frame eye steps >= 0.5 voxels, max |dy| 0.2148, and the eye is never more than 0.992 voxels
        // from the body. The option this replaces -- hand the RENDERER the blend -- measured 10.69 and
        // 12.95 voxels of permanent disagreement instead.
        // The same idiom this function already uses for _fovSprint ten lines below, and BotManager's
        // _displayYaw one axis over: a render-only value eased toward an authoritative one.
        this._stepRenderEye(dt);
        let camX = this.position.x;
        let camY = this._eyeRenderY;
        let camZ = this.position.z;
        if (this._shakeUntilT && t < this._shakeUntilT) {
            const remain = (this._shakeUntilT - t) / Math.max(1, this._shakeDuration);
            const amp = this._shakeAmp * remain;
            // v794 — directional shake bias. If a direction was set
            // (dirX/dirZ non-zero, normalized), 60% of the shake pushes
            // along that direction, 40% remains isotropic. Y stays purely
            // isotropic so the player doesn't get vertically-launched on
            // horizontal hits.
            const dx = this._shakeDirX ?? 0;
            const dz = this._shakeDirZ ?? 0;
            const dirActive = (dx !== 0 || dz !== 0);
            const isoJitterX = (Math.random() - 0.5) * 2 * amp;
            const isoJitterY = (Math.random() - 0.5) * 2 * amp;
            const isoJitterZ = (Math.random() - 0.5) * 2 * amp;
            if (dirActive) {
                // Bias: 0.6 * (signedPulse * dir) + 0.4 * isotropic
                const pulse = (Math.random() * 0.7 + 0.3) * amp;   // 30-100% of amp, always positive
                camX += 0.6 * pulse * dx + 0.4 * isoJitterX;
                camY += isoJitterY;       // Y stays isotropic
                camZ += 0.6 * pulse * dz + 0.4 * isoJitterZ;
            } else {
                camX += isoJitterX;
                camY += isoJitterY;
                camZ += isoJitterZ;
            }
        }

        // Recompute view-projection matrix each frame.
        const aspect = this.canvas
            ? this.canvas.width / Math.max(1, this.canvas.height)
            : 1;
        // Round 31 — effective FOV = base + transient kick (linear decay, like shake)
        // + sustained sprint widen (eased). Subtle; only meaningful in first-person.
        const _now = performance.now();
        let _fovK = 0;
        if (this._fovKickUntilT && _now < this._fovKickUntilT) {
            _fovK = this._fovKickAmp * (this._fovKickUntilT - _now) / Math.max(1, this._fovKickDuration);
        } else { this._fovKickUntilT = 0; this._fovKickAmp = 0; }
        const _fdt = this._fovLastT ? Math.min(0.05, (_now - this._fovLastT) / 1000) : 0;
        this._fovLastT = _now;
        const _sprTarget = (this._sprinting && this.mode === "fp") ? (8 * Math.PI / 180) : 0;
        this._fovSprint += (_sprTarget - this._fovSprint) * Math.min(1, _fdt * 8);
        const _fovEff = this.fov + _fovK + this._fovSprint;
        buildViewProj(this.viewProj, { x: camX, y: camY, z: camZ }, this.yaw, this.pitch,
                      _fovEff, this.near, this.far, aspect);
    }

    // Round 28 — trigger camera shake. amp = world units, durationMs.
    // Shake decays linearly to zero. Multiple shakes overwrite (latest wins
    // unless the new shake's remaining magnitude < current).
    // v794 — optional directional bias (dirX, dirZ). When non-null, the
    // shake jitter is 60% directional + 40% isotropic so the player
    // feels the hit coming FROM that direction (vector points from
    // source to player). Existing 2-arg callers behave unchanged.
    shake(amp, durationMs = 200, dirX = null, dirZ = null) {
        const now = performance.now();
        const newEnd = now + durationMs;
        const curRemain = this._shakeUntilT
            ? (this._shakeUntilT - now) / Math.max(1, this._shakeDuration) * (this._shakeAmp ?? 0)
            : 0;
        if (amp >= curRemain) {
            this._shakeAmp      = amp;
            this._shakeUntilT   = newEnd;
            this._shakeDuration = durationMs;
            // v794 — store direction bias (normalized to XZ plane)
            if (dirX != null && dirZ != null) {
                const len = Math.hypot(dirX, dirZ);
                if (len > 1e-5) {
                    this._shakeDirX = dirX / len;
                    this._shakeDirZ = dirZ / len;
                } else {
                    this._shakeDirX = this._shakeDirZ = 0;
                }
            } else {
                this._shakeDirX = this._shakeDirZ = 0;
            }
        }
    }

    // Round 31 polish — transient FOV "kick": a quick punch that eases back to base
    // (weapon fire, landings). amount in radians (+ widens / - narrows); linear decay.
    // Latest wins unless the current punch still has more magnitude.
    fovKick(amount, durationMs = 150) {
        const now = performance.now();
        const curRemain = this._fovKickUntilT
            ? (this._fovKickUntilT - now) / Math.max(1, this._fovKickDuration) * (this._fovKickAmp || 0)
            : 0;
        if (Math.abs(amount) >= Math.abs(curRemain)) {
            this._fovKickAmp = amount; this._fovKickUntilT = now + durationMs; this._fovKickDuration = durationMs;
        }
    }

    // ------------------------------------------------------------
    // INPUT — fixes a latent crash where _attachInput() was called
    // in the constructor but never defined. The page would throw
    // before any frame rendered. v2.22 implements standard FPS
    // controls: click-to-lock, mouse-look, WASD/Space/Shift.
    //
    // v2.24f: pointer-lock is now bound to MIDDLE-CLICK toggle, not
    // left-click. Left-click in unlocked mode goes through to the DOM
    // so the HUD palette swatches (and any other clickable UI) work.
    // Middle-click toggles in/out of FP mode. Escape also exits as
    // before (browser handles that).
    // ------------------------------------------------------------
    _attachInput() {
        if (!this.canvas) return;
        const canvas = this.canvas;

        // Drag-rotate state for non-locked mode. Left-click + hold + drag
        // rotates the camera the same way pointer-lock mouse-look does,
        // but the cursor stays visible so the HUD remains clickable.
        // (Pointer-lock via middle-click is still the precise mode.)
        this._dragging = false;
        this._dragLastX = 0;
        this._dragLastY = 0;

        // Middle-click toggles pointer lock. Use mousedown so we can
        // preventDefault() — middle-button on Windows otherwise triggers
        // auto-scroll mode which we definitely don't want over the canvas.
        canvas.addEventListener("mousedown", (e) => {
            if (e.button === 1) {
                e.preventDefault();
                if (this.locked) {
                    if (document.exitPointerLock) document.exitPointerLock();
                } else if (canvas.requestPointerLock) {
                    canvas.requestPointerLock();
                }
                return;
            }
            // v774 (round 31) — left-click in kaiju_drive mode fires
            // the controlled kaiju's primary attack via the KaijuManager
            // playerFire hook. Pointer-lock-or-not both work (drag-rotate
            // is moot in kaiju_drive since look comes from mouse delta).
            if (e.button === 0 && this.mode === "kaiju_drive") {
                e.preventDefault();
                // v777 — also track LMB-held for sustained fire. Each
                // frame _moveKaijuDrive will autofire if this is true.
                this._lmbHeld = true;
                const k = this._kaijuTarget;
                const km = (typeof window !== "undefined") ? window.kaijuManager : null;
                if (k && km?.playerFire) {
                    const result = km.playerFire(k, this);   // v775 — pass camera for crosshair targeting
                    // Quiet on success; warn on failure modes that the
                    // player can do something about ("no_target" =
                    // turn to face something).
                    if (!result.ok) {
                        // Throttle to avoid console spam from held click
                        const now = performance.now();
                        if (!this._lastFireReasonMs || now - this._lastFireReasonMs > 800) {
                            console.log(`[kaiju_drive] can't fire: ${result.reason}`);
                            this._lastFireReasonMs = now;
                        }
                    }
                }
                return;
            }
            // Left button + not pointer-locked = enter drag-rotate mode.
            // (When locked, EditorController handles left-click as voxel
            // remove, so we don't want to interfere.)
            if (e.button === 0 && !this.locked) {
                this._dragging = true;
                this._dragLastX = e.clientX;
                this._dragLastY = e.clientY;
                canvas.style.cursor = "grabbing";
            }
        });
        // Suppress middle-click auxclick (some browsers fire this for
        // "open in new tab" semantics on middle-click).
        canvas.addEventListener("auxclick", (e) => {
            if (e.button === 1) e.preventDefault();
        });

        // Round 42 — mouse wheel zoom (free-fly): move camera along its
        // forward axis. In observer mode this functions like a dolly.
        // In FP mode, scroll is ignored (player movement is keyboard).
        canvas.addEventListener("wheel", (e) => {
            // v780 — kaiju_drive mode: wheel cycles the attack rotation
            // (primary → alt → alt2). Lets the player pick which attack
            // to fire next without waiting for natural rotation advance.
            // v781 — proper modulo via peekPlayerAttack's rotLen so the
            // index wraps correctly for rotations of any length.
            if (this.mode === "kaiju_drive") {
                const k = this._kaijuTarget;
                if (k) {
                    e.preventDefault();
                    const km = (typeof window !== "undefined") ? window.kaijuManager : null;
                    const preview = km?.peekPlayerAttack?.(k);
                    const rotLen = preview?.rotLen ?? 1;
                    if (rotLen > 1) {
                        const delta = e.deltaY > 0 ? 1 : -1;
                        const field = k.becameKing ? "_kingAttackRotIdx" : "_attackRotIdx";
                        const cur = k[field] ?? 0;
                        k[field] = ((cur + delta) % rotLen + rotLen) % rotLen;
                        // Toast the new attack name so the player gets visual confirmation
                        try {
                            const updated = km?.peekPlayerAttack?.(k);
                            if (updated && window.toast?.show) {
                                window.toast.show(`switched to ${updated.attackName} [${updated.rotIdx + 1}/${updated.rotLen}]`, { ms: 1200 });
                            }
                        } catch {}
                    }
                }
                return;
            }
            if (this.mode === "fp") return;
            e.preventDefault();
            // Forward vector (yaw=0 → -Z; positive pitch up). Same convention
            // as the engine's voxel/listener mapping.
            const cy = Math.cos(this.yaw),  sy = Math.sin(this.yaw);
            const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
            const fx =  sy * cp;
            const fy =  sp;
            const fz = -cy * cp;
            // deltaY is positive when scrolling DOWN (away from user) — that
            // should pull the camera backward (zoom out). Invert sign.
            const step = -e.deltaY * 0.06;
            this.position.x += fx * step;
            this.position.y += fy * step;
            this.position.z += fz * step;
        }, { passive: false });

        // End drag on mouseup anywhere (so even if cursor leaves canvas
        // mid-drag, the next mousemove won't keep rotating).
        window.addEventListener("mouseup", (e) => {
            if (e.button === 0 && this._dragging) {
                this._dragging = false;
                canvas.style.cursor = "";
            }
            // v777 — release LMB sustains (kaiju autofire stops)
            if (e.button === 0) this._lmbHeld = false;
        });

        // Track lock state — driven by the browser's lock change events.
        const onLockChange = () => {
            this.locked = (document.pointerLockElement === canvas);
        };
        document.addEventListener("pointerlockchange", onLockChange);

        // Mouse-look: pointer-locked uses movementX/Y from the lock API.
        // Drag-rotate (unlocked) computes its own delta from clientX/Y.
        const LIMIT = Math.PI / 2 - 0.01;
        window.addEventListener("mousemove", (e) => {
            if (this.locked) {
                if (this._rotLock) return;   // v1735 - rotation locked until the floor draws (#2)
                this.yaw   += e.movementX * this.lookSpeed;
                this.pitch -= e.movementY * this.lookSpeed;
            } else if (this._dragging) {
                const dx = e.clientX - this._dragLastX;
                const dy = e.clientY - this._dragLastY;
                this._dragLastX = e.clientX;   // keep the delta current so there's no jump when it unlocks mid-drag
                this._dragLastY = e.clientY;
                if (this._rotLock) return;   // v1735 - rotation locked until the floor draws (#2)
                this.yaw   += dx * this.lookSpeed;
                this.pitch -= dy * this.lookSpeed;
            } else {
                return;
            }
            if (this.pitch >  LIMIT) this.pitch =  LIMIT;
            if (this.pitch < -LIMIT) this.pitch = -LIMIT;
        });

        // Keyboard tracking — _move() reads this.keys. Works in both
        // modes (locked or not) so WASD/Space/Shift always navigate.
        window.addEventListener("keydown", (e) => {
            // Round 43 — don't fire camera keys while the user is typing
            // in an input/textarea (Ollama prompt was triggering F-mode
            // toggle when "F" was typed).
            const tgt = e.target;
            if (tgt && (tgt.tagName === "INPUT" ||
                        tgt.tagName === "TEXTAREA" ||
                        tgt.isContentEditable)) {
                return;
            }
            this.keys.add(e.code);
            // Round 28 — F toggles first-person agent mode.
            // keydown fires once on press, so the toggle doesn't
            // ricochet while the key is held.
            if (e.code === "KeyF" && !e.repeat) {
                this.toggleMode();
            }
        });
        window.addEventListener("keyup", (e) => {
            this.keys.delete(e.code);
        });
    }

    setWorld(world) {
        this.world = world;
    }

    setMode(mode) {
        if (mode !== "observer" && mode !== "fp" && mode !== "missile_cam" && mode !== "ogre_orbit" && mode !== "kaiju_drive") return;
        const prevMode = this.mode;
        this.mode = mode;
        // v797 — when leaving kaiju_drive, clear any active beam ribbon so
        // we don't draw a stale beam to where the dead/abandoned kaiju was.
        if (prevMode === "kaiju_drive" && mode !== "kaiju_drive") {
            try {
                const km = (typeof window !== "undefined") ? window.kaijuManager : null;
                if (km?._activeBeams) km._activeBeams.clear();
            } catch {}
            this._lmbHeld = false;
        }
        if (mode === "fp") {
            // Snap to ground at current XZ
            const groundY = this._terrainTopAt(this.position.x, this.position.z);
            this.position.y = groundY + this._eyeHeight;
            this._fpVelY = 0;
            this._fpOnGround = true;
        }
        if (mode === "ogre_orbit") {
            // Reset angle so we don't start mid-frame at a strange spot.
            // The first _moveOrbit tick will snap to position based on target.
            this._orbitAngle = 0;
        }
        if (mode === "kaiju_drive") {
            // Round 124 — kaiju first-person drive. Camera snaps to the
            // controlled kaiju's position next tick (in _moveKaijuDrive);
            // here we just initialize per-mode state. Stamina lives on
            // the kaiju entity itself (k._stamina) so multiple kaiju can
            // each be driven across mode toggles without state leakage.
            this._kaijuDriveVelY = 0;
            this._kaijuDriveOnGround = true;
            // Round 125 — set persistent player-drive flag so mesh-sync can pick a velocity-based clip.
            // *** THIS SENTENCE USED TO SAY "so AI tick skips" AND THAT HALF WAS FALSE. *** v4554 counted
            // the flag's uses in simulation/KaijuManager.js: there is exactly ONE, at :394, and it selects
            // an animation clip. It guards no physics. In particular the ground clamp at :280 --
            // `k.position.y = gy`, gated only on k.state -- runs for a DRIVEN kaiju too, in the same frame,
            // after camera.update(), so everything _moveKaijuDrive computes vertically is overwritten
            // before it is drawn. A false reason is worse than no reason because it tells the next reader
            // not to look; v4545 convicted the identical species one method over.
            // AND THE CLAMP IS LOAD-BEARING BY ACCIDENT, which is why this round did not simply guard it:
            // with it, 0 of 60 driven kaiju leave the world over five seconds of walking; without it, 56.
            if (this._kaijuTarget) this._kaijuTarget._isPlayerDriven = true;
        }
        // Round 124 — leaving kaiju_drive: clear AI-skip flag so the
        // kaiju's AI takes over again cleanly on next tick.
        if (prevMode === "kaiju_drive" && mode !== "kaiju_drive") {
            if (this._kaijuTarget) this._kaijuTarget._isPlayerDriven = false;
        }
        // Round 40 — show/hide mech cockpit overlay
        if (this._onModeChange) this._onModeChange(mode);
        console.log(`[Camera] mode → ${mode}`);
    }

    // Round 124 — set the kaiju entity to drive in first-person mode.
    // Pass null to clear. Doesn't change mode; caller toggles via
    // setMode("kaiju_drive") after picking a target.
    setKaijuTarget(k) {
        // Round 125 — when switching target, clear flag on the old one
        // so its AI resumes
        if (this._kaijuTarget && this._kaijuTarget !== k) {
            this._kaijuTarget._isPlayerDriven = false;
        }
        this._kaijuTarget = k || null;
        // If we're already in drive mode, mark the new target as driven
        if (k && this.mode === "kaiju_drive") {
            k._isPlayerDriven = true;
        }
    }

    // Round 96 — set the target the orbit cam circles. Accepts:
    //   - a single object with .position {x,y,z}  (typical: the OGRE)
    //   - an array of such objects (frame both when 2 OGREs present)
    //   - null/empty (clears target; orbit cam falls back to observer)
    // Doesn't change mode — call setMode("ogre_orbit") separately to
    // engage. Keeps target update + mode toggle independent so the
    // caller can pre-set the target before entering the mode.
    setOrbitTarget(target) {
        if (target == null) {
            this._orbitTarget = null;
            return;
        }
        if (Array.isArray(target)) {
            if (target.length === 0) { this._orbitTarget = null; return; }
            this._orbitTarget = target;
        } else {
            this._orbitTarget = target;
        }
    }

    toggleMode() {
        // Round 46 — missile_cam isn't a player-toggleable mode; ignore
        // F-key while a missile is in flight. MissileSystem owns the
        // mode change in/out.
        if (this.mode === "missile_cam") return;
        this.setMode(this.mode === "observer" ? "fp" : "observer");
    }

    _move(dt) {
        // Round 46 — missile_cam: skip player movement entirely.
        // MissileSystem.tick drives camera position; mouse-look still
        // updates yaw/pitch (used as missile heading).
        if (this.mode === "missile_cam") return;
        if (this.mode === "ogre_orbit") {
            this._moveOrbit(dt);
            return;
        }
        if (this.mode === "kaiju_drive") {
            this._moveKaijuDrive(dt);
            return;
        }
        if (this.mode === "fp") {
            this._moveFP(dt);
        } else {
            this._moveObserver(dt);
        }
    }

    // Round 96 — orbit-cam tick. Circles a target (or framed midpoint
    // of multiple targets) at increasing distance with spread, raises Y
    // when terrain at the desired XZ would clip into the camera. Looks
    // at the target each frame so yaw/pitch track automatically.
    //
    // If target is null/empty, gracefully degrades to a hover-in-place
    // (camera doesn't fly off; user can switch to observer to recover).
    _moveOrbit(dt) {
        // Resolve target — single or list. Compute centroid + spread.
        let cx = 0, cy = 0, cz = 0, n = 0;
        let maxSpread = 0;
        const arr = Array.isArray(this._orbitTarget) ? this._orbitTarget : (this._orbitTarget ? [this._orbitTarget] : []);
        for (const t of arr) {
            const p = t?.position;
            if (!p) continue;
            cx += p.x; cy += p.y; cz += p.z;
            n++;
        }
        if (n === 0) return;                  // no target, hover in place
        cx /= n; cy /= n; cz /= n;
        if (n > 1) {
            for (const t of arr) {
                const p = t?.position;
                if (!p) continue;
                const d = Math.hypot(p.x - cx, p.z - cz);
                if (d > maxSpread) maxSpread = d;
            }
        }

        // Advance orbit angle
        this._orbitAngle += this._orbitYawRate * dt;
        if (this._orbitAngle > Math.PI * 2) this._orbitAngle -= Math.PI * 2;

        // Distance scales up if framing 2+ targets (need more space)
        const dist = this._orbitDistance + maxSpread * 1.4;
        const height = this._orbitHeight + maxSpread * 0.4;

        // Desired camera position on a circle around (cx, cz)
        const dx = Math.cos(this._orbitAngle) * dist;
        const dz = Math.sin(this._orbitAngle) * dist;
        let px = cx + dx;
        let pz = cz + dz;
        let py = cy + height;

        // Terrain avoidance — sample the surface at the desired XZ.
        // If our requested Y would have the camera below terrain (or
        // within clearance of it), lift the camera up. This prevents
        // the "inside-mountain" view the user flagged earlier.
        // Also sample a few intermediate points between target and
        // camera so we catch ridges that intrude into the sightline.
        //
        // v405 — bilinear sampling. The integer _terrainTopAt produced
        // visible stairs as the orbit angle swept across voxel
        // boundaries; bilinear gives a smooth float height per sample,
        // and taking the max of smooth samples is still smooth.
        if (this.world?.voxelAt) {
            const samples = 4;
            let maxTopY = -Infinity;
            for (let i = 1; i <= samples; i++) {
                const t = i / samples;
                const sx = cx + dx * t;
                const sz = cz + dz * t;
                const topY = this._terrainTopAtBilinear(sx, sz);
                if (topY > maxTopY) maxTopY = topY;
            }
            const requiredY = maxTopY + this._orbitClearance;
            if (py < requiredY) py = requiredY;
        }
        if (py < this._orbitMinY) py = this._orbitMinY;

        this.position.x = px;
        this.position.y = py;
        this.position.z = pz;

        // Look at target centroid (slightly above center to bias up)
        const lookX = cx;
        const lookY = cy + 2;
        const lookZ = cz;
        const fwdX = lookX - px;
        const fwdY = lookY - py;
        const fwdZ = lookZ - pz;
        // Yaw: atan2 with engine convention atan2(x, z) so yaw=0 looks +Z
        this.yaw   = Math.atan2(fwdX, fwdZ);
        // Pitch from horizontal: positive looks UP, negative DOWN.
        // Since we're above the target looking down, pitch is negative.
        const horiz = Math.hypot(fwdX, fwdZ);
        this.pitch = -Math.atan2(-fwdY, horiz);     // sign so down → negative
    }

    // v3911 -- *** WHO OWNS A KEY, ASKED RATHER THAN GUESSED. ***
    // Keith: pressing W on index.html moved the camera forward AND tipped it toward the sky. Both were happening:
    // this class consumes KeyW in _moveObserver/_moveFP/_moveKaijuDrive, while main.js's navPad ALSO bound KeyW
    // to "rotUp". The pad tried to stand aside -- but its guard read `mode === "fp" || mode === "kaiju_drive"`,
    // and it named TWO of the THREE modes that move on WASD. IT MISSED "observer", WHICH IS THE DEFAULT
    // (constructor, this.mode = "observer"), so the collision was live in the mode everyone starts in and in no
    // other. A HAND-LISTED SET OF MODES IS A SECOND DECLARATION OF THE DISPATCH ABOVE, and it drifted the moment
    // a third mover existed.
    //
    // So the pad no longer decides. It asks, and the answer lives beside the dispatch it has to agree with.
    // PER-MODE, because a blanket set would be wrong in the other direction: KeyE is read ONLY by
    // _moveKaijuDrive, and blocking it in observer would take the pad's rotRight away for no reason.
    consumesKey(code) {
        // these two return before any _move* runs -- see the dispatch in update(): missile_cam returns outright,
        // ogre_orbit goes to _moveOrbit, which reads no keys at all.
        if (this.mode === "missile_cam" || this.mode === "ogre_orbit") return false;
        if (Camera.MOVEMENT_KEYS.has(code)) return true;
        return code === "KeyE" && this.mode === "kaiju_drive";
    }

    _moveObserver(dt) {

        const cy = Math.cos(this.yaw);
        const sy = Math.sin(this.yaw);

        const cp = Math.cos(this.pitch);
        const sp = Math.sin(this.pitch);

        const fx = sy * cp;
        const fy = sp;
        const fz = -cy * cp;

        const rx = cy;
        const rz = sy;

        let mx = 0, my = 0, mz = 0;

        if (this.keys.has("KeyW")) { mx += fx; my += fy; mz += fz; }
        if (this.keys.has("KeyS")) { mx -= fx; my -= fy; mz -= fz; }
        if (this.keys.has("KeyD")) { mx += rx; mz += rz; }
        if (this.keys.has("KeyA")) { mx -= rx; mz -= rz; }

        if (this.keys.has("Space")) my += 1;
        if (this.keys.has("ShiftLeft")) my -= 1;
        // v1409 — external analog move (gamepad / phone).
        const _ext = this._extMove;
        if (_ext && (_ext.fwd || _ext.strafe)) { mx += fx * _ext.fwd + rx * _ext.strafe; my += fy * _ext.fwd; mz += fz * _ext.fwd + rz * _ext.strafe; }

        let len = Math.hypot(mx, my, mz);
        if (!len) return;
        if (len > 1) { mx /= len; my /= len; mz /= len; }   // v1409 — clamp to 1, keep analog

        const step = this.moveSpeed * dt;

        this.velocity.x = mx * this.moveSpeed;
        this.velocity.y = my * this.moveSpeed;
        this.velocity.z = mz * this.moveSpeed;

        this.position.x += mx * step;
        this.position.y += my * step;
        this.position.z += mz * step;
    }

    // Round 28 — first-person walking with gravity, terrain following,
    // 1-voxel auto-step, jump. Uses world.voxelAt for terrain queries.
    _moveFP(dt) {
        const cy = Math.cos(this.yaw);
        const sy = Math.sin(this.yaw);

        // Horizontal forward = projected onto XZ plane (ignore pitch
        // so looking up while walking goes forward, not skyward)
        const fx = sy;
        const fz = -cy;
        const rx = cy;
        const rz = sy;

        let mx = 0, mz = 0;
        if (this.keys.has("KeyW")) { mx += fx; mz += fz; }
        if (this.keys.has("KeyS")) { mx -= fx; mz -= fz; }
        if (this.keys.has("KeyD")) { mx += rx; mz += rz; }
        if (this.keys.has("KeyA")) { mx -= rx; mz -= rz; }
        // v1409 — external analog move (gamepad / phone): fwd/strafe in -1..1.
        const _ext = this._extMove;
        if (_ext && (_ext.fwd || _ext.strafe)) { mx += fx * _ext.fwd + rx * _ext.strafe; mz += fz * _ext.fwd + rz * _ext.strafe; }

        const horizLen = Math.hypot(mx, mz);
        if (horizLen > 1) {           // v1409 — clamp to max speed; analog magnitudes < 1 stay analog
            mx /= horizLen; mz /= horizLen;
        }
        // Round 31 — sprint gated by energy. Shift requested → check
        // bar; report active sprint so PlayerEnergy drains while held.
        const wantSprint = this.keys.has("ShiftLeft");
        const hasEnergy = this.playerEnergy ? this.playerEnergy.canSprint() : true;
        const isSprinting = wantSprint && hasEnergy;
        if (this.playerEnergy) this.playerEnergy.setSprinting(isSprinting && horizLen > 0);
        this._sprinting = isSprinting && horizLen > 0;   // Round 31 — drives the sprint FOV widen
        const speed = isSprinting ? this._fpSprintSpeed : this._fpWalkSpeed;

        // Try horizontal move with collision check
        const newX = this.position.x + mx * speed * dt;
        const newZ = this.position.z + mz * speed * dt;
        // v4549 -- ASKED AT THE HEIGHT THE BODY WOULD STAND AT, NOT THE ONE IT IS AT. See _stepTargetAt:
        // a body with a radius cannot approach a lip at its current height, because its disc overlaps the
        // column it is about to climb. The step-up and the footprint are one question and this asks it once.
        const feetNow = this.position.y - this._eyeHeight;
        const canGo = (nx, nz) => {
            const t = this._stepTargetAt(nx, nz, feetNow);
            return this._canStandAt(nx, (t === null ? feetNow : t) + this._eyeHeight, nz);
        };
        if (canGo(newX, newZ)) {
            this.position.x = newX;
            this.position.z = newZ;
        } else {
            // Try axes independently — slide along walls
            if (canGo(newX, this.position.z)) this.position.x = newX;
            if (canGo(this.position.x, newZ)) this.position.z = newZ;
        }

        // Vertical — gravity + ground snap + jump
        // v404 — bilinear ground sample so walking across sloped voxel
        // terrain doesn't produce visible "stairs". Other callers of
        // _terrainTopAt (mode-init snap, orbit clearance, kaiju drive
        // ground check) keep the integer version because they're
        // one-shot snaps or comparisons where integer is fine.
        // v4545 -- the body's FEET, so the probe answers the surface this body is on rather than the topmost
        // in the column. The reach is STEP_UP_MAX because this is the WALKING query: a walker may step up.
        // fallBody's falling query takes no reach at all, and the difference is the whole of v4544's note.
        const feetY = this.position.y - this._eyeHeight;
        // *** v4552 -- THE WALK STANDS ON A SURFACE A COLUMN ACTUALLY HAS, AND THAT IS A REVERSAL OF v404.
        // *** _terrainTopAtBilinear blends up to four columns, so it answers heights NEITHER of them has;
        // this branch then assigned one to position.y and nothing ever asked _canStandAt whether a body
        // fits there -- that predicate has exactly one shipping call site and it is the HORIZONTAL move.
        // MEASURED on the generated world before the repair: 67.77% of distinct standing positions and
        // 70.64% of pre-freeze grounded frames had the body inside solid rock, 84 of 128 walks ended frozen
        // in it, worst depth 3.000 voxels. After: 6.37%, 4.06%, 1 of 128.
        // *** NO GROUND RULE IS BOTH LEGAL AND SMOOTH, AND THAT IS THE FINDING RATHER THAN A COMPROMISE. ***
        // A sub-voxel walking height on a unit lattice is BY CONSTRUCTION a height no column has, so the
        // blend's smoothness IS its illegality. The smoothness therefore cannot come from the ground rule
        // and is taken from TIME instead -- see Camera.EYE_SMOOTH_RATE, which smooths the PICTURE and never
        // this number. v404's stairs are removed on the render side; the body is legal on this side.
        const groundY = this._walkGroundAt(this.position.x, this.position.z, feetY);
        const targetY = groundY === null ? null : groundY + this._eyeHeight;
        // v4546 -- THE SLOPE OF THE GROUND CROSSED THIS FRAME. See _fpSlopeDeg for why it is a secant over
        // the distance travelled rather than a normal, and why that is the only form of it a voxel lattice
        // can answer. Zero when the body did not move horizontally: a body standing still crosses no ground.
        const slope = groundY === null ? null : this._fpSlopeDeg(mx, mz, groundY, feetY);
        this._fpSlope = slope;

        if (groundY === null && this._fpOnGround) {
            // v4552 -- NOTHING UNDER THE DISC WITHIN REACH: a hole, not a floor. HEAD reached the same
            // outcome by having _terrainTopAt return 0 for a not-found column and letting dy < -CLIFF_DROP
            // trip the branch below; saying it outright is the same behaviour with the reason attached.
            this._fpOnGround = false;
            this._fpVelY = 0;
            this._fpFallStartTime = performance.now();
        } else if (this._fpOnGround) {
            // v406 — branch logic retuned for the v404 bilinear ground.
            // Original thresholds (0.05u "fall trigger") were tuned for
            // the integer-Y path where targetY only changed across voxel
            // boundaries. With bilinear, targetY varies continuously: on
            // any modest slope, the per-frame downhill delta exceeds
            // 0.05 and the old code would briefly enter falling mode,
            // re-land, and repeat — visible as stairs even though the
            // sample was smooth.
            //
            // New rule: smoothly track targetY when on ground for any
            // delta within a "walkable" envelope. Only enter falling on
            // a genuine cliff (drop > CLIFF_DROP in one frame).
            // v4545 -- STEP_UP_MAX is Camera.STEP_UP_MAX now, because _terrainTopAt reads it too: the probe's
            // reach and the walker's allowance are the same question and two copies of a number that must
            // agree is the shape v4542 removed from BotManager. CLIFF_DROP stays local; nothing else reads it.
            // The sentence that used to sit here -- "climbs taller than STEP_UP_MAX are blocked by
            // _canStandAt earlier" -- WAS FALSE, and the wall branch below carried the same false reason.
            // See there.
            const STEP_UP_MAX = Camera.STEP_UP_MAX;
            // *** CLIFF_DROP WAS A PER-FRAME TEST, WHICH MAKES IT A FRAME-RATE SWITCH RATHER THAN A CLIFF
            // RULE. *** physics/character/terrainWalk.mjs is shaped around exactly this: "a slope limit
            // tested on the per-step height difference is not a slope limit ... the height difference over
            // one substep shrinks with the substep while the slope does not. The limit then depends on the
            // frame rate, which is the definition of a bug you cannot reproduce." Measured here, one body,
            // one speed, one 63.4-degree slope, ONLY THE FRAME RATE CHANGING: it falls at 6 fps and walks
            // down it grounded at 10, 15, 20, 30, 60, 120, 144 and 240. The drop per frame is 5 * dt * 2,
            // which crosses 1.5 only below about 9 fps.
            //
            // The slope is a RATIO of two quantities that both scale with dt, so it does not move with the
            // frame rate at all, and it is kept as a second test rather than replacing CLIFF_DROP because
            // the two catch different things: a cliff EDGE is a discontinuity where the ground falls away
            // over no horizontal distance at all, and a slope is what you can walk down. Both still end the
            // step by leaving the ground, which is the only outcome this branch has.
            const CLIFF_DROP  = 1.5;     // drop bigger than this = walked off a ledge, in ONE frame
            const dy = targetY - this.position.y;
            // *** THE LIMIT IS INCLUSIVE, AND THE TOLERANCE IS A MEASUREMENT RATHER THAN A CUSHION. ***
            // A one-voxel-per-column ramp is 45.0000 degrees by construction and atan2(1, 1) * 180 / PI is
            // EXACTLY 45 -- but the two heights come out of the bilinear blend, which accumulates about
            // 2e-13 of it, so the ramp reads 45.0000000000001990 and a bare `> 45` threw the body off a
            // slope it had just been told it could walk. Measured: 21 frames of 240 over the limit, four
            // separate departures from the ground, on a hill whose true angle is the limit exactly.
            // terrainWalk records the same hazard from the other side -- `n.y` against cos(45) is one ULP
            // and its remedy is a 1e-12 tolerance in cosine, "far below anything terrain can express and
            // far above the 1.1e-16 that caused it". 1e-9 DEGREES is that argument in this file's units:
            // five thousand times the error measured here, and a lattice's finest real distinction is
            // 45.0 against 63.4.
            const tooSteepDown = dy < 0 && slope !== null &&
                                 slope > Camera.MAX_SLOPE_DEG + Camera.SLOPE_EPS_DEG;
            if (dy > STEP_UP_MAX) {
                // *** UNREACHABLE FROM THE VOXEL PATH, AND v4545 IS THE ROUND THAT MADE THAT TRUE. *** This
                // read "_canStandAt already blocked the XZ move, so this should be unreachable. Defensive:
                // stay." -- and _canStandAt returns TRUE at a cave floor, at a tunnel floor and on the lower
                // of two decks, so it blocked nothing of the sort; tools/ship/playerGround-selfcheck.mjs
                // section 3 drives it and gets true. A defensive branch with a FALSE reason is worse than no
                // branch, because it tells the next reader not to look.
                // The true reason is arithmetic, not a guard: _terrainTopAt is given the body's feet and
                // cannot return a surface more than STEP_UP_MAX above them, the bilinear blend of four such
                // corners is bounded by the same number, and both read THIS number -- so dy <= STEP_UP_MAX
                // identically. Measured at 0.083333 max over a 260-frame climb of four voxels, 0 firings.
                // It stays as a total for `dy` rather than being deleted, because _extMove and the kaiju
                // path can set position.y from outside this function.
            } else if (dy < -CLIFF_DROP || tooSteepDown) {
                // Cliff, or ground too steep to walk down — start falling
                this._fpOnGround = false;
                this._fpVelY = 0;
                this._fpFallStartTime = performance.now();
            } else {
                // Smooth track. Covers both up-steps within range and
                // downhill slopes (where dy is a small negative number).
                this.position.y = targetY;
            }
            // Jump
            if (this.keys.has("Space")) {
                this._fpVelY = this._fpJumpVel;
                this._fpOnGround = false;
            }
        } else {
            // *** A FALLING BODY GETS NO REACH, AND UNTIL v4548 THIS ONE GOT THE WALKER'S. ***
            // `groundY` above is the WALKING query and carries STEP_UP_MAX, because a walker may step up.
            // Handing that to a body in mid-air lets the probe name a surface ABOVE it and this clamp then
            // puts it there. physics/character/fallBody.mjs found and fixed exactly this for the bots at
            // v4544 -- "stepUp is how far a body may CLIMB onto something; handing it to a falling body
            // lets the probe name a surface ABOVE it and the clamp then lands it up there" -- and v4545
            // brought the body-aware probe into this file without separating the two queries, so the
            // defect arrived here with the repair.
            // MEASURED on a column standable at 2, 10 and 21: a body released in open air with its feet at
            // 19.8 was LIFTED 1.20 UPWARDS onto the deck at 21 in ONE FRAME, at 19.9 lifted 1.10, at 20.5
            // lifted 0.50 -- and at 19.7 it fell eleven voxels to the deck at 10. A tenth of a unit in
            // release height, eleven voxels of outcome, and the cut sits exactly at STEP_UP_MAX, which is
            // what proves it is the walking allowance and not anything else.
            // *** AND ZEROING THE REACH ALONE IS NOT THE FIX -- IT TRADES A LIFT FOR A TUNNEL. *** These
            // six lines MOVED the body and then probed at where it had arrived, so with no reach the probe
            // is asked from BELOW a surface the body crossed during the step and cannot see it any more.
            // Measured with the reach zeroed and the order left alone: a body released at feet 20.5 fell
            // PAST the deck at 21 AND the deck at 10 and landed at 0, 91 frames. physics/character/
            // fallBody.mjs is built the other way round -- probe at the CURRENT height, compare the WANTED
            // one -- which is the whole of its "cannot tunnel, structurally rather than by substepping"
            // claim, driven there at speeds up to ten million. So this calls that module instead of being
            // a third copy of it, which is what task #25 is about.
            // The gravity and the absent terminal are the CAMERA'S and are passed through unchanged:
            // v4547 measured both as live disagreements with the bots and recorded that changing either is
            // a gameplay decision. Removing a duplicate must not smuggle one in.
            const r = fallStep({ pos: [this.position.x, this.position.y - this._eyeHeight, this.position.z],
                                 vy: this._fpVelY, surfaceUnder: this._fallSurface(),
                                 dt, gravity: -this._gravity, terminal: -Infinity });
            this.position.y = r.pos[1] + this._eyeHeight;
            this._fpVelY = r.vy;
            if (r.landed) this._fpOnGround = true;
        }

        this.velocity.x = mx * speed;
        this.velocity.y = this._fpVelY;
        this.velocity.z = mz * speed;
    }

    // Round 124 — first-person kaiju drive. The camera attaches to a
    // kaiju entity (set via setKaijuTarget) and the player's keyboard
    // input drives the kaiju's position field directly, bypassing AI.
    // Mouse-look updates the camera yaw and is also reflected on the
    // kaiju's heading so the obelisk faces where the camera looks.
    //
    // Movement uses the kaiju's own _stamina field (initialized to 1.0
    // on first drive) which depletes during sprint/jump/attacks and
    // regenerates when idle. Stamina is published on the kaiju entity
    // so the HUD can read it without going through the camera.
    //
    // Camera position is offset slightly above + slightly behind the
    // kaiju's body so the rider sees the kaiju's silhouette in their
    // foreground — gives a sense of "I'm controlling this thing" even
    // though the obelisk is the only visual. When round 31b lands and
    // replaces the obelisk with a GLB walking rig, the same offset will
    // place the camera near the rig's "head" naturally.
    _moveKaijuDrive(dt) {
        const k = this._kaijuTarget;
        if (!k || !k.isAlive || !k.isAlive()) {
            // Target died or vanished — fall back to observer mode so
            // we don't strand the camera. Caller can reselect a kaiju
            // and re-enter the mode.
            this.setMode("observer");
            return;
        }
        // Initialize stamina on first drive
        if (k._stamina == null) k._stamina = 1.0;
        // v774 (round 31) — weapon energy pool. Separate from stamina;
        // drained by playerFire(), regenerated continuously at 0.20/s
        // here. A meteor (0.35 cost) takes ~1.75s to refill, a beam
        // (0.15 cost) takes ~0.75s.
        if (k._weaponEnergy == null) k._weaponEnergy = 1.0;
        // v781 — refill rate scales with stamina. Full stamina (1.0)
        // → 0.30/sec regen (fast, ready for sustained fire). Empty
        // stamina (0.0) → 0.10/sec (slow, encourages resting before
        // committing to combat). Linear interp between.
        const refillRate = 0.10 + 0.20 * (k._stamina ?? 1);
        k._weaponEnergy = Math.min(1, k._weaponEnergy + refillRate * dt);

        // v777 — sustained fire. While LMB is held in kaiju_drive,
        // autofire each frame; playerFire's 250ms cooldown naturally
        // rate-limits to ~4 shots/sec. Beams + AoE feel sustained at
        // that rate; projectiles read as rapid fire. Each shot honors
        // the same energy cost / target lookup as a click.
        if (this._lmbHeld) {
            const km = (typeof window !== "undefined") ? window.kaijuManager : null;
            if (km?.playerFire) {
                km.playerFire(k, this);   // result ignored — cooldown/no-energy silently retried next frame
            }
            // v796 — continuous beam ribbon. While LMB held + the current
            // attack is beam-family + there's a target, expose an active
            // beam descriptor on the kaiju manager so the render loop can
            // draw a sustained ribbon between source and target. The 80ms
            // particle bursts in _executeBeam still fire (sparks/flair),
            // but the ribbon fills the visual gap between them.
            try {
                const peek = km?.peekPlayerAttack?.(k);
                if (peek?.attack?.family === "beam") {
                    // Resolve target: prefer lock-target (sticky), else crosshair-target,
                    // else extend forward to max range.
                    let target = null;
                    if (k._lockTarget) {
                        const lt = k._lockTarget;
                        target = { x: lt.x, y: lt.y ?? k.position.y, z: lt.z };
                    } else {
                        const ct = km.peekCrosshairTarget?.(this, 60, 3.0);
                        if (ct?.ref) target = { x: ct.x, y: ct.y, z: ct.z };
                    }
                    if (!target) {
                        // No target — extend ribbon along camera forward
                        const fx = Math.cos(this.pitch) * Math.sin(this.yaw);
                        const fy = Math.sin(this.pitch);
                        const fz = -Math.cos(this.pitch) * Math.cos(this.yaw);
                        target = {
                            x: k.position.x + fx * 60,
                            y: k.position.y + fy * 60,
                            z: k.position.z + fz * 60,
                        };
                    }
                    if (!km._activeBeams) km._activeBeams = new Map();
                    km._activeBeams.set(k.id, {
                        source: { x: k.position.x, y: k.position.y, z: k.position.z },
                        target,
                        attackName: peek.attackName,
                        expiresAt: (typeof performance !== "undefined" ? performance.now() : Date.now()) + 100,   // v798 — refreshed each frame while LMB held
                    });
                } else if (km?._activeBeams) {
                    km._activeBeams.delete(k.id);
                }
            } catch {}
        } else if (typeof window !== "undefined" && window.kaijuManager?._activeBeams) {
            window.kaijuManager._activeBeams.delete(k.id);
        }

        // Pitch is unused for movement (we keep movement on the
        // horizontal plane like FP mode), but we save it for mouse-look.
        // v779 — free-aim during sprint. Sprint captures the camera
        // yaw at start; movement uses that heading while sprinting,
        // so the player can look around (mouse) without veering off
        // their run direction. Walk mode still uses live yaw (turning
        // is responsive when not committed to a sprint direction).
        const liveCy = Math.cos(this.yaw);
        const liveSy = Math.sin(this.yaw);
        const wasSprint = !!this._sprintActive;
        const wantSprintCheck = this.keys.has("ShiftLeft") && k._stamina > 0.05;
        // Tentatively figure out whether we're going to commit to a
        // sprint this frame (still need horizLen, computed below). We
        // use the LIVE yaw to read WASD intent so a turn-into-sprint
        // still works on the first frame.
        const cy = (wasSprint && this._sprintHeading != null) ? Math.cos(this._sprintHeading) : liveCy;
        const sy = (wasSprint && this._sprintHeading != null) ? Math.sin(this._sprintHeading) : liveSy;
        const fx = sy;
        const fz = -cy;
        const rx = cy;
        const rz = sy;

        let mx = 0, mz = 0;
        if (this.keys.has("KeyW")) { mx += fx; mz += fz; }
        if (this.keys.has("KeyS")) { mx -= fx; mz -= fz; }
        if (this.keys.has("KeyD")) { mx += rx; mz += rz; }
        if (this.keys.has("KeyA")) { mx -= rx; mz -= rz; }
        const horizLen = Math.hypot(mx, mz);
        if (horizLen > 0) {
            mx /= horizLen; mz /= horizLen;
        }

        // Sprint: shift while moving + stamina available.
        // Kaiju are bigger than the player so base speed is faster
        // (kaiju walk = ~8 u/s; sprint = ~14 u/s). Stamina drains
        // at 0.4/s while sprinting, regenerates at 0.25/s when idle,
        // 0.15/s while just walking.
        const wantSprint = wantSprintCheck && horizLen > 0;
        const speed = wantSprint ? 14 : 8;
        if (wantSprint) {
            k._stamina = Math.max(0, k._stamina - 0.40 * dt);
        } else if (horizLen > 0) {
            k._stamina = Math.min(1, k._stamina + 0.15 * dt);
        } else {
            k._stamina = Math.min(1, k._stamina + 0.25 * dt);
        }

        // v779 — sprint heading commit/release. Transition WALK → SPRINT
        // captures live yaw; SPRINT → WALK clears it so next walk
        // movement uses live yaw responsively.
        if (wantSprint && !wasSprint) {
            this._sprintHeading = this.yaw;
            this._sprintActive = true;
        } else if (!wantSprint && wasSprint) {
            this._sprintHeading = null;
            this._sprintActive = false;
        }

        // v786 — Hold-E to mark target. Refreshes k._lockTarget without
        // firing, so the player can establish a sticky aim BEFORE
        // engaging. Lock window stays at 3s while E held (re-set each
        // frame), so even slow tracking holds. Released → lock decays
        // via the normal 1.5s post-fire window after the next shot, OR
        // just expires after 3s if never fired.
        if (this.keys.has("KeyE")) {
            const km = (typeof window !== "undefined") ? window.kaijuManager : null;
            const peek = km?.peekCrosshairTarget?.(this, 80, 3.0);
            if (peek?.ref) {
                // Wrap in same proxy shape playerFire uses so AoE / civ paths
                // route correctly when the player DOES fire on this target.
                const proxy = (peek.ref?.applyDamage)
                    ? peek.ref
                    : { x: peek.x, y: peek.y, z: peek.z, ref: peek.ref, applyDamage: (d) => peek.ref?.applyDamage?.(d) };
                k._lockTarget    = proxy;
                k._lockExpiresAt = (typeof performance !== "undefined" ? performance.now() : Date.now()) + 3000;
                k._markingActive = true;
            } else {
                k._markingActive = false;
            }
        } else {
            k._markingActive = false;
        }

        // Jump: Space + on-ground + stamina cost
        if (this.keys.has("Space") && this._kaijuDriveOnGround && k._stamina > 0.15) {
            this._kaijuDriveVelY = 11;        // bigger jump than player FP
            this._kaijuDriveOnGround = false;
            k._stamina = Math.max(0, k._stamina - 0.15);
        }

        // Horizontal movement: write directly to kaiju position
        k.position.x += mx * speed * dt;
        k.position.z += mz * speed * dt;
        // Heading on the kaiju so the obelisk visual faces the camera.
        // Some renderers/animators read .heading; the obelisk doesn't
        // currently rotate but the field is harmless to set and round
        // 31b's GLB rig will use it.
        if (horizLen > 0) k.heading = this.yaw;

        // Vertical: gravity + terrain step-up
        // v405 — bilinear ground sample for kaiju drive too. Integer Y was producing stairs when the
        // controlled kaiju walked across sloped voxel terrain.
        // *** THAT SENTENCE HAS SAT ABOVE INTEGER-PROBE CODE SINCE v4548 AND ARGUES AGAINST v4552'S OWN
        // TRADE, SO IT IS ANSWERED RATHER THAN LEFT. *** v4548 routed this fall through fallBody over the
        // INTEGER probe, so the "bilinear ground sample" v405 describes has not been here for four rounds.
        // And v4552 took the PLAYER's walk off the blend for the reason v405 could not have known: a blend
        // of a lattice answers heights no column has, and the body was standing inside the rock on 56.56%
        // of grounded frames. v405's complaint was real -- integer Y does step a whole voxel -- and the
        // answer is now that the STEP is real and the SMOOTHNESS is taken in the picture, by
        // Camera.EYE_SMOOTH_RATE, rather than by putting the body where no column is.
        // *** THE FOURTH COPY OF "FALL UNTIL YOU LAND" IS GONE, AND TWO DEFECTS WENT WITH IT. ***
        // These were six lines -- integrate, move, probe, clamp -- and they carried BOTH of the defects the
        // player's copy carried plus one of their own:
        //   (1) the probe was the WALKING one, so a kaiju passing under a ledge within STEP_UP_MAX was
        //       LIFTED onto it: measured, y 19.9 under a deck at 21 became 21 in one frame, 1.10 upwards,
        //       while one at 19.7 fell eleven voxels to the deck at 10;
        //   (2) it moved first and probed after, so zeroing that reach alone would trade the lift for a
        //       tunnel -- see _moveFP's airborne branch, which had the same shape;
        //   (3) *** _kaijuDriveOnGround WAS A LATCH THAT ONLY LANDING SET AND ONLY JUMPING CLEARED. ***
        //       Walking off a ledge never touched it. Driven off a 38-voxel cliff, the flag read TRUE for
        //       the whole descent -- at frame 89, 34 units up and falling at 14.4 m/s, it still read true
        //       -- so Space gave a FREE MID-AIR JUMP at any height, gated only by stamina. It is read off
        //       the module's own `airborne` now, which is computed per frame and cannot latch.
        const kr = fallStep({ pos: [k.position.x, k.position.y, k.position.z], vy: this._kaijuDriveVelY,
                              surfaceUnder: this._fallSurface(),
                              dt, gravity: -this._gravity, terminal: -Infinity });
        k.position.y = kr.pos[1];
        this._kaijuDriveVelY = kr.vy;
        this._kaijuDriveOnGround = !kr.airborne;

        // Camera position — slightly above the kaiju's "head" + 2u
        // back along the look direction so the kaiju's silhouette is
        // visible in front of us.
        //
        // Round 125 — when a rigged GLB mesh is attached to the kaiju,
        // derive head height from the kaiju's config scale (rigs grow
        // with scale; head height ~2× scale at typical proportions).
        // For obelisk-only kaiju, fall back to the hardcoded ~8u that
        // matches the obelisk silhouette.
        const KAIJU_HEAD_Y = (k._meshEntityId != null)
            ? Math.max(4, (k.config?.scale ?? 3) * 2.0)
            : 8;
        const BACK_OFFSET  = 2;
        const cyP = Math.cos(this.pitch);
        const fwX = sy * cyP;
        const fwZ = -cy * cyP;
        this.position.x = k.position.x - fwX * BACK_OFFSET;
        this.position.y = k.position.y + KAIJU_HEAD_Y;
        this.position.z = k.position.z - fwZ * BACK_OFFSET;

        // Velocity exposure for downstream systems (audio, etc.)
        this.velocity.x = mx * speed;
        this.velocity.y = this._kaijuDriveVelY;
        this.velocity.z = mz * speed;
    }

    // *** THE TOPMOST SOLID IN THE COLUMN IS NOT WHERE A BODY STANDS, AND ON THIS WORLD IT IS NOT EVEN
    // CLOSE. *** This scanned down from y = 80 and returned the first solid it met, with no account of where
    // the body was. Measured in a real boot over 1,681 columns: 921 of them (54.8%) hold MORE THAN ONE place
    // a body can stand, giving 2,687 such places, and the topmost answer is right in 1,681 of them --
    // 62.56%, which is exactly the column count and not a coincidence: a function returning one y per column
    // is right once per column however good it is. Worst gap 42 voxels; at (-42,-60) the surfaces are 2 and
    // 19 and this said 19. It is the defect v4542 repaired for world/surfaceProbe.mjs's standHeightAt, never
    // applied to the controller the human drives.
    //
    // *** AND THE SYMPTOM IS NOT THE ONE IT LOOKS LIKE. *** _moveFP guards with `dy > STEP_UP_MAX`, so the
    // player is NOT lifted onto the hillside -- the guard holds. What happens instead is that vertical
    // tracking DIES: driven from open ground into a tunnel mouth, y freezes at 2.700 and stays there, with
    // _fpOnGround stuck true, and the player does not fall even when the floor under them is removed
    // entirely. The freeze begins at x = 9.08, a voxel BEFORE the tunnel, because the bilinear sampler
    // blends the neighbouring column's 21 in. That guard's own comment read "_canStandAt already blocked the
    // XZ move, so this should be unreachable" -- and _canStandAt at a tunnel floor returns TRUE, so it never
    // blocked anything.
    //
    // Given the body's feet in `fromY` this asks world/surfaceProbe.mjs instead, which scans DOWN from the
    // body's own reach. That module is gated and measured (2,644 of 2,644 body-places correct against this
    // rule's 1,681) and importing it is the point: a third copy of the rule is the defect, not the fix.
    // Without `fromY` the answer is byte-identical to the pre-v4545 one, which is what lets the orbit
    // clearance test -- which genuinely wants the topmost, because it is keeping a CAMERA out of a hill --
    // keep its behaviour and its readings.
    /**
     * The surface THIS body can stand on in one column, or `null` when the column offers none from the
     * body's reach down to the bottom of the world.
     *
     * *** null AND 0 ARE DIFFERENT ANSWERS AND CONFLATING THEM PARKED THE BODY INSIDE THE FLOOR. *** See
     * _terrainTopAtBilinear: the blend averages four columns, and a column reported as 0 when it really
     * means "nothing you can reach here" drags that average halfway to the world floor. 0 is also a
     * legitimate height, so the distinction cannot be carried in the number -- hence this method, and
     * _terrainTopAt below mapping null to 0 for the callers whose contract has always been a number.
     *
     * *** AN ADAPTER, NOT A COPY, AND NOT A hasVoxels GATE EITHER. *** The first draft asked
     * hasVoxels(this.world) and called standHeightAt directly -- and every fixture in this file's own gate
     * went on showing the defect, because the camera's world interface has always been `voxelAt` and
     * surfaceProbe's is `isAir` plus `chunkHeight`. A repair that silently does not apply to the worlds its
     * own caller supports is the shape of "a check nothing reaches", in code. The shim is four lines and
     * makes the gated rule work on every world the camera already accepts; writing the scan out again here
     * would be the third copy of it this session filed as a task.
     */
    _standYAt(x, z, fromY, reach = Camera.STEP_UP_MAX) {
        const v = (xx, yy, zz) => this.world.voxelAt(xx, yy, zz);
        const shim = {
            chunkHeight: Number.isFinite(this.world.chunkHeight) ? this.world.chunkHeight : 80,
            // v4550 -- the camera's ONE air test, and world.isAir's rule. Was written out here and in
            // two other places; the copy in _canStandAt had drifted onto a different answer for water.
            isAir: (xx, yy, zz) => !Camera.isSolidToBody(v(xx, yy, zz)),
        };
        return standHeightAt(shim, Math.floor(x), Math.floor(z), { y: fromY, stepUp: reach });
    }

    /**
     * *** THE SLOPE OF THE GROUND THIS BODY JUST CROSSED, AS A RISE OVER A RUN. *** Returns degrees, or
     * null when the body did not move horizontally -- a body standing still crosses no ground and has no
     * slope to be refused by.
     *
     * *** IT IS A SECANT AND NOT A NORMAL, AND ON THIS WORLD THAT IS THE ONLY FORM OF IT THAT WORKS. ***
     * physics/character/terrainWalk.mjs tests its limit on the surface NORMAL, which is right on a
     * heightfield and is recorded IN THAT FILE as failing on a lattice: "a bot standing on a flat cell at
     * (5.96, 1.99) reads 65.9 degrees 0.25 units ahead, over a lattice row of 28, 28, 29, 29, 30 -- a
     * ONE-UNIT LIP -- and stops there permanently." A fix was written there, measured, and REVERTED, because
     * re-probing a fixed distance ahead still lands inside the inter-cell band where the interpolated
     * surface is steep everywhere: 1.0, 1.25 and 1.5 all stayed blocked and 2.0 teleported the body.
     *
     * A secant does not have that problem, because it never asks about a point: it asks how much the ground
     * rose over how far the body went. Across a one-voxel lip that is 1 over 1, which is 45.0 degrees and
     * walkable; across a two-voxel lip it is 2 over 1, which is 63.4 and is not. The bilinear blend the
     * camera already samples IS the staircase's secant, so this costs one extra blend and no new instrument.
     *
     * *** AND IT DOES NOT MOVE WITH THE FRAME RATE, WHICH IS THE WHOLE POINT -- BUT ONLY BECAUSE THE RUN IS
     * A FIXED WORLD DISTANCE. *** The first draft of this took the secant over the distance travelled IN
     * THAT FRAME, on the reasoning that a rise and a run which both scale with dt have a ratio that does
     * not. That is true of a plane and false of a staircase: as dt shrinks the run shrinks INTO a lip, whose
     * rise does not shrink with it, so the angle runs to 90 and a shallow hill reads 45 degrees at every
     * voxel edge and 0 between them. Measured -- a 26.6-degree hill (one voxel every two columns) fell 76
     * frames of 240, because alternate column boundaries each read 45.0. The same trap as the rule it
     * replaces, wearing a ratio. SLOPE_RUN is one column, so the sample always spans a whole tread and a
     * whole riser and the average is the hill.
     */
    _fpSlopeDeg(dirX, dirZ, groundY, feetY) {
        const L = Math.hypot(dirX, dirZ);
        if (!(L > 1e-9)) return null;
        const R = Camera.SLOPE_RUN / L;
        // *** v4552 -- BOTH ENDS OF THE SECANT MUST READ THE SAME GROUND, AND CHANGING ONLY _moveFP
        // REBUILDS THE BUG v4546 CLOSED. *** Measured twice independently: with this end left on the
        // blend while the walk clamps, a true 45-degree ramp reads 53.1301023541557385 degrees -- past
        // MAX_SLOPE_DEG + SLOPE_EPS_DEG -- and the body is thrown off a slope it is allowed to walk, at
        // 6 fps only and at no other rate. A secant across two different instruments is not a secant.
        const ahead = this._walkGroundAt(this.position.x + dirX * R,
                                         this.position.z + dirZ * R, feetY);
        if (ahead === null) return null;   // a body over a hole crosses no ground and has no slope
        return Math.atan2(Math.abs(ahead - groundY), Camera.SLOPE_RUN) * 180 / Math.PI;
    }

    /**
     * The surface oracle physics/character/fallBody.mjs asks for: the first surface AT OR BELOW this body,
     * with NO reach, over this camera's own bilinear ground.
     *
     * *** THE ZERO IS THE POINT, AND SO IS THE INTEGER -- AND THE FIRST DRAFT OF THIS USED THE BLEND. ***
     * v404/v405 moved both camera paths to a BILINEAR ground because the integer one "produced visible
     * stairs" as a body walked across voxel boundaries, so the blend looked like the obvious thing to hand
     * a fall. It is not. A WALK crosses a boundary and wants the two columns averaged; a LANDING happens on
     * ONE COLUMN, and averaging puts the body at a height neither column has. Measured on the sandbox's own
     * hand world, a body walking off a two-voxel ledge at z=40 and landing at z=39.500: the blend drops the
     * higher corner (out of reach, correctly, for a falling body) and answers the LOWER floor at 2 -- while
     * the body straddles a column whose rock goes up to y=3. It landed with its FEET INSIDE SOLID STONE and
     * _canStandAt then refused every move, which is the stuck player these rounds keep being about.
     * So this is the integer probe with the reach forced to 0 -- which is precisely what fallBody's own
     * voxelSurface() does, and the reason that function exists. The blend keeps the walking query, where it
     * is right and where the stairs it was added for actually show.
     */
    _fallSurface() {
        // _standYAt IS that probe, and it already reports NOT-FOUND as null rather than as 0 -- which is
        // the distinction fallBody's contract needs and the one v4545 added this method for.
        return (x, z, y) => (this.world?.voxelAt ? this._standYAt(x, z, y, 0) : null);
    }

    _terrainTopAt(x, z, fromY = null, reach = Camera.STEP_UP_MAX) {
        if (!this.world?.voxelAt) return 0;
        if (Number.isFinite(fromY)) {
            const found = this._standYAt(x, z, fromY, reach);
            return found === null ? 0 : found;   // nothing under this body: 0 falls, as it always did
        }
        const fx = Math.floor(x), fz = Math.floor(z);
        for (let y = 80; y >= 0; y--) {
            if (Camera.isSolidToBody(this.world.voxelAt(fx, y, fz))) return y + 1;   // v4550 -- one rule
        }
        return 0;
    }

    // *** v4552 -- THIS IS NO LONGER THE WALK'S GROUND, AND THE NOTE BELOW IS HISTORY RATHER THAN RATIONALE.
    // *** _moveFP reads _walkGroundAt now. v404's complaint was true and its cure had a cost nobody had
    // measured: blending four columns answers a height NEITHER has, and on the generated world that stood
    // the body inside solid rock on 56.56% of grounded frames, freezing 67 of 128 ordinary walks in it. The
    // stairs v404 removed are back in the BODY and removed again in the PICTURE, by the eye smoother, which
    // is the one place the difference can be taken without lying about where the body is. The method stays
    // -- _terrainTopAt's fromY path and the orbit clearance still call it, and playerSlope and cameraFall
    // still gate it -- and it keeps its own half-cell stencil defect, which v4552 filed and did not fix.
    //
    // v404 — Bilinear ground sample for first-person walking. The
    // integer-Y _terrainTopAt above causes visible "stairs" when the
    // camera walks across voxel boundaries on sloped terrain (each new
    // XZ voxel snaps Y to an integer). Bilinear blends the four
    // neighbor columns by the fractional XZ position, producing a
    // smooth float Y that tracks the surface continuously.
    //
    // Cost: 4× the voxel-column scans of the integer version. Each scan
    // is at most 80 voxel lookups — call it ~320 lookups per frame for
    // the camera column. The chunk mesher does millions; this is a
    // rounding error.
    //
    // Cliffs: a 1-voxel-wide cliff with N units of height drop becomes
    // an N-unit-per-voxel ramp under bilinear. For the smoothness this
    // is the right tradeoff — gameplay never feels "stuck" at the
    // sub-voxel boundary. Edge-fall detection still works because
    // _terrainTopAt (integer) is still what the canStandAt logic
    // implicitly uses for collision.
    _terrainTopAtBilinear(x, z, fromY = null, reach = Camera.STEP_UP_MAX) {
        if (!this.world?.voxelAt) return 0;
        const ix = Math.floor(x), iz = Math.floor(z);
        const fx = x - ix, fz = z - iz;
        // *** THE BODY GOES TO ALL FOUR CORNERS, WHICH IS WHY THE DEAD ZONE STARTED A VOXEL EARLY. *** The
        // blend reads the neighbouring columns, so one tunnel column beside open ground was enough to make
        // the sample jump to 21 and freeze the walker before it ever entered.
        if (Number.isFinite(fromY)) {
            // *** A COLUMN THIS BODY CANNOT STAND IN IS NOT A COLUMN WHOSE GROUND IS ZERO, AND AVERAGING IT
            // IN AS ZERO PUT THE BODY INSIDE THE FLOOR AND LOCKED IT THERE. *** Found by
            // tools/ship/voxelAvatar-selfcheck.mjs, which the sweep rotation brought back under budget in
            // the same round -- it drives THIS method on a hand world and was green at HEAD. Walking off a
            // two-voxel ledge toward -z at x=40: the floor column answers 2 and the ledge column answers
            // NOT-FOUND, because the ledge's own surface is above this body's reach -- a wall, not a hole.
            // Read as 0 and blended at fz=0.25 that is 1.5, so targetY came out at 3.200, dy was 0, the
            // body read as GROUNDED half a voxel inside the floor, and _canStandAt then refused every
            // further step: stuck at z=3.250 for as long as the walk ran. The stuck player this very round
            // is about, re-introduced by its own repair, one method over.
            //
            // So the weights are renormalised over the corners that ANSWERED. A wall contributes nothing
            // and the body keeps the floor it is on; a genuine hole -- no surface from the reach down to
            // the bottom of the world -- makes every corner null, and 0 then means what it has always
            // meant here, which is that the cliff branch takes over and gravity does the rest.
            let sum = 0, wsum = 0;
            const corner = (cx, cz, wt) => {
                const h = this._standYAt(cx, cz, fromY, reach);
                if (h !== null) { sum += h * wt; wsum += wt; }
            };
            corner(ix,     iz,     (1 - fx) * (1 - fz));
            corner(ix + 1, iz,     fx * (1 - fz));
            corner(ix,     iz + 1, (1 - fx) * fz);
            corner(ix + 1, iz + 1, fx * fz);
            return wsum > 0 ? sum / wsum : 0;
        }
        const h00 = this._terrainTopAt(ix,     iz    );
        const h10 = this._terrainTopAt(ix + 1, iz    );
        const h01 = this._terrainTopAt(ix,     iz + 1);
        const h11 = this._terrainTopAt(ix + 1, iz + 1);
        const h0 = h00 * (1 - fx) + h10 * fx;
        const h1 = h01 * (1 - fx) + h11 * fx;
        return h0 * (1 - fz) + h1 * fz;
    }

    // Can the player stand at (x, y, z) — requires 2 voxels of clear
    // air at the body footprint (head + feet).
    /**
     * The lattice cells this body's disc actually overlaps at (x, z). At r < 0.5 the bounds give at most
     * four and the distance test rejects the corners the disc does not reach, so the footprint is a DISC
     * and not the square that bounds it -- which is the whole diagonal-gap case, since a square footprint
     * would block a body a disc legitimately admits.
     *
     * Both the clearance test and the step-up target read the footprint from HERE, so the two cannot come
     * to disagree about which cells the body is in -- the defect v4548 found between two copies of a fall.
     */
    _footprint(x, z) {
        const r = Camera.BODY_RADIUS;
        // *** THE CELL THE CENTRE IS IN IS ALWAYS IN THE FOOTPRINT, AND A GATE FOUND OUT WHY. *** The
        // distance test below is strict, so at r = 0 it admits nothing and the footprint came back EMPTY --
        // and an empty footprint means _canStandAt tests no cells and returns true, which is not "a body
        // with no radius" but NO COLLISION AT ALL. Driven: with BODY_RADIUS set to 0 the body walked
        // straight through a five-voxel wall to x = 17. A body of zero width still occupies the cell it
        // stands in, so that cell is seeded rather than derived, and the radius only ever ADDS neighbours.
        // The centre's cell is named rather than read back out of the array: the first draft indexed
        // `out[0]` to skip it, which throws the moment the seed is removed -- a shipped TypeError, and the
        // species this session has now hit six times. Named consts cannot be emptied out from under it.
        const hx = Math.floor(x), hz = Math.floor(z);
        const out = [[hx, hz]];
        const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
        const z0 = Math.floor(z - r), z1 = Math.floor(z + r);
        for (let cx = x0; cx <= x1; cx++) {
            for (let cz = z0; cz <= z1; cz++) {
                if (cx === hx && cz === hz) continue;
                // closest point on this cell's square to the body's axis -- exact for a cylinder against an
                // axis-aligned box, which is what a voxel is. The same question capsuleMove asks of a
                // triangle, on a lattice where it costs two clamps instead of seven Voronoi regions.
                const nx = Math.min(Math.max(x, cx), cx + 1);
                const nz = Math.min(Math.max(z, cz), cz + 1);
                if ((nx - x) * (nx - x) + (nz - z) * (nz - z) < r * r) out.push([cx, cz]);
            }
        }
        return out;
    }

    /**
     * *** THE HEIGHT THIS BODY WOULD STAND AT IF IT MOVED TO (x, z), OR null IF NOTHING SUPPORTS IT. ***
     *
     * A radius and a step-up cannot be tested separately, and the first draft of v4549 proved it: giving the
     * body width while still asking `_canStandAt(newX, THIS FRAME'S y, newZ)` made it unable to climb
     * ANYTHING, because approaching a lip means the disc overlaps the column being climbed at a height that
     * column is still solid at. Measured -- every ramp from 14 degrees up stopped dead, and the sandbox's
     * one-voxel auto-step stopped being climbed. The move test has to ask where the body would BE.
     *
     * The target is the HIGHEST surface among the cells that have one, and _canStandAt then requires the
     * span to be clear in EVERY overlapped cell -- support from any, clearance from all.
     *
     * *** THE `any` BECAME LOAD-BEARING AT v4552, AND THE ROUND THAT MADE IT SO IS THE ROUND THAT SAYS SO.
     * *** v4549 wrote here that swapping it for `support from ALL` produced an IDENTICAL walk -- 20.000
     * either way at a floor that simply ends -- and that was true and measured: the target was only ever
     * used to RAISE the body, and a null fell back to the height it already had, so the two quantifiers
     * could not differ. The sabotage that swapped them went ZERO RED and was right to.
     * v4552 clamps the WALK to this target, so it now SETS the body as well as raising it, and the two
     * separate: ANY measures 20.333 against ALL's 19.917 at the same floor. ANY is still the right rule --
     * a disc whose far edge still rests on the slab IS supported -- and a null must still not REFUSE the
     * move, because a body is entitled to walk off a cliff and a rule that refused would stop it a radius
     * short of every edge. tools/ship/playerBody-selfcheck.mjs holds both numbers.
     */
    _stepTargetAt(x, z, feetY) {
        let best = null;
        for (const [cx, cz] of this._footprint(x, z)) {
            const g = this._standYAt(cx + 0.5, cz + 0.5, feetY, Camera.STEP_UP_MAX);
            if (g !== null && (best === null || g > best)) best = g;
        }
        return best;
    }

    /**
     * *** THE WALKING GROUND FOR A BODY WITH A RADIUS: THE HIGHEST SURFACE UNDER THE FOOTPRINT, OR null. ***
     * v4552. This is a one-line wrapper over _stepTargetAt on purpose, for two reasons that are both about
     * the thing having a NAME: the walk and the slope secant must read the SAME ground (see _fpSlopeDeg --
     * two ends of a secant on two different grounds is the v4546 frame-rate bug rebuilt), and a gate needs
     * a method to hook that the walk actually calls. tools/ship/playerGround-selfcheck.mjs hooked
     * _terrainTopAtBilinear to measure the walk's dy, and the day the walk stopped calling it that row read
     * -Infinity instead of failing -- an instrument going blind, which is this session's own named species
     * on the gate's side of the fence.
     *
     * null is NOT 0, and v4545 is the round that paid for the difference: a column this body cannot stand
     * in is not a column whose ground is zero, and averaging a not-found corner in as 0 put the body a
     * whole voxel inside the floor and locked it there.
     */
    _walkGroundAt(x, z, feetY) {
        return this._stepTargetAt(x, z, feetY);
    }

    /**
     * *** THE RENDERED EYE, EASED TOWARD THE BODY. IT IS A METHOD AND NOT SIX LINES INSIDE update() FOR THE
     * REASON THIS ROUND KEEPS RE-LEARNING: A GATE MUST BE ABLE TO DRIVE THE CODE THAT SHIPS. *** The first
     * draft of tools/ship/walkGround-selfcheck.mjs re-implemented this ease inside the gate, because
     * update() wants a canvas -- and two sabotages that broke the real thing then went ZERO RED against a
     * gate happily grading its own copy. That is v4541's sabotage B exactly, and this file's own
     * _walkGroundAt exists for the same reason one method over.
     *
     * It writes _eyeRenderY and NOTHING else: camera.position.y is bit-identical with this running and not
     * running, which is the row that stops the smoother from quietly becoming a second vertical authority.
     * Outside fp the eye IS the body -- orbit, missile_cam and the kaiju drive are untouched.
     */
    _stepRenderEye(dt) {
        if (this.mode !== "fp") { this._eyeRenderY = this.position.y; return this._eyeRenderY; }
        const target = this.position.y;
        if (!Number.isFinite(this._eyeRenderY) ||
            Math.abs(target - this._eyeRenderY) > Camera.EYE_SMOOTH_SNAP) {
            this._eyeRenderY = target;              // a fall, a teleport, a respawn or a mode change
        } else {
            this._eyeRenderY += (target - this._eyeRenderY) * Math.min(1, dt * Camera.EYE_SMOOTH_RATE);
        }
        return this._eyeRenderY;
    }

    _canStandAt(x, y, z) {
        if (!this.world?.voxelAt) return true;
        const feetY = Math.floor(y - this._eyeHeight + 0.1);
        const headY = Math.floor(y);
        // *** THE CELLS THE BODY'S DISC CAN TOUCH, NOT THE ONE ITS CENTRE IS IN. *** At r < 0.5 that is at
        // most four, and the distance test below rejects the corners the disc does not actually reach -- so
        // the footprint is a DISC and not the square its bounds describe. That distinction is the whole
        // diagonal-gap case: a square footprint would block a body that a disc lets through legitimately.
        for (const [cx, cz] of this._footprint(x, z)) {
            for (let yy = feetY; yy <= headY; yy++) {
                // v4550 -- ONE predicate, shared with _standYAt's shim and _terrainTopAt's scan. This
                // loop used to carry its own, and its own let water through while the other two stood the
                // body on it. See Camera.isSolidToBody.
                if (Camera.isSolidToBody(this.world.voxelAt(cx, yy, cz))) return false;
            }
        }
        return true;
    }

    getMatrix() {
        return this.viewProj;
    }

    // Alias — voxelrenderer/voxelhighlight/EntityCubeRenderer all call
    // getViewProjMatrix(); Camera only had getMatrix(). Both names point
    // at the same matrix to avoid a name collision and keep both call
    // sites working.
    getViewProjMatrix() {
        return this.viewProj;
    }
}