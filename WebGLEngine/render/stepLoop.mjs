// WebGLEngine/render/stepLoop.mjs -- v4469
//
// *** THE STEP LOOP: ONE STATE, TWO BUFFERS, N DISPATCHES, ONE READBACK -- ON gfx/device.js, SO NO SAMPLER OR SOLVER
// HAND-ROLLS ITS PING-PONG AGAIN. *** brain/mlp.js flips two activation buffers per layer, brain/flowfield.js relaxes
// a distance field between bDistA and bDistB with a staging ring, render/GPUParticles.js swaps transform-feedback
// buffers, and the cloth loop alternates predict and finalize; each wrote its own buffer pair, its own bind groups in
// both directions and its own readback. This is that pattern once, gated, on the device:
//
//   const loop = makeStepLoop(device, { code, entryPoint, state: Float32Array, names: ["src", "dst"],
//                                       buffers: { r: { data }, knobs: { data, usage: "uniform" } }, workgroups });
//   loop.step(200);                    // 200 dispatches in ONE frame, the two buffers swapped between each
//   const x = await loop.read();       // the current state, through the device's readback
//
// The kernel reads `src` and writes `dst` (the names are the kernel's own); every other binding is bound once. A
// per-step uniform -- a seed, a step index, a schedule -- is the `perStep` option: { name, pack(k) }, and then each
// step is its own frame, because a buffer written N times before one submit shows the kernel its LAST value only
// (queue writes land before the commands they precede in program order, all of them). That is the one thing this
// helper knows that a first draft does not, and the gate plants it.
//
// On the null backend the loop records its buffers, the alternating binds and the dispatches, and read() returns
// the initial state; a headless gate counts what a page would do. On WebGL2 there is no compute: the constructor
// refuses by name and the caller runs its CPU twin, the CPU_TWIN contract gfx/device.js states.
"use strict";

export function makeStepLoop(device, { code, entryPoint = "main", state, names = ["src", "dst"], buffers = {}, workgroups = 1, perStep = null }) {
    if (!(device.backend === "webgpu" || device.backend === "null"))
        throw new Error("stepLoop: the " + device.backend + " backend has no compute; run the CPU twin instead");
    if (!state || !ArrayBuffer.isView(state)) throw new Error("stepLoop: `state` must be a typed array holding the initial state");
    if (!Array.isArray(names) || names.length !== 2) throw new Error("stepLoop: `names` must be [readName, writeName], the kernel's own binding names");
    const pipe = device.compute({ wgsl: code, entryPoint });
    const declared = (pipe.all || pipe.bindings || []).map((b) => b.name);
    for (const n of [...names, ...Object.keys(buffers)]) if (!declared.includes(n))
        throw new Error(`stepLoop: the kernel declares no binding named ${JSON.stringify(n)} -- it declares ${declared.join(", ") || "none"}`);
    const A = device.buffer({ data: state, usage: "storage" }), B = device.buffer({ data: state, usage: "storage" });
    const others = {};
    for (const [n, spec] of Object.entries(buffers)) {
        const usage = spec.usage || "storage";
        others[n] = device.buffer(spec.data != null ? { data: spec.data, usage } : { size: Math.max(4, spec.size || 4), usage });
        pipe.bind(n, others[n]);
    }
    let stepBuf = null;
    if (perStep) {
        if (!declared.includes(perStep.name)) throw new Error(`stepLoop: perStep names ${JSON.stringify(perStep.name)}, which the kernel does not declare`);
        stepBuf = device.buffer({ data: perStep.pack(0), usage: perStep.usage || "uniform" });
        pipe.bind(perStep.name, stepBuf);
    }
    let cur = A, other = B, steps = 0;
    const wg = Array.isArray(workgroups) ? workgroups : [workgroups];
    const one = (pass) => { pipe.bind(names[0], cur).bind(names[1], other); pass.dispatch(pipe, wg); const t = cur; cur = other; other = t; steps++; };
    return {
        path: device.backend === "webgpu" ? "compute" : "recorded",
        get steps() { return steps; },
        /** n steps. Without perStep, all n dispatches go into one frame; with it, one frame per step so each sees its own uniform. */
        step(n = 1) {
            if (!perStep) { device.frame(({ pass }) => { for (let k = 0; k < n; k++) one(pass); }); return; }
            for (let k = 0; k < n; k++) { stepBuf.write(perStep.pack(steps)); device.frame(({ pass }) => one(pass)); }
        },
        /** The current state -- the buffer the last step WROTE -- through the device's readback, as the state's own type. */
        async read() { const ab = await device.read(cur); return new state.constructor(ab, 0, state.length); },
        /** Which buffer holds the state, for a consumer that binds it to a draw: "A" or "B". */
        get holder() { return cur === A ? "A" : "B"; },
        buffer: () => cur,
        destroy() { for (const b of [A, B, stepBuf, ...Object.values(others)]) if (b) { try { b.destroy(); } catch (e) {} } },
    };
}
