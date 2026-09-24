// render/genGateGPU.mjs -- the RUNNER for brain/mlp.js's MLP_LAYER_WGSL, through gfx/device.js.
//
// *** WHY THIS EXISTS WHEN brain/mlp.js ALREADY HAS A RUNNER. *** BatchedMLP takes a RAW WebGPU device: it
// calls device.createShaderModule and device.createComputePipeline itself and builds its own bind groups.
// Every runner in this render arc -- dilateGPU, reactiveGPU, temporalRejectGPU, flowReconcileGPU,
// frameInterpGPU, holeFillGPU -- goes through gfx/device.js and never raw WebGPU, because that is what makes
// one backend switch serve all of them. Handing fsr.html a raw-device object would be the first exception in
// the arc, so the kernel gets a second runner instead of the page getting a second device model.
//
// THE KERNEL IS SHARED, WHICH IS THE POINT: MLP_LAYER_WGSL is imported, not copied, so this runner and
// BatchedMLP cannot drift apart in their arithmetic. Only the plumbing differs.
//
// *** ONE DISPATCH PER LAYER, AND THE ACTIVATIONS PING-PONG. *** Same structure as BatchedMLP and the same
// reason frameInterpGPU issues one frame() per dispatch: layer n+1 reads what layer n is still writing unless
// there is a submission boundary between them.
"use strict";
import { MLP_LAYER_WGSL } from "../brain/mlp.js";

const ACT = { none: 0, relu: 1, sigmoid: 2 };
const WG = 8;

export class GenGateGPU {
    constructor(device) {
        if (!device || device.backend !== "webgpu")
            throw new Error("render/genGateGPU: needs a gfx/device.js device on the webgpu backend -- " +
                `got ${device ? JSON.stringify(device.backend) : "nothing"}. There is no compute stage in WebGL2, ` +
                "so a caller without one uses render/genGate.mjs's forward() by asking for it.");
        this.device = device;
        this.pipe = device.compute({ wgsl: MLP_LAYER_WGSL, entryPoint: "k_layer" });
        if (this.pipe && this.pipe.error)
            throw new Error(`render/genGateGPU: MLP_LAYER_WGSL did not compile -- ${this.pipe.error}`);
    }
    _f32(a) { return a instanceof Float32Array ? a : Float32Array.from(a); }

    /**
     * Mirrors render/genGate.mjs's forward(). `layers` is [{ nIn, nOut, W, b, act }, ...].
     * Returns Float32Array(batch * last.nOut).
     */
    async forward(layers, x, batch) {
        if (!Array.isArray(layers) || !layers.length) throw new Error("genGateGPU.forward: needs at least one layer");
        if (!(batch >= 1) || batch !== Math.floor(batch))
            throw new Error(`genGateGPU.forward: batch must be a whole number, at least 1 -- got ${batch}`);
        if (!x || x.length < batch * layers[0].nIn)
            throw new Error(`genGateGPU.forward: x must be batch*nIn = ${batch * layers[0].nIn} -- got ${x ? x.length : "nothing"}`);
        for (const [i, L] of layers.entries()) {
            if (L.W.length !== L.nOut * L.nIn)
                throw new Error(`genGateGPU.forward: layer ${i}'s W must be nOut*nIn = ${L.nOut * L.nIn} -- got ${L.W.length}`);
            if (L.b.length !== L.nOut)
                throw new Error(`genGateGPU.forward: layer ${i}'s b must be nOut = ${L.nOut} -- got ${L.b.length}`);
            if (i && L.nIn !== layers[i - 1].nOut)
                throw new Error(`genGateGPU.forward: layer ${i} takes ${L.nIn} inputs but layer ${i - 1} produces ${layers[i - 1].nOut}`);
            if (ACT[L.act ?? "none"] === undefined)
                throw new Error(`genGateGPU.forward: unknown activation ${JSON.stringify(L.act)} -- the kernel knows none, relu and sigmoid`);
        }
        const dev = this.device;
        // Both ping-pong buffers are sized for the WIDEST layer, so one pair serves every depth.
        const wide = Math.max(...layers.map((L) => Math.max(L.nIn, L.nOut)));
        let bA = dev.buffer({ data: this._f32(x).slice(0, batch * layers[0].nIn), usage: ["storage"] });
        let bB = dev.buffer({ data: new Float32Array(batch * wide), usage: ["storage"] });
        const spent = [bA, bB];
        for (const L of layers) {
            const bW = dev.buffer({ data: this._f32(L.W), usage: ["storage"] });
            const bBias = dev.buffer({ data: this._f32(L.b), usage: ["storage"] });
            // struct MP { batch, nIn, nOut, act : u32 }
            const ub = new ArrayBuffer(16);
            new Uint32Array(ub).set([batch, L.nIn, L.nOut, ACT[L.act ?? "none"]]);
            const u = dev.buffer({ data: new Uint8Array(ub), usage: "uniform" });
            this.pipe.bind("P", u).bind("X", bA).bind("W", bW).bind("B", bBias).bind("Y", bB);
            dev.frame(({ pass }) => {
                pass.dispatch(this.pipe, [Math.ceil(L.nOut / WG), Math.ceil(batch / WG)]);
                pass.clear([0, 0, 0, 1]);
            }, { offscreen: true });
            spent.push(bW, bBias, u);
            const t = bA; bA = bB; bB = t;      // the output becomes the next layer's input
        }
        const last = layers[layers.length - 1];
        const y = new Float32Array(await dev.read(bA)).slice(0, batch * last.nOut);
        for (const b of spent) b.destroy();
        return y;
    }

    /** The gate's own question: a keep/drop byte per block, thresholded at `tau`. */
    async keep(layers, x, batch, tau = 0.5) {
        const p = await this.forward(layers, x, batch);
        const out = new Uint8Array(batch);
        for (let i = 0; i < batch; i++) out[i] = p[i] >= tau ? 1 : 0;
        return { keep: out, p };
    }
}
