// render/opticalFlowGPU.mjs -- the RUNNER for render/opticalFlowWgsl.mjs.
//
// One dispatch per pyramid level, coarse to fine, because the levels are sequential: each starts from the
// one above's answer. Same construction as the rest of the arc -- gfx/device.js, never raw WebGPU.
"use strict";
import { OPTICAL_FLOW_WGSL } from "./opticalFlowWgsl.mjs";
import { luminancePyramidCPU } from "./luminancePyramid.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

export class OpticalFlowGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/opticalFlowGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses opticalFlowCPU by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: OPTICAL_FLOW_WGSL, entryPoint: "search" });
        if (this.pipe && this.pipe.error)
            throw new Error(`render/opticalFlowGPU: the search kernel did not compile -- ${this.pipe.error}`);
    }

    _f32(v) { return v instanceof Float32Array ? v : new Float32Array(v); }

    /**
     * Mirrors opticalFlowCPU({ cur, prev, w, h, block, searchRadius, levels }).
     *
     * *** THE PYRAMIDS ARE BUILT ON THE CPU AND THAT IS STATED RATHER THAN HIDDEN. *** render/luminance
     * PyramidGPU.mjs exists and could do it, but then this runner's parity row would be comparing two
     * device chains and could not tell a flow defect from a pyramid one. The subject here is the SEARCH.
     * Wiring the device pyramid in is a later round and is named in the gate's closing line.
     */
    async flow({ cur, prev, w, h, block = 8, searchRadius = 4, levels = 3, subpixel = true }) {
        if (!(block >= 2) || block !== Math.floor(block))
            throw new Error(`opticalFlowGPU.flow: block must be a whole number of pixels, at least 2 -- got ${block}`);
        if (!(searchRadius >= 1) || searchRadius !== Math.floor(searchRadius))
            throw new Error(`opticalFlowGPU.flow: searchRadius must be a whole number of pixels, at least 1 -- got ${searchRadius}`);
        if (!(levels >= 1) || levels !== Math.floor(levels))
            throw new Error(`opticalFlowGPU.flow: levels must be a whole number, at least 1 -- got ${levels}`);
        const dev = this.device;
        const P = luminancePyramidCPU({ src: cur, w, h });
        const Q = luminancePyramidCPU({ src: prev, w, h });
        const top = Math.min(levels, P.levels) - 1;
        const bw = Math.ceil(w / block), bh = Math.ceil(h / block);

        // two flow buffers, ping-ponged: a level reads the one above's answer and writes its own, and a
        // single buffer read and written in one dispatch is a race the encoder will not order for us
        let bIn = dev.buffer({ data: new Float32Array(bw * bh * 2), usage: ["storage"] });
        let bOut = dev.buffer({ data: new Float32Array(bw * bh * 2), usage: ["storage"] });
        const bConf = dev.buffer({ data: new Float32Array(bw * bh), usage: ["storage"] });
        const keep = [bIn, bOut, bConf];

        for (let L = top; L >= 0; L--) {
            const [lw, lh] = P.sizes[L], scale = 1 << L;
            const bCur = dev.buffer({ data: this._f32(P.mips[L]), usage: ["storage"] });
            const bPrev = dev.buffer({ data: this._f32(Q.mips[L]), usage: ["storage"] });
            const ub = new ArrayBuffer(48);
            new Uint32Array(ub, 0, 4).set([lw, lh, bw, bh]);
            // refine only at L === 0, and only if the caller asked -- the same two conditions the CPU applies
            new Int32Array(ub, 16, 8).set([block, searchRadius, scale, block, (L === 0 && subpixel) ? 1 : 0, 0, 0, 0]);
            const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
            this.pipe.bind("curLum", bCur).bind("prevLum", bPrev)
                     .bind("flowIn", bIn).bind("flowOut", bOut).bind("confOut", bConf).bind("u", u);
            dev.frame(({ pass }) => { pass.dispatch(this.pipe, groups(bw, bh)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            // the level's answer becomes the next level's guess
            const prevIn = bIn; bIn = bOut; bOut = prevIn;
            bCur.destroy(); bPrev.destroy(); u.destroy();
        }
        const flow = new Float32Array(await dev.read(bIn));      // after the swap, bIn holds the last write
        const conf = new Float32Array(await dev.read(bConf));
        for (const b of keep) b.destroy();
        return { flow, conf, bw, bh, block, levels: top + 1 };
    }
}
