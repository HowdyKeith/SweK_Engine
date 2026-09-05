#!/usr/bin/env node
// WebGLEngine/tools/ship/xpbdDevice-selfcheck.mjs -- v4465
//
// GRADES physics/xpbd/xpbdWgsl.mjs -- THE CLOTH PILLAR'S GPU PATH, THE FIRST physics/ MODULE TO RUN THROUGH
// gfx/device.js -- ON THE HEADLESS DAWN DEVICE, ON THE BROWSER'S WebGPU THROUGH THE DEVICE, AND ON THE NULL BACKEND.
//
// *** FOR 1800 ROUNDS THE CLOTH'S GPU LOOP WAS FOUR SHADER FILES NOTHING LOADED. *** predictions.html describes it,
// the shaderRefs census counts the files, and no module, page or gate ever fetched one. This gate is the first time
// the XPBD solve has run on a GPU in this tree, and the claims are sized to what a first run can establish:
//
//   THE MIRROR IS PINNED. physics/xpbd/xpbdWgsl.mjs carries frameFlat, the kernels' operation order with one rounding
//   knob. With the knob at identity it reproduces the shipped f64 clothLoop BYTE FOR BYTE over 40 frames (a hash);
//   with the knob at Math.fround it is the f32 mirror, and its distance from f64 is measured here and held under a
//   floor stated before any device number was seen: F32_FLOOR = 1e-4 (one three-thousandth of the 0.3 spacing).
//
//   THE DEVICE EQUALS THE MIRROR. On the headless Dawn device each of the three kernels -- predict, one solve pass
//   over one color, finalize -- returns exactly the f32 mirror's bytes: 100 of 100 words each, measured before the
//   assertion was written and asserted now that it is known to be true of this rasteriser. In the browser, over
//   40 frames through gfx/device.js, the same identity is MEASURED and printed; the assertion there is the floor
//   against f64, because forty frames of two SwiftShader builds is a claim this gate should not make sight unseen.
//
//   THE DEVICE IS DETERMINISTIC. Two runs give the same bits, and so does a within-color shuffle of every batch --
//   the graph-coloring property, which the CPU gates prove by the same shuffle, holding on the GPU where it matters.
//
//   CONTACT: with radius 0.4 the pair finder returns pairs every frame (v3606 measured 40/40 at that radius on this
//   fixture); the device path reports them, runs the unilateral kernel over them, and is deterministic. The f32/f64
//   gap WITH contact is printed and NOT bounded: a pair set is a discontinuous function of the positions, so a byte
//   of f32 can flip a pair in or out, and pretending a tolerance covers that would be the v3541 vacuous-knob shape.
//
//   WebGL2 has no compute, so the handle runs the shipped f64 twin there and says so in `path`.
//
// MEASURED AT v4465 (this box, SwiftShader on both harnesses): the browser's 40 frames were bit-identical to the f32
// mirror on 75 of 75 coordinates, worst 0. Printed, not asserted, for the reason above.
//
// SABOTAGE LOG (v4465) -- each applied to physics/xpbd/xpbdWgsl.mjs, gate run, exit read, file restored byte for byte:
//   A  the -aTilde*lambda term dropped from the kernel (PBD, not XPBD)  -> *** 1 RED THE FIRST TIME, AND THE WRONG ONE. ***
//      Only the 40-frame floor went red (1.47e-2 against 1e-4); the per-kernel identity on the headless device stayed
//      GREEN, because a first pass has lambda = 0 and the term is zero whatever the kernel does. A single-pass check
//      cannot see Eq (18)'s regularisation. Answered with a SECOND native pass that carries the mirror's multiplier
//      in (11 of 12 constraints nonzero); redone, exit=1, 2 red: that pass and the floor.
//   B  lambda never zeroed between frames                          -> exit=1, 1 red: the floor at 2.56e-2.
//   C  no graph coloring: every constraint in ONE batch (a race)   -> exit=1, 5 red: the null backend counts 7 dispatches
//      instead of 62, the floor at 3.28e-2, and BOTH determinism lines and the contact one -- the race is real even on
//      the software rasteriser, which is the strongest evidence this gate has that the coloring is load-bearing.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { runWgslComputeNative, headlessGpuSkipReason } from "./headlessGpu.mjs";
import { validateWgsl, parseBindings } from "../../render/wgslSpec.mjs";
import { nullBackend } from "../../gfx/device.js";
import * as X from "../../physics/xpbd/xpbdWgsl.mjs";
import { buildClothConstraints } from "../../physics/xpbd/clothMesh.js";
import { colorConstraints } from "../../physics/xpbd/xpbd.js";
import { clothLoop } from "../../physics/xpbd/clothLoop.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const hp = (p) => { const b = Buffer.alloc(p.length * 8); for (let i = 0; i < p.length; i++) b.writeDoubleLE(p[i], i * 8); return createHash("sha256").update(b).digest("hex"); };
const worstOf = (a, b) => { let w = 0; for (let i = 0; i < a.length; i++) w = Math.max(w, Math.abs(a[i] - b[i])); return w; };
const sameBits = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.fround(a[i]) === Math.fround(b[i])) n++; return n; };

export const F32_FLOOR = 1e-4;   // a priori: the f32 mirror and the device against the f64 solver, 40 frames, no contact
const FRAMES = 40, W = 5, H = 5;

/** clothLoop-selfcheck's fixture: a 5x5 sheet, spacing 0.3, top row pinned, a little scatter so no length is exact. */
function scene() {
    const { cons, adj } = buildClothConstraints(W, H, 0.3, { structural: 0.0, shear: 0.001, bending: 0.01 });
    const colors = colorConstraints(cons), N = W * H;
    const pos = new Float64Array(3 * N), vel = new Float64Array(3 * N), invMass = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; pos[3 * i] = x * 0.3 + 0.01 * Math.sin(i); pos[3 * i + 1] = 0.02 * Math.cos(i); pos[3 * i + 2] = -y * 0.3; invMass[i] = (y === 0) ? 0 : 1; }
    return { cons, adj, colors, N, init: { pos, vel, invMass } };
}
const OPT = (adj, radius = 0) => ({ dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius, adj });
let seed = 0x5eed;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

console.log("\n1. THE MIRROR IS PINNED TO THE SHIPPED SOLVER, THE KERNELS PARSE, AND THE NULL BACKEND COUNTS THE DISPATCHES");
const S = scene();
const ref = clothLoop(S.init, S.init.invMass, S.cons, S.colors, FRAMES, OPT(S.adj));
let mirror32 = null;
{
    const b64 = X.makeBuffers(S.init); for (let f = 0; f < FRAMES; f++) X.clothFrameF64Flat(b64, S.init.invMass, S.cons, S.colors, OPT(S.adj));
    ok("*** the flat mirror at f64 reproduces clothLoop BYTE FOR BYTE over 40 frames ***", hp(b64.pos) === hp(ref.pos) && hp(b64.vel) === hp(ref.vel), "one implementation, one rounding knob -- the f32 mirror cannot drift from the twin");
    const b32 = X.makeBuffers(S.init, Math.fround); for (let f = 0; f < FRAMES; f++) X.clothFrameF32(b32, S.init.invMass, S.cons, S.colors, OPT(S.adj));
    mirror32 = b32;
    const w = worstOf(b32.pos, ref.pos);
    ok(`  the f32 mirror is within F32_FLOOR = ${F32_FLOOR} of f64 after 40 frames`, w < F32_FLOOR, `worst ${w.toExponential(2)} -- the floor a device tolerance is earned from`);
    ok("  CONTROL: the f32 mirror is NOT the f64 solver (it moved)", w > 0, `${w.toExponential(2)}`);
    for (const [name, wgsl, names] of [["predict", X.predictWgsl(), "pred,step,pos,vel,prev"], ["solve", X.solveWgsl(), "pred,step,constraints,batch,lambda"], ["finalize", X.finalizeWgsl(), "pos,step,pred,prev,vel"]]) {
        const v = validateWgsl(wgsl), b = parseBindings(wgsl).sort((p, q) => p.binding - q.binding);
        ok(`the ${name} kernel parses and binds ${names} at 0..4, the out buffer at binding 0`, v.length === 0 && b.map((x) => x.name).join(",") === names && b[0].binding === 0 && b[1].addressSpace === "uniform", v.join(" | ") || b.map((x) => `${x.binding}:${x.name}`).join(" "));
    }
    ok("the Step uniform is 32 bytes: dt, unilateral, count, pad, gravity", X.STEP_FLOATS === 8 && X.packStep({ dt: 0.5, unilateral: 1, count: 7, gravity: [1, 2, 3] }).join(",") === "0.5,1,7,0,1,2,3,0");
    const dv = new DataView(X.packConstraints([{ i: 3, j: 9, rest: 0.25, compliance: 0.001 }]));
    ok("  a constraint packs as u32 i, u32 j, f32 rest, f32 compliance", dv.getUint32(0, true) === 3 && dv.getUint32(4, true) === 9 && dv.getFloat32(8, true) === 0.25 && dv.getFloat32(12, true) === Math.fround(0.001));
    ok("  particles pack as vec4 with the inverse mass in w", X.packParticles(new Float64Array([1, 2, 3]), new Float64Array([0.5])).join(",") === "1,2,3,0.5");
    // The null backend records the compute path when asked, and runs the twin otherwise.
    const nb = nullBackend();
    const rec = X.makeClothDevice(nb, S.init, S.cons, S.colors, { ...OPT(S.adj), recordOnNull: true });
    await rec.frame();
    const dispatches = nb.ops.filter((o) => o[0] === "dispatch").length;
    ok("*** on the null backend the compute path records 1 + iterations x colors + 1 dispatches per frame ***", rec.path === "compute" && dispatches === 1 + 5 * S.colors.length + 1, `${dispatches} dispatches for ${S.colors.length} colors x 5 iterations`);
    const twin = X.makeClothDevice(nb, S.init, S.cons, S.colors, OPT(S.adj));
    for (let f = 0; f < FRAMES; f++) await twin.frame();
    const tp = await twin.read();
    ok("  and without the flag it runs the shipped twin, byte for byte", twin.path === "cpu" && hp(tp.pos) === hp(ref.pos));
    const src = codeOf(read("physics/xpbd/xpbdWgsl.mjs"));
    ok("the device path binds by name through device.compute() and dispatches inside device.frame()", /device\.compute\(\{ wgsl: predictWgsl\(\) \}\)/.test(src) && /\.bind\("batch", batches\[c\]\); pass\.dispatch\(solveFixed/.test(src) && /pass\.dispatch\(finalize, wgN\)/.test(src));
    ok("  contact accumulates lambda through the SAME kernel with the unilateral flag (the old cloth-collision.wgsl did not)", /unilateral: 1/.test(src) && /step\.unilateral > 0\.5 && C >= 0\.0/.test(X.solveWgsl()) && /lambda\[ci\] = lambda\[ci\] \+ dLambda/.test(X.solveWgsl()));
}

console.log("\n2. ON THE HEADLESS DAWN DEVICE: EACH KERNEL RETURNS THE f32 MIRROR'S BYTES");
{
    const skip = headlessGpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const f = Math.fround, N = S.N, invMass = S.init.invMass, dt = f(0.016), g = [0, -10, 0].map(f);
        const step = X.packStep({ dt: 0.016, unilateral: 0, count: N, gravity: [0, -10, 0] });
        const pos = X.packParticles(S.init.pos, invMass), vel0 = X.packParticles(S.init.vel, new Float64Array(N));
        // the mirror, one pass at a time, on vec4 records
        const pred32 = new Float32Array(4 * N), vel32 = new Float32Array(4 * N);
        for (let a = 0; a < N; a++) { for (let c = 0; c < 3; c++) { if (invMass[a] > 0) { vel32[4 * a + c] = f(vel0[4 * a + c] + f(g[c] * dt)); pred32[4 * a + c] = f(pos[4 * a + c] + f(vel32[4 * a + c] * dt)); } else pred32[4 * a + c] = pos[4 * a + c]; } pred32[4 * a + 3] = pos[4 * a + 3]; }
        const rp = await runWgslComputeNative({ code: X.predictWgsl(), outCount: 4 * N, uniforms: step, workgroups: 1, inputs: [{ binding: 2, data: pos }, { binding: 3, data: vel0 }, { binding: 4, data: new Float32Array(4 * N) }] });
        ok("*** predict: 100 of 100 words identical to the f32 mirror ***", rp.ok && sameBits(rp.values, pred32) === 4 * N, rp.ok ? `${sameBits(rp.values, pred32)} of ${4 * N}` : rp.reason);
        const m = Float32Array.from(pred32), lam = new Float32Array(S.cons.length);
        for (const ci of S.colors[0]) { const c = S.cons[ci]; const w1 = f(invMass[c.i]), w2 = f(invMass[c.j]), wsum = f(w1 + w2); if (wsum === 0) continue;
            const ax = 4 * c.i, bx = 4 * c.j; const dx = f(m[ax] - m[bx]), dy = f(m[ax + 1] - m[bx + 1]), dz = f(m[ax + 2] - m[bx + 2]);
            const len = f(Math.sqrt(f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz)))); if (len < 1e-12) continue; const C = f(len - f(c.rest));
            const aT = f(f(c.compliance) / f(dt * dt)); const dL = f(f(-C - f(aT * lam[ci])) / f(wsum + aT)); lam[ci] = f(lam[ci] + dL); const s = f(dL / len), s1 = f(w1 * s), s2 = f(w2 * s);
            m[ax] = f(m[ax] + f(s1 * dx)); m[ax + 1] = f(m[ax + 1] + f(s1 * dy)); m[ax + 2] = f(m[ax + 2] + f(s1 * dz)); m[bx] = f(m[bx] - f(s2 * dx)); m[bx + 1] = f(m[bx + 1] - f(s2 * dy)); m[bx + 2] = f(m[bx + 2] - f(s2 * dz)); }
        const rs = await runWgslComputeNative({ code: X.solveWgsl(), outCount: 4 * N, uniforms: step, workgroups: 1, outInit: pred32, inputs: [{ binding: 2, data: X.packConstraints(S.cons) }, { binding: 3, data: Uint32Array.from(S.colors[0]) }, { binding: 4, data: new Float32Array(S.cons.length) }] });
        let moved = 0; if (rs.ok) for (let i = 0; i < 4 * N; i++) if (rs.values[i] !== pred32[i]) moved++;
        ok("*** solve, one color in place on the prediction (outInit): 100 of 100 words identical to the f32 mirror ***", rs.ok && sameBits(rs.values, m) === 4 * N, rs.ok ? `${sameBits(rs.values, m)} of ${4 * N}` : rs.reason + " " + (rs.errors || []).join(" | "));
        ok("  CONTROL: the pass moved the prediction (the harness's out buffer was not left at zero)", moved > 0, `${moved} words moved`);
        // *** A SECOND PASS WITH THE MULTIPLIER CARRIED IN, BECAUSE THE FIRST CANNOT SEE Eq (18)'S TERM. *** Sabotage A
        // (the -aTilde*lambda term dropped) left the single-pass check green: lambda starts at zero, so on a first pass
        // the term is zero whatever the kernel does. The mirror's multiplier after pass one is handed to the device as
        // the lambda input for pass two, where it is nonzero for every compliant constraint, and pass two must equal
        // the mirror's pass two. Now the term has a check that can fail.
        const m2 = Float32Array.from(m), lam2 = Float32Array.from(lam);
        for (const ci of S.colors[0]) { const c = S.cons[ci]; const w1 = f(invMass[c.i]), w2 = f(invMass[c.j]), wsum = f(w1 + w2); if (wsum === 0) continue;
            const ax = 4 * c.i, bx = 4 * c.j; const dx = f(m2[ax] - m2[bx]), dy = f(m2[ax + 1] - m2[bx + 1]), dz = f(m2[ax + 2] - m2[bx + 2]);
            const len = f(Math.sqrt(f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz)))); if (len < 1e-12) continue; const C = f(len - f(c.rest));
            const aT = f(f(c.compliance) / f(dt * dt)); const dL = f(f(-C - f(aT * lam2[ci])) / f(wsum + aT)); lam2[ci] = f(lam2[ci] + dL); const s = f(dL / len), s1 = f(w1 * s), s2 = f(w2 * s);
            m2[ax] = f(m2[ax] + f(s1 * dx)); m2[ax + 1] = f(m2[ax + 1] + f(s1 * dy)); m2[ax + 2] = f(m2[ax + 2] + f(s1 * dz)); m2[bx] = f(m2[bx] - f(s2 * dx)); m2[bx + 1] = f(m2[bx + 1] - f(s2 * dy)); m2[bx + 2] = f(m2[bx + 2] - f(s2 * dz)); }
        const rs2 = await runWgslComputeNative({ code: X.solveWgsl(), outCount: 4 * N, uniforms: step, workgroups: 1, outInit: Float32Array.from(rs.values || m), inputs: [{ binding: 2, data: X.packConstraints(S.cons) }, { binding: 3, data: Uint32Array.from(S.colors[0]) }, { binding: 4, data: lam }] });
        const carried = S.colors[0].filter((ci) => lam[ci] !== 0).length;
        ok("*** solve, a SECOND pass with the multiplier carried in: identical to the mirror's second pass -- the check that sees Eq (18)'s term ***", rs2.ok && sameBits(rs2.values, m2) === 4 * N, rs2.ok ? `${sameBits(rs2.values, m2)} of ${4 * N}; ${carried} of ${S.colors[0].length} constraints carry a nonzero multiplier in` : rs2.reason);
        ok("  CONTROL: the carried multiplier is nonzero somewhere, so the term was exercised", carried > 0, `${carried} nonzero`);
        const prev32 = pos, fin32 = new Float32Array(4 * N), velF = Float32Array.from(vel32);
        for (let a = 0; a < N; a++) { for (let c = 0; c < 3; c++) { if (invMass[a] > 0) velF[4 * a + c] = f(f(m[4 * a + c] - prev32[4 * a + c]) / dt); fin32[4 * a + c] = m[4 * a + c]; } fin32[4 * a + 3] = m[4 * a + 3]; }
        const rf = await runWgslComputeNative({ code: X.finalizeWgsl(), outCount: 4 * N, uniforms: step, workgroups: 1, inputs: [{ binding: 2, data: m }, { binding: 3, data: prev32 }, { binding: 4, data: vel32 }] });
        ok("*** finalize: the new positions are the prediction, word for word ***", rf.ok && sameBits(rf.values, fin32) === 4 * N, rf.ok ? `${sameBits(rf.values, fin32)} of ${4 * N}` : rf.reason);
        report(`adapter: ${rp.adapter && rp.adapter.description}`);
    }
}

console.log("\n3. THROUGH gfx/device.js IN THE BROWSER: 40 FRAMES ON WebGPU, DETERMINISTIC, WITHIN THE FLOOR; THE TWIN ON WebGL2");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const shuffled = S.colors.map((b) => shuffle(b));
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { init: { pos: Array.from(S.init.pos), vel: Array.from(S.init.vel), invMass: Array.from(S.init.invMass) }, cons: S.cons, colors: S.colors, shuffled, adj: Array.from(S.adj), FRAMES }, script: `async (a) => {
            const X = await import("/physics/xpbd/xpbdWgsl.mjs"); const { requestDevice } = await import("/gfx/device.js");
            const init = { pos: Float64Array.from(a.init.pos), vel: Float64Array.from(a.init.vel), invMass: Float64Array.from(a.init.invMass) };
            const adj = new Set(a.adj);
            const run = async (dev, colors, radius) => { const c = X.makeClothDevice(dev, init, a.cons, colors, { dt: 0.016, iterations: 5, gravity: [0, -10, 0], radius, adj });
                let pairs = 0; for (let f = 0; f < a.FRAMES; f++) { await c.frame(); pairs += c.pairs; } const o = await c.read(); const out = { path: c.path, pairs, pos: Array.from(o.pos), vel: Array.from(o.vel) }; c.destroy(); return out; };
            const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend };
                const t0 = performance.now(); o.a = await run(dev, a.colors, 0); o.ms = performance.now() - t0;
                o.b = await run(dev, a.colors, 0);
                o.c = await run(dev, a.shuffled, 0);
                o.d = await run(dev, a.colors, 0.4);
                o.e = await run(dev, a.colors, 0.4);
                dev.destroy(); out[backend] = o;
            }
            return out;
        }`, timeoutMs: 120000 });
        ok("*** both backends ran 40 frames through the device handle ***", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : r.reason);
        if (r.ok) {
            const G = r.result.webgpu, L = r.result.webgl2;
            ok("WebGPU took the compute path; WebGL2 the shipped twin", G.a.path === "compute" && L.a.path === "cpu", `${G.a.path} / ${L.a.path}`);
            const wG = worstOf(G.a.pos, ref.pos);
            ok(`*** WebGPU after 40 frames is within F32_FLOOR = ${F32_FLOOR} of the f64 solver ***`, wG < F32_FLOOR, `worst ${wG.toExponential(2)} over ${ref.pos.length} coordinates`);
            const id = sameBits(G.a.pos, mirror32.pos);
            report(`WebGPU vs the f32 mirror after 40 frames: ${id} of ${ref.pos.length} coordinates bit-identical, worst ${worstOf(G.a.pos, mirror32.pos).toExponential(2)} -- measured, not asserted (see the header)`);
            ok("  the sheet moved: CONTROL against a frame that draws nothing", worstOf(G.a.pos, S.init.pos) > 0.05, `${worstOf(G.a.pos, S.init.pos).toFixed(3)} from the start`);
            ok("*** WebGPU is DETERMINISTIC: a second run returns the same bits ***", hp(G.a.pos) === hp(G.b.pos) && hp(G.a.vel) === hp(G.b.vel));
            ok("*** and a within-color SHUFFLE of every batch returns the same bits -- graph coloring holding on the device ***", hp(G.a.pos) === hp(G.c.pos));
            ok("  WebGL2's twin equals clothLoop byte for byte", hp(L.a.pos) === hp(ref.pos) && hp(L.a.vel) === hp(ref.vel));
            report(`WebGPU: 40 frames in ${G.ms.toFixed(0)} ms through the device (${S.colors.length} colors x 5 iterations + 2 dispatches per frame); WebGL2 twin ${L.ms.toFixed(0)} ms`);
            // contact
            const refC = clothLoop(S.init, S.init.invMass, S.cons, S.colors, FRAMES, OPT(S.adj, 0.4));
            ok("*** with radius 0.4 the device path finds pairs and runs the unilateral kernel over them ***", G.d.pairs > 0, `${G.d.pairs} pairs over 40 frames on WebGPU`);
            ok("  and is deterministic with contact too", hp(G.d.pos) === hp(G.e.pos));
            report(`with contact, WebGPU vs f64: worst ${worstOf(G.d.pos, refC.pos).toExponential(2)} -- printed, not bounded (a pair set is discontinuous in the positions)`);
            ok("  WebGL2's twin with contact equals clothLoop with contact", hp(L.d.pos) === hp(refC.pos));
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a GPU pair finder (contact reads the prediction back once per frame by design); bit identity " +
    "between the browser's WebGPU and the f32 mirror over 40 frames (measured and printed above, asserted only per " +
    "kernel on the headless device); a sheet larger than 5x5 (the dispatch is one workgroup here); real hardware, " +
    "where the f32 floor is a different number; and any page -- physics-lab.html still draws the CPU solver.");
process.exit(fails ? 1 : 0);
