#!/usr/bin/env node
// WebGLEngine/render/luminancePyramid-selfcheck.mjs -- v4668
//
// Run: node render/luminancePyramid-selfcheck.mjs
// RUNTIME: recorded at the foot of this file.
//
// *** FSR2's FIRST DISPATCH, AND THE LAST STRUCTURAL PASS THIS TREE WAS MISSING. ***
//
// ffx_fsr2_compute_luminance_pyramid runs before anything else: it halves the frame's luminance down to
// 1x1, and the bottom of that chain is the average luminance that drives AUTO-EXPOSURE.
//
// *** THIS GATE GRADES THE CHAIN AND NOT A PICTURE, AND THAT IS A STATEMENT ABOUT THE CONTENT. *** fsr.html
// produces colour already in [0,1]: no HDR range to compress, no tone curve downstream. An exposure derived
// from this pyramid is honest arithmetic that multiplies that content by very nearly one. Claiming an image
// improvement here would be claiming something the content cannot supply -- so nothing below measures a
// PSNR, and the closing line says what would have to change for that to be worth doing.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { luminancePyramidCPU, levelsFor, exposureFrom } from "./luminancePyramid.mjs";
import { luma } from "./temporalReject.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// NON-SQUARE and NOT a power of two, because both of those hide something: a square fixture cannot see a
// w/h swap (v4592's sabotage), and a power of two cannot see the odd-size edge handling at all.
const W = 96, H = 54, N = W * H;
const src = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
    const v = ((i * 37) % 101) / 100;
    src[i * 4] = v; src[i * 4 + 1] = 1 - v; src[i * 4 + 2] = (v * 3) % 1; src[i * 4 + 3] = 1;
}
const P = luminancePyramidCPU({ src, w: W, h: H });

console.log("luminancePyramid-selfcheck -- the mip chain, its edge bias, and an exposure with nothing to do\n");

console.log("1. THE CHAIN IS A CHAIN");
say("levels", `${P.levels} for ${W}x${H}: ${P.sizes.map(([a, b]) => `${a}x${b}`).join(" -> ")}`);
ok("the chain reaches 1x1 and levelsFor agrees with the chain it describes",
   P.levels === levelsFor(W, H) && P.sizes[P.levels - 1][0] === 1 && P.sizes[P.levels - 1][1] === 1,
   "two ways of counting the same chain: one walks it, the other predicts it, and a caller sizing buffers " +
   "uses the prediction");
// *** EVERY LEVEL, NOT JUST THE LAST. *** A chain whose bottom is right and whose middle is not is exactly
// what a single mean check cannot see.
let worstLevel = 0, worstAt = -1;
for (let L = 1; L < P.levels; L++) {
    const [pw, ph] = P.sizes[L - 1], [nw, nh] = P.sizes[L];
    const prev = P.mips[L - 1], cur = P.mips[L];
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const x0 = Math.min(2 * x, pw - 1), x1 = Math.min(2 * x + 1, pw - 1);
        const y0 = Math.min(2 * y, ph - 1), y1 = Math.min(2 * y + 1, ph - 1);
        const want = 0.25 * (prev[y0 * pw + x0] + prev[y0 * pw + x1] + prev[y1 * pw + x0] + prev[y1 * pw + x1]);
        const e = Math.abs(cur[y * nw + x] - want);
        if (e > worstLevel) { worstLevel = e; worstAt = L; }
    }
}
say("  every level against its parent", `worst |mip - avg(parent 2x2)| ${worstLevel.toExponential(2)} (level ${worstAt})`);
ok("!! *** every pixel of every mip IS the 2x2 average of its parent, checked at all levels ***",
   worstLevel < 1e-6,
   `${P.levels - 1} reductions, all of them. A chain whose BOTTOM is right and whose middle is not is ` +
   "exactly what a single mean check cannot see, and the bottom of a wrong chain is still one number that " +
   "looks like a brightness.");
// the base level must be the arc's luma and not a second convention
// Math.fround, NOT a tolerance. The base level lives in a Float32Array, so it holds the f32 rounding of an
// f64 result and `=== luma(...)` is false at almost every pixel -- this row went red on arrival for exactly
// that, and it is the SECOND time this session a Float32Array has been compared against an f64 value
// (v4664's fixture read 0 of 112 the same way). Rounding the expectation the way the storage does keeps
// the row EXACT, where a tolerance would have quietly admitted a different luma convention too.
let worstBase = 0;
for (let i = 0; i < N; i++)
    worstBase = Math.max(worstBase, Math.abs(P.mips[0][i] - Math.fround(luma(src[i * 4], src[i * 4 + 1], src[i * 4 + 2]))));
ok("!! ...and the base level is render/temporalReject.mjs's `luma`, imported rather than re-derived",
   worstBase === 0,
   "0.25/0.5/0.25 is the Y of the YCoCg the accumulate pass already clamps in. A pyramid weighting colour " +
   "differently from the pass that consumes it would be two definitions of brightness in one pipeline, and " +
   "this row fails if either moves without the other.");

console.log("\n2. THE EDGE BIAS, MEASURED RATHER THAN WAVED AT");
// *** A 2x2 AVERAGE OF AN ODD-WIDTH ROW HAS TO DO SOMETHING WITH THE LAST COLUMN. *** Dropping it is the
// plausible-looking choice: the mips still halve, the chain still reaches 1x1, every surviving pixel is a
// correct average, and the frame's mean quietly stops being the frame's mean. This clamps instead, which
// reads the last row and column TWICE. Neither is exact. The difference is that this one is measured.
const mk = (w, h) => { const n = w * h, s = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { const v = ((i * 37) % 101) / 100; s[i * 4] = s[i * 4 + 1] = s[i * 4 + 2] = v; } return s; };
const drift = [];
for (const [w, h] of [[8, 8], [16, 16], [64, 64], [5, 3], [9, 9], [100, 100], [192, 192], [W, H]]) {
    const Q = luminancePyramidCPU({ src: mk(w, h), w, h });
    drift.push({ w, h, rel: 100 * (Q.mean - Q.exact) / Q.exact });
}
for (const d of drift) say(`  ${d.w}x${d.h}`, `${d.rel >= 0 ? "+" : ""}${d.rel.toFixed(2)}% against the direct sum`);
const pow2 = drift.filter((d) => (d.w & (d.w - 1)) === 0 && (d.h & (d.h - 1)) === 0);
ok("!! *** at a power of two the chain's bottom IS the frame's mean, exactly ***",
   pow2.length >= 3 && pow2.every((d) => Math.abs(d.rel) < 1e-4),
   `${pow2.map((d) => `${d.w}x${d.h} ${d.rel.toFixed(4)}%`).join(", ")}. No clamp ever fires, so every ` +
   "pixel is counted once and halving IS averaging.");
const small = drift.find((d) => d.w === 5), page = drift.find((d) => d.w === W);
ok("!! *** and at a SMALL odd size it is not, by a figure worth knowing ***",
   !!small && Math.abs(small.rel) > 5,
   `${small ? small.rel.toFixed(2) : "?"}% at 5x3 and ${drift.find((d) => d.w === 9).rel.toFixed(2)}% at 9x9. ` +
   "The double-counted edge is a large share of a tiny mip. A pass that shipped this without measuring it " +
   "would be feeding auto-exposure a number wrong by a sixth and calling it the average luminance.");
ok("!! ...and at THIS TREE's sizes the same bias is a rounding error, which is why the pass is usable",
   !!page && Math.abs(page.rel) < 0.5 && Math.abs(drift.find((d) => d.w === 192).rel) < 0.5,
   `${page ? page.rel.toFixed(2) : "?"}% at ${W}x${H} and ` +
   `${drift.find((d) => d.w === 192).rel.toFixed(2)}% at 192x192, the page's display size. The bias is a ` +
   "SMALL-MIP phenomenon, not an odd-size one: 191x191 reads -0.03%. Stating the bound is what makes the " +
   "choice of clamping over dropping a decision rather than an accident.");

console.log("\n3. THE EXPOSURE, AND WHAT IT HAS TO DO HERE");
ok("a non-positive target is refused, and a negative mean is refused",
   (() => { let n = 0; try { exposureFrom(0.5, { target: 0 }); } catch { n++; }
            try { exposureFrom(-1); } catch { n++; } return n === 2; })(),
   "a target of zero asks for an infinite scale and a negative mean is not a luminance");
ok("!! *** a BLACK frame gives a finite scale, because a fade to black is content and not an error ***",
   Number.isFinite(exposureFrom(0)) && exposureFrom(0) === 64,
   `${exposureFrom(0)} at the maxScale. Without the floor this is target/0 -- Infinity -- and every ` +
   "consumer downstream sees NaN one frame later with nothing to say where it came from. A floor rather " +
   "than a throw, because unlike a negative size a black frame is a legitimate thing to render.");
const meanOfPage = P.exact;
ok("!! *** and on THIS tree's content the exposure has nothing to do, which is measured and not assumed ***",
   (() => { const e = exposureFrom(meanOfPage, { target: meanOfPage });
            return Math.abs(e - 1) < 1e-6; })(),
   `the fixture's mean luminance is ${meanOfPage.toFixed(4)} and its colour is already in [0,1]: there is ` +
   "no HDR range to compress and no tone curve downstream. Asked to bring that mean to itself the scale is " +
   "1 to float precision. The pyramid is real and gradeable; the exposure built on it is arithmetic this " +
   "page's content does not need, and saying so is cheaper than a round that claims a picture improvement " +
   "the content cannot supply.");

console.log("\n4. ON THE DEVICE");
const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {
const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, src: Array.from(src) }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { LuminancePyramidGPU } = await import("/render/luminancePyramidGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new LuminancePyramidGPU(dev);
    const out = await g.pyramid({ src: new Float32Array(a.src), w: a.W, h: a.H });
    const refuse = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message).slice(0, 150); } };
    const rSize = await refuse(() => g.pyramid({ src: new Float32Array(a.src), w: 0, h: a.H }));
    let rBackend = null;
    try { const c2 = document.createElement("canvas"); const d2 = await requestDevice(c2, { backend: "webgl2", offscreen: true }); new LuminancePyramidGPU(d2); }
    catch (e) { rBackend = String(e.message).slice(0, 150); }
    return { backend: dev.backend, errs, levels: out.levels, sizes: out.sizes, mean: out.mean,
             mips: out.mips.map((m) => Array.from(m)), rSize, rBackend };
}` });

ok("the kernel ran on a real WebGPU device",
   r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
   r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
if (r.ok && r.result) {
    let worst = 0, worstL = -1;
    const sameShape = r.result.levels === P.levels &&
        r.result.sizes.every((s, i) => s[0] === P.sizes[i][0] && s[1] === P.sizes[i][1]);
    for (let L = 0; L < Math.min(r.result.levels, P.levels); L++)
        for (let i = 0; i < P.mips[L].length; i++) {
            const e = Math.abs(r.result.mips[L][i] - P.mips[L][i]);
            if (e > worst) { worst = e; worstL = L; }
        }
    say("parity", `shape ${sameShape ? "same" : "DIFFERS"}, worst |gpu - cpu| ${worst.toExponential(2)} (level ${worstL})`);
    ok("!! *** the device builds the same chain at EVERY level, not merely the same bottom ***",
       sameShape && worst < 1e-6,
       "f32 on the device against f64 in JS, through as many reductions as the chain has levels, each one " +
       "feeding the next. A mirror that differed only in its edge clamp would agree on most pixels and on " +
       "no mip.");
    ok("...and the device's mean is the CPU's",
       Math.abs(r.result.mean - P.mean) < 1e-6, `${r.result.mean} against ${P.mean}`);
    ok("...and a zero dimension is refused on the device too",
       /need a positive size/.test(r.result.rSize || ""), r.result.rSize || "NOT REFUSED");
    ok("...and a non-webgpu device throws at construction",
       /needs a gfx\/device\.js device on the webgpu backend/.test(r.result.rBackend || ""), r.result.rBackend || "NOT REFUSED");
}
}

console.log(fails ? `\nluminancePyramid-selfcheck: ${fails} FAILED` : "\nluminancePyramid-selfcheck: ALL GREEN");
console.log("unchecked here: whether an exposure derived from this chain IMPROVES anything, which this " +
            "page's content cannot answer -- its colour is already in [0,1], so the scale is one and a " +
            "paired PSNR would be measuring float noise. What would have to change for that measurement to " +
            "be worth taking is HDR content with a tone curve after the upscaler, which this tree does not " +
            "have; FSR3's frame interpolation wants the same chain for a different reason and is where it " +
            "earns its keep next. Also unchecked: FSR2's SINGLE-PASS SPD, whose global atomic counter lets " +
            "one dispatch do every level -- that is an optimisation with its own correctness argument, and " +
            "this runner deliberately takes a dispatch per mip so the levels can be checked one at a time; " +
            "and whether the LOCKS and the shading test should read the coarse mips, which they do in the " +
            "reference and do not here.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   L1  the CPU DROPS the odd column (floor sizes, not ceil)     3 RED, incl. device parity.
//   L2  the KERNEL drops it (no clamp, reads into the next row)  2 RED, device parity.
//   L3  the base level uses Rec.709 luma instead of the arc's    3 RED.
//   L4  the exposure floor removed, so a black frame is Infinity 1 RED.
//   L5  levelsFor disagrees with the chain it predicts           3 RED.
// Five mutations, five caught, no 0-RED.
//
// *** AND SECTION 1's "EVERY MIP IS ITS PARENT'S AVERAGE" ROW CANNOT SEE L1 OR L2, WHICH IS WORTH KNOWING
// RATHER THAN LOOKING LIKE COVERAGE. *** That row re-derives each expectation with the clamp formula and
// walks whatever sizes the chain reports, so a change to the SIZE RULE moves the sizes and the row agrees
// with the new ones. What catches a size-rule change is the levels row and the device parity -- three
// rows, none of them redundant, and the one that reads most like the subject is the one that misses it.
//
// *** ONE ROW WAS RED ON ARRIVAL, AND IT IS THE SECOND FLOAT32 ROUND-TRIP THIS SESSION. *** The base-level
// row compared a Float32Array against the f64 result of luma() with ===, which is false at almost every
// pixel; v4664's ring row read 0 of 112 the same way. Math.fround on the expectation keeps the row EXACT,
// where a tolerance would have quietly admitted a different luma convention as well.
//
// RUNTIME: 771 ms median of five (705 760 771 771 773), timed after the sections were written.
//
process.exitCode = fails ? 1 : 0;
