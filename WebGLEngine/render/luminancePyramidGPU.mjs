// render/luminancePyramidGPU.mjs -- the RUNNER for render/luminancePyramidWgsl.mjs.
//
// Same construction as the rest of the arc: gfx/device.js, never raw WebGPU. One dispatch for the base
// level and one per halving, which is a dispatch per mip rather than FSR2's single-pass SPD -- see the
// kernel's header for why that trade is taken deliberately.
"use strict";
import { LUMA_PYRAMID_WGSL } from "./luminancePyramidWgsl.mjs";
import { levelsFor } from "./luminancePyramid.mjs";

const WG = 8;
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

export class LuminancePyramidGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/luminancePyramidGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses luminancePyramidCPU by asking for it.");
        this.device = device;
        this.pBase = device.compute({ wgsl: LUMA_PYRAMID_WGSL, entryPoint: "base" });
        this.pReduce = device.compute({ wgsl: LUMA_PYRAMID_WGSL, entryPoint: "reduce" });
        for (const [n, p] of [["base", this.pBase], ["reduce", this.pReduce]])
            if (p && p.error) throw new Error(`render/luminancePyramidGPU: the ${n} entry point did not compile -- ${p.error}`);
    }

    _f32(v) { return v instanceof Float32Array ? v : new Float32Array(v); }

    /**
     * Mirrors luminancePyramidCPU({ src, w, h }). Returns { mips, sizes, levels, mean }.
     *
     * `exact` is NOT returned: it is a direct sum over the base level, which a caller holding `mips[0]`
     * can compute itself and which this runner would otherwise have to read a whole buffer back to
     * produce. The CPU mirror returns it because its base level is already in hand.
     */
    async pyramid({ src, w, h }) {
        if (!(w >= 1 && h >= 1)) throw new Error(`luminancePyramidGPU.pyramid: need a positive size -- got ${w}x${h}`);
        const dev = this.device;
        const levels = levelsFor(w, h);
        const bRGBA = dev.buffer({ data: this._f32(src), usage: ["storage"] });
        const sizes = [[w, h]];
        let cw = w, ch = h;
        for (let i = 1; i < levels; i++) { cw = Math.ceil(cw / 2); ch = Math.ceil(ch / 2); sizes.push([cw, ch]); }
        const bufs = sizes.map(([sw, sh]) => dev.buffer({ data: new Float32Array(sw * sh), usage: ["storage"] }));
        // a uniform per level: the shape changes every dispatch, and one buffer rewritten between
        // dispatches inside a single frame() is a race the encoder will not order for us
        const us = sizes.map(([sw, sh], i) => {
            const ab = new ArrayBuffer(16);
            const [pw, ph] = i === 0 ? [sw, sh] : sizes[i - 1];
            new Uint32Array(ab).set([sw, sh, pw, ph]);
            return dev.buffer({ data: new Uint8Array(ab), usage: "uniform" });
        });
        this.pBase.bind("srcRGBA", bRGBA).bind("srcLum", bufs[0]).bind("dst", bufs[0]).bind("u", us[0]);
        dev.frame(({ pass }) => { pass.dispatch(this.pBase, groups(w, h)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        for (let i = 1; i < levels; i++) {
            this.pReduce.bind("srcRGBA", bRGBA).bind("srcLum", bufs[i - 1]).bind("dst", bufs[i]).bind("u", us[i]);
            const [sw, sh] = sizes[i];
            dev.frame(({ pass }) => { pass.dispatch(this.pReduce, groups(sw, sh)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        }
        const mips = [];
        for (const b of bufs) mips.push(new Float32Array(await dev.read(b)));
        bRGBA.destroy(); for (const b of bufs) b.destroy(); for (const b of us) b.destroy();
        return { mips, sizes, levels, mean: mips[levels - 1][0] };
    }
}
