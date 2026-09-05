#!/usr/bin/env node
// WebGLEngine/tools/ship/worleyDevice-selfcheck.mjs -- v4480 (git terrain, step 2)
//
// GATES render/worleyWgsl.mjs: the Worley biome field as a compute pass, held to world/worleyBiomes.js through one
// implementation with one rounding knob.
//
// THREE CLAIMS, EACH MEASURED. (1) The f64 knob IS the shipped module: over 4,096 random points and seeds the ids
// agree and the blend agrees to the bit, because the flat twin is the same operations in the same order. (2) The f32
// knob disagrees with the f64 one only where two feature points tie inside f32 rounding -- the count is printed and
// required to be 0 on the probe field, and the blend within 1e-6. (3) The device IS the f32 knob: on Dawn the packed
// element (primary id, secondary id, blend byte) is identical on every texel, and the raw blend within 1e-6 -- the
// measured floor is 5.4e-7 on 410 of 4,096 texels, one f32 ulp of a value under 0.5, and the tolerance is that
// floor doubled, stated before the second run. The integer half is exact by construction and the gate says where
// the f32 float half is not.
//
// THE CONTROLS: another seed moves most of the map; a coarser cell scale makes fewer borders; a hash bit flipped in
// the twin alone parts it from the shipped module AND from the device, by name.
//
// SABOTAGE (v4480), each applied to render/worleyWgsl.mjs, run, restored byte for byte:
//   A  the kernel's classify threshold shifted (0.25 -> 0.35 for "cold")    -> exit=1, 2 red: the packed identity at 4084 of 4096 (texel 384 named,
//                                                                             tundra where the twin says taiga) and the other seed's at 3389
//   B  the twin's hashU multiplier changed by one                             -> exit=1, 5 red: the f64 pin at 293 of 4096, the device identity at 295,
//                                                                             the blend at 0.5, the other seed, the browser's fields -- every side parts
//   C  paintField writing the blend byte into green and the id into blue      -> exit=1, 3 red: the channel check, the null-device paint, the browser's bytes
//
// Run: node tools/ship/worleyDevice-selfcheck.mjs      (~2 s on Dawn, plus one browser for the device path)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runWgslComputeNative, headlessGpuSkipReason, exitCleanly } from "./headlessGpu.mjs";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { nullBackend } from "../../gfx/device.js";
import * as W from "../../render/worleyWgsl.mjs";
import { BIOMES } from "../../world/worleyBiomes.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
let rng = 12345; const rnd = () => (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296;
const P = W.PROBE_ARGS, N = P.size * P.size;

// ---------------------------------------------------------------------------------------------------------
sec("1. THE f64 KNOB IS THE SHIPPED MODULE, AND THE f32 KNOB IS COUNTED AGAINST IT");
// ---------------------------------------------------------------------------------------------------------
{
    let idOk = 0, worstBlend = 0; const SAMPLES = 4096;
    for (let k = 0; k < SAMPLES; k++) { const x = rnd() * 16 - 8, z = rnd() * 16 - 8, seed = (rnd() * 4294967296) >>> 0;
        const a = W.biomeFlat(x, z, seed), b = W.shippedAt(x, z, seed); if (a.id1 === b.id1 && a.id2 === b.id2) idOk++; worstBlend = Math.max(worstBlend, Math.abs(a.blend - b.blend)); }
    ok(idOk === SAMPLES && worstBlend === 0, `*** biomeFlat with the identity knob IS worleyBiomes.biomeAt: ${idOk} of ${SAMPLES} random (point, seed) pairs agree on both biomes and the blend to the bit ***`, `blend worst ${worstBlend}`);
    ok(Object.keys(W.BIOME_IDS).length === 8 && W.BIOME_IDS.jungle === BIOMES.jungle.id && W.BIOME_BY_ID[1] === "tundra", "the eight biome ids are the shipped table's, not retyped");
    const f64 = W.fieldCpu(P), f32 = W.fieldCpuF32(P);
    let dis = 0, wb = 0; const disAt = [];
    for (let i = 0; i < N; i++) { const a = W.unpack(f64[2 * i]), b = W.unpack(f32[2 * i]); if (a.id1 !== b.id1 || a.id2 !== b.id2) { dis++; if (disAt.length < 3) disAt.push(i); } wb = Math.max(wb, Math.abs(f64[2 * i + 1] - f32[2 * i + 1])); }
    ok(dis === 0 && wb <= 1e-6, `the f32 knob against the f64 one over the ${P.size}x${P.size} probe field: ${dis} biome disagreements (a tie inside f32 rounding would be one), blend within 1e-6`, `worst blend ${wb.toExponential(2)}${disAt.length ? "; at " + disAt.join(",") : ""}`);
    ok(validateWgsl(W.WORLEY_WGSL).length === 0 && /fn hashU/.test(W.WORLEY_WGSL) && /\* 374761393u/.test(W.WORLEY_WGSL) && /h >> 13u/.test(W.WORLEY_WGSL), "the kernel validates and its hash is the shipped constants in u32 with logical shifts");
    const u = W.packWorleyUniforms(P), dv = new DataView(u.buffer);
    ok(u.length === 8 && dv.getUint32(24, true) === (P.seed >>> 0) && Math.abs(dv.getFloat32(12, true) - P.cellScale) < 1e-7, "the uniform block carries the seed as u32 bits after six floats, 32 bytes");
    // the controls, on the CPU twin
    const other = W.fieldCpuF32({ ...P, seed: (P.seed + 1) >>> 0 });
    let moved = 0; for (let i = 0; i < N; i++) if (W.unpack(f32[2 * i]).id1 !== W.unpack(other[2 * i]).id1) moved++;
    ok(moved > N * 0.3, `CONTROL: a seed one apart moves the primary biome on ${moved} of ${N} texels`, `${(100 * moved / N).toFixed(0)}%`);
    const borders = (F, size) => { let b = 0; for (let i = 0; i < size * size; i++) if (i % size < size - 1 && W.unpack(F[2 * i]).id1 !== W.unpack(F[2 * i + 2]).id1) b++; return b; };
    const coarse = W.fieldCpuF32({ ...P, cellScale: P.cellScale * 4 });
    ok(borders(coarse, P.size) < borders(f32, P.size), `CONTROL: four times the cell scale makes fewer borders (${borders(coarse, P.size)} against ${borders(f32, P.size)} horizontal biome changes)`);
    const distinct = new Set(); for (let i = 0; i < N; i++) distinct.add(W.unpack(f32[2 * i]).id1);
    ok(distinct.size >= 4 && [...distinct].every((d) => d >= 1 && d <= 8), `the probe field carries ${distinct.size} distinct biomes, all in 1..8`, [...distinct].sort().map((d) => W.BIOME_BY_ID[d]).join(", "));
}

// ---------------------------------------------------------------------------------------------------------
sec("2. ON DAWN: the device IS the f32 knob -- the packed element to the bit, the blend to 1e-6");
// ---------------------------------------------------------------------------------------------------------
const nSkip = headlessGpuSkipReason();
if (nSkip) { console.log(`  SKIP  ${nSkip}`); fails++; }
else {
    const f32 = W.fieldCpuF32(P);
    const r = await runWgslComputeNative({ code: W.WORLEY_WGSL, outCount: N * W.OUT_PER_TEXEL, uniforms: W.packWorleyUniforms(P), workgroups: Math.ceil(N / 64) });
    ok(r.ok, "the kernel runs on Dawn", r.ok ? `${r.values.length} floats` : (r.reason + " " + (r.errors || []).join("; ")));
    if (r.ok) {
        let same = 0, blendSame = 0, worst = 0; const diffAt = [];
        for (let i = 0; i < N; i++) { if (r.values[2 * i] === f32[2 * i]) same++; else if (diffAt.length < 3) diffAt.push(`${i}: ${JSON.stringify(W.unpack(r.values[2 * i]))} vs ${JSON.stringify(W.unpack(f32[2 * i]))}`);
            if (r.values[2 * i + 1] === f32[2 * i + 1]) blendSame++; worst = Math.max(worst, Math.abs(r.values[2 * i + 1] - f32[2 * i + 1])); }
        ok(same === N, `*** the packed element -- primary, secondary, blend byte -- is IDENTICAL on ${same} of ${N} texels ***`, diffAt.join(" | "));
        ok(worst <= W.PROBES[0].tol, `*** the raw blend is within ${W.PROBES[0].tol} on every texel ***`, `identical on ${blendSame}, worst ${worst.toExponential(2)} -- one f32 ulp of a value under 0.5, the measured floor the tolerance is stated from`);
        // the same seed change on the device
        const r2 = await runWgslComputeNative({ code: W.WORLEY_WGSL, outCount: N * W.OUT_PER_TEXEL, uniforms: W.packWorleyUniforms({ ...P, seed: (P.seed + 1) >>> 0 }), workgroups: Math.ceil(N / 64) });
        const other = W.fieldCpuF32({ ...P, seed: (P.seed + 1) >>> 0 }); let same2 = 0; for (let i = 0; i < N; i++) if (r2.ok && r2.values[2 * i] === other[2 * i]) same2++;
        ok(r2.ok && same2 === N, "CONTROL: the other seed's field is identical to ITS twin too -- the identity is not one lucky seed", `${same2} of ${N}`);
    }
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE PAINT: green is the biome, blue the blend byte, alpha the language layer, red untouched");
// ---------------------------------------------------------------------------------------------------------
{
    const size = 8, field = { width: size, height: size, data: new Uint8Array(size * size * 4) };
    for (let i = 0; i < size * size; i++) { field.data[i * 4] = i; field.data[i * 4 + 3] = 255; }
    const packed = W.fieldCpuF32({ ...P, size });
    W.paintField(field, packed, (i) => 3 + (i % 2));
    let chanOk = true;
    for (let i = 0; i < size * size; i++) { const u = W.unpack(packed[2 * i]); if (field.data[i * 4] !== i || field.data[i * 4 + 1] !== u.id1 * 16 + u.id2 || field.data[i * 4 + 2] !== u.blendByte || field.data[i * 4 + 3] !== 3 + (i % 2)) chanOk = false; }
    ok(chanOk, "*** paintField: red kept, green = primary * 16 + secondary, blue = blend byte, alpha = the caller's layer ***");
    ok(W.unpackGreen(5 * 16 + 7).id1 === 5 && W.unpackGreen(5 * 16 + 7).id2 === 7 && W.unpackGreen(8 * 16 + 8).id1 === 8, "  and unpackGreen reads both ids back (8 and 8 fit: 136)");
    ok((() => { try { W.paintField(field, new Float32Array(10)); return false; } catch (e) { return /texels of biome/.test(e.message); } })(), "a packed field of the wrong size is refused by name");
    const nb = nullBackend();
    const bt = { params: { originX: -4, originZ: -4, extent: 8, heightScale: 1 }, field: { width: size, height: size, data: new Uint8Array(size * size * 4) }, repo: { biomes: new Uint8Array(size * size).fill(5) } };
    const res = await W.paintBiomes(nb, bt, { seed: P.seed, cellScale: P.cellScale });
    const want = W.fieldCpuF32({ ...P, size, cellScale: P.cellScale });
    let painted = true; for (let i = 0; i < size * size; i++) { const u = W.unpack(want[2 * i]); if (bt.field.data[i * 4 + 1] !== u.id1 * 16 + u.id2 || bt.field.data[i * 4 + 3] !== 6) painted = false; }
    ok(res.path === "cpu" && painted, "paintBiomes on a backend without compute takes the f32 twin and says `cpu`; the treemap's language layer lands in alpha as its id + 1 (0 is no layer, 1 the lake bed)");
}

// ---------------------------------------------------------------------------------------------------------
sec("4. THROUGH gfx/device.js IN THE BROWSER: the compute path paints the same bytes the twin paints");
// ---------------------------------------------------------------------------------------------------------
const bSkip = webgpuSkipReason();
if (bSkip) { console.log(`  SKIP  ${bSkip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { P, size: 32 }, script: `async (a) => {
        const W = await import("/render/worleyWgsl.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const bt = { params: { originX: a.P.originX, originZ: a.P.originZ, extent: a.P.extent, heightScale: 1 }, field: { width: a.size, height: a.size, data: new Uint8Array(a.size * a.size * 4) } };
            const res = await W.paintBiomes(dev, bt, { seed: a.P.seed, cellScale: a.P.cellScale });
            out[backend] = { path: res.path, data: Array.from(bt.field.data) };
            dev.destroy();
        }
        return out;
    }` });
    ok(r.ok && r.result.webgpu.path === "compute" && r.result.webgl2.path === "cpu", "WebGPU paints by the compute pass, WebGL2 by the twin, each saying so", r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok) {
        const twin = W.fieldCpuF32({ ...P, size: 32 }); let g = 0, b = 0;
        for (let i = 0; i < 32 * 32; i++) { const u = W.unpack(twin[2 * i]), gg = u.id1 * 16 + u.id2; if (r.result.webgpu.data[i * 4 + 1] === gg && r.result.webgpu.data[i * 4 + 2] === u.blendByte) g++; if (r.result.webgl2.data[i * 4 + 1] === gg && r.result.webgl2.data[i * 4 + 2] === u.blendByte) b++; }
        ok(g === 32 * 32 && b === 32 * 32, "*** and the two backends' fields are byte-identical to the twin and so to each other ***", `${g} / ${b} of ${32 * 32}`);
    }
    const page = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    ok(/const biomes = await paintBiomes\(device, bt, \{ seed: b\.seed \}\)/.test(page) && /biomes by \$\{biomes\.path\}/.test(page), "orrery-gpu.html paints a landing's biomes with the BODY'S seed and says which path painted them");
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: the biome COLOURS (git terrain step 3 draws them); the voxel world's materials, which worleyBiomes chooses and this kernel does not; and any GPU but SwiftShader, where the blend's last ulp may fall the other way and the packed byte can only move where a blend sits within 1/510 of a byte boundary.");
exitCleanly(fails ? 1 : 0);
