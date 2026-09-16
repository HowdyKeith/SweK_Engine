// render/temporalGPU.mjs -- the RUNNER for render/temporalResolveWgsl.mjs and render/temporalAccumulateWgsl.mjs.
//
// *** TWO OF THE SEVENTEEN. *** tools/ship/kernelReach.mjs (v4589) measured that 17 dispatchable kernels in this
// tree can be reached only from a gate, and that TEN of them are the temporal arc -- nineteen rounds of kernels,
// v4552 to v4570, every one validated on a real device by its own gate and runnable by nothing in the engine.
// This file is the caller for RESOLVE_WGSL and ACCUMULATE_WGSL, which are the two fsr.html runs on the CPU every
// frame. It follows fx/fsr/fsrGPU.js (v4588) exactly: gfx/device.js, not a second raw-WebGPU dispatcher.
//
// *** AND THE PORT LOSES THE DIAGNOSTIC THAT CAUGHT A REAL BUG, WHICH IS SAID HERE RATHER THAN DISCOVERED. ***
//
// temporalAccumulateCPU returns stats -- { reused, rejectedOffscreen, rejectedInvalid, clamped }. ACCUMULATE_WGSL
// counts nothing: it has four storage bindings and a uniform, no atomics, and every rejection is an early
// `return` that leaves no trace. That is not a detail. fsr.html's own copy says of those counters: "They are the
// diagnostic, not decoration... This page shipped once with that sign inverted, scoring 11.5 dB while panning,
// and the counter said so before the picture did." rejectedOffscreen being exactly one column of 192 pixels is
// what proved the motion vectors had the right sign at v4586.
//
// So accumulate() returns `stats: null` and a `statsReason`, and the page says COUNTERS: CPU ONLY when it is on
// the adapter. The alternative -- returning zeroes, or omitting the field -- would let a reader take "reused 0,
// clamped 0" for a measurement of a frame that reused nothing. AN UNCOUNTED QUANTITY REPORTED AS ZERO IS THE
// FAILURE THE COUNTERS EXIST TO CATCH, WEARING THE COUNTERS' OWN CLOTHES. Closing it wants an atomic counter
// buffer in the kernel, which is a change to a gated kernel and its own rung.
"use strict";
import { RESOLVE_WGSL } from "./temporalResolveWgsl.mjs";
import { ACCUMULATE_WGSL } from "./temporalAccumulateWgsl.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

// the flag words the two kernels declare, kept as names so a caller never passes a bare 3
export const RESOLVE_FLAGS = Object.freeze({ JITTER_AWARE: 1, DERING: 2 });
export const ACCUMULATE_FLAGS = Object.freeze({ HAS_HISTORY: 1, CLAMP: 2 });

export const STATS_REASON =
    "ACCUMULATE_WGSL counts nothing -- it has no atomic counter buffer, and every rejection is an early return. " +
    "The CPU path's reused/rejectedOffscreen/rejectedInvalid/clamped are not available on the device, and " +
    "reporting them as zero would be worse than reporting nothing.";

export class TemporalGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/temporalGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses resolveJitterAwareCPU/temporalAccumulateCPU by asking for them.");
        this.device = device;
        this.pResolve = device.compute({ wgsl: RESOLVE_WGSL });
        this.pAccum = device.compute({ wgsl: ACCUMULATE_WGSL });
        for (const [n, p] of [["RESOLVE", this.pResolve], ["ACCUMULATE", this.pAccum]])
            if (p && p.error) throw new Error(`render/temporalGPU: the ${n} kernel did not compile -- ${p.error}`);
    }

    // P { rw,rh,dw,dh:u32, jx,jy:f32, flags:u32, pad:u32 } -- 32 bytes, mixed, laid out by hand
    _uResolve(rw, rh, dw, dh, jx, jy, flags) {
        const b = new ArrayBuffer(32), d = new DataView(b);
        d.setUint32(0, rw, true); d.setUint32(4, rh, true); d.setUint32(8, dw, true); d.setUint32(12, dh, true);
        d.setFloat32(16, jx, true); d.setFloat32(20, jy, true); d.setUint32(24, flags, true); d.setUint32(28, 0, true);
        return this.device.buffer({ data: new Uint8Array(b), usage: "uniform" });
    }
    // P { w,h,flags:u32, alpha:f32 } -- 16 bytes
    _uAccum(w, h, flags, alpha) {
        const b = new ArrayBuffer(16), d = new DataView(b);
        d.setUint32(0, w, true); d.setUint32(4, h, true); d.setUint32(8, flags, true); d.setFloat32(12, alpha, true);
        return this.device.buffer({ data: new Uint8Array(b), usage: "uniform" });
    }
    _f32(v) { return v instanceof Float32Array ? v : new Float32Array(v); }

    /**
     * Signature mirrors resolveJitterAwareCPU({ src, rw, rh, dw, dh, jitter, jitterAware, dering }) exactly,
     * down to the two defaults -- v4588's lesson, where a GPU path took an options object the CPU did not and
     * defaulted a flag the other way, and answered a different question for the same call.
     * Returns { data, confidence, w, h }, which is the CPU's shape.
     */
    async resolve({ src, rw, rh, dw, dh, jitter, jitterAware = true, dering = true }) {
        const dev = this.device;
        const flags = (jitterAware ? RESOLVE_FLAGS.JITTER_AWARE : 0) | (dering ? RESOLVE_FLAGS.DERING : 0);
        const bSrc = dev.buffer({ data: this._f32(src), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(dw * dh * 4), usage: ["storage"] });
        const bConf = dev.buffer({ data: new Float32Array(dw * dh), usage: ["storage"] });
        const u = this._uResolve(rw, rh, dw, dh, jitter[0], jitter[1], flags);
        this.pResolve.bind("src", bSrc).bind("dst", bDst).bind("conf", bConf).bind("u", u);
        const g = groups(dw, dh);
        dev.frame(({ pass }) => { pass.dispatch(this.pResolve, g); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        const confidence = new Float32Array(await dev.read(bConf));
        for (const b of [bSrc, bDst, bConf, u]) b.destroy();
        return { data, confidence, w: dw, h: dh };
    }

    /**
     * Mirrors temporalAccumulateCPU({ current, history, motion, w, h, alpha, clampToNeighbourhood }).
     * `stats` is ALWAYS null here and `statsReason` says why -- see this file's header.
     */
    async accumulate({ current, history, motion, w, h, alpha, clampToNeighbourhood = true }) {
        const dev = this.device;
        const flags = (history ? ACCUMULATE_FLAGS.HAS_HISTORY : 0) | (clampToNeighbourhood ? ACCUMULATE_FLAGS.CLAMP : 0);
        const n = w * h * 4;
        const bCur = dev.buffer({ data: this._f32(current), usage: ["storage"] });
        // history and motion are still BOUND when absent: a compute pipeline's bind group is complete or it is
        // nothing, and the kernel reads neither once FLAG_HAS_HISTORY is clear.
        const bHist = dev.buffer({ data: history ? this._f32(history) : new Float32Array(n), usage: ["storage"] });
        const bMot = dev.buffer({ data: motion ? this._f32(motion) : new Float32Array(n), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const u = this._uAccum(w, h, flags, alpha);
        this.pAccum.bind("current", bCur).bind("history", bHist).bind("motion", bMot).bind("dst", bDst).bind("u", u);
        const g = groups(w, h);
        dev.frame(({ pass }) => { pass.dispatch(this.pAccum, g); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bCur, bHist, bMot, bDst, u]) b.destroy();
        return { data, w, h, stats: null, statsReason: STATS_REASON };
    }

    /**
     * Resolve then accumulate ON ONE ENCODER: the display-resolution resolve output never crosses back to the
     * CPU, which is the difference between a port and two calls. Same construction as fx/fsr/fsrGPU.js's fsr1().
     */
    async resolveAndAccumulate({ src, rw, rh, dw, dh, jitter, jitterAware = true, dering = true,
                                 history, motion, alpha, clampToNeighbourhood = true }) {
        const dev = this.device;
        const n = dw * dh * 4;
        const rFlags = (jitterAware ? RESOLVE_FLAGS.JITTER_AWARE : 0) | (dering ? RESOLVE_FLAGS.DERING : 0);
        const aFlags = (history ? ACCUMULATE_FLAGS.HAS_HISTORY : 0) | (clampToNeighbourhood ? ACCUMULATE_FLAGS.CLAMP : 0);
        const bSrc = dev.buffer({ data: this._f32(src), usage: ["storage"] });
        const bMid = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bConf = dev.buffer({ data: new Float32Array(dw * dh), usage: ["storage"] });
        const bHist = dev.buffer({ data: history ? this._f32(history) : new Float32Array(n), usage: ["storage"] });
        const bMot = dev.buffer({ data: motion ? this._f32(motion) : new Float32Array(n), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const uR = this._uResolve(rw, rh, dw, dh, jitter[0], jitter[1], rFlags);
        const uA = this._uAccum(dw, dh, aFlags, alpha);
        this.pResolve.bind("src", bSrc).bind("dst", bMid).bind("conf", bConf).bind("u", uR);
        this.pAccum.bind("current", bMid).bind("history", bHist).bind("motion", bMot).bind("dst", bDst).bind("u", uA);
        const g = groups(dw, dh);
        dev.frame(({ pass }) => {
            pass.dispatch(this.pResolve, g);
            pass.dispatch(this.pAccum, g);
            pass.clear([0, 0, 0, 1]);
        }, { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        const confidence = new Float32Array(await dev.read(bConf));
        for (const b of [bSrc, bMid, bConf, bHist, bMot, bDst, uR, uA]) b.destroy();
        return { data, confidence, w: dw, h: dh, stats: null, statsReason: STATS_REASON };
    }
}
