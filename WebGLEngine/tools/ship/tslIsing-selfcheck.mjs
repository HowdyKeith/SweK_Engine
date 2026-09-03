#!/usr/bin/env node
// WebGLEngine/tools/ship/tslIsing-selfcheck.mjs -- v4382
//
// GRADES render/isingTsl.mjs: the Ising checkerboard as a TSL compute pass, at ZERO TOLERANCE.
//
// ---- THE THIRD CLAIM SHAPE IN THIS ARC, AND THE ONLY ONE THAT IS A CONTRACT RATHER THAN A RESULT --------------
//
//   v4370  hmcGpu's leapfrog: SMOOTH f32 arithmetic, so an ulp stays an ulp. Bit-identical was a strong finding
//          and the round would still have stood at 1e-6.
//   v4380  the silhouette carve: ends in a floor(), which is DISCONTINUOUS, so an ulp can flip a voxel. The twin
//          became an f32 mirror and the discontinuity was measured separately -- 66 flips in 17.3 million pairs,
//          none of which propagated.
//   v4382  the Ising sweep: NO FLOATING POINT ANYWHERE. tools/roundhouse/isingGpu.mjs states the contract in its
//          own header -- "INTEGER ARITHMETIC END TO END, so the CPU mirror and the device must agree BIT-EXACTLY
//          on every spin, every sweep" -- and adjudicateSpins() carries tol: 0. There is nothing to fall back to.
//
// TWO DESIGN DECISIONS IN THE SHIPPED KERNEL BUY THAT, AND BOTH HAVE TO SURVIVE THE TRANSPLANT:
//   * Philox4x32-10, a COUNTER-BASED RNG: no state, no sequence to coordinate, so any thread order on any device
//     gives the same bits. Its 32x32 -> (hi, lo) multiply is 16-bit limbs WITH an explicit carry chain, because
//     u32 addition wraps in WGSL and lh + hl reaches 2^33. Section 1 checks it alone, 1024 words at a time.
//   * The Metropolis exp(-dE/T) NEVER ENTERS THE KERNEL: dE takes one of five values, the CPU precomputes
//     floor(exp(-dE/T) * 2^32) in f64 once, and the kernel accepts iff a philox word is below the threshold. So
//     no vendor exp() is in play and section 4 asserts the generated module carries no f32 at all.
//
// ---- WHAT IT COST THE SHELL, REFUSED BY NAME BEFORE IT WAS BUILT ------------------------------------------------
//
// render/tslSource.mjs's uniform vocabulary was float-only in its VECTORS -- f32, vec2/3/4<f32>, mat4x4<f32>,
// with i32 and u32 present only as scalars. This pass carries sweep, parity, seed and key in a vec4<u32> and the
// transplant refused it: "uniform cfg has type vec4<u32>, which the device's uniform list does not carry". The
// guard was right and the vocabulary was short; ivec2/3/4 and uvec2/3/4 are in it at v4382, which is the same
// shape of shell growth as the struct element at v4363 and the uniform arrays at v4364.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node tools/ship/tslIsing-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a failure)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { computeShell, transplantCompute } from "../../render/tslSource.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { philox4x32_10, makeLattice, mirrorSweep, acceptThresholds, adjudicateSpins, WGSL_ISING } from "../../tools/roundhouse/isingGpu.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const L = 32, T = 2.0, SWEEPS = 40, SEED = 2026, K1 = 0x15140, NP = 256;
const TH = acceptThresholds(T);
const START = makeLattice(L, SEED);
const MIRROR = Int32Array.from(START);
for (let sw = 0; sw < SWEEPS; sw++) mirrorSweep(MIRROR, L, sw, SEED, TH);
const PHI = new Uint32Array(NP * 4);
for (let i = 0; i < NP; i++) PHI.set(philox4x32_10(i, 7, 1, 0, SEED, K1), i * 4);
const magn = (s) => { let m = 0; for (const v of s) m += v; return Math.abs(m) / s.length; };

console.log("\n0. THE SHELL'S VOCABULARY GREW, AND THE OLD ONE REFUSED THIS PASS BY NAME (no device needed)");
{
    // a minimal three-shaped compute shader whose uniform is a vec4<u32> -- what this pass actually needs
    const src = "// Three.js r178 - Node System\nvar<private> instanceIndex : u32;\n" +
        "struct outStruct { value : array< u32 > };\n@binding( 0 ) @group( 0 )\nvar<storage, read_write> out : outStruct;\n" +
        "struct objectStruct { cfg : vec4<u32> };\n@binding( 1 ) @group( 0 )\nvar<uniform> object : objectStruct;\n" +
        "@" + "compute @workgroup_size( 64 )\nfn main( @builtin( global_invocation_id ) globalId : vec3<u32> ) {\n" +
        "\tinstanceIndex = globalId.x;\n\tout.value[ instanceIndex ] = object.cfg.x;\n}\n";
    const shell = computeShell({ name: "u32 uniform", workgroupSize: 64,
        storage: [{ name: "out", element: "u32" }], uniforms: [{ name: "cfg", type: "uvec4" }] });
    let err = null, wgsl = null;
    try { wgsl = transplantCompute(src, shell).wgsl; } catch (e) { err = String(e.message); }
    ok("*** a vec4<u32> uniform transplants, which it did NOT before this round -- the refusal named the type and the vocabulary was what was short ***",
        err === null && /cfg: vec4<u32>/.test(wgsl || ""), err || "declared in the shell's own struct");
    let bad = null;
    try { transplantCompute(src.replace("vec4<u32>", "mat2x2<f32>"), computeShell({ name: "x", workgroupSize: 64,
        storage: [{ name: "out", element: "u32" }], uniforms: [{ name: "cfg", type: "mat2" }] })); } catch (e) { bad = String(e.message); }
    ok("  ...and a type that really is outside the vocabulary is still refused, so widening it did not turn the guard off",
        bad !== null && /does not carry/.test(bad), (bad || "NOT REFUSED").slice(0, 110));
}

const skip = webgpuSkipReason();
console.log("\n1. PHILOX 4x32-10 THROUGH TSL, and 2. THE SWEEP AT ZERO TOLERANCE");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const shell = computeShell({ name: "ising", workgroupSize: 64,
        storage: [{ name: "spins", element: "i32" }, { name: "thresh", element: "u32", access: "read" }],
        uniforms: [{ name: "cfg", type: "uvec4" }] });
    const pshell = computeShell({ name: "philox", workgroupSize: 64,
        storage: [{ name: "out", element: "vec4<u32>" }], uniforms: [{ name: "cfg", type: "uvec4" }] });
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { L, SWEEPS, SEED, K1, NP, shell, pshell,
        start: [...START], th: [...TH], shipped: WGSL_ISING }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const I = await import("/render/isingTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        try {
            const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));

            // ---- philox alone -------------------------------------------------------------------------------
            const { Fn, uint, uvec4, uniform, instanceIndex, instancedArray } = T;
            const pbuf = instancedArray(a.NP, "uvec4").label("out");
            const pcfg = uniform(uvec4(a.SEED, a.K1, 0, 0)).label("cfg");
            const { philox } = I.philoxNodes(T);
            const pnode = Fn(() => { const r = philox(instanceIndex, uint(7), uint(1), uint(0), pcfg.x, pcfg.y);
                pbuf.element(instanceIndex).assign(uvec4(r.x0, r.x1, r.x2, r.x3)); })().compute(a.NP);
            await renderer.computeAsync(pnode);
            const pgen = S.transplantCompute(renderer._nodes.getForCompute(pnode).computeShader, a.pshell);
            const pob = dev.buffer({ data: new Uint32Array(a.NP * 4), usage: ["storage"] });
            const pub = dev.buffer({ data: new Uint32Array([a.SEED, a.K1, 0, 0]), usage: "uniform" });
            const pp = dev.compute({ wgsl: pgen.wgsl }); pp.bind("out", pob).bind("u", pub);
            dev.frame(({ pass }) => { pass.dispatch(pp, Math.ceil(a.NP / 64)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            out.philox = [...new Uint32Array(await dev.read(pob))];

            // ---- the sweep ----------------------------------------------------------------------------------
            const g = I.makeIsingPassTsl(T, { L: a.L }); await renderer.computeAsync(g.node);
            const gen = S.transplantCompute(renderer._nodes.getForCompute(g.node).computeShader, a.shell);
            out.wgsl = gen.wgsl; out.reads = gen.reads; out.writes = gen.writes;
            out.noFloat = !(new RegExp("\\\\bf32\\\\b|\\\\b(exp|log|sin|cos|sqrt|pow)\\\\s*\\\\(").test(gen.wgsl));
            const half = (a.L * a.L) / 2, groups = Math.ceil(half / 64);
            const runOne = async (wgsl, isShipped) => {
                const sb = dev.buffer({ data: new Int32Array(a.start), usage: ["storage"] });
                const tb = dev.buffer({ data: new Uint32Array(a.th), usage: ["storage"] });
                const p = dev.compute({ wgsl });
                for (let sw = 0; sw < a.SWEEPS; sw++) for (const par of [0, 1]) {
                    const u = new Uint32Array(4);
                    if (isShipped) { u[0] = a.L; u[1] = sw; u[2] = par; u[3] = a.SEED; }
                    else { u[0] = sw; u[1] = par; u[2] = a.SEED; u[3] = a.K1; }
                    const ub = dev.buffer({ data: u, usage: "uniform" });
                    if (isShipped) p.bind("spins", sb).bind("thresh", tb).bind("P", ub);
                    else p.bind("spins", sb).bind("thresh", tb).bind("u", ub);
                    dev.frame(({ pass }) => { pass.dispatch(p, groups); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
                }
                return [...new Int32Array(await dev.read(sb))];
            };
            out.gen = await runOne(gen.wgsl, false);
            out.ship = await runOne(a.shipped, true);
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 600); }
        return out;
    }` });
    ok("the harness built the graph, transplanted it and ran both kernels on one device",
        r.ok && r.result && !r.result.error && r.result.gen,
        r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const F = r.result;
        let pbad = 0; for (let i = 0; i < NP * 4; i++) if ((F.philox[i] >>> 0) !== PHI[i]) pbad++;
        ok(`*** Philox4x32-10 through TSL is BIT-EXACT against the CPU mirror on all ${NP * 4} u32 words -- the mulhilo carry chain and ten rounds of bit mixing, emitted by three ***`,
            pbad === 0 && (F.errs || []).length === 0,
            `${pbad} of ${NP * 4} words differ; device errors ${(F.errs || []).length}. u32 addition WRAPS, so lh + hl reaching 2^33 has to carry into the high word -- a graph that dropped that would still compile and would still look like an RNG`);

        const aGen = adjudicateSpins(Int32Array.from(F.gen), MIRROR);
        const aShip = adjudicateSpins(Int32Array.from(F.ship), MIRROR);
        let gs = 0; for (let i = 0; i < MIRROR.length; i++) if (F.gen[i] !== F.ship[i]) gs++;
        ok(`*** ${SWEEPS} sweeps at T=${T} on a ${L}x${L} lattice: the GENERATED pass agrees with the shipped CPU mirror on all ${aGen.n} spins, adjudicated at tol ${aGen.tol} ***`,
            aGen.pass && aGen.diff === 0 && aGen.tol === 0,
            `${aGen.diff} of ${aGen.n} spins differ. This is the kernel's OWN contract, not a tolerance this round chose -- adjudicateSpins carries tol: 0`);
        ok(`  and the SHIPPED kernel agrees with the same mirror (${aShip.diff} differing), and the two device passes agree with each other on all ${MIRROR.length} spins`,
            aShip.pass && gs === 0, `shipped ${aShip.diff}, generated-vs-shipped ${gs}. ${SWEEPS * 2} dispatches each, one per parity per sweep`);
        // AN AGREEMENT BETWEEN TWO PASSES THAT DID NOTHING WOULD ALSO BE PERFECT
        ok(`  and the lattice really moved: |M|/N goes ${magn(START).toFixed(4)} -> ${magn(MIRROR).toFixed(4)} over the run, which is ordering below Tc as it should`,
            magn(START) < 0.15 && magn(MIRROR) > 0.5 && Math.abs(magn(Int32Array.from(F.gen)) - magn(MIRROR)) < 1e-12,
            `start ${magn(START).toFixed(4)} (a random lattice), after ${SWEEPS} sweeps ${magn(MIRROR).toFixed(4)}; T=${T} is below the 2D Ising Tc of 2.269, so order is the right direction`);

        console.log("\n3. NO FLOAT AT ALL, which is what makes zero tolerance a thing that can be asked for");
        ok("the generated module carries no f32 and no transcendental -- the Metropolis exp() was spent once on the CPU and shipped as five u32 thresholds",
            F.noFloat === true && validateWgsl(F.wgsl).length === 0 && !/NodeBuffer_|object\./.test(F.wgsl),
            `${validateWgsl(F.wgsl).join("; ") || "validates"}; reads ${F.reads.join()}, writes ${F.writes.join()}`);
        report("THIS IS WHY THE CLAIM IS A CONTRACT RATHER THAN A RESULT. v4370 could have stood at 1e-6 and chose to " +
               "say 0; v4380 had to measure a discontinuity beside its exactness. Here there is no float to round, so " +
               "there is no weaker claim available: every spin, or the round is wrong. The kernel was DESIGNED that " +
               "way at v3283 and the transplant either preserves it or does not.");
    }
}

// SABOTAGE LOG -- applied to render/isingTsl.mjs, gate run, exit code read, restored. Every number is from a run.
//   A  the mulhilo CARRY CHAIN dropped (c1 and c2 forced to zero) -> exit=1, 4 red, and it is the whole argument
//      for adjudicating this kernel at zero tolerance: ALL 1024 philox words differ -- a completely different
//      random stream -- and only 135 OF 1024 SPINS MOVE. The lattice still orders below Tc and |M|/N still lands
//      where a healthy run lands. THE PHYSICS LOOKS ENTIRELY FINE. An observable check would have passed this;
//      the bit claim is the only thing in the loop that does not. u32 addition wraps in WGSL and lh + hl reaches
//      2^33, so a graph that drops the carry still compiles and still looks like an RNG.
//   B  the accept comparison inverted (>= for <) -> exit=1, 3 red, 512 of 1024 spins differ. The loud one: half
//      the lattice, because inverting a threshold test flips the acceptance probability about its own median.
//   C  the vertical neighbour WRAP dropped (y-1 with no select) -> exit=1, 3 red, 54 of 1024 spins differ -- and
//      the number is the right shape rather than merely non-zero: one row of a 32-wide lattice is 32 sites, and
//      the rest is what those wrong neighbours went on to influence over 40 sweeps.
//
//   AND THE SABOTAGES ARE WHAT PROVED THE DEVICE PATH IS LIVE. This gate runs in 0.9 s, which read as impossible
//   for a WebGPU gate until the sabotages moved its numbers: node-webgpu (the SessionStart hook's install) serves
//   it in-process through Dawn rather than launching a browser. A suspiciously fast green is worth one check.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: A REAL GPU. Philox is integer arithmetic, which is exact on any conforming device, so " +
    "this is the one kernel in the arc whose bit claim should NOT be hardware-dependent -- but that is an argument and " +
    "SwiftShader is the only device that has answered it. The rig has signed nothing. Also unchecked: the physics. " +
    "|M|/N ordering below Tc is a direction, not a measurement of the critical temperature, and tools/roundhouse's own " +
    "ising gate is where the observable is graded; whether a LARGER lattice or a longer run stays exact, since a " +
    "counter-based RNG has no sequence to drift but a wider dispatch has more lanes to get the indexing wrong; and " +
    "WebGL2, which has no compute stage at all and is refused by name by gfx/device.js.");
process.exit(fails ? 1 : 0);
