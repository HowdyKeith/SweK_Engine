// WebGLEngine/render/gpuTerrain.mjs -- v4299 (Level 12)
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

/** radius = halfSize * RADIUS_PER_HALF + heightScale / 2; the shader inverts the first term. */
export const RADIUS_PER_HALF = Math.SQRT2;

export const TERRAIN_WGSL = `
struct Cam { viewProj: mat4x4<f32>, terrain: vec4<f32> };   // terrain = (originX, originZ, extent, heightScale)
@group(0) @binding(0) var<uniform> cam: Cam;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) color: vec4<f32> };

fn texelAt(x: f32, z: f32) -> vec2<i32> {
  let dims = textureDimensions(heightTex);
  let u = (x - cam.terrain.x) / cam.terrain.z; let v = (z - cam.terrain.y) / cam.terrain.z;
  return vec2<i32>(clamp(i32(floor(u * f32(dims.x))), 0, i32(dims.x) - 1), clamp(i32(floor(v * f32(dims.y))), 0, i32(dims.y) - 1));
}
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) color: vec4<f32>, @location(2) rec: vec4<f32>) -> VOut {
  let half = (rec.w - cam.terrain.w * 0.5) / ${RADIUS_PER_HALF};
  let wx = rec.x + p.x * half; let wz = rec.z + p.y * half;
  let h = textureLoad(heightTex, texelAt(wx, wz), 0).r;
  let hc = textureLoad(heightTex, texelAt(rec.x, rec.z), 0).r;
  var o: VOut;
  // p.z is a height OFFSET in units of heightScale: 0 on the surface, -1 on a skirt vertex hanging below its edge
  o.pos = cam.viewProj * vec4<f32>(wx, (h + p.z) * cam.terrain.w, wz, 1.0);
  o.color = vec4<f32>(hc, hc, hc, 1.0);
  return o;
}
@fragment fn fs(v: VOut) -> @location(0) vec4<f32> { return v.color; }
`;
export const TERRAIN_VERTEX_GLSL = `#version 300 es
precision highp float;
uniform mat4 viewProj;
uniform vec4 terrain;
uniform sampler2D heightTex;
in vec3 p; in vec4 color; in vec4 rec;
out vec4 vColor;
ivec2 texelAt(float x, float z) {
  ivec2 dims = textureSize(heightTex, 0);
  float u = (x - terrain.x) / terrain.z; float v = (z - terrain.y) / terrain.z;
  return ivec2(clamp(int(floor(u * float(dims.x))), 0, dims.x - 1), clamp(int(floor(v * float(dims.y))), 0, dims.y - 1));
}
void main() {
  float half_ = (rec.w - terrain.w * 0.5) / ${RADIUS_PER_HALF};
  float wx = rec.x + p.x * half_; float wz = rec.z + p.y * half_;
  float h = texelFetch(heightTex, texelAt(wx, wz), 0).r;
  float hc = texelFetch(heightTex, texelAt(rec.x, rec.z), 0).r;
  gl_Position = viewProj * vec4(wx, (h + p.z) * terrain.w, wz, 1.0);
  vColor = vec4(hc, hc, hc, 1.0);
}
`;
export const TERRAIN_FRAGMENT_GLSL = `#version 300 es
precision highp float;
in vec4 vColor; out vec4 fragColor;
void main() { fragColor = vColor; }
`;
export function terrainPipelineDesc() {
    return {
        shaders: { wgsl: TERRAIN_WGSL, glsl: { vertex: TERRAIN_VERTEX_GLSL, fragment: TERRAIN_FRAGMENT_GLSL } },
        vs: "vs", fs: "fs",
        buffers: [
            { stride: VERTEX_FLOATS * 4, stepMode: "vertex", attributes: [{ name: "p", size: 3, offset: 0 }, { name: "color", size: 4, offset: 12 }] },
            { stride: RECORD_BYTES, stepMode: "instance", attributes: [{ name: "rec", size: 4, offset: 0 }] },
        ],
        uniforms: [{ name: "viewProj", type: "mat4" }, { name: "terrain", type: "vec4" }],
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

/** Pack the terrain uniform the way struct Cam.terrain reads it. */
export function terrainParams({ originX, originZ, extent, heightScale }) { return new Float32Array([originX, originZ, extent, heightScale]); }
