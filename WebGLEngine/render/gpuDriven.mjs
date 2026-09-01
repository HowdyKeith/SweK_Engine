// WebGLEngine/render/gpuDriven.mjs -- v4299 (Level 11)
//
// LEVEL 11: GPU-DRIVEN RENDERING. A compute pass culls every instance against the view frustum, picks its level
// of detail from its angular size, and writes the draw commands; the render pass then draws each LOD with ONE
// drawIndexedIndirect, never learning how many instances survived. The CPU never touches the instance list per
// frame -- it uploads the camera and submits.
//
// ---- WHAT TRAVELS TO WebGL2, AND WHAT DOES NOT --------------------------------------------------------------
//
// WebGL2 has no compute stage and no indirect draw, and gfx/device.js refuses both BY NAME on that backend. What
// it does have is instancing and indexed draws, so the same scene draws there through the CPU TWIN: cullLodCpu()
// produces the identical per-LOD instance records the compute shader writes, they go up as an instance-stepped
// vertex buffer, and each LOD is a drawIndexed with the count the twin found. The two paths share the vertex
// layout, the mesh packing, the cull uniforms and the thresholds, so a pixel diff between them is a comparison
// of one scene through two routes and not of two scenes.
//
// *** THE TWIN IS ALSO THE ORACLE. *** A compute shader that writes an atomic counter and a compacted list has
// no output a person can read; tools/ship/gpuDriven-selfcheck.mjs runs the twin beside it and compares counts
// and record SETS (the GPU's order within a LOD is whatever the atomics made it, and any gate that asserted an
// order there would be asserting the scheduler).
//
// ---- THE LOD ORDER IS DERIVED, NEVER TYPED ----------------------------------------------------------------------
//
// A LOD ladder is conventionally an array whose index is the rank, which makes the rank a claim nobody checks.
// rankLods() sorts the levels by a cost derived from each one -- triangles times the encoded complexity of the
// shader it draws with (render/shaderComplexity.mjs) -- and the thresholds are sorted to match. Hand the same
// levels over in any order and LOD 0 is still the most expensive one, which is the only meaning "LOD 0" has.
"use strict";

import { complexityOf } from "./shaderComplexity.mjs";
import { Frustum } from "./frustum.js";

/** One drawIndexedIndirect command: indexCount, instanceCount, firstIndex, baseVertex, firstInstance. */
export const INDIRECT_STRIDE_U32 = 5;
export const INDIRECT_BYTES = INDIRECT_STRIDE_U32 * 4;
/** One INPUT instance record: center.xyz, radius. Its identity is its index. */
export const RECORD_FLOATS = 4;
/**
 * One COMPACTED record, what the cull writes and the vertex stage reads per instance: the input record, then
 * (id, lod, phase, 0) -- the `ident` attribute; `meta` is a reserved word in WGSL, found by the compile watcher. Level 13 -- the id survives compaction so a pick can name what it hit; before this the
 * slot was all a drawn instance knew about itself, and a slot is whatever the atomics made it.
 */
export const OUT_RECORD_FLOATS = 8;
export const RECORD_BYTES = OUT_RECORD_FLOATS * 4;
export const CULL_WORKGROUP = 64;
/** thresholds is one vec4, so at most four boundaries: five levels. */
export const MAX_LODS = 5;
/** The cull uniform block: planes[6] + eye + thresholds + info(count, lodCount, cap, 0), all vec4 -- 144 bytes. */
export const CULL_UNIFORM_FLOATS = 36;
export const CULL_UNIFORM_BYTES = CULL_UNIFORM_FLOATS * 4;

// ---- the shared WGSL: ONE cull function, spliced into the real shader and the probe ------------------------------
/**
 * The cull + LOD decision, as the single WGSL function both shaders splice in. -1 means outside the frustum;
 * otherwise the LOD index, 0 being the most detailed. `info` is (count, lodCount, cap, 0) as f32 because the
 * probe is driven through a Float32Array uniform buffer and the real shader shares the struct with it exactly.
 */
export const CULL_FN_WGSL = `
struct Cull { planes: array<vec4<f32>, 6>, eye: vec4<f32>, thresholds: vec4<f32>, info: vec4<f32> };

fn cullLod(c: vec4<f32>, cull: Cull) -> i32 {
  for (var p = 0u; p < 6u; p = p + 1u) {
    let pl = cull.planes[p];
    if (dot(pl.xyz, c.xyz) + pl.w < -c.w) { return -1; }
  }
  let dist = max(distance(c.xyz, cull.eye.xyz), 1e-6);
  let metric = c.w / dist;
  let lodCount = u32(cull.info.y);
  var lod = 0u;
  for (var k = 0u; k + 1u < lodCount; k = k + 1u) {
    if (metric < cull.thresholds[k]) { lod = k + 1u; }
  }
  return i32(lod);
}
`;

// ---- v4299 (Level 12) -- LEVEL 12: HI-Z OCCLUSION. The frustum says what is in view; the depth pyramid says what is
// hidden behind something nearer. The pyramid is the previous frame's depth, max-reduced level by level, so a
// texel at level L holds the FARTHEST depth of a 2^L x 2^L block: if a sphere's nearest point is farther than
// the farthest thing in every block it covers, nothing of it can show. The test is conservative in the
// direction that matters -- it projects the near face of the sphere's bounding cube, which contains the
// silhouette -- and the twin below does the same arithmetic on the same numbers.
/**
 * The occlusion uniforms: view and projection SEPARATELY (the test needs view space), and dims =
 * (width, height, levels, enabled). `enabled` is 0 on a frame with no pyramid yet -- the first one.
 */
export const OCC_UNIFORM_FLOATS = 16 + 16 + 4;
export const OCC_FN_WGSL = `
struct Occ { view: mat4x4<f32>, proj: mat4x4<f32>, dims: vec4<f32> };

// Offset of level L in the pyramid buffer: levels are stored back to back, each ceil(w/2^L) x ceil(h/2^L).
fn hizLevelOffset(w: u32, h: u32, level: u32) -> u32 {
  var off = 0u; var lw = w; var lh = h;
  for (var l = 0u; l < level; l = l + 1u) { off = off + lw * lh; lw = max(1u, (lw + 1u) / 2u); lh = max(1u, (lh + 1u) / 2u); }
  return off;
}
fn hizLevelDim(d: u32, level: u32) -> u32 { var v = d; for (var l = 0u; l < level; l = l + 1u) { v = max(1u, (v + 1u) / 2u); } return v; }

// true when the sphere (world xyz, radius w) cannot be seen past what the pyramid recorded.
fn hizOccluded(c: vec4<f32>, occ: Occ, hiz: ptr<storage, array<f32>, read>) -> bool {
  if (occ.dims.w < 0.5) { return false; }
  let vc = occ.view * vec4<f32>(c.xyz, 1.0);
  let zn = vc.z + c.w;                       // the sphere's nearest view-space z (camera looks down -z)
  if (zn >= -1e-4) { return false; }         // touches or passes the camera plane: cannot be judged
  let w = u32(occ.dims.x); let h = u32(occ.dims.y); let levels = u32(occ.dims.z);
  // the near face of the bounding cube, projected -- contains the silhouette
  let p0 = occ.proj * vec4<f32>(vc.x - c.w, vc.y - c.w, zn, 1.0);
  let p1 = occ.proj * vec4<f32>(vc.x + c.w, vc.y + c.w, zn, 1.0);
  let n0 = p0.xyz / p0.w; let n1 = p1.xyz / p1.w;
  let depth = n0.z;                           // the nearest point's depth, as the pipeline wrote it
  let x0 = clamp((min(n0.x, n1.x) * 0.5 + 0.5) * f32(w), 0.0, f32(w) - 1.0);
  let x1 = clamp((max(n0.x, n1.x) * 0.5 + 0.5) * f32(w), 0.0, f32(w) - 1.0);
  let y0 = clamp((1.0 - (max(n0.y, n1.y) * 0.5 + 0.5)) * f32(h), 0.0, f32(h) - 1.0);
  let y1 = clamp((1.0 - (min(n0.y, n1.y) * 0.5 + 0.5)) * f32(h), 0.0, f32(h) - 1.0);
  let sx = u32(floor(x1)) - u32(floor(x0)) + 1u; let sy = u32(floor(y1)) - u32(floor(y0)) + 1u;
  var span = max(sx, sy); var level = 0u;
  while (span > 2u && level + 1u < levels) { span = (span + 1u) / 2u; level = level + 1u; }
  let lw = hizLevelDim(w, level); let lh = hizLevelDim(h, level); let off = hizLevelOffset(w, h, level);
  let tx0 = min(u32(floor(x0)) >> level, lw - 1u); let ty0 = min(u32(floor(y0)) >> level, lh - 1u);
  let tx1 = min(u32(floor(x1)) >> level, lw - 1u); let ty1 = min(u32(floor(y1)) >> level, lh - 1u);
  var far = 0.0;
  for (var ty = ty0; ty <= ty1; ty = ty + 1u) { for (var tx = tx0; tx <= tx1; tx = tx + 1u) { far = max(far, (*hiz)[off + ty * lw + tx]); } }
  return depth > far;
}
`;

/**
 * The Hi-Z pyramid builders. TWO modules, not one with two entry points: gfx/device.js builds each compute
 * pipeline's bind group from every binding the MODULE declares, and a `layout: "auto"` pipeline only owns the
 * bindings its entry point uses -- so one module declaring the depth texture for level0 would make reduce's
 * bind group refuse (an entry the layout does not have) or level0's refuse (a texture nobody bound). Measured
 * at Level 12 on the first run; the split is the fix, and each module declares exactly what it reads.
 */
export const HIZ_WORKGROUP = 8;
const HIZ_LVL_WGSL = `struct Lvl { srcW: u32, srcH: u32, dstW: u32, dstH: u32, srcOff: u32, dstOff: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<uniform> lvl: Lvl;
@group(0) @binding(1) var<storage, read_write> hiz: array<f32>;`;
/** Level 0: copy the frame's depth texture into the pyramid buffer. */
export function hizLevel0Wgsl() {
    return `${HIZ_LVL_WGSL}
@group(0) @binding(2) var depthTex: texture_depth_2d;

@compute @workgroup_size(${HIZ_WORKGROUP}, ${HIZ_WORKGROUP}) fn level0(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= lvl.dstW || g.y >= lvl.dstH) { return; }
  hiz[lvl.dstOff + g.y * lvl.dstW + g.x] = textureLoad(depthTex, vec2<i32>(i32(g.x), i32(g.y)), 0);
}
`;
}
/** Level L from L-1: the max of each 2x2 block, edges clamped so an odd size loses nothing. */
export function hizReduceWgsl() {
    return `${HIZ_LVL_WGSL}

@compute @workgroup_size(${HIZ_WORKGROUP}, ${HIZ_WORKGROUP}) fn reduce(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= lvl.dstW || g.y >= lvl.dstH) { return; }
  let x0 = min(g.x * 2u, lvl.srcW - 1u); let x1 = min(g.x * 2u + 1u, lvl.srcW - 1u);
  let y0 = min(g.y * 2u, lvl.srcH - 1u); let y1 = min(g.y * 2u + 1u, lvl.srcH - 1u);
  let a = hiz[lvl.srcOff + y0 * lvl.srcW + x0]; let b = hiz[lvl.srcOff + y0 * lvl.srcW + x1];
  let c = hiz[lvl.srcOff + y1 * lvl.srcW + x0]; let d = hiz[lvl.srcOff + y1 * lvl.srcW + x1];
  hiz[lvl.dstOff + g.y * lvl.dstW + g.x] = max(max(a, b), max(c, d));
}
`;
}

/** The real cull shader: reads instances, appends survivors to their LOD's region, bumps that LOD's command. */
export function cullLodWgsl({ occlusion = false } = {}) {
    return `${CULL_FN_WGSL}${occlusion ? OCC_FN_WGSL : ""}
struct Cmd { indexCount: u32, instanceCount: atomic<u32>, firstIndex: u32, baseVertex: u32, firstInstance: u32 };

@group(0) @binding(0) var<uniform> cull: Cull;
@group(0) @binding(1) var<storage, read> inst: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> cmds: array<Cmd>;
@group(0) @binding(3) var<storage, read_write> records: array<vec4<f32>>;
${occlusion ? `@group(0) @binding(4) var<uniform> occ: Occ;
@group(0) @binding(5) var<storage, read> hiz: array<f32>;
@group(0) @binding(6) var<storage, read_write> rejected: array<u32>;` : ""}

// info.w is the PHASE: 0 = the only or first pass; 1 = the second phase, which looks only at what phase 0
// rejected for occlusion and tests it against the pyramid built from phase 0's own draw. A body that last
// frame's depth hid and this frame's does not is found here, in the same frame, and drawn on top.
@compute @workgroup_size(${CULL_WORKGROUP}) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  let count = u32(cull.info.x);
  if (i >= count) { return; }
  let phase = u32(cull.info.w);
${occlusion ? "  if (phase == 1u && rejected[i] == 0u) { return; }" : ""}
  let c = inst[i];
  let lod = cullLod(c, cull);
  if (lod < 0) { return; }
${occlusion ? `  let hidden = hizOccluded(c, occ, &hiz);
  if (phase == 0u) { rejected[i] = select(0u, 1u, hidden); }
  if (hidden) { return; }` : ""}
  let cap = u32(cull.info.z);
  let slot = atomicAdd(&cmds[u32(lod)].instanceCount, 1u);
  if (slot < cap) {
    records[(u32(lod) * cap + slot) * 2u] = c;
    records[(u32(lod) * cap + slot) * 2u + 1u] = vec4<f32>(f32(i), f32(lod), f32(phase), 0.0);
  }
}
`;
}

/**
 * The PROBE: the same cullLod over a procedural scene, writing (lod, metric) per instance to a plain f32 buffer
 * at binding 0 with the uniforms at binding 1 -- the shape tools/ship/webgpuHarness.mjs runWgslCompute() and the
 * cross-backend corpus drive. The scene is integer arithmetic scaled by powers of two, so the CPU twin computes
 * the identical f32 values and the comparison can demand equality rather than tolerance.
 */
export function cullProbeWgsl() {
    return `${CULL_FN_WGSL}
@group(0) @binding(0) var<storage, read_write> outv: array<f32>;
@group(0) @binding(1) var<uniform> cull: Cull;

fn probeInstance(i: u32) -> vec4<f32> {
  let x = f32(i % 16u) - 7.5;
  let y = f32((i / 16u) % 16u) - 7.5;
  let z = -2.0 - f32(i / 256u) * 3.0;
  let r = 0.25 + f32(i % 3u) * 0.125;
  return vec4<f32>(x, y, z, r);
}

@compute @workgroup_size(${CULL_WORKGROUP}) fn probe(@builtin(global_invocation_id) g: vec3<u32>) {
  let i = g.x;
  let count = u32(cull.info.x);
  if (i >= count) { return; }
  let c = probeInstance(i);
  outv[i * 2u] = f32(cullLod(c, cull));
  outv[i * 2u + 1u] = c.w / max(distance(c.xyz, cull.eye.xyz), 1e-6);
}
`;
}
/** The probe scene on the CPU: the same expression, in the same order. */
export function probeInstance(i) {
    return [(i % 16) - 7.5, (Math.floor(i / 16) % 16) - 7.5, -2 - Math.floor(i / 256) * 3, 0.25 + (i % 3) * 0.125];
}

// ---- the render shaders: instance records as a step-mode-instance attribute, on both backends -----------------
export const RENDER_WGSL = `
struct Cam { viewProj: mat4x4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + p * rec.w, 1.0);
  o.color = color;
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> { return v.color; }
`;
/**
 * Level 13 -- THE PICK SHADER: the same geometry, coloured by IDENTITY. r,g carry the id's low and high bytes,
 * b carries the LOD, a is 1 for "something". A pick is one readback of one pixel of this picture, and the
 * depth test decides which instance is in front exactly as it does for the colour picture.
 */
export const PICK_WGSL = `
struct Cam { viewProj: mat4x4<f32> };
@group(0) @binding(0) var<uniform> cam: Cam;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) @interpolate(flat) id: vec4<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>) -> VOut {
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(rec.xyz + p * rec.w, 1.0);
  let id = u32(ident.x);
  // r, g: the id's low two bytes; b: the LOD; a: 128 + the id's third byte -- never 0, so "something" survives
  o.id = vec4<f32>(f32(id & 255u) / 255.0, f32((id >> 8u) & 255u) / 255.0, ident.y / 255.0, f32(128u + ((id >> 16u) & 127u)) / 255.0);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> { return v.id; }
`;
export const PICK_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
in vec3 p; in vec4 rec; in vec4 ident;
flat out vec4 vId;
void main() {
  gl_Position = viewProj * vec4(rec.xyz + p * rec.w, 1.0);
  int id = int(ident.x);
  vId = vec4(float(id & 255) / 255.0, float((id >> 8) & 255) / 255.0, ident.y / 255.0, float(128 + ((id >> 16) & 127)) / 255.0);
}
`;
export const PICK_FRAGMENT_GLSL = `#version 300 es
precision highp float;
flat in vec4 vId; out vec4 fragColor;
void main() { fragColor = vId; }
`;
/** Decode a pick pixel: null for background, else { id, lod }. v4300: ids up to 8,388,607 (a third byte in alpha). */
export function decodePick(px, i) { if (px[i + 3] < 128) return null; return { id: px[i] + px[i + 1] * 256 + (px[i + 3] - 128) * 65536, lod: px[i + 2] }; }
export const RENDER_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
in vec3 p; in vec4 color; in vec4 rec;
out vec4 vColor;
void main() { gl_Position = viewProj * vec4(rec.xyz + p * rec.w, 1.0); vColor = color; }
`;
export const RENDER_FRAGMENT_GLSL = `#version 300 es
precision highp float;
in vec4 vColor; out vec4 fragColor;
void main() { fragColor = vColor; }
`;
/** Vertex: position xyz + color rgba, 28 bytes. Instance: one record, 16 bytes, advanced per instance. */
export const VERTEX_FLOATS = 7;
export function renderPipelineDesc() {
    return {
        shaders: { wgsl: RENDER_WGSL, glsl: { vertex: RENDER_VERTEX_GLSL, fragment: RENDER_FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        buffers: [
            { stride: VERTEX_FLOATS * 4, stepMode: "vertex", attributes: [{ name: "p", size: 3, offset: 0 }, { name: "color", size: 4, offset: 12 }] },
            { stride: RECORD_BYTES, stepMode: "instance", attributes: [{ name: "rec", size: 4, offset: 0 }, { name: "ident", size: 4, offset: 16 }] },
        ],
        uniforms: [{ name: "viewProj", type: "mat4" }],
    };
}
/** The pick pipeline: the SAME buffers and uniform, identity for colour. Any consumer pipeline can be picked. */
export function pickPipelineDesc() {
    return { ...renderPipelineDesc(), shaders: { wgsl: PICK_WGSL, glsl: { vertex: PICK_VERTEX_GLSL, fragment: PICK_FRAGMENT_GLSL } } };
}

// ---- meshes -------------------------------------------------------------------------------------------------------
/**
 * Pack the LOD meshes into ONE vertex buffer and ONE index buffer with ABSOLUTE indices, so every draw has
 * baseVertex 0 -- WebGL2 has no base vertex without an extension, and gfx/device.js refuses a non-zero one there.
 * Each mesh: { positions: Float32Array(3n), indices: (Uint16|Uint32)Array, color: [r,g,b,a] }.
 */
export function packMeshes(meshes) {
    let nv = 0, ni = 0;
    for (const m of meshes) { nv += m.positions.length / 3; ni += m.indices.length; }
    const vertexData = new Float32Array(nv * VERTEX_FLOATS), indexData = new Uint32Array(ni);
    const ranges = [];
    let vb = 0, ib = 0;
    for (const m of meshes) {
        const n = m.positions.length / 3, col = m.color || [1, 1, 1, 1];
        for (let v = 0; v < n; v++) {
            const o = (vb + v) * VERTEX_FLOATS;
            vertexData[o] = m.positions[v * 3]; vertexData[o + 1] = m.positions[v * 3 + 1]; vertexData[o + 2] = m.positions[v * 3 + 2];
            vertexData[o + 3] = col[0]; vertexData[o + 4] = col[1]; vertexData[o + 5] = col[2]; vertexData[o + 6] = col[3] == null ? 1 : col[3];
        }
        for (let k = 0; k < m.indices.length; k++) indexData[ib + k] = m.indices[k] + vb;
        ranges.push({ indexCount: m.indices.length, firstIndex: ib, baseVertex: 0, triangles: m.indices.length / 3 });
        vb += n; ib += m.indices.length;
    }
    return { vertexData, indexData, ranges };
}

/** A unit quad in the XY plane, as a mesh with `subdiv` cells per side -- a cheap way to give LODs real triangle counts. */
export function quadMesh(subdiv = 1, color = [1, 1, 1, 1]) {
    const n = subdiv + 1, positions = new Float32Array(n * n * 3), indices = new Uint32Array(subdiv * subdiv * 6);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = (y * n + x) * 3; positions[o] = x / subdiv * 2 - 1; positions[o + 1] = y / subdiv * 2 - 1; positions[o + 2] = 0; }
    let k = 0;
    for (let y = 0; y < subdiv; y++) for (let x = 0; x < subdiv; x++) { const a = y * n + x, b = a + 1, c = a + n, d = c + 1; indices[k++] = a; indices[k++] = b; indices[k++] = c; indices[k++] = b; indices[k++] = d; indices[k++] = c; }
    return { positions, indices, color };
}

/** A deterministic test scene: a side x side grid in the plane z, radius cycling through `radii` by index. */
export function gridScene({ side = 16, z = -2, spacing = 1, radii = [0.15, 0.25, 0.4] } = {}) {
    const records = new Float32Array(side * side * RECORD_FLOATS);
    for (let i = 0; i < side * side; i++) {
        records[i * 4] = ((i % side) - (side - 1) / 2) * spacing;
        records[i * 4 + 1] = (Math.floor(i / side) - (side - 1) / 2) * spacing;
        records[i * 4 + 2] = z;
        records[i * 4 + 3] = radii[i % radii.length];
    }
    return records;
}

// ---- the derived LOD order --------------------------------------------------------------------------------------
/**
 * Rank levels by DERIVED cost: triangles x (1 + complexity score of the shader that level draws with). Returns
 * the levels most-expensive-first with `.rank`, plus the thresholds sorted DESCENDING to match (a threshold is
 * "the angular size below which the next level takes over", so the largest belongs to the boundary after LOD 0).
 * Ties break by name, so the order is total and independent of the input order.
 */
export function rankLods(lods, thresholds, { shader = RENDER_WGSL } = {}) {
    if (!Array.isArray(lods) || !lods.length) throw new Error("gpuDriven: rankLods() needs at least one level");
    if (lods.length > MAX_LODS) throw new Error(`gpuDriven: ${lods.length} levels; thresholds is one vec4, so at most ${MAX_LODS}`);
    const ths = Array.from(thresholds || []);
    if (ths.length !== lods.length - 1) throw new Error(`gpuDriven: ${lods.length} levels need ${lods.length - 1} thresholds, got ${ths.length}`);
    const scored = lods.map((l, i) => {
        const tri = l.mesh ? l.mesh.indices.length / 3 : (l.triangles || 0);
        const c = complexityOf(l.shader || shader, { entry: "fs" });
        return { lod: l, name: l.name || String(i), index: i, triangles: tri, complexity: c, cost: tri * (1 + c.score) };
    });
    scored.sort((a, b) => (b.cost - a.cost) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    ths.sort((a, b) => b - a);
    return { lods: scored.map((s, rank) => ({ ...s, rank })), thresholds: ths };
}

// ---- the CPU twin -------------------------------------------------------------------------------------------------
/** Pack the cull uniforms exactly as the WGSL struct lays them out. */
export function packCullUniforms({ planes, eye, thresholds, count, lodCount, cap, phase = 0 }) {
    const u = new Float32Array(CULL_UNIFORM_FLOATS);
    u.set(planes.subarray ? planes.subarray(0, 24) : planes.slice(0, 24), 0);
    u[24] = eye[0]; u[25] = eye[1]; u[26] = eye[2]; u[27] = 0;
    for (let k = 0; k < 4; k++) u[28 + k] = thresholds[k] == null ? 0 : thresholds[k];
    u[32] = count; u[33] = lodCount; u[34] = cap; u[35] = phase;
    return u;
}
/** The six planes of a column-major view-projection, normalised, as render/frustum.js extracts them. */
export function frustumPlanes(viewProj) { const f = new Frustum(); f.extractFrom(viewProj); return f.planes; }

/** cullLod on the CPU, from the packed uniforms, so twin and shader read the same 36 floats. */
export function cullLodCpuOne(c, u) {
    for (let p = 0; p < 6; p++) { const o = p * 4; if (u[o] * c[0] + u[o + 1] * c[1] + u[o + 2] * c[2] + u[o + 3] < -c[3]) return -1; }
    const dist = Math.max(Math.hypot(c[0] - u[24], c[1] - u[25], c[2] - u[26]), 1e-6);
    const metric = c[3] / dist, lodCount = u[33];
    let lod = 0;
    for (let k = 0; k + 1 < lodCount; k++) if (metric < u[28 + k]) lod = k + 1;
    return lod;
}
/**
 * The twin of cullLodWgsl(): for every instance record, which LOD (or none). Returns per-LOD id lists, the
 * counts, and the compacted record buffer laid out exactly as the compute shader lays it out (LOD-major regions
 * of `cap` records), so a WebGL2 path can upload it as-is and a gate can compare it as a set.
 */
export function cullLodCpu(records, u) {
    const count = u[32] | 0, lodCount = u[33] | 0, cap = u[34] | 0;
    const ids = Array.from({ length: lodCount }, () => []);
    for (let i = 0; i < count; i++) {
        const c = [records[i * 4], records[i * 4 + 1], records[i * 4 + 2], records[i * 4 + 3]];
        const lod = cullLodCpuOne(c, u);
        if (lod >= 0) ids[lod].push(i);
    }
    const counts = new Uint32Array(lodCount), compact = new Float32Array(lodCount * cap * OUT_RECORD_FLOATS);
    for (let l = 0; l < lodCount; l++) {
        counts[l] = ids[l].length;
        for (let s = 0; s < Math.min(cap, ids[l].length); s++) { const o = (l * cap + s) * OUT_RECORD_FLOATS;
            compact.set(records.subarray(ids[l][s] * 4, ids[l][s] * 4 + 4), o); compact[o + 4] = ids[l][s]; compact[o + 5] = l; compact[o + 6] = 0; compact[o + 7] = 0; }
    }
    return { ids, counts, compact, visible: ids.reduce((a, b) => a + b.length, 0) };
}
// ---- the Hi-Z twin: the same pyramid from the same depth image, the same test in the same order ---------------
/** Level dimensions and buffer offsets for a w x h depth image reduced to 1x1. */
export function hizLayout(w, h) {
    const levels = []; let lw = w, lh = h, off = 0;
    for (;;) { levels.push({ w: lw, h: lh, off }); off += lw * lh; if (lw === 1 && lh === 1) break; lw = Math.max(1, Math.ceil(lw / 2)); lh = Math.max(1, Math.ceil(lh / 2)); }
    return { levels, total: off };
}
/** Build the pyramid on the CPU from a depth image (Float32Array w*h, row 0 at the top). Exact: max only. */
export function hizPyramidCpu(depth, w, h) {
    const L = hizLayout(w, h), out = new Float32Array(L.total);
    out.set(depth.subarray(0, w * h), 0);
    for (let l = 1; l < L.levels.length; l++) {
        const s = L.levels[l - 1], d = L.levels[l];
        for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
            const x0 = Math.min(x * 2, s.w - 1), x1 = Math.min(x * 2 + 1, s.w - 1), y0 = Math.min(y * 2, s.h - 1), y1 = Math.min(y * 2 + 1, s.h - 1);
            out[d.off + y * d.w + x] = Math.max(Math.max(out[s.off + y0 * s.w + x0], out[s.off + y0 * s.w + x1]), Math.max(out[s.off + y1 * s.w + x0], out[s.off + y1 * s.w + x1]));
        }
    }
    return { pyramid: out, layout: L };
}
/** Pack the occlusion uniforms: view, proj, dims = (w, h, levels, enabled). */
export function packOccUniforms({ view, proj, w, h, levels, enabled }) {
    const u = new Float32Array(OCC_UNIFORM_FLOATS); u.set(view, 0); u.set(proj, 16); u[32] = w; u[33] = h; u[34] = levels; u[35] = enabled ? 1 : 0; return u;
}
const mulPoint = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
/** The twin of hizOccluded(): returns { occluded, depth, far, level } so a gate can see the margin, not just the verdict. */
export function hizOccludedCpu(c, u, pyramid) {
    if (u[35] < 0.5) return { occluded: false, reason: "no pyramid" };
    const view = u.subarray(0, 16), proj = u.subarray(16, 32), w = u[32] | 0, h = u[33] | 0, levels = u[34] | 0;
    const vc = mulPoint(view, c[0], c[1], c[2]);
    const zn = vc[2] + c[3];
    if (zn >= -1e-4) return { occluded: false, reason: "at the camera plane" };
    const p0 = mulPoint(proj, vc[0] - c[3], vc[1] - c[3], zn), p1 = mulPoint(proj, vc[0] + c[3], vc[1] + c[3], zn);
    const n0 = [p0[0] / p0[3], p0[1] / p0[3], p0[2] / p0[3]], n1 = [p1[0] / p1[3], p1[1] / p1[3], p1[2] / p1[3]];
    const depth = n0[2];
    const cl = (v, hi) => Math.max(0, Math.min(hi, v));
    const x0 = cl((Math.min(n0[0], n1[0]) * 0.5 + 0.5) * w, w - 1), x1 = cl((Math.max(n0[0], n1[0]) * 0.5 + 0.5) * w, w - 1);
    const y0 = cl((1 - (Math.max(n0[1], n1[1]) * 0.5 + 0.5)) * h, h - 1), y1 = cl((1 - (Math.min(n0[1], n1[1]) * 0.5 + 0.5)) * h, h - 1);
    const sx = Math.floor(x1) - Math.floor(x0) + 1, sy = Math.floor(y1) - Math.floor(y0) + 1;
    let span = Math.max(sx, sy), level = 0;
    while (span > 2 && level + 1 < levels) { span = Math.ceil(span / 2); level++; }
    const L = hizLayout(w, h).levels[level];
    const tx0 = Math.min(Math.floor(x0) >> level, L.w - 1), ty0 = Math.min(Math.floor(y0) >> level, L.h - 1);
    const tx1 = Math.min(Math.floor(x1) >> level, L.w - 1), ty1 = Math.min(Math.floor(y1) >> level, L.h - 1);
    let far = 0;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) far = Math.max(far, pyramid[L.off + ty * L.w + tx]);
    return { occluded: depth > far, depth, far, level, rect: [x0, y0, x1, y1] };
}

/** The indirect command template: per LOD, its mesh range with instanceCount 0. Written fresh every frame. */
export function indirectTemplate(ranges) {
    const t = new Uint32Array(ranges.length * INDIRECT_STRIDE_U32);
    ranges.forEach((r, l) => { const o = l * INDIRECT_STRIDE_U32; t[o] = r.indexCount; t[o + 1] = 0; t[o + 2] = r.firstIndex; t[o + 3] = r.baseVertex || 0; t[o + 4] = 0; });
    return t;
}

// ---- small camera helpers (column-major, as render/frustum.js and WebGPU/WebGL both read) -----------------------
export function perspective(fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2), m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
    return m;
}
export function lookAt(eye, target, up = [0, 1, 0]) {
    const z = norm3(sub3(eye, target)), x = norm3(cross3(up, z)), y = cross3(z, x), m = new Float32Array(16);
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2]; m[12] = -dot3(x, eye);
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2]; m[13] = -dot3(y, eye);
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2]; m[14] = -dot3(z, eye); m[15] = 1;
    return m;
}
export function multiply(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
/** Project a world point through a column-major matrix to NDC; returns [x, y, z, w]. */
export function project(m, p) { const x = p[0], y = p[1], z = p[2]; const w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w]; }
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---- the scene: one object, two routes ------------------------------------------------------------------------------
/**
 * Build a GPU-driven scene on a gfx/device.js device.
 *   lods:       [{ name, mesh }] in ANY order -- rankLods() decides which is LOD 0
 *   thresholds: lods.length - 1 angular-size boundaries (radius / distance), any order
 *   records:    Float32Array of 4 per instance (center.xyz, radius)
 *   cap:        records per LOD region; defaults to the instance count, so no region can overflow
 * frame({ viewProj, eye, clear }) culls and draws. On WebGPU that is a dispatch and one drawIndexedIndirect per
 * LOD; elsewhere it is the twin and one drawIndexed per LOD. readCounts() reads the instance counts back from
 * wherever they were produced -- the indirect buffer on WebGPU, the twin's result otherwise.
 */
export function makeGpuDrivenScene(device, { lods, thresholds, records, cap = null, occlusion = false, pipeline = null, bind = null }) {
    // Level 12 -- `records` may be a Float32Array (static instances) or a SOURCE produced elsewhere each frame:
    //   { count, buffer }   a gfx/device.js buffer another compute pass writes (WebGPU: the cull reads it directly)
    //   { count, cpu }      a function returning the Float32Array for this frame (the twin route, any backend)
    // A GPU source must carry a `cpu` twin too, or the WebGL2 route has nothing to cull. And `pipeline` /
    // `bind` let a consumer bring its own render shaders (a terrain that samples a heightfield in the vertex
    // stage) as long as they take the same two vertex buffers: bind(pass) runs after use() each frame.
    const src = records instanceof Float32Array ? { count: records.length / RECORD_FLOATS, cpu: () => records, static: records } : records;
    if (!src || !(src.count > 0) || (!src.cpu && !src.static)) throw new Error("gpuDriven: records must be a Float32Array or { count, cpu() } (with an optional GPU `buffer`) -- the twin needs a CPU copy");
    const count = src.count;
    const ranked = rankLods(lods, thresholds);
    const lodCount = ranked.lods.length;
    cap = cap == null ? count : cap;
    if (cap < count) throw new Error(`gpuDriven: cap ${cap} is below the instance count ${count}; a LOD region that can overflow drops instances silently`);
    const packed = packMeshes(ranked.lods.map((l) => l.lod.mesh));
    const gpuPath = device.backend === "webgpu";
    const vbuf = device.buffer({ data: packed.vertexData, usage: "vertex" });
    const ibuf = device.buffer({ data: packed.indexData, usage: "index" });
    const pipe = device.pipeline(pipeline || renderPipelineDesc());
    const template = indirectTemplate(packed.ranges);
    const regionBytes = cap * RECORD_BYTES;
    // Occlusion is a WebGPU feature: it needs the depth image reduced by compute. Elsewhere the flag is
    // recorded and ignored, and the picture is the same because the depth test hides what Hi-Z would have
    // culled -- the cull saves work, never pixels.
    const occ = !!occlusion && gpuPath;
    // Level 13 -- "twoPhase": what phase 0 rejected against LAST frame's pyramid is re-tested against THIS frame's,
    // after phase 0 has drawn and the pyramid is rebuilt, and the survivors are drawn on top in the same tick.
    // A body that was hidden last frame and is not hidden now is missed by a single phase for one frame; two
    // phases close that gap, at the cost of a second cull over the rejected set and a second draw.
    const twoPhase = occ && occlusion === "twoPhase";
    let cullPipe = null, cullPipe2 = null, ubuf = null, ubuf2 = null, inBuf = null, cmdBuf = null, cmdBuf2 = null, outBuf = null, outBuf2 = null, rejBuf = null, last = null, lastCam = null;
    let hizPipe = null, hizBuf = null, occBuf = null, hizLayoutNow = null, lvlBufs = [], pyramidReady = false, hizDims = null, pickPipe = null;
    if (gpuPath) {
        cullPipe = device.compute({ wgsl: cullLodWgsl({ occlusion: occ }), entryPoint: "main" });
        ubuf = device.buffer({ size: CULL_UNIFORM_BYTES, usage: "uniform" });
        inBuf = (src.buffer && src.buffer.gpu) ? src.buffer : device.buffer({ data: src.static || src.cpu(), usage: "storage" });
        cmdBuf = device.buffer({ data: template, usage: "indirect" });
        outBuf = device.buffer({ size: lodCount * regionBytes, usage: ["storage", "vertex"] });
        cullPipe.bind("cull", ubuf).bind("inst", inBuf).bind("cmds", cmdBuf).bind("records", outBuf);
        if (occ) {
            occBuf = device.buffer({ size: OCC_UNIFORM_FLOATS * 4, usage: "uniform" });
            rejBuf = device.buffer({ size: count * 4, usage: "storage" });
            cullPipe.bind("rejected", rejBuf);
            hizPipe = { level0: device.compute({ wgsl: hizLevel0Wgsl(), entryPoint: "level0" }), reduce: device.compute({ wgsl: hizReduceWgsl(), entryPoint: "reduce" }) };
            if (twoPhase) {
                cullPipe2 = device.compute({ wgsl: cullLodWgsl({ occlusion: true }), entryPoint: "main" });
                ubuf2 = device.buffer({ size: CULL_UNIFORM_BYTES, usage: "uniform" });
                cmdBuf2 = device.buffer({ data: template, usage: "indirect" });
                outBuf2 = device.buffer({ size: lodCount * regionBytes, usage: ["storage", "vertex"] });
                cullPipe2.bind("cull", ubuf2).bind("inst", inBuf).bind("cmds", cmdBuf2).bind("records", outBuf2).bind("occ", occBuf).bind("rejected", rejBuf);
            }
        }
    } else {
        outBuf = device.buffer({ size: lodCount * regionBytes, usage: "vertex" });
    }
    /** (Re)allocate the pyramid for the current frame size. */
    function ensureHiz(w, h) {
        if (hizLayoutNow && hizDims && hizDims[0] === w && hizDims[1] === h) return;
        hizLayoutNow = hizLayout(w, h); hizDims = [w, h];
        try { hizBuf?.destroy(); } catch (e) {}
        hizBuf = device.buffer({ size: hizLayoutNow.total * 4, usage: "storage" });
        for (const b of lvlBufs) { try { b.destroy(); } catch (e) {} }
        lvlBufs = hizLayoutNow.levels.map((lv, l) => { const s = l ? hizLayoutNow.levels[l - 1] : lv;
            return device.buffer({ data: new Uint32Array([s.w, s.h, lv.w, lv.h, s.off, lv.off, 0, 0]), usage: "uniform" }); });
        cullPipe.bind("hiz", hizBuf); if (cullPipe2) cullPipe2.bind("hiz", hizBuf);
        pyramidReady = false;
    }
    /** Build the pyramid from the depth texture the last frame left. Its own submission, after the draw. */
    function buildHiz() {
        const dt = device.depthTexture(); if (!dt) return false;
        ensureHiz(dt.w, dt.h);
        device.frame(({ pass }) => {
            for (let l = 0; l < hizLayoutNow.levels.length; l++) {
                const lv = hizLayoutNow.levels[l], p = l ? hizPipe.reduce : hizPipe.level0;
                p.bind("lvl", lvlBufs[l]).bind("hiz", hizBuf); if (!l) p.bindTexture("depthTex", dt);
                pass.dispatch(p, [Math.ceil(lv.w / HIZ_WORKGROUP), Math.ceil(lv.h / HIZ_WORKGROUP), 1]);
            }
        });
        pyramidReady = true; return true;
    }
    /** The draws of one phase: every LOD's region and command. Shared by the colour frame and the pick frame. */
    function drawPhase(pass, out, cmds, twinCounts) {
        for (let l = 0; l < lodCount; l++) {
            pass.instances(out, l * regionBytes);
            if (gpuPath) pass.drawIndexedIndirect(cmds, l * INDIRECT_BYTES);
            else if (twinCounts[l] > 0) pass.drawIndexed(packed.ranges[l].indexCount, twinCounts[l], packed.ranges[l].firstIndex);
        }
    }
    function frame({ viewProj, view = null, proj = null, eye, clear = [0, 0, 0, 1], read = false }) {
        if (occ && (!view || !proj)) throw new Error("gpuDriven: an occluding scene needs `view` and `proj` separately -- the Hi-Z test works in view space");
        const u = packCullUniforms({ planes: frustumPlanes(viewProj), eye, thresholds: ranked.thresholds, count, lodCount, cap });
        lastCam = { viewProj };
        let twin = null, occU = null;
        if (gpuPath) { ubuf.write(u); cmdBuf.write(template);
            if (occ) { const en = pyramidReady && hizLayoutNow; occU = packOccUniforms({ view, proj, w: en ? hizDims[0] : 0, h: en ? hizDims[1] : 0, levels: en ? hizLayoutNow.levels.length : 0, enabled: !!en });
                if (!hizBuf) { ensureHiz(1, 1); pyramidReady = false; }   // a binding must exist before the first dispatch
                occBuf.write(occU); cullPipe.bind("occ", occBuf); } }
        else { twin = cullLodCpu(src.static || src.cpu(), u); outBuf.write(twin.compact); last = twin; }
        const readback = device.frame(({ pass }) => {
            if (gpuPath) pass.dispatch(cullPipe, Math.ceil(count / CULL_WORKGROUP));
            // Level 13 -- clear: null draws OVER whatever the last frame left (colour and depth): a second scene on
            // the same canvas, such as the traders over the orrery's bodies.
            if (clear === null) pass.begin(); else pass.clear(clear);
            pass.use(pipe);
            pass.uniform("viewProj", viewProj);
            if (bind) bind(pass);
            pass.vertices(vbuf, 0);
            pass.indices(ibuf);
            drawPhase(pass, outBuf, cmdBuf, twin && twin.counts);
        }, (read && !twoPhase) ? { read: true } : undefined);
        // the pyramid for the NEXT frame comes from this frame's depth -- classic two-pass occlusion
        const built = occ ? buildHiz() : false;
        let readback2 = null, phase2 = false;
        if (twoPhase && occU && occU[35] > 0) {
            // phase 1: the rejected set against the pyramid just built from phase 0's draw, drawn ON TOP
            phase2 = true;
            const occU2 = packOccUniforms({ view, proj, w: hizDims[0], h: hizDims[1], levels: hizLayoutNow.levels.length, enabled: true });
            occBuf.write(occU2);
            ubuf2.write(packCullUniforms({ planes: frustumPlanes(viewProj), eye, thresholds: ranked.thresholds, count, lodCount, cap, phase: 1 })); cmdBuf2.write(template);
            readback2 = device.frame(({ pass }) => {
                pass.dispatch(cullPipe2, Math.ceil(count / CULL_WORKGROUP));
                pass.begin();
                pass.use(pipe);
                pass.uniform("viewProj", viewProj);
                if (bind) bind(pass);
                pass.vertices(vbuf, 0);
                pass.indices(ibuf);
                drawPhase(pass, outBuf2, cmdBuf2, null);
            }, read ? { read: true } : undefined);
        } else if (twoPhase && read) {
            // no pyramid yet (first frame): nothing to re-test, and the readback the caller asked for is the phase-0 picture
            readback2 = device.frame(({ pass }) => { pass.begin(); }, { read: true });
        }
        return { backend: device.backend, path: gpuPath ? "compute+drawIndexedIndirect" : "cpu-twin+drawIndexed", lodCount, count, uniforms: u,
                 occlusion: occ, twoPhase, phase2Ran: phase2, occUniforms: occU, pyramidUsed: !!(occU && occU[35] > 0), pyramidBuilt: built,
                 ...(read ? { pixels: twoPhase ? readback2 : readback } : {}) };
    }
    /**
     * Level 13 -- PICK: what is under pixel (x, y) of the last frame. The pick picture is the last compacted records
     * drawn through the pick pipeline into an OFFSCREEN target (the page never sees it), one pixel decoded.
     * Returns { id, lod, phase } or null. `id` is the INPUT record's index -- what the caller gave the scene.
     */
    async function pick(x, y) {
        if (!lastCam) return null;
        if (!pickPipe) pickPipe = device.pipeline(pickPipelineDesc());
        const fr = device.frame(({ pass }) => {
            pass.clear([0, 0, 0, 0]);
            pass.use(pickPipe);
            pass.uniform("viewProj", lastCam.viewProj);
            pass.vertices(vbuf, 0);
            pass.indices(ibuf);
            drawPhase(pass, outBuf, cmdBuf, last && last.counts);
            if (twoPhase && cmdBuf2) drawPhase(pass, outBuf2, cmdBuf2, null);
        }, { read: true, offscreen: true, depth: false });
        const p = await fr;
        if (!p || !p.pixels) return null;   // the null backend records and draws nothing
        const px = Math.max(0, Math.min(p.width - 1, Math.floor(x))), py = Math.max(0, Math.min(p.height - 1, Math.floor(y)));
        const hit = decodePick(p.pixels, (py * p.width + px) * 4);
        return hit ? { ...hit, x: px, y: py } : null;
    }
    async function readPyramid() { if (!occ || !hizBuf) return null; return { pyramid: new Float32Array(await device.read(hizBuf)), layout: hizLayoutNow, dims: hizDims }; }
    async function readCounts() {
        if (!gpuPath) return last ? Array.from(last.counts) : null;
        const raw = new Uint32Array(await device.read(cmdBuf));
        return Array.from({ length: lodCount }, (_, l) => raw[l * INDIRECT_STRIDE_U32 + 1]);
    }
    /** The second phase's counts, or null when there is no second phase. */
    async function readCounts2() {
        if (!twoPhase || !cmdBuf2) return null;
        const raw = new Uint32Array(await device.read(cmdBuf2));
        return Array.from({ length: lodCount }, (_, l) => raw[l * INDIRECT_STRIDE_U32 + 1]);
    }
    async function readRecords() {
        if (!gpuPath) return last ? last.compact : null;
        return new Float32Array(await device.read(outBuf));
    }
    return { frame, pick, readCounts, readCounts2, readRecords, readPyramid, order: ranked, ranges: packed.ranges, count, cap, lodCount, occlusion: occ, twoPhase, path: gpuPath ? "compute+drawIndexedIndirect" : "cpu-twin+drawIndexed",
             destroy() { for (const b of [vbuf, ibuf, ubuf, ubuf2, (src.buffer ? null : inBuf), cmdBuf, cmdBuf2, outBuf, outBuf2, rejBuf, hizBuf, occBuf, ...lvlBufs]) { try { b && b.destroy && b.destroy(); } catch (e) {} } } };
}
