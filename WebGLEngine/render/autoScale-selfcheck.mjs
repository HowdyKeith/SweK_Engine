// WebGLEngine/render/autoScale-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/autoScale-selfcheck.mjs      (milliseconds: pure)
//
// GATES render/autoScale.mjs, the rule behind snow-gpu.html's auto render scale: cool-down, mean over a window, a step down by 0.85, a floor at 0.4, never up, one stall is not a trend. The page wiring is checked here by its
// text and live by render/snowGpuLive-selfcheck.mjs (the page loads with ?scale=auto and its slider is moved at run time).
//
// SABOTAGES, RESULTS BY NAME (each against render/autoScale.mjs, this gate run, restored identical):
//   S1 the cool-down skipped (the first frames count)                           -> 4 RED: the cool-down row, the window row, the cool-down-restarts row and the Intel fixed-point row
//   S2 the scale may rise when the frame is fast                               -> 1 RED: the never-up row
//   S3 the step is 0.85 but the floor is ignored                                -> 1 RED: the floor row
//   S4 a frame sample is not capped (one 5 s stall counts as 5000 ms)          -> 1 RED: the stall row
//   S5 the mean replaced by the last sample                                    -> 1 RED: the 10-and-30 row (the mean-30 row passes: its last sample is 50)
// And against snow-gpu.html, in render/snowGpuScale-selfcheck.mjs: P1 the page ignoring ?scale -> 2 RED; P2 the slider's handler not rebuilding -> 1 RED; P3 ?scale=auto not ticking the box -> 1 RED.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTO, autoStart, autoStep, settle } from "./autoScale.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const feed = (s, ms, n) => { for (let i = 0; i < n; i++) s = autoStep(s, ms); return s; };

console.log("autoScale-selfcheck -- the rule that lowers the render scale on a slow box\n");
{
    const s0 = autoStart(1);
    ok("the cool-down: for " + AUTO.cooldown + " frames nothing is sampled, however slow they are (shader compile and the GPU's clock ramp are not a trend)", feed(s0, 90, AUTO.cooldown).scale === 1 && feed(s0, 90, AUTO.cooldown).n === 0 && feed(s0, 90, AUTO.cooldown).cool === 0);
    const a = feed(s0, 90, AUTO.cooldown + AUTO.window - 1), b = autoStep(a, 90);
    ok("after the cool-down it takes " + AUTO.window + " frames: at 90 ms the scale is still 1 on the frame before the window closes and drops to 0.85 on the window's last frame", a.scale === 1 && b.changed === true && b.scale === 0.85, `scale ${a.scale} then ${b.scale}`);
    ok("and the cool-down starts again after a drop (the frames at the new size are not read until the GPU has settled)", b.cool === AUTO.cooldown && b.n === 0);
    const fast = feed(autoStart(0.7), 8, AUTO.cooldown + AUTO.window * 5);
    ok("!! IT NEVER RAISES THE SCALE: five windows of 8 ms frames at 0.7 leave it at 0.7 (a vsync-capped frame looks the same at any scale, so speed alone cannot say there is headroom)", fast.scale === 0.7 && !fast.changed);
    const mid = feed(autoStart(1), 20, AUTO.cooldown + AUTO.window * 3);
    ok("a frame time under the threshold (20 ms against " + AUTO.slowMs + ") never lowers it", mid.scale === 1);
    const mixed = (() => { let s = feed(autoStart(1), 10, AUTO.cooldown); for (let i = 0; i < AUTO.window; i++) s = autoStep(s, i % 2 ? 50 : 10); return s; })();
    ok("the MEAN decides, not any one frame: alternating 10 and 50 ms (mean 30) lowers it; alternating 10 and 30 (mean 20) would not", mixed.scale === 0.85 && mixed.changed);
    const mean20 = (() => { let s = feed(autoStart(1), 10, AUTO.cooldown); for (let i = 0; i < AUTO.window; i++) s = autoStep(s, i % 2 ? 30 : 10); return s; })();
    ok("...and the second case, 10 and 30, leaves it alone", mean20.scale === 1 && !mean20.changed);
    const stall = (() => { let s = feed(autoStart(1), 10, AUTO.cooldown); s = autoStep(s, 5000); for (let i = 1; i < AUTO.window; i++) s = autoStep(s, 10); return s; })();
    ok("ONE STALL IS NOT A TREND: a 5,000 ms frame among nineteen 10 ms frames counts as at most " + AUTO.cap + " ms, so the mean is 14.5 and the scale holds", stall.scale === 1 && !stall.changed, "mean " + (stall.mean && stall.mean.toFixed(1)));
    const bad = autoStep(autoStart(1), NaN), zero = autoStep(autoStart(1), 0), neg = autoStep(autoStart(1), -3);
    ok("a frame time that is not a positive number (NaN, 0, negative) is ignored, not counted", [bad, zero, neg].every((x) => x.cool === AUTO.cooldown && x.n === 0 && !x.changed));
    const frozen = Object.freeze(autoStart(1)); let threw = false; try { autoStep(frozen, 90); } catch { threw = true; }
    ok("the reducer does not modify the state it is given (a frozen state is accepted)", !threw);
}
console.log("\nTHE FIXED POINT, DRIVEN ON THE TWO GPUs' MEASURED COSTS");
{
    // cost per frame ~ a + b * scale^2 (the render scale is per axis): the rig's numbers at 1280x720 -- the GTX 1080 ~10 ms, the Intel gen-9 ~62 ms; each with the ~2 ms and ~6 ms fixed share the per-pass data gave
    const gtx = settle(1, (sc) => 2 + 8 * sc * sc), intel = settle(1, (sc) => 6 + 56 * sc * sc), snail = settle(1, (sc) => 400 * sc * sc);
    ok("a GTX 1080 at 1280x720 (10 ms) never lowers it: the scale stays 1", gtx.scale === 1, JSON.stringify(gtx));
    ok("an Intel gen-9 at 1280x720 (62 ms) settles where the frame is under " + AUTO.slowMs + " ms: a scale of " + intel.scale + " (" + (6 + 56 * intel.scale * intel.scale).toFixed(1) + " ms) after " + intel.frames + " frames", intel.scale < 1 && intel.scale >= AUTO.min && 6 + 56 * intel.scale * intel.scale <= AUTO.slowMs, JSON.stringify(intel));
    ok("a box too slow for any scale stops at the floor " + AUTO.min + " and does not go below it", snail.scale === AUTO.min, JSON.stringify(snail));
}
console.log("\nTHE PAGE USES IT");
{
    const html = fs.readFileSync(path.join(ENG, "snow-gpu.html"), "utf8");
    ok("snow-gpu.html imports autoStep and autoStart from /render/autoScale.mjs, has an auto checkbox, accepts ?scale=auto, feeds the step the frame's time and rebuilds the size when it says changed",
        /import \{[^}]*autoStep[^}]*\} from "\/render\/autoScale\.mjs"/.test(html) && /id="auto"/.test(html) && /scale\) === "auto"|=== "auto"/.test(html) && /autoStep\(/.test(html) && /\.changed/.test(html) && /rebuildSize\(/.test(html));
}

console.log(`\nautoScale-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
