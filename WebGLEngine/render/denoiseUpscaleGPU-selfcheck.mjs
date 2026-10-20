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
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { COVERAGE_WGSL, FILL_RING_WGSL, FILL_LEFT_WGSL, TO_T_WGSL, COMPOSITE_WGSL, COVERAGE_GRID_WGSL, SPHERE_STRIDE, packSpheres, cameraUniform, DenoiseUpscaleGPU } from "./denoiseUpscaleGPU.mjs";
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
    const ks = { COVERAGE_WGSL, FILL_RING_WGSL, FILL_LEFT_WGSL, TO_T_WGSL, COMPOSITE_WGSL };
    const bad = Object.entries(ks).map(([k, s]) => [k, validateWgsl(s)]).filter(([, p]) => p.length);
    ok("every kernel validates against the spec scanner", !bad.length, bad.map(([k, p]) => `${k}: ${p.join("; ")}`).join(" | "));
    ok("  the constants the kernels carry are the CPU's: the coverage grid, the transfer's gamma, its top below the pole",
        COVERAGE_GRID_WGSL === COVERAGE_GRID && GAMMA === 2.2 && /pow\(v \/ \(1\.0 \+ v\), 1\.0 \/ 2\.2\)/.test(TO_T_WGSL) && /pow\(tt, 2\.2\)/.test(COMPOSITE_WGSL) &&
        /1\.0 - 5\.9604645e-8/.test(COMPOSITE_WGSL) && Math.abs(5.9604645e-8 - 2 ** -24) < 1e-14 && /> 1e-6/.test(COVERAGE_WGSL),
        `grid ${COVERAGE_GRID_WGSL} against ${COVERAGE_GRID}; gamma ${GAMMA}`);
    const S = makeScene("R", 44001), sp = packSpheres(S.scene), em = S.scene.findIndex((s) => s.emit);
    ok("  a scene packs as SPHERE_STRIDE floats a sphere, its emitter flagged and its emission spread to rgb",
        SPHERE_STRIDE === 8 && sp.length === S.scene.length * 8 && sp[em * 8 + 7] === 1 && sp[7] === 0 && sp[em * 8 + 4] === Math.fround(typeof S.scene[em].emit === "number" ? S.scene[em].emit : S.scene[em].emit[0]));
    let mesh = null; try { packSpheres([{ bvh: {} }]); } catch (e) { mesh = e.message; }
    ok("  ...and a scene with a mesh is refused by name -- the coverage kernel intersects spheres only", /spheres only/.test(mesh || ""));
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
const payload = { scenes: SCENES.map(wire), fill: { img: Array.from(F1.img), cov: Array.from(F1.cov) }, chainIn: chainIn.map((a) => Array.from(a)),
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
    const chains = [];
    for (let i = 0; i < P.chainIn.length; i++) {
        const c = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS);
        chains.push({ ...c, y: A(c.y) });
    }
    let wrongBackend = null;
    try { new DenoiseUpscaleGPU(await requestDevice(document.createElement("canvas"), { backend: "webgl2", offscreen: true })); } catch (e) { wrongBackend = String(e.message).slice(0, 160); }
    const ad = await navigator.gpu.requestAdapter(), info = ad.info || {};
    return { cov, fills, chains, errs, backend: dev.backend, wrongBackend, adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") };
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
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nALL GREEN");
console.log("not timed here: any of it. On SwiftShader a kernel's time is a CPU's; the rig round times the chain (backlog denoise-halfres-rig-timing).");
REPORT.write();
process.exit(fails ? 1 : 0);
