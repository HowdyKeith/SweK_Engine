// fx/fsr/fsrGPU.js -- the RUNNER for fx/fsr/fsrKernels.js: EASU and RCAS on a device, through gfx/device.js.
//
// *** THE KERNELS WERE WRITTEN, VALIDATED, RUN ON A REAL ADAPTER AND HELD TO THE CPU REFERENCE TO 3e-7 --
// AND NOTHING OUTSIDE THE GATE COULD RUN THEM. *** fx/fsr/fsr-selfcheck.mjs built the buffers, the pipeline and
// the dispatch inline, twice, inside a browser origin it spawns itself. That code was the only caller in the
// tree, and a gate is not a caller: it proves the kernel and ships nothing anybody can use. The gate's own
// closing line said so in the places it mattered -- "no caller in this tree yet uses it", and "SPEED -- nobody
// has timed either kernel against bilinear or against anime4k".
//
// This file is that caller. It is deliberately NOT the shape fx/anime4k/anime4k.js's Anime4KGPU uses: that one
// talks raw WebGPU (createComputePipeline, createBindGroup, mapAsync) and carries the comment
// "correct-by-construction; no WebGPU headless here" -- a driver nobody has ever run. gfx/device.js already is
// the driver, the FSR gate already drives the kernels through it, and a second dispatcher would be the second
// copy of one job this tree keeps finding. So: device.buffer / device.compute / pass.dispatch / device.read.
//
// WHAT THE PORT BUYS, and it is the reason fsr1() exists rather than easu()+rcas() called in turn: the chain
// runs on ONE encoder, so the intermediate display-resolution picture never crosses back to the CPU. Called
// separately, the same result costs an extra readback of dw*dh*16 bytes and an extra upload of the same.
//
// *** RCAS OVERSHOOTS AND THIS FILE DOES NOT CLAMP IT. *** The gate measures 1.000 in -> 1.166 out at a local
// peak at full sharpness: RCAS_LIMIT keeps the resolve off the pole of 1/(4*lobe+1), it does not bound the
// range. Clamping here would silently change the algorithm for every caller; the gate's note said "no caller in
// this tree yet clamps it, because no caller in this tree yet uses it", and the half of that sentence this file
// changes is the second. So the range is REPORTED -- every run returns {min, max, overshot} over the rgb it
// produced -- and the caller that writes to 8 bits does the clamping where the 8 bits are.
"use strict";
import { EASU_WGSL, RCAS_WGSL } from "./fsrKernels.js";

const WG = 8;                                  // both kernels are @workgroup_size(8,8,1)
const groups = (w, h) => [Math.ceil(w / WG), Math.ceil(h / WG)];

/**
 * The range of the rgb a pass produced, so a caller can see the overshoot instead of discovering it in 8 bits.
 *
 * EXPORTED, because the CPU reference does not carry one and a caller that switches between the two must not get
 * a different KIND of answer for the same call. fsr.html reports the RCAS range under its FSR pane; the first
 * wiring returned `range` only from the GPU path, so the page admitted the overshoot on an adapter and clipped
 * it in silence without one. Same function, both paths.
 */
export function rangeOf(data, n) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = data[i * 4 + c]; if (v < min) min = v; if (v > max) max = v; }
    return { min, max, overshot: max > 1 || min < 0 };
}

export class FSRGPU {
    /** `device` is a gfx/device.js device with backend "webgpu". Both pipelines are built once, here. */
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("fx/fsr/fsrGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2 ` +
                "to fall back to, so the caller picks easuCPU/rcasCPU instead rather than being handed a silent one.");
        this.device = device;
        this.pEasu = device.compute({ wgsl: EASU_WGSL });
        this.pRcas = device.compute({ wgsl: RCAS_WGSL });
        for (const [n, p] of [["EASU", this.pEasu], ["RCAS", this.pRcas]])
            if (p && p.error) throw new Error(`fx/fsr/fsrGPU: the ${n} kernel did not compile -- ${p.error}`);
    }

    _uEasu(rw, rh, dw, dh) { return this.device.buffer({ data: new Uint32Array([rw, rh, dw, dh]), usage: "uniform" }); }
    // P { w:u32, h:u32, denoise:u32, sharp:f32 } -- mixed, so it is laid out by hand rather than by one typed array
    _uRcas(w, h, denoise, sharp) {
        const b = new ArrayBuffer(16), d = new DataView(b);
        d.setUint32(0, w, true); d.setUint32(4, h, true); d.setUint32(8, denoise ? 1 : 0, true); d.setFloat32(12, sharp, true);
        return this.device.buffer({ data: new Uint8Array(b), usage: "uniform" });
    }

    /** EASU alone: rw x rh -> dw x dh. Returns { data, w, h, range }, the shape easuCPU returns plus the range. */
    async easu(rgba, rw, rh, dw, dh) {
        const dev = this.device;
        const src = dev.buffer({ data: rgba instanceof Float32Array ? rgba : new Float32Array(rgba), usage: ["storage"] });
        const dst = dev.buffer({ data: new Float32Array(dw * dh * 4), usage: ["storage"] });
        const u = this._uEasu(rw, rh, dw, dh);
        this.pEasu.bind("src", src).bind("dst", dst).bind("u", u);
        const g = groups(dw, dh);
        dev.frame(({ pass }) => { pass.dispatch(this.pEasu, g); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(dst));
        for (const b of [src, dst, u]) b.destroy();
        return { data, w: dw, h: dh, range: rangeOf(data, dw * dh) };
    }

    /**
     * RCAS alone, in place of size: w x h -> w x h.
     *
     * *** THE SIGNATURE IS rcasCPU's, POSITIONALLY AND DOWN TO THE DEFAULT, AND THE FIRST DRAFT'S WAS NOT. ***
     * It took ({ denoise = true }) -- an options object where the reference takes a positional, and `true` where
     * the reference defaults `false`. A GPU path that mirrors a CPU reference and then answers a different
     * question for the same call is not a mirror; the gate caught it as NaN (an object reaching arithmetic
     * through fsr1CPU's positional `sharpness`) and the shape was wrong underneath the crash.
     */
    async rcas(rgba, w, h, sharpness = 1, denoise = false) {
        const dev = this.device;
        const src = dev.buffer({ data: rgba instanceof Float32Array ? rgba : new Float32Array(rgba), usage: ["storage"] });
        const dst = dev.buffer({ data: new Float32Array(w * h * 4), usage: ["storage"] });
        const u = this._uRcas(w, h, denoise, sharpness);
        this.pRcas.bind("src", src).bind("dst", dst).bind("u", u);
        const g = groups(w, h);
        dev.frame(({ pass }) => { pass.dispatch(this.pRcas, g); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
        const data = new Float32Array(await dev.read(dst));
        for (const b of [src, dst, u]) b.destroy();
        return { data, w, h, range: rangeOf(data, w * h) };
    }

    /**
     * FSR1: EASU then RCAS, ON ONE ENCODER. The display-resolution intermediate stays in device memory -- it is
     * never read back and never re-uploaded, which is the difference between a port and two calls.
     *
     * pass.dispatch opens and ends its own compute pass on the frame's single encoder, so the second dispatch is
     * ordered after the first without the caller managing a fence. That ordering is what makes `mid` safe to use
     * as the second pass's input in the same submit.
     *
     * Signature mirrors fsr1CPU(src, w, h, W, H, sharpness = 1, denoise = false) exactly -- see rcas() above.
     */
    async fsr1(rgba, rw, rh, dw, dh, sharpness = 1, denoise = false) {
        const dev = this.device;
        const src = dev.buffer({ data: rgba instanceof Float32Array ? rgba : new Float32Array(rgba), usage: ["storage"] });
        const mid = dev.buffer({ data: new Float32Array(dw * dh * 4), usage: ["storage"] });
        const dst = dev.buffer({ data: new Float32Array(dw * dh * 4), usage: ["storage"] });
        const uE = this._uEasu(rw, rh, dw, dh), uR = this._uRcas(dw, dh, denoise, sharpness);
        this.pEasu.bind("src", src).bind("dst", mid).bind("u", uE);
        this.pRcas.bind("src", mid).bind("dst", dst).bind("u", uR);
        const g = groups(dw, dh);
        dev.frame(({ pass }) => {
            pass.dispatch(this.pEasu, g);
            pass.dispatch(this.pRcas, g);
            pass.clear([0, 0, 0, 1]);
        }, { offscreen: true });
        const data = new Float32Array(await dev.read(dst));
        for (const b of [src, mid, dst, uE, uR]) b.destroy();
        return { data, w: dw, h: dh, range: rangeOf(data, dw * dh) };
    }
}

/**
 * Clamp rgb into [0,1] IN A COPY, for a caller about to write 8 bits. Separate from the passes on purpose: the
 * kernel's output is the algorithm's answer and this is the display's, and a caller that wants the numbers --
 * a PSNR, a further pass -- must not be handed silently bounded ones.
 */
export function clampForDisplay(rgba) {
    const out = new Float32Array(rgba.length);
    for (let i = 0; i < rgba.length; i += 4) {
        for (let c = 0; c < 3; c++) { const v = rgba[i + c]; out[i + c] = v < 0 ? 0 : v > 1 ? 1 : v; }
        out[i + 3] = rgba[i + 3];
    }
    return out;
}
