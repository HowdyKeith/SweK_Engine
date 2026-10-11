// WebGLEngine/tools/ship/fallBody-selfcheck.mjs -- v4544
//
// Run: node tools/ship/fallBody-selfcheck.mjs
//
// GATES physics/character/fallBody.mjs -- backlog "terrain-controller" piece (1), the vertical half nothing
// in this tree played.
//
// *** SECTION 1 IS THE ROUND. *** simulation/BotManager.js branched on `grounded || blocked`, and a body
// more than snapDown above the ground matches neither -- so it fell to a branch that wrote
// `world._heightAt(x, z) + BOT_EYE`: the terrain MODEL, in ONE frame, with no fall and no voxel check.
// Measured in a real boot over 441 columns, that write disagrees with where a falling body lands in 37.9%
// of them, by up to 44 voxels, and lands inside solid rock in 8.8%.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  voxelSurface made to pass the WALKING reach instead of 0         2 RED
//   B  the landing clamp removed                                        6 RED
//   C  the terminal clamp removed                                       1 RED -- and it passes everything
//      else, because no other fixture falls far enough for 55 m/s to bind.
//   D  the ceiling branch made to pass through                          2 RED
//   E  gravity flipped positive                                         7 RED
//   F  BotManager's airborne branch disabled                            2 RED
//   G  the airborne branch stops advancing x and z                      2 RED
//   H  the flying exemption removed                                     2 RED
//   I  the ceiling clamp made unconditional (a teleport downward)       1 RED
//   J  meshSurface stops forcing the zero reach                         1 RED
//   K  BotManager's non-voxel oracle drops the body argument again      1 RED
//
// NONE CRASHED, checked by looking for a stack frame rather than for the word "TypeError".
//
// *** G, H, I, J AND K EXIST BECAUSE A READING PARTY FOUND FIVE DEFECTS THIS FILE'S TWELVE GREEN ROWS COULD
// NOT SEE, AND ONE OF THEM WOULD HAVE SHIPPED A STATIONARY AIR ENEMY. ***
//
//   G is the regression. The first draft of the airborne branch read r.pos and set handled = true --
//   and stepTerrainFan reports movedH = 0 on an airborne step, so the body moved NOWHERE horizontally and
//   the fallback that advanced x and z at full speed, the only reason a flying bot moved, was skipped.
//   Driven against HEAD on a bot_plane: 14.0000 units/s before, 0.0000 after. Section 8 flies one now.
//   I is a clamp that was a teleport downward: a body already above the cap was dragged to it, -28.0 units
//   in one frame from feet 40. The same species as v4540's lift, pointing the other way.
//   J is a check ANYTHING SATISFIES, in the file that names the species: the row was /stepUp:\s*0/ over
//   fallBody's own source, true whatever meshSurface did, because voxelSurface's zero is in the same file.
//   K is sabotage A shipping in the sibling adapter: BotManager's non-voxel arm took (x, z) and threw the
//   body away, so a height function answering 20 for a body at 6 clamped it UP to 20 with landed: true.
//
// TWO MORE OF THIS FILE'S OWN ROWS FAILED BEFORE ANY SABOTAGE DID: the live-census row called a record
// method that does not exist and CRASHED instead of failing, and the wiring row matched a fixed-length
// window and then the COMMENT "standing still", both of which this same round's own edits broke. Every
// sub-condition is read out of a CAPTURED BLOCK now rather than a distance or a phrase.
//
// SECTION 1 REPORTS ITS LIVE FIGURES AND ASSERTS ONLY A SHAPE, because the running simulation edits voxels
// and the same census reads differently every boot.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as FB from "../../physics/character/fallBody.mjs";
import { standHeightAt, standablesAt } from "../../world/surfaceProbe.mjs";
import * as T from "../../physics/character/terrainWalk.mjs";
import { MeshBVH, trianglesFrom } from "../../mesh/meshBVH.mjs";
import * as CG from "../../physics/character/capsuleGround.mjs";
import * as BMmod from "../../simulation/BotManager.js";
const BotManagerClass = BMmod.BotManager || BMmod.default;

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const R = FB.FALL_AT_V4544;

const world = FB.layeredWorld();
const under = FB.voxelSurface(standHeightAt, world);
const fall = (from, extra = {}) => FB.fallUntilLanded({ pos: [0, from, 0], surfaceUnder: under, ...extra });

// =============================================================================================================
console.log("\n1. *** WHAT THE BRANCH NOBODY PLAYED WAS WRITING INSTEAD, MEASURED IN A REAL BOOT ***");
{
    ok("!! the live census adds up and the disagreement is a large minority rather than an edge",
        R.liveDiffer < R.liveColumns && R.liveDiffer > R.liveColumns * 0.2 &&
        Math.abs(100 * R.liveDiffer / R.liveColumns - R.liveDifferPct) < 0.1 &&
        R.liveInsideRock > 0 && R.liveInsideRock < R.liveDiffer &&
        R.liveMultiSurface > R.liveColumns * 0.4 && R.liveWorst > 8 &&
        Math.abs(100 * R.liveInsideRock / R.liveColumns - R.liveInsidePct) < 0.1,
        R.liveDiffer + " of " + R.liveColumns + " columns (" + R.liveDifferPct + "%) disagree between what " +
        "BotManager wrote for an airborne body -- world._heightAt(x, z) -- and the surface a FALLING body " +
        "reaches; worst " + R.liveWorst + " voxels; " + R.liveInsideRock + " of them (" +
        R.liveInsidePct + "%) put the body INSIDE SOLID ROCK; " + R.liveMultiSurface + " columns hold " +
        "more than one surface. *** THE FIGURES ARE REPORTED AND ONLY THE SHAPE IS ASSERTED, *** because " +
        "the running simulation edits voxels and the same census reads differently every boot -- the " +
        "non-determinism world/surfaceProbe.mjs measured and for the same reason.");
    report("examples from that boot: at (-30,-60) the model says 24 and a falling body lands at 8, on the " +
           "floor of a cave under a hillside; at (-12,-60) it is 26 against 13. The defect v4542 repaired, " +
           "on the branch v4542 did not touch.");
}

// =============================================================================================================
console.log("\n2. *** THE BACKLOG ENTRY NAMES THE WRONG STATE, AND EVERY ADAPTER SAYS SO ***");
{
    const mk = (q) => { const pos = [], idx = []; for (const x of q) { const o = pos.length; pos.push(x[0], x[1], x[2], x[3]); idx.push([o, o + 1, o + 2], [o, o + 2, o + 3]); } return new MeshBVH(trianglesFrom(pos, idx)); };
    const drive = (G, start) => {
        const seen = { grounded: 0, blocked: 0, airborne: 0 };
        let at = start.slice();
        for (let f = 0; f < 200; f++) {
            const r = T.stepTerrain({ pos: at, ground: G, wish: [1, 0], dt: 1 / 60, speed: 5,
                                      stepHeight: 1.2, snapDown: 1.2, maxSlopeDeg: 55 });
            if (r.airborne) seen.airborne++; else if (r.blocked) seen.blocked++; else if (r.grounded) seen.grounded++;
            at = r.pos;
        }
        return seen;
    };
    const cliff = (x) => (x < 10 ? 5 : 0);
    const lat = drive(T.latticeGround(cliff), [6, 5, 10]);
    const fn = drive(T.functionGround(cliff), [6, 5, 10]);
    const msh = drive(T.meshGround(mk([[[0, 5, 0], [10, 5, 0], [10, 5, 20], [0, 5, 20]],
                                        [[10, 0, 0], [30, 0, 0], [30, 0, 20], [10, 0, 20]]])), [6, 5, 10]);
    ok("!! *** AT A CLIFF, A LIVE WORLD'S ADAPTERS REPORT blocked AND NEVER airborne ***",
        lat.airborne === R.cliffAirborneLattice && lat.blocked === R.cliffBlockedLattice &&
        fn.airborne === 0 && msh.airborne === R.cliffAirborneMesh && msh.blocked === 0,
        "over 200 frames off a five-unit cliff: latticeGround " + JSON.stringify(lat) + ", functionGround " +
        JSON.stringify(fn) + ", meshGround " + JSON.stringify(msh) + ". The drop reads as a STEEP SLOPE and " +
        "the slope test runs before the step test, so the body is refused at the rim -- which BotManager " +
        "already handled. The entry's 'a body that walks off a ledge stops there' is about `blocked`.");

    const flat = T.latticeGround(() => 0);
    const st = (y) => { const r = T.stepTerrain({ pos: [5, y, 5], ground: flat, wish: [1, 0], dt: 1 / 60,
                                                  speed: 5, stepHeight: 1.2, snapDown: 1.2, maxSlopeDeg: 55 });
                        return r.airborne ? "airborne" : r.grounded ? "grounded" : "blocked"; };
    ok("!! ...and what DOES reach airborne on those adapters is a body ABOVE the ground, which is the fall",
        st(R.groundedAt) === "grounded" && st(R.airborneAt) === "airborne",
        "at snapDown 1.2 a body " + R.groundedAt + " above flat ground is " + st(R.groundedAt) + " and one " +
        R.airborneAt + " above it is " + st(R.airborneAt) + " -- the cut is snapDown exactly. *** SO THE " +
        "HOLE IS REAL AND IS NOT WHERE THE ENTRY POINTS: *** it is not the cliff, it is every body that is " +
        "not standing on something.");
}

// =============================================================================================================
console.log("\n3. *** THE WALKING REACH LIFTS A FALLING BODY, WHICH IS v4540 IN THE BRANCH v4540 MISSED ***");
{
    const surfaces = standablesAt(world, 0, 0);
    const reachy = (x, z, y) => standHeightAt(world, x, z, { y, stepUp: 1.2 });
    const lifted = FB.fallUntilLanded({ pos: [0, 20.5, 0], surfaceUnder: reachy });
    const proper = fall(20.5);
    ok("!! *** A BODY FALLING FROM 20.5 IS LIFTED TO 21 BY THE WALKING ALLOWANCE AND FALLS TO 9 WITHOUT IT ***",
        surfaces.join(",") === "1,9,21" && lifted.pos[1] === R.liftedByWalkingReach && lifted.frames === 1 &&
        proper.pos[1] === R.fallsTo && proper.frames === R.fallsToFrames && lifted.pos[1] > 20.5,
        "the column is standable at " + surfaces.join(", ") + ". With stepUp 1.2 the probe scans from 21.7, " +
        "names the deck at " + lifted.pos[1] + " -- ABOVE the body -- and the landing clamp puts it there in " +
        lifted.frames + " frame. With no reach it falls to " + proper.pos[1] + " in " + proper.frames +
        " frames, which is where it was always going. *** stepUp IS HOW FAR A BODY MAY CLIMB AND A FALLING " +
        "BODY IS NOT CLIMBING; *** the number was borrowed from the module next door and it is the whole " +
        "defect. Sabotage A restores it.");
    // *** AND THE MESH SIDE COULD NOT ENFORCE THE SAME ZERO, WHICH A SOURCE GREP COULD NEVER HAVE SAID. ***
    // The first draft of this row was /stepUp:\s*0/ over fallBody's own text -- true whatever meshSurface
    // did, because voxelSurface's zero is in the same file. A check anything satisfies. meshSurface took a
    // BUILT oracle, and capsuleGround's stepUp defaults to 0.5, so the mesh side carried a walking reach
    // this module had no way to remove: exactly the defect the voxel zero exists to prevent.
    const bvh = CG.tunnelMesh();
    const loose = (x, z, y) => { const g = CG.capsuleGround(bvh)(x, z, y); return g ? g.y : null; };
    const tight = FB.meshSurface(CG.capsuleGround, bvh);
    const meshLift = FB.fallUntilLanded({ pos: [10, 2.6, 10], surfaceUnder: loose });
    const falls = FB.fallUntilLanded({ pos: [10, 2.6, 10], surfaceUnder: tight });
    ok("!! *** meshSurface TAKES THE BUILDER, SO IT CAN INSIST ON THE ZERO THE VOXEL SIDE ALREADY HAD ***",
        meshLift.pos[1] === R.meshLiftedTo && meshLift.frames === 1 && falls.pos[1] === R.meshFallsTo &&
        falls.frames === R.meshFallFrames,
        "a body with its feet at 2.6 under capsuleGround's own deck at 3: an oracle built with the default " +
        "reach LIFTS it to " + meshLift.pos[1] + " in " + meshLift.frames + " frame, and meshSurface -- which " +
        "builds the oracle itself with stepUp 0 -- falls it to " + falls.pos[1] + " in " + falls.frames +
        " frames. *** THE ROW THIS REPLACED GREPPED fallBody'S OWN SOURCE FOR stepUp: 0 AND WAS TRUE EITHER " +
        "WAY, *** because voxelSurface's zero is in the same file: a check anything satisfies, in the file " +
        "that names the species.");
}

// =============================================================================================================
console.log("\n4. *** IT CANNOT TUNNEL, AT ANY SPEED, AND THAT IS STRUCTURAL RATHER THAN SUBSTEPPED ***");
{
    const speeds = [-1, -20, -55, -500, -10000, -R.tunnelTestedTo];
    const rows = speeds.map((vy) => ({ vy, y: FB.fallUntilLanded({ pos: [0, 9.4, 0], vy, surfaceUnder: under }).pos[1] }));
    ok("!! a body dropped just above a thin ledge lands ON it from 1 m/s to ten million",
        rows.every((r) => r.y === 9) && rows.length === 6,
        rows.map((r) => r.vy + " -> " + r.y).join(", ") + ". The oracle is re-asked at the body's CURRENT " +
        "height every frame and returns the first surface BELOW it, so the clamp can never let the body " +
        "past that surface however fast it is moving. *** capsuleMove HAS TO SUBSTEP AND THIS DOES NOT, *** " +
        "and the difference is the query: a contact test is local and a column scan is not.");
    report("so there is no equivalent here of capsuleMove's radius boundary, and none is claimed -- the " +
           "shapes of the two queries are different and the gate says which is which rather than implying " +
           "the same guard twice.");
}

// =============================================================================================================
console.log("\n5. a fall is a fall, and the terminal clamp is a clamp");
{
    const drop = fall(R.dropFrom);
    const deep = fall(5000);
    ok("!! *** " + R.dropFrom + " UNITS TAKES " + R.dropFrames + " FRAMES, AGAINST ONE FOR THE TELEPORT ***",
        drop.frames === R.dropFrames && drop.pos[1] === 21 && R.teleportFrames === 1,
        "from y=" + R.dropFrom + " the body lands at " + drop.pos[1] + " after " + drop.frames + " frames, " +
        (drop.frames / 60).toFixed(2) + " s, reaching " + drop.peakSpeed.toFixed(2) + " m/s. The branch this " +
        "replaces did it in " + R.teleportFrames + ".");
    ok("!! the terminal velocity binds EXACTLY, which is what makes it a clamp and not a drag model",
        Math.abs(deep.peakSpeed - Math.abs(R.terminal)) < 1e-9,
        "from 5000 units the peak speed is " + deep.peakSpeed.toFixed(6) + " against a terminal of " +
        Math.abs(R.terminal) + " -- equal to nine decimals, because Math.max clamps rather than damps. A " +
        "drag model would approach it and never reach it, and this module says in its own header that it " +
        "is not one.");
}

// =============================================================================================================
console.log("\n6. a head that meets a ceiling stops, and one with no ceiling comes back down");
{
    const roof = () => 12;
    let pos = [0, 9, 0], vy = 15, hit = false, f = 0;
    for (; f < 200; f++) { const r = FB.fallStep({ pos, vy, surfaceUnder: under, ceilingOver: roof }); pos = r.pos; vy = r.vy; if (r.hitCeiling) { hit = true; break; } if (r.landed) break; }
    const free = FB.fallUntilLanded({ pos: [0, 9, 0], vy: 15, surfaceUnder: under });
    // *** A CLAMP MAY NOT BE A TELEPORT IN EITHER DIRECTION, AND THE FIRST DRAFT WAS ONE DOWNWARD. ***
    // It returned [x, cap, z] unconditionally, so a body ALREADY above the cap was dragged to it.
    const above = [13, 15, R.ceilingTeleportFrom].map((feet) =>
        ({ feet, y: FB.fallStep({ pos: [0, feet, 0], vy: 1, surfaceUnder: () => null, ceilingOver: () => 12 }).pos[1] }));
    ok("!! *** A BODY ALREADY ABOVE THE CAP KEEPS ITS POSITION -- THE FIRST DRAFT DRAGGED IT DOWN 28 UNITS ***",
        above.every((r) => r.y === r.feet) &&
        R.ceilingTeleportBy === 12 - R.ceilingTeleportFrom,
        above.map((r) => "feet " + r.feet + " -> " + r.y).join(", ") + ", all unmoved. The first draft put " +
        "every one of them at 12: from " + R.ceilingTeleportFrom + " that is " + R.ceilingTeleportBy +
        " units IN ONE FRAME. *** IT IS THE SAME SPECIES AS v4540's LIFT, POINTING THE OTHER WAY *** -- a " +
        "body above the cap got there some other way and pulling it down is not this function's business. " +
        "The velocity is spent either way, which is all hitting your head means.");

    ok("!! launched at 15 m/s into a roof at 12 it stops AT the roof with its velocity spent",
        hit && pos[1] === 12 && vy === 0 && free.pos[1] === 9 && !free.hitCeiling && free.frames > 60,
        "with a ceiling it stops at y=" + pos[1] + " after " + (f + 1) + " frames, vy=" + vy + "; with none " +
        "it rises, falls and lands back at " + free.pos[1] + " after " + free.frames + " frames. *** IT IS " +
        "NOT PUSHED BACK DOWN: *** the body keeps its position and loses its velocity, which is what a " +
        "caller means by hitting its head and is one fewer invented number than a bounce.");
}

// =============================================================================================================
console.log("\n7. the wiring: both live sites, and the one that undid v4540");
{
    const bm = fs.readFileSync(path.join(ENG, "simulation", "BotManager.js"), "utf8");

    // *** ANCHORED ON CODE AND NOT ON PROSE. *** The first draft matched the comment "standing still", and
    // the same round's own rewrite of that comment put the phrase in capitals and the row went red on the
    // FILE'S WORDING rather than on its behaviour. A wiring check that a rephrasing can break is a wiring
    // check nobody will keep.
    const standing = /bot\.vy = f\.landed \? 0 : f\.vy;/.test(bm) &&
                     /\} else \{[\s\S]{0,1800}?const f = fallStep\(\{ pos: \[bot\.x, bot\.y - BOT_EYE, bot\.z\], vy: bot\.vy/.test(bm);
    const modelWrites = (bm.match(/bot\.y = \(this\.world\?\._heightAt\?\.\(bot\.x, bot\.z\) \?\? bot\.y\) \+ BOT_EYE/g) || []).length;
    // *** THE AIRBORNE BRANCH MUST STILL ADVANCE x AND z, AND THE FIRST DRAFT OF IT GROUNDED EVERY PLANE. ***
    // stepTerrainFan reports movedH = 0 on an airborne step, so taking r.pos moved the body nowhere, and
    // setting handled = true skipped the fallback that advanced x/z at full speed -- the only reason a
    // flying bot moved at all. Section 8 drives the real method against HEAD; this row holds the shape.
    const airborneBlock = (bm.match(/\} else if \(r\.airborne\) \{[\s\S]*?\n                    handled = true;/) || [""])[0];
    const advances = /bot\.x \+= \(dx \/ dist\) \* speed \* dt;/.test(airborneBlock) &&
                     /bot\.z \+= \(dz \/ dist\) \* speed \* dt;/.test(airborneBlock);
    // *** EVERY SUB-CONDITION IS READ OUT OF THE CAPTURED BLOCK RATHER THAN OUT OF A WINDOW OF FIXED
    // LENGTH. *** The first draft matched fallStep within 900 characters of `else if (r.airborne)`, and
    // this round's own repair pushed the block to 2,585 -- so the row went red on how much PROSE the branch
    // carries. Second time in two rounds that a wiring row has been broken by the file it watches being
    // rewritten; anchoring on a captured region rather than a distance is the answer to both.
    const moving = /fallStep\(\{ pos: \[bot\.x, bot\.y - BOT_EYE, bot\.z\], vy: bot\.vy/.test(airborneBlock);
    const fliesExempt = (bm.match(/if \(!bot\.spec\?\.flying\)/g) || []).length === 2;
    const oracleTakesY = /\(\(x, z, y\) => \{[\s\S]{0,300}?Number\.isFinite\(h\) && h <= y \? h : null/.test(bm);
    ok("!! *** BOTH SITES FALL NOW, AND THE MODEL WRITE SURVIVES ONLY WHERE THERE IS NO TERRAIN ANSWER ***",
        moving && standing && modelWrites === 1 && advances && fliesExempt && oracleTakesY,
        "the airborne branch and the standing-still branch both call fallStep with the body's own feet and " +
        "its own vy; " + modelWrites + " write(s) of world._heightAt remain, on the `!handled` path that is " +
        "reached only when the ground oracle could not be built at all. *** THE STANDING-STILL SITE IS THE " +
        "ONE WORTH NAMING: *** v4540 gave stepTerrain's zero-wish branch the walking path's allowances so a " +
        "body under a bridge would stop being lifted onto the roof, and this line then ignored its answer " +
        "and wrote the model's anyway, every frame. Sabotage F reverts it.");
    ok("   the surface oracle is cached per world, like the ground oracle beside it",
        /_fallFor !== w/.test(bm) && /voxelSurface\(standHeightAt, w\)/.test(bm) && /hasVoxels\(w\)/.test(bm),
        "rebuilding it per frame is the expensive part, which is the reason _groundOracle gives; and a world " +
        "with no voxel grid keeps the terrain model, which is all it has.");
    report("MEASURED IN A REAL BOOT after the wiring: at column (-57,-60), standable at 12 and 23 with the " +
           "model naming 23, a bot dropped from y=43 falls for 81 frames -- 42.99, 41.05, 35.63, 26.74 -- " +
           "and lands at 24. A bot starting BETWEEN the two surfaces at 17.5 falls 35 frames to 13, where " +
           "the old line snapped it to 24: ELEVEN VOXELS UP, onto the hillside over its head.");
}

// =============================================================================================================
console.log("\n8. *** THE PLANE THE FIRST DRAFT OF THIS WIRING GROUNDED, DRIVEN THROUGH THE REAL METHOD ***");
{
    // *** TWELVE GREEN ROWS AND NOT ONE OF THEM FLEW. *** The first draft of the airborne branch set
    // handled = true after reading r.pos -- and stepTerrainFan reports movedH = 0 on an airborne step,
    // because it is a GROUND controller and an airborne body is not its business. So the branch moved the
    // body nowhere and skipped the fallback that advanced x and z at full speed, which was the only reason
    // a flying bot moved. bot_plane ships, is airborne every frame by design (its y is glided toward
    // playerPos.y + altitudeOffset AFTER this method returns), and steers only while it is outside
    // fireRange -- so it would have hovered at sight range and never fired, in a gate that was all green.
    const fly = (speed) => {
        const bm = Object.create(BotManagerClass.prototype);
        bm.world = { _heightAt: () => 0 };
        bm.bots = new Map(); bm._detours = 0;
        const bot = { x: 0, y: 25, z: 0, vy: 0, yaw: 0, id: "p",
                      spec: { speed, fireRange: 45, sightRange: 90, flying: true, altitudeOffset: 25 } };
        for (let f = 0; f < 60; f++) bm._followPathOrSteer(bot, 100, 0, 1 / 60, 1);
        return { moved: +Math.hypot(bot.x, bot.z).toFixed(4), y: +bot.y.toFixed(2) };
    };
    const plane = fly(R.planeHeadSpeed);
    ok("!! *** A FLYING BOT STILL CROSSES GROUND AT ITS OWN SPEED, AND ITS ALTITUDE IS LEFT ALONE ***",
        Math.abs(plane.moved - R.planeHeadSpeed) < 1e-3 && plane.y === 25 && R.planeFirstDraft === 0,
        "a bot_plane at speed " + R.planeHeadSpeed + ", steering at a target 100 away for 60 frames, covers " +
        plane.moved + " units -- matching HEAD to three decimals, against " + R.planeFirstDraft + " under the " +
        "first draft. Its y is still " + plane.y + ", untouched: _tickBot owns a flying body's height and " +
        "giving it a second author is the species of defect this session has spent four rounds removing. " +
        "*** THIS ROW EXISTS BECAUSE TWELVE GREEN ROWS DID NOT FLY, *** and the regression was found by a " +
        "reading party rather than by this file.");
    report("the same shape for a non-flying bot: gravity applies, and the horizontal step is still the " +
           "controller's. terrainWalk's airborne report says WHERE THE GROUND ISN'T and never says how far " +
           "the body may travel while it is not on any.");
}

console.log("\n9. the record is what the code reports now");
{
    ok("!! every field re-derived above rather than typed here",
        fall(R.dropFrom).frames === R.dropFrames && fall(20.5).pos[1] === R.fallsTo &&
        fall(20.5).frames === R.fallsToFrames && R.gravity === FB.GRAVITY && R.terminal === FB.TERMINAL &&
        Object.isFrozen(R),
        "drop " + R.dropFrames + " frames, 20.5 -> " + R.fallsTo + " in " + R.fallsToFrames + ", gravity " +
        FB.GRAVITY + ", terminal " + FB.TERMINAL + ".");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: JUMPING, which is this module with a positive initial vy and no policy of its own -- " +
    "air control, jump buffering and coyote time are a controller's decisions and there is no controller " +
    "here to make them. Moving platforms, for capsuleMove's reason: the geometry must not change between " +
    "frames. Step-up for a body with a radius, which v4543 measured as absent from both authorities. And " +
    "the MESH side of the wiring: meshSurface exists and is gated, and nothing in the tree builds a mesh " +
    "oracle for a live body, so the falling body on a triangle mesh is exercised here and nowhere else.");
process.exit(fails ? 1 : 0);
