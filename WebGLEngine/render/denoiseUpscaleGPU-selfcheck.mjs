#!/usr/bin/env node
// WebGLEngine/render/denoiseUpscaleGPU-selfcheck.mjs -- round 31 (backlog denoise-halfres-rig-timing): round 30's
// emitter-aware chain on a device, held to its CPU references before the rig times it.
//
//   1. the CPU reference of the bounded fill (render/denoiseUpscale.mjs's fillEmittersBounded) against fillEmitters
//   2. the kernels: each validates against render/wgslSpec.mjs, and the constants they carry are the CPU's
//   3. ON THE DEVICE (Chromium's WebGPU through tools/ship/webgpuHarness.mjs -- SwiftShader here, the GPU on the rig):
//      coverage against emitterRadiance on three of round 30's R scenes, the bounded fill against fillEmittersBounded, and
//      the whole chain on one encoder against emitterAwareUpscale(..., "easu", full)
//
// The tolerances are f32 against f64 and were fixed from this file's first run on SwiftShader, which is said beside each.
//
// SABOTAGED (round 31), each by the byte-safe runner in render/denoiser-arc-handoff.md, restored, sha-256 identical. The kernels
// were then in a module of their own, render/denoiseUpscaleWgsl.mjs, since folded into the runner unchanged:
//   G1  a ring fills a pixel only with two known neighbours            2 RED (the device fill; the chain)
//   G2  the composite without (1 - cov)                                1 RED (the chain)
//   G3  the coverage kernel takes the farther root                     1 RED (coverage). 0 RED at first: no sphere overlapped
//       another, and then the far roots order as the near ones do -- the fourth scene's overlapping sphere is the fix
//   G4  the transfer records no brightest t                            1 RED (the chain)
//   G5  a pixel no ring reached keeps its value on the device          1 RED (the device fill, short of rings)
//   G6  the CPU bound leaves those pixels at their value               3 RED (the two CPU rows it states; the device fill)
//   G7  the runner does not swap the ring buffers                      2 RED (the device fill; the chain)
//   G8  EASU reads the frame before the fill                           1 RED (the chain). Its first form -- EASU bound to the
//       input buffer -- was no sabotage at all: 24 rings is an even number of swaps, so the filled frame IS that buffer
//   G9  the camera uniform's aspect inverted                           1 RED (the layout row; every frame here is square)
//   and section 4's caller, by the same runner:
//   T1  timeHalfChain's sum leaves the fill out                        1 RED (the sum row)
//   T2  the fill on the device's clock past 30 passes                  1 RED (the sum row: the fill must be the wall's)
//   T3  the page's table without the fill's row                        1 RED (the page row: 7 rows, not 8)
//   T4  the full-size page timed from the half-size row                1 RED (the sum row). 0 RED at first: nothing held which
//       ladder row each network time came from; the row now names both
//   and section 6's accumulation on the device (round 33), by the same runner:
//   X1  the accumulation kernel ignores its clamp                      3 RED (given the CPU's hits; the composite; with its own hits)
//   X2  the history lengthens by two a frame                           3 RED (the same three)
//   X3  the first hits' normal left unnormalised                       2 RED (the hits row; the accumulation with its own hits)
//   X4  the shift kernel the wrong way                                 3 RED (the three accumulation rows)
//   X5  frame 0 reprojected onto itself, not onto sky                  0 RED, AND IT IS AN EQUIVALENT MUTANT: the history starts at
//       zero with n = 0, so whatever frame 0 finds is clamped into the current range and blended at n = 0 + 1 = 1 -- the current
//       frame either way. The buffer of sky stays, so the rule is stated rather than relied on.
//   X6  the temporal sum without the composite                         1 RED (the timing sum row)
//   X7  the position tolerance at 30 footprints                        2 RED (the constants row; the uniform's layout row, which
//       reads the tolerance at its offset). 0 RED at first: on smooth spheres
//       a looser tolerance turns no tap valid; the row holding the kernel's constants to round 4's is the fix
//   and section 5's verdict (section 94), by the same runner:
//   V1  the rule asks one GPU, not both                                1 RED (the rule row)
//   V2  a run counts at any commit                                     1 RED (the rule row: a stale run must leave it owed)
//   V3  H holding at 0.9 x                                             1 RED (the rule row)
//   V4  C2 dropped -- any ring count                                   1 RED (the rule row). 0 RED at first: no fixture's fill
//       used all 96 rings; one does now
//   V5  the Intel's predicted range widened to 1.3                     1 RED (the predictions row)
//   and section 7's verdict (section 98), by the same runner:
//   W1  the rule asks the Intel alone                                  1 RED (the rule row)
//   W2  C1 dropped -- a run counts with a red gate                     1 RED (the rule row: the 1080 would hold)
//   W3  C3 dropped for the history's passes                            1 RED (the rule row: a pass on the wall clock must leave it owed)
//   W4  H holding at 0.9 x                                             1 RED (the rule row)
//   W5  the Intel's predicted history cost widened to 90 ms            1 RED (the predictions row)
//   W6  H read off the chain without its history                       1 RED (the rule row)
//   and section 3's list fill (round 34), by the same runner:
//   Y1  a ring reads neighbours filled in the same ring (<= for <)     3 RED (against the CPU; against round 31's fill; the chain)
//   Y2  the args kernel rounds the list's workgroups down              4 RED (the constants row; the same three)
//   Y3  the rings counted from 0, so the known pixels are no ring below 3 RED (the same three)
//   Y4  the left pass counts a pixel no ring reached but keeps its value 2 RED (against the CPU; against round 31's fill)
//   Y5  timeHalfChain's halfList sums the ring fill                    1 RED (section 4's list sum row)
//   Y6  the page's table without the list fill's row                   1 RED (the page row: 13 rows, not 14)
//   Y7  fill() runs the rings whatever it is asked                     1 RED (the row against round 31's fill). 0 RED at first: the
//       two fills agree float for float, so nothing could tell which ran; the list's length, read back as `listed`, is the fix
//   and section 8's verdict (section 100), by the same runner:
//   Z1  the rule asks the Intel alone                                  1 RED (the rule row)
//   Z2  C1 dropped -- a run counts with a red gate                     1 RED (the rule row). 0 RED at first: both Intel runs were
//       green and no fixture had a red gate; one does now
//   Z3  a run counts at any commit                                     1 RED (the rule row)
//   Z4  H holding with the list fill up to 5 % slower                  1 RED (the rule row)
//   Z5  section 98's owed run taken as the LAST 1080 run, not the first 1 RED (the owed-run row)
//   Z6  section 98's verdict read off the green extra-a run            1 RED (the owed-run row)
//   Z7  the Intel's predicted list fill narrowed to 15-20 ms           1 RED (the predictions row)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { COVERAGE_WGSL, FILL_RING_WGSL, FILL_LEFT_WGSL, FILL_LIST_WGSL, FILL_ARGS_WGSL, FILL_LISTRING_WGSL, FILL_LISTLEFT_WGSL, FILL_UNKNOWN, FILL_LIST_WG, TO_T_WGSL, COMPOSITE_WGSL, COVERAGE_GRID_WGSL, SPHERE_STRIDE, packSpheres, cameraUniform, DenoiseUpscaleGPU, TEMPORAL_CONSTANTS, GEO_STRIDE, FIRSTHITS_WGSL, SHIFT_WGSL, ACCUM_WGSL, FINAL_WGSL, accumUniform, packGeometry } from "./denoiseUpscaleGPU.mjs";
import { fillEmitters, fillEmittersBounded, emitterAwareUpscale, GAMMA } from "./denoiseUpscale.mjs";
import { emitterRadiance, COVERAGE_GRID } from "./denoiseMask.mjs";
import { makeScene } from "./denoiseScenes.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";
const REPORT = gateReport("render/denoiseUpscaleGPU-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

let sd = 31;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
/** A w x h rgb frame of smooth light with grain, and a coverage of round discs (radius in pixels) -- the fill's shapes. */
function synth(w, h, discs) {
    const img = new Float64Array(w * h * 3), cov = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        for (let c = 0; c < 3; c++) img[p * 3 + c] = 0.2 + 0.6 * (x / w) * (c + 1) / 3 + 0.3 * (y / h) + 0.05 * rnd();
        for (const [cx, cy, r] of discs) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            if (d < r) { cov[p] = Math.min(1, Math.max(cov[p], r - d)); for (let c = 0; c < 3; c++) img[p * 3 + c] = 20 + c; }
        }
    }
    return { img, cov };
}
const maxRel = (a, b, floor = 1e-3) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]) / (Math.abs(b[i]) + floor)); return m; };

console.log("denoiseUpscaleGPU-selfcheck -- round 30's emitter-aware chain on a device, against its CPU references\n");

console.log("1. THE BOUNDED FILL'S CPU REFERENCE");
const F1 = synth(24, 20, [[6, 6, 3.2], [17, 13, 5.5], [23, 1, 2]]);
{
    const full = fillEmitters(F1.img, F1.cov, 24, 20), b = fillEmittersBounded(F1.img, F1.cov, 24, 20, 16);
    ok("!! with rings to spare, fillEmittersBounded is fillEmitters value for value, and leaves nothing",
        b.left === 0 && b.rings > 2 && b.rings < 16 && b.y.every((v, i) => Object.is(v, full[i])), `${b.rings} rings, ${b.left} left`);
    const s = fillEmittersBounded(F1.img, F1.cov, 24, 20, 2);
    const unknown = F1.cov.reduce((k, c) => k + (c > 0 ? 1 : 0), 0);
    ok("  ...and short of rings it stops there: 2 rings, the rest left at 0 -- never an emitter's radiance",
        s.rings === 2 && s.left > 0 && s.left < unknown && [...Array(24 * 20).keys()].every((p) => F1.cov[p] === 0 || s.y[p * 3] < 20),
        `${s.left} of ${unknown} emitter pixels left`);
    const all = fillEmittersBounded(new Float64Array(12).fill(5), new Float64Array(4).fill(1), 2, 2, 4);
    ok("  ...a frame that is all emitter leaves every pixel, at 0, and refuses no call", all.rings === 0 && all.left === 4 && all.y.every((v) => v === 0));
    let threw = 0;
    for (const m of [-1, 1.5, NaN]) try { fillEmittersBounded(F1.img, F1.cov, 24, 20, m); } catch { threw++; }
    ok("  ...and a ring count that is not a whole number is refused", threw === 3);
}

console.log("\n2. THE KERNELS");
{
    const ks = { COVERAGE_WGSL, FILL_RING_WGSL, FILL_LEFT_WGSL, TO_T_WGSL, COMPOSITE_WGSL, FIRSTHITS_WGSL, SHIFT_WGSL, ACCUM_WGSL, FINAL_WGSL, FILL_LIST_WGSL, FILL_ARGS_WGSL, FILL_LISTRING_WGSL, FILL_LISTLEFT_WGSL };
    const bad = Object.entries(ks).map(([k, s]) => [k, validateWgsl(s)]).filter(([, p]) => p.length);
    ok("every kernel validates against the spec scanner", !bad.length, bad.map(([k, p]) => `${k}: ${p.join("; ")}`).join(" | "));
    ok("  the constants the kernels carry are the CPU's: the coverage grid, the transfer's gamma, its top below the pole",
        COVERAGE_GRID_WGSL === COVERAGE_GRID && GAMMA === 2.2 && /pow\(v \/ \(1\.0 \+ v\), 1\.0 \/ 2\.2\)/.test(TO_T_WGSL) && /pow\(tt, 2\.2\)/.test(COMPOSITE_WGSL) &&
        /1\.0 - 5\.9604645e-8/.test(COMPOSITE_WGSL) && Math.abs(5.9604645e-8 - 2 ** -24) < 1e-14 && /> 1e-6/.test(COVERAGE_WGSL),
        `grid ${COVERAGE_GRID_WGSL} against ${COVERAGE_GRID}; gamma ${GAMMA}`);
    const S = makeScene("R", 44001), sp = packSpheres(S.scene), em = S.scene.findIndex((s) => s.emit);
    ok("  a scene packs as SPHERE_STRIDE floats a sphere, its emitter flagged and its emission spread to rgb",
        SPHERE_STRIDE === 8 && sp.length === S.scene.length * 8 && sp[em * 8 + 7] === 1 && sp[7] === 0 && sp[em * 8 + 4] === Math.fround(typeof S.scene[em].emit === "number" ? S.scene[em].emit : S.scene[em].emit[0]));
    // round 34: the list fill's marker is no ring a fill can reach, and its kernels carry it and the workgroup the runner sizes by
    ok("  round 34: the list fill's UNKNOWN ring is u32's top, written into the list and both list kernels, and its rings and left pass run FILL_LIST_WG to a workgroup, as the args kernel counts them",
        FILL_UNKNOWN === 0xffffffff && FILL_LIST_WG === 64 && [FILL_LIST_WGSL, FILL_LISTRING_WGSL, FILL_LISTLEFT_WGSL].every((k) => k.includes(`${FILL_UNKNOWN}u`)) &&
        [FILL_LISTRING_WGSL, FILL_LISTLEFT_WGSL].every((k) => k.includes(`@workgroup_size(${FILL_LIST_WG},1,1)`)) && FILL_ARGS_WGSL.includes(`/ ${FILL_LIST_WG}u`) && FILL_ARGS_WGSL.includes(`+ ${FILL_LIST_WG - 1}u`));
    let mesh = null; try { packSpheres([{ bvh: {} }]); } catch (e) { mesh = e.message; }
    ok("  ...and a scene with a mesh is refused by name -- the coverage kernel intersects spheres only", /spheres only/.test(mesh || ""));
    // round 33: the accumulation's uniform (two cameras, then w h clamp frames, then the scales and tolerances) and the packed geometry
    const au = new DataView(accumUniform(S, S.eye, S.eye, 32, 24).buffer), pg0 = packGeometry({ pos: [1, 2, 3], nrm: [0, 1, 0], obj: [4] }, 1);
    ok("  round 33: the accumulation's uniform is the kernel's struct (five vec4, w h clamp frames, then prevScale aspect curScale posTol normalDot), and a pixel's geometry packs as GEO_STRIDE floats",
        au.byteLength === 128 && au.getUint32(80, true) === 32 && au.getUint32(84, true) === 24 && au.getUint32(88, true) === 1 && au.getUint32(92, true) === 8 &&
        Math.abs(au.getFloat32(100, true) - 32 / 24) < 1e-6 && au.getFloat32(108, true) === 3 && Math.abs(au.getFloat32(112, true) - 0.9) < 1e-7 &&
        pg0.length === GEO_STRIDE && pg0[0] === 1 && pg0[4] === 1 && pg0[6] === 4);
    const cu = new DataView(cameraUniform(S, 32, 24, 6).buffer);
    ok("  the camera uniform's layout is the kernel's struct: four vec4, w h nSph grid, scale and aspect",
        cu.byteLength === 96 && cu.getUint32(64, true) === 32 && cu.getUint32(68, true) === 24 && cu.getUint32(72, true) === 6 && cu.getUint32(76, true) === 8 &&
        Math.abs(cu.getFloat32(84, true) - 32 / 24) < 1e-6);
}

console.log("\n3. ON THE DEVICE");
// three of round 30's R images with an emitter in view (section 92: 44001, 44002, 44004), at 64 x 64 full and 32 x 32 half,
// and a fourth, built by hand: one sphere between the camera and the light, covering part of it, and one OVERLAPPING the light.
// Sabotage G3 (the coverage kernel taking the farther root) went 0 RED on the three R scenes and on the first draft of this
// one, which had the in-front sphere alone: where spheres do not overlap, their far roots come in the same order as their
// near ones, so the nearest sphere -- all coverage asks -- never changes. The arc's scenes keep their spheres apart, so on
// them G3 is no change at all; the overlapping sphere is here so the kernel is held to the root rule anyway (measured on
// the CPU at 32 x 32: 1,806 rays reach the light with the near root, 1,832 with the far one).
const OCCLUDED = { seed: "occluded", eye: [0, 1.5, 5], look: [0, 1.5, 0], up: [0, 1, 0], fovDeg: 40, scene: [
    { centre: [0, -100, 0], radius: 100, albedo: [0.5, 0.5, 0.5] },
    { centre: [0, 1.5, 0], radius: 0.6, albedo: 0, emit: [12, 10, 8] },
    { centre: [-0.35, 1.5, 2.2], radius: 0.3, albedo: [0.6, 0.6, 0.6] },
    { centre: [0.35, 1.5, 0.5], radius: 0.6, albedo: [0.6, 0.6, 0.6] }] };
const SCENES = [...[44001, 44002, 44004].map((s) => makeScene("R", s)), OCCLUDED];
const W = 64, Hh = 32, wire = (S) => ({ scene: S.scene, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg });
const CPU = SCENES.map((S) => ({ full: emitterRadiance(S, W, W), half: emitterRadiance(S, Hh, Hh) }));
// each chain's input: smooth light, and the emitters' own radiance where they cover a pixel -- what a traced frame holds there
const chainIn = CPU.map(({ half }) => {
    const img = new Float64Array(Hh * Hh * 3);
    for (let p = 0; p < Hh * Hh; p++) for (let c = 0; c < 3; c++) img[p * 3 + c] = half.E[p * 3 + c] + (1 - half.cov[p]) * (0.1 + 0.5 * ((p % Hh) / Hh) + 0.2 * c * Math.floor(p / Hh) / Hh);
    return img;
});
const RINGS = 24;
// round 34's list fill on a frame whose fill is long: a disc 22 pixels in radius and two more, one cut by the frame's corner
const F2 = synth(96, 64, [[30, 30, 22], [70, 40, 14], [95, 0, 6]]);
const payload = { scenes: SCENES.map(wire), fill: { img: Array.from(F1.img), cov: Array.from(F1.cov) }, fill2: { img: Array.from(F2.img), cov: Array.from(F2.cov) }, chainIn: chainIn.map((a) => Array.from(a)),
    covHalf: CPU.map((c) => Array.from(c.half.cov)), full: CPU.map((c) => ({ cov: Array.from(c.full.cov), E: Array.from(c.full.E) })), W, Hh, RINGS };
const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { payload }, script: `async (a) => {
    const P = a.payload;
    const { requestDevice } = await import("/gfx/device.js");
    const { DenoiseUpscaleGPU } = await import("/render/denoiseUpscaleGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = [];
    if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new DenoiseUpscaleGPU(dev), A = (x) => Array.from(x);
    const cov = [];
    for (const S of P.scenes) { const f = await g.coverage(S, P.W, P.W), h = await g.coverage(S, P.Hh, P.Hh); cov.push({ full: { cov: A(f.cov), E: A(f.E) }, half: { cov: A(h.cov), E: A(h.E) } }); }
    const fills = [];
    for (const m of [16, 2]) { const f = await g.fill(Float64Array.from(P.fill.img), Float64Array.from(P.fill.cov), 24, 20, m); fills.push({ ...f, y: A(f.y) }); }
    // round 34: the list fill beside round 31's, on the same frames and ring budgets, and on a frame of all emitter and one of none
    const lists = [];
    for (const [k, F, w, h, m] of [["F1/16", P.fill, 24, 20, 16], ["F1/2", P.fill, 24, 20, 2], ["F2/40", P.fill2, 96, 64, 40], ["F2/8", P.fill2, 96, 64, 8],
                                   ["all", { img: new Array(12).fill(5), cov: new Array(4).fill(1) }, 2, 2, 4], ["none", { img: P.fill.img, cov: new Array(24 * 20).fill(0) }, 24, 20, 4]]) {
        const ring = await g.fill(Float64Array.from(F.img), Float64Array.from(F.cov), w, h, m), list = await g.fill(Float64Array.from(F.img), Float64Array.from(F.cov), w, h, m, { list: true });
        lists.push({ k, m, ring: { ...ring, y: A(ring.y) }, list: { ...list, y: A(list.y) } });
    }
    const chains = [];
    for (let i = 0; i < P.chainIn.length; i++) {
        const c = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS);
        const cl = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS, { list: true });
        chains.push({ ...c, y: A(c.y), list: { ...cl, y: A(cl.y) } });
    }
    let wrongBackend = null;
    try { new DenoiseUpscaleGPU(await requestDevice(document.createElement("canvas"), { backend: "webgl2", offscreen: true })); } catch (e) { wrongBackend = String(e.message).slice(0, 160); }
    const ad = await navigator.gpu.requestAdapter(), info = ad.info || {};
    return { cov, fills, lists, chains, errs, backend: dev.backend, wrongBackend, adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") };
}` });

if (r.skipped) console.log("  SKIP  " + r.reason);
else if (!r.ok) ok("!! the device ran the chain", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`);
else {
    const R = r.result;
    say(`adapter: ${R.adapter || "unnamed"}; backend ${R.backend}`);
    ok("  the device ran with no uncaptured WebGPU error, and the runner refuses a WebGL2 device by name",
        !R.errs.length && /webgpu backend/.test(R.wrongBackend || ""), R.errs.join("; ") || (R.wrongBackend || "").slice(0, 100));
    // COVERAGE: rays are counted, so a difference is a whole ray. f32 against f64 can flip a ray that grazes a silhouette.
    // First run on SwiftShader: one ray different over all six frames (R 44001 at half size), E within 3.8e-7 where the count
    // agreed. Held at no more than 1 in 10,000 of a frame's rays, and E within 1e-5.
    const cmp = R.cov.flatMap((g, i) => [["full", W, CPU[i].full, g.full], ["half", Hh, CPU[i].half, g.half]].map(([k, n, c, d]) => {
        let rays = 0, eMax = 0, inView = 0;
        for (let p = 0; p < n * n; p++) {
            rays += Math.abs(Math.round(c.cov[p] * 64) - Math.round(d.cov[p] * 64));
            if (c.cov[p] > 0) inView++;
            if (Math.round(c.cov[p] * 64) === Math.round(d.cov[p] * 64)) for (let ch = 0; ch < 3; ch++) eMax = Math.max(eMax, Math.abs(c.E[p * 3 + ch] - d.E[p * 3 + ch]) / (Math.abs(c.E[p * 3 + ch]) + 1e-6));
        }
        return { k: `R ${SCENES[i].seed} ${k}`, rays, eMax, inView, budget: Math.floor(n * n * 64 / 10000) };
    }));
    ok("!! coverage on the device is emitterRadiance's: per frame, no more rays different than 1 in 10,000, and E within 1e-5 where the count agrees -- on frames with an emitter in view",
        cmp.length === 8 && cmp.every((c) => c.rays <= c.budget && c.eMax <= 1e-5) && cmp.every((c) => c.inView > 0),
        cmp.map((c) => `${c.k}: ${c.rays} ray(s) (of ${c.budget} allowed), E ${c.eMax.toExponential(1)}, ${c.inView} px in view`).join("; "));
    // THE FILL: each ring's mean in f32 against f64. First run: worst relative difference 1.2e-7. Held at 1e-5.
    const b16 = fillEmittersBounded(F1.img, F1.cov, 24, 20, 16), b2 = fillEmittersBounded(F1.img, F1.cov, 24, 20, 2), [g16, g2] = R.fills;
    ok("!! the bounded fill on the device is fillEmittersBounded's: the same rings and pixels left, and every value within 1e-5 -- with rings to spare and short of them",
        g16.rings === b16.rings && g16.left === b16.left && g2.rings === b2.rings && g2.left === b2.left && maxRel(g16.y, b16.y) <= 1e-5 && maxRel(g2.y, b2.y) <= 1e-5,
        `16: ${g16.rings} rings, ${g16.left} left, worst ${maxRel(g16.y, b16.y).toExponential(1)}; 2: ${g2.rings} rings, ${g2.left} left, worst ${maxRel(g2.y, b2.y).toExponential(1)}; per ring ${g16.perRing.slice(0, g16.rings + 1).join(",")}`);
    // THE CHAIN: against emitterAwareUpscale(..., "easu", full) -- the f64 chain round 30 measured. EASU in f32 against the CPU's
    // f64, through the transfer's inverse, which stretches a difference near the frame's brightest t. First run: worst 2.3e-6.
    // Held at 1e-3, relative with a floor of 1e-3.
    const ref = chainIn.map((img, i) => emitterAwareUpscale(img, CPU[i].half.cov, Hh, Hh, W, W, "easu", CPU[i].full));
    const ch = R.chains.map((c, i) => ({ k: `R ${SCENES[i].seed}`, rel: maxRel(c.y, ref[i]), rings: c.rings, left: c.left }));
    ok("!! the whole chain on one encoder -- bounded fill, transfer, EASU, inverse, composite -- is emitterAwareUpscale's with EASU, within 1e-3, every emitter pixel reached",
        ch.length === 4 && ch.every((c) => c.rel <= 1e-3 && c.left === 0 && c.rings > 0 && c.rings < RINGS),
        ch.map((c) => `${c.k}: worst ${c.rel.toExponential(1)}, ${c.rings} rings, ${c.left} left`).join("; "));
    // ROUND 34, THE LIST FILL (Y7 -- fill() running the rings whatever it is asked -- went 0 RED before `listed`: the two fills agree,
    // so only the list's own length, read back, says which ran): the same rule as round 31's device fill, run over the lights' pixels only and in place. Against
    // fillEmittersBounded at round 31's tolerance, and against round 31's device fill: the same sums in the same order, so the same
    // floats wherever the two compilers keep them -- held at 1e-6, the count of floats that differ at all reported
    const cpuOf = { F1: [F1, 24, 20], F2: [F2, 96, 64] };
    const L = R.lists.map((x) => {
        const [F, w, h] = cpuOf[x.k.split("/")[0]] || [null], ref = F ? fillEmittersBounded(F.img, F.cov, w, h, x.m) : null;
        let diff = 0; for (let i = 0; i < x.list.y.length; i++) if (!Object.is(x.list.y[i], x.ring.y[i])) diff++;
        return { ...x, ref, diff, vsRing: maxRel(x.list.y, x.ring.y), vsCpu: ref ? maxRel(x.list.y, ref.y) : null };
    });
    const same = (a, b) => a.rings === b.rings && a.left === b.left && a.perRing.length === b.perRing.length && a.perRing.every((v, i) => v === b.perRing[i]);
    ok("!! round 34: the list fill is fillEmittersBounded's -- the same rings, ring by ring, and pixels left, every value within 1e-5 -- with rings to spare and short of them, on a 24 x 20 and a 96 x 64 frame",
        L.filter((x) => x.ref).length === 4 && L.filter((x) => x.ref).every((x) => x.list.rings === x.ref.rings && x.list.left === x.ref.left && x.vsCpu <= 1e-5) &&
        L.some((x) => x.ref && x.list.left === 0 && x.list.rings > 8) && L.some((x) => x.ref && x.list.left > 0),
        L.filter((x) => x.ref).map((x) => `${x.k}: ${x.list.rings} rings, ${x.list.left} left, worst ${x.vsCpu.toExponential(1)}`).join("; "));
    ok("!! ...and it is round 31's device fill: the same filled count in every ring, the same pixels left, every value within 1e-6 -- and on a frame of all emitter or of none",
        L.length === 6 && L.every((x) => same(x.list, x.ring) && x.vsRing <= 1e-6 && x.ring.listed === 0) && L.every((x) => x.list.listed === (x.k === "none" ? 0 : x.k === "all" ? 4 : cpuOf[x.k.split("/")[0]][0].cov.filter((c) => c > 0).length)) && L.find((x) => x.k === "all").list.left === 4 && L.find((x) => x.k === "all").list.rings === 0 &&
        L.find((x) => x.k === "none").list.rings === 0 && L.find((x) => x.k === "none").list.left === 0 && maxRel(L.find((x) => x.k === "none").list.y, F1.img) <= 1e-6,
        L.map((x) => `${x.k}: ${x.list.listed} listed, ${x.diff} of ${x.list.y.length} floats differ, worst ${x.vsRing.toExponential(1)}`).join("; "));
    const chL = R.chains.map((c, i) => ({ k: `R ${SCENES[i].seed}`, rel: maxRel(c.list.y, ref[i]), vs: maxRel(c.list.y, c.y), same: same(c.list, c) }));
    ok("!! ...and the whole chain with it is emitterAwareUpscale's within 1e-3, and round 31's chain within 1e-6, every emitter pixel reached",
        chL.length === 4 && chL.every((c) => c.rel <= 1e-3 && c.vs <= 1e-6 && c.same) && R.chains.every((c, i) => c.list.left === 0 && c.listed === 0 && c.list.listed === CPU[i].half.cov.filter((v) => v > 0).length),
        chL.map((c) => `${c.k}: worst ${c.rel.toExponential(1)} against the CPU, ${c.vs.toExponential(1)} against round 31's`).join("; "));
}

console.log("\n4. THE CALLER: denoise.html's \"Time the half-size chain\", at its pilot size, in Chromium");
{
    const drive = (size, ms) => runInEngineOrigin({ engineRoot: ENG, timeoutMs: ms + 60000, args: { size, ms }, script: `async (a) => {
        const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = "/denoise.html"; document.body.appendChild(f);
        await new Promise((r) => f.onload = r);
        const d = f.contentDocument, $ = (id) => d.getElementById(id), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 100 && !$("chain"); i++) await wait(50);
        $("chainSize").value = a.size; $("chain").click();
        const t = Date.now();
        while (Date.now() - t < a.ms && ($("chain").disabled || !$("chainJson").textContent) && !/failed|no WebGPU/.test($("chainStatus").textContent)) await wait(100);
        return { status: $("chainStatus").textContent, json: $("chainJson").textContent, shown: $("chainTable").style.display !== "none", rows: $("chainTable").querySelectorAll("tbody tr").length };
    }` });
    const pg = await drive("128x72", 540000);
    if (pg.skipped) console.log("  SKIP  " + pg.reason);
    else {
        let J = null; try { J = JSON.parse(pg.result?.json || "null"); } catch {}
        const st = J && J.chain && J.chain.steps, keys = ["covHalf", "covFull", "fill", "rest", "whole", "hits", "shift", "accum", "final", "fillList", "wholeList"];
        const fine = (x) => !!x && Number.isFinite(x.ms) && x.ms > 0 && (x.clock === "device" || x.clock === "wall");
        ok("!! the page timed every step of the chain and both networks at its pilot size -- each a positive time on a named clock, the table shown, no page error",
            pg.ok && !!st && keys.every((k) => fine(st[k])) && fine(J.networkFull) && fine(J.networkHalf) && !!J.full && !!J.half && !!J.temporal && !!J.halfList && !!J.temporalList && pg.result.shown && pg.result.rows === 14 && !pg.pageErrors.length,
            pg.ok ? (pg.result?.status || "").slice(0, 200) : pg.reason);
        if (st) {
            // the network times are the ladder's rows, w x h then W x H (T4 went 0 RED before this held which was which); today's page
            // is the full-size network and its mask, the chain the half-size network and every step
            const [halfRow, fullRow] = J.ladder.rows[J.kernels], med = (x) => (x.gpu ? x.gpu.median : x.wall.median);
            const parts = J.half ? J.half.ms : NaN, sum = med(halfRow) + ["covHalf", "covFull", "fill", "rest"].reduce((a, k) => a + st[k].ms, 0);
            ok("  ...the chain in all is the half-size network plus the four steps, today's page the full-size network and its mask, each network its own ladder row, the fill by the wall clock, on scene R 990000 with its light in view, every ring budgeted and some used",
                Math.abs(parts - sum) < 1e-9 && st.fill.clock === "wall" && fullRow.W === 128 && fullRow.H === 72 && halfRow.W === 64 && halfRow.H === 36 &&
                J.networkFull.ms === med(fullRow) && J.networkHalf.ms === med(halfRow) && Math.abs(J.full.ms - (med(fullRow) + st.covFull.ms)) < 1e-9 && st.whole.clock === "wall" && J.chain.maxRings === 96 && J.chain.rings > 0 && J.chain.rings < 96 &&
                J.chain.inView > 0 && JSON.stringify(J.scene) === JSON.stringify(["R", 990000]) && J.chain.W === 128 && J.chain.w === 64,
                `${J.chain.rings} of 96 rings filled; ${J.chain.inView} px in view at 64 x 36; ${keys.map((k) => `${k} ${st[k].ms.toFixed(2)} ms (${st[k].clock})`).join(", ")}`);
            // round 33: the chain with its history is the chain and round 32's four passes, each one pass on the device's clock where it has one
            const hist = ["hits", "shift", "accum", "final"];
            ok("  round 33: the chain with its history is the half-size chain plus the history's four passes -- first hits, shift, accumulation, composite -- each one pass, on the device's clock where the device has one",
                !!J.temporal && Math.abs(J.temporal.ms - (J.half.ms + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 && hist.every((k) => st[k].clock === st.covHalf.clock),
                hist.map((k) => `${k} ${st[k].ms.toFixed(2)} ms (${st[k].clock})`).join(", "));
            // round 34: the chain with the list fill is the same sum with fillList in fill's place, and with its history the same
            const listSum = med(halfRow) + ["covHalf", "covFull", "fillList", "rest"].reduce((a, k) => a + st[k].ms, 0);
            ok("  round 34: the chain with the list fill is the half-size chain with fillList in the fill's place, by the wall clock as the fill is, and with its history the history's four passes more",
                !!J.halfList && Math.abs(J.halfList.ms - listSum) < 1e-9 && st.fillList.clock === "wall" && st.wholeList.clock === "wall" &&
                !!J.temporalList && Math.abs(J.temporalList.ms - (listSum + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 &&
                !!J.chain.listCheck && J.chain.listCheck.listed === J.chain.inView && J.chain.listCheck.rings === J.chain.rings && J.chain.listCheck.left === 0,
                `the list fill: ${J.chain.listCheck ? `${J.chain.listCheck.listed} listed, ${J.chain.listCheck.rings} rings, ${J.chain.listCheck.left} left` : "not checked"}; fill ${st.fill.ms.toFixed(2)} ms, the list fill ${st.fillList.ms.toFixed(2)} ms; whole ${st.whole.ms.toFixed(2)}, with the list fill ${st.wholeList.ms.toFixed(2)}`);
        }
        // ON A GPU, THE RIG'S SIZE (pre-registration section 93): 960 x 540 -> 1920 x 1080, every step a measured line the rig's
        // report keeps. Not on a software adapter: SwiftShader's 1080p would be minutes of a CPU's time that decides nothing.
        // SWEK_HALFCHAIN_RIGSIZE=1 runs it on any adapter -- how its plumbing was driven here once, on SwiftShader
        if (J && J.ladder.adapter.software && process.env.SWEK_HALFCHAIN_RIGSIZE !== "1") console.log(`  SKIP  the rig's size, 1920 x 1080: ${J.ladder.adapter.name} is a software adapter -- section 93 reads a GPU's`);
        else if (J) {
            const rg = await drive("1920x1080", 1500000);
            let K = null; try { K = JSON.parse(rg.result?.json || "null"); } catch {}
            const ks = K && K.chain && K.chain.steps;
            ok("!! section 93: at 1920 x 1080 the page timed both networks and every step of the chain, the fill reaching every pixel in its 96 rings -- and round 34's list fill the same, every listed pixel reached",
                rg.ok && !!ks && keys.every((k) => fine(ks[k])) && fine(K.networkFull) && fine(K.networkHalf) && !!K.full && !!K.half && !!K.temporal && !!K.halfList && !!K.temporalList && K.chain.rings > 0 && K.chain.rings < 96 && !rg.pageErrors.length &&
                !!K.chain.listCheck && K.chain.listCheck.listed === K.chain.inView && K.chain.listCheck.rings === K.chain.rings && K.chain.listCheck.left === 0,
                rg.ok ? (rg.result?.status || "").slice(0, 200) : rg.reason);
            if (ks) {
                const row = (x) => (x.skipped ? `not measured (${x.reason})` : `${(x.gpu ? x.gpu.median : x.wall.median).toFixed(3)} ms (${x.gpu ? "device" : "wall"})`), [lh, lf] = K.ladder.rows[K.kernels];
                say(`section 93: ${K.ladder.adapter.name}, kernels ${K.kernels}; the network at 1920 x 1080 ${row(lf)}, at 960 x 540 ${row(lh)}; ` +
                    (K.full && K.half ? `today's page (network and mask) ${K.full.ms.toFixed(3)} ms (${K.full.clocks.join(" + ")}); the half-size chain ${K.half.ms.toFixed(3)} ms (${K.half.clocks.join(" + ")}); ratio ${(K.full.ms / K.half.ms).toFixed(3)} x` : "no ratio: a part was not measured"));
                say("section 93: the chain's steps -- " + ["covHalf", "covFull", "fill", "rest", "whole"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    `; ${K.chain.rings} of 96 rings filled`);
                // round 33 (section 97): the history's passes and the chain with them, in a line of their own -- section 94 reads the two above
                say("section 97: the history's passes -- " + ["hits", "shift", "accum", "final"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.full && K.temporal ? `; the half-size chain with its history ${K.temporal.ms.toFixed(3)} ms (${K.temporal.clocks.join(" + ")}); ratio ${(K.full.ms / K.temporal.ms).toFixed(3)} x` : "; no ratio: a part was not measured"));
                // round 34 (section 99): the fill over the lights' pixels, beside round 31's, in a line of its own
                say("section 99: the fills -- " + ["fill", "fillList", "whole", "wholeList"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.chain.listCheck ? `; the list fill ${K.chain.listCheck.listed} listed, ${K.chain.listCheck.rings} of 96 rings, ${K.chain.listCheck.left} left` : "; the list fill not checked") +
                    (K.full && K.halfList && K.temporalList ? `; the half-size chain with the list fill ${K.halfList.ms.toFixed(3)} ms, ratio ${(K.full.ms / K.halfList.ms).toFixed(3)} x; with its history ${K.temporalList.ms.toFixed(3)} ms, ratio ${(K.full.ms / K.temporalList.ms).toFixed(3)} x` : "; no ratio: a part was not measured"));
            }
        }
    }
}

console.log("\n5. SECTION 94: ROUND 31'S VERDICT, RE-DERIVED FROM THE FOUR REPORTS AS COMMITTED");
{
    // the commits that carry section 93 and that the rig ran: 1c60b346 brought it, 77aaece5 added one sentence to it
    const SECTION93_COMMITS = Object.freeze(["1c60b346", "77aaece5"]);
    const GPUS = { "intel-gen9": "intel / gen-9", gtx1080: "nvidia / pascal" };
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    // one report: its commit, every gate's verdict, and the two section-93 lines of the chain's gate, read back to numbers
    const readRun = (rep) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", b = m.find((l) => /^section 93: the chain's steps/.test(l)) || "";
        const step = (k) => ({ ms: num(new RegExp(`${k} ([0-9.]+) ms`), b), clock: (b.match(new RegExp(`${k} [0-9.]+ ms \\((\\w+)\\)`)) || [])[1] || null });
        return { commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok), adapter: (a.match(/^section 93: ([^,]+),/) || [])[1] || null,
            kernels: (a.match(/kernels (\w+);/) || [])[1] || null,
            netFull: { ms: num(/1920 x 1080 ([0-9.]+) ms/, a), clock: (a.match(/1920 x 1080 [0-9.]+ ms \((\w+)\)/) || [])[1] || null },
            netHalf: { ms: num(/at 960 x 540 ([0-9.]+) ms/, a), clock: (a.match(/at 960 x 540 [0-9.]+ ms \((\w+)\)/) || [])[1] || null },
            full: num(/today's page \(network and mask\) ([0-9.]+) ms/, a), half: num(/the half-size chain ([0-9.]+) ms/, a), ratio: num(/ratio ([0-9.]+) x/, a),
            covHalf: step("covHalf"), covFull: step("covFull"), fill: step("fill"), rest: step("rest"), whole: step("whole"),
            rings: num(/; (\d+) of 96 rings filled/, b) };
    };
    // section 93's rule: a run counts when it is at a commit carrying section 93, every gate is green (C1), the fill reached every
    // pixel and filled on fewer than 96 rings (C2), and both networks are on the device's clock (C3); H holds on a GPU when both
    // its runs count and the ratio, re-made from the two times, is above 1.0 in each
    const counts = (r) => SECTION93_COMMITS.includes(r.commit) && r.allGreen && r.rings > 0 && r.rings < 96 && r.netFull.clock === "device" && r.netHalf.clock === "device" &&
        [r.full, r.half, r.ratio].every((v) => Number.isFinite(v) && v > 0) && Math.abs(r.full / r.half - r.ratio) < 0.002;
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.full / r.half > 1) ? "holds" : "fails") : "no verdict");
    const rule94 = (byGpu) => { const v = Object.values(byGpu).map(H); return v.every((x) => x === "holds") ? "fsr2-temporal" : v.includes("no verdict") ? "owed again" : "name the steps"; };
    const R = {};
    for (const g of Object.keys(GPUS)) R[g] = ["a", "b"].map((k) => readRun(JSON.parse(fs.readFileSync(path.join(ENG, "render", `denoise-rig-r31-${k}-${g}.json`), "utf8"))));
    const all = Object.values(R).flat();
    ok("!! section 94: the four reports read back -- each at a commit carrying section 93, on its GPU's adapter and the page's kernel set for it, every gate green, the fill short of its 96 rings, both networks on the device's clock",
        Object.entries(R).every(([g, rs]) => rs.every((r) => counts(r) && r.adapter === GPUS[g] && r.kernels === (g === "gtx1080" ? "r18t" : "r18u"))),
        all.map((r) => `${r.adapter} ${r.commit}: ${r.kernels}, ${r.rings} rings, ratio ${r.ratio}`).join("; "));
    const slow = (rs, i) => rs.map((r, j) => (j === i ? { ...r, half: r.full * 1.01, ratio: Math.round(100000 / 1.01) / 100000 } : r));
    const stale = (rs) => rs.map((r, j) => (j === 0 ? { ...r, commit: "502091b1" } : r));
    // and a run whose fill used every ring: C2 then cannot say every pixel was reached (V4 went 0 RED before this fixture)
    const full96 = (rs) => rs.map((r, j) => (j === 0 ? { ...r, rings: 96 } : r));
    ok("!! *** section 94's rule, as section 93 fixed it: the chain cheaper than today's page in both runs on both GPUs -- so denoise-fsr2-temporal is the arc's next round ***",
        H(R["intel-gen9"]) === "holds" && H(R.gtx1080) === "holds" && rule94(R) === "fsr2-temporal" &&
        rule94({ ...R, gtx1080: slow(R.gtx1080, 1) }) === "name the steps" && rule94({ ...R, "intel-gen9": stale(R["intel-gen9"]) }) === "owed again" && rule94({ ...R, gtx1080: full96(R.gtx1080) }) === "owed again" && H(R.gtx1080.slice(0, 1)) === "no verdict",
        Object.entries(R).map(([g, rs]) => `${g}: ${rs.map((r) => (r.full / r.half).toFixed(3)).join(" and ")} x`).join("; "));
    // the predictions, read off the reports: they decided nothing, and section 94 says which held
    const within = (rs, f, lo, hi) => rs.every((r) => f(r) >= lo && f(r) <= hi);
    const I = R["intel-gen9"], N = R.gtx1080, cov = (r) => r.covHalf.ms + r.covFull.ms;
    const P = { ratio1080: within(N, (r) => r.ratio, 1.4, 3.0), ratioIntel: within(I, (r) => r.ratio, 2.0, 4.0), net1080: within(N, (r) => r.netHalf.ms, 18, 25),
                cov1080: within(N, cov, 1, 10), fill1080: within(N, (r) => r.fill.ms, 3, 15), rest1080: within(N, (r) => r.rest.ms, 1, 3), rings: all.every((r) => r.rings === 87) };
    ok("  section 94's account of section 93's predictions: the 1080's ratio, its half-size network, its last three passes and the 87 rings held; the Intel's ratio, and the 1080's coverage and fill, did not",
        P.ratio1080 && P.net1080 && P.rest1080 && P.rings && !P.ratioIntel && !P.cov1080 && !P.fill1080 && all.every((r) => r.fill.clock === "wall" && r.whole.clock === "wall" && r.covFull.clock === "device"),
        `Intel ratio ${I.map((r) => r.ratio).join(", ")} (2.0-4.0 predicted); 1080 coverage ${N.map((r) => cov(r).toFixed(1)).join(", ")} ms (1-10), fill ${N.map((r) => r.fill.ms).join(", ")} ms (3-15)`);
    // reported: what the chain's own steps cost against the half-size network they sit beside
    for (const [g, rs] of Object.entries(R)) say(`section 94, ${g}: the network at 960 x 540 ${rs.map((r) => r.netHalf.ms.toFixed(1)).join(" / ")} ms; the chain's own steps (both coverages, the fill, the rest) ${rs.map((r) => (r.half - r.netHalf.ms).toFixed(1)).join(" / ")} ms -- reported, deciding nothing`);
}

console.log("\n6. ROUND 33: ROUND 32'S ACCUMULATION ON THE DEVICE, AGAINST render/denoiseTemporalUpscale.mjs");
{
    const { firstHits: hitsCPU, cameraPath } = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporal.mjs")).href);
    const { accumulateUpscaled, JITTER, halfShift } = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporalUpscale.mjs")).href);
    const { compositeEmitters } = await import(pathToFileURL(path.join(ENG, "render", "denoiseUpscale.mjs")).href);
    // the constants the accumulation kernel carries are round 4's, exactly (X7 -- the position tolerance at 30 -- went 0 RED before this
    // row: on a sequence of smooth spheres a looser tolerance turns no tap valid that 3 footprints did not)
    const RT = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporal.mjs")).href);
    ok("  round 33: the accumulation kernel's constants are render/denoiseTemporal.mjs's -- POS_TOL, NORMAL_DOT and FRAMES -- and its geometry is GEO_STRIDE floats a pixel",
        TEMPORAL_CONSTANTS.posTol === RT.POS_TOL && TEMPORAL_CONSTANTS.normalDot === RT.NORMAL_DOT && TEMPORAL_CONSTANTS.frames === RT.FRAMES && GEO_STRIDE === 8 && Object.isFrozen(TEMPORAL_CONSTANTS),
        JSON.stringify(TEMPORAL_CONSTANTS));
    const N = 64, S = makeScene("R", 990000), eyes = cameraPath(S).eyes, geo = eyes.map((e) => hitsCPU(S, e, N, N)), full = emitterRadiance(S, N, N);
    let sd2 = 77; const r2 = () => (sd2 = (sd2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    // each frame smooth light with grain, on its jittered grid -- the shape of an upscaled frame, cost and content aside
    const frames = eyes.map((_, f) => ({ y: Float64Array.from({ length: N * N * 3 }, (_, i) => 0.3 + 0.4 * ((i / 3 | 0) % N) / N + 0.1 * (i % 3) + 0.05 * r2()), shift: halfShift(JITTER[f]) }));
    const ref = accumulateUpscaled(frames, geo, N, N), refNo = accumulateUpscaled(frames, geo, N, N, { clamp: false }), refY = compositeEmitters(ref.A, full);
    const wireS = { scene: S.scene, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg };
    const A = (x) => Array.from(x), g64 = geo.map((g) => ({ pos: A(g.pos), nrm: A(g.nrm), obj: A(g.obj) }));
    const pl = { S: wireS, eyes, N, frames: frames.map((f) => ({ y: A(f.y), shift: f.shift })), geo: g64, full: { cov: A(full.cov), E: A(full.E) } };
    const q = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 600000, args: { pl }, script: `async (a) => {
        const P = a.pl, { requestDevice } = await import("/gfx/device.js"), { DenoiseUpscaleGPU } = await import("/render/denoiseUpscaleGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true }), errs = [];
        if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const g = new DenoiseUpscaleGPU(dev), A = (x) => Array.from(x), fr = P.frames.map((f) => ({ y: Float64Array.from(f.y), shift: f.shift }));
        const hits = []; for (const e of [P.eyes[0], P.eyes[P.eyes.length - 1]]) { const h = await g.firstHits(P.S, e, P.N, P.N); hits.push({ pos: A(h.pos), nrm: A(h.nrm), obj: A(h.obj) }); }
        const geo = P.geo.map((x) => ({ pos: Float64Array.from(x.pos), nrm: Float64Array.from(x.nrm), obj: Int32Array.from(x.obj) })), full = { cov: Float64Array.from(P.full.cov), E: Float64Array.from(P.full.E) };
        const withCpuGeo = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, full }), noClamp = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, clamp: false });
        const ownGeo = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { full });
        const pk = (r) => ({ A: A(r.A), n: A(r.n), y: A(r.y) });
        return { hits, withCpuGeo: pk(withCpuGeo), noClamp: pk(noClamp), ownGeo: pk(ownGeo), errs };
    }` });
    if (q.skipped) console.log("  SKIP  " + q.reason);
    else if (!q.ok) ok("!! round 33: the device ran the accumulation", false, `${q.reason || "no result"} ${JSON.stringify(q.pageErrors || []).slice(0, 300)}`);
    else {
        const Q = q.result;
        // FIRST HITS: an object index differing is a ray that went to another sphere; f32 against f64 can flip one at a silhouette.
        // First run on SwiftShader: no flip at either eye, position and normal within 1.7e-4 (relative to 1 + |x|) -- the ground is a
        // sphere of radius 100, and its ray-sphere arithmetic cancels in f32. Held at 1 in 1,000 pixels and 1e-3.
        const hitCmp = Q.hits.map((h, k) => { const c = geo[k ? geo.length - 1 : 0]; let flips = 0, worst = 0;
            for (let p = 0; p < N * N; p++) { if (h.obj[p] !== c.obj[p]) { flips++; continue; } if (c.obj[p] < 0) continue;
                for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(h.pos[p * 3 + i] - c.pos[p * 3 + i]) / (1 + Math.abs(c.pos[p * 3 + i])), Math.abs(h.nrm[p * 3 + i] - c.nrm[p * 3 + i])); }
            return { flips, worst }; });
        ok("!! round 33: the device's first hits are render/denoiseTemporal.mjs's -- the same sphere at all but 1 in 1,000 pixels, position and normal within 1e-3 where it agrees",
            !Q.errs.length && hitCmp.every((h) => h.flips <= N * N / 1000 && h.worst <= 1e-3), hitCmp.map((h, k) => `eye ${k ? "last" : "first"}: ${h.flips} flip(s), worst ${h.worst.toExponential(1)}`).join("; ") + (Q.errs.length ? "; " + Q.errs[0] : ""));
        // the history length n is a weighted sum of the taps' lengths, so it is fractional and f32 moves it: first run, within 3.1e-5
        // given the CPU's hits and 5.1e-5 with the device's own; the light within 5.5e-7 and 2.6e-6. Held at 1e-4 and 1e-5 / 1e-3.
        const cmp = (d, r) => { let nDiff = 0, worst = 0, nWorst = 0; for (let p = 0; p < N * N; p++) { nWorst = Math.max(nWorst, Math.abs(d.n[p] - r.n[p])); if (Math.abs(d.n[p] - r.n[p]) > 1e-4) nDiff++; for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(d.A[p * 3 + c] - r.A[p * 3 + c]) / (Math.abs(r.A[p * 3 + c]) + 1e-3)); } return { nDiff, worst, nWorst }; };
        const c1 = cmp(Q.withCpuGeo, ref), c0 = cmp(Q.noClamp, refNo), cOwn = cmp(Q.ownGeo, ref);
        ok("!! round 33: given the CPU's first hits, the device's accumulation is accumulateUpscaled's -- the history length within 1e-4 at every pixel, the light within 1e-5, clamped and not",
            c1.nDiff === 0 && c1.worst <= 1e-5 && c0.nDiff === 0 && c0.worst <= 1e-5 && Q.noClamp.A.some((v, i) => Math.abs(v - Q.withCpuGeo.A[i]) > 1e-4),
            `clamped: ${c1.nDiff} n differ by over 1e-4 (worst ${c1.nWorst.toExponential(1)}), light worst ${c1.worst.toExponential(1)}; unclamped: ${c0.nDiff}, ${c0.worst.toExponential(1)}`);
        let yw = 0; for (let i = 0; i < refY.length; i++) yw = Math.max(yw, Math.abs(Q.withCpuGeo.y[i] - refY[i]) / (Math.abs(refY[i]) + 1e-3));
        ok("  ...and its composite is compositeEmitters on the accumulated light, within 1e-5", yw <= 1e-5, `worst ${yw.toExponential(1)}`);
        ok("  ...and with its own first hits the whole accumulation has at most 1 in 1,000 pixels with a history length off by over 1e-4, and the light within 1e-3",
            cOwn.nDiff <= N * N / 1000 && cOwn.worst <= 1e-3, `${cOwn.nDiff} of ${N * N} pixels' n differ by over 1e-4 (worst ${cOwn.nWorst.toExponential(1)}); light worst ${cOwn.worst.toExponential(1)}`);
    }
}

console.log("\n7. SECTION 98: ROUND 33'S VERDICT, RE-DERIVED FROM THE FOUR REPORTS AS COMMITTED");
{
    // the commit that carries section 97 and that the rig ran, all four runs. Section 98 owes the 1080 one run, in place of its run b:
    // when it arrives it is committed as received, read in here, and its commit -- a later one, carrying section 97 -- added
    const SECTION97_COMMITS = Object.freeze(["e5908338"]);
    const GPUS = { "intel-gen9": "intel / gen-9", gtx1080: "nvidia / pascal" }, HIST = ["hits", "shift", "accum", "final"];
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    // one report: its commit, every gate's verdict, and the chain gate's section-93 and section-97 lines, read back to numbers
    const readRun = (rep) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", b = m.find((l) => /^section 93: the chain's steps/.test(l)) || "", c = m.find((l) => /^section 97: /.test(l)) || "";
        const step = (k, t) => ({ ms: num(new RegExp(`${k} ([0-9.]+) ms`), t), clock: (t.match(new RegExp(`${k} [0-9.]+ ms \\((\\w+)\\)`)) || [])[1] || null });
        const red = rep.gates.filter((x) => !x.ok);
        return { commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && !red.length, red: red.map((x) => ({ gate: x.gate, fails: (x.fails || []).length, ms: x.ms })),
            chainGreen: !!g && g.ok, adapter: (a.match(/^section 93: ([^,]+),/) || [])[1] || null, kernels: (a.match(/kernels (\w+);/) || [])[1] || null,
            netFull: step("1920 x 1080", a), netHalf: step("at 960 x 540", a), full: num(/today's page \(network and mask\) ([0-9.]+) ms/, a),
            half: num(/the half-size chain ([0-9.]+) ms/, a), temporal: num(/the half-size chain with its history ([0-9.]+) ms/, c), ratio: num(/ratio ([0-9.]+) x/, c),
            hist: Object.fromEntries(HIST.map((k) => [k, step(k, c)])), rings: num(/; (\d+) of 96 rings filled/, b) };
    };
    const histMs = (r) => HIST.reduce((s, k) => s + r.hist[k].ms, 0);
    // section 97's rule: a run counts when it is at a commit carrying section 97, every denoise gate is green (C1), the fill filled on
    // fewer than 96 rings (C2), and both networks and the history's four passes are on the device's clock (C3); H holds on a GPU when
    // both its runs count and full / temporal, re-made from the two times, is above 1.0 in each
    const counts = (r) => SECTION97_COMMITS.includes(r.commit) && r.allGreen && r.rings > 0 && r.rings < 96 && r.netFull.clock === "device" && r.netHalf.clock === "device" &&
        HIST.every((k) => r.hist[k].clock === "device" && Number.isFinite(r.hist[k].ms)) && [r.full, r.temporal, r.ratio].every((v) => Number.isFinite(v) && v > 0) && Math.abs(r.full / r.temporal - r.ratio) < 0.002;
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.full / r.temporal > 1) ? "holds" : "fails") : "no verdict");
    const rule98 = (byGpu) => { const v = Object.values(byGpu).map(H); return v.every((x) => x === "holds") ? "the page carries the history" : v.includes("no verdict") ? "owed again" : "name the passes"; };
    const R = {};
    for (const g of Object.keys(GPUS)) R[g] = ["a", "b"].map((k) => readRun(JSON.parse(fs.readFileSync(path.join(ENG, "render", `denoise-rig-r33-${k}-${g}.json`), "utf8"))));
    const all = Object.values(R).flat(), [Na, Nb] = R.gtx1080;
    ok("!! section 98: the four reports read back -- each at the commit carrying section 97, on its GPU's adapter and kernel set, the chain's gate green with the fill short of its 96 rings and every network and history pass on the device's clock",
        Object.entries(R).every(([g, rs]) => rs.every((r) => SECTION97_COMMITS.includes(r.commit) && r.chainGreen && r.adapter === GPUS[g] && r.kernels === (g === "gtx1080" ? "r18t" : "r18u") && r.rings === 87 &&
            r.netFull.clock === "device" && r.netHalf.clock === "device" && HIST.every((k) => r.hist[k].clock === "device") && Math.abs(r.full / r.temporal - r.ratio) < 0.002)),
        all.map((r) => `${r.adapter} ${r.commit}: ${r.kernels}, ${r.rings} rings, ratio ${r.ratio}`).join("; "));
    // C1, as the reports have it: three runs all green; the 1080's run b red in the timing gate alone, with no FAIL line, 17.7 s in
    ok("!! section 98's C1: the Intel's two runs and the 1080's run a are green in every gate; the 1080's run b is red in render/denoiseTiming-selfcheck.mjs alone, with no FAIL line",
        R["intel-gen9"].every((r) => r.allGreen) && Na.allGreen && !Nb.allGreen && Nb.red.length === 1 && Nb.red[0].gate === "render/denoiseTiming-selfcheck.mjs" && Nb.red[0].fails === 0,
        `1080 run b: ${Nb.red.map((x) => `${x.gate} red after ${(x.ms / 1000).toFixed(1)} s, ${x.fails} FAIL line(s)`).join("; ")}`);
    const green = (r) => ({ ...r, allGreen: true }), slow = (r) => ({ ...r, temporal: r.full * 1.01, ratio: Math.round(100000 / 1.01) / 100000 });
    const stale = (r) => ({ ...r, commit: "1c60b346" }), wall = (r) => ({ ...r, hist: { ...r.hist, accum: { ...r.hist.accum, clock: "wall" } } }), full96 = (r) => ({ ...r, rings: 96 });
    ok("!! *** section 98's rule, as section 97 fixed it: H holds on the Intel; the 1080 has no verdict, its run b red -- so the 1080's run b is owed again ***",
        H(R["intel-gen9"]) === "holds" && H(R.gtx1080) === "no verdict" && rule98(R) === "owed again" &&
        rule98({ ...R, gtx1080: [Na, green(Nb)] }) === "the page carries the history" && rule98({ ...R, gtx1080: [Na, slow(green(Nb))] }) === "name the passes" &&
        rule98({ ...R, "intel-gen9": [stale(R["intel-gen9"][0]), R["intel-gen9"][1]] }) === "owed again" && H([wall(R["intel-gen9"][0]), R["intel-gen9"][1]]) === "no verdict" &&
        H([full96(R["intel-gen9"][0]), R["intel-gen9"][1]]) === "no verdict" && H(R["intel-gen9"].slice(0, 1)) === "no verdict",
        Object.entries(R).map(([g, rs]) => `${g}: ${rs.map((r) => (r.full / r.temporal).toFixed(3)).join(" and ")} x, ${H(rs)}`).join("; "));
    // the predictions, read off the reports: they decided nothing, and section 98 says which held. The 1080's run b is read for them
    // as a report, not as a run that counts
    const within = (rs, f, lo, hi) => rs.every((r) => f(r) >= lo && f(r) <= hi), I = R["intel-gen9"], N = R.gtx1080;
    const P = { ratio1080: within(N, (r) => r.ratio, 1.3, 1.5), ratioIntel: within(I, (r) => r.ratio, 1.25, 1.55), hist1080: within(N, histMs, 1, 4), histIntel: within(I, histMs, 15, 60), rings: all.every((r) => r.rings === 87) };
    ok("  section 98's account of section 97's predictions: both ratios and the 1080's history cost held, as did C2; the Intel's history cost did not, and C1 did not on the 1080",
        P.ratio1080 && P.ratioIntel && P.hist1080 && P.rings && !P.histIntel && !Nb.allGreen,
        `history passes: Intel ${I.map((r) => histMs(r).toFixed(1)).join(", ")} ms (15-60 predicted), 1080 ${N.map((r) => histMs(r).toFixed(2)).join(", ")} ms (1-4)`);
    for (const [g, rs] of Object.entries(R)) say(`section 98, ${g}: the history's four passes ${rs.map((r) => histMs(r).toFixed(2)).join(" / ")} ms, the accumulation ${rs.map((r) => r.hist.accum.ms.toFixed(2)).join(" / ")} of it; the chain without them ${rs.map((r) => (r.full / r.half).toFixed(3)).join(" / ")} x -- reported, deciding nothing`);
}

console.log("\n8. SECTION 100: ROUND 34'S VERDICT, AND SECTION 98'S OWED RUN, RE-DERIVED FROM THE REPORTS AS COMMITTED");
{
    // the commit that carries section 99, and the one section 98 pinned the 1080's owed run to
    const SECTION99_COMMITS = Object.freeze(["3abe4471"]), PINNED98 = "468766f9";
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const load = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "render", f), "utf8"));
    const readRun = (rep, file) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", b = m.find((l) => /^section 93: the chain's steps/.test(l)) || "", d = m.find((l) => /^section 99: /.test(l)) || "";
        const clk = (re, t) => (t.match(re) || [])[1] || null;
        return { file, at: rep.at, commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok),
            red: rep.gates.filter((x) => !x.ok).map((x) => ({ gate: x.gate, fails: (x.fails || []).length, ms: x.ms, measured: (x.measured || []).length })),
            adapter: clk(/^section 93: ([^,]+),/, a), netClocks: [clk(/1920 x 1080 [0-9.]+ ms \((\w+)\)/, a), clk(/at 960 x 540 [0-9.]+ ms \((\w+)\)/, a)],
            rings: num(/; (\d+) of 96 rings filled/, b), has99: !!d, fill: num(/fill ([0-9.]+) ms \(wall\)/, d), fillList: num(/fillList ([0-9.]+) ms \(wall\)/, d),
            listed: num(/the list fill (\d+) listed/, d), listRings: num(/listed, (\d+) of 96 rings/, d), listLeft: num(/rings, (\d+) left/, d),
            ratioList: num(/with the list fill [0-9.]+ ms, ratio ([0-9.]+) x/, d), ratioListHist: num(/with its history [0-9.]+ ms, ratio ([0-9.]+) x/, d), ratio97: num(/^section 97: .*ratio ([0-9.]+) x/, m.find((l) => /^section 97: /.test(l)) || "") };
    };
    // section 99's rule: a run counts when it is at a commit carrying section 99, every denoise gate is green (C1), the ring fill
    // filled on fewer than 96 rings and the checked list fill reached every listed pixel in that count (C2), and both networks are
    // on the device's clock (C3); H holds on a GPU when both its runs count and fillList is below fill in each
    const counts = (r) => SECTION99_COMMITS.includes(r.commit) && r.allGreen && r.has99 && r.rings > 0 && r.rings < 96 && r.listLeft === 0 && r.listRings === r.rings && r.listed > 0 &&
        r.netClocks.every((c) => c === "device") && [r.fill, r.fillList].every((v) => Number.isFinite(v) && v > 0);
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.fillList < r.fill) ? "holds" : "fails") : "no verdict");
    const rule100 = (byGpu) => { const v = Object.values(byGpu).map(H); return v.every((x) => x === "holds") ? "the list fill becomes the chain's" : v.includes("no verdict") ? "owed again" : "the ring fill stays"; };
    const I = ["a", "b"].map((k) => readRun(load(`denoise-rig-r34-${k}-intel-gen9.json`), k));
    // the GTX 1080's reports after section 98, all at the pinned commit: b2, section 98's owed run, and two more that arrived named r34
    const N = [["b2", "denoise-rig-r33-b2-gtx1080.json"], ["extra-a", "denoise-rig-r33-extra-a-gtx1080.json"], ["extra-b", "denoise-rig-r33-extra-b-gtx1080.json"]].map(([k, f]) => readRun(load(f), k));
    const N99 = N.filter((r) => SECTION99_COMMITS.includes(r.commit));
    ok("!! section 100: the Intel's two round-34 runs read back -- at the commit carrying section 99, every gate green, the ring fill and the checked list fill both 87 rings, all 25,765 listed pixels reached, both networks on the device's clock",
        I.every((r) => counts(r) && r.adapter === "intel / gen-9" && r.rings === 87 && r.listRings === 87 && r.listed === 25765 && r.listLeft === 0),
        I.map((r) => `run ${r.file}: fill ${r.fill} ms, fillList ${r.fillList} ms, ${r.listed} listed, ${r.listRings} rings, ${r.listLeft} left`).join("; "));
    ok("!! ...and the GTX 1080 has no run at a commit carrying section 99: its three reports since section 98 are all at 468766f9, and none carries a section 99 line",
        N99.length === 0 && N.every((r) => r.commit === PINNED98 && !r.has99), N.map((r) => `${r.file}: ${r.commit}, ${r.has99 ? "a" : "no"} section 99 line`).join("; "));
    // and a run with a red gate, the 1080's own failure (Z2 -- C1 dropped -- went 0 RED before this fixture: both Intel runs are green)
    const slow = (r) => ({ ...r, fillList: r.fill * 1.01 }), stale = (r) => ({ ...r, commit: "e5908338" }), short = (r) => ({ ...r, listLeft: 3 }), offby = (r) => ({ ...r, listRings: r.rings + 1 });
    const redGate = (r) => ({ ...r, allGreen: false });
    ok("!! *** section 100's rule, as section 99 fixed it: H holds on the Intel; the 1080 has no verdict, with no run -- so round 34 is owed on the 1080 ***",
        H(I) === "holds" && H(N99) === "no verdict" && rule100({ "intel-gen9": I, gtx1080: N99 }) === "owed again" &&
        rule100({ "intel-gen9": I, gtx1080: I }) === "the list fill becomes the chain's" && rule100({ "intel-gen9": [I[0], slow(I[1])], gtx1080: I }) === "the ring fill stays" &&
        H([stale(I[0]), I[1]]) === "no verdict" && H([short(I[0]), I[1]]) === "no verdict" && H([offby(I[0]), I[1]]) === "no verdict" && H([I[0], redGate(I[1])]) === "no verdict",
        `Intel: ${I.map((r) => (r.fill / r.fillList).toFixed(1)).join(" and ")} x faster, ${H(I)}; GTX 1080: ${N99.length} runs, ${H(N99)}`);
    // SECTION 98's OWED RUN: the 1080's first report at the pinned commit after section 98 -- by its start time, b2. Section 98 fixed
    // that if its timing gate died again the 1080 keeps no verdict and the next round is the crash. A later green run at the same
    // commit is not the owed run: reading it in would be choosing the run after the data (section 76).
    const owed = [...N].sort((x, y) => String(x.at).localeCompare(String(y.at)))[0], tg = (r) => r.red.find((x) => x.gate === "render/denoiseTiming-selfcheck.mjs");
    const verdict98 = (o) => (o.allGreen ? "read H off run a and the owed run" : tg(o) ? "no verdict -- the crash is next" : "no verdict");
    ok("!! *** section 98's owed run is b2, and its timing gate died again -- so the 1080 keeps no verdict for round 33, and round 35 is the crash ***",
        owed.file === "b2" && !owed.allGreen && !!tg(owed) && tg(owed).fails === 0 && verdict98(owed) === "no verdict -- the crash is next" &&
        N.find((r) => r.file === "extra-a").allGreen && verdict98({ ...owed, allGreen: true, red: [] }) === "read H off run a and the owed run",
        `b2 (${owed.at}): ${owed.red.map((x) => `${x.gate.split("/").pop()} red after ${(x.ms / 1000).toFixed(1)} s, ${x.fails} FAIL, ${x.measured} measured line(s)`).join("; ")}`);
    // the predictions, read off the reports: the Intel's held; the 1080's were not reached
    const within = (rs, f, lo, hi) => rs.every((r) => f(r) >= lo && f(r) <= hi);
    ok("  section 100's account of section 99's predictions: on the Intel the list fill was inside 15-80 ms and the chain 1.8-2.2 x against today's page, as predicted; on the 1080 none was reached",
        within(I, (r) => r.fillList, 15, 80) && within(I, (r) => r.ratioList, 1.8, 2.2) && N99.length === 0,
        `Intel fillList ${I.map((r) => r.fillList).join(", ")} ms, full / halfList ${I.map((r) => r.ratioList).join(", ")} x, with its history ${I.map((r) => r.ratioListHist).join(", ")} x`);
    // reported: the timing gate on the 1080 since round 33, run by realGpuRun
    const all1080 = [["a", "denoise-rig-r33-a-gtx1080.json"], ["b", "denoise-rig-r33-b-gtx1080.json"]].map(([k, f]) => readRun(load(f), k)).concat(N);
    say(`section 100, gtx1080: the timing gate died in ${all1080.filter((r) => tg(r)).length} of ${all1080.length} realGpuRun runs (${all1080.filter((r) => tg(r)).map((r) => `${r.file} at ${(tg(r).ms / 1000).toFixed(1)} s`).join(", ")}), each with no FAIL line, and once more run alone -- reported, deciding nothing`);
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nALL GREEN");
console.log("not read here: any time section 4 printed. On SwiftShader a kernel's time is a CPU's; the rig round reads them (backlog denoise-halfres-rig-timing).");
REPORT.write();
process.exit(fails ? 1 : 0);
