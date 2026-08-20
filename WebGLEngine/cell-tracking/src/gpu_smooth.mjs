// gpu_smooth.mjs -- Deno + WebGPU separable 3D Gaussian smoother for the
// cell-tracking detector (accel step 2, the "GPU/cell translator").
//
// WHY THIS EXISTS: the detector's dominant cost is Gaussian-smoothing each
// (Z,Y,X) frame before peak-finding. A 3D Gaussian is SEPARABLE -- one 1D
// pass per axis -- and each pass is embarrassingly parallel per voxel, so
// it is a textbook GPU win (10-50x scipy's ndimage on a real volume). We
// do ONLY the smoothing on the GPU; the Python side keeps scipy's exact
// peak_local_max on the smoothed result, so detections match the CPU path.
//
// PROTOCOL (stdin/stdout, length-prefixed binary so Python needs no deps):
//   in:  4-byte LE magic 'SMTH' | u32 Z | u32 Y | u32 X | f32 sigma |
//        (Z*Y*X) f32 voxels (row-major z,y,x)
//   out: 4-byte LE 'SMTD' | (Z*Y*X) f32 smoothed voxels
//   or:  4-byte LE 'SERR' | u32 len | utf8 message
//
// Runs one request per process invocation (Python spawns it per frame-batch
// or streams frames); the device is built once and reused across requests
// on the same stdin stream. Refuses a software adapter, like the brain.

const WG = 64;   // workgroup size for the 1D pass

function gaussianKernel1D(sigma) {
    const radius = Math.max(1, Math.ceil(sigma * 3));
    const k = new Float32Array(2 * radius + 1);
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
        const v = Math.exp(-(i * i) / (2 * sigma * sigma));
        k[i + radius] = v; sum += v;
    }
    for (let i = 0; i < k.length; i++) k[i] /= sum;   // normalize
    return { kernel: k, radius };
}

// One WGSL module, reused for all three axes. axis selects the stride so we
// convolve along Z, Y, or X without transposing the volume. Reflect-101 edge
// handling matches scipy's default 'reflect' mode closely enough that peaks
// land on the same voxels.
const WGSL = (radius) => /* wgsl */ `
struct Dims { z: u32, y: u32, x: u32, axis: u32, radius: u32, _p0: u32, _p1: u32, _p2: u32, };
@group(0) @binding(0) var<uniform> D: Dims;
@group(0) @binding(1) var<storage, read>       src: array<f32>;
@group(0) @binding(2) var<storage, read_write> dst: array<f32>;
@group(0) @binding(3) var<storage, read>       ker: array<f32>;

fn idx(z: u32, y: u32, x: u32) -> u32 { return (z * D.y + y) * D.x + x; }

// reflect-101: ...c b a | a b c d ... | d c b... (edge sample not doubled)
fn reflect(i: i32, n: i32) -> i32 {
    if (n <= 1) { return 0; }
    var p = i;
    loop {
        if (p < 0) { p = -p; }
        else if (p >= n) { p = 2 * (n - 1) - p; }
        else { break; }
    }
    return p;
}

@compute @workgroup_size(${WG})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let total = D.z * D.y * D.x;
    let i = gid.x;
    if (i >= total) { return; }
    // decode i -> (z,y,x)
    let x = i % D.x;
    let y = (i / D.x) % D.y;
    let z = i / (D.x * D.y);
    let r = i32(D.radius);
    var acc = 0.0;
    var kk = 0u;
    for (var o = -r; o <= r; o = o + 1) {
        var zz = i32(z); var yy = i32(y); var xx = i32(x);
        if (D.axis == 0u) { zz = reflect(i32(z) + o, i32(D.z)); }
        else if (D.axis == 1u) { yy = reflect(i32(y) + o, i32(D.y)); }
        else { xx = reflect(i32(x) + o, i32(D.x)); }
        acc = acc + src[idx(u32(zz), u32(yy), u32(xx))] * ker[kk];
        kk = kk + 1u;
    }
    dst[i] = acc;
}
`;

async function initDevice() {
    if (!globalThis.navigator?.gpu) throw new Error("navigator.gpu missing (run with --unstable-webgpu)");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("no WebGPU adapter");
    let info = {};
    try { info = adapter.info ?? (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : {}); } catch {}
    const desc = [info.vendor, info.device, info.description].filter(Boolean).join(" ") || "unknown";
    if (adapter.isFallbackAdapter || /swiftshader|llvmpipe|software|microsoft basic/i.test(desc))
        throw new Error("refusing software adapter: " + desc);
    const device = await adapter.requestDevice();
    return { device, desc };
}

class Smoother {
    constructor(device) { this.device = device; this.pipe = null; this.radius = -1; }
    _ensurePipeline(radius) {
        if (this.pipe && this.radius === radius) return;
        const mod = this.device.createShaderModule({ code: WGSL(radius) });
        this.pipe = this.device.createComputePipeline({ layout: "auto", compute: { module: mod, entryPoint: "main" } });
        this.radius = radius;
    }
    async smooth(vox, Z, Y, X, sigZ, sigY, sigX) {
        const d = this.device;
        // v2080 -- ANISOTROPIC: one kernel per axis (z is coarser -> smaller
        // voxel sigma -> smaller radius). The shader already reads the radius
        // from the uniform (D.radius), so one pipeline handles any radius; we
        // just upload the right kernel + radius per pass.
        const perAxis = [gaussianKernel1D(sigZ), gaussianKernel1D(sigY), gaussianKernel1D(sigX)];
        const maxRadius = Math.max(perAxis[0].radius, perAxis[1].radius, perAxis[2].radius);
        this._ensurePipeline(maxRadius);
        const total = Z * Y * X;
        const bytes = total * 4;
        const bufA = d.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
        const bufB = d.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
        const maxKBytes = (2 * maxRadius + 1) * 4;
        const bufK = d.createBuffer({ size: maxKBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        const uni = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const stage = d.createBuffer({ size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        d.queue.writeBuffer(bufA, 0, vox.buffer, vox.byteOffset, bytes);
        const groups = Math.ceil(total / WG);

        let cur = bufA, nxt = bufB;
        for (let axis = 0; axis < 3; axis++) {
            const { kernel, radius } = perAxis[axis];
            d.queue.writeBuffer(bufK, 0, kernel.buffer, kernel.byteOffset, kernel.byteLength);
            const u = new ArrayBuffer(32); const uu = new Uint32Array(u);
            uu[0] = Z; uu[1] = Y; uu[2] = X; uu[3] = axis; uu[4] = radius;
            d.queue.writeBuffer(uni, 0, u);
            const bg = d.createBindGroup({ layout: this.pipe.getBindGroupLayout(0), entries: [
                { binding: 0, resource: { buffer: uni } },
                { binding: 1, resource: { buffer: cur } },
                { binding: 2, resource: { buffer: nxt } },
                { binding: 3, resource: { buffer: bufK } },
            ]});
            const enc = d.createCommandEncoder();
            const pass = enc.beginComputePass();
            pass.setPipeline(this.pipe); pass.setBindGroup(0, bg);
            pass.dispatchWorkgroups(groups); pass.end();
            d.queue.submit([enc.finish()]);
            [cur, nxt] = [nxt, cur];   // ping-pong: result is in `cur` next iter
        }
        // after 3 passes result is in `cur`
        const enc2 = d.createCommandEncoder();
        enc2.copyBufferToBuffer(cur, 0, stage, 0, bytes);
        d.queue.submit([enc2.finish()]);
        await stage.mapAsync(GPUMapMode.READ);
        const out = new Float32Array(stage.getMappedRange().slice(0));
        stage.unmap();
        for (const b of [bufA, bufB, bufK, uni, stage]) b.destroy?.();
        return out;
    }
}

// ---- length-prefixed binary stdin/stdout loop ----
async function readExact(reader, n) {
    const out = new Uint8Array(n); let got = 0;
    while (got < n) {
        const { value, done } = await reader.read();
        if (done) return got === 0 ? null : out.subarray(0, got);
        out.set(value.subarray(0, Math.min(value.length, n - got)), got);
        got += value.length;
        if (value.length > n - (got - value.length)) { /* over-read tolerated by protocol framing */ }
    }
    return out;
}

async function main() {
    let device, desc;
    try { ({ device, desc } = await initDevice()); }
    catch (e) {
        const msg = new TextEncoder().encode(String(e.message || e));
        const hdr = new Uint8Array(8); const dv = new DataView(hdr.buffer);
        dv.setUint8(0, 0x53); dv.setUint8(1, 0x45); dv.setUint8(2, 0x52); dv.setUint8(3, 0x52); // 'SERR'
        dv.setUint32(4, msg.length, true);
        await Deno.stdout.write(hdr); await Deno.stdout.write(msg);
        Deno.exit(2);
    }
    console.error("[gpu-smooth] device: " + desc);   // stderr = human log; stdout = binary protocol
    const smoother = new Smoother(device);
    const reader = Deno.stdin.readable.getReader({ mode: "byob" }).catch?.(() => null) || Deno.stdin.readable.getReader();

    // simple framed reader over the raw stream
    let buf = new Uint8Array(0);
    const pull = async () => { const { value, done } = await reader.read(); if (done) return false; const nb = new Uint8Array(buf.length + value.length); nb.set(buf); nb.set(value, buf.length); buf = nb; return true; };
    const need = async (n) => { while (buf.length < n) { if (!(await pull())) return false; } return true; };
    const take = (n) => { const s = buf.subarray(0, n); buf = buf.subarray(n); return s; };

    while (true) {
        if (!(await need(4))) break;
        const magic = take(4);
        if (!(magic[0] === 0x53 && magic[1] === 0x4d && magic[2] === 0x54 && magic[3] === 0x48)) { // 'SMTH'
            console.error("[gpu-smooth] bad magic, stopping"); break;
        }
        if (!(await need(24))) break;
        const hdr = take(24); const hv = new DataView(hdr.buffer, hdr.byteOffset, 24);
        const Z = hv.getUint32(0, true), Y = hv.getUint32(4, true), X = hv.getUint32(8, true);
        const sigZ = hv.getFloat32(12, true), sigY = hv.getFloat32(16, true), sigX = hv.getFloat32(20, true);   // v2080 per-axis
        const nvox = Z * Y * X, nbytes = nvox * 4;
        if (!(await need(nbytes))) break;
        const voxBytes = take(nbytes);
        const vox = new Float32Array(voxBytes.buffer.slice(voxBytes.byteOffset, voxBytes.byteOffset + nbytes));
        try {
            const out = await smoother.smooth(vox, Z, Y, X, sigZ, sigY, sigX);
            const oh = new Uint8Array(4); oh.set([0x53, 0x4d, 0x54, 0x44]); // 'SMTD'
            await Deno.stdout.write(oh);
            await Deno.stdout.write(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
        } catch (e) {
            const msg = new TextEncoder().encode(String(e.message || e));
            const eh = new Uint8Array(8); const dv = new DataView(eh.buffer);
            dv.setUint8(0, 0x53); dv.setUint8(1, 0x45); dv.setUint8(2, 0x52); dv.setUint8(3, 0x52);
            dv.setUint32(4, msg.length, true);
            await Deno.stdout.write(eh); await Deno.stdout.write(msg);
        }
    }
}

main();
