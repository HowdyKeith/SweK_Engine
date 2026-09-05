#!/usr/bin/env node
// WebGLEngine/tools/ship/stepLoop-selfcheck.mjs -- v4469
//
// GRADES render/stepLoop.mjs -- ONE STATE, TWO BUFFERS, N DISPATCHES, ONE READBACK, ON gfx/device.js -- THROUGH ITS
// FIRST CONSUMER, THE LOGISTIC MAP (physics/chaos/logisticWgsl.mjs), WHOSE CHAOS MAKES EVERY MISTAKE A DIFFERENT ORBIT.
//
// A ping-pong that reads the buffer it should have written, a swap that lands on the wrong buffer for an odd step
// count, a per-step uniform seen one step late: on a smooth kernel each of those is a small number, and on the
// logistic map at r near 4 each becomes an unrelated orbit within a few dozen steps. So the claims are BIT claims:
// 1,024 orbits over 200 steps equal to the f32 twin on every element, one step and two and three (the holder
// alternates), two runs the same bits, and a schedule that halves r on step 197 only, matched bit for bit -- which
// only the semantics "each step sees its own uniform" can produce, since a uniform written 200 times before one
// submit shows every step the last value, and the twin of THAT is a different orbit (planted here as the control).
//
// MEASURED AT v4469 (this box): 200 dispatches in one frame 28 ms; 200 frames under a schedule 39 ms; the gate 0.8 s.
//
// SABOTAGE LOG (v4469) -- each applied to render/stepLoop.mjs, gate run, exit read, file restored byte for byte:
//   A  read() reads the OTHER buffer (the one the last step read)   -> exit=1, 5 red: 0 of 1,024 at one, two, three and
//      200 steps and under the schedule. The holder line stays green -- it names the buffer, it does not read it --
//      which is why the read is graded by its bytes and not by its label.
//   B  the per-step uniform written N times inside ONE frame        -> exit=1, 3 red: the schedule run returns the bits
//      of a uniform seen at EVERY step (1,024 of 1,024 shared with that twin, 0 with the right one), the control
//      that names that exact failure, and the source line. This is the bug the helper exists to know about.
//   C  the swap removed (src is always A, dst always B)              -> exit=1, 7 red: every device line and the holder.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { makeStepLoop } from "../../render/stepLoop.mjs";
import { logisticStepWgsl, fixture, orbitCpu, packKnobs, makeLogisticDevice } from "../../physics/chaos/logisticWgsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const sameBits = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n++; return n; };
const STEPS = 200, SCHED_STEP = 197;
const schedule = (k) => (k === SCHED_STEP ? 0.5 : 1);

console.log("\n1. THE LOOP ON THE NULL BACKEND: TWO BUFFERS, ALTERNATING BINDS, ONE DISPATCH PER STEP, REFUSALS BY NAME");
{
    const nb = nullBackend(), F = fixture({ count: 8 });
    const loop = makeStepLoop(nb, { code: logisticStepWgsl(), state: F.x, names: ["src", "dst"], buffers: { r: { data: F.r }, knobs: { data: packKnobs({ count: 8 }), usage: "uniform" } }, workgroups: 1 });
    loop.step(3);
    const binds = nb.ops.filter((o) => o[0] === "bind").map((o) => o[1]);
    ok("*** three steps bind src then dst three times and dispatch three times ***", binds.join() === "r,knobs,src,dst,src,dst,src,dst" && nb.ops.filter((o) => o[0] === "dispatch").length === 3 && loop.steps === 3, binds.join(","));
    ok("  after an odd number of steps the state is in B; after an even number in A", loop.holder === "B" && (loop.step(1), loop.holder === "A"));
    const x = await loop.read();
    ok("  read() returns the state's own type and length", x instanceof Float32Array && x.length === 8);
    const refuse = (fn) => { try { fn(); return "no throw"; } catch (e) { return e.message; } };
    ok("*** a kernel that declares no such binding is refused by name ***", /declares no binding named "nope" -- it declares dst, knobs, src, r/.test(refuse(() => makeStepLoop(nb, { code: logisticStepWgsl(), state: F.x, names: ["src", "nope"] }))));
    ok("  a perStep uniform the kernel does not declare is refused", /perStep names "tick"/.test(refuse(() => makeStepLoop(nb, { code: logisticStepWgsl(), state: F.x, buffers: { r: { data: F.r } }, perStep: { name: "tick", pack: () => new Float32Array(4) } }))));
    ok("  a backend without compute is refused, pointing at the CPU twin", /webgl2 backend has no compute; run the CPU twin/.test(refuse(() => makeStepLoop({ backend: "webgl2" }, { code: logisticStepWgsl(), state: F.x }))));
    const nb2 = nullBackend();
    const sched = makeStepLoop(nb2, { code: logisticStepWgsl(), state: F.x, buffers: { r: { data: F.r } }, perStep: { name: "knobs", pack: (k) => packKnobs({ count: 8, scale: schedule(k), step: k }) } });
    sched.step(4);
    const writes = nb2.ops.filter((o) => o[0] === "write").length, frames = nb2.ops.filter((o) => o[0] === "dispatch").length;
    ok("*** with a per-step uniform the loop writes it before EACH step (four writes for four steps), one frame per step ***", writes === 4 && frames === 4, `${writes} writes, ${frames} dispatches`);
    const cpu = makeLogisticDevice({ backend: "webgl2" }, fixture({ count: 16 })); cpu.step(5);
    ok("  the consumer's CPU twin runs where there is no compute, and says so", cpu.path === "cpu" && cpu.steps === 5 && sameBits(await cpu.read(), orbitCpu(fixture({ count: 16 }), 5)) === 16);
    const src = codeOf(read("render/stepLoop.mjs"));
    ok("the helper's one piece of knowledge is in the code: a per-step uniform means one frame per step", /for \(let k = 0; k < n; k\+\+\) \{ stepBuf\.write\(perStep\.pack\(steps\)\); device\.frame/.test(src));
}

console.log("\n2. ON THE BROWSER'S WebGPU: 1,024 ORBITS OVER 200 STEPS, BIT FOR BIT, ODD AND EVEN, TWICE, AND ON A SCHEDULE");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const F = fixture();
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { STEPS, SCHED_STEP }, script: `async (a) => {
            const L = await import("/physics/chaos/logisticWgsl.mjs"); const { requestDevice } = await import("/gfx/device.js");
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            if (dev.backend !== "webgpu") return { noWebgpu: dev.backend };
            const run = async (n, schedule) => { const F = L.fixture(); const sim = L.makeLogisticDevice(dev, F, { schedule }); const t0 = performance.now(); sim.step(n); const x = await sim.read(); const ms = performance.now() - t0; sim.destroy(); return { x: Array.from(x), ms, path: sim.path }; };
            const out = { s1: await run(1), s2: await run(2), s3: await run(3), a: await run(a.STEPS), b: await run(a.STEPS) };
            out.sched = await run(a.STEPS, (k) => (k === a.SCHED_STEP ? 0.5 : 1));
            dev.destroy(); return out;
        }`, timeoutMs: 120000 });
        ok("*** the step loop ran on the browser's WebGPU through the device ***", r.ok && r.result && !r.result.noWebgpu, r.ok ? (r.result && r.result.noWebgpu ? "no webgpu: " + r.result.noWebgpu : "") : r.reason);
        if (r.ok && r.result && !r.result.noWebgpu) {
            const R = r.result;
            for (const [k, n] of [["s1", 1], ["s2", 2], ["s3", 3]]) { const s = sameBits(R[k].x, orbitCpu(F, n)); ok(`  ${n} step${n > 1 ? "s" : ""}: ${s} of ${F.count} orbits bit-identical to the f32 twin (the holder alternates)`, s === F.count); }
            const twin = orbitCpu(F, STEPS), s200 = sameBits(R.a.x, twin);
            ok(`*** ${STEPS} steps: every one of ${F.count} orbits bit-identical to the f32 twin -- the pattern read and wrote the right buffer ${STEPS} times ***`, s200 === F.count && R.a.path === "compute", `${s200}/${F.count}, ${R.a.ms.toFixed(0)} ms for ${STEPS} dispatches in one frame`);
            ok("  and a second run returns the same bits", sameBits(R.a.x, R.b.x) === F.count);
            ok("  CONTROL: the orbits are chaotic -- a one-ulp seed change diverges (the map is not a smooth test)", (() => { const G = fixture(), i = 1000; G.x[i] = Math.fround(G.x[i] + 1e-7); return Math.abs(orbitCpu(G, STEPS)[i] - twin[i]) > 0.01; })());
            const schedTwin = orbitCpu(F, STEPS, schedule), lastOnly = orbitCpu(F, STEPS, () => 1), sS = sameBits(R.sched.x, schedTwin);
            ok(`*** a schedule that halves r on step ${SCHED_STEP} ONLY: bit-identical to its twin, so each step saw its OWN uniform ***`, sS === F.count, `${sS}/${F.count}, ${R.sched.ms.toFixed(0)} ms for ${STEPS} frames`);
            ok("  CONTROL: the scheduled orbits differ from the plain ones, and from the twin of a uniform seen at every step", sameBits(R.sched.x, R.a.x) < F.count / 2 && sameBits(R.sched.x, lastOnly) < F.count / 2, `${sameBits(R.sched.x, R.a.x)} and ${sameBits(R.sched.x, lastOnly)} of ${F.count} shared`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a kernel with several state buffers or several kernels per step (the cloth loop's predict / solve / finalize " +
    "is that shape and keeps its own runner), a staging RING for a readback every step (the flowfield's pattern; read() here is one " +
    "readback when asked), the brain's Deno device (raw WebGPU, task 29), and real hardware.");
process.exit(fails ? 1 : 0);
