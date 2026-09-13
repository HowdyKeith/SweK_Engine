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
//   D  the pillar built shorter than the roof                            RED, sections 3 and 6 (columns differ)
//      -- *** THE REFERENCE READ "3 AND 5" UNTIL v4543 AND HAD BEEN WRONG SINCE v4540, ***
//      which inserted a section and renumbered the file under a log nobody re-ran. Re-driven
//      at v4543: D reddens 3 and 6, B reddens 3 alone. A sabotage log is a MEASUREMENT and
//      goes stale exactly like any other; this one was found by a reader that re-ran them.
//
//   E  the v4540 standing-branch fix reverted                            4 RED, all of section 5
//   F  the teleport "fixed" by never snapping at all                     2 RED, and the TELEPORT row still
//      passes -- correctly, because never snapping does stop it. Only the SETTLING row and the band row
//      catch it, which is the whole reason a repair needs a row saying what it must NOT break as well as
//      one saying what it must.
//   G  the band hardcoded to 0.5 instead of the caller's allowances      1 RED, the band row alone
//
// *** SECTION 4 WAS A CHECK THAT GOES RED ON SUCCESS, AND v4542 PAID IT OFF. *** It characterised a defect
// in world/surfaceProbe.mjs -- a body on a cave floor told the ground was the hillside over it -- so the
// only thing that could drive it red was REPAIRING that module, the shape v4536 found and removed elsewhere
// in this tree. It was kept because the alternative was no record, and labelled in its own report line so
// the round that fixed the probe would DELETE it rather than argue with it. v4542 made standHeightAt
// body-aware; the row is gone, replaced by a one-row check that the defect is closed, and the behaviour of
// the repaired function is gated where it belongs, in world/surfaceProbe-selfcheck.mjs sections 8 to 12.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as GP from "../../physics/character/groundProbe.mjs";
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
import { standHeightAt } from "../../world/surfaceProbe.mjs";
const PROBE = GP.PROBE_AT_V4539;
import { meshGround as NM_meshGround, stepTerrain } from "../../physics/character/terrainWalk.mjs";
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
        "WHILE PIECE (2) WAS OPEN, AND THIS ROW IS THE PROOF RATHER THAN THE OPINION. *** Piece (2) " +
        "shipped at v4541 and piece (3) at v4543, so what this row proves is no longer a blocker -- it is " +
        "the REASON the repair had to be a capsule, and it is kept for that.");
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
console.log("\n4. *** THE LIVE INSTANCE THIS SECTION CHARACTERISED IS REPAIRED, SO THE CHARACTERISATION IS GONE ***");
{
    // *** THIS SECTION USED TO ASSERT THE DEFECT AND IS NOW ONE LINE. *** Until v4542 it drove
    // world/surfaceProbe.mjs's standHeightAt on a column standable at y=1 and y=21 and asserted the answer
    // was 21 -- a body on the floor told the ground was on the deck -- and it said so about itself, in its
    // own report lines: "THIS ROW IS A CHARACTERISATION AND IT GOES RED WHEN THE DEFECT IS FIXED ... the
    // round that makes standHeightAt body-aware must DELETE this row, not argue with it."
    //
    // v4542 made it body-aware. The row is deleted rather than inverted, because a gate for surfaceProbe's
    // behaviour belongs in world/surfaceProbe-selfcheck.mjs, which now carries five sections of it. What is
    // kept here is the ONE fact this file is entitled to: that the defect it filed is closed, checked by
    // asking the repaired function the same question with a body in it.
    const solid = new Set([0, 20]);                       // floor at y=1, deck at y=21
    const world = { chunkHeight: 64, isAir: (x, y, z) => !solid.has(y), _heightAt: () => NaN };
    const onFloor = standHeightAt(world, 0, 0, { y: 1, stepUp: 1.2 });
    const onDeck = standHeightAt(world, 0, 0, { y: 21, stepUp: 1.2 });
    ok("!! *** THE BODY ON THE FLOOR IS TOLD THE FLOOR, AND v4539's ROW IS DELETED RATHER THAN INVERTED ***",
        onFloor === PROBE.liveProbeShouldBe && onDeck === PROBE.liveProbeAnswer,
        "the same column v4539 filed: standable at 1 and at 21, and standHeightAt answers " + onFloor +
        " for a body on the floor and " + onDeck + " for one on the deck -- against a record of " +
        PROBE.liveProbeShouldBe + " and " + PROBE.liveProbeAnswer + ", where the second number is what the " +
        "BODYLESS call still returns and is still right to. *** A CHECK THAT GOES RED ON SUCCESS IS A DEBT " +
        "AND THIS ROUND PAID IT, *** on the terms the row itself set out.");
    report("v4539 wrote that this repair 'is no easier than the one section 3 refuses ... which is piece (2) " +
           "again'. HALF RIGHT, AND THE HALF MATTERS: choosing which surface a body is ON needs no swept " +
           "volume, because a voxel column has no side faces WITHIN itself -- the column is the sweep. What " +
           "needs the swept volume is whether the body may MOVE to the next column's surface, and that is " +
           "unchanged. Section 3 still stands exactly as written.");
}

// =============================================================================================================
console.log("\n5. *** STANDING STILL IS NOT A LICENCE TO BE MOVED, WHICH IS THE ONE REPAIR THIS ROUND SHIPS ***");
{
    const g = NM_meshGround(bridge);
    const still = (pos, o = {}) => stepTerrain({ pos, ground: g, wish: [0, 0], ...o });
    const under = still([12, 0, 10]);
    ok("!! *** A BODY STANDING UNDER THE BRIDGE IS NOT LIFTED FIVE METRES ONTO IT ***",
        Math.abs(under.pos[1] - 0) < 1e-9 && under.airborne === true && under.grounded === false,
        "in at y=0, out at y=" + under.pos[1].toFixed(2) + ", grounded=" + under.grounded + ", airborne=" +
        under.airborne + ". *** THE ZERO-WISH RETURN USED TO ASSIGN THE ORACLE'S ANSWER OUTRIGHT, *** with " +
        "no step test at all, while the walking path four lines down has had one since the module shipped. " +
        "A body that asked for nothing came back five metres up. Out of range now reports AIRBORNE rather " +
        "than moving, which is the honest of the two: this module owns no vertical velocity, so 'the ground " +
        "I can see is not one you could be on' is the caller's problem and saying so hands it over.");
    const settle = still([2, 0.3, 10]), beyond = still([2, 0.6, 10]);
    ok("!! ...and SETTLING still works, which is what the branch is for",
        Math.abs(settle.pos[1]) < 1e-9 && settle.grounded === true &&
        Math.abs(beyond.pos[1] - 0.6) < 1e-9 && beyond.grounded === false,
        "0.3 above the floor snaps to " + settle.pos[1].toFixed(2) + " (inside snapDown 0.5); 0.6 above stays " +
        "at " + beyond.pos[1].toFixed(2) + " and reports airborne. A repair that fixed the teleport by never " +
        "snapping would pass the row above and fail this one.");
    const high = still([2, 20, 10]);
    ok("!! ...and it does not drop a body down a cliff either, which is the same bug facing the other way",
        Math.abs(high.pos[1] - 20) < 1e-9 && high.airborne === true,
        "20 above open floor stays at " + high.pos[1].toFixed(2) + " and reports airborne, where the old " +
        "branch assigned 0.00 -- a twenty-metre fall completed in one frame by a module that owns no gravity.");
    // *** THE BAND IS THE WALKING PATH'S OWN, AND THIS ROW IS WHAT STOPS THE TWO DRIFTING APART. ***
    // A repair that hardcoded 0.5 would pass every row above and fail here.
    const band = [];
    for (const [sh, sd] of [[0.5, 0.5], [2, 0.25], [0.25, 3]]) {
        const up = still([2, -sh + 0.01, 10], { stepHeight: sh, snapDown: sd }).grounded;
        const upOut = still([2, -sh - 0.01, 10], { stepHeight: sh, snapDown: sd }).grounded;
        const dn = still([2, sd - 0.01, 10], { stepHeight: sh, snapDown: sd }).grounded;
        const dnOut = still([2, sd + 0.01, 10], { stepHeight: sh, snapDown: sd }).grounded;
        band.push({ sh, sd, ok: up && !upOut && dn && !dnOut });
    }
    ok("!! *** AND THE ACCEPTED BAND IS stepHeight UP AND snapDown DOWN, NOT A CONSTANT ***",
        band.every((b) => b.ok),
        band.map((b) => "stepHeight " + b.sh + " / snapDown " + b.sd + ": " + (b.ok ? "band follows" : "BAND WRONG"))
            .join("; ") + ". The standing rule is the walking rule applied to the same quantity, because a " +
        "rule that depends on whether the body happened to be moving is two rules.");
}

// =============================================================================================================
console.log("\n6. *** THE RECORD, RE-DERIVED ***");
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

    // *** SIX OF THIS RECORD'S THIRTEEN FIELDS WERE READ BY NOTHING, UNDER A HEADER SAYING THEY WERE
    // "RE-DERIVED ON EVERY RUN". *** Found at v4543 by a reader that grepped the tree for each field name
    // rather than trusting the sentence above the record. That is frozenRecords-selfcheck's whole thesis
    // arriving inside a file that quotes it: a version-stamped frozen number is load-bearing exactly when
    // changing it turns something red, and these six could be set to anything at all.
    const roofY = NM_meshGround(bridge)(12, 10);
    const roofNormal = roofY.n[1];
    const slopePasses = roofNormal >= Math.cos(45 * Math.PI / 180) - 1e-12;
    // *** COUNTED BY IMPORT AND NOT BY MENTION, because the first draft of this row counted 4 -- three of
    // them this round's own changelog prose in main.js and brain/brain.js, which name the function in
    // English. A census that cannot tell a caller from a sentence is the defect corpusFilters was built for.
    const callers = (() => {
        const walk = (d, out = []) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                if (e.name === "node_modules" || e.name === "vendor" || e.name.startsWith(".")) continue;
                const q = path.join(d, e.name);
                if (e.isDirectory()) walk(q, out);
                else if (/\.(mjs|js)$/.test(e.name)) out.push(q);
            }
            return out;
        };
        return walk(ENG).filter((f) => {
            if (/-selfcheck\.mjs$/.test(f)) return false;                      // gates are not consumers
            if (/groundProbe\.mjs$|capsuleGround\.mjs$|terrainWalk\.mjs$/.test(f)) return false; // fixtures and the definition
            const src = fs.readFileSync(f, "utf8");
            return /import\s*\{[^}]*\bmeshGround\b[^}]*\}\s*from/.test(src);
        }).length;
    })();
    // the teleport was measured UNDER the roof, where the oracle names y=5; settling is on OPEN floor,
    // where it names y=0 -- two different columns of the same fixture, and mixing them was the first
    // draft's other mistake.
    const g = NM_meshGround(bridge);
    const step = (pos) => stepTerrain({ pos, ground: g, wish: [0, 0], dt: 1 / 60, speed: 5,
                                        stepHeight: 0.5, snapDown: 0.5 });
    const underRoof = step([12, 0, 10]);                       // the v4540 teleport column
    const settles = step([2, R.settlingKept, 10]);             // open floor, 0.3 up
    const doesNot = step([2, 0.6, 10]);                        // open floor, 0.6 up
    ok("!! *** AND THE OTHER SIX FIELDS ARE READ HERE, BECAUSE UNTIL v4543 NOTHING READ THEM AT ALL ***",
        roofY.y === R.roofY && slopePasses === R.stepTestFires && callers === R.meshGroundShippingCallers &&
        underRoof.pos[1] === R.standingTeleportNow && settles.pos[1] === 0 && doesNot.pos[1] === 0.6 &&
        R.standingTeleportWas === R.roofY,
        "roofY " + roofY.y + "; the roof's normal is " + roofNormal.toFixed(4) + ", so the SLOPE test PASSES " +
        "and it is the STEP test that refuses -- which is what stepTestFires records, and it is the " +
        "correction v4539 made to the backlog entry's own wording; meshGround is IMPORTED by " + callers +
        " file(s) outside gates, fixtures and its own definition; a body standing still under the roof stays " +
        "at " + underRoof.pos[1] + " where v4540 found it lifted to " + R.standingTeleportWas + "; and on " +
        "open floor a body " + R.settlingKept + " up still settles to " + settles.pos[1] + " while one 0.6 up " +
        "stays at " + doesNot.pos[1] + ". *** standingTeleportWas IS THE ROOF HEIGHT AND THAT IS ASSERTED " +
        "RATHER THAN LEFT AS A COINCIDENCE: *** the teleport was exactly the " +
        "distance to the surface the oracle named.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nCLOSED SINCE v4539: the LIVE instance, which was not in the adapter the backlog names. The voxel " +
    "stand-height probe the bot manager and the pathfinder pool both read answered the topmost standable " +
    "surface the same way, and on the engine's own generated world it was wrong on more than half the " +
    "columns -- 51.3% of 1,681 measured in a real boot at v4542, up to 47 voxels apart. It takes the " +
    "body now. The mesh adapter this file is about does NOT, and that is piece (3), still open: the " +
    "figure is in the round " +
    "note and not in a row here. Also unchecked: sloped or curved overhangs, tunnels with non-flat roofs, " +
    "and anything about what a fix SHOULD do once piece (2) exists -- this file measures that the cheap fix " +
    "is worse, and says nothing about the dear one.");
process.exit(fails ? 1 : 0);
