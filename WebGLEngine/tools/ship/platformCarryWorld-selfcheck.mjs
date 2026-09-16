// WebGLEngine/tools/ship/platformCarryWorld-selfcheck.mjs -- v4631
//
// Gates world/platformCarryWorld.mjs (task board #84): the ferry/turntable transforms, the rotation-aware
// onDeck() membership test, the per-frame collider rebuild, and -- the actual point of this round -- that a
// real Camera, carried through capsuleCollide.mjs's own carryOnPlatform() the same way main.js's "platform_
// carry" demo does it every frame, genuinely rides the ferry across the gap and gets swept around by the
// turntable, rather than falling through or being left behind.
//
// SABOTAGED AND RESTORED: onDeck() hardcoded to always return false (the platform-membership test that gates
// every carry) went red BY NAME on 6 of 24 checks -- both direct onDeck() assertions in section 3 (including
// the rotation-awareness one), the ferry-boarding and never-fell-in-the-gap checks in section 6, and the
// actually-moved check in section 7 -- while leaving every check that does not depend on carry engaging
// (sections 1, 2, 4, 5, and the turntable's own distance-stayed-constant check in section 7, which is
// trivially true when nothing moves at all) correctly green, showing the sabotage was isolated to exactly what
// it broke. Restored and re-verified.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const W = await import(pathToFileURL(path.join(ENG, "world", "platformCarryWorld.mjs")).href);
const { buildPlatformCarryWorld, platformWorldAt, ferryTransformAt, turntableTransformAt, onDeck, platformCarryVoxelColumns,
        FERRY, FERRY_CYCLE, TURNTABLE, START_PAD, MID_PAD, SPAWN, RESPAWN_Y } = W;
const { carryOnPlatform } = await import(pathToFileURL(path.join(ENG, "physics", "character", "capsuleCollide.mjs")).href);
const { Camera } = await import(pathToFileURL(path.join(ENG, "camera", "camera.js")).href);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("1. THE FERRY: DOCK -> TRAVEL -> DOCK -> RETURN, A PURE FUNCTION OF t");
{
    const at = (t) => ferryTransformAt(t).p[0];
    ok("  docked at nearX through the whole dock window", at(0) === FERRY.nearX && at(FERRY.dockTime - 0.01) === FERRY.nearX);
    ok("!! *** exactly halfway through the outbound travel window, exactly halfway between nearX and farX ***",
       Math.abs(at(FERRY.dockTime + FERRY.travelTime / 2) - (FERRY.nearX + FERRY.farX) / 2) < 1e-9,
       `got ${at(FERRY.dockTime + FERRY.travelTime / 2)}`);
    ok("  arrives at farX exactly at dockTime+travelTime", at(FERRY.dockTime + FERRY.travelTime) === FERRY.farX);
    ok("  docked at farX through the return dock window", at(FERRY.dockTime + FERRY.travelTime + 0.01) === FERRY.farX);
    ok("!! *** the return trip is the mirror of the outbound one -- halfway back is the SAME midpoint ***",
       Math.abs(at(2 * FERRY.dockTime + FERRY.travelTime + FERRY.travelTime / 2) - (FERRY.nearX + FERRY.farX) / 2) < 1e-9);
    ok("  periodic: one full cycle later is the same position", Math.abs(at(2.3) - at(2.3 + FERRY_CYCLE)) < 1e-9);
    ok("  the ferry never rotates", JSON.stringify(ferryTransformAt(3.7).q) === JSON.stringify([0, 0, 0, 1]));
}

// independent of platformCarryWorld's own qRotate/qConj import -- a real cross-check, not a restatement.
// Module-level (not re-typed per section) so every section that needs it agrees on the SAME sign convention
// -- an earlier draft hand-typed a second copy inline in section 5 with the opposite sign by transcription
// error, which section 5's own check caught (a genuine test bug, not a bug in platformCarryWorld.mjs itself).
const plainRotateY = (angle, [x, y, z]) => [x * Math.cos(angle) + z * Math.sin(angle), y, -x * Math.sin(angle) + z * Math.cos(angle)];

console.log("\n2. THE TURNTABLE: A PURE Y-AXIS ROTATION, CROSS-CHECKED AGAINST PLAIN TRIG (NOT qRotate)");
{
    for (const t of [0, 1.3, Math.PI / TURNTABLE.angularSpeed, 5.9]) {
        const xform = turntableTransformAt(t);
        const testLocal = [1.7, 0, -0.4];
        const viaQuat = independentQRotate(xform.q, testLocal);
        const viaTrig = plainRotateY(TURNTABLE.angularSpeed * t, testLocal);
        const dist = Math.hypot(viaQuat[0] - viaTrig[0], viaQuat[1] - viaTrig[1], viaQuat[2] - viaTrig[2]);
        ok(`!! *** t=${t.toFixed(2)}: the quaternion this module built rotates a test point the SAME as independent plain trig ***`,
           dist < 1e-9, `quat-rotated=${JSON.stringify(viaQuat.map((v) => +v.toFixed(4)))}, trig-rotated=${JSON.stringify(viaTrig.map((v) => +v.toFixed(4)))}`);
        ok("  and the centre never moves", xform.p[0] === TURNTABLE.center[0] && xform.p[2] === TURNTABLE.center[2]);
    }
}
// A tiny local qRotate, independently written (NOT imported from capsuleCollide.mjs), purely so section 2's
// cross-check is genuinely a second implementation and not the same function compared to itself.
function independentQRotate(q, v) {
    const [qx, qy, qz, qw] = q;
    const tx = 2 * (qy * v[2] - qz * v[1]), ty = 2 * (qz * v[0] - qx * v[2]), tz = 2 * (qx * v[1] - qy * v[0]);
    return [v[0] + qw * tx + (qy * tz - qz * ty), v[1] + qw * ty + (qz * tx - qx * tz), v[2] + qw * tz + (qx * ty - qy * tx)];
}

console.log("\n3. onDeck() IS A ROTATION-AWARE LOCAL-SPACE TEST, NOT A WORLD-SPACE AABB CHECK");
{
    const world0 = buildPlatformCarryWorld();
    ok("  the centre of the docked ferry is on its own deck", onDeck([FERRY.nearX, 0, FERRY.z], world0.ferryXform, FERRY.halfExtents));
    ok("  10 units away from the ferry is not", !onDeck([FERRY.nearX + 10, 0, FERRY.z], world0.ferryXform, FERRY.halfExtents));
    ok("  a point above the deck's own vertical epsilon is not (it is above the platform, not standing on it)",
       !onDeck([FERRY.nearX, 2, FERRY.z], world0.ferryXform, FERRY.halfExtents));

    const pt = [TURNTABLE.center[0] + 3.3, TURNTABLE.center[1], TURNTABLE.center[2]];   // 3.3 > halfExtent 2.5
    const unrotated = turntableTransformAt(0);
    const rotated45 = turntableTransformAt(Math.PI / 4 / TURNTABLE.angularSpeed);
    ok("  outside the UNROTATED deck's own footprint (3.3 > half-extent 2.5)", !onDeck(pt, unrotated, TURNTABLE.halfExtents));
    ok("!! *** the SAME world point is INSIDE once the deck has rotated 45 degrees -- proves this is a real rotation-aware local test, not an axis-aligned box a rotating square would get wrong ***",
       onDeck(pt, rotated45, TURNTABLE.halfExtents));
}

console.log("\n4. platformWorldAt(t): THE COLLIDER ITSELF MOVES WITH t, THE STATIC PADS NEVER DO");
{
    for (const t of [0, 2.0, FERRY.dockTime + FERRY.travelTime / 2, 7.4]) {
        const w = platformWorldAt(t);
        ok(`  triangle count is stable across t (t=${t})`, w.triangleCount === 8, `got ${w.triangleCount}`);
        const hitStart = w.colliderBVH.raycastFirst(START_PAD.center[0], 5, START_PAD.center[2], 0, -1, 0, 10);
        const hitMid = w.colliderBVH.raycastFirst(MID_PAD.center[0], 5, MID_PAD.center[2], 0, -1, 0, 10);
        ok(`  the static start pad is present at t=${t}`, !!hitStart && Math.abs(hitStart.t - 5) < 1e-6);
        ok(`  the static mid pad is present at t=${t}`, !!hitMid && Math.abs(hitMid.t - 5) < 1e-6);
        const hitFerry = w.colliderBVH.raycastFirst(w.ferryXform.p[0], 5, w.ferryXform.p[2], 0, -1, 0, 10);
        ok(`!! *** the ferry's own collider triangles are where ferryTransformAt(t) says they are, not stuck at t=0 ***`,
           !!hitFerry && Math.abs(hitFerry.point[0] - w.ferryXform.p[0]) < 1e-6, `t=${t}, ferry x=${w.ferryXform.p[0].toFixed(3)}`);
    }
}

console.log("\n4b. platformCarryVoxelColumns(): THE STATIC PADS' VISUAL STAND-IN COVERS THEIR OWN FOOTPRINT, NOTHING ELSE");
{
    const cols = platformCarryVoxelColumns();
    const inPad = (x, z, pad) => Math.abs(x - pad.center[0]) <= pad.halfExtents[0] && Math.abs(z - pad.center[2]) <= pad.halfExtents[1];
    ok("  every column is at y=0", cols.every(([, y]) => y === 0));
    ok("!! *** every column falls inside the start pad or the mid pad -- none stray into the gap between them ***",
       cols.every(([x, , z]) => inPad(x, z, START_PAD) || inPad(x, z, MID_PAD)),
       `${cols.length} columns total`);
    ok("  no column sits in the gap's own x-range (between the pads, under the ferry's travel path)",
       cols.every(([x]) => !(x > START_PAD.center[0] + START_PAD.halfExtents[0] && x < MID_PAD.center[0] - MID_PAD.halfExtents[0])));
    const expectedCount = (2 * START_PAD.halfExtents[0]) * (2 * START_PAD.halfExtents[1]) + (2 * MID_PAD.halfExtents[0]) * (2 * MID_PAD.halfExtents[1]);
    ok("  roughly one column per unit of the two pads' combined area (integer floor/ceil rounding, not exact)",
       Math.abs(cols.length - expectedCount) <= 4, `got ${cols.length}, expected ~${expectedCount}`);
}

console.log("\n5. carryOnPlatform() ITSELF AGREES WITH AN INDEPENDENTLY-COMPUTED EXPECTED POSITION");
{
    // Ferry: pure translation, no rotation -- the expected carried position needs no trig at all, just vector
    // arithmetic independent of carryOnPlatform's own quaternion path.
    const prevF = ferryTransformAt(0), curF = ferryTransformAt(2.0);
    const riderLocalOffset = [0.6, 0, -0.3];
    const riderPos = [prevF.p[0] + riderLocalOffset[0], prevF.p[1], prevF.p[2] + riderLocalOffset[2]];
    const carried = carryOnPlatform(riderPos, prevF, curF);
    const expected = [curF.p[0] + riderLocalOffset[0], curF.p[1], curF.p[2] + riderLocalOffset[2]];
    ok("!! *** a rider's local offset on the (non-rotating) ferry is preserved exactly under a real translation ***",
       Math.hypot(carried[0] - expected[0], carried[1] - expected[1], carried[2] - expected[2]) < 1e-9,
       `carried=${JSON.stringify(carried.map((v) => +v.toFixed(4)))}, expected=${JSON.stringify(expected.map((v) => +v.toFixed(4)))}`);

    // Turntable: pure rotation about a FIXED centre -- carryOnPlatform's own two-step round trip (undo prev
    // rotation, re-apply current rotation) algebraically collapses to "rotate the original offset by the
    // DELTA angle" exactly when prevXform and curXform share one centre: R(cur)*R(-prev)*X = R(cur-prev)*X.
    // That collapse is what makes this a genuinely independent check with no quaternion machinery at all, not
    // a restatement of carryOnPlatform's own two-step -- an earlier draft rotated the ALREADY-undone local
    // offset by the delta angle AGAIN (composing R(delta) with R(-prev) instead of cancelling it), which is
    // simply the wrong quantity; this check caught that as a real mismatch, not a rounding one.
    const prevT = turntableTransformAt(0.4), curT = turntableTransformAt(3.1);
    const riderWorldPos = [TURNTABLE.center[0] + 1.2, 0, TURNTABLE.center[2] + 0.5];
    const carriedT = carryOnPlatform(riderWorldPos, prevT, curT);
    const deltaAngle = TURNTABLE.angularSpeed * (3.1 - 0.4);
    const offset = [riderWorldPos[0] - prevT.p[0], 0, riderWorldPos[2] - prevT.p[2]];
    const rotatedOffset = plainRotateY(deltaAngle, offset);
    const expectedT = [curT.p[0] + rotatedOffset[0], curT.p[1], curT.p[2] + rotatedOffset[2]];
    ok("!! *** a rider's world position under a real rotation delta matches an independently-derived expectation ***",
       Math.hypot(carriedT[0] - expectedT[0], carriedT[1] - expectedT[1], carriedT[2] - expectedT[2]) < 1e-6,
       `carried=${JSON.stringify(carriedT.map((v) => +v.toFixed(4)))}, expected=${JSON.stringify(expectedT.map((v) => +v.toFixed(4)))}`);
}

function freshCamera(world) {
    const c = Object.create(Camera.prototype);
    // Unlike splatWalkWorld-selfcheck.mjs's own freshCamera(), this module's SPAWN is a FEET/surface position
    // (START_PAD's own flat y=0 deck, known and exact -- there is no bumpy discretised surface here to fall
    // and settle onto), matching controllerLabWorld's SPAWN convention instead: position.y is feet + eyeHeight,
    // and the capsule starts already grounded rather than mid-air. A first draft of this file copied
    // splatWalkWorld's "SPAWN.y is the eye height directly" convention verbatim without adjusting for that
    // difference, which put the capsule's feet 1.7 units below the pad at spawn -- entirely below the floor
    // quad's own query box, so depenetrateCapsule found nothing to resolve against and it fell forever. Section
    // 6 below is what caught it.
    c.position = { x: SPAWN.x, y: SPAWN.y + 1.7, z: SPAWN.z };
    c.yaw = SPAWN.yaw; c.pitch = 0;
    c.velocity = { x: 0, y: 0, z: 0 };
    c.keys = new Set();
    c._extMove = null;
    c.playerEnergy = null;
    c._sprinting = false;
    c.mode = "fp";
    c.viewMode = "first";
    c.world = world;
    c._fpVelY = 0;
    c._fpOnGround = true;
    c._eyeHeight = 1.7;
    c._fpWalkSpeed = 5;
    c._fpSprintSpeed = 9;
    c._fpJumpVel = 7.5;
    c._gravity = 18;
    c._fpMaxSlopeDeg = 50;
    c._capsuleRadius = 0.4;
    c._capsuleHeight = 1.8;
    c._fpFallStartTime = 0;
    return c;
}

// The exact per-frame recipe main.js's "platform_carry" demo tick() runs: carry against whichever platform's
// PREVIOUS transform the rider is currently on (feet, while grounded), advance time, rebuild the collider at
// the new time, then let camera.js's own unmodified _moveFP do gravity/input/depenetration as always.
function stepWorld(camera, state, dt) {
    if (camera._fpOnGround) {
        const feet = [camera.position.x, camera.position.y - camera._eyeHeight, camera.position.z];
        let xform = null, half = null;
        if (onDeck(feet, state.ferryXform, FERRY.halfExtents)) { xform = state.ferryXform; half = FERRY.halfExtents; }
        else if (onDeck(feet, state.turntableXform, TURNTABLE.halfExtents)) { xform = state.turntableXform; half = TURNTABLE.halfExtents; }
        if (xform) {
            const nextXform = xform === state.ferryXform ? ferryTransformAt(state.time + dt) : turntableTransformAt(state.time + dt);
            const carried = carryOnPlatform(feet, xform, nextXform);
            camera.position.x = carried[0];
            camera.position.y = carried[1] + camera._eyeHeight;
            camera.position.z = carried[2];
        }
    }
    state.time += dt;
    const w = platformWorldAt(state.time);
    camera.world = { colliderBVH: w.colliderBVH };
    state.ferryXform = w.ferryXform;
    state.turntableXform = w.turntableXform;
    camera._moveFP(dt);
}

console.log("\n6. A REAL CAMERA ACTUALLY RIDES THE FERRY ACROSS THE GAP -- NOT LEFT BEHIND, NOT DROPPED IN");
{
    const world0 = buildPlatformCarryWorld();
    const camera = freshCamera({ colliderBVH: world0.colliderBVH });
    const state = { time: 0, ferryXform: world0.ferryXform, turntableXform: world0.turntableXform };
    for (let i = 0; i < 60; i++) stepWorld(camera, state, 1 / 60);   // settle onto the start pad
    ok("  settled grounded on the start pad", camera._fpOnGround === true, `y=${camera.position.y}`);

    // Walk onto the docked ferry (still well within its 1.5s dockTime window), THEN STOP -- exactly what a
    // sensible rider of a ferry only 3 units wide does, and exactly the same "stand still and get carried"
    // shape section 7 already uses for the turntable. A first draft of this section held KeyW the whole way
    // across instead: at 5 u/s on a 3-unit-wide deck, that walks a rider off the ferry's own LEADING edge
    // (into the gap ahead of wherever the ferry currently is) well before the ferry finishes crossing -- a
    // real consequence of walk-speed-vs-deck-size-vs-travel-time, not a carryOnPlatform bug, confirmed by
    // instrumented tracing before rewriting this section rather than assumed.
    camera.keys.add("KeyW");
    for (let i = 0; i < 60; i++) stepWorld(camera, state, 1 / 60);   // ~1s at 5 u/s -- onto the deck, still docked
    camera.keys.delete("KeyW");
    const onFerryAfterBoarding = onDeck([camera.position.x, camera.position.y - camera._eyeHeight, camera.position.z], state.ferryXform, FERRY.halfExtents);
    ok("  boarded the ferry while it was still docked", onFerryAfterBoarding === true && camera._fpOnGround === true);

    let minY = Infinity;
    const rideFrames = Math.ceil((FERRY.dockTime + FERRY.travelTime + 1) * 60);   // ride it all the way to the far dock
    for (let i = 0; i < rideFrames; i++) {
        stepWorld(camera, state, 1 / 60);   // no input at all -- purely carried, same as section 7's turntable
        minY = Math.min(minY, camera.position.y);
        if (camera.position.y - camera._eyeHeight < RESPAWN_Y) break;
    }
    ok("!! *** never fell anywhere near the respawn floor while being carried, hands off the controls -- the ferry did the crossing, the gap did not ***",
       minY - camera._eyeHeight > RESPAWN_Y + 3, `min feet y=${(minY - camera._eyeHeight).toFixed(3)}, respawn=${RESPAWN_Y}`);
    ok("!! *** ended up past the gap, on the far side (x beyond the ferry's own near dock) ***",
       camera.position.x > FERRY.nearX + 2, `final x=${camera.position.x.toFixed(3)}`);
}

console.log("\n7. A REAL CAMERA STANDING STILL ON THE TURNTABLE GETS SWEPT AROUND IT, NOT LEFT IN PLACE OR FLUNG OFF");
{
    // Spawn already on the turntable, off-centre, so no walking is needed -- isolates the rotation-carry
    // behaviour from the walk/ferry behaviour section 6 already covered.
    const t0 = 0;
    const xform0 = turntableTransformAt(t0);
    const startWorld = TURNTABLE.center[0] + 1.3;   // 1.3 units off-centre -- inside halfExtents, off the axis
    const world0 = platformWorldAt(t0);
    const camera = freshCamera({ colliderBVH: world0.colliderBVH });
    camera.position.x = startWorld; camera.position.y = camera._eyeHeight; camera.position.z = TURNTABLE.center[2];
    const state = { time: t0, ferryXform: world0.ferryXform, turntableXform: world0.turntableXform };
    for (let i = 0; i < 30; i++) stepWorld(camera, state, 1 / 60);   // settle onto the deck
    ok("  settled grounded on the turntable", camera._fpOnGround === true);

    const distAtStart = Math.hypot(camera.position.x - TURNTABLE.center[0], camera.position.z - TURNTABLE.center[2]);
    let minDist = Infinity, maxDist = -Infinity, moved = false;
    const x0 = camera.position.x, z0 = camera.position.z;
    for (let i = 0; i < 300; i++) {   // no input keys -- any movement is purely the platform carrying the rider
        stepWorld(camera, state, 1 / 60);
        const d = Math.hypot(camera.position.x - TURNTABLE.center[0], camera.position.z - TURNTABLE.center[2]);
        minDist = Math.min(minDist, d); maxDist = Math.max(maxDist, d);
        if (Math.hypot(camera.position.x - x0, camera.position.z - z0) > 0.3) moved = true;
    }
    ok("!! *** with no input at all, the rider's world position actually moved -- genuinely carried, not stationary ***", moved);
    ok("!! *** distance from the turntable's own centre stayed roughly constant throughout -- an orbit, not a drift or a fling-off ***",
       Math.abs(maxDist - minDist) < 0.6 && Math.abs(minDist - distAtStart) < 0.6,
       `distance ranged ${minDist.toFixed(3)}..${maxDist.toFixed(3)}, started at ${distAtStart.toFixed(3)}`);
}

console.log();
if (fails) { console.log("[platformCarryWorld-selfcheck] FAILED " + fails); process.exit(1); }
console.log("[platformCarryWorld-selfcheck] all passed");
