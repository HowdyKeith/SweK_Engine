// WebGLEngine/render/rtViewer.mjs
//
// RTX ROUND 3 -- THE PRESENT PATH. Rounds 1-2 (physics/render/rtPipeline.mjs) gave the mesh a BVH, barycentric
// vertex colour and vec3 albedo; neither round drew a pixel to a screen. This is the third stage the gameplan
// asked for: a real GLB, an orbit camera, progressive accumulation, and a picture on a canvas.
//
// *** NOTHING HERE REACHES INTO rtPipeline.mjs's OWN WGSL. *** Its `pipelineWgsl({bvh:true, rgb:true})` compute
// kernel is used exactly as Round 2 left it, through gfx/device.js's NAME-based binding (device.compute() +
// classify()/bindByName) rather than the index-based `inputs` array physics/render/rtPipeline-selfcheck.mjs's
// runWgslCompute() uses -- this is the first caller to run that WGSL through gfx/device.js at all, so the
// binding names below (outBuf, U, bvhBounds, bvhMeta, bvhOrder, bvhTris) are read from rtPipeline.mjs's own
// `@group(0) @binding(n) var<...> NAME` declarations, not invented.
//
// TWO SMALL KERNELS ARE ADDED HERE, NEITHER OF WHICH TOUCHES A MESH OR A CAMERA:
//   accumulateWgsl  a running mean, accumBuf[i] += (frameBuf[i]-accumBuf[i])/n -- Welford-style, so accumBuf
//                   always holds a directly displayable average and a camera move resets by restarting n at 1
//                   (which makes the update a full overwrite) rather than by a separate zero-fill pass.
//   presentWgsl     a fullscreen triangle whose fragment reads accumBuf DIRECTLY as a storage buffer -- no
//                   texture, no copy. There is no copyBufferToTexture anywhere in this tree outside vendor/;
//                   the established idiom (mpm-gpu.html, fluid-webgpu.html) is to bind one compute pass's
//                   storage output straight into the next pass's input, which is what pass.storage() is for.
//
// WHAT THIS FILE DOES NOT CLAIM: that accumulation across per-frame dispatches is bit-exact against a single
// large-spp dispatch of the same total sample count. It is not -- rngState is seeded once per DISPATCH from
// (seed,x,y) and evolves only within that dispatch's own spp loop, so N frames of spp=1 walk a genuinely
// different random sequence than one frame of spp=N. tools/ship/rtViewer-selfcheck.mjs's primary check is
// therefore the accumulate kernel's arithmetic in ISOLATION, against fabricated input -- exact and decoupled
// from path-tracing noise entirely -- with only an informal secondary sanity pass (no NaN/Inf, real spatial
// variance) against a real mesh. The genuine statistical (measured-noise-bound) gate this would need to claim
// bit-for-bit parity is task #99, not this round.
"use strict";

import { pipelineWgsl, pipelineUniforms, bvhBuffersFromMesh, bvhBuffersFromTriSoup, VIEW, EPS } from "../physics/render/rtPipeline.mjs";
import { meshTriples } from "../physics/splat/splatMesh.mjs";
import { GLBParser } from "../gpu/GLBParser.js";
import { citySceneMesh } from "../world/cityChunkScene.mjs";
import { buildTable } from "../physics/render/energyCompensation.mjs";

export const DEFAULT_ALBEDO = Object.freeze([0.68, 0.66, 0.62]);
// RTX round 10 -- the microfacet material's own demo defaults. Roughness picked mid-range (neither a near-
// mirror nor near-Lambertian, so the material actually reads as distinct from the default rather than
// blending into it); ior 1.5 matches pathTracer.mjs's own dielectric default used throughout rtPipeline's gate.
export const DEFAULT_ROUGHNESS = 0.35;
export const DEFAULT_IOR = 1.5;

/**
 * Axis-aligned bounds of a bvhBuffersFromMesh() result. Node 0 is always the BVH's root, and the root's own
 * box (mesh/meshBVH.mjs's build) already covers every triangle -- so this reads it rather than re-scanning
 * the mesh's positions a second time.
 */
export function meshBounds(bvh) {
    const b = bvh.bounds.subarray(0, 6);
    const center = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
    const radius = Math.max(1e-4, Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2);
    return Object.freeze({ min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]], center, radius });
}

/**
 * Parsed GLB bytes -> a BVH ready for rtPipeline, via the exact bridge mesh/colliderFromGLB.mjs already uses:
 * GLBParser.parse -> splatMesh.mjs's meshTriples (flat -> nested triples) -> rtPipeline.mjs's bvhBuffersFromMesh.
 * Skinned GLBs are out of scope here for the same reason colliderFromGLB.mjs names: the scene-graph walk this
 * depends on only fully bakes an UNSKINNED file to world space.
 */
export async function loadMeshBvh(arrayBuffer, opts = {}) {
    const parsed = await GLBParser.parse(arrayBuffer, opts.parse || {});
    const { positions, indices } = meshTriples({ positions: parsed.positions, indices: parsed.indices });
    const bvh = bvhBuffersFromMesh(positions, indices, opts.bvh || {});
    return Object.freeze({ bvh, bounds: meshBounds(bvh), vertexCount: positions.length, triangleCount: indices.length });
}

/**
 * RTX ROUND 5 -- the same {bvh, bounds, vertexCount, triangleCount} shape loadMeshBvh() returns, so
 * makeRtSession() below (which only ever reads `mesh.bvh`) needs no changes to render either scene: a
 * procedurally generated building (world/cityChunkScene.mjs's citySceneMesh(), itself CityGen.js + the same
 * greedy mesher every kaiju world's on-screen terrain already uses) via bvhBuffersFromTriSoup() rather than
 * loadMeshBvh()'s GLB-and-indices path -- there is no GLB here, and no indices, only chunkMesherCore.js's own
 * already-flat, world-space triangle soup.
 */
export function loadCityBvh(opts = {}) {
    const scene = citySceneMesh(opts.scene || {});
    const bvh = bvhBuffersFromTriSoup(scene.verts, opts.bvh || {});
    return Object.freeze({ bvh, bounds: meshBounds(bvh), vertexCount: scene.vertexCount, triangleCount: scene.triangleCount });
}

/**
 * Spherical orbit around `center`: yaw/pitch in radians, dist a scalar. kenney-kit.html's own formula,
 * restated here rather than imported -- that page's version is wired straight to its own pointer handlers.
 */
export function orbitEye({ yaw = 0, pitch = 0.4, dist = 4, center = [0, 0, 0] } = {}) {
    const cp = Math.cos(pitch);
    return Object.freeze({
        eye: [center[0] + dist * Math.sin(yaw) * cp, center[1] + dist * Math.sin(pitch), center[2] + dist * Math.cos(yaw) * cp],
        look: center.slice(), up: [0, 1, 0],
    });
}

/**
 * The accumulate kernel. `count` is the total float count (w*h*3), baked as a const because it only changes
 * on resize, which already needs new buffers. Pure elementwise arithmetic -- no knowledge of pixels, rays, or
 * the mesh at all, which is what makes it checkable against fabricated input independent of path-tracing noise.
 *
 * accumBuf is bound at 0 and frameBuf at 2 (not the reverse) so tools/ship/webgpuHarness.mjs's runWgslCompute
 * can grade this kernel directly: it always reads back binding 0 and seeds it from `outInit`, and binds a
 * uniform at 1 when given one -- accumBuf (the output this test cares about, with its PRIOR value as outInit)
 * and F both land where that harness already expects them, with frameBuf as an ordinary `inputs` entry. The
 * numeric index is otherwise irrelevant: gfx/device.js's own binding is by NAME (see makeRtSession below),
 * never by this number.
 */
export function accumulateWgsl(count) {
    return `
@group(0) @binding(0) var<storage, read_write> accumBuf : array<f32>;
@group(0) @binding(1) var<uniform> F : vec4<f32>;
@group(0) @binding(2) var<storage, read> frameBuf : array<f32>;
const N : u32 = ${count}u;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  if (i >= N) { return; }
  let n = F.x;
  accumBuf[i] = accumBuf[i] + (frameBuf[i] - accumBuf[i]) / n;
}
`;
}

/**
 * The present kernel: an attributeless fullscreen triangle (the tree's standard "big triangle" trick, e.g.
 * gfx/device.js's own MIP_BLIT_WGSL) whose fragment reads accumBuf at the fragment's own pixel index. W/H are
 * baked as consts rather than a uniform for the same resize reasoning as accumulateWgsl's `count`.
 */
export function presentWgsl(w, h) {
    return `
@group(0) @binding(0) var<storage, read> accumBuf : array<f32>;
const W : i32 = ${w};

struct VSOut { @builtin(position) pos : vec4<f32> };
@vertex fn vs(@builtin(vertex_index) vi : u32) -> VSOut {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var o : VSOut;
  o.pos = vec4<f32>(p[vi], 0.0, 1.0);
  return o;
}
@fragment fn fs(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
  let x = i32(pos.x);
  let y = i32(pos.y);
  let idx = (y * W + x) * 3;
  let r = clamp(accumBuf[idx], 0.0, 1.0);
  let g = clamp(accumBuf[idx + 1], 0.0, 1.0);
  let b = clamp(accumBuf[idx + 2], 0.0, 1.0);
  return vec4<f32>(r, g, b, 1.0);
}
`;
}

/**
 * Wires rtPipeline.mjs's bvh compute kernel, the accumulate kernel and the present kernel through one
 * gfx/device.js device, sharing storage buffers by NAME across pipelines rather than copying between them
 * (outBuf is bound to the raytrace pipeline as its output AND to the accumulate pipeline as `frameBuf`;
 * accumBuf is bound to the accumulate pipeline as read_write AND to the present pipeline as read).
 *
 * `material` (RTX round 10, default "lambertian") is the FIRST production caller of `microfacet`/`msComp` --
 * every gate exercising them until now was physics/render/rtPipeline-selfcheck.mjs alone (see that file's own
 * backlog entries naming this gap directly). Left at its default, this function's own generated WGSL and
 * uniforms are BYTE-IDENTICAL to before this round -- the same "a caller which never asks for a capability
 * sees no change" rule `rgb`/`bvh`/`nee`/`microfacet` itself all already hold to; `material: "microfacet"` is
 * opt-in. There is no THIRD, msComp-less microfacet mode here on purpose: msComp is what rtpipeline-
 * multiscatter-energy-compensation's own round completed the material's story with, and a demo page choosing
 * between three material buttons is more surface than this round's scope asks for -- see this round's own
 * backlog entry for why envMap (the OTHER capability task #142 names) is deferred rather than added here too.
 */
export function makeRtSession(device, { mesh, w, h, albedo = DEFAULT_ALBEDO, gradient = true, spp = 1, eps = EPS,
                                          material = "lambertian", roughness = DEFAULT_ROUGHNESS, ior = DEFAULT_IOR }) {
    if (material !== "lambertian" && material !== "microfacet") throw new Error(
        "rtViewer: material must be \"lambertian\" or \"microfacet\", got " + material);
    const { bvh } = mesh;
    const floats = w * h * 3;
    const isMicrofacet = material === "microfacet";
    // Built once, at session creation, from `roughness` alone -- msComp is unconditional whenever `material`
    // is "microfacet" (see this function's own doc above on why there is no separate toggle for it).
    const msTable = isMicrofacet ? buildTable(roughness, { K: 24 }) : null;

    const rtPipe = device.compute({ wgsl: isMicrofacet
        ? pipelineWgsl({ bvh: true, gradient, microfacet: "bsdf", msComp: true })
        : pipelineWgsl({ bvh: true, rgb: true, gradient }) });
    const outBuf = device.buffer({ usage: "storage", size: floats * 4 });
    const uBuf = device.buffer({ usage: "uniform", data: new Float32Array(24 * 4) });
    const boundsBuf = device.buffer({ usage: "storage", data: bvh.bounds });
    const metaBuf = device.buffer({ usage: "storage", data: bvh.meta });
    const orderBuf = device.buffer({ usage: "storage", data: bvh.order });
    const trisBuf = device.buffer({ usage: "storage", data: bvh.tris });
    rtPipe.bind("outBuf", outBuf);
    rtPipe.bind("U", uBuf);
    rtPipe.bind("bvhBounds", boundsBuf);
    rtPipe.bind("bvhMeta", metaBuf);
    rtPipe.bind("bvhOrder", orderBuf);
    rtPipe.bind("bvhTris", trisBuf);
    // The shared multi-scatter E(mu) table (physics/render/rtPipeline.mjs's own `msE` binding, msComp:true's
    // one pipeline-level storage buffer -- see sbtRecord's own doc on why this is shared rather than per-record).
    const msBuf = isMicrofacet ? device.buffer({ usage: "storage", data: Float32Array.from(msTable.E) }) : null;
    if (msBuf) rtPipe.bind("msE", msBuf);

    const accumPipe = device.compute({ wgsl: accumulateWgsl(floats) });
    const accumBuf = device.buffer({ usage: "storage", size: floats * 4 });
    const fBuf = device.buffer({ usage: "uniform", data: new Float32Array(4) });
    accumPipe.bind("frameBuf", outBuf);
    accumPipe.bind("accumBuf", accumBuf);
    accumPipe.bind("F", fBuf);

    const presentPipe = device.pipeline({ shaders: { wgsl: presentWgsl(w, h) } });

    const rayWg = Math.ceil((w * h) / 64), accumWg = Math.ceil(floats / 64);
    let frame = 0;

    return Object.freeze({
        w, h, outBuf, accumBuf,
        /** Restart progressive accumulation (a camera move): n=1 next frame fully overwrites accumBuf. */
        reset() { frame = 0; },
        frameCount() { return frame; },
        /** Dispatch one more sample, accumulate it, and present. `opts` passes straight to device.frame --
         * {} presents to the canvas the device was created against; {offscreen:true, read:true} is the
         * gate-safe path every other device gate in this tree uses. */
        renderFrame(view, opts = {}) {
            frame++;
            // `rgb`/`bvh.hit`/`microfacet`/`msComp` here MUST match the options `pipelineWgsl()` generated this
            // pipeline's own WGSL text with above -- rtPipeline.mjs's own doc on pipelineUniforms names this a
            // silent-misrender trap with no runtime cross-check across two independent calls; `isMicrofacet` is
            // the ONE flag both sides are computed from, on purpose, so the two calls cannot drift apart.
            uBuf.write(pipelineUniforms([], { spp, seed: frame, view, eps, rgb: !isMicrofacet,
                bvh: isMicrofacet
                    ? { nodeCount: bvh.nodeCount, triCount: bvh.triCount, hit: "microfacet", roughness, ior, msTable }
                    : { nodeCount: bvh.nodeCount, triCount: bvh.triCount, hit: "lambertian", albedo },
                ...(isMicrofacet ? { microfacet: "bsdf", msComp: true } : {}) }));
            fBuf.write(new Float32Array([frame, 0, 0, 0]));
            return device.frame(({ pass }) => {
                pass.dispatch(rtPipe, rayWg);
                pass.dispatch(accumPipe, accumWg);
                pass.clear([0, 0, 0, 1]);
                pass.use(presentPipe);
                pass.storage("accumBuf", accumBuf);
                pass.draw(3, 1);
            }, opts);
        },
        destroy() {
            const buffers = [outBuf, uBuf, boundsBuf, metaBuf, orderBuf, trisBuf, accumBuf, fBuf];
            if (msBuf) buffers.push(msBuf);
            for (const b of buffers) { try { b.destroy(); } catch (e) {} }
        },
    });
}
