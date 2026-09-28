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

/**
 * REACTIVE_WGSL/mainCounted's atomics, in the order the kernel writes them. `noHistory` is NOT here and must
 * not be: reactiveCPU derives it as the sum of the three declines, and a counter read from the device beside
 * them could disagree with its own parts. Derived on both mirrors or it is not the same number.
 */
const REACTIVE_STAT_ORDER = ["flagged", "declinedInvalid", "declinedOffscreen", "declinedDepth"];

const STATS_REASON =
    "counting was not asked for: pass counted: true to dispatch mainCounted, which records flagged and the " +
    "three declines into an atomic buffer. Null rather than zeroes, because a frame where the mask examined " +
    "every pixel and found nothing and a frame nobody counted must not read the same -- and here they would, " +
    "since every decline writes the SAME 0.0 to the mask that a contented pixel writes.";

export class ReactiveGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/reactiveGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses reactiveCPU by asking for it.");
        this.device = device;
        // TWO pipelines over ONE text, as temporalRejectGPU builds them: the auto layout is per entry point, so
        // the counted one carries the atomic binding and the plain one does not. Built once here rather than
        // per frame, because a pipeline per frame is a compile per frame.
        this.pipe = device.compute({ wgsl: REACTIVE_WGSL });
        this.pipeCounted = device.compute({ wgsl: REACTIVE_WGSL, entryPoint: "mainCounted" });
        for (const [name, pipe] of [["main", this.pipe], ["mainCounted", this.pipeCounted]])
            if (pipe && pipe.error) throw new Error(`render/reactiveGPU: the REACTIVE kernel's ${name} did not compile -- ${pipe.error}`);
    }

    _statsBuf() { return this.device.buffer({ data: new Uint32Array(REACTIVE_STAT_ORDER.length), usage: ["storage"] }); }

    async _readStats(buf) {
        const raw = new Uint32Array(await this.device.read(buf));
        const out = {};
        REACTIVE_STAT_ORDER.forEach((k, i) => { out[k] = raw[i]; });
        out.noHistory = out.declinedInvalid + out.declinedOffscreen + out.declinedDepth;
        return out;
    }

    _f32(v) { return v instanceof Float32Array ? v : new Float32Array(v); }

    /**
     * Mirrors reactiveCPU({ current, history, motion, prevDepth, w, h, threshold, scale, nearerIsLess, strength }).
     *
     * `history` may be null on the first frame and the kernel is TOLD so through a flag rather than being
     * handed zeroes and left to infer it: a zeroed history is a real colour, and every pixel would read as
     * maximally reactive against it. The buffer is still bound, because a compute pipeline's bind group is
     * complete or it is nothing -- temporalRejectGPU.factor's rule.
     *
     * Returns { data, w, h, stats, statsReason }. `stats` is null unless you pass counted: true, and it
     * carries reactiveCPU's own five figures: flagged, noHistory, and the three declines noHistory is the
     * sum of. THE MASK CANNOT SUBSTITUTE FOR THEM. A pixel with invalid motion, a pixel that reprojected off
     * the frame, a pixel the depth gate turned away and a pixel examined and found in perfect agreement all
     * write the same 0.0, so a pass over `data` cannot recover one of these numbers -- not even how many
     * pixels were looked at.
     */
    async reactive({ current, history, motion, prevDepth, w, h, threshold, scale = 1,
                     nearerIsLess = true, strength = 1, counted = false }) {
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
        const bStats = counted ? this._statsBuf() : null;
        const pipe = counted ? this.pipeCounted : this.pipe;
        pipe.bind("cur", bCur).bind("hist", bHist).bind("motion", bMot)
            .bind("prevDepth", bPrev).bind("dst", bDst).bind("u", u);
        if (counted) pipe.bind("stats", bStats);
        dev.frame(({ pass }) => { pass.dispatch(pipe, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        const stats = counted ? await this._readStats(bStats) : null;
        for (const b of [bCur, bHist, bMot, bPrev, bDst, u]) b.destroy();
        if (bStats) bStats.destroy();
        return { data, w, h, stats, statsReason: counted ? null : STATS_REASON };
    }
}
