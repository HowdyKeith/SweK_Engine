#!/usr/bin/env node
// tools/ship/xrStereo-selfcheck.mjs -- v4212
//
// Run: node tools/ship/xrStereo-selfcheck.mjs      (no headset, no GPU, no browser)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES engine/xrPost.mjs and engine/xrInput.mjs -- VR part two. v4179 shipped the stereo DRAW and said in
// its own comment what it was leaving: "Two eyes through a full-screen post pass is its own piece of work."
//
// *** THE POST-CHAIN FINDING IS NOT "IT DOES NOT RUN IN VR". *** It is that every UV-space effect means
// something DIFFERENT when the framebuffer holds two eyes, and each one fails in a way that renders fine and
// looks wrong. This file measures all three rather than describing them:
//   1. the 9-tap half-res blur reaches 8 FULL-RES PIXELS across the eye seam (scissoring cannot fix a READ);
//   2. `vUV - 0.5` centres the vignette ON the seam -- 0.25 in UV from each eye's real centre;
//   3. one screen-space sun position cannot serve two eyes, which is reported and NOT silently "handled".
//
// *** THE INPUT FINDING IS THAT CONTROLLER BUGS ARE EDGE BUGS, AND AN EDGE CANNOT BE SEEN IN ONE FRAME. ***
// Every input assertion below drives a SEQUENCE of frames. A test that pokes a single snapshot would pass on
// code that fires a trigger sixty times a second.
import {
    FULL_RECT, uvRectOf, rectSize, rectCentre, vignetteCentreError, eyeRectsFor, seamsOf,
    blurBleedPixels, contaminationFor, clampUVToRect, halfTexel, eyeUVToTarget, targetUVToEye,
    rectContains, postPlanFor,
} from "../../engine/xrPost.mjs";
import { XRInputTracker, applyDeadzone, deadzone1, readButtons, readAxes, BUTTON, AXIS, DEFAULT_DEADZONE }
    from "../../engine/xrInput.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
console.log("xrStereo-selfcheck -- the post chain and the controllers, in stereo, with no headset\n");

// A Quest-shaped layer: one framebuffer, two viewports side by side. These are the numbers the fixtures use
// throughout, so every measured figure below can be checked by hand against them.
const FB_W = 2064, FB_H = 2208;
const LAYER = { framebufferWidth: FB_W, framebufferHeight: FB_H };
const VIEWS = [
    { eye: "left",  viewport: { x: 0,        y: 0, width: FB_W / 2, height: FB_H } },
    { eye: "right", viewport: { x: FB_W / 2, y: 0, width: FB_W / 2, height: FB_H } },
];

// ---- 1. THE RECTS THEMSELVES ------------------------------------------------------------------------------
console.log("1. the eye rects, and the arithmetic that has to be exact before anything else can be");
{
    const rects = eyeRectsFor(VIEWS, FB_W, FB_H);
    ok("both eyes produced a rect", rects.length === 2);
    ok("the left eye occupies the left half in UV",
        near(rects[0].u0, 0) && near(rects[0].u1, 0.5) && near(rects[0].v0, 0) && near(rects[0].v1, 1),
        JSON.stringify(rects[0]));
    ok("the right eye occupies the right half", near(rects[1].u0, 0.5) && near(rects[1].u1, 1));
    ok("each eye is half the target's width and its full height",
        near(rectSize(rects[0]).w, 0.5) && near(rectSize(rects[0]).h, 1));
    ok("!! a zero-sized framebuffer yields null, not an Infinity that becomes a black eye with no error",
        uvRectOf(VIEWS[0].viewport, 0, FB_H) === null && uvRectOf(VIEWS[0].viewport, FB_W, 0) === null);
    ok("a zero-sized viewport yields null too", uvRectOf({ x: 0, y: 0, width: 0, height: 10 }, FB_W, FB_H) === null);
    ok("a missing viewport yields null rather than throwing", uvRectOf(null, FB_W, FB_H) === null);
}

// ---- 2. THE SEAM, AND THE BLUR THAT READS ACROSS IT --------------------------------------------------------
console.log("\n2. *** DEFECT 1: THE BLUR READS ACROSS THE SEAM, AND A SCISSOR CANNOT STOP A READ ***");
{
    const rects = eyeRectsFor(VIEWS, FB_W, FB_H);
    const { shared, seams } = seamsOf(rects);
    ok("the two eyes are recognised as sharing one target", shared === true);
    ok("!! there is exactly ONE seam, at the middle", seams.length === 1 && near(seams[0], 0.5),
        JSON.stringify(seams));

    // The magnitude, from the real shader's numbers: BLUR_FS is 9 taps (+/-4) and the blur runs at half res.
    ok("!! *** the blur reaches 8 FULL-RES PIXELS past the seam -- 4 taps at half resolution ***",
        blurBleedPixels(4, 2) === 8, "taps=4, downsample=2 -> " + blurBleedPixels(4, 2) + "px");
    // Stated as a function of both numbers so the figure cannot go stale silently.
    ok("...and the figure tracks the kernel, so changing either moves it",
        blurBleedPixels(8, 2) === 16 && blurBleedPixels(4, 4) === 16 && blurBleedPixels(4, 1) === 4);

    const contam = contaminationFor(rects, FB_W, { taps: 4, downsample: 2 });
    ok("!! the LEFT eye is dirty on its RIGHT edge only -- its outer edge is the texture border and is safe",
        contam[0].contaminatedPx === 8 && contam[0].edges.join(",") === "right",
        JSON.stringify(contam[0].edges));
    ok("!! the RIGHT eye is dirty on its LEFT edge only",
        contam[1].contaminatedPx === 8 && contam[1].edges.join(",") === "left",
        JSON.stringify(contam[1].edges));

    // The control: one view, no seam, nothing to clamp. A gate that reported contamination here would be
    // describing the checker rather than the frame.
    const mono = eyeRectsFor([{ viewport: { x: 0, y: 0, width: FB_W, height: FB_H } }], FB_W, FB_H);
    ok("!! *** a SINGLE-view layer has no seam and no contamination -- the finding is about stereo, not about "
       + "this checker ***",
        seamsOf(mono).seams.length === 0 && contaminationFor(mono, FB_W)[0].contaminatedPx === 0);
}

// ---- 3. THE CLAMP: every tap stays in the eye that asked for it ---------------------------------------------
console.log("\n3. the clamp, driven over the real kernel: no tap escapes its own eye");
{
    const rects = eyeRectsFor(VIEWS, FB_W, FB_H);
    const ht = halfTexel(FB_W, FB_H, 2);          // the blur runs at half res
    const left = rects[0], right = rects[1];

    // Walk the whole 9-tap kernel outward from the pixel nearest the seam, in both eyes, and assert that
    // every clamped tap is still inside its own rect. This is the property the shader must have.
    let escaped = 0, moved = 0;
    for (const r of [left, right]) {
        for (const edgeU of [r.u0 + ht.u * 0.5, r.u1 - ht.u * 0.5]) {
            for (let t = -4; t <= 4; t++) {
                const u = edgeU + t * (2 / FB_W) * 2;      // one half-res texel step, in target UV
                const c = clampUVToRect(u, 0.5, r, ht.u);
                if (!rectContains(r, c.u, c.v)) escaped++;
                if (!near(c.u, u, 1e-12)) moved++;
            }
        }
    }
    ok("!! *** not one tap of the kernel escapes its eye once clamped ***", escaped === 0, escaped + " escaped");
    ok("...and the clamp is not a no-op -- taps near the edge really were pulled back", moved > 0, moved + " taps moved");

    ok("!! the clamp insets by half a texel, so it lands on the last texel CENTRE, not on the boundary "
       + "between two texels where linear filtering would coin-flip into the other eye",
        clampUVToRect(0.9, 0.5, left, ht.u).u < left.u1 && clampUVToRect(0.9, 0.5, left, ht.u).u > left.u1 - 2 * ht.u,
        "clamped to " + clampUVToRect(0.9, 0.5, left, ht.u).u.toFixed(8) + " against an edge at " + left.u1);

    // The desktop case must be EXACTLY unchanged, or this whole round is a regression on the 99% path.
    let identical = true;
    for (let i = 0; i <= 100; i++) {
        const u = i / 100, v = 1 - i / 100;
        const c = clampUVToRect(u, v, FULL_RECT, 0);
        if (!near(c.u, u) || !near(c.v, v)) identical = false;
    }
    ok("!! *** against the FULL-FRAME rect the clamp is the identity -- the desktop path is untouched ***",
        identical);
}

// ---- 4. THE VIGNETTE ON THE SEAM ---------------------------------------------------------------------------
console.log("\n4. *** DEFECT 2: `vUV - 0.5` CENTRES THE VIGNETTE ON THE BRIDGE OF YOUR NOSE ***");
{
    const rects = eyeRectsFor(VIEWS, FB_W, FB_H);
    ok("!! *** the naive centre is 0.25 in UV from each eye's real centre -- a QUARTER of the framebuffer ***",
        near(vignetteCentreError(rects[0]), 0.25) && near(vignetteCentreError(rects[1]), 0.25),
        "left " + vignetteCentreError(rects[0]).toFixed(6) + ", right " + vignetteCentreError(rects[1]).toFixed(6));
    ok("each eye's real centre is the middle of ITS OWN half",
        near(rectCentre(rects[0]).u, 0.25) && near(rectCentre(rects[1]).u, 0.75));
    ok("!! *** on a full-frame (desktop) rect the error is EXACTLY zero -- the old formula was right there, "
       + "and stays right ***",
        vignetteCentreError(FULL_RECT) === 0);

    // The per-eye centre, expressed in the target's UV, is what the shader is handed.
    const c0 = eyeUVToTarget(0.5, 0.5, rects[0]);
    ok("mapping the eye's own centre into target UV lands on 0.25 for the left eye", near(c0.u, 0.25) && near(c0.v, 0.5));
    const back = targetUVToEye(c0.u, c0.v, rects[0]);
    ok("...and mapping it back is a round trip", near(back.u, 0.5) && near(back.v, 0.5));
    // Non-commuting check: the right eye's centre must NOT map to the left eye's.
    ok("!! the two eyes' centres are different points, which is the entire content of the defect",
        !near(eyeUVToTarget(0.5, 0.5, rects[0]).u, eyeUVToTarget(0.5, 0.5, rects[1]).u));
}

// ---- 5. THE PLAN, AND WHAT IT REFUSES TO PRETEND IT FIXED ---------------------------------------------------
console.log("\n5. *** DEFECT 3 IS REPORTED, NOT SILENTLY 'HANDLED' ***");
{
    const plan = postPlanFor(VIEWS, LAYER, { screenSpaceSources: true });
    ok("the plan carries a rect per eye", plan.perEye.length === 2);
    ok("it knows the target is shared and a clamp is required", plan.sharedTarget && plan.needsClamp);
    ok("it carries the bleed figure so the caller need not rederive it", plan.bleedPx === 8);
    ok("!! *** it WARNS about single-camera screen-space sources rather than omitting them -- a plan that "
       + "silently drops what it cannot do turns a known defect into an unknown one ***",
        plan.warnings.some((w) => /one camera|ONE camera/.test(w)), JSON.stringify(plan.warnings));
    const quiet = postPlanFor(VIEWS, LAYER, {});
    ok("...and it does NOT warn when the caller says it has no screen-space sources",
        quiet.warnings.length === 0, JSON.stringify(quiet.warnings));
    const mono = postPlanFor([VIEWS[0]], { framebufferWidth: FB_W / 2, framebufferHeight: FB_H }, { screenSpaceSources: true });
    ok("!! a one-view session needs no clamp AND raises no stereo warning", !mono.needsClamp && mono.warnings.length === 0);
}

// ---- 6. THE DEADZONE ----------------------------------------------------------------------------------------
console.log("\n6. the stick: a deadzone that is radial and rescaled, not square and stepped");
{
    ok("!! a stick resting at a real hardware value (0.05) reads EXACTLY zero -- without this the player "
       + "walks across the room on their own",
        applyDeadzone(0.05, 0.03).magnitude === 0);
    ok("full deflection still reaches 1", near(applyDeadzone(1, 0).magnitude, 1, 1e-12));
    // The radial-vs-per-axis distinction, as a case where they disagree.
    const diag = applyDeadzone(0.1, 0.1);          // magnitude 0.1414, above the 0.12 deadzone
    ok("!! *** a diagonal push of 0.1/0.1 IS live: magnitude 0.1414 clears the 0.12 deadzone, where a "
       + "per-axis deadzone would have squared off the stick and returned nothing ***",
        diag.magnitude > 0, "magnitude " + Math.hypot(0.1, 0.1).toFixed(4));
    ok("...while 0.05/0.05 (magnitude 0.0707) is correctly dead", applyDeadzone(0.05, 0.05).magnitude === 0);
    // Rescaling: just past the threshold must be near zero, not a jump to 0.12.
    const justOver = applyDeadzone(DEFAULT_DEADZONE + 1e-4, 0);
    ok("!! *** just past the threshold the output is ~0, not a JUMP to the deadzone value -- without "
       + "rescaling, slow movement is impossible ***",
        justOver.magnitude < 0.002, "magnitude " + justOver.magnitude.toExponential(2));
    ok("the direction of a deflection is preserved through the rescale",
        near(Math.atan2(applyDeadzone(0.6, 0.8).y, applyDeadzone(0.6, 0.8).x), Math.atan2(0.8, 0.6), 1e-12));
    ok("deadzone1 handles a trigger the same way, sign included",
        deadzone1(0.05) === 0 && deadzone1(-1) === -1 && near(deadzone1(0.56), (0.56 - 0.12) / 0.88, 1e-12));
    ok("the thumbstick is read from axes 2/3, not 0/1 -- an off-by-two a lot of code has",
        AXIS.STICK_X === 2 && AXIS.STICK_Y === 3 && AXIS.TOUCHPAD_X === 0);
    const ax = readAxes({ axes: [0, 0, 1, 0] });
    ok("...and reading a gamepad proves it: axes[2]=1 shows up as a full stick deflection",
        near(ax.stick.x, 1, 1e-12) && ax.stick.y === 0);
}

// ---- 7. THE EDGES, DRIVEN OVER FRAMES -----------------------------------------------------------------------
console.log("\n7. *** THE EDGE: every input assertion below drives a SEQUENCE, because one frame cannot show "
    + "an edge at all ***");
{
    // A fixture whose button objects are MUTATED in place between frames, exactly as a UA reuses them.
    const mkSrc = (handedness) => ({
        handedness, profiles: ["oculus-touch"], targetRayMode: "tracked-pointer",
        gamepad: { buttons: [{ pressed: false, touched: false, value: 0 }, { pressed: false, touched: false, value: 0 }], axes: [0, 0, 0, 0] },
    });
    const press = (s, i, v = 1) => { s.gamepad.buttons[i].pressed = true; s.gamepad.buttons[i].value = v; };
    const release = (s, i) => { s.gamepad.buttons[i].pressed = false; s.gamepad.buttons[i].value = 0; };

    const t = new XRInputTracker();
    const L = mkSrc("left"), R = mkSrc("right");

    let ev = t.update([L, R]);
    ok("frame 1: both controllers are reported added", ev.filter((e) => e.type === "added").length === 2);
    ok("...and nothing is pressed yet", ev.filter((e) => /button/.test(e.type)).length === 0);

    press(L, BUTTON.TRIGGER);
    ev = t.update([L, R]);
    ok("!! frame 2: the trigger going down reports ONE buttondown", ev.filter((e) => e.type === "buttondown").length === 1);
    ok("...and a 'select', because trigger IS select in the standard mapping",
        ev.some((e) => e.type === "select" && e.handedness === "left"));

    // THE WHOLE POINT: hold it, and nothing more is reported.
    let repeats = 0;
    for (let i = 0; i < 60; i++) repeats += t.update([L, R]).filter((e) => e.type === "buttondown").length;
    ok("!! *** HELD FOR 60 FRAMES, THE TRIGGER REPORTS NOTHING FURTHER -- `if (pressed)` would have fired 60 "
       + "times, and would have looked like it worked ***",
        repeats === 0, repeats + " spurious buttondowns");

    release(L, BUTTON.TRIGGER);
    ev = t.update([L, R]);
    ok("releasing reports exactly one buttonup", ev.filter((e) => e.type === "buttonup").length === 1);

    // TRAP 1: a controller that vanishes mid-press.
    press(R, BUTTON.SQUEEZE);
    ev = t.update([L, R]);
    ok("the right squeeze goes down", ev.some((e) => e.type === "squeeze" && e.handedness === "right"));
    ev = t.update([L]);                      // R is gone -- put down, or asleep
    const up = ev.find((e) => e.type === "buttonup");
    const rm = ev.find((e) => e.type === "removed");
    ok("!! *** A CONTROLLER THAT DISAPPEARS MID-PRESS SYNTHESISES THE RELEASE -- otherwise the button is held "
       + "for the life of the page ***",
        !!up && up.synthetic === true && up.button === BUTTON.SQUEEZE);
    ok("...and the release is reported BEFORE the removal, so a listener still knows what it refers to",
        !!up && !!rm && ev.indexOf(up) < ev.indexOf(rm));
    ok("the vanished source is dropped from the tracker", t.stats().sources === 1);

    // TRAP 2: handedness is not an identity.
    const t2 = new XRInputTracker();
    const A = mkSrc("none"), B = mkSrc("none");
    t2.update([A, B]);
    ok("!! *** TWO SOURCES BOTH REPORTING handedness 'none' STAY TWO SOURCES -- keying on handedness would "
       + "have merged two devices into one ***",
        t2.stats().sources === 2);
    press(A, BUTTON.TRIGGER);
    const ev2 = t2.update([A, B]);
    ok("...and pressing one of them fires exactly once, not twice and not zero times",
        ev2.filter((e) => e.type === "buttondown").length === 1);

    // A source REPLACED while keeping its handedness must be a new source, not a mutation of the old one.
    const t3 = new XRInputTracker();
    const first = mkSrc("left");
    t3.update([first]);
    const second = mkSrc("left");
    const ev3 = t3.update([second]);
    ok("!! a replaced controller with the SAME handedness is reported removed AND added, not silently reused",
        ev3.some((e) => e.type === "removed") && ev3.some((e) => e.type === "added") && t3.stats().sources === 1);

    // The pose is stored, never interpreted -- this module must not be able to be wrong about a matrix it
    // did not compute.
    const t4 = new XRInputTracker();
    const S = mkSrc("right");
    const fakePose = { transform: { matrix: new Float32Array(16) } };
    t4.update([S], () => fakePose);
    ok("the pose the caller read is stored verbatim", t4.get(S).pose === fakePose);
    t4.update([S], () => { throw new Error("no pose this frame"); });
    ok("!! a getPose that THROWS leaves the pose null rather than killing the frame -- tracking loss is normal",
        t4.get(S).pose === null);

    // moveVector: the locomotion path end to end.
    const t5 = new XRInputTracker();
    const M = mkSrc("left");
    M.gamepad.axes = [0, 0, 0.05, 0.03];       // resting
    t5.update([M]);
    ok("a resting stick contributes no movement", t5.moveVector("left").x === 0 && t5.moveVector("left").y === 0);
    M.gamepad.axes = [0, 0, 1, 0];
    t5.update([M]);
    ok("a full deflection does", near(t5.moveVector("left").x, 1, 1e-12));
    ok("asking for a hand that is not present returns zero, not undefined",
        t5.moveVector("right").x === 0 && t5.moveVector("right").y === 0);

    // reset, so a second session does not inherit the first one's held buttons.
    t5.reset();
    ok("reset() clears the tracker for the next session", t5.stats().sources === 0 && t5.stats().frames === 0);

    // Robustness: a source with no gamepad at all (hand tracking, gaze) must not throw.
    const t6 = new XRInputTracker();
    const gaze = { handedness: "none", targetRayMode: "gaze", profiles: [] };
    let threw = false;
    try { t6.update([gaze, null, undefined]); } catch { threw = true; }
    ok("!! a gamepad-less source (gaze / hand tracking) and null entries are handled, not thrown on",
        !threw && t6.stats().sources === 1);
    ok("readButtons of nothing is an empty list, not a crash", readButtons(null).length === 0 && readButtons({}).length === 0);
}

// ---- 8. THE THREE-BASED PAGES: setAnimationLoop REPLACES the rAF, it does not join it ----------------------
console.log("\n8. *** THE EASY HALF: the three.js pages, where the guide's answer DOES apply ***");
{
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

    // *** codeOnly, AND THAT IS LOAD-BEARING HERE. *** What is being asserted is an ABSENCE -- that no
    // converted loop still calls requestAnimationFrame -- and the comment v4212 put in each of those pages
    // NAMES requestAnimationFrame while explaining why it must not be there. Searching raw source would find
    // the prose and go red against correct code, which is exactly the mistake v4208 made in its own direction.
    const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const PAGES = ["glb_viewer.html", "scene-view.html", "aquarelle.html"];
    for (const page of PAGES) {
        const raw = fs.readFileSync(path.join(ROOT, page), "utf8");
        const code = codeOnly(raw);
        ok(page + ": reaches ui/threeVR.js", /ui\/threeVR\.js/.test(code));
        ok(page + ": !! *** its loop is installed by setAnimationLoop ***", /setAnimationLoop/.test(code));
        ok(page + ": !! *** and NO requestAnimationFrame survives -- a loop driven by both runs TWICE PER "
           + "FRAME, which on a monitor merely looks faster ***",
            !/requestAnimationFrame/.test(code),
            "raw source still mentions it " + (raw.match(/requestAnimationFrame/g) || []).length
            + " time(s), which is fine only if all of them are comments");
        // *** THE PAGE HAS DELETED ITS OWN requestAnimationFrame BY NOW, SO EVERY PATH THAT DOES NOT INSTALL
        // A LOOP IS A FROZEN PAGE. *** Two of them exist and both are checked, because the first draft of
        // this round only handled one: a THROWN import (the module 404s) and a RESOLVED call that declined to
        // install (the renderer turned out not to be a three renderer). The second does not throw, so the
        // .catch alone would not have covered it -- which made the claim in this very assertion false until
        // ui/threeVR.js started reporting loopInstalled separately from ok.
        const flat = code.replace(/\s+/g, " ");
        ok(page + ": !! a THROWN threeVR import still starts the loop", /\.catch\( *\( *\) *=> *\{ *renderer\.setAnimationLoop/.test(flat));
        ok(page + ": !! *** ...and so does a call that RESOLVES without installing one -- the path a .catch "
           + "cannot see, and the page has no rAF left to fall back on ***",
            /loopInstalled *\) *renderer\.setAnimationLoop/.test(flat), flat.slice(flat.indexOf("threeVR"), flat.indexOf("threeVR") + 260));
    }

    const { describeThreeVRSupport } = await import("../../ui/threeVR.js");
    const noXr = await describeThreeVRSupport({});
    ok("!! describeThreeVRSupport separates 'no WebXR' from 'no headset' -- one flat false would tell a "
       + "person with a headset the same thing it tells a person without a browser for it",
        noXr.kind === "no-webxr" && noXr.ok === false, JSON.stringify(noXr));
    const noDev = await describeThreeVRSupport({ xr: { isSessionSupported: async () => false } });
    ok("...and reports no-device when the browser has WebXR but nothing is plugged in", noDev.kind === "no-device");
    const ready = await describeThreeVRSupport({ xr: { isSessionSupported: async () => true } });
    ok("...and ready when a headset is reachable", ready.ok === true && ready.kind === "ready");
    const boom = await describeThreeVRSupport({ xr: { isSessionSupported: async () => { throw new Error("nope"); } } });
    ok("!! a THROWING isSessionSupported is an answer, not a crash", boom.ok === false && boom.kind === "error");

    const { enableThreeVR } = await import("../../ui/threeVR.js");
    let installed = null;
    const fakeRenderer = { xr: { enabled: false }, setAnimationLoop: (f) => { installed = f; } };
    const myLoop = () => {};
    const r = await enableThreeVR({ renderer: fakeRenderer, loop: myLoop, button: false });
    ok("!! *** the loop is installed EVEN WITH NO HEADSET -- three falls back to window rAF, so there is one "
       + "code path rather than two to keep in step ***",
        installed === myLoop && fakeRenderer.xr.enabled === true);
    ok("...and it reports honestly that VR itself is not available here", r.ok === false && !r.button);
    ok("!! *** loopInstalled is TRUE even though ok is false -- 'no headset' is not 'no loop', and conflating "
       + "them would have frozen every desktop that opened these pages ***",
        r.ok === false && r.loopInstalled === true);
    const bad = await enableThreeVR({ renderer: {}, loop: myLoop, button: false });
    ok("a renderer without setAnimationLoop is refused rather than half-configured", bad.ok === false);
    ok("!! ...and THAT case reports loopInstalled false, which is the signal the pages act on",
        bad.loopInstalled === false);
    const noLoop = await enableThreeVR({ renderer: fakeRenderer, loop: null, button: false });
    ok("...and so is a missing loop", noLoop.ok === false);
}

console.log("\nxrStereo-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
