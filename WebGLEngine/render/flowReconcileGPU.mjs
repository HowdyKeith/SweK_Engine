// render/flowReconcileGPU.mjs -- the RUNNER for render/flowReconcileWgsl.mjs's RECONCILE_WGSL.
//
// Same construction as render/dilateGPU.mjs, render/reactiveGPU.mjs, render/opticalFlowGPU.mjs and the rest of
// the arc: gfx/device.js, never raw WebGPU.
//
// *** THE COLOUR FLOW IS AN INPUT HERE AND IS NOT COMPUTED. *** render/opticalFlowGPU.mjs already mirrors the
// search, and a runner that chained the two would make a parity row unable to tell a RECONCILIATION defect
// from a SEARCH one -- the same reason v4674 built its pyramids on the CPU while mirroring the search. The
// subject of this file is the decision.
"use strict";
import { RECONCILE_WGSL, RECONCILE_STRIDE } from "./flowReconcileWgsl.mjs";

const WG = 8;
const groups = (bw, bh) => [Math.ceil(bw / WG), Math.ceil(bh / WG)];

/** RECONCILE_WGSL's atomics, in the order the kernel writes them. */
const STAT_ORDER = ["app", "flowBeat", "flowOnly"];

export class FlowReconcileGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/flowReconcileGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses reconcileFlowCPU by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: RECONCILE_WGSL, entry: "main" });
    }
    _f32(a) { return a instanceof Float32Array ? a : Float32Array.from(a); }

    /**
     * Mirrors reconcileFlowCPU. Same arguments, same returned shape -- so a parity row can compare the two
     * without either side reshaping the other's answer.
     */
    async reconcile({ cur, prev, w, h, flow, bw, bh, block, motion, depth, margin = 0.05, nearerIsLess = true }) {
        if (!(block >= 2) || block !== Math.floor(block))
            throw new Error(`flowReconcileGPU.reconcile: block must be a whole number of pixels, at least 2 -- got ${block}`);
        if (bw !== Math.ceil(w / block) || bh !== Math.ceil(h / block))
            throw new Error(`flowReconcileGPU.reconcile: the block grid does not cover the frame -- got ${bw}x${bh} for ${w}x${h} at block ${block}, expected ${Math.ceil(w / block)}x${Math.ceil(h / block)}`);
        if (!(margin >= 0) || !(margin < 1))
            throw new Error(`flowReconcileGPU.reconcile: margin must be in [0, 1) -- got ${margin}`);
        if (!depth || depth.length < w * h)
            throw new Error("flowReconcileGPU.reconcile: depth must be w*h -- the block's vector is its NEAREST pixel's, which needs depth");
        if (!motion || motion.length < w * h * 4)
            throw new Error("flowReconcileGPU.reconcile: motion must be w*h*4 -- (du, dv, valid, zPrev)");

        const dev = this.device, nb = bw * bh;
        const bCur = dev.buffer({ data: this._f32(cur), usage: ["storage"] });
        const bPrev = dev.buffer({ data: this._f32(prev), usage: ["storage"] });
        const bMot = dev.buffer({ data: this._f32(motion), usage: ["storage"] });
        const bDep = dev.buffer({ data: this._f32(depth), usage: ["storage"] });
        const bFlow = dev.buffer({ data: this._f32(flow), usage: ["storage"] });
        const bOut = dev.buffer({ data: new Float32Array(nb * RECONCILE_STRIDE), usage: ["storage"] });
        const bStats = dev.buffer({ data: new Uint32Array(STAT_ORDER.length), usage: ["storage"] });
        // struct P { w, h, bw, bh, block, nearerIsLess : u32; margin, nan : f32 }
        // *** THE NaN IS AN INPUT BECAUSE WGSL WILL NOT LET THE KERNEL SPELL ONE. *** See the note in
        // render/flowReconcileWgsl.mjs: a NaN constant is refused at compile time, so the value the CPU puts
        // in appFlow for an unanswerable block is handed to the kernel rather than manufactured inside it.
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 6).set([w, h, bw, bh, block, nearerIsLess ? 1 : 0]);
        new Float32Array(ub, 24, 2).set([margin, NaN]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });

        this.pipe.bind("cur", bCur).bind("prev", bPrev).bind("motion", bMot).bind("depth", bDep)
            .bind("flowIn", bFlow).bind("out", bOut).bind("u", u).bind("stats", bStats);
        dev.frame(({ pass }) => { pass.dispatch(this.pipe, groups(bw, bh)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });

        const packed = new Float32Array(await dev.read(bOut));
        const raw = new Uint32Array(await dev.read(bStats));
        for (const b of [bCur, bPrev, bMot, bDep, bFlow, bOut, bStats, u]) b.destroy();

        // *** UNPACKED INTO reconcileFlowCPU's EXACT SHAPE, INCLUDING source AS AN Int32Array. *** The kernel
        // carries source as an f32 because eight storage bindings is the limit; converting here rather than in
        // the gate means a parity row compares two Int32Arrays and cannot pass on a float that merely rounds
        // to the right code.
        const out = new Float32Array(nb * 2), appFlow = new Float32Array(nb * 2);
        const source = new Int32Array(nb);
        const sadApp = new Float32Array(nb), sadFlow = new Float32Array(nb), sadStill = new Float32Array(nb);
        for (let i = 0; i < nb; i++) {
            const o = i * RECONCILE_STRIDE;
            out[i * 2] = packed[o]; out[i * 2 + 1] = packed[o + 1];
            appFlow[i * 2] = packed[o + 2]; appFlow[i * 2 + 1] = packed[o + 3];
            sadApp[i] = packed[o + 4]; sadFlow[i] = packed[o + 5]; sadStill[i] = packed[o + 6];
            source[i] = packed[o + 7];
        }
        const counts = {}; STAT_ORDER.forEach((k, i) => { counts[k] = raw[i]; });
        return { flow: out, appFlow, source, sadApp, sadFlow, sadStill, counts, bw, bh, block };
    }
}
