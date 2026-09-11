// WebGLEngine/tools/ship/groundProbe-selfcheck.mjs -- v4539
//
// Run: node tools/ship/groundProbe-selfcheck.mjs
//
// GATES physics/character/groundProbe.mjs, which holds the measurement that backlog item
// "terrain-controller" piece (3) cannot be closed while piece (2) is open.
//
// *** THIS GATE EXISTS TO CONVICT A FIX, NOT A BUG. *** The bug is real and shipped: an overhang reads as a
// wall. The reason the round does not repair it is that the repair anybody would reach for is worse, and
// section 2 drives that rather than arguing it. A reader who deletes this file and "fixes" meshGround will
// walk a character through a solid pillar and no other gate in the tree will say a word.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the candidate fix made to ignore the body and cast from the sky   RED, section 2 (it stops fixing)
//   B  the pillar's side faces removed, leaving a floating slab          RED, section 3 (the proof dissolves)
//   C  columnHits' nudge raised until it steps over a surface            RED, section 3 (the count falls to 1)
//      -- AND ITS FIRST AIM WENT 0 RED. It was pointed at a nudge BELOW meshBVH's
//      1e-9 epsilon, on the reasoning that the loop would re-report the surface it
//      just left. Driven, 0 and 1e-15 and 1e-12 all work, because a ray starting on
//      a surface returns t = 0 and `t > EPS` rejects it -- the loop descends for the
//      exact reason the comment said it would stall. Only a nudge large enough to
//      step PAST the next surface breaks it. Third time this session a justification
//      of mine has failed its own sabotage, and the sabotage is how I found out.
//   D  the pillar built shorter than the roof                            RED, sections 3 and 5 (columns differ)
//
// SECTION 4 IS NOT SABOTAGED AND THAT IS DELIBERATE. It characterises a defect in another module, so the
// only thing that drives it red is REPAIRING that module -- which makes it a check that goes red on success,
// the shape v4536 found and removed elsewhere in this tree. It is kept because the alternative is no record,
// and it is labelled in its own report line so the round that fixes the probe deletes it instead of arguing.
"use strict";
import * as GP from "../../physics/character/groundProbe.mjs";
import { standHeightAt } from "../../world/surfaceProbe.mjs";
import { meshGround } from "../../physics/character/terrainWalk.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const bridge = GP.bridgeMesh(), pillar = GP.pillarMesh();

// =============================================================================================================
console.log("\n1. *** AN OVERHANG READS AS A WALL, WHICH IS THE DEFECT AND IT IS NOT THE ONE FILED ***");
{
    const g = meshGround(bridge);
    const under = [2, 6].map((x) => g(x, 10).y), over = [9, 12, 18].map((x) => g(x, 10).y);
    const w = GP.walkEast(bridge, g);
    ok("!! *** THE ORACLE RETURNS THE ROOF THE MOMENT THE WALKER STEPS UNDER IT ***",
        under.every((y) => y === 0) && over.every((y) => y === 5) && Math.abs(w.x - 8) < 1e-6,
        "ground.y reads " + under.join("/") + " before the roof and " + over.join("/") + " under it; walking " +
        "east from x=2 the body stops dead at x=" + w.x.toFixed(4) + ". *** YOU CANNOT WALK UNDER A BRIDGE, " +
        "INTO A DOORWAY, OR THROUGH A TUNNEL. *** And it is the STEP test that refuses it, not the slope test " +
        "the backlog entry's wording points at: the roof is horizontal, so the slope test sees n[1] = 1 " +
        "against a cosine of 0.707 and passes, and contourSlide is never reached. A fix aimed at the slope " +
        "logic would hit nothing at all.");
    report("the same mesh read by the shipped adapter, which has no caller in the tree outside its own gate: " +
           "the one shipping consumer builds its oracle from a height FUNCTION, which cannot have a second " +
           "surface to discard. Piece (3) as filed is a latent defect in an unwired adapter.");
}

// =============================================================================================================
console.log("\n2. *** AND THE OBVIOUS FIX WALKS A CHARACTER THROUGH FOUR SQUARE METRES OF SOLID STONE ***");
{
    const rows = [];
    for (const [name, bvh] of [["bridge", bridge], ["pillar", pillar]]) {
        rows.push({ name,
            shipped: GP.walkEast(bvh, meshGround(bvh)).x,
            fixed: GP.walkEast(bvh, GP.fromBodyGround(bvh), { bodyAware: true }).x });
    }
    const br = rows[0], pl = rows[1];
    ok("!! *** THE FIX DOES NOT REMOVE THE ERROR, IT MOVES IT -- AND MOVES IT THE UNSAFE WAY ***",
        Math.abs(br.shipped - 8) < 1e-6 && br.fixed > 19 &&
        Math.abs(pl.shipped - 8) < 1e-6 && pl.fixed > 19,
        "bridge: shipped ends x=" + br.shipped.toFixed(4) + " (wrong, stopped by a roof 5 m overhead), fixed " +
        "ends x=" + br.fixed.toFixed(4) + " (correct).  pillar: shipped ends x=" + pl.shipped.toFixed(4) +
        " (CORRECT -- there really is a wall), fixed ends x=" + pl.fixed.toFixed(4) + " *** HAVING WALKED " +
        "THROUGH THE PILLAR. *** Casting from the body's own height instead of from the sky trades a refusal " +
        "that is merely annoying for a permission that puts a character inside the world, and " +
        "physics/character/terrainWalk.mjs's own header calls refusing the safe direction.");
    report("shipped is wrong on one fixture and right on the other; the fix is right on one and wrong on the " +
           "other. Neither is better. That symmetry is what section 3 explains.");
}

// =============================================================================================================
console.log("\n3. *** WHY NO DOWNWARD RULE CAN DO BETTER: THE TWO WORLDS ARE THE SAME WORLD FROM ABOVE ***");
{
    const a = GP.columnHits(bridge, 12, 10), b = GP.columnHits(pillar, 8.5, 10);
    const same = a.length === b.length && a.every((y, i) => Math.abs(y - b[i]) < 1e-9);
    ok("!! *** EVERY SURFACE UNDER A VERTICAL RAY IS IDENTICAL AT A BRIDGE AND AT A PILLAR ***",
        same && a.length === 2,
        "bridge at (12,10): [" + a.map((y) => y.toFixed(3)).join(", ") + "];  pillar at (8.5,10): [" +
        b.map((y) => y.toFixed(3)).join(", ") + "]. *** THE INFORMATION IS NOT BEING DISCARDED BY THE " +
        "ORACLE -- IT IS NOT ON THE RAY. *** A downward ray never touches a side face, and the side faces " +
        "are the entire difference between a doorway and a wall. So no rule over downward casts separates " +
        "them: not one cast, not two, not the all-hits query a richer oracle would offer. Telling them apart " +
        "needs the swept volume of the BODY against the triangles it would pass through, which is backlog " +
        "piece (2) CAPSULE AGAINST TRIANGLES and is still open. *** PIECE (3) CANNOT BE HONESTLY CLOSED " +
        "WHILE PIECE (2) IS OPEN, AND THIS ROW IS THE PROOF RATHER THAN THE OPINION. ***");
    // *** THE FIRST DRAFT OF THIS ROW COULD NOT BE DRIVEN, AND FINDING THAT OUT IS WORTH THE PARAGRAPH. ***
    // It asserted "the pillar really is solid, so the identity is not an artefact of a missing face" by
    // checking the column again -- and sabotage B, deleting one of the pillar's side quads, went 0 RED.
    // Of course it did: a vertical ray never touches a side face, so removing one cannot move a number the
    // ray produced. The row was checking the thesis with the instrument the thesis says is blind. What DOES
    // reach the side faces is a ray that travels along the ground, so that is what asks the question now.
    const sideHit = pillar.raycastFirst(2, 2.5, 10, 1, 0, 0, Infinity);
    const throughBridge = bridge.raycastFirst(2, 2.5, 10, 1, 0, 0, Infinity);
    ok("!! *** AND A HORIZONTAL RAY TELLS THEM APART INSTANTLY, WHICH IS WHERE THE MISSING INFORMATION IS ***",
        sideHit && Math.abs(sideHit.point[0] - 8) < 1e-6 && !throughBridge,
        "at knee height, a ray travelling east hits the pillar at x=" +
        (sideHit ? sideHit.point[0].toFixed(3) : "MISS") + " and passes under the bridge entirely (" +
        (throughBridge ? "HIT at " + throughBridge.point[0].toFixed(3) : "no hit") + "). The two worlds are " +
        "identical from above and trivially different from the side. That is not a hint that the oracle " +
        "should cast sideways -- one ray is not a body -- it is the measurement that says the missing " +
        "information lives in the swept volume, which is piece (2)'s subject and not this round's.");
    report("the pillar's top is built at the roof's own height on purpose. At any other height the columns " +
           "differ by a number and the point is lost behind it.");
}

// =============================================================================================================
console.log("\n4. *** AND THE SAME MISTAKE IS LIVE, IN THE MODULE THE SHIPPING CALLERS ACTUALLY READ ***");
{
    // *** THE BACKLOG POINTS AT AN ADAPTER NOTHING CALLS. *** meshGround has no consumer outside its own
    // gate; the shipping path builds its oracle from a height FUNCTION, which cannot hold two surfaces. But
    // world/surfaceProbe.mjs's standHeightAt -- read by the bot manager and the pathfinder pool -- falls back
    // to `topSolidAt(...) + 1`, which is take-the-topmost by another name, on a voxel world where a column
    // really can carry several standable surfaces. A SYNTHETIC WORLD RATHER THAN A BOOTED ONE, on purpose: a
    // gate that starts the engine is a gate the sweep cannot afford, and the behaviour does not need one.
    const solid = new Set([0, 20]);                       // floor at y=1, deck at y=21
    const world = { chunkHeight: 64, isAir: (x, y, z) => !solid.has(y), _heightAt: () => NaN };
    const answer = standHeightAt(world, 0, 0);
    ok("!! *** A BODY STANDING ON THE FLOOR IS TOLD THE GROUND IS TWENTY VOXELS UP, ON THE DECK ***",
        answer === 21,
        "a column solid at y=0 and y=20 is standable at y=1 and at y=21, and standHeightAt answers " + answer +
        ". It takes no account of where the body is, because its signature has nowhere to put it -- the same " +
        "shape as the mesh adapter and the same consequence. *** THIS IS THE LIVE INSTANCE AND THE BACKLOG " +
        "ENTRY DOES NOT MENTION IT, *** naming instead an adapter with no shipping caller and calling the " +
        "defect a thing that 'will be the first thing wrong on a real mesh' -- future tense, on a path " +
        "nothing walks, while the present tense is one directory over.");
    report("and the repair here is no easier than the one section 3 refuses: a voxel column's standable " +
           "surfaces are knowable from above, but WHICH of them the body may move to is a question about the " +
           "body's swept volume, which is piece (2) again.");
    report("*** THIS ROW IS A CHARACTERISATION AND IT GOES RED WHEN THE DEFECT IS FIXED, WHICH IS SAID HERE " +
           "RATHER THAN LEFT TO BE DISCOVERED. *** v4536 found an assertion in this tree that demanded a " +
           "polygon count stay ABOVE the figure a filed round existed to reduce -- a check that goes red on " +
           "success. This row has the same shape and is kept only because the alternative is no record at " +
           "all: the round that makes standHeightAt body-aware must DELETE this row, not argue with it, and " +
           "the frozen record beside it carries liveProbeShouldBe: 1 so the intended answer is written down " +
           "next to the wrong one.");
}

// =============================================================================================================
console.log("\n5. *** THE RECORD, RE-DERIVED ***");
{
    const R = GP.PROBE_AT_V4539;
    const br = { shipped: GP.walkEast(bridge, meshGround(bridge)).x,
                 fixed: GP.walkEast(bridge, GP.fromBodyGround(bridge), { bodyAware: true }).x };
    const pl = { shipped: GP.walkEast(pillar, meshGround(pillar)).x,
                 fixed: GP.walkEast(pillar, GP.fromBodyGround(pillar), { bodyAware: true }).x };
    const cols = GP.columnHits(bridge, 12, 10).join(",") === GP.columnHits(pillar, 8.5, 10).join(",");
    ok("!! every field of the frozen record is what the code reports now",
        Math.abs(R.bridgeShippedX - br.shipped) < 1e-6 && Math.abs(R.bridgeFixedX - br.fixed) < 1e-6 &&
        Math.abs(R.pillarShippedX - pl.shipped) < 1e-6 && Math.abs(R.pillarFixedX - pl.fixed) < 1e-6 &&
        R.columnsIdentical === cols,
        "bridge " + br.shipped.toFixed(0) + "/" + br.fixed.toFixed(0) + ", pillar " + pl.shipped.toFixed(0) +
        "/" + pl.fixed.toFixed(0) + ", columns identical " + cols + " -- against a record of " +
        R.bridgeShippedX + "/" + R.bridgeFixedX + ", " + R.pillarShippedX + "/" + R.pillarFixedX + ", " +
        R.columnsIdentical);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: the LIVE instance of this mistake, which is not in the adapter the backlog names. The " +
    "voxel stand-height probe the bot manager and the pathfinder pool both read answers the topmost standable " +
    "surface the same way, and on the engine's own generated world it is wrong on about half the columns -- " +
    "measured by booting the engine, which is a gate the sweep cannot afford, so the figure is in the round " +
    "note and not in a row here. Also unchecked: sloped or curved overhangs, tunnels with non-flat roofs, " +
    "and anything about what a fix SHOULD do once piece (2) exists -- this file measures that the cheap fix " +
    "is worse, and says nothing about the dear one.");
process.exit(fails ? 1 : 0);
