// WebGLEngine/render/gpuTerrain.mjs -- v4299 (Level 12), lit at v4300 (Level 14), its own pick pipeline at v4479, biome looks and water at v4481
//
// LEVEL 12: TERRAIN ON THE GPU-DRIVEN PATH. A heightfield is a texture; the ground is a grid of chunk instances
// culled and LOD-picked by render/gpuDriven.mjs's compute pass; each chunk's vertices are lifted in the VERTEX
// STAGE by a texel fetch. No mesh is built on the CPU for the terrain -- one quad per LOD is packed once, and
// where it lands and how tall it is come from the instance record and the texture.
//
// *** texelFetch / textureLoad, NEVER A FILTERED SAMPLE. *** Integer texel, no filtering, so the vertex on
// the GPU reads exactly the byte the CPU model reads, and the gate can demand equality instead of tolerance
// -- the same choice render/crtPass.js made for the same reason. Each chunk's COLOUR is its centre texel's
// height, flat across the chunk, so a pixel is a direct readout of which texel the chunk sampled.
//
// The record is the cull's sphere: centre (x, 0, z) and a radius that contains the chunk's footprint at any
// height the field can reach -- halfSize * SQRT2 for the corners, plus half the height range for the lift.
// The vertex stage recovers halfSize from it, so the cull and the draw read ONE number and cannot disagree.
"use strict";
import { RECORD_BYTES, VERTEX_FLOATS, RECORD_FLOATS } from "./gpuDriven.mjs";
import { makeField } from "./strengthField.mjs";
import { BIOMES } from "../world/worleyBiomes.js";
import { BIOME_ORDER } from "../world/repoHeightfield.js";

// v4481 -- THE LOOK: how a fragment is coloured. 0 is the v4300 colour to the byte (red = the chunk's centre height,
// green = its shade), which tools/ship/gpuTerrain-selfcheck.mjs reads pixels by; 1 colours each texel by its WORLEY
// biome (render/worleyWgsl.mjs paints the field's green as primary * 16 + secondary and blue as the blend byte, and
// the fragment lerps the two biomes' colours by the blend, times the chunk's shade); 2 by the LANGUAGE biome the
// treemap gave each file (alpha, world/repoHeightfield.js BIOME_ORDER + 1, index 1 the lake bed). Both palettes are
// the shipped tables' colours, baked into both shaders as if-chains, and the CPU twin terrainColourAt reads the same
// bytes to the same colour, which tools/ship/terrainLook-selfcheck.mjs holds pixel by pixel.
//
// *** THE WATER IS IN THE FRAGMENT, PER LAKE, AND A FLAT PLANE WAS TRIED AND MEASURED WRONG. *** The first draft drew one
// translucent sheet at the level that just covered every lake bed. A treemap's lake beds sit at their own landmass's
// massif height (world/repoHeightfield.js: the bed is the parent directory's lift without the file's summit), so the
// level that covers the highest lake floods every lower landmass -- measured at v4481: level 0.80, 39 of 64 dry chunks
// under water. Each lake bed is already flat at its own height, so the water is the bed's texels (alpha = 1) composited
// with WATER_COLOUR over the Worley colour beneath, under either look; nothing floods, and the twin is waterOver().
export const LOOK = Object.freeze({ height: 0, worley: 1, language: 2 });
/** The lake colour ui/orreryDraw.js paints water with (WATER), and the plane's opacity over the bed. */
export const WATER_COLOUR = Object.freeze([0.18, 0.42, 0.62, 0.55]);
const f3 = (v) => v.toFixed(6);
/** Worley biome id (1..8) -> colour, from the shipped table; 0 or unknown -> the own colour. */
export const WORLEY_COLOURS = Object.freeze(Object.fromEntries(Object.values(BIOMES).map((b) => [b.id, b.color])));
/** Language layer (alpha = BIOME_ORDER index + 1; 1 is water) -> colour: the lake colour for 1, the named biome's for the rest. */
export const LANGUAGE_COLOURS = Object.freeze(Object.fromEntries(BIOME_ORDER.map((name, i) => [i + 1, i === 0 ? WATER_COLOUR.slice(0, 3) : (BIOMES[name] ? BIOMES[name].color : [1, 0, 1])])));   // index 1 (the lake bed) is never reached: a lake is water over the Worley colour
function colourChain(table, lang) {
    const vec = lang === "wgsl" ? "vec3<f32>" : "vec3";
    return Object.entries(table).map(([id, c]) => `  if (i == ${id}) { return ${vec}(${f3(c[0])}, ${f3(c[1])}, ${f3(c[2])}); }`).join("\n");
}
/** The `look` uniform: (mode, 0, 0, 0). */
export function lookParams(mode = LOOK.height) { return new Float32Array([Number(mode) || 0, 0, 0, 0]); }

/** radius = halfSize * RADIUS_PER_HALF + heightScale / 2; the shader inverts the first term. */
export const RADIUS_PER_HALF = Math.SQRT2;

// v4300 -- LIGHT. The normal at a texel is the central difference of its four neighbours in world units, the
// shade is ambient + (1 - ambient) * max(0, n . L). It is computed ONCE per chunk at the centre texel and painted
// flat, like the height: red stays the centre height byte (exact, as Level 12 graded it) and GREEN is the shade, so
// a pixel is still a readout the CPU model can be held to, now of two numbers.
export const TERRAIN_WGSL = `
struct Cam { viewProj: mat4x4<f32>, terrain: vec4<f32>, light: vec4<f32>, look: vec4<f32> };   // terrain = (originX, originZ, extent, heightScale); light = (dir.xyz, ambient); look = (mode, 0, 0, 0)
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32>, @location(1) w: vec2<f32> };
fn worleyColour(i: i32, own: vec3<f32>) -> vec3<f32> {
${colourChain(WORLEY_COLOURS, "wgsl")}
  return own;
}
fn languageColour(i: i32, own: vec3<f32>) -> vec3<f32> {
${colourChain(LANGUAGE_COLOURS, "wgsl")}
  return own;
}

fn texelAt(x: f32, z: f32) -> vec2<i32> {
  let dims = textureDimensions(heightTex);
  let u = (x - cam.terrain.x) / cam.terrain.z; let v = (z - cam.terrain.y) / cam.terrain.z;
  return vec2<i32>(clamp(i32(floor(u * f32(dims.x))), 0, i32(dims.x) - 1), clamp(i32(floor(v * f32(dims.y))), 0, i32(dims.y) - 1));
}
fn heightTexel(t: vec2<i32>) -> f32 {
  let dims = vec2<i32>(textureDimensions(heightTex));
  return textureLoad(heightTex, clamp(t, vec2<i32>(0), dims - vec2<i32>(1)), 0).r;
}
// the shade at texel t: central differences, one texel = extent / dims world units, heights * heightScale
fn shadeAt(t: vec2<i32>) -> f32 {
  let dims = textureDimensions(heightTex);
  let step = cam.terrain.z / f32(dims.x);
  let dx = (heightTexel(t + vec2<i32>(1, 0)) - heightTexel(t - vec2<i32>(1, 0))) * cam.terrain.w;
  let dz = (heightTexel(t + vec2<i32>(0, 1)) - heightTexel(t - vec2<i32>(0, 1))) * cam.terrain.w;
  let n = normalize(vec3<f32>(-dx, 2.0 * step, -dz));
  return cam.light.w + (1.0 - cam.light.w) * max(0.0, dot(n, normalize(cam.light.xyz)));
}
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>) -> VOut {
  let half = (rec.w - cam.terrain.w * 0.5) / ${RADIUS_PER_HALF};
  let wx = rec.x + p.x * half; let wz = rec.z + p.y * half;
  let h = textureLoad(heightTex, texelAt(wx, wz), 0).r;
  let tc = texelAt(rec.x, rec.z);
  let hc = textureLoad(heightTex, tc, 0).r;
  var o: VOut;
  // p.z is a height OFFSET in units of heightScale: 0 on the surface, -1 on a skirt vertex hanging below its edge
  o.pos = cam.viewProj * vec4<f32>(wx, (h + p.z) * cam.terrain.w, wz, 1.0);
  o.color = vec4<f32>(hc, shadeAt(tc), hc * shadeAt(tc), 1.0);
  o.w = vec2<f32>(wx, wz);
  return o;
}
// v4481 -- look 0 is the colour above, to the byte; 1 and 2 read the fragment's OWN texel (green = worley primary * 16 +
// secondary, blue = blend, alpha = language + 1) and colour it from the baked palettes, times the chunk's shade (green).
// A lake bed (alpha = 1) is WATER_COLOUR composited over the Worley colour beneath, under either look: each lake is
// flat at its own level already, so no sheet is drawn and nothing floods (see the header).
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> {
  let mode = i32(cam.look.x + 0.5);
  if (mode == 0) { return v.color; }
  let t = textureLoad(heightTex, texelAt(v.w.x, v.w.y), 0);
  let shade = v.color.g;
  let g = i32(t.g * 255.0 + 0.5); let id1 = g / 16; let id2 = g % 16;
  let worley = mix(worleyColour(id1, v.color.rgb), worleyColour(id2, v.color.rgb), t.b) * shade;
  let a = i32(t.a * 255.0 + 0.5);
  if (a == 1) { return vec4<f32>(worley * (1.0 - ${f3(WATER_COLOUR[3])}) + vec3<f32>(${f3(WATER_COLOUR[0])}, ${f3(WATER_COLOUR[1])}, ${f3(WATER_COLOUR[2])}) * ${f3(WATER_COLOUR[3])}, 1.0); }
  if (mode == 1) { return vec4<f32>(worley, 1.0); }
  return vec4<f32>(languageColour(a, v.color.rgb) * shade, 1.0);
}
`;
export const TERRAIN_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
uniform vec4 terrain;
uniform vec4 light;
uniform vec4 look;
uniform sampler2D heightTex;
in vec3 p; in vec4 color; in vec4 rec;
out vec4 vColor; out vec2 vW;
ivec2 texelAt(float x, float z) {
  ivec2 dims = textureSize(heightTex, 0);
  float u = (x - terrain.x) / terrain.z; float v = (z - terrain.y) / terrain.z;
  return ivec2(clamp(int(floor(u * float(dims.x))), 0, dims.x - 1), clamp(int(floor(v * float(dims.y))), 0, dims.y - 1));
}
float heightTexel(ivec2 t) {
  ivec2 dims = textureSize(heightTex, 0);
  return texelFetch(heightTex, clamp(t, ivec2(0), dims - ivec2(1)), 0).r;
}
float shadeAt(ivec2 t) {
  ivec2 dims = textureSize(heightTex, 0);
  float step_ = terrain.z / float(dims.x);
  float dx = (heightTexel(t + ivec2(1, 0)) - heightTexel(t - ivec2(1, 0))) * terrain.w;
  float dz = (heightTexel(t + ivec2(0, 1)) - heightTexel(t - ivec2(0, 1))) * terrain.w;
  vec3 n = normalize(vec3(-dx, 2.0 * step_, -dz));
  return light.w + (1.0 - light.w) * max(0.0, dot(n, normalize(light.xyz)));
}
void main() {
  float half_ = (rec.w - terrain.w * 0.5) / ${RADIUS_PER_HALF};
  float wx = rec.x + p.x * half_; float wz = rec.z + p.y * half_;
  float h = texelFetch(heightTex, texelAt(wx, wz), 0).r;
  ivec2 tc = texelAt(rec.x, rec.z);
  float hc = texelFetch(heightTex, tc, 0).r;
  gl_Position = viewProj * vec4(wx, (h + p.z) * terrain.w, wz, 1.0);
  float sh = shadeAt(tc);
  vColor = vec4(hc, sh, hc * sh, 1.0);
  vW = vec2(wx, wz);
}
`;
export const TERRAIN_FRAGMENT_GLSL = `#version 300 es
precision highp float;
uniform vec4 terrain;
uniform vec4 look;
uniform sampler2D heightTex;
in vec4 vColor; in vec2 vW; out vec4 fragColor;
ivec2 texelAt(float x, float z) {
  ivec2 dims = textureSize(heightTex, 0);
  float u = (x - terrain.x) / terrain.z; float v = (z - terrain.y) / terrain.z;
  return ivec2(clamp(int(floor(u * float(dims.x))), 0, dims.x - 1), clamp(int(floor(v * float(dims.y))), 0, dims.y - 1));
}
vec3 worleyColour(int i, vec3 own) {
${colourChain(WORLEY_COLOURS, "glsl")}
  return own;
}
vec3 languageColour(int i, vec3 own) {
${colourChain(LANGUAGE_COLOURS, "glsl")}
  return own;
}
void main() {
  int mode = int(look.x + 0.5);
  if (mode == 0) { fragColor = vColor; return; }
  vec4 t = texelFetch(heightTex, texelAt(vW.x, vW.y), 0);
  float shade = vColor.g;
  int g = int(t.g * 255.0 + 0.5); int id1 = g / 16; int id2 = g - id1 * 16;
  vec3 worley = mix(worleyColour(id1, vColor.rgb), worleyColour(id2, vColor.rgb), t.b) * shade;
  int a = int(t.a * 255.0 + 0.5);
  if (a == 1) { fragColor = vec4(worley * (1.0 - ${f3(WATER_COLOUR[3])}) + vec3(${f3(WATER_COLOUR[0])}, ${f3(WATER_COLOUR[1])}, ${f3(WATER_COLOUR[2])}) * ${f3(WATER_COLOUR[3])}, 1.0); return; }
  if (mode == 1) { fragColor = vec4(worley, 1.0); return; }
  fragColor = vec4(languageColour(a, vColor.rgb) * shade, 1.0);
}
`;
/**
 * v4479 -- *** THE TERRAIN'S OWN PICK PIPELINE, AND THE DEFECT IT CLOSES. *** gpuDriven's default pick pipeline draws
 * `rec.xyz + p * rec.w`: flat quads scaled by the RECORD'S RADIUS, which for a terrain chunk is the cull's sphere
 * (half * sqrt2 + heightScale / 2), not its half-size, and with no height lift. So the identity picture was a sheet of
 * oversized, overlapping, flat squares, and a pick named a neighbouring chunk: measured at v4479 on the treemap
 * landing, 0 of 6 picks from 45 degrees and 1 of 6 from straight above landed on the chunk under the point (the v4317
 * hills gate tolerated one miss in four and never saw it). This pipeline is the terrain vertex stage -- the same
 * half-size recovery, the same texel lift, the same skirts -- writing gpuDriven's identity colour, so the picture a
 * pick reads is the picture a viewer sees.
 */
export const TERRAIN_PICK_WGSL = `
struct Cam { viewProj: mat4x4<f32>, terrain: vec4<f32> };   // terrain = (originX, originZ, extent, heightScale)
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) @interpolate(flat) id: vec4<f32> };
fn texelAt(x: f32, z: f32) -> vec2<i32> {
  let dims = textureDimensions(heightTex);
  let u = (x - cam.terrain.x) / cam.terrain.z; let v = (z - cam.terrain.y) / cam.terrain.z;
  return vec2<i32>(clamp(i32(floor(u * f32(dims.x))), 0, i32(dims.x) - 1), clamp(i32(floor(v * f32(dims.y))), 0, i32(dims.y) - 1));
}
@vertex fn vs(@location(0) p: vec3<f32>, @location(2) rec: vec4<f32>, @location(3) ident: vec4<f32>) -> VOut {
  let half = (rec.w - cam.terrain.w * 0.5) / ${RADIUS_PER_HALF};
  let wx = rec.x + p.x * half; let wz = rec.z + p.y * half;
  let h = textureLoad(heightTex, texelAt(wx, wz), 0).r;
  var o: VOut;
  o.pos = cam.viewProj * vec4<f32>(wx, (h + p.z) * cam.terrain.w, wz, 1.0);
  let id = u32(ident.x);
  o.id = vec4<f32>(f32(id & 255u) / 255.0, f32((id >> 8u) & 255u) / 255.0, (ident.y + ident.w * 8.0) / 255.0, f32(128u + ((id >> 16u) & 127u)) / 255.0);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> { return v.id; }
`;
export const TERRAIN_PICK_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
uniform vec4 terrain;
uniform sampler2D heightTex;
in vec3 p; in vec4 rec; in vec4 ident;
flat out vec4 vId;
ivec2 texelAt(float x, float z) {
  ivec2 dims = textureSize(heightTex, 0);
  float u = (x - terrain.x) / terrain.z; float v = (z - terrain.y) / terrain.z;
  return ivec2(clamp(int(floor(u * float(dims.x))), 0, dims.x - 1), clamp(int(floor(v * float(dims.y))), 0, dims.y - 1));
}
void main() {
  float half_ = (rec.w - terrain.w * 0.5) / ${RADIUS_PER_HALF};
  float wx = rec.x + p.x * half_; float wz = rec.z + p.y * half_;
  float h = texelFetch(heightTex, texelAt(wx, wz), 0).r;
  gl_Position = viewProj * vec4(wx, (h + p.z) * terrain.w, wz, 1.0);
  int id = int(ident.x);
  vId = vec4(float(id & 255) / 255.0, float((id >> 8) & 255) / 255.0, (ident.y + ident.w * 8.0) / 255.0, float(128 + ((id >> 16) & 127)) / 255.0);
}
`;
export const TERRAIN_PICK_FRAGMENT_GLSL = `#version 300 es
precision highp float;
flat in vec4 vId; out vec4 fragColor;
void main() { fragColor = vId; }
`;
export function terrainPickPipelineDesc() {
    return {
        shaders: { wgsl: TERRAIN_PICK_WGSL, glsl: { vertex: TERRAIN_PICK_VERTEX_GLSL, fragment: TERRAIN_PICK_FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        buffers: [
            { stride: VERTEX_FLOATS * 4, stepMode: "vertex", attributes: [{ name: "p", size: 3, offset: 0 }] },
            { stride: RECORD_BYTES, stepMode: "instance", attributes: [{ name: "rec", size: 4, offset: 0, location: 2 }, { name: "ident", size: 4, offset: 16, location: 3 }] },
        ],
        uniforms: [{ name: "viewProj", type: "mat4" }, { name: "terrain", type: "vec4" }],
        cull: "back", frontFace: "cw",
    };
}
/** The bind hook for the pick pipeline: the terrain params and the height texture, the same two the colour pipeline reads. */
export function terrainPickBind(params, tex) { return (pass) => { pass.uniform("terrain", params); pass.texture("heightTex", tex, 0); }; }

export function terrainPipelineDesc() {
    return {
        shaders: { wgsl: TERRAIN_WGSL, glsl: { vertex: TERRAIN_VERTEX_GLSL, fragment: TERRAIN_FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        buffers: [
            { stride: VERTEX_FLOATS * 4, stepMode: "vertex", attributes: [{ name: "p", size: 3, offset: 0 }, { name: "color", size: 4, offset: 12 }] },
            { stride: RECORD_BYTES, stepMode: "instance", attributes: [{ name: "rec", size: 4, offset: 0 }] },
        ],
        uniforms: [{ name: "viewProj", type: "mat4" }, { name: "terrain", type: "vec4" }, { name: "light", type: "vec4" }, { name: "look", type: "vec4" }],
        // Level 13 -- the sheet's underside is culled. The quad's winding gives a normal pointing DOWN in world
        // (its p.y becomes world z), so the TOP is the clockwise face; saying so here rather than re-winding the
        // mesh keeps one quad for every consumer. Skirts carry both windings and are never culled.
        cull: "back", frontFace: "cw",
    };
}

/** A heightfield: { width, height, data } RGBA8 with red = height in [0, 1], the same shape as a strength field. */
export function heightfield(width, height, fn) { return makeField(width, height, fn); }
/** The height (0..1) the shaders read at world (x, z): the same texel arithmetic, nearest, clamped. */
export function heightAt(field, params, x, z) {
    const u = (x - params.originX) / params.extent, v = (z - params.originZ) / params.extent;
    const tx = Math.max(0, Math.min(field.width - 1, Math.floor(u * field.width))), tz = Math.max(0, Math.min(field.height - 1, Math.floor(v * field.height)));
    return field.data[(tz * field.width + tx) * 4] / 255;
}
/** Chunk records for a side x side grid covering the field's extent. The radius is the cull's sphere. */
export function chunkRecords({ originX, originZ, extent, heightScale }, side) {
    const half = extent / side / 2, out = new Float32Array(side * side * RECORD_FLOATS);
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
        const o = (j * side + i) * RECORD_FLOATS;
        out[o] = originX + (i + 0.5) * extent / side; out[o + 1] = 0; out[o + 2] = originZ + (j + 0.5) * extent / side;
        out[o + 3] = half * RADIUS_PER_HALF + heightScale / 2;
    }
    return out;
}
/**
 * Level 13 -- A SKIRTED CHUNK MESH: the grid quad plus a strip of triangles hanging from each edge straight
 * down. A skirt vertex copies its edge vertex's x, y and carries z = -drop, and the vertex stage reads z as
 * a height offset IN UNITS OF heightScale: drop = 1 hangs the full height range, which covers any gap the
 * field can open -- an LOD crack (a fine edge's texel staircase against a coarse edge's straight line) or a
 * cliff between two flat chunks alike. Nothing is stitched, so no LOD needs to know its neighbour's, which is
 * the property a GPU-driven grid needs; the price is skirt triangles drawn where no crack is.
 */
export function skirtedQuadMesh(subdiv = 1, color = [1, 1, 1, 1], drop = 1) {
    const n = subdiv + 1, nTop = n * n, nSkirt = 4 * n;
    const positions = new Float32Array((nTop + nSkirt) * 3), indices = new Uint32Array(subdiv * subdiv * 6 + 4 * subdiv * 12);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = (y * n + x) * 3; positions[o] = x / subdiv * 2 - 1; positions[o + 1] = y / subdiv * 2 - 1; positions[o + 2] = 0; }
    let k = 0;
    for (let y = 0; y < subdiv; y++) for (let x = 0; x < subdiv; x++) { const a = y * n + x, b = a + 1, c = a + n, d = c + 1; indices[k++] = a; indices[k++] = b; indices[k++] = c; indices[k++] = b; indices[k++] = d; indices[k++] = c; }
    // the four edges, each n vertices along it; the skirt vertex i of edge e is nTop + e * n + i
    const edges = [[...Array(n)].map((_, i) => i), [...Array(n)].map((_, i) => (n - 1) * n + i), [...Array(n)].map((_, i) => i * n), [...Array(n)].map((_, i) => i * n + n - 1)];
    edges.forEach((edge, e) => {
        edge.forEach((v, i) => { const o = (nTop + e * n + i) * 3; positions[o] = positions[v * 3]; positions[o + 1] = positions[v * 3 + 1]; positions[o + 2] = -drop; });
        for (let i = 0; i < subdiv; i++) { const t0 = edge[i], t1 = edge[i + 1], s0 = nTop + e * n + i, s1 = s0 + 1;
            indices[k++] = t0; indices[k++] = t1; indices[k++] = s0; indices[k++] = t1; indices[k++] = s1; indices[k++] = s0;
            indices[k++] = t1; indices[k++] = t0; indices[k++] = s0; indices[k++] = s1; indices[k++] = t1; indices[k++] = s0; }   // both windings: no cull mode is set
    });
    return { positions, indices, color, skirt: true };
}

/** The CPU model of shadeAt(): the same central differences over the same clamped texels, in f64. */
export function shadeAtTexel(field, params, tx, tz, light) {
    const H = (x, z) => field.data[(Math.max(0, Math.min(field.height - 1, z)) * field.width + Math.max(0, Math.min(field.width - 1, x))) * 4] / 255;
    const step = params.extent / field.width;
    const dx = (H(tx + 1, tz) - H(tx - 1, tz)) * params.heightScale, dz = (H(tx, tz + 1) - H(tx, tz - 1)) * params.heightScale;
    const nl = Math.hypot(dx, 2 * step, dz), n = [-dx / nl, 2 * step / nl, -dz / nl];
    const ll = Math.hypot(light[0], light[1], light[2]), L = [light[0] / ll, light[1] / ll, light[2] / ll];
    return light[3] + (1 - light[3]) * Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
}
/** The texel the shaders take as a chunk centre's, for the model to look at the same one. */
export function texelOf(field, params, x, z) {
    return [Math.max(0, Math.min(field.width - 1, Math.floor((x - params.originX) / params.extent * field.width))), Math.max(0, Math.min(field.height - 1, Math.floor((z - params.originZ) / params.extent * field.height)))];
}
/** A light: direction toward the light, and ambient. Data, so page and gate agree. */
export const LIGHT = Object.freeze([0.4, 1.0, 0.3, 0.25]);
/**
 * v4481 -- THE CPU TWIN OF THE FRAGMENT: the colour at texel (tx, tz) under a look, as the shader computes it from the
 * same bytes -- the chunk's shade is shadeAtTexel at the CHUNK's centre texel (the shader carries it in green), so a
 * caller passes that texel as `shadeTexel` (defaults to the texel itself).
 */
export function terrainColourAt(field, params, tx, tz, light, mode = LOOK.height, shadeTexel = null) {
    const i = (Math.max(0, Math.min(field.height - 1, tz)) * field.width + Math.max(0, Math.min(field.width - 1, tx))) * 4;
    const st = shadeTexel || [tx, tz];
    const hc = field.data[(Math.max(0, Math.min(field.height - 1, st[1])) * field.width + Math.max(0, Math.min(field.width - 1, st[0]))) * 4] / 255;
    const sh = shadeAtTexel(field, params, st[0], st[1], light);
    const own = [hc, sh, hc * sh];
    if (mode === LOOK.height) return own;
    const g = field.data[i + 1], id1 = Math.floor(g / 16), id2 = g % 16, blend = field.data[i + 2] / 255;
    const A = WORLEY_COLOURS[id1] || own, B = WORLEY_COLOURS[id2] || own;
    const worley = [0, 1, 2].map((k) => (A[k] + (B[k] - A[k]) * blend) * sh);
    const a = field.data[i + 3];
    if (a === 1) return waterOver(worley);
    if (mode === LOOK.worley) return worley;
    const C = LANGUAGE_COLOURS[a] || own;
    return [C[0] * sh, C[1] * sh, C[2] * sh];
}

/** The twin of a lake texel: WATER_COLOUR, premultiplied, over the ground colour beneath. */
export function waterOver(rgb, colour = WATER_COLOUR) { const a = colour[3]; return [0, 1, 2].map((k) => rgb[k] * (1 - a) + colour[k] * a); }

/** Pack the terrain uniform the way struct Cam.terrain reads it. */
export function terrainParams({ originX, originZ, extent, heightScale }) { return new Float32Array([originX, originZ, extent, heightScale]); }
