// render/temporalRejectGPU.mjs -- the RUNNER for render/temporalRejectWgsl.mjs: DISOCCLUSION_WGSL and
// RECTIFY_WGSL, the last two of the temporal arc's kernels that fsr.html's pipeline would use.
//
// *** FIVE OF THE SEVENTEEN. *** tools/ship/kernelReach.mjs counted 17 dispatchable kernels reachable only from
// a gate; v4590 took two, v4592 a third, and these are the fourth and fifth. Same construction as
// render/temporalGPU.mjs, render/motionVectorsGPU.mjs and fx/fsr/fsrGPU.js: gfx/device.js, never raw WebGPU.
//
// ---- AND NO PAGE CALLS THIS YET, WHICH IS MEASURED RATHER THAN GLOSSED --------------------------------------
//
// fsr.html cannot use disocclusion today, and v4595 CORRECTED WHY. v4593 wrote here that the reason was the
// CONTENT -- a scene with no z -- and offered "the same frame with a near slab: 384 genuine disocclusion" as the
// control proving the detector fires. *** THAT 384 WAS THE FIXTURE'S PREV-DEPTH SHIFTED THE WRONG WAY. *** The
// motion is du = +PAN/D, so last frame every feature sat at HIGHER x; the fixture put the slab at LOWER x, which
// is a camera panning the other way, and the reprojection landed across the slab's edge and reported a
// disocclusion that never happened. Measured all three ways: wrong way 384, right way 0, not moving at all 192.
//
// *** THE REAL REASON IS THE CAMERA, NOT THE CONTENT, AND IT IS A STRONGER STATEMENT: AN ORTHOGRAPHIC
// PROJECTION HAS NO PARALLAX. *** Every pixel moves the same screen distance whatever its depth, so the depth at
// the reprojected position always matches and nothing is ever revealed -- occluding geometry or not. Measured at
// the page's own size, pan and camera, with a slab placed consistently:
//
//     flat scene (what ships)          flagged 192, all of it the offscreen column  ->  genuine 0
//     the same frame WITH a near slab  flagged 192, all of it the offscreen column  ->  genuine 0
//     a PERSPECTIVE camera, same slab, band projected from world space               ->  genuine 192
//
// So adding occluding geometry to the page would change nothing; adding a PERSPECTIVE CAMERA is what it would
// take, and that is a change to what the page is rather than to how it runs. The corrected measurement and the
// spurious one are both rows in this file's gate, because a number that shipped into a gate, a header and a
// closing deserves an erratum somebody can re-run.
//
// *** AND THE HOLE BETWEEN THE TWO KERNELS IS CLOSED AS OF v4594. *** This file shipped at v4593 deliberately
// without a rejectAndAccumulate(), because DISOCCLUSION writes a mask and RECTIFY reads a factor and nothing in
// the tree inverted one into the other on a device. FACTOR_WGSL does, and the chain is three dispatches on one
// encoder with neither intermediate crossing back. What the chain does NOT have is a reactive mask: nothing in
// this tree produces one, so the argument is accepted and unused by any caller here.
//
// *** AND THE zPrev CHANNEL IS WHY THE MOTION ROUND CAME FIRST. *** disocclusionCPU reads motion[i*4 + 3] --
// the depth that surface WOULD have had last frame -- which render/motionVectorsWgsl.mjs writes and the page
// threw away while its motion field was a hand-written constant. v4592 made that field derived; this is the
// consumer that channel exists for.
"use strict";
import { DISOCCLUSION_WGSL, RECTIFY_WGSL, FACTOR_WGSL } from "./temporalRejectWgsl.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

/** The flag words RECTIFY_WGSL declares, as names, so a caller never passes a bare 7. */
export const RECTIFY_FLAGS = Object.freeze({ YCOCG: 1, CLAMP: 2, HAS_HIST: 4, HAS_FAC: 8 });
/** The flag words FACTOR_WGSL declares. */
export const FACTOR_FLAGS = Object.freeze({ HAS_DISOCC: 1, HAS_REACTIVE: 2, HAS_SHADING: 4 });

export class TemporalRejectGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/temporalRejectGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses disocclusionCPU/rectifiedAccumulateCPU by asking for them.");
        this.device = device;
        this.pDisoc = device.compute({ wgsl: DISOCCLUSION_WGSL });
        this.pRect = device.compute({ wgsl: RECTIFY_WGSL });
        this.pFactor = device.compute({ wgsl: FACTOR_WGSL });
        for (const [n, p] of [["DISOCCLUSION", this.pDisoc], ["RECTIFY", this.pRect], ["FACTOR", this.pFactor]])
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
     * Mirrors historyFactorCPU({ disocclusion, reactive, shading, n }) -- 1 where the history is trusted.
     *
     * The three MULTIPLY, which is a decision and not arithmetic: each is an independent probability that the
     * history is wrong, so two weak reasons compound. All three buffers are bound whether or not they are real,
     * because a compute pipeline's bind group is complete or it is nothing; `flags` says which to read.
     */
    async factor({ disocclusion = null, reactive = null, shading = null, n }) {
        const dev = this.device;
        const zeros = () => dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bD = disocclusion ? dev.buffer({ data: this._f32(disocclusion), usage: ["storage"] }) : zeros();
        const bR = reactive ? dev.buffer({ data: this._f32(reactive), usage: ["storage"] }) : zeros();
        const bS = shading ? dev.buffer({ data: this._f32(shading), usage: ["storage"] }) : zeros();
        const bDst = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const u = dev.buffer({ data: this._uFactor(n, disocclusion, reactive, shading), usage: "uniform" });
        this.pFactor.bind("disocclusion", bD).bind("reactive", bR).bind("shading", bS).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pFactor, [Math.ceil(n / 64)]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bD, bR, bS, bDst, u]) b.destroy();
        return { data, n };
    }

    /** struct P { n:u32, flags:u32, pad0:u32, pad1:u32 } */
    _uFactor(n, disocclusion, reactive, shading) {
        const flags = (disocclusion ? FACTOR_FLAGS.HAS_DISOCC : 0)
                    | (reactive ? FACTOR_FLAGS.HAS_REACTIVE : 0)
                    | (shading ? FACTOR_FLAGS.HAS_SHADING : 0);
        const ub = new ArrayBuffer(16), d = new DataView(ub);
        d.setUint32(0, n, true); d.setUint32(4, flags, true); d.setUint32(8, 0, true); d.setUint32(12, 0, true);
        return new Uint8Array(ub);
    }

    /**
     * *** THE CHAIN v4593 COULD NOT BUILD: disocclusion -> factor -> rectify, ON ONE ENCODER. ***
     *
     * v4593 shipped this runner deliberately WITHOUT a rejectAndAccumulate(), because DISOCCLUSION writes a mask
     * (1 = history wrong) and RECTIFY reads a factor (1 = history trusted) and the inversion between them --
     * historyFactorCPU -- had no WGSL. Its own first draft HAD such a method: it dispatched both kernels, bound
     * an all-zero factor, and carried a comment claiming it fed the mask straight in. Code and comment
     * disagreed, and the code meant "discard all history, every pixel". FACTOR_WGSL is the missing third
     * dispatch, and this is the method that was refused until it existed.
     *
     * Neither intermediate crosses to the CPU: the mask feeds the factor pass and the factor feeds the rectify,
     * all on the frame's single encoder. `reactive` and `shading` are accepted here because the factor kernel
     * takes them; nothing in this tree produces a reactive mask yet, and saying so is cheaper than pretending
     * the argument does not exist.
     */
    async rejectAndAccumulate({ current, history, motion, prevDepth, w, h, alpha, threshold,
                                reactive = null, shading = null,
                                nearerIsLess = true, space = "ycocg", clampToNeighbourhood = true }) {
        if (!(threshold > 0)) throw new Error("temporalRejectGPU.rejectAndAccumulate: threshold must be a positive depth, in the buffer's own units");
        const dev = this.device;
        const n = w * h, n4 = n * 4;
        const bMot = dev.buffer({ data: this._f32(motion), usage: ["storage"] });
        const bPrev = dev.buffer({ data: this._f32(prevDepth), usage: ["storage"] });
        const bMask = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bReact = reactive ? dev.buffer({ data: this._f32(reactive), usage: ["storage"] })
                                : dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bShade = shading ? dev.buffer({ data: this._f32(shading), usage: ["storage"] })
                               : dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bFac = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bCur = dev.buffer({ data: this._f32(current), usage: ["storage"] });
        const bHist = dev.buffer({ data: history ? this._f32(history) : new Float32Array(n4), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(n4), usage: ["storage"] });

        const ud = new ArrayBuffer(16), dd = new DataView(ud);
        dd.setUint32(0, w, true); dd.setUint32(4, h, true);
        dd.setFloat32(8, threshold, true); dd.setUint32(12, nearerIsLess ? 1 : 0, true);
        const uDisoc = dev.buffer({ data: new Uint8Array(ud), usage: "uniform" });
        // the mask is ALWAYS a real input to the factor pass here, which is the whole point of the chain
        const uFac = dev.buffer({ data: this._uFactor(n, bMask, reactive, shading), usage: "uniform" });
        const flags = (space === "ycocg" ? RECTIFY_FLAGS.YCOCG : 0)
                    | (clampToNeighbourhood ? RECTIFY_FLAGS.CLAMP : 0)
                    | (history ? RECTIFY_FLAGS.HAS_HIST : 0) | RECTIFY_FLAGS.HAS_FAC;
        const ur = new ArrayBuffer(16), dr = new DataView(ur);
        dr.setUint32(0, w, true); dr.setUint32(4, h, true);
        dr.setFloat32(8, alpha, true); dr.setUint32(12, flags, true);
        const uRect = dev.buffer({ data: new Uint8Array(ur), usage: "uniform" });

        this.pDisoc.bind("motion", bMot).bind("prevDepth", bPrev).bind("dst", bMask).bind("u", uDisoc);
        this.pFactor.bind("disocclusion", bMask).bind("reactive", bReact).bind("shading", bShade).bind("dst", bFac).bind("u", uFac);
        this.pRect.bind("cur", bCur).bind("hist", bHist).bind("motion", bMot).bind("factor", bFac).bind("dst", bDst).bind("u", uRect);
        const g = groups(w, h);
        dev.frame(({ pass }) => {
            pass.dispatch(this.pDisoc, g);
            pass.dispatch(this.pFactor, [Math.ceil(n / 64)]);
            pass.dispatch(this.pRect, g);
            pass.clear([0, 0, 0, 1]);
        }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        const mask = new Float32Array(await dev.read(bMask));
        const factor = new Float32Array(await dev.read(bFac));
        for (const b of [bMot, bPrev, bMask, bReact, bShade, bFac, bCur, bHist, bDst, uDisoc, uFac, uRect]) b.destroy();
        return { data, mask, factor, w, h };
    }
}
