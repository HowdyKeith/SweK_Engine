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
// the canvas sits at (16, 175) in a 1000 x 660 viewport on fsr-three.html; a box well inside it
const BOX = { x: 120, y: 260, w: 760, h: 380 };
function paint(img) {
    const { width, channels, data } = img, bg = [data[(BOX.y * width + BOX.x) * channels], data[(BOX.y * width + BOX.x) * channels + 1], data[(BOX.y * width + BOX.x) * channels + 2]];
    const colours = new Set(); let off = 0, n = 0;
    for (let y = BOX.y; y < BOX.y + BOX.h; y += 2) for (let x = BOX.x; x < BOX.x + BOX.w; x += 2) {
        const o = (y * width + x) * channels, c = [data[o], data[o + 1], data[o + 2]]; n++;
        colours.add(c.join(",")); if (Math.max(...c.map((v, i) => Math.abs(v - bg[i]))) > 24) off++;
    }
    return { colours: colours.size, offFraction: off / n };
}

console.log("\n1. fsr-three.html, FSR2, on WebGPU -- PRESENTED, and against the flags that cannot present");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); console.log("  ----  *** NOT A PASS. ***"); fails++; }
else if (process.platform !== "linux") console.log("  ----  PRESENT_ARGS was measured on Linux only; nothing new to shoot here");
else {
    const shot = (launchArgs) => shootPage({ page: "fsr-three.html", selects: [["#scale", "2"], ["#mode", "fsr2"]], waitMs: 3000, startMs: 1500, launchArgs });
    const a = await shot(PRESENT_ARGS), b = await shot(LAUNCH_ARGS);
    const pa = paint(a.image), pb = paint(b.image);
    ok(`*** under PRESENT_ARGS the page runs on WebGPU with no error and PAINTS its canvas -- ${pa.colours} colours in the canvas box, ${(pa.offFraction * 100).toFixed(0)}% of it off the background ***`,
       /on WebGPU \| fsr2 \|/.test(a.status || "") && a.errors.length === 0 && pa.colours > 200 && pa.offFraction > 0.2, `status: ${a.status}; errors: ${a.errors.join(" | ") || "none"}`);
    ok(`*** and under LAUNCH_ARGS -- the CONTROL -- the same page on the same backend paints nothing: ${pb.colours} colour(s), ${(pb.offFraction * 100).toFixed(0)}% off the background, and the device is lost ***`,
       pb.colours < 5 && pb.offFraction < 0.01 && b.errors.some((e) => /Device Lost|Instance reference/i.test(e)), `status: ${b.status}; errors: ${b.errors.slice(0, 1).join(" | ").replace(/\s+/g, " ").slice(0, 120)}`);
}

// ---- v4739 SABOTAGE LOG ----------------------------------------------------------------------------------------
//   P1 PRESENT_ARGS without --use-angle=swiftshader (tools/ship/webgpuHarness.mjs)  -> 1 here, 2 in devicePresent-selfcheck
//   P3 the shot ignores its launch flags                                            -> 1
//   P4 the selects never applied                                                    -> 1
//   P5 the swizzle workaround not installed                                         -> 2 (the page does not start at all)
//   P6 every console error filtered, not only 404s                                  -> 1 (the control can no longer see its lost device)
// And P2, against render/devicePresent.mjs: the compositor copy put back after an awaited read -> 1 in devicePresent-selfcheck,
// on two runs of two -- the race it lost before the fix, it loses reliably at this size.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: PRESENT_ARGS off Linux (measured nowhere else); a real GPU's compositor, which the rig answers; and whether a " +
    "page's pixels are RIGHT -- this proves they are presented, and each page's own gates hold what they compute.");
process.exitCode = fails ? 1 : 0;
