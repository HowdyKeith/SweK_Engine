#!/usr/bin/env node
// WebGLEngine/tools/ship/pageShot-selfcheck.mjs -- v4739
//
// GRADES tools/ship/pageShot.mjs: a three.js page shot on WebGPU, presented, on this box. fsr-three.html in its FSR2 mode
// under PRESENT_ARGS must say it is on WebGPU, raise no error, and paint its canvas -- the decoded screenshot's canvas area
// holds hundreds of colours, most of it off the canvas's own background -- and the same page under LAUNCH_ARGS, the flags
// every other gate runs with, is the CONTROL: there the device is lost on the presented pass and the canvas stays blank.
// tools/ship/devicePresent-selfcheck.mjs holds the presentation itself to a known pattern, byte for byte; this holds the
// tool to a real page.
"use strict";
import { shootPage } from "./pageShot.mjs";
import { PRESENT_ARGS, LAUNCH_ARGS, webgpuSkipReason } from "./webgpuHarness.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
// *** THE CANVAS WHERE IT IS, NOT WHERE IT WAS (v4766). *** This read a fixed box, "the canvas sits at (16, 175) in a 1000 x 660
// viewport". v4756 added a control to fsr-three.html, the controls wrapped, the canvas moved down, and the box fell on the
// control text: the CONTROL row read 325 colours and went red -- unseen, as a 12-second gate the verify's quick sweep does not
// run -- and the PRESENTED row passed on text. Bisected to v4756's commit, and deterministic there. Now the box is the canvas's
// own, as the page lays it out (shootPage's boxSelector), inset, in a viewport tall enough to hold all of it.
const inside = (b, img) => { const x = Math.max(0, b.x + 40), y = Math.max(0, b.y + 40);
    return { x, y, w: Math.min(img.width, b.x + b.w - 40) - x, h: Math.min(img.height, b.y + b.h - 40) - y }; };
function paint(img, BOX) {
    const { width, channels, data } = img, bg = [data[(BOX.y * width + BOX.x) * channels], data[(BOX.y * width + BOX.x) * channels + 1], data[(BOX.y * width + BOX.x) * channels + 2]];
    const colours = new Set(); let off = 0, n = 0;
    for (let y = BOX.y; y < BOX.y + BOX.h; y += 2) for (let x = BOX.x; x < BOX.x + BOX.w; x += 2) {
        const o = (y * width + x) * channels, c = [data[o], data[o + 1], data[o + 2]]; n++;
        colours.add(c.join(",")); if (Math.max(...c.map((v, i) => Math.abs(v - bg[i]))) > 24) off++;
    }
    return { colours: colours.size, offFraction: off / n };
}

// *** v4914 -- THE SAME LOSS, IN THE WORDS THIS BOX USES. *** The control asked for "Device Lost" or "Instance reference" among
// the page's errors. On linux-x64-4c-16gb-142c0d today (Chrome for Testing 153.0.8010.12, headless shell 1243) the control's
// canvas is as blank as it ever was -- 1 colour, 0% off the background -- and the errors read "Instance dropped in
// popErrorScope", twice, then createBuffer refusing 48 bytes: the instance behind the device is gone, said by whichever call
// noticed first. The record's last reading, 2026-10-25, was green; v4914's rotation returned the row red, unseen until then
// because a 13-second gate is in no quick sweep. It is not the page: fsr-three.html as it stood before its one change since
// (0c17879c8) raises the same three errors here. And tools/ship/devicePresent-selfcheck.mjs, which listens on device.lost
// instead, reads "Device was destroyed." on this box and already accepted that wording. So the pattern gains "Instance
// dropped" and nothing else moves: the blank canvas is still required, and a control whose errors do not arrive is still red.
// *** AND v4739's OWN SABOTAGE P6 IS 0 RED HERE, WHICH IS A FINDING ABOUT THE BOX AND NOT A PASS. *** P6 filters the CONSOLE
// channel. On this box all three errors arrive as PAGE errors (unhandled rejections) and none on the console, so silencing
// the console silences nothing and the control stays green on what the other channel carried. Silence the page-error channel
// (P6b) and the row is red. The row reads both channels, so it holds either way; the log below says which one did the work.
const LOST = /Device Lost|Instance reference|Instance dropped/i;

console.log("\n1. fsr-three.html, FSR2, on WebGPU -- PRESENTED, and against the flags that cannot present");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else if (process.platform !== "linux") console.log("  ----  PRESENT_ARGS was measured on Linux only; nothing new to shoot here");
else {
    const shot = (launchArgs) => shootPage({ page: "fsr-three.html", selects: [["#scale", "2"], ["#mode", "fsr2"]], waitMs: 3000, startMs: 1500, launchArgs,
                                             viewport: { width: 1000, height: 1100 }, boxSelector: "#view" });
    const a = await shot(PRESENT_ARGS), b = await shot(LAUNCH_ARGS);
    ok(`the canvas was found and is on screen in both shots: ${JSON.stringify(a.box)}, ${JSON.stringify(b.box)}`,
       !!a.box && !!b.box && a.box.w > 400 && a.box.y + a.box.h <= a.image.height && b.box.y + b.box.h <= b.image.height);
    const pa = paint(a.image, inside(a.box || { x: 0, y: 0, w: 0, h: 0 }, a.image)), pb = paint(b.image, inside(b.box || { x: 0, y: 0, w: 0, h: 0 }, b.image));
    ok(`*** under PRESENT_ARGS the page runs on WebGPU with no error and PAINTS its canvas -- ${pa.colours} colours in the canvas box, ${(pa.offFraction * 100).toFixed(0)}% of it off the background ***`,
       /on WebGPU \| fsr2 \|/.test(a.status || "") && a.errors.length === 0 && pa.colours > 200 && pa.offFraction > 0.2, `status: ${a.status}; errors: ${a.errors.join(" | ") || "none"}`);
    ok(`*** and under LAUNCH_ARGS -- the CONTROL -- the same page on the same backend paints nothing: ${pb.colours} colour(s), ${(pb.offFraction * 100).toFixed(0)}% off the background, and the device is lost ***`,
       pb.colours < 5 && pb.offFraction < 0.01 && b.errors.some((e) => LOST.test(e)), `status: ${b.status}; errors: ${b.errors.slice(0, 1).join(" | ").replace(/\s+/g, " ").slice(0, 120)}`);
}

// ---- v4739 SABOTAGE LOG ----------------------------------------------------------------------------------------
//   P1 PRESENT_ARGS without --use-angle=swiftshader (tools/ship/webgpuHarness.mjs)  -> 1 here, 2 in devicePresent-selfcheck
//   P3 the shot ignores its launch flags                                            -> 1
//   P4 the selects never applied                                                    -> 1
//   P5 the swizzle workaround not installed                                         -> 2 (the page does not start at all)
//   P6 every console error filtered, not only 404s                                  -> 1 (the control can no longer see its lost device)
//   v4766: P7 shootPage reporting no box for the canvas                             -> 3
//   v4914, on linux-x64-4c-16gb-142c0d, with "Instance dropped" in the pattern:
//          P6 again, exactly as above (console errors filtered)                     -> 0: the loss is a PAGE error on this box
//          P6b the page-error channel silenced instead                              -> 1, the control ("errors:" reads empty)
//          P6c both channels silenced                                               -> 1, the control
//          P8 the control shot under PRESENT_ARGS, a device that presents            -> 1, the control (26006 colours, 50% off)
//          P9 the pattern back to its two v4739 wordings (this box, today)           -> 1, the control: the red the rotation found
// And P2, against render/devicePresent.mjs: the compositor copy put back after an awaited read -> 1 in devicePresent-selfcheck,
// on two runs of two -- the race it lost before the fix, it loses reliably at this size.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: PRESENT_ARGS off Linux (measured nowhere else); a real GPU's compositor, which the rig answers; and whether a " +
    "page's pixels are RIGHT -- this proves they are presented, and each page's own gates hold what they compute.");
process.exitCode = fails ? 1 : 0;
