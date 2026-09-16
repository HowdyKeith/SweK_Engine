// render/temporalRejectGPU.mjs -- the RUNNER for render/temporalRejectWgsl.mjs: DISOCCLUSION_WGSL and
// RECTIFY_WGSL, the last two of the temporal arc's kernels that fsr.html's pipeline would use.
//
// *** FIVE OF THE SEVENTEEN. *** tools/ship/kernelReach.mjs counted 17 dispatchable kernels reachable only from
// a gate; v4590 took two, v4592 a third, and these are the fourth and fifth. Same construction as
// render/temporalGPU.mjs, render/motionVectorsGPU.mjs and fx/fsr/fsrGPU.js: gfx/device.js, never raw WebGPU.
//
// ---- AND NO PAGE CALLS THIS YET, WHICH IS MEASURED RATHER THAN GLOSSED --------------------------------------
//
// fsr.html cannot use disocclusion today and the reason is not an oversight, it is the content. Its scene is a
// CONTINUOUS FUNCTION of (u, v) with no z at all -- every pixel sits on one plane -- so nothing is ever hidden
// behind anything and nothing can be revealed. MEASURED at the page's own size, its own pan, its own camera:
//
//     flat scene (what ships)   flagged 192 of 36864, noHistory 192  ->  genuine disocclusion 0
//     the same frame with a near slab over part of it, panning:     ->  genuine disocclusion 384
//
// 192 is exactly the offscreen column the motion vectors already reject. So wiring this to the page as it
// stands would add a pass whose output is provably the column the accumulate already had -- a feature that
// cannot fire, on a page that exists to show features firing. This session has spent four rounds on controls
// that cannot fail; shipping one deliberately would be worse than the ones it found. What a caller needs is
// OCCLUDING GEOMETRY and a prevDepth buffer, and that is a change to what the page is rather than to how it
// runs.
//
// *** AND THE zPrev CHANNEL IS WHY THE MOTION ROUND CAME FIRST. *** disocclusionCPU reads motion[i*4 + 3] --
// the depth that surface WOULD have had last frame -- which render/motionVectorsWgsl.mjs writes and the page
// threw away while its motion field was a hand-written constant. v4592 made that field derived; this is the
// consumer that channel exists for.
"use strict";
import { DISOCCLUSION_WGSL, RECTIFY_WGSL } from "./temporalRejectWgsl.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

/** The flag words RECTIFY_WGSL declares, as names, so a caller never passes a bare 7. */
export const RECTIFY_FLAGS = Object.freeze({ YCOCG: 1, CLAMP: 2, HAS_HIST: 4, HAS_FAC: 8 });

export class TemporalRejectGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/temporalRejectGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses disocclusionCPU/rectifiedAccumulateCPU by asking for them.");
        this.device = device;
        this.pDisoc = device.compute({ wgsl: DISOCCLUSION_WGSL });
        this.pRect = device.compute({ wgsl: RECTIFY_WGSL });
        for (const [n, p] of [["DISOCCLUSION", this.pDisoc], ["RECTIFY", this.pRect]])
            if (p && p.error) throw new Error(`render/temporalRejectGPU: the ${n} kernel did not compile -- ${p.error}`);
    }

    _f32(v) { return v instanceof Float32Array ? v : new Float32Array(v); }

    /**
     * Mirrors disocclusionCPU({ motion, prevDepth, w, h, threshold, nearerIsLess }) -- including the REFUSAL of
     * a missing threshold, which that function makes explicit because no default could be right for both depth
     * conventions. Returns { data, w, h } and NOT the CPU's { flagged, noHistory } tallies: the kernel counts
     * nothing, and v4591 settled what to do about that -- an uncounted quantity reported as zero is worse than
     * reported not at all. Count them from the mask if you want them; it is one pass over w*h floats.
     */
    async disocclusion({ motion, prevDepth, w, h, threshold, nearerIsLess = true }) {
        if (!(threshold > 0)) throw new Error("temporalRejectGPU.disocclusion: threshold must be a positive depth, in the buffer's own units");
        const dev = this.device;
        const bMot = dev.buffer({ data: this._f32(motion), usage: ["storage"] });
        const bPrev = dev.buffer({ data: this._f32(prevDepth), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(w * h), usage: ["storage"] });
        // struct P { w:u32, h:u32, threshold:f32, nearerIsLess:u32 }
        const ub = new ArrayBuffer(16), dv = new DataView(ub);
        dv.setUint32(0, w, true); dv.setUint32(4, h, true);
        dv.setFloat32(8, threshold, true); dv.setUint32(12, nearerIsLess ? 1 : 0, true);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pDisoc.bind("motion", bMot).bind("prevDepth", bPrev).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pDisoc, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bMot, bPrev, bDst, u]) b.destroy();
        return { data, w, h };
    }

    /**
     * Mirrors rectifiedAccumulateCPU({ current, history, motion, factor, w, h, alpha, space, clampToNeighbourhood }).
     *
     * `relax` is NOT here, and that is a refusal rather than a gap: RECTIFY_WGSL declares no relax binding, so a
     * runner accepting the argument would either ignore it silently or re-implement the lerp on the CPU beside a
     * kernel that does not do it. The CPU path keeps relax; ask for that one when you want it.
     */
    async rectify({ current, history, motion, factor = null, w, h, alpha, space = "ycocg", clampToNeighbourhood = true }) {
        const dev = this.device;
        const n = w * h * 4;
        const flags = (space === "ycocg" ? RECTIFY_FLAGS.YCOCG : 0)
                    | (clampToNeighbourhood ? RECTIFY_FLAGS.CLAMP : 0)
                    | (history ? RECTIFY_FLAGS.HAS_HIST : 0)
                    | (factor ? RECTIFY_FLAGS.HAS_FAC : 0);
        const bCur = dev.buffer({ data: this._f32(current), usage: ["storage"] });
        const bHist = dev.buffer({ data: history ? this._f32(history) : new Float32Array(n), usage: ["storage"] });
        const bMot = dev.buffer({ data: motion ? this._f32(motion) : new Float32Array(n), usage: ["storage"] });
        const bFac = dev.buffer({ data: factor ? this._f32(factor) : new Float32Array(w * h), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const ub = new ArrayBuffer(16), dv = new DataView(ub);
        dv.setUint32(0, w, true); dv.setUint32(4, h, true);
        dv.setFloat32(8, alpha, true); dv.setUint32(12, flags, true);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pRect.bind("cur", bCur).bind("hist", bHist).bind("motion", bMot).bind("factor", bFac).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pRect, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bCur, bHist, bMot, bFac, bDst, u]) b.destroy();
        return { data, w, h };
    }

    /**
     * *** THERE IS NO rejectAndAccumulate(), AND THAT IS A FINDING RATHER THAN AN OMISSION. ***
     *
     * Every other runner in this arc chains its two kernels on one encoder -- fsrGPU.fsr1, temporalGPU's
     * resolveAndAccumulate -- so the intermediate never crosses back to the CPU. THIS PAIR CANNOT BE CHAINED,
     * and the first draft of this file shipped a method that pretended otherwise: it dispatched both, bound an
     * all-zero `factor` buffer to the rectify pass, and carried a comment claiming it fed the mask straight in.
     * The comment and the code disagreed, and the code meant "discard all history, every pixel".
     *
     * The hole is structural. DISOCCLUSION_WGSL writes a MASK -- 1 where the history is wrong. RECTIFY_WGSL
     * reads a FACTOR -- 1 where the history is TRUSTED. They are opposites, and the thing that inverts one into
     * the other is historyFactorCPU, which also multiplies in the reactive and shading terms. There is no WGSL
     * for it anywhere in the tree: render/temporalRejectWgsl.mjs exports exactly DISOCCLUSION_WGSL,
     * RECTIFY_WGSL and the YCoCg fragment, and no other module has a factor kernel.
     *
     * So a device frame that wants both passes today costs a readback and an upload between them. Closing it
     * wants a third kernel -- one dispatch, w*h floats, combining up to three masks the way historyFactorCPU
     * does -- and that is its own rung, in the file that owns the rule rather than bolted on here.
     */
}
