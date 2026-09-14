// WebGLEngine/tools/ship/playerWater-selfcheck.mjs -- v4550
//
// Run: node tools/ship/playerWater-selfcheck.mjs
//
// *** camera/camera.js DECIDED "IS THIS VOXEL SOLID" IN THREE PLACES AND ONE OF THEM SAID SOMETHING ELSE.
// *** _canStandAt's clearance loop carried `&& v !== 10 && v !== 11` -- water passable -- while _standYAt's
// surfaceProbe shim and _terrainTopAt's legacy scan both stood the body ON water. A body may not both walk
// into a thing and stand on it, and this file had it doing exactly that.
//
// ---- THE FILED ITEM WAS HALF WRONG AND THE CENSUS IS WHAT SAYS SO -----------------------------------
//
// It read "water is passable to the player and solid to every bot". Measured on a world generated from
// world/world.js: THE PLAYER'S OWN GROUND QUERY AND THE BOTS' AGREE IN 146 OF 146 WATER COLUMNS. Both
// stand on a lake. The disagreement was never across the two controllers -- it was between two functions
// in one file, which is the v4547 species again and the third round running to find it.
//
// ---- WHAT THE EXCLUSION COST, DRIVEN -----------------------------------------------------------------
//
// A wall of water from y=2 to y=9, and a wall of stone with the identical shape:
//
//     stone    the body stops at x = 9.583, a radius short of the face at x = 10
//     water    the body walks IN to x = 13.333, finds no ground -- the ground probe needs two cells of
//              AIR and water is not air -- and FALLS OUT OF THE WORLD: feet at -92.505 after 240 frames,
//              vy -59.4 and still accelerating, with no floor below to catch it
//
// The bot oracle answers null for that column in BOTH worlds and never enters either. So the repair moves
// the player TOWARD the bots and not away from them.
//
// ---- AND IT WAS ASKED ON ZERO REACHABLE SITES, WHICH IS WHY NOTHING SHIPPING MOVES -------------------
//
// Over every standable column of the census, the four-neighbour cells holding water anywhere in the body's
// own two-cell span: NONE. A lake surface is level, so the land beside it stands at top+1 and the
// neighbour's span is the air above the water; it takes water standing HIGHER than the land next to it,
// which the fluid systems level away. Section 8 holds that at 0 and will go RED the day somebody floods a
// room -- which is the row working, not the row failing. The shipping walk is byte-identical either way,
// measured in section 9 rather than asserted.
//
// *** NO SWIMMING IS CLAIMED AND NONE IS IMPLEMENTED. *** No buoyancy, no water drag, no swim state in the
// controller -- and the scope of that sentence is camera.js, which is what section 10 reads, because an
// absence is worth exactly what its scope is. The INTENT was swimming and main.js says so in prose: "without
// this you swim into a blue void with no ground under the water", beside renderer.skipWater, about drawing
// the lakebed. Nothing on the collision side could ever have reached it. The bots' only water rule is a
// speed multiplier read off a ROOM record, not off
// voxels. A lake is a walkable floor here. This round makes the tree say that in ONE place instead of
// contradicting itself in three, and a wall beats a fall out of the map -- refusing is the safe direction,
// in terrainWalk's own words.
//
// ---- SABOTAGES, WITH THEIR RESULTS -------------------------------------------------------------------
//
//   A  the 10/11 exclusion put back in _canStandAt (the shipped defect)          8 RED
//   B  the same exclusion moved into _standYAt's shim instead                   12 RED
//   C  isSolidToBody drops the `undefined` guard                                 3 RED
//   D  isSolidToBody narrowed to ids 1..9, so every fluid and ICE go passable    16 RED
//   E  _terrainTopAt's scan given its own copy again, excluding water            4 RED
//
// *** THE FIRST BATTERY PUT EVERY ONE OF THOSE REDS IN THIS GATE ALONE, AND THAT IS WHY THE COUNTS ABOVE
// ARE ONE HIGHER. *** playerGround, playerSlope, controllerAgreement, cameraFall, playerBody and
// voxelAvatar all stayed green through all five, because not one of their fixtures contains a water
// voxel: five rounds of camera gates over the material that makes up 3.92% of the world's columns, and it
// had never been in any of them. A rule with one keeper dies with that keeper, so the second is written
// rather than noted -- tools/ship/controllerAgreement-selfcheck.mjs section 5, which is the gate about
// the two controllers agreeing and is therefore where "they share ONE rule for what a voxel is" belongs.
// It catches all five, one row each.
//
// *** AND THE FIRST COUNT OF THAT BATTERY WAS WRONG IN MY FAVOUR. *** It read one extra RED per sabotage
// from playerGround and I wrote that up here as a second keeper. It was that gate's `.js` record-census
// pin, which this round's own new record had pushed from six to seven and which fires with or without a
// sabotage. The pin is raised and the claim is deleted rather than softened; a row that reddens on every
// run of a neighbouring experiment will be read as that experiment's signal.
//
// *** B IS THE LOUDEST AND THAT IS A FINDING, NOT AN ACCIDENT OF THE FIXTURES. *** Putting the exclusion
// on the GROUND side rather than the collision side is the same contradiction with the arms swapped -- the
// body may no longer stand on a lake but may still walk into one -- and it costs the walk more, because a
// lake stops being a floor at all. Which arm carries the wrong answer decides how bad it is; that there
// were two arms is what this round removes.
//
// *** C IS THE THIN ONE AND ITS FIRST ROW WAS VACUOUS. *** The live world cannot produce an `undefined`
// voxel -- world.voxelAt answers AIR for a missing chunk, chunk.get answers 0 out of bounds -- so the
// only row that saw it was the id-table one, asking the predicate about a value nothing drives. Section 2
// now DRIVES a fixture that knows only its solids, which is how several of this tree's own fixtures are
// built: read as SOLID, the sky becomes stone and the body cannot move at all. 1 RED became 2.
//
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Camera, PLAYER_WATER_AT_V4550 as R } from "../../camera/camera.js";
import { standHeightAt } from "../../world/surfaceProbe.mjs";
import { VOXEL } from "../../world/voxelFormat.js";
import { noComments, prose } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const src = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
/**
 * *** THE SOURCE ROWS BELOW READ CODE AND NOT PROSE, AND THE FIRST DRAFT OF THIS GATE DID NOT. ***
 * Three rows went red against correct code because the regexes matched the very sentences camera.js now
 * carries ABOUT the exclusion -- "carried `&& v !== 10 && v !== 11`" -- and the word "buoyancy" inside a
 * comment saying there is none. A wiring row anchored on prose is a species this session has filed twice;
 * tools/ship/sourceScan.mjs is the tree's own answer to it and has been since v4418.
 */
const code = (rel) => noComments(src(rel));

const WATER = VOXEL.WATER, FLOWING = VOXEL.FLOWING_WATER;

// ---- fixtures -----------------------------------------------------------------------------------------
/** Land topping at y=5 for x<10; a WALL of `fill` from y=2 to y=9 for x>=10, over a solid floor. */
const wallWorld = (fill) => {
    const w = { chunkHeight: 80,
        voxelAt: (x, y) => { const fx = Math.floor(x); if (y < 0) return VOXEL.STONE;
            if (fx < 10) return y <= 5 ? VOXEL.STONE : VOXEL.AIR;
            if (y <= 1) return VOXEL.STONE;
            if (y >= 2 && y <= 9) return fill;
            return VOXEL.AIR; } };
    w.isAir = (x, y, z) => w.voxelAt(x, y, z) === VOXEL.AIR;
    return w;
};
/** A lake: stone to y=5 everywhere, water at y=6 and 7 for x>=10, air above. The ordinary shape. */
const lakeWorld = () => {
    const w = { chunkHeight: 80,
        voxelAt: (x, y) => { const fx = Math.floor(x); if (y < 0) return VOXEL.STONE;
            if (fx < 10) return y <= 7 ? VOXEL.STONE : VOXEL.AIR;
            if (y <= 5) return VOXEL.STONE;
            if (y <= 7) return WATER;
            return VOXEL.AIR; } };
    w.isAir = (x, y, z) => w.voxelAt(x, y, z) === VOXEL.AIR;
    return w;
};

const mkCam = (world, pos, keys = [], yaw = Math.PI / 2) => {
    const c = Object.create(Camera.prototype);
    Object.assign(c, { world, keys: new Set(keys), position: { x: pos[0], y: pos[1], z: pos[2] },
        velocity: { x: 0, y: 0, z: 0 }, yaw, _extMove: null, _eyeHeight: 1.7, _gravity: 18,
        _fpWalkSpeed: 5, _fpSprintSpeed: 8, _fpJumpVel: 8, _fpVelY: 0, _fpOnGround: true, playerEnergy: null });
    return c;
};
const drive = (world, pos, keys, frames, tweak = null) => {
    const c = mkCam(world, pos, keys);
    if (tweak) tweak(c);
    let airborne = 0;
    for (let i = 0; i < frames; i++) { c._moveFP(1 / 60); if (!c._fpOnGround) airborne++; }
    return { x: +c.position.x.toFixed(3), feet: +(c.position.y - c._eyeHeight).toFixed(3),
             vy: +c._fpVelY.toFixed(1), onGround: c._fpOnGround, airborne };
};
/**
 * THE RULE AS IT SHIPPED BEFORE v4550, WRITTEN OUT RATHER THAN APPROXIMATED. _canStandAt's own copy of
 * the solidity test, carrying the water exclusion the other two sites never had.
 */
const beforeV4550 = (c) => {
    c._canStandAt = function (x, y, z) {
        if (!this.world?.voxelAt) return true;
        const feetY = Math.floor(y - this._eyeHeight + 0.1), headY = Math.floor(y);
        for (const [cx, cz] of this._footprint(x, z))
            for (let yy = feetY; yy <= headY; yy++) {
                const v = this.world.voxelAt(cx, yy, cz);
                if (v !== 0 && v !== undefined && v !== 10 && v !== 11) return false;
            }
        return true;
    };
};

// ---- the live world -----------------------------------------------------------------------------------
/**
 * *** GENERATED, NOT HAND-BUILT. *** world/world.js's own generateChunk over 5x5 chunks. The module header
 * of world/surfaceProbe.mjs records that a live BOOT's voxels are not a pure function of the seed, because
 * the fluid and erosion systems write all through the run -- so every count below is REPORTED and only a
 * FLOOR is asserted, which is this session's standing rule for a live census.
 */
async function liveWorld() {
    const { VoxelWorld } = await import("../../world/world.js");
    const w = new VoxelWorld();
    for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.generateChunk(cx, cz);
    return w;
}
const isWet = (v) => v === WATER || v === FLOWING;

console.log("== playerWater-selfcheck (v4550) ==");

// ---- 1. ONE predicate, and the three sites route through it -------------------------------------------
console.log("\n-- 1. one question, one answer, three call sites");
const CAM = src("camera/camera.js");
const CAMCODE = code("camera/camera.js");
ok("Camera.isSolidToBody exists and is a static", typeof Camera.isSolidToBody === "function"
   && /static\s+isSolidToBody\s*\(/.test(CAMCODE));
const routed = (CAMCODE.match(/Camera\.isSolidToBody\(/g) || []).length;
ok("!! all three solidity sites go through it", routed >= 3, "Camera.isSolidToBody( appears " + routed + " times");
ok("*** the water exclusion is gone from the CODE ***", !/!==\s*1[01]\b/.test(CAMCODE),
   "no `!== 10` or `!== 11` survives anywhere camera.js executes");
ok("!! and it survives in the PROSE, which is where a removed rule belongs",
   /!==\s*10\s*&&\s*v\s*!==\s*11/.test(CAM), "the comment records what was taken out");
ok("_canStandAt no longer writes its own test",
   /_canStandAt\(x, y, z\)[\s\S]{0,600}?Camera\.isSolidToBody\(this\.world\.voxelAt\(cx, yy, cz\)\)/.test(CAMCODE));
ok("_standYAt's shim no longer writes its own test",
   /isAir:\s*\(xx, yy, zz\)\s*=>\s*!Camera\.isSolidToBody\(v\(xx, yy, zz\)\)/.test(CAMCODE));
ok("_terrainTopAt's legacy scan no longer writes its own test",
   /Camera\.isSolidToBody\(this\.world\.voxelAt\(fx, y, fz\)\)\) return y \+ 1/.test(CAMCODE));
report("predicate copies " + R.predicateCopiesBefore + " -> " + R.predicateCopiesAfter);

// ---- 2. the predicate IS world.isAir's rule, over the real id table ------------------------------------
console.log("\n-- 2. the same rule the bots get, checked against world/voxelFormat.js's whole table");
const ids = Object.values(VOXEL);
const worldIsAir = (v) => v === VOXEL.AIR;          // world/world.js's isAir, verbatim
const mismatched = ids.filter((v) => Camera.isSolidToBody(v) === worldIsAir(v));
ok("!! every voxel id in the table agrees with world.isAir", mismatched.length === 0,
   ids.length + " ids checked, " + mismatched.length + " disagree");
ok("*** water is solid to the player's body, as it is to every bot ***",
   Camera.isSolidToBody(WATER) && Camera.isSolidToBody(FLOWING) && !worldIsAir(WATER));
ok("air is not, and neither is a fixture's undefined",
   !Camera.isSolidToBody(VOXEL.AIR) && !Camera.isSolidToBody(undefined));
ok("lava and ice were never excluded and still are not",
   Camera.isSolidToBody(VOXEL.LAVA) && Camera.isSolidToBody(VOXEL.ICE));
report("ids: " + ids.join(", "));
/**
 * *** THE `undefined` ARM IS NOT DECORATION, AND ONE ROW ASSERTING IT IS NOT ENOUGH. *** The live world
 * cannot produce one -- world.voxelAt answers AIR for a missing chunk and chunk.get answers 0 out of
 * bounds -- so a gate that only checked the predicate's return value would be grading a branch nothing
 * drives. What DOES produce it is this tree's own fixtures: a bare `{ voxelAt }` object answering only
 * the cells it knows about. Read as SOLID, the sky becomes stone and the body cannot move at all.
 */
const sparseWorld = { chunkHeight: 80,
    voxelAt: (x, y) => (y <= 5 ? VOXEL.STONE : undefined) };   // it knows its solids and nothing else
const sparse = drive(sparseWorld, [6.5, 7.7, 0.5], ["KeyW"], 120);
ok("!! and a fixture's undefined is AIR when driven, not just when asked",
   sparse.x > 10 && sparse.feet === 6, "walked to x = " + sparse.x + " in a world that knows only its solids");

// ---- 3. THE FIX, DRIVEN: water and stone now give the identical verdict --------------------------------
console.log("\n-- 3. a wall of water against a wall of stone, same shape, same body");
const stoneRun = drive(wallWorld(VOXEL.STONE), [6.5, 7.7, 0.5], ["KeyW"], 240);
const waterRun = drive(wallWorld(WATER),       [6.5, 7.7, 0.5], ["KeyW"], 240);
ok("*** the body stops at the same x against either wall ***", stoneRun.x === waterRun.x,
   "stone " + stoneRun.x + "   water " + waterRun.x);
ok("!! and that x is the record's, a radius short of the face at x = 10",
   waterRun.x === R.waterWallAfterStopsBodyAt && waterRun.x === R.stoneWallStopsBodyAt);
ok("both stay grounded and never leave the ground",
   stoneRun.onGround && waterRun.onGround && stoneRun.airborne === 0 && waterRun.airborne === 0);

// ---- 4. the rival: the rule as it shipped, and where it put the body -----------------------------------
console.log("\n-- 4. the pre-v4550 rule driven as a rival, in the same world");
const rival = drive(wallWorld(WATER), [6.5, 7.7, 0.5], ["KeyW"], 240, beforeV4550);
ok("*** it walked INTO the water ***", rival.x > 10, "ended at x = " + rival.x
   + " against the shipped " + waterRun.x);
ok("!! it is the record's x", rival.x === R.waterWallBeforeEndedAt);
ok("*** and then FELL OUT OF THE WORLD ***", rival.feet === R.waterWallBeforeFeetAfter240Frames
   && rival.feet < -50, "feet " + rival.feet + " after 240 frames");
ok("still accelerating when the drive ended -- nothing catches it",
   rival.vy === R.waterWallBeforeVyAfter240Frames && rival.vy < -50, "vy " + rival.vy);
ok("and it is not grounded", rival.onGround === false);
ok("the SAME rival against STONE behaves exactly as the shipped rule does",
   drive(wallWorld(VOXEL.STONE), [6.5, 7.7, 0.5], ["KeyW"], 240, beforeV4550).x === stoneRun.x,
   "so the rival's failure is about WATER and not about the rival");

// ---- 5. which way the repair moved the player, relative to the bots ------------------------------------
console.log("\n-- 5. the bot oracle on the same column");
const botWater = standHeightAt(wallWorld(WATER), 12, 0, { y: 6, stepUp: 1.2 });
const botStone = standHeightAt(wallWorld(VOXEL.STONE), 12, 0, { y: 6, stepUp: 1.2 });
ok("*** the bots refuse that column in BOTH worlds ***", botWater === null && botStone === null
   && botWater === R.botGroundInThatColumn);
ok("!! so the repair moved the player TOWARD the bots, not away",
   waterRun.x < 10 && rival.x > 10,
   "shipped refuses like the bots do; the rival was the only thing that entered");

// ---- 6. the live world: how much water there is ------------------------------------------------------
console.log("\n-- 6. a generated world, 5x5 chunks -- REPORTED, with only a floor asserted");
const W = await liveWorld();
let cols = 0, waterCols = 0, surfaceCols = 0, dMin = Infinity, dMax = 0, sMin = Infinity, sMax = 0;
const waterColumns = [];
for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) {
    cols++;
    let top = -1, depth = 0;
    for (let y = W.chunkHeight - 1; y >= 0; y--) if (W.voxelAt(x, y, z) !== VOXEL.AIR) { top = y; break; }
    for (let y = 0; y < W.chunkHeight; y++) if (isWet(W.voxelAt(x, y, z))) depth++;
    if (!depth) continue;
    waterCols++; waterColumns.push({ x, z, top });
    dMin = Math.min(dMin, depth); dMax = Math.max(dMax, depth);
    if (top >= 0 && isWet(W.voxelAt(x, top, z))) {
        surfaceCols++;
        let d = 0; for (let y = top; y >= 0 && isWet(W.voxelAt(x, y, z)); y--) d++;
        sMin = Math.min(sMin, d); sMax = Math.max(sMax, d);
    }
}
report("columns " + cols + ", with water " + waterCols + " (" + (100 * waterCols / cols).toFixed(2)
       + "%), surface pools " + surfaceCols + ", depths " + dMin + ".." + dMax
       + ", surface depths " + sMin + ".." + sMax);
ok("!! water is not hypothetical in this world -- a FLOOR, not the figure",
   waterCols >= 40 && surfaceCols >= 20, "floor 40/20; measured " + waterCols + "/" + surfaceCols);
ok("the census covered the area the record names", cols === R.censusColumns);
ok("the record's counts are this run's", waterCols === R.waterColumns && surfaceCols === R.surfaceWaterColumns
   && dMin === R.waterDepthRange[0] && dMax === R.waterDepthRange[1]
   && sMin === R.surfaceDepthRange[0] && sMax === R.surfaceDepthRange[1]);

// ---- 7. *** THE CORRECTION TO THE FILED ITEM *** -----------------------------------------------------
console.log("\n-- 7. do the player and the bots actually disagree about water? they never did");
const probe = Object.create(Camera.prototype);
Object.assign(probe, { world: W, position: { x: 0, y: 0, z: 0 }, _eyeHeight: 1.7 });
let agree = 0;
for (const { x, z, top } of waterColumns) {
    const feet = top + 1;
    if (standHeightAt(W, x, z, { y: feet, stepUp: Camera.STEP_UP_MAX })
        === probe._standYAt(x + 0.5, z + 0.5, feet, Camera.STEP_UP_MAX)) agree++;
}
report("player ground == bot ground in " + agree + " of " + waterCols + " water columns");
ok("*** the two controllers agreed in every water column, before this round and after ***",
   agree === waterCols && agree === R.columnsWherePlayerGroundEqualsBotGround
   && waterCols === R.ofWaterColumns,
   "the filed item said water was 'solid to bots' as though the player differed; it does not");

// ---- 8. reachability: the exclusion was asked on nothing ----------------------------------------------
console.log("\n-- 8. how many reachable sites the exclusion ever decided");
let sites = 0;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
for (let x = -29; x <= 29; x++) for (let z = -29; z <= 29; z++) {
    const g = standHeightAt(W, x, z, {});
    if (g === null) continue;
    for (const [dx, dz] of N4)
        for (const yy of [g, g + 1]) if (isWet(W.voxelAt(x + dx, yy, z + dz))) { sites++; break; }
}
report("neighbour cells with water inside the body's own two-cell span: " + sites);
ok("*** zero -- a lake surface is level, so the land beside it stands above the water ***",
   sites === 0 && sites === R.reachableExclusionSites,
   "THIS ROW GOES RED THE DAY SOMEBODY FLOODS A ROOM, and that is the row working");
ok("the census it was taken on is the generated one, not a fixture",
   R.reachabilityIsAFixtureClaim === false);

// ---- 9. and so nothing shipping moves -----------------------------------------------------------------
console.log("\n-- 9. a lake, crossed");
const lake = lakeWorld();
const crossShipped = drive(lake, [6.5, 9.7, 0.5], ["KeyW"], R.lakeCrossingFrames);
const crossBefore  = drive(lake, [6.5, 9.7, 0.5], ["KeyW"], R.lakeCrossingFrames, beforeV4550);
ok("*** the walk across water is IDENTICAL before and after the repair ***",
   crossShipped.x === crossBefore.x && crossShipped.feet === crossBefore.feet,
   "x " + crossShipped.x + ", feet " + crossShipped.feet);
ok("!! and the body walks ON the lake, grounded the whole way",
   crossShipped.onGround && crossShipped.airborne === 0 && crossShipped.x > 12
   && crossShipped.feet === R.lakeCrossingFeetY && crossShipped.airborne === R.lakeCrossingAirborneFrames,
   "feet " + crossShipped.feet + ", airborne " + crossShipped.airborne + " of " + R.lakeCrossingFrames);
ok("the bots stand on the same lake at the same height",
   standHeightAt(lake, 14, 0, { y: 8, stepUp: Camera.STEP_UP_MAX }) === R.lakeCrossingFeetY);

// ---- 10. what is NOT here, stated rather than implied --------------------------------------------------
console.log("\n-- 10. no swimming is claimed, and none exists");
const buoy = (CAMCODE.match(/buoyan\w*/gi) || []);
ok("the CONTROLLER has no swim state and no water drag -- in CODE, not in prose",
   !/_swim|isSwimming|waterDrag|swimSpeed/i.test(CAMCODE) && R.swimStatesInTheController === 0,
   "scoped to camera.js, which is what this row reads; the field was renamed from swimStatesInTree "
   + "because an absence is worth exactly what its scope is");
// *** AND THIS ROW WAS THE SPECIES THIS ROUND'S NOTE COMPLAINS ABOUT, CAUGHT BY tools/ship/gateQuality.
// *** Its first draft matched that sentence against main.js RAW, so it was anchored on where the comment
// happens to wrap -- the fourth instance of "a wiring row anchored on prose" this session and the first
// inside the round that names it. sourceScan's prose() strips the markers and collapses the wrapping, so
// the needle is the SENTENCE and not the line it currently sits on.
ok("!! and the intent WAS swimming, which main.js says in prose and nothing implements",
   /you swim into a blue void with no ground under the water/.test(prose(src("main.js")))
   && R.proseIntendedSwimming === true,
   "the v465 comment beside renderer.skipWater -- about drawing the lakebed, with no swim state on the "
   + "collision side that could ever have reached it");
ok("!! and the ONLY buoyancy identifier in the file is the record field that records its absence",
   buoy.length === 1 && buoy[0] === "buoyancyForThePlayer" && R.buoyancyForThePlayer === false,
   "an absence claim has to name where the word is allowed to appear, or it is a row nothing can keep");
const BM = code("simulation/BotManager.js");
ok("!! the bots' only water rule is a SPEED multiplier off a room record, not off voxels",
   /_waterSpeedMul\s*\(/.test(BM) && /r\.water/.test(BM)
   && !/voxelAt[\s\S]{0,80}(VOXEL\.WATER|=== 10)/.test(BM) && R.botWaterRuleIsSpeedOnly === true);
ok("and the record carries its two multipliers",
   /1\.30/.test(BM) && /0\.40/.test(BM)
   && R.botWaterSpeedMultipliers.waterKaijuDeep === 1.30
   && R.botWaterSpeedMultipliers.otherKaijuDeep === 0.40);
ok("*** so 'a lake is a floor' is what this tree does, and it now says so in one place ***",
   R.predicateCopiesAfter === 1 && Camera.isSolidToBody(WATER));

// ---- 11. the record is this file's output, not a hand-kept number ---------------------------------------
console.log("\n-- 11. the record");
ok("it is frozen and stamped at this version", Object.isFrozen(R) && R.at === "v4550");
ok("the ids it names are the voxel table's water ids",
   R.idsExcludedByCanStandAt.length === 2 && R.idsExcludedByCanStandAt[0] === WATER
   && R.idsExcludedByCanStandAt[1] === FLOWING && R.idsExcludedByTheOtherTwo.length === 0);
ok("!! every driven number above came out of this run, not out of the record",
   R.stoneWallStopsBodyAt === stoneRun.x && R.waterWallBeforeEndedAt === rival.x
   && R.waterWallBeforeFeetAfter240Frames === rival.feet
   && R.waterWallBeforeVyAfter240Frames === rival.vy);

// ---- 12. the wiring ------------------------------------------------------------------------------------
console.log("\n-- 12. wiring");
ok("camera.js imports the probe the shim feeds", /import \{ standHeightAt \} from "\.\.\/world\/surfaceProbe\.mjs"/.test(CAMCODE));
ok("world/world.js still answers isAir as AIR-only, which is the rule this file adopted",
   /isAir\(x, y, z\)\s*\{\s*return this\.voxelAt\(x, y, z\) === VOXEL\.AIR;/.test(code("world/world.js")));
ok("!! BotManager still walks its bots on standHeightAt, so the two share one ground rule",
   /standHeightAt\(w, x, z, \{ y: this\._groundY, stepUp: BOT_STEP \}\)/.test(BM));
ok("the record is exported under its version name",
   typeof R === "object" && R.at === "v4550");

console.log("\n" + (fails ? "FAIL " + fails : "PASS") + "  playerWater-selfcheck");
process.exit(fails ? 1 : 0);
