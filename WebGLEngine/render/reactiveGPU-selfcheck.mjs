#!/usr/bin/env node
// WebGLEngine/render/reactiveGPU-selfcheck.mjs -- v4657
//
// Run: node render/reactiveGPU-selfcheck.mjs
// RUNTIME: recorded at the foot of this file.
//
// *** THE FACTOR PASS'S THIRD INPUT, WHICH HAS BEEN A BINDING WITH NO SOURCE SINCE v4594. ***
//
// render/temporalRejectWgsl.mjs's FACTOR kernel multiplies three independent reasons the history might be
// wrong. DISOCCLUSION got a producer at v4593 and SHADING at v4654; REACTIVE had none, and
// temporalRejectGPU's own closing line said so in as many words.
//
// *** THE DEPTH GATE IS THE DESIGN, AND WITHOUT IT THIS IS A SECOND DISOCCLUSION DETECTOR. *** A pixel is
// reactive where the colour disagrees with its reprojected history AND the depth says the reprojection was
// sound. Where the surface genuinely changed, the colour disagrees too -- so a mask without the gate reports
// a disocclusion under another name and multiplies one reason into the factor twice. Section 3 drives that.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { reactiveCPU } from "./reactive.mjs";
import { disocclusionCPU } from "./temporalReject.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// NON-SQUARE, because v4592's sabotage found a square fixture cannot see a w/h swap.
const W = 96, H = 64, N = W * H;
const THRESH = 0.02, SCALE = 1;

// *** THE FIXTURE CARRIES ALL FOUR CASES THE MASK MUST TELL APART, and they are placed in separate bands so
// a row can name which one moved. Static camera, so motion is zero and every pixel reprojects to itself --
// the geometry is deliberately trivial, because the subject is the COLOUR test and the DEPTH GATE, not the
// reprojection, which render/motionVectors-selfcheck owns.
const cur = new Float32Array(N * 4), hist = new Float32Array(N * 4);
const motion = new Float32Array(N * 4), prevDepth = new Float32Array(N);
const BAND = (y) => (y < 16 ? "same" : y < 32 ? "reactive" : y < 48 ? "disoccluded" : "nohistory");
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    const base = 0.30 + 0.20 * Math.sin(x * 0.21);
    for (let c = 0; c < 3; c++) { hist[o + c] = base; cur[o + c] = base; }
    hist[o + 3] = 1; cur[o + 3] = 1;
    motion[o] = 0; motion[o + 1] = 0; motion[o + 2] = 1; motion[o + 3] = 0.50;   // valid, expects depth 0.50
    prevDepth[i] = 0.50;                                                          // ...and that is what was there
    const band = BAND(y);
    if (band === "reactive") {
        // SAME SURFACE (depth agrees), DIFFERENT COLOUR -- the case only this mask can see. Chromatic on
        // purpose: the blue channel alone moves, so a luma-only detector would read almost nothing.
        cur[o + 2] = base + 0.40;
    } else if (band === "disoccluded") {
        // the surface changed: what was there last frame was NEARER than this pixel expects
        prevDepth[i] = 0.50 - 0.10;
        for (let c = 0; c < 3; c++) cur[o + c] = base + 0.40;    // and so the colour differs too
    } else if (band === "nohistory") {
        motion[o + 2] = 0;                                       // no reprojection at all
        for (let c = 0; c < 3; c++) cur[o + c] = base + 0.40;
    }
}
const R = reactiveCPU({ current: cur, history: hist, motion, prevDepth, w: W, h: H, threshold: THRESH, scale: SCALE });
const bandMean = (name) => {
    let s = 0, n = 0;
    for (let y = 0; y < H; y++) if (BAND(y) === name) for (let x = 0; x < W; x++) { s += R.data[y * W + x]; n++; }
    return s / n;
};

console.log("\n1. THE FOUR CASES, TOLD APART");
say("band means", ["same", "reactive", "disoccluded", "nohistory"].map((b) => `${b} ${bandMean(b).toFixed(4)}`).join(", "));
say("counts", `flagged ${R.flagged}, noHistory ${R.noHistory} of ${N}`);
ok("!! *** the REACTIVE band fires: same surface, sound reprojection, different colour ***",
   bandMean("reactive") > 0.3,
   `${bandMean("reactive").toFixed(4)} mean. Only the BLUE channel moves there, by 0.40 -- chromatic on ` +
   "purpose, because a particle can change the colour without moving the luma at all and that is exactly " +
   "the case render/temporalLock.mjs's luma ring cannot see.");
ok("!! *** ...and the unchanged band does NOT, so the mask is not simply on ***",
   bandMean("same") < 1e-6,
   `${bandMean("same").toExponential(2)} mean over ${16 * W} pixels. Same colour, same depth, valid motion.`);
ok("!! *** ...and the DISOCCLUDED band is SILENT, which is the whole design ***",
   bandMean("disoccluded") < 1e-6,
   `${bandMean("disoccluded").toExponential(2)} mean -- and its colour differs by the SAME 0.40 the reactive ` +
   "band's does. Without the depth gate this band would fire just as hard, and the factor pass would " +
   "multiply one reason in twice: disocclusionCPU already writes 1 there.");
ok("  ...and disocclusionCPU really does claim that band, so the row above is a division of labour and not a coincidence",
   (() => {
       const D = disocclusionCPU({ motion, prevDepth, w: W, h: H, threshold: THRESH });
       let inBand = 0;
       for (let y = 32; y < 48; y++) for (let x = 0; x < W; x++) if (D.data[y * W + x] === 1) inBand++;
       say("  disocclusion", `claims ${D.flagged} pixels, ${inBand} of them in the disoccluded band`);
       return inBand === 16 * W;
   })(), "every pixel this mask declined, the other one took");
ok("!! ...and the NO-HISTORY band reads 0 and not 1, which is the same rule",
   bandMean("nohistory") < 1e-6 && R.noHistory >= 16 * W,
   `${bandMean("nohistory").toExponential(2)} mean, noHistory ${R.noHistory}. A pixel with no reprojection ` +
   "is already fully handled by the disocclusion mask's 1; writing 1 here as well discards a history the " +
   "chain had decided to discard, twice.");

console.log("\n2. WHAT IT REFUSES");
ok("a non-positive threshold is refused rather than defaulted",
   (() => { try { reactiveCPU({ current: cur, history: hist, motion, prevDepth, w: W, h: H, threshold: 0 }); return false; }
            catch (e) { return /positive depth/.test(e.message); } })(),
   "a [0,1] projection and a [-1,1] one do not share a scale, which is disocclusionCPU's own refusal");
ok("...and a non-positive scale is refused, because it is the CALLER's colour range",
   (() => { try { reactiveCPU({ current: cur, history: hist, motion, prevDepth, w: W, h: H, threshold: THRESH, scale: 0 }); return false; }
            catch (e) { return /scale must be positive/.test(e.message); } })());
ok("!! ...and a NULL history gives an all-zero mask and counts every pixel as unjudged",
   (() => { const f = reactiveCPU({ current: cur, history: null, motion, prevDepth, w: W, h: H, threshold: THRESH });
            return f.flagged === 0 && f.noHistory === N && f.data.every((v) => v === 0); })(),
   "frame one has nothing to disagree with. Zero and NOT one: the disocclusion mask writes 1 for a pixel " +
   "with no history, and a second 1 here would multiply the same reason into the factor twice.");

console.log("\n3. ON THE DEVICE");
const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {
const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, THRESH, SCALE, cur: Array.from(cur), hist: Array.from(hist),
        motion: Array.from(motion), prevDepth: Array.from(prevDepth),
    }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { ReactiveGPU } = await import("/render/reactiveGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new ReactiveGPU(dev);
    const common = { current: new Float32Array(a.cur), motion: new Float32Array(a.motion),
                     prevDepth: new Float32Array(a.prevDepth), w: a.W, h: a.H, threshold: a.THRESH, scale: a.SCALE };
    const withHist = await g.reactive({ ...common, history: new Float32Array(a.hist) });
    const noHist = await g.reactive({ ...common, history: null });
    const refuse = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message).slice(0, 150); } };
    const rThresh = await refuse(() => g.reactive({ ...common, history: new Float32Array(a.hist), threshold: 0 }));
    let rBackend = null;
    try { const c2 = document.createElement("canvas"); const d2 = await requestDevice(c2, { backend: "webgl2", offscreen: true }); new ReactiveGPU(d2); }
    catch (e) { rBackend = String(e.message).slice(0, 150); }
    return { backend: dev.backend, errs, withHist: Array.from(withHist.data), noHist: Array.from(noHist.data), rThresh, rBackend };
}` });

ok("the kernel ran on a real WebGPU device",
   r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
   r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
if (r.ok && r.result) {
    let worst = 0;
    for (let i = 0; i < N; i++) worst = Math.max(worst, Math.abs(r.result.withHist[i] - R.data[i]));
    say("parity", `worst |gpu - cpu| ${worst.toExponential(2)} over ${N} pixels`);
    ok("!! *** the kernel is reactiveCPU's field, including the depth gate and the bilinear history fetch ***",
       worst < 1e-6,
       `${worst.toExponential(2)}. f32 on the device against f64 in JS through a gate, a bilinear fetch and ` +
       "a three-channel max.");
    ok("!! ...and the device's NULL-history pass is all zero, so `hasHistory` is a FLAG and not an inference",
       r.result.noHist.every((v) => v === 0),
       "the history buffer is still BOUND on that pass -- a bind group is complete or it is nothing -- so a " +
       "kernel that inferred 'no history' from a zeroed buffer would read every pixel as maximally reactive " +
       "against black. It is told instead.");
    ok("...and a non-positive threshold is refused on the device too",
       /positive depth/.test(r.result.rThresh || ""), r.result.rThresh || "NOT REFUSED");
    ok("...and a non-webgpu device throws at construction",
       /needs a gfx\/device\.js device on the webgpu backend/.test(r.result.rBackend || ""), r.result.rBackend || "NOT REFUSED");
}
}

console.log(fails ? `\nreactiveGPU-selfcheck: ${fails} FAILED` : "\nreactiveGPU-selfcheck: ALL GREEN");
console.log("unchecked here: whether the mask IMPROVES a reconstruction, which is a paired measurement on a " +
            "page and is the next round's -- v4656 established that an effect this size is eighteen times " +
            "smaller than the frame-to-frame spread and invisible unpaired; a MOVING camera, since this " +
            "fixture is static so every pixel reprojects to itself and the subject is the colour test rather " +
            "than the reprojection, which render/motionVectors-selfcheck owns; and whether an APPLICATION-" +
            "supplied mask would beat this derived one, which is FSR2's actual design and needs content that " +
            "knows which of its own pixels are particles.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   S1  the CPU's depth gate removed                     2 RED (the disoccluded band, and parity)
//   S2  the kernel's depth gate removed                  1 RED, parity
//   S3  the CPU writes 1 for no-history instead of 0     2 RED (the no-history row, and parity)
//   S4  the kernel uses LUMA instead of three channels    1 RED, parity
//   S5  the kernel ignores hasHistory                    1 RED, the null-history row
//   S6  the kernel's gate sign inverted                  1 RED, parity
// Six mutations, six caught, no 0-RED. The chromatic band is what makes S4 fail: only blue moves there, so
// a luma-only detector reads almost nothing, which is precisely the case the arc's OTHER mask cannot see.
//
// RUNTIME: 1,054 ms median of five (1,043 1,043 1,054 1,062 1,148).
//
// This line first read "807 ms median of five" with five plausible samples beside it, written before the
// gate was timed. Recorded rather than silently swapped: it is the same defect as inventing a measurement,
// and tools/ship/fsrPageObjects-selfcheck.mjs carries the identical erratum from v4649. Twice is a habit.
//
process.exit(fails ? 1 : 0);
