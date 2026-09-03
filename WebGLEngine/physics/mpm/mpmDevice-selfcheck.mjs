#!/usr/bin/env node
// WebGLEngine/physics/mpm/mpmDevice-selfcheck.mjs -- v4406
//
// *** "CORRECT ON AN INTERPRETER, UNTRIED ON A GPU." *** physics/mpm/gpuKernel.mjs says that of itself, and
// names precisely what an interpreter cannot establish: "It does not prove the shader COMPILES on real
// hardware, it runs invocations one after another so IT CANNOT SEE A RACE, and it does not reproduce a
// vendor's f32." Its answer was mpm-gpu-check.html -- "until it has been opened once the honest status of this
// file is CORRECT ON AN INTERPRETER, UNTRIED ON A GPU". This gate opens it, headlessly, through node-webgpu.
//
// *** AND THE PAGE HAD NEVER RUN A SINGLE STEP. *** It built four pipelines with layout:"auto" and handed each
// one a bind group of all five buffers. WebGPU derives an auto layout from the bindings THAT ENTRY POINT USES,
// and `clear` never touches binding 1, so the bind group was INVALID for it -- "binding index 1 not present in
// the bind group layout" -- and an invalid bind group means every dispatch of every stage is dropped.
//
// THE SYMPTOM IS THE REASON THIS IS WORTH A GATE RATHER THAN A FIX: THE PAGE PASSES THREE OF ITS OWN ROWS WHILE
// DOING NOTHING. The particles come back exactly where they started, so "two identical runs are bit-identical"
// is trivially true, "the fixed-point accumulators never saturated" is trivially true because nothing scattered,
// and "nothing pushed it sideways" is trivially true because nothing pushed it anywhere. Only the two rows that
// compare against the CPU would have gone red, and they would have read like a physics disagreement. An
// explicit bind group layout, valid for all four stages, is the fix; both the page and this gate use one.
//
// ---- WHAT A DEVICE SAYS THAT THE INTERPRETER DID NOT --------------------------------------------------------
//
// The module's header records the interpreter's verdict: "free fall, the collapsing column and the
// Drucker-Prager pile all agree with the graded loop to about 1e-7 relative over 15 steps". On a device that
// holds for the ELASTIC path and does not hold for the PLASTIC one:
//
//        steps    plastic ON     plastic OFF     ratio
//           15     2.08e-4         2.86e-8       7263x
//           30     2.84e-4         8.80e-8       3224x
//           60     9.28e-4         1.76e-7       5278x
//          120     2.01e-3         2.27e-7       8867x
//
// The elastic column is the interpreter's number, confirmed. The plastic column is OVER the page's own 1e-4
// threshold AT EVERY STEP COUNT, including the 15 the interpreter measured -- so this is not error accumulating
// over a longer run, it is a per-step cost of roughly three to nine thousand times.
//
// *** AND ON THIS FIXTURE THE PLASTIC PATH IS ARITHMETICALLY THE IDENTITY. *** Measured on the CPU: free fall
// with plastic ON and with it OFF agree to EXACTLY 0. The singular-value clamp never fires, because a block in
// free fall does not deform. What the branch does is decompose F and rebuild it -- svd2 then fromSvd -- which in
// f64 round-trips exactly and in f32 does not. The kernel is paying three to nine thousand times its elastic
// error for a code path that, here, changes nothing.
//
// THE TOLERANCE IS NOT WIDENED, AND THAT IS DELIBERATE. tools/roundhouse/magmapGpu.mjs states the rule this tree
// works to: "the reflex when that happened would be to widen the tolerance until it passed -- which is how a
// gate stops meaning anything." So this gate asserts what is TRUE -- elastic inside the threshold, plastic
// outside it, and the cause localised -- and leaves what to do about the kernel's plastic path to a round that
// decides it on purpose.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/mpm/mpmDevice-selfcheck.mjs   (exit 0 all-pass, 1 on any fail; a SKIP counts as a failure)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { makeGrid } from "./transfer.mjs";
import { lame } from "./constitutive.mjs";
import { alphaOf } from "./druckerPrager.mjs";
import { restBlock, centreOfMass, step } from "./step.mjs";
import { PF, PARTICLE_FLOATS } from "./gpuKernel.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const NX = 16, NY = 16, H = 0.5, DT = 1 / 240, GY = -9.81;
const MAT = lame(500, 0.3), ALPHA = alphaOf(45);
const WALL = { lo: 3, hi: 3, sticky: false };
const BLOCK_C = { n: 6, spacing: 0.2, x0: 3, y0: 2.2, m: 0.1, vol0: 0.04 };
const PAGE_TOL = 1e-4;                      // mpm-gpu-check.html's own threshold for rows 1 and 2
const cpuRun = ({ block = {}, walls = null, plastic = true, steps = 60 } = {}) => {
    const ps = restBlock(block), g = makeGrid(NX, NY, H);
    for (let s = 0; s < steps; s++) step(ps, g, { dt: DT, gy: GY, params: { ...MAT, alpha: ALPHA }, plastic, walls });
    return ps;
};
const gapOf = (gpu, cpu) => { let d = 0, ref = 0;
    for (let i = 0; i < cpu.length; i++) { const o = i * PARTICLE_FLOATS;
        d = Math.max(d, Math.hypot(gpu.parts[o + PF.px] - cpu[i].x, gpu.parts[o + PF.py] - cpu[i].y));
        ref = Math.max(ref, Math.hypot(cpu[i].x, cpu[i].y)); }
    return { abs: d, rel: ref > 0 ? d / ref : Infinity }; };

console.log("\n1. THE PLASTIC BRANCH IS THE IDENTITY ON THIS FIXTURE (no device needed)");
{
    const on = cpuRun({ steps: 60, plastic: true }), off = cpuRun({ steps: 60, plastic: false });
    let d = 0; for (let i = 0; i < on.length; i++) d = Math.max(d, Math.hypot(on[i].x - off[i].x, on[i].y - off[i].y));
    ok("*** on the CPU, free fall with the plastic clamp ON and OFF agree to EXACTLY 0 -- the singular-value clamp never fires, because a falling block does not deform ***",
        d === 0,
        `worst apart ${d.toExponential(3)}. What the branch still does is decompose F and rebuild it (svd2 then fromSvd), which round-trips exactly in f64 and does not in f32 -- which is what section 3 costs out`);
    const src = fs.readFileSync(path.join(ENG, "mpm-gpu-check.html"), "utf8");
    // ASSERTED ON THE CALL, NOT ON THE STRING: the first version of this check searched the page for the text
    // layout:"auto" and went red on ITS OWN EXPLANATORY COMMENT, which spells the thing it forbids. Same trap as
    // a file that spells a shader marker and joins the census -- third time this session, third disguise.
    const pipeCall = /createComputePipeline\(\{\s*layout:\s*(\w+)/.exec(src);
    ok("  and the check page creates its four pipelines with a DECLARED layout rather than an automatic one",
        /createBindGroupLayout/.test(src) && /createPipelineLayout/.test(src) && pipeCall && pipeCall[1] === "pipeLayout",
        `createComputePipeline is called with \`${pipeCall ? pipeCall[1] : "(not found)"}\`; with an automatic layout the \`clear\` entry point's omits binding 1, a five-entry bind group is invalid for it, and every dispatch is silently dropped`);
}

const skip = webgpuSkipReason();
console.log("\n2. THE KERNEL ON A DEVICE, and 3. WHAT THE INTERPRETER COULD NOT SEE");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { NX, NY, H, DT, GY, WALL, BLOCK_C }, script: `async (a) => {
        const G = await import("/physics/mpm/gpuKernel.mjs");
        const { lame } = await import("/physics/mpm/constitutive.mjs");
        const { alphaOf } = await import("/physics/mpm/druckerPrager.mjs");
        const { restBlock } = await import("/physics/mpm/step.mjs");
        const out = { runs: {} };
        try {
            if (!navigator.gpu) throw new Error("no navigator.gpu in this page");
            const adapter = await navigator.gpu.requestAdapter(); if (!adapter) throw new Error("no adapter");
            const dev = await adapter.requestDevice();
            const MAT = lame(500, 0.3), ALPHA = alphaOf(45);
            const { MPM_WGSL, packParams, fixedPointScales, clampLimits, PF, PARTICLE_FLOATS } = G;
            const mod = dev.createShaderModule({ code: MPM_WGSL });
            const info = await mod.getCompilationInfo?.();
            out.compileErrors = (info ? info.messages : []).filter((m) => m.type === "error").map((m) => m.message.slice(0, 200));
            // ONE declared layout, valid for all four entry points -- see this file's header
            const bgl = dev.createBindGroupLayout({ entries: [0, 1, 2, 3, 4].map((b) => ({
                binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: b === 0 ? "uniform" : "storage" } })) });
            const pipeLayout = dev.createPipelineLayout({ bindGroupLayouts: [bgl] });
            const pipes = {};
            for (const s of ["clear", "p2g", "grid", "g2p"]) pipes[s] = dev.createComputePipeline({ layout: pipeLayout, compute: { module: mod, entryPoint: s } });
            // and the auto layout, kept so the failure this round found is exhibited rather than described
            out.autoRefusal = await (async () => {
                dev.pushErrorScope("validation");
                const autoPipe = dev.createComputePipeline({ layout: "auto", compute: { module: mod, entryPoint: "clear" } });
                const b = dev.createBuffer({ size: 256, usage: GPUBufferUsage.STORAGE });
                const u = dev.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM });
                try { dev.createBindGroup({ layout: autoPipe.getBindGroupLayout(0), entries: [
                    { binding: 0, resource: { buffer: u } }, { binding: 1, resource: { buffer: b } },
                    { binding: 2, resource: { buffer: b } }, { binding: 3, resource: { buffer: b } },
                    { binding: 4, resource: { buffer: b } } ] }); } catch (e) {}
                const err = await dev.popErrorScope();
                b.destroy(); u.destroy();
                return err ? String(err.message).slice(0, 200) : null;
            })();
            const gpuRun = async ({ block = {}, walls = null, mode = 1, steps = 60 }) => {
                const ps = restBlock(block), N = ps.length, nodes = (a.NX + 1) * (a.NY + 1);
                const parts = new Float32Array(N * PARTICLE_FLOATS);
                ps.forEach((p, i) => { const o = i * PARTICLE_FLOATS;
                    parts[o + PF.px] = p.x; parts[o + PF.py] = p.y; parts[o + PF.f00] = 1; parts[o + PF.f11] = 1; parts[o + PF.p00] = 1; parts[o + PF.p11] = 1; });
                const ST = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
                const bufParts = dev.createBuffer({ size: N * PARTICLE_FLOATS * 4, usage: ST });
                const bufAcc = dev.createBuffer({ size: nodes * 5 * 4, usage: ST });
                const bufGv = dev.createBuffer({ size: nodes * 4 * 4, usage: ST });
                const bufFlags = dev.createBuffer({ size: 16, usage: ST });
                const bufUni = dev.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
                dev.queue.writeBuffer(bufParts, 0, parts);
                dev.queue.writeBuffer(bufFlags, 0, new Uint32Array([0, 0, 0, 0]));
                const cl = clampLimits(), scales = fixedPointScales({ h: a.H });
                dev.queue.writeBuffer(bufUni, 0, packParams({ nx: a.NX, ny: a.NY, nParticles: N, plasticMode: mode,
                    h: a.H, dt: a.DT, gx: 0, gy: a.GY, mu: MAT.mu, lambda: MAT.lambda, alpha: ALPHA,
                    pmass: ps[0].m, pvol: ps[0].vol0, thetaC: cl.thetaC, thetaS: cl.thetaS, walls, scales }));
                const bind = dev.createBindGroup({ layout: bgl, entries: [
                    { binding: 0, resource: { buffer: bufUni } }, { binding: 1, resource: { buffer: bufParts } },
                    { binding: 2, resource: { buffer: bufAcc } }, { binding: 3, resource: { buffer: bufGv } },
                    { binding: 4, resource: { buffer: bufFlags } } ] });
                const wg = (x) => Math.ceil(x / 64);
                const enc = dev.createCommandEncoder();
                for (let s = 0; s < steps; s++) for (const [stage, count] of [["clear", nodes * 5], ["p2g", N], ["grid", nodes], ["g2p", N]]) {
                    const p = enc.beginComputePass(); p.setPipeline(pipes[stage]); p.setBindGroup(0, bind);
                    p.dispatchWorkgroups(wg(count)); p.end(); }
                dev.queue.submit([enc.finish()]);
                const read = dev.createBuffer({ size: N * PARTICLE_FLOATS * 4 + 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
                const e2 = dev.createCommandEncoder();
                e2.copyBufferToBuffer(bufParts, 0, read, 0, N * PARTICLE_FLOATS * 4);
                e2.copyBufferToBuffer(bufFlags, 0, read, N * PARTICLE_FLOATS * 4, 16);
                dev.queue.submit([e2.finish()]);
                await read.mapAsync(GPUMapMode.READ);
                const raw = read.getMappedRange();
                const o = [...new Float32Array(raw.slice(0, N * PARTICLE_FLOATS * 4))];
                const sat = new Uint32Array(raw.slice(N * PARTICLE_FLOATS * 4, N * PARTICLE_FLOATS * 4 + 16))[0];
                read.unmap();
                for (const b of [bufParts, bufAcc, bufGv, bufFlags, bufUni, read]) b.destroy();
                return { parts: o, N, sat };
            };
            for (const st of [15, 30, 60, 120]) out.runs["on" + st] = await gpuRun({ steps: st, mode: 1 });
            for (const st of [15, 30, 60, 120]) out.runs["off" + st] = await gpuRun({ steps: st, mode: 0 });
            out.runs.col = await gpuRun({ block: a.BLOCK_C, walls: a.WALL, steps: 60, mode: 1 });
            const t1 = await gpuRun({ block: a.BLOCK_C, walls: a.WALL, steps: 40, mode: 1 });
            const t2 = await gpuRun({ block: a.BLOCK_C, walls: a.WALL, steps: 40, mode: 1 });
            let differ = 0; for (let i = 0; i < t1.parts.length; i++) if (t1.parts[i] !== t2.parts[i]) differ++;
            out.twice = { differ, len: t1.parts.length };
            out.sat = Object.values(out.runs).reduce((s, x) => s + x.sat, 0) + t1.sat + t2.sat;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 700); }
        return out;
    }` });
    ok("*** the shipped kernel COMPILES and RUNS on a device, which its own header says had never happened ***",
        r.ok && r.result && !r.result.error && r.result.runs && (r.result.compileErrors || []).length === 0,
        r.ok ? (r.result && r.result.error) || `compile errors: ${(r.result && r.result.compileErrors || []).join("; ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const F = r.result;
        ok("*** and the bug that had kept it from ever running is exhibited, not described: an auto layout for `clear` refuses a five-entry bind group BY NAME ***",
            /binding index 1 not present in the bind group layout/.test(F.autoRefusal || ""),
            (F.autoRefusal || "NOT REFUSED -- if this stops happening the page's old shape would work and this gate should say so").slice(0, 150));
        // the free-fall parabola, which only means anything once the particles move
        const long = F.runs.on120, c0 = centreOfMass(restBlock());
        let sy = 0, sx = 0; for (let i = 0; i < long.N; i++) { sy += long.parts[i * PARTICLE_FLOATS + PF.py]; sx += long.parts[i * PARTICLE_FLOATS + PF.px]; }
        const comY = sy / long.N, comX = sx / long.N;
        const want = c0.y + GY * DT * DT * (120 * 121 / 2);
        ok(`*** the device earns the DISCRETE free-fall parabola on its own: com.y ${comY.toFixed(9)} against ${want.toFixed(9)}, error ${Math.abs(comY - want).toExponential(3)} ***`,
            Math.abs(comY - want) < 1e-3 && Math.abs(comX - c0.x) < 1e-5 && Math.abs(comY - c0.y) > 1,
            `sideways drift ${Math.abs(comX - c0.x).toExponential(3)}. The last clause is the one that matters here: before the layout fix this read ${c0.y.toFixed(9)} -- the REST value -- and the row passed`);
        ok(`*** two identical runs are bit-identical on all ${F.twice.len} floats, and this is the first time that claim has meant anything ***`,
            F.twice.differ === 0 && F.twice.len > 0,
            `${F.twice.differ} differ. Integer addition is associative, so a node total cannot depend on which workgroup finished first -- but a kernel whose dispatches are all dropped is also bit-identical, which is what this was measuring before`);
        ok(`  and the fixed-point accumulators never saturated across every run (${F.sat} clipped scatters), which likewise now means something`,
            F.sat === 0, "an i32 accumulator that overflows wraps rather than crashing, and the material does something plausible and wrong");

        console.log("\n3. THE ELASTIC PATH IS THE INTERPRETER'S NUMBER; THE PLASTIC PATH IS FOUR ORDERS WORSE");
        const rows = [15, 30, 60, 120].map((st) => ({ st,
            on: gapOf(F.runs["on" + st], cpuRun({ steps: st, plastic: true })).rel,
            off: gapOf(F.runs["off" + st], cpuRun({ steps: st, plastic: false })).rel }));
        ok(`*** the ELASTIC path agrees with the graded loop to ${rows.map((x) => x.off.toExponential(2)).join(", ")} over ${rows.map((x) => x.st).join("/")} steps -- the interpreter's cited ~1e-7, confirmed on hardware ***`,
            rows.every((x) => x.off < PAGE_TOL), `all inside the page's own ${PAGE_TOL} threshold`);
        ok(`*** and the PLASTIC path reads ${rows.map((x) => x.on.toExponential(2)).join(", ")} -- OVER that threshold at EVERY step count, including the 15 the interpreter measured ***`,
            rows.every((x) => x.on > PAGE_TOL),
            `ratios ${rows.map((x) => (x.on / x.off).toFixed(0) + "x").join(", ")}. Over at 15 steps too, so this is not error accumulating over a longer run -- it is a per-step cost, on a branch section 1 shows changes NOTHING on the CPU`);
        const col = gapOf(F.runs.col, cpuRun({ block: BLOCK_C, walls: WALL, steps: 60, plastic: true })).rel;
        ok(`  the collapsing column, where the clamp DOES fire, reads ${col.toExponential(2)} -- the same order as free fall's plastic figure rather than worse`,
            col > PAGE_TOL && col < 1e-2,
            "so the cost is the svd2/fromSvd round-trip the branch always pays, not the clamping itself");
        report("THE TOLERANCE IS NOT WIDENED HERE, DELIBERATELY. magmapGpu.mjs states the rule: \"the reflex when " +
               "that happened would be to widen the tolerance until it passed -- which is how a gate stops meaning " +
               "anything.\" What to do about the kernel's plastic path -- reconstruct F only when the clamp actually " +
               "binds, or accept the cost and move the page's threshold with a reason -- is a decision, and a round " +
               "that makes it should make it on purpose rather than as a side effect of this one.");
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. Every number below was produced by running it.
//   A  mpm-gpu-check.html put back to layout:"auto" -- THE STATE THE TREE ACTUALLY SHIPPED IN -> exit=1, 1 red.
//      Before this round that state cost nothing anywhere, which is the whole reason it survived: the page was
//      never opened, and if it had been, three of its six rows would have passed while it did nothing.
//   B  the page's OWN sabotage, a B-spline coefficient mistyped by one digit (0.75 -> 0.755) -> exit=1, 3 red.
//      It has a number now: the parabola lands at 4.562912254 against 5.263531250, off by 7.006e-1, and the
//      elastic path degrades 1.68e-4 / 1.24e-3 / 1.04e-2 / 1.08e-1 across the step sweep. The nine weights no
//      longer sum to one, so the transfer scatters mass and momentum short -- silently, as a light material.
//   C  the P2G scatter's atomicAdd replaced by atomicStore, so nine-node accumulation becomes last-writer-wins
//      -> exit=1, 3 red: elastic 1.11e-2 at 15 steps and the parabola off by 4.233e-1.
//      *** AND IT LEFT "two identical runs are bit-identical" GREEN, WHICH IS THE POINT OF THAT ROW'S LIMIT. ***
//      A destroyed scatter is still deterministic if the device always schedules the same way. That row detects
//      ORDER-DEPENDENCE and nothing else, and on this device there is no order to vary -- which is exactly what
//      this file's closing line says is still unchecked. The row is not weak; it is narrow, and now measurably so.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: A RACE, still. Integer atomics make the node total order-independent BY CONSTRUCTION and " +
    "two runs agreeing is consistent with that -- but SwiftShader is one implementation and a real card schedules " +
    "workgroups differently, so what has been shown is that this device does not expose one. Vendor f32 beyond " +
    "SwiftShader's, which is exactly what the plastic figure above would move with. 65,536 particles, which is the " +
    "size this kernel exists for and which no CPU loop can adjudicate. And SPEED, which nothing here times.");
process.exit(fails ? 1 : 0);
