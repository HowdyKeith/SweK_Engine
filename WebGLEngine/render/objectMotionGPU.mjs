// render/objectMotionGPU.mjs -- the RUNNER for render/objectMotionWgsl.mjs, through gfx/device.js.
//
// Same construction as render/motionVectorsGPU.mjs, render/temporalGPU.mjs, render/temporalRejectGPU.mjs and
// fx/fsr/fsrGPU.js: the device layer is gfx/device.js and never raw WebGPU. A kernel arrives with its caller
// in the same round, which is what tools/ship/kernelReach.mjs counts.
//
// *** THE MATRIX TABLE IS FLATTENED HERE AND NOWHERE ELSE. *** render/objectMotion.mjs keeps invMVPCur and
// mvpPrev as ARRAYS of Float32Array(16) on purpose -- an off-by-sixteen in a flat buffer reads as a different
// object rather than as a crash. A storage binding has to be flat, so the flattening happens at the binding,
// once, where the layout is the binding's business and the gate can hold the flat form to the array form.
"use strict";
import { OBJECT_MOTION_WGSL } from "./objectMotionWgsl.mjs";

const WG = 8;

/** The two tables as one flat Float32Array each, in id order. 16 floats per object, no padding: WGSL's
 *  mat4x4<f32> is four vec4 columns and is already 16-byte aligned, so the stride is exactly 64 bytes. */
export function flattenMatrixTable(mats) {
    const out = new Float32Array(mats.length * 16);
    for (let i = 0; i < mats.length; i++) {
        if (!mats[i] || mats[i].length !== 16)
            throw new Error(`objectMotionGPU: object ${i}'s matrix is ${mats[i] ? mats[i].length : "missing"} floats, not 16`);
        out.set(mats[i], i * 16);
    }
    return out;
}

export class ObjectMotionGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/objectMotionGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses objectMotionCPU by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: OBJECT_MOTION_WGSL });
        if (this.pipe && this.pipe.error) throw new Error(`render/objectMotionGPU: OBJECT_MOTION_WGSL did not compile -- ${this.pipe.error}`);
    }

    /**
     * Mirrors objectMotionCPU({ depth, ids, w, h, invMVPCur, mvpPrev, invalidTo }) and returns { data, w, h }.
     *
     * `outOfRange` is NOT returned: the kernel counts nothing, and v4591 settled what to do about that -- an
     * uncounted quantity reported as zero is worse than reported not at all. The rejected pixels are visible in
     * the output as valid = 0, which is where every consumer in this tree reads validity from anyway.
     */
    async motion({ depth, ids, w, h, invMVPCur, mvpPrev, invalidTo = 0 }) {
        if (!invMVPCur || !mvpPrev || invMVPCur.length !== mvpPrev.length)
            throw new Error("objectMotionGPU.motion: invMVPCur and mvpPrev must be arrays of the same length -- pass buildObjectMatrices' output");
        const dev = this.device, count = invMVPCur.length;
        if (count === 0) throw new Error("objectMotionGPU.motion: an empty matrix table rejects every pixel, which is a caller mistake rather than a picture");
        const f32 = (v) => (v instanceof Float32Array ? v : new Float32Array(v));
        const bDepth = dev.buffer({ data: f32(depth), usage: ["storage"] });
        const bIds = dev.buffer({ data: ids instanceof Uint32Array ? ids : Uint32Array.from(ids), usage: ["storage"] });
        const bCur = dev.buffer({ data: flattenMatrixTable(invMVPCur), usage: ["storage"] });
        const bPrev = dev.buffer({ data: flattenMatrixTable(mvpPrev), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(w * h * 4), usage: ["storage"] });
        const ub = new ArrayBuffer(16), d = new DataView(ub);
        d.setUint32(0, w, true); d.setUint32(4, h, true); d.setUint32(8, count, true); d.setFloat32(12, invalidTo, true);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
        this.pipe.bind("depth", bDepth).bind("ids", bIds).bind("invMVPCur", bCur)
                 .bind("mvpPrev", bPrev).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pipe, [Math.ceil(w / WG), Math.ceil(h / WG)]); pass.clear([0, 0, 0, 1]); },
                  { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bDepth, bIds, bCur, bPrev, bDst, u]) b.destroy();
        return { data, w, h };
    }
}
