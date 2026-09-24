// render/frameInterpGPU.mjs -- the RUNNER for render/frameInterpWgsl.mjs's INTERP_WGSL.
//
// *** THREE SEQUENTIAL DISPATCHES, AND THE ORDER IS THE ALGORITHM. *** splatDepth settles which depth wins each
// pixel; splatOwner settles which BLOCK at that depth claims it; gather warps. They cannot be merged and they
// cannot be reordered: splatOwner reads the key splatDepth is still writing if the two share a pass, which is
// the race the whole construction exists to remove. Same reason render/opticalFlowGPU.mjs dispatches once per
// pyramid level rather than once.
//
// The atomic buffers are CLEARED to their sentinels before the first dispatch -- 0xffffffff for both, which is
// the largest u32 and therefore loses every atomicMin, and is also NO_OWNER. A buffer left dirty from a previous
// frame would hand this frame the last one's owners, which looks like content.
"use strict";
import { INTERP_WGSL, INTERP_STRIDE, NO_OWNER } from "./frameInterpWgsl.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

export class FrameInterpGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/frameInterpGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses interpolateFrameCPU by asking for it.");
        this.device = device;
        // *** THE OPTION IS `entryPoint`, AND `entry` IS SILENTLY IGNORED. *** gfx/device.js reads
        // `d.entryPoint || "main"`, so a runner that passes `entry` gets a pipeline for a function called
        // main -- which this module does not have, and the failure surfaces only as "Invalid ComputePipeline"
        // from the first dispatch. render/flowReconcileGPU.mjs happens to be unharmed because its entry really
        // is main; this one has three and none of them is.
        this.pipeDepth = device.compute({ wgsl: INTERP_WGSL, entryPoint: "splatDepth" });
        this.pipeOwner = device.compute({ wgsl: INTERP_WGSL, entryPoint: "splatOwner" });
        this.pipeGather = device.compute({ wgsl: INTERP_WGSL, entryPoint: "gather" });
    }
    _f32(a) { return a instanceof Float32Array ? a : Float32Array.from(a); }

    /** Mirrors interpolateFrameCPU, minus `fill` -- render/holeFill.mjs is a separate pass and a later round. */
    async interpolate({ prev, cur, w, h, flow, bw, bh, block, depthBlock, indexedBy, nearerIsLess = true, t = 0.5 }) {
        if (!(block >= 1) || block !== Math.floor(block))
            throw new Error(`frameInterpGPU.interpolate: block must be a whole number of pixels, at least 1 -- got ${block}`);
        if (bw !== Math.ceil(w / block) || bh !== Math.ceil(h / block))
            throw new Error(`frameInterpGPU.interpolate: the block grid does not cover the frame -- got ${bw}x${bh} for ${w}x${h} at block ${block}, expected ${Math.ceil(w / block)}x${Math.ceil(h / block)}`);
        if (!depthBlock || depthBlock.length < bw * bh)
            throw new Error("frameInterpGPU.interpolate: depthBlock must be bw*bh -- two blocks landing on one pixel is one surface passing in front of another, and last-writer-wins makes the answer depend on the scheduler");
        if (!(t >= 0) || !(t <= 1))
            throw new Error(`frameInterpGPU.interpolate: t must be in [0, 1] -- got ${t}`);
        if (indexedBy !== "prev" && indexedBy !== "cur")
            throw new Error(`frameInterpGPU.interpolate: indexedBy must be "prev" or "cur" -- got ${JSON.stringify(indexedBy)}. ` +
                'render/opticalFlow.mjs and render/flowReconcile.mjs both return "cur"; there is no default, for the reason v4680 measured.');

        const dev = this.device, n = w * h;
        const sentinel = new Uint32Array(n).fill(NO_OWNER);
        const bPrev = dev.buffer({ data: this._f32(prev), usage: ["storage"] });
        const bCur = dev.buffer({ data: this._f32(cur), usage: ["storage"] });
        const bFlow = dev.buffer({ data: this._f32(flow), usage: ["storage"] });
        const bDepth = dev.buffer({ data: this._f32(depthBlock), usage: ["storage"] });
        const bKey = dev.buffer({ data: sentinel, usage: ["storage"] });
        const bOwner = dev.buffer({ data: Uint32Array.from(sentinel), usage: ["storage"] });
        const bFrame = dev.buffer({ data: new Float32Array(n * 4), usage: ["storage"] });
        const bPacked = dev.buffer({ data: new Float32Array(n * INTERP_STRIDE), usage: ["storage"] });
        // struct P { w,h,bw,bh,block,nearerIsLess,indexedByPrev,pad : u32; t,nan,holeZ,pad3 : f32 }
        // holeZ is the sentinel interpolateFrameCPU fills zbuf with and never overwrites in a hole, so the two
        // engines' buffers are identical everywhere and not merely where a consumer reads them.
        const ub = new ArrayBuffer(48);
        new Uint32Array(ub, 0, 8).set([w, h, bw, bh, block, nearerIsLess ? 1 : 0, indexedBy === "prev" ? 1 : 0, 0]);
        new Float32Array(ub, 32, 4).set([t, NaN, nearerIsLess ? Infinity : -Infinity, 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });

        // *** EACH PIPELINE BINDS ONLY WHAT ITS OWN ENTRY POINT USES. *** gfx/device.js classifies bindings per
        // entry point and refuses a name the entry does not declare, so binding all nine to all three throws --
        // and that is the right behaviour: splatDepth has no business holding the colour buffers.
        this.pipeDepth.bind("flow", bFlow).bind("depthBlock", bDepth).bind("key", bKey).bind("u", u);
        this.pipeOwner.bind("flow", bFlow).bind("depthBlock", bDepth).bind("key", bKey).bind("owner", bOwner).bind("u", u);
        this.pipeGather.bind("prevF", bPrev).bind("curF", bCur).bind("flow", bFlow).bind("depthBlock", bDepth)
            .bind("owner", bOwner).bind("frameOut", bFrame).bind("packed", bPacked).bind("u", u);
        // *** ONE frame() PER DISPATCH, BECAUSE THE THREE MUST NOT OVERLAP. *** gfx/device.js orders passes
        // within a frame, but the guarantee this algorithm needs is that splatDepth has FINISHED before
        // splatOwner reads the key it wrote -- and that is a submission boundary, not a pass boundary.
        dev.frame(({ pass }) => { pass.dispatch(this.pipeDepth, groups(bw, bh)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        dev.frame(({ pass }) => { pass.dispatch(this.pipeOwner, groups(bw, bh)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        dev.frame(({ pass }) => { pass.dispatch(this.pipeGather, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });

        const frame = new Float32Array(await dev.read(bFrame));
        const packed = new Float32Array(await dev.read(bPacked));
        for (const b of [bPrev, bCur, bFlow, bDepth, bKey, bOwner, bFrame, bPacked, u]) b.destroy();

        // unpacked into interpolateFrameCPU's exact shape
        const vec = new Float32Array(n * 2), zbuf = new Float32Array(n), hole = new Uint8Array(n);
        let holes = 0;
        for (let i = 0; i < n; i++) {
            const o = i * INTERP_STRIDE;
            vec[i * 2] = packed[o]; vec[i * 2 + 1] = packed[o + 1];
            zbuf[i] = packed[o + 2];
            hole[i] = packed[o + 3] ? 1 : 0;
            if (hole[i]) holes++;
        }
        return { frame, hole, holes, vec, zbuf, side: null, filled: 0, abstained: 0, w, h };
    }
}
