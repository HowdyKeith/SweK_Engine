// mlp.js -- generic batched MLP forward pass on WebGPU.
// Part of the SweK GPU Brain v2.
//
// Runs y = act(W*x + b) layer by layer for a whole BATCH of inputs in one
// GPU submission: one dispatch per layer, activations ping-ponging between
// two persistent buffers, weights uploaded once at construction.
//
// At v2's batch sizes (a dozen kaiju through a tiny policy) this is
// comically small for a 1070 -- the value is the MACHINERY: Round 30's
// ranged-attack selection (N kaiju x M attack types x K candidate targets)
// and any trained policy drop straight into this without new plumbing.
// The kernel is a naive row-per-thread matmul with fused bias+activation;
// swap in the tiled variant from the SweK WebGPU benchmark if layer sizes
// ever make it matter.
//
// Layer spec: { nIn, nOut, W: Float32Array(nOut*nIn) row-major,
//               b: Float32Array(nOut), act: "none"|"relu"|"sigmoid" }

const WGSL = /* wgsl */ `
struct MP { batch: u32, nIn: u32, nOut: u32, act: u32 };
@group(0) @binding(0) var<uniform> P: MP;
@group(0) @binding(1) var<storage, read>       X: array<f32>;   // batch x nIn
@group(0) @binding(2) var<storage, read>       W: array<f32>;   // nOut x nIn
@group(0) @binding(3) var<storage, read>       B: array<f32>;   // nOut
@group(0) @binding(4) var<storage, read_write> Y: array<f32>;   // batch x nOut

@compute @workgroup_size(8, 8)
fn k_layer(@builtin(global_invocation_id) gid: vec3<u32>) {
    let o = gid.x;          // output neuron
    let r = gid.y;          // batch row
    if (o >= P.nOut || r >= P.batch) { return; }
    var acc = B[o];
    let xoff = r * P.nIn;
    let woff = o * P.nIn;
    for (var k = 0u; k < P.nIn; k = k + 1u) {
        acc = acc + X[xoff + k] * W[woff + k];
    }
    if (P.act == 1u) { acc = max(acc, 0.0); }                          // relu
    if (P.act == 2u) { acc = 1.0 / (1.0 + exp(-acc)); }                // sigmoid
    Y[r * P.nOut + o] = acc;
}
`;

const ACT = { none: 0, relu: 1, sigmoid: 2 };

export class BatchedMLP {
    constructor(device, layers, batchCap = 64) {
        this.device = device;
        this.batchCap = batchCap;
        this.nIn = layers[0].nIn;
        this.nOut = layers[layers.length - 1].nOut;
        const maxW = Math.max(...layers.map(l => Math.max(l.nIn, l.nOut)));

        const d = device;
        const mod = d.createShaderModule({ code: WGSL });
        this.pipe = d.createComputePipeline({ layout: "auto", compute: { module: mod, entryPoint: "k_layer" } });

        const abBytes = batchCap * maxW * 4;
        const AB = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
        this.bA = d.createBuffer({ size: abBytes, usage: AB });
        this.bB = d.createBuffer({ size: abBytes, usage: AB });
        this.bStage = d.createBuffer({ size: batchCap * this.nOut * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });

        // per-layer static resources; uniforms rewritten per run only for batch
        this.layers = layers.map((l) => {
            const bW = d.createBuffer({ size: l.W.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            const bBias = d.createBuffer({ size: l.b.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
            d.queue.writeBuffer(bW, 0, l.W);
            d.queue.writeBuffer(bBias, 0, l.b);
            const uni = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            return { nIn: l.nIn, nOut: l.nOut, act: ACT[l.act ?? "none"] ?? 0, bW, bBias, uni, bgAB: null, bgBA: null };
        });

        // bind groups both ping-pong directions, built once
        for (const L of this.layers) {
            const mk = (src, dst) => d.createBindGroup({
                layout: this.pipe.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: L.uni } },
                    { binding: 1, resource: { buffer: src } },
                    { binding: 2, resource: { buffer: L.bW } },
                    { binding: 3, resource: { buffer: L.bBias } },
                    { binding: 4, resource: { buffer: dst } },
                ],
            });
            L.bgAB = mk(this.bA, this.bB);
            L.bgBA = mk(this.bB, this.bA);
        }
    }

    // v4 -- hot-swap a layer's weights (online learning). Rewrites the
    // existing GPU buffers; bind groups reference buffer OBJECTS, so no
    // rebuild needed -- same trick as the voxelrenderer VR3 reuse.
    updateWeights(layerIdx, W, b) {
        const L = this.layers[layerIdx];
        if (!L) return;
        this.device.queue.writeBuffer(L.bW, 0, W);
        if (b) this.device.queue.writeBuffer(L.bBias, 0, b);
    }

    // x: Float32Array(batch * nIn). Returns Float32Array(batch * nOut).
    async forward(x, batch) {
        if (batch === 0) return new Float32Array(0);
        if (batch > this.batchCap) throw new Error(`batch ${batch} > cap ${this.batchCap}`);
        const d = this.device;
        d.queue.writeBuffer(this.bA, 0, x.buffer, x.byteOffset, batch * this.nIn * 4);

        for (const L of this.layers) {
            const u = new Uint32Array([batch, L.nIn, L.nOut, L.act]);
            d.queue.writeBuffer(L.uni, 0, u);
        }

        const enc = d.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(this.pipe);
        let flip = false;                            // false: A->B, true: B->A
        for (const L of this.layers) {
            pass.setBindGroup(0, flip ? L.bgBA : L.bgAB);
            pass.dispatchWorkgroups(Math.ceil(L.nOut / 8), Math.ceil(batch / 8));
            flip = !flip;
        }
        pass.end();
        const finalBuf = flip ? this.bB : this.bA;   // buffer holding the last layer's OUTPUT
        enc.copyBufferToBuffer(finalBuf, 0, this.bStage, 0, batch * this.nOut * 4);
        d.queue.submit([enc.finish()]);

        await this.bStage.mapAsync(GPUMapMode.READ);
        const out = new Float32Array(this.bStage.getMappedRange().slice(0, batch * this.nOut * 4));
        this.bStage.unmap();
        return out;
    }
}
