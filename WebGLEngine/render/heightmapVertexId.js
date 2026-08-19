// WebGLEngine/render/heightmapVertexId.js — v2584
//
// THE BUFFER YOU NEVER UPLOAD.
//
// Vercidium's Free Friday Part 2 (vercidium-patreon/glvertexid, MIT, C#, Silk.NET, ~100 stars) renders a
// heightmap "with minimal data" using gl_VertexID. The C# does not port. THE ARITHMETIC DOES, and gl_VertexID
// exists in GLSL ES 3.00, so WebGL2 can do this today.
//
// ---- WHAT IS AND IS NOT NEW HERE --------------------------------------------------------------------------------
//
// The trick is ALREADY in this engine, four times, and checking first is what found that:
//
//   engine/OvmRenderer.js:103      int corner_idx = gl_VertexID & 7;      cube corners, no vertex buffer
//   fx/nebula/nebulaShaders.js:38  vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2))   fullscreen tri
//   sinogram-gpu.html:50           the same fullscreen triangle again
//   demos/ovm/ovmDemo.js
//
// WHAT IS MISSING IS THE ONE THE REPO IS ACTUALLY ABOUT: A HEIGHTMAP. And world/terrainGenerator.js is right
// there, producing exactly the surface that wants it.
//
// ---- WHY THIS IS GRADEABLE WITHOUT A GPU -------------------------------------------------------------------------
//
// The whole trick is ARITHMETIC: vertex ID in, position out. There is no state, no texture fetch, no
// rasteriser. So the mapping can be run on a CPU and compared against THE VERTEX BUFFER YOU WOULD OTHERWISE
// HAVE UPLOADED -- which is the oracle, and the same role naiveFaces played for the greedy mesher and dense
// sampling played for the DDA.
//
//     FOR EVERY VERTEX ID i IN [0, count): vertexAt(i) MUST EQUAL buffer[i], EXACTLY.
//
// If that holds, the shader draws the same mesh with no buffer at all. If it does not, the terrain is subtly
// wrong in a way that looks like a terrain that is subtly wrong -- which is the worst kind, because you will
// blame the noise.
//
// ---- THE LAYOUT -------------------------------------------------------------------------------------------------
//
// A W x H grid of cells, drawn as 2 triangles per cell, 6 vertices per cell, non-indexed. Vertex i belongs to
// cell (i / 6), and is corner (i % 6) of that cell. Everything else is division.
//
// Cost on the GPU: ONE glDrawArrays(TRIANGLES, 0, W*H*6) and NOTHING ELSE. No positions, no indices, no
// normals uploaded -- the height comes from a texture fetch, the x/z from the ID. For a 1024x1024 chunk that is
// 6.3M vertices addressed by ZERO BYTES of vertex data, where an interleaved xyz buffer alone would be 75 MB.

/** The six corners of a cell, as (du, dv) offsets, in the winding the mesh needs. */
const CORNERS = [
    [0, 0], [1, 0], [1, 1],   // triangle 1
    [0, 0], [1, 1], [0, 1],   // triangle 2
];

/**
 * The mapping a vertex shader would do from gl_VertexID alone.
 *
 * @param {number} id     gl_VertexID
 * @param {number} W      cells across
 * @param {(x:number,z:number)=>number} heightAt
 * @returns {{x:number, y:number, z:number}}
 */
export function vertexAt(id, W, heightAt) {
    const cell = (id / 6) | 0;
    const corner = id % 6;
    const cx = cell % W;
    const cz = (cell / W) | 0;
    const [du, dv] = CORNERS[corner];
    const x = cx + du, z = cz + dv;
    return { x, y: heightAt(x, z), z };
}

/** How many vertices a W x H grid needs. */
export const vertexCount = (W, H) => W * H * 6;

/**
 * THE ORACLE: the vertex buffer you would otherwise have built and uploaded. Dumb, explicit, allocates the whole
 * thing -- which is exactly why it can judge the arithmetic that avoids it.
 */
export function buildVertexBuffer(W, H, heightAt) {
    const out = new Float32Array(vertexCount(W, H) * 3);
    let n = 0;
    for (let cz = 0; cz < H; cz++) {
        for (let cx = 0; cx < W; cx++) {
            for (const [du, dv] of CORNERS) {
                const x = cx + du, z = cz + dv;
                out[n++] = x; out[n++] = heightAt(x, z); out[n++] = z;
            }
        }
    }
    return out;
}

/**
 * The GLSL this describes. IT IS A STRING, AND A STRING IS NOT A SHADER -- exactly as v2571's paniniGLSL was.
 * The arithmetic above is gated; THIS IS PROSE UNTIL IT RUNS ON GALAXINA. The gate can prove the mapping is
 * right and CANNOT prove this compiles.
 */
export const heightmapVertexGLSL = `#version 300 es
// No vertex buffer is bound. No indices. glDrawArrays(GL_TRIANGLES, 0, W*H*6) and nothing else.
precision highp float;
uniform sampler2D uHeight;     // height in .r
uniform int   uW;              // cells across
uniform float uCellSize;
uniform mat4  uViewProj;
out float vHeight;

const ivec2 CORNERS[6] = ivec2[6](
    ivec2(0,0), ivec2(1,0), ivec2(1,1),
    ivec2(0,0), ivec2(1,1), ivec2(0,1)
);

void main() {
    int cell   = gl_VertexID / 6;
    int corner = gl_VertexID % 6;
    ivec2 c    = ivec2(cell % uW, cell / uW) + CORNERS[corner];
    float h    = texelFetch(uHeight, c, 0).r;
    vHeight    = h;
    gl_Position = uViewProj * vec4(float(c.x) * uCellSize, h, float(c.y) * uCellSize, 1.0);
}`;
