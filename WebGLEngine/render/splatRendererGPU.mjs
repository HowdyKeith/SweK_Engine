// WebGLEngine/render/splatRendererGPU.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// GAUSSIAN SPLATS ON WEBGPU, DRAWN STRAIGHT FROM THE CARD'S OWN SORT. Keith: "a WebGPU splat renderer that draws from the sorted list. The current splat
// renderer uses WebGL2 and can't read it." Backlog: render/BACKLOG_2026-11-21_PLAYCANVAS.md, `splat-gpu-sort`, its next step.
//
// WHAT HAPPENS EACH FRAME, ALL ON THE CARD. render/splatSortGPU.mjs makes every splat's depth key from its position and sorts the indices (back to front);
// the vertex shader then reads splat `indices[instance]` out of that sorted buffer. NOTHING COMES BACK TO THE CPU AND NOTHING IS RE-UPLOADED: the
// WebGL2 renderer (engine/SplatRenderer.js) sorts on the CPU and then copies all five attribute arrays into sorted order and uploads them, every time the
// camera moves.
//
// THE MATH IS engine/SplatRenderer.js's (v342: Kerbl et al. 2023's covariance projection), ported line for line to WGSL: Σ = R·S²·Rᵀ, T = J·W,
// Σ₂ = T·Σ·Tᵀ with a one-pixel blur on the diagonal, the conic (c, -b, a)/det, a 3σ square from the larger eigenvalue, a splat behind z = 0.01 or with a
// non-positive determinant culled, alpha = min(0.99, sigmoid(opacity)·exp(power)) and dropped below 0.003. tools/ship/splatRendererGPU-selfcheck.mjs
// holds the pixels to a CPU evaluation of exactly this.
//
// ONE DELIBERATE DIFFERENCE: THE BLEND. engine/SplatRenderer.js blends with (ONE, ONE_MINUS_SRC_ALPHA) but writes its colour NOT multiplied by alpha, so a
// faint edge (alpha 0.01) adds its colour at full strength and every splat gets a bright halo out to its 3σ square. "Over" back to front is
// colour·alpha + below·(1 - alpha); with that blend the colour must be premultiplied, and here it is. The gate measures the difference.
//
// WHAT IS NOT HERE: spherical harmonics (band 0 only, as in the WebGL2 renderer), a page that uses it, level of detail and streaming (the backlog's next
// item), and a time on a real GPU.
"use strict";
import { createGpuRadixSort } from "./splatSortGPU.mjs";

export const SPLAT_WGSL = `
struct Frame { view: mat4x4<f32>, proj: mat4x4<f32>, offset: vec4<f32>, viewport: vec4<f32> };   // offset.w = the cloud's scale
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> order: array<u32>;      // the sorted indices, back to front (splatSortGPU)
@group(0) @binding(2) var<storage, read> pos: array<f32>;        // x, y, z
@group(0) @binding(3) var<storage, read> scl: array<f32>;        // log-space scale x, y, z
@group(0) @binding(4) var<storage, read> col: array<f32>;        // r, g, b
@group(0) @binding(5) var<storage, read> opa: array<f32>;        // pre-sigmoid opacity
@group(0) @binding(6) var<storage, read> rot: array<f32>;        // quaternion w, x, y, z

struct VOut { @builtin(position) clip: vec4<f32>, @location(0) offset: vec2<f32>, @location(1) conic: vec3<f32>, @location(2) color: vec3<f32>, @location(3) opacity: f32 };

fn quatToMat3(q0: vec4<f32>) -> mat3x3<f32> {
    let q = normalize(q0);
    let w = q.x; let x = q.y; let y = q.z; let z = q.w;
    return mat3x3<f32>(
        vec3<f32>(1.0 - 2.0*(y*y + z*z), 2.0*(x*y + w*z),       2.0*(x*z - w*y)),
        vec3<f32>(2.0*(x*y - w*z),       1.0 - 2.0*(x*x + z*z), 2.0*(y*z + w*x)),
        vec3<f32>(2.0*(x*z + w*y),       2.0*(y*z - w*x),       1.0 - 2.0*(x*x + y*y)));
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VOut {
    var o: VOut;
    o.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0); o.offset = vec2<f32>(0.0); o.conic = vec3<f32>(0.0); o.color = vec3<f32>(0.0); o.opacity = 0.0;
    let corner = vec2<f32>(select(-1.0, 1.0, (vi & 1u) == 1u), select(-1.0, 1.0, (vi & 2u) == 2u));   // a triangle strip: (-1,-1) (1,-1) (-1,1) (1,1)
    let i = order[ii];
    let ws = F.offset.w;
    let worldP = vec3<f32>(pos[i*3u], pos[i*3u+1u], pos[i*3u+2u]) * ws + F.offset.xyz;
    let viewP = F.view * vec4<f32>(worldP, 1.0);
    let z = -viewP.z;
    if (z < 0.01) { return o; }
    let R = quatToMat3(vec4<f32>(rot[i*4u], rot[i*4u+1u], rot[i*4u+2u], rot[i*4u+3u]));
    let s = exp(vec3<f32>(scl[i*3u], scl[i*3u+1u], scl[i*3u+2u])) * ws;
    let M = R * mat3x3<f32>(vec3<f32>(s.x, 0.0, 0.0), vec3<f32>(0.0, s.y, 0.0), vec3<f32>(0.0, 0.0, s.z));
    let cov3D = M * transpose(M);
    let fx = F.proj[0][0];
    let fy = F.proj[1][1];
    let J = mat3x3<f32>(vec3<f32>(fx / z, 0.0, 0.0), vec3<f32>(0.0, fy / z, 0.0), vec3<f32>(-fx * viewP.x / (z*z), -fy * viewP.y / (z*z), 0.0));
    let W = mat3x3<f32>(F.view[0].xyz, F.view[1].xyz, F.view[2].xyz);
    let T = J * W;
    let cov2D = T * cov3D * transpose(T);
    let blur = 2.0 / F.viewport.y;
    let a = cov2D[0][0] + blur;
    let b = cov2D[0][1];
    let c = cov2D[1][1] + blur;
    let det = a * c - b * b;
    if (det <= 0.0) { return o; }
    let mid = 0.5 * (a + c);
    let disc = max(0.0, mid*mid - det);
    let radius = 3.0 * sqrt(max(mid + sqrt(disc), mid - sqrt(disc)));
    var clipP = F.proj * viewP;
    clipP = vec4<f32>(clipP.xy + corner * radius * clipP.w, clipP.zw);
    o.clip = clipP;
    o.offset = corner * radius;
    o.conic = vec3<f32>(c, -b, a) / det;
    o.color = vec3<f32>(col[i*3u], col[i*3u+1u], col[i*3u+2u]);
    o.opacity = 1.0 / (1.0 + exp(-opa[i]));
    return o;
}

@fragment
fn fs(v: VOut) -> @location(0) vec4<f32> {
    let power = -0.5 * (v.conic.x * v.offset.x * v.offset.x + v.conic.z * v.offset.y * v.offset.y) - v.conic.y * v.offset.x * v.offset.y;
    if (power > 0.0) { discard; }
    let alpha = min(0.99, v.opacity * exp(power));
    if (alpha < 0.003) { discard; }
    return vec4<f32>(v.color * alpha, alpha);   // PREMULTIPLIED, for the (one, one-minus-src-alpha) blend: see the header
}`;

/**
 * A splat cloud on `device`, drawn into a `format` target. `splat` is engine/splatParser.js's shape: { count, positions, scales, colors, opacities, quats }
 * (Float32Arrays: 3, 3, 3, 1, 4 per splat). Returns { draw(encoder, { view, proj, camera, target, width, height, clear? }), sorter, position, scale, destroy }.
 */
export function createSplatRendererGPU(device, splat, { format = "rgba8unorm", usage = globalThis.GPUBufferUsage, mapMode = globalThis.GPUMapMode, capacity = splat.count } = {}) {
    const U = usage; let n = splat.count;   // `capacity` (2026-11-21, render/splatLod.mjs): room for a cut of a bigger cloud; update() swaps the splats drawn
    if (!(n > 0)) throw new Error("splatRendererGPU: an empty cloud");
    if (!(capacity >= n)) throw new Error(`splatRendererGPU: capacity ${capacity} is less than the cloud's ${n} splats`);
    const lens = { positions: 3, scales: 3, colors: 3, opacities: 1, quats: 4 };
    for (const [k, w] of Object.entries(lens)) if (!splat[k] || splat[k].length !== n * w) throw new Error(`splatRendererGPU: splat.${k} must hold ${w} numbers a splat (${n * w})`);
    const W = { pos: 3, scl: 3, col: 3, opa: 1, rot: 4 }, F = { pos: "positions", scl: "scales", col: "colors", opa: "opacities", rot: "quats" };
    const B = Object.fromEntries(Object.entries(W).map(([k, w]) => [k, device.createBuffer({ size: Math.max(16, capacity * w * 4), usage: U.STORAGE | U.COPY_DST })]));
    const upload = (c) => { for (const k of Object.keys(W)) device.queue.writeBuffer(B[k], 0, c[F[k]], 0, c.count * W[k]); };
    upload(splat);
    const frame = device.createBuffer({ size: 160, usage: U.UNIFORM | U.COPY_DST });
    const sorter = createGpuRadixSort(device, { capacity, usage: U, mapMode });
    const module = device.createShaderModule({ code: SPLAT_WGSL });
    const blend = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } };
    const pipeline = device.createRenderPipeline({ layout: "auto", vertex: { module, entryPoint: "vs" }, fragment: { module, entryPoint: "fs", targets: [{ format, blend }] }, primitive: { topology: "triangle-strip" } });
    const bind = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [frame, sorter.indices, B.pos, B.scl, B.col, B.opa, B.rot].map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const self = { sorter, position: [0, 0, 0], scale: 1, _last: null, capacity };
    /** Draw a different set of splats from now on (a level-of-detail cut): at most `capacity`, written over the old; the next draw re-sorts. */
    self.update = (c) => {
        if (!(c.count > 0 && c.count <= capacity)) throw new Error(`splatRendererGPU.update: ${c.count} splats is outside 1-${capacity}`);
        for (const [k, w] of Object.entries(lens)) if (!c[k] || c[k].length < c.count * w) throw new Error(`splatRendererGPU.update: splat.${k} must hold ${w} numbers a splat`);
        upload(c); n = c.count; self._last = null;
    };
    Object.defineProperty(self, "count", { get: () => n });
    /** Sort on the card if the camera moved, then draw the cloud into `target` (a GPUTextureView), back to front. */
    self.draw = (encoder, { view, proj, camera, target, width, height, clear = null, timer = null }) => {   // `timer`: render/gpuTimer.mjs, passes labelled keys, sort, draw
        const key = camera.join() + "|" + self.position.join() + "|" + self.scale;
        if (key !== self._last) { sorter.encodeDepthKeys(encoder, B.pos, n, { camera, origin: self.position, scale: self.scale, timer }); sorter.encode(encoder, n, { timer }); self._last = key; }
        const f = new Float32Array(40); f.set(view, 0); f.set(proj, 16); f.set([self.position[0], self.position[1], self.position[2], self.scale, width, height, 0, 0], 32);
        device.queue.writeBuffer(frame, 0, f);
        const rp = encoder.beginRenderPass({ colorAttachments: [{ view: target, loadOp: clear ? "clear" : "load", clearValue: clear || [0, 0, 0, 0], storeOp: "store" }], ...(timer && timer.writes ? (() => { const w = timer.writes("draw"); return w ? { timestampWrites: w } : {}; })() : {}) });
        rp.setPipeline(pipeline); rp.setBindGroup(0, bind); rp.draw(4, n); rp.end();
    };
    self.destroy = () => { for (const b of Object.values(B)) b.destroy(); frame.destroy(); sorter.destroy(); };
    return self;
}
