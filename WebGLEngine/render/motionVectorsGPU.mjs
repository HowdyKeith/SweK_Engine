// render/motionVectorsGPU.mjs -- the RUNNER for render/motionVectorsWgsl.mjs, and the orthographic camera that
// lets a 2D pan use it.
//
// *** THREE OF THE SEVENTEEN. *** tools/ship/kernelReach.mjs counted 17 dispatchable kernels reachable only from
// a gate; v4590 gave RESOLVE_WGSL and ACCUMULATE_WGSL a caller and MOTION_WGSL was the next of the arc's ten.
// Same construction as render/temporalGPU.mjs and fx/fsr/fsrGPU.js: gfx/device.js, never raw WebGPU.
//
// ---- AND THE ROUND'S OWN PREMISE WAS WRONG, WHICH THE FIRST MEASUREMENT SAID -------------------------------
//
// v4591 closed by proposing that fsr.html "writes its motion vectors by hand, which is a second implementation
// of motionVectorsCPU". IT IS NOT. motionVectorsCPU takes a DEPTH BUFFER and two 4x4 matrices and reprojects
// each pixel through them; the page had no depth buffer and no matrices at all -- it panned a 2D scene and
// wrote a constant du. Those are different things, and calling the second a copy of the first would have been a
// finding invented rather than measured. That is the second hand-off claim in four rounds that its own
// prior-art check refuted, which is the check earning its keep both times.
//
// *** WHAT IS TRUE IS SMALLER AND WORTH MORE: THE PAGE'S CONSTANT WAS DECLARED, AND IT IS NOW DERIVED. ***
// MEASURED FIRST, at three frames, 192x192, against the hand-written PAN/D the page shipped:
//
//     worst |du - constant| = 0.000e+0      worst |dv| = 2.8e-17      invalid = 0
//
// The constant was exactly right. It was also wrong once -- the SIGN, at v4586, which cost a round and was
// caught by a counter rather than by a check. A number that happens to be right is not the same as a number
// something derives, and `orthoPanVP` below is what turns the page's camera into two matrices the tree's own
// gated producer can consume.
"use strict";
import { MOTION_WGSL } from "./motionVectorsWgsl.mjs";
import { mat4Invert } from "./motionVectors.mjs";

const WG = 8;

/**
 * The view-projection of a camera that PANS A FLAT SCENE, as a column-major 4x4 -- the camera fsr.html has and
 * could not write down. World (x, y) in [0,1]^2, uv running DOWN while clip runs UP:
 *
 *     ndc.x = 2*(wx - t) - 1        ndc.y = 1 - 2*wy        ndc.z = wz        w = 1
 *
 * `t` is the pan in UV units. Two of these, one frame apart, are exactly what motionVectorsCPU and MOTION_WGSL
 * want, and they reproduce the page's hand-written du to 0 and its dv to 2.8e-17.
 *
 * *** v4638 -- THIS LINE SAID `ndc.z = 0` AND THE MATRIX'S z ROW IS THE IDENTITY. *** (0, 0, 1, 0) passes the
 * world z straight through; ndc.z is 0 only when the CALLER's depth is 0, which fsr.html's FLAT_DEPTH is, so
 * the sentence was true of the one caller and false of the matrix. It matters because the whole question a
 * reader brings here is what this camera does to DEPTH -- render/temporalReject.mjs's disocclusion test is a
 * comparison of two clip z values -- and "ndc.z = 0" says this camera destroys it. It does not. What an
 * orthographic camera destroys is the DIFFERENCE between two depths' screen motion, which is parallax, and
 * that is a property of the x and y rows rather than of the z one.
 */
export function orthoPanVP(t) {
    return Float32Array.from([
        2, 0, 0, 0,
        0, -2, 0, 0,
        0, 0, 1, 0,
        -1 - 2 * t, 1, 0, 1,
    ]);
}

/** struct P { invVPCur : mat4x4<f32>, vpPrev : mat4x4<f32>, dims : vec4<u32> } -- 64 + 64 + 16 bytes. */
export function packMotionUniform(invVPCur, vpPrev, w, h) {
    const ub = new ArrayBuffer(144);
    new Float32Array(ub, 0, 16).set(invVPCur);
    new Float32Array(ub, 64, 16).set(vpPrev);
    new Uint32Array(ub, 128, 4).set([w, h, 0, 0]);
    return new Uint32Array(ub);
}

export class MotionVectorsGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/motionVectorsGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses motionVectorsCPU by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: MOTION_WGSL });
        if (this.pipe && this.pipe.error) throw new Error(`render/motionVectorsGPU: MOTION_WGSL did not compile -- ${this.pipe.error}`);
    }

    /**
     * Mirrors motionVectorsCPU(depth, w, h, invVPCur, vpPrev) positionally, and returns { data, w, h }.
     *
     * *** THE CPU RETURNS A `valid` SIDE-ARRAY AND THIS DOES NOT, WHICH IS NOT A GAP. *** motionVectorsCPU fills
     * a Uint8Array beside the buffer; the kernel writes the same fact into the buffer's THIRD CHANNEL, which is
     * where the convention says it lives -- (du, dv, valid, zPrev) -- and every consumer in this tree reads it
     * from there. A second copy of the same bit is what the CPU carries for its own callers' convenience, and
     * synthesising one here would be a second representation of one fact.
     */
    async motion(depth, w, h, invVPCur, vpPrev) {
        const dev = this.device;
        const bDepth = dev.buffer({ data: depth instanceof Float32Array ? depth : new Float32Array(depth), usage: ["storage"] });
        const bDst = dev.buffer({ data: new Float32Array(w * h * 4), usage: ["storage"] });
        const u = dev.buffer({ data: packMotionUniform(invVPCur, vpPrev, w, h), usage: "uniform" });
        this.pipe.bind("depth", bDepth).bind("dst", bDst).bind("u", u);
        dev.frame(({ pass }) => { pass.dispatch(this.pipe, [Math.ceil(w / WG), Math.ceil(h / WG)]); pass.clear([0, 0, 0, 1]); },
                  { offscreen: true });
        const data = new Float32Array(await dev.read(bDst));
        for (const b of [bDepth, bDst, u]) b.destroy();
        return { data, w, h };
    }

    /** The pan case, with the inverse taken here so a caller panning a flat scene needs no matrix library. */
    async pan({ depth, w, h, tCur, tPrev }) {
        const vpCur = orthoPanVP(tCur), vpPrev = orthoPanVP(tPrev);
        const inv = mat4Invert(vpCur);
        if (!inv) throw new Error("render/motionVectorsGPU: the pan view-projection is singular, which it cannot be -- check tCur");
        return this.motion(depth, w, h, inv, vpPrev);
    }
}
