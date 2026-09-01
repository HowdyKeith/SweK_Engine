#!/usr/bin/env node
// tools/ship/xrLocomotion-selfcheck.mjs -- v4219
//
// Run: node tools/ship/xrLocomotion-selfcheck.mjs      (pure, no GL, no headset, no navigator.xr)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES engine/xrLocomotion.mjs and XRSessionManager.applyOffset.
//
// *** THE WHOLE FEATURE IS ONE NOBODY HERE CAN RUN. *** There is no headset in this sandbox and no
// navigator.xr at all, so every check below drives the real code with injected fakes: a fake reference space
// that records what it was offset by, a fake XRRigidTransform, and hand-built head poses. That is not a
// weaker test than a headset -- it is the only way to assert the things a headset would never show you,
// like an offset being applied twice per frame rather than once.
//
// The failures this watches for are the ones that produce a session that RUNS and is wrong to be inside:
//   * full head orientation instead of yaw, and looking up flies you into the sky;
//   * a snap turn added to the yaw, and the player is swung around the origin instead of turning in place;
//   * one threshold instead of two, and holding the stick spins you at 2160 degrees a second;
//   * the offset composed onto the CURRENT space instead of the base, and the player accelerates away
//     from the world exponentially -- which looks like the tracking failing, not like a bug;
//   * an unclamped dt, and a tab-switch teleports you across the map.
import {
    DEFAULTS, quatFromYaw, yawOf, rotateY, basisFor, moveDelta, SnapTurn, offsetTransformFor, applyOffset,
    Locomotion,
} from "../../engine/xrLocomotion.mjs";
import { XRSessionManager, XR_ACTIVE } from "../../engine/xrSession.mjs";
import { codeOnly } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-12) => Math.abs(a - b) <= e;
console.log("xrLocomotion-selfcheck -- moving a player nobody here can be\n");

// A head pitched by `p` and yawed by `y`, as a quaternion. Yaw about Y, then pitch about X.
function headQuat(y, p) {
    const cy = Math.cos(y / 2), sy = Math.sin(y / 2), cp = Math.cos(p / 2), sp = Math.sin(p / 2);
    return { x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp };
}

// ---- 1. ONE ROTATION ----------------------------------------------------------------------------------------
console.log("1. *** ONE HANDEDNESS IN THE FILE -- the first draft had two and yawOf(quatFromYaw(a)) gave -a ***");
{
    let worst = 0;
    for (let a = -3.1; a < 3.1; a += 0.13) worst = Math.max(worst, Math.abs(yawOf(quatFromYaw(a)) - a));
    ok("!! quatFromYaw and yawOf round-trip exactly, over the whole circle", worst < 1e-12,
        `worst ${worst.toExponential(2)} rad`);
    const b0 = basisFor(0);
    ok("at yaw 0, forward is -Z and right is +X -- WebXR's own convention",
        near(b0.forward.x, 0) && near(b0.forward.z, -1) && near(b0.right.x, 1) && near(b0.right.z, 0),
        `forward (${b0.forward.x},${b0.forward.z}) right (${b0.right.x},${b0.right.z})`);
    // basisFor is DERIVED from rotateY, so the two cannot disagree. Asserted, not assumed.
    for (const a of [0.4, -1.9, 2.7]) {
        const b = basisFor(a), f = rotateY({ x: 0, z: -1 }, a);
        if (!near(b.forward.x, f.x) || !near(b.forward.z, f.z)) fails++;
    }
    ok("...and the basis is the rotation, not a second copy of it", true, "checked at 3 angles");
}

// ---- 2. YAW ONLY --------------------------------------------------------------------------------------------
console.log("\n2. *** YAW ONLY -- the full orientation sends you into the sky when you look up ***");
{
    const level = headQuat(0.8, 0), up = headQuat(0.8, 0.9), down = headQuat(0.8, -1.2);
    ok("!! a head pitched 51 degrees up reads the same heading as a level one",
        near(yawOf(level), yawOf(up), 1e-9), `${yawOf(level).toFixed(6)} vs ${yawOf(up).toFixed(6)}`);
    ok("...and pitched 69 degrees down, too", near(yawOf(level), yawOf(down), 1e-9));
    const a = moveDelta({ x: 0, y: -1 }, yawOf(level), { speed: 3, dt: 0.5 });
    const b = moveDelta({ x: 0, y: -1 }, yawOf(up), { speed: 3, dt: 0.5 });
    ok("!! so the movement is identical -- and it is a 2-vector, with no way to leave the floor",
        near(a.x, b.x) && near(a.z, b.z) && !("y" in a), `(${a.x.toFixed(4)}, ${a.z.toFixed(4)})`);
    // straight up: there is no heading to read, and it must not be NaN
    ok("a head looking straight up yields a finite heading rather than NaN",
        Number.isFinite(yawOf(headQuat(0, Math.PI / 2))));
}

// ---- 3. THE STICK SIGN --------------------------------------------------------------------------------------
console.log("\n3. the gamepad's Y axis is negative when pushed AWAY -- forward is -stick.y");
{
    const f = moveDelta({ x: 0, y: -1 }, 0, { speed: 2, dt: 0.5 });
    ok("!! pushing the stick forward moves the player forward (-Z at yaw 0)", f.z < 0 && near(f.x, 0),
        `(${f.x.toFixed(3)}, ${f.z.toFixed(3)})`);
    const b = moveDelta({ x: 0, y: 1 }, 0, { speed: 2, dt: 0.5 });
    ok("...and pulling it back moves back", b.z > 0);
    const r = moveDelta({ x: 1, y: 0 }, 0, { speed: 2, dt: 0.5 });
    ok("...and pushing it right moves right (+X at yaw 0)", r.x > 0 && near(r.z, 0));
    ok("speed is metres per second: full stick for 0.5 s at 2 m/s is 1 m", near(Math.abs(f.z), 1, 1e-9),
        `${Math.abs(f.z).toFixed(6)} m`);
    const dead = moveDelta({ x: 0.05, y: 0.05 }, 0, { speed: 2, dt: 0.5 });
    ok("a stick inside the deadzone moves nothing -- a resting thumb must not drift the player",
        near(dead.x, 0) && near(dead.z, 0), `deadzone ${DEFAULTS.deadzone}`);
}

// ---- 4. SNAP TURN HYSTERESIS --------------------------------------------------------------------------------
console.log("\n4. *** ONE PUSH IS ONE TURN -- a single threshold spins you at 2160 degrees a second ***");
{
    const s = new SnapTurn();
    const held = [];
    for (let i = 0; i < 30; i++) held.push(s.update(1));
    const turnsWhileHeld = held.filter((d) => d !== 0).length;
    ok("!! holding the stick hard right for 30 frames turns EXACTLY ONCE", turnsWhileHeld === 1,
        `${turnsWhileHeld} turn(s); a threshold-only version gives 30 (${30 * DEFAULTS.snapDegrees} degrees)`);
    ok("...and the one turn is the configured step, in the pushed direction", held[0] === DEFAULTS.snapDegrees);
    // releasing only part-way must NOT re-arm
    ok("returning to just above the release threshold does NOT re-arm",
        s.update((DEFAULTS.snapRelease + DEFAULTS.snapThreshold) / 2) === 0 && s.update(1) === 0);
    ok("!! coming back inside the release threshold re-arms it",
        s.update(0) === 0 && s.update(1) === DEFAULTS.snapDegrees);
    ok("the release threshold is BELOW the trigger, which is what makes it hysteresis",
        DEFAULTS.snapRelease < DEFAULTS.snapThreshold, `${DEFAULTS.snapRelease} < ${DEFAULTS.snapThreshold}`);
    const l = new SnapTurn(); l.update(-1);
    ok("pushing left turns the other way", l.turns === 1);
}

// ---- 5. THE SNAP PIVOTS ABOUT THE HEAD ----------------------------------------------------------------------
console.log("\n5. *** TURNING HAPPENS ABOUT THE HEAD -- about the origin, it SHOVES you sideways ***");
{
    const head = { x: 2, y: 1.6, z: -1 };
    const worldOf = (L) => { const r = rotateY(head, L.yaw); return { x: r.x + L.x, z: r.z + L.z }; };
    const L = new Locomotion();
    const before = worldOf(L);
    let turns = 0;
    for (let i = 0; i < 12; i++) { const st = L.update({ turnStick: i % 2 ? 0 : 1, headPos: head, dt: 1 / 72 }); if (st.turned) turns++; }
    const after = worldOf(L);
    const drift = Math.hypot(after.x - before.x, after.z - before.z);
    ok("!! after " + turns + " snap turns the head is where it started, to the micrometre", drift < 1e-9,
        `drift ${drift.toExponential(2)} m over ${(turns * DEFAULTS.snapDegrees)} degrees`);
    // and what the naive version would have cost, measured rather than asserted
    const naiveYaw = turns * DEFAULTS.snapDegrees * Math.PI / 180;
    const naive = rotateY(head, naiveYaw);
    const naiveDrift = Math.hypot(naive.x - head.x, naive.z - head.z);
    ok("...where `yaw += a` alone would have thrown it " + naiveDrift.toFixed(2) + " m", naiveDrift > 1,
        `radius |head| = ${Math.hypot(head.x, head.z).toFixed(2)} m`);
}

// ---- 6. THE dt CLAMP ----------------------------------------------------------------------------------------
console.log("\n6. a dropped frame must not teleport the player");
{
    const L = new Locomotion();
    L.update({ moveStick: { x: 0, y: -1 }, dt: 5 });            // a five-second stall
    const far = Math.hypot(L.x, L.z);
    ok("!! a 5 s frame gap moves at most maxDt worth, not 5 s worth",
        far <= DEFAULTS.speed * DEFAULTS.maxDt + 1e-9,
        `${far.toFixed(3)} m, capped at ${(DEFAULTS.speed * DEFAULTS.maxDt).toFixed(3)} m (unclamped: ${(DEFAULTS.speed * 5).toFixed(1)} m)`);
    const N = new Locomotion();
    N.update({ moveStick: { x: 0, y: -1 }, dt: -3 });
    ok("...and a negative dt moves nothing rather than backwards", near(N.x, 0) && near(N.z, 0));
}

// ---- 7. THE OFFSET IS THE INVERSE OF THE PLAYER POSE ---------------------------------------------------------
console.log("\n7. *** THE OFFSET IS THE PLAYER'S POSE INVERTED, asserted by its invariant, not by the derivation ***");
{
    let worst = 0;
    for (const pose of [{ x: 3, y: 0, z: -2, yaw: 0.7 }, { x: -5, y: 1.6, z: 8, yaw: -2.3 },
                        { x: 0, y: 0, z: 0, yaw: 0 }, { x: 0.5, y: -0.2, z: 0.5, yaw: Math.PI }]) {
        const o = applyOffset(offsetTransformFor(pose), pose);
        worst = Math.max(worst, Math.hypot(o.x, o.y, o.z));
    }
    ok("!! applying the offset to the player's own world position lands exactly on the origin", worst < 1e-12,
        `worst ${worst.toExponential(2)} m`);
    const t = offsetTransformFor({ x: 0, y: 0, z: 0, yaw: 0 });
    ok("a player who has not moved produces the identity offset",
        near(t.position.x, 0) && near(t.position.z, 0) && near(t.orientation.w, 1));
}

// ---- 8. A SESSION NOBODY HERE CAN RUN ------------------------------------------------------------------------
console.log("\n8. *** THE HEADSET NOBODY HERE HAS: the whole lifecycle, on injected fakes ***");
{
    // A reference space that records the chain it was built from, so double-application is VISIBLE.
    let spaceId = 0;
    const makeSpace = (parent, transform) => ({
        id: ++spaceId, parent, transform,
        depth: parent ? parent.depth + 1 : 0,
        getOffsetReferenceSpace(t) { return makeSpace(this, t); },
    });
    const base = makeSpace(null, null);
    class FakeRigidTransform { constructor(position, orientation) { this.position = position; this.orientation = orientation; } }
    const session = {
        inputSources: [],
        addEventListener() {},
        requestReferenceSpace: async () => base,
        end: async () => {},
    };
    const xr = new XRSessionManager({ requestSession: async () => session });
    const entered = await xr.enter();
    ok("the manager enters a session and takes a reference space", entered.ok && xr.state === XR_ACTIVE);
    ok("!! it keeps the BASE space as well as the current one", xr.baseRefSpace === base && xr.refSpace === base);

    const L = new Locomotion();
    for (let i = 0; i < 120; i++) {
        const st = L.update({ moveStick: { x: 0, y: -1 }, headQuat: quatFromYaw(0), dt: 1 / 60 });
        if (st.moved || st.turned) xr.applyOffset(st.transform, FakeRigidTransform);
    }
    ok("!! after 120 frames the space is ONE offset from base, not 120 -- the compounding bug",
        xr.refSpace.depth === 1 && xr.refSpace.parent === base, `depth ${xr.refSpace.depth}`);
    // 120 frames at 1/60 s and 2.5 m/s is 5 m forward, and the offset carries the player back to the origin
    const walked = Math.hypot(L.x, L.z);
    ok("...and the player has walked the distance the speed says", near(walked, DEFAULTS.speed * 2, 1e-9),
        `${walked.toFixed(4)} m in 2.0 s at ${DEFAULTS.speed} m/s`);
    const landed = applyOffset(xr.refSpace.transform, L.pose());
    ok("!! the offset the runtime was handed puts the walked player back at the origin",
        Math.hypot(landed.x, landed.z) < 1e-9, `${Math.hypot(landed.x, landed.z).toExponential(2)} m`);

    // it must refuse rather than throw when the pieces are missing -- a headset is not always there
    ok("applyOffset with no XRRigidTransform constructor returns false rather than throwing",
        xr.applyOffset(offsetTransformFor(L.pose()), null) === false);
    await xr.exit();
    ok("!! leaving VR drops BOTH spaces, so a stale base cannot outlive the session",
        xr.refSpace === null && xr.baseRefSpace === null);
}

// ---- 9. IT IS ACTUALLY WIRED ---------------------------------------------------------------------------------
console.log("\n9. *** WIRED, WHICH IS THE ENTIRE POINT: v4212 read the sticks and nothing consumed them ***");
{
    // *** THE TREE'S OWN SCANNER, NOT A HAND-ROLLED ONE. *** The first draft of this section stripped block
    // comments with a lazy /\*...\*/ over 30,000 lines of main.js, which eats from the first `/*` INSIDE A
    // STRING to the next `*/` anywhere after it -- and it silently swallowed the very import line below, so
    // this check failed against a file that was correctly wired. That is commentFalsePass's whole subject.
    const code = codeOnly(fs.readFileSync(path.join(ROOT, "main.js"), "utf8"));
    ok("!! main.js imports the locomotion module", /import \{ Locomotion \} from/.test(code));
    ok("!! and something finally CONSUMES moveVector()", /moveVector\(/.test(code),
        (code.match(/moveVector\(/g) || []).length + " call site(s)");
    ok("...both sticks: one walks, one turns",
        /moveStick:\s*xrInput\.moveVector/.test(code) && /turnStick:\s*xrInput\.moveVector/.test(code));
    // *** SCOPED TO THE XR FRAME, BRACE-MATCHED. *** The first version of this check asked that NOWHERE in
    // main.js moves a camera, which is 30,000 lines containing a perfectly legitimate non-VR flycam -- it
    // failed against correct code. And it is brace-matched rather than sliced at a flat character count,
    // which is the defect v4179's own gate shipped and v4212 had to rewrite.
    const at = code.indexOf("function _renderXRFrame");
    let body = "";
    if (at >= 0) {
        let i = code.indexOf("{", at), depth = 0;
        for (let j = i; j < code.length; j++) {
            if (code[j] === "{") depth++;
            else if (code[j] === "}") { depth--; if (depth === 0) { body = code.slice(i, j + 1); break; } }
        }
    }
    ok("the XR frame function was found and brace-matched", body.length > 500, body.length + " chars");
    ok("!! inside the XR frame, the REFERENCE SPACE is what moves -- the camera is never written",
        /xr\.applyOffset\(/.test(body) && !/camera\.position/.test(body));
    ok("...and the locomotion step runs BEFORE the draw, so this frame's views come from the new space",
        body.indexOf("applyOffset") < body.indexOf("getVisibleChunks"));
    // splat_viewer was the one three-based page left without VR
    for (const page of ["splat_viewer.html", "glb_viewer.html", "scene-view.html", "aquarelle.html"]) {
        const src = fs.readFileSync(path.join(ROOT, page), "utf8");
        ok("  " + page + " offers VR", /enableThreeVR/.test(src));
    }
    const splat = fs.readFileSync(path.join(ROOT, "splat_viewer.html"), "utf8");
    ok("!! ...and installs its loop ONCE -- threeVR's setAnimationLoop REPLACES the rAF, it does not join it",
        (splat.match(/setAnimationLoop\(/g) || []).length === 2 && /loopInstalled/.test(splat),
        "two fallback installers, both guarded on loopInstalled");
}

// ---- 10. THE MODULE STAYS PURE -------------------------------------------------------------------------------
console.log("\n10. it computes a transform and touches no session of its own");
{
    const code = codeOnly(fs.readFileSync(path.join(ROOT, "engine", "xrLocomotion.mjs"), "utf8"));
    ok("it never touches navigator, a session or a reference space itself",
        !/navigator|requestReferenceSpace|getOffsetReferenceSpace|XRRigidTransform/.test(code));
    ok("!! the deadzone is IMPORTED from engine/xrInput.mjs, not restated",
        /import \{[^}]*applyDeadzone[^}]*\} from/.test(code) && !/Math\.hypot\(x, y\)\s*<\s*dead/.test(code));
    ok("!! there is exactly ONE sin/cos rotation pair in the file", 
        (code.match(/Math\.sin\(a\), c = Math\.cos\(a\)/g) || []).length === 1);
    ok("it holds no timer and no frame loop", !/requestAnimationFrame|setInterval|setTimeout/.test(code));
}

// ---- WHAT THIS DOES NOT CLAIM ------------------------------------------------------------------------------
console.log("\n----  WHAT THIS DOES NOT CLAIM, AND IT IS THE LIMIT THAT MATTERS MOST");
console.log("      THAT ANY OF THIS FEELS RIGHT IN A HEADSET. Comfort is the whole subject of locomotion design");
console.log("      and it is not decidable from here: whether 30 degrees is the right snap step, whether 2.5 m/s");
console.log("      induces sickness, and whether head-relative beats controller-relative are questions for a");
console.log("      person wearing the thing. What is asserted above is that the MATHS is self-consistent and");
console.log("      that the wiring exists -- not that the result is pleasant.");
console.log("      MEASURED IN THIS SANDBOX, so the absence is not mistaken for coverage: there is no");
console.log("      navigator.xr, so no page here adds an Enter VR button and section 9 checks the CALL, not the");
console.log("      button; and vendor/spark/spark.module.js is absent, so splat_viewer.html reports \"renderer");
console.log("      unavailable\" and never reaches the loop this round wired. glb_viewer.html, wired at v4212,");
console.log("      loads fine on the same box -- so that is Spark being unvendored here, not this change.");

console.log("\nxrLocomotion-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
