#!/usr/bin/env node
// WebGLEngine/tools/ship/mpmDevice-selfcheck.mjs -- v4466
//
// RUNS physics/mpm/gpuKernel.mjs ON A GPU FOR THE FIRST TIME IN THIS TREE, THROUGH gfx/device.js, AND HOLDS IT TO
// physics/mpm/step.mjs PARTICLE BY PARTICLE.
//
// gpuKernel.mjs's status since v3809 was CORRECT ON AN INTERPRETER, UNTRIED ON A GPU: wgsl_reflect executed the kernel
// one invocation at a time on the CPU, which cannot see a race, cannot prove the shader compiles on a driver, and
// cannot reproduce a driver's f32. The headless Dawn device and the browser's WebGPU have been in the tree since
// v4292. This gate runs the four stages -- clear, p2g, grid, g2p -- as compute pipelines on the browser's WebGPU
// through physics/mpm/mpmDevice.mjs, with the integer atomics CONTENDED FOR REAL by concurrent workgroups, and asks
// the interpreter's three questions of a device: agreement with the graded loop in all three scenes, the free-fall
// key earned by the kernel alone, and bit-identical reruns (the property the fixed-point accumulation was chosen
// for, and the one an interpreter running invocations in sequence could never test).
//
// TOLERANCES STATED BEFORE THE DEVICE ANSWERED, taken from what the interpreter recorded at v3809: worst position
// difference under 1e-5 RELATIVE after 15 steps (the interpreter measured 1.6e-7); the discrete free-fall parabola
// within 1e-4 after 120 steps (it measured 4.7e-6); sideways drift EXACTLY zero; no NaN; no saturation.
//
// *** WHAT RUNNING IT FOUND BEFORE A NUMBER CAME BACK. *** A layout: "auto" pipeline holds only the bindings its
// entry point reaches, and a bind group carrying one more is refused by the API. gfx/device.js decided "used" over
// the whole module text and handed the clear stage all five buffers; the device's scan is per entry point now, and
// mpm-gpu-check.html -- which built ONE five-entry bind group for all four stages -- could not have run a stage on
// any real device as written. Section 1 reads both fixes from the source.
//
// *** AND WHAT THE FIRST NUMBERS FOUND: THE INTERPRETER'S f64 HAD BEEN HIDING THE RETURN MAP. *** First run, free fall:
// 1.55e-4 relative off the graded loop and a sideways drift of 3.7e-7, against the interpreter's 1.6e-7 and exactly
// zero. Every resting particle's F came back 1.000126 I after one step with A = I and both singular values exactly 1:
// the kernel rebuilt F = U Sc V through cos and sin, a matrix with EQUAL singular values lets atan2 pick +-pi/2 for
// its rotation pair, and this rasteriser's cos(pi/4) is 0.70715135 -- 4.5e-5 off -- so U V is cos^2 + sin^2 =
// 1.000126, on both harnesses (measured; cos(0.3) is 1.4e-4 off). In f64 that is 1 to 1e-16, which is why an
// interpreter could never have shown it. gpuKernel.mjs's svd2 is trig-free now (half-angles by + - * / sqrt, stably)
// and skips the round trip when the clamp changed nothing. After: 2.9e-8 / 7.4e-8 / 7.4e-8 relative in the three
// scenes, the key at 2.9e-7 with drift EXACTLY zero. The pile had been 3.2e-5 with the trig SVD.
//
// SABOTAGE LOG (v4466) -- each applied, gate run, exit read, file restored byte for byte:
//   A  the clear stage dropped from STAGES (mpmDevice.mjs)         -> exit=1, 7 red: 9 dispatches for 3 steps, the binds,
//      all three scenes at 1.4e-2 relative (the accumulators never reset), the key and the drift.
//   B  halfAngle's stable branch removed (the naive half-angle)     -> *** 0 RED THE FIRST TIME. *** Fifteen steps of
//      falling material never reach the recomposition once the unclamped round trip is skipped, so a 2.85e-4 error
//      in the SVD's rotations left every scene green. Answered with section 2b, the kernel's own svd2 text over
//      2,007 matrices against plasticity.returnMap; redone, exit=1, 2 red at 2.85e-4 / 2.66e-4.
//   C  gfx/device.js deciding `used` over the whole module again    -> exit=1, 6 red: the source line, and every scene
//      at 2.0e-2 with the column never moving -- the clear stage's bind group carried three bindings its layout
//      lacks, the device refused it, and no stage ran. This is the failure mpm-gpu-check.html had as written.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { runWgslComputeNative, headlessGpuSkipReason } from "./headlessGpu.mjs";
import { nullBackend } from "../../gfx/device.js";
import { MPM_WGSL, PF, PARTICLE_FLOATS } from "../../physics/mpm/gpuKernel.mjs";
import { makeMpmDevice, STAGES } from "../../physics/mpm/mpmDevice.mjs";
import { restBlock, centreOfMass, step } from "../../physics/mpm/step.mjs";
import { returnMap } from "../../physics/mpm/plasticity.mjs";
import { makeGrid } from "../../physics/mpm/transfer.mjs";
import { lame } from "../../physics/mpm/constitutive.mjs";
import { alphaOf } from "../../physics/mpm/druckerPrager.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const H = 0.5, DT = 1 / 240, GY = -9.81, PARAMS = lame(500, 0.3), ALPHA = alphaOf(45), STEPS = 15;
const WALL = { lo: 3, hi: 3, sticky: false };
const SCENES = {
    freefall: { nx: 16, ny: 16, block: {}, walls: null, plastic: true, mode: 1 },
    column: { nx: 16, ny: 16, block: { n: 5, spacing: 0.2, x0: 3, y0: 2.2, m: 0.1, vol0: 0.04 }, walls: WALL, plastic: true, mode: 1 },
    pile: { nx: 16, ny: 16, block: { n: 5, spacing: 0.2, x0: 3, y0: 2.2, m: 0.1, vol0: 0.04 }, walls: WALL, plastic: "dp", mode: 2 },
};
const REL_TOL = 1e-5, KEY_TOL = 1e-4;   // a priori, from the interpreter's v3809 record

function cpuRun(sc, steps) {
    const cpu = restBlock(sc.block), g = makeGrid(sc.nx, sc.ny, H);
    for (let s = 0; s < steps; s++) step(cpu, g, { dt: DT, gy: GY, params: { ...PARAMS, alpha: ALPHA }, plastic: sc.plastic, walls: sc.walls });
    return cpu;
}

console.log("\n1. THE STAGES, THE BINDINGS PER STAGE, AND THE NULL BACKEND'S DISPATCH COUNT");
{
    const nb = nullBackend();
    const sim = makeMpmDevice(nb, SCENES.column, { h: H, dt: DT, gy: GY, params: PARAMS, alpha: ALPHA });
    sim.step(3);
    const disp = nb.ops.filter((o) => o[0] === "dispatch").length, binds = nb.ops.filter((o) => o[0] === "bind").map((o) => o[1]);
    ok("*** four stages, four dispatches per step, on the null backend ***", STAGES.join() === "clear,p2g,grid,g2p" && disp === 12, `${disp} dispatches for 3 steps`);
    ok("  the bindings are per ENTRY POINT: clear binds P and acc, grid binds P, acc, gv -- twelve binds, not twenty", binds.length === 12 && binds.join() === "P,acc,P,parts,acc,flags,P,acc,gv,P,parts,gv", binds.join(","));
    const dev = codeOf(read("gfx/device.js"));
    ok("gfx/device.js answers `used` over the functions reachable from the entry point", /_reachableCode\(code, entryPoints\)/.test(dev) && /classify\(d\.wgsl, \[d\.entryPoint \|\| "main"\]\)/.test(dev));
    const page = codeOf(read("mpm-gpu-check.html"));
    // v4467 -- the page no longer builds bind groups at all: it runs the kernel through makeMpmDevice, whose per-stage
    // binding is the device's per-entry-point scan (the fix v4466 first applied to the page by hand).
    ok("  and mpm-gpu-check.html runs the kernel through makeMpmDevice, building no bind group of its own", /import \{ makeMpmDevice \} from "\/physics\/mpm\/mpmDevice\.mjs"/.test(page) && /makeMpmDevice\(dev, \{ nx: NX, ny: NY, block, walls, mode \}/.test(page) && !/createBindGroup|createComputePipeline/.test(page));
    ok("a backend without compute is refused by name, pointing at the twin", (() => { try { makeMpmDevice({ backend: "webgl2" }, SCENES.column, { params: PARAMS, alpha: ALPHA }); return false; } catch (e) { return /webgl2 backend has no compute; run physics\/mpm\/step\.mjs/.test(e.message); } })());
}

console.log("\n2. THE MODULE COMPILES ON THE HEADLESS DAWN DEVICE");
{
    const skip = headlessGpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
    else {
        const r = await runWgslComputeNative({ code: MPM_WGSL, entryPoint: "p2g", outCount: 1, compileOnly: true });
        ok("*** the MPM module, all four entry points, compiles on Dawn ***", r.ok, r.ok ? r.adapter.description : `${r.reason} ${(r.errors || []).join(" | ")}`);
    }
}

console.log("\n2b. THE TRIG-FREE SVD ON THE HEADLESS DEVICE AGAINST plasticity.returnMap, OVER 2,007 MATRICES");
{
    // *** THE THREE SCENES DO NOT REACH THE RECOMPOSITION, AND A SABOTAGE FOUND THAT OUT. *** With the round trip
    // skipped where nothing is clamped, fifteen steps of falling material never rebuild F through U Sc V, so a
    // halfAngle stripped of its stable branch (2.85e-4 off on a matrix with entries near 1) left section 3 GREEN.
    // This section drives the kernel's own svd2 + clamp text over a seeded field of matrices and the seven that
    // matter by name (I, I plus a 1e-12 skew, a reflection, a rotation, an isotropic stretch) and holds the
    // clamped result to plasticity.returnMap and the unclamped reconstruction to the input. A priori: 1e-6.
    const skip = headlessGpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
    else {
        let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
        const mats = []; for (let i = 0; i < 2000; i++) mats.push([1 + 0.3 * rnd(), 0.3 * rnd(), 0.3 * rnd(), 1 + 0.3 * rnd()]);
        mats.push([1, 0, 0, 1], [1, 0, -7.8e-12, 1], [0.5, 0, 0, 2], [-1, 0, 0, 1], [0, 1, -1, 0], [2, 0, 0, 2], [0.9, 0.1, 0.1, 0.9]);
        const helpers = MPM_WGSL.slice(MPM_WGSL.indexOf("fn mul2("), MPM_WGSL.indexOf("// ---- stage 1"));
        const code = "@group(0) @binding(0) var<storage, read_write> out: array<f32>;\n@group(0) @binding(1) var<uniform> u: array<vec4<f32>, 1>;\n@group(0) @binding(2) var<storage, read> mats: array<vec4<f32>>;\n" + helpers +
            "\n@" + "compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3<u32>) {\n  let i = g.x; if (i >= arrayLength(&mats)) { return; }\n" +
            "  let F0 = mats[i] + vec4<f32>(u[0].w); let d = svd2(F0);\n  let Sc = vec2<f32>(clamp(d.s.x, 0.975, 1.0075), clamp(d.s.y, 0.975, 1.0075));\n" +
            "  let F = fromSvd(d.u, Sc, d.v); let back = fromSvd(d.u, d.s, d.v);\n" +
            "  out[8u*i] = F.x; out[8u*i+1u] = F.y; out[8u*i+2u] = F.z; out[8u*i+3u] = F.w; out[8u*i+4u] = back.x; out[8u*i+5u] = back.y; out[8u*i+6u] = back.z; out[8u*i+7u] = back.w;\n}";
        const data = new Float32Array(mats.length * 4); mats.forEach((m, i) => data.set(m.map(Math.fround), 4 * i));
        const r = await runWgslComputeNative({ code, outCount: mats.length * 8, uniforms: new Float32Array(4), workgroups: Math.ceil(mats.length / 64), inputs: [{ binding: 2, data }] });
        ok("the kernel's svd2 + clamp text runs on Dawn over the field", r.ok, r.ok ? `${mats.length} matrices` : `${r.reason} ${(r.errors || []).join(" | ")}`);
        if (r.ok) {
            let worstF = 0, worstBack = 0, worstAt = -1;
            mats.forEach((m, i) => { const A = m.map(Math.fround); const cpu = returnMap(A, [1, 0, 0, 1]).Fe;
                for (let k = 0; k < 4; k++) { const d = Math.abs(r.values[8 * i + k] - cpu[k]); if (d > worstF) { worstF = d; worstAt = i; } worstBack = Math.max(worstBack, Math.abs(r.values[8 * i + 4 + k] - A[k])); } });
            ok("*** the clamped result is within 1e-6 of plasticity.returnMap on every matrix ***", worstF < 1e-6, `worst ${worstF.toExponential(2)} at [${mats[worstAt].map((v) => v.toFixed(3)).join(", ")}]`);
            ok("  and U S V rebuilds the input within 1e-6 (the rotations are orthonormal to f32)", worstBack < 1e-6, `worst ${worstBack.toExponential(2)}`);
            const I = 8 * (mats.length - 7), sk = 8 * (mats.length - 6);
            ok("  the identity comes back EXACTLY the identity, and I + 1e-12 skew within 1e-7 of it", r.values[I] === 1 && r.values[I + 3] === 1 && r.values[I + 1] === 0 && Math.abs(r.values[sk] - 1) < 1e-7 && Math.abs(r.values[sk + 3] - 1) < 1e-7,
                `${r.values[I].toPrecision(9)} / ${r.values[sk].toPrecision(9)} -- the 1.000126 that the trig-built SVD returned here is what this line exists to refuse`);
        }
    }
}

console.log("\n3. ON THE BROWSER'S WebGPU THROUGH gfx/device.js: THREE SCENES, THE KEY, AND BIT-IDENTICAL RERUNS");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { SCENES, H, DT, GY, PARAMS, ALPHA, STEPS }, script: `async (a) => {
            const M = await import("/physics/mpm/mpmDevice.mjs"); const { requestDevice } = await import("/gfx/device.js");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            if (dev.backend !== "webgpu") return { noWebgpu: dev.backend };
            const run = async (sc, steps) => { const sim = M.makeMpmDevice(dev, sc, { h: a.H, dt: a.DT, gy: a.GY, params: a.PARAMS, alpha: a.ALPHA });
                const t0 = performance.now(); sim.step(steps); const o = await sim.read(); const com = await sim.centreOfMass(); const ms = performance.now() - t0; sim.destroy();
                return { parts: Array.from(o.parts), flags: Array.from(o.flags), com, N: sim.count, ms }; };
            const out = { scenes: {} };
            for (const name of Object.keys(a.SCENES)) out.scenes[name] = await run(a.SCENES[name], a.STEPS);
            out.fall = await run(a.SCENES.freefall, 120);
            out.det1 = await run(a.SCENES.column, 20); out.det2 = await run(a.SCENES.column, 20);
            dev.destroy();
            return out;
        }`, timeoutMs: 120000 });
        ok("*** the kernel ran on the browser's WebGPU through the device ***", r.ok && r.result && r.result.scenes, r.ok ? (r.result && r.result.noWebgpu ? "no webgpu: " + r.result.noWebgpu : "") : r.reason);
        if (r.ok && r.result.scenes) {
            for (const [name, sc] of Object.entries(SCENES)) {
                const g = r.result.scenes[name], cpu = cpuRun(sc, STEPS), cc = centreOfMass(cpu);
                let wp = 0, ref = 0, nan = 0;
                for (let i = 0; i < g.N; i++) { const o = i * PARTICLE_FLOATS; if (!Number.isFinite(g.parts[o]) || !Number.isFinite(g.parts[o + 1])) nan++;
                    wp = Math.max(wp, Math.abs(g.parts[o + PF.px] - cpu[i].x), Math.abs(g.parts[o + PF.py] - cpu[i].y)); ref = Math.max(ref, Math.hypot(cpu[i].x, cpu[i].y)); }
                ok(`*** ${name.padEnd(8)} agrees with the graded loop on the device: relative < ${REL_TOL}, no NaN, no saturation ***`, nan === 0 && wp / ref < REL_TOL && g.flags[0] === 0,
                    `${STEPS} steps, ${g.N} particles, worst ${wp.toExponential(3)} (relative ${(wp / ref).toExponential(2)}), centre of mass apart ${Math.hypot(g.com.x - cc.x, g.com.y - cc.y).toExponential(2)}, NaN ${nan}, saturation ${g.flags[0]}, ${g.ms.toFixed(0)} ms`);
            }
            const c0 = centreOfMass(restBlock()), n = 120, want = c0.y + GY * DT * DT * (n * (n + 1) / 2), F = r.result.fall;
            ok(`*** the kernel's centre of mass follows the DISCRETE free-fall parabola over 120 steps, within ${KEY_TOL} ***`, Math.abs(F.com.y - want) < KEY_TOL, `got ${F.com.y.toFixed(9)} against ${want.toFixed(9)}, error ${Math.abs(F.com.y - want).toExponential(3)} -- single precision, not a wrong kernel`);
            ok("  and the sideways drift is EXACTLY zero", F.com.x === c0.x, `${Math.abs(F.com.x - c0.x).toExponential(3)}`);
            let identical = true; for (let i = 0; i < r.result.det1.parts.length; i++) if (r.result.det1.parts[i] !== r.result.det2.parts[i]) identical = false;
            ok("*** two runs with CONTENDED integer atomics come back BIT-IDENTICAL -- the property the fixed point bought, tested where an interpreter could not ***", identical && r.result.det1.parts.length === 25 * PARTICLE_FLOATS);
            ok("  CONTROL: the column moved (the device did not hand back its input)", (() => { const p0 = restBlock(SCENES.column.block); let d = 0; for (let i = 0; i < p0.length; i++) d = Math.max(d, Math.abs(r.result.det1.parts[i * PARTICLE_FLOATS + 1] - p0[i].y)); return d > 1e-4; })());
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: real hardware (this is SwiftShader, whose f32 is one vendor's), a grid larger than 16x16 or more than " +
    "25 particles (one workgroup of the four), the page's own readback path (mpm-gpu-check.html still binds raw WebGPU, " +
    "now per stage), and the headless Dawn device RUNNING the four stages (it compiles them; the one-buffer harness " +
    "cannot drive five shared buffers, which is what the device path is for).");
process.exit(fails ? 1 : 0);
