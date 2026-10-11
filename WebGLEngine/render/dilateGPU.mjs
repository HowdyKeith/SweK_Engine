// render/dilateGPU.mjs -- the RUNNER for render/dilateWgsl.mjs's DILATE_WGSL.
//
// Same construction as render/temporalRejectGPU.mjs, render/reactiveGPU.mjs and the rest of the arc:
// gfx/device.js, never raw WebGPU.
"use strict";
import { DILATE_WGSL } from "./dilateWgsl.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

/** DILATE_WGSL/mainCounted's atomics, in the order the kernel writes them. */
const DILATE_STAT_ORDER = ["moved"];

const STATS_REASON =
    "counting was not asked for: pass counted: true to dispatch mainCounted, which records `moved` into an " +
    "atomic buffer. Null rather than zero, because a frame where the depth was flat and nothing needed " +
    "dilating and a frame nobody counted must not read the same -- and on flat geometry the OUTPUT buffers " +
    "of those two frames are identical, so nothing else could tell them apart.";

export class DilateGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/dilateGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses dilateCPU by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: DILATE_WGSL });
        this.pipeCounted = device.compute({ wgsl: DILATE_WGSL, entryPoint: "mainCounted" });
        for (const [name, pipe] of [["main", this.pipe], ["mainCounted", this.pipeCounted]])
            if (pipe && pipe.error) throw new Error(`render/dilateGPU: the DILATE kernel's ${name} did not compile -- ${pipe.error}`);
    }

    _f32(v) { return v instanceof Float32Array ? v : new Float32Array(v); }

    /**
     * Mirrors dilateCPU({ depth, motion, w, h, nearerIsLess, radius }).
     *
     * Returns { depth, motion, source, w, h, stats, statsReason }. `stats` is null unless counted: true.
     * `source` is always returned: it is the only record of WHICH pixel each output came from, and on flat
     * geometry the depth and motion buffers of a working dilation and of no dilation at all are identical.
     */
    async dilate({ depth, motion, w, h, nearerIsLess = true, radius = 1, counted = false }) {
        if (!(radius >= 1) || radius !== Math.floor(radius))
            throw new Error(`dilateGPU.dilate: radius must be a positive whole number of pixels -- got ${radius}`);
        const dev = this.device, n = w * h;
        const bDepth = dev.buffer({ data: this._f32(depth), usage: ["storage"] });
        const bMot = dev.buffer({ data: this._f32(motion), usage: ["storage"] });
        const bDstD = dev.buffer({ data: new Float32Array(n), usage: ["storage"] });
        const bDstM = dev.buffer({ data: new Float32Array(n * 4), usage: ["storage"] });
        const bSrc = dev.buffer({ data: new Int32Array(n), usage: ["storage"] });
        // struct P { w, h : u32, radius : i32, nearerIsLess : u32 }
        const ub = new ArrayBuffer(16);
        new Uint32Array(ub, 0, 2).set([w, h]);
        new Int32Array(ub, 8, 1).set([radius]);
        new Uint32Array(ub, 12, 1).set([nearerIsLess ? 1 : 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        const bStats = counted ? dev.buffer({ data: new Uint32Array(DILATE_STAT_ORDER.length), usage: ["storage"] }) : null;
        const pipe = counted ? this.pipeCounted : this.pipe;
        pipe.bind("depth", bDepth).bind("motion", bMot).bind("dstDepth", bDstD)
            .bind("dstMotion", bDstM).bind("dstSource", bSrc).bind("u", u);
        if (counted) pipe.bind("stats", bStats);
        dev.frame(({ pass }) => { pass.dispatch(pipe, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const outDepth = new Float32Array(await dev.read(bDstD));
        const outMotion = new Float32Array(await dev.read(bDstM));
        const source = new Int32Array(await dev.read(bSrc));
        let stats = null;
        if (counted) {
            const raw = new Uint32Array(await dev.read(bStats));
            stats = {}; DILATE_STAT_ORDER.forEach((k, i) => { stats[k] = raw[i]; });
        }
        for (const b of [bDepth, bMot, bDstD, bDstM, bSrc, u]) b.destroy();
        if (bStats) bStats.destroy();
        return { depth: outDepth, motion: outMotion, source, w, h, stats, statsReason: counted ? null : STATS_REASON };
    }
}
