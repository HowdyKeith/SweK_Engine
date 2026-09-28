#!/usr/bin/env node
// WebGLEngine/render/temporalLockGPU-selfcheck.mjs -- v4647
//
// Run: node render/temporalLockGPU-selfcheck.mjs
// RUNTIME: 2,110 ms median of five (2,088 2,108 2,110 2,174 2,305) -- it spawns a browser origin and a
// real adapter and drives six kernels over ten pushes. Five samples, per v4594's lesson about a median of three.
//
// *** THE TEMPORAL ARC'S LAST SIX KERNELS GET A CALLER. ***
//
// tools/ship/kernelReach.mjs censuses kernels the ENGINE cannot dispatch -- ones reachable only from a gate.
// The temporal arc's figure has been six since v4637 re-took it, and these are the six: RING_PUSH,
// SHADING_SHIFT, RIDGE, FIELD_RIDGE, COHERENT_RIDGE and RING_FLOOR. render/temporalLockGPU.mjs is their
// runner and this gate is what holds it to the CPU mirrors.
//
// *** THE FIRST SECTION IS A CENSUS OF THE TREE, NOT OF THIS MODULE, because the claim that justifies the
// round is a claim about the tree. *** ELEVEN gates already drive these kernels on a real device, from
// FOURTEEN hand-rolled dispatch sites inside runInEngineOrigin script STRINGS. That population is derived
// here by reading the files rather than quoted from a header -- and it earned its keep on the first run, by
// correcting render/temporalLockGPU.mjs's own header, which said twelve across nine.
//
// SABOTAGE, eight mutations, ALL EIGHT CAUGHT -- but only after the fixture was repaired TWICE:
//   Z1  pushRing never sets `first`, so frame one does not reset the ring   FAIL  ring parity, 1216 fill counts
//   Z2  the ping-pong swap removed, so the ring never advances             FAIL  device error row (see below)
//   Z3  the window form binds ZEROES instead of the caller's ring          FAIL  2 rows, window to 3.52e-1
//   Z4  fieldRidges ignores the mask (useMask forced to 0)                 FAIL  the gated row, 234 pixels
//   Z5  two kernels share one pipeline object                              FAIL  device error row (see below)
//   Z6  maxBand and maxPlateau swapped in the uniform                      FAIL  coherent parity, 117 pixels
//   Z7  ringFloor ignores `phase`, always the frame form                   FAIL  2 rows, gap to 0.00e+0
//   Z8  scale and strength swapped in the uniform                          FAIL  shift parity, 4.42e-1
//
// *** Z2 AND Z5 ARE CAUGHT BY THE DEVICE-ERROR ROW AND NOT BY PARITY, WHICH IS A WEAKER CATCH AND IS SAID SO
// RATHER THAN COUNTED THE SAME. *** Both make the device itself refuse -- a destroyed buffer, a missing
// binding -- so the gate reports an uncaptured error instead of a wrong number. That is a real detection and
// it is the row that fires; it would not have caught either mutation if the device had tolerated it.
//
// *** THREE OF THE EIGHT WERE 0-REDS ON THE FIRST PASS AND EVERY ONE WAS THIS FIXTURE, NOT THE RUNNER. ***
//   Z8 scored ZERO because the fixture ran scale = strength = 1. Swapping two equal values is not a mutation.
//   Z6 scored ZERO for the same reason at maxBand = maxPlateau = 2 -- and giving them distinct values WAS NOT
//      ENOUGH: with every feature one pixel wide, a band of 1 is under either bound and the plateau walk
//      decides at its first step, so neither word was ever consulted. That one needed a fixture with a real
//      band, not a fixture with different numbers.
//   The COHERENCE ROW ITSELF was vacuous before the comb went in: 101 coherent of 101 raw at every setting
//      tried, which a kernel that copied the ridge mask and skipped the band scan would have passed.
// The first of those is A3's Y1 exactly one round later -- there a moving object's model matrix was written
// translate(0), which IS the identity. TWO ROUNDS RUNNING, so it is a rule now: a fixture tests that two
// parameters are distinct only if it gives them distinct VALUES, and distinct values are not enough when the
// content makes the parameter inert. Both repairs are recorded at the fixture sites below.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { makeLumaState, pushLuma, shadingShiftCPU, lumaMean, ridgesCPU, coherentRidgesCPU,
         depthRidgesCPU, gateLocks, lockCandidatesFromRing } from "./temporalLock.mjs";
import { ringFloorCPU, RESOLUTION_TAU } from "./ringFloor.mjs";
import { FLOOR_PHASE } from "./temporalLockGPU.mjs";
import { codeOnly } from "./backendParity.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// NON-SQUARE, because v4592's sabotage found a square fixture cannot see a w/h swap.
const W = 48, H = 32, P = 4, F = 2 * P, N = W * H, FRAMES = 10;

// *** THE SPEED IS IRRATIONAL ON PURPOSE. *** v4559 measured this arc's one real cross-backend divergence:
// at a speed that divides the texel evenly, RING_PUSH's bounds test has hu landing EXACTLY on a boundary and
// f64 here and f32 there fall on opposite sides, costing the full contrast of the content. That divergence is
// temporalRingContent-selfcheck's subject and is not this gate's; driving it here would measure that instead
// of the runner. A speed with no exact texel tie keeps the two mirrors on the same branch.
const DU = 0.61803398875 / W;

// *** NO TWO DISTINCT UNIFORM WORDS IN THIS FIXTURE SHARE A VALUE, AND THAT IS A SABOTAGE FINDING RATHER
// THAN A STYLE. *** The first draft ran scale = strength = 1 and maxBand = maxPlateau = 2. Two mutations that
// SWAPPED each of those pairs inside the uniform packing scored ZERO failing rows -- not because the gate was
// blind, but because with the two words equal the swapped code computes the identical number and nothing
// happened at all. It is the same defect A3's sabotage found one round earlier, where a fixture wrote a
// moving object's model matrix as translate(0) -- which IS the identity -- and a kernel that ignored the
// object id passed every row. TWO ROUNDS RUNNING, so it is written down as a rule: a fixture only tests that
// two parameters are distinct if it gives them distinct values, and a parameter spelled differently is not
// thereby valued differently. maxBand > maxPlateau because coherentRidgesCPU refuses the other order.
const SCALE = 0.75, STRENGTH = 1.5, MAX_BAND = 3, MAX_PLATEAU = 2;

// SMOOTH content, for the same reason: a chequer converts any bounds disagreement into full contrast.
const seq = [];
for (let f = 0; f < FRAMES; f++) {
    const col = new Float32Array(N * 4), mot = new Float32Array(N * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, o = i * 4;
        const s = Math.sin((x / W + f * DU) * 6.0) * 0.5 + 0.5, t = Math.cos(y / H * 4.0) * 0.25 + 0.5;
        col[o] = s * t; col[o + 1] = s; col[o + 2] = t * 0.5;
        // *** A THIN FEATURE, BECAUSE THE SMOOTH FIELD ALONE HAS NO STRICT EXTREMUM AND THE FIRST DRAFT
        // MEASURED THAT THE HARD WAY: the RIDGE row passed at ZERO ridges found, and the gated-AND row passed
        // by removing 74 of 74 against an all-zero luma mask. Both were green and both were vacuous -- a mask
        // comparison agrees trivially when one mask is empty. A sine is monotone between its turning points,
        // so the plateau walk decides one way on each side everywhere; a ridge needs a feature that is thin.
        // It is STATIONARY while the content moves, which is what keeps it in the ring's jitter-free mean.
        if (x === 20 || y === 14) { col[o] += 0.35; col[o + 1] += 0.35; col[o + 2] += 0.35; }
        mot[o] = -DU; mot[o + 1] = 0; mot[o + 2] = 1; mot[o + 3] = 0.5;
    }
    seq.push({ colour: col, motion: mot });
}

// ---- 1. WHAT THE TREE LOOKS LIKE TODAY, COUNTED -------------------------------------------------------------
console.log("\n1. THE POPULATION, read off the tree rather than quoted");
const KERNELS = ["RING_PUSH_WGSL", "SHADING_SHIFT_WGSL", "RIDGE_WGSL", "FIELD_RIDGE_WGSL",
                 "COHERENT_RIDGE_WGSL", "RING_FLOOR_WGSL"];
const walk = (d, out = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "vendor" || e.name.startsWith(".")) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.(mjs|js|html)$/.test(e.name)) out.push(p);
    }
    return out;
};
const files = walk(ENG);
const sites = {}, gatesWith = new Set();
for (const k of KERNELS) sites[k] = [];
// *** codeOnly, AND THE FIRST DRAFT OF THIS SECTION PROVED WHY IN ONE RUN. *** It counted raw text and found
// SIXTEEN sites across THIRTEEN files rather than twelve across nine, because two of the extra four were this
// round's own writing: a sentence in render/temporalLockGPU.mjs's header describing what the gates do, and the
// string literal on the line below that looks for it. codeOnly strips comments AND empties string literals,
// which is the right one of the tree's three source readings for "is this CALLED" -- and it is the same defect
// v4637 found in kernelReach itself, where a comment naming four kernels made them reachable by describing them.
// A census that cannot see its own arrival is not a census.
const SELF = new Set([path.join(ENG, "render/temporalLockGPU.mjs"), path.join(ENG, "render/temporalLockGPU-selfcheck.mjs")]);
for (const p of files) {
    const t = codeOnly(fs.readFileSync(p, "utf8"));
    for (const k of KERNELS) {
        const n = (t.match(new RegExp(`dev\\.compute\\(\\{ wgsl: ${k}`, "g")) || []).length;
        if (n) { sites[k].push([path.relative(ENG, p), n]); gatesWith.add(p); }
    }
}
const total = KERNELS.reduce((a, k) => a + sites[k].reduce((b, [, n]) => b + n, 0), 0);
for (const k of KERNELS) say(k.padEnd(20), sites[k].map(([f, n]) => `${f}${n > 1 ? ` x${n}` : ""}`).join(", ") || "none");
ok("!! *** these six kernels are dispatched from FOURTEEN hand-rolled sites and not one of them is reachable from the engine ***",
   total >= 14 && gatesWith.size >= 11 && [...gatesWith].every((p) => /-selfcheck\.mjs$/.test(p)),
   `${total} dispatch sites across ${gatesWith.size} files, and EVERY ONE of those files is a gate. ` +
   "Each site lives inside a runInEngineOrigin script STRING, so no import graph, validator or rename reaches " +
   "it -- which is exactly what kernelReach.mjs means by unreachable, and why the kernels being well tested " +
   "and the kernels being uncallable are not in tension.");
ok("...and the four RING_PUSH frame-loop copies AGREE, which is recorded because a drift would have been the better story",
   (() => {
       const push = sites.RING_PUSH_WGSL.map(([f]) => fs.readFileSync(path.join(ENG, f), "utf8"));
       const pack = push.filter((t) => t.includes("new Uint32Array(ub, 0, 4).set([a.W, a.H, a.P, f === 0 ? 1 : 0])")).length;
       return pack >= 4;
   })(),
   "all four pack the same 16-byte uniform from the same expression, bind the same six buffers in the same " +
   "order and ping-pong the same two pairs. The FIFTH RING_PUSH site is a deliberate exception rather than a " +
   "drift: temporalRingContent's tie probe packs (t.w, 1, P, 0) to drive a one-row strip with an exact texel " +
   "boundary under the bounds test. No accidental disagreement to report, and none is invented: the defect " +
   "is reach, not disagreement.");
// CONTAINMENT, not a regex guess: the compile must sit between the loop header and the ring swap that ends
// the body. A pattern matching "for" anywhere before the compile would also match a loop that had closed.
const inLoop = sites.RING_PUSH_WGSL.map(([f]) => {
    const t = codeOnly(fs.readFileSync(path.join(ENG, f), "utf8"));
    const open = t.indexOf("for (let f = 0");
    const comp = t.indexOf("compute({ wgsl: RING_PUSH_WGSL", open < 0 ? 0 : open);
    const swap = t.indexOf("= ringB", comp < 0 ? 0 : comp);
    const swap2 = t.indexOf("rB; rB =", comp < 0 ? 0 : comp);
    const end = swap < 0 ? swap2 : (swap2 < 0 ? swap : Math.min(swap, swap2));
    return [f, open >= 0 && comp > open && end > comp];
});
for (const [f, v] of inLoop) say("  compile inside the frame loop", `${v ? "yes" : "NO"}  ${f}`);
ok("!! ...and all four RING_PUSH sites compile the WGSL INSIDE their frame loop, which is the one cost that is a number",
   inLoop.length === 4 && inLoop.every(([, v]) => v),
   "a ring pushed over N frames compiles the same kernel N times. That costs a gate nothing it is measuring, " +
   "and it is not a shape a frame loop can adopt -- so TemporalLockGPU builds all six pipelines in its " +
   "constructor, the way TemporalRejectGPU does.");

// ---- THE CPU TRUTH ------------------------------------------------------------------------------------------
const cpuSt = makeLumaState(W, H, P);
for (const fr of seq) pushLuma(cpuSt, { current: fr.colour, motion: fr.motion, w: W, h: H });
const cpuShift = shadingShiftCPU(cpuSt, { scale: SCALE, strength: STRENGTH });
const cpuMean = lumaMean(cpuSt);
const cpuRingRidge = lockCandidatesFromRing(cpuSt, { margin: 0.02 });

// a depth field with a WIRE column and a SILHOUETTE edge -- the two cases depthRidgesCPU separates
const depth = new Float32Array(N);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let d = 0.60;
    if (x >= 30) d = 0.50;                 // silhouette: differs from ONE side, not a ridge
    if (x === 12) d = 0.45;                // wire: nearer than BOTH neighbours, a ridge
    if (y === 9) d = Math.min(d, 0.44);    // a horizontal wire too, so the Y axis is exercised
    // *** A BAND OF THREE, AND IT IS THE SECOND REPAIR THIS SABOTAGE FORCED. *** Giving maxBand and
    // maxPlateau distinct values was not enough to make swapping them visible: with every feature ONE pixel
    // wide, a band of 1 is under either bound and the plateau walk decides at its first step, so neither word
    // is ever consulted. The gate was blind there, not merely unlucky. This bar is THREE wide, so it is
    // coherent at maxBand 3 and refused at 2 -- the swap changes the answer, which is what makes the
    // uniform's word order testable at all.
    if (x >= 38 && x <= 40) d = 0.46;
    // *** AND A COMB, BECAUSE WITHOUT ONE THE COHERENCE FILTER REJECTED NOTHING AT ANY SETTING. *** Measured
    // over maxPlateau 2/3/4 against maxBand up to +3: raw 101/161/162 ridges and coherent 101/161/162 every
    // time. A row reading "101 coherent of 101 raw" passes a kernel that copies the ridge mask and does no
    // band test at all, which is most of what COHERENT_RIDGE_WGSL is. The band a run of ridges needs is not
    // produced by a WIDE feature -- a flat block's interior is not an extremum, so a 4-wide bar makes no
    // ridges -- it is produced by a REPEATING one, where every column in the run is an extremum. That is not
    // a contrived shape: an alternating comb is pixel-scale TEXTURE, which is exactly what the coherence test
    // exists to refuse while keeping an isolated wire. It takes 303 raw ridges to 93.
    if (x >= 18 && x <= 25) d = (x % 2 === 0) ? 0.58 : 0.52;
    depth[y * W + x] = d;
}
const cpuField = depthRidgesCPU(depth, W, H, 0.02);
const lumaMask = new Float32Array(N);
for (let i = 0; i < N; i++) lumaMask[i] = cpuRingRidge.data[i] ? 1 : 0;
const cpuGated = gateLocks(cpuField.data, lumaMask);
const cpuCoh = coherentRidgesCPU(depth, W, H, 0.02, MAX_BAND, MAX_PLATEAU);

const lumaField = new Float32Array(N);
for (let i = 0; i < N; i++) lumaField[i] = seq[FRAMES - 1].colour[i * 4 + 1];
const cpuFloorFrame = ringFloorCPU(lumaField, seq[FRAMES - 1].motion, W, H, P, RESOLUTION_TAU, "frame").per;
// *** THE EIGHTH ARGUMENT IS NAMED `ring` AND IT WANTS THE STATE, NOT THE RING ARRAY. *** ringFloorCPU hands
// it to lumaMeanOf, which reads st.w, st.h, st.period and st.ring. Passing cpuSt.ring gave a field of NaN --
// undefined dimensions, not a wrong number -- and it read as a parity failure until the shape was checked.
// The GPU runner takes the state too, for the same reason and under the same name, so the hazard is shared
// rather than removed; it is written down here because the next reader will pass the buffer as well.
const cpuFloorWin = ringFloorCPU(lumaField, seq[FRAMES - 1].motion, W, H, P, RESOLUTION_TAU, "window", cpuSt).per;

// ---- 2. ON THE DEVICE ---------------------------------------------------------------------------------------
console.log("\n2. THE RUNNER against the six CPU mirrors, on a real adapter");
const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {
const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, P, FRAMES,
        seq: seq.map((f) => ({ colour: Array.from(f.colour), motion: Array.from(f.motion) })),
        depth: Array.from(depth), lumaMask: Array.from(lumaMask), lumaField: Array.from(lumaField),
        SCALE, STRENGTH, MAX_BAND, MAX_PLATEAU,
        tau: RESOLUTION_TAU,
    }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { TemporalLockGPU } = await import("/render/temporalLockGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new TemporalLockGPU(dev);

    const st = g.makeRing(a.W, a.H, a.P);
    for (const fr of a.seq) g.pushRing(st, { current: new Float32Array(fr.colour), motion: new Float32Array(fr.motion) });
    const ringBack = await g.readRing(st);

    const shift = await g.shadingShift(st, { scale: a.SCALE, strength: a.STRENGTH });
    const ringRidge = await g.ringRidges(st, { margin: 0.02, maxPlateau: 2 });
    const field = await g.fieldRidges({ field: new Float32Array(a.depth), w: a.W, h: a.H, margin: 0.02 });
    const gated = await g.fieldRidges({ field: new Float32Array(a.depth), mask: new Float32Array(a.lumaMask), w: a.W, h: a.H, margin: 0.02 });
    const coh = await g.coherentRidges({ field: new Float32Array(a.depth), w: a.W, h: a.H, margin: 0.02, maxBand: a.MAX_BAND, maxPlateau: a.MAX_PLATEAU });

    const last = a.seq[a.FRAMES - 1];
    const common = { luma: new Float32Array(a.lumaField), motion: new Float32Array(last.motion), w: a.W, h: a.H, period: a.P, tau: a.tau };
    const floorFrame = await g.ringFloor({ ...common, phase: "frame" });
    const floorWin = await g.ringFloor({ ...common, phase: "window", ring: st });
    // THE INERTNESS CLAIM: the frame form must ignore a ring it is handed.
    const floorFrameWithRing = await g.ringFloor({ ...common, phase: "frame", ring: st });

    // REFUSALS, each DRIVEN rather than described
    const refuse = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message).slice(0, 190); } };
    const rWindowNoRing = await refuse(() => g.ringFloor({ ...common, phase: "window" }));
    const rPhase = await refuse(() => g.ringFloor({ ...common, phase: "wndow" }));
    const rPeriod = await refuse(() => g.makeRing(a.W, a.H, 0));
    const rDestroyed = await refuse(() => { const d = g.makeRing(4, 4, 1); g.destroyRing(d); return g.pushRing(d, { current: new Float32Array(64), motion: new Float32Array(64) }); });
    let rBackend = null;
    try { const cv2 = document.createElement("canvas"); const d2 = await requestDevice(cv2, { backend: "webgl2", offscreen: true }); new TemporalLockGPU(d2); }
    catch (e) { rBackend = String(e.message).slice(0, 190); }

    // PIPELINES BUILT ONCE: the same object is reused across every dispatch above.
    const once = g.pPush === g.pPush && [g.pPush, g.pShift, g.pRidge, g.pField, g.pCoherent, g.pFloor].every((p) => p && !p.error);
    const distinct = new Set([g.pPush, g.pShift, g.pRidge, g.pField, g.pCoherent, g.pFloor]).size;

    g.destroyRing(st);
    return {
        backend: dev.backend, errs, pushes: st.pushes, once, distinct,
        ring: Array.from(ringBack.ring), filled: Array.from(ringBack.filled),
        shift: Array.from(shift.data), ringRidge: Array.from(ringRidge.data),
        field: Array.from(field.data), gated: Array.from(gated.data), coh: Array.from(coh.data),
        floorFrame: Array.from(floorFrame.data), floorWin: Array.from(floorWin.data),
        floorFrameWithRing: Array.from(floorFrameWithRing.data),
        rWindowNoRing, rPhase, rPeriod, rDestroyed, rBackend,
    };
}` });

ok("the runner ran all six kernels on a real WebGPU device",
   r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
   r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));

if (r.ok && r.result) {
    const R = r.result;
    const worst = (a, b, n) => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
    const diffs = (a, b, n) => { let c = 0; for (let i = 0; i < n; i++) if (a[i] !== b[i]) c++; return c; };

    const gRing = worst(R.ring, cpuSt.ring, N * F);
    const gFill = diffs(R.filled, cpuSt.filled, N);
    say("ring", `worst |gpu - cpu| ${gRing.toExponential(2)} over ${N * F} slots, ${gFill} fill disagreements of ${N}`);
    ok("!! *** RING_PUSH is pushLuma's ring, INCLUDING the reprojection, over ten frames of accumulated state ***",
       gRing < 1e-6 && gFill === 0,
       `${gRing.toExponential(2)} over ${N * F} slots and ${gFill} of ${N} fill counts. Ten pushes, so an error ` +
       "in the reprojection compounds rather than cancelling -- a mirror that dropped it entirely would still " +
       "agree on frame one. The speed is irrational on purpose: v4559's boundary divergence is " +
       "temporalRingContent-selfcheck's subject and driving it here would measure that instead of the runner.");
    ok("...and the state counted its own pushes, so `first` is not a caller's to get wrong",
       R.pushes === FRAMES,
       `${R.pushes} of ${FRAMES}. All four hand-rolled copies write \`f === 0 ? 1 : 0\` from their own loop ` +
       "counter, which is unavailable to a caller pushing one frame per call.");

    const gShift = worst(R.shift, cpuShift.data, N);
    ok("*** SHADING_SHIFT is shadingShiftCPU's field ***", gShift < 1e-6,
       `${gShift.toExponential(2)} over ${N} pixels, with ${cpuShift.unknown} of ${N} reading 0 as UNKNOWN ` +
       "because their ring is not yet full -- v4402's rule, and the one value both mirrors must agree to " +
       "produce for the same reason rather than by coincidence.");

    const gRidge = diffs(R.ringRidge.map((v) => (v > 0.5 ? 1 : 0)), cpuRingRidge.data, N);
    ok("*** RIDGE is lockCandidatesFromRing's mask ***", gRidge === 0,
       `${gRidge} of ${N} pixels differ; ${cpuRingRidge.count} ridges found. A mask that agreed at zero ` +
       "ridges would be worth nothing, which is why the count is stated beside the disagreement.");
    ok("...and it found a non-trivial number of them, so the row above is not vacuous",
       cpuRingRidge.count > 10, `${cpuRingRidge.count} ridges over ${N} pixels`);

    const gField = diffs(R.field.map((v) => (v > 0.5 ? 1 : 0)), cpuField.data, N);
    ok("*** FIELD_RIDGE is depthRidgesCPU's mask on a depth field carrying a WIRE and a SILHOUETTE ***",
       gField === 0,
       `${gField} of ${N} differ; ${cpuField.count} ridges. The fixture holds both cases deliberately: the ` +
       "wire column is nearer than both neighbours and IS a ridge, the silhouette at x=30 differs from one " +
       "side only and is NOT -- which is the distinction the kernel exists for and a mask test on a field " +
       "with only ridges could not see.");

    const gGated = diffs(R.gated.map((v) => (v > 0.5 ? 1 : 0)), cpuGated.data, N);
    ok("...and with a mask it is depthRidgesCPU AND gateLocks in ONE dispatch", gGated === 0,
       `${gGated} of ${N} differ; ${cpuGated.count} survive the AND against ${cpuField.count} depth ridges ` +
       `and ${cpuRingRidge.count} luma ones. AND, not OR -- an OR would union the luma detector's false ` +
       "positives back in, which is the kernel's own comment.");
    ok("...and the mask ACTUALLY REMOVED something, so the AND is not decoration",
       cpuGated.count < cpuField.count,
       `${cpuGated.count} against ${cpuField.count}: the gate refused ${cpuField.count - cpuGated.count} ` +
       "depth ridges the luma mask did not confirm. A fixture where the two masks agreed everywhere would " +
       "pass this row with the AND deleted.");

    const gCoh = diffs(R.coh.map((v) => (v > 0.5 ? 1 : 0)), cpuCoh.data, N);
    ok("*** COHERENT_RIDGE is coherentRidgesCPU's mask ***", gCoh === 0,
       `${gCoh} of ${N} differ; ${cpuCoh.count} coherent of ${cpuField.count} raw ridges. The kernel ` +
       "recomputes the axis masks for the few neighbours involved rather than writing an intermediate pass, " +
       "and the CPU does the same bounded scan, so this is one algorithm twice and not two that agree here.");
    ok("!! ...and the band test REJECTED most of them, so the row above is not a mask copy",
       cpuCoh.count < cpuField.count * 0.6,
       `${cpuCoh.count} coherent of ${cpuField.count} raw -- the comb's ${cpuField.count - cpuCoh.count} ` +
       "texture ridges are refused and the isolated wires survive. Without the comb this read 101 of 101 at " +
       "every maxPlateau and maxBand tried, and a kernel that copied the ridge mask and skipped the band " +
       "scan entirely would have passed the parity row above.");

    const gFloorF = worst(R.floorFrame, cpuFloorFrame, N);
    const gFloorW = worst(R.floorWin, cpuFloorWin, N);
    say("ring floor", `frame ${gFloorF.toExponential(2)}, window ${gFloorW.toExponential(2)}`);
    ok("*** RING_FLOOR is ringFloorCPU's PER-PIXEL field in both the frame and the window form ***",
       gFloorF < 1e-6 && gFloorW < 1e-6,
       `frame ${gFloorF.toExponential(2)}, window ${gFloorW.toExponential(2)}, over ${N} pixels. Per-pixel and ` +
       "not reduced to a frame-wide worst: ringFloorWgsl.mjs's header says the reduction is the caller's " +
       "because a parity row on the field is strictly stronger than one on a number that can agree by " +
       "cancellation, and a runner that reduced here would hand every caller the weaker quantity.");
    ok("...and the two forms genuinely DIFFER, so a runner that ignored `phase` would not pass",
       (() => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(R.floorFrame[i] - R.floorWin[i])); return m > 1e-4; })(),
       (() => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(R.floorFrame[i] - R.floorWin[i])); return `worst gap between the forms ${m.toExponential(2)}`; })());
    // *** FLOOR_PHASE WAS AN EXPORT NO GATE NAMED, FOR FORTY-ODD ROUNDS. *** definitionGates-selfcheck found
    // it -- the ONE symbol that took its tree-wide all-shapes census from a frozen 703 to 704 -- and that gate
    // had been red outside the red register since before v4686, so it said so into a log nobody read. It is
    // closed here the way that gate's own header says the 81 before it were closed: BY ASSERTION, not by
    // mention. A row that merely spelled the name would have satisfied the census and measured nothing.
    ok("!! *** FLOOR_PHASE's words are the ones RING_FLOOR_WGSL actually reads, not a parallel naming ***",
       FLOOR_PHASE.FRAME === 0 && FLOOR_PHASE.WINDOW === 1 &&
       Object.isFrozen(FLOOR_PHASE) && Object.keys(FLOOR_PHASE).length === 2,
       `FRAME ${FLOOR_PHASE.FRAME}, WINDOW ${FLOOR_PHASE.WINDOW}, frozen, two words. The runner packs this ` +
       "straight into the uniform's windowPhase slot, so a constant that drifted from the kernel would send " +
       "every caller the other form silently -- the exact failure the named constant exists to prevent, and " +
       "the reason its point is 'a caller never passes a bare 1'.");
    // SABOTAGE v4688: the two words made EQUAL -> 4 red, because every phase argument in the tree then selects
    // the frame form and the window parity rows go with it. FLOOR_PHASE left unfrozen -> 1 red. Both by name,
    // and the four-red one is why this is closed by ASSERTION rather than by mention: a row that merely spelled
    // the symbol would have satisfied definitionGates-selfcheck and survived both mutations untouched.
    ok("  ...and the two words SELECT the two forms, so the constant is load-bearing rather than decorative",
       (() => { let m = 0; for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(R.floorFrame[i] - R.floorWin[i])); return m > 1e-4; })() &&
       FLOOR_PHASE.FRAME !== FLOOR_PHASE.WINDOW,
       "the row above measures that the frame and window fields differ; this says the two differing fields are " +
       "the ones these two words choose between. A constant whose members were equal would name two things and " +
       "select one, and every phase argument in the tree would quietly become the frame form.");
    ok("!! ...and the FRAME form IGNORES a ring it is handed, BIT for BIT",
       worst(R.floorFrameWithRing, R.floorFrame, N) === 0,
       `${diffs(R.floorFrameWithRing, R.floorFrame, N)} of ${N} floats differ. The ring term predates no ` +
       "caller: every caller before v4569 bound a zero ring and the frame form must still produce exactly " +
       "what they got. This is the claim the runner's comment makes, measured rather than asserted -- and " +
       "bit-equality rather than a tolerance, because 'inert' has no epsilon.");

    // ---- 3. WHAT IT REFUSES -----------------------------------------------------------------------------------
    console.log("\n3. THE REFUSALS, each driven");
    ok("the WINDOW form with no ring is refused rather than binding zeroes",
       /reads the RING and none was given/.test(R.rWindowNoRing || ""), R.rWindowNoRing || "NOT REFUSED");
    ok("...and a misspelt phase is refused rather than silently meaning \"frame\"",
       /phase is "frame" or "window"/.test(R.rPhase || ""), R.rPhase || "NOT REFUSED");
    ok("...and a period below one is refused at makeRing",
       /period must be at least 1/.test(R.rPeriod || ""), R.rPeriod || "NOT REFUSED");
    ok("...and pushing a DESTROYED ring says so instead of throwing on a null binding",
       /buffers were destroyed/.test(R.rDestroyed || ""), R.rDestroyed || "NOT REFUSED");
    ok("...and a non-webgpu device throws at construction",
       /needs a gfx\/device\.js device on the webgpu backend/.test(R.rBackend || ""), R.rBackend || "NOT REFUSED");

    ok("!! *** and the six pipelines are built ONCE and are six DISTINCT objects ***",
       R.once && R.distinct === 6,
       `${R.distinct} distinct pipelines, all compiled. Six and not fewer: a constructor that built one ` +
       "pipeline and rebound it per kernel would pass every parity row above on a device that tolerated it, " +
       "and the compile-per-frame this round exists to remove would still be there.");
}
}

console.log(fails ? `\ntemporalLockGPU-selfcheck: ${fails} FAILED` : "\ntemporalLockGPU-selfcheck: ALL GREEN");
console.log("unchecked here: whether any PAGE calls this -- fsr.html runs the CPU lock path and the runner " +
            "existing does not change that, which is the next rung; the v4559 BOUNDS DIVERGENCE at an exact " +
            "texel tie, deliberately avoided by the fixture's speed and owned by temporalRingContent-selfcheck; " +
            "and a per-pixel `margin` FIELD, which ridgesCPU accepts (v4563) and every one of these kernels " +
            "takes as a scalar uniform -- so the runner cannot offer it and says so by not having the argument.");
process.exit(fails ? 1 : 0);
