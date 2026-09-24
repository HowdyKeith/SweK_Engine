#!/usr/bin/env node
// WebGLEngine/render/frameInterpGPU-selfcheck.mjs -- v4686
//
// FRAME GENERATION ON THE DEVICE, AND THE ONE GENUINELY HARD PORT IN THIS ARC.
//
// *** THE SPLAT IS A SCATTER WITH A DEPTH COMPARE. *** On the CPU, blocks are visited in index order and
// "strictly nearer wins" means the first block to claim a pixel keeps it against an equal-depth challenger. On
// a device every block runs at once, so a plain write returns whichever invocation the scheduler happened to
// run last -- an answer about the hardware. render/frameInterpWgsl.mjs reproduces the CPU's rule in three
// dispatches: atomicMin a monotonic depth KEY, then atomicMin the BLOCK INDEX among those that tied that key,
// then gather. Among equal depths the lowest index wins, and the CPU visits indices ascending, so the two
// sentences are the same sentence.
//
// *** WHICH MEANS THE ROW THAT MATTERS MOST HERE IS THE FLAT ONE. *** On content where every block sits at one
// depth, EVERY contested pixel is a tie, so a mirror that resolved ties any other way disagrees on all of them
// while agreeing perfectly on any scene with depth variation. That is the mirror image of v4685's finding, where
// a constant-depth rig could not test a nearest-pixel rule at all.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { INTERP_WGSL, INTERP_STRIDE, NO_OWNER } from "./frameInterpWgsl.mjs";
import { interpolateFrameCPU } from "./frameInterp.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

const W = 64, H = 64, B = 8;
const bw = W / B, bh = H / B;
let sd = 17;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
/** Two frames of smoothed noise, the second a bilinear shift of the first. */
function pair(shiftX, shiftY) {
    const base = new Float32Array((W + 32) * (H + 32));
    for (let i = 0; i < base.length; i++) base[i] = rnd();
    const sm = new Float32Array((W + 32) * (H + 32));
    for (let y = 2; y < H + 30; y++) for (let x = 2; x < W + 30; x++) {
        let a = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) a += base[(y + j) * (W + 32) + (x + i)];
        sm[y * (W + 32) + x] = a / 25;
    }
    const at = (fx, fy) => { const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const g = (x, y) => sm[Math.min(H + 31, Math.max(0, y + 16)) * (W + 32) + Math.min(W + 31, Math.max(0, x + 16))];
        return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty; };
    const mk = (ox, oy) => { const o = new Float32Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = at(x + ox, y + oy), i = y * W + x;
            o[i * 4] = c; o[i * 4 + 1] = c; o[i * 4 + 2] = c; o[i * 4 + 3] = 1; } return o; };
    return { prev: mk(0, 0), cur: mk(shiftX, shiftY) };
}
/** One case for both engines. */
function mkCase({ shiftX = 3.4, shiftY = -1.6, depthMode = "flat", indexedBy = "cur", t = 0.5,
                  vary = null, decline = null, nearerIsLess = true } = {}) {
    const { prev, cur } = pair(shiftX, shiftY);
    const flow = new Float32Array(bw * bh * 2);
    for (let i = 0; i < bw * bh; i++) { flow[i * 2] = shiftX; flow[i * 2 + 1] = shiftY; }
    if (vary) for (const [i, vx, vy] of vary) { flow[i * 2] = vx; flow[i * 2 + 1] = vy; }
    if (decline) for (const i of decline) { flow[i * 2] = NaN; flow[i * 2 + 1] = NaN; }
    const depthBlock = new Float32Array(bw * bh);
    for (let i = 0; i < bw * bh; i++)
        depthBlock[i] = depthMode === "flat" ? 0.5
            : depthMode === "checker" ? (((i % bw) + Math.floor(i / bw)) % 2 ? 0.9 : 0.2)
            : -0.9 + 1.8 * ((i * 37) % 101) / 101;      // signed, to exercise the key's sign handling
    return { prev, cur, w: W, h: H, flow, bw, bh, block: B, depthBlock, indexedBy, t, nearerIsLess };
}

console.log("frameInterpGPU-selfcheck -- the scatter on a device, and the tie rule that survives it\n");

console.log("1. THE KERNEL, AND WHAT IT SAYS ABOUT ITSELF");
{
    const errs = validateWgsl(INTERP_WGSL);
    ok("the WGSL validates against the spec scanner", errs.length === 0, errs.join("; "));
    ok("*** the kernel has THREE entry points, because the scatter cannot be one dispatch ***",
       /fn splatDepth/.test(INTERP_WGSL) && /fn splatOwner/.test(INTERP_WGSL) && /fn gather/.test(INTERP_WGSL),
       "splatDepth settles which depth wins each pixel, splatOwner which BLOCK at that depth claims it, gather warps. " +
       "Merged, splatOwner would read a key splatDepth is still writing -- the race the construction exists to remove.");
    ok("*** and the depth key is the order-preserving float-to-uint map, not a cast ***",
       /if \(\(b & 0x80000000u\) != 0u\) \{ k = ~b; \} else \{ k = b \| 0x80000000u; \}/.test(INTERP_WGSL),
       "clip-space z is SIGNED and IEEE floats do not compare as unsigned across zero, so an atomicMin on a raw " +
       "bitcast would order negative depths backwards -- and a scene whose depths are all positive would never show it.");
    ok("...and the sentinel is the largest u32, so an uninitialised slot loses every atomicMin",
       NO_OWNER === 0xffffffff && INTERP_STRIDE === 4, `NO_OWNER ${NO_OWNER}, stride ${INTERP_STRIDE}`);
}

const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {

const CASES = {
    flat: mkCase({ depthMode: "flat" }),
    checker: mkCase({ depthMode: "checker" }),
    signed: mkCase({ depthMode: "signed" }),
    prevIndexed: mkCase({ depthMode: "checker", indexedBy: "prev" }),
    t0: mkCase({ depthMode: "checker", t: 0 }),
    t1: mkCase({ depthMode: "checker", t: 1 }),
    // blocks aimed at each other's footprints, so pixels are genuinely contested
    contested: mkCase({ depthMode: "checker", vary: [[9, 8, 0], [10, -8, 0], [17, 0, 8], [25, 0, -8]] }),
    declined: mkCase({ depthMode: "checker", decline: [0, 10, 63] }),
    zeroMotion: mkCase({ shiftX: 0, shiftY: 0, depthMode: "flat" }),
    // *** nearerIsLess REVERSED, ON CONTESTED PIXELS, BECAUSE A SABOTAGE IGNORING THE FLAG SCORED 0 RED. ***
    // Every other case leaves it at its default, so a kernel that dropped the complement in its depth key
    // agreed with the CPU everywhere. The contested geometry is what makes the flag decide anything at all.
    fartherWins: mkCase({ depthMode: "checker", nearerIsLess: false,
                          vary: [[9, 8, 0], [10, -8, 0], [17, 0, 8], [25, 0, -8]] }),
};
const cpu = {};
for (const [k, c] of Object.entries(CASES)) cpu[k] = interpolateFrameCPU(c);
const payload = {};
for (const [k, c] of Object.entries(CASES)) payload[k] = { prev: Array.from(c.prev), cur: Array.from(c.cur),
    w: W, h: H, flow: Array.from(c.flow), bw, bh, block: B, depthBlock: Array.from(c.depthBlock),
    indexedBy: c.indexedBy, t: c.t, nearerIsLess: c.nearerIsLess };

const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 1200000, args: { payload }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { FrameInterpGPU } = await import("/render/frameInterpGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = [];
    if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new FrameInterpGPU(dev);
    const out = {};
    for (const [k, p] of Object.entries(a.payload)) {
        const res = await g.interpolate({ ...p, prev: Float32Array.from(p.prev), cur: Float32Array.from(p.cur),
            flow: Float32Array.from(p.flow), depthBlock: Float32Array.from(p.depthBlock) });
        out[k] = { frame: Array.from(res.frame), hole: Array.from(res.hole), holes: res.holes,
                   vec: Array.from(res.vec), zbuf: Array.from(res.zbuf) };
    }
    const bad = [];
    for (const [label, patch] of [["block", { block: 8.5 }], ["grid", { bh: 7 }], ["t", { t: 1.5 }],
                                  ["depthBlock", { depthBlock: null }], ["indexedBy", { indexedBy: undefined }]]) {
        const p = a.payload.flat;
        try { await g.interpolate({ ...p, prev: Float32Array.from(p.prev), cur: Float32Array.from(p.cur),
                flow: Float32Array.from(p.flow), depthBlock: Float32Array.from(p.depthBlock), ...patch });
              bad.push([label, null]); }
        catch (e) { bad.push([label, String(e.message)]); }
    }
    let wrongBackend = null;
    try { const c2 = document.createElement("canvas");
          new FrameInterpGPU(await requestDevice(c2, { backend: "webgl2", offscreen: true })); }
    catch (e) { wrongBackend = String(e.message).slice(0, 160); }
    // What this adapter does converting a NaN to an integer, which decides whether the decline guard is
    // reachable at all. Measured through the same device, with a throwaway kernel.
    // ONE LINE, NO ESCAPES: this script is a template literal, so a backslash-n inside a quoted string here is
    // consumed when the literal is parsed and leaves a real newline in the middle of a JS string. WGSL is not
    // newline-sensitive, so the whole kernel goes on one line and the problem cannot arise.
    const probe = dev.compute({ wgsl: "struct U { nan:f32, inf:f32 }; @group(0) @binding(0) var<uniform> u:U; @group(0) @binding(1) var<storage,read_write> o:array<i32>; @compute @workgroup_size(1) fn main() { o[0] = i32(round(u.nan)); o[1] = i32(round(u.inf)); }",
        entryPoint: "main" });
    const pb = new ArrayBuffer(8); new Float32Array(pb).set([NaN, Infinity]);
    const pu = dev.buffer({ data: new Uint8Array(pb), usage: "uniform" });
    const po = dev.buffer({ data: new Int32Array(2), usage: ["storage"] });
    probe.bind("u", pu).bind("o", po);
    dev.frame(({ pass }) => { pass.dispatch(probe, [1, 1]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
    const pr = new Int32Array(await dev.read(po));
    pu.destroy(); po.destroy();
    return { out, bad, backend: dev.backend, errs, wrongBackend, nanToI32: pr[0], infToI32: pr[1] };
}` });

if (!r.ok) { ok("the device ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`); }
else {
const G = r.result.out;
say(`adapter ${r.adapter ? (r.adapter.description || r.adapter.vendor) : "unknown"}${r.software ? " (SOFTWARE)" : ""}, backend ${r.result.backend}`);
ok("*** three dispatches ran on a real WebGPU device with NO uncaptured errors ***",
   r.result.backend === "webgpu" && r.result.errs.length === 0,
   `backend ${r.result.backend}; errors ${JSON.stringify(r.result.errs)}`);
ok("...and a non-webgpu device is refused at construction",
   /needs a gfx\/device\.js device on the webgpu backend/.test(r.result.wrongBackend || ""), r.result.wrongBackend);

const cmp = (k) => {
    const c = cpu[k], d = G[k];
    let holeDiff = 0, worstFrame = 0, worstVec = 0, worstZ = 0, nanMis = 0;
    for (let i = 0; i < W * H; i++) {
        if (c.hole[i] !== d.hole[i]) holeDiff++;
        for (let ch = 0; ch < 4; ch++) worstFrame = Math.max(worstFrame, Math.abs(c.frame[i * 4 + ch] - d.frame[i * 4 + ch]));
        for (const [a, b] of [[c.vec[i * 2], d.vec[i * 2]], [c.vec[i * 2 + 1], d.vec[i * 2 + 1]], [c.zbuf[i], d.zbuf[i]]]) {
            if (Number.isNaN(a) !== Number.isNaN(b)) nanMis++;
            else if (!Number.isNaN(a) && Number.isFinite(a) && Number.isFinite(b)) {
                if (a === c.zbuf[i]) worstZ = Math.max(worstZ, Math.abs(a - b));
                else worstVec = Math.max(worstVec, Math.abs(a - b));
            }
        }
    }
    return { holeDiff, worstFrame, worstVec, worstZ, nanMis, cpu: c, dev: d };
};

console.log("\n2. *** THE TIE RULE, ON FLAT DEPTH WHERE EVERY CONTESTED PIXEL IS A TIE ***");
{
    const f = cmp("flat"), z = cmp("zeroMotion");
    say(`flat depth, shift (3.4, -1.6): CPU ${f.cpu.holes} holes, device ${f.dev.holes}; hole mask differs on ${f.holeDiff} pixels`);
    ok("*** every pixel's OWNER matches the CPU's on flat depth -- the atomicMin-on-index rule IS \"the first writer keeps it\" ***",
       f.holeDiff === 0 && f.worstVec < 1e-4 && f.nanMis === 0,
       `hole mask identical on all ${W * H} pixels, worst |vec| ${f.worstVec.toExponential(2)} px, ${f.nanMis} NaN mismatches. ` +
       `Every block here is at depth 0.5, so EVERY contested pixel is a tie and a mirror resolving them any other way disagrees on all of them.`);
    ok("...and the generated frame agrees to f32 through two bilinear fetches and a blend",
       f.worstFrame < 2e-6, `worst |frame| ${f.worstFrame.toExponential(2)} on a [0,1] signal`);
    ok("*** and at ZERO motion both engines produce the cross-fade with no hole, which is the degenerate case a scatter most easily breaks ***",
       z.holeDiff === 0 && z.dev.holes === 0 && z.worstFrame < 2e-6,
       `${z.dev.holes} holes, worst |frame| ${z.worstFrame.toExponential(2)}. At zero motion every block lands on its own footprint and every pixel is claimed exactly once.`);
}

console.log("\n3. DEPTH THAT VARIES, INCLUDING NEGATIVE -- WHERE A RAW BITCAST WOULD ORDER BACKWARDS");
{
    const c = cmp("checker"), s = cmp("signed"), x = cmp("contested");
    for (const [k, v] of [["checker", c], ["signed", s], ["contested", x]])
        say(`${k.padEnd(9)} CPU ${v.cpu.holes} holes, device ${v.dev.holes}; mask differs ${v.holeDiff}; worst |vec| ${v.worstVec.toExponential(2)}, |zbuf| ${v.worstZ.toExponential(2)}, |frame| ${v.worstFrame.toExponential(2)}`);
    ok("*** the device matches on alternating depths, on SIGNED depths spanning zero, and on blocks aimed into each other's footprints ***",
       [c, s, x].every((v) => v.holeDiff === 0 && v.worstVec < 1e-4 && v.nanMis === 0),
       [["checker", c], ["signed", s], ["contested", x]].map(([k, v]) => `${k}: ${v.holeDiff} mask differences`).join("; ") +
       ". The signed case is the one that fails on a raw bitcast: half its depths are negative, and IEEE floats compare backwards as unsigned there.");
    ok("...and the winner's DEPTH is carried out too, which render/holeFill.mjs reads and a later round needs",
       [c, s, x].every((v) => v.worstZ < 1e-6),
       `worst |zbuf| ${Math.max(c.worstZ, s.worstZ, x.worstZ).toExponential(2)} -- the depth the contest was settled on, per pixel`);
    ok("*** and the contested case really is contested, so this is not a row where nothing overlaps ***",
       x.dev.holes !== cpu.checker.holes,
       `four blocks aimed a full block sideways: ${x.dev.holes} holes against the uncontested ${cpu.checker.holes}. Overlap changes the mask, which is what says pixels were fought over.`);
}

console.log("\n4. THE INDEXING AND THE ENDPOINTS, WHICH MIRROR EACH OTHER");
{
    const p = cmp("prevIndexed"), z0 = cmp("t0"), z1 = cmp("t1");
    say(`prev-indexed: CPU ${p.cpu.holes} holes, device ${p.dev.holes};  t=0: ${z0.cpu.holes}/${z0.dev.holes};  t=1: ${z1.cpu.holes}/${z1.dev.holes}`);
    ok("*** the device honours indexedBy, and a cur-indexed field is hole-free at t=1 where a prev-indexed one is at t=0 ***",
       p.holeDiff === 0 && z0.holeDiff === 0 && z1.holeDiff === 0 && z1.dev.holes === 0 && z0.dev.holes > 0,
       `prev-indexed mask differs on ${p.holeDiff}; t=0 ${z0.dev.holes} holes, t=1 ${z1.dev.holes}. ` +
       `v4680 measured that feeding the wrong indexing costs 7.35 dB on a silhouette, and there is no default on either engine.`);
    ok("...and at t=1 the device reproduces `cur` exactly, as the CPU does",
       (() => { let w = 0; for (let i = 0; i < W * H * 4; i++) if (!z1.dev.hole[i >> 2]) w = Math.max(w, Math.abs(z1.dev.frame[i] - CASES.t1.cur[i])); return w < 2e-6; })(),
       "a cur-indexed block ENDS on its own footprint, so t = 1 is a copy on both engines");
}

console.log("\n5. A FIELD THAT DECLINES, AND NOT ONE NaN IN THE FRAME");
{
    const d = cmp("declined");
    let nans = 0;
    for (let i = 0; i < W * H * 4; i++) if (Number.isNaN(d.dev.frame[i])) nans++;
    say(`three blocks with NaN vectors: CPU ${d.cpu.holes} holes, device ${d.dev.holes}; mask differs ${d.holeDiff}; NaN in the device frame: ${nans}`);
    ok("*** a declined block becomes a hole on the device too, and NOT ONE NaN reaches the frame ***",
       d.holeDiff === 0 && nans === 0 && d.dev.holes > cpu.checker.holes,
       `${nans} NaN in ${W * H * 4} floats; ${d.dev.holes} holes against the undeclined ${cpu.checker.holes}. ` +
       `The kernel tests the vector's MAGNITUDE against the f32 ceiling, which refuses NaN and infinity alike -- WGSL has no isNan.`);
    ok("...and the holes carry NaN vectors rather than zeros, so nothing downstream mistakes one for a generated pixel",
       (() => { let bad = 0; for (let i = 0; i < W * H; i++) if (d.dev.hole[i] && !Number.isNaN(d.dev.vec[i * 2])) bad++; return bad === 0; })(),
       "every holed pixel's vector is NaN on the device, as it is on the CPU");
}

console.log("\n6. THE FLAG, AND THE UNDEFINED CONVERSION THAT HIDES A GUARD");
{
    const f = cmp("fartherWins"), c = cmp("contested");
    say(`nearerIsLess FALSE on contested pixels: CPU ${f.cpu.holes} holes, device ${f.dev.holes}; mask differs ${f.holeDiff}`);
    ok("*** the device honours nearerIsLess, and reversing it CHANGES the answer -- a kernel ignoring the flag scored 0 RED until this case existed ***",
       f.holeDiff === 0 && f.worstVec < 1e-4
       && (() => { let d = 0; for (let i = 0; i < W * H; i++) if (f.dev.vec[i * 2] !== c.dev.vec[i * 2]) d++; return d > 0; })(),
       `mask differs on ${f.holeDiff} pixels from the CPU, and ` +
       `${(() => { let d = 0; for (let i = 0; i < W * H; i++) if (f.dev.vec[i * 2] !== c.dev.vec[i * 2]) d++; return d; })()} pixels ` +
       `hold a DIFFERENT vector than the same case with the flag at its default. The kernel complements the depth key rather than ` +
       `branching, so one atomicMin serves both directions -- and every other case here leaves the flag alone, which is why the sabotage was invisible.`);
    // *** AND THE DECLINE GUARD CANNOT BE REACHED ON THIS ADAPTER, WHICH IS MEASURED RATHER THAN ASSUMED. ***
    ok("*** i32(round(NaN)) is INT_MIN on this adapter, which is why removing the decline guard scored 0 RED -- and is UNDEFINED in WGSL, which is why the guard stays ***",
       r.result.nanToI32 === -2147483648,
       `measured on the device: i32(round(NaN)) = ${r.result.nanToI32}, i32(round(Infinity)) = ${r.result.infToI32}. ` +
       `A declined block therefore lands at INT_MIN, its whole footprint falls outside the frame, and the pixel-bounds tests discard it -- ` +
       `accidentally reproducing what the guard does on purpose. WGSL leaves float-to-int conversion of a NaN UNDEFINED, so an adapter ` +
       `returning 0 instead would splat that block at the ORIGIN carrying a NaN vector and put NaN into the frame. The guard is not a ` +
       `no-op; it is unreachable HERE, and the difference is the whole point of writing this down.`);
}

console.log("\n7. WHAT THE RUNNER REFUSES, ON THE DEVICE");
{
    const bad = Object.fromEntries(r.result.bad);
    for (const [label, pat] of [["block", /whole number of pixels/], ["grid", /does not cover the frame/],
                                ["t", /t must be in/], ["depthBlock", /depthBlock must be bw\*bh/],
                                ["indexedBy", /indexedBy must be "prev" or "cur"/]])
        ok(`a bad ${label} is refused by the runner, in the page, with the CPU's own wording`,
           bad[label] !== null && pat.test(bad[label] || ""), bad[label]);
}
}
}

// ---- THE SABOTAGE LOG ------------------------------------------------------------------------------------
//
// *** A CONTROL THAT CANNOT FAIL IS DECORATION, SO EVERY ROW ABOVE WAS BROKEN ON PURPOSE AND WATCHED. ***
// Ten mutations of the kernel and its runner, each reverted.
//
//   W1  ties go to the HIGHEST block index instead of the lowest        -> 6 red (2, 3, 4, 5)
//   W2  any block may claim, not only those that tied the winning depth  -> 2 red (3)
//   W3  the depth key is a raw bitcast                                  -> 1 red (1)
//   W5  the two indexings are swapped                                   -> 6 red (2, 3, 4, 5)
//   W7  the backward sample walks the wrong way                         -> 1 red (2)
//   W8  the blend weights are swapped                                   -> 1 red (4)
//   W9  the owner dispatch is dropped                                   -> 6 red (2, 3, 4, 5)
//   W10 the owner buffer starts at zero instead of the sentinel          -> 6 red (2, 3, 4, 5)
//   W4  nearerIsLess is accepted and ignored                            -> 1 red (6), AFTER A CASE WAS ADDED
//
// *** W1 IS THE ONE THIS WHOLE CONSTRUCTION EXISTS FOR. *** Resolving ties by the highest block index instead of
// the lowest reddens six rows, which is what says the three-dispatch atomicMin really is the CPU's "strictly
// nearer, so the first writer keeps it" and not merely something that agrees on scenes with depth variation.
//
// *** W4 SCORED 0 RED BECAUSE EVERY CASE LEFT THE FLAG AT ITS DEFAULT. *** A kernel dropping the complement from
// its depth key agreed with the CPU on all nine cases. Section 6 drives nearerIsLess FALSE on contested pixels,
// where 432 pixels then hold a different vector than the same geometry at the default, and W4 reddens.
//
// *** AND W6 -- WARPING A DECLINED (NaN) VECTOR ANYWAY -- SCORES 0 RED FOR A REASON THAT IS MEASURED AND IS NOT
// EQUIVALENCE. *** The gate asks the device directly: i32(round(NaN)) is -2147483648 on this adapter, so a
// declined block lands at INT_MIN, its whole footprint falls outside the frame, and the pixel-bounds tests
// discard it -- accidentally doing what the guard does on purpose. WGSL leaves float-to-int conversion of a NaN
// UNDEFINED. An adapter returning 0 would splat that block at the ORIGIN carrying a NaN vector and put NaN into
// the frame. So the guard is NOT a no-op like v4675's denominator guard or v4677's own NaN skip; it is
// unreachable HERE, on this hardware, and section 6 measures the conversion so the distinction is a number
// rather than a hope. This is the first 0-RED in the arc whose cause is undefined behaviour.
//
// *** AND TWO OF THE ROUND'S OWN DEFECTS WERE IN HOW THE RUNNER TALKS TO gfx/device.js, NOT IN THE ALGORITHM. ***
// (1) The option is `entryPoint`; passing `entry` is silently ignored and every pipeline is built for a function
// called main, which this module does not have -- surfacing only as "Invalid ComputePipeline" from the first
// dispatch, with the shader itself compiling clean. (2) device.js classifies bindings PER ENTRY POINT and refuses
// a name the entry does not declare, so the three pipelines bind only what each of them uses. And the probe
// kernel added for the NaN measurement first carried a backslash-n inside a quoted string inside this file's
// template literal, which the literal consumed and left a real newline mid-string: the seventh backtick-or-escape
// casualty in this arc, now avoided by keeping that kernel on one line.

console.log(`\nframeInterpGPU-selfcheck: ${fails ? `${fails} FAILED` : "ALL GREEN"}`);
console.log("unchecked here: THE FILL. render/holeFill.mjs is a separate pass and this runner does not take " +
    "`fill` at all, so the device path generates a frame WITH ITS HOLES STILL IN IT -- the CPU's default, and a " +
    "later round's subject. NO TIMING CLAIM: SwiftShader again, and three dispatches plus two readbacks is not " +
    "a number anybody should quote as a speed. THE SUBMISSION BOUNDARIES ARE ASSUMED, NOT MEASURED: the runner " +
    "issues one frame() per dispatch because splatOwner must not read a key splatDepth is still writing, and " +
    "nothing here proves that two dispatches inside ONE frame() would actually race -- it would be a flaky row " +
    "if it did. AND THE PAGE STILL CALLS THE CPU: fsr.html's generator uses interpolateFrameCPU, so this mirror " +
    "is gate-only until a round wires it, which is exactly the debt v4685 refused to let accumulate.");
process.exit(fails ? 1 : 0);
