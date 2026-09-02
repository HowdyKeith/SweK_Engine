#!/usr/bin/env node
// WebGLEngine/tools/ship/fleetMask-selfcheck.mjs -- v4317 (Level 17), v4318 (the mask on the device, two universes composited)
//
// GRADES THE IDENTITY PICTURE AS A MASK: the fleets scene's pick picture turned into a strength field (1 where one
// race is, 0 elsewhere), and Level 11's badTv FIELD pipeline drawing the colour picture through it on both
// backends. The claim is to the byte: outside the mask the picture is unchanged, inside it the effect changed
// pixels; a mask of nothing changes nothing; a mask of everything changes as the plain effect would. v4317's mask went
// through the CPU (a readback, an upload); v4318 keeps it on the device (frame targets, a pick-to-mask pass) and this
// gate holds the device path to the CPU path's picture, to the byte, on both backends -- then composites two universes.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { maskFromPick, maskDiff, fleetBits } from "../../render/fleetMask.mjs";
import { RACES } from "../../render/fleets.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

console.log("\n1. THE MASK ON THE CPU: from hits to a field, counted");
{
    const hits = [null, { id: 1, lod: 0, fleet: 2 }, { id: 2, lod: 0, fleet: 5 }, { id: 3, lod: 1, fleet: 2 }];
    const m = maskFromPick({ width: 2, height: 2, hits }, 2);
    ok("a mask of one fleet: red 255 where that fleet is, 0 elsewhere, alpha 255 everywhere; the counts add up", Array.from(m.data).join() === [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255].join() && m.inside === 2 && m.outside === 2);
    const m2 = maskFromPick({ width: 2, height: 2, hits }, [2, 5], { soft: 0.2 });
    ok("  several fleets at once, and a soft floor for the rest", m2.inside === 3 && m2.data[0] === 51 && m2.data[8] === 255);
    const src = { width: 2, height: 2, pixels: new Uint8Array([10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255, 40, 40, 40, 255]) }, res = { width: 2, height: 2, pixels: new Uint8Array([10, 10, 10, 255, 99, 20, 20, 255, 30, 31, 30, 255, 40, 40, 40, 255]) };
    const d = maskDiff(src, res, m);
    ok("  maskDiff counts a change inside and a change outside separately, and reports the worst outside", d.inChanged === 1 && d.outChanged === 1 && d.worstOut === 1 && d.inside === 2);
}

console.log("\n2. ON BOTH BACKENDS: one race flickers, the rest of the picture is untouched to the byte");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const CHAOS = RACES.findIndex((r) => r.name === "Chaos"), UNION = RACES.findIndex((r) => r.name === "Union");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, CHAOS, UNION, FLEETS: RACES.length }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const M = await import("/render/fleetMask.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = G.gridScene({ side: 10, z: -2, spacing: 1, radii: [0.4] }), count = records.length / 4, fleetOf = Uint32Array.from({ length: count }, (_, i) => i % a.FLEETS);
        const viewProj = G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0]));
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const std = F.standardFleets(dev, { clock: () => 0.5 });
            const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records });
            const source = await sc.frame({ viewProj, eye: [0, 0, 8], read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels;
            const pick = await sc.pickPicture();
            const one = M.maskFromPick(pick, a.CHAOS), none = M.maskFromPick(pick, 99), all = M.maskFromPick(pick, Array.from({ length: a.FLEETS }, (_, i) => i));
            all.data.fill(255);   // everything: the plain effect
            const res1 = await M.maskedBadTv(dev, { source, mask: one, read: true, offscreen: true, time: 0.5 });
            const res0 = await M.maskedBadTv(dev, { source, mask: none, read: true, offscreen: true, time: 0.5 });
            const resAll = await M.maskedBadTv(dev, { source, mask: all, read: true, offscreen: true, time: 0.5 });
            out[backend] = { backend: dev.backend, one: M.maskDiff(source, res1, one), none: M.maskDiff(source, res0, none), all: M.maskDiff(source, resAll, all), maskInside: one.inside, total: source.width * source.height };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(`${b}: the Chaos race's mask covers some of the picture and not most of it`, R.maskInside > 200 && R.maskInside < R.total * 0.3, `${R.maskInside} of ${R.total} pixels`);
            ok(`*** ${b}: through the mask, badTv changed pixels INSIDE the race and left the rest UNCHANGED TO THE BYTE ***`, R.one.inChanged > R.one.inside * 0.2 && R.one.outChanged === 0 && R.one.worstOut === 0, `inside ${R.one.inChanged}/${R.one.inside} changed, outside ${R.one.outChanged}/${R.one.outside} (worst ${R.one.worstOut})`);
            ok(`  ${b}: a mask of nothing changes nothing`, R.none.inChanged === 0 && R.none.outChanged === 0, `worst ${R.none.worstOut}`);
            ok(`  ${b}: a mask of everything changes the picture as the plain effect would -- more pixels than the one race's mask did, well over a twentieth of the picture (badTv at these knobs leaves a dark background dark)`, R.all.inChanged > R.one.inChanged && R.all.inChanged > R.total * 0.05, `${R.all.inChanged} of ${R.total}`);
        }
    }
}

console.log("\n3. THE MASK ON THE DEVICE (v4318): frame targets, the pick-to-mask pass, nothing read back -- and the picture is the CPU path's, to the byte");
{
    ok("fleetBits packs fleets into two 16-bit words the shader decodes", fleetBits([0, 3]).join() === "9,0" && fleetBits([16, 31]).join() === "0,32769" && fleetBits(5).join() === "32,0" && fleetBits([2, 40]).join() === "4,0");
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const CHAOS = RACES.findIndex((r) => r.name === "Chaos");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, CHAOS, FLEETS: RACES.length }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const M = await import("/render/fleetMask.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = G.gridScene({ side: 10, z: -2, spacing: 1, radii: [0.4] }), count = records.length / 4, fleetOf = Uint32Array.from({ length: count }, (_, i) => i % a.FLEETS);
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const std = F.standardFleets(dev, { clock: () => 0.5 });
            const sc = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records });
            // the CPU path, as v4317: readback, mask on the CPU, upload
            const t0 = performance.now();
            const source = await sc.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels;
            const pick = await sc.pickPicture(); const cpuMask = M.maskFromPick(pick, a.CHAOS);
            const cpu = await M.maskedBadTv(dev, { source, mask: cpuMask, read: true, offscreen: true, time: 0.5 });
            const tCpu = performance.now() - t0;
            // the device path: targets, the pick-to-mask pass, one readback only because the gate must look
            const rig = M.makeMaskRig(dev, { width: a.N, height: a.N });
            const t1 = performance.now();
            const gpu = await rig.draw({ colour: (t) => sc.frame({ ...cam, clear: [0.05, 0.05, 0.08, 1], target: t }), pick: (t) => sc.pickTo(t), fleets: a.CHAOS, time: 0.5, read: true, offscreen: true });
            const tGpu = performance.now() - t1;
            const devMask = await rig.readMask(), devColour = await rig.readColour();
            let maskSame = 0, maskInside = 0, colourSame = 0, same = 0, worst = 0;
            for (let i = 0; i < a.N * a.N; i++) { if ((devMask.pixels[i * 4] > 127) === (cpuMask.data[i * 4] > 127)) maskSame++; if (devMask.pixels[i * 4] > 127) maskInside++;
                let d = 0, dc = 0; for (let c = 0; c < 3; c++) { d = Math.max(d, Math.abs(cpu.pixels[i * 4 + c] - gpu.pixels[i * 4 + c])); dc = Math.max(dc, Math.abs(source.pixels[i * 4 + c] - devColour.pixels[i * 4 + c])); }
                if (d === 0) same++; worst = Math.max(worst, d); if (dc === 0) colourSame++; }
            const diff = M.maskDiff(source, gpu, cpuMask);
            out[backend] = { backend: dev.backend, total: a.N * a.N, maskSame, maskInside, cpuInside: cpuMask.inside, colourSame, same, worst, diff, tCpu, tGpu };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(`${b}: the colour target holds the same picture the offscreen readback did, every byte`, R.backend === b && R.colourSame === R.total, `${R.colourSame} of ${R.total}`);
            ok(`*** ${b}: the mask the DEVICE built from the identity picture is the CPU's mask, pixel for pixel (${R.maskInside} inside) ***`, R.maskSame === R.total && R.maskInside === R.cpuInside && R.maskInside > 200, `${R.maskSame} of ${R.total} agree; inside ${R.maskInside} vs ${R.cpuInside}`);
            ok(`*** ${b}: badTv through the device mask is badTv through the CPU mask, to the byte -- and outside the race the picture is untouched ***`, R.same === R.total && R.worst === 0 && R.diff.outChanged === 0 && R.diff.inChanged > R.diff.inside * 0.2, `${R.same} of ${R.total} identical, worst ${R.worst}; inside changed ${R.diff.inChanged}/${R.diff.inside}, outside ${R.diff.outChanged}`);
            report(`${b}: the CPU path took ${R.tCpu.toFixed(1)} ms (two readbacks, two uploads), the device path ${R.tGpu.toFixed(1)} ms with the one readback the gate needs -- SwiftShader's clock, not a GPU's`);
        }
    }
}

console.log("\n4. TWO UNIVERSES COMPOSITED THROUGH THE IDENTITY PICTURE (v4318): A where one race is, B everywhere else, to the byte, on both backends");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const CHAOS = RACES.findIndex((r) => r.name === "Chaos"), UNION = RACES.findIndex((r) => r.name === "Union");
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 192, CHAOS, UNION, FLEETS: RACES.length }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const F = await import("/render/fleets.mjs"); const M = await import("/render/fleetMask.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const recA = G.gridScene({ side: 10, z: -2, spacing: 1, radii: [0.4] }), count = recA.length / 4, fleetOf = Uint32Array.from({ length: count }, (_, i) => i % a.FLEETS);
        const recB = Float32Array.from(recA); for (let i = 0; i < recB.length; i += 4) { recB[i] += 0.5; recB[i + 1] -= 0.3; }   // the other universe: shifted
        const cam = { viewProj: G.multiply(G.perspective(Math.PI / 3, 1, 0.1, 100), G.lookAt([0, 0, 8], [0, 0, 0])), eye: [0, 0, 8] };
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const std = F.standardFleets(dev, { clock: () => 0.5 });
            const A = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records: recA });
            const B = G.makeGpuDrivenScene(dev, { fleets: std.fleets, fleetOf, thresholds: [0.03], records: recB });
            const picA = await A.frame({ ...cam, read: true, clear: [0.05, 0.05, 0.08, 1] }).pixels, picB = await B.frame({ ...cam, read: true, clear: [0.2, 0.02, 0.02, 1] }).pixels;
            const mask = M.maskFromPick(await A.pickPicture(), [a.CHAOS, a.UNION]);
            const rig = M.makeMaskRig(dev, { width: a.N, height: a.N }), other = rig.target();
            const comp = await rig.composite({ a: (t) => A.frame({ ...cam, clear: [0.05, 0.05, 0.08, 1], target: t }), b: (t) => B.frame({ ...cam, clear: [0.2, 0.02, 0.02, 1], target: t }), pick: (t) => A.pickTo(t), fleets: [a.CHAOS, a.UNION], other, read: true, offscreen: true });
            let inA = 0, inB = 0, outA = 0, outB = 0, inside = 0, outside = 0, abDiffer = 0;
            for (let i = 0; i < a.N * a.N; i++) { const on = mask.data[i * 4] > 127; let dA = 0, dB = 0, dAB = 0; for (let c = 0; c < 3; c++) { dA = Math.max(dA, Math.abs(comp.pixels[i * 4 + c] - picA.pixels[i * 4 + c])); dB = Math.max(dB, Math.abs(comp.pixels[i * 4 + c] - picB.pixels[i * 4 + c])); dAB = Math.max(dAB, Math.abs(picA.pixels[i * 4 + c] - picB.pixels[i * 4 + c])); }
                if (dAB) abDiffer++; if (on) { inside++; if (dA === 0) inA++; if (dB === 0) inB++; } else { outside++; if (dA === 0) outA++; if (dB === 0) outB++; } }
            const half = await rig.composite({ a: (t) => A.frame({ ...cam, clear: [0.05, 0.05, 0.08, 1], target: t }), b: (t) => B.frame({ ...cam, clear: [0.2, 0.02, 0.02, 1], target: t }), pick: (t) => A.pickTo(t), fleets: [a.CHAOS, a.UNION], other, weight: 0.5, read: true, offscreen: true });
            let between = 0; for (let i = 0; i < a.N * a.N; i++) if (mask.data[i * 4] > 127) { const v = half.pixels[i * 4], lo = Math.min(picA.pixels[i * 4], picB.pixels[i * 4]), hi = Math.max(picA.pixels[i * 4], picB.pixels[i * 4]); if (v >= lo - 1 && v <= hi + 1) between++; }
            out[backend] = { backend: dev.backend, total: a.N * a.N, inside, outside, inA, inB, outA, outB, abDiffer, between };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(`${b}: the two universes differ on most of the picture (a shifted grid on a different sky), and the mask covers some of it`, R.abDiffer > R.total * 0.3 && R.inside > 500 && R.inside < R.total * 0.4, `${R.abDiffer} pixels differ; mask ${R.inside} of ${R.total}`);
            ok(`*** ${b}: INSIDE the two races' silhouettes every pixel is universe A's, OUTSIDE every pixel is universe B's -- to the byte ***`, R.inA === R.inside && R.outB === R.outside, `inside A ${R.inA}/${R.inside} (B ${R.inB}); outside B ${R.outB}/${R.outside} (A ${R.outA})`);
            ok(`  ${b}: at half weight the inside lies between the two universes' values`, R.between === R.inside, `${R.between} of ${R.inside}`);
        }
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4317.
//   A  maskFromPick() writing 255 everywhere -> exit=1, 7 red: the CPU byte pattern, the soft floor and the diff count;
//      on both backends "a mask of nothing" changes everything and the everything-mask control is no longer more
//      than the one race's (they are the same mask).
//   B  the field texture bound to the wrong unit (the source as the mask, the mask as the source) -> exit=1, 4 red:
//      on both backends every outside pixel changes (36,429 of 36,429, worst 255) and a mask of nothing changes everything.
//   C  maskDiff() counting everything as inside -> exit=1, 3 red: the CPU diff line, and on both backends the
//      "outside unchanged" claim has no outside to be unchanged (0 of 0), which the gate refuses as a pass.
//   MEASURED at v4318 (the device path):
//   D  the pick-to-mask WGSL decoding the fleet from the RED byte (the id's low bits) -> exit=1, 3 red on WebGPU: the device
//      mask agrees with the CPU's on 36,183 of 36,864 pixels (328 inside for 435), badTv leaks outside the race (249 pixels,
//      worst 242) and the composite shows B inside A's silhouette. WebGL2 stays green: the GLSL, untouched, still reads blue.
//   E  the WebGL2 target blit NOT turned over (a straight blit) -> exit=1, 4 red on WebGL2: the colour target differs from the
//      offscreen readback on 4,110 pixels (the picture upside down), the masked badTv parts from the CPU path's, the composite
//      shows A outside its silhouette, and the half-weight check fails -- the row-flip is what makes one shader read both backends.
//   F  the composite's mix() arguments swapped (A outside, B inside) -> exit=1, 1 red on WebGPU: inside A 490 of 2,297 (B 2,297),
//      outside B 13 of 34,567 (A 34,567) -- the picture exactly inverted, named as such.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the device path's TIME on a real GPU (SwiftShader's clock is reported, not graded); only badTv is masked -- crt and " +
    "the SwiftUI ports take the same field; and a composite of two universes that are two PEERS' (the page composites two seeds in one tab; " +
    "the wire carries one universe).");
process.exit(fails ? 1 : 0);
