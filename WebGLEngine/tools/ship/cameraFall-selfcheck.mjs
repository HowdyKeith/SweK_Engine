// WebGLEngine/tools/ship/cameraFall-selfcheck.mjs -- v4548
//
// Run: node tools/ship/cameraFall-selfcheck.mjs
//
// GATES the removal of camera.js's TWO copies of "fall until you land", and the three defects that came
// out with them.
//
// *** THE TREE HAD FOUR IMPLEMENTATIONS OF ONE RULE. *** physics/character/fallBody.mjs (gated, measured,
// and built around not tunnelling), physics/character/kinematic.js's stepCharacter, and TWO INSIDE
// camera.js -- _moveFP's airborne branch and _moveKaijuDrive's six lines. The camera's two were six lines
// each: integrate, move, probe, clamp. Both are calls to fallBody now.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------
//
//   A  the player's fall given the walking reach back (v4544's defect)         2 RED
//   B  the fall fed the BILINEAR ground instead of the column                   2 RED
//   C  the kaiju's ground flag latched again                                    1 RED
//   D  the player's fall reverted to its own six lines                          7 RED
//   E  fallBody's gravity used instead of the camera's                          5 RED
//   F  the kaiju given fallBody's terminal clamp                                3 RED
//   G  the reach parameter dropped, so the probe always uses the walker's       3 RED
//
// Counted across this gate, playerGround, playerSlope, controllerAgreement and voxelAvatar; every one is
// caught by THIS file as well. *** B WENT ZERO RED HERE FIRST. *** Section 5 compared the two probes and
// never dropped a body through either, so it asserted a property of the probes rather than a fact about
// which one the fall asks. The second row of that section is the body.
//
// *** THE ROUND'S OWN FIRST FIX WAS WRONG AND THE SECOND FIXTURE CAUGHT IT. *** Zeroing the reach where it
// stood -- without moving the probe before the step -- turned a lift into a TUNNEL: a body released at 20.5
// fell past decks at 21 AND 10 and landed at 0. Section 3 drives that draft as a rival. A third draft used
// the camera's BILINEAR ground for the fall and landed a body with its feet inside solid rock; section 5 is
// that one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Camera, CAMERA_FALL_AT_V4548 as R } from "../../camera/camera.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);

const voxelWorld = (solidAt) => ({ voxelAt: (x, y, z) => (solidAt(Math.floor(x), y, Math.floor(z)) ? 1 : 0) });
/** v4544's own fixture, in the camera's world shape: standable at 2, 10 and 21. */
const deckWorld = voxelWorld((fx, y) => y <= 1 || y === 8 || y === 9 || y === 20);
/** A plateau at top 40 for x >= 20 over open air, world floor at top 2. */
const cliffWorld = voxelWorld((fx, y) => y <= 1 || (fx >= 20 && y <= 39));

const mkCam = (world, pos, keys = []) => {
    const c = Object.create(Camera.prototype);
    Object.assign(c, { world, keys: new Set(keys), position: { x: pos[0], y: pos[1], z: pos[2] },
        velocity: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, _extMove: null, _eyeHeight: 1.7, _gravity: 18,
        _fpWalkSpeed: 5, _fpSprintSpeed: 8, _fpJumpVel: 8, _fpVelY: 0, _fpOnGround: false,
        playerEnergy: null, _lmbHeld: false, _sprintActive: false, _sprintHeading: null,
        _kaijuDriveVelY: 0, _kaijuDriveOnGround: false, mode: "fp", setMode: () => {} });
    return c;
};
const mkKaiju = (world, pos, keys = []) => {
    const c = mkCam(world, [0, 0, 0], keys);
    const k = { position: { x: pos[0], y: pos[1], z: pos[2] }, isAlive: () => true,
                _stamina: 1, _weaponEnergy: 1, config: { scale: 3 }, id: "k1" };
    c._kaijuTarget = k; c.mode = "kaiju_drive"; c._kaijuDriveOnGround = true;
    return { c, k };
};
/** Drop a player and report where its FEET end up. */
const playerDrop = (feet) => {
    const c = mkCam(deckWorld, [5.5, feet + 1.7, 5.5]);
    let f = 0;
    while (!c._fpOnGround && f < 4000) { c._moveFP(1 / 60); f++; }
    return { feet: +(c.position.y - 1.7).toFixed(3), frames: f };
};

// *** THE TWO COPIES, REPRODUCED EXACTLY, SO THE ROWS GRADE RULES AND NOT SENTENCES. *** They differ in
// the order of the two steps, which is the finding: _moveFP probed the ground at the body's CURRENT height
// and then moved; _moveKaijuDrive moved and then probed where it had arrived. `reach` is the other axis.
const fpCopy = (feet, reach) => {
    const c = mkCam(deckWorld, [5.5, feet + 1.7, 5.5]);
    for (let f = 1; f <= 4000; f++) {
        const g = c._terrainTopAtBilinear(c.position.x, c.position.z,
                                          c.position.y - c._eyeHeight, reach);   // PROBE at the current y
        c._fpVelY -= c._gravity * (1 / 60);
        c.position.y += c._fpVelY * (1 / 60);                                     // then MOVE
        if (c.position.y <= g + c._eyeHeight) return { feet: +g.toFixed(3), frames: f };
    }
    return { feet: null, frames: 4000 };
};
const kaijuCopy = (feet, reach) => {
    const c = mkCam(deckWorld, [5.5, feet + 1.7, 5.5]);
    for (let f = 1; f <= 4000; f++) {
        c._fpVelY -= c._gravity * (1 / 60);
        c.position.y += c._fpVelY * (1 / 60);                                     // MOVE first
        const g = c._terrainTopAtBilinear(c.position.x, c.position.z,
                                          c.position.y - c._eyeHeight, reach);   // then PROBE where it is
        if (c.position.y <= g + c._eyeHeight) return { feet: +g.toFixed(3), frames: f };
    }
    return { feet: null, frames: 4000 };
};

// =============================================================================================================
console.log("\n1. *** FOUR IMPLEMENTATIONS OF ONE RULE, TWO OF THEM SIX LINES INSIDE A CAMERA ***");
{
    const camSrc = fs.readFileSync(path.join(ENG, "camera", "camera.js"), "utf8");
    const integrations = camSrc.match(/^\s*this\._(?:fpVelY|kaijuDriveVelY)\s*[-+]=\s*this\._gravity/gm) || [];
    const calls = camSrc.match(/fallStep\(\{/g) || [];
    ok("!! camera.js integrates no gravity of its own, and calls the gated module twice instead",
        integrations.length === R.integrationsInCameraAfter && calls.length === 2 &&
        R.integrationsInCameraBefore === 2 && R.copiesAfter === R.copiesBefore - 2 &&
        /import \{ fallStep \}/.test(camSrc),
        integrations.length + " gravity integrations and " + calls.length + " fallStep calls, against " +
        R.integrationsInCameraBefore + " and 0 before. *** THE RULE HAD " + R.copiesBefore + " COPIES AND " +
        "NOW HAS " + R.copiesAfter + ", *** both of them modules with gates. The two that went were not " +
        "merely duplicates: each carried defects the gated one had already found and fixed, which is the " +
        "argument for the deduplication rather than a tidiness one.");
}

// =============================================================================================================
console.log("\n2. *** THE WALKING REACH WAS HANDED TO A FALLING BODY, AND THE CUT IS EXACTLY STEP_UP_MAX ***");
{
    const lifted = R.liftedFrom.map((feet, i) => ({ feet, by: R.liftedBy[i], live: fpCopy(feet, Camera.STEP_UP_MAX) }));
    const fell = fpCopy(R.fellFrom, Camera.STEP_UP_MAX);
    ok("!! *** A BODY 1.2 BELOW A LEDGE WAS YANKED ONTO IT; ONE 1.3 BELOW FELL ELEVEN VOXELS ***",
        lifted.every((l) => l.live.feet === R.deckAt && Math.abs((R.deckAt - l.feet) - l.by) < 1e-9) &&
        fell.feet === R.fellTo && Math.abs(R.liftedFrom[0] - (R.deckAt - Camera.STEP_UP_MAX)) < 1e-9,
        "the old rule, re-driven: " + lifted.map((l) => "feet " + l.feet + " -> " + l.live.feet +
        " (lifted " + l.by.toFixed(2) + ")").join(", ") + "; and feet " + R.fellFrom + " -> " + fell.feet +
        ". *** THE BOUNDARY IS " + (R.deckAt - Camera.STEP_UP_MAX) + ", WHICH IS THE DECK MINUS " +
        "STEP_UP_MAX EXACTLY, *** and that is what names the cause: it is the walker's allowance, not a " +
        "tolerance. physics/character/fallBody.mjs found and fixed this for the bots at v4544 -- 'stepUp " +
        "is how far a body may CLIMB onto something; handing it to a falling body lets the probe name a " +
        "surface ABOVE it' -- and v4545 brought the body-aware probe into camera.js without separating the " +
        "two queries, so the defect arrived here WITH the repair.");

    const now = R.liftedFrom.map((f) => playerDrop(f));
    ok("!! and the shipped rule falls past it to the deck below, from every one of those heights",
        now.every((r) => r.feet === R.deckBelow) && playerDrop(R.deckAt).feet === R.deckAt,
        R.liftedFrom.map((f, i) => f + " -> " + now[i].feet).join(", ") + ", and a body released AT " +
        R.deckAt + " still lands on " + playerDrop(R.deckAt).feet + ". Below the ledge it falls; on it it " +
        "stays. The reach is a parameter now and the fall passes 0, which is the one override in the file.");
}

// =============================================================================================================
console.log("\n3. *** THE TWO COPIES DISAGREE ABOUT THE ORDER, AND ONLY ONE OF THEM CAN BE RIGHT ***");
{
    const fpAt = fpCopy(R.disagreeAt, Camera.STEP_UP_MAX);
    const kdAt = kaijuCopy(R.disagreeAt, Camera.STEP_UP_MAX);
    ok("!! *** THE SAME BODY, WORLD AND RELEASE HEIGHT: ONE COPY SAYS " + R.fpAnswer + ", THE OTHER " +
       R.kaijuAnswer + " ***",
        fpAt.feet === R.fpAnswer && kdAt.feet === R.kaijuAnswer && R.fpAnswer !== R.kaijuAnswer,
        "released with feet at " + R.disagreeAt + ": the _moveFP copy lands at " + fpAt.feet +
        " and the _moveKaijuDrive copy at " + kdAt.feet + " -- ELEVEN VOXELS APART. Both were six lines " +
        "doing 'integrate, probe, clamp'; they differ only in whether the probe happens BEFORE or AFTER the " +
        "step. `" + R.fpOrder + "` against `" + R.kaijuOrder + "`. *** NOTHING IN THE TREE NOTICED THAT ONE " +
        "RULE HAD TWO IMPLEMENTATIONS THAT DISAGREED ABOUT ITS CENTRAL STEP, *** because nothing compared " +
        "them -- which is what a duplicate costs and why the round is about the duplication rather than " +
        "about either answer.");

    const zero = R.kaijuOrderZeroReachFrom.map((f) => kaijuCopy(f, 0));
    ok("!! *** AND THE KAIJU'S ORDER TUNNELS THROUGH EVERYTHING THE MOMENT THE REACH IS HONEST ***",
        zero.every((r) => r.feet === R.kaijuOrderZeroReachLandsAt) && zero.length === 7 &&
        playerDrop(R.deckAt).feet === R.deckAt,
        "that order with a reach of 0, from " + R.kaijuOrderZeroReachFrom.join(", ") + ": every one lands " +
        "at " + R.kaijuOrderZeroReachLandsAt + ", past BOTH decks -- including a body released AT " +
        R.deckAt + " and one released at 25, which start on solid ground. *** ITS SIX LINES ONLY LOOKED " +
        "LIKE THEY WORKED BECAUSE THE WALKING REACH LET THE PROBE SEE 1.2 ABOVE WHERE THE BODY LANDED, *** " +
        "catching surfaces the step had already crossed. One defect was concealing the other, and removing " +
        "either alone makes it worse. physics/character/fallBody.mjs probes at the CURRENT height and " +
        "compares the WANTED one, which is the whole of its 'cannot tunnel, structurally rather than by " +
        "substepping' claim -- driven there at speeds up to ten million -- and the shipped rule lands a " +
        "body released at " + R.deckAt + " on " + playerDrop(R.deckAt).feet + ".");
}

// =============================================================================================================
console.log("\n4. *** THE KAIJU'S GROUND FLAG WAS A LATCH, AND A LATCH IS A FREE JUMP AT ANY HEIGHT ***");
{
    const walkOff = (jumpAt) => {
        const { c, k } = mkKaiju(cliffWorld, [25.5, 40, 5.5], ["KeyA"]);
        let leftAt = -1, atJump = null;
        for (let i = 1; i <= 200; i++) {
            if (i === jumpAt) c.keys.add("Space");
            const wasOn = c._kaijuDriveOnGround;
            const before = { y: k.position.y, vy: c._kaijuDriveVelY, on: wasOn };
            c._moveKaijuDrive(1 / 60);
            if (wasOn && !c._kaijuDriveOnGround && leftAt < 0 && i !== jumpAt) leftAt = i;
            if (i === jumpAt) atJump = { ...before, after: c._kaijuDriveVelY };
        }
        return { leftAt, atJump };
    };
    const r = walkOff(90);
    ok("!! *** onGround GOES FALSE THE FRAME THE KAIJU LEAVES THE PLATEAU, AND SPACE NO LONGER JUMPS ***",
        r.leftAt === R.cliffLeftAtFrame && r.atJump.on === false && r.atJump.after < 0,
        "walking off a " + (R.cliffTop - 2) + "-voxel cliff, the flag clears at frame " + r.leftAt +
        " -- the frame the body leaves the plateau -- and at frame 90 it is " + r.atJump.on + ", so Space " +
        "does nothing and the velocity stays " + r.atJump.after.toFixed(2) + ". *** BEFORE v4548 THE FLAG " +
        "READ TRUE FOR THE WHOLE DESCENT: *** only landing set it and only jumping cleared it, so walking " +
        "off anything left it latched. Measured at frame " + R.latchStillTrueAtFrame + ", " +
        R.latchHeightThen + " units up and falling at " + Math.abs(R.latchVelocityThen) + " m/s, it still " +
        "read true and Space gave a free jump to +" + R.freeJumpVelocity + " for 0.15 of stamina. " +
        "It is read off the module's own `airborne` now, which is computed per frame and cannot latch.");
    report("the flag is not merely reset in the same six lines: those lines are gone. `airborne` is " +
           "fallBody's, and its header calls landed 'the EDGE' and airborne 'the state' -- a distinction " +
           "the copy did not have a word for, which is how it ended up with one field doing both jobs.");
}

// =============================================================================================================
console.log("\n5. A LANDING HAPPENS ON ONE COLUMN, NOT ON AN INTERPOLATION");
{
    // The third draft: fallBody's contract, but fed the camera's BILINEAR ground instead of the column.
    const straddle = voxelWorld((fx, y, fz) => y <= 1 || (fz < 40 && y <= 3));
    const at = (fz, feet, useBlend) => {
        const c = mkCam(straddle, [5.5, feet + 1.7, fz]);
        return useBlend ? c._terrainTopAtBilinear(5.5, fz, feet, 0) : c._standYAt(5.5, fz, feet, 0);
    };
    const blend = at(39.5, 4, true), column = at(39.5, 4, false);
    ok("!! *** THE BLEND ANSWERS A HEIGHT NEITHER COLUMN HAS, AND THE BODY LANDS INSIDE ROCK ***",
        Math.abs(blend - R.blendLandsFeetAt) < 1e-9 && column === R.columnLandsFeetAt &&
        blend < column,
        "straddling z=39.5, where the column the body is IN has rock up to y=" + R.blendRockTopInThatColumn +
        " and a surface at " + column + ", and the next one along has a surface at 2: the blend says " +
        blend + " -- A HEIGHT NEITHER COLUMN HAS, and one that is INSIDE the rock the body is standing in. " +
        "v404 and v405 moved both camera paths to a bilinear ground " +
        "because the integer one 'produced visible stairs' as a body WALKED across boundaries, so the " +
        "blend looks like the obvious thing to hand a fall. It is not: a walk crosses a boundary and wants " +
        "the two columns averaged, a LANDING happens on ONE COLUMN. Driven with the blend, the body landed " +
        "with its FEET INSIDE SOLID STONE and _canStandAt then refused every move. That is why " +
        "fallBody ships voxelSurface() over the INTEGER probe, and why _fallSurface is that and not the " +
        "blend. *** THE WALK KEEPS THE BLEND, where it is right and where the stairs actually show. ***");

    // *** THE ROW ABOVE COMPARES TWO PROBES AND NEVER DRIVES A BODY, AND THE BATTERY CAUGHT THAT. ***
    // Feeding the blend to _fallSurface went ZERO RED on this file: the values it asserts are properties of
    // the two probes, both of which still exist and still differ whatever the fall is wired to. A row about
    // which one the SHIPPED code uses has to drop a body through it.
    {
        const c = mkCam(straddle, [5.5, 8, 39.5]);
        let f = 0;
        while (!c._fpOnGround && f < 2000) { c._moveFP(1 / 60); f++; }
        const feet = +(c.position.y - c._eyeHeight).toFixed(3);
        ok("!! a body dropped onto that straddle lands on the COLUMN, and the column is the one with rock",
            feet === R.columnLandsFeetAt && feet > R.blendLandsFeetAt,
            "released at feet 8 over z=39.5, it lands at " + feet + " -- the column's surface -- not at " +
            R.blendLandsFeetAt + ", which is where the blend would have put it and is INSIDE the rock of " +
            "the column it occupies. The row above proves the two probes differ; this one proves which of " +
            "them the fall actually asks.");
    }
}

// =============================================================================================================
console.log("\n6. WHAT IS DELIBERATELY UNCHANGED, BECAUSE REMOVING A DUPLICATE MUST NOT SMUGGLE IN A CHANGE");
{
    const camSrc = fs.readFileSync(path.join(ENG, "camera", "camera.js"), "utf8");
    const grav = camSrc.match(/gravity:\s*-this\._gravity/g) || [];
    const term = camSrc.match(/terminal:\s*-Infinity/g) || [];
    ok("!! both calls pass the CAMERA's gravity and the camera's absent terminal, not the module's",
        grav.length === 2 && term.length === 2 && R.gravityPassedThrough === 18 &&
        R.terminalPassedThrough === -Infinity,
        grav.length + " call(s) pass `gravity: -this._gravity` (" + R.gravityPassedThrough + ", the " +
        "camera's own) and " + term.length + " pass `terminal: -Infinity`. fallBody's defaults are -20 and " +
        "-55. v4547 measured both as LIVE disagreements with the bots and recorded that changing either " +
        "is a gameplay decision a census does not make; this round removes a duplicate and makes the same " +
        "decision, so both are passed through explicitly. *** THE ABSENT TERMINAL IS NOW A LITERAL AT THE " +
        "CALL SITE RATHER THAN A SHAPE A REGEX HAD TO INFER, *** which is strictly better bookkeeping and " +
        "is how tools/ship/controllerAgreement-selfcheck.mjs reads it.");

    const flat = voxelWorld((fx, y) => y <= 1);
    const c = mkCam(flat, [5.5, 2 + 1.7, 5.5], ["KeyD"]);
    c._fpOnGround = true;
    for (let i = 0; i < 140; i++) c._moveFP(1 / 60);
    ok("   and the ordinary walk is untouched: the fall code is not on that path at all",
        Math.abs(c.position.y - 3.7) < 1e-9 && c._fpOnGround && c.position.x > 17,
        "140 frames east on flat ground: y=" + c.position.y.toFixed(3) + ", x=" + c.position.x.toFixed(2) +
        ", onGround " + c._fpOnGround + ". A grounded body never enters the airborne branch, so the whole " +
        "of this round is invisible to it.");
}

// =============================================================================================================
console.log("\n7. the record is what the code reports now");
{
    ok("!! every field re-derived above rather than typed here",
        R.copiesBefore - R.copiesAfter === 2 && R.liftedFrom.length === R.liftedBy.length &&
        R.liftedFrom[0] === R.deckAt - Camera.STEP_UP_MAX && R.fellFrom < R.liftedFrom[0] &&
        Object.isFrozen(R) && Object.isFrozen(R.liftedFrom),
        "copies " + R.copiesBefore + " -> " + R.copiesAfter + "; the lift boundary " + R.liftedFrom[0] +
        " is the deck at " + R.deckAt + " minus STEP_UP_MAX " + Camera.STEP_UP_MAX + ".");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nnot done here: physics/character/kinematic.js's stepCharacter is the fourth implementation and is " +
    "left alone -- it is a MESH controller with its own isSolid contract and no shipping caller in this " +
    "tree, so folding it into fallBody would be a change without a measurement behind it; the kaiju's " +
    "body is still probed as a 2-cell one though the creature stands eight units tall, which is the " +
    "capsule question and its own round; and the gravity and terminal disagreements v4547 measured are " +
    "passed through rather than resolved, for the reason section 6 gives.");
process.exit(fails ? 1 : 0);
