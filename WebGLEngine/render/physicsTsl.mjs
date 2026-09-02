// WebGLEngine/render/physicsTsl.mjs -- v4321, v4329 (the fleets' looks and shells moved out to render/fleetTsl.mjs), v4331 (the exponent as a COMPUTE pass), v4336 (a second pass that READS what the first wrote), v4337 (a third that COUNTS with an atomic), v4338 (and a fourth that reduces in WORKGROUP memory), v4339 (a fifth that SIZES the next dispatch)
//
// PHYSICS AS TSL NODES, THE OTHER TWO (docs/TSL-ROADMAP.md step 5): swk_lyapunov's exponent (render/lyapunovWgsl.mjs,
// physics/chaos/logistic.js) and the Heidler return-stroke current (render/heidlerWgsl.mjs, physics/discharge/
// heidler.mjs) as TSL functions any node material can take, with the SAME keys the WGSL and GLSL are held to: ln 2
// at r = 4, and the lightning's peak over i0 an exact 1 at the true eta and 1.0667 at the published one. The
// iteration is a TSL Loop; the constants are the modules' (interpolated, not retyped); the uniforms are labelled
// so render/tslSource.mjs can transplant the emitted fragments into gfx/device.js pipelines.
"use strict";

import { LN2, DEFAULTS as LY_DEFAULTS, PERIOD3 } from "./lyapunovWgsl.mjs";
import { PARAMS, etaStandard, truePeak } from "../physics/discharge/heidler.mjs";

export { LN2, LY_DEFAULTS, PERIOD3, PARAMS, etaStandard, truePeak };

/** lyapunov(r, x0): the logistic map iterated `warmup` then `samples` times, the mean log-slope; the counts are baked in (a Loop bound). */
export function lyapunovNodes(TSL, { samples = LY_DEFAULTS.samples, warmup = LY_DEFAULTS.warmup } = {}) {
    const { Fn, float, Loop, log, abs } = TSL;
    for (const n of ["Fn", "float", "Loop", "log", "abs"]) if (typeof TSL[n] !== "function") throw new Error(`physicsTsl: the TSL namespace has no ${n}()`);
    const lyapunov = Fn(([r, x0]) => {
        const x = float(x0).toVar();
        Loop({ start: 0, end: warmup }, () => { x.assign(r.mul(x).mul(float(1.0).sub(x))); });
        const acc = float(0.0).toVar();
        Loop({ start: 0, end: samples }, () => { acc.addAssign(log(abs(r.mul(float(1.0).sub(x.mul(2.0)))))); x.assign(r.mul(x).mul(float(1.0).sub(x))); });
        return acc.div(samples);
    });
    return { lyapunov, samples, warmup };
}
/** heidlerShape(t, t1, t2) and heidler(t, i0, t1, t2, eta): the return-stroke current, a closed form of t. */
export function heidlerNodes(TSL) {
    const { Fn, float, exp, select } = TSL;
    const heidlerShape = Fn(([t, t1, t2]) => { const x = t.div(t1).mul(t.div(t1)); return select(t.lessThanEqual(0.0), float(0.0), x.div(float(1.0).add(x)).mul(exp(t.negate().div(t2)))); });
    const heidler = Fn(([t, i0, t1, t2, eta]) => i0.div(eta).mul(heidlerShape(t, t1, t2)));
    return { heidlerShape, heidler };
}
/** The Lyapunov key: r across [rLo, rHi] (uv.x), the seed down [seedLo, seedHi] (uv.y); red+green carry (lam + 3) / 4 in 16 bits, as lyapunovWgsl's key. */
export function makeLyapunovKeyTsl(THREE, TSL, { rLo = LY_DEFAULTS.rLo, rHi = LY_DEFAULTS.rHi, seedLo = LY_DEFAULTS.seedLo, seedHi = LY_DEFAULTS.seedHi, samples = LY_DEFAULTS.samples, warmup = LY_DEFAULTS.warmup } = {}) {
    const { Fn, float, vec4, uv, uniform } = TSL;
    const { lyapunov } = lyapunovNodes(TSL, { samples, warmup });
    const uniforms = { rLo: uniform(float(rLo)).label("rLo"), rHi: uniform(float(rHi)).label("rHi"), seedLo: uniform(float(seedLo)).label("seedLo"), seedHi: uniform(float(seedHi)).label("seedHi") };
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const r = uniforms.rLo.add(uniforms.rHi.sub(uniforms.rLo).mul(uv().x));
        const x0 = uniforms.seedLo.add(uniforms.seedHi.sub(uniforms.seedLo).mul(uv().y));
        const e = lyapunov(r, x0).add(3.0).div(4.0).clamp(0.0, 1.0);
        return vec4(e.mul(255.0).floor().div(255.0), e.mul(255.0).fract(), 0.0, 1.0);
    })();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms, samples, warmup };
}
export function decodeLyapunov(px, i) { return ((px[i] + px[i + 1] / 255) / 255) * 4 - 3; }
/** The Heidler key: t on a geometric grid from tLo to tHi across uv.x; red+green carry i(t) / i0 / 2 in 16 bits (the published eta's 1.0667 fits). */
export function makeHeidlerKeyTsl(THREE, TSL, { i0 = PARAMS.first.i0, t1 = PARAMS.first.t1, t2 = PARAMS.first.t2, eta = null, tLo = PARAMS.first.t1 / 50, tHi = PARAMS.first.t2 * 8 } = {}) {
    const { Fn, float, vec4, uv, uniform, exp, log } = TSL;
    const { heidler } = heidlerNodes(TSL);
    const e0 = eta == null ? truePeak(t1, t2).peak : eta;
    const uniforms = { i0: uniform(float(i0)).label("i0"), t1: uniform(float(t1)).label("t1"), t2: uniform(float(t2)).label("t2"), eta: uniform(float(e0)).label("eta"), tLo: uniform(float(tLo)).label("tLo"), tHi: uniform(float(tHi)).label("tHi") };
    const material = new THREE.NodeMaterial();
    material.fragmentNode = Fn(() => {
        const t = uniforms.tLo.mul(exp(log(uniforms.tHi.div(uniforms.tLo)).mul(uv().x)));
        const e = heidler(t, uniforms.i0, uniforms.t1, uniforms.t2, uniforms.eta).div(uniforms.i0).div(2.0).clamp(0.0, 1.0);
        return vec4(e.mul(255.0).floor().div(255.0), e.mul(255.0).fract(), 0.0, 1.0);
    })();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms, trueEta: truePeak(t1, t2).peak, standardEta: etaStandard(t1, t2) };
}
export function decodeHeidler(px, i) { return ((px[i] + px[i + 1] / 255) / 255) * 2; }

// v4329 -- the looks and shells that USE these functions moved to render/fleetTsl.mjs: a shell is a fleet's
// vertex stage, not a physics function, and this module was holding three of them and five looks besides.

// ---- v4331: the exponent as a COMPUTE pass ---------------------------------------------------------------------------
/**
 * THE LYAPUNOV EXPONENT AS A TSL COMPUTE PASS: invocation i sweeps r across [rLo, rHi] and writes the exponent into a
 * storage buffer. Same lyapunovNodes() the keys and the looks use, so the arithmetic is the module's; what is new is
 * the STAGE. render/tslSource.mjs transplantCompute() carries the emitted WGSL into a gfx/device.js compute pipeline,
 * and render/lyapunovWgsl.mjs lyapunovComputeWgsl() is the hand-written twin it is graded against.
 *
 * WebGPU ONLY, and said rather than discovered: WebGL2 has no compute stage, so this is the one transplant in the tree
 * with no pair to be held to. The claim it can still make is the one that matters -- the generated pass and the
 * hand-written one write the same floats, and both agree with the CPU model at the same sample count.
 *
 * The seed is NOT 0.5. At r = 4 that seed maps to the fixed point 0 in one step and every later slope is r itself, so
 * the exponent reads ln 4 rather than ln 2 -- a right answer to a question nobody meant to ask. Measured here first.
 */
export function makeLyapunovComputeTsl(TSL, { count = 64, rLo = LY_DEFAULTS.rLo, rHi = LY_DEFAULTS.rHi, seed = 0.4, samples = LY_DEFAULTS.samples, warmup = LY_DEFAULTS.warmup } = {}) {
    const { Fn, float, uniform, vec4, instanceIndex, instancedArray } = TSL;
    for (const n of ["instancedArray"]) if (typeof TSL[n] !== "function") throw new Error(`physicsTsl: the TSL namespace has no ${n}()`);
    if (seed === 0.5) throw new Error("physicsTsl: seed 0.5 lands on the logistic map's fixed point at r = 4 and reads ln 4, not ln 2; pick another seed");
    const { lyapunov } = lyapunovNodes(TSL, { samples, warmup });
    const uniforms = { span: uniform(vec4(rLo, rHi, count, seed)).label("span") };
    const buffer = instancedArray(count, "float");
    const node = Fn(() => {
        const t = float(instanceIndex).div(float(count - 1));
        const r = uniforms.span.x.add(uniforms.span.y.sub(uniforms.span.x).mul(t));
        buffer.element(instanceIndex).assign(lyapunov(r, uniforms.span.w));
    })().compute(count);
    return { node, buffer, uniforms, knobs: [rLo, rHi, count, seed], count, samples, warmup };
}
/** The same sweep on the CPU, at the SAME sample count, so the GPU is graded against a number and not against a limit. */
export function lyapunovSweepCpu({ count = 64, rLo = LY_DEFAULTS.rLo, rHi = LY_DEFAULTS.rHi, seed = 0.4, samples = LY_DEFAULTS.samples, warmup = LY_DEFAULTS.warmup } = {}) {
    const out = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        const r = rLo + (rHi - rLo) * (i / (count - 1));
        let x = seed;
        for (let k = 0; k < warmup; k++) x = r * x * (1 - x);
        let acc = 0;
        for (let k = 0; k < samples; k++) { acc += Math.log(Math.abs(r * (1 - 2 * x))); x = r * x * (1 - x); }
        out[i] = acc / samples;
    }
    return out;
}

/**
 * v4336 -- THE SECOND PASS, WHICH READS WHAT THE FIRST WROTE. One invocation per element: it reads the exponent the
 * sweep left in its buffer and writes 1 where that exponent is POSITIVE (chaotic) and 0 where it is not. Nothing here
 * is arithmetic worth grading -- a sign test is a sign test. What is worth grading is the DEPENDENCY: two dispatches
 * in one frame, the second reading the first's output, which is the shape every real pass in render/gpuDriven.mjs has
 * and no transplant in this tree had until now.
 *
 * `sweep` must be the buffer node makeLyapunovComputeTsl handed back, not a copy of its values.
 */
export function makeChaosMaskTsl(TSL, { sweep, count } = {}) {
    const { Fn, float, select, instanceIndex, instancedArray } = TSL;
    if (!sweep || typeof sweep.element !== "function") throw new Error("physicsTsl: makeChaosMaskTsl needs the sweep's own buffer node (the one makeLyapunovComputeTsl returned), so the second pass reads what the first wrote");
    const mask = instancedArray(count, "float");
    const node = Fn(() => {
        const v = sweep.element(instanceIndex);
        mask.element(instanceIndex).assign(select(v.greaterThan(0.0), float(1.0), float(0.0)));
    })().compute(count);
    return { node, mask, count };
}

/**
 * v4337 -- THE THIRD PASS, WHICH COUNTS. Every invocation that finds a positive exponent increments ONE counter, and
 * the increment is atomic. This is the shape render/gpuDriven.mjs's cull pass has -- an indirect draw's instanceCount
 * that every surviving instance bumps at once -- and it is the only kind of write where dropping the atomic still
 * compiles, still runs, and quietly returns a smaller number than the truth.
 *
 * `count` here is deliberately larger than one workgroup. At 64 there is no contention to lose: a plain add would
 * pass. The claim is only worth making across workgroups, so the gate runs it at 1024 (sixteen of them).
 */
export function makeChaosTallyTsl(TSL, { sweep, count } = {}) {
    const { Fn, If, uint, instanceIndex, instancedArray, atomicAdd } = TSL;
    for (const n of ["atomicAdd", "If", "uint"]) if (typeof TSL[n] !== "function") throw new Error(`physicsTsl: the TSL namespace has no ${n}()`);
    if (!sweep || typeof sweep.element !== "function") throw new Error("physicsTsl: makeChaosTallyTsl needs the sweep's own buffer node, so the tally counts what the sweep actually wrote");
    const tally = instancedArray(1, "uint").toAtomic();
    const node = Fn(() => {
        If(sweep.element(instanceIndex).greaterThan(0.0), () => { atomicAdd(tally.element(uint(0)), uint(1)); });
    })().compute(count);
    return { node, tally, count };
}

/**
 * v4338 -- THE SAME COUNT, REDUCED IN WORKGROUP MEMORY. Each lane writes its own 1 or 0 into an array the workgroup
 * shares, the workgroup waits at a barrier, and lane 0 adds the 64 slots and contributes ONE atomic increment for the
 * whole group. The answer is the same as makeChaosTallyTsl's; what changes is the traffic -- sixteen atomic
 * operations for 1024 elements instead of one per element that finds a positive.
 *
 * That is the shape a real reduction has, and the reason to transplant it is that three's builder emits BOTH halves:
 * a var<workgroup> declaration above the entry and a workgroupBarrier() in the body. The declaration lives in a
 * section render/tslSource.mjs used to drop on the floor, which would have left the body naming an array nothing
 * declared -- the device refuses that, loudly, which is how it was found.
 */
export function makeChaosReduceTsl(TSL, { sweep, count, workgroupSize = 64 } = {}) {
    const { Fn, If, Loop, uint, instanceIndex, instancedArray, workgroupArray, workgroupBarrier, atomicAdd, localId } = TSL;
    for (const n of ["workgroupArray", "workgroupBarrier", "atomicAdd"]) if (typeof TSL[n] !== "function") throw new Error(`physicsTsl: the TSL namespace has no ${n}()`);
    if (!sweep || typeof sweep.element !== "function") throw new Error("physicsTsl: makeChaosReduceTsl needs the sweep's own buffer node");
    const total = instancedArray(1, "uint").toAtomic();
    const lane = workgroupArray("uint", workgroupSize);
    const node = Fn(() => {
        const me = localId.x;
        lane.element(me).assign(uint(0));
        If(sweep.element(instanceIndex).greaterThan(0.0), () => { lane.element(me).assign(uint(1)); });
        workgroupBarrier();
        If(me.equal(uint(0)), () => {
            const sum = uint(0).toVar();
            Loop({ start: 0, end: workgroupSize }, ({ i }) => { sum.addAssign(lane.element(uint(i))); });
            atomicAdd(total.element(uint(0)), sum);
        });
    })().compute(count);
    return { node, total, count, workgroupSize };
}

/**
 * v4339 -- THE SIZER: one invocation that reads a count another pass produced and writes the three u32 an INDIRECT
 * DISPATCH reads -- workgroupsX, Y, Z. Nothing comes back to the CPU in between. This is the half of the GPU-driven
 * shape that gfx/device.js could not do until this round: it has always been able to fill an indirect DRAW, so the
 * GPU decided how many instances to draw, and the number of INVOCATIONS was still a JavaScript number.
 *
 * The tally buffer is declared atomic<u32> by the pass that fills it and a plain u32 here, which is legal and is the
 * point: a binding is a buffer, and the atomic is a property of how a shader touches it, not of the memory.
 */
export function makeDispatchSizerTsl(TSL, { tally, groupSize = 64 } = {}) {
    const { Fn, uint, instancedArray } = TSL;
    if (!tally || typeof tally.element !== "function") throw new Error("physicsTsl: makeDispatchSizerTsl needs the tally's own buffer node");
    const dims = instancedArray(3, "uint");
    const node = Fn(() => {
        const n = tally.element(uint(0));
        dims.element(uint(0)).assign(n.add(uint(groupSize - 1)).div(uint(groupSize)));   // ceil(n / groupSize), in integers
        dims.element(uint(1)).assign(uint(1));
        dims.element(uint(2)).assign(uint(1));
    })().compute(1);
    return { node, dims, groupSize };
}
/** A pass that leaves a 1 wherever an invocation ran, so a readback can COUNT how many the GPU actually launched. */
export function makeMarkTsl(TSL, { count } = {}) {
    const { Fn, uint, instanceIndex, instancedArray } = TSL;
    const marks = instancedArray(count, "uint");
    const node = Fn(() => { marks.element(instanceIndex).assign(uint(1)); })().compute(count);
    return { node, marks, count };
}
