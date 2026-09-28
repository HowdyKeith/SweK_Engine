#!/usr/bin/env node
// WebGLEngine/render/dilateGPU-selfcheck.mjs -- v4664
//
// Run: node render/dilateGPU-selfcheck.mjs
// RUNTIME: recorded at the foot of this file.
//
// *** THE EARLIEST OF FSR2'S PASSES THIS TREE DID NOT HAVE. ***
//
// FSR2 does not hand the depth-clip and lock passes raw per-pixel depth and motion. It DILATES them first:
// each pixel takes the NEAREST depth in its 3x3 neighbourhood and the motion vector of whichever pixel that
// depth came from, so a silhouette edge reprojects with the FOREGROUND rather than with the background
// behind it. Every consumer downstream in this tree -- disocclusionCPU, the lock ring, the reactive mask --
// has been reading undilated data since it was written.
//
// *** AND THE ARC ALREADY MEASURED THAT THIS POPULATION IS WHERE ITS PROBLEM LIVES. *** v4663 split the
// reconstruction error by where the reactive mask fires and found the mask's entire effect, help and harm
// alike, inside about ONE PERCENT of the picture at the moving slab's silhouette. This gate does NOT claim
// dilation fixes that -- that is a paired measurement on a page and it is named in the closing line as not
// done here. What this grades is that the pass is the pass.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { dilateCPU } from "./dilate.mjs";
import { disocclusionCPU } from "./temporalReject.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// NON-SQUARE, because v4592's sabotage established that a square fixture cannot see a w/h swap.
const W = 96, H = 64, N = W * H;

// *** THE FIXTURE IS A SILHOUETTE, because that is the only place this pass does anything. *** A near slab
// on a far background, both flat in depth, and the two carry DIFFERENT motion. Everything about dilation is
// what happens in the one-pixel ring outside the slab's edge.
const FAR = 0.80, NEAR = 0.20;
const SLAB = (x, y) => (x >= 30 && x < 60 && y >= 20 && y < 44);
const depth = new Float32Array(N), motion = new Float32Array(N * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, on = SLAB(x, y);
    depth[i] = on ? NEAR : FAR;
    // the slab moves right, the background does not -- so a pixel that takes the slab's vector is visible
    motion[o] = on ? 0.05 : 0;
    motion[o + 1] = 0;
    motion[o + 2] = 1;
    motion[o + 3] = depth[i];            // zPrev: this surface's own depth, so a MIXED vector is detectable
}
const D = dilateCPU({ depth, motion, w: W, h: H, nearerIsLess: true });

console.log("dilateGPU-selfcheck -- the nearest depth in the neighbourhood, and the vector that came with it\n");

console.log("1. WHAT IT MOVES, AND WHAT IT LEAVES ALONE");
// derived, not declared: the ring is the slab grown by one pixel, minus the slab
const grown = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (SLAB(x + dx, y + dy)) return true; return false; };
let ring = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grown(x, y) && !SLAB(x, y)) ring++;
say("moved", `${D.moved} pixels, against a one-pixel ring of ${ring} around a ${30 * 24}-pixel slab`);
ok("!! *** exactly the ring outside the silhouette takes the foreground's data, and nothing else does ***",
   D.moved === ring,
   `${D.moved} === ${ring}. The slab's own pixels are already the nearest thing in their neighbourhood, and ` +
   "the background more than one pixel away never sees it. A dilation that fired more widely would be a " +
   "smear and would still produce a plausible depth field.");
ok("!! ...and every pixel that did NOT move kept its own index, so `source` is a record and not a guess",
   (() => { for (let i = 0; i < N; i++) { const moved = D.source[i] !== i;
              const should = grown(i % W, Math.floor(i / W)) && !SLAB(i % W, Math.floor(i / W));
              if (moved !== should) return false; } return true; })(),
   "source[i] === i is the only way to tell 'nothing was nearer' from 'a neighbour tied and won'. On flat " +
   "geometry those two produce the IDENTICAL depth and motion buffers, so nothing downstream could.");

// *** THE TRAP THIS PASS IS MOST LIKELY TO SHIP WITH. ***
console.log("\n2. THE VECTOR IS COPIED WHOLE");
ok("!! *** every dilated pixel's four channels come from ONE source pixel, not a mix ***",
   (() => { for (let i = 0; i < N; i++) { const s = D.source[i];
              for (let c = 0; c < 4; c++) if (D.motion[i * 4 + c] !== motion[s * 4 + c]) return false;
              if (D.depth[i] !== depth[s]) return false; } return true; })(),
   "du/dv from the nearest neighbour and zPrev from the centre builds a vector that describes NO surface, " +
   "and the depth-clip pass downstream compares exactly those two against each other. The fixture's zPrev " +
   "is each surface's own depth precisely so a mix is visible rather than plausible.");
// *** COMPARED AGAINST THE STORED VALUE, NOT AGAINST THE LITERAL. *** The first draft of this row tested
// `=== 0.05` and read 0 of 112: the fixture writes 0.05 into a Float32Array, which stores 0.05000000074...,
// and comparing that to the f64 literal is false for every pixel. The row failed while the module was
// right -- a fixture defect wearing a module defect's clothes. The slab's own stored motion is the only
// thing the dilated ring can legitimately equal, so that is what it is held against.
const SLAB_DU = motion[(20 * W + 30) * 4];          // a slab pixel's du, as stored
const SLAB_Z = depth[20 * W + 30];
let ringTookSlab = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (grown(x, y) && !SLAB(x, y) && D.motion[i * 4] === SLAB_DU && D.motion[i * 4 + 3] === SLAB_Z) ringTookSlab++;
}
ok("!! ...and the ring really carries the SLAB's motion and the SLAB's depth, which is the point of the pass",
   ringTookSlab === ring,
   `${ringTookSlab} of ${ring} ring pixels now report the slab's du (${SLAB_DU}) and the slab's zPrev ` +
   `(${SLAB_Z}). Undilated they reported du 0 and zPrev ${FAR} -- the background's -- so the accumulator ` +
   `sent the edge's history where neither ` +
   "surface went. That is the defect this pass exists for.");

console.log("\n3. WHAT IT REFUSES, AND WHOSE CONVENTION IT IS");
ok("a non-whole or non-positive radius is refused rather than rounded",
   (() => { let n = 0; for (const r of [0, -1, 1.5]) { try { dilateCPU({ depth, motion, w: W, h: H, radius: r }); } catch { n++; } } return n === 3; })(),
   "a radius of 1.5 is not a neighbourhood this loop can walk, and silently flooring it would dilate by one " +
   "while the caller believed something else");
// *** THE SIGN IS THE CALLER'S, AND INVERTED IT IS THE EXACT COMPLEMENT. ***
const INV = dilateCPU({ depth, motion, w: W, h: H, nearerIsLess: false });
let inner = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const on = SLAB(x, y); let touchesOut = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!SLAB(x + dx, y + dy)) touchesOut = true;
    if (on && touchesOut) inner++;
}
say("inverted", `${INV.moved} pixels move, against an INNER ring of ${inner}`);
ok("!! *** inverting nearerIsLess dilates the BACKGROUND over the foreground -- the exact complement ***",
   INV.moved === inner && INV.moved !== D.moved,
   `${INV.moved} against ${D.moved}. Both are working dilations and only one is the pass FSR2 describes. ` +
   "A [0,1] projection and a [-1,1] one disagree about which way is nearer, which is why this module " +
   "refuses to guess -- disocclusionCPU's and reactiveCPU's rule, and the same trap they name.");

console.log("\n4. WHAT IT IS FOR: THE DOWNSTREAM PASS STOPS SEEING A DISOCCLUSION THAT IS NOT THERE");
// *** A SECOND FIXTURE, AND THE FIRST ATTEMPT AT THIS SECTION WAS A DECLARED NUMBER. *** It reused the
// fixture above with a flat prevDepth and asserted the dilated disocclusion count would exceed the
// undilated one BY THE RING. It does not: both read zero, because a ring pixel that claims the near slab's
// depth against a background that was far last frame is an OCCLUSION, not a disocclusion, and the test
// correctly declines both. The claim was written from what the pass is for rather than from what this
// fixture does, which is the defect this session keeps finding in its own prose.
//
// What dilation actually buys downstream is the other direction: it SUPPRESSES a disocclusion that is an
// artefact of the edge pixel's depth. Here the slab has been still for two frames -- prevDepth carries it
// where it is -- and motion is zero everywhere, so every pixel reprojects to itself and the ONLY thing that
// differs between the two runs is the zPrev the ring carries.
const pDepth = new Float32Array(N), pMotion = new Float32Array(N * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, on = SLAB(x, y);
    pDepth[i] = on ? NEAR : FAR;
    pMotion[o] = 0; pMotion[o + 1] = 0; pMotion[o + 2] = 1; pMotion[o + 3] = pDepth[i];
}
// last frame the slab covered ITSELF AND ITS RING -- a one-pixel-larger silhouette, which is what a
// half-covered edge pixel looks like to a rasteriser on the frame before
const prevDepth = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) prevDepth[y * W + x] = grown(x, y) ? NEAR : FAR;
const PD = dilateCPU({ depth: pDepth, motion: pMotion, w: W, h: H, nearerIsLess: true });
const raw = disocclusionCPU({ motion: pMotion, prevDepth, w: W, h: H, threshold: 0.05, nearerIsLess: true });
const dil = disocclusionCPU({ motion: PD.motion, prevDepth, w: W, h: H, threshold: 0.05, nearerIsLess: true });
const rawGen = raw.flagged - raw.noHistory, dilGen = dil.flagged - dil.noHistory;
say("disocclusion", `undilated ${rawGen} genuine, dilated ${dilGen}, ring ${ring}`);
ok("!! *** dilation REMOVES exactly the ring's worth of disocclusions, and they were the spurious ones ***",
   rawGen === ring && dilGen === 0,
   `${rawGen} -> ${dilGen}, and the ring is ${ring}. Undilated, each ring pixel carries the BACKGROUND's ` +
   `zPrev (${FAR}) while the depth recorded there last frame is the slab's (${NEAR}); the clip test reads ` +
   "something nearer than expected and calls it a disocclusion. Nothing was uncovered -- the slab has not " +
   "moved. Dilated, the ring carries the slab's own zPrev and the test agrees with itself. This is why the " +
   "pass runs BEFORE depth clip in FSR2 rather than beside it. Whether it IMPROVES a reconstruction is a " +
   "paired measurement on a page and is not claimed here.");

console.log("\n5. ON THE DEVICE");
const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {
const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, depth: Array.from(depth), motion: Array.from(motion),
    }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { DilateGPU } = await import("/render/dilateGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new DilateGPU(dev);
    const common = { depth: new Float32Array(a.depth), motion: new Float32Array(a.motion), w: a.W, h: a.H };
    const plain = await g.dilate({ ...common });
    const counted = await g.dilate({ ...common, counted: true });
    const inverted = await g.dilate({ ...common, nearerIsLess: false });
    const refuse = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message).slice(0, 150); } };
    const rRadius = await refuse(() => g.dilate({ ...common, radius: 1.5 }));
    let rBackend = null;
    try { const c2 = document.createElement("canvas"); const d2 = await requestDevice(c2, { backend: "webgl2", offscreen: true }); new DilateGPU(d2); }
    catch (e) { rBackend = String(e.message).slice(0, 150); }
    return { backend: dev.backend, errs,
             depth: Array.from(plain.depth), motion: Array.from(plain.motion), source: Array.from(plain.source),
             invMoved: Array.from(inverted.source).filter((s, i) => s !== i).length,
             stats: counted.stats, plainStats: plain.stats, plainReason: plain.statsReason,
             countedSource: Array.from(counted.source), rRadius, rBackend };
}` });

ok("the kernel ran on a real WebGPU device",
   r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
   r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
if (r.ok && r.result) {
    let worstD = 0, worstM = 0, srcDiff = 0;
    for (let i = 0; i < N; i++) {
        worstD = Math.max(worstD, Math.abs(r.result.depth[i] - D.depth[i]));
        if (r.result.source[i] !== D.source[i]) srcDiff++;
        for (let c = 0; c < 4; c++) worstM = Math.max(worstM, Math.abs(r.result.motion[i * 4 + c] - D.motion[i * 4 + c]));
    }
    say("parity", `depth ${worstD.toExponential(2)}, motion ${worstM.toExponential(2)}, source mismatches ${srcDiff} of ${N}`);
    ok("!! *** the kernel picks the SAME pixel as dilateCPU at every one of them, not merely the same depth ***",
       srcDiff === 0 && worstD === 0 && worstM === 0,
       "two implementations of a tie rule agreeing on the WINNER and not just on the winning value. On flat " +
       "geometry -- most of any frame -- every neighbour ties, so a mirror that took nearer-OR-EQUAL would " +
       "produce an identical depth buffer and a completely different source buffer.");
    ok("!! ...and mainCounted's `moved` agrees with its own source buffer",
       !!r.result.stats && r.result.stats.moved === D.moved &&
       r.result.stats.moved === r.result.countedSource.filter((s, i) => s !== i).length,
       `${r.result.stats && r.result.stats.moved} against ${D.moved} on the CPU and against the device's own ` +
       "source buffer. The counter is derivable from that buffer, which is exactly why it is worth " +
       "dispatching: a counter and a buffer written by the same kernel that disagree is the cheapest signal " +
       "there is that one of them is wrong.");
    ok("!! ...and the device inverts the same way, so the convention is not a CPU-side accident",
       r.result.invMoved === INV.moved,
       `${r.result.invMoved} against ${INV.moved}`);
    ok("...and stats is NULL without counted: true, with a reason, rather than zero",
       r.result.plainStats === null && /Null rather than zero/.test(r.result.plainReason || ""),
       "a frame where the depth was flat and nothing needed dilating and a frame nobody counted must not " +
       "read the same -- and their OUTPUT buffers are identical, so nothing else could tell them apart");
    ok("...and a non-whole radius is refused on the device too",
       /radius must be a positive whole number/.test(r.result.rRadius || ""), r.result.rRadius || "NOT REFUSED");
    ok("...and a non-webgpu device throws at construction",
       /needs a gfx\/device\.js device on the webgpu backend/.test(r.result.rBackend || ""), r.result.rBackend || "NOT REFUSED");
}
}

console.log(fails ? `\ndilateGPU-selfcheck: ${fails} FAILED` : "\ndilateGPU-selfcheck: ALL GREEN");
console.log("unchecked here: whether dilation IMPROVES a reconstruction, which is a paired measurement on a " +
            "page and is the next round's -- v4656 established that an effect this size is invisible " +
            "unpaired, and v4663 established that the population it would move is about one percent of the " +
            "picture, so an unpaired frame-level PSNR is the wrong instrument twice over; a MOVING camera, " +
            "since this fixture's motion is written rather than reprojected and the subject here is the " +
            "neighbourhood search; RADIUS ABOVE 1, which FSR2 does not use and nothing in this tree calls " +
            "for; and whether the LOCK ring and the reactive mask should read dilated data too -- in FSR2 " +
            "they do, and in this tree they still do not, which is a wiring question and not this module's.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   D1  the CPU tie rule takes nearer-OR-EQUAL             6 RED. The trap the header names: on flat
//       geometry every neighbour ties, so `<=` lets the last one scanned win everywhere and the whole
//       picture shifts by a pixel while still measuring as "nearest depth wins".
//   D2  the KERNEL tie rule takes nearer-or-equal          3 RED, all three through the SOURCE buffer.
//       The depth buffer is IDENTICAL under this mutation -- ties are ties -- so a parity row comparing
//       depths alone would have scored zero. That is why the runner returns `source` at all.
//   D3  the CPU mixes du/dv from the winner with zPrev from the centre    4 RED.
//   D4  the KERNEL mixes the same vector                   1 RED, parity.
//   D5  the CPU ignores nearerIsLess and always takes the minimum         2 RED.
//   D6  the CPU's radius validation replaced by a floor    1 RED.
//   D7  the runner returns a zeroed stats object           1 RED.
//   D8  the kernel emits the CENTRE's depth with the winner's motion      1 RED, parity.
// Eight mutations, eight caught, no 0-RED.
//
// *** AND TWO OF THIS GATE'S OWN ROWS WERE RED ON ARRIVAL, BOTH FIXTURE DEFECTS WEARING MODULE DEFECTS'
// CLOTHES. *** The ring row compared a Float32Array value against the literal 0.05 and read 0 of 112: the
// fixture stores 0.05000000074..., and the f64 literal is not that number. It now compares against the
// slab's own stored value. And section 4 first asserted the dilated disocclusion count would EXCEED the
// undilated one by the ring; both read zero, because a ring pixel claiming the near slab's depth against a
// background that was far last frame is an OCCLUSION and the test correctly declines it. The claim was
// written from what the pass is for rather than from what the fixture does. Rebuilt around what dilation
// actually buys -- it REMOVES 112 spurious disocclusions and leaves 0 -- on a fixture where the slab has
// not moved and the only thing differing between the runs is the zPrev the ring carries.
//
// RUNTIME: 971 ms median of five (923 964 971 976 1017), timed after the sections were written.
//
process.exitCode = fails ? 1 : 0;
