// render/reactiveGPU.mjs -- the RUNNER for render/reactiveWgsl.mjs's REACTIVE_WGSL.
//
// Same construction as render/temporalRejectGPU.mjs, render/temporalLockGPU.mjs, render/objectMotionGPU.mjs
// and the rest of the arc: gfx/device.js, never raw WebGPU.
//
// *** AND IT ARRIVES WITH A PRODUCTION CALLER, BECAUSE tools/ship/runnerCallers-selfcheck.mjs WOULD OTHERWISE
// GO RED ON THIS ROUND. *** That census (v4654) counts compute runners nothing outside a gate imports, and
// its ratchet is frozen at two. Adding a seventh arc runner with only a selfcheck to construct it would take
// it to three on the round that added it -- which is exactly the debt v4654 exists to make visible, and it is
// this session's own instrument catching this session's own habit. fsr.html calls it.
"use strict";
import { REACTIVE_WGSL } from "./reactiveWgsl.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

export class ReactiveGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/reactiveGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses reactiveCPU by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: REACTIVE_WGSL });
        if (this.pipe && this.pipe.error) throw new Error(`render/reactiveGPU: the REACTIVE kernel did not compile -- ${this.pipe.error}`);
    }

    _f32(v) { return v instanceof Float32Array ? v : new Float32Array(v); }

    /**
     * Mirrors reactiveCPU({ current, history, motion, prevDepth, w, h, threshold, scale, nearerIsLess, strength }).
     *
     * `history` may be null on the first frame and the kernel is TOLD so through a flag rather than being
     * handed zeroes and left to infer it: a zeroed history is a real colour, and every pixel would read as
     * maximally reactive against it. The buffer is still bound, because a compute pipeline's bind group is
     * complete or it is nothing -- temporalRejectGPU.factor's rule.
     */
    async reactive({ current, history, motion, prevDepth, w, h, threshold, scale = 1,
                     nearerIsLess = true, strength = 1 }) {
        if (!(threshold > 0)) throw new Error("reactiveGPU.reactive: threshold must be a positive depth, in the buffer's own units");
        if (!(scale > 0)) throw new Error(`reactiveGPU.reactive: scale must be positive -- got ${scale}`);
        const dev = this.device, n = w * h;
        const bCur = dev.buffer({ data: this._f32(current), usage: ["storage"] });
        const bHist = dev.buffer({ data: history ? this._f32(history) : new Float32Array(n * 4), usage: ["storage"] });
        const bMot = dev.buffer({ data: this._f32(motion), usage: ["storage"] });
        const bPrev = dev.buffer({ data: this._f32(prevDepth), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        // struct P { w, h, hasHistory, nearerIsLess : u32, threshold, scale, strength, p3 : f32 }
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 4).set([w, h, history ? 1 : 0, nearerIsLess ? 1 : 0]);
        new Float32Array(ub, 16, 4).set([threshold, scale, strength, 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pipe.bind("cur", bCur).bind("hist", bHist).bind("motion", bMot)
                 .bind("prevDepth", bPrev).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pipe, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bCur, bHist, bMot, bPrev, bDst, u]) b.destroy();
        return { data, w, h };
    }
}
