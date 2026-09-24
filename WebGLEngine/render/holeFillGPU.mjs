// render/holeFillGPU.mjs -- the RUNNER for render/holeFillWgsl.mjs's FILL_WGSL.
//
// *** ONE DISPATCH, BECAUSE THE NEIGHBOURHOOD RULE IS ORDER-INDEPENDENT. *** Every hole pixel reads only the
// original mask and writes only its own slot. render/frameInterpGPU.mjs needed three dispatches and two atomics
// to reproduce one tie rule; this needs none of that, and the difference is a property of the two algorithms
// rather than of the effort spent on them.
//
// *** `growth: "ring"` IS REFUSED RATHER THAN MIRRORED. *** v4678 measured it at 3.6 dB WORSE on the holes than
// leaving them to a cross-fade. It stays on the CPU so that number stays reproducible; a kernel for it would be
// surface nothing needs, and silently accepting the option and doing something else would be worse than both.
"use strict";
import { FILL_WGSL, FILL_STRIDE } from "./holeFillWgsl.mjs";
import { SIDE_BLEND, SIDE_PREV, SIDE_CUR } from "./holeFill.mjs";

const WG = 8;
const SIDE_MODE = { derived: 0, blend: 1, prev: 2, cur: 3, depth: 4 };
const STAT_ORDER = ["filled", "abstained"];

export class HoleFillGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/holeFillGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses fillHolesCPU by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: FILL_WGSL, entryPoint: "main" });
    }
    _f32(a) { return a instanceof Float32Array ? a : Float32Array.from(a); }

    /** Mirrors fillHolesCPU, minus `growth: "ring"`. Same arguments, same returned shape. */
    async fill({ vec, hole, zbuf, w, h, radius = 4, growth = "neighbourhood", prefer = "farther",
                 side = "derived", nearerIsLess = true, depthPrev = null, depthCur = null, t = 0.5 }) {
        if (!(radius >= 1) || radius !== Math.floor(radius))
            throw new Error(`holeFillGPU.fill: radius must be a whole number of pixels, at least 1 -- got ${radius}`);
        if (growth === "ring")
            throw new Error('holeFillGPU.fill: growth "ring" has no kernel and is not going to get one -- ' +
                "v4678 measured it 3.6 dB WORSE on the holes than leaving them to a cross-fade, so it stays on " +
                "fillHolesCPU where that number is reproducible. Pass growth \"neighbourhood\", or use the CPU.");
        if (growth !== "neighbourhood")
            throw new Error(`holeFillGPU.fill: growth must be "neighbourhood" -- got ${JSON.stringify(growth)}`);
        if (prefer !== "farther" && prefer !== "nearer")
            throw new Error(`holeFillGPU.fill: prefer must be "farther" or "nearer" -- got ${JSON.stringify(prefer)}`);
        if (!(side in SIDE_MODE))
            throw new Error(`holeFillGPU.fill: side must be "depth", "derived", "blend", "prev" or "cur" -- got ${JSON.stringify(side)}`);
        if (side === "depth" && (!depthPrev || depthPrev.length < w * h || !depthCur || depthCur.length < w * h))
            throw new Error('holeFillGPU.fill: side "depth" needs depthPrev and depthCur, each w*h -- it is ' +
                "render/temporalReject.mjs's disocclusion comparison and there is nothing to compare without them");
        if (!(t >= 0) || !(t <= 1)) throw new Error(`holeFillGPU.fill: t must be in [0, 1] -- got ${t}`);
        if (!vec || vec.length < w * h * 2) throw new Error("holeFillGPU.fill: vec must be w*h*2");
        if (!hole || hole.length < w * h) throw new Error("holeFillGPU.fill: hole must be w*h");
        if (!zbuf || zbuf.length < w * h)
            throw new Error("holeFillGPU.fill: zbuf must be w*h -- which candidate a hole takes is a depth question, and without it the answer is the scan order's");

        const dev = this.device, n = w * h;
        // the two depth buffers are bound even when `side` does not read them: a bind group is fixed at
        // dispatch and a null binding is not a thing, so an unused slot carries zeros and the kernel never looks
        const zeros = new Float32Array(n);
        const bVec = dev.buffer({ data: this._f32(vec), usage: ["storage"] });
        const bHole = dev.buffer({ data: Uint32Array.from(hole), usage: ["storage"] });
        const bZ = dev.buffer({ data: this._f32(zbuf), usage: ["storage"] });
        const bDP = dev.buffer({ data: depthPrev ? this._f32(depthPrev) : zeros, usage: ["storage"] });
        const bDC = dev.buffer({ data: depthCur ? this._f32(depthCur) : zeros, usage: ["storage"] });
        const bOut = dev.buffer({ data: new Float32Array(n * FILL_STRIDE), usage: ["storage"] });
        const bStats = dev.buffer({ data: new Uint32Array(STAT_ORDER.length), usage: ["storage"] });
        const ub = new ArrayBuffer(48);
        new Uint32Array(ub, 0, 2).set([w, h]);
        new Int32Array(ub, 8, 1).set([radius]);
        new Uint32Array(ub, 12, 4).set([nearerIsLess ? 1 : 0, prefer === "farther" ? 1 : 0, SIDE_MODE[side], 0]);
        new Uint32Array(ub, 28, 1).set([0]);
        new Float32Array(ub, 32, 1).set([t]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });

        this.pipe.bind("vecIn", bVec).bind("holeIn", bHole).bind("zbufIn", bZ)
            .bind("depthPrev", bDP).bind("depthCur", bDC).bind("out", bOut).bind("u", u).bind("stats", bStats);
        dev.frame(({ pass }) => { pass.dispatch(this.pipe, [Math.ceil(w / WG), Math.ceil(h / WG)]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });

        const packed = new Float32Array(await dev.read(bOut));
        const raw = new Uint32Array(await dev.read(bStats));
        for (const b of [bVec, bHole, bZ, bDP, bDC, bOut, bStats, u]) b.destroy();

        const outVec = new Float32Array(n * 2), outZ = new Float32Array(n);
        const outHole = new Uint8Array(n), outSide = new Int8Array(n);
        for (let i = 0; i < n; i++) {
            const o = i * FILL_STRIDE;
            outVec[i * 2] = packed[o]; outVec[i * 2 + 1] = packed[o + 1];
            outZ[i] = packed[o + 2];
            outSide[i] = packed[o + 3];
            outHole[i] = packed[o + 4] ? 1 : 0;     // the kernel says so; it is not inferred from the vector
        }
        const counts = {}; STAT_ORDER.forEach((k, i) => { counts[k] = raw[i]; });
        return { vec: outVec, hole: outHole, zbuf: outZ, side: outSide,
                 filled: counts.filled, abstained: counts.abstained };
    }
}
export { SIDE_BLEND, SIDE_PREV, SIDE_CUR };
