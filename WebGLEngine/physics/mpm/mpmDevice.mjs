// WebGLEngine/physics/mpm/mpmDevice.mjs -- v4466
//
// *** THE MPM KERNEL ON gfx/device.js, WHICH IS THE FIRST TIME IT HAS RUN ON A GPU IN THIS TREE. *** physics/mpm/
// gpuKernel.mjs has said "CORRECT ON AN INTERPRETER, UNTRIED ON A GPU" since v3809, and its check page needed a rig
// nobody had opened it on. The headless Dawn device and the browser's WebGPU have both been in the tree since v4292;
// the kernel is four entry points over five shared buffers, two of them atomic, which the one-buffer harness cannot
// drive but the device can: one compute pipeline per stage from the one module, the buffers bound by name once, and
// four dispatches per step inside one frame.
//
// *** WHAT RUNNING IT FOUND BEFORE A NUMBER CAME BACK. *** A layout: "auto" pipeline holds only the bindings its entry
// point reaches, and a bind group with an extra binding is refused. gfx/device.js decided "used" over the WHOLE module
// text until this round, so the clear pipeline was handed parts, gv and flags and refused; the device's scan is per
// entry point now (usedNames), and mpm-gpu-check.html -- which built one five-entry bind group for all four stages --
// could not have run a stage on any real device either. Both are fixed by the same rule.
//
// The CPU twin is physics/mpm/step.mjs, and every number in the uniform block comes from the graded modules through
// packParams, as gpuKernel.mjs insists. tools/ship/mpmDevice-selfcheck.mjs holds the device to the twin.
"use strict";
import { MPM_WGSL, PARTICLE_FLOATS, PF, packParams, fixedPointScales, clampLimits } from "./gpuKernel.mjs";
import { restBlock } from "./step.mjs";

export const STAGES = Object.freeze(["clear", "p2g", "grid", "g2p"]);

/** The particle buffer from restBlock's particles: sixteen floats each, F and Fp at the identity. */
export function packParticles(ps) {
    const parts = new Float32Array(ps.length * PARTICLE_FLOATS);
    ps.forEach((p, i) => { const o = i * PARTICLE_FLOATS; parts[o + PF.px] = p.x; parts[o + PF.py] = p.y; parts[o + PF.f00] = 1; parts[o + PF.f11] = 1; parts[o + PF.p00] = 1; parts[o + PF.p11] = 1; });
    return parts;
}

/**
 * The kernel on a device. scene: { nx, ny, block, walls, mode }; opts: { h, dt, gy, params: { mu, lambda }, alpha }.
 * On a backend without compute the handle refuses by name -- the twin is step.mjs and a caller runs it directly.
 *
 *   const sim = makeMpmDevice(device, scene, opts); sim.step(15); const { parts, flags } = await sim.read(); sim.destroy();
 */
export function makeMpmDevice(device, scene, { h = 0.5, dt = 1 / 240, gy = -9.81, gx = 0, params, alpha } = {}) {
    if (device.backend !== "webgpu" && device.backend !== "null")
        throw new Error("mpmDevice: the " + device.backend + " backend has no compute; run physics/mpm/step.mjs, the graded twin");
    const ps = restBlock(scene.block), N = ps.length, nodes = (scene.nx + 1) * (scene.ny + 1);
    const cl = clampLimits(), scales = fixedPointScales({ h });
    const uni = packParams({ nx: scene.nx, ny: scene.ny, nParticles: N, plasticMode: scene.mode, h, dt, gx, gy,
                             mu: params.mu, lambda: params.lambda, alpha, pmass: ps[0].m, pvol: ps[0].vol0,
                             thetaC: cl.thetaC, thetaS: cl.thetaS, walls: scene.walls, scales });
    const P = device.buffer({ data: new Uint8Array(uni), usage: "uniform" });
    const parts = device.buffer({ data: packParticles(ps), usage: "storage" });
    const acc = device.buffer({ size: nodes * 5 * 4, usage: "storage" });
    const gv = device.buffer({ size: nodes * 16, usage: "storage" });
    const flags = device.buffer({ data: new Uint32Array(4), usage: "storage" });
    const pipes = {};
    for (const stage of STAGES) {
        const c = device.compute({ wgsl: MPM_WGSL, entryPoint: stage });
        for (const b of c.all || c.bindings || []) if (b.used !== false) c.bind(b.name, { P, parts, acc, gv, flags }[b.name]);
        pipes[stage] = c;
    }
    const counts = { clear: nodes * 5, p2g: N, grid: nodes, g2p: N };
    const wg = (x) => Math.ceil(x / 64);
    return {
        count: N, nodes, m: ps[0].m, steps: 0,
        /** n steps: clear, p2g, grid, g2p per step, all inside one frame's encoder. */
        step(n = 1) { device.frame(({ pass }) => { for (let s = 0; s < n; s++) for (const st of STAGES) pass.dispatch(pipes[st], wg(counts[st])); }); this.steps += n; },
        async read() { return { parts: new Float32Array(await device.read(parts)), flags: new Uint32Array(await device.read(flags)) }; },
        /** The centre of mass the page computes: read back, summed in f64. */
        async centreOfMass() { const { parts: p } = await this.read(); let mx = 0, my = 0, mm = 0; for (let i = 0; i < N; i++) { const o = i * PARTICLE_FLOATS; mx += this.m * p[o]; my += this.m * p[o + 1]; mm += this.m; } return { x: mx / mm, y: my / mm }; },
        destroy() { for (const b of [P, parts, acc, gv, flags]) { try { b.destroy(); } catch (e) {} } },
    };
}
