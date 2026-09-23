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

import { pipelineWgsl, pipelineUniforms, bvhBuffersFromMesh, bvhBuffersFromTriSoup, sbtRecord, VIEW, EPS } from "../physics/render/rtPipeline.mjs";
import { meshTriples } from "../physics/splat/splatMesh.mjs";
import { GLBParser } from "../gpu/GLBParser.js";
import { citySceneMesh } from "../world/cityChunkScene.mjs";
import { buildTable } from "../physics/render/energyCompensation.mjs";
import { captureBaseCubemap, packCapturedAtlas } from "../physics/render/specularProbeCapture.mjs";
import { toHalf } from "../text/slugAtlas.js";
import { triNormal } from "../mesh/meshBVH.mjs";

export const DEFAULT_ALBEDO = Object.freeze([0.68, 0.66, 0.62]);
// RTX round 10 -- the microfacet material's own demo defaults. Roughness picked mid-range (neither a near-
// mirror nor near-Lambertian, so the material actually reads as distinct from the default rather than
// blending into it); ior 1.5 matches pathTracer.mjs's own dielectric default used throughout rtPipeline's gate.
export const DEFAULT_ROUGHNESS = 0.35;
export const DEFAULT_IOR = 1.5;
// RTX round 11 -- captureBaseCubemap()'s own cost is size*size*6 texel evaluations, each a SINGLE prefilterEnv
// sample (alpha=0, per its own "collapses to a point sample" doc) -- trivial at any reasonable size, so 32 is
// picked for a texture that reads as an actual atlas rather than a blocky 8x8, not for speed.
export const DEFAULT_ENV_FACE_SIZE = 32;
// RTX round 12 -- the demo light's own geometry, SCALED against a scene's own `mesh.bounds` rather than an
// absolute size (the two live scenes differ by 17x in bounds.radius: the pavement tile ~0.7, the city ~12).
// Scratch-verified before touching any gated file: r/d = radius/(offset-radius) -- distance to the light's own
// NEAR edge, the same conservative convention rtPipeline-selfcheck.mjs's own r/d comments use, NOT radius/offset
// -- is 0.6/(2.2-0.6) = 0.375 for BOTH scenes. That falls inside the range physics/render/rtPipeline-selfcheck.mjs's
// own NEE gates have actually measured as tractable: r/d~0.16 (section 11b, real clearance, no widening needed)
// up through r/d~0.33 and r/d~0.55 (sections 13/14, each widened there from a smaller, measurably "too noisy"
// value) -- not a value picked by eye.
// Placed ABOVE the scene (+Y) rather than to one side so it reads sensibly from the orbit camera's default
// framing regardless of which of the two scenes or which yaw/pitch a viewer orbits to.
export const DEFAULT_LIGHT_RADIUS_SCALE = 0.6;
export const DEFAULT_LIGHT_OFFSET_SCALE = 2.2;
export const DEFAULT_LIGHT_EMIT = 8;
// RTX round 13 -- makeSceneRadianceOf's own capture position, offset upward from mesh.bounds.center by
// bounds.radius * this scale -- see makeSceneRadianceOf's own doc for why bounds.center EXACTLY is degenerate
// for the real pavement-tile scene (every ray hits the tile's own closed interior). Re-measured directly
// against the real pavement.glb and the real citySceneMesh() city, not a fabricated stand-in: 0.5 gives a
// genuinely mixed hit/miss split for both (tile 29.2%/70.8%, city 43.8%/56.2%), not a value picked by eye.
export const DEFAULT_SCENE_CAPTURE_HEIGHT_SCALE = 0.5;

/**
 * RTX round 11 -- the ANALYTIC sky baked into a texture when `sky:"envMap"` is chosen. The gradient TERM is the
 * exact same formula physics/render/rtPipeline.mjs's own rtMiss/rtMissRgb compute inline for `gradient:true`
 * (`0.3 + 0.7*0.5*(d.y+1)`, matching physics/render/pathTracerGpu.mjs's own gradientSky twin) -- but a bare
 * re-bake of that alone would read as "the same picture, more expensively", not a real demonstration of what an
 * environment map is FOR. A small, fixed-direction sun highlight is added on top so the baked atlas is visibly
 * DISTINCT from the gradient it replaces, the same "reads as distinct, not blending into the default" taste
 * DEFAULT_ROUGHNESS's own comment already states. Purely analytic on purpose, matching the one existing envMap
 * gate's own precedent (physics/render/rtPipeline-selfcheck.mjs section 12 synthesizes its own atlas from an
 * analytic radianceOf() the identical way) -- a real capture-from-scene or HDRI-import pipeline is exactly the
 * "meaningfully more plumbing" rtpipeline-demo-wiring-microfacet-msComp's own closure named as still deferred.
 */
const ENV_SUN_DIR = Object.freeze((() => {
    const v = [0.35, 0.55, 0.3], l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
})());
export function envRadianceOf(pos, dir) {
    const g = 0.3 + 0.7 * 0.5 * (dir[1] + 1.0);
    const dot = Math.max(0, dir[0] * ENV_SUN_DIR[0] + dir[1] * ENV_SUN_DIR[1] + dir[2] * ENV_SUN_DIR[2]);
    const sun = Math.pow(dot, 400) * 6;
    return [g + sun, g + sun * 0.9, g + sun * 0.75];
}

/**
 * RTX round 13 -- the REAL capture-from-scene alternative `sky:"sceneCapture"` bakes through, in place of
 * envRadianceOf's purely analytic gradient+sun. Returns a `radianceOf(pos, dir)` function -- the exact contract
 * captureBaseCubemap() already takes, so it plugs into the SAME bake/pack/upload pipeline round 11 built with
 * zero changes to any of it -- that traces a REAL ray against `mesh`'s own BVH (mesh.bvh.bvh, the SAME
 * MeshBVH instance physics/render/rtPipeline.mjs's own bvhBuffersFromMesh/bvhBuffersFromTriSoup already build
 * and the GPU compute kernel already traverses -- physics/render/rtPipeline.mjs's own header, line ~614: the
 * GPU traversal is "ported from mesh/meshBVH.mjs's rayTriangle", so this is the SAME acceleration structure and
 * the SAME triangle data, not a second, independently-built one) via `raycastFirst()`. A hit is shaded with a
 * flat DEFAULT_ALBEDO times a simple ambient+NdotL term against the SAME ENV_SUN_DIR envRadianceOf's own sun
 * highlight uses (so a captured wall and an unlit sky read as lit by the same light, not two unrelated light
 * sources); a miss falls back to envRadianceOf(pos, dir) UNCHANGED -- the captured atlas is real geometry
 * silhouetted against the SAME analytic sky round 11 already shipped, not a second sky invented for this round.
 *
 * `pos` is the mesh's own `bounds.center` OFFSET UPWARD by `bounds.radius * DEFAULT_SCENE_CAPTURE_HEIGHT_SCALE`
 * -- NOT bounds.center exactly, and this was a real, adversarial-review-caught correction to this round's own
 * first draft. The reflection-probe convention this position follows (capture FROM the object's own location,
 * not from outside looking in -- the same reasoning envRadianceOf's fixed world-origin capture point never
 * needed, since it ignores `pos` entirely) is still the goal, but the FIRST scratch-verification of this round
 * tested the pavement-tile scene against a fabricated stand-in quad rather than the real GLB -- and the real
 * tile mesh is a thin, CLOSED box, so bounds.center sits literally inside its own solid interior: measured
 * directly against vendor/kenney-city/models/pavement.glb, EVERY ray from bounds.center hits the box's own
 * inner wall (1536/1536, 0 misses), making envRadianceOf's miss-fallback dead code and the "capture" just a
 * flat view of the box's own inside. The SAME height-offset shape round 12's own light placement already uses
 * (mesh.bounds.center + [0, bounds.radius*scale, 0], to clear a thin scene's own geometry) fixes it here too --
 * re-measured directly against BOTH real meshes (the real pavement.glb, not a stand-in, and the real
 * world/cityChunkScene.mjs city) at several candidate scales; 0.5 was the one that produced a genuinely mixed,
 * non-degenerate hit/miss split for BOTH (tile: 29.2% hit/70.8% miss; city: 43.8% hit/56.2% miss), not a value
 * picked by eye.
 */
/**
 * RTX round 13 -- makeSceneRadianceOf's own capture position, single-sourced here so makeRtSession's OWN
 * wiring and this file's gate call the IDENTICAL function rather than two independently-typed restatements of
 * the same formula (an adversarial review found a first draft of this gate re-derived the formula inline,
 * which meant a sabotage of makeRtSession's own bakePos line went unnoticed as long as the gate's own copy
 * stayed correct -- exactly the "two calls, no runtime cross-check" trap pipelineUniforms's own doc already
 * warns about for a different pair of calls). See DEFAULT_SCENE_CAPTURE_HEIGHT_SCALE's own doc for why the
 * offset exists at all.
 */
export function sceneCaptureBakePos(mesh) {
    return [mesh.bounds.center[0], mesh.bounds.center[1] + mesh.bounds.radius * DEFAULT_SCENE_CAPTURE_HEIGHT_SCALE, mesh.bounds.center[2]];
}

export function makeSceneRadianceOf(mesh) {
    const inst = mesh.bvh.bvh, tris = inst.tris;
    return (pos, dir) => {
        const hit = inst.raycastFirst(pos[0], pos[1], pos[2], dir[0], dir[1], dir[2]);
        if (!hit) return envRadianceOf(pos, dir);
        const n = triNormal(tris, hit.tri * 9);
        const ndotl = Math.max(0, n[0] * ENV_SUN_DIR[0] + n[1] * ENV_SUN_DIR[1] + n[2] * ENV_SUN_DIR[2]);
        const shade = 0.35 + 0.65 * ndotl;
        return [DEFAULT_ALBEDO[0] * shade, DEFAULT_ALBEDO[1] * shade, DEFAULT_ALBEDO[2] * shade];
    };
}

/**
 * The Uint16Array a real GPU texture upload needs for an "rgba16float" binding -- NOT what envMapTexture()'s own
 * `data` field carries. envMapTexture() (physics/render/rtPipeline.mjs) passes an atlas's raw Float32Array
 * straight through with a format LABEL, because its one caller (tools/ship/headlessGpu.mjs's
 * runWgslComputeNative) does its OWN separate half-float conversion before calling gpu.queue.writeTexture --
 * confirmed by reading that file directly rather than assumed from the label. gfx/device.js's device.texture()
 * does no such conversion: WebGPU's writeTexture copies raw bytes (8 bytes/texel for rgba16float, so a
 * Float32Array would upload its OWN 4-byte-per-channel bit pattern into a 2-byte-per-channel slot, reading back
 * as ~4 billion times too large or a subnormal near-zero, not merely imprecise) and WebGL2's HALF_FLOAT texImage2D
 * path requires the SAME already-packed half-float bits. text/slugAtlas.js's toHalf() is the canonical codec
 * (headlessGpu.mjs's own comment: its CPU reference "is graded against text/slugAtlas.js's toHalf/fromHalf
 * specifically") -- reused here rather than re-derived.
 */
export function packAtlasHalfFloat(atlas) {
    const half = new Uint16Array(atlas.data.length);
    for (let i = 0; i < atlas.data.length; i++) half[i] = toHalf(atlas.data[i]);
    return half;
}

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
 *
 * `sky` (RTX round 11, default "gradient") is that deferral closed: the FIRST production caller of `envMap`,
 * orthogonal to `material` (envMap composes freely with both rgb and microfacet -- pipelineWgsl() itself throws
 * only on envMap+gradient together, never envMap+rgb or envMap+microfacet). Left at its default, BYTE-IDENTICAL
 * WGSL and uniforms to before this round, the same rule `material` above already holds to. `sky:"envMap"` bakes
 * a small analytic sky (envRadianceOf(), this file's own JS twin of rtMiss's inline gradient formula plus a
 * fixed-direction sun highlight so the baked result reads as visibly distinct from the gradient it replaces)
 * into a real texture, ONCE at session creation -- see envRadianceOf's own doc above for why this is analytic
 * rather than a real scene capture or HDRI import, matching the one existing envMap gate's own precedent.
 *
 * `sky:"sceneCapture"` (RTX round 13) is that deferral closed in turn: a THIRD value, generating BYTE-IDENTICAL
 * WGSL to "envMap" (both set pipelineWgsl's own `envMap:true`) -- the difference is entirely in what the baked
 * ATLAS'S OWN CONTENT is, not in the generated shader text, so this is a scene-level change WGSL comparison
 * alone cannot see, the same shape round 12's own light-record probe exists to catch. Bakes through
 * makeSceneRadianceOf(mesh) (see that function's own doc above) instead of envRadianceOf -- a REAL ray traced
 * against the mesh's own BVH, not a second analytic formula.
 *
 * `direct` (RTX round 12, default "bsdf") is the FIRST production caller of `microfacet`'s own "nee"/"mis"
 * modes (round 8's own three-way option) -- and the first time this session's scene ever contains a real
 * light. Meaningful ONLY when `material` is "microfacet" (plain Lambertian's own `nee` is a boolean with no
 * MIS mode, a genuinely different, larger design fork this round does not take -- see the option's own inline
 * comment below). Left at its default, BYTE- AND SCENE-IDENTICAL to every round before this one: no light is
 * added to `sbt` unless `direct` is explicitly "nee" or "mis".
 */
export function makeRtSession(device, { mesh, w, h, albedo = DEFAULT_ALBEDO, gradient = true, spp = 1, eps = EPS,
                                          material = "lambertian", roughness = DEFAULT_ROUGHNESS, ior = DEFAULT_IOR,
                                          sky = "gradient", envFaceSize = DEFAULT_ENV_FACE_SIZE, direct = "bsdf" }) {
    if (material !== "lambertian" && material !== "microfacet") throw new Error(
        "rtViewer: material must be \"lambertian\" or \"microfacet\", got " + material);
    if (sky !== "gradient" && sky !== "envMap" && sky !== "sceneCapture") throw new Error(
        "rtViewer: sky must be \"gradient\", \"envMap\" or \"sceneCapture\", got " + sky);
    if (direct !== "bsdf" && direct !== "nee" && direct !== "mis") throw new Error(
        "rtViewer: direct must be \"bsdf\", \"nee\" or \"mis\", got " + direct);
    const { bvh } = mesh;
    const floats = w * h * 3;
    const isMicrofacet = material === "microfacet";
    const isSceneCapture = sky === "sceneCapture";
    const isEnvMap = sky === "envMap" || isSceneCapture;
    // A background adversarial review found this specific numeric option needed a guard `roughness`/`ior`
    // do not: those two feed into an otherwise well-formed (if numerically implausible) material regardless of
    // value, but captureBaseCubemap/packSpecularAtlas do NO validation of `size` at all -- 0, a negative
    // number, or a non-integer each silently produce a zero-length or ragged atlas (confirmed by direct trace:
    // size=0 -> {width:0,height:0,data.length:0}; size=-4 -> {width:0,height:-4,data.length:0}; size=3.5 ->
    // {width:21,height:3.5,data.length:294}), which device.texture() then accepts with no SYNCHRONOUS error at
    // all (WebGPU's own dimension validation is async, via error scopes) -- the exact silent-failure shape the
    // `sky must be...` throw two lines above exists to prevent for its own sibling option.
    if (isEnvMap && !(Number.isInteger(envFaceSize) && envFaceSize > 0)) throw new Error(
        "rtViewer: envFaceSize must be a positive integer, got " + envFaceSize);
    // Built once, at session creation, from `roughness` alone -- msComp is unconditional whenever `material`
    // is "microfacet" (see this function's own doc above on why there is no separate toggle for it).
    const msTable = isMicrofacet ? buildTable(roughness, { K: 24 }) : null;
    // RTX round 11 -- the SAME one-time-bake shape buildTable() above already established: a real, gated
    // capability (physics/render/rtPipeline.mjs's own envMap option, RTX round 7) with no production caller
    // until now. `sky:"envMap"` supersedes `gradient`'s own effect exactly the way `material:"microfacet"`
    // already supersedes `rgb`'s -- pipelineWgsl() itself throws on envMap+gradient together (round 7's own
    // "two different sky sources" refusal), so the two cannot both reach the generated WGSL at once.
    //
    // RTX round 13 -- `sky:"sceneCapture"` reuses this EXACT same bake/pack call, only swapping WHICH
    // radianceOf function and WHICH capture position feed it: makeSceneRadianceOf(mesh) instead of
    // envRadianceOf, and mesh.bounds.center height-offset by DEFAULT_SCENE_CAPTURE_HEIGHT_SCALE (see that
    // constant's own doc for why bounds.center EXACTLY is degenerate for the real pavement-tile scene) instead
    // of envRadianceOf's own meaningless-to-it world-origin (envRadianceOf ignores `pos` entirely, so [0,0,0]
    // cost it nothing -- makeSceneRadianceOf's own capture position is the whole point, see its doc above).
    // `sky:"envMap"`'s own capture position is left as [0,0,0] UNCHANGED, so this branch is a strict addition,
    // not a rework of round 11's own shipped behaviour.
    const bakeRadianceOf = isSceneCapture ? makeSceneRadianceOf(mesh) : envRadianceOf;
    const bakePos = isSceneCapture ? sceneCaptureBakePos(mesh) : [0, 0, 0];
    const envAtlas = isEnvMap ? packCapturedAtlas(captureBaseCubemap(bakeRadianceOf, bakePos, envFaceSize)) : null;
    const useGradient = isEnvMap ? false : gradient;
    // RTX round 12 -- `direct` is meaningful ONLY for the microfacet material (round 8's own three-way
    // `microfacet:"bsdf"|"nee"|"mis"` option; plain Lambertian's own `nee` is a boolean with no MIS mode at
    // all, confirmed by reading physics/render/rtPipeline.mjs directly -- see this function's own doc above
    // for why that made Lambertian NEE a separate, larger design fork this round does not take). `direct`
    // omitted (its own default "bsdf") is byte- AND scene-identical to every round before this one: no light
    // is added unless `direct` is EXPLICITLY set to "nee" or "mis". This is NOT because an unsampled light
    // would be invisible under "bsdf" -- it would not: rtPipeline.mjs's own `needsDirectState` gate
    // (`nee || microfacetOn`) is already true for "bsdf" too, and its emitter-hit branch adds radiance on ANY
    // ray, camera or ordinary BSDF-sampled bounce, that happens to land directly on an emitter, regardless of
    // `direct`; only NEE/MIS *sampling* the light on purpose (rather than merely stumbling into it) needs
    // `direct !== "bsdf"`. So a light added unconditionally whenever material is "microfacet" would render as
    // a plain bright sphere even under "bsdf" -- changing round 10's own already-shipped default bsdf-mode
    // picture, which this function's own opt-in discipline forbids. Gating on `direct !== "bsdf"` is what
    // avoids that picture-change, not a dodge around an invisible-light bug that was never actually at risk.
    const hasLight = isMicrofacet && direct !== "bsdf";
    const lightRecord = hasLight ? sbtRecord({
        centre: [mesh.bounds.center[0], mesh.bounds.center[1] + mesh.bounds.radius * DEFAULT_LIGHT_OFFSET_SCALE, mesh.bounds.center[2]],
        radius: mesh.bounds.radius * DEFAULT_LIGHT_RADIUS_SCALE, hit: "lambertian", albedo: 0, emit: DEFAULT_LIGHT_EMIT,
    }) : null;
    const sbt = hasLight ? [lightRecord] : [];

    const rtPipe = device.compute({ wgsl: isMicrofacet
        ? pipelineWgsl({ bvh: true, gradient: useGradient, microfacet: direct, msComp: true, envMap: isEnvMap })
        : pipelineWgsl({ bvh: true, rgb: true, gradient: useGradient, envMap: isEnvMap }) });
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
    // The captured environment atlas, bound as a REAL texture (gfx/device.js's own NAME-based bindTexture(),
    // not device.buffer()'s storage-binding path msE above uses) -- "tAtlas" is rtPipeline.mjs's own WGSL
    // binding name at ENV_BINDING, read verbatim from its @group(0)@binding(n) var declaration, not invented.
    const envTex = isEnvMap ? device.texture({ width: envAtlas.width, height: envAtlas.height,
        format: "rgba16float", data: packAtlasHalfFloat(envAtlas) }) : null;
    if (envTex) rtPipe.bindTexture("tAtlas", envTex);

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
            uBuf.write(pipelineUniforms(sbt, { spp, seed: frame, view, eps, rgb: !isMicrofacet,
                bvh: isMicrofacet
                    ? { nodeCount: bvh.nodeCount, triCount: bvh.triCount, hit: "microfacet", roughness, ior, msTable }
                    : { nodeCount: bvh.nodeCount, triCount: bvh.triCount, hit: "lambertian", albedo },
                ...(isMicrofacet ? { microfacet: direct, msComp: true } : {}),
                // pipelineUniforms's own `envMap` option takes the ATLAS OBJECT itself (matching `bvh`'s own
                // "take the descriptor" convention), not a boolean -- `isEnvMap` decides whether it is passed
                // at all, the SAME single flag pipelineWgsl's own envMap option above was built from.
                ...(isEnvMap ? { envMap: envAtlas } : {}) }));
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
            if (envTex) buffers.push(envTex);
            for (const b of buffers) { try { b.destroy(); } catch (e) {} }
        },
    });
}
