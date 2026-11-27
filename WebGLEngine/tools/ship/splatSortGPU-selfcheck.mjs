// WebGLEngine/tools/ship/splatSortGPU-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/splatSortGPU-selfcheck.mjs      (a few minutes on SwiftShader; each device case runs in its own child process, see section 2)
//      node tools/ship/realGpuRun.mjs --native --only splatSortGPU      (on a real GPU: the timing line below is then the card's, not a CPU's)
//
// THE SPLAT DEPTH SORT ON THE GRAPHICS CARD, HELD TO THE CPU SORT. render/splatSortGPU.mjs is PlayCanvas's portable 4-bit radix sort (MIT) ported to the
// raw WebGPU API. Three things hold it:
//
//   1  THE KERNELS      every constant filled, every kernel compiles on the device, the scan levels and dispatch grid, the licence kept
//   2  THE SORT         on node-webgpu, against render/splatSort.mjs's radixSortIndices: THE SAME PERMUTATION, TIES INCLUDED, at sizes that cross every
//                       boundary (one key, under a workgroup, exactly one, one over, a two-level scan, 100,000), negative keys and both zeros, and 16 bits
//   3  THE DEPTH KEYS   made on the card from positions the way engine/SplatRenderer.js makes them on the CPU: each key within a few ulps (f32 against
//                       f64), the card's order exactly sorted by the card's keys, and the order the same as the CPU's except near-ties
//
// *** WHY EACH DEVICE CASE IS A CHILD PROCESS, AND WHAT A RETRY IS ALLOWED TO MEAN. *** On this sandbox's SwiftShader the sort's reorder pass (three
// workgroup barriers in each of eight rounds, 256 invocations a workgroup) makes the software renderer ABORT in many runs -- glibc mutex assertions,
// "The futex facility returned an unexpected error code", or tools/ship/headlessGpu.mjs's EXIT_HAZARD message -- while every run that finishes is exact.
// tools/ship/headlessGpu.mjs's own gates, which do not loop over barriers, pass 3 of 3 here. Out-of-range reads made it worse (1 of 4 runs finished at
// 100,000 keys before the shaders' reads were clamped, 4 of 4 after) and are fixed in the module. So a case that ABORTS (no result line, a native
// message) is run again, up to ATTEMPTS times, and the gate says how many aborts it saw. A case that FINISHES WRONG is never retried: it fails at once.
// A case that aborts every time FAILS: an abort is never a pass.
//
// SABOTAGE LOG: 14 mutants of render/splatSortGPU.mjs, each in a hard-linked copy of the tree: ALL 14 RED (an unstable rank, seven passes, a 3-bit step,
// the scan left inclusive, no block add, the keys buffer read as the result, the depth key's sign flipped, the origin ignored, negative keys unflipped, the
// reorder's read unclamped, the histogram dropping its last workgroup, bits unchecked, the licence dropped, the scan's level bound moved). The inclusive
// scan HUNG the device until a hang was made a failure rather than a retried abort (CASE_MS).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason } from "./headlessGpu.mjs";
import * as G from "../../render/splatSortGPU.mjs";
import * as C from "../../render/splatSort.mjs";

const require = createRequire(import.meta.url), SELF = fileURLToPath(import.meta.url), ENG = path.resolve(path.dirname(SELF), "..", "..");
export const ATTEMPTS = 5, CASE_MS = 180000, SIZES = Object.freeze([1, 7, 2048, 2049, 66000, 100000]);
const NATIVE_ABORT = /futex|Fatal glibc|pthread|std::system_error|Invalid argument|Segmentation|Aborted/;

// ---- the inputs, the same in the child and the parent ----
/** Float keys of `n` splats: a hash spread over -50..50, a run of equal keys (every 37th is 3), and -0 and +0 side by side. Pure. */
export function keysOf(n) {
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++) k[i] = Math.fround(((Math.sin(i * 12.9898) * 43758.5453) % 1) * 100 - 50);
    for (let i = 0; i < n; i += 37) k[i] = 3;
    if (n > 5) { k[1] = -0; k[2] = 0; k[3] = -0; }
    return k;
}
export const VIEW = Object.freeze({ camera: [3, -2, 40], origin: [1, 2, 3], scale: 1.5 });
/** Positions of `n` splats, and the CPU's depth keys exactly as engine/SplatRenderer.js's _sort makes them (f64 arithmetic stored as f32). Pure. */
export function depthCase(n) {
    const pos = new Float32Array(n * 3); for (let i = 0; i < n * 3; i++) pos[i] = Math.fround((((Math.sin(i * 7.31) * 9301.17) % 1) * 20));
    const [cx, cy, cz] = VIEW.camera, [ox, oy, oz] = VIEW.origin, ws = VIEW.scale, keys = new Float32Array(n);
    for (let i = 0; i < n; i++) { const dx = pos[i * 3] * ws + ox - cx, dy = pos[i * 3 + 1] * ws + oy - cy, dz = pos[i * 3 + 2] * ws + oz - cz; keys[i] = -(dx * dx + dy * dy + dz * dz); }
    return { pos, keys };
}

// ---- THE CHILD: one device case, one JSON line ----
async function child(kind, arg) {
    configureVulkanIcd(); const { mod } = resolveWebgpu(require);
    const gpu = mod.create([]), ad = await gpu.requestAdapter(), dev = await ad.requestDevice(), Gl = mod.globals || globalThis, info = ad.info || {};
    const adapter = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || "unknown";
    const make = (capacity, bits = 32) => G.createGpuRadixSort(dev, { capacity, bits, usage: Gl.GPUBufferUsage, mapMode: Gl.GPUMapMode });
    dev.pushErrorScope("validation");
    let out;
    if (kind === "compile") {
        const S = G.shaders(32), errs = [];
        for (const code of [S.scan, S.depth, ...S.histogram, ...S.reorder]) { const ci = await dev.createShaderModule({ code }).getCompilationInfo(); errs.push(...ci.messages.filter((m) => m.type === "error").map((m) => m.message)); }
        out = { kind, errors: errs };
    } else if (kind === "sort") {
        const n = Number(arg), keys = keysOf(n), u = new Uint32Array(n); for (let i = 0; i < n; i++) u[i] = C.floatKeyToUint(keys[i]);
        const s = make(n), t0 = performance.now(), gpuIdx = await s.sortKeys(u), t1 = performance.now(), cpuIdx = C.radixSortIndices(keys, new Uint32Array(n), C.makeSortScratch(n)), t2 = performance.now();
        let differ = 0, first = -1; for (let i = 0; i < n; i++) if (gpuIdx[i] !== cpuIdx[i]) { differ++; if (first < 0) first = i; }
        out = { kind, n, differ, first, gpuMs: t1 - t0, cpuMs: t2 - t1 };
    } else if (kind === "bits16") {
        const n = 5000, u = new Uint32Array(n); for (let i = 0; i < n; i++) u[i] = (Math.imul(i, 2654435761) >>> 0) & 0xffff;
        const idx = await make(n, 16).sortKeys(u); let bad = 0; for (let i = 1; i < n; i++) if (u[idx[i - 1]] > u[idx[i]] || (u[idx[i - 1]] === u[idx[i]] && idx[i - 1] > idx[i])) bad++;
        out = { kind, n, bad, passes: make(4, 16).passes };
    } else if (kind === "depth") {
        const n = Number(arg), { pos, keys } = depthCase(n), { indices, keys: gk } = await make(n).sortDepths(pos, VIEW);
        let keysDiffer = 0, maxUlp = 0, unsorted = 0, orderDiffer = 0, worstGap = 0;
        for (let i = 0; i < n; i++) { const c = C.floatKeyToUint(keys[i]); if (c !== gk[i]) { keysDiffer++; maxUlp = Math.max(maxUlp, Math.abs(c - gk[i])); } }
        for (let i = 1; i < n; i++) if (gk[indices[i - 1]] > gk[indices[i]] || (gk[indices[i - 1]] === gk[indices[i]] && indices[i - 1] > indices[i])) unsorted++;
        const cpu = C.radixSortIndices(keys, new Uint32Array(n), C.makeSortScratch(n));
        // where the two orders differ, how far apart (relative) the CPU's keys of the two splats in that slot are: a near-tie has a tiny gap
        for (let i = 0; i < n; i++) if (cpu[i] !== indices[i]) { orderDiffer++; const a = keys[cpu[i]], b = keys[indices[i]]; worstGap = Math.max(worstGap, Math.abs(a - b) / Math.max(1e-30, Math.abs(a))); }
        out = { kind, n, keysDiffer, maxUlp, unsorted, orderDiffer, worstGap };
    }
    const v = await dev.popErrorScope();
    console.log("RESULT " + JSON.stringify({ ...out, adapter, validation: v ? String(v.message || v) : null }));
    process.exit(0);
}

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const aborts = [];
/** Run one device case in a child; retry ONLY a native abort, up to ATTEMPTS. Resolves to the result, or null if every attempt aborted. */
function runCase(kind, arg = "") {
    for (let a = 1; a <= ATTEMPTS; a++) {
        const r = spawnSync(process.execPath, [SELF, "--child", kind, String(arg)], { encoding: "utf8", timeout: CASE_MS });
        const line = (r.stdout || "").split("\n").find((l) => l.startsWith("RESULT "));
        if (line) return JSON.parse(line.slice(7));
        // A HANG IS NOT AN ABORT: a case that runs past CASE_MS is killed and FAILS at once, never retried (a scan that never finishes is a bug).
        if (r.error && r.error.code === "ETIMEDOUT") return { kind, crashed: `ran past ${CASE_MS / 1000} s and was stopped` };
        const why = ((r.stderr || "") + (r.stdout || "")).trim().split("\n").filter(Boolean).pop() || `exit ${r.status} signal ${r.signal}`;
        if (!NATIVE_ABORT.test(why) && r.signal == null && r.status !== 134 && r.status !== 139) return { kind, crashed: why };   // not the software renderer's abort: no retry
        aborts.push(`${kind} ${arg}: ${why.slice(0, 90)}`);
    }
    return null;
}

if (process.argv[2] === "--child") await child(process.argv[3], process.argv[4]);
else {
    console.log("splatSortGPU-selfcheck -- the splat depth sort on the graphics card, held to the CPU sort\n");
    console.log("1. THE KERNELS");
    await section(() => {
        const S = G.shaders(32), all = [S.scan, S.depth, ...S.histogram, ...S.reorder];
        ok("!! eight histogram and eight reorder kernels for 32 bits, four of each for 16; no {CONSTANT} left unfilled; the first reorder makes its own indices, the last writes no keys", S.histogram.length === 8 && S.reorder.length === 8 && G.shaders(16).reorder.length === 4 && all.every((c) => !/\{[A-Z_]+\}/.test(c))
            && /IS_FIRST_PASS: u32 = 1u/.test(S.reorder[0]) && /IS_FIRST_PASS: u32 = 0u/.test(S.reorder[1]) && /IS_LAST_PASS: u32 = 1u/.test(S.reorder[7]) && /IS_LAST_PASS: u32 = 0u/.test(S.reorder[6]) && /CURRENT_BIT: u32 = 28u/.test(S.histogram[7]));
        ok("!! the out-of-range reads are clamped (select() evaluates both arms): the reorder reads at SAFE, the scan at min(..., elementCount - 1)", /inputKeys\[SAFE\]/.test(S.reorder[3]) && /inputValues\[SAFE\]/.test(S.reorder[3]) && !/inputKeys\[GID\]/.test(S.reorder[3]) && /items\[min\(ELM_GID, uniforms\.elementCount - 1u\)\]/.test(S.scan) && /input\[select\(0u, GID, is_valid\)\]/.test(S.histogram[0]));
        ok("!! the scan levels and the dispatch grid: 528 items take two levels, 512 one; a grid stays inside 65535 a dimension", G.scanLevels(512).join() === "512" && G.scanLevels(528).join() === "528,2" && G.scanLevels(16 * 66000).length === 3 && G.grid(10).join() === "10,1" && G.grid(70000).join() === "65535,2");
        ok("!! bits must be 4 to 32 in steps of 4, capacity above 0", (() => { try { G.createGpuRadixSort({}, { capacity: 4, bits: 30, usage: {} }); return false; } catch (e) { return /bits/.test(e.message); } })() && (() => { try { G.createGpuRadixSort({}, { capacity: 0, usage: {} }); return false; } catch (e) { return /capacity/.test(e.message); } })());
        const src = fs.readFileSync(path.join(ENG, "render", "splatSortGPU.mjs"), "utf8");
        ok("!! THE LICENCE: PlayCanvas's copyright line and MIT text are kept in the file", /Copyright \(c\) 2011-2026 PlayCanvas Ltd\./.test(src) && /THE SOFTWARE IS PROVIDED "AS IS"/.test(src) && /kishimisu\/WebGPU-Radix-Sort/.test(src));
    });

    const skip = headlessGpuSkipReason(require);
    if (skip) { console.log(`\n2-3. SKIPPED: ${skip}`); }
    else {
        console.log("2. THE SORT (node-webgpu, each case in its own process)");
        await section(() => {
            const c = runCase("compile");
            ok("!! every kernel compiles on the device, and nothing is rejected", c && !c.crashed && c.errors.length === 0 && !c.validation, c ? (c.crashed || c.errors.join("; ") || c.adapter) : "aborted every time");
            const R = SIZES.map((n) => runCase("sort", n));
            ok(`!! THE SAME PERMUTATION AS THE CPU RADIX SORT, ties and both zeros included, at ${SIZES.join(", ")} keys`, R.every((r) => r && !r.crashed && r.differ === 0 && !r.validation),
                R.map((r, i) => `${SIZES[i]}:${r ? (r.crashed ? "crashed " + r.crashed : r.differ + " differ" + (r.validation ? " REJECTED" : "")) : "aborted"}`).join(", "));
            const b = runCase("bits16");
            ok("!! 16 bits: four passes, sorted and stable", b && !b.crashed && b.bad === 0 && b.passes === 4 && !b.validation, b ? JSON.stringify(b) : "aborted every time");
            const big = R[R.length - 1];
            if (big && !big.crashed) console.log(`  ----  measured, not held: ${big.n} keys, the card ${big.gpuMs.toFixed(1)} ms (upload, eight passes, read-back) against the CPU sort ${big.cpuMs.toFixed(1)} ms, on ${big.adapter}${/swiftshader|llvmpipe/i.test(big.adapter) ? " -- A SOFTWARE RENDERER: these are a CPU's times, not a GPU's" : ""}`);
        });
        console.log("3. THE DEPTH KEYS (made on the card)");
        await section(() => {
            const d = runCase("depth", 20000);
            ok("!! the card's order is exactly sorted by the card's own keys", d && !d.crashed && d.unsorted === 0 && !d.validation, d ? JSON.stringify(d) : "aborted every time");
            ok("!! each card key is within 8 ulps of the CPU's (f32 arithmetic against f64 stored as f32)", d && !d.crashed && d.maxUlp <= 8, d && `${d.keysDiffer} of ${d.n} keys differ, by at most ${d.maxUlp} ulps`);
            ok("!! the order is the CPU's except near-ties: under 1% of slots, and the splats swapped are within 1e-5 of each other's distance", d && !d.crashed && d.orderDiffer < d.n / 100 && d.worstGap < 1e-5, d && `${d.orderDiffer} slots, worst relative gap ${d.worstGap.toExponential(2)}`);
        });
        if (aborts.length) console.log(`  ----  the software renderer ABORTED ${aborts.length} time(s) and those runs were repeated (see this file's header): ${aborts.slice(0, 4).join(" | ")}${aborts.length > 4 ? " | ..." : ""}`);
    }
    console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
    process.exit(fails === 0 ? 0 : 1);
}
