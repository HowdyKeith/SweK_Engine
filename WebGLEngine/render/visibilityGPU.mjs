// render/visibilityGPU.mjs -- the RUNNER for render/visibilityWgsl.mjs's VISIBILITY_WGSL.
//
// Same construction as render/temporalGPU.mjs, render/motionVectorsGPU.mjs, render/temporalRejectGPU.mjs,
// render/objectMotionGPU.mjs, render/temporalLockGPU.mjs and fx/fsr/fsrGPU.js: gfx/device.js, never raw WebGPU.
// It arrives WITH its caller rather than owing one -- v4647 closed the temporal arc's reachability census at
// zero and this is the first kernel added since, so it is added with a runner in the same round.
//
// *** THE CLEAR IS NOT A DETAIL. *** The visibility buffer must start at EMPTY (0xFFFFFFFF) or the first
// atomicMin compares against zero and every pixel keeps the clear. It is filled on the CPU at upload here,
// which costs a w*h write per call and is the honest shape for a runner that takes its geometry per call; a
// caller rendering the same size every frame should hold the buffer and clear it in a kernel, and that is a
// different object than this one.
"use strict";
import { VISIBILITY_WGSL } from "./visibilityWgsl.mjs";
import { EMPTY, MAX_OBJECTS, NO_OBJECT, unpackId, unpackDepth } from "./visibility.mjs";

const WG = 64;

/** Flatten an array of column-major mat4 into the one buffer array<mat4x4<f32>> binds -- objectMotionGPU's rule, one flattening site. */
export function flattenMvps(mvps) {
    const out = new Float32Array(mvps.length * 16);
    for (let i = 0; i < mvps.length; i++) out.set(mvps[i], i * 16);
    return out;
}

export class VisibilityGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/visibilityGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses rasterVisibilityCPU by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: VISIBILITY_WGSL });
        if (this.pipe && this.pipe.error) throw new Error(`render/visibilityGPU: the VISIBILITY kernel did not compile -- ${this.pipe.error}`);
    }

    /**
     * Mirrors rasterVisibilityCPU({ positions, indices, triObject, mvps, w, h, zRange }).
     *
     * Returns { words, ids, depth, w, h, rejected, covered }. `rejected` is READ BACK FROM THE DEVICE, not
     * inferred: the kernel counts refused triangles into an atomic because a triangle crossing the eye is a
     * scene the caller should know about, and recomputing the count here would be a second implementation of
     * the predicate, free to drift from the one that actually decided.
     */
    async raster({ positions, indices, triObject, mvps, w, h, zRange = [-1, 1] }) {
        if (!Array.isArray(mvps) || !mvps.length) throw new Error("visibilityGPU.raster: mvps must be a non-empty array of column-major matrices indexed by object id");
        if (mvps.length > MAX_OBJECTS - 1) throw new Error(`visibilityGPU.raster: ${mvps.length} objects against a packing budget of ${MAX_OBJECTS - 1} -- id ${NO_OBJECT} is reserved for "no object"`);
        if (indices.length % 3) throw new Error(`visibilityGPU.raster: ${indices.length} indices is not a whole number of triangles`);
        const triCount = indices.length / 3;
        if (triObject.length !== triCount) throw new Error(`visibilityGPU.raster: ${triObject.length} object ids against ${triCount} triangles -- one per triangle, so a mesh cannot half-belong to an object`);
        const [z0, z1] = zRange;
        if (!(z1 > z0)) throw new Error(`visibilityGPU.raster: zRange [${z0}, ${z1}] is empty or inverted`);

        const dev = this.device;
        const bPos = dev.buffer({ data: positions instanceof Float32Array ? positions : new Float32Array(positions), usage: ["storage"] });
        const bIdx = dev.buffer({ data: indices instanceof Uint32Array ? indices : new Uint32Array(indices), usage: ["storage"] });
        const bObj = dev.buffer({ data: triObject instanceof Uint32Array ? triObject : new Uint32Array(triObject), usage: ["storage"] });
        const bMvp = dev.buffer({ data: flattenMvps(mvps), usage: ["storage"] });
        const bWords = dev.buffer({ data: new Uint32Array(w * h).fill(EMPTY), usage: ["storage"] });   // the clear -- see the header
        const bRej = dev.buffer({ data: new Uint32Array(1), usage: ["storage"] });
        // struct P { w:u32, h:u32, triCount:u32, pad:u32, z0:f32, z1:f32, p2:f32, p3:f32 }
        const ub = new ArrayBuffer(32);
        new Uint32Array(ub, 0, 4).set([w, h, triCount, 0]);
        new Float32Array(ub, 16, 4).set([z0, z1, 0, 0]);
        const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });

        this.pipe.bind("positions", bPos).bind("indices", bIdx).bind("triObject", bObj)
                 .bind("mvps", bMvp).bind("words", bWords).bind("u", u).bind("rejected", bRej);
        dev.frame(({ pass }) => { pass.dispatch(this.pipe, [Math.ceil(triCount / WG)]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });

        const words = new Uint32Array(await dev.read(bWords));
        const rejected = new Uint32Array(await dev.read(bRej))[0];
        const ids = new Uint32Array(w * h), depth = new Float32Array(w * h);
        let covered = 0;
        for (let i = 0; i < words.length; i++) {
            ids[i] = unpackId(words[i]);
            depth[i] = unpackDepth(words[i]);
            if (words[i] !== EMPTY) covered++;
        }
        for (const b of [bPos, bIdx, bObj, bMvp, bWords, bRej, u]) b.destroy();
        return { words, ids, depth, w, h, rejected, covered };
    }
}
