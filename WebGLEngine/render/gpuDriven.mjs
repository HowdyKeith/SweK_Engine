// WebGLEngine/render/gpuDriven.mjs -- v4299 (Level 11) .. v4301 (Level 15)
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
//
// ---- v4301 (Level 15): FLEETS -- ONE SCENE, MANY ARCHITECTURES ----------------------------------------------------
//
// Every instance may carry a FLEET number (a `fleetOf` u32 per record), and the cull writes one region per
// (fleet, LOD) instead of one per LOD: region = fleet * lodCount + lod. Each fleet brings its OWN meshes, its
// own vertex layout, its own pipeline and its own bind hook, so one fleet is flat quads, the next a lit 3D
// hull, the next a textured sprite, the next ink strokes on a line-list -- and the draw loop is unchanged:
// use the fleet's pipeline, then one indirect draw per region. The identity picture carries the fleet too
// (render/fleets.mjs has the architectures; the pick's blue channel packs lod + fleet * 8). A scene with no
// fleets is a scene with one, and every region index it ever computed is the same number as before.
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
 * (id, lod, phase, fleet) -- the `ident` attribute (fleet since v4301, 0 before) -- then (yaw, pitch, param, 0), the `extra` attribute (v4317); `meta` is a reserved word in WGSL, found by the compile watcher. Level 13 -- the id survives compaction so a pick can name what it hit; before this the
 * slot was all a drawn instance knew about itself, and a slot is whatever the atomics made it.
 */
export const OUT_RECORD_FLOATS = 12;
/**
 * v4317 (Level 17) -- A HEADING IN THE RECORD. The compacted record grows a third vec4, `extra` = (yaw, pitch, a
 * race-specific parameter, stealth bias -- v4318), copied by the cull from an `extras` buffer the scene owns: the caller's headings when
 * it has them (a trader faces its next market), else the golden angle times the id -- the Level 15 stand-in, now
 * computed ONCE on the CPU into the buffer instead of inside every fleet shader, so a shader only ever reads a
 * heading and never invents one. SPIN is that constant, kept here so nothing types it twice.
 */
export const SPIN = 2.399963;
export const EXTRA_FLOATS = 4;
export function defaultExtras(count) { const e = new Float32Array(count * EXTRA_FLOATS); for (let i = 0; i < count; i++) e[i * EXTRA_FLOATS] = i * SPIN; return e; }
export const RECORD_BYTES = OUT_RECORD_FLOATS * 4;
export const CULL_WORKGROUP = 64;
/** thresholds is one vec4, so at most four boundaries: five levels. */
export const MAX_LODS = 5;
/**
 * The cull uniform block: planes[6] + eye + thresholds + info(count, lodCount, cap, phase), all vec4 -- 144 bytes.
 * v4301: eye.w carries the FLEET COUNT (it was the padding 0 before; the shader and the twin both read 0 as 1).
 */
// v4318: + clock = (t, enabled, 0, 0). GIT TIME ON THE GPU: with clock.y set, a record whose extra.z (its opening day)
// is later than t is culled -- a body not yet vendored on day t is rejected by the cull, with no CPU decision.
export const CULL_UNIFORM_FLOATS = 40;
export const CULL_UNIFORM_BYTES = CULL_UNIFORM_FLOATS * 4;

// ---- the shared WGSL: ONE cull function, spliced into the real shader and the probe ------------------------------
/**
 * The cull + LOD decision, as the single WGSL function both shaders splice in. -1 means outside the frustum;
 * otherwise the LOD index, 0 being the most detailed. `info` is (count, lodCount, cap, 0) as f32 because the
 * probe is driven through a Float32Array uniform buffer and the real shader shares the struct with it exactly.
 */
export const CULL_FN_WGSL = `
struct Cull { planes: array<vec4<f32>, 6>, eye: vec4<f32>, thresholds: vec4<f32>, info: vec4<f32>, clock: vec4<f32> };

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
// v4318 -- bias: the STEALTH margin (extra.w). 0 is the plain test: hidden when the nearest point is behind everything in
// front. A positive bias hides the record when it is within bias of being occluded -- behind, level with, or just in front
// of whatever covers its footprint -- but never against the open sky (a tile the clear reached has far = 1 and hides nothing).
fn hizOccluded(c: vec4<f32>, occ: Occ, hiz: ptr<storage, array<f32>, read>, bias: f32) -> bool {
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
  if (bias > 0.0) { return far < 1.0 && depth + bias > far; }
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

/**
 * The real cull shader: reads instances, appends survivors to their (fleet, LOD) region, bumps that region's
 * command. `fleets: true` adds the per-instance fleet buffer; without it the text is what Levels 11-14 shipped
 * and every instance is in fleet 0.
 */
export function cullLodWgsl({ occlusion = false, fleets = false } = {}) {
    return `${CULL_FN_WGSL}${occlusion ? OCC_FN_WGSL : ""}
struct Cmd { indexCount: u32, instanceCount: atomic<u32>, firstIndex: u32, baseVertex: u32, firstInstance: u32 };

@group(0) @binding(0) var<uniform> cull: Cull;
@group(0) @binding(1) var<storage, read> inst: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> cmds: array<Cmd>;
@group(0) @binding(3) var<storage, read_write> records: array<vec4<f32>>;
${occlusion ? `@group(0) @binding(4) var<uniform> occ: Occ;
@group(0) @binding(5) var<storage, read> hiz: array<f32>;
@group(0) @binding(6) var<storage, read_write> rejected: array<u32>;` : ""}
${fleets ? `@group(0) @binding(${occlusion ? 7 : 4}) var<storage, read> fleetOf: array<u32>;` : ""}
@group(0) @binding(${(occlusion ? 7 : 4) + (fleets ? 1 : 0)}) var<storage, read> extras: array<vec4<f32>>;

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
  if (cull.clock.y > 0.5 && extras[i].z > cull.clock.x) { return; }   // v4318: not yet vendored on day t
  let lod = cullLod(c, cull);
  if (lod < 0) { return; }
${occlusion ? `  let hidden = hizOccluded(c, occ, &hiz, extras[i].w);
  if (phase == 0u) { rejected[i] = select(0u, 1u, hidden); }
  if (hidden) { return; }` : ""}
  let cap = u32(cull.info.z);
${fleets ? `  let fleet = min(fleetOf[i], max(1u, u32(cull.eye.w)) - 1u);
  let region = fleet * u32(cull.info.y) + u32(lod);` : "  let fleet = 0u;\n  let region = u32(lod);"}
  let slot = atomicAdd(&cmds[region].instanceCount, 1u);
  if (slot < cap) {
    records[(region * cap + slot) * 3u] = c;
    records[(region * cap + slot) * 3u + 1u] = vec4<f32>(f32(i), f32(lod), f32(phase), f32(fleet));
    records[(region * cap + slot) * 3u + 2u] = extras[i];
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
  // r, g: the id's low two bytes; b: the LOD + 8 x the fleet (v4301); a: 128 + the id's third byte -- never 0, so "something" survives
  o.id = vec4<f32>(f32(id & 255u) / 255.0, f32((id >> 8u) & 255u) / 255.0, (ident.y + ident.w * 8.0) / 255.0, f32(128u + ((id >> 16u) & 127u)) / 255.0);
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
  vId = vec4(float(id & 255) / 255.0, float((id >> 8) & 255) / 255.0, (ident.y + ident.w * 8.0) / 255.0, float(128 + ((id >> 16) & 127)) / 255.0);
}
`;
export const PICK_FRAGMENT_GLSL = `#version 300 es
precision highp float;
flat in vec4 vId; out vec4 fragColor;
void main() { fragColor = vId; }
`;
/**
 * Decode a pick pixel: null for background, else { id, lod, fleet }. v4300: ids up to 8,388,607 (a third byte in
 * alpha). v4301: blue is lod + fleet * 8 -- five LODs fit in three bits, so thirty-two fleets fit in the rest.
 */
export const MAX_FLEETS = 32;
export function decodePick(px, i) { if (px[i + 3] < 128) return null; return { id: px[i] + px[i + 1] * 256 + (px[i + 3] - 128) * 65536, lod: px[i + 2] & 7, fleet: px[i + 2] >> 3 }; }
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
/**
 * v4301 -- VERTEX LAYOUTS. A layout is the list of per-vertex attributes in slot 0, each drawn from a field of the
 * mesh (`from`): "positions" and "normals" and "uvs" are per-vertex arrays, "color" is the mesh's one colour.
 * Every layout starts with `p` at location 0, because the pick shader reads only that and the instance slot.
 */
export const LAYOUTS = Object.freeze({
    flat: Object.freeze([{ name: "p", size: 3, from: "positions" }, { name: "color", size: 4, from: "color" }]),
    lit: Object.freeze([{ name: "p", size: 3, from: "positions" }, { name: "color", size: 4, from: "color" }, { name: "n", size: 3, from: "normals" }]),
    sprite: Object.freeze([{ name: "p", size: 3, from: "positions" }, { name: "color", size: 4, from: "color" }, { name: "uv", size: 2, from: "uvs" }]),
});
/** The two vertex-buffer slots of a layout: the per-vertex slot, then the instance slot every pipeline shares. */
export function layoutBuffers(layout = LAYOUTS.flat) {
    // Locations are EXPLICIT: p 0, color 1, the instance slot 2 (rec) and 3 (ident) as every shader here reads
    // them, and a layout's extras from 4 up -- so a richer layout never shifts the instance attributes, and the
    // pick shader (which reads p, rec, ident only) draws over any of them.
    let off = 0; const attributes = layout.map((a, i) => { const o = off; off += a.size * 4; return { name: a.name, size: a.size, offset: o, location: i < 2 ? i : i + 2 }; });
    return [
        { stride: off, stepMode: "vertex", attributes },
        { stride: RECORD_BYTES, stepMode: "instance", attributes: [{ name: "rec", size: 4, offset: 0, location: 2 }, { name: "ident", size: 4, offset: 16, location: 3 }, { name: "extra", size: 4, offset: 32, location: 5 }] },
    ];
}
export function renderPipelineDesc({ layout = LAYOUTS.flat, shaders = null, uniforms = null, topology = null, cull = null, frontFace = null, blend = null } = {}) {
    return {
        shaders: shaders || { wgsl: RENDER_WGSL, glsl: { vertex: RENDER_VERTEX_GLSL, fragment: RENDER_FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        buffers: layoutBuffers(layout),
        uniforms: uniforms || [{ name: "viewProj", type: "mat4" }],
        ...(topology ? { topology } : {}), ...(cull ? { cull } : {}), ...(frontFace ? { frontFace } : {}),
        // v4458 -- `blend` travels the same way topology does: a word gfx/device.js maps per backend.
        ...(blend ? { blend } : {}),
    };
}
/**
 * The pick pipeline: the SAME buffers and uniform, identity for colour. Any consumer pipeline can be picked; a
 * fleet with its own layout or topology gets a pick pipeline over that layout, reading `p` and the instance slot.
 */
export function pickPipelineDesc({ layout = LAYOUTS.flat, topology = null } = {}) {
    return { ...renderPipelineDesc({ layout, topology }), shaders: { wgsl: PICK_WGSL, glsl: { vertex: PICK_VERTEX_GLSL, fragment: PICK_FRAGMENT_GLSL } }, uniforms: [{ name: "viewProj", type: "mat4" }] };
}

// ---- meshes -------------------------------------------------------------------------------------------------------
/**
 * Pack the LOD meshes into ONE vertex buffer and ONE index buffer with ABSOLUTE indices, so every draw has
 * baseVertex 0 -- WebGL2 has no base vertex without an extension, and gfx/device.js refuses a non-zero one there.
 * Each mesh: { positions: Float32Array(3n), indices: (Uint16|Uint32)Array, color: [r,g,b,a], normals?, uvs?, colors? } --
 * per-vertex `colors` (rgb or rgba per vertex, a voxel mesh's) win over the one `color` where present.
 * v4301: `layout` (LAYOUTS.*) says which fields travel per vertex; the default is the 7-float flat layout of
 * Levels 11-14, byte for byte. A mesh missing a field the layout wants gets zeros there, and says so in `missing`.
 */
export function packMeshes(meshes, layout = LAYOUTS.flat) {
    const floats = layout.reduce((s, a) => s + a.size, 0);
    let nv = 0, ni = 0;
    for (const m of meshes) { nv += m.positions.length / 3; ni += m.indices.length; }
    const vertexData = new Float32Array(nv * floats), indexData = new Uint32Array(ni);
    const ranges = [], missing = [];
    let vb = 0, ib = 0;
    for (const m of meshes) {
        const n = m.positions.length / 3, col = m.color || [1, 1, 1, 1];
        for (let v = 0; v < n; v++) {
            let o = (vb + v) * floats;
            for (const a of layout) {
                if (a.from === "color") { const pv = m.colors, cs = pv ? pv.length / n : 0; for (let k = 0; k < a.size; k++) vertexData[o + k] = (pv && k < cs) ? pv[v * cs + k] : (col[k] == null ? 1 : col[k]); }
                else { const src = m[a.from]; if (!src) { if (v === 0 && !missing.includes(a.from)) missing.push(a.from); } else for (let k = 0; k < a.size; k++) vertexData[o + k] = src[v * a.size + k]; }
                o += a.size;
            }
        }
        for (let k = 0; k < m.indices.length; k++) indexData[ib + k] = m.indices[k] + vb;
        ranges.push({ indexCount: m.indices.length, firstIndex: ib, baseVertex: 0, triangles: m.indices.length / 3 });
        vb += n; ib += m.indices.length;
    }
    return { vertexData, indexData, ranges, stride: floats * 4, floats, missing };
}

/** A unit quad in the XY plane, as a mesh with `subdiv` cells per side -- a cheap way to give LODs real triangle counts. */
export function quadMesh(subdiv = 1, color = [1, 1, 1, 1]) {
    const n = subdiv + 1, positions = new Float32Array(n * n * 3), indices = new Uint32Array(subdiv * subdiv * 6);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = (y * n + x) * 3; positions[o] = x / subdiv * 2 - 1; positions[o + 1] = y / subdiv * 2 - 1; positions[o + 2] = 0; }
    let k = 0;
    for (let y = 0; y < subdiv; y++) for (let x = 0; x < subdiv; x++) { const a = y * n + x, b = a + 1, c = a + n, d = c + 1; indices[k++] = a; indices[k++] = b; indices[k++] = c; indices[k++] = b; indices[k++] = d; indices[k++] = c; }
    return { positions, indices, color };
}

/**
 * v4376 -- A DISC, WHICH IS WHAT orrery-gpu.html's OWN COMMENT SAYS ITS BODIES ARE. A triangle fan of `segments`
 * around the origin, inscribed in the same [-1,1] square quadMesh spans, so it drops into a ladder in that one's
 * place without moving a record or a threshold.
 *
 * *** WHY THIS EXISTS AND WHAT IT COSTS, BOTH MEASURED RATHER THAN ARGUED. *** quadMesh is a FLAT SQUARE and the
 * default pipeline's fragment is `return v.color;` -- no discard, no distance-to-centre test -- so a body drawn
 * from it is a square, and subdividing it changes nothing a picture can show (v4375 priced both shipped ladders
 * and found them tells rather than approximations for exactly that reason). A disc ladder is the other kind: a
 * 6-gon and a 32-gon have different silhouettes, the difference falls with distance, and a fidelity budget can
 * therefore choose where to switch. It is not free -- an n-gon is n triangles where the quad is 2, so the CHEAP
 * end of a disc ladder costs more than the cheap end of a quad one -- and being inscribed it covers pi/4 of the
 * area, so a body swapped from quad to disc gets smaller as well as rounder. Neither is a defect; both are the
 * price of the comment being true, and the gate states both as numbers.
 */
export function discMesh(segments = 16, color = [1, 1, 1, 1]) {
    const n = Math.max(3, segments | 0);
    const positions = new Float32Array((n + 1) * 3), indices = new Uint32Array(n * 3);
    for (let k = 0; k < n; k++) { const a2 = (k / n) * Math.PI * 2;
        positions[(k + 1) * 3] = Math.cos(a2); positions[(k + 1) * 3 + 1] = Math.sin(a2); positions[(k + 1) * 3 + 2] = 0; }
    for (let k = 0; k < n; k++) { indices[k * 3] = 0; indices[k * 3 + 1] = k + 1; indices[k * 3 + 2] = ((k + 1) % n) + 1; }
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
export function packCullUniforms({ planes, eye, thresholds, count, lodCount, cap, phase = 0, fleetCount = 1, clock = null }) {
    const u = new Float32Array(CULL_UNIFORM_FLOATS);
    u.set(planes.subarray ? planes.subarray(0, 24) : planes.slice(0, 24), 0);
    u[24] = eye[0]; u[25] = eye[1]; u[26] = eye[2]; u[27] = fleetCount;
    for (let k = 0; k < 4; k++) u[28 + k] = thresholds[k] == null ? 0 : thresholds[k];
    u[32] = count; u[33] = lodCount; u[34] = cap; u[35] = phase;
    u[36] = clock == null ? 0 : clock; u[37] = clock == null ? 0 : 1; u[38] = 0; u[39] = 0;
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
 * The twin of cullLodWgsl(): for every instance record, which LOD (or none). Returns per-REGION id lists, the
 * counts, and the compacted record buffer laid out exactly as the compute shader lays it out (region-major, `cap`
 * records each), so a WebGL2 path can upload it as-is and a gate can compare it as a set. v4301: a region is
 * (fleet, LOD) -- fleet * lodCount + lod -- with `fleetOf` a u32 per record and the fleet count in the uniforms;
 * without either, every record is fleet 0 and region == LOD, as before.
 */
export function cullLodCpu(records, u, fleetOf = null, extras = null) {
    const count = u[32] | 0, lodCount = u[33] | 0, cap = u[34] | 0, fleetCount = Math.max(1, u[27] | 0), regions = lodCount * fleetCount;
    const ids = Array.from({ length: regions }, () => []);
    for (let i = 0; i < count; i++) {
        const c = [records[i * 4], records[i * 4 + 1], records[i * 4 + 2], records[i * 4 + 3]];
        if (u[37] > 0.5 && extras && extras[i * EXTRA_FLOATS + 2] > u[36]) continue;   // v4318: not yet vendored on day t
        const lod = cullLodCpuOne(c, u);
        if (lod < 0) continue;
        const fleet = fleetOf ? Math.min(fleetOf[i], fleetCount - 1) : 0;
        ids[fleet * lodCount + lod].push(i);
    }
    const counts = new Uint32Array(regions), compact = new Float32Array(regions * cap * OUT_RECORD_FLOATS);
    for (let r = 0; r < regions; r++) {
        counts[r] = ids[r].length;
        const lod = r % lodCount, fleet = Math.floor(r / lodCount);
        for (let s = 0; s < Math.min(cap, ids[r].length); s++) { const o = (r * cap + s) * OUT_RECORD_FLOATS;
            compact.set(records.subarray(ids[r][s] * 4, ids[r][s] * 4 + 4), o); compact[o + 4] = ids[r][s]; compact[o + 5] = lod; compact[o + 6] = 0; compact[o + 7] = fleet;
            if (extras) compact.set(extras.subarray(ids[r][s] * EXTRA_FLOATS, ids[r][s] * EXTRA_FLOATS + EXTRA_FLOATS), o + 8); else compact[o + 8] = ids[r][s] * SPIN; }
    }
    return { ids, counts, compact, visible: ids.reduce((a, b) => a + b.length, 0), lodCount, fleetCount, regions };
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
export function hizOccludedCpu(c, u, pyramid, bias = 0) {
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
    return { occluded: bias > 0 ? (far < 1 && depth + bias > far) : depth > far, depth, far, level, bias, rect: [x0, y0, x1, y1] };
}

/** The indirect command template: per REGION (fleet-major, then LOD), its mesh range with instanceCount 0. Written fresh every frame. */
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
 *   cap:        records per region; defaults to the instance count, so no region can overflow
 * frame({ viewProj, eye, clear }) culls and draws. On WebGPU that is a dispatch and one drawIndexedIndirect per
 * region; elsewhere it is the twin and one drawIndexed per region. readCounts() reads the instance counts back
 * from wherever they were produced -- the indirect buffer on WebGPU, the twin's result otherwise.
 *
 * v4301 -- FLEETS. Instead of `lods` (+ pipeline, bind), pass
 *   fleets:  [{ name, lods, layout?, pipeline?, bind?, topology? }]   each fleet its own meshes, layout and shaders
 *   fleetOf: Uint32Array(count)                                         which fleet each record belongs to
 * All fleets share the thresholds, so each must bring thresholds.length + 1 levels (the ladder is the scene's;
 * the rungs are the fleet's). A fleet's `bind(pass, ctx)` runs after use() each draw, with ctx = { viewProj,
 * eye, time } so a shader can take its light or its clock. The pick pipeline is per fleet, over that fleet's
 * layout and topology, so what is under the pointer is answered for every architecture the same way; a fleet
 * whose vertex stage moves the hull passes `pickPipeline` (and `pickBind`) so the identity picture moves it too --
 * the fleets gate found the default pick drawing unspun hulls under spun ones, and named the wrong pixels.
 */
export function makeGpuDrivenScene(device, { lods = null, thresholds, records, cap = null, occlusion = false, pipeline = null, bind = null, fleets = null, fleetOf = null, time = null, headings = null, clock = null, cull = null }) {
    // v4373 -- `cull` lets a caller BRING THE COMPUTE PASS THAT DECIDES WHAT DRAWS, the way `pipeline`/`bind` let
    // one bring the render shaders. { wgsl, entryPoint, bind(pipe, buffers), write(u) }: the scene creates and owns
    // every buffer, hands them to bind() once, and calls write() each frame with the SAME packed uniforms
    // packCullUniforms produces -- so a pass with a different binding shape (a generated one, whose frustum is its
    // own uniform rather than a member of struct Cull) can be driven without gpuDriven knowing anything about it.
    // WebGPU only, and refused by name elsewhere: the WebGL2 route runs the CPU twin and there is no pass to swap.
    // Refused with occlusion too, because the two-phase path builds a second cull this hook does not describe.
    if (cull && (typeof cull.wgsl !== "string" || typeof cull.bind !== "function" || typeof cull.write !== "function"))
        throw new Error("gpuDriven: cull must be { wgsl, entryPoint?, bind(pipe, buffers), write(u) } -- the scene owns the buffers and the uniforms, and the caller owns the binding shape");
    if (cull && occlusion) throw new Error("gpuDriven: a custom cull and occlusion together are refused -- the two-phase path builds a SECOND cull pass from cullLodWgsl and this hook describes one");
    if (cull && device.backend !== "webgpu") throw new Error(`gpuDriven: a custom cull needs a compute stage and this device is ${device.backend}; the webgl2 route culls on the CPU (cullLodCpu) and has no pass to replace`);
    // Level 12 -- `records` may be a Float32Array (static instances) or a SOURCE produced elsewhere each frame:
    //   { count, buffer }   a gfx/device.js buffer another compute pass writes (WebGPU: the cull reads it directly)
    //   { count, cpu }      a function returning the Float32Array for this frame (the twin route, any backend)
    // A GPU source must carry a `cpu` twin too, or the WebGL2 route has nothing to cull. And `pipeline` /
    // `bind` let a consumer bring its own render shaders (a terrain that samples a heightfield in the vertex
    // stage) as long as they take the same two vertex buffers: bind(pass) runs after use() each frame.
    const src = records instanceof Float32Array ? { count: records.length / RECORD_FLOATS, cpu: () => records, static: records } : records;
    if (!src || !(src.count > 0) || (!src.cpu && !src.static)) throw new Error("gpuDriven: records must be a Float32Array or { count, cpu() } (with an optional GPU `buffer`) -- the twin needs a CPU copy");
    const count = src.count;
    // one fleet or many: a scene without fleets is a scene with one, named "all", carrying the legacy pipeline/bind
    const fleetDefs = fleets && fleets.length ? fleets : [{ name: "all", lods, pipeline, bind }];
    if (fleetDefs.length > MAX_FLEETS) throw new Error(`gpuDriven: ${fleetDefs.length} fleets; the pick picture packs the fleet in five bits, so at most ${MAX_FLEETS}`);
    const fleetCount = fleetDefs.length, hasFleets = !!(fleets && fleets.length);
    if (hasFleets && !(fleetOf && fleetOf.length >= count)) throw new Error(`gpuDriven: ${fleetCount} fleets need a fleetOf (Uint32Array) with one entry per record (${count}); without it nobody knows which architecture an instance is`);
    if (fleetOf) for (let i = 0; i < count; i++) if (!(fleetOf[i] < fleetCount)) throw new Error(`gpuDriven: record ${i} names fleet ${fleetOf[i]}, and there are ${fleetCount} fleets`);
    const perFleet = fleetDefs.map((f, fi) => {
        if (!f.lods || !f.lods.length) throw new Error(`gpuDriven: fleet ${JSON.stringify(f.name || fi)} brings no levels`);
        const desc = f.pipeline || renderPipelineDesc({ layout: f.layout || LAYOUTS.flat, topology: f.topology || null });
        const ranked = rankLods(f.lods, thresholds, { shader: desc.shaders.wgsl });
        const packed = packMeshes(ranked.lods.map((l) => l.lod.mesh), f.layout || LAYOUTS.flat);
        return { name: f.name || String(fi), index: fi, ranked, packed, desc, bind: f.bind || null, layout: f.layout || LAYOUTS.flat, topology: f.topology || desc.topology || null,
                 // a fleet whose vertex stage moves its hull (a spin, a lift) brings a pick pipeline that moves it the same way,
                 // and a pickBind for what that pick shader reads (a sprite's atlas, so the pick discards where the sprite does)
                 pickDesc: f.pickPipeline || null, pickBind: f.pickBind || null, vbuf: null, ibuf: null, pipe: null, pickPipe: null };
    });
    const lodCount = perFleet[0].ranked.lods.length;
    for (const f of perFleet) if (f.ranked.lods.length !== lodCount) throw new Error(`gpuDriven: fleet ${JSON.stringify(f.name)} has ${f.ranked.lods.length} levels and fleet ${JSON.stringify(perFleet[0].name)} has ${lodCount}; the thresholds are shared, so every fleet climbs the same ladder`);
    const ranked = perFleet[0].ranked;
    const regionCount = lodCount * fleetCount;
    cap = cap == null ? count : cap;
    if (cap < count) throw new Error(`gpuDriven: cap ${cap} is below the instance count ${count}; a region that can overflow drops instances silently`);
    const gpuPath = device.backend === "webgpu";
    for (const f of perFleet) {
        f.vbuf = device.buffer({ data: f.packed.vertexData, usage: "vertex" });
        f.ibuf = device.buffer({ data: f.packed.indexData, usage: "index" });
        f.pipe = device.pipeline(f.desc);
    }
    // the region ranges, fleet-major: region r = fleet * lodCount + lod draws that fleet's mesh for that LOD
    const ranges = perFleet.flatMap((f) => f.packed.ranges);
    const template = indirectTemplate(ranges);
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
    let cullPipe = null, cullPipe2 = null, ubuf = null, ubuf2 = null, inBuf = null, cmdBuf = null, cmdBuf2 = null, outBuf = null, outBuf2 = null, rejBuf = null, fleetBuf = null, last = null, lastCam = null;
    let hizPipe = null, hizBuf = null, occBuf = null, hizLayoutNow = null, lvlBufs = [], pyramidReady = false, hizDims = null;
    const fleetOfU32 = hasFleets ? (fleetOf instanceof Uint32Array ? fleetOf : Uint32Array.from(fleetOf)) : null;
    // v4317 -- the extras: a static Float32Array (count x 4), a { cpu() } source read every frame, or nothing (the golden angle)
    const extraSrc = headings instanceof Float32Array ? { cpu: () => headings, static: true } : (headings && typeof headings.cpu === "function") ? headings : { cpu: () => defaultExtras(count), static: true };
    let extrasNow = extraSrc.cpu();
    if (extrasNow.length < count * EXTRA_FLOATS) throw new Error(`gpuDriven: headings must carry ${EXTRA_FLOATS} floats per record (${count * EXTRA_FLOATS}), got ${extrasNow.length}`);
    let extraBuf = null;
    if (gpuPath) {
        cullPipe = device.compute({ wgsl: cull ? cull.wgsl : cullLodWgsl({ occlusion: occ, fleets: hasFleets }), entryPoint: (cull && cull.entryPoint) || "main" });
        ubuf = device.buffer({ size: CULL_UNIFORM_BYTES, usage: "uniform" });
        inBuf = (src.buffer && src.buffer.gpu) ? src.buffer : device.buffer({ data: src.static || src.cpu(), usage: "storage" });
        cmdBuf = device.buffer({ data: template, usage: "indirect" });
        outBuf = device.buffer({ size: regionCount * regionBytes, usage: ["storage", "vertex"] });
        if (hasFleets) fleetBuf = device.buffer({ data: fleetOfU32, usage: "storage" });
        extraBuf = device.buffer({ data: extrasNow, usage: "storage" });
        if (cull) cull.bind(cullPipe, { inst: inBuf, cmds: cmdBuf, records: outBuf, extras: extraBuf, fleetOf: fleetBuf, cullUniform: ubuf });
        else {
            cullPipe.bind("cull", ubuf).bind("inst", inBuf).bind("cmds", cmdBuf).bind("records", outBuf);
            if (hasFleets) cullPipe.bind("fleetOf", fleetBuf);
            cullPipe.bind("extras", extraBuf);
        }
        if (occ) {
            occBuf = device.buffer({ size: OCC_UNIFORM_FLOATS * 4, usage: "uniform" });
            rejBuf = device.buffer({ size: count * 4, usage: "storage" });
            cullPipe.bind("rejected", rejBuf);
            hizPipe = { level0: device.compute({ wgsl: hizLevel0Wgsl(), entryPoint: "level0" }), reduce: device.compute({ wgsl: hizReduceWgsl(), entryPoint: "reduce" }) };
            if (twoPhase) {
                cullPipe2 = device.compute({ wgsl: cullLodWgsl({ occlusion: true, fleets: hasFleets }), entryPoint: "main" });
                ubuf2 = device.buffer({ size: CULL_UNIFORM_BYTES, usage: "uniform" });
                cmdBuf2 = device.buffer({ data: template, usage: "indirect" });
                outBuf2 = device.buffer({ size: regionCount * regionBytes, usage: ["storage", "vertex"] });
                cullPipe2.bind("cull", ubuf2).bind("inst", inBuf).bind("cmds", cmdBuf2).bind("records", outBuf2).bind("occ", occBuf).bind("rejected", rejBuf);
                if (hasFleets) cullPipe2.bind("fleetOf", fleetBuf);
                cullPipe2.bind("extras", extraBuf);
            }
        }
    } else {
        outBuf = device.buffer({ size: regionCount * regionBytes, usage: "vertex" });
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
    const clockNow = () => (typeof time === "function" ? time() : (typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000));
    /**
     * The draws of one phase: every fleet's pipeline, then every one of its regions. Shared by the colour frame
     * and the pick frame (`picking` swaps in each fleet's pick pipeline; the fleet's bind hook is skipped there,
     * because the pick shader declares nothing to bind).
     */
    function drawPhase(pass, out, cmds, twinCounts, ctx, picking = false) {
        for (const f of perFleet) {
            if (picking && !f.pickPipe) f.pickPipe = device.pipeline(f.pickDesc || pickPipelineDesc({ layout: f.layout, topology: f.topology }));
            pass.use(picking ? f.pickPipe : f.pipe);
            pass.uniform("viewProj", ctx.viewProj);
            if (picking ? f.pickBind : f.bind) (picking ? f.pickBind : f.bind)(pass, ctx);
            pass.vertices(f.vbuf, 0);
            pass.indices(f.ibuf);
            for (let l = 0; l < lodCount; l++) {
                const r = f.index * lodCount + l;
                pass.instances(out, r * regionBytes);
                if (gpuPath) pass.drawIndexedIndirect(cmds, r * INDIRECT_BYTES);
                else if (twinCounts && twinCounts[r] > 0) pass.drawIndexed(ranges[r].indexCount, twinCounts[r], ranges[r].firstIndex);
            }
        }
    }
    function frame({ viewProj, view = null, proj = null, eye, clear = [0, 0, 0, 1], read = false, target = null }) {
        if (occ && (!view || !proj)) throw new Error("gpuDriven: an occluding scene needs `view` and `proj` separately -- the Hi-Z test works in view space");
        const day = typeof clock === "function" ? clock() : null;
        const u = packCullUniforms({ planes: frustumPlanes(viewProj), eye, thresholds: ranked.thresholds, count, lodCount, cap, fleetCount, clock: day });
        const ctx = { viewProj, eye, time: clockNow(), day };
        lastCam = ctx;
        let twin = null, occU = null;
        if (!extraSrc.static) { extrasNow = extraSrc.cpu(); if (gpuPath) extraBuf.write(extrasNow); }
        if (gpuPath) { if (cull) cull.write(u); else ubuf.write(u); cmdBuf.write(template);
            if (occ) { const en = pyramidReady && hizLayoutNow; occU = packOccUniforms({ view, proj, w: en ? hizDims[0] : 0, h: en ? hizDims[1] : 0, levels: en ? hizLayoutNow.levels.length : 0, enabled: !!en });
                if (!hizBuf) { ensureHiz(1, 1); pyramidReady = false; }   // a binding must exist before the first dispatch
                occBuf.write(occU); cullPipe.bind("occ", occBuf); } }
        else { twin = cullLodCpu(src.static || src.cpu(), u, fleetOfU32, extrasNow); outBuf.write(twin.compact); last = twin; }
        const readback = device.frame(({ pass }) => {
            if (gpuPath) pass.dispatch(cullPipe, Math.ceil(count / CULL_WORKGROUP));
            // Level 13 -- clear: null draws OVER whatever the last frame left (colour and depth): a second scene on
            // the same canvas, such as the traders over the orrery's bodies.
            if (clear === null) pass.begin(); else pass.clear(clear);
            drawPhase(pass, outBuf, cmdBuf, twin && twin.counts, ctx);
        }, (read && !twoPhase) || target ? { ...((read && !twoPhase) ? { read: true } : {}), ...(target ? { target } : {}) } : undefined);
        // the pyramid for the NEXT frame comes from this frame's depth -- classic two-pass occlusion
        const built = occ ? buildHiz() : false;
        let readback2 = null, phase2 = false;
        if (twoPhase && occU && occU[35] > 0) {
            // phase 1: the rejected set against the pyramid just built from phase 0's draw, drawn ON TOP
            phase2 = true;
            const occU2 = packOccUniforms({ view, proj, w: hizDims[0], h: hizDims[1], levels: hizLayoutNow.levels.length, enabled: true });
            occBuf.write(occU2);
            ubuf2.write(packCullUniforms({ planes: frustumPlanes(viewProj), eye, thresholds: ranked.thresholds, count, lodCount, cap, phase: 1, fleetCount, clock: day })); cmdBuf2.write(template);
            readback2 = device.frame(({ pass }) => {
                pass.dispatch(cullPipe2, Math.ceil(count / CULL_WORKGROUP));
                pass.begin();
                drawPhase(pass, outBuf2, cmdBuf2, null, ctx);
            }, read || target ? { ...(read ? { read: true } : {}), ...(target ? { target } : {}) } : undefined);
        } else if (twoPhase && read) {
            // no pyramid yet (first frame): nothing to re-test, and the readback the caller asked for is the phase-0 picture
            readback2 = device.frame(({ pass }) => { pass.begin(); }, { read: true, ...(target ? { target } : {}) });
        }
        return { backend: device.backend, path: gpuPath ? "compute+drawIndexedIndirect" : "cpu-twin+drawIndexed", lodCount, fleetCount, regionCount, count, uniforms: u,
                 occlusion: occ, twoPhase, phase2Ran: phase2, occUniforms: occU, pyramidUsed: !!(occU && occU[35] > 0), pyramidBuilt: built,
                 ...(read ? { pixels: twoPhase ? readback2 : readback } : {}) };
    }
    /**
     * Level 13 -- PICK: what is under pixel (x, y) of the last frame. The pick picture is the last compacted records
     * drawn through the pick pipeline into an OFFSCREEN target (the page never sees it), one pixel decoded.
     * Returns { id, lod, fleet } or null. `id` is the INPUT record's index -- what the caller gave the scene.
     */
    async function pick(x, y) {
        if (!lastCam) return null;
        const fr = device.frame(({ pass }) => {
            pass.clear([0, 0, 0, 0]);
            drawPhase(pass, outBuf, cmdBuf, last && last.counts, lastCam, true);
            if (twoPhase && cmdBuf2) drawPhase(pass, outBuf2, cmdBuf2, null, lastCam, true);
        }, { read: true, offscreen: true, depth: false });
        const p = await fr;
        if (!p || !p.pixels) return null;   // the null backend records and draws nothing
        const px = Math.max(0, Math.min(p.width - 1, Math.floor(x))), py = Math.max(0, Math.min(p.height - 1, Math.floor(y)));
        const hit = decodePick(p.pixels, (py * p.width + px) * 4);
        return hit ? { ...hit, x: px, y: py, fleetName: perFleet[hit.fleet] ? perFleet[hit.fleet].name : null } : null;
    }
    /** v4301 -- the whole pick picture, decoded: { width, height, hits: (null | {id, lod, fleet})[] }. A gate reads it to ask where each fleet is. */
    async function pickPicture() {
        if (!lastCam) return null;
        const p = await device.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); drawPhase(pass, outBuf, cmdBuf, last && last.counts, lastCam, true);
            if (twoPhase && cmdBuf2) drawPhase(pass, outBuf2, cmdBuf2, null, lastCam, true); }, { read: true, offscreen: true, depth: false });
        if (!p || !p.pixels) return null;
        const hits = new Array(p.width * p.height);
        for (let i = 0; i < hits.length; i++) hits[i] = decodePick(p.pixels, i * 4);
        return { width: p.width, height: p.height, hits };
    }
    /** v4318 -- the identity picture drawn INTO A TARGET texture (device.texture({ render: true })): the mask on the device reads it, no readback. */
    function pickTo(target) {
        if (!lastCam) return null;
        device.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); drawPhase(pass, outBuf, cmdBuf, last && last.counts, lastCam, true);
            if (twoPhase && cmdBuf2) drawPhase(pass, outBuf2, cmdBuf2, null, lastCam, true); }, { target, depth: false });
        return target;
    }
    async function readPyramid() { if (!occ || !hizBuf) return null; return { pyramid: new Float32Array(await device.read(hizBuf)), layout: hizLayoutNow, dims: hizDims }; }
    /** The instance count of every region, fleet-major (region = fleet * lodCount + lod). One fleet: one count per LOD, as before. */
    async function readCounts() {
        if (!gpuPath) return last ? Array.from(last.counts) : null;
        const raw = new Uint32Array(await device.read(cmdBuf));
        return Array.from({ length: regionCount }, (_, r) => raw[r * INDIRECT_STRIDE_U32 + 1]);
    }
    /** The second phase's counts, or null when there is no second phase. */
    async function readCounts2() {
        if (!twoPhase || !cmdBuf2) return null;
        const raw = new Uint32Array(await device.read(cmdBuf2));
        return Array.from({ length: regionCount }, (_, r) => raw[r * INDIRECT_STRIDE_U32 + 1]);
    }
    /** v4301 -- the counts folded per fleet: [{ name, counts: [per LOD], total }]. */
    async function readCountsByFleet() {
        const c = await readCounts(); if (!c) return null;
        return perFleet.map((f) => { const counts = c.slice(f.index * lodCount, (f.index + 1) * lodCount); return { name: f.name, counts, total: counts.reduce((a, b) => a + b, 0) }; });
    }
    async function readRecords() {
        if (!gpuPath) return last ? last.compact : null;
        return new Float32Array(await device.read(outBuf));
    }
    return { frame, pick, pickPicture, pickTo, readCounts, readCounts2, readCountsByFleet, readRecords, readPyramid, order: ranked, ranges, count, cap, lodCount, fleetCount, regionCount,
             fleets: perFleet.map((f) => ({ name: f.name, index: f.index, layout: f.layout, topology: f.topology, order: f.ranked, ranges: f.packed.ranges, missing: f.packed.missing, pipe: f.pipe })),
             occlusion: occ, twoPhase, path: gpuPath ? "compute+drawIndexedIndirect" : "cpu-twin+drawIndexed",
             destroy() { for (const b of [ubuf, ubuf2, (src.buffer ? null : inBuf), cmdBuf, cmdBuf2, outBuf, outBuf2, rejBuf, fleetBuf, extraBuf, hizBuf, occBuf, ...lvlBufs, ...perFleet.flatMap((f) => [f.vbuf, f.ibuf])]) { try { b && b.destroy && b.destroy(); } catch (e) {} } } };
}
